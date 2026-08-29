import esbuild from 'esbuild';
const out = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', platform:'neutral', external:['lucide-react','react'], define:{'import.meta.env':'{}'} });
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile('tests/.ms.mjs', out.outputFiles[0].text);
const { hasRealDeal, countsAsBusiness } = await import('./.ms.mjs?v='+Date.now());

let p=0,f=0; const ok=(n,c,x='')=>{c?(p++,console.log('  ok  '+n)):(f++,console.log('  FAIL '+n+(x?' — '+x:'')));};

const biz={id:'b1',name:'Ordinary Lead',stage:'new',dealValue:2000,deals:[{id:'d',setup:2000}]};
const connector={id:'r1',name:'Pure Connector',isRelationship:true,relTier:'a'};
/* the ONE record the measure found: a relationship, stage new, one open deal */
const turner={id:'r2',name:'…urner',isRelationship:true,stage:'new',dealValue:1499,
  deals:[{id:'d1',label:'Deal',setup:1499,website:'',integration:'',extras:[]}]};

ok('a business lead always counts',            countsAsBusiness(biz));
ok('a business lead with no money still counts', countsAsBusiness({id:'b2',name:'Cold'}));
ok('a pure connector never counts',            !countsAsBusiness(connector));
ok('the $1,499 record DOES count',             countsAsBusiness(turner));
ok('and it counts because of the deal',        hasRealDeal(turner));
ok('a connector with no deal has none',        !hasRealDeal(connector));

/* every route into "real money", matching the lead view's Deal panel test */
ok('a retainer alone counts',   hasRealDeal({isRelationship:true,retainer:750}));
ok('a payment alone counts',    hasRealDeal({isRelationship:true,payments:[{id:'p',amount:500,date:'2026-08-01'}]}));
ok('a closed deal alone counts',hasRealDeal({isRelationship:true,closedDeals:[{label:'x',amount:100}]}));
ok('an empty deal row does NOT',!hasRealDeal({isRelationship:true,deals:[{id:'d',setup:'',website:'',integration:'',extras:[]}]}));
ok('a zero retainer does NOT',  !hasRealDeal({isRelationship:true,retainer:0}));
ok('null is safe',              !countsAsBusiness(null)&&!hasRealDeal(null));

/* the property that matters: the flag alone never decides money */
const flipped={...biz,isRelationship:true};
ok('flipping a lead with a live deal keeps it in the money set', countsAsBusiness(flipped));
const stripped={...connector,dealValue:0,deals:[]};
ok('and a connector stays out however it is filed',             !countsAsBusiness(stripped));

/* what the delta actually is, computed the way useMetrics would */
const before=[biz], after=[biz,turner];
const openValue=ls=>ls.reduce((a,l)=>a+(l.dealValue||0),0);
ok('the open pipeline delta is exactly 1499', openValue(after)-openValue(before)===1499);
ok('the weighted delta at 10% is 149.9',
   Math.round((openValue(after)-openValue(before))*0.10*10)/10===149.9);

await unlink('tests/.ms.mjs').catch(()=>{});
console.log(`\n${p} passed, ${f} failed`); process.exit(f?1:0);
