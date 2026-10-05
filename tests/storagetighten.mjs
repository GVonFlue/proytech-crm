/* STORAGE-TIGHTEN-2026-10, READ AS TEXT — the half CI always runs.

   tests/storagerlsdb.mjs runs the migration on real Postgres (a tool: PGlite
   is not a dependency). This pins the parts of the files that make the
   boundary, so an edit that loosens one fails here on any machine:

     - every policy the tighten creates names its bucket; every WRITE policy
       on either bucket, and every receipts READ, carries the reference owner
       expression; the only policy without one is site-media's public read
     - nothing says `true`; receipts is forced private, site-media public
     - the drop loop covers both bucket names AND unscoped policies, and it
       runs before anything is created; the file checks itself and refuses
     - the rollback says it reopens the holes, and does NOT make receipts
       public again
     - RLS-AUDIT.sql sweeps storage.objects and raises on unscoped policies
     - no app change is needed: receipts are only touched from lib/supabase,
       and only owner screens call those helpers

   Seen red: dropping `or p.expr !~ 'bucket_id'` from the drop loop;
   removing the owner expression from storage_site_media_owner_insert. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const code = s => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const flat = s => code(s).replace(/\s+/g, ' ');
const T = read('STORAGE-TIGHTEN-2026-10.sql'), RB = read('STORAGE-TIGHTEN-2026-10-ROLLBACK.sql'), AUDIT = read('RLS-AUDIT.sql');
const TF = flat(T), RF = flat(RB);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const OWNER = '(public.no_users() or (public.crm_active() and public.is_owner()))';
const created = [...TF.matchAll(/create policy (\w+) on storage\.objects for (\w+) to ([\w, ]+?) (using|with check) (.*?);/g)]
  .map(m => ({ name: m[1], cmd: m[2], roles: m[3], body: m[5] }));
ok('eight policies created', created.length === 8, created.map(p => p.name).join(', '));
for (const p of created) {
  ok(`${p.name}: names its bucket`, /bucket_id = '(receipts|site-media)'/.test(p.body), p.body);
  const needsOwner = p.name !== 'storage_site_media_read';
  if (needsOwner) ok(`${p.name}: owner expression, on every clause`, p.body.split(OWNER).length - 1 === (p.cmd === 'update' ? 2 : 1), p.body);
  else ok(`${p.name}: public read, select only, anon and authenticated`, p.cmd === 'select' && /anon, authenticated/.test(p.roles) && !p.body.includes('is_owner'), JSON.stringify(p));
}
ok('receipts has select, insert, update, delete', ['select', 'insert', 'update', 'delete'].every(c => created.some(p => p.name.startsWith('storage_receipts') && p.cmd === c)));
ok('site-media writes: insert, update, delete', ['insert', 'update', 'delete'].every(c => created.some(p => p.name.startsWith('storage_site_media_owner') && p.cmd === c)));
ok('nothing says (true)', !/(using|with check) \(\s*true\s*\)/i.test(TF) && !/(using|with check) \(\s*true\s*\)/i.test(code(RB).replace(/\s+/g, ' ')));
ok('receipts forced private, site-media public', /update storage\.buckets set public = false where id = 'receipts'/.test(TF) && /update storage\.buckets set public = true where id = 'site-media'/.test(TF));
const loop = TF.slice(TF.indexOf('for p in'), TF.indexOf('end loop'));
ok('the drop loop covers receipts, site-media AND unscoped policies', /'''receipts'''/.test(loop) && /'''site-media'''/.test(loop) && /!~ 'bucket_id'/.test(loop), loop);
ok('  and runs before anything is created', TF.indexOf('drop policy %I on storage.objects') < TF.indexOf('create policy'));
ok('the file checks itself and raises', /STORAGE-TIGHTEN check failed/.test(T) && /unscoped storage policies remain/.test(T));
ok('one transaction', /^\s*begin;/m.test(code(T)) && /^\s*commit;/m.test(code(T)));

ok('rollback: says it RE-OPENS the holes', /RE-OPENS THE HOLES/.test(RB));
ok('rollback: never makes receipts public again', !/update storage\.buckets set public = true where id = 'receipts'/.test(RF));
ok('rollback: drops the eight before recreating', created.every(p => RF.includes(`drop policy if exists ${p.name} on storage.objects`)));

ok('RLS-AUDIT sweeps storage.objects', /to_regclass\('storage\.objects'\)/.test(AUDIT) && /storage policies that are `true` or not scoped to a bucket/.test(AUDIT));
ok('  and is skipped, said so, where there is no storage schema', /storage sweep was skipped/.test(AUDIT));

/* the app half: only lib/supabase touches the receipts bucket, and only the
   owner's Money/Books code calls it */
const lib = read('src/lib/supabase.js');
const app = read('src/App.jsx');
ok('only lib/supabase names the receipts bucket', (lib.match(/from\('receipts'\)/g) || []).length === 4 && !/from\('receipts'\)/.test(app));
ok('money and books stay owner-only tabs', /OWNER_ONLY_TABS=new Set\(\[[^\]]*'money'/.test(app));

console.log(`\nstoragetighten: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
