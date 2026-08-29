import { buildGraph, buildPayload } from '../src/lib/jarvis.js';
let p=0,f=0; const ok=(n,c,x='')=>{c?(p++,console.log('  ok  '+n)):(f++,console.log('  FAIL '+n+(x?' — '+x:'')));};

const leads=[
  {id:'b',name:'Brandon Tammany',company:'Tammany Group',isRelationship:true,relTier:'a',
   pastSponsor:true,sponsorTier:'Gold',sponsorAmount:2500,labels:['BNI','Windsurge'],
   keyDates:[{label:'Birthday',date:'2026-11-04'}],
   referralsOut:[{id:'r1',leadId:'x1',name:'',note:'intro to roofing',sentAt:'2026-05-02'}]},
  {id:'x1',name:'Dana Reyes',company:'Westlake',introducedBy:'b'},
  {id:'x2',name:'Marcus Webb',company:'Webb Auto',introducedBy:'b'},
  {id:'x3',name:'',company:'Kleen Stripe',introducedBy:'b'},
  {id:'x4',name:'Priya Raman',introducedBy:'b'},
  {id:'x5',name:'Sam Ortiz',introducedBy:'b'},
  {id:'o1',name:'Solo Lead',company:'Nobody Inc'},
  {id:'self',name:'Loop',introducedBy:'self'},
  {id:'dang',name:'Dangling',introducedBy:'ghost-id'},
];

const g=buildGraph(leads);
const brandon=g.introducers.find(n=>n.id==='b');
ok('Brandon appears as an introducer', !!brandon);
ok('all five of his introductions are there', brandon.introduced.length===5, JSON.stringify(brandon.introduced));
ok('and they are NAMED, not just ids', brandon.introducedNames.includes('Dana Reyes — Westlake'), brandon.introducedNames.join(' | '));
ok('a nameless one still reads as its business', brandon.introducedNames.includes('Kleen Stripe'), brandon.introducedNames.join(' | '));
ok('his relationship standing rides along', brandon.rel===1 && brandon.tier==='a');
ok('someone who introduced nobody is absent', !g.introducers.some(n=>n.id==='o1'));
ok('a self-reference is not an introduction', !g.introducers.some(n=>n.id==='self'));
ok('a dangling introducer is dropped', !g.introducers.some(n=>n.id==='ghost-id'));
ok('busiest connector sorts first', g.introducers[0].id==='b');

const sent=g.sentTo.find(x=>x.id==='b');
ok('who the owner sent TO him is included', !!sent && sent.to.length===1);
ok('a referral resolves to the live record name', sent.to[0].name==='Dana Reyes — Westlake', JSON.stringify(sent.to[0]));

const { payload } = buildPayload({ leads, question:'who should Brandon Tammany meet', me:'Garrett' });
ok('graph reaches the payload', !!payload.graph && payload.graph.introducers.length>0);
ok('Brandon is hydrated by name match', payload.detail.some(d=>d.name==='Brandon Tammany'));
const bd=payload.detail.find(d=>d.name==='Brandon Tammany');
ok('detail says he is a relationship', bd.isRelationship===true && bd.relTier==='a');
ok('detail carries his labels', (bd.labels||[]).includes('BNI'), JSON.stringify(bd.labels));
ok('detail carries sponsorship', bd.pastSponsor===true && bd.sponsorTier==='Gold');
ok('detail carries key dates', (bd.keyDates||[]).some(k=>/Birthday/.test(k.what)), JSON.stringify(bd.keyDates));
ok('index flags him as a sponsor', payload.index.find(l=>l.id==='b').spon===1);
ok('index carries his tags', (payload.index.find(l=>l.id==='b').tags||[]).includes('BNI'));

// a rep must not see sponsor money
const rp = buildPayload({ leads, question:'brandon', me:'Rep', rep:true }).payload;
const rb = rp.detail.find(d=>d.name==='Brandon Tammany');
ok('a rep sees the sponsorship flag', rb.pastSponsor===true);
ok('a rep does NOT see the sponsor amount', rb.sponsorAmount===undefined, JSON.stringify(rb.sponsorAmount));

console.log(`\n${p} passed, ${f} failed`); process.exit(f?1:0);
