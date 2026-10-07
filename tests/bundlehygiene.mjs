/* EVERY BUNDLE A SUITE WRITES CLEANS UP AFTER ITSELF.
   ============================================================================

   Suites that bundle with esbuild write the bundle into tests/ to import it.
   With fixed names (tests/.bproj.mjs) they collided and were never deleted:
   174 files, 221MB, by Oct 2026. tests/tmpbundle.mjs gives each one a
   per-process name and deletes it on exit; this proves every suite uses it:

     - no suite names a .bNAME.mjs / .bNAME.jsx file by a fixed literal
     - every suite that calls bundleName imports it from ./tmpbundle.mjs
     - the helper itself deletes on exit, error and signal (a child process
       that crashes leaves nothing behind)

   tests/all.mjs then fails any full run that leaves a bundle behind.      */
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 400) : ''))); };

const files = fs.readdirSync(HERE).filter(f => f.endsWith('.mjs') && !f.startsWith('.') && f !== 'tmpbundle.mjs' && f !== 'bundlehygiene.mjs');
const src = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(HERE, f), 'utf8')]));

console.log('\nno fixed bundle names');
{
  const fixed = files.filter(f => /['"`][^'"`\n]*\.b[A-Za-z0-9_]+(-entry)?\.(mjs|jsx)/.test(src[f]));
  ok('no suite writes or imports a fixed tests/.b*.mjs or .jsx name', !fixed.length, fixed.join(', '));
  /* invoicebalance.mjs built 'tests/.bib' + random + '.mjs' and never deleted
     it: no literal for the check above to find. A '.b…' string that is
     concatenated onto is a hand-made bundle name too. */
  const built = files.filter(f => /['"`](?:tests\/)?\.b[A-Za-z0-9_-]*['"`]\s*\+/.test(src[f]));
  ok('no suite builds a bundle name by hand (\'tests/.bX\' + …)', !built.length, built.join(', '));
  const users = files.filter(f => /\bbundleName\(/.test(src[f]));
  ok(`the ${users.length} suites that bundle all take the name from ./tmpbundle.mjs`, users.length > 50 && users.every(f => /import \{ bundleName \} from '\.\/tmpbundle\.mjs'/.test(src[f])),
    users.filter(f => !/from '\.\/tmpbundle\.mjs'/.test(src[f])).join(', '));
}

console.log('\nthe helper cleans up, however the process ends');
{
  const probe = how => spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs'; import { bundleName } from ${JSON.stringify(path.join(HERE, 'tmpbundle.mjs'))};
    const n = bundleName('probe'); fs.writeFileSync(${JSON.stringify(HERE)} + '/' + n, 'export default 1');
    console.log(n);
    ${how}`], { encoding: 'utf8' });
  for (const [label, how] of [['a normal exit', ''], ['process.exit(3)', 'process.exit(3);'], ['an uncaught error', 'throw new Error("boom");'], ['an unhandled rejection', 'Promise.reject(new Error("boom"));'], ['SIGTERM', 'process.kill(process.pid, "SIGTERM"); setTimeout(()=>{}, 2000);']]) {
    const r = probe(how);
    const name = (r.stdout || '').trim().split('\n')[0];
    ok(`${label}: the bundle is gone`, /^\.bprobe-\d+-[a-z0-9]+\.mjs$/.test(name) && !fs.existsSync(path.join(HERE, name)), JSON.stringify({ name, status: r.status, signal: r.signal, err: (r.stderr || '').slice(0, 200) }));
  }
  const a = spawnSync(process.execPath, ['--input-type=module', '-e', `import { bundleName } from ${JSON.stringify(path.join(HERE, 'tmpbundle.mjs'))}; console.log(bundleName('x'))`], { encoding: 'utf8' }).stdout.trim();
  const b = spawnSync(process.execPath, ['--input-type=module', '-e', `import { bundleName } from ${JSON.stringify(path.join(HERE, 'tmpbundle.mjs'))}; console.log(bundleName('x'))`], { encoding: 'utf8' }).stdout.trim();
  ok('two processes never share a name', a && b && a !== b, a + ' / ' + b);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
