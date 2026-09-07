/* ============================================================================
   tests/buildconsole.mjs — the Build Console.

   ENGINEERING.md §1: "If you add behaviour, add a test." The suites assert on
   what reaches the database, not on what appears on screen, so most of what
   follows checks the generated variable list and the persisted install rather
   than the markup.

   Two bugs found while building this module are pinned here so they cannot
   come back:

     1. `amOwner` used inside NAV. It is a const declared inside the loader, so
        the reference builds clean and throws at render. ENGINEERING.md §1,
        "locals that look global". Caught by every existing DOM suite at once,
        which is the point of them.

     2. `db.getInstalls` missing from tests/stub-supabase.js, so the loader's
        catch swallowed it and the module silently had no data under test.
        A caught error that leaves a feature empty is the quietest failure in
        this codebase.
   ============================================================================ */

import assert from 'node:assert/strict';
import {
  TEMPLATE_SECTIONS, TEMPLATE_COLORS, TEMPLATE_DEFAULTS, PRESETS,
  blankInstall, diffEnv, envText, preflight, runbook, SECRET_KEYS,
} from '../src/lib/provision.js';

let pass = 0, fail = 0;
const ok = (label, fn) => {
  try { fn(); pass++; console.log('  \u2713 ' + label); }
  catch (e) { fail++; console.log('  \u2717 ' + label + '\n      ' + e.message); }
};
const envOf = x => Object.fromEntries(diffEnv(x));

console.log('\nbuildconsole');

/* ---------------------------------------------------------------- defaults */

ok('a blank install emits almost nothing, because blank means "use the template default"', () => {
  const e = diffEnv(blankInstall());
  const keys = Object.keys(Object.fromEntries(e));
  assert.equal(keys.filter(k => k !== 'VITE_MODULES').length, 0,
    'a blank install should emit no identity or colour variables, got: ' + keys.join(','));
});

ok('a value equal to the template default is never emitted', () => {
  const x = { ...blankInstall(), tz: TEMPLATE_DEFAULTS.tz, authDomain: TEMPLATE_DEFAULTS.authDomain };
  const e = envOf(x);
  assert.equal(e.VITE_TZ, undefined, 'VITE_TZ matched the default and should have been omitted');
  assert.equal(e.VITE_AUTH_DOMAIN, undefined, 'VITE_AUTH_DOMAIN matched the default and should have been omitted');
});

ok('a value that differs from the default IS emitted', () => {
  const e = envOf({ ...blankInstall(), tz: 'America/New_York' });
  assert.equal(e.VITE_TZ, 'America/New_York');
});

/* ------------------------------------------------------------------ colours */

ok('an untouched colour emits nothing; a changed one emits its variable', () => {
  const x = blankInstall();
  assert.equal(envOf(x).VITE_COLOR_COBALT, undefined, 'default cobalt should be omitted');
  x.colors = { ...x.colors, cobalt: '#172A3A' };
  assert.equal(envOf(x).VITE_COLOR_COBALT, '#172A3A');
});

ok('every colour in the table round-trips to its own variable name', () => {
  const x = blankInstall();
  TEMPLATE_COLORS.forEach(c => { x.colors[c[0]] = '#010203'; });
  const e = envOf(x);
  TEMPLATE_COLORS.forEach(c => {
    assert.equal(e['VITE_COLOR_' + c[0].toUpperCase()], '#010203', 'missing ' + c[0]);
  });
});

/* ------------------------------------------------------------------ address */

ok('a multi-line address survives as a single-line variable', () => {
  const x = { ...blankInstall(), address: '6530 E. 13th St. N.\nWichita, KS 67206' };
  const v = envOf(x).VITE_BIZ_ADDRESS;
  assert.ok(!v.includes('\n'), 'a raw newline in an env var truncates the value at the newline');
  assert.equal(v, '6530 E. 13th St. N.\\nWichita, KS 67206');
});

/* ------------------------------------------------------------------ modules */

ok('every module ticked emits NO module variable, because empty means everything', () => {
  const x = { ...blankInstall(), modules: PRESETS.all.slice() };
  assert.equal(envOf(x).VITE_MODULES, undefined,
    'a full list and no list are the same install; emitting one looks like a decision nobody made');
});

ok('a partial list emits a comma-separated string with no spaces', () => {
  const x = { ...blankInstall(), modules: ['dashboard', 'pipeline', 'settings'] };
  assert.equal(envOf(x).VITE_MODULES, 'dashboard,pipeline,settings');
});

ok('the solo preset drops huddle and pcs, and nothing else', () => {
  const dropped = PRESETS.all.filter(k => !PRESETS.solo.includes(k));
  assert.deepEqual(dropped.sort(), ['huddle', 'pcs']);
});

ok('every preset key exists in the section table', () => {
  const known = new Set(TEMPLATE_SECTIONS.map(s => s[0]));
  Object.entries(PRESETS).forEach(([name, keys]) => {
    keys.forEach(k => assert.ok(known.has(k), name + ' preset references unknown module: ' + k));
  });
});

ok('every preset keeps settings, because dropping it locks the install', () => {
  Object.entries(PRESETS).forEach(([name, keys]) => {
    assert.ok(keys.includes('settings'), name + ' preset omits settings');
  });
});

/* ---------------------------------------------------------------- preflight */

ok('a missing install id is a blocker, not a warning', () => {
  const f = preflight({ ...blankInstall(), name: 'X', modules: PRESETS.solo });
  assert.ok(f.some(x => x[0] === 'bad' && /VITE_BRAND_ID/.test(x[1])),
    'a blank id falls back to "proytech" and puts our name in a client tool; that is a blocker');
});

ok('an id with a capital or a space is a blocker, because it becomes a path', () => {
  ['Alex Colon', 'AlexColon', 'alex_colon'].forEach(id => {
    const f = preflight({ ...blankInstall(), id, name: 'X', modules: PRESETS.solo });
    assert.ok(f.some(x => x[0] === 'bad'), 'should have rejected id: ' + id);
  });
});

ok('a valid id passes the id check', () => {
  const f = preflight({ ...blankInstall(), id: 'alex-colon-2', name: 'X', bizName: 'Y', ai: 'Lark', modules: PRESETS.solo });
  assert.ok(!f.some(x => x[0] === 'bad'), 'a complete install should have no blockers: ' + JSON.stringify(f));
});

ok('settings switched off is a blocker', () => {
  const f = preflight({ ...blankInstall(), id: 'x', name: 'X', modules: ['dashboard'] });
  assert.ok(f.some(x => x[0] === 'bad' && /Settings is off/.test(x[1])));
});

ok('contracts and pcs each raise the unverified-offsets warning', () => {
  const base = { ...blankInstall(), id: 'x', name: 'X', bizName: 'Y', ai: 'Z' };
  const c = preflight({ ...base, modules: ['settings', 'contracts'] });
  assert.ok(c.some(x => x[0] === 'warn' && /jurisdiction-specific/.test(x[1])));
  const p = preflight({ ...base, modules: ['settings', 'pcs'] });
  assert.ok(p.some(x => x[0] === 'warn' && /move-specific/.test(x[1])));
});

ok('a complete install has no blockers, and still warns about contracts', () => {
  /* The first version of this asserted exactly one 'ok' and failed, because
     PRESETS.solo includes contracts and contracts always warns about
     jurisdiction-specific offsets. The code was right and the assertion was
     wrong. Keeping the warning is the point: the offsets really are unverified,
     and a preflight that goes quiet once an install "looks finished" is a
     preflight nobody reads. */
  const f = preflight({
    ...blankInstall(), id: 'alexcolon', name: 'Alexander Colón', bizName: 'At Home Wichita Real Estate',
    ai: 'Lark', modules: PRESETS.solo,
  });
  assert.ok(!f.some(x => x[0] === 'bad'), 'no blockers expected: ' + JSON.stringify(f));
  assert.ok(f.some(x => x[0] === 'warn' && /jurisdiction-specific/.test(x[1])),
    'contracts is in the solo preset, so its offsets warning must still fire');
});

ok('an install with no date-driven module is fully clean', () => {
  const f = preflight({
    ...blankInstall(), id: 'x', name: 'X', bizName: 'Y', ai: 'Z',
    modules: ['dashboard', 'pipeline', 'contacts', 'settings'],
  });
  assert.equal(f.length, 1);
  assert.equal(f[0][0], 'ok');
});

/* ------------------------------------------------------------------ secrets */

ok('no secret key is ever produced by diffEnv', () => {
  const x = {
    ...blankInstall(), id: 'x', name: 'X', bizName: 'Y', ai: 'Z',
    /* deliberately hostile: pretend somebody stuffed a key onto the record */
    ANTHROPIC_API_KEY: 'sk-ant-should-never-appear',
    supabaseKey: 'should-never-appear',
  };
  const text = envText(x);
  SECRET_KEYS.forEach(k => {
    assert.ok(!text.includes(k[0] + '='), 'diffEnv emitted a secret variable: ' + k[0]);
  });
  assert.ok(!/sk-ant-/.test(text), 'a stray key on the record leaked into the output');
  assert.ok(!/should-never-appear/.test(text), 'an unknown field leaked into the output');
});

ok('the secret list names the service role key and never prefixes it VITE_', () => {
  const svc = SECRET_KEYS.find(k => k[0] === 'SUPABASE_SERVICE_ROLE_KEY');
  assert.ok(svc, 'the service role key must be listed so an install sheet is complete');
  SECRET_KEYS.forEach(k => {
    if (/SERVICE_ROLE/.test(k[0])) {
      assert.ok(!k[0].startsWith('VITE_'), 'a VITE_ prefix ships the service role key to the browser');
    }
  });
});

/* ------------------------------------------------------------------ runbook */

ok('the runbook puts the demo before the database', () => {
  const steps = runbook({ id: 'x' }).map(s => s[0].toLowerCase());
  const demo = steps.findIndex(s => s.includes('demo'));
  const db = steps.findIndex(s => s.includes('supabase'));
  assert.ok(demo >= 0 && db >= 0, 'both steps must exist');
  assert.ok(demo < db, 'the demo is what changes the spec; doing it after the database means migrating data');
});

ok('the runbook names the install so it can be followed without guessing', () => {
  const s = runbook({ id: 'alexcolon' }).map(x => x[1]).join(' ');
  assert.ok(s.includes('alexcolon-crm'), 'the repo step should name the actual repo');
});

/* --------------------------------------------------------------- the client */

ok("Alex's real configuration produces the expected variables", () => {
  const alex = {
    ...blankInstall(),
    id: 'alexcolon', name: 'Alexander Colón', short: 'colónWICHITA', ai: 'Lark',
    product: 'Alexander Colón Business Suite', title: 'Alexander Colón — Business Suite',
    bizName: 'At Home Wichita Real Estate', license: '00252387',
    email: 'alex@athomewichita.com', phone: '(813) 613-8822',
    address: '6530 E. 13th St. N.\nWichita, KS 67206',
    colors: { ...blankInstall().colors, cobalt: '#172A3A', ink: '#292D32', gold: '#B89A67', indigo: '#22475E' },
    modules: PRESETS.solo,
  };
  const e = envOf(alex);
  assert.equal(e.VITE_BRAND_ID, 'alexcolon');
  assert.equal(e.VITE_AI_NAME, 'Lark', 'the site assistant and the CRM assistant share a name on purpose');
  assert.equal(e.VITE_BIZ_NAME, 'At Home Wichita Real Estate',
    'the business name is the BROKERAGE, not the agent: Kansas requires the supervising broker on advertising');
  assert.equal(e.VITE_BIZ_LICENSE, '00252387');
  assert.equal(e.VITE_COLOR_GOLD, '#B89A67', "his own hex from the onboarding form, not the template's");
  assert.ok(e.VITE_MODULES.includes('settings'));
  assert.ok(!e.VITE_MODULES.includes('huddle'), 'one agent does not hold a huddle');
  assert.ok(!e.VITE_MODULES.includes('pcs'), 'pcs stays off until its offsets are verified');
  /* the accent has broken in three separate places on this account already */
  assert.ok(e.VITE_BRAND_NAME.includes('ó'), 'the accent on Colón must survive');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
