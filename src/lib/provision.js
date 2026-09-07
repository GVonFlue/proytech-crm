/* ============================================================================
   src/lib/provision.js — the data behind the Build Console.

   Pure data and pure functions. No React, no Supabase, no imports from App.

   WHAT THIS DESCRIBES. Every field src/lib/brand.js reads in the realtor
   template (GVonFlue/Dwellbusinesssuite). A client install of that template is
   configured entirely by environment variables at build time, which is what
   makes provisioning from here possible: the console produces a variable list,
   somebody pastes it into a Vercel project, and the CRM configures itself.

   WHY THE DEFAULTS ARE COPIED HERE RATHER THAN IMPORTED. They live in a
   different repository. There is no import that reaches them, so they are
   duplicated, and duplication drifts. That is a real cost and it is accepted
   for one reason: the alternative is emitting every variable on every install,
   which buries the four values that actually differ under twenty that do not.

   TEMPLATE_VERSION below is the guard. When the template's brand.js changes,
   bump it and re-check this file. If it has not been bumped in a while, that
   is a signal to look, not a guarantee that nothing moved.
   ============================================================================ */

/* Bump when brand.js in the template changes. Shown in the console header so
   the drift is visible rather than assumed. */
export const TEMPLATE_VERSION = '2026-09-06';
export const TEMPLATE_REPO = 'GVonFlue/Dwellbusinesssuite';

/* --------------------------------------------------------------- sections
   The realtor template's fourteen views, keyed exactly as VITE_MODULES
   expects. The third element is the reason somebody would switch it off,
   which is more useful in a provisioning screen than a description of what
   the view does. */
export const TEMPLATE_SECTIONS = [
  ['dashboard',    'Dashboard',        'The numbers. First screen.'],
  ['assistant',    'Assistant',        'AI over the CRM data.'],
  ['tasks',        'Tasks',            'What needs doing.'],
  ['activity',     'Activity',         'Contact health and touches.'],
  ['pcs',          'PCS / Relocation', 'Military move timelines. The date offsets are move-specific and unverified in the template.'],
  ['pipeline',     'Pipeline',         'Buyer and seller stages.'],
  ['contacts',     'Contacts',         'The database.'],
  ['transactions', 'Transactions',     'The closing board.'],
  ['contracts',    'Contracts',        'Critical dates read off the executed contract. Offsets are jurisdiction-specific.'],
  ['commission',   'Commission',       'Splits, caps, GCI.'],
  ['books',        'The Books',        'Expenses, mileage, profit and loss.'],
  ['tools',        'AI Tools',         'Drafting and analysis.'],
  ['huddle',       'Monday Huddle',    'A team ritual. Nothing for one agent to run.'],
  ['settings',     'Settings',         'Leader only. Switching this off locks the install.'],
];

/* Two presets. Solo drops the two team-and-military views; team keeps
   everything except PCS, which stays off until somebody verifies its offsets
   whatever the shape of the business. */
export const PRESETS = {
  solo: TEMPLATE_SECTIONS.map(s => s[0]).filter(k => k !== 'huddle' && k !== 'pcs'),
  team: TEMPLATE_SECTIONS.map(s => s[0]).filter(k => k !== 'pcs'),
  all:  TEMPLATE_SECTIONS.map(s => s[0]),
};

/* ----------------------------------------------------------------- colours
   Defaults are the template's own. Green and red are listed because a client
   could change them, and flagged because they should not: they mean won and
   lost across the whole product, not brand. */
export const TEMPLATE_COLORS = [
  ['cobalt', 'Cobalt', '#1338DE', 'Primary. Buttons and active states.'],
  ['indigo', 'Indigo', '#3B3470', 'Secondary surfaces.'],
  ['ink',    'Ink',    '#111528', 'Body text and dark panels.'],
  ['gold',   'Gold',   '#C8A24A', 'Accents and highlights.'],
  ['green',  'Green',  '#1F9D55', 'Means WON. Not a brand colour.'],
  ['red',    'Red',    '#D14343', 'Means LOST. Not a brand colour.'],
];

/* ---------------------------------------------------------------- defaults
   Copied from the template's brand.js. A field left blank here and a variable
   left unset there produce the same install, which is what lets diffEnv()
   emit only what actually differs. */
export const TEMPLATE_DEFAULTS = {
  productShort: 'Business Suite',
  authDomain:   'summitandvine.app',
  tagline:      'No deadline lives outside the Suite.',
  taglineSub:   'Read it off the contract, not from memory.',
  tz:           'America/Chicago',
};

export const blankInstall = () => ({
  id: '', name: '', short: '', ai: '',
  product: '', title: '',
  authDomain: TEMPLATE_DEFAULTS.authDomain,
  bizName: '', license: '', email: '', phone: '', address: '',
  tz: TEMPLATE_DEFAULTS.tz, logo: '',
  tagline: TEMPLATE_DEFAULTS.tagline,
  taglineSub: TEMPLATE_DEFAULTS.taglineSub,
  colors: TEMPLATE_COLORS.reduce((a, c) => (a[c[0]] = c[2], a), {}),
  modules: PRESETS.solo.slice(),
  siteRepo: '',
  notes: '',
});

/* ------------------------------------------------------------------ output
   Only what differs from the template default.

   Setting a variable to the value it already has is noise, and noise in an
   environment variable list is how the one that matters gets skimmed past. */
export function diffEnv(x) {
  const out = [];
  const add = (k, v, def) => {
    const s = (v == null ? '' : String(v)).trim();
    if (s && s !== (def || '')) out.push([k, s]);
  };

  add('VITE_BRAND_ID', x.id);
  add('VITE_BRAND_NAME', x.name);
  add('VITE_BRAND_SHORT', x.short);
  add('VITE_APP_TITLE', x.title);
  add('VITE_PRODUCT_NAME', x.product);
  add('VITE_AI_NAME', x.ai);
  add('VITE_AUTH_DOMAIN', x.authDomain, TEMPLATE_DEFAULTS.authDomain);
  add('VITE_LOGO_URL', x.logo);
  add('VITE_TAGLINE', x.tagline, TEMPLATE_DEFAULTS.tagline);
  add('VITE_TAGLINE_SUB', x.taglineSub, TEMPLATE_DEFAULTS.taglineSub);
  add('VITE_TZ', x.tz, TEMPLATE_DEFAULTS.tz);

  add('VITE_BIZ_NAME', x.bizName);
  /* brand.js turns a literal backslash-n back into a line break, so the
     multi-line address survives being a single-line environment variable. */
  add('VITE_BIZ_ADDRESS', (x.address || '').replace(/\n/g, '\\n'));
  add('VITE_BIZ_EMAIL', x.email);
  add('VITE_BIZ_PHONE', x.phone);
  add('VITE_BIZ_LICENSE', x.license);

  TEMPLATE_COLORS.forEach(c => {
    add('VITE_COLOR_' + c[0].toUpperCase(), (x.colors || {})[c[0]], c[2]);
  });

  /* An empty VITE_MODULES means everything is on, so a full list and no list
     are the same install. Emit nothing rather than a string that looks like a
     decision somebody made. */
  const m = x.modules || [];
  if (m.length && m.length < TEMPLATE_SECTIONS.length) {
    out.push(['VITE_MODULES', m.join(',')]);
  }
  return out;
}

export const envText = x => diffEnv(x).map(p => p[0] + '=' + p[1]).join('\n');

/* The values this console must never generate or store. Listed so an install
   sheet is complete without any of them passing through here. */
export const SECRET_KEYS = [
  ['VITE_SUPABASE_URL',         'Project URL. No fallback in the template, on purpose.'],
  ['VITE_SUPABASE_KEY',         'Anon key.'],
  ['SUPABASE_URL',              'Same project URL, server side.'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Service role. Server side only, never VITE_ prefixed.'],
  ['ANTHROPIC_API_KEY',         "This client's own key. Not ours, not another client's."],
  ['LEAD_INTAKE_TOKEN',         'openssl rand -hex 32. Must match CRM_API_KEY on their website.'],
  ['LEAD_INTAKE_OWNER_ID',      'crm_users.id. Does not exist until after the migration.'],
];

/* ------------------------------------------------------------------ checks
   Preflight. Every one of these is a mistake that produces a working build and
   a wrong install, which is the only kind worth a warning. */
export function preflight(x) {
  const out = [];
  const m = x.modules || [];

  if (!x.id) {
    out.push(['bad', 'No install id. VITE_BRAND_ID falls back to "proytech", which puts our assistant name and our mark inside a client\'s tool.']);
  } else if (!/^[a-z0-9-]+$/.test(x.id)) {
    out.push(['bad', 'Install id must be lowercase letters, numbers and hyphens. It becomes an asset folder path.']);
  }
  if (!x.name) out.push(['bad', 'No client name. The sidebar reads "Dwell Real Estate Group".']);
  if (!m.includes('settings')) out.push(['bad', 'Settings is off. Nobody can configure the install afterwards, including us.']);

  if (!x.bizName) out.push(['warn', 'No business name. Client-facing output falls back to the client name, which is wrong anywhere a supervising broker must be named.']);
  if (!x.ai) out.push(['warn', 'No assistant name. It becomes the word "Assistant".']);
  if (!x.authDomain) out.push(['warn', 'Auth domain blank, so it falls back to the template default. Decide it now: changing it after the first login locks out everyone who signs in with a bare username.']);
  if (m.includes('pcs')) out.push(['warn', 'PCS is on. Its date offsets are move-specific and unverified. Check them before a client sees a deadline.']);
  if (m.includes('contracts')) out.push(['warn', 'Contracts is on. Deadline offsets are jurisdiction-specific. Verify against the state contract form before go-live.']);
  if (x.siteRepo && !x.notes) out.push(['warn', 'A website is wired to this install. Record who holds LEAD_INTAKE_TOKEN, because the two ends drift the moment one project is redeployed alone.']);

  if (!out.length) out.push(['ok', 'Nothing blocking. Copy the variables and build the project.']);
  return out;
}

/* ---------------------------------------------------------------- runbook
   Ten steps, in the order that avoids rework. Demo before database is not
   politeness: the demo is what changes the spec, and changing it after the
   real instance exists means migrating data.

   Kept as data rather than markup so the component stays presentational. */
export function runbook(x) {
  const slug = x.id || 'client';
  return [
    ['Create the repo', `From ${TEMPLATE_REPO} with "Use this template". Name it ${slug}-crm, private.`],
    ['Add the lead webhook', 'Only if this client has a website feeding the CRM. api/lead-intake.js and docs/LEAD-INTAKE.md.'],
    ['Demo first', 'A Vercel project with VITE_DEMO=1 and nothing else. No database. Click through it before building the real one.'],
    ['Supabase project', 'Run MIGRATION.sql, then RLS-AUDIT.sql. The audit is not optional.'],
    ['Create the user', 'Then copy their crm_users.id. The lead webhook needs it and it does not exist until now.'],
    ['Second Vercel project', 'Paste the generated variables. VITE_DEMO must NOT be set on this one.'],
    ['Add the secrets', 'Supabase, the client\'s own Anthropic key, and the intake token.'],
    ['Wire the website', 'CRM_LEAD_ENDPOINT and CRM_API_KEY on their site project. Redeploy both.'],
    ['Test the lead path', 'Submit a real form on the live site and watch the contact appear. Nothing short of that proves both ends.'],
    ['Verify the offsets', 'Contract deadline offsets are jurisdiction-specific and unverified in the template. Check them against the state form before the client trusts a date.'],
  ];
}
