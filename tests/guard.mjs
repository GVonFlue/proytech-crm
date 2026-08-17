/* The rate limiter guards your Anthropic bill, so it gets tested like it
   matters. Pure logic — no DOM, no React. */
/* env FIRST: _guard.js reads SUPABASE_URL/KEY at module scope, and ES imports
   are hoisted — setting them after a static import leaves the limiter
   unconfigured, where it correctly fails open and every test passes for the
   wrong reason. */
process.env.SUPABASE_URL='https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY='k';
const { guard, ipOf } = await import('../api/_guard.js');

let pass=0,fail=0;
const ok=(n,c,x='')=>{c?(pass++,console.log('  ok  '+n)):(fail++,console.log('  FAIL '+n+(x?' — '+x:'')));};

/* an in-memory stand-in for the Supabase counter table */
const store=[]; let reachable=true;
globalThis.fetch=async(url,opts={})=>{
  if(!reachable) throw new Error('supabase down');
  const u=String(url);
  if(u.includes('/auth/v1/user')){
    const tok=(opts.headers||{}).authorization||'';
    return /good/.test(tok)?{ok:true,json:async()=>({id:'u1'})}:{ok:false,json:async()=>({})};
  }
  if((opts.method||'GET')==='POST'&&u.includes('api_hits')){
    store.push(JSON.parse(opts.body)); return {ok:true,text:async()=>'[]'};
  }
  if(u.includes('api_hits')){
    const b=decodeURIComponent((u.match(/bucket=eq\.([^&]+)/)||[])[1]||'');
    const since=(u.match(/at=gte\.([^&]+)/)||[])[1];
    const cutoff=since?new Date(decodeURIComponent(since)).getTime():0;
    const rows=store.filter(r=>r.bucket===b&&new Date(r.at).getTime()>=cutoff);
    return {ok:true,text:async()=>JSON.stringify(rows.map(()=>({id:1})))};
  }
  return {ok:false,text:async()=>''};
};
const mkRes=()=>{const r={code:0,body:null,headers:{}};
  r.status=c=>{r.code=c;return r;}; r.json=b=>{r.body=b;return r;};
  r.setHeader=(k,v)=>{r.headers[k]=v;}; r.end=()=>r; return r;};
const mkReq=(ip,body,tok)=>({method:'POST',
  headers:{'x-forwarded-for':ip,...(tok?{authorization:'Bearer '+tok}:{})},
  socket:{remoteAddress:ip},body:body||{q:'hi'}});

console.log('\nper-IP limit');
store.length=0;
let blocked=0;
for(let i=0;i<8;i++){ const res=mkRes();
  const g=await guard(mkReq('1.1.1.1'),res,{name:'t1',perIp:5,perDay:9999});
  if(!g.ok) blocked++; }
ok('the first 5 get through, the rest are blocked', blocked===3, blocked+' blocked of 8');
{ const res=mkRes(); await guard(mkReq('1.1.1.1'),res,{name:'t1',perIp:5,perDay:9999});
  ok('a blocked caller gets 429', res.code===429, 'code '+res.code);
  ok('and a retry-after header', !!res.headers['retry-after'], JSON.stringify(res.headers)); }
{ const res=mkRes();
  const g=await guard(mkReq('2.2.2.2'),res,{name:'t1',perIp:5,perDay:9999});
  ok('a DIFFERENT ip is unaffected', g.ok===true, 'code '+res.code); }

console.log('\nglobal cap — the one that stops a botnet');
store.length=0;
let through=0;
/* every request from a unique IP, so per-IP never fires. Only the global cap
   can stop this, which is the entire point of having one. */
for(let i=0;i<12;i++){ const res=mkRes();
  const g=await guard(mkReq('10.0.0.'+i),res,{name:'t2',perIp:99,perDay:7});
  if(g.ok) through++; }
ok('a distributed flood is capped at the daily limit', through===7, through+' got through, cap was 7');
{ const res=mkRes(); await guard(mkReq('10.9.9.9'),res,{name:'t2',perIp:99,perDay:7});
  ok('it returns 429', res.code===429);
  ok('and does NOT leak where the ceiling is',
     !/\d/.test(String(res.body&&res.body.error||'')), JSON.stringify(res.body)); }

console.log('\noversized input');
{ const res=mkRes();
  const g=await guard(mkReq('3.3.3.3',{q:'x'.repeat(20000)}),res,{name:'t3',maxChars:5000});
  ok('a huge paste is rejected', g.ok===false&&res.code===413, 'code '+res.code);
  ok('before any counter is touched', !store.some(r=>r.bucket.includes('t3')),
     JSON.stringify(store.map(r=>r.bucket))); }

console.log('\nauth');
store.length=0;
{ const res=mkRes();
  const g=await guard(mkReq('4.4.4.4',null),res,{name:'t4',requireAuth:true});
  ok('no token is refused', g.ok===false&&res.code===401, 'code '+res.code); }
{ const res=mkRes();
  const g=await guard(mkReq('4.4.4.4',null,'bad'),res,{name:'t4',requireAuth:true});
  ok('a bad token is refused', g.ok===false&&res.code===401, 'code '+res.code); }
{ const res=mkRes();
  const g=await guard(mkReq('4.4.4.4',null,'good'),res,{name:'t4',requireAuth:true});
  ok('a valid token gets through', g.ok===true, 'code '+res.code);
  ok('and the user is returned', g.user&&g.user.id==='u1'); }

console.log('\nwhen Supabase is down');
store.length=0; reachable=false;
{ const res=mkRes();
  const g=await guard(mkReq('5.5.5.5'),res,{name:'t5',perIp:1,perDay:1});
  ok('it fails OPEN, not closed', g.ok===true,
     'a limiter that takes the site down when its own store hiccups is worse than the problem');
  ok('and does not block the caller', g.ok===true&&res.code===0, 'code '+res.code); }
reachable=true;

console.log('\nmethod and IP handling');
{ const res=mkRes();
  const g=await guard({method:'GET',headers:{},socket:{}},res,{name:'t6'});
  ok('GET is rejected', g.ok===false&&res.code===405, 'code '+res.code); }
ok('the first x-forwarded-for entry is used, not the last',
   ipOf({headers:{'x-forwarded-for':'9.9.9.9, 10.0.0.1, 172.16.0.1'},socket:{}})==='9.9.9.9',
   ipOf({headers:{'x-forwarded-for':'9.9.9.9, 10.0.0.1'},socket:{}}));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
