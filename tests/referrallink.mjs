import esbuild from 'esbuild';
/* lead.js imports './brand' extensionless, so it needs the bundler the app
   uses rather than a bare node import. */
const out = await esbuild.build({
  entryPoints: ['src/lib/lead.js'], bundle: true, write: false, format: 'esm',
  platform: 'neutral', external: ['lucide-react','react'], define: { 'import.meta.env': '{}' },
});
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile('tests/.rl.mjs', out.outputFiles[0].text);
const { personLabel, mkReferral, referralsOut, referralTarget } = await import('./.rl.mjs?v=' + Date.now());
let p=0,f=0; const ok=(n,c,x='')=>{c?(p++,console.log('  ok  '+n)):(f++,console.log('  FAIL '+n+(x?' — '+x:'')));};

const leads=[
  {id:'l1',name:'Dana Reyes',company:'Westlake'},
  {id:'l2',name:'',company:'Kleen Stripe'},
  {id:'l3',name:'Marcus Webb'},
];
/* the exact matcher from ReferralAdd */
const norm=v=>String(v||'').trim().toLowerCase();
const match=who=>leads.find(l=>{ const q=norm(who); if(!q) return false;
  return norm(personLabel(l))===q||norm(l.name)===q||norm(l.company)===q; });

ok('picking the label off the datalist links', match('Dana Reyes — Westlake')?.id==='l1');
ok('typing just the name still links',        match('Dana Reyes')?.id==='l1');
ok('typing just the business still links',    match('Westlake')?.id==='l1');
ok('a business-only record links by label',   match('Kleen Stripe')?.id==='l2');
ok('a name-only record links',                match('Marcus Webb')?.id==='l3');
ok('case does not matter',                    match('dana reyes — westlake')?.id==='l1');
ok('a stranger does not link',                match('Someone Else')===undefined);
ok('empty does not link',                     match('   ')===undefined);

/* and the entry that gets stored */
const m=match('Dana Reyes — Westlake');
const r=mkReferral({leadId:m?m.id:'',name:m?(m.name||m.company):'Dana Reyes — Westlake',note:'intro',sentAt:'2026-08-29'});
ok('stores the link, not a mangled name', r.leadId==='l1'&&r.name==='Dana Reyes', JSON.stringify(r));
ok('unlinked entries still work', mkReferral({leadId:'',name:'A Stranger',sentAt:'2026-08-29'}).leadId==='');
ok('a linked entry resolves to the live record', referralTarget(r,leads).name==='Dana Reyes');
ok('a deleted target is flagged, not lost', referralTarget({leadId:'gone',name:'Old Name'},leads).gone===true);
ok('referralsOut reads the array', referralsOut({referralsOut:[r]}).length===1);
ok('and tolerates a missing one', referralsOut({}).length===0);

await unlink('tests/.rl.mjs').catch(()=>{});
console.log(`\n${p} passed, ${f} failed`); process.exit(f?1:0);
