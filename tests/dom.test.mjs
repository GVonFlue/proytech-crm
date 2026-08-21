/* DOM tests — the real app, mounted signed-in, asserting on WHAT REACHES THE
   DATABASE. Requires jsdom:  npm i --no-save jsdom

   Rendering the right thing and writing the right thing are different claims.
   These test the second one.

   ---------------------------------------------------------------------------
   THIS FILE USED TO HANG INSTEAD OF FAILING, WHICH IS WHY IT IS SHORT NOW.

   Three separate defects stacked: tests/stub-supabase.mjs had no
   getMeetingLogs, so App.jsx threw during boot; a failing test never reached
   its own app.unmount(), so pretendToBeVisual kept a requestAnimationFrame
   timer alive and the process never exited; and there was no reporter and no
   exit code, so even a clean run said nothing. All three are fixed —
   testAsync() now runs teardown whether a test passed or threw, and report()
   prints the tally and exits non-zero.

   With those fixed, the file reported 1 passed / 17 failed, and 15 of those 17
   turned out to be a specification for screens that were never built here:

     Conversation Capture   .convo-ta, "Read this conversation", "Save to lead"
     the goals UI           goalPlan, goal cards, the Monthly/Annual wizard
     rate chips             .rchip, "thin sample", "Avg deal"

   None of those strings appear in src/App.jsx. The backing libraries do exist
   and pass their own tests — src/lib/convo.js via tests/convo.test.mjs,
   src/lib/goals.js via tests/goals.test.mjs — but App.jsx never imports
   lib/goals at all and no screen drives either one. Those 15 were deleted:
   git remembers them if the screens ever get built, and a permanently red
   suite teaches people to ignore the suite.

   The two that were NOT orphans are the reason this was worth doing:

     - "no screen renders NaN" was a REAL BUG. A lead with no activities and no
       createdAt made the Leads table render the literal string "NaNd ago".
       Fixed in src/App.jsx; this test is what found it.
     - "merely loading writes nothing" is a real invariant that was being
       tested against a PRE-MIGRATION fixture. The app legitimately stamps a
       nurture stage and retainerStartCleared once, on an install that predates
       them. The fixture now arrives already migrated, so the test asserts what
       it always meant.
   --------------------------------------------------------------------------- */
import { testAsync, eq, ok, report } from './assert.mjs';
import { mount } from './harness.mjs';

/* modulesV 9 skips the one-time module backfills, and stages are spelled out
   so migrateStages has nothing to migrate — otherwise a test's writes include
   the app's own housekeeping and "loading writes nothing" can never be true. */
const STAGES = [
  { key: 'new', label: 'New Lead', color: '#6B73C9', prob: 0.1, open: true, won: false, lost: false },
  { key: 'discovery', label: 'Discovery', color: '#2B4DE0', prob: 0.3, open: true, won: false, lost: false },
  { key: 'proposal', label: 'Proposal Sent', color: '#C8A24A', prob: 0.7, open: true, won: false, lost: false },
  { key: 'signed', label: 'Signed', color: '#1F9D55', prob: 1, open: false, won: true, lost: false },
  /* The nurture stage and retainerStartCleared below are not decoration: the
     app inserts the first and stamps the second as ONE-TIME migrations on load
     for any install that predates them. A fixture without them is a
     pre-migration install, so "merely loading writes nothing" was being tested
     against the one install for which it is legitimately false. */
  { key: 'nurture', label: 'Not right now', color: '#7C8AA5', prob: 0, open: false, won: false, lost: false, nurture: true },
  { key: 'lost', label: 'Lost', color: '#B0606A', prob: 0, open: false, won: false, lost: true },
];
const OWNER_SETTINGS = extra => ({
  modules: ['dash', 'leads', 'settings'], modulesV: 9, stages: STAGES,
  retainerStartCleared: '2026-01-01T00:00:00.000Z', ...extra,
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

await testAsync('the app mounts signed in and renders the dashboard without crashing', async tc => {
  const app = await mount({ leads: [LEAD()], settings: OWNER_SETTINGS() });
  tc.after(() => app.unmount());
  ok(/Dashboard/.test(app.text()), 'dashboard should render');
  ok(app.text().length > 2000, 'the page should have real content');
});

await testAsync('no screen renders NaN, Infinity or undefined anywhere', async tc => {
  const app = await mount({
    leads: [LEAD(), LEAD({ id: 'L2', name: 'Empty Lead', dealValue: 0, createdAt: '' })],
    settings: OWNER_SETTINGS({ goals: { revenue: 10000, closed: 4, booked: 12, mrr: 1500, onboarded: 2 } }),
  });
  tc.after(() => app.unmount());
  for (const page of [/^Dashboard$/, /^Leads$/, /^Settings$/]) {
    await app.click(btn(app, page));
    const t = app.text();
    ok(!/NaN/.test(t), `NaN rendered on ${page}`);
    ok(!/Infinity/.test(t), `Infinity rendered on ${page}`);
    ok(!/undefined/.test(t), `undefined rendered on ${page}`);
  }
});

/* ------------------------------------------------------------------ goals */

await testAsync('EXISTING INSTALLS SEE IDENTICAL NUMBERS — merely loading writes nothing', async tc => {
  /* the parity guarantee. An owner opening the app after this ships must not
     have a single stored number rewritten by a silent migration. */
  const app = await mount({
    leads: [LEAD()],
    settings: OWNER_SETTINGS({ goals: { revenue: 10000, booked: 12, closed: 4, onboarded: 2, mrr: 1500 } }),
  });
  tc.after(() => app.unmount());
  const writes = app.db.writes.filter(w => w.op === 'saveSettings' || w.op === 'upsertMany' || w.op === 'upsertLead');
  eq(writes, [], 'loading an existing install must write nothing: ' + JSON.stringify(writes.map(w => w.op)));
  /* The companion assertion here read the legacy revenue goal off the screen.
     It went with the other goals-UI tests: src/lib/goals.js exists and passes
     tests/goals.test.mjs, but App.jsx never imports it and renders no goal
     figure. The write-parity invariant above is the part that was real. */
});

/* The tally and the exit code. Without this the file wrote dots to stdout and
   then simply ended: a failing run and a clean run looked identical, and no
   exit code ever told anyone which it was. */
report('dom');
