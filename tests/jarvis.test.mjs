/* Unit tests for the assistant's brain-side plumbing.

   These are the tests that matter most in this repo, because two of the things
   src/lib/jarvis.js does are security boundaries rather than features:

     1. A rep's payload must contain no company money. ROLES.md promises this
        and admits it is a UI promise, not a Postgres one — dealValue lives
        inside the jsonb of a lead the rep may legitimately read. A chat box
        walks straight around a hidden tab, so the redaction is asserted here
        against the SAME MONEY_FIELDS list the code uses.

     2. A proposed action must never reach a record the signed-in user cannot
        already see, and must never carry a money field. Lead notes, imported
        spreadsheet rows and pasted email threads all end up in the model's
        context, and any of them can contain something shaped like an
        instruction. The whitelist is what makes that harmless.

   Pure functions only — no jsdom needed. Run standalone:
     node tests/jarvis.test.mjs
*/
import { test, eq, ok, state } from './assert.mjs';
import {
  indexLine, detailOf, redactMoney, visibleLeads, pickDetail, buildPayload,
  validateActions, describeAction, parseReply, keywords, lastTouchOf,
  MONEY_FIELDS, ACTION_KINDS, estimateTokens,
} from '../src/lib/jarvis.js';

const NOW = new Date().toISOString();
const L = (o = {}) => ({
  id: 'l1', name: 'Jeff Schnell', company: 'Dwell', stage: 'client', owner: 'Garrett',
  dealValue: 6499, retainer: 999, retainerActive: true,
  payments: [{ date: '2026-05-01', amount: 3250 }],
  deals: [{ label: 'Brokerage', setup: 6499 }],
  closedDeals: [{ amount: 6499, closedAt: '2026-04-28' }],
  activities: [{ id: 'a1', ts: NOW, type: 'Note', text: 'Talked retainer', who: 'Garrett' }],
  meetings: [], isClient: true, createdAt: NOW, ...o,
});

/* ------------------------------------------------------------- redaction */

test('owner index keeps deal value and retainer', () => {
  const i = indexLine(L(), { rep: false });
  eq(i.v, 6499, 'deal value');
  eq(i.ret, 999, 'retainer');
});

test('rep index carries no money key at all', () => {
  const i = indexLine(L(), { rep: true });
  for (const k of ['v', 'ret', ...MONEY_FIELDS]) ok(!(k in i), `leaked ${k}`);
});

test('rep detail contains no money field and no money VALUE', () => {
  const s = JSON.stringify(detailOf(L(), { rep: true }));
  for (const f of MONEY_FIELDS) ok(!s.includes(`"${f}"`), `leaked field ${f}`);
  ok(!s.includes('6499'), 'leaked the deal value itself');
  ok(!s.includes('3250'), 'leaked a payment amount');
});

test('owner detail keeps money', () => {
  const d = detailOf(L(), { rep: false });
  eq(d.dealValue, 6499);
  eq(d.payments.length, 1);
});

test('redactMoney recurses and does not mutate its input', () => {
  const src = { a: { b: { dealValue: 5, keep: 1 } } };
  const r = redactMoney(src);
  ok(r.a.b.dealValue === undefined, 'nested money survived');
  eq(r.a.b.keep, 1);
  eq(src.a.b.dealValue, 5, 'input was mutated');
});

/* --------------------------------------------------------------- scoping */

const A = L({ id: 'a1', owner: 'Ryan', owner_id: 'u1' });
const B = L({ id: 'b1', owner: 'Garrett', owner_id: 'u2' });
const P = L({ id: 'p1', owner: null, owner_id: null, pool: 'Inbound' });
const Q = L({ id: 'q1', owner: null, owner_id: null, pool: 'Outbound' });

test('rep sees own leads plus their own pools only', () => {
  const v = visibleLeads([A, B, P, Q], { rep: true, myUid: 'u1', me: 'Ryan', pools: ['Inbound'] });
  eq(v.map(x => x.id), ['a1', 'p1']);
});

test('rep never sees another rep pool', () => {
  const v = visibleLeads([A, B, P, Q], { rep: true, myUid: 'u1', me: 'Ryan', pools: [] });
  eq(v.map(x => x.id), ['a1']);
});

test('owner sees everything', () => {
  eq(visibleLeads([A, B, P, Q], { rep: false }).length, 4);
});

/* --------------------------------------------------------------- actions */

const IDS = ['l1', 'l2'];

test('an action naming an invisible lead is rejected', () => {
  const r = validateActions([{ kind: 'note', leadId: 'SOMEONE_ELSE', text: 'x' }], { visibleIds: IDS });
  eq(r.actions.length, 0, 'it ran anyway');
  eq(r.rejected.length, 1);
});

test('an unknown action kind is rejected', () => {
  eq(validateActions([{ kind: 'deleteEverything', leadId: 'l1' }], { visibleIds: IDS }).actions.length, 0);
});

test('no action kind can write money', () => {
  const r = validateActions([
    { kind: 'note', leadId: 'l1', text: 'fine' },
    { kind: 'setDealValue', leadId: 'l1', amount: 0 },
    { kind: 'note', leadId: 'l1', text: 'also fine', dealValue: 99, retainer: 5 },
  ], { visibleIds: IDS });
  eq(r.actions.length, 2, 'wrong number survived');
  for (const a of r.actions) {
    for (const f of MONEY_FIELDS) ok(!(f in a), `action carries ${f}`);
  }
});

test('every whitelisted kind is money-free by construction', () => {
  for (const k of ACTION_KINDS) ok(!MONEY_FIELDS.includes(k), `${k} names a money field`);
});

test('tag only accepts a real teammate', () => {
  const ctx = { visibleIds: IDS, teamNames: ['Garrett', 'Logan'] };
  eq(validateActions([{ kind: 'tag', leadId: 'l1', who: 'Nobody', text: 'x' }], ctx).actions.length, 0);
  eq(validateActions([{ kind: 'tag', leadId: 'l1', who: 'garrett', text: 'x' }], ctx).actions.length, 1);
});

test('followup rejects anything that is not an ISO date', () => {
  for (const bad of ['soon', '2026-13-01x', '', '01/02/2026']) {
    eq(validateActions([{ kind: 'followup', leadId: 'l1', date: bad }], { visibleIds: IDS }).actions.length, 0, bad);
  }
  eq(validateActions([{ kind: 'followup', leadId: 'l1', date: '2026-09-02' }], { visibleIds: IDS }).actions.length, 1);
});

test('a flood of actions is capped', () => {
  const many = Array(50).fill({ kind: 'note', leadId: 'l1', text: 'x' });
  ok(validateActions(many, { visibleIds: IDS }).actions.length <= 8);
});

test('describeAction never returns an empty label for a valid action', () => {
  const { actions } = validateActions([
    { kind: 'note', leadId: 'l1', text: 'x' },
    { kind: 'task', leadId: 'l1', title: 'Call them' },
    { kind: 'followup', leadId: 'l1', date: '2026-09-02' },
    { kind: 'tag', leadId: 'l1', who: 'Logan', text: 'look' },
  ], { visibleIds: IDS, teamNames: ['Logan'] });
  eq(actions.length, 4);
  for (const a of actions) ok(describeAction(a, 'Dwell').length > 0, a.kind);
});

/* ------------------------------------------------------------- retrieval */

test('a pinned lead is always hydrated even with no name match', () => {
  const ls = [L({ id: 'x', name: 'Zeta' }), L({ id: 'y', name: 'Omega' })];
  eq(pickDetail(ls, 'completely unrelated question', ['y'])[0].id, 'y');
});

test('a named lead is hydrated', () => {
  const ls = [L({ id: 'x', name: 'Zeta Corp' }), L({ id: 'y', name: 'Omega' })];
  eq(pickDetail(ls, 'where are we with Zeta', [])[0].id, 'x');
});

test('stopwords do not match every lead', () => {
  const ls = [L({ id: 'x', name: 'The Group' }), L({ id: 'y', name: 'Omega' })];
  eq(pickDetail(ls, 'what is the plan for this', []).length, 0);
});

test('keywords drops noise and keeps names', () => {
  eq(keywords('what should I do about Chris Waipa next?'), ['chris', 'waipa']);
});

test('lastTouchOf falls back to createdAt for an untouched lead', () => {
  eq(lastTouchOf({ createdAt: '2026-01-01T00:00:00.000Z', activities: [] }), '2026-01-01T00:00:00.000Z');
});

/* --------------------------------------------------------------- payload */

test('the index covers EVERY lead while detail stays bounded', () => {
  const ls = Array.from({ length: 137 }, (_, i) => L({ id: 'i' + i }));
  const { payload, stats } = buildPayload({ leads: ls, question: 'how are we doing' });
  eq(payload.index.length, 137, 'index must be complete — this is what makes "ask anything" true');
  ok(payload.detail.length <= 6, `detail was ${payload.detail.length}`);
  ok(stats.tokens > 0);
});

test('a rep payload leaks no money anywhere in it', () => {
  const { payload } = buildPayload({
    leads: [L(), L({ id: 'l2' })], question: 'q', rep: true, me: 'Ryan',
    money: { mrr: 9999, revenueMonth: 12345 },
  });
  const s = JSON.stringify(payload);
  ok(!s.includes('6499'), 'deal value leaked');
  ok(!s.includes('9999'), 'MRR leaked');
  ok(!s.includes('12345'), 'revenue leaked');
  ok(!payload.totals.money, 'totals.money present for a rep');
});

test('an owner payload does carry the precomputed totals', () => {
  const { payload } = buildPayload({ leads: [L()], question: 'q', rep: false, money: { mrr: 9999 } });
  eq(payload.totals.money.mrr, 9999);
});

test('history is trimmed, not sent whole', () => {
  const hist = Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: 'turn ' + i }));
  const { payload } = buildPayload({ leads: [L()], question: 'q', history: hist });
  ok(payload.history.length <= 12, `history was ${payload.history.length}`);
});

/* ---------------------------------------------------------------- parsing */

test('a malformed reply degrades instead of throwing', () => {
  const r = parseReply('total garbage, no json here at all');
  eq(r.malformed, true);
  eq(r.actions, []);
  ok(r.answer.length > 0, 'lost the text entirely');
});

test('a fenced json reply parses', () => {
  eq(parseReply('```json\n{"answer":"hi","actions":[]}\n```').answer, 'hi');
});

test('json with a preamble is salvaged', () => {
  eq(parseReply('Sure! {"answer":"ok","actions":[]}').answer, 'ok');
});

test('estimateTokens is roughly right for dense json', () => {
  const s = JSON.stringify(L());
  const t = estimateTokens(s);
  ok(t > s.length / 5 && t < s.length / 3, `estimate ${t} for ${s.length} chars`);
});

if (!state.fail) console.log(`\n${state.pass} passed`);
else { console.log(`\n${state.pass} passed, ${state.fail} FAILED`); for (const [n, e] of state.failures) console.log(' -', n, e.message); process.exitCode = 1; }
