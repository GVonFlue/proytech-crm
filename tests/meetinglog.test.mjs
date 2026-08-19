import {normLog,sortLogs,openLoops,meetingDigest,pendingActions,taskFromAction,newMeetingLog,
  meetingLogsOf,internalLogs,clientLogs} from '../src/lib/meetinglog.js';
let f=0; const ok=(c,m)=>{if(!c){console.log('FAIL '+m);f++;}else console.log('ok   '+m)};

// normLog defends against a junk row
const n=normLog({id:'a',source:'Nope',extraction:{title:'T'}});
ok(n.source==='Other','bad source -> Other');
ok(Array.isArray(n.extraction.actions),'actions always array');
ok(n.extraction.loopReview.length===0,'missing loopReview -> []');

const mk=(id,date,openItems=[],loopReview=[],headline='h')=>normLog({id,meetingDate:date,extraction:{headline,openItems,loopReview}});

// sort: meeting date desc
const s=sortLogs([mk('a','2026-08-02'),mk('b','2026-08-16'),mk('c','2026-08-09')]);
ok(s.map(x=>x.id).join('')==='bca','sorted newest meeting date first');

// open loops accumulate and close
const logs=[
  mk('m1','2026-07-26',[{key:'llc',title:'Form the LLC'},{key:'domain',title:'Buy proytech.com'}]),
  mk('m2','2026-08-02',[{key:'llc',title:'Form the LLC'},{key:'domain',title:'Buy proytech.com'}],[]),
  mk('m3','2026-08-16',[{key:'llc',title:'Form the LLC'}],[{key:'domain',verdict:'closed',note:'bought'}]),
];
const L=openLoops(logs,new Date('2026-08-16T12:00:00'));
ok(L.length===1,'closed loop drops out');
ok(L[0].key==='llc','llc still open');
ok(L[0].seen===3,'seen across 3 meetings');
ok(L[0].weeks===3,'3 weeks old');

// abandoned also closes it out
const L2=openLoops([logs[0],normLog({id:'m9',meetingDate:'2026-08-16',extraction:{loopReview:[{key:'llc',verdict:'abandoned'},{key:'domain',verdict:'abandoned'}]}})],new Date('2026-08-16T12:00:00'));
ok(L2.length===0,'abandoned loops drop out');

// a loop that reopens after being closed
const L3=openLoops([mk('x1','2026-07-01',[{key:'k',title:'K'}]),mk('x2','2026-07-08',[],[{key:'k',verdict:'closed'}]),mk('x3','2026-07-15',[{key:'k',title:'K'}])],new Date('2026-07-15T12:00:00'));
ok(L3.length===1&&L3[0].status==='open','reopened loop comes back');

// digest excludes transcripts, includes loops
const withT=normLog({id:'t1',meetingDate:'2026-08-16',transcript:'SECRET PAY SPLIT TALK',extraction:{headline:'hh',decisions:[{decision:'D',status:'open'}],risks:['r'],openItems:[{key:'z',title:'Z'}]}});
const d=meetingDigest([withT]);
ok(!JSON.stringify(d).includes('SECRET'),'digest never carries the transcript');
ok(d.recent[0].openDecisions[0]==='D','open decision in digest');
ok(d.openLoops.length===1,'loops in digest');
ok(meetingDigest([])===null,'empty digest is null');

// pendingActions dedupes against already-accepted tasks
const log=normLog({id:'p1',extraction:{actions:[{title:'Call Chris'},{title:'File LLC'}]}});
ok(pendingActions(log,[]).length===2,'nothing accepted yet');
ok(pendingActions(log,[{sourceMeetingId:'p1',title:'call chris'}]).length===1,'accepted task removed, case-insensitive');
ok(pendingActions(log,[{sourceMeetingId:'other',title:'Call Chris'}]).length===2,'task from another meeting does not dedupe');

// taskFromAction matches newTask() shape
const t=taskFromAction({title:'X',owner:'Logan',due:'nope',revenue:9},'p1',()=>'id1');
ok(t.due.length===10&&t.due!=='nope','bad due date -> today');
ok(t.revenue===9,'revenue passed through as number');
ok(t.sourceMeetingId==='p1'&&t.done===false&&t.aiRank===null,'task shape intact');
ok(newMeetingLog('Garrett').extraction.actions.length===0,'new log has empty extraction');

/* ---- internal vs client -------------------------------------------------
   The bug these guard against is the one BUILD-NOTES-v36 already recorded
   against the settings loader: normLog names every key explicitly, so a field
   that isn't listed there saves fine and vanishes on reload. */
const cl=(id,leadId,date='2026-08-16',extra={})=>normLog({id,kind:'client',leadId,meetingDate:date,
  extraction:{title:'Pitch',headline:'They want the CRM',summary:'Long read on them.'},...extra});

ok(normLog({id:'x'}).kind==='internal','a log with no kind is internal');
ok(normLog({id:'x',kind:'nonsense'}).kind==='internal','junk kind -> internal');
ok(normLog({id:'x',kind:'client'}).kind==='client','client kind survives normLog');
ok(normLog({id:'x',kind:'client',leadId:'l1'}).leadId==='l1','leadId survives normLog');
ok(normLog({id:'x'}).shared.text==='','shared defaults empty');
ok(normLog({id:'x',shared:{text:'hi',at:'t',by:'Logan',activityId:'a1'}}).shared.activityId==='a1','shared survives normLog');
ok(newMeetingLog('Garrett').kind==='internal','new log defaults to internal');
ok(newMeetingLog('Garrett','client').kind==='client','new log takes a kind');
ok(newMeetingLog('Garrett').shared.text==='','new log has published nothing');

const mixed=[mk('i1','2026-08-02',[{key:'llc',title:'File the LLC'}]),cl('c1','l1'),cl('c2','l2')];
ok(internalLogs(mixed).length===1&&clientLogs(mixed).length===2,'kinds split');

/* the ladder and the huddle are the Sunday cadence — a client meeting must
   not be able to bury a loop that has been open four weeks */
const clientLoop=cl('c3','l1','2026-08-09',{extraction:{headline:'h',openItems:[{key:'send-quote',title:'Send the quote'}]}});
const loops=openLoops([...mixed,clientLoop]);
ok(loops.length===1&&loops[0].key==='llc','openLoops ignores client meetings');
const dg=meetingDigest([...mixed,clientLoop]);
ok(dg.meetingsLogged===1,'digest counts internal meetings only');
ok(!JSON.stringify(dg).includes('quote'),'digest carries nothing from a client meeting');

/* ---- meetingLogsOf: derived, the sponsorshipsOf rule -------------------- */
const lead={id:'l1'};
const rows=meetingLogsOf(lead,[cl('c1','l1','2026-08-02'),cl('c2','l2','2026-08-16'),cl('c3','l1','2026-08-16'),mk('i1','2026-08-16')]);
ok(rows.length===2,'only this lead\'s client meetings');
ok(rows[0].logId==='c3'&&rows[1].logId==='c1','newest meeting first');
ok(rows.every(r=>r.derived===true),'rows are marked derived');
ok(meetingLogsOf(null,[cl('c1','l1')]).length===0,'no lead -> no rows');
ok(meetingLogsOf(lead,[]).length===0,'no logs -> no rows');

/* a rep gets [] from an owner-only table, so the derivation yields nothing —
   this is the visibility model, enforced by Postgres not by the UI */
ok(meetingLogsOf(lead,[]).length===0,'no logs readable -> nothing derived for a rep');

/* the transcript must never ride along onto a lead */
const withTranscript=meetingLogsOf(lead,[normLog({id:'c9',kind:'client',leadId:'l1',
  transcript:'CANDID READ ON THIS CLIENT',extraction:{headline:'h'}})]);
ok(!JSON.stringify(withTranscript).includes('CANDID'),'derived rows never carry the transcript');

/* published state is read from the log, so editing the log moves the lead */
const pub=meetingLogsOf(lead,[normLog({id:'c8',kind:'client',leadId:'l1',
  shared:{text:'Wants a quote by Friday.',at:'2026-08-16T10:00:00Z',by:'Logan',activityId:'a7'},
  extraction:{headline:'h'}})]);
ok(pub[0].published===true&&pub[0].sharedText==='Wants a quote by Friday.','published line reads through');
ok(meetingLogsOf(lead,[cl('c7','l1')])[0].published===false,'nothing published by default');

console.log(f?('\n'+f+' FAILED'):'\nall passed');
process.exit(f?1:0);
