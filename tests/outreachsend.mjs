/* MASS OUTREACH — asserting on WHAT REACHES THE DATABASE.
   ============================================================================

   tests/outreach.mjs owns the pure rules. This file owns the one claim those
   cannot make: that the screen, mounted for real and clicked for real, writes
   the right thing at the right moment and nothing at any other moment.

   THE TWO ASSERTIONS THAT MATTER

     1. DRAFTING WRITES NOTHING. Pressing Generate calls a model and fills a
        list. No lead is touched. If this ever goes red, every person in a run
        is getting a touch logged for a message that was never sent, and the
        untouched list, the Cold filter, the Dashboard's never-contacted count
        and the Monday Huddle all start lying at once.

     2. CONFIRMING A SEND WRITES EXACTLY ONE 'Text' ACTIVITY, carrying the
        campaign stamp. Not two — ENGINEERING.md §3, two mutations in one tick
        both read the array captured at render and the second discards the
        first, in Supabase as well as on screen.

   And the negative that is easy to forget: opening Messages is NOT sending.
   Clicking Text and walking away must leave the record untouched, because the
   browser cannot see Messages and a log that claims otherwise is the
   plausible-looking lie CLAUDE.md warns about.

   Requires jsdom. Run directly:  node tests/outreachsend.mjs                */
import { testAsync, eq, ok, report } from './assert.mjs';
import { mount } from './harness.mjs';

/* modulesV 10 so the one-time module backfills do not run and count as writes.
   'outreach' is listed because canOpen gates the tab on it. */
const STAGES = [
  { key: 'new', label: 'New Lead', color: '#6B73C9', prob: 0.1, open: true, won: false, lost: false },
  { key: 'signed', label: 'Signed', color: '#1F9D55', prob: 1, open: false, won: true, lost: false },
  { key: 'nurture', label: 'Not right now', color: '#7C8AA5', prob: 0, open: false, won: false, lost: false, nurture: true },
  { key: 'lost', label: 'Lost', color: '#B0606A', prob: 0, open: false, won: false, lost: true },
];
const SETTINGS = {
  modules: ['dash', 'leads', 'settings', 'outreach'], modulesV: 10, stages: STAGES,
  retainerStartCleared: '2026-01-01T00:00:00.000Z',
};

const L = over => ({
  stage: 'new', owner: 'Garrett', priority: 'medium', dealValue: 0,
  createdAt: '2026-04-01T10:00:00.000Z', activities: [], meetings: [], custom: {},
  labels: [], keyDates: [], ...over,
});

/* Four records that between them exercise every branch of the screen. */
const LEADS = [
  L({ id: 'L1', name: 'Sarah Chen',  company: 'Chen Realty',   phone: '555-111-2222' }),
  L({ id: 'L2', name: 'Tom Nguyen',  company: 'Nguyen Tile',   phone: '555-333-4444', labels: ['Veteran'] }),
  L({ id: 'L3', name: 'Dead Dave',   company: 'Gone Co',       phone: '555-555-6666',
      activities: [{ id: 'a1', ts: '2026-04-10T10:00:00.000Z', type: 'Call', disp: 'DNC', text: 'asked not to be contacted' }] }),
  L({ id: 'L4', name: 'Nora Nophone', company: 'Nophone Ltd',  phone: '' }),
];

/* The drafter, stubbed. The harness routes every /api/* call through this. */
const DRAFTER = body => ({
  ok: true,
  model: 'stub',
  text: JSON.stringify({
    drafts: (body.people || []).map(p => ({
      id: p.id, text: `Hey ${p.name.split(' ')[0]} — hope you get some family time this weekend.`,
      from: 'generic',
    })),
  }),
  cost: 0.0001, spent: 0.01, budget: 20,
});

const btn = (app, re) => [...app.container.querySelectorAll('button')].find(b => re.test(b.textContent || ''));
const btns = (app, re) => [...app.container.querySelectorAll('button')].filter(b => re.test(b.textContent || ''));
const leadWrites = app => app.db.writes.filter(w => w.op === 'upsertLead' || w.op === 'upsertMany');
/* THE FIRST SENDABLE ROW, not the first row.

   A held row renders a Text button too — disabled rather than hidden, so the
   list keeps one shape and the button you want is always in the same place
   (the same call LeadView's ContactAct makes). Its href is empty until the
   owner types something. Indexing blindly into the links therefore picks the
   deliberately dead one whenever the occasion holds somebody, which is exactly
   the case these tests care about. */
const sendable = app => [...app.container.querySelectorAll('a.mo-b.p')].filter(a => a.getAttribute('href'));

/* Open the tab and tick everyone the table will let us tick. */
async function openTab(app) {
  await app.click(btn(app, /^Mass Outreach$/));
  ok(/What are you reaching out about/.test(app.text()), 'the outreach screen should render');
}

/* ------------------------------------------------------------------------ */

await testAsync('the tab exists for an owner and renders its three steps', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);
  const t = app.text();
  ok(/Pick who this goes to/.test(t), 'step 1 should render');
  ok(/What are you reaching out about/.test(t), 'step 2 should render');
});

await testAsync('RULE 1 — a do-not-call record is not on the screen to be ticked', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);
  const t = app.text();
  ok(!/Dead Dave/.test(t), 'a DNC record must not appear in the outreach list at all');
  ok(/Sarah Chen/.test(t), 'an ordinary record should appear');
  /* And the screen SAYS the list is shorter, rather than being quietly short. */
  ok(/do-not-call/.test(t), 'the screen should state why the list is shorter');
});

await testAsync('DRAFTING WRITES NOTHING — no lead is touched by pressing Generate', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);

  /* tick everyone the table shows */
  const head = app.container.querySelector('.selcol input[type=checkbox]');
  ok(!!head, 'the select-all checkbox should render in outreach mode');
  await app.click(head);

  await app.type(app.container.querySelector('.mo-occ'), 'Memorial Day, wishing them a good weekend with family');

  const before = leadWrites(app).length;
  await app.click(btn(app, /^Generate/));
  await app.wait(50);

  ok(/Review and send/.test(app.text()), 'the review list should appear after generating');
  const after = leadWrites(app);
  eq(after.length - before, 0,
    'drafting must not write to any lead: ' + JSON.stringify(after.map(w => w.op + ':' + (w.id || ''))));

  /* And it did call the drafter — otherwise the assertion above passes for the
     wrong reason, which is the failure mode of every "nothing happened" test. */
  const calls = app.db.writes.filter(w => w.op === 'fetch' && /outreach-draft/.test(w.url));
  ok(calls.length >= 1, 'the drafter should have been called');
  /* No money in the request. The card is an allowlist in lib/outreach.js;
     this proves the allowlist is what actually goes over the wire. */
  const sent = JSON.stringify(calls.map(c => c.body));
  ok(!/dealValue|retainer|commission|payments/.test(sent), 'no money field may reach the drafter: ' + sent.slice(0, 200));
});

await testAsync('RULE 2 — a veteran is flagged for Memorial Day, not drafted', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);
  await app.click(app.container.querySelector('.selcol input[type=checkbox]'));
  await app.type(app.container.querySelector('.mo-occ'), 'Memorial Day, wishing them a good weekend with family');
  await app.click(btn(app, /^Generate/));
  await app.wait(50);

  /* Tom is in the list, and his row carries the reason rather than a message. */
  ok(/Tom Nguyen/.test(app.text()), 'the held record should still be in the review list');
  ok(/Write this one yourself/.test(app.text()), 'the held row should say why it was held');

  /* The decisive one: he was never sent to the drafter. */
  const bodies = app.db.writes.filter(w => w.op === 'fetch' && /outreach-draft/.test(w.url)).map(w => w.body);
  const ids = bodies.flatMap(b => (b.people || []).map(p => p.id));
  ok(!ids.includes('L2'), 'a held record must never be sent to the model: ' + ids.join(','));
  ok(ids.includes('L1'), 'everyone else should be: ' + ids.join(','));
});

await testAsync('OPENING MESSAGES IS NOT SENDING — clicking Text writes nothing', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);
  await app.click(app.container.querySelector('.selcol input[type=checkbox]'));
  await app.type(app.container.querySelector('.mo-occ'), 'checking in before the long weekend');
  await app.click(btn(app, /^Generate/));
  await app.wait(50);

  const before = leadWrites(app).length;
  const text = sendable(app)[0];
  ok(!!text, 'a Text link should render on a ready row');
  /* The href is a real sms: link carrying the message, which is the whole
     mechanism — an <a> with no body would open an empty compose. */
  ok(/^sms:5551112222&body=/.test(text.getAttribute('href')), 'the link should be sms: with a body: ' + text.getAttribute('href'));
  await app.click(text);

  eq(leadWrites(app).length - before, 0, 'opening Messages must not log anything');
  ok(/Did it send\?/.test(app.text()), 'the row should ask whether it actually went');
});

await testAsync('CONFIRMING A SEND writes exactly one Text activity, stamped', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);
  await app.click(app.container.querySelector('.selcol input[type=checkbox]'));
  await app.type(app.container.querySelector('.mo-occ'), 'Memorial Day, wishing them a good weekend with family');
  await app.click(btn(app, /^Generate/));
  await app.wait(50);

  const before = leadWrites(app).length;
  const live = sendable(app);
  /* Tom is held by the Memorial Day rule, so there are fewer live links than
     rows — assert that, or this test could pass while silently sending to him. */
  eq(live.length, 1, 'only the un-held row should be sendable: ' + live.length);
  await app.click(live[0]);
  await app.click(btn(app, /Yes, log it/));
  await app.wait(50);

  const writes = leadWrites(app).slice(before);
  eq(writes.length, 1, 'one confirmed send is exactly one write: ' + JSON.stringify(writes.map(w => w.op)));

  const lead = writes[0].lead;
  ok(!!lead, 'the write should carry the whole lead');
  eq(lead.id, 'L1', 'it should be the row that was sent');

  const acts = (lead.activities || []).filter(a => a.type === 'Text');
  eq(acts.length, 1, 'exactly one Text activity: ' + JSON.stringify(lead.activities));

  const a = acts[0];
  /* 'Text' is in REACHED_TYPES, so this counts as a real touch and moves the
     clock. That is intended, and the stamp below is what keeps it possible to
     tell these apart later without a backfill to reconstruct which rows they
     were — the failure IMPORT-NOTE-FINDING.md had to clean up after. */
  ok(a.outreach === true, 'the activity should be marked as outreach: ' + JSON.stringify(a));
  ok(/^memorial-day/.test(String(a.campaign)), 'it should carry the campaign key: ' + a.campaign);
  ok(/family time/.test(String(a.text)), 'it should carry the message that was sent: ' + a.text);
  ok(!!a.who, 'it should record who sent it');

  /* The row is done and does not offer to send again. */
  ok(/Logged/.test(app.text()), 'the row should read as logged');
});

await testAsync('an edited message is the one that gets logged', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);
  await app.click(app.container.querySelector('.selcol input[type=checkbox]'));
  await app.type(app.container.querySelector('.mo-occ'), 'checking in before the long weekend');
  await app.click(btn(app, /^Generate/));
  await app.wait(50);

  /* Rewrite the first row by hand, then send it. What the owner typed is what
     must reach the record — a re-draft behind their back would mean the log
     and the message they actually sent disagree. */
  const box = [...app.container.querySelectorAll('.mo-msg textarea')][0];
  await app.type(box, 'Rewrote this one myself.');
  const before = leadWrites(app).length;
  await app.click(sendable(app)[0]);
  await app.click(btn(app, /Yes, log it/));
  await app.wait(50);

  const writes = leadWrites(app).slice(before);
  eq(writes.length, 1, 'still exactly one write');
  const a = (writes[0].lead.activities || []).find(x => x.type === 'Text');
  eq(a.text, 'Rewrote this one myself.', 'the edited text is what gets logged');
});

await testAsync('a record with no phone can be seen but not texted', async tc => {
  const app = await mount({ leads: LEADS, settings: SETTINGS, api: { 'outreach-draft': DRAFTER } });
  tc.after(() => app.unmount());
  await openTab(app);
  /* Visible — the difference between "I could not find it" and "it is not
     there" is the whole answer, so it is shown with its reason rather than
     filtered out like a DNC. */
  ok(/Nora Nophone/.test(app.text()), 'a record with no phone should still be listed');

  await app.click(app.container.querySelector('.selcol input[type=checkbox]'));
  await app.type(app.container.querySelector('.mo-occ'), 'checking in before the long weekend');
  await app.click(btn(app, /^Generate/));
  await app.wait(50);

  /* …but never drafted for, because there is nowhere to send it. */
  const ids = app.db.writes.filter(w => w.op === 'fetch' && /outreach-draft/.test(w.url))
    .flatMap(w => (w.body.people || []).map(p => p.id));
  ok(!ids.includes('L4'), 'a record with no number must not be drafted for: ' + ids.join(','));
});

await testAsync('a drafter that refuses stops the run instead of shortening it silently', async tc => {
  const app = await mount({
    leads: LEADS, settings: SETTINGS,
    api: { 'outreach-draft': { ok: false, capped: true, error: "This month's AI budget of $20 is used up." } },
  });
  tc.after(() => app.unmount());
  await openTab(app);
  await app.click(app.container.querySelector('.selcol input[type=checkbox]'));
  await app.type(app.container.querySelector('.mo-occ'), 'checking in before the long weekend');
  await app.click(btn(app, /^Generate/));
  await app.wait(50);

  ok(/budget/.test(app.text()), 'the refusal should be shown, not swallowed');
  eq(leadWrites(app).length, 0, 'a failed run writes nothing');
  /* Nobody is left looking drafted when they were not. */
  ok(!btns(app, /Yes, log it/).length, 'no row should be sendable after a refused run');
});

report('outreach send');
