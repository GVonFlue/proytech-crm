/* The seven client-meeting fields — the ones that accumulate on a person and
   get read back months later before the next call.

   Two claims are worth a suite of their own, because neither is visible in a
   green build:

     1. THEY SURVIVE A RELOAD. normLog rebuilds its object key by key, so a
        field the extraction writes and normLog does not name saves fine and
        disappears on refresh. That exact bug shipped here once already
        (BUILD-NOTES-v36, settings.recurring).
     2. THE DRAFT OFFERED FOR PUBLISHING CARRIES ONLY THE SHAREABLE FOUR. The
        candid three — objections, budget, the temperature read — must not be
        in the text the publish box opens with, because that box exists to put
        a line somewhere a rep can read it.

   Pure logic plus the API handler against a stubbed model. No DOM.           */
process.env.SUPABASE_URL='https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY='k';
process.env.ANTHROPIC_API_KEY='test-key';

import {normLog,emptyExtraction,shareSeed,meetingLogsOf,SHAREABLE_FIELDS,OWNER_ONLY_FIELDS}
  from '../src/lib/meetinglog.js';

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};

/* One fully-populated client meeting. The candid strings are deliberately
   distinctive so a leak into the draft is a substring match, not a judgement
   call about wording. */
const CANDID={objection:'thinks the price is high for what it is',
  detail:'went quiet for a while after the number',
  budget:'4000 dollars',paying:'900 a month to Boomtown',budgetNote:'she volunteered this',
  why:'she stopped asking questions after the price came up'};
const RAW={id:'ml1',kind:'client',leadId:'l1',meetingDate:'2026-08-14',source:'Notes',
  attendees:['Garrett','Rita'],transcript:'SECRET TRANSCRIPT',createdAt:'2026-08-14T18:00:00Z',createdBy:'Garrett',
  shared:{text:'',at:'',by:'',activityId:''},
  extraction:{...emptyExtraction(),title:'Alvarez discovery',headline:'She wants the CRM before listing season',
    summary:'Rita runs eleven agents.',
    wants:[{want:'stop rekeying listings by hand',quote:'I retype everything twice'},
           {want:'one place her agents can see follow-ups',quote:''}],
    objections:[{objection:CANDID.objection,detail:CANDID.detail}],
    budget:{stated:CANDID.budget,paying:CANDID.paying,note:CANDID.budgetNote},
    commitments:[{side:'us',what:'send the quote',due:'2026-08-22'},
                 {side:'client',what:'loop in her broker',due:''}],
    people:[{name:'Dana Ruiz',role:'office manager',influence:'decides'}],
    temperature:{read:'cool',why:CANDID.why},
    nextStep:{what:'demo the pipeline board',who:'Garrett',when:'2026-08-24'}}};

console.log('\nthe seven survive a reload');
const n1=normLog(RAW);
const n2=normLog(JSON.parse(JSON.stringify(n1)));   // saved, read back
for(const f of [...SHAREABLE_FIELDS,...OWNER_ONLY_FIELDS]){
  ok(f+' is still there after a round trip',
     JSON.stringify(n2.extraction[f])===JSON.stringify(n1.extraction[f]),
     JSON.stringify(n2.extraction[f]));
}
ok('all seven are named, none silently dropped',
   SHAREABLE_FIELDS.length+OWNER_ONLY_FIELDS.length===7);
ok('the quote survives too', n2.extraction.wants[0].quote==='I retype everything twice');
ok('the due date on a commitment survives', n2.extraction.commitments[0].due==='2026-08-22');

console.log('\nan old log, written before these fields existed, still reads');
const old=normLog({id:'ml0',kind:'client',leadId:'l1',extraction:{headline:'H',summary:'S'}});
ok('wants is an array, not undefined', Array.isArray(old.extraction.wants));
ok('budget is an object with empty strings',
   old.extraction.budget&&old.extraction.budget.stated==='', JSON.stringify(old.extraction.budget));
ok('temperature has no read, rather than a made-up one',
   old.extraction.temperature.read==='', JSON.stringify(old.extraction.temperature));
ok('nextStep is readable without guarding', old.extraction.nextStep.what==='');

console.log('\njunk in the row cannot crash a screen');
const junk=normLog({id:'x',kind:'client',extraction:{wants:'not an array',commitments:null,
  people:{name:'nope'},budget:'4k',temperature:['cool'],nextStep:42,objections:undefined}});
ok('a string where an array belongs -> []', Array.isArray(junk.extraction.wants)&&!junk.extraction.wants.length);
ok('null commitments -> []', Array.isArray(junk.extraction.commitments));
ok('an object where an array belongs -> []', Array.isArray(junk.extraction.people));
ok('a string where an object belongs -> empty object',
   junk.extraction.budget.stated===''&&junk.extraction.budget.paying==='');
ok('an array where an object belongs -> empty object', junk.extraction.temperature.read==='');
ok('a number where an object belongs -> empty object', junk.extraction.nextStep.what==='');

console.log('\nthe publish draft carries the shareable four');
const seed=shareSeed(n1);
ok('what they want', /stop rekeying listings by hand/.test(seed), seed);
ok('the second want too', /one place her agents can see follow-ups/.test(seed));
ok('what we committed to', /send the quote/.test(seed));
ok('with its due date', /2026-08-22/.test(seed));
ok('what they committed to', /loop in her broker/.test(seed));
ok('who else is involved', /Dana Ruiz/.test(seed));
ok('and that she decides', /decides/.test(seed));
ok('what happens next', /demo the pipeline board/.test(seed));

console.log('\nand none of the candid three');
ok('not the objection', !seed.includes(CANDID.objection), seed);
ok('not what they went quiet about', !seed.includes(CANDID.detail));
ok('not the budget they stated', !seed.includes(CANDID.budget)&&!/4000/.test(seed), seed);
ok('not what they pay today', !seed.includes(CANDID.paying)&&!/Boomtown/.test(seed));
ok('not the note about the budget', !seed.includes(CANDID.budgetNote));
ok('not the read on the meeting', !/cool|Cooling/i.test(seed), seed);
ok('not the evidence for that read', !seed.includes(CANDID.why));

console.log('\nthe two sides of a commitment do not read the same');
const ours=seed.split('\n').find(l=>/send the quote/.test(l))||'';
const theirs=seed.split('\n').find(l=>/loop in her broker/.test(l))||'';
ok('ours says we said we would', /^We said we would/.test(ours), ours);
ok('theirs says they said they would', /^They said they would/.test(theirs), theirs);
ok('they are different lines', ours!==theirs&&!!ours&&!!theirs);
{ /* an unlabelled side is ours, not theirs: a commitment of ours that goes
     unrecorded is a worse failure than one attributed to us in error */
  const s2=shareSeed(normLog({kind:'client',extraction:{commitments:[{side:'',what:'call the title company'}]}}));
  ok('an unlabelled commitment lands on us', /^We said we would: call the title company/.test(s2), s2); }

console.log('\na log with nothing shareable falls back to the headline');
const bare=normLog({id:'b',kind:'client',extraction:{headline:'She wants it before listing season',
  objections:[{objection:CANDID.objection,detail:''}],temperature:{read:'cool',why:CANDID.why}}});
const bareSeed=shareSeed(bare);
ok('the headline is offered', bareSeed==='She wants it before listing season', bareSeed);
ok('the objection is still not in it', !bareSeed.includes(CANDID.objection));
ok('an empty log seeds nothing at all', shareSeed(normLog({kind:'client'}))==='');

console.log('\nthe derived row on the lead carries the structured block');
const lead={id:'l1',name:'Rita Alvarez'};
const rows=meetingLogsOf(lead,[n1]);
ok('one row for this lead', rows.length===1);
const r=rows[0];
ok('it carries wants', r.wants.length===2, JSON.stringify(r.wants));
ok('it carries commitments with sides', r.commitments.length===2&&r.commitments[0].side==='us');
ok('it carries people', r.people[0].name==='Dana Ruiz');
ok('it carries nextStep', r.nextStep.what==='demo the pipeline board');
/* the candid three DO belong here: this row is rendered from meeting_logs,
   which no rep can read a row of, so it is the owner reading their own lead */
ok('it carries objections, for the owner', r.objections[0].objection===CANDID.objection);
ok('it carries budget, for the owner', r.budget.stated===CANDID.budget);
ok('it carries the temperature read, for the owner', r.temperature.read==='cool');
ok('and STILL no transcript', !JSON.stringify(r).includes('SECRET TRANSCRIPT'), JSON.stringify(r).slice(0,120));

console.log('\nan internal meeting has all seven, empty');
const internal=normLog({id:'i1',kind:'internal',extraction:{headline:'Pricing needs to move'}});
ok('no wants', internal.extraction.wants.length===0);
ok('no read on anybody', internal.extraction.temperature.read==='');
ok('it derives onto no lead', meetingLogsOf(lead,[internal]).length===0);

/* ---- the endpoint itself, against a stubbed model ------------------------
   The coercion in api/meeting-log.js is the only thing standing between a
   model that returned "hot" for a temperature and a screen that renders it.
   Imported dynamically: _guard.js reads SUPABASE_URL at module scope, and a
   static import would be hoisted above the env assignments at the top of this
   file, leaving the limiter unconfigured and every test passing for the wrong
   reason. */
const {default:handler}=await import('../api/meeting-log.js');

let sent=null;
globalThis.fetch=async(url,opts={})=>{
  const u=String(url);
  if(u.includes('/auth/v1/user')) return {ok:true,json:async()=>({id:'u1'})};
  if(u.includes('api_hits')) return {ok:true,text:async()=>'[]'};
  if(u.includes('api.anthropic.com')){
    sent=JSON.parse(opts.body);
    return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify(MODEL_OUT)}],usage:{}})};
  }
  return {ok:false,text:async()=>'',json:async()=>({})};
};
/* deliberately full of the things a model gets wrong: a side it invented, an
   influence that is not one of the three, a temperature that is not one of the
   three, a date that is words, and more wants than the cap allows */
const MODEL_OUT={title:'Alvarez discovery',headline:'H',summary:'S',themes:[],decisions:[],
  actions:[{title:'Send the quote',owner:'Garrett',why:'w',due:'',revenue:5,urgency:4,effort:2,tier:'now'}],
  numbers:[],risks:[],openItems:[],loopReview:[],
  wants:Array.from({length:9},(_,i)=>({want:'want '+i,quote:''})),
  objections:[{objection:'price',detail:'went quiet'}],
  budget:{stated:'4k',paying:'900/mo',note:''},
  commitments:[{side:'them',what:'send the quote',due:'next tuesday'},
               {side:'client',what:'loop in the broker',due:'2026-08-22'},
               {what:'no side at all'}],
  people:[{name:'Dana Ruiz',role:'office manager',influence:'boss'},{role:'no name'}],
  temperature:{read:'hot',why:'made it up'},
  nextStep:{what:'demo',who:'Garrett',when:'after the holidays'}};

const mkRes=()=>{const r={code:0,body:null,headers:{}};
  r.status=c=>{r.code=c;return r;};r.json=b=>{r.body=b;return r;};
  r.setHeader=(k,v)=>{r.headers[k]=v;};r.end=()=>r;return r;};
const call=async body=>{const res=mkRes();
  await handler({method:'POST',headers:{'x-forwarded-for':'8.8.8.8',authorization:'Bearer good'},
    socket:{remoteAddress:'8.8.8.8'},body},res);
  return res;};

console.log('\nthe endpoint coerces whatever the model returns');
const res=await call({transcript:'t'.repeat(1200),kind:'client',leadName:'Rita',
  brand:'ProyTech',team:['Garrett','Logan'],meetingDate:'2026-08-14'});
ok('it answered ok', res.body&&res.body.ok===true, JSON.stringify(res.body).slice(0,200));
const ex=(res.body&&res.body.extraction)||{};
ok('wants are capped at six', ex.wants.length===6, String(ex.wants&&ex.wants.length));
ok('an invented side becomes ours', ex.commitments[0].side==='us', JSON.stringify(ex.commitments[0]));
ok('a stated side is kept', ex.commitments[1].side==='client');
ok('a missing side becomes ours', ex.commitments[2].side==='us');
ok('a date in words is dropped from a commitment', ex.commitments[0].due==='', ex.commitments[0].due);
ok('a real date is kept', ex.commitments[1].due==='2026-08-22');
ok('an invented influence becomes unknown', ex.people[0].influence==='unknown', ex.people[0].influence);
ok('a person with no name is dropped', ex.people.length===1, JSON.stringify(ex.people));
ok('an invented temperature becomes no read at all', ex.temperature.read==='', JSON.stringify(ex.temperature));
ok('but its reasoning is kept to read', ex.temperature.why==='made it up');
ok('nextStep keeps words where a date would not fit', ex.nextStep.when==='after the holidays');
ok('budget comes through', ex.budget.stated==='4k'&&ex.budget.paying==='900/mo');
ok('the objection comes through', ex.objections[0].objection==='price');

console.log('\nthe client prompt asks for the seven, and says who may read which');
const sys=sent&&sent.system||'';
for(const f of [...SHAREABLE_FIELDS,...OWNER_ONLY_FIELDS]) ok('the prompt names '+f, sys.includes('"'+f+'"'));
ok('it says which may be offered to a rep', /may be offered to the rep/.test(sys));
ok('and which are the owner\u2019s alone', /for the owner alone/.test(sys));

console.log('\nan internal meeting is not asked for them');
sent=null;
const inter=await call({transcript:'t'.repeat(1200),kind:'internal',brand:'ProyTech',team:['Garrett','Logan']});
ok('no client field block in the internal prompt', !/may be offered to the rep/.test(sent.system||''));
{ /* the model still returned all seven — the stub returns the same body for
     both kinds. They are kept rather than dropped, because an internal log
     reads them through the same empty-or-not code path as a client one. */
  const ie=(inter.body&&inter.body.extraction)||{};
  ok('the seven are still coerced, not left undefined',
     Array.isArray(ie.wants)&&!!ie.budget&&!!ie.temperature&&!!ie.nextStep,
     JSON.stringify({w:ie.wants&&ie.wants.length,b:!!ie.budget})); }

console.log('\nthe transcript ceiling moved to 200k');
const long=await call({transcript:'t'.repeat(200001),kind:'client'});
ok('200,001 characters is refused', long.body&&long.body.ok===false&&/too long/.test(long.body.error),
   JSON.stringify(long.body).slice(0,120));
const big=await call({transcript:'t'.repeat(199000),kind:'client'});
ok('199,000 characters is read', big.body&&big.body.ok===true, JSON.stringify(big.body).slice(0,140));
ok('the guard did not bounce it first', big.code!==413, 'code '+big.code);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
