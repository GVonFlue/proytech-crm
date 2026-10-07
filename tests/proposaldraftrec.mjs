/* THE DRAFT FROM POCKET RECORDINGS, AND WHAT A CLIENT NEVER SEES.
   ============================================================================

   api/proposal-draft.js, with a fake network:
     - owner only; the browser sends recording IDS and the route reads the
       transcripts itself (owner-only table, service key)
     - a transcript or "recordings" in the REQUEST is ignored, never prompted
     - at most 3; a malformed, duplicate or unknown id is refused, nothing is
       sent to the model
     - each transcript capped, all of them capped
     - with a recording attached a one-line blurb is enough; without, 40 chars
     - NEVER AN INVENTED NUMBER, enforced at the write: a plan number whose
       figures nobody said is dropped, and the count is reported
     - the prompt: goal always in words, numbers only as stated
   The proposal body and the public page:
     - a draft carrying transcript, recording ids or notes in extra fields
       loses them in cleanCopy; the body, PUBLIC_BODY_KEYS and publicView
       never carry them; proposal_public() never returns source_pocket_ids
     - no goal: "Where you're headed" is not rendered at all

   Seen red: reading the transcript from the request; dropping groundNumbers;
   publicView passing source_pocket_ids through.                           */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.ANTHROPIC_API_KEY = 'sk-test';
import fs from 'node:fs'; import esbuild from 'esbuild';
import { bundleName } from './tmpbundle.mjs';
const B = bundleName('pdrec'), B_ENTRY = bundleName('pdrec-entry', '.jsx');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const REC = {
  P1: { title: 'Kickoff with Dee', createdAt: '2026-10-01T15:00:00Z', summary: 'Dee wants more booked jobs.', actionItems: [{ text: 'Send proposal' }], transcript: 'Dee: we closed 31 jobs last year and want to get to 48. We miss calls on site. SECRET-TRANSCRIPT-1 ' + 'x'.repeat(40000) },
  P2: { title: 'Follow-up call', createdAt: '2026-10-03T15:00:00Z', summary: 'Reviews matter.', transcript: 'Dee: reviews only by luck. SECRET-TRANSCRIPT-2 ' + 'y'.repeat(40000) },
  P3: { title: 'Third', transcript: 'z'.repeat(40000) },
  P4: { title: 'Fourth', transcript: 'w' },
};
let model = [], reads = [], reply = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); const h = opts.headers || {}; const tok = String(h.authorization || '').replace(/^Bearer /, '');
  const J = (d, okk = true, st) => ({ ok: okk, status: st || (okk ? 200 : 400), json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('api_hits')) return J([]);
  if (u.includes('/auth/v1/user')) return /owner|rep/.test(tok) ? J({ id: 'u' }) : J({}, false, 401);
  if (u.includes('/rpc/crm_whoami')) return J([{ role: /owner/.test(tok) ? 'owner' : 'rep', active: true }]);
  if (u.includes('jarvis') || u.includes('spend')) return J([]);
  if (u.includes('/rest/v1/pocket_recordings')) {
    reads.push({ url: u, key: tok });
    const ids = decodeURIComponent((u.match(/id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
    return J(ids.filter(id => REC[id]).map(id => ({ id, data: REC[id] })));
  }
  if (u.includes('api.anthropic.com')) { const b = JSON.parse(opts.body); model.push(b); return J({ content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 10, output_tokens: 10 } }); }
  return J([]);
};
const draft = (await import('../api/proposal-draft.js')).default;
const { SYSTEM, PER_RECORDING, ALL_RECORDINGS, groundNumbers } = await import('../api/proposal-draft.js');
const mkRes = () => { const r = { code: 0, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = () => {}; r.end = () => r; return r; };
let n = 0;
const hit = async (body, tok = 'owner') => { model = []; reads = []; const res = mkRes(); const ip = '10.3.0.' + (++n % 250);
  await draft({ method: 'POST', headers: { 'x-forwarded-for': ip, authorization: 'Bearer ' + tok }, socket: { remoteAddress: ip }, body }, res); return res; };
const ITEMS = [{ id: 'growth-os', name: 'Growth OS', kind: 'package' }];
reply = { headline: 'Your 48-job year', summary: 's', plan: { goal: 'Get from 31 to 48 jobs a year', numbers: [{ label: 'Jobs last year', value: '31' }, { label: 'Made up', value: '72%' }], levers: ['a', 'b', 'c'] }, gaps: [], build: [], whyNow: [], email: { subject: 's', body: 'b' },
  transcript: 'SECRET-TRANSCRIPT-1', recordingIds: ['P1'], notes: 'RAW-NOTE-9', sources: ['P1'] };

console.log('\nthe route reads the recordings itself');
{
  let r = await hit({ notes: 'Website for Dee', items: ITEMS, recordingIds: ['P1'] }, 'rep');
  ok('a rep is refused', r.code === 403 && !model.length);
  r = await hit({ notes: 'Website and follow up for Dee.', items: ITEMS, recordingIds: ['P1', 'P2'],
    recordings: [{ transcript: 'FORGED-BY-THE-REQUEST' }], transcript: 'FORGED-TOO' });
  ok('drafted', r.body.ok === true, JSON.stringify(r.body).slice(0, 200));
  ok('the recordings were read with the SERVICE key, by id', reads.length === 1 && reads[0].key === 'svc' && /id=in\.\(P1,P2\)/.test(reads[0].url));
  const prompt = model[0].messages[0].content;
  ok('their words went to the model: summary, action items, transcript', /Dee wants more booked jobs/.test(prompt) && /Send proposal/.test(prompt) && /SECRET-TRANSCRIPT-1/.test(prompt) && /SECRET-TRANSCRIPT-2/.test(prompt));
  ok('a transcript in the REQUEST is never prompted', !/FORGED/.test(prompt));
  ok('each transcript capped, all of them capped', prompt.length < ALL_RECORDINGS + 6000 && (prompt.match(/x+/) || [''])[0].length <= PER_RECORDING);
  ok('a one-line blurb is enough with a recording attached', r.body.ok);
  r = await hit({ notes: 'Short.', items: ITEMS });
  ok('without one, 40 characters are still needed', r.body.ok === false && /attach a Pocket recording/.test(r.body.error) && !model.length);
  r = await hit({ notes: 'Website and follow up', items: ITEMS, recordingIds: ['P1', 'P2', 'P3', 'P4'] });
  ok('at most 3 recordings', r.body.ok === false && /at most 3/.test(r.body.error) && !model.length && !reads.length);
  r = await hit({ notes: 'Website and follow up', items: ITEMS, recordingIds: ['P1', 'P1'] });
  ok('a duplicate is refused', r.body.ok === false && !model.length);
  r = await hit({ notes: 'Website and follow up', items: ITEMS, recordingIds: ['P1)&select=*'] });
  ok('a malformed id is refused before any read', r.body.ok === false && !reads.length && !model.length);
  r = await hit({ notes: 'Website and follow up', items: ITEMS, recordingIds: ['GONE'] });
  ok('an unknown id is refused, not skipped', r.body.ok === false && /not found/.test(r.body.error) && !model.length);
}

console.log('\nnever an invented number, enforced at the write');
{
  const r = await hit({ notes: 'Website and follow up for Dee.', items: ITEMS, recordingIds: ['P1'] });
  const nums = r.body.draft.plan.numbers.map(x => x.value);
  ok('31 (they said it) stays; 72% (nobody did) is dropped', nums.join() === '31', nums.join());
  ok('  and the count is reported', r.body.droppedNumbers === 1);
  const g = groundNumbers({ plan: { numbers: [{ label: 'Deal', value: '$8,400' }, { label: 'x', value: '' }] } }, 'about 8,400 a deal');
  ok('commas and dollar signs do not matter; a number with no figure is dropped', g.draft.plan.numbers.length === 1 && g.dropped.length === 1);
  ok('no figures said at all: no numbers survive', groundNumbers({ plan: { numbers: [{ label: 'a', value: '40' }] } }, 'they want more jobs').draft.plan.numbers.length === 0);
  ok('the prompt: goal always in words, numbers only as stated', /plan\.goal: ALWAYS write the client's goal in words/.test(SYSTEM) && /ONLY for numbers the client or the owner actually stated/.test(SYSTEM) && /NEVER estimate, round up, or invent one/.test(SYSTEM));
}

console.log('\nwhat a client can never see');
{
  const entry = 'tests/' + B_ENTRY;
  fs.writeFileSync(entry, `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
import ProposalDoc from '../src/ProposalDoc.jsx'; import * as P from '../src/lib/proposal.js';
export const render = body => renderToStaticMarkup(React.createElement(ProposalDoc, { body })); export { P };`);
  const built = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.js': 'jsx' }, external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'], logLevel: 'error' });
  fs.unlinkSync(entry);
  fs.writeFileSync('tests/' + B, built.outputFiles[0].text);
  const { render, P } = await import('./' + B + '?v=' + Date.now());
  const { publicView, PUBLIC_BODY_KEYS } = await import('../api/proposal-public.js');
  const RAW = JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json', 'utf8'));
  const { offer } = P.readOffer({ offer: RAW });
  const q = P.quote(offer, { packageId: 'growth-os', addonIds: [], seats: 5 });
  const { copy } = P.cleanCopy(reply, [{ id: 'growth-os', name: 'Growth OS' }]);
  const body = P.buildBody({ offer, q, copy, client: { name: 'Dee', company: 'Dee Co' }, preparedOn: '2026-10-07', validDays: 7 });
  const s = JSON.stringify(body);
  ok('cleanCopy drops transcript, recording ids, notes and sources the model slipped in', !/SECRET-TRANSCRIPT|RAW-NOTE-9|"P1"|recordingIds|sources/.test(JSON.stringify(copy)));
  ok('the body carries none of them', !/SECRET-TRANSCRIPT|RAW-NOTE-9|recordingIds|source_pocket_ids|transcript/.test(s));
  ok('PUBLIC_BODY_KEYS names nothing about recordings or notes', !PUBLIC_BODY_KEYS.some(k => /transcript|record|pocket|source|notes/i.test(k)));
  const v = publicView({ status: 'sent', body: { ...body, transcript: 'SECRET-TRANSCRIPT-1', source_pocket_ids: ['P1'] }, source_pocket_ids: ['P1'], notes: 'RAW-NOTE-9', expires_at: new Date(Date.now() + 864e5).toISOString() });
  ok('publicView never passes recordings, ids or notes through, even if a row had them', !/SECRET-TRANSCRIPT|"P1"|RAW-NOTE-9|source_pocket_ids/.test(JSON.stringify(v)));
  const sql = fs.readFileSync('PROPOSALS-MIGRATION.sql', 'utf8') + fs.readFileSync('PROPOSALS-SOURCES-MIGRATION.sql', 'utf8');
  const pub = sql.slice(sql.indexOf('create or replace function proposal_public'), sql.indexOf('$$;', sql.indexOf('create or replace function proposal_public')));
  ok('proposal_public() returns named columns, never source_pocket_ids', pub.length > 0 && !/source_pocket_ids|select \*/.test(pub));
  ok('the sources migration checks that itself', /proposal_public\(\) returns source_pocket_ids/.test(sql));
  /* React escapes the apostrophe (&#x27;); match either, or this passes for nothing */
  ok('no goal: "Where you\'re headed" is not rendered at all', !/Where you(&#x27;|')re headed/.test(render({ ...body, copy: { ...body.copy, plan: { goal: '', numbers: [{ label: 'a', value: '1' }], levers: ['x'] } } })));
  ok('with a goal, it is', /Where you(&#x27;|')re headed/.test(render(body)));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
