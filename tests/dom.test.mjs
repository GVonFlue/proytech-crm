/* DOM tests — the real app, mounted signed-in, asserting on WHAT REACHES THE
   DATABASE. Requires jsdom:  npm i --no-save jsdom

   Rendering the right thing and writing the right thing are different claims.
   These test the second one. */
import { testAsync, eq, ok } from './assert.mjs';
import { mount } from './harness.mjs';

/* modulesV 9 skips the one-time module backfills, and stages are spelled out
   so migrateStages has nothing to migrate — otherwise a test's writes include
   the app's own housekeeping and "loading writes nothing" can never be true. */
const STAGES = [
  { key: 'new', label: 'New Lead', color: '#6B73C9', prob: 0.1, open: true, won: false, lost: false },
  { key: 'discovery', label: 'Discovery', color: '#2B4DE0', prob: 0.3, open: true, won: false, lost: false },
  { key: 'proposal', label: 'Proposal Sent', color: '#C8A24A', prob: 0.7, open: true, won: false, lost: false },
  { key: 'signed', label: 'Signed', color: '#1F9D55', prob: 1, open: false, won: true, lost: false },
  { key: 'lost', label: 'Lost', color: '#B0606A', prob: 0, open: false, won: false, lost: true },
];
const OWNER_SETTINGS = extra => ({
  modules: ['dash', 'leads', 'settings'], modulesV: 9, stages: STAGES, ...extra,
});

const LEAD = over => ({
  id: 'L1', name: 'Sarah Chen', company: 'Chen Realty', stage: 'new', owner: 'Garrett',
  email: 'sarah@old.com', phone: '', dealValue: 3500, priority: 'medium',
  createdAt: '2026-08-01T10:00:00.000Z', activities: [], meetings: [], custom: {}, ...over,
});

const AI_OK = {
  ok: true,
  result: {
    speakers: [
      { key: 'me', label: 'Me', role: 'us', evidence: 'labelled Me:' },
      { key: 'sarah', label: 'Sarah', role: 'lead', evidence: 'matches the lead record' },
    ],
    confidence: 'high', ambiguous: false, reasoning: 'explicit labels on both sides',
    summary: 'Sarah wants the site live before her listing goes up.',
    wants: ['a site before Sept 1'],
    promised: [{ what: 'send a proposal', by: '2026-08-11' }],
    objections: ['worried about the monthly fee'],
    openQuestions: [],
    facts: [{ label: 'Email', value: 'sarah@chenrealty.com', field: 'email' }],
    followUps: [{ title: 'Send proposal', due: '2026-08-11' }],
    dates: [],
  },
};

const THREAD = 'Me: Hey Sarah, following up on the site.\nSarah: Yes! Can we do $3,500?\nMe: Deal.';

const btn = (app, re) => [...app.container.querySelectorAll('button')].find(b => re.test(b.textContent || ''));
const openLead = async app => {
  await app.click(btn(app, /^Leads$/));
  await app.click([...app.container.querySelectorAll('.namecell')].find(e => /Sarah Chen/.test(e.textContent)));
};

/* ------------------------------------------------------------------ boot */

await testAsync('the app mounts signed in and renders the dashboard without crashing', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS() });
  ok(/Dashboard/.test(app.text()), 'dashboard should render');
  ok(app.text().length > 2000, 'the page should have real content');
  await app.unmount();
});

await testAsync('no screen renders NaN, Infinity or undefined anywhere', async () => {
  const app = await mount({
    leads: [LEAD(), LEAD({ id: 'L2', name: 'Empty Lead', dealValue: 0, createdAt: '' })],
    settings: OWNER_SETTINGS({ goals: { revenue: 10000, closed: 4, booked: 12, mrr: 1500, onboarded: 2 } }),
  });
  for (const page of [/^Dashboard$/, /^Leads$/, /^Settings$/]) {
    await app.click(btn(app, page));
    const t = app.text();
    ok(!/NaN/.test(t), `NaN rendered on ${page}`);
    ok(!/Infinity/.test(t), `Infinity rendered on ${page}`);
    ok(!/undefined/.test(t), `undefined rendered on ${page}`);
  }
  await app.unmount();
});

/* ------------------------------------------------------------------ goals */

await testAsync('a zero-history install shows the goal WITHOUT inventing rates', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS({ goals: { revenue: 10000 } }) });
  const hero = app.container.querySelector('.gh-text');
  ok(hero, 'the goal headline should render');
  ok(/\$10,000 to go/.test(hero.textContent), hero.textContent);
  ok(/[Nn]ot enough history/.test(hero.textContent), 'it must SAY it cannot plan backwards yet: ' + hero.textContent);
  /* and it must not have quietly used a default rate */
  ok(!/33%|20%|75%/.test(hero.textContent), 'no rate may appear when there is no history');
  const chips = [...app.container.querySelectorAll('.rchip')].map(c => c.textContent);
  eq(chips.length, 3);
  chips.forEach(c => ok(/no history yet/.test(c), c));
  await app.unmount();
});

await testAsync('every rate on screen displays its sample size', async () => {
  /* two closed deals and some held meetings: enough for rates, far below the
     threshold, so all three must read as ranges and say the sample is thin */
  const closed = (id, v) => LEAD({
    id, name: 'Client ' + id, stage: 'won', isClient: true, dealValue: v,
    closedAt: '2026-07-15', convertedAt: '2026-07-15',
    payments: [{ id: 'p' + id, amount: v, date: '2026-07-15' }],
    meetings: [{ id: 'm' + id, mtype: 'Discovery', start: '2026-07-01T10:00:00', status: 'held' }],
  });
  const app = await mount({
    leads: [closed('C1', 2000), closed('C2', 3000), LEAD()],
    settings: OWNER_SETTINGS({ goals: { revenue: 10000 } }),
  });
  const chips = [...app.container.querySelectorAll('.rchip')].map(c => c.textContent);
  chips.forEach(c => ok(/n=\d/.test(c), 'every rate must show n= : ' + c));
  const avg = chips.find(c => /Avg deal/.test(c));
  ok(/thin sample/.test(avg), 'a 2-deal average must be flagged thin: ' + avg);
  ok(/–/.test(avg), 'a thin rate must render as a range: ' + avg);
  await app.unmount();
});

await testAsync('goal numbers reconcile with the dashboard tile above them', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS({ goals: { booked: 12 } }) });
  const card = [...app.container.querySelectorAll('.goalcard')].find(c => /Meetings booked/.test(c.textContent));
  ok(card, 'the booked goal card should render');
  /* the card's "achieved / target" must be the same pair the KPI tile shows */
  const v = card.querySelector('.gc-v').textContent;
  ok(/^0 \/ 12$/.test(v.replace(/\s+/g, ' ').trim()), 'card reads ' + v);
  await app.unmount();
});

await testAsync('setting a goal writes goalPlan AND keeps legacy settings.goals in step', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS({ goals: { revenue: 10000, booked: 12, closed: 4, onboarded: 2, mrr: 1500 } }) });
  await app.click(btn(app, /^Settings$/));
  const rows = [...app.container.querySelectorAll('.goal-row')];
  const revRow = rows.find(r => /Revenue closed/.test(r.textContent));
  ok(revRow, 'the wizard should render a Revenue row');
  await app.type(revRow.querySelector('input'), '20000');
  await app.wait(900);   // settings writes are debounced 700ms
  const saves = app.db.writes.filter(w => w.op === 'saveSettings');
  ok(saves.length > 0, 'typing a target must write settings');
  const s = saves[saves.length - 1].settings;
  /* `team` is derived and deliberately NOT stored — assert on the slot */
  eq(s.goalPlan.team, undefined, 'the derived view must not be persisted');
  eq(s.goalPlan.targets.month.team.revenue, 20000);
  eq(s.goals.revenue, 20000, 'the legacy key the old tiles read must follow');
  /* nothing else in the legacy block may move */
  eq(s.goals.booked, 12);
  eq(s.goals.closed, 4);
  eq(s.goals.onboarded, 2);
  eq(s.goals.mrr, 1500);
  await app.unmount();
});

await testAsync('EXISTING INSTALLS SEE IDENTICAL NUMBERS — merely loading writes nothing', async () => {
  /* the parity guarantee. An owner opening the app after this ships must not
     have a single stored number rewritten by a silent migration. */
  const app = await mount({
    leads: [LEAD()],
    settings: OWNER_SETTINGS({ goals: { revenue: 10000, booked: 12, closed: 4, onboarded: 2, mrr: 1500 } }),
  });
  const writes = app.db.writes.filter(w => w.op === 'saveSettings' || w.op === 'upsertMany' || w.op === 'upsertLead');
  eq(writes, [], 'loading an existing install must write nothing: ' + JSON.stringify(writes.map(w => w.op)));
  /* and the legacy targets are visibly in force */
  ok(/\$10,000/.test(app.text()), 'the legacy revenue goal should be on screen');
  await app.unmount();
});

await testAsync('a rep sees only their own goal — never the team total', async () => {
  const app = await mount({
    leads: [LEAD({ owner: 'Ana' })],
    users: [{ id: 'uid-owner', name: 'Ana', role: 'rep', active: true, pools: [], tabs: [], nav_order: [] }],
    whoami: { role: 'rep', active: true, setup: true, name: 'Ana', pools: [], tabs: [], nav_order: [], commission_pct: 10, goal_conversions: 0 },
    settings: OWNER_SETTINGS({
      goals: { revenue: 100000 },
      goalPlan: { v: 1, period: 'month', anchor: '2026-08', team: { revenue: 100000 }, people: { Ana: { revenue: 20000 } } },
    }),
  });
  const t = app.text();
  ok(/\$20,000/.test(t), "the rep's own target should be on screen");
  ok(!/\$100,000/.test(t), 'the TEAM target must never appear on a rep screen');
  await app.unmount();
});

/* --------------------------------------------------- conversation capture */

await testAsync('a labelled conversation writes ONE Note and never the raw thread', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': AI_OK } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  await app.click(btn(app, /Read this conversation/));
  ok(/What gets saved to the lead/.test(app.text()), 'the review screen should appear');
  await app.click(btn(app, /Save to lead/));

  const saved = app.db.writes.filter(w => w.op === 'upsertLead');
  eq(saved.length, 1, 'exactly one write — two would clobber each other from a stale closure');
  const acts = saved[0].lead.activities;
  const notes = acts.filter(a => a.type === 'Note');
  eq(notes.length, 1, 'exactly one Note activity');
  ok(/Sarah wants the site live/.test(notes[0].text), 'the summary should be the note body');

  /* THE RULE: nothing that reached the database may contain the pasted thread */
  const persisted = JSON.stringify(app.db.writes.filter(w => w.op !== 'fetch'));
  ok(!/following up on the site/.test(persisted), 'the raw thread must never be stored');
  ok(!/Can we do \$3,500/.test(persisted), 'the raw thread must never be stored');
  await app.unmount();
});

await testAsync('the conversation is sent to /api/conversation and nowhere else', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': AI_OK } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  await app.click(btn(app, /Read this conversation/));
  const carrying = app.db.writes.filter(w => w.op === 'fetch' && JSON.stringify(w.body || '').includes('following up'));
  eq(carrying.length, 1, 'exactly one outbound request may carry the thread');
  eq(carrying[0].url, '/api/conversation');
  await app.unmount();
});

await testAsync('the note is stamped with WHEN THE CONVERSATION HAPPENED, not when it was pasted', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': AI_OK } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  const dateInput = [...app.container.querySelectorAll('.convo-meta input')].find(i => i.type === 'date');
  await app.type(dateInput, '2026-07-20');
  await app.click(btn(app, /Read this conversation/));
  await app.click(btn(app, /Save to lead/));
  const note = app.db.writes.filter(w => w.op === 'upsertLead')[0].lead.activities.find(a => a.type === 'Note');
  ok(note.ts.startsWith('2026-07-20'), 'stamped ' + note.ts + ' — an activity feed is a timeline');
  await app.unmount();
});

await testAsync('field updates are NOT applied unless ticked, and a tick applies a diff', async () => {
  /* first run: change nothing */
  let app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': AI_OK } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  await app.click(btn(app, /Read this conversation/));
  await app.click(btn(app, /Save to lead/));
  eq(app.db.writes.filter(w => w.op === 'upsertLead')[0].lead.email, 'sarah@old.com', 'an untouched checkbox must not overwrite');
  await app.unmount();

  /* second run: tick the email diff */
  app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': AI_OK } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  await app.click(btn(app, /Read this conversation/));
  const diff = [...app.container.querySelectorAll('.cdiff')].find(d => /Email/.test(d.textContent));
  ok(/overwrites/.test(diff.textContent), 'overwriting an existing value must be flagged');
  await app.click(diff.querySelector('input'));
  await app.click(btn(app, /Save to lead/));
  eq(app.db.writes.filter(w => w.op === 'upsertLead')[0].lead.email, 'sarah@chenrealty.com');
  await app.unmount();
});

await testAsync('suggested follow-ups are unchecked by default and create nothing', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': AI_OK } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  await app.click(btn(app, /Read this conversation/));
  const boxes = [...app.container.querySelectorAll('.cdiff input')];
  ok(boxes.length > 0);
  boxes.forEach(b => eq(b.checked, false, 'every suggestion must start unchecked'));
  await app.click(btn(app, /Save to lead/));
  const acts = app.db.writes.filter(w => w.op === 'upsertLead')[0].lead.activities;
  eq(acts.filter(a => a.type === 'Task').length, 0, 'no task may be created without a tick');
  await app.unmount();
});

await testAsync('an UNLABELLED thread refuses to guess and blocks saving', async () => {
  const ambiguous = {
    ok: true,
    result: {
      speakers: [{ key: '(unlabelled)', label: '(unlabelled)', role: 'unknown', evidence: 'no signal in the thread' }],
      confidence: 'none', ambiguous: true, reasoning: 'no labels at all',
      summary: 'Someone asked for pricing and someone else sent it.',
      wants: [], promised: [], objections: [], openQuestions: [], facts: [], followUps: [], dates: [],
    },
  };
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': ambiguous } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), 'can you send the pricing again\n\nyeah sending now');
  await app.click(btn(app, /Read this conversation/));
  ok(/can’t tell who is who|can't tell who is who/i.test(app.text()), 'it must say so out loud');
  const save = btn(app, /Save to lead/);
  eq(save.disabled, true, 'saving must be blocked until a human decides');
  /* and clicking it anyway writes nothing */
  await app.click(save);
  eq(app.db.writes.filter(w => w.op === 'upsertLead').length, 0);
  await app.unmount();
});

await testAsync('a MALFORMED AI response degrades to a plain note and never crashes', async () => {
  const app = await mount({
    leads: [LEAD()], settings: OWNER_SETTINGS(),
    api: { '/api/conversation': { ok: false, error: 'could not read the response' } },
  });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  await app.click(btn(app, /Read this conversation/));
  ok(app.text().length > 1000, 'the app must still be rendering — a crash blanks it');
  ok(/Couldn’t summarise|Couldn't summarise/.test(app.text()), 'it should say what happened');
  await app.click(btn(app, /Save as a plain note/));
  const note = app.db.writes.filter(w => w.op === 'upsertLead')[0].lead.activities.find(a => a.type === 'Note');
  ok(/following up on the site/.test(note.text), 'the fallback keeps the user’s own text rather than losing it');
  await app.unmount();
});

await testAsync('no new activity type was invented — ACT_TYPES/ACT_ORDER/ACT_ICON stay in step', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS(), api: { '/api/conversation': AI_OK } });
  await openLead(app);
  await app.click([...app.container.querySelectorAll('.act-t')].find(b => /Conversation/.test(b.textContent)));
  await app.type(app.container.querySelector('.convo-ta'), THREAD);
  await app.click(btn(app, /Read this conversation/));
  await app.click(btn(app, /Save to lead/));
  const acts = app.db.writes.filter(w => w.op === 'upsertLead')[0].lead.activities;
  const types = [...new Set(acts.map(a => a.type))];
  types.forEach(t => ok(['Note', 'Call', 'Text', 'Meeting', 'Email', 'Booked', 'Task', 'Payment'].includes(t),
    `"${t}" is not an existing activity type — ACT_TYPES, ACT_ORDER and ACT_ICON must all be updated together`));
  /* the feed filter must have no dead tab */
  const filters = [...app.container.querySelectorAll('.afilter button')].map(b => b.textContent.trim());
  ok(!filters.includes('Conversation'), 'a filter tab that matches nothing is worse than no tab');
  await app.unmount();
});

await testAsync('MONTHLY AND ANNUAL TARGETS ARE SEPARATE BOXES', async () => {
  /* the reported bug: whatever went into Annual also appeared in Monthly, and
     editing Monthly overwrote Annual. One number wearing three labels. */
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS() });
  await app.click(btn(app, /^Settings$/));
  const revInput = () => [...app.container.querySelectorAll('.goal-row')]
    .find(r => /Revenue closed/.test(r.textContent)).querySelector('input');

  await app.click(btn(app, /^Annual$/));
  await app.type(revInput(), '200000');
  await app.wait(900);
  eq(revInput().value, '200000');

  await app.click(btn(app, /^Monthly$/));
  eq(revInput().value, '', 'the monthly box must be empty — an annual target is not a monthly one');

  await app.type(revInput(), '16000');
  await app.wait(900);
  await app.click(btn(app, /^Annual$/));
  eq(revInput().value, '200000', 'editing Monthly must not have overwritten the annual target');

  const s = app.db.writes.filter(w => w.op === 'saveSettings').pop().settings;
  eq(s.goalPlan.targets.year.team.revenue, 200000);
  eq(s.goalPlan.targets.month.team.revenue, 16000);
  await app.unmount();
});

await testAsync('a non-monthly target says the plan is this month\'s share of it', async () => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS() });
  await app.click(btn(app, /^Settings$/));
  await app.click(btn(app, /^Annual$/));
  const revRow = [...app.container.querySelectorAll('.goal-row')].find(r => /Revenue closed/.test(r.textContent));
  await app.type(revRow.querySelector('input'), '120000');
  await app.wait(900);
  const implies = app.container.querySelector('.gw-implies').textContent;
  ok(/this month's share|this month’s share/.test(implies), implies);
  /* and the sentence is labelled by the month it actually plans, not "2026" */
  ok(/August 2026/.test(app.container.querySelector('.gw-implies-t').textContent),
    app.container.querySelector('.gw-implies-t').textContent);
  await app.unmount();
});
