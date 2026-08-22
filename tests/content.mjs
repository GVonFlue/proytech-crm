/* CONTENT STUDIO — the parts that must not be wrong.
   ============================================================================

   A green build proves this file parses. It does not prove that the spend cap
   is checked before the model is called, that the API key stayed on the server,
   or that the two column lists for content_posts still agree. Those are the
   things that cost money or silently lose data, so they are asserted here.

   Pure logic plus source-level assertions. No DOM, no network — the same shape
   as tests/guard.mjs and tests/apiauth.mjs.                                  */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readConfig, CONFIG_DEFAULTS, parseList, comingMonday, currentMonday,
  buildSystemPrompt, buildUserPrompt, buildRegeneratePrompt, groupContext,
  parseModelJson, postsFrom, postRow, captionsFrom, normPost, normResearch,
  postsForWeek, todayQueue, researchOrder, weeksOf, centsFrom, unitsFrom,
  exportContext, planImportContext,
} from '../src/lib/content.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = f => fs.readFile(path.join(root, f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); }
};

/* ========================================================== the week ====== */

console.log('\nweek_of is the COMING Monday, from every day of the week');
{
  /* August 2026: 17th is a Monday. Built from local parts, so this is the same
     answer in Wichita as in London — a toISOString() here would file Sunday
     evening's run under the wrong week for anyone west of Greenwich, which is
     everyone who uses this. */
  const cases = [
    ['Mon 17th', new Date(2026, 7, 17), '2026-08-24'],
    ['Tue 18th', new Date(2026, 7, 18), '2026-08-24'],
    ['Wed 19th', new Date(2026, 7, 19), '2026-08-24'],
    ['Thu 20th', new Date(2026, 7, 20), '2026-08-24'],
    ['Fri 21st', new Date(2026, 7, 21), '2026-08-24'],
    ['Sat 22nd', new Date(2026, 7, 22), '2026-08-24'],
    ['Sun 23rd', new Date(2026, 7, 23), '2026-08-24'],
  ];
  for (const [label, d, want] of cases) ok(label + ' -> ' + want, comingMonday(d) === want, comingMonday(d));
  /* The cron fires Sunday 8pm Central. That is the run that must produce the
     week starting the very next morning, not the one after. */
  ok('the Sunday-night cron files under tomorrow, not next week',
    comingMonday(new Date(2026, 7, 23, 20, 0)) === '2026-08-24', comingMonday(new Date(2026, 7, 23, 20, 0)));
}
{
  console.log('\n  ...and across a year end and a leap day');
  ok('Sun 27 Dec 2026 -> 2026-12-28', comingMonday(new Date(2026, 11, 27)) === '2026-12-28', comingMonday(new Date(2026, 11, 27)));
  ok('Thu 31 Dec 2026 -> 2027-01-04', comingMonday(new Date(2026, 11, 31)) === '2027-01-04', comingMonday(new Date(2026, 11, 31)));
  ok('Sat 27 Feb 2027 -> 2027-03-01', comingMonday(new Date(2027, 1, 27)) === '2027-03-01', comingMonday(new Date(2027, 1, 27)));
  ok('leap: Fri 28 Feb 2028 -> 2028-03-06', comingMonday(new Date(2028, 1, 28)) === '2028-03-06', comingMonday(new Date(2028, 1, 28)));
  ok('currentMonday on a Monday is that Monday', currentMonday(new Date(2026, 7, 17)) === '2026-08-17', currentMonday(new Date(2026, 7, 17)));
  ok('currentMonday on a Sunday looks BACK', currentMonday(new Date(2026, 7, 23)) === '2026-08-17', currentMonday(new Date(2026, 7, 23)));
}

/* ========================================================== the config ==== */

console.log('\nconfig comes from rows, and a fallback is named');
{
  const { config, missing } = readConfig([]);
  ok('an empty table falls back to every default', missing.length === Object.keys(CONFIG_DEFAULTS).length, missing.join(','));
  ok('  and names them, so "never created" is not "deliberately set"',
    missing.includes('posts_per_week') && missing.includes('model') && missing.includes('monthly_cap_cents'), missing.join(','));
  ok('  surfaces arrives as a list, not a string', Array.isArray(config.surfaces) && config.surfaces.length === 2, JSON.stringify(config.surfaces));
}
{
  const rows = [
    { category: 'config', key: 'posts_per_week', value: '4', active: true },
    { category: 'config', key: 'model', value: 'claude-sonnet-5', active: true },
    { category: 'config', key: 'monthly_cap_cents', value: '750', active: true },
    { category: 'config', key: 'surfaces', value: 'linkedin, x, instagram', active: true },
  ];
  const { config, missing } = readConfig(rows);
  ok('a row wins over the default', config.posts_per_week === 4 && config.model === 'claude-sonnet-5', JSON.stringify(config.model));
  ok('  the cap is read as a number', config.monthly_cap_cents === 750, config.monthly_cap_cents);
  ok('  a comma list becomes three surfaces', config.surfaces.join('|') === 'linkedin|x|instagram', config.surfaces.join('|'));
  ok('  and those four keys are no longer "missing"',
    !missing.includes('posts_per_week') && !missing.includes('surfaces'), missing.join(','));
}
{
  /* THE bug class this project keeps shipping (ENGINEERING.md §2): a value that
     goes missing coerces to 0, and 0 is legal. posts_per_week = 0 generates
     nothing and looks exactly like a working spend cap; monthly_cap_cents = 0
     refuses every run and looks exactly like a budget already spent. Both are
     treated as MISSING and reported by name. */
  const bad = readConfig([
    { category: 'config', key: 'posts_per_week', value: '0', active: true },
    { category: 'config', key: 'monthly_cap_cents', value: 'lots', active: true },
  ]);
  ok('posts_per_week = 0 is a MISSING row, not a zero',
    bad.config.posts_per_week === CONFIG_DEFAULTS.posts_per_week && bad.missing.includes('posts_per_week'), bad.config.posts_per_week);
  ok('a non-numeric cap is a MISSING row, not a zero cap',
    bad.config.monthly_cap_cents === CONFIG_DEFAULTS.monthly_cap_cents && bad.missing.includes('monthly_cap_cents'), bad.config.monthly_cap_cents);
  ok('an INACTIVE config row does not apply',
    readConfig([{ category: 'config', key: 'model', value: 'nope', active: false }]).config.model === CONFIG_DEFAULTS.model);
  ok('a JSON array in surfaces parses too', parseList('["a","b"]').join('|') === 'a|b', parseList('["a","b"]').join('|'));
}

/* ================================================= the prompt composition = */

const CTX = [
  { id: '1', category: 'voice', key: 'tone', value: 'plain and direct', active: true, sort_order: 1 },
  { id: '2', category: 'forbidden', key: 'no hype', value: 'never say game-changer', active: true, sort_order: 1 },
  { id: '3', category: 'pillar', key: 'systems', value: 'how the business runs', active: true, sort_order: 1 },
  { id: '4', category: 'cta', key: 'book', value: 'book a call', active: true, sort_order: 1 },
  { id: '5', category: 'offer', key: 'crm', value: 'the CRM build, 4k', active: true, sort_order: 1 },
  { id: '6', category: 'audience', key: 'who', value: 'owner-operators', active: true, sort_order: 1 },
  { id: '7', category: 'mix', key: 'ratio', value: '4 personal to 3 proytech', active: true, sort_order: 1 },
  { id: '8', category: 'proof', key: 'wins', value: '31 installs', active: true, sort_order: 1 },
  { id: '9', category: 'seasonal', key: 'q3', value: 'back to school', active: true, sort_order: 1 },
  { id: '10', category: 'voice', key: 'dead', value: 'do not use', active: false, sort_order: 2 },
  { id: '11', category: 'config', key: 'monthly_cap_cents', value: '4242', active: true, sort_order: 0 },
];

console.log('\nthe system prompt is composed, not dumped');
{
  const { config } = readConfig(CTX);
  const p = buildSystemPrompt(CTX, config);

  ok('config.instructions comes FIRST', p.startsWith(CONFIG_DEFAULTS.instructions.slice(0, 60)), p.slice(0, 60));
  ok('config.output_contract comes LAST', p.trimEnd().endsWith(CONFIG_DEFAULTS.output_contract.trimEnd().slice(-40)), p.slice(-60));

  const order = ['VOICE', 'FORBIDDEN', 'PILLARS', 'CALLS TO ACTION', 'OFFERS', 'AUDIENCE', 'MIX', 'PROOF']
    .map(h => p.indexOf(h));
  ok('the eight sections appear in WEEKEND1\'s order',
    order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));

  ok('every active row reaches the prompt', p.includes('plain and direct') && p.includes('31 installs'));
  ok('an INACTIVE row does NOT', !p.includes('do not use'));
  ok('a category nobody planned for is kept, not dropped', p.includes('SEASONAL') && p.includes('back to school'));

  /* The spend cap and the model id are machinery. A model that can read the
     ceiling can be argued into ignoring it, and output_contract appearing twice
     is the fastest way to get two different JSON shapes back. */
  ok('the config CATEGORY never reaches the model', !p.includes('4242') && !p.includes('monthly_cap_cents'), 'config leaked into the prompt');
  ok('the surfaces are stated to the model', p.includes('SURFACES') && p.includes('- linkedin'));
  ok('the contract appears exactly once', p.split('Return ONLY valid JSON').length - 1 === 1);
}
{
  const { config } = readConfig(CTX);
  ok('groupContext drops inactive rows', !(groupContext(CTX).voice || []).some(r => r.key === 'dead'));
  const u = buildUserPrompt({ research: [], performance: [], count: config.posts_per_week, weekOf: '2026-08-24' });
  ok('the user turn states the week and the count', u.includes('2026-08-24') && u.includes('exactly 7 posts'), u.slice(0, 120));
  const u2 = buildUserPrompt({
    research: [{ id: 'r1', source_type: 'swipe', platform: 'linkedin', raw: 'the hook', why_it_worked: 'specific' }],
    performance: [{ id: 'p1', mix_class: 'personal', hook: 'old hook', performance: '4k views' }],
    count: 3, weekOf: '2026-08-24',
  });
  ok('research reaches the model', u2.includes('the hook') && u2.includes('specific'));
  ok('what landed reaches the model', u2.includes('old hook') && u2.includes('4k views'));
}
{
  const post = normPost({
    week_of: '2026-08-24', mix_class: 'personal', pillar: 'systems', surface: 'linkedin',
    hook: 'keep me', concept: 'keep me too', captions: { linkedin: 'old caption', instagram: 'other' },
  });
  const cap = buildRegeneratePrompt(post, 'caption', ['linkedin', 'instagram']);
  ok('a caption rewrite states the three fixed fields',
    cap.includes('week_of: 2026-08-24') && cap.includes('mix_class: personal') && cap.includes('pillar: systems'));
  ok('  and says the concept is not being rewritten', /CAPTIONS ONLY/i.test(cap));
  ok('  and carries the current captions', cap.includes('old caption'));
  ok('a full rewrite asks for a different angle', /REWRITE THE WHOLE POST/i.test(buildRegeneratePrompt(post, 'full', ['linkedin'])));
}

/* ======================================================== parsing ========= */

console.log('\nthe response is parsed defensively');
{
  ok('plain JSON', parseModelJson('{"posts":[{"hook":"a"}]}').ok);
  ok('fenced JSON', parseModelJson('```json\n{"posts":[]}\n```').ok);
  ok('bare fences', parseModelJson('```\n{"posts":[]}\n```').ok);
  ok('an object wrapped in a sentence is salvaged', parseModelJson('Here you go: {"posts":[]} hope that helps').ok);
  const bad = parseModelJson('I would rather not.');
  ok('prose with no object FAILS rather than half-parsing', !bad.ok && bad.value === null);
  ok('  and the raw text is carried back for the log', bad.raw.includes('rather not'));
  ok('empty fails', !parseModelJson('').ok);
  ok('postsFrom accepts a bare array too', postsFrom([{ hook: 'x' }]).length === 1);
  ok('postsFrom on junk returns nothing to insert', postsFrom({ nope: 1 }).length === 0);
}

/* ======================================================== the row shape === */

console.log('\nwhat actually reaches content_posts');
{
  const ctx = { weekOf: '2026-08-24', surfaces: ['linkedin', 'instagram'], researchIds: ['r1', 'r2'], generatedAt: '2026-08-23T20:00:00.000Z' };
  const row = postRow({
    mix_class: 'personal', surface: 'tiktok', pillar: 'systems', format: 'carousel',
    hook: 'h', concept: 'c', value_statement: 'v', cta_key: 'book',
    captions: { linkedin: 'L' }, carousel_slides: ['one', 'two'],
  }, ctx);

  ok('a surface the config does not name is coerced to one that is',
    row.surface === 'linkedin', row.surface);
  ok('there is a caption key for EVERY configured surface',
    Object.keys(row.captions).join('|') === 'linkedin|instagram', Object.keys(row.captions).join('|'));
  ok('  the missing one is empty, not absent', row.captions.instagram === '');
  ok('status is draft, always', row.status === 'draft');
  ok('week_of comes from the caller, never the model', row.week_of === '2026-08-24');
  ok('the research it was built from is recorded', row.source_research.join('|') === 'r1|r2');

  /* WEEKEND1: leave the later-phase columns null, do not remove them. An INSERT
     that does not NAME a column leaves its default alone; naming it with null
     is a write, and a write is what "leave them alone" rules out. */
  const later = ['idea_id', 'parent_id', 'series_key', 'series_index', 'source_insights', 'recycled_from'];
  for (const c of later) ok('the insert does not name ' + c, !(c in row), 'later-phase column written');
  ok('and it does not name id either — Postgres assigns it', !('id' in row));
}
{
  const caps = captionsFrom({ captions: { linkedin: 'new L', instagram: 'new I' } }, ['linkedin', 'instagram']);
  ok('captionsFrom reads a caption per surface', caps && caps.linkedin === 'new L' && caps.instagram === 'new I');
  ok('captionsFrom on an empty answer returns null, so the caller can refuse',
    captionsFrom({ captions: {} }, ['linkedin']) === null);
  ok('  rather than blanking captions the owner wanted kept',
    captionsFrom({ nonsense: true }, ['linkedin']) === null);
}

/* ======================================================== the screen ====== */

console.log('\nthe lists the screen renders');
{
  const posts = [
    { id: 'a', week_of: '2026-08-24', status: 'approved', generated_at: '1' },
    { id: 'b', week_of: '2026-08-24', status: 'draft', generated_at: '2' },
    { id: 'c', week_of: '2026-08-17', status: 'approved', generated_at: '3' },
    { id: 'd', week_of: '2026-08-24', status: 'approved', posted_at: '2026-08-24T12:00:00Z', generated_at: '4' },
    { id: 'e', week_of: '2026-08-24', status: 'killed', generated_at: '5' },
  ];
  ok('the slate shows one week', postsForWeek(posts, '2026-08-24').map(p => p.id).join('') === 'abde',
    postsForWeek(posts, '2026-08-24').map(p => p.id).join(''));
  const q = todayQueue(posts, '2026-08-24').map(p => p.id).join('');
  ok('Today is approved-and-not-posted only', q === 'ac', q);
  ok('  a killed post never reaches Today', !q.includes('e'));
  ok('  an already-posted one drops off', !q.includes('d'));
  ok('  and this week sorts ahead of last week', q.indexOf('a') < q.indexOf('c'));
  ok('the week picker lists newest first', weeksOf(posts).join('|') === '2026-08-24|2026-08-17', weeksOf(posts).join('|'));

  const r = researchOrder([
    { id: '1', used: true, captured_at: '2026-08-20' },
    { id: '2', used: false, captured_at: '2026-08-10' },
    { id: '3', used: false, captured_at: '2026-08-19' },
  ]).map(x => x.id).join('');
  ok('research puts UNUSED first, then newest', r === '321', r);
}

/* ======================================================== export/import === */

console.log('\nimport is additive and confirmed, never a silent overwrite');
{
  const existing = [{ id: '1', category: 'voice', key: 'tone', value: 'MINE', active: true, sort_order: 0 }];
  const doc = exportContext([
    { id: '1', category: 'voice', key: 'tone', value: 'theirs', active: true, sort_order: 0 },
    { id: '2', category: 'offer', key: 'crm', value: 'new one', active: true, sort_order: 1 },
  ], '2026-08-22T00:00:00.000Z');
  ok('an export names itself', doc.kind === 'proytech-content-brand-context' && doc.version === 1);
  ok('  and carries no ids — the target install assigns its own', !('id' in doc.rows[0]));

  const plan = planImportContext(doc, existing);
  ok('the plan is ok', plan.ok, plan.error);
  ok('a colliding row is NOT in the add list', plan.add.length === 1 && plan.add[0].key === 'crm', JSON.stringify(plan.add.map(r => r.key)));
  ok('  it is reported so the confirm step can say what it skips',
    plan.collide.length === 1 && plan.collide[0].key === 'tone');
  ok('  and the owner\'s own value is untouched by the plan', existing[0].value === 'MINE');

  ok('a file that is not one of ours is refused',
    !planImportContext({ kind: 'something-else', rows: [{ category: 'a', key: 'b', value: 'c' }] }, []).ok);
  ok('an empty file is refused', !planImportContext({ rows: [] }, []).ok);
  ok('a round trip survives', planImportContext(exportContext(existing, 'x'), []).add[0].value === 'MINE');
}

console.log('\ncost is counted in whole cents, rounded UP');
{
  ok('half a cent still costs a cent', centsFrom(0.004) === 1, centsFrom(0.004));
  ok('nothing costs nothing', centsFrom(0) === 0);
  ok('a negative never credits the ledger', centsFrom(-5) === 0);
  ok('units count cache reads and writes too',
    unitsFrom({ input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 2, output_tokens: 3 }) === 20);
  ok('a missing usage object is zero, not NaN', unitsFrom(undefined) === 0);
}

/* ================================================== the source assertions = */

console.log('\nthe API key never leaves the server');
{
  const src = await Promise.all(['src/App.jsx', 'src/ContentStudio.jsx', 'src/lib/content.js', 'src/lib/brand.js', 'src/lib/supabase.js']
    .map(async f => [f, await read(f)]));
  for (const [f, s] of src) {
    ok(f + ' never names ANTHROPIC_API_KEY_CONTENT', !s.includes('ANTHROPIC_API_KEY_CONTENT'),
      'the content key is reachable from client code');
  }
  const brand = await read('src/lib/brand.js');
  ok('no VITE_ variable carries an api key', !/VITE_[A-Z_]*(?:ANTHROPIC|API_KEY)/.test(brand + src.map(x => x[1]).join('')),
    'a VITE_ prefixed key is inlined into the bundle by Vite');

  /* The bundle is the actual proof. A rule about which file may name a variable
     is a rule; what shipped is a fact. */
  const dist = path.join(root, 'dist/assets');
  let bundled = '';
  try {
    for (const f of await fs.readdir(dist)) if (f.endsWith('.js')) bundled += await fs.readFile(path.join(dist, f), 'utf8');
  } catch { bundled = ''; }
  if (bundled) {
    ok('the built bundle does not contain the key name', !bundled.includes('ANTHROPIC_API_KEY_CONTENT'));
    ok('the built bundle does not contain an anthropic key', !/sk-ant-[A-Za-z0-9_-]{10}/.test(bundled));
  } else {
    console.log('  --  no dist/ to check (run npm run build first)');
  }
}

console.log('\nboth routes are guarded, and the cron leg is not a hole');
{
  const slate = await read('api/content-slate.js');
  const regen = await read('api/content-regenerate.js');
  const shared = await read('api/_content.js');

  for (const [n, s] of [['content-slate', slate], ['content-regenerate', regen]]) {
    ok(n + ' goes through the shared guard', /guard\(req,\s*res/.test(s) && /from '\.\/_guard\.js'/.test(s));
    ok(n + ' requires an OWNER, not just a session', /requireOwner:\s*true/.test(s));
    ok(n + ' sets its own maxChars', /maxChars:\s*\d+/.test(s));
    ok(n + ' checks the spend cap', /underCap\(/.test(s));
  }

  ok('the cron secret is compared in constant time', /timingSafeEqual/.test(shared),
    'an === on a secret leaks its prefix a byte at a time');
  ok('an unset CRON_SECRET refuses the cron path rather than opening it',
    /if \(!secret\)[\s\S]{0,200}return false/.test(shared));
  ok('the slate route only skips the guard for the cron caller',
    /const cron = isCronCaller\(req\);[\s\S]{0,200}if \(!cron\)[\s\S]{0,400}guard\(req, res/.test(slate));

  /* The order below is the whole point of the cap. Checking it after the call
     is an audit log, not a ceiling. */
  ok('the cap is checked BEFORE the model is called',
    slate.indexOf('underCap(') < slate.indexOf('askAnthropic('), 'the cap must gate the spend, not report it');
  ok('  and the same in the regenerate route',
    regen.indexOf('underCap(') < regen.indexOf('askAnthropic('));
  ok('an unreachable ledger fails CLOSED', /spent === null[\s\S]{0,200}503/.test(shared),
    'a cap that cannot see the ledger is not a cap');
  ok('a parse failure logs the raw response and writes nothing',
    /parsed\.ok[\s\S]{0,400}console\.error[\s\S]{0,200}parsed\.raw/.test(slate));
  ok('research is marked used AFTER the insert, never before',
    slate.indexOf('insertPosts(') < slate.indexOf('markResearchUsed('),
    'marking first retires research that produced nothing');
  ok('a dry run inserts nothing', /if \(dryRun\)[\s\S]{0,400}return;/.test(slate) &&
    slate.indexOf('if (dryRun)') < slate.indexOf('await insertPosts('));
  ok('a caption regenerate patches captions ONLY',
    /patch = \{ captions \};/.test(regen), 'a caption fix that rewrites the hook is not a caption fix');
  ok('a full regenerate re-imposes week_of / mix_class / pillar from the stored row',
    /week_of: post\.week_of,\s*\n\s*mix_class: post\.mix_class,\s*\n\s*pillar: post\.pillar,/.test(regen));

  const later = ['idea_id', 'parent_id', 'series_key', 'series_index', 'source_insights', 'recycled_from'];
  const outOfScope = ['content_ideas', 'content_insights', 'content_mining_state', 'content_assets'];
  const all = slate + regen + shared + await read('src/ContentStudio.jsx') + await read('src/lib/content.js') + await read('src/lib/supabase.js');
  for (const c of later) ok('nothing reads or writes ' + c, !new RegExp('[\'"`,]' + c + '\\b').test(all), 'later-phase column touched');
  /* Matched on the two ways this codebase reaches a table — supabase-js
     .from('x') in the browser and a PostgREST path in api/_content.js — rather
     than on the bare name, so a comment saying "we do not touch content_ideas"
     is not itself a failure. The prose above and below does exactly that. */
  for (const t of outOfScope) {
    const reached = new RegExp("\\.from\\(['\"`]" + t + "|['\"`]" + t + "\\?|['\"`]" + t + "['\"`]\\s*,\\s*\\{").test(all);
    ok('nothing queries ' + t, !reached, 'out-of-scope table queried');
  }
}

console.log('\none table, one column list');
{
  const client = await read('src/lib/supabase.js');
  const server = await read('api/_content.js');
  const pull = (s, name) => {
    const m = new RegExp(name + '\\s*=\\s*([\\s\\S]*?);', 'm').exec(s);
    if (!m) return null;
    return m[1].replace(/\s+/g, '').replace(/'\+'/g, '').replace(/^'|'$/g, '').replace(/'/g, '');
  };
  const a = pull(client, 'CONTENT_POST_COLS');
  const b = pull(server, 'POST_COLS');
  ok('the client and server select lists for content_posts are identical', a && b && a === b,
    `client: ${a}\n  server: ${b}`);

  /* ENGINEERING.md §2, the write-path/read-path rule: every column the feature
     writes must be named by every read that uses it. `recurring` and
     `appointment_rate` both vanished exactly this way. */
  const written = ['status', 'captions', 'posted_at', 'platform_post_ids', 'performance',
    'week_of', 'mix_class', 'surface', 'pillar', 'format', 'hook', 'concept',
    'image_prompt', 'carousel_slides', 'cta_key', 'value_statement', 'source_research', 'generated_at'];
  for (const c of written) ok('the read path selects ' + c, (a || '').split(',').includes(c), 'written but never selected');
}

console.log('\nthe Studio has no colour of its own');
{
  const s = await read('src/ContentStudio.jsx');
  /* Not a style preference. WEEKEND1 §E makes the five colours env vars so a
     white-label install restyles without a code edit — one inlined hex is one
     colour that install can never change, and it will not be noticed until
     somebody else's brand is on the screen. */
  const hex = (s.match(/#[0-9a-fA-F]{3,8}\b/g) || []);
  ok('no hex literal anywhere in ContentStudio.jsx', hex.length === 0, hex.join(' '));
  ok('the palette comes from brand.js', /CONTENT_BRAND/.test(s));
  ok('every rule reads a custom property', /var\(--cs-primary\)/.test(s));

  const b = await read('src/lib/brand.js');
  for (const v of ['VITE_BRAND_PRIMARY', 'VITE_BRAND_ACCENT', 'VITE_BRAND_ACCENT_TEXT', 'VITE_BRAND_NAVY', 'VITE_BRAND_INK']) {
    ok(v + ' is read with a default', new RegExp(v + '[,\\s]*,\\s*\'#').test(b), 'env var missing or has no fallback');
  }
  ok('Space Grotesk carries display type', /Space Grotesk/.test(s));
  ok('Inter carries body type', /'Inter'/.test(s));
  ok('Space Mono carries labels', /Space Mono/.test(s));
}

console.log('\nthe tab is off unless the build says otherwise');
{
  const brand = await read('src/lib/brand.js');
  const app = await read('src/App.jsx');
  ok('the flag must be the exact string true', /VITE_CONTENT_STUDIO[\s\S]{0,120}===\s*'true'/.test(brand),
    'a truthy check would switch it on for VITE_CONTENT_STUDIO=false');
  ok('App.jsx gates the nav entry on it', /CONTENT_STUDIO_ON\?\[\['content'/.test(app));
  ok('App.jsx gates the route on it', /k==='content'\) return CONTENT_STUDIO_ON/.test(app));
  ok('and a rep can never open it', /k==='content'\) return CONTENT_STUDIO_ON&&!isRep\(user\)/.test(app),
    'content_brand_context holds pricing — ROLES.md keeps that off a rep screen');
  ok('App.jsx does not load Content Studio data', !/getContentPosts|getContentContext|getContentResearch/.test(app),
    'the screen is self-contained (WEEKEND1 §1)');
}

console.log('\nthe cron is registered and points at the right route');
{
  const v = JSON.parse(await read('vercel.json'));
  const c = (v.crons || [])[0] || {};
  ok('vercel.json has one cron', (v.crons || []).length === 1);
  ok('  pointed at /api/content-slate', c.path === '/api/content-slate', c.path);
  ok('  at 0 1 * * 1 — Sunday 8pm Central', c.schedule === '0 1 * * 1', c.schedule);
}

console.log(`\ncontent: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
