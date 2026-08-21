import React, { useState, useEffect, useMemo, Fragment } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import {
  LayoutDashboard, KanbanSquare, Contact2, Building2, DollarSign, Settings,
  Menu, Plus, X, Phone, Mail, Globe, Flag, Search, Trash2, Download, Upload,
  MessageSquare, PhoneCall, CalendarClock, StickyNote, Mailbox, Lock, Repeat,
  CheckCircle2, Circle, AlertTriangle, ArrowUpDown, Percent, Target, Award, Rocket, UserCheck,
  Image as ImageIcon, GripVertical, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, List, SlidersHorizontal,
  Layers, FileText, Tag, LogOut, Receipt, Printer, Send, Bell, Sparkles,
  BookText, BookOpen, Wallet, ArrowDownLeft, ArrowUpRight, Paperclip, FileDown, Loader2, ListTodo,
  Users, Link2, UserPlus, Expand, Video, CalendarCheck, Zap, Clipboard,
  Trophy, Crown, Ban, BadgeCheck, KeyRound,
  Ticket, Bot, Mic,
  Handshake, Sheet, RefreshCw, Clock, MapPin, ExternalLink, AtSign, Gift, Maximize2, Minimize2
} from 'lucide-react';
import JSZip from 'jszip';
import MeetingLog from './MeetingLog';
import Jarvis from './Jarvis';
import { meetingLogsOf } from './lib/meetinglog';
import Playbook from './Playbook';
import Pocket from './Pocket';
/* aliased: rateOf is already taken in this file by the <Rate> helper from
   AUDIT #7, which divides part/whole. This one is a meeting's pay rate. */
import { apptEarnings, payModels, feeState, rateOf as feeRateOf, setterOf } from './lib/reppay';
import RepPay from './RepPay';
import PaymentReview from './PaymentReview';
/* AUDIT #23. setupPaid vs retainerPaid vs allPaid — the three answers that used
   to be one. See src/lib/retainer.js for why they are separate arrays rather
   than one array with a kind. */
import {
  setupPaid, retainerPaid, allPaid, allPayments as paymentRows,
  retainerState, billsMrr, quotedRate, arrears as retainerArrears,
} from './lib/retainer';
import { auth, db, configured } from './lib/supabase';
/* The lead view, extracted in PR 1b: unchanged code in a file of its own so the
   redesign's diffs are readable. StageBadge/PriBadge live in LeadBits because
   BOTH this file and LeadView draw them — importing them FROM LeadView would
   make App depend on the screen that depends on App. */
import Modal from './LeadView';
import { DateFix, PriBadge, StageBadge } from './LeadBits';
import { BRAND, AI_NAME } from './lib/brand';
/* The lead record's pure read/write helpers, moved to src/lib/lead.js so the
   lead view can import the SAME definitions instead of carrying copies. Two
   spellings of owedBy() is the ENGINEERING §2 bug, not a tidiness one. */
import {
  ACT_TYPES, CLIENT_PHASES, CMSN_STATE, COBALT, DATE_LEAD_DEFAULT, DEFAULT_CLIENT_PHASES,
  DEFAULT_DELIVERY_TRACKS, DEFAULT_OPTIONS, GOLD, GREEN, INDIGO, INK, MEETING_TYPES,
  ONBOARDING, ONB_ITEMS, OWNERS, POOL_OWNER, PRIORITIES, REACHED_TYPES, RED, REL_TIERS,
  actLabel, activeTracks, allMeetings, anyPayments, blankFirst, bookedCount, calendarOwner,
  cashConfirmed, clientOverall, closedDealsTotal, cmsnAmount, cmsnOf, dateVocab, datelessOf,
  dayLabel, daysToDate, daysUntil, dealBits, dealsOf, depositPaidAt, evNum, fmtDate,
  fmtMeetingTime, fmtStamp, introChain, isDateless, isPoolLead, isUpsellDeal, isoOf,
  keyDatesOf, labelVocab, labelsOf, lastContact, manualSponsorships, meetingsOf, needsDate,
  normEntry, num, nurtureDaysOf, onbSkipped, openSaleValue, owedBy, pct, poolList,
  preDatesPayments, sOf, seedOnboarding, skippedOnb, sponsorshipsOf, stdPhases, stripTagText,
  tagCleared, tagsOn, todayISO, trackProgress, uid, usd, usdc, yearsAt,
  gmailIndex, setGmailIndex,
} from './lib/lead';

const PIE=[COBALT,INDIGO,GOLD,'#5C76EE','#8E86C9',GREEN,'#D98A3D','#7AA0F0'];
const STAGE_COLORS=['#6B73C9',COBALT,'#7A5CC8',GOLD,GREEN,'#B0606A','#D98A3D','#2BA7A0'];

const DEFAULT_STAGES=[
  {key:'new',      label:'New Lead',      color:'#6B73C9', prob:0.10, open:true,  won:false, lost:false},
  {key:'discovery',label:'Discovery',     color:COBALT,    prob:0.30, open:true,  won:false, lost:false},
  {key:'proposal', label:'Proposal Sent', color:GOLD,      prob:0.70, open:true,  won:false, lost:false},
  {key:'signed',   label:'Signed',        color:GREEN,     prob:1.00, open:false, won:true,  lost:false},
  /* "Not right now" is a THIRD outcome, not a flavour of lost. Open would
     inflate the pipeline and the forecast with people who just said no; lost
     would bury them and drag win rate down for a deal that was never refused.
     open/won/lost all false = counted nowhere, which is exactly right — they
     come back through the follow-up date instead. */
  {key:'nurture',  label:'Not right now', color:'#7C8AA5', prob:0.00, open:false, won:false, lost:false, nurture:true},
  {key:'lost',     label:'Lost',          color:'#B0606A', prob:0.00, open:false, won:false, lost:true},
];
/* old default set — used to detect a pre-migration install */
const OLD_STAGE_KEYS=['new','contacted','meeting','proposal','won','lost'];
const STAGE_REMAP={new:'new',contacted:'discovery',meeting:'discovery',proposal:'proposal',won:'signed',lost:'lost'};

const PHASE_FLOW=['intake','build','launch','active'];   // the advance path
const phaseMeta=k=>CLIENT_PHASES.find(p=>p[0]===k)||['intake','Intake','#6B73C9'];
/* a client's own ordered phase list = standard phases + that client's custom phases spliced in after their `after` key */
const clientPhaseList=(settings,client)=>{ const std=stdPhases(settings); const custom=((client&&client.customPhases)||[]).map(c=>({...c,custom:true})); const out=[];
  std.forEach(p=>{ out.push(p); custom.filter(c=>c.after===p.key).forEach(c=>out.push(c)); });
  custom.filter(c=>!out.some(o=>o.key===c.key)).forEach(c=>out.push(c));
  return out; };
const phaseInfo=(key,settings,client)=>clientPhaseList(settings,client).find(p=>p.key===key)||stdPhases(settings).find(p=>p.key===key)||{key,label:key,color:'#6B73C9'};
/* advance path for one client: flow std phases + their custom phases, terminals excluded */
const flowOrder=(settings,client)=>clientPhaseList(settings,client).filter(p=>p.flow||p.custom).map(p=>p.key);
/* board columns = standard phases with every visible client's custom phases inserted after their `after`.
   A custom column is derived from one client's data, so it only ever appears for that client. */
const boardCols=(clients,settings)=>{ const std=stdPhases(settings); const out=[]; const byAfter={};
  (clients||[]).forEach(c=>((c.customPhases)||[]).forEach(cp=>{ (byAfter[cp.after]=byAfter[cp.after]||[]).push({...cp,custom:true,ownerId:c.id}); }));
  std.forEach(p=>{ out.push(p); (byAfter[p.key]||[]).forEach(cp=>out.push(cp)); });
  Object.entries(byAfter).forEach(([after,list])=>{ if(!std.some(p=>p.key===after)) list.forEach(cp=>{ if(!out.some(o=>o.key===cp.key)) out.push(cp); }); });
  return out; };
const onbByPhase=phase=>ONB_ITEMS.filter(i=>i.phase===phase);
const onbItemsFor=l=>ONB_ITEMS.filter(i=>!onbSkipped(l,i.key));
/* progress for one phase's checklist (mirrors trackProgress) */
const phaseProgress=(lead,phase)=>{ const items=onbByPhase(phase).filter(i=>!onbSkipped(lead,i.key)); const ob=lead.onboarding||{}; let done=0,overdue=0,nextDue=null,next=null;
  items.forEach(i=>{ const e=normEntry(ob[i.key]); if(e.done) done++; else { if(!next) next=i; if(e.due){ if(daysUntil(e.due)<0) overdue++; if(!nextDue||e.due<nextDue) nextDue=e.due; } } });
  return {items,done,total:items.length,pct:items.length?done/items.length:0,overdue,nextDue,next}; };
/* whole-checklist stats (mirrors clientOverall) */
const onboardingStat=lead=>{ const ob=lead.onboarding||{}; let done=0,overdue=0,nextDue=null,next=null;
  const items=onbItemsFor(lead);
  items.forEach(i=>{ const e=normEntry(ob[i.key]); if(e.done) done++; else { if(!next) next=i; if(e.due){ if(daysUntil(e.due)<0) overdue++; if(!nextDue||e.due<nextDue) nextDue=e.due; } } });
  return {done,total:items.length,pct:items.length?done/items.length:0,overdue,nextDue,next}; };
/* one-time, idempotent pipeline migration: pre-migration installs (empty or the
   old 6-key default) get the new 5 stages, and every lead's stage key is remapped.
   Safe to run on every load — a no-op once migrated. */
function migrateStages(settings,leads){
  const cur=(settings&&settings.stages)||[]; const curKeys=cur.map(s=>s.key);
  const looksOld=!curKeys.length || (curKeys.length===OLD_STAGE_KEYS.length && OLD_STAGE_KEYS.every(k=>curKeys.includes(k)));
  const stages=looksOld?DEFAULT_STAGES:cur;
  const valid=new Set(stages.map(s=>s.key));
  const changed=[];
  const migLeads=(leads||[]).map(l=>{
    if(!l.stage||valid.has(l.stage)) return l;
    const to=STAGE_REMAP[l.stage]||'new';
    const nl={...l,stage:valid.has(to)?to:'new'}; changed.push(nl); return nl;
  });
  return {stages,stagesChanged:looksOld,leads:migLeads,changed};
}
/* "Today" beats a date you have to decode. */
/* Every /api/* endpoint that costs money now requires a signed-in caller, so
   the token rides along. One helper rather than a dozen edited fetch calls. */
const apiPost=async(url,body)=>{
  let tok='';
  try{ const sess=await auth.session(); tok=(sess&&sess.access_token)||''; }catch{}
  const r=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json',...(tok?{authorization:`Bearer ${tok}`}:{})},
    body:JSON.stringify(body||{})});
  return r;
};
/* ---- recurring costs ------------------------------------------------------
   Supabase, Vercel, Google Workspace — the bills that arrive whether or not you
   sell anything. Stored as templates in settings, NOT auto-generated into the
   ledger: inventing transactions that may not have happened would corrupt the
   only record of what actually left the account. They answer a different
   question ("what am I committed to") than the ledger ("what did I spend"),
   and the page keeps those apart on purpose. */
const RECUR_EVERY=[['monthly','Monthly',1],['quarterly','Quarterly',3],
  ['yearly','Yearly',12],['weekly','Weekly',0.25]];
const recurringOf=settings=>Array.isArray(settings&&settings.recurring)?settings.recurring:[];
/* everything normalised to a monthly figure so one number means one thing */
const perMonth=r=>{ const a=num(r&&r.amount); const e=(RECUR_EVERY.find(x=>x[0]===(r&&r.every))||RECUR_EVERY[0]);
  return e[0]==='weekly'?a*52/12:a/e[2]; };
const monthlyBurn=settings=>recurringOf(settings).filter(r=>r.active!==false)
  .reduce((a,r)=>a+perMonth(r),0);
/* the next time each bill lands, inside a window */
const recurDueIn=(settings,days=90)=>{ const out=[]; const now=new Date();
  recurringOf(settings).filter(r=>r.active!==false).forEach(r=>{
    const e=(RECUR_EVERY.find(x=>x[0]===r.every)||RECUR_EVERY[0])[0];
    const step=e==='weekly'?7:e==='monthly'?30:e==='quarterly'?91:365;
    let d=r.nextDue?new Date(r.nextDue+'T12:00:00'):new Date();
    if(isNaN(d)) d=new Date();
    let guard=0;
    while(d<now&&guard++<400){ d=new Date(d.getTime()+step*864e5); }
    while(d<=new Date(now.getTime()+days*864e5)&&guard++<400){
      out.push({r,date:isoOf(d),amount:num(r.amount)});
      d=new Date(d.getTime()+step*864e5); }
  });
  return out.sort((a,b)=>a.date.localeCompare(b.date)); };
const EXPENSE_CATS=['Software','Hosting','Contractors','Marketing','Events',
  'Office','Travel','Fees','Taxes','Other'];
/* every date coming up inside its own reminder window, soonest first */
const upcomingDates=(leads,horizon=null)=>(leads||[]).flatMap(l=>keyDatesOf(l)
    .map(d=>({lead:l,d,days:daysToDate(d.date,d.annual!==false)}))
    .filter(x=>x.days!==null&&x.days>=0
      &&x.days<=(horizon!==null?horizon:(num(x.d.lead)||DATE_LEAD_DEFAULT))))
  .sort((a,b)=>a.days-b.days);
const taggedFor=(a,who)=>tagsOn(a).includes(who)&&!tagCleared(a).includes(who);
/* every open tag for one person, newest first, with the lead it sits on */
const openTagsFor=(leads,who)=>(leads||[]).flatMap(l=>(l.activities||[])
    .filter(a=>taggedFor(a,who)).map(a=>({lead:l,a})))
  .sort((x,y)=>(y.a.ts||'').localeCompare(x.a.ts||''));
const DEFAULT_TEAM=BRAND.team.map(name=>({name,access:'all'}));
const teamAccess=(settings,name)=>{ const t=(settings?.team||[]).find(x=>x.name===name); return t?t.access:'all'; };
const scopeLeads=(list,view,me,myPools)=>{
  if(view==='mine') return list.filter(l=>l.owner===me);
  if(view==='pool') return list.filter(l=>isPoolLead(l,myPools));
  return list;
};
function ScopeSeg({view,setView,counts,canAll}){
  return (<div className="seg scope-seg">
    <button className={view==='mine'?'on':''} onClick={()=>setView('mine')}>Mine<i>{counts.mine}</i></button>
    <button className={view==='pool'?'on':''} onClick={()=>setView('pool')}>Pool<i>{counts.pool}</i></button>
    {canAll&&<button className={view==='all'?'on':''} onClick={()=>setView('all')}>All<i>{counts.all}</i></button>}
  </div>);
}
/* 'Booked' is the canonical meeting-booked marker. Both the scheduler and the
   composer button write this type, so every count in the app agrees. */
/* sections that can be switched off per install. Dashboard + Settings always ship. */
/* AUDIT #17. 'pipeline' is deliberately no longer in this list. The board
   duplicated three dashboard tiles with its own arithmetic, its only unique verb
   (drag to move stage) is done in fewer clicks from the lead row and the modal,
   and it sorted by dealValue — which closing a deal properly empties, so the
   board degraded as the business succeeded. Switched off rather than deleted:
   every lead, stage and value is untouched, and putting it back is one entry in
   this array plus a modulesV bump. */
const ALL_MODULES=[['jarvis',AI_NAME],['board','Leaderboard'],['huddle','Monday Huddle'],['followup','Follow-Up'],['tasks','Tasks'],['activity','Activity'],['leads','Leads'],['rels','Relationships'],['clients','Clients'],['meetings','Meetings'],['mlog','Meeting Log'],['playbook','Playbook'],['events','Events'],['sponsors','Sponsors'],['invoices','Invoices'],['money','Money']];
const ALWAYS_ON=['dash','settings'];
const modList=settings=>{ if(settings&&Array.isArray(settings.modules)) return settings.modules;
  if(BRAND.modules&&BRAND.modules.length) return BRAND.modules; return ALL_MODULES.map(m=>m[0]); };
const modOn=(settings,k)=>ALWAYS_ON.includes(k)||modList(settings).includes(k);

/* ============================================================================
   ROLES
   ----------------------------------------------------------------------------
   owner — everything, including money, users, pools, commission approvals.
   rep   — their own leads + the pools they're assigned, a personal dashboard,
           the leaderboard, and their own commission. No company money.
   An install with an EMPTY crm_users table behaves exactly as it did before:
   whoever is signed in is treated as an owner and nothing is scoped.
   ========================================================================== */
/* 'playbook' is on by default, unlike every other addition to this list. The
   module exists SO THAT reps read it, and a published note no rep can reach is
   the per-rep form of "new tabs ship invisible" (ENGINEERING.md §1) — the owner
   publishes, nothing happens, and nothing looks broken. It carries no company
   money: kb_published has six named columns and none of them is a figure.
   A rep who already has a CUSTOM tab list keeps it (see tabsOf), so those reps
   still need it switched on in Settings -> Team. */
/* 'meetings' is in a rep's defaults because meetings are now MONEY — a rep paid
   per appointment could otherwise only see their appointments one lead at a
   time, which is no way to check a payslip. It carries no company figures: the
   page renders no deal value and no totals, and its list is already scoped to
   leads the rep can see.
   A rep who already has a CUSTOM tab list keeps it, so switch it on for them in
   Settings -> Team — the same per-rep trap the Playbook hit. */
const REP_DEFAULT_TABS=['dash','board','leads','followup','tasks','activity','meetings','playbook'];
/* a rep can never be given these by accident — they expose company money.
   An owner CAN still switch them on deliberately (see Team settings). */
const MONEY_TABS=['invoices','books','money','huddle','mlog'];
/* modules a rep may be granted at all. 'settings' and 'clients' stay with owners:
   Settings configures the whole install, Clients is the money-side client book. */
const REP_TABS=ALL_MODULES.map(m=>m[0]).filter(k=>k!=='clients').concat(['dash']);
const tabsOf=u=>{ if(!u) return REP_DEFAULT_TABS; const t=Array.isArray(u.tabs)?u.tabs:[]; return t.length?t:REP_DEFAULT_TABS; };
/* Sidebar order is a PERSONAL preference, not an account one — two people on the
   same install work differently and neither should be able to rearrange the
   other's screen. It lives on the crm_users row next to `tabs`, so it follows
   the person between devices instead of being stuck in one browser.
   Repaired on read: unknown keys dropped, anything new appended in its default
   position, so shipping a new tab never leaves it invisible for someone who
   already saved an order. */
const navOrderOf=(user,navKeys)=>{
  const saved=Array.isArray(user&&user.nav_order)?user.nav_order.filter(k=>navKeys.includes(k)):[];
  return [...saved,...navKeys.filter(k=>!saved.includes(k))];
};
const isRep=u=>!!u&&u.role==='rep';
/* what THIS person can open: the install's global modules, narrowed by their
   own tab list. A rep can never see a tab the install has globally turned off. */
const canOpen=(settings,user,k)=>{
  if(!modOn(settings,k)) return false;
  if(!isRep(user)) return true;
  if(k==='dash') return true;
  if(k==='settings'||k==='clients') return false;
  return tabsOf(user).includes(k);
};

const mkCommission=(lead,user)=>({repId:user.id,repName:user.name,pct:num(user.commission_pct),
  base:num(lead.dealValue),amount:cmsnAmount(lead.dealValue,user.commission_pct),
  status:'pending',convertedAt:new Date().toISOString()});
/* one rep's own numbers, computed from the leads they can already read */
const myCommissions=(leads,uid)=>{
  const rows=(leads||[]).map(l=>({l,c:cmsnOf(l)})).filter(r=>r.c&&r.c.repId===uid&&r.c.status!=='void');
  const pending=rows.filter(r=>r.c.status==='pending').reduce((a,r)=>a+num(r.c.amount),0);
  const earned=rows.filter(r=>r.c.status==='earned').reduce((a,r)=>a+num(r.c.amount),0);
  return {pending,earned,total:pending+earned,rows:rows.sort((a,b)=>(b.c.convertedAt||'').localeCompare(a.c.convertedAt||''))};
};
/* ---- motion: honour the OS setting, everywhere -------------------------- */
const prefersReduced=()=>{ try{ return !!(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch{ return false; } };
function useReducedMotion(){
  const [r,setR]=useState(prefersReduced);
  useEffect(()=>{ if(typeof window==='undefined'||!window.matchMedia) return; const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
    const on=()=>setR(!!mq.matches); on();
    if(mq.addEventListener){ mq.addEventListener('change',on); return ()=>mq.removeEventListener('change',on); }
    if(mq.addListener){ mq.addListener(on); return ()=>mq.removeListener(on); } },[]);
  return r;
}
/* a number that ticks up to its value on load. Reduced motion → final value,
   immediately. Never blocks: the DOM is correct on the very first paint. */
function CountUp({value,format,ms}){
  const reduced=useReducedMotion();
  const [v,setV]=useState(value);
  const from=React.useRef(value);
  useEffect(()=>{ const target=num(value); const start=num(from.current); from.current=target;
    if(reduced||start===target||typeof window==='undefined'||!window.requestAnimationFrame){ setV(target); return; }
    const dur=ms||800; const t0=Date.now(); let raf=0;
    const tick=()=>{ const p=Math.min(1,(Date.now()-t0)/dur); const e=1-Math.pow(1-p,3);
      setV(start+(target-start)*e); if(p<1) raf=window.requestAnimationFrame(tick); else setV(target); };
    raf=window.requestAnimationFrame(tick);
    return ()=>{ if(raf) window.cancelAnimationFrame(raf); }; },[value,reduced,ms]);
  return <>{format?format(v):Math.round(num(v)).toLocaleString()}</>;
}
/* ---- unified meeting model -------------------------------------------------
   ONE record per meeting, whether it was scheduled on the calendar or logged
   after the fact. status: '' = upcoming, 'held', 'noshow'. Every count in the
   app reads meetingsOf(), so the numbers can never disagree with each other. */
const MSTATUS={'':'Upcoming',held:'Held',noshow:'No-show'};
/* Which meeting types count toward a CONVERSION ratio. Coffee is relationship
   work at the top of the cycle — you have a lot of them, most are not a sales
   conversation yet, and counting them drags Meeting → Close down and hides what
   your real sales meetings actually convert at. Excluded types still count
   everywhere a meeting is COUNTED: booked, held, show rate, the type breakdown.
   They are only kept out of the ratio. Editable per install in Settings, because
   a client's meeting names won't be ours. */
const RATIO_EXCLUDE_DEFAULT=['Coffee','Onboarding','Check-in'];
/* When a lead became a client. A meeting only proves it converted if it happened
   BEFORE this. Onboarding and check-ins happen after, so counting them makes the
   ratio improve every time you onboard somebody — the number would measure
   delivery, not selling. */
const closeStampOf=l=>String((l&&(l.convertedAt||l.closedAt))||'').slice(0,10)||null;
const heldBeforeClose=(m,l)=>{ const c=closeStampOf(l); if(!c) return true;
  const d=String(m.start||'').slice(0,10); return !d||d<=c; };
const ratioExcludeOf=settings=>Array.isArray(settings&&settings.ratioExcludeTypes)
  ? settings.ratioExcludeTypes : RATIO_EXCLUDE_DEFAULT;
const countsToRatio=(m,ex)=>!(ex||[]).includes(m.mtype||'Other');
const meetingMonthKey=m=>m.start?isoOf(new Date(m.start)).slice(0,7):null;
/* Two different months live on a meeting and conflating them is what made a
   meeting booked today for August 6 vanish from July's dashboard. meetingMonthKey
   is WHEN IT HAPPENS — right for "meetings held". bookingMonthKey is WHEN IT WAS
   BOOKED — right for "meetings booked", which is an action you take and a goal
   you're measured against this month, whatever month the meeting itself lands in. */
const bookingMonthKey=m=>{ const t=m.createdAt||m.start; return t?isoOf(new Date(t)).slice(0,7):null; };
const isUpcoming=m=>!m.status&&!isDateless(m)&&new Date(m.end||m.start).getTime()>=Date.now();
const needsStatus=m=>!m.status&&!isDateless(m)&&new Date(m.end||m.start).getTime()<Date.now();
/* ---- Monday Morning Huddle -------------------------------------------------
   Everything here is plain arithmetic on data already captured. The AI only
   ever sees the finished digest, never the database. */
/* A ROLLING seven days ending today, not the last complete Mon-Sun.
   The old window only made sense if you ran this on a Monday: open it on a
   Thursday and it reviewed a week that ended three days ago, so anything you
   did Monday to Wednesday was invisible. Rolling means the huddle is honest on
   any day and always covers the seven days you actually just worked.
   End is the end of TODAY so today's work counts. Start is 00:00 six days back,
   which is seven calendar days inclusive — not six, and not eight. */
const lastWeekRange=(now=new Date())=>{
  const end=new Date(now); end.setHours(23,59,59,999);
  const start=new Date(end); start.setDate(end.getDate()-6); start.setHours(0,0,0,0);
  return {start,end,key:isoOf(start)}; };
/* the comparison period: the seven days before those, same length, no overlap */
const shiftWeek=(r,weeks)=>{ const start=new Date(r.start); start.setDate(start.getDate()-7*weeks);
  const end=new Date(r.end); end.setDate(end.getDate()-7*weeks); return {start,end,key:isoOf(start)}; };
const inRange=(ts,r)=>{ if(!ts) return false; const t=new Date(String(ts).length<=10?ts+'T12:00:00':ts).getTime();
  return !isNaN(t)&&t>=r.start.getTime()&&t<=r.end.getTime(); };
const pctChange=(a,b)=>b===0?(a>0?null:0):Math.round((a-b)/b*100);

/* one week's worth of counts */
function weekSlice(leads,tasks,stages,r){
  const acts={}; let booked=0,held=0,noshow=0,newLeads=0,closed=0,closedValue=0,onboarded=0,deposits=0,fuCleared=0,fuOnTime=0;
  const bookedByType={}; const moves=[]; const wonNames=[]; const newClientNames=[];
  (leads||[]).forEach(l=>{
    const nm=l.company||l.name||'(unnamed)';
    if(inRange(l.createdAt,r)) newLeads++;
    ((l.closedDeals)||[]).forEach(d=>{ if(inRange(d.closedAt,r)){ closed++; closedValue+=num(d.amount); wonNames.push(nm+' ('+usd(d.amount)+') · '+(d.label||'deal')); } });
    if(sOf(l.stage,stages).won&&inRange(l.closedAt,r)){ closed++; closedValue+=num(l.dealValue); wonNames.push(nm+' ('+usd(l.dealValue)+')'); }
    if(l.isClient&&inRange(l.convertedAt,r)){ onboarded++; newClientNames.push(nm); }
    const dep=normEntry((l.onboarding||{}).deposit_paid).done; if(inRange(dep,r)) deposits++;
    (l.activities||[]).forEach(a=>{ if(!inRange(a.ts,r))return;
      const sys=a.text==='Lead created.'||(typeof a.text==='string'&&a.text.startsWith('Stage moved:'));
      if(!sys&&bookingLive(l,a)) acts[a.type]=(acts[a.type]||0)+1;   // system notes and cancelled bookings aren't work done
      if(a.type==='Booked'&&bookingLive(l,a)){ booked++; const t=a.mtype||'untyped'; bookedByType[t]=(bookedByType[t]||0)+1; }
      if(a.fuOnTime!==undefined){ fuCleared++; if(a.fuOnTime) fuOnTime++; }
      if(typeof a.text==='string'&&a.text.startsWith('Stage moved:')) moves.push(nm+': '+a.text.replace('Stage moved: ',''));
    });
    (l.meetings||[]).forEach(mt=>{ if(!inRange(mt.start,r))return; if(mt.status==='held')held++; else if(mt.status==='noshow')noshow++; });
  });
  const done=(tasks||[]).filter(t=>t.done&&inRange(t.doneAt,r));
  const touches=(acts.Call||0)+(acts.Text||0)+(acts.Email||0)+(acts.Meeting||0);
  return {activityCounts:acts,touches,booked,bookedByType,held,noshow,newLeads,closed,closedValue,onboarded,deposits,
    fuCleared,fuOnTime,stageMoves:moves,wonNames,newClientNames,tasksDone:done.length,taskTitles:done.map(t=>t.title).slice(0,15)};
}

/* the full packet the huddle page renders and the AI interprets */
function buildHuddle(leads,tasks,settings,stages,rels,now=new Date()){
  const r=lastWeekRange(now), p=shiftWeek(r,1);
  const cur=weekSlice(leads,tasks,stages,r), prev=weekSlice(leads,tasks,stages,p);
  const G=goalsOf(settings); const mKey=isoOf(now).slice(0,7);
  let mtdBooked=0,mtdClosed=0,mtdRevenue=0,mtdOnboarded=0;
  (leads||[]).forEach(l=>{
    (l.activities||[]).forEach(a=>{ if(a.type==='Booked'&&bookingLive(l,a)&&a.ts&&isoOf(new Date(a.ts)).slice(0,7)===mKey) mtdBooked++; });
    if(sOf(l.stage,stages).won&&l.closedAt&&String(l.closedAt).slice(0,7)===mKey){ mtdClosed++; mtdRevenue+=num(l.dealValue); }
    if(l.isClient&&l.convertedAt&&String(l.convertedAt).slice(0,7)===mKey) mtdOnboarded++;
  });
  const openLeads=(leads||[]).filter(l=>sOf(l.stage,stages).open);
  /* nurtured leads are not "open", but a revisit date is the only way they ever
     come back — so follow-ups deliberately include them */
  const dueEligible=l=>{ const st=sOf(l.stage,stages); return st.open||st.nurture; };
  const overdue=(leads||[]).filter(l=>l.followUp&&daysUntil(l.followUp)<0&&dueEligible(l))
    .sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||''));
  const cold=coldList(rels||[]).slice(0,8);
  const stalled=openLeads.map(l=>({l,d:daysSince(lastTouchTs(l)||l.createdAt||new Date().toISOString())}))
    .filter(x=>x.d>=14).sort((a,b)=>b.d-a.d).slice(0,8);
  const untouched=(leads||[]).filter(l=>!(l.activities||[]).some(REAL_TOUCH));
  return {
    period:{from:isoOf(r.start),to:isoOf(r.end),days:7,rolling:true,
      label:fmtDate(isoOf(r.start))+' – '+fmtDate(isoOf(r.end))},
    lastWeek:cur, weekBefore:prev,
    pipeline:{openDeals:openLeads.length,openValue:Math.round(openLeads.reduce((a,l)=>a+num(l.dealValue),0)),
      weighted:Math.round(openLeads.reduce((a,l)=>a+num(l.dealValue)*num(sOf(l.stage,stages).prob),0)),
      mrr:Math.round((leads||[]).filter(billsMrr).reduce((a,l)=>a+num(l.retainer),0))},
    monthToDate:{month:mKey,dayOfMonth:now.getDate(),pctOfMonthElapsed:Math.round(monthPace(now)*100),
      booked:mtdBooked,closed:mtdClosed,revenue:mtdRevenue,onboarded:mtdOnboarded,
      goals:{booked:G.booked,closed:G.closed,onboarded:G.onboarded,revenue:G.revenue,mrr:G.mrr}},
    slipping:{
      overdueFollowUps:overdue.slice(0,8).map(l=>({who:l.company||l.name,daysLate:Math.abs(daysUntil(l.followUp)),plan:l.nextSteps||l.nextAction||''})),
      overdueTotal:overdue.length,
      coldRelationships:cold.map(x=>({who:x.r.company||x.r.name,tier:tierMeta(x.tier)[1],daysSinceTouch:x.days>=9999?null:x.days})),
      stalledDeals:stalled.map(x=>({who:x.l.company||x.l.name,value:num(x.l.dealValue),stage:sOf(x.l.stage,stages).label,daysSinceTouch:x.d})),
      neverContacted:untouched.length,
    },
  };
}
/* monthly targets. 0 or missing = no goal, so nothing renders. */
const DEFAULT_GOALS={booked:0,closed:0,onboarded:0,revenue:0,mrr:0};
const GOAL_FIELDS=[
  ['booked','Meetings booked','per month','n'],
  ['closed','Deals closed','per month','n'],
  ['onboarded','Clients onboarded','per month','n'],
  ['revenue','Setup revenue closed','per month','$'],
  ['mrr','MRR target','running total','$'],
];
const goalsOf=settings=>({...DEFAULT_GOALS,...((settings&&settings.goals)||{})});
/* how far through the month we are — lets a tile say "behind pace" honestly */
const monthPace=(d=new Date())=>{ const days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  return Math.min(1,d.getDate()/days); };
/* ---- health metrics ------------------------------------------------------
   All derived from data already captured, so nothing new to type in. */
const REAL_TOUCH=a=>a&&a.ts&&a.text!=='Lead created.';
/* hours between a lead landing and the first real touch. null = never touched. */
const firstTouchHrs=l=>{ const acts=(l.activities||[]).filter(REAL_TOUCH); if(!acts.length||!l.createdAt) return null;
  const first=acts.reduce((mn,a)=>(!mn||a.ts<mn)?a.ts:mn,null);
  const h=(new Date(first)-new Date(l.createdAt))/36e5; return isNaN(h)?null:Math.max(0,h); };
const median=arr=>{ if(!arr.length) return null; const x=[...arr].sort((a,b)=>a-b); const i=Math.floor(x.length/2);
  return x.length%2?x[i]:(x[i-1]+x[i])/2; };
const fmtHrs=h=>h==null?'—':h<1?Math.round(h*60)+'m':h<48?Math.round(h)+'h':Math.round(h/24)+'d';
const lastTouchTs=l=>{ const acts=(l.activities||[]).filter(a=>a&&a.ts); if(!acts.length) return l.createdAt||null;
  return acts.reduce((mx,a)=>(!mx||a.ts>mx)?a.ts:mx,null); };
/* champions need watering more often than brand-new contacts */
const COLD_DAYS={champion:30,b:60,new:90};
const coldList=rels=>(rels||[]).map(r=>{ const tier=tierOf(r); const last=lastTouchTs(r);
    return {r,tier,last,days:last?daysSince(last):9999,limit:COLD_DAYS[tier]||90}; })
  .filter(x=>x.days>=x.limit).sort((a,b)=>b.days-a.days);
/* ---- what a client owes and what has actually arrived ---------------------
   Revenue used to be attributed by CLOSE date: a deal closed 21 July put every
   dollar in July even if half the money arrived in August. That's accrual
   accounting, and it's the wrong basis for a business that gets paid in stages
   — the month you closed and the month you got paid are different facts.
   Money now lands in the month the PAYMENT is dated. */
const paymentsOf=l=>Array.isArray(l&&l.payments)?l.payments:[];
/* Revenue reads BOTH arrays. Cash is cash — a retainer payment arriving is
   money in, exactly like a deposit — so splitting the storage must not move a
   single month's revenue. */
const paidInMonth=(l,mKey)=>paymentRows(l).reduce((a,p)=>
  a+((p.date&&String(p.date).slice(0,7)===mKey)?num(p.amount):0),0);
const closedDealsInMonth=(l,mKey)=>((l&&l.closedDeals)||[]).reduce((a,d)=>a+((d.closedAt&&String(d.closedAt).slice(0,7)===mKey)?num(d.amount):0),0);
const upsellValueOf=l=>dealsOf(l).filter(isUpsellDeal).reduce((a,d)=>a+dealBits(d),0);
const closedDealsCountInMonth=(l,mKey)=>((l&&l.closedDeals)||[]).filter(d=>d.closedAt&&String(d.closedAt).slice(0,7)===mKey).length;
const funnelOf=(leads,stages)=>{ const flow=(stages||[]).filter(s=>!s.lost); if(!flow.length) return [];
  const reached=flow.map(()=>0);
  (leads||[]).forEach(l=>{ let i=flow.findIndex(s=>s.key===l.stage);
    (l.activities||[]).forEach(a=>{ if(a&&typeof a.text==='string'&&a.text.startsWith('Stage moved:')){
      const to=a.text.split('\u2192').pop().trim(); const j=flow.findIndex(s=>s.label===to); if(j>i) i=j; } });
    if(i<0) i=0; for(let k=0;k<=i;k++) reached[k]++; });
  const closed=reached[reached.length-1]||0;
  return flow.map((s,i)=>({key:s.key,label:s.label,color:s.color,count:reached[i],
    rate:i===0?1:(reached[i-1]?reached[i]/reached[i-1]:0),
    closeRate:reached[i]?closed/reached[i]:0})); };
const actPlural=t=>t==='Booked'?'Booked':t+'s';
/* A 'Booked' activity is only a booking while its meeting still exists.
   Cancelling now flags the activity, but meetings cancelled BEFORE that flag
   existed left no mark at all — so an activity pointing at a meetingId the lead
   no longer holds is treated as cancelled too. That backfill is what makes
   already-deleted test meetings drop off without anyone editing history.
   No meetingId at all = a legacy booking that never had a meeting record;
   meetingsOf() migrates those into real meetings, so they stay live. */
const bookingLive=(l,a)=>{
  if(!a||a.type!=='Booked') return true;
  if(a.cancelled) return false;
  if(!a.meetingId) return true;
  return (l.meetings||[]).some(m=>m.id===a.meetingId);
};
const fmtCustom=(v,type)=>{if(v===undefined||v==='')return '—';if(type==='checkbox')return v?'✓':'—';return String(v);};
const DEFAULT_LEAD_COLS=[
  {key:'businessType',visible:true},{key:'stage',visible:true},{key:'source',visible:true},
  {key:'nextAction',visible:true},{key:'lastContacted',visible:true},{key:'followUp',visible:true},
  {key:'priority',visible:true},{key:'dealValue',visible:true},{key:'owner',visible:true},
  {key:'serviceInterest',visible:false},{key:'nextSteps',visible:false},{key:'phone',visible:false},{key:'email',visible:false},{key:'sponsor',visible:false},
];

/* ===================== data + auth live in ./lib/supabase ===================== */

const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
/* AUDIT #1. ONE caption for the collected figure, so the dashboard tile and the
   Money tile cannot describe the same number in two different ways. Both sources
   are always visible: money that came from client work, and money that did not.
   Owner contributions are excluded from revenue and named separately — your own
   capital going in is not the business earning it. */
const revenueSplit=m=>{
  const bits=[`${usd(m.clientRevenueMonth)} from clients`];
  bits.push(`${usd(m.otherIncomeMonth)} other`);
  if(m.contribMonth>0) bits.push(`${usd(m.contribMonth)} owner contribution, not counted`);
  return bits.join(' · ');
};
const usdK=v=>{v=num(v);return Math.abs(v)>=1000?'$'+(v/1000).toFixed(v%1000===0?0:1)+'k':'$'+Math.round(v);};
const daysSince=ts=>Math.floor((Date.now()-new Date(ts))/86400000);
const monthKey=d=>{d=new Date(d);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const monthLabel=k=>{const[y,m]=k.split('-');return new Date(+y,+m-1,1).toLocaleString('en-US',{month:'short'});};
const lastNMonths=n=>{const out=[];const d=new Date();d.setDate(1);for(let i=n-1;i>=0;i--){const x=new Date(d);x.setMonth(d.getMonth()-i);out.push(monthKey(x));}return out;};
const sIdx=(k,stages)=>{const i=stages.findIndex(s=>s.key===k);return i<0?0:i;};
/* REP-AUDIT #14. `rep` is threaded in for ONE column. A rep is paid on the deal
   so they see its value on leads they OWN — but a sortable Deal column over an
   UNCLAIMED pool turns the queue into a leaderboard: sort descending, claim the
   top, and "first come, first served" quietly becomes "highest value first".
   It is also the number least worth trusting there, since an unclaimed lead's
   value is usually a guess typed at import or on a first call. */
function leadColumnDefs(stages,customFields,rep){
  const d={
    businessType:{label:'Type',render:l=><span className="subcell">{l.businessType}</span>},
    company:{label:'Company',render:l=><span className="subcell">{l.company}</span>},
    stage:{label:'Stage',render:l=><StageBadge k={l.stage} stages={stages}/>},
    source:{label:'Source',render:l=><span className="subcell">{l.source||'—'}</span>},
    serviceInterest:{label:'Service',render:l=><span className="subcell">{(l.serviceInterest||[]).join(', ')||'—'}</span>},
    nextAction:{label:'Next Action',render:l=><span className="subcell">{l.nextAction}</span>},
    nextSteps:{label:'Next Steps',render:l=><span className="subcell">{l.nextSteps||'—'}</span>},
    /* A lead with no activities AND no createdAt has no date to count from —
       new Date('') is Invalid Date, so daysSince() returns NaN and this rendered
       the literal string "NaNd ago". Imports and hand-made rows both produce it.
       An em-dash is the honest answer: not "today", which is a claim, and not a
       zero, which would quietly satisfy the cold filters. Found by
       tests/dom.test.mjs, which is the first thing that file has caught since it
       was made able to report. */
    lastContacted:{label:'Last Contact',render:l=>{const ds=daysSince(lastContact(l));
      if(!Number.isFinite(ds)) return <span className="subcell">—</span>;
      return <span className="subcell" style={ds>=14?{color:RED,fontWeight:600}:undefined}>{ds===0?'Today':ds+'d ago'}</span>;}},
    followUp:{label:'Follow-up',render:l=><Due iso={l.followUp}/>},
    priority:{label:'Priority',render:l=><PriBadge p={l.priority}/>},
    dealValue:{label:'Deal',render:l=>(rep&&isPoolLead(l))
      ? <span className="subcell" title="Claim this lead to see what it is worth">—</span>
      : <span style={{fontWeight:600,color:INK}}>{l.dealValue>0?usd(l.dealValue):'—'}</span>},
    owner:{label:'Owner',render:l=><span className="subcell">{l.owner}</span>},
    phone:{label:'Phone',render:l=><span className="subcell">{l.phone||'—'}</span>},
    email:{label:'Email',render:l=><span className="subcell">{l.email||'—'}</span>},
    sponsor:{label:'Sponsor',render:l=>l.pastSponsor?<span className="spon-badge past">Past{l.sponsorAmount>0?' · '+usd(l.sponsorAmount):''}</span>:l.potentialSponsor?<span className="spon-badge">Potential{l.sponsorAmount>0?' · '+usd(l.sponsorAmount):''}</span>:<span className="subcell">—</span>},
  };
  (customFields||[]).forEach(f=>{d['cf:'+f.id]={label:f.label,render:l=><span className="subcell">{fmtCustom(l.custom?.[f.id],f.type)}</span>};});
  return d;
}
function mergeLeadCols(saved,customFields){
  const base=Array.isArray(saved)&&saved.length?saved.slice():DEFAULT_LEAD_COLS.slice();
  const valid=new Set(DEFAULT_LEAD_COLS.map(c=>c.key).concat((customFields||[]).map(f=>'cf:'+f.id)));
  let cols=base.filter(c=>valid.has(c.key));
  DEFAULT_LEAD_COLS.forEach(dd=>{if(!cols.find(c=>c.key===dd.key))cols.push({...dd});});
  (customFields||[]).forEach(f=>{const k='cf:'+f.id;if(!cols.find(c=>c.key===k))cols.push({key:k,visible:false});});
  return cols;
}

/* builds the intro forest + a tidy left-to-right layout */
function buildNetwork(contacts){
  const byId={}; contacts.forEach(c=>byId[c.id]=c);
  const parentOf=id=>{const c=byId[id];const p=c&&c.introducedBy;return (p&&p!==id&&byId[p])?p:null;};
  const kids={}; contacts.forEach(c=>{const p=parentOf(c.id); if(p)(kids[p]=kids[p]||[]).push(c.id);});
  Object.values(kids).forEach(a=>a.sort((x,y)=>(byId[x].name||'').localeCompare(byId[y].name||'')));
  const inNet=new Set();
  contacts.forEach(c=>{ if(parentOf(c.id)||(kids[c.id]||[]).length) inNet.add(c.id); });
  const roots=[...inNet].filter(id=>!parentOf(id)).sort((a,b)=>{
    const ca=(kids[a]||[]).length, cb=(kids[b]||[]).length;
    return cb-ca||(byId[a].name||'').localeCompare(byId[b].name||'');
  });
  const nodes=[],links=[]; let leaf=0; const seen=new Set();
  const place=(id,depth)=>{
    if(seen.has(id))return null;
    seen.add(id);
    const ch=(kids[id]||[]).filter(k=>!seen.has(k));
    let y;
    if(!ch.length){ y=leaf; leaf+=1; }
    else{ const ys=ch.map(k=>place(k,depth+1)).filter(v=>v!=null); y=ys.length?(ys[0]+ys[ys.length-1])/2:(leaf++); ch.forEach(k=>links.push([id,k])); }
    nodes.push({id,depth,y,kids:(kids[id]||[]).length});
    return y;
  };
  roots.forEach(r=>place(r,1));
  const depth=nodes.length?Math.max(...nodes.map(n=>n.depth)):0;
  return {byId,kids,roots,nodes,links,inNet,rows:leaf,maxDepth:depth};
}
/* ===================== invoicing ===================== */
const DEFAULT_INV_SECTIONS={ headerLeft:{fz:10,lh:1.55}, headerRight:{fz:10,lh:1.4}, billto:{fz:10,lh:1.45}, items:{fz:10.5,lh:1.5}, totals:{fz:10.5,lh:1.5}, pay:{fz:10,lh:1.45}, notes:{fz:9.5,lh:1.5} };
const DEFAULT_INVOICING={ biz:{ name:BRAND.biz.name, address:BRAND.biz.address, email:BRAND.biz.email, phone:BRAND.biz.phone }, prefix:'INV-', seq:1, taxRate:0, terms:14, notes:'Thank you for your business.', paymentLink:'', accent:'#2B4DE0', logoH:46, showNotes:true, showPay:true, showLogo:true, layout:{order:['billto','items','totals','pay','notes'],headerSwap:false}, sections:DEFAULT_INV_SECTIONS };
const invSubtotal=inv=>(inv.items||[]).reduce((a,it)=>a+num(it.qty)*num(it.amount),0);
const invTax=inv=>invSubtotal(inv)*num(inv.taxRate)/100;
const invTotal=inv=>invSubtotal(inv)+invTax(inv);
const invState=inv=>{ if(inv.status==='paid') return 'paid'; if(inv.dueDate&&daysUntil(inv.dueDate)<0) return 'overdue'; return inv.status||'draft'; };
const addDays=(iso,n)=>{ const d=new Date((iso||todayISO())+'T00:00:00'); d.setDate(d.getDate()+num(n)); return isoOf(d); };
function itemsFromLead(l){ const items=[];
  const pushDeal=(d,prefix)=>{ if(num(d.setup)) items.push({id:uid(),label:(prefix||'')+'Setup',qty:1,amount:num(d.setup)}); if(num(d.website)) items.push({id:uid(),label:(prefix||'')+'Website',qty:1,amount:num(d.website)}); if(num(d.integration)) items.push({id:uid(),label:(prefix||'')+'AI / Integration',qty:1,amount:num(d.integration)}); (d.extras||[]).forEach(e=>{ if(num(e.amount)) items.push({id:uid(),label:(prefix||'')+(e.label||'Line item'),qty:1,amount:num(e.amount)}); }); };
  const deals=Array.isArray(l&&l.deals)?l.deals:null;
  if(deals&&deals.length){ deals.forEach(d=>pushDeal(d,deals.length>1&&d.label?`${d.label} — `:'')); }
  else { const d=(l&&l.deal&&typeof l.deal==='object')?l.deal:null;
    if(d){ pushDeal(d,''); }
    else if(l&&num(l.dealValue)){ items.push({id:uid(),label:'Project',qty:1,amount:num(l.dealValue)}); } }
  if(l&&l.retainerActive&&num(l.retainer)) items.push({id:uid(),label:'Monthly retainer',qty:1,amount:num(l.retainer)});
  if(!items.length) items.push({id:uid(),label:'',qty:1,amount:0});
  return items; }

/* ===================== seed (your real board) ===================== */
function mkLead(o){
  const createdAt=o.createdAt||new Date(Date.now()-((o._ago||0)*36e5)).toISOString();
  const acts=[{id:uid(),ts:createdAt,type:'Note',text:'Lead created.'}];
  if(o.note) acts.unshift({id:uid(),ts:createdAt,type:'Note',text:o.note});
  const {note,_ago,...rest}=o;
  return {id:uid(),name:'',company:'',businessType:'—',phone:'',email:'',website:'',
    stage:'new',priority:'medium',source:'',nextAction:'Follow Up Call',nextSteps:'',
    followUp:'',expectedClose:'',serviceInterest:[],owner:BRAND.team[0]||'',dealValue:0,retainer:0,
    potentialSponsor:false,pastSponsor:false,sponsorTier:'',sponsorAmount:0,
    labels:[],keyDates:[],
    isRelationship:false,introducedBy:'',relNote:'',relTier:'',
    retainerActive:false,retainerStart:'',closedAt:'',closedDeals:[],custom:{},createdAt,activities:acts,...rest};
}
/* Demo seed. A fresh client install starts EMPTY on purpose — never ship real
   pipeline data into someone else's CRM. Set VITE_SEED_DEMO=true on a demo
   deploy to populate these obviously-fake sample leads instead. */
const DEMO_SEED=(import.meta.env.VITE_SEED_DEMO||'').toString().toLowerCase()==='true';
function seed(){
  if(!DEMO_SEED) return [];
  const A=BRAND.team[0]||'Owner', B=BRAND.team[1]||A;
  return [
  mkLead({_ago:8,name:'Sample Client',company:'Northside Realty',businessType:'Real Estate',stage:'contacted',priority:'high',source:'Referral',owner:A,nextAction:'Follow up',dealValue:1200}),
  mkLead({_ago:6,name:'Demo Prospect',company:'Meridian Lending',businessType:'Lending',stage:'meeting',priority:'medium',source:'Networking',owner:B,nextAction:'Send proposal',dealValue:1499}),
  mkLead({_ago:4,name:'Example Lead',company:'Bright Path Insurance',businessType:'Professional Services',stage:'new',priority:'low',source:'Website',owner:BRAND.pool,nextAction:'Intro call'}),
  mkLead({_ago:2,name:'Test Contact',company:'Harbor Group',businessType:'Real Estate',stage:'proposal',priority:'high',source:'Referral',owner:A,nextAction:'Close',dealValue:2400}),
];}

/* ===================== CSS ===================== */
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
.pt{font-family:'Inter',system-ui,sans-serif;color:#221f3d;display:flex;min-height:100vh;background:#F4F6FB}
.pt h1,.pt h2,.pt h3,.pt h4,.disp{font-family:'Space Grotesk',sans-serif;letter-spacing:-.01em}
.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#211d44,${INK})}
.gate-card{background:#fff;border-radius:20px;padding:38px 34px;width:340px;max-width:calc(100vw - 32px);box-shadow:0 30px 80px -30px rgba(0,0,0,.6);text-align:center}
.gate-card h2{font-size:20px;color:${INK};margin:14px 0 4px}.gate-card p{font-size:13px;color:#8E89A8;margin-bottom:20px}
.gate-card input{width:100%;padding:12px 14px;border:1px solid #DEDFEA;border-radius:10px;font-size:15px;text-align:center;letter-spacing:.04em;margin-bottom:12px}
.gate-card input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.gate-err{color:${RED};font-size:12.5px;font-weight:600;margin-bottom:10px}
.sb{width:236px;flex:none;background:linear-gradient(180deg,#0F1433 0%,#0A0E27 55%,#05071A 100%);color:#fff;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;padding:20px 14px;z-index:30}
.sb-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:.9}
/* everything else has to sit above the art */
.sb>*:not(.sb-art){position:relative;z-index:1}
.sb-pulse circle{animation:sbp 4.5s ease-in-out infinite}
.sb-pulse circle:nth-child(2){animation-delay:1.5s}
.sb-pulse circle:nth-child(3){animation-delay:3s}
@keyframes sbp{0%,100%{opacity:.25}50%{opacity:.85}}
@media(prefers-reduced-motion:reduce){.sb-pulse circle{animation:none;opacity:.5}}
.sb-brand{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:22px 14px 18px;margin:-4px -6px 14px}
.sb-brand img{max-height:112px;max-width:196px;object-fit:contain;position:relative;z-index:1;border-radius:16px}
.sb-brand b{font-family:'Space Grotesk';font-size:19px;font-weight:700;letter-spacing:-.01em;position:relative;z-index:1}
/* the bloom that replaces the box — same trick as the bright node in the
   reference art, so the mark reads as lit rather than stuck on */
.sb-glow{position:absolute;top:-6px;left:50%;transform:translateX(-50%);
  width:220px;height:170px;pointer-events:none;
  background:radial-gradient(50% 50% at 50% 40%,rgba(56,189,248,.30),rgba(43,77,224,.16) 45%,transparent 72%);
  filter:blur(2px)}
.sb-sub{position:relative;z-index:1;font-family:'Space Mono',ui-monospace,monospace;
  font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:#7FC8F0;
  text-shadow:0 0 12px rgba(56,189,248,.5);margin-top:4px}
/* a hairline under the mark, brightest in the middle — the panel's own divider
   rather than a border box */
.sb-brand::after{content:'';position:absolute;left:14px;right:14px;bottom:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(56,189,248,.42),transparent)}
.nucleus{width:14px;height:14px;border-radius:50%;background:${COBALT};box-shadow:0 0 0 4px rgba(43,77,224,.25),0 0 14px 2px rgba(92,118,238,.6);flex:none}
.sb-brand b{font-family:'Space Grotesk';font-size:16px;font-weight:600}
.sb-brand span{display:block;font-size:11px;color:#A9A4CC;font-weight:400;letter-spacing:.04em}
.nav-i{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;color:#C7C3E6;font-size:14px;font-weight:500;cursor:pointer;transition:.16s;border:none;background:none;width:100%;text-align:left;margin-bottom:2px}
.nav-i:hover{background:rgba(255,255,255,.06);color:#fff;backdrop-filter:blur(2px)}.nav-i.on{background:linear-gradient(90deg,color-mix(in srgb,${COBALT} 46%,transparent),color-mix(in srgb,${COBALT} 16%,transparent));color:#fff;box-shadow:inset 2px 0 0 #38BDF8,0 0 22px -8px rgba(56,189,248,.55)}
.nav-i.on svg{color:#7FD8FF};color:#fff;box-shadow:0 6px 18px -8px rgba(43,77,224,.9);position:relative}
.nav-i.on::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:3px;background:#FFA500}
.nav-i svg{flex:none}
.nav-i.nav-edit{cursor:grab;background:rgba(255,255,255,.05);color:#E8E6F7}
.nav-i.nav-edit:active{cursor:grabbing}
.nav-i.nav-edit.dragging{opacity:.4}
.nav-grip{color:#8C88B8}
.nav-l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-mv{display:flex;gap:3px;flex:none}
.nav-mv button{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);border-radius:6px;color:#E8E6F7;cursor:pointer;padding:0}
.nav-mv button:disabled{opacity:.3;cursor:not-allowed}
.nav-i.nav-reorder{margin-top:8px;font-size:12.5px;color:#9C98C4}
.nav-i.nav-reorder.on{background:${COBALT};color:#fff}
.nav-i.nav-reset{font-size:12px;color:#9C98C4;padding-top:6px;padding-bottom:6px}
/* min-height:0 is what actually makes this scroll: a flex child defaults to
   min-height:auto and refuses to shrink below its content, so without it the
   list just overflows the sidebar and the pinned block gets pushed off. */
.sb-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;margin:0 -4px;padding:0 4px}
.sb-scroll::-webkit-scrollbar{width:6px}
.sb-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:3px}
.sb-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.28)}
.sb-scroll{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}
/* a hairline that only shows when there's more above/below, so a short list
   doesn't get a divider it doesn't need */
.sb-fixed{flex:none;padding-top:8px;margin-top:4px;border-top:1px solid rgba(255,255,255,.08)}
.sb-foot{font-size:11px;color:#888;padding:12px 8px 2px;line-height:1.5}.sb-foot b{color:#B9B5D8;font-weight:600}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 30px;background:#fff;border-bottom:1px solid #E8E9F2;position:sticky;top:0;z-index:20}
.top h1{font-size:21px;font-weight:600}.top .sub{font-size:13px;color:#777296;margin-top:2px}
.body{padding:26px 30px 60px;width:100%;max-width:1320px}
.hamb{display:none;background:none;border:none;color:${INDIGO};cursor:pointer}
.kgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(176px,1fr));gap:16px;margin-bottom:22px}

/* ---- intake panel: what came in, and when --------------------------------
   Built from the JARVIS vocabulary on purpose — navy plate, 26px circuit grid,
   arc reactor, lit cyan edges, monospace telemetry. This is the loud tile. */
.intake{position:relative;overflow:hidden;border-radius:16px;padding:17px 19px 15px;margin-bottom:22px;
  background:radial-gradient(820px 300px at 10% -45%,rgba(56,189,248,.18),transparent 62%),
             linear-gradient(160deg,#12173A 0%,#0A0E27 58%,#05071A 100%);
  border:1px solid rgba(56,189,248,.24);
  box-shadow:0 22px 54px -34px rgba(10,14,39,.95),inset 0 1px 0 rgba(127,216,255,.13)}
.intake::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.55;
  background:repeating-linear-gradient(0deg,rgba(91,141,239,.075) 0 1px,transparent 1px 26px),
             repeating-linear-gradient(90deg,rgba(91,141,239,.075) 0 1px,transparent 1px 26px)}
.intake>*{position:relative;z-index:1}
.ik-head{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:15px}
.ik-arc{width:22px;height:22px;flex:none;border-radius:50%;position:relative;
  background:radial-gradient(circle,#EAFBFF 0%,#7FD8FF 20%,#38BDF8 42%,rgba(43,77,224,.34) 64%,transparent 76%);
  box-shadow:0 0 14px rgba(56,189,248,.8),inset 0 0 6px rgba(234,251,255,.5)}
.ik-arc::after{content:'';position:absolute;inset:6px;border-radius:50%;border:1px solid rgba(234,251,255,.9)}
.ik-ttl{font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:#F2FCFF;letter-spacing:.13em;text-transform:uppercase;line-height:1.1}
.ik-ttl i{display:block;font-family:'Space Mono',ui-monospace,monospace;font-style:normal;font-size:9.5px;
  font-weight:400;letter-spacing:.2em;color:rgba(127,216,255,.6);margin-top:3px}
.ik-ranges{margin-left:auto;display:flex;gap:5px;flex-wrap:wrap}
.ik-r{font-family:'Space Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.09em;text-transform:uppercase;
  background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.2);color:#9FC4E8;
  border-radius:7px;padding:6px 10px;cursor:pointer;transition:.15s}
.ik-r:hover{background:rgba(56,189,248,.14);color:#EAF9FF;border-color:rgba(56,189,248,.4)}
.ik-r.on{background:linear-gradient(90deg,rgba(43,77,224,.55),rgba(43,77,224,.2));color:#fff;
  border-color:rgba(56,189,248,.5);box-shadow:inset 2px 0 0 #38BDF8,0 0 20px -8px rgba(56,189,248,.8)}
.ik-nums{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.ik-n{display:flex;flex-direction:column;gap:5px;min-width:118px}
.ik-n b{font-family:'Space Grotesk',sans-serif;font-size:40px;font-weight:700;color:#F2FCFF;line-height:1;
  text-shadow:0 0 26px rgba(56,189,248,.5)}
.ik-n span{font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.18em;
  text-transform:uppercase;color:rgba(127,216,255,.6)}
.ik-n.rel b{color:#F6E7C8;text-shadow:0 0 26px rgba(224,162,43,.5)}
.ik-n.rel span{color:rgba(224,162,43,.72)}
.ik-sep{width:1px;align-self:stretch;min-height:44px;background:linear-gradient(180deg,transparent,rgba(56,189,248,.32),transparent)}
.ik-list{margin-top:15px;border-top:1px solid rgba(56,189,248,.14);padding-top:9px;display:flex;flex-direction:column;gap:1px}
.ik-row{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;
  padding:7px 9px;border-radius:8px;cursor:pointer;font-family:inherit;transition:.14s}
.ik-row:hover{background:linear-gradient(90deg,rgba(43,77,224,.4),rgba(43,77,224,.1));box-shadow:inset 2px 0 0 #38BDF8}
.ik-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#38BDF8;box-shadow:0 0 8px rgba(56,189,248,.9)}
.ik-dot.rel{background:#E0A22B;box-shadow:0 0 8px rgba(224,162,43,.9)}
.ik-nm{font-size:13px;color:#EAF9FF;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ik-meta{font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;
  color:rgba(127,216,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ik-when{margin-left:auto;font-family:'Space Mono',ui-monospace,monospace;font-size:10px;color:rgba(127,216,255,.55);flex:none}
.ik-more{font-family:'Space Mono',ui-monospace,monospace;font-size:10px;color:rgba(127,216,255,.45);padding:6px 9px;letter-spacing:.1em}
.ik-empty{margin-top:14px;border-top:1px solid rgba(56,189,248,.14);padding-top:13px;
  font-size:12.5px;color:rgba(159,196,232,.6)}
@media(max-width:640px){.ik-ranges{margin-left:0;width:100%}.ik-n b{font-size:32px}.ik-sep{display:none}
  .ik-nums{gap:16px}.ik-meta{display:none}}
.kpi{background:#fff;border:1px solid #E8E9F2;border-radius:16px;padding:18px;box-shadow:0 12px 30px -26px rgba(24,21,48,.5)}
.kpi .kl{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8E89A8;display:flex;align-items:center;gap:7px}
.kpi .kv{font-family:'Space Grotesk';font-size:26px;font-weight:600;margin-top:9px;color:${INK};line-height:1}
.kpi .kd{font-size:12.5px;font-weight:600;margin-top:8px;color:#8E89A8}
/* The headline tiles are the JARVIS plate: deep navy, a faint circuit grid, a
   lit cyan top edge and a cyan glow on the number. Everything dense and
   tabular below stays light — a spreadsheet on a dark plate is harder to read,
   and "exciting" is not worth paying for with legibility. */
.kpi.accent{position:relative;overflow:hidden;border:1px solid rgba(56,189,248,.26);
  background:radial-gradient(420px 180px at 12% -30%,rgba(56,189,248,.2),transparent 62%),
             linear-gradient(160deg,#12173A 0%,#0A0E27 60%,#05071A 100%);
  box-shadow:0 16px 38px -26px rgba(10,14,39,.95),inset 0 1px 0 rgba(127,216,255,.14)}
.kpi.accent::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.5;
  background:repeating-linear-gradient(0deg,rgba(91,141,239,.075) 0 1px,transparent 1px 26px),
             repeating-linear-gradient(90deg,rgba(91,141,239,.075) 0 1px,transparent 1px 26px)}
.kpi.accent>*{position:relative;z-index:1}
.kpi.accent .kl,.kpi.accent .kd{color:#9FC4E8}
.kpi.accent .kl{font-family:'Space Mono',ui-monospace,monospace;letter-spacing:.16em}
.kpi.accent .kv{color:#F2FCFF;text-shadow:0 0 24px rgba(56,189,248,.5)}
.kpi.accent svg{color:#7FD8FF}
.kpi.gold{background:linear-gradient(135deg,${GOLD},#B0862F);border:none}.kpi.gold .kl,.kpi.gold .kd{color:#fff5e0}.kpi.gold .kv{color:#fff}
.kpi.green{background:linear-gradient(135deg,${GREEN},#178047);border:none}.kpi.green .kl,.kpi.green .kd{color:#dafce8}.kpi.green .kv{color:#fff}
.row{display:grid;gap:18px;margin-bottom:18px}.r2{grid-template-columns:1fr 1fr}.r3{grid-template-columns:2fr 1fr}
@media(max-width:900px){.r2,.r3{grid-template-columns:1fr}}
.card{background:#fff;border:1px solid #E8E9F2;border-radius:16px;padding:20px;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.card h3{font-size:15px;font-weight:600;color:${INK};margin-bottom:3px}.card .ch-sub{font-size:12.5px;color:#8E89A8;margin-bottom:14px}
.chart-h{height:250px}.chart-sm{height:210px}
.sec-title{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#928DAD;margin:6px 0 14px;display:flex;align-items:center;gap:8px}
.empty{padding:26px;text-align:center;color:#A6A2BC;font-size:13.5px}
.btn{font-family:'Inter';font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;border:none;cursor:pointer;transition:.16s;display:inline-flex;align-items:center;gap:8px}
.btn-p{background:${COBALT};color:#fff;box-shadow:0 8px 20px -10px rgba(43,77,224,.8)}.btn-p:hover{background:#2340bd}
.btn-g{background:#F0F1F7;color:#56527a}.btn-g:hover{background:#E6E7F1}
.btn-d{background:#fff;color:${RED};border:1px solid #F0CACA}.btn-d:hover{background:#FCEDED}
.btn-sm{padding:7px 12px;font-size:12.5px;border-radius:8px}
.pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.tag{font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:6px;background:#EEF0FA;color:#5A5680;white-space:nowrap}
/* table */
.tbl-wrap{background:#fff;border:1px solid #E8E9F2;border-radius:16px;overflow:auto;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.colmenu-wrap{position:relative}
.cm-back{position:fixed;inset:0;z-index:39}
.colmenu{position:absolute;top:46px;right:0;z-index:40;background:#fff;border:1px solid #E8E9F2;border-radius:14px;box-shadow:0 20px 50px -20px rgba(24,21,48,.5);padding:8px;width:252px;max-width:calc(100vw - 32px);max-height:380px;overflow-y:auto}
.colmenu .cm-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px}
.colmenu .cm-row:hover{background:#FAFAFD}
.colmenu .cm-name{flex:1;font-size:13px;color:#3a3658}
.colmenu .cm-lock{font-size:10.5px;color:#B6B2CC;text-transform:uppercase;letter-spacing:.04em}
.colmenu input[type=checkbox]{width:15px;height:15px;accent-color:${COBALT};cursor:pointer}
.tbl th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#9C98B4;font-weight:500;padding:13px 14px;border-bottom:1px solid #E8E9F2;background:#FBFBFE;cursor:pointer;user-select:none;white-space:nowrap;position:sticky;top:0}
.tbl th .ar{opacity:.4;margin-left:4px}.tbl th.sorted{color:${COBALT}}.tbl th.sorted .ar{opacity:1}
.tbl td{padding:13px 14px;border-bottom:1px solid #F0F0F6;color:#3a3658;white-space:nowrap}
.tbl tbody tr{cursor:pointer}.tbl tbody tr:hover td{background:#FAFAFD}.tbl tr:last-child td{border-bottom:none}
.namecell{font-weight:600;color:${INK}}.subcell{font-size:12px;color:#928DAD}
.due{font-weight:600}.due.over{color:${RED}}.due.today{color:${GOLD}}.due.soon{color:${COBALT}}.due.far{color:#8E89A8}
.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.searchbox{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #DEDFEA;border-radius:10px;padding:8px 12px;flex:1;min-width:200px}
.searchbox input{border:none;outline:none;font-size:14px;width:100%;font-family:'Inter';color:${INK}}
.selctl{padding:9px 12px;border:1px solid #DEDFEA;border-radius:10px;font-size:13.5px;font-family:'Inter';background:#fff;color:#56527a;cursor:pointer}
/* kanban (cleaner) */
.kanban{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px;align-items:stretch}
.kcol{background:#fff;border:1px solid #E8E9F2;border-radius:16px;display:flex;flex-direction:column;min-height:140px;overflow:hidden;box-shadow:0 12px 30px -28px rgba(24,21,48,.5);flex:1 0 260px;min-width:260px}
.kcol.drag{outline:2px dashed ${COBALT};outline-offset:-2px}
.kbar{height:4px;width:100%}
.kcol-h{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 4px}
.kcol-h .kt{font-family:'Space Grotesk';font-weight:600;font-size:14px;color:${INK}}
.kcol-h .kc{font-size:11px;font-weight:700;color:#928DAD;background:#F1F2F8;border-radius:20px;padding:2px 9px}
.kcol-v{font-size:11.5px;color:#928DAD;padding:0 14px 10px;font-weight:600}
.kcol-body{padding:6px 10px 12px;flex:1;overflow-y:auto}
.kcard{background:#fff;border:1px solid #E8E9F2;border-radius:12px;padding:12px;margin-bottom:9px;cursor:pointer;box-shadow:0 4px 12px -10px rgba(24,21,48,.5);transition:.14s}
.kcard:hover{box-shadow:0 14px 28px -16px rgba(24,21,48,.5);transform:translateY(-1px);border-color:#D9DBEC}
.kcard .kn{font-weight:600;font-size:14px;color:${INK};display:flex;align-items:center;gap:6px}
.kcard .kco{font-size:12px;color:#777296;margin:2px 0 9px}
.kdeals{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 9px}
.kdeal{font-size:11px;font-weight:700;color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff);border:1px solid color-mix(in srgb,${COBALT} 18%,#fff);border-radius:8px;padding:2px 8px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kcard .ktags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px}
.kcard .kmeta{display:flex;align-items:center;justify-content:space-between;gap:6px}
.kdrop{font-size:12px;color:#B6B2CC;text-align:center;padding:16px 0;border:1.5px dashed #E4E5F0;border-radius:10px;margin:2px 4px 8px}
.kcol.drag{outline:2px dashed ${COBALT};outline-offset:-3px;box-shadow:0 0 0 4px rgba(43,77,224,.1),0 12px 30px -22px ${COBALT}}
.kcard.dragging{opacity:.55;transform:rotate(2deg) scale(.98);box-shadow:0 18px 36px -14px rgba(24,21,48,.6)}
.kcard.od{border-left:3px solid ${RED}}
.kcard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.kown{flex:none;width:22px;height:22px;border-radius:50%;background:${INDIGO};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk'}
.kvals{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.kdv{font-size:12.5px;font-weight:700;color:${INK}}
.kltv{font-size:11.5px;font-weight:800;color:#1a7d46;background:color-mix(in srgb,${GREEN} 10%,#fff);border-radius:12px;padding:1px 8px}
.kmrr{font-size:10.5px;font-weight:700;color:${GREEN};background:rgba(31,157,85,.1);padding:2px 7px;border-radius:20px}
.kstale{display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:10.5px;font-weight:700;color:#A9732B;background:rgba(200,135,40,.12);padding:3px 8px;border-radius:20px}
.kmove{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:10px;padding-top:9px;border-top:1px solid #F1F1F7}
.kmv{flex:none;width:30px;height:28px;border-radius:8px;border:1px solid #E4E5F0;background:#fff;color:${COBALT};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.13s}
.kmv:hover:not(:disabled){background:${COBALT};color:#fff;border-color:${COBALT}}
.kmv:disabled{color:#D2D2DE;cursor:default}
.kmv-s{flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#A6A2BC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kwtd{color:#B6B2CC;font-weight:600}
.kcoll-x{border:none;background:#F1F2F8;color:#928DAD;width:22px;height:22px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center}.kcoll-x:hover{background:#E4E5F0}
.kcollapsed{flex:0 0 58px;min-width:58px;max-width:58px;cursor:pointer;align-items:stretch}
.kcollapsed:hover{border-color:#D9DBEC;box-shadow:0 12px 30px -20px rgba(24,21,48,.5)}
.kcoll-body{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 0}
.kcoll-exp{color:#B6B2CC}
.kcoll-label{writing-mode:vertical-rl;transform:rotate(180deg);font-family:'Space Grotesk';font-weight:600;font-size:13px;color:${INK};letter-spacing:.02em}
/* modal */
.scrim2{position:fixed;inset:0;background:rgba(24,21,48,.5);z-index:50;display:flex;align-items:center;justify-content:center;padding:24px}
.modal{width:960px;max-width:96vw;max-height:90vh;background:#F4F6FB;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 40px 100px -30px rgba(0,0,0,.6);animation:pop .18s ease}
/* THE LEAD VIEW IS A SURFACE, NOT A DIALOG.
   Scoped with .lead so the five other modals keep the 960px card above — this
   is the screen you spend the day in, and 960px is what made it cramped.
   It behaves like a page and does NOT unmount the page behind it, which is the
   whole reason it stays a modal: closing it returns the Leads table with its
   filters, its sort, its scroll position and its multi-select untouched. A
   route cannot do that.
   Inset rather than a true 100vw so the scrim still reads as depth and the
   Escape target stays obvious. */
.scrim2.lead{padding:0}
.modal.lead{width:100%;max-width:none;max-height:none;height:100%;border-radius:0;animation:leadin .16s ease}
@keyframes leadin{from{opacity:0;transform:scale(.995)}to{opacity:1;transform:none}}
@media (min-width:1080px){
  .scrim2.lead{padding:18px}
  .modal.lead{border-radius:18px;height:100%}
}
@keyframes pop{from{transform:scale(.97);opacity:.5}to{transform:none;opacity:1}}
.m-head{background:#fff;border-bottom:1px solid #E8E9F2;padding:18px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
/* THE SCROLLING BODY OF A MODAL, and the reason it needs saying:
   .modal is a flex COLUMN with max-height:90vh and overflow:hidden. A flex item
   defaults to min-height:auto, which refuses to shrink below its own content —
   so a tall body grew past the modal, .modal clipped it, and there was NO
   SCROLLBAR ANYWHERE. Content below the fold became unreachable rather than
   merely off-screen. A 21-column CSV import put the Import button there.
   min-height:0 is what lets the item shrink; overflow-y:auto is what then makes
   the overflow reachable. Neither works without the other.
   Four modals shared the inline style this replaces (account, import, task,
   transaction) and all four had the bug. The lead modal (.m-grid/.m-left) and
   the invoice modal (.inv-body) already did this correctly.

   Named m-scroll and not m-body because the Pocket recording modal already
   carries className="m-body" as a DEAD class with no rule behind it — reusing
   the name would have silently started styling a component this change never
   looked at. */
.m-scroll{padding:4px 22px 22px;min-height:0;overflow-y:auto}
.m-head h2{font-size:21px;color:${INK}}.m-head .co{font-size:16px;font-weight:500;color:#5A5680;margin-top:4px}
.m-head .meta{font-size:11.5px;color:#A6A2BC;margin-top:6px}
.m-head .qa{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}
.qbtn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${COBALT};background:rgba(43,77,224,.08);border:none;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none}
.qbtn:hover{background:rgba(43,77,224,.15)}
.m-x{background:#F0F1F7;border:none;border-radius:9px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a;flex:none}.m-x:hover{background:#E6E7F1}.m-x:disabled{opacity:.35;cursor:default}
.m-grid{display:grid;grid-template-columns:1.15fr .85fr;overflow:hidden;flex:1;min-height:0}
/* THREE COLUMNS: prep · history · record.
   The rails are FIXED and the middle takes every pixel of slack, because the
   old 1.15fr/.85fr split shared the extra width out proportionally — which at
   960px was fine and at 1800px gave a column of short text inputs half the
   screen while the activity log, the thing this is opened for, stayed
   compressed. Width belongs to the feed. */
.m-grid.lead3{grid-template-columns:302px minmax(0,1fr) 344px}
.m-prep{padding:18px 16px;overflow-y:auto;min-height:0;border-right:1px solid #E8E9F2;background:#FAFBFE}
.m-grid.lead3 .m-right{border-left:0;border-right:1px solid #E8E9F2;background:#fff}
.m-grid.lead3 .m-left{background:#F4F6FB}
.touchbar.prep{flex-direction:column;align-items:flex-start;gap:3px}
/* key dates read in the prep rail: no add form, no remove — this is the
   reading copy; Contact stays the place they are edited */
.kd-list.prep .kd-row{padding:5px 0}
.kd-list.prep .kd-row .ev-x{display:none}
/* the follow-up presets: one tap for the four answers people actually give */
.fu-set{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
.fu-chip{border:1px solid #D9DCEC;background:#fff;color:#4a4763;border-radius:7px;padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit}
.fu-chip:hover{border-color:${COBALT};color:${COBALT}}
.fu-chip.clear{margin-left:auto;color:#8b88a0}
.fu-chip.clear:hover{border-color:${RED};color:${RED}}
/* a folded run of machine-written notes: quiet, one tap to open, never hidden */
.sysrun{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;
  background:#F7F8FC;border:1px dashed #DFE1EE;border-radius:9px;padding:7px 11px;margin:2px 0;
  font-family:inherit;font-size:12px;color:#8b88a0}
.sysrun:hover{border-color:#C7CBE0;color:#56527a}
.sysrun b{color:#56527a;font-weight:700}
.sysrun em{font-style:normal;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.75}
.sysrun-ch{flex:none;transition:transform .15s}
.sysrun.open .sysrun-ch{transform:rotate(180deg)}
.fitem.sys{opacity:.72}

/* ============================================================================
   THE LEAD VIEW, PAINTED.  Scoped entirely under .modal.lead — every rule below
   needs that ancestor, so the five other modals and every page keep the light
   CRM they have always had.

   THE PALETTE IS NOT NEW. It is the token set already shipping in
   src/Jarvis.jsx, which itself borrows the sidebar's: the deep navy plate, the
   26px circuit grid, right-angle traces in cobalt-to-cyan. Dark here is the
   THIRD instance of a language this app already speaks, not a fourth idea —
   which is the whole reason it reads as deliberate next to a light Leads table
   rather than as a bug.

   The one rule that carries the look: an active or important thing is a LIT
   EDGE plus a soft outer glow, never a solid slab. Cyan is the machine. Gold is
   anything that needs a person — which is why the follow-up module is gold and
   turns red once it is overdue.
   ========================================================================== */
.modal.lead{
  --arc:#38BDF8; --arc2:#7FD8FF; --arc3:#EAFBFF; --cob:#2B4DE0;
  --gold:#E0A22B; --gold2:#F2C55C; --hot:#C1352B; --ok:#3FB978; --ok2:#7FE3AC;
  --plate:#0F1433; --plate2:#0A0E27; --plate3:#05071A;
  --ink:#DCF3FB; --ink-hi:#F2FCFF; --ink-mid:#BDEAFA;
  --dim:rgba(127,216,255,.52); --faint:rgba(127,216,255,.3);
  --line:rgba(56,189,248,.16); --line-hi:rgba(56,189,248,.34);
  color:var(--ink);
  background:radial-gradient(1200px 460px at 50% -14%,rgba(56,189,248,.17),transparent 64%),
             linear-gradient(180deg,var(--plate) 0%,var(--plate2) 55%,var(--plate3) 100%);
  border:1px solid rgba(56,189,248,.22);
  box-shadow:0 26px 70px -34px rgba(0,0,0,.9),inset 0 1px 0 rgba(127,216,255,.12)}
.modal.lead::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.5;
  background-image:linear-gradient(rgba(56,189,248,.055) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(56,189,248,.055) 1px,transparent 1px);
  background-size:26px 26px}
.modal.lead::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.18;
  background:repeating-linear-gradient(0deg,rgba(56,189,248,.06) 0 1px,transparent 1px 3px)}
.modal.lead>*{position:relative;z-index:1}

/* --- head, jump bar, rails ------------------------------------------------ */
.modal.lead .m-head{background:linear-gradient(180deg,rgba(5,7,26,.62),rgba(5,7,26,.28));border-bottom:1px solid var(--line)}
.modal.lead .m-head h2{color:var(--ink-hi)}
.modal.lead .m-head .co,.modal.lead .m-head .meta{color:var(--dim)}
.modal.lead .m-jump{background:linear-gradient(180deg,rgba(5,7,26,.5),rgba(5,7,26,.22));border-bottom:1px solid var(--line)}
.modal.lead .mj-l{color:var(--dim)}
.modal.lead .m-prep{background:rgba(5,7,26,.24);border-right:1px solid var(--line)}
.modal.lead .m-right{background:rgba(5,7,26,.1);border-right:1px solid var(--line);border-left:0}
.modal.lead .m-left{background:transparent}
.modal.lead .dh{color:var(--ink-mid)}
.modal.lead .subcell,.modal.lead .fmeta{color:var(--dim)}

/* --- controls ------------------------------------------------------------- */
.modal.lead input,.modal.lead select,.modal.lead textarea{
  background:rgba(56,189,248,.05);border:1px solid var(--line-hi);color:var(--ink-hi)}
.modal.lead input:focus,.modal.lead select:focus,.modal.lead textarea:focus{
  outline:none;border-color:rgba(56,189,248,.6);box-shadow:0 0 0 3px rgba(56,189,248,.12)}
.modal.lead input::placeholder,.modal.lead textarea::placeholder{color:var(--faint)}
.modal.lead label{color:var(--dim)}
.modal.lead .m-x{color:var(--arc2);border-color:var(--line-hi);background:rgba(56,189,248,.05)}
.modal.lead .m-x:hover{background:rgba(56,189,248,.14)}

/* --- the fact strip and jump chips: lit edge, not slab -------------------- */
.modal.lead .mf{background:linear-gradient(90deg,rgba(43,77,224,.16),rgba(43,77,224,.04));
  border:1px solid var(--line);box-shadow:inset 2px 0 0 rgba(56,189,248,.5);color:var(--ink)}
.modal.lead .mf i{color:var(--dim)}
.modal.lead .mf b{color:var(--ink-hi)}
/* THE STAGE AND PRIORITY TILES PUT THEIR VALUE IN .mf-v, NOT IN <b>.
   They are the only two that do — they are <label>s wrapping an invisible
   <select>, so the value is a span the picker sits on top of. The paint block
   restyled .mf b and never .mf-v, which left ${INK} — near-black — on the navy
   plate. Legible before PR 4, invisible after it, and only on those two tiles,
   which is why it read as "those two are broken" rather than as a whole row.
   Asserted per-element now in tests/leadcontrast.mjs. */
.modal.lead .mf-v{color:var(--ink-hi)}
.modal.lead .mf.hot{border-color:rgba(224,162,43,.4);box-shadow:inset 2px 0 0 var(--gold)}
.modal.lead .mj{background:rgba(56,189,248,.06);border:1px solid var(--line);color:var(--ink-mid)}
.modal.lead .mj.on{background:linear-gradient(180deg,rgba(56,189,248,.26),rgba(56,189,248,.1));
  border-color:rgba(56,189,248,.55);color:var(--ink-hi);box-shadow:0 0 18px -6px rgba(56,189,248,.9)}

/* --- FOLLOW-UP: gold, because a promise is a person's ---------------------- */
.modal.lead .m-prep .fu-block{border:1px solid rgba(224,162,43,.34);border-radius:12px;padding:12px;
  background:linear-gradient(180deg,rgba(224,162,43,.13),rgba(224,162,43,.03));
  box-shadow:inset 2px 0 0 var(--gold),0 0 30px -14px rgba(224,162,43,.75)}
.modal.lead .m-prep .fu-block label{color:rgba(241,223,187,.72)}
.modal.lead .fu-chip{background:rgba(224,162,43,.09);border:1px solid rgba(224,162,43,.32);color:#F1DFBB}
.modal.lead .fu-chip:hover{border-color:var(--gold2);color:#FFF3DC}
.modal.lead .fu-chip.clear{color:rgba(241,223,187,.6)}
.modal.lead .fu-when{color:#F6E7C8}
.modal.lead .fu-when.od{color:#FFC9C2}
/* overdue turns the whole module red — the state you must not scroll past */
.modal.lead .m-prep .fu-block:has(.fu-when.od){border-color:rgba(193,53,43,.46);
  background:linear-gradient(180deg,rgba(193,53,43,.16),rgba(193,53,43,.04));
  box-shadow:inset 2px 0 0 var(--hot),0 0 30px -14px rgba(193,53,43,.8)}
.modal.lead .touchbar{background:rgba(56,189,248,.06);border:1px solid var(--line);color:var(--ink)}
.modal.lead .touchbar b{color:var(--ink-hi)}
.modal.lead .touchbar span,.modal.lead .touchbar em{color:var(--dim)}

/* --- sections ------------------------------------------------------------- */
.modal.lead .msec{background:linear-gradient(180deg,rgba(15,20,51,.72),rgba(10,14,39,.5));
  border:1px solid var(--line)}
.modal.lead .msec-t{color:var(--ink-mid)}
.modal.lead .msec-s{color:var(--dim)}
.modal.lead .msec.open{border-color:var(--line-hi);box-shadow:inset 2px 0 0 var(--arc)}
/* BREATHING ROOM IN THE RECORD RAIL.
   In the light CRM a section is a flat row separated from the next by a
   hairline — .msec has a bottom border and nothing else, which is right for a
   compact list. The paint gave each one a plate and a border, and boxes with no
   gap between them are not a list any more, they are one slab with lines drawn
   on it. This gives them the space the treatment assumes.
   Scoped, so the light modals keep the hairline list they were designed as. */
.modal.lead .m-left{padding:22px 20px 26px}
.modal.lead .msecs{margin-top:6px;border-top:0}
.modal.lead .msec{border-bottom:0;border-radius:11px;margin-bottom:9px}
.modal.lead .msec-h{padding:12px 13px}
.modal.lead .msec-b{padding:0 13px 14px}
/* the headings that group them get room above, not just below */
.modal.lead .m-left .dh{margin-top:4px}
.modal.lead .m-left .dh.mt{margin-top:20px}
/* the same rhythm in the prep rail, so the two do not disagree */
.modal.lead .m-prep{padding:20px 16px 26px}
.modal.lead .m-prep .dh.mt{margin-top:20px}

/* --- the feed: cyan for the machine, gold for a person -------------------- */
.modal.lead .fday{color:var(--dim)}
.modal.lead .fitem{background:linear-gradient(90deg,rgba(43,77,224,.15),rgba(43,77,224,.03));
  border:1px solid var(--line);box-shadow:inset 2px 0 0 var(--arc)}
.modal.lead .fitem .ftxt{color:var(--ink)}
.modal.lead .fitem.note{background:linear-gradient(90deg,rgba(224,162,43,.11),rgba(224,162,43,.02));
  border-color:rgba(224,162,43,.24);box-shadow:inset 2px 0 0 var(--gold)}
.modal.lead .fic{color:var(--arc2)}
.modal.lead .fitem.note .fic{color:var(--gold2)}
.modal.lead .sysrun{background:rgba(5,7,26,.4);border:1px dashed rgba(56,189,248,.26);color:var(--faint)}
.modal.lead .sysrun:hover{border-color:var(--line-hi);color:var(--dim)}
.modal.lead .sysrun b{color:var(--ink-mid)}
.modal.lead .ftag{background:rgba(56,189,248,.12);border:1px solid var(--line-hi);color:var(--ink-mid)}
.modal.lead .afilter button{background:rgba(56,189,248,.05);border:1px solid var(--line);color:var(--ink-mid)}
.modal.lead .afilter button.on{background:linear-gradient(180deg,rgba(56,189,248,.26),rgba(56,189,248,.1));
  border-color:rgba(56,189,248,.55);color:var(--ink-hi)}
.modal.lead .act-t{background:rgba(56,189,248,.05);border:1px solid var(--line);color:var(--ink-mid)}
.modal.lead .act-t.on{background:linear-gradient(180deg,rgba(56,189,248,.26),rgba(56,189,248,.1));
  border-color:rgba(56,189,248,.55);color:var(--ink-hi);box-shadow:0 0 18px -6px rgba(56,189,248,.9)}
.modal.lead .compose-open{background:rgba(56,189,248,.06);border:1px dashed var(--line-hi);color:var(--ink-mid)}
.modal.lead .compose-open:hover{border-style:solid;color:var(--ink-hi)}
.modal.lead .empty{color:var(--dim)}

/* --- EVERYTHING ELSE THE PAINT MISSED ------------------------------------
   PR 4 painted the containers and the main text tokens and stopped there.
   Twenty-eight more elements kept a light-theme colour on the navy plate —
   label chips and key-date labels at ${INK}, near-black and invisible; the
   Call/Text/Email/Site links at cobalt on navy; meeting times, the "Not right
   now" button, the jump-chip badges, and every piece of muted #8E89A8 prose.
   Stage and Priority were simply the two anyone reads first.
   Found by walking every element that renders text and checking its luminance,
   not by looking — which is what tests/leadcontrast.mjs now does on every run. */
.modal.lead .qbtn{color:var(--arc2);border-color:var(--line-hi);background:rgba(56,189,248,.06)}
.modal.lead .qbtn:hover{background:rgba(56,189,248,.14);color:var(--ink-hi)}
.modal.lead .lblchip{background:rgba(56,189,248,.06);border:1px solid var(--line);color:var(--ink-mid)}
.modal.lead .lblchip.on{background:linear-gradient(180deg,rgba(56,189,248,.26),rgba(56,189,248,.1));
  border-color:rgba(56,189,248,.55);color:var(--ink-hi)}
.modal.lead .lblchip.add{color:var(--dim);border-style:dashed}
.modal.lead .kd-row{border-color:var(--line)}
.modal.lead .kd-l{color:var(--ink-hi)}
.modal.lead .kd-d{color:var(--dim)}
.modal.lead .kd-d b{color:var(--arc2)}
.modal.lead .kd-d em{color:var(--dim)}
.modal.lead .kd-row.soon .kd-l{color:var(--gold2)}
.modal.lead .mtg-when{color:var(--ink-hi)}
.modal.lead .mtg-band{color:var(--dim)}
.modal.lead .mtg-row,.modal.lead .mtg-form{border-color:var(--line)}
.modal.lead .notnow{background:rgba(224,162,43,.09);border:1px solid rgba(224,162,43,.3);color:#F1DFBB}
.modal.lead .notnow span{color:rgba(241,223,187,.66)}
.modal.lead .notnow:hover{border-color:var(--gold);color:#FFF3DC}
.modal.lead .mj i{background:rgba(56,189,248,.18);color:var(--ink-hi)}
.modal.lead .feed-wide{color:var(--dim)}
.modal.lead .feed-wide:hover{color:var(--ink-hi)}
/* danger stays red, but a red mixed for white ground disappears on navy */
.modal.lead .btn-d{color:#FFC9C2;background:rgba(193,53,43,.16);border-color:rgba(193,53,43,.45)}
.modal.lead .btn-d:hover{background:rgba(193,53,43,.28);color:#fff}
/* Stage and priority pills carry an INLINE colour — a stage colour is
   configurable, so there is no palette to swap to. Brightening what is there
   keeps whatever the owner chose and makes it survive the dark ground. */
/* StageBadge/PriBadge carry their colours inline and are shared with the light
   screens, so they can't be restyled at the source. Drop the pale slab — which
   breaks the lit-edge rule on navy anyway — and keep the hue as the lit edge and
   the label, brightened for the dark plate. The colour still carries the state. */
.modal.lead .pill{background:transparent!important;border:1px solid currentColor;
  box-shadow:0 0 12px -5px currentColor,inset 0 0 12px -8px currentColor;
  filter:brightness(1.6) saturate(1.05)}
/* the two greys the light CRM uses for secondary prose */
.modal.lead .cmsn-row span,.modal.lead .sp-h,.modal.lead .dh-note,
.modal.lead .rc-lbl,.modal.lead .rc-root,.modal.lead .pay-nums,
.modal.lead .fn-hint,.modal.lead .tagpick>span,.modal.lead .tagpick-n{color:var(--dim)}
.modal.lead .cmsn-row b,.modal.lead .dh-v,.modal.lead .sp-amt{color:var(--ink-hi)}
/* the chip and button families inside the sections — same treatment as the
   activity type chips, which the paint did cover, so the two agree */
.modal.lead .chip,.modal.lead .mtype,.modal.lead .ms-b,.modal.lead .tier-btn{
  background:rgba(56,189,248,.05);border:1px solid var(--line);color:var(--ink-mid)}
.modal.lead .chip.on,.modal.lead .mtype.on,.modal.lead .ms-b.on,.modal.lead .tier-btn.on{
  background:linear-gradient(180deg,rgba(56,189,248,.26),rgba(56,189,248,.1));
  border-color:rgba(56,189,248,.55);color:var(--ink-hi)}
.modal.lead .chip.add{color:var(--dim);border-style:dashed}
.modal.lead .ms-b.held.on{background:linear-gradient(180deg,rgba(63,185,120,.28),rgba(63,185,120,.1));
  border-color:rgba(63,185,120,.5);color:#A8E9C4}
.modal.lead .ms-b.no.on{background:linear-gradient(180deg,rgba(193,53,43,.26),rgba(193,53,43,.08));
  border-color:rgba(193,53,43,.5);color:#FFC9C2}
/* cobalt reads as a link on white and as nothing on navy */
.modal.lead .addline,.modal.lead .deal-add-btn,.modal.lead .pay-add,
.modal.lead .morebtn,.modal.lead .sp-name{color:var(--arc2)}
.modal.lead .addline:hover,.modal.lead .deal-add-btn:hover,
.modal.lead .pay-add:hover,.modal.lead .sp-name:hover{color:var(--ink-hi)}
.modal.lead .mtg-title{color:var(--ink-hi)}
.modal.lead .mtg-acct{color:var(--ink-mid)}
/* the not-connected warning: amber mixed for a white card, on navy */
.modal.lead .mtg-warn{background:rgba(224,162,43,.1);border-color:rgba(224,162,43,.32);color:#F1DFBB}
.modal.lead .mtg-warn b,.modal.lead .mtg-warn span{color:#F6E7C8}
.modal.lead .imp-warn,.modal.lead .dupe-warn{background:rgba(224,162,43,.1);
  border-color:rgba(224,162,43,.32);color:#F1DFBB}
.modal.lead .convert-banner,.modal.lead .client-bar{background:linear-gradient(180deg,rgba(15,20,51,.8),rgba(10,14,39,.55));
  border-color:var(--line)}
.modal.lead .convert-banner b,.modal.lead .client-bar b{color:var(--ink-hi)}
.modal.lead .convert-banner div,.modal.lead .client-bar span{color:var(--dim)}
.modal.lead .rel-hint,.modal.lead .rel-gave,.modal.lead .pool-note{color:var(--dim);
  background:rgba(56,189,248,.06);border-color:var(--line)}
.modal.lead .rel-gave b,.modal.lead .rc-node{color:var(--ink-hi)}
.modal.lead .track-h b,.modal.lead .deal-card-v,.modal.lead .deal-total b,
.modal.lead .pay-head b,.modal.lead .dh-head b{color:var(--ink-hi)}
.modal.lead .phase,.modal.lead .mdate,.modal.lead .msdue-l,
.modal.lead .pay-mon,.modal.lead .sp-tag{color:var(--dim)}
/* the money panel was authored against a white card top to bottom */
.modal.lead .toggle,.modal.lead .pay-m b{color:var(--ink-hi)}
.modal.lead .pay-head,.modal.lead .pay-head span,.modal.lead .pay-mrr,
.modal.lead .pay-m span,.modal.lead .pay-nums span,
.modal.lead .deal-total span{color:var(--ink-mid)}
.modal.lead .pay-nums span:first-child,.modal.lead .pay-head b.clear{color:var(--ok2)}
.modal.lead .pay-head b.due{color:var(--gold2)}
.modal.lead .deal-total{background:rgba(56,189,248,.07);border:1px solid var(--line)}
.modal.lead .tagchip{background:rgba(56,189,248,.06);border:1px solid var(--line);color:var(--ink-mid)}
.modal.lead .tagchip.on{background:linear-gradient(180deg,rgba(56,189,248,.26),rgba(56,189,248,.1));
  border-color:rgba(56,189,248,.55);color:var(--ink-hi)}
/* the destructive row: a lit edge, not a grey slab */
.modal.lead .m-danger .btn-g{background:rgba(193,53,43,.08);border:1px solid rgba(193,53,43,.38);color:#FFC9C2}
.modal.lead .m-danger .btn-g:hover{background:rgba(193,53,43,.16);border-color:rgba(193,53,43,.6);color:#FFE1DC}
/* the three sponsor/relationship toggles keep their hues — they're how the
   three states are told apart — lifted onto the plate rather than recoloured */
.modal.lead .spon-tog{background:rgba(56,189,248,.05);border-color:var(--line);color:var(--ink-mid)}
.modal.lead .spon-tog.on{background:rgba(56,189,248,.14);border-color:rgba(56,189,248,.5);color:var(--ink-hi)}
.modal.lead .spon-tog.past.on{background:rgba(224,162,43,.14);border-color:rgba(224,162,43,.5);color:#F6E7C8}
.modal.lead .spon-tog.rel.on{background:rgba(160,130,240,.16);border-color:rgba(160,130,240,.55);color:#DCCDFF}
.modal.lead .spon-tog.rel input{accent-color:#A082F0}
/* ---- contact actions -------------------------------------------------------
   The most-used controls in the view, so they get size and position rather
   than more glow. Flat plate, lit edge only on hover — they are where work
   starts, not something the app is telling you. */
.modal.lead .m-acts{display:flex;flex-direction:column;gap:7px;margin:2px 0 4px}
.modal.lead .m-act-row{display:flex;align-items:stretch;gap:6px}
.modal.lead .m-act{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:10px 12px;
  border-radius:11px;border:1px solid var(--line);background:rgba(5,7,26,.4);
  color:var(--ink-hi);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;
  text-decoration:none;text-align:left;transition:border-color .12s,background .12s}
.modal.lead .m-act i{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;
  background:rgba(56,189,248,.1);color:var(--arc2)}
.modal.lead .m-act b{flex:none;font-weight:700}
.modal.lead .m-act .m-act-v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  text-align:right;font-size:11.5px;font-weight:600;color:var(--dim)}
.modal.lead .m-act:hover{border-color:var(--line-hi);background:rgba(56,189,248,.09)}
.modal.lead .m-act:hover i{background:rgba(56,189,248,.2);color:var(--ink-hi)}
.modal.lead button.m-act[disabled]{cursor:default;opacity:.55;background:rgba(5,7,26,.22);border-style:dashed}
.modal.lead button.m-act[disabled] i{background:rgba(56,189,248,.05);color:var(--dim)}
.modal.lead button.m-act[disabled]:hover{border-color:var(--line);background:rgba(5,7,26,.22)}
.modal.lead .m-act-copy{flex:none;width:38px;border-radius:11px;border:1px solid var(--line);
  background:rgba(5,7,26,.4);color:var(--dim);cursor:pointer;display:grid;place-items:center}
.modal.lead .m-act-copy:hover{border-color:var(--line-hi);color:var(--ink-hi);background:rgba(56,189,248,.09)}
@media (prefers-reduced-motion:reduce){.modal.lead,.modal.lead *{animation:none!important;transition:none!important}}
/* Expand still gives the feed the whole surface; the rails step aside. */
.m-grid.lead3.wide{grid-template-columns:minmax(0,1fr)}
@media (max-width:1240px){
  .m-grid.lead3{grid-template-columns:270px minmax(0,1fr)}
  .m-grid.lead3 .m-left{grid-column:1 / -1;border-top:1px solid #E8E9F2}
}
@media (max-width:820px){
  .m-grid.lead3{grid-template-columns:1fr;overflow-y:auto}
  .m-prep{border-right:0;border-bottom:1px solid #E8E9F2}
}
.m-left{padding:20px 22px;overflow-y:auto}/* hidden, not auto — the column itself must not scroll, or you get the two
   nested scrollbars that caused this */
.m-right{padding:20px 22px;overflow:hidden;background:#fff;border-left:1px solid #E8E9F2;display:flex;flex-direction:column;min-height:0}
/* everything above the feed keeps its natural height and stays put */
.m-right>.dh{display:flex;align-items:center;gap:7px}
.m-right>.dh,.m-right>.touchbar,.m-right>.notnow,.m-right>.compose-open,.m-right>.afilter,.m-right>.act-types{flex:none}
@media(max-width:760px){.m-grid{grid-template-columns:1fr;overflow-y:auto}.m-left,.m-right{overflow:visible}.m-right{border-left:none;border-top:1px solid #E8E9F2}}
.dh{font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${COBALT};margin:2px 0 12px;display:flex;align-items:center;gap:8px}.dh.mt{margin-top:22px}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.field label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD;margin-bottom:5px}
.field input,.field select,.field textarea{width:100%;padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13.5px;font-family:'Inter';color:${INK};background:#fff}
.field textarea{resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.field input:focus,.field select:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.field.full{grid-column:1/-1}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{font-size:12px;font-weight:600;padding:7px 11px;border-radius:20px;border:1px solid #DEDFEA;background:#fff;color:#56527a;cursor:pointer;transition:.14s;display:inline-flex;align-items:center;gap:6px}
.chip.on{border-color:${COBALT};background:rgba(43,77,224,.1);color:${COBALT}}
.chip.add{border-style:dashed;color:#928DAD}
.toggle{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13.5px;color:${INK};font-weight:500;margin-top:11px}
.extras{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.extra-row{display:flex;align-items:center;gap:8px}
.extra-row .ex-label{flex:1;padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13px;font-family:'Inter';color:${INK};background:#fff}
.extra-row .ex-label:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.ex-amt-w{display:flex;align-items:center;gap:4px;border:1px solid #DEDFEA;border-radius:9px;padding:0 10px;background:#fff;width:120px}
.ex-amt-w span{color:#928DAD;font-size:13px}
.ex-amt-w:focus-within{border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.ex-amt{border:none;outline:none;width:100%;padding:9px 0;font-size:13.5px;font-family:'Inter';color:${INK};background:transparent}
.ex-del{border:none;background:#F2F2F8;color:#928DAD;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}
.ex-del:hover{background:rgba(209,67,67,.1);color:${RED}}
.addline{margin-top:10px;background:none;border:1px dashed #CFD0E0;color:${COBALT};font-weight:600;font-size:12.5px;padding:8px 12px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.addline:hover{background:rgba(43,77,224,.05);border-color:${COBALT}}
.deal-hist{background:color-mix(in srgb,${GREEN} 4%,#fff);border:1px solid color-mix(in srgb,${GREEN} 22%,#fff);border-radius:12px;padding:12px 14px;margin-bottom:14px}
.dh-head{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#1a7d46;margin-bottom:8px}
.dh-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid color-mix(in srgb,${GREEN} 14%,#fff)}
.dh-m{flex:1;min-width:0;display:flex;flex-direction:column}
.dh-m b{font-size:13px;color:${INK};font-weight:700}
.dh-m span{font-size:11px;color:#9b98ad}
.dh-v{font-size:14px;font-weight:800;color:#1a7d46;font-family:'Space Grotesk',sans-serif}
.dh-note{margin-top:9px;padding-top:9px;border-top:1px solid color-mix(in srgb,${GREEN} 14%,#fff);font-size:12px;color:#56527a}
.dh-note b{color:${INK};font-weight:800}
.deal-card{border:1px solid #E7E8F1;border-radius:13px;padding:14px;margin-bottom:12px;background:#FBFBFE}
.deal-card-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.deal-name{flex:1;min-width:0;border:none;background:none;font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:${INK};padding:2px 0;border-bottom:1.5px solid transparent}
.deal-name:focus{outline:none;border-bottom-color:${COBALT}}
.deal-card-v{font-size:14px;font-weight:800;color:${COBALT};font-family:'Space Grotesk',sans-serif}
.deal-add-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:11px;border:1.5px dashed #C9CBDD;border-radius:11px;background:#fff;color:${COBALT};font-size:13px;font-weight:700;cursor:pointer;transition:.15s;margin-bottom:8px}
.deal-add-btn:hover{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 5%,#fff)}
.pay-panel{margin-top:16px;padding:14px;border:1px solid #E7E8F1;border-radius:13px;background:#FBFBFE}
.pay-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8b88a0;margin-bottom:10px}
.pay-head b.due{color:#D97706;font-size:13px}
.pay-head b.clear{color:#1a7d46;font-size:13px}
.pay-mon{margin-left:7px;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:${COBALT};background:color-mix(in srgb,${COBALT} 10%,#fff);border-radius:5px;padding:1px 5px}
.pay-bars{margin-bottom:12px}
.pay-bar{height:9px;background:#EEF0F8;border-radius:5px;overflow:hidden}
.pay-bar>div{height:100%;border-radius:5px;background:linear-gradient(90deg,${GREEN},#2BA35C);transition:width .3s}
.pay-nums{display:flex;justify-content:space-between;font-size:11.5px;color:#8b88a0;font-weight:600;margin-top:5px}
.pay-nums span:first-child{color:#1a7d46;font-weight:700}
.pay-list{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}
.pay-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #EFEFF6}
.pay-m{flex:1;display:flex;flex-direction:column}
.pay-m b{font-size:14px;color:${INK};font-weight:700;font-family:'Space Grotesk',sans-serif}
.pay-m span{font-size:11px;color:#9b98ad}
.pay-over{font-size:11.5px;color:#D97706;font-weight:600;margin-bottom:8px}
.pay-add{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border:none;border-radius:10px;background:${GREEN};color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
.pay-add:hover{filter:brightness(1.05)}
.kbal{flex:none;font-size:10.5px;font-weight:700;color:#D97706;background:color-mix(in srgb,#FFA500 12%,#fff);border-radius:11px;padding:1px 8px}
.deal-close-btn.sm{margin-top:10px;padding:9px;font-size:12.5px}
.deal-close-btn{width:100%;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border:none;border-radius:11px;background:${GREEN};color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;transition:.15s}
.deal-close-btn:hover{filter:brightness(1.05);transform:translateY(-1px)}
.deal-total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:11px 13px;background:#F6F7FB;border-radius:10px}
.deal-total span{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD}
.deal-total b{font-family:'Space Grotesk';font-size:17px;color:${INK}}
.sw{width:42px;height:24px;border-radius:14px;background:#D9DAE6;position:relative;transition:.18s;flex:none}.sw.on{background:${GREEN}}
.sw b{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.18s;box-shadow:0 1px 3px rgba(0,0,0,.2)}.sw.on b{left:21px}
.sw.sm{width:34px;height:20px}.sw.sm b{width:14px;height:14px}.sw.sm.on b{left:17px}
/* activity */
.afilter{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.afilter button{font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:8px;border:1px solid #E4E5F0;background:#fff;color:#8E89A8;cursor:pointer}
.afilter button.on{border-color:${COBALT};background:rgba(43,77,224,.08);color:${COBALT}}
.spon-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:2px}
.spon-tog{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #E1E2EC;border-radius:10px;font-size:13px;font-weight:600;color:#56527a;cursor:pointer;background:#fff}
.spon-tog input{accent-color:${COBALT};width:15px;height:15px;cursor:pointer}
.spon-tog.on{border-color:${COBALT};background:rgba(43,77,224,.08);color:${COBALT}}
.spon-tog.past input{accent-color:${GOLD}}
.spon-tog.past.on{border-color:${GOLD};background:rgba(200,162,74,.12);color:#8a6a1f}
.spon-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:rgba(43,77,224,.1);color:${COBALT}}
.spon-badge.past{background:rgba(200,162,74,.16);color:#8a6a1f}
.spon-tog.rel input{accent-color:#7A5CC8}
.spon-tog.rel.on{border-color:#7A5CC8;background:rgba(122,92,200,.1);color:#5b3fa6}
.rel-hint{font-size:11.5px;color:#8b88a0;margin-top:7px;line-height:1.45}
.rel-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px}
.rel-tier{display:flex;flex-direction:column;min-height:280px;background:#fff;border:1.5px solid #EAEBF2;border-radius:14px;overflow:hidden;position:relative;transition:.14s}
.rel-tier::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--tc);z-index:1}
.rel-tier:hover{border-color:var(--tc)}
.rel-tier.on{border-color:var(--tc);box-shadow:0 10px 26px -16px var(--tc)}
.rt-head{padding:15px 16px 12px;cursor:pointer;border-bottom:1px solid #F1F1F7}
.rel-tier.on .rt-head{background:color-mix(in srgb,var(--tc) 8%,#fff)}
.rt-top{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:${INK}}
.rt-dot{width:9px;height:9px;border-radius:50%;background:var(--tc);flex:none}
.rt-count{margin-left:auto;font-size:13px;font-weight:800;color:#fff;background:var(--tc);min-width:24px;text-align:center;padding:2px 8px;border-radius:20px}
.rt-d{font-size:11.5px;color:#8b88a0;font-weight:500;margin-top:5px}
.rt-people{flex:1;overflow-y:auto;padding:6px}
.rt-person{display:flex;align-items:baseline;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer}
.rt-person:hover{background:color-mix(in srgb,var(--tc) 8%,#fff)}
.rt-pn{font-size:13px;font-weight:600;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rt-pc{font-size:11px;color:#928DAD;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.rt-empty{padding:24px 12px;text-align:center;font-size:12px;color:#b7b4c6}
.rt-foot{padding:9px 14px;font-size:11px;font-weight:700;color:var(--tc);text-align:center;border-top:1px solid #F1F1F7;cursor:pointer;background:#FCFCFE}
.rt-foot:hover{background:color-mix(in srgb,var(--tc) 6%,#fff)}
.rel-netline{display:flex;align-items:center;gap:8px;font-size:12px;color:#8b88a0;font-weight:600;margin-bottom:16px;flex-wrap:wrap}
.rel-clearf{margin-left:auto;border:1px solid #E1E2EC;background:#fff;border-radius:20px;padding:4px 11px;font-size:11.5px;font-weight:700;color:${COBALT};cursor:pointer}
.rel-clearf:hover{background:rgba(43,77,224,.06)}
.tier-pick{display:inline-flex;align-items:center;gap:5px}
.tier-dot{width:8px;height:8px;border-radius:50%;background:var(--tc);flex:none}
.tier-pick select{border:1px solid #E7E8F0;border-radius:20px;padding:3px 8px;font-size:11.5px;font-weight:700;color:var(--tc);background:#fff;cursor:pointer}
.tier-btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.tier-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #E1E2EC;background:#fff;border-radius:20px;padding:6px 13px;font-size:12.5px;font-weight:700;color:#56527a;cursor:pointer}
.tier-btn.on{border-color:var(--tc);color:var(--tc);background:color-mix(in srgb,var(--tc) 8%,#fff)}
@media(max-width:640px){.rel-tiers{grid-template-columns:1fr}}
.rel-from{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:7px 11px;border-radius:9px;background:rgba(122,92,200,.08);border:1px solid rgba(122,92,200,.22);color:#5b3fa6;font-size:12.5px;cursor:pointer}
.rel-from:hover{background:rgba(122,92,200,.15)}
.rel-gave{display:flex;align-items:center;gap:7px;margin-top:10px;padding:8px 11px;border-radius:9px;background:#F4F5FA;border:1px solid #E5E6F0;color:#56527a;font-size:12.5px}
.rel-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:20px;background:rgba(122,92,200,.1);color:#5b3fa6}
.rel-ghead{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.rel-gname{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:800;color:#5b3fa6;cursor:pointer}
.rel-gname:hover{text-decoration:underline}
.rel-gname.plain{color:#8b88a0;cursor:default}
.rel-gname.plain:hover{text-decoration:none}
.rel-gcount{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#EEF0F7;color:#56527a}
/* collapsible modal sections */
.msecs{margin-top:18px;border-top:1px solid #F0F0F6}
.msec{border-bottom:1px solid #F0F0F6}
.msec-h{display:flex;align-items:center;gap:9px;padding:13px 2px;cursor:pointer;user-select:none}
.msec-h:hover .msec-t{color:${COBALT}}
.msec-t{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${INK};transition:.12s}
.msec-s{margin-left:auto;font-size:12px;color:#9b98ad;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52%}
.msec-ch{color:#c0bdd0;flex:none;transition:transform .16s;margin-left:auto}
.msec-s+.msec-ch{margin-left:6px}
.msec.open .msec-ch{transform:rotate(180deg);color:${COBALT}}
.msec-b{padding:2px 2px 16px}
/* quick add */
.morebtn{display:flex;align-items:center;gap:7px;width:100%;margin-top:16px;padding:11px 12px;border:1px dashed #D6D8E6;border-radius:10px;background:#FAFAFE;color:#56527a;font-size:12.5px;font-weight:700;cursor:pointer}
.morebtn:hover{border-color:${COBALT};color:${COBALT}}
.morebtn i{margin-left:auto;font-style:normal;font-size:11.5px;color:#9b98ad;font-weight:500}
.mb-ch{transition:transform .16s}.mb-ch.on{transform:rotate(180deg)}
.dupe-warn{display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 12px;border-radius:9px;background:#FFF7ED;border:1px solid #FCD9B6;color:#9a5a16;font-size:12.5px}
.dupe-warn b{cursor:pointer;text-decoration:underline}
/* follow-up block in modal */
.fu-block{background:#FAFAFE;border:1px solid #EDEEF5;border-radius:11px;padding:13px}
.fu-note{width:100%;border:1px solid #E1E2EC;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;color:${INK};resize:vertical;line-height:1.5}
.fu-note:focus{outline:none;border-color:${COBALT}}
.fu-when{margin-top:10px;font-size:11.5px;font-weight:700;color:#1f8a55}
.fu-when.od{color:#b4322e}
.fn-block{background:#FAFAFE;border:1px solid #EDEEF5;border-radius:11px;padding:13px}
.fn-hint{display:flex;align-items:center;gap:5px;margin-top:8px;font-size:11.5px;color:#9b98ad;font-weight:500}
.chip-toggle{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#56527a;cursor:pointer}
.chip-toggle input{accent-color:${COBALT};width:15px;height:15px;cursor:pointer}
.phase-badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:3px 11px;border-radius:20px;white-space:nowrap}
.cli-list{display:flex;flex-direction:column;gap:10px}
.cli-card{background:#fff;border:1px solid #EAEBF2;border-radius:13px;overflow:hidden}
.cli-card.od{border-color:#F3C9C2}
.cli-main{display:grid;grid-template-columns:1.4fr auto 1.5fr 1.6fr auto;gap:16px;align-items:center;padding:14px 16px;cursor:pointer}
.cli-main:hover{background:#FCFCFE}
.cli-id{min-width:0}
.cli-name{font-weight:700;color:${INK};font-size:14.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cli-name:hover{color:${COBALT};text-decoration:underline}
.cli-prog2{min-width:0}
.cli-prog2-top{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#8b88a0;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
.cli-status{display:flex;flex-direction:column;gap:5px;align-items:flex-start;min-width:0}
.cli-next{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#56527a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cli-next svg{flex:none;color:#C9C5D9}
.cli-ch{color:#c0bdd0;transition:transform .16s;flex:none}
.cli-ch.open{transform:rotate(180deg);color:${COBALT}}
.cli-body{border-top:1px solid #EEF0F6;padding:14px 16px;background:#FAFBFE}
.cli-actions{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.phase-sel{border:1px solid #E1E2EC;border-radius:8px;padding:6px 10px;font-size:12.5px;color:${INK};background:#fff;font-weight:600}
.onb-group{margin-bottom:14px}
.onb-gh{display:flex;align-items:center;gap:9px;margin-bottom:7px}
.onb-gc{font-size:11px;font-weight:700;color:#8b88a0}
.onb-item{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:8px}
.onb-item:hover{background:#fff}
.onb-item.over{background:rgba(209,67,67,.05)}
.onb-check{cursor:pointer;flex:none;display:flex}
.onb-label{flex:1;min-width:0;font-size:13px;color:${INK};cursor:pointer;line-height:1.4}
.onb-item.done .onb-label{color:#9b98ad;text-decoration:line-through}
.onb-date{font-size:11.5px;font-weight:600;color:#1f8a55;white-space:nowrap;flex:none}
.onb-due{display:inline-flex;align-items:center;gap:6px;flex:none}
.onb-due span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#a6a2bc}
.onb-due input{border:1px solid #E1E2EC;border-radius:7px;padding:3px 7px;font-size:11.5px;color:#56527a;background:#fff}
.onb-due input.over{border-color:#E0967F;color:#b4322e}
@media(max-width:820px){.cli-main{grid-template-columns:1fr auto;gap:9px}.cli-prog2,.cli-status{grid-column:1/-1}.cli-ch{position:absolute;right:16px;top:16px}}
.seg i{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;background:#DFE2EE;color:#56527a;margin-left:6px}
.seg button.on i{background:${COBALT};color:#fff}
.cp-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:rgba(122,92,200,.15);color:#7A5CC8;padding:1px 5px;border-radius:5px;margin-left:6px}
.cli-hint{display:flex;align-items:center;gap:7px;justify-content:center;padding:20px;color:#a6a2bc;font-size:13px}
.cli-detail{background:#fff;border:1px solid #EAEBF2;border-radius:13px;padding:16px;margin-top:14px}
.cli-detail-h{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}
.cp-list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.cp-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;border:1px solid;border-radius:20px;padding:3px 10px}
.cp-chip button{background:none;border:none;cursor:pointer;color:inherit;display:flex;opacity:.6;padding:0}
.cp-chip button:hover{opacity:1}
.cp-add{display:flex;align-items:center;gap:7px;flex-wrap:wrap;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:7px 9px}
.cp-add input[type=text],.cp-add>input:not([type=color]){border:1px solid #E1E2EC;border-radius:7px;padding:5px 8px;font-size:12.5px}
.cp-add input[type=color]{width:30px;height:30px;border:1px solid #E1E2EC;border-radius:7px;padding:2px;background:#fff;cursor:pointer}
.cp-add label{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#56527a}
.cp-add select{border:1px solid #E1E2EC;border-radius:7px;padding:5px 7px;font-size:12px}
.phase-editor{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.phase-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE}
.phase-row input[type=color]{width:30px;height:30px;border:1px solid #E1E2EC;border-radius:7px;padding:2px;background:#fff;cursor:pointer;flex:none}
.phase-label{flex:1;border:1px solid #E1E2EC;border-radius:7px;padding:6px 9px;font-size:13px;font-weight:600;color:${INK}}
.phase-key{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#a6a2bc;flex:none}
.phase-moves{display:flex;gap:3px;flex:none}
.m-foot{flex:none;background:#fff;border-top:1px solid #E8E9F2;padding:13px 22px;display:flex;align-items:center;gap:10px;box-shadow:0 -6px 20px -12px rgba(0,0,0,.18)}
.m-foot-n{display:flex;align-items:center;gap:5px;margin-left:auto;font-size:12px;color:#8b88a0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
/* follow-up card: plan + next flow */
.fu-plan{display:flex;gap:7px;align-items:flex-start;margin:9px 0 0;padding:8px 10px;background:#FFFDF5;border:1px solid #F0E4C0;border-radius:8px;font-size:12.5px;color:#6a5a2f;line-height:1.45}
.fu-plan svg{flex:none;margin-top:1px;color:#B9932F}
.fu-next{background:#F4F7FF;border:1px solid #D6E0FA;border-radius:10px;padding:11px}
.fu-next-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${INK};margin-bottom:8px}
.fu-next-h b{color:${COBALT}}
.fu-next-b{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}
.fu-next-note{font-size:11px;color:#9b98ad}
.rel-chain{margin-top:12px;padding:11px 13px;border-radius:10px;background:#F7F8FC;border:1px solid #EDEEF5}
.rc-lbl{font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#9b98ad;margin-bottom:7px}
.rc-path{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.rc-node{font-size:12.5px;font-weight:700;color:#5b3fa6;background:rgba(122,92,200,.1);padding:3px 9px;border-radius:20px;cursor:pointer}
.rc-node:hover{background:rgba(122,92,200,.2)}
.rc-node.root{background:rgba(200,162,74,.18);color:#8a6a1f}
.rc-node.self{background:${INK};color:#fff;cursor:default}
.rc-arrow{color:#c7c5d4;flex:none}
.rc-root{margin-top:8px;font-size:12px;color:#8b88a0}
.rc-root b{color:#8a6a1f;cursor:pointer}
.rc-root b:hover{text-decoration:underline}
.web-card{padding:14px}
.web-actions{margin-left:auto;display:flex;gap:8px}
.task-daypick{display:flex;align-items:center;gap:6px}
.day-chip{border:1px solid #E1E2EC;background:#fff;border-radius:9px;padding:9px 12px;font-size:12.5px;font-weight:700;color:#56527a;cursor:pointer}
.day-chip.on{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff);color:${COBALT}}
.day-date{display:inline-flex;align-items:center;gap:6px;border:1px solid #E1E2EC;border-radius:9px;padding:8px 11px;color:#56527a;cursor:pointer}
.day-date input{border:none;background:none;font-size:12.5px;font-family:inherit;color:#56527a;cursor:pointer;width:120px}
.day-date input:focus{outline:none}
.task-due-chip{position:relative;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;cursor:pointer}
.task-due-chip input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.gcal-on{display:flex;align-items:center;gap:11px;background:color-mix(in srgb,${GREEN} 7%,#fff);border:1px solid color-mix(in srgb,${GREEN} 25%,#fff);border-radius:11px;padding:13px 15px}
.gcal-dot{width:10px;height:10px;border-radius:50%;background:${GREEN};flex:none;box-shadow:0 0 0 4px color-mix(in srgb,${GREEN} 18%,#fff)}
.gcal-off{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.mtg-warn{display:flex;align-items:flex-start;gap:7px;background:#FFF7ED;border:1px solid #FCD9B6;color:#9a5a16;border-radius:9px;padding:9px 11px;font-size:12.5px;margin-bottom:12px;line-height:1.45}
.mtg-warn svg{flex:none;margin-top:2px}
.act-t.booked{border-color:#F0C09B;color:#C05A1E}
.act-t.booked.on{background:#E0662B;border-color:#E0662B;color:#fff}
/* header quick facts (the qualifying data, surfaced at the top) */
.m-headright{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex:none;min-width:0}
.m-facts{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end;max-width:430px}
.mf{display:flex;flex-direction:column;align-items:flex-start;gap:1px;background:#F7F8FC;border:1px solid #EAEBF2;border-radius:9px;padding:5px 10px;cursor:pointer;text-align:left;min-width:72px;transition:.12s}
.mf:hover{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 6%,#fff)}
.mf i{font-style:normal;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a6a2bc}
.mf b{font-size:12.5px;font-weight:700;color:${INK};white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis}
.mf.hot{border-color:#EFB98F;background:color-mix(in srgb,#E0662B 8%,#fff)}
.mf.hot b{color:#C05A1E}
/* jump bar — one tap to any section, no scrolling */
.m-jump{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 24px;background:#fff;border-bottom:1px solid #E8E9F2;flex:none}
.mj-l{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#a6a2bc;margin-right:2px}
.mj{display:inline-flex;align-items:center;gap:6px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:6px 13px;font-size:12.5px;font-weight:700;color:#56527a;cursor:pointer;transition:.12s}
.mj:hover{border-color:${COBALT};color:${COBALT}}
.mj.on{background:color-mix(in srgb,${COBALT} 8%,#fff);border-color:${COBALT};color:${COBALT}}
.mj i{font-style:normal;font-size:10px;font-weight:800;background:#EEF0F7;color:#56527a;border-radius:20px;padding:1px 6px}
.mj.on i{background:${COBALT};color:#fff}
@media(max-width:820px){
  .m-head{flex-wrap:wrap}
  .m-headright{max-width:100%}
  .m-facts{max-width:100%;gap:6px}
  .mf{min-width:0;padding:4px 8px}
  .mf b{font-size:12px;max-width:92px}
  .mf:nth-child(n+5){display:none}
  .m-jump{padding:9px 16px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch}
  .mj{flex:none}
  .mj-l{display:none}
}
.mtg-form{margin-top:6px}
.mtg-toggles{display:flex;gap:8px;flex-wrap:wrap}
.mtg-chk{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #E1E2EC;border-radius:9px;padding:8px 11px;font-size:12.5px;font-weight:600;color:#56527a;cursor:pointer}
.mtg-chk input{display:none}
.mtg-chk.on{border-color:${COBALT};color:${COBALT};background:color-mix(in srgb,${COBALT} 7%,#fff)}
.mtg-chk.off{opacity:.5;cursor:not-allowed}
.mtg-err{color:#b4322e;font-size:12.5px;margin:8px 0}
.mtg-list{margin-bottom:14px}
.mtg-empty{font-size:12.5px;color:#9b98ad;padding:8px 0 14px}
.mtg-band{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8b88a0;margin:10px 0 7px}
.mtg-band.past{color:#b7b4c6}
.mtg-row{display:flex;align-items:center;gap:11px;padding:9px 11px;border:1px solid #EDEEF5;border-radius:10px;margin-bottom:7px;background:#FBFBFE}
.mtg-when{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${INK};white-space:nowrap;flex:none}
.mtg-when svg{color:${COBALT}}
.mtg-mid{flex:1;min-width:0}
.mtg-title{font-size:13px;font-weight:600;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mtg-badges{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}
.mtg-b{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:#56527a;background:#EEF0F7;border-radius:20px;padding:2px 8px;text-decoration:none}
.mtg-b.link{color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff)}
.mtg-b.type{background:color-mix(in srgb,#7A5CC8 12%,#fff);color:#6A4CB8}
.mtg-row.held{border-color:color-mix(in srgb,${GREEN} 35%,#fff);background:color-mix(in srgb,${GREEN} 4%,#fff)}
.mtg-row.noshow{border-color:#F0C9C4;background:rgba(209,67,67,.04)}
.mtg-status{display:flex;gap:5px;flex:none}
.ms-b{display:inline-flex;align-items:center;gap:4px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:4px 9px;font-size:10.5px;font-weight:700;color:#8b88a0;cursor:pointer}
.ms-b.held.on{border-color:${GREEN};background:color-mix(in srgb,${GREEN} 12%,#fff);color:#1a7d46}
.ms-b.no.on{border-color:${RED};background:rgba(209,67,67,.1);color:#b4322e}
.ms-b:hover{border-color:#C9C5D9}
.mtype-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.mtype-row.sm{margin:8px 0 0}
.mtype{border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:5px 11px;font-size:11.5px;font-weight:700;color:#56527a;cursor:pointer}
.mtype.on{border-color:#7A5CC8;background:color-mix(in srgb,#7A5CC8 8%,#fff);color:#6A4CB8}
.mod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.mod-row{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE;cursor:pointer;font-size:13px;font-weight:600;color:#8b88a0}
.mod-row.on{border-color:color-mix(in srgb,${GREEN} 30%,#fff);background:color-mix(in srgb,${GREEN} 5%,#fff);color:${INK}}
.mod-row input{display:none}
.mod-row span{flex:1}
.mt-break{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:-4px 0 18px;padding:11px 15px;background:#fff;border:1px solid #EAEBF2;border-radius:12px}
.mtb-l{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a6a2bc}
.mtb{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#56527a;font-weight:600;background:#F5F6FB;border-radius:20px;padding:3px 11px}
.mtb b{font-size:14px;color:${INK};font-family:'Space Grotesk',sans-serif}
.kpi.clickable{cursor:pointer;transition:.14s}
.kpi.clickable:hover{transform:translateY(-1px);box-shadow:0 12px 26px -14px rgba(19,56,222,.28),inset 2px 0 0 #38BDF8}
.kpi.accent.clickable:hover{box-shadow:0 18px 40px -22px rgba(10,14,39,.95),inset 2px 0 0 #38BDF8,0 0 26px -10px rgba(56,189,248,.7)}
.kpi.active{outline:2px solid ${COBALT};outline-offset:-2px}
.kpi.accent.active{outline-color:#38BDF8}
.kpi.active .kpi-ch{color:#FFA500}
.kpi-ch{margin-left:auto;opacity:.5;transition:transform .16s}
.kpi-ch.on{transform:rotate(180deg);opacity:1}
.drill{background:#fff;border:1px solid #EAEBF2;border-radius:14px;margin:-4px 0 18px;overflow:hidden;animation:pop .16s ease}
.drill-h{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #F0F1F7;background:#FBFBFE}
.drill-t{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${INK}}
.drill-s{font-size:12px;color:#8b88a0;font-weight:600}
.drill-b{max-height:420px;overflow-y:auto;padding:8px 10px}
.drow{display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:9px}
.drow:hover{background:#FAFAFE}
.drow+.drow{border-top:1px solid #F4F4FA}
.drow.untyped{background:color-mix(in srgb,#E0662B 5%,#fff)}
.drow-m{flex:1;min-width:0}
.drow-t{font-size:13.5px;font-weight:700;color:${INK};cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.drow-t:hover{color:${COBALT};text-decoration:underline}
.drow-v{font-size:13px;font-weight:700;color:${INK};white-space:nowrap;flex:none}
.mtg-type{border:1px solid #E4E5EF;border-radius:20px;padding:4px 9px;font-size:11.5px;font-weight:700;color:#6A4CB8;background:color-mix(in srgb,#7A5CC8 8%,#fff);cursor:pointer;flex:none}
.mtg-type.unset{color:#C05A1E;background:color-mix(in srgb,#E0662B 9%,#fff);border-color:#F0C09B}
/* Section headings read as instrument labels: monospace, widely tracked, with
   a lit arc-cyan rule instead of a flat orange dash. Same family as the JARVIS
   panel and the sidebar, so the dashboard looks like the same machine. */
.kgroup{font-family:'Space Mono',ui-monospace,monospace;font-size:10px;font-weight:700;letter-spacing:.19em;
  text-transform:uppercase;color:${COBALT};margin:2px 0 10px;display:flex;align-items:center;gap:9px}
.kgroup::before{content:'';width:16px;height:2px;border-radius:2px;
  background:linear-gradient(90deg,#38BDF8,#2B4DE0);box-shadow:0 0 9px rgba(56,189,248,.75)}
.hud-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.hud-t{font-size:21px;font-weight:800;color:${INK};font-family:'Space Grotesk',sans-serif}
.hud-d{font-size:12.5px;color:#8b88a0;font-weight:600;margin-top:3px}
.hud-empty{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;background:#fff;border:1px dashed #DCDEEA;border-radius:14px;padding:30px 22px;margin-bottom:20px}
.hud-empty svg{color:${COBALT}}
.hud-empty b{font-size:15px;color:${INK}}
.hud-empty span{font-size:13px;color:#8b88a0;max-width:460px;line-height:1.5}
.hud-brief{background:linear-gradient(135deg,${INDIGO},${INK});border-radius:16px;padding:22px 24px;margin-bottom:22px;color:#fff}
.hb-head{font-size:20px;font-weight:800;line-height:1.3;font-family:'Space Grotesk',sans-serif}
.hb-read{font-size:14px;line-height:1.6;color:rgba(255,255,255,.82);margin:10px 0 0}
.hb-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
.hb-col{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:13px 15px}
.hb-ct{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.62);margin-bottom:8px}
.hb-col.win .hb-ct{color:#8FE3B4}
.hb-col.warn .hb-ct{color:#F5C08E}
.hb-li{font-size:13px;line-height:1.5;color:rgba(255,255,255,.9);padding:4px 0}
.hb-li+.hb-li{border-top:1px solid rgba(255,255,255,.08)}
.hb-focus{margin-top:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:13px 15px}
.hb-focus .hb-ct{color:#BFC8FF}
.hb-f{padding:6px 0;font-size:13px;line-height:1.5}
.hb-f+.hb-f{border-top:1px solid rgba(255,255,255,.08)}
.hb-f b{display:block;color:#fff;font-weight:700}
.hb-f span{color:rgba(255,255,255,.72)}
.hb-proj{display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:13px;line-height:1.55;color:rgba(255,255,255,.85);background:rgba(255,255,255,.07);border-radius:11px;padding:12px 15px}
.hb-proj svg{flex:none;margin-top:2px;color:${GOLD}}
.hb-when{margin-top:12px;font-size:11px;color:rgba(255,255,255,.45)}
.hstats{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:11px;margin-bottom:20px}
.hstat{background:#fff;border:1px solid #EAEBF2;border-radius:12px;padding:13px 15px}
.hs-l{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#a6a2bc}
.hs-v{display:flex;align-items:baseline;gap:8px;font-size:23px;font-weight:800;color:${INK};margin:5px 0 2px;font-family:'Space Grotesk',sans-serif}
.hs-p{font-size:11px;color:#b7b4c6}
.dl{font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:20px}
.dl.up{background:color-mix(in srgb,${GREEN} 14%,#fff);color:#1a7d46}
.dl.down{background:rgba(209,67,67,.11);color:#b4322e}
.dl.flat{background:#F0F1F7;color:#8b88a0}
.hlist{display:flex;flex-direction:column;gap:6px;margin-top:4px;max-height:330px;overflow-y:auto}
.hli{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#56527a;padding:7px 10px;border-radius:9px;background:#FAFAFE;line-height:1.4}
.hli svg{flex:none;color:#a6a2bc}
.hli.win{background:color-mix(in srgb,${GREEN} 7%,#fff);color:#1a7d46}
.hli.win svg{color:${GREEN}}
.hli.bad{background:rgba(209,67,67,.06);color:#b4322e}
.hli.bad svg{color:${RED}}
.hli.warn{background:color-mix(in srgb,#E0662B 6%,#fff);color:#9a5a16}
.hli.warn svg{color:#E0662B}
.hli.done{color:#8b88a0}
@media(max-width:820px){.hb-cols{grid-template-columns:1fr}}
.kgoal{margin-top:9px}
.kgbar{height:5px;border-radius:20px;background:rgba(24,21,48,.09);overflow:hidden}
.kgbar div{height:100%;border-radius:20px;transition:width .35s}
.kgt{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:10.5px;font-weight:700;color:#8b88a0}
.kgt b{font-weight:800;color:${COBALT}}
.kgt b.hit{color:${GREEN}}
.kgt b.behind{color:#D97706}
.kpi.accent .kgbar,.kpi.green .kgbar,.kpi.gold .kgbar{background:rgba(255,255,255,.28)}
.kpi.accent .kgt,.kpi.green .kgt,.kpi.gold .kgt{color:rgba(255,255,255,.75)}
.kpi.accent .kgt b,.kpi.green .kgt b,.kpi.gold .kgt b{color:#fff}
.goal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.goal-row{display:flex;align-items:center;gap:12px;padding:11px 13px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE}
.goal-l{flex:1;min-width:0;display:flex;flex-direction:column}
.goal-l b{font-size:13px;color:${INK};font-weight:700}
.goal-l span{font-size:11px;color:#9b98ad}
.goal-in{display:flex;align-items:center;gap:3px;flex:none;border:1px solid #E1E2EC;border-radius:9px;background:#fff;padding:0 9px}
.goal-in i{font-style:normal;font-size:12px;color:#a6a2bc;font-weight:700}
.goal-in input{width:74px;border:none;padding:8px 2px;font-size:14px;font-weight:700;color:${INK};text-align:right;background:none}
.goal-in input:focus{outline:none}
.kgroup+.kgrid{margin-bottom:16px}
.funnel{display:flex;flex-direction:column;gap:9px;margin-top:6px}
.fn-row{display:grid;grid-template-columns:104px 1fr 40px 44px 52px;align-items:center;gap:10px}
.fn-row.fn-head{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#b7b4c6}
.fn-head .fn-c,.fn-head .fn-r{text-align:right}
.fn-r.close{font-weight:800;color:#1a7d46}
.fn-r.close.warn{color:#c0392b}
.mtabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.mtab{display:inline-flex;align-items:center;gap:6px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:700;color:#8b88a0;cursor:pointer}
.mtab.on{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff);color:${COBALT}}
.mtab-n{font-size:10.5px;font-weight:800;background:rgba(24,21,48,.08);border-radius:10px;padding:1px 7px}
.mtab.on .mtab-n{background:color-mix(in srgb,${COBALT} 18%,#fff)}
.mtab.alert{border-color:#FFA500;color:#D97706}
.mtab.alert .mtab-n{background:color-mix(in srgb,#E0662B 16%,#fff);color:#C05A1E}
.mtab-time{margin-left:auto;display:inline-flex;gap:4px}
.mtab-time button{border:1px solid #E4E5EF;background:#fff;border-radius:16px;padding:5px 10px;font-size:11px;font-weight:700;color:#8b88a0;cursor:pointer}
.mtab-time button.on{border-color:${INK};background:${INK};color:#fff}
.mtg-drow{gap:10px}
.mtg-drow.held{background:color-mix(in srgb,${GREEN} 4%,#fff)}
.mtg-drow.noshow{background:rgba(209,67,67,.04)}
.mtg-drow.needs{background:color-mix(in srgb,#E0662B 5%,#fff)}
.mtg-flag{color:#D97706;font-weight:700}
.mtg-acct{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#6B6A83;background:#F7F8FC;border:1px solid #E4E5EF;border-radius:10px;padding:7px 10px;margin-bottom:10px}
.mtg-acct b{color:${INK};font-weight:700}
.today-clear{display:flex;align-items:center;gap:9px;font-size:13px;color:#5B6478;margin-bottom:18px}
.today{margin-bottom:18px}
.td-n{margin-left:8px;font-size:11px;font-weight:700;color:${COBALT};background:color-mix(in srgb,${COBALT} 11%,#fff);border-radius:20px;padding:1px 8px;text-transform:none;letter-spacing:0}
.td-grp+.td-grp{margin-top:14px;border-top:1px solid #F0F1F7;padding-top:12px}
.td-h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8b88a0;margin-bottom:7px}
.td-row{display:flex;align-items:baseline;gap:9px;padding:5px 0;flex-wrap:wrap}
.td-name{background:none;border:0;padding:0;font-size:13.5px;font-weight:700;color:${INK};cursor:pointer;flex:none;text-align:left}
.td-name:hover{color:${COBALT}}
.td-txt{flex:1;min-width:0;font-size:12.5px;color:#5B6478;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.td-who{font-size:11.5px;color:#9A96AC;flex:none}
.td-who.late{color:${RED};font-weight:700}
@media(max-width:640px){.td-txt{flex:1 1 100%;white-space:normal}}
.fday{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#A6A2BC;padding:12px 0 5px;position:sticky;top:0;background:#fff;z-index:1}
.touchbar{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;background:color-mix(in srgb,${COBALT} 5%,#fff);border:1px solid color-mix(in srgb,${COBALT} 14%,#fff);border-radius:11px;padding:9px 12px;margin-bottom:11px}
.touchbar b{font-size:13px;font-weight:700;color:${INK}}
.touchbar span{font-size:12px;color:#5B6478}
.touchbar em{font-style:normal;font-size:11.5px;color:#9A96AC;margin-left:auto}
.compose-open{display:flex;align-items:center;gap:7px;width:100%;border:1px dashed #D8D9E6;background:#fff;color:#8E89A8;border-radius:11px;padding:10px 13px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;margin-bottom:4px}
.compose-open:hover{border-color:${COBALT};color:${COBALT}}
.afilter button.none{opacity:.45}
.kd-list{margin-bottom:8px}
.kd-row{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid #F2F3F9}
.kd-row:last-child{border-bottom:0}
.kd-row.soon .kd-d b{color:${COBALT}}
.kd-l{font-size:13px;font-weight:700;color:${INK};flex:0 0 auto}
.kd-d{flex:1;min-width:0;font-size:12.5px;color:#8E89A8}
.kd-d b{font-weight:700}
.kd-d em{font-style:normal;color:#A5A2BC}
.kd-add{display:flex;gap:7px;flex-wrap:wrap}
.kd-add select,.kd-add input{border:1px solid #E4E5EF;border-radius:9px;padding:7px 9px;font-size:12.5px;font-family:inherit;min-width:0}
.kd-add select{flex:1 1 150px}
.lbl-pick{display:flex;gap:6px;flex-wrap:wrap}
.lblchip{border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:4px 11px;font-size:11.5px;font-weight:600;font-family:inherit;color:${INK};cursor:pointer}
.lblchip:hover{border-color:${COBALT}}
.lblchip.on{background:${COBALT};border-color:${COBALT};color:#fff}
.lblchip.add{display:inline-flex;align-items:center;gap:3px;border-style:dashed;color:#8E89A8}
.lbl-tag{display:inline-block;margin-right:5px;font-size:10px;font-weight:700;color:${COBALT};background:color-mix(in srgb,${COBALT} 10%,#fff);border-radius:5px;padding:1px 6px}
.tagpick{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
.tagpick>span:first-child{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8b88a0}
.tagchip{display:inline-flex;align-items:center;gap:4px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600;font-family:inherit;color:${INK};cursor:pointer}
.tagchip:hover{border-color:${COBALT}}
.tagchip.on{background:${COBALT};border-color:${COBALT};color:#fff}
.tagpick-n{font-size:11px;color:#8E89A8}
.ftag{display:inline-flex;align-items:center;gap:3px;margin-left:6px;font-size:10.5px;font-weight:700;color:${COBALT};background:color-mix(in srgb,${COBALT} 11%,#fff);border-radius:6px;padding:1px 6px;cursor:pointer;vertical-align:1px}
.ftag.done{color:#9A96AC;background:#F1F2F8;text-decoration:line-through}
.sp-hist{margin-top:12px;border-top:1px solid #EDEEF6;padding-top:12px}
.sp-h{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8b88a0;margin-bottom:8px}
.sp-h b{font-size:12.5px;text-transform:none;letter-spacing:0;color:${INK}}
.sp-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F2F3F9}
.sp-row:last-of-type{border-bottom:0}
.sp-m{flex:1;min-width:0}
.sp-name{background:none;border:0;padding:0;font-size:13.5px;font-weight:700;color:${COBALT};cursor:pointer;text-align:left}
.sp-name:disabled{color:${INK};cursor:default}
.sp-tag{margin-left:6px;font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8E89A8;background:#F1F2F8;border-radius:5px;padding:1px 5px}
.sp-amt{font-size:13.5px;font-weight:700;color:${GREEN};flex:none}
.sp-amt.owed{color:#D97706}
.sp-lrow{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #F0F1F7}
.sp-lrow:last-child{border-bottom:0}
.sp-lm{flex:1;min-width:0}
.sp-on{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${GREEN};background:rgba(43,150,94,.1);border-radius:6px;padding:2px 8px;flex:none}
.sp-ask{border:1px solid ${COBALT};background:#fff;color:${COBALT};border-radius:9px;padding:5px 11px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;flex:none}
.sp-ask:hover{background:color-mix(in srgb,${COBALT} 8%,#fff)}
@media(max-width:640px){.sp-lrow{flex-wrap:wrap}.sp-lm{flex:1 1 100%}}
.sheet-fail{margin-top:10px;background:rgba(209,67,67,.06);border:1px solid rgba(209,67,67,.24);border-radius:12px;padding:12px 13px}
.sf-t{display:flex;align-items:flex-start;gap:7px;font-size:13px;font-weight:700;color:${RED};line-height:1.35}
.sf-t svg{flex:none;margin-top:1px}
.sf-f{font-size:12.5px;color:#5B6478;margin:7px 0 10px;line-height:1.45}
.sf-d{margin-top:10px;font-size:11.5px;color:#8E89A8}
.sf-d summary{cursor:pointer;font-weight:600}
.sf-d[open]{white-space:pre-wrap;word-break:break-word}
.recentbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid #E4E5EF;border-radius:14px;padding:10px 13px;margin-bottom:12px}
.rb-l{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8b88a0}
.rb{display:inline-flex;align-items:center;gap:5px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:5px 11px;font-size:12px;font-weight:600;font-family:inherit;color:${INK};cursor:pointer}
.rb:hover{border-color:${COBALT}}
.rb.on{background:${COBALT};border-color:${COBALT};color:#fff}
.rb.clear{border:0;color:#8E89A8;font-weight:500}
.rb.wipe{border-color:rgba(209,67,67,.35);color:${RED}}
.rb.wipe:hover{background:rgba(209,67,67,.08);border-color:${RED}}
.rb-n{margin-left:auto;font-size:12px;color:#8E89A8}
.rb-n b{color:${COBALT}}
@media(max-width:640px){.rb-n{margin-left:0;width:100%}}
.notnow{display:flex;align-items:center;gap:8px;width:100%;margin-bottom:10px;border:1px solid rgba(124,138,165,.35);background:rgba(124,138,165,.08);color:#4A5568;border-radius:11px;padding:9px 12px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;text-align:left}
.notnow:hover{border-color:#7C8AA5;background:rgba(124,138,165,.14)}
.notnow span{margin-left:auto;font-weight:500;font-size:11px;color:#8E89A8;text-align:right}
@media(max-width:640px){.notnow{flex-wrap:wrap}.notnow span{margin-left:0;width:100%;text-align:left}}
.mf-sel{position:relative;cursor:pointer}
.mf-sel select{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;font-family:inherit}
.mf-v{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:${INK};line-height:1.25}
.mf-v em{width:7px;height:7px;border-radius:50%;flex:none}
.mtg-loc{display:inline-flex;align-items:center;gap:3px;margin-left:7px;color:#8E89A8}
.loc-recent{display:inline-flex;gap:5px;flex-wrap:wrap;margin-left:8px}
.loc-recent button{border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:1px 8px;font-size:10.5px;font-family:inherit;color:${COBALT};cursor:pointer;font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.loc-recent button:hover{border-color:${COBALT}}
.rbc-pend{font-size:10.5px;font-weight:700;color:#D97706;background:rgba(217,119,6,.1);border-radius:6px;padding:1px 6px}
.mn-sub{font-style:normal;font-size:11px;color:#2C7A4B;font-weight:600}
.mn-sub.owed{color:#D97706}
.rbc-paid{font-size:10.5px;font-weight:700;color:#2C7A4B;background:rgba(44,122,75,.10);border-radius:6px;padding:1px 6px}
.onb-item.skipped{opacity:.5}
.onb-item.skipped .onb-label{text-decoration:line-through;color:#9A96AC}
.onb-skip{margin-left:auto;border:1px solid #E4E5EF;background:#fff;color:#9A96AC;border-radius:7px;padding:2px 8px;font-size:10.5px;font-weight:700;font-family:inherit;cursor:pointer;flex:none}
.onb-skip:hover{border-color:${COBALT};color:${COBALT}}
.onb-item .onb-skip.hide{opacity:0;margin-left:6px}
.onb-item:hover .onb-skip.hide{opacity:1}
.onb-showskip{background:none;border:0;color:${COBALT};font-size:11.5px;font-weight:700;font-family:inherit;cursor:pointer;padding:2px 0 8px}
.tx-src{margin-left:7px;font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${COBALT};background:color-mix(in srgb,${COBALT} 11%,#fff);border-radius:5px;padding:1px 5px}
tr.tx-derived td{background:color-mix(in srgb,${COBALT} 2.5%,#fff)}
.ev-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.ev-card{text-align:left;background:#fff;border:1px solid #E4E5EF;border-radius:16px;padding:15px 16px;cursor:pointer;display:flex;flex-direction:column;gap:3px}
.ev-card:hover{border-color:${COBALT}}
.ev-card.done{opacity:.6}
.ev-when{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:${COBALT}}
.ev-name{font-size:16px;font-weight:700;color:${INK};font-family:'Space Grotesk',sans-serif}
.ev-venue{font-size:12.5px;color:#8E89A8}
.ev-stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:12px;font-weight:600;color:#5B6478}
.ev-stats .good{color:${GREEN}}.ev-stats .bad{color:${RED}}
.ev-late{display:flex;align-items:center;gap:5px;margin-top:8px;font-size:11.5px;font-weight:700;color:${RED}}
.ev-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid #F0F1F7}
.ev-row:last-of-type{border-bottom:0}
.ev-row.ms.done .ev-lab{text-decoration:line-through;color:#9A96AC}
.ev-row.ms.late .ev-date{border-color:${RED};color:${RED}}
.ev-lab{flex:1 1 170px;min-width:0;border:1px solid #E4E5EF;border-radius:9px;padding:7px 10px;font-size:13px;font-family:inherit;color:${INK}}
.ev-amt{width:96px;border:1px solid #E4E5EF;border-radius:9px;padding:7px 10px;font-size:13px;font-family:inherit}
.ev-date{border:1px solid #E4E5EF;border-radius:9px;padding:6px 9px;font-size:12.5px;font-family:inherit}
.ev-st{border:1px solid #E4E5EF;border-radius:9px;padding:6px 8px;font-size:12.5px;font-family:inherit}
.ev-who{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:${COBALT};cursor:pointer}
.ev-plus{display:inline-flex;align-items:center;gap:3px;font-size:12px;color:#8E89A8}
.ev-plus input{width:46px;border:1px solid #E4E5EF;border-radius:8px;padding:5px 6px;font-size:12.5px;font-family:inherit}
.ev-paid{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#8E89A8;cursor:pointer}
.ev-paid.on{color:${GREEN}}
.ev-x{background:none;border:0;color:#B9B6C6;cursor:pointer;display:inline-flex;padding:3px}
.ev-x:hover{color:${RED}}
.ev-tick{background:none;border:0;cursor:pointer;color:#C9C5D9;display:inline-flex;padding:0}
.ev-row.ms.done .ev-tick{color:${GREEN}}
.ev-pick{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1 1 260px}
.ev-pick select,.ev-pick input{border:1px solid #E4E5EF;border-radius:9px;padding:7px 9px;font-size:12.5px;font-family:inherit;min-width:0;flex:1 1 130px}
.ev-or{font-size:11.5px;color:#A5A2BC}
.ev-seed{display:flex;align-items:center;gap:12px;padding:6px 0 14px;font-size:13px;color:#8E89A8}
.ev-sum{margin-top:14px;border-top:1px solid #E4E5EF;padding-top:12px}
.ev-sum div{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#5B6478}
.ev-sum div.tot{font-size:14.5px;color:${INK};font-weight:700;border-top:1px solid #F0F1F7;margin-top:6px;padding-top:10px}
.ev-sum .good{color:${GREEN}}.ev-sum .bad{color:${RED}}
.ev-next{display:block;width:100%;text-align:left;cursor:pointer;margin-bottom:18px}
.ev-next:hover{border-color:${COBALT}}
.ev-next-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ev-count{font-size:22px;font-weight:800;font-family:'Space Grotesk',sans-serif;color:${COBALT};flex:none}
.ev-count.soon{color:${RED}}
.ev-next-s{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:#5B6478}
.ev-next-s b{color:${INK};font-weight:700}
.ev-next-s .good b{color:${GREEN}}.ev-next-s .bad b{color:${RED}}
.sheet-box{border:1px solid #E4E5EF;border-radius:14px;padding:13px 14px;margin-bottom:16px;background:#FAFBFE}
.sheet-h{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:${INK};margin-bottom:10px}
.sheet-when{margin-left:auto;font-size:11px;font-weight:500;color:#9A96AC}
.sheet-row{display:flex;gap:8px;flex-wrap:wrap}
.sheet-row input{flex:1 1 220px;min-width:0;border:1px solid #E4E5EF;border-radius:9px;padding:8px 10px;font-size:12.5px;font-family:inherit}
.sheet-row .sheet-tab{flex:0 1 140px}
.sheet-plan{margin-top:12px;border-top:1px solid #E9EAF3;padding-top:12px}
.sheet-map{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.sheet-map label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#8E89A8}
.sheet-map select{border:1px solid #E4E5EF;border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;max-width:150px}
.sheet-tally{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:#5B6478;margin-bottom:10px}
.sheet-tally b{font-weight:800}
.sheet-tally .fresh b{color:${COBALT}}.sheet-tally .match b{color:${GREEN}}
.sheet-tally .unsure b{color:#D97706}.sheet-tally .dupe b,.sheet-tally .skip b{color:#9A96AC}
.sheet-unsure{background:rgba(217,119,6,.07);border:1px solid rgba(217,119,6,.2);border-radius:10px;padding:9px 11px;font-size:12px;color:#7A5A10;margin-bottom:10px}
.sheet-unsure div{padding:2px 0}
.sheet-acts{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.hb-stale{color:#D97706;font-weight:600}
.client-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:rgba(217,119,6,.07);border:1px solid rgba(217,119,6,.22);border-radius:12px;padding:10px 13px;margin-bottom:14px}
.client-bar.paid{background:rgba(43,150,94,.07);border-color:rgba(43,150,94,.22)}
.cb-l{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#56527a;min-width:0}
.cb-l b{color:${INK}}
.cb-l i{font-style:normal;font-weight:600;color:${INK}}
.cb-undo{flex:none;font-size:12px}
.cb-pay{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(217,119,6,.4);background:#fff;color:#B45309;border-radius:9px;padding:6px 11px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer}
.cb-pay:hover{background:rgba(217,119,6,.08)}
.cb-pay.on{border-color:rgba(43,150,94,.4);color:${GREEN}}
.cb-pay.on:hover{background:rgba(43,150,94,.08)}
.mtg-filters{display:flex;gap:9px;flex-wrap:wrap}
.mtg-q{flex:1 1 240px;min-width:0;border:1px solid #E4E5EF;border-radius:10px;padding:9px 12px;font-size:13px;font-family:inherit;color:${INK}}
.mtg-filters select{border:1px solid #E4E5EF;border-radius:10px;padding:9px 10px;font-size:13px;font-family:inherit}
.mrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 0;border-bottom:1px solid #F0F1F7}
.mrow:last-child{border-bottom:0}
.mrow.needs{background:rgba(217,119,6,.05)}
.mrow.undated{background:color-mix(in srgb,${COBALT} 4%,#fff)}
.mrow.held{opacity:.72}
.mrow.noshow{opacity:.62}
.mrow-l{flex:1 1 220px;min-width:0}
.mrow-name{background:none;border:0;padding:0;font-family:'Space Grotesk',sans-serif;font-size:14.5px;font-weight:700;color:${INK};cursor:pointer;text-align:left}
.mrow-name:hover{color:${COBALT}}
.mrow-sub{font-size:12px;color:#8E89A8;margin-top:2px}
.mrow-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
.mrow-type{border:1px solid #E4E5EF;border-radius:9px;padding:6px 8px;font-size:12px;font-family:inherit;color:${COBALT};font-weight:600;background:#fff}
.mrow-cal{display:inline-flex;align-items:center;color:#A5A2BC;padding:3px}
.mrow-cal:hover{color:${COBALT}}
@media(max-width:640px){.mrow-r{width:100%;margin-left:0}}
.dash-arrange{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.dash-arrange .btn.on{background:${COBALT};color:#fff;border-color:${COBALT}}
.dsec{border:1.5px dashed #D6D8E8;border-radius:16px;padding:0 0 4px;margin-bottom:14px;background:#FCFCFE}
.dsec.dragging{opacity:.45;border-color:${COBALT}}
.dsec.off{opacity:.5}
.dsec-h{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:grab;border-bottom:1px dashed #E6E7F1}
.dsec-h:active{cursor:grabbing}
.dsec-grip{color:#A5A2BC;flex:none}
.dsec-t{font-size:12.5px;font-weight:700;color:${INK}}
.dsec.off .dsec-t{text-decoration:line-through;color:#9A96AC}
.dsec-btns{margin-left:auto;display:flex;gap:6px}
.dsec-b{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:26px;border:1px solid #E4E5EF;background:#fff;border-radius:8px;color:${INK};cursor:pointer;font-size:11.5px;font-weight:700}
.dsec-b.wide{padding:0 10px}
.dsec-b:disabled{opacity:.35;cursor:not-allowed}
/* in arrange mode the content is a preview, not a control surface — otherwise
   grabbing a section fires whatever KPI tile happens to be under the cursor */
.dsec-body{pointer-events:none;padding:10px 12px 0;max-height:270px;overflow:hidden;position:relative}
.dsec-body:after{content:'';position:absolute;left:0;right:0;bottom:0;height:44px;background:linear-gradient(to bottom,rgba(252,252,254,0),#FCFCFE)}
.pill-upsell{display:inline-block;margin-right:7px;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${COBALT};background:color-mix(in srgb,${COBALT} 12%,#fff);border-radius:6px;padding:1px 6px}
.seg-n{margin-left:6px;font-size:10.5px;font-weight:800;opacity:.62}
.seg-b.on .seg-n{opacity:.9}
.task-overdue{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:${RED};background:rgba(209,67,67,.08);border:1px solid rgba(209,67,67,.2);border-radius:12px;padding:10px 13px}
.task-hint{display:flex;align-items:center;gap:8px;font-size:13px;color:#5A5680;background:#F4F5FA;border:1px solid #E4E5EF;border-radius:12px;padding:10px 13px}
.ftxt.cancelled{color:#8E89A8;text-decoration:line-through;text-decoration-color:#C9C6D8}
.act-row.cancelled .act-txt,.act-row.cancelled .act-lead{color:#9A96AC;text-decoration:line-through;text-decoration-color:#D5D2E0}
.act-row.cancelled .fcancel{text-decoration:none}
.fcancel{display:inline-block;margin-left:7px;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${RED};background:rgba(209,67,67,.09);border-radius:6px;padding:1px 6px;text-decoration:none;vertical-align:1px}
.mtg-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bookc{margin-top:10px}
.bookc .mtg-form{padding:0;border:0;background:none}
.mtab.undated{border-color:${COBALT};color:${COBALT}}
.mtab.undated .mtab-n{background:color-mix(in srgb,${COBALT} 16%,#fff);color:${COBALT}}
.mtg-drow.undated{background:color-mix(in srgb,${COBALT} 4%,#fff)}
.mtg-undated{color:${COBALT};font-weight:700}
.mtg-fix{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.mtg-fix input[type=datetime-local]{border:1px solid #E4E5EF;border-radius:9px;padding:5px 8px;font-size:12px;font-family:inherit;color:${INK};background:#fff}
.mtg-fix select{border:1px solid #E4E5EF;border-radius:9px;padding:5px 6px;font-size:12px;font-family:inherit;color:${INK};background:#fff}
.mtg-fix.sm input[type=datetime-local]{font-size:11.5px;padding:4px 6px}
.mtg-band.undated{color:${COBALT}}
.mtg-row.undated{background:color-mix(in srgb,${COBALT} 4%,#fff)}
@media(max-width:640px){.mtg-fix{width:100%}.mtg-fix input[type=datetime-local]{flex:1 1 150px}}
.an-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:11px;margin-bottom:18px}
.an-card{background:#fff;border:1px solid #EAEBF2;border-radius:13px;padding:14px 16px}
.an-card.warn{border-color:#FFD59E;background:color-mix(in srgb,#FFA500 6%,#fff)}
.pay-mrr{font-size:11.5px;color:#8b88a0;margin:-2px 0 8px}
/* rep pay */
.rp-rep{border:1px solid #EDEEF5;border-radius:12px;padding:12px 14px;margin-bottom:12px}
.rp-head{display:flex;align-items:center;gap:10px;cursor:pointer}
.rp-nums{margin-left:auto;display:flex;gap:8px;align-items:center}
.rp-pend{font-style:normal;font-size:11.5px;font-weight:700;color:#B45309;background:rgba(217,119,6,.10);border-radius:6px;padding:2px 7px}
.rp-owed{font-style:normal;font-size:11.5px;font-weight:700;color:#2B4DE0;background:rgba(43,77,224,.09);border-radius:6px;padding:2px 7px}
.rp-batch{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:10px 0;padding:10px 12px;border-radius:10px;background:#F6F8FE;border:1px solid #E3E8F7}
.rp-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #F4F5FA}
.rp-row.paid{opacity:.7}
.rp-m{flex:1}
.rp-m b{display:block}
.rp-v{font-weight:700}
.rp-stale{display:flex;gap:8px;margin:10px 0;padding:10px 12px;border-radius:10px;background:#FFF8EE;border:1px solid #FFD59E;font-size:12.5px}
.rp-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid #F4F5FA}
.mtg-pay{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.mtg-pay-r{display:flex;gap:16px;flex-wrap:wrap}
.mtg-pay-r span{font-size:12px;color:#5A6178}
.mtg-pay-r em{font-style:normal;font-weight:800;color:#181530;font-size:15px;margin-right:3px}
.mtg-fee{font-weight:700;color:#B45309}
.mtg-fee.approved{color:#2C7A4B}
.mtg-fee.paid{color:#8b88a0}
.tm-pay{display:flex;gap:6px;flex-wrap:wrap}
.tm-pay em{font-style:normal;font-size:11px;font-weight:800;color:#2B4DE0;background:rgba(43,77,224,.09);border-radius:6px;padding:2px 7px}
.tm-nopay{font-size:11px;font-weight:700;color:#8b88a0;background:#F1F2F8;border-radius:6px;padding:2px 7px}
/* payment review */
.pr-lead{border:1px solid #EDEEF5;border-radius:12px;padding:12px 14px;margin-bottom:12px}
.pr-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px}
.pr-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-top:1px solid #F4F5FA}
.pr-row.undecided{background:linear-gradient(90deg,rgba(224,102,43,.05),transparent 60%)}
.pr-m b{display:block}
.pr-why{display:block;font-size:11px;color:#8b88a0;margin-top:3px}
.pr-pick{display:flex;gap:4px;align-items:flex-start}
.pr-pick button{font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:8px;border:1px solid #E3E5EF;background:#fff;color:#5A6178;cursor:pointer}
.pr-pick button.on{background:#2B4DE0;border-color:#2B4DE0;color:#fff}
.pr-pick button:disabled{opacity:.4;cursor:not-allowed}
.pr-split{grid-column:1/-1;display:flex;gap:12px;align-items:center;padding:6px 0 2px}
.pr-split label{font-size:11.5px;color:#5A6178;display:flex;gap:5px;align-items:center}
.pr-split input{width:92px;padding:3px 7px;font-size:12px;border:1px solid #E3E5EF;border-radius:7px}
.pr-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid #F4F5FA}
.pr-block{font-size:11.5px;font-weight:700;color:#B45309;display:flex;gap:5px;align-items:center}
.rate{font-variant-numeric:tabular-nums}
.rate.warn{color:#B45309;font-weight:800}
.rate.good{color:#2C7A4B;font-weight:800}
/* under the sample floor: readable, and deliberately colourless */
.rate-thin{color:#8b88a0;font-weight:700}
.rate-none{color:#C9C5D9}
.an-l{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#a6a2bc}
.an-v{font-size:27px;font-weight:800;color:${INK};font-family:'Space Grotesk',sans-serif;margin:4px 0 2px}
.an-d{font-size:11.5px;color:#9b98ad}
.src-list{display:flex;flex-direction:column;gap:2px;margin-top:6px}
.rbc-list{display:flex;flex-direction:column;gap:3px;margin-top:8px}
.rbc-row{display:grid;grid-template-columns:1fr 120px 88px;align-items:center;gap:12px;padding:8px 10px;border-radius:9px;cursor:pointer;transition:.12s}
.rbc-row:hover{background:#FAFAFE}
.rbc-m{display:flex;align-items:center;gap:8px;min-width:0}
.rbc-name{font-weight:700;color:${INK};font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rbc-deals{flex:none;font-size:10.5px;font-weight:700;color:${COBALT};background:color-mix(in srgb,${COBALT} 9%,#fff);border-radius:11px;padding:1px 8px}
.rbc-mrr{flex:none;font-size:10.5px;font-weight:700;color:#1a7d46;background:color-mix(in srgb,${GREEN} 10%,#fff);border-radius:11px;padding:1px 8px}
.rbc-bar{height:8px;background:#EEF0F8;border-radius:5px;overflow:hidden}
.rbc-bar>div{height:100%;border-radius:5px;background:linear-gradient(90deg,${COBALT},#4E6BF0)}
.rbc-v{text-align:right;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:14px;color:${INK}}
.rbc-more{margin-top:8px;font-size:12px;color:#928DAD;text-align:center}
@media(max-width:640px){.rbc-row{grid-template-columns:1fr 70px;gap:8px}.rbc-bar{display:none}}
.src-row{display:grid;grid-template-columns:1fr 60px 60px 56px 90px;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;font-size:13px;color:${INK}}
.src-row:not(.src-head):hover{background:#FAFAFE}
.src-row.src-head{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#b7b4c6}
.src-row span:not(.src-name){text-align:right}
.src-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.src-hi{color:#1a7d46;font-weight:800}
.src-lo{color:#c0392b;font-weight:800}
@media(max-width:640px){.src-row{grid-template-columns:1fr 40px 40px 44px;gap:6px}.src-row span:nth-child(5){display:none}}
.fn-l{font-size:12.5px;font-weight:700;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fn-bar{height:11px;background:#F1F2F8;border-radius:20px;overflow:hidden}
.fn-bar div{height:100%;border-radius:20px;transition:width .3s}
.fn-c{font-size:13px;font-weight:800;color:${INK};text-align:right;font-family:'Space Grotesk',sans-serif}
.fn-r{font-size:11.5px;font-weight:700;color:#8b88a0;text-align:right}
@media(max-width:640px){.fn-row{grid-template-columns:76px 1fr 30px 38px 40px;gap:6px}}
.web-fs{position:fixed;inset:0;z-index:80;background:#F4F6FB;display:flex;flex-direction:column;padding:16px 20px;animation:pop .16s ease}
.web-fs .web-legend{flex:none;margin-bottom:8px}
.web-fs .web-trace{flex:none}
.web-fs-stage{flex:1;min-height:0;background:#fff;border:1px solid #EAEBF2;border-radius:14px;overflow:hidden;margin-top:8px}
@media(max-width:640px){.web-fs{padding:10px 12px}}
.web-legend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:11.5px;color:#8b88a0;font-weight:600}
.web-legend span{display:inline-flex;align-items:center;gap:5px}
.web-legend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.web-tip{color:#c0bdd0!important;font-weight:500}
.web-trace{font-size:12.5px;color:#56527a;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:8px 12px;margin-bottom:10px;line-height:1.5}
.web-trace b{color:${INK}}
.web-trace span{color:#5b3fa6;font-weight:600;cursor:pointer}
.web-trace span:hover{text-decoration:underline}
.web-scroll{overflow:auto;max-height:66vh;border:1px solid #F0F1F6;border-radius:10px;background:linear-gradient(#FCFCFE,#FCFCFE)}
.web-svg{display:block}
.web-you{fill:${INK}}
.web-youtxt{fill:#fff;font-size:12px;font-weight:700;font-family:'Space Grotesk',sans-serif}
.web-link{fill:none;stroke:#DCDEEA;stroke-width:1.5}
.web-link.you{stroke:#C9CBDA;stroke-dasharray:4 3}
.web-link.on{stroke:${COBALT};stroke-width:2.5}
.web-node{cursor:pointer}
.web-node rect{transition:.12s}
.web-node.dim{opacity:.32}
.web-node:hover rect:first-child{filter:drop-shadow(0 3px 8px rgba(0,0,0,.13))}
.web-name{font-size:12px;font-weight:700;fill:${INK};font-family:'Inter',sans-serif}
.web-co{font-size:9.5px;fill:#9b98ad;font-family:'Inter',sans-serif}
.web-kids{font-size:9.5px;font-weight:700;fill:#56527a}
.scope-seg{flex:none}
.scope-seg button{display:inline-flex;align-items:center;gap:6px}
.scope-seg button i{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;background:#DFE2EE;color:#56527a;min-width:16px;text-align:center}
.scope-seg button.on i{background:${COBALT};color:#fff}
.claim-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid ${COBALT};background:rgba(43,77,224,.06);color:${COBALT};font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:20px;cursor:pointer;white-space:nowrap}
.claim-btn:hover{background:${COBALT};color:#fff}
.pool-note{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#56527a;background:#F4F5FA;border:1px solid #E5E6F0;border-radius:9px;padding:9px 12px;margin-bottom:12px}
/* batch reassign on the Leads table */
.selcol{width:34px;padding-right:0!important;text-align:center}
.selcol input{cursor:pointer;width:15px;height:15px;accent-color:${COBALT}}
tbody tr.picked{background:#F2F4FE}
tbody tr.picked:hover{background:#E9EDFD}
.bulkbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#EEF1FD;border:1px solid #D6DDF8;border-radius:10px;padding:9px 12px;margin-bottom:12px}
.bulkbar .bb-n{font-size:13px;color:${INK}}
.bulkbar .bb-n b{font-size:14px}
.bulk-confirm{border:1px solid #E7D9A8;background:#FDFAEF;border-radius:11px;padding:13px 14px;margin-bottom:12px}
.bulk-confirm .bc-h{display:flex;align-items:center;gap:8px;font-size:14px;color:${INK};margin-bottom:9px}
.bulk-confirm .bc-p{font-size:12.5px;color:#56527a;line-height:1.5;margin:0 0 9px}
.bulk-confirm .bc-tip{margin-bottom:0;color:#7a7590}
.bulk-confirm .bc-list{margin:0 0 10px;padding-left:18px;font-size:12.5px;color:#56527a;line-height:1.7}
.bulk-confirm .bc-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.bulk-result{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;line-height:1.5;border-radius:9px;padding:9px 12px;margin-bottom:12px;border:1px solid #E7C9CD;background:#FDF4F5;color:#7d4a50}
.bulk-result.good{border-color:#CFE7D6;background:#F3FAF5;color:#2f6b45}
.own-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#EEF0F7;color:#4a4763}
.fu-scope{margin-bottom:14px}
.fu-owner{margin-top:8px}
.team-list{display:flex;flex-direction:column;gap:8px}
.team-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE}
.team-av{width:28px;height:28px;border-radius:50%;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex:none}
.team-name{font-weight:700;color:${INK};font-size:13.5px;flex:1;min-width:0}
.team-seg{flex:none}
.team-seg button{font-size:11.5px;padding:5px 11px}
@media(max-width:640px){.team-row{flex-wrap:wrap}.team-seg{width:100%}.team-seg button{flex:1}}
.imp-sub{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8b88a0;margin-bottom:8px}
.imp-map{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.imp-row{display:flex;align-items:center;gap:7px;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:7px 10px}
.imp-h{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.imp-row select{border:1px solid #E1E2EC;border-radius:7px;padding:5px 7px;font-size:12px;color:${INK};background:#fff;max-width:130px}
.imp-warn{display:flex;align-items:flex-start;gap:6px;font-size:12px;color:#9a5a16;background:#FFF7ED;border:1px solid #FCD9B6;border-radius:8px;padding:8px 11px;margin-top:10px}
.imp-warn svg,.imp-note svg{flex:none;margin-top:1px}
/* the neutral twin of .imp-warn: two columns onto Name or Notes is a FEATURE
   (they get joined), so it must not wear the colour that means data loss */
.imp-note{display:flex;align-items:flex-start;gap:6px;font-size:12px;color:#4a4763;background:#F1F3FB;border:1px solid #DDE1F0;border-radius:8px;padding:8px 11px;margin-top:10px}
@media(max-width:640px){.imp-map{grid-template-columns:1fr}}
.act-types{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.act-t{font-size:12px;font-weight:600;padding:6px 10px;border-radius:9px;border:1px solid #DEDFEA;background:#fff;color:#56527a;cursor:pointer;display:flex;align-items:center;gap:5px}
.act-t.on{border-color:${COBALT};background:rgba(43,77,224,.08);color:${COBALT}}
.act-input{width:100%;padding:11px 12px;border:1px solid #DEDFEA;border-radius:10px;font-size:13.5px;font-family:'Inter';resize:vertical;min-height:52px}
.act-input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.act-t.pay.on{border-color:${GREEN};background:color-mix(in srgb,${GREEN} 10%,#fff);color:#1a7d46}
.pay-compose-row{display:flex;gap:8px}
.pc-amt{display:flex;align-items:center;border:1px solid #DEDFEA;border-radius:10px;padding:0 10px;background:#fff;flex:none;width:120px}
.pc-amt:focus-within{border-color:${GREEN};box-shadow:0 0 0 3px color-mix(in srgb,${GREEN} 18%,#fff)}
.pc-amt span{color:#8E89A8;font-weight:700;font-size:14px}
.pc-amt input{border:none;outline:none;padding:11px 6px;font-size:14px;width:100%;font-weight:700;color:${INK}}
.pc-note{flex:1;border:1px solid #DEDFEA;border-radius:10px;padding:11px 12px;font-size:13.5px;font-family:'Inter'}
.pc-note:focus{outline:none;border-color:${GREEN};box-shadow:0 0 0 3px color-mix(in srgb,${GREEN} 18%,#fff)}
.rep-pay-toggle{display:flex;gap:12px;align-items:flex-start;margin-top:16px;padding-top:16px;border-top:1px solid #EFEFF6;cursor:pointer}
.rep-pay-toggle .sw{margin-top:2px}
/* The feed is now the ONLY scroller in this column. It was a flex child with
   overflow-y:auto and no flex sizing, nested inside .m-right which also
   scrolled — so it collapsed to a ~120px sliver with its own scrollbar while
   the column scrolled around it. flex:1 claims the leftover height and
   min-height:0 is what actually lets it shrink; without that a flex child
   refuses to go below its content and overflows instead. */
/* wide mode: the left column collapses out and the log owns the window */
.m-grid.wide{grid-template-columns:1fr}
.m-grid.wide .m-left,.m-grid.wide .m-prep{display:none}
.m-grid.wide .m-right{border-left:0}
.m-grid.wide .fitem{padding:13px 0}
.m-grid.wide .ftxt{font-size:14px}
.feed-wide{margin-left:auto;display:inline-flex;align-items:center;gap:5px;border:1px solid #E4E5EF;background:#fff;color:#8E89A8;border-radius:8px;padding:3px 9px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;text-transform:none;letter-spacing:0}
.feed-wide:hover{border-color:${COBALT};color:${COBALT}}
.mn-note{font-size:12.5px;color:#5B6478;background:color-mix(in srgb,${COBALT} 5%,#fff);border:1px solid color-mix(in srgb,${COBALT} 14%,#fff);border-radius:10px;padding:10px 12px;margin-bottom:14px;line-height:1.5}
.mn-two{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.mn-row{display:flex;align-items:baseline;gap:10px;padding:6px 0;border-bottom:1px solid #F2F3F9;font-size:13px}
.mn-row:last-child{border-bottom:0}
.mn-row span{flex:1;min-width:0;color:#5B6478}
.mn-row b{font-weight:700}
.mn-row b.in,.mn-net b.in{color:${GREEN}}
.mn-row b.out,.mn-net b.out{color:#b4322e}
.mn-net{margin-top:16px;padding-top:13px;border-top:1px solid #EDEEF6;font-size:14px;font-weight:600;color:${INK}}
.mn-chart{display:flex;align-items:flex-end;gap:10px;height:230px;padding:8px 0}
.mn-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%}
.mn-bars{flex:1;display:flex;align-items:flex-end;gap:3px;width:100%;justify-content:center}
.mn-bar{width:14px;height:100%;display:flex;align-items:flex-end}
.mn-fill{width:100%;border-radius:4px 4px 0 0;transition:height .3s}
.mn-fill.in{background:linear-gradient(180deg,#38BDF8,${COBALT})}
.mn-fill.out{background:linear-gradient(180deg,#F0A17A,#b4322e)}
.mn-net-s{font-size:10.5px;font-weight:700}
.mn-net-s.in{color:${GREEN}}.mn-net-s.out{color:#b4322e}
.mn-lbl{font-size:10.5px;color:#8E89A8;text-transform:uppercase;letter-spacing:.04em}
.mn-key{display:flex;gap:16px;justify-content:center;font-size:11.5px;color:#8E89A8;margin-top:6px}
.mn-key i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.mn-key i.in{background:${COBALT}}.mn-key i.out{background:#b4322e}
.mn-cat{display:flex;align-items:center;gap:11px;padding:8px 0}
.mn-cat-n{flex:0 0 130px;font-size:13px;font-weight:600;color:${INK}}
.mn-cat-bar{flex:1;height:8px;background:#F1F2F8;border-radius:5px;overflow:hidden}
.mn-cat-bar div{height:100%;background:linear-gradient(90deg,${COBALT},#38BDF8);border-radius:5px}
.mn-cat b{font-size:13px;font-weight:700;flex:0 0 78px;text-align:right}
.mn-cat em{font-style:normal;font-size:11.5px;color:#9A96AC;flex:0 0 40px;text-align:right}
.mn-bill{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid #F2F3F9}
.mn-bill.off{opacity:.45}
.mn-bill input,.mn-bill select{border:1px solid #E4E5EF;border-radius:8px;padding:6px 8px;font-size:12.5px;font-family:inherit;min-width:0}
.mn-bn{flex:1 1 160px}
.mn-ba{width:92px}
.mn-pm{font-size:12px;font-weight:700;color:${COBALT};min-width:76px;text-align:right}
@media(max-width:760px){.mn-two{grid-template-columns:1fr;gap:18px}.mn-cat-n{flex:0 0 100px}}
.m-danger{flex:none;margin-top:14px;padding-top:14px;border-top:1px solid #F0F0F6}
.feed{margin-top:12px;display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:#D8D9E6 transparent}
.feed::-webkit-scrollbar{width:7px}
.feed::-webkit-scrollbar-thumb{background:#D8D9E6;border-radius:4px}
.feed::-webkit-scrollbar-thumb:hover{background:#BFC0D4}
.fitem{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid #F0F0F6}.fitem:last-child{border:none}
.fic{width:30px;height:30px;border-radius:8px;background:rgba(43,77,224,.09);color:${COBALT};display:flex;align-items:center;justify-content:center;flex:none}
.fitem.note .fic{background:rgba(200,162,74,.16);color:#9A7B22}
.fitem .ftxt{font-size:13px;color:#3a3658;line-height:1.45}.fitem .fmeta{font-size:11px;color:#A6A2BC;margin-top:3px;font-weight:600}
.fitem .fdel{margin-left:auto;background:none;border:none;color:#C9C5D9;cursor:pointer;padding:3px;flex:none}.fitem .fdel:hover{color:${RED}}
/* settings */
.set-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F0F0F6}.set-row:last-child{border:none}
.opt-chip{display:inline-flex;align-items:center;gap:7px;background:#F1F2F8;border-radius:8px;padding:6px 8px 6px 11px;font-size:13px;color:#3a3658;margin:0 7px 7px 0}
.opt-chip button{background:none;border:none;color:#A6A2BC;cursor:pointer;display:flex}.opt-chip button:hover{color:${RED}}
.addrow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.addrow input,.addrow select{padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13.5px;font-family:'Inter'}
.swatch{width:26px;height:26px;border-radius:7px;border:1px solid #E0E0EC;flex:none;cursor:pointer;padding:0}
.logo-drop{border:2px dashed #DEDFEA;border-radius:14px;padding:26px;text-align:center;cursor:pointer;color:#8E89A8;transition:.15s}.logo-drop:hover{border-color:${COBALT};color:${COBALT};background:rgba(43,77,224,.03)}
.logosize{margin-top:14px;max-width:340px}
.logosize-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
.logosize-h span{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD}
.logosize-h b{font-family:'Space Grotesk';font-size:13px;color:${INK}}
.logosize input[type=range]{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:#E4E5EF;outline:none}
.logosize input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.logosize input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff}
.note{background:#FBF6E9;border:1px solid #EBDCB5;border-radius:12px;padding:14px 16px;font-size:13px;color:#7a6320;line-height:1.5}.note b{color:#5e4c12}
.convert-banner.fix{background:color-mix(in srgb,#FFA500 7%,#fff);border-color:#FFD59E}
.convert-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,rgba(43,77,224,.08),rgba(59,52,112,.08));border:1px solid #D9DCF2;border-radius:14px;padding:14px 16px;margin-bottom:18px}
.convert-banner b{font-family:'Space Grotesk';font-size:15px;color:${INK}}
.deliv{background:#fff;border:1px solid #E8E9F2;border-radius:14px;padding:16px 18px;margin-bottom:18px}
.track{padding:12px 0;border-bottom:1px solid #F0F0F6}.track:last-of-type{border-bottom:none}
.track-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.track-h b{font-family:'Space Grotesk';font-size:14px;color:${INK}}
.track-h .phase{font-size:11.5px;font-weight:600;color:${COBALT};background:rgba(43,77,224,.09);padding:3px 9px;border-radius:20px}
.pbar{height:7px;background:#ECECF4;border-radius:6px;overflow:hidden;margin-bottom:10px}
.pbar>div{height:100%;border-radius:6px;background:linear-gradient(90deg,${COBALT},${GREEN});transition:width .4s}
.mslist{display:flex;flex-direction:column;gap:2px}
.ms{display:flex;align-items:center;gap:9px;padding:7px 6px;border-radius:8px;font-size:13.5px;color:#3a3658}
.ms:hover{background:#FAFAFD}
.ms .mcheck{display:flex;align-items:center;gap:9px;flex:1;cursor:pointer;min-width:0}
.ms .mtxt{flex:1}.ms.on .mtxt{color:#8E89A8;text-decoration:line-through}
.ms.over .mtxt{color:${RED}}
.ms .mdate{font-size:11px;color:#A6A2BC;font-weight:600;white-space:nowrap}
.ms .mdate.done{color:${GREEN}}
.msdue-w{display:flex;align-items:center;gap:6px}
.msdue-l{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#A6A2BC}
.ms.over .msdue-l{color:${RED}}
.msdue{font-size:11.5px;font-weight:600;color:#56527a;border:1px solid #E0E1EE;border-radius:7px;padding:3px 6px;background:#fff;font-family:inherit;cursor:pointer}
.msdue:hover{border-color:#C9CBE0}
.msdue.over{border-color:${RED};color:${RED};background:rgba(209,67,67,.05)}
.track-h .phase.od{color:${RED};background:rgba(209,67,67,.1)}
.rdot.over{background:${RED};border-color:${RED}}
.od-tag{color:${RED};font-weight:700}.due-tag{color:${COBALT};font-weight:600}
.tbl-cap{padding:14px 16px;border-bottom:1px solid #E8E9F2;font-weight:600;color:${INK};font-family:'Space Grotesk'}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.badge.done{color:${GREEN};background:rgba(31,157,85,.1)}
.badge.over{color:${RED};background:rgba(209,67,67,.1)}
.deliv-done{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(31,157,85,.08);color:#157a41;font-size:12.5px;font-weight:600}
.rtag{display:inline-block;margin-left:8px;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${GREEN};background:rgba(31,157,85,.1);padding:2px 7px;border-radius:20px;vertical-align:middle}
.btn-s{background:#fff;color:${INK};border:1px solid #DEDFEA}.btn-s:hover{background:#F4F5FB;border-color:#CBCDDF}
.inv-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.seg{display:inline-flex;background:#EEEFF6;border-radius:11px;padding:3px;gap:2px}
.seg-b{border:none;background:none;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;color:#56527a;cursor:pointer;font-family:'Inter'}
.seg-b.on{background:#fff;color:${COBALT};box-shadow:0 1px 4px rgba(0,0,0,.08)}
.badge.inv-draft{color:#56527a;background:#EAEBF3}.badge.inv-sent{color:${COBALT};background:rgba(43,77,224,.1)}
.badge.inv-paid{color:${GREEN};background:rgba(31,157,85,.1)}.badge.inv-overdue{color:${RED};background:rgba(209,67,67,.1)}
.inv-modal{width:1080px;max-width:96vw}
.inv-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.inv-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:0;overflow:auto;flex:1}
.inv-edit{padding:20px 22px;overflow:auto;border-right:1px solid #E8E9F2}
.inv-preview-wrap{padding:24px;background:#ECEEF5;overflow:auto;display:flex;flex-direction:column;align-items:center}
.inv-design-stage{border:1px solid #E3E4EE;border-radius:14px;overflow:hidden;margin-top:4px}
.inv-design-stage .inv-preview-wrap{max-height:78vh}
.inv-page-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;width:100%;max-width:660px;margin:0 auto 14px}
.sec-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #DEDFEA;border-radius:10px;padding:6px 10px;box-shadow:0 4px 16px -8px rgba(0,0,0,.18)}
.sec-tl{font-size:11px;font-weight:800;color:${INK};letter-spacing:.01em}
.sec-grp{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#8b88a0;text-transform:uppercase;letter-spacing:.04em}
.sec-grp .stp{width:22px;height:22px;border-radius:6px;border:1px solid #DEDFEA;background:#F7F8FC;color:${COBALT};font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.sec-grp .stp:hover{background:${COBALT};color:#fff;border-color:${COBALT}}
.sec-grp .val{min-width:30px;text-align:center;font-size:11px;font-weight:700;color:${INK};text-transform:none}
.sec-done{font-size:11px;font-weight:700;color:#fff;background:${COBALT};border:none;border-radius:7px;padding:6px 12px;cursor:pointer}
.sec-hint{font-size:11px;color:#9b98ad;font-weight:500}
.bk-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bk-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 16px}
.bk-chip{padding:7px 14px;border-radius:20px;border:1px solid #E1E2EC;background:#fff;font-size:13px;font-weight:600;color:#56527a;cursor:pointer}
.bk-chip.on{background:${INK};color:#fff;border-color:${INK}}
.bk-yr{margin-left:auto;display:flex;align-items:center;gap:8px}
.bk-yr select{padding:8px 10px;border:1px solid #E1E2EC;border-radius:9px;font-size:13px;font-weight:600;color:${INK};background:#fff}
.tx-type{display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:12.5px;color:${INK}}
.tx-amt{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:14px}
.tx-in{color:#1f9d63}.tx-out{color:#b4322e}
.rc-btn{display:inline-flex;align-items:center;gap:4px;color:${COBALT};font-weight:600;font-size:12px;cursor:pointer}
.rc-none{color:#c7c5d4}
.ai-banner{display:flex;align-items:center;gap:8px;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;margin-bottom:14px}
.ai-reading{background:#EEF2FF;color:#3949c9}
.ai-done{background:#E9F8EF;color:#1f8a55}
.ai-off{background:#FBEFEF;color:#a23b34}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.rcfile{display:flex;align-items:center;gap:8px;background:#F4F5FA;border:1px solid #E5E6F0;border-radius:9px;padding:9px 11px;font-size:12.5px;color:${INK};margin-top:10px}
.act-ctrl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.seg{display:inline-flex;background:#EEF0F7;border-radius:9px;padding:3px}
.seg button{border:none;background:none;padding:6px 13px;border-radius:7px;font-size:12.5px;font-weight:600;color:#56527a;cursor:pointer}
.seg button.on{background:#fff;color:${INK};box-shadow:0 1px 3px rgba(0,0,0,.12)}
.act-nav{display:flex;align-items:center;gap:6px}
.act-nav b{min-width:150px;text-align:center;font-size:13.5px;color:${INK};font-weight:700}
.iconbtn{width:30px;height:30px;border-radius:8px;border:1px solid #E1E2EC;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a}
.iconbtn:hover{border-color:${COBALT};color:${COBALT}}
.act-feedlist{display:flex;flex-direction:column}
.act-row{display:flex;align-items:flex-start;gap:11px;padding:11px 4px;border-bottom:1px solid #F1F1F6;cursor:pointer}
.act-row:hover{background:#FAFAFE}
.act-ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}
.act-body{flex:1;min-width:0}
.act-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.act-lead{font-weight:700;color:${INK};font-size:13.5px}
.act-txt{color:#56527a;font-size:13px;margin-top:2px;line-height:1.45}
.act-who{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#EEF0F7;color:#4a4763}
.act-time{margin-left:auto;font-size:11.5px;color:#9b98ad;white-space:nowrap}
.act-daysep{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9b98ad;margin:14px 0 4px;padding-top:8px;border-top:1px dashed #E4E5EE}
.act-daysep:first-child{border-top:none;margin-top:0;padding-top:0}
.swapbtn{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#56527a;background:#fff;border:1px solid #DEDFEA;border-radius:8px;padding:6px 11px;cursor:pointer}
.swapbtn:hover{border-color:${COBALT};color:${COBALT}}
.inv-items-edit{display:flex;flex-direction:column;gap:7px}
.iie-h,.iie-row{display:grid;grid-template-columns:1fr 56px 84px 76px 30px;gap:8px;align-items:center}
.iie-h{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#928DAD;padding:0 2px}
.iie-row input{padding:8px 9px;border:1px solid #DEDFEA;border-radius:8px;font-size:13px;font-family:'Inter';color:${INK};background:#fff;width:100%}
.iie-row input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.iie-amt{font-size:13px;font-weight:600;color:${INK};text-align:right}
.inv-preview{background:#fff;border-radius:3px;padding:6.5% 7%;box-shadow:0 14px 50px -16px rgba(0,0,0,.34);color:#3a3850;width:100%;max-width:660px;aspect-ratio:8.5/11;box-sizing:border-box}
.ip-block{position:relative;margin-bottom:20px}
.ip-block:last-child{margin-bottom:0}
.ip-block.dragk{opacity:.4}
.ip-drag{position:absolute;left:-26px;top:1px;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#C4C1D6;cursor:grab;opacity:0;transition:.13s}
.ip-block:hover .ip-drag{opacity:1}
.ip-drag:hover{color:${COBALT};background:#F1F2F8}
.ip-sec{cursor:pointer;border-radius:5px;transition:box-shadow .12s;outline-offset:3px}
.ip-sec:hover{box-shadow:0 0 0 1px #DCDEEE}
.ip-sec.sel{box-shadow:0 0 0 2px ${COBALT}}
.ip-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:14px}
.ip-top .ip-sec{padding:4px 6px;margin:-4px -6px}
.ip-logo{max-height:42px;max-width:190px;object-fit:contain;display:block;margin-bottom:.7em}
.ip-name{font-family:'Space Grotesk';font-size:1.65em;font-weight:600;color:${INK};margin-bottom:.45em;letter-spacing:-.01em}
.ip-bizmeta{font-size:.95em;color:#8b88a0}
.ip-meta{text-align:right;flex:none}
.ip-meta.left{text-align:left}
.ip-title{font-family:'Space Grotesk';font-size:1.4em;font-weight:700;letter-spacing:.16em;color:${COBALT};line-height:1}
.ip-num{font-size:.95em;font-weight:600;color:#8b88a0;margin-top:.3em;letter-spacing:.03em}
.ip-dates{margin-top:.9em;font-size:.95em;color:${INK}}.ip-dates div{display:flex;gap:1.3em;justify-content:flex-end;margin-top:.25em}.ip-meta.left .ip-dates div{justify-content:flex-start}.ip-dates span{color:#aaa6bd;text-transform:uppercase;letter-spacing:.05em;font-size:.82em;font-weight:600}
.ip-stamp{display:inline-block;margin-top:.8em;font-size:.82em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:.25em 1em;border-radius:20px}
.ip-rule{height:1.5px;width:100%;border-radius:2px;margin:0 0 16px;opacity:.9}
.ip-billto{color:#6a6788}
.ip-billto .ip-lbl{font-size:.8em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa6bd;margin-bottom:.35em}
.ip-billto .ip-btname{font-weight:700;font-size:1.15em;color:${INK};letter-spacing:-.01em}
.ip-table{width:100%;border-collapse:collapse}
.ip-table th{text-align:left;font-size:.78em;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#aaa6bd;border-bottom:1.5px solid ${INK};padding:0 0 .6em}
.ip-table th:nth-child(2),.ip-table th:nth-child(3),.ip-table th:nth-child(4){text-align:right}
.ip-table td{padding:.65em 0;border-bottom:1px solid #F2F2F6;font-variant-numeric:tabular-nums}
.ip-table td:nth-child(2),.ip-table td:nth-child(3),.ip-table td:nth-child(4){text-align:right;white-space:nowrap}
.ip-table td:first-child{padding-right:1.3em;color:${INK}}
.ip-totals{margin-left:auto;width:56%;min-width:200px}
.ip-tr{display:flex;justify-content:space-between;padding:.35em 0;color:#6a6788;font-variant-numeric:tabular-nums}.ip-tr span{color:#9b98ad}.ip-tr b{font-weight:600;color:${INK}}
.ip-grand{border-top:1.5px solid ${INK};margin-top:.45em;padding-top:.7em}.ip-grand span{color:${INK};font-weight:700;font-family:'Space Grotesk';letter-spacing:.01em}.ip-grand b{font-family:'Space Grotesk';font-size:1.32em;color:${COBALT}}
.ip-pay{color:#6a6788;word-break:break-all}.ip-pay a{color:${COBALT};font-weight:600}
.ip-notes{padding-top:12px;border-top:1px solid #F2F2F6;color:#9b98ad;white-space:pre-wrap}
.acc-row{display:flex;gap:8px;align-items:center}
.acc-row input[type=color]{width:42px;height:38px;padding:2px;border:1px solid #DEDFEA;border-radius:9px;background:#fff;cursor:pointer;flex:none}
.acc-row input:not([type=color]){flex:1}
.invrange{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:#E4E5EF;outline:none;margin-top:8px}
.invrange::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.invrange::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff}
.inv-toggles{display:flex;flex-wrap:wrap;gap:18px;margin-top:14px}
.invtog{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:${INK};cursor:pointer}
.invtog input{width:16px;height:16px;accent-color:${COBALT};cursor:pointer}
@media print{
  body *{visibility:hidden!important}
  #invprint,#invprint *{visibility:visible!important}
  #invprint{position:absolute!important;left:0;top:0;width:100%;box-shadow:none!important;border-radius:0!important;padding:0!important}
  .scrim2{position:static!important;background:none!important;padding:0!important}
  .ip-drag,.inv-page-tools{display:none!important}
  .ip-sec{box-shadow:none!important;cursor:default!important}
  #invprint{box-shadow:none!important;min-height:0!important;padding:0!important}
}
.fu-hero{display:flex;align-items:center;gap:22px;background:linear-gradient(120deg,${INDIGO} 0%,${COBALT} 100%);border-radius:18px;padding:22px 26px;margin-bottom:22px;color:#fff;box-shadow:0 14px 40px -20px ${COBALT}}
.fu-hero-l{flex:none}.fu-hero-n{font-family:'Space Grotesk';font-size:46px;font-weight:600;line-height:1}
.fu-hero-lbl{font-size:13px;color:rgba(255,255,255,.78);margin-top:2px}
.fu-hero-stats{display:flex;flex-wrap:wrap;gap:9px;flex:1}
.fu-stat{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.14);padding:6px 12px;border-radius:20px;color:#fff}
.fu-stat b{font-weight:700}.fu-stat.od{background:rgba(255,255,255,.16)}.fu-stat.od svg{color:#FFC9C9}.fu-stat.done svg{color:#9DEFC0}
.fu-ring{width:70px;height:70px;border-radius:50%;background:conic-gradient(#fff calc(var(--p,0)*1%),rgba(255,255,255,.22) 0);display:flex;align-items:center;justify-content:center;flex:none}
.fu-ring span{width:54px;height:54px;border-radius:50%;background:${INDIGO};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;font-family:'Space Grotesk';color:#fff}
.fu-band{display:flex;align-items:center;gap:8px;font-family:'Space Grotesk';font-weight:600;font-size:13px;color:${INK};margin:18px 0 12px;text-transform:uppercase;letter-spacing:.04em}
.fu-band.od{color:${RED}}
.fu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.fu-card{background:#fff;border:1px solid #E8E9F2;border-radius:14px;padding:16px;cursor:pointer;transition:transform .18s,box-shadow .18s,opacity .42s,scale .42s;display:flex;flex-direction:column;gap:11px}
.fu-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px -18px rgba(24,21,48,.4);border-color:#D9DBEC}
.fu-card.od{border-left:4px solid ${RED}}
.fu-card.leaving{opacity:0;scale:.88;transform:translateX(60px);pointer-events:none}
.fu-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.fu-name{font-family:'Space Grotesk';font-weight:600;font-size:15px;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fu-meta{font-size:12.5px;color:#6a6788}
.fu-act{display:flex;flex-direction:column;gap:10px;border-top:1px solid #F0F0F6;padding-top:11px}
.fu-quick{display:flex;gap:8px}
.fu-ic{width:34px;height:34px;border-radius:9px;background:#F4F5FB;color:${COBALT};display:flex;align-items:center;justify-content:center;text-decoration:none;transition:.14s}
.fu-ic:hover{background:${COBALT};color:#fff}
.fu-chips{display:flex;flex-wrap:wrap;gap:7px}
.fu-chip{position:relative;border:1px solid #DEDFEA;background:#fff;color:${INK};font-size:12px;font-weight:600;font-family:'Inter';padding:7px 11px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:.14s}
.fu-chip:hover{border-color:${COBALT};background:rgba(43,77,224,.06);color:${COBALT}}
.fu-date{padding:7px 10px;color:#56527a}
.fu-date input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.fu-done{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:70px 20px}
.fu-done-burst{position:relative;margin-bottom:10px}
.fu-done-ring{width:108px;height:108px;border-radius:50%;background:rgba(31,157,85,.1);display:flex;align-items:center;justify-content:center}
.fu-done-burst .s1,.fu-done-burst .s2,.fu-done-burst .s3{position:absolute;color:${GOLD};animation:twk 1.8s ease-in-out infinite}
.fu-done-burst .s1{top:-4px;right:6px;animation-delay:0s}.fu-done-burst .s2{bottom:6px;left:-2px;color:${COBALT};animation-delay:.5s}.fu-done-burst .s3{top:18px;right:-8px;color:${GREEN};animation-delay:1s}
@keyframes twk{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
.fu-done h2{font-family:'Space Grotesk';font-size:24px;color:${INK};margin:14px 0 6px}
.fu-done p{font-size:14px;color:#6a6788;max-width:420px;line-height:1.5}
.linkbtn{background:none;border:none;color:#A6A2BC;font-size:12px;font-weight:600;cursor:pointer;padding:8px 0 0;margin-top:6px}.linkbtn:hover{color:${RED}}
.linkbtn.q:hover{color:${COBALT}}
/* inline inside a sentence — the block variant's padding/margin push it onto its own line */
.linkbtn.inl{padding:0;margin:0;color:${COBALT};text-decoration:underline;font-size:inherit}.linkbtn.inl:hover{color:${INK}}
.cli-prog{display:flex;align-items:center;gap:10px;min-width:160px}
.cli-prog .pbar{flex:1;margin-bottom:0}.cli-prog .pp{font-size:12px;font-weight:600;color:${INK};min-width:34px}
.rmap-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(152px,1fr);gap:10px;overflow-x:auto;padding-bottom:6px;margin-bottom:18px}
.rmap-col{background:#F6F7FB;border-radius:12px;padding:8px;min-height:60px}
.rmap-colh{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#56527a;padding:4px 6px 10px;text-transform:uppercase;letter-spacing:.04em}
.rmap-colh span{color:#928DAD}
.rmap-card{background:#fff;border:1px solid #E8E9F2;border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer}
.rmap-card:hover{border-color:#D9DBEC}
.rc-n{font-weight:600;font-size:13px;color:${INK}}.rc-ph{font-size:11px;color:#777296;margin-top:4px}
.rmap-empty{text-align:center;color:#C9C5D9;font-size:12px;padding:6px}
.rmap-rows{border-top:1px solid #F0F0F6}
.rmap-row{display:flex;align-items:center;gap:16px;padding:12px 4px;border-bottom:1px solid #F0F0F6;cursor:pointer}
.rmap-row:last-child{border-bottom:none}.rmap-row:hover{background:#FAFAFD}
.rr-name{width:180px;flex:none}
.rr-tracks{display:flex;gap:22px;flex-wrap:wrap}
.rr-track{display:flex;align-items:center;gap:9px}
.rr-tl{font-size:10.5px;font-weight:700;color:#928DAD;text-transform:uppercase;letter-spacing:.04em;min-width:64px}
.rr-dots{display:flex;gap:6px}
.rdot{width:11px;height:11px;border-radius:50%;background:#E4E4EE;border:1px solid #D2D2E0}
.rdot.on{background:${GREEN};border-color:${GREEN}}
.iconbtn{background:#F1F2F8;border:none;border-radius:7px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a;flex:none}.iconbtn:hover{background:#E6E7F1}.iconbtn:disabled{opacity:.35;cursor:default}
@media(max-width:820px){
  .sb{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .25s;box-shadow:0 0 60px rgba(0,0,0,.4)}.sb.open{transform:none}.hamb{display:block}
  /* Forms were two columns at 390px, so every input sat at roughly 160px and
     dates and dropdowns clipped their own content. */
  .fgrid{grid-template-columns:1fr}
  /* The fact strip capped at 430px, i.e. wider than the phone. */
  .m-facts{max-width:100%}
  /* Invoice preview and its toolbar are fixed at 660px — let them scroll
     sideways rather than pushing the page wider than the screen. */
  .inv-preview,.inv-page-tools{max-width:100%}
  .inv-body{overflow-x:auto}
  .rr-name{width:auto;flex:1 1 120px;min-width:0}
  .ip-totals{width:auto;min-width:0}
  .fu-done-ring{width:84px;height:84px}
  .pc-amt,.ex-amt-w{width:96px}
  .sheet-map select{max-width:100%}
  /* Anything that lives in a horizontal strip needs to be allowed to wrap. */
  .mtg-actions,.sheet-acts,.dash-arrange,.ev-stats{gap:8px}
  /* On a phone the two columns stack and the MODAL scrolls as one page — so
     the feed must NOT be its own scroller here, or you get a tiny box inside a
     long page. Exactly the reverse of the desktop rule above. */
  .m-grid{grid-template-columns:1fr;overflow-y:auto}
  .m-left,.m-right{overflow:visible}
  .m-right{min-height:auto}
  .feed{flex:none;min-height:auto;overflow:visible}
  .m-right{border-left:none;border-top:1px solid #E8E9F2}
  .modal{max-height:94vh}
  /* The header was ONE flex row: the title fought the nav buttons and the fact
     strip for a 390px screen, so the nav wrapped under the tags and the fields
     ran off the right edge. On a phone it stacks — title, nav, then facts
     across the full width — and nothing inside may exceed the screen. */
  .m-head{flex-direction:column;align-items:stretch;gap:10px;padding:14px 16px}
  .m-headright{align-items:stretch;width:100%}
  .m-headright>div:first-child{justify-content:flex-end}
  .m-facts{max-width:100%;justify-content:flex-start}
  .m-facts .mf{flex:1 1 calc(50% - 4px);min-width:0}
  .m-left,.m-right{padding:16px 16px}
  .modal h2{font-size:20px;line-height:1.25}
  .modal,.m-head,.m-grid,.m-left,.m-right{max-width:100%;min-width:0}
  .m-jump{padding:8px 12px;gap:6px}
  .m-foot{padding:11px 16px;flex-wrap:wrap}
  .m-foot-n{width:100%;margin-left:0;white-space:normal}
  .scrim{display:block;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:25}.body{padding:18px}.top{padding:14px 18px}.fgrid{grid-template-columns:1fr}
}
/* ---- touch devices: stop iOS from zooming ----
   Safari auto-zooms whenever you focus a field whose font-size is under 16px.
   Forcing every control to 16px on touch screens removes the trigger entirely.
   !important because many controls set their size inline. */
@media (pointer:coarse){
  input,select,textarea{font-size:16px !important}
  .onb-due input,.day-date input{width:auto;max-width:160px}
  .tier-pick select{padding:5px 10px}
}
/* never auto-resize text, and kill the double-tap-to-zoom gesture */
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}
button,a,label,select,input,textarea,.kcard,.fu-card,.cli-card,.rt-person,.msec-h,.rel-tier,.web-node{touch-action:manipulation}

/* ============================================================
   ROLES · COMMISSION · LEADERBOARD · the premium bits
   ============================================================ */
/* the rep's hero: two numbers, calm, gold for pending, green for earned */
.cmsn-hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:22px}
.cmsn-main{background:linear-gradient(135deg,${INK},#241f47);border-radius:18px;padding:22px 24px;color:#fff;position:relative;overflow:hidden;box-shadow:0 22px 50px -34px rgba(24,21,48,.9)}
.cmsn-main.earned{background:linear-gradient(135deg,${GREEN},#12613a)}
.cmsn-main:after{content:'';position:absolute;inset:0;background:radial-gradient(120% 90% at 100% 0%,rgba(255,255,255,.16),transparent 60%);pointer-events:none}
.cmsn-l{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.66)}
.cmsn-v{font-family:'Space Grotesk';font-size:40px;font-weight:600;line-height:1.05;margin:10px 0 6px;font-variant-numeric:tabular-nums}
.cmsn-d{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.72)}
.cmsn-box{background:#F7F8FC;border:1px solid #E8E9F2;border-radius:12px;padding:14px}
.cmsn-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:#56527a;padding:5px 0}
.cmsn-row b{font-weight:700;color:${INK}}
.cmsn-row.big{border-top:1px solid #E8E9F2;margin-top:8px;padding-top:10px;font-size:14px}
.cmsn-row.big b{font-family:'Space Grotesk';font-size:20px}
.rank-big{font-family:'Space Grotesk';font-size:38px;font-weight:600;color:${INK};line-height:1}
.rank-big span{font-size:15px;color:#8E89A8;margin-left:6px}
/* owner queue: newly converted clients waiting to be onboarded */
.onb-q{background:#fff;border:1px solid #D9DCF2;border-left:3px solid ${COBALT};border-radius:14px;padding:14px 16px;margin-bottom:20px}
.onb-h{display:flex;align-items:center;gap:8px;color:${INK};font-size:14px}
.onb-h b{font-family:'Space Grotesk';font-weight:600}
.onb-h span{font-size:12px;color:#8E89A8;margin-left:auto}
.onb-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #F0F0F6}
.onb-assign{flex:none;border:1px dashed #D8DAE6;background:#fff;border-radius:16px;padding:4px 9px;font-size:11px;font-weight:700;color:#a6a2bc;cursor:pointer;max-width:120px}
.onb-assign.set{border-style:solid;border-color:#7A5CC8;background:color-mix(in srgb,#7A5CC8 8%,#fff);color:#6A4CB8}
@media(max-width:640px){.onb-assign{max-width:92px}}
.onb-m{min-width:0;flex:1}
/* leaderboard */
.lb-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.lb{background:#fff;border:1px solid #E8E9F2;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.lb-row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #F2F3F8}
.lb-row:last-child{border-bottom:none}
.lb-row.me{background:linear-gradient(90deg,rgba(43,77,224,.07),rgba(43,77,224,0))}
.lb-rank{width:30px;height:30px;border-radius:50%;background:#F0F1F7;color:#56527a;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none}
.lb-row:first-child .lb-rank{background:rgba(200,162,74,.16);color:${GOLD}}
.lb-mid{flex:1;min-width:0}
.lb-name{font-weight:600;color:${INK};font-size:14px;display:flex;align-items:center;gap:7px}
.lb-name i{font-style:normal;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${COBALT};background:rgba(43,77,224,.1);padding:2px 6px;border-radius:20px}
.lb-bar{height:6px;border-radius:20px;background:#F0F1F7;overflow:hidden;margin-top:7px}
.lb-bar div{height:100%;border-radius:20px;background:linear-gradient(90deg,${COBALT},#5C76EE);transition:width .5s cubic-bezier(.22,1,.36,1)}
.lb-n{text-align:right;flex:none;font-size:11px;color:#8E89A8;font-weight:600;display:flex;flex-direction:column;line-height:1.2}
.lb-n b{font-family:'Space Grotesk';font-size:19px;color:${INK};font-weight:600;font-variant-numeric:tabular-nums}
/* team card */
.tm-list{display:flex;flex-direction:column;gap:10px}
.tm-row{border:1px solid #E8E9F2;border-radius:12px;overflow:hidden}
.tm-row.off{opacity:.62}
.tm-head{display:flex;align-items:center;gap:10px;padding:11px 13px;cursor:pointer;background:#FAFBFE}
.tm-name{display:flex;flex-direction:column;min-width:0;flex:1;font-weight:600;color:${INK};font-size:14px}
.tm-name i{font-style:normal;font-size:10px;font-weight:800;color:${COBALT};margin-left:6px}
.tm-role{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:#F0F1F7;color:#56527a}
.tm-role.owner{background:rgba(43,77,224,.12);color:${COBALT}}
.tm-pct{font-size:12px;font-weight:700;color:${GOLD}}
.tm-off{font-size:10.5px;font-weight:800;text-transform:uppercase;color:#B0606A}
.tm-body{padding:14px 13px;border-top:1px solid #EFF0F6}
.tm-sub{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a6a2bc;margin:14px 0 8px}
.tm-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.tm-add{border:1px dashed #D9DCF2;border-radius:12px;padding:14px;margin-top:12px;background:#FAFBFE}
.chip.warn{border-color:#E8C9A0}
.note.bad{border-color:#EBC3C3;background:#FDF6F6;color:#8a3b3b}
/* the one celebration — under a second of motion, never blocks a click */
.cel{position:fixed;right:22px;bottom:22px;z-index:90;display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:14px;background:linear-gradient(135deg,${INK},#241f47);color:#fff;box-shadow:0 26px 60px -28px rgba(24,21,48,.85);cursor:pointer;max-width:min(92vw,340px);animation:celIn .42s cubic-bezier(.22,1,.36,1)}
.cel:after{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.22) 50%,transparent 70%);transform:translateX(-120%);animation:celSweep .9s .16s ease-out;pointer-events:none}
.cel.still{animation:none}.cel.still:after{display:none}
.cel-ic{width:34px;height:34px;border-radius:50%;background:rgba(200,162,74,.22);color:${GOLD};display:flex;align-items:center;justify-content:center;flex:none}
.cel b{display:block;font-family:'Space Grotesk';font-size:16px;font-weight:600}
.cel span{display:block;font-size:12.5px;color:rgba(255,255,255,.72);margin-top:2px}
@keyframes celIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
@keyframes celSweep{to{transform:translateX(120%)}}
/* gentle lift — only where a card is genuinely a target, never on forms */
@media (hover:hover){
  .lift{transition:transform .16s cubic-bezier(.22,1,.36,1),box-shadow .16s}
  .lift:hover{transform:translateY(-3px);box-shadow:0 18px 34px -24px rgba(24,21,48,.55)}
  .lb-row.lift:hover{background:#FBFBFE}
}
/* the OS setting wins. No motion, final values, nothing delayed. */
@media (prefers-reduced-motion:reduce){
  *,*:before,*:after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important}
  .lift:hover{transform:none}
}
.onb-q.cmsn{border-left-color:${GOLD}}
.onb-q.done{border-left-color:#C9C5D9;background:#FAFBFE}
.onb-q.done .onb-h b{color:#56527a}
.tm-reassign{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #EFF0F6;font-size:12.5px;color:#56527a;font-weight:600}
.tm-reassign select{padding:7px 10px;border:1px solid #E2E3EE;border-radius:9px;font-size:12.5px;background:#fff;color:${INK}}
.tbl.sc td,.tbl.sc th{white-space:nowrap}
.tbl.sc tbody tr{cursor:default}
@media (max-width:640px){ .cmsn-v{font-size:32px} .cel{left:14px;right:14px;bottom:14px;max-width:none} }
`;

const Due=({iso})=>{if(!iso)return <span className="subcell">—</span>;const d=daysUntil(iso);let c='far',t=fmtDate(iso);if(d<0){c='over';t='Overdue · '+fmtDate(iso);}else if(d===0){c='today';t='Today';}else if(d<=7){c='soon';t=fmtDate(iso);}return <span className={'due '+c}>{t}</span>;};
const tipStyle={borderRadius:10,border:'1px solid #E8E9F2',fontFamily:'Inter',fontSize:12,boxShadow:'0 8px 24px -12px rgba(0,0,0,.3)'};
/* The logo used to sit in a hard-edged #000110 box on a navy gradient, which is
   exactly why it read as pasted on rather than part of the panel. No box now —
   the mark sits on the gradient with a soft bloom behind it, the way the bright
   node in the reference does. */
/* Circuit traces, in SVG rather than a PNG: ~3KB, crisp at any density, and the
   nodes can pulse. Detail lives at the EDGES with the middle third left clean —
   the nav labels sit there, and busy artwork behind text is the fastest way to
   make a UI feel cheap. preserveAspectRatio="none" lets it stretch to whatever
   height the sidebar is without redrawing. */
const SidebarArt=()=>(
  <svg className="sb-art" viewBox="0 0 236 900" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="tr" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#38BDF8" stopOpacity=".55"/>
        <stop offset="55%" stopColor="#2B4DE0" stopOpacity=".30"/>
        <stop offset="100%" stopColor="#2B4DE0" stopOpacity=".08"/>
      </linearGradient>
      <radialGradient id="nd"><stop offset="0%" stopColor="#7FD8FF"/><stop offset="100%" stopColor="#38BDF8" stopOpacity="0"/></radialGradient>
      <pattern id="gr" width="26" height="26" patternUnits="userSpaceOnUse">
        <path d="M26 0H0V26" fill="none" stroke="#5B8DEF" strokeOpacity=".055" strokeWidth="1"/>
      </pattern>
    </defs>
    <rect width="236" height="900" fill="url(#gr)"/>
    <g fill="none" stroke="url(#tr)" strokeWidth="1" strokeLinecap="square">
      {/* left rail — right angles only, the way real traces run */}
      <path d="M14 60 L14 150 L30 166 L30 300 L18 312 L18 470"/>
      <path d="M30 190 L52 190 L60 198 L60 268"/>
      <path d="M14 520 L14 610 L28 624 L28 760 L16 772 L16 880"/>
      <path d="M28 660 L48 660 L56 668 L56 726"/>
      {/* right rail */}
      <path d="M222 40 L222 130 L206 146 L206 250 L218 262 L218 430"/>
      <path d="M206 180 L184 180 L176 188 L176 240"/>
      <path d="M222 500 L222 590 L208 604 L208 742 L220 754 L220 872"/>
      <path d="M208 640 L188 640 L180 648 L180 700"/>
      <path d="M176 300 L176 340 L190 354 L190 400"/>
    </g>
    {/* concentric arcs, echoing the reference's corner rings */}
    <g fill="none" stroke="#38BDF8" strokeOpacity=".16" strokeWidth="1">
      <path d="M236 806 A118 118 0 0 0 118 900"/>
      <path d="M236 838 A86 86 0 0 0 150 900"/>
      <path d="M0 148 A96 96 0 0 1 96 52"/>
    </g>
    <g stroke="#38BDF8" strokeOpacity=".13" strokeWidth="1" strokeDasharray="2 5" fill="none">
      <path d="M236 770 A152 152 0 0 0 84 900"/>
      <path d="M0 190 A132 132 0 0 1 132 58"/>
    </g>
    {/* hex cluster, bottom right — the reference's densest corner */}
    <g fill="none" stroke="#5B8DEF" strokeOpacity=".2" strokeWidth="1">
      <path d="M196 690l9 5v10l-9 5-9-5v-10z"/>
      <path d="M214 700l9 5v10l-9 5-9-5v-10z"/>
      <path d="M196 710l9 5v10l-9 5-9-5v-10z"/>
      <path d="M34 268l7 4v8l-7 4-7-4v-8z"/>
      <path d="M200 268l7 4v8l-7 4-7-4v-8z"/>
    </g>
    {/* nodes — a few carry current */}
    <g fill="#7FD8FF">
      <circle cx="14" cy="150" r="1.9"/><circle cx="30" cy="300" r="1.6"/>
      <circle cx="60" cy="268" r="1.6"/><circle cx="222" cy="130" r="1.9"/>
      <circle cx="176" cy="240" r="1.6"/><circle cx="208" cy="742" r="1.6"/>
      <circle cx="28" cy="760" r="1.9"/><circle cx="180" cy="700" r="1.6"/>
    </g>
    <g className="sb-pulse">
      <circle cx="14" cy="150" r="7" fill="url(#nd)"/>
      <circle cx="222" cy="130" r="7" fill="url(#nd)"/>
      <circle cx="28" cy="760" r="7" fill="url(#nd)"/>
    </g>
  </svg>
);

const Brand=({logo,sub,size})=>(<div className="sb-brand">
  <div className="sb-glow" aria-hidden="true"/>
  {/* a saved logoSize of 34 used to cap this via the inline style — the floor
      above means the mark can actually breathe without editing settings */}
  {logo
    ? <img src={logo} alt="ProyTech" style={{maxHeight:size||44,maxWidth:(size||44)*5}}/>
    : <><span className="nucleus"/><b>ProyTech</b></>}
  {sub&&<span className="sb-sub">{sub}</span>}
</div>);

/* ===================== login ===================== */
function Login(){
  const [u,setU]=useState('');const [p,setP]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState('in');   // 'in' | 'forgot'
  const [sent,setSent]=useState('');
  const go=async()=>{ if(!u||!p){setErr('Enter your email and password.');return;} setBusy(true);setErr(''); try{ const {error}=await auth.login(u,p); if(error)setErr('Wrong email or password.'); }catch(e){ setErr('Could not sign in. Check your connection.'); } setBusy(false); };
  const forgot=async()=>{ const em=u.trim(); if(!em.includes('@')){ setErr('Type the email address you sign in with.'); return; }
    setBusy(true); setErr('');
    try{ await auth.sendReset(em); setSent(em); }catch(e){ setErr(e.message||'Could not send that email.'); }
    setBusy(false); };
  if(sent) return (<><style>{CSS}</style><div className="gate"><div className="gate-card">
    <span className="nucleus" style={{width:18,height:18,margin:'0 auto 12px',display:'block'}}/>
    <h2>Check your email</h2>
    <p style={{lineHeight:1.5}}>We sent a link to <b>{sent}</b>. Open it and you'll be asked to choose a new password.</p>
    <button className="btn btn-g" style={{width:'100%',justifyContent:'center'}} onClick={()=>{setSent('');setMode('in');setP('');}}>Back to sign in</button>
  </div></div></>);
  return (<><style>{CSS}</style><div className="gate"><div className="gate-card">
    <span className="nucleus" style={{width:18,height:18,margin:'0 auto 12px',display:'block'}}/>
    <h2>{BRAND.title}</h2><p>{mode==='forgot'?'Reset your password':'Sign in'}</p>
    <input placeholder="Email" value={u} autoFocus autoCapitalize="none" autoCorrect="off" onChange={e=>{setU(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&(mode==='forgot'?forgot():go())}/>
    {mode==='in'&&<input type="password" placeholder="Password" value={p} onChange={e=>{setP(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&go()}/>}
    {err&&<div className="gate-err">{err}</div>}
    {mode==='in'
      ? <><button className="btn btn-p" style={{width:'100%',justifyContent:'center'}} disabled={busy} onClick={go}><Lock size={15}/>{busy?'Signing in…':'Sign in'}</button>
          <button className="linkbtn q" style={{marginTop:12}} onClick={()=>{setMode('forgot');setErr('');}}>Forgot your password?</button></>
      : <><button className="btn btn-p" style={{width:'100%',justifyContent:'center'}} disabled={busy} onClick={forgot}><KeyRound size={15}/>{busy?'Sending…':'Email me a reset link'}</button>
          <button className="linkbtn q" style={{marginTop:12}} onClick={()=>{setMode('in');setErr('');}}>Back to sign in</button></>}
  </div></div></>);
}

/* ===================== choose a password =====================
   Where a reset link lands. Supabase hands us a live session from the link,
   which is NOT the same as having a password — until they set one, the only
   way back in is another email. So this screen is a gate, not an option. */
function SetPassword({email,onDone,firstTime}){
  const [p1,setP1]=useState('');const [p2,setP2]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
  const save=async()=>{
    if(p1.length<8){ setErr('Use at least 8 characters.'); return; }
    if(p1!==p2){ setErr('Those two don\'t match.'); return; }
    setBusy(true); setErr('');
    try{ await auth.setPassword(p1); onDone&&onDone(); }
    catch(e){ setErr(e.message||'Could not save that password.'); setBusy(false); }
  };
  return (<><style>{CSS}</style><div className="gate"><div className="gate-card">
    <span className="nucleus" style={{width:18,height:18,margin:'0 auto 12px',display:'block'}}/>
    <h2>{firstTime?'Set your password':'Choose a new password'}</h2>
    <p style={{lineHeight:1.5}}>{email?<>for <b>{email}</b></>:'This is what you\'ll sign in with from now on.'}</p>
    <input type="password" placeholder="New password" autoFocus value={p1} onChange={e=>{setP1(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&save()}/>
    <input type="password" placeholder="Type it again" value={p2} onChange={e=>{setP2(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&save()}/>
    {err&&<div className="gate-err">{err}</div>}
    <button className="btn btn-p" style={{width:'100%',justifyContent:'center'}} disabled={busy} onClick={save}><KeyRound size={15}/>{busy?'Saving…':'Save password & continue'}</button>
    <button className="linkbtn" style={{marginTop:12}} onClick={()=>auth.logout()}>Sign out instead</button>
  </div></div></>);
}

/* ===================== my account (everyone, including reps) ===================== */
function AccountModal({name,email,role,onClose}){
  /* Which Gmail account the Email action opens. Gmail numbers the accounts you
     are signed into in the order you added them, so this belongs to the browser
     profile rather than the CRM user — it lives in localStorage, and it is here
     rather than in Settings because a rep has to be able to set their own. */
  const [gmail,setGmail]=useState(()=>gmailIndex());
  const [p1,setP1]=useState('');const [p2,setP2]=useState('');const [err,setErr]=useState('');const [ok,setOk]=useState(false);const [busy,setBusy]=useState(false);
  const save=async()=>{
    if(p1.length<8){ setErr('Use at least 8 characters.'); return; }
    if(p1!==p2){ setErr('Those two don\'t match.'); return; }
    setBusy(true); setErr('');
    try{ await auth.setPassword(p1); setOk(true); setP1(''); setP2(''); }
    catch(e){ setErr(e.message||'Could not change it.'); }
    setBusy(false);
  };
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" style={{maxWidth:460}} onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head"><div><h2>My account</h2><div className="meta">{role==='owner'?'Owner':'Sales Rep'}</div></div><button className="m-x" onClick={onClose}><X size={18}/></button></div>
      <div className="m-scroll">
        <div className="fgrid">
          <div className="field"><label>Name</label><input value={name||''} disabled/></div>
          <div className="field"><label>Sign-in email</label><input value={email||''} disabled/></div>
        </div>
        <div className="tm-sub">Change your password</div>
        <div className="fgrid">
          <div className="field"><label>New password</label><input type="password" value={p1} onChange={e=>{setP1(e.target.value);setErr('');setOk(false);}}/></div>
          <div className="field"><label>Type it again</label><input type="password" value={p2} onChange={e=>{setP2(e.target.value);setErr('');setOk(false);}} onKeyDown={e=>e.key==='Enter'&&save()}/></div>
        </div>
        {err&&<div className="note bad" style={{marginTop:12}}>{err}</div>}
        {ok&&<div className="note" style={{marginTop:12}}><b>Password changed.</b> Use it next time you sign in.</div>}
        <div className="tm-acts">
          <button className="btn btn-p btn-sm" disabled={busy} onClick={save}><KeyRound size={14}/>{busy?'Saving…':'Save password'}</button>
          <button className="btn btn-g btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="tm-sub">Email</div>
        <div className="fgrid">
          <div className="field"><label>Gmail account number</label>
            <input type="number" min="0" value={gmail}
              onChange={e=>{const n=Math.max(0,parseInt(e.target.value,10)||0);setGmail(n);setGmailIndex(n);}}/></div>
        </div>
        <div className="subcell" style={{marginTop:6}}>
          The Email button on a lead opens Gmail at <b>mail.google.com/mail/u/{gmail}/</b>.
          Gmail numbers your signed-in accounts in the order you added them — if Email opens
          the wrong one, try the next number. Saved in this browser only.
        </div>
        <div className="subcell" style={{marginTop:10}}>Name and email are set by an owner in Settings → Team.</div>
      </div>
    </div>
  </div>);
}

/* ===================== main ===================== */
export default function App(){
  const [session,setSession]=useState(undefined);
  const [bootErr,setBootErr]=useState(false);
  const sessionResolved=React.useRef(false);
  const [loaded,setLoaded]=useState(false);
  const [leads,setLeads]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [txns,setTxns]=useState([]);
  const [tasks,setTasks]=useState([]);
  const [gcal,setGcal]=useState({connected:false,email:'',loaded:false});
  /* apiPost, not a bare fetch: /api/google-status now requires a session,
     because it hands out the email address of the Google account this install
     writes to and did so to anybody who asked. apiPost is the helper that
     attaches the Supabase token. */
  const refreshGcal=async()=>{ try{ const r=await apiPost('/api/google-status'); const j=await r.json(); setGcal({connected:!!j.connected,email:j.email||'',loaded:true}); }catch{ setGcal(g=>({...g,loaded:true})); } };
  useEffect(()=>{ refreshGcal();
    const p=new URLSearchParams(window.location.search);
    if(p.get('gcal')){ const u=new URL(window.location.href); u.searchParams.delete('gcal'); u.searchParams.delete('reason'); window.history.replaceState({},'',u.pathname+u.search); }
  },[]);
  /* apiPost for the same reason as google-status above: /api/google-disconnect
     is now OWNER-ONLY. There is one Google connection for the whole install,
     so severing it stops every rep booking — it was a one-line denial of
     service for anyone who knew the path. A rep who reaches this gets a 403,
     which is why the button below is owner-only in the UI too. */
  const disconnectGcal=async()=>{ try{ await apiPost('/api/google-disconnect'); }catch{} setGcal({connected:false,email:'',loaded:true}); };
  /* creates the event on Google Calendar; returns {eventId,htmlLink,meetLink}. Persistence
     of the meeting onto the lead happens in the Modal (single patch) to avoid clobbering. */
  const createCalendarEvent=async(m)=>{
    /* apiPost: /api/calendar-event now requires a session. It writes to the
       owner's calendar and mails invitations from their account, and it did
       both for anyone who knew the URL. Signed-in, not owner-only — booking is
       a rep's job. The server also caps the invite list; see the file. */
    const r=await apiPost('/api/calendar-event',{title:m.title,start:m.start,end:m.end,notes:m.notes,location:m.location||'',attendees:m.attendees,meet:m.meet,timezone:'America/Chicago'});
    const j=await r.json().catch(()=>({ok:false,error:'bad response'}));
    if(!j.ok) throw new Error(j.error==='not_connected'?'Google Calendar isn’t connected — connect it in Settings.':(j.error||'Could not create the event'));
    return {eventId:j.eventId,htmlLink:j.htmlLink||'',meetLink:j.meetLink||''};
  };
  const deleteCalendarEvent=async(eventId)=>{ if(!eventId)return; try{ await apiPost('/api/calendar-event',{action:'delete',eventId}); }catch{} };
  /* ---- people & roles. Declared with every other hook, ABOVE the auth gates:
     a hook added below an early return blanks the app the moment someone
     signs in ("Rendered more hooks than during the previous render"). ---- */
  const [users,setUsers]=useState([]);
  /* WHO ELSE IS ON THE TEAM — names and roles only, from crm_team().
     Deliberately NOT derived from `users`: RLS gives a rep exactly one row
     there (their own), so every feature that needed "the team" was quietly
     working from a list of one. See TEAM-MIGRATION.sql. */
  const [team,setTeam]=useState([]);
  /* arrived from a password-reset link? checked from the URL on the very first
     render, because supabase-js consumes the fragment as soon as it boots. */
  const [recovery,setRecovery]=useState(()=>auth.isRecoveryUrl&&auth.isRecoveryUrl());
  const [acct,setAcct]=useState(false);
  const [who,setWho]=useState(null);           // {role,active,setup,…} straight from the DB
  const [board,setBoard]=useState(null);       // leaderboard rows from the DB function
  const [celebrate,setCelebrate]=useState(null); // {amount,name} — the one restrained moment
  const [invId,setInvId]=useState(null);
  const [settings,setSettings]=useState({logo:'',logoSize:34,options:DEFAULT_OPTIONS,stages:DEFAULT_STAGES,customFields:[],leadColumns:DEFAULT_LEAD_COLS,deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:DEFAULT_INVOICING,team:DEFAULT_TEAM,clientPhases:DEFAULT_CLIENT_PHASES,pools:[],modulesV:0,notifyEmails:''});
  const [page,setPage]=useState('dash');
  const [sbOpen,setSbOpen]=useState(false);
  const [activeId,setActiveId]=useState(null);
  const [navIds,setNavIds]=useState(null);
  const [events,setEvents]=useState([]);
  const [mlogs,setMlogs]=useState([]);
  /* Playbook: drafts, the published surface, and what the assistant may read.
     Three separate pieces of state because they are three separate reads with
     three different audiences — collapsing them would be the first step back
     towards filtering in the app. */
  const [kbNotes,setKbNotes]=useState([]);
  const [kbPub,setKbPub]=useState([]);
  const [kbAi,setKbAi]=useState([]);
  /* Pocket recordings. The LIST only — no transcripts, which is why
     db.getPocketRecordings selects named jsonb keys. The transcript arrives
     when one recording is opened. */
  /* Rep pay. Payouts are money that LEFT — earnings are derived from held
     meetings and never stored (REP-PAY-MIGRATION.sql explains why). */
  const [payouts,setPayouts]=useState([]);
  const [pockets,setPockets]=useState([]);
  const [pocketId,setPocketId]=useState(null);
  const [importOpen,setImportOpen]=useState(false);
  const [navEdit,setNavEdit]=useState(false);   // sidebar reorder mode
  useEffect(()=>{ if(!session) return; let dead=false;
    db.getEvents().then(r=>{ if(!dead) setEvents(r||[]); }).catch(console.error);
    db.getMeetingLogs().then(r=>{ if(!dead) setMlogs(r||[]); }).catch(console.error);
    /* Playbook. TWO reads, because there are two tables and the split IS the
       security model: kb_notes is owner-only (a rep gets [] back from Postgres,
       not from a filter here), kb_published is what reps and JARVIS may read.
       kbAi is kb_ai_context() — published rows only, even for an owner. Every
       one degrades to [] if KB-MIGRATION.sql has not been run. */
    db.getKbNotes().then(r=>{ if(!dead) setKbNotes(r||[]); }).catch(console.error);
    db.getKbPublished().then(r=>{ if(!dead) setKbPub(r||[]); }).catch(console.error);
    db.kbAiContext().then(r=>{ if(!dead) setKbAi(r||[]); }).catch(console.error);
    db.getPocketRecordings().then(r=>{ if(!dead) setPockets(r||[]); }).catch(console.error);
    db.getPayouts().then(r=>{ if(!dead) setPayouts(r||[]); }).catch(console.error);
    return ()=>{dead=true;}; },[session]);
  const [navDrag,setNavDrag]=useState(null);
  const [navLocal,setNavLocal]=useState(null);  // keeps the order on screen if the save fails
  /* ---------------------------------------------------------------- URL SYNC
     The lead view is a full-viewport surface, so it reads as a page — and the
     two things people do to a page are press Back and paste the link. Both work
     now, WITHOUT a router.

     Why not a real route. There is none in this app: `page` and `activeId` are
     useState, and eleven callers reach openLead(id, order) passing an ORDERED
     LIST of ids — the filtered, sorted rows of whatever screen you came from —
     which is what drives prev/next through the lead. A route carries an id; it
     cannot carry a 200-item ordering, so that would stay in state anyway. And
     unmounting the Leads table to navigate would throw away its filters, its
     sort, its scroll position and its multi-select. Closing a lead has to put
     you back exactly where you were; a route is the one thing that cannot.

     So: pushState on open, popstate closes, and the id is read back on boot.
     Deliberately ONE history entry for the whole lead view — prev/next replace
     rather than push, or escaping a lead you paged through forty times would
     take forty Backs. */
  const openLead=(id,order)=>{ setActiveId(id); setNavIds(order&&order.length?order:null); };
  /* Push on open, replace while paging, pop on close. skipPop guards the one
     case that would otherwise loop: our own back() firing popstate. */
  const leadUrlRef=React.useRef({on:false});
  useEffect(()=>{
    if(typeof window==='undefined'||!window.history) return;
    const st=leadUrlRef.current;
    const id=activeId&&activeId!=='new'?activeId:null;
    try{
      const u=new URL(window.location.href);
      if(id){
        u.searchParams.set('lead',id);
        /* first open pushes so Back has somewhere to go; paging replaces */
        if(st.on) window.history.replaceState({lead:id},'',u.pathname+u.search);
        else window.history.pushState({lead:id},'',u.pathname+u.search);
        st.on=true;
      }else if(st.on){
        u.searchParams.delete('lead');
        window.history.replaceState({},'',u.pathname+u.search);
        st.on=false;
      }
    }catch{ /* a browser that refuses history is not a reason to break the app */ }
  },[activeId]);
  useEffect(()=>{
    if(typeof window==='undefined') return;
    const onPop=()=>{ const p=new URLSearchParams(window.location.search); const id=p.get('lead');
      leadUrlRef.current.on=!!id;
      /* Back out of a lead closes it; Forward back into one reopens it. The
         nav order is gone by then, so prev/next simply stops offering — the
         lead itself is still correct, which is the part that matters. */
      setActiveId(id||null); if(!id) setNavIds(null); };
    window.addEventListener('popstate',onPop);
    return ()=>window.removeEventListener('popstate',onPop); },[]);

  useEffect(()=>{ const ok=s=>{sessionResolved.current=true;setSession(s||null);};
    auth.session().then(ok).catch(()=>ok(null));
    const {data:sub}=auth.onChange((s,e)=>{ if(e==='PASSWORD_RECOVERY') setRecovery(true); ok(s); });
    const wd=setTimeout(()=>{ if(!sessionResolved.current) setBootErr(true); },8000);
    return ()=>{clearTimeout(wd);sub?.subscription?.unsubscribe?.();}; },[]);

  useEffect(()=>{ if(!session){setLoaded(false);setUsers([]);setTeam([]);setWho(null);setBoard(null);return;} (async()=>{
    try{
      /* who am I, before anything else — a rep must never trigger a demo seed */
      let me1=null; try{ me1=await db.whoami(); }catch(err){ console.error('whoami failed',err); }
      let people=[]; try{ people=await db.getUsers(); }catch(err){ console.error('users load failed',err); }
      /* Never fatal and never blocking: an install that has not run
         TEAM-MIGRATION.sql gets [], and every consumer below falls back to
         exactly the behaviour it has today. */
      let roster=[]; try{ roster=(typeof db.team==='function')?await db.team():[]; }
      catch(err){ console.error('team load failed',err); }
      setUsers(people); setTeam(roster); setWho(me1);
      const myRow=people.find(u=>u.id===auth.uid(session))||null;
      /* whoami is the truth when the migration has been run. Before it has,
         fall back to what we can see: an install with no crm_users at all
         behaves exactly as it always did. */
      const amOwner=me1?(me1.role==='owner'||!me1.setup):(!people.length||(!!myRow&&myRow.role==='owner'));
      let s=await db.getLeads(); let st=await db.getSettings();
      let iv=[]; try{ if(typeof db.getInvoices==='function') iv=await db.getInvoices(); }catch(err){ console.error('invoices load failed',err); }
      let tx=[]; try{ if(typeof db.getTxns==='function') tx=await db.getTxns(); }catch(err){ console.error('txns load failed',err); }
      let tk=[]; try{ if(typeof db.getTasks==='function') tk=await db.getTasks(); }catch(err){ console.error('tasks load failed',err); }
      /* Seeding and migrating are OWNER jobs. A rep legitimately sees zero
         leads on day one — that must never be mistaken for an empty install
         and refilled with demo data. */
      if(amOwner&&(!s||!s.length)){ s=seed(); await db.upsertMany(s); }
      if(!st){ st={logo:'',logoSize:34,options:DEFAULT_OPTIONS,stages:DEFAULT_STAGES,customFields:[],leadColumns:DEFAULT_LEAD_COLS,deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:DEFAULT_INVOICING,team:DEFAULT_TEAM,clientPhases:DEFAULT_CLIENT_PHASES}; if(amOwner) await db.saveSettings(st); }
      /* the Leaderboard is new: an install that already saved a module list
         has never seen it, so switch it on once (and remember we did). */
      if(amOwner&&Array.isArray(st.modules)&&num(st.modulesV)<2){
        st={...st,modules:st.modules.includes('board')?st.modules:[...st.modules,'board'],modulesV:2};
        try{ await db.saveSettings(st); }catch(err){ console.error('module backfill failed',err); }
      }
      /* Events, same story: a saved module list predates the tab, so switch it
         on once. Without this the tab ships and stays invisible for every
         install that has ever opened the modules screen. */
      if(amOwner&&Array.isArray(st.modules)&&num(st.modulesV)<3){
        st={...st,modules:st.modules.includes('events')?st.modules:[...st.modules,'events'],modulesV:3};
        try{ await db.saveSettings(st); }catch(err){ console.error('module backfill failed',err); }
      }
      /* Meetings, same reason: a saved module list predates the tab, so without
         this it ships invisible and nothing looks broken. */
      /* An install with saved settings.stages ignores DEFAULT_STAGES entirely,
         so a new stage ships invisible unless it's backfilled once. Inserted
         before Lost, because "not right now" sits between open and dead. */
      if(amOwner&&Array.isArray(st.stages)&&st.stages.length&&!st.stages.some(x=>x.key==='nurture')){
        const lostAt=st.stages.findIndex(x=>x.lost);
        const nur={key:'nurture',label:'Not right now',color:'#7C8AA5',prob:0,open:false,won:false,lost:false,nurture:true};
        const next=[...st.stages];
        next.splice(lostAt<0?next.length:lostAt,0,nur);
        st={...st,stages:next};
        try{ await db.saveSettings(st); }catch(err){ console.error('stage backfill failed',err); }
      }
      if(amOwner&&Array.isArray(st.modules)&&num(st.modulesV)<4){
        st={...st,modules:st.modules.includes('meetings')?st.modules:[...st.modules,'meetings'],modulesV:4};
        try{ await db.saveSettings(st); }catch(err){ console.error('module backfill failed',err); }
      }
      /* Sponsors — same reason as Events and Meetings before it: a saved module
         list predates the tab, so without this it ships invisible. */
      if(amOwner&&Array.isArray(st.modules)&&num(st.modulesV)<5){
        st={...st,modules:st.modules.includes('sponsors')?st.modules:[...st.modules,'sponsors'],modulesV:5};
        try{ await db.saveSettings(st); }catch(err){ console.error('module backfill failed',err); }
      }
      /* Without this the tab ships INVISIBLE: any install that has ever opened
         the modules screen has a saved settings.modules array that predates it,
         and nothing looks broken. ENGINEERING.md §1. */
      if(amOwner&&Array.isArray(st.modules)&&num(st.modulesV)<6){
        st={...st,modules:st.modules.includes('jarvis')?st.modules:[...st.modules,'jarvis'],modulesV:6};
        try{ await db.saveSettings(st); }catch(err){ console.error('module backfill failed',err); }
      }
      /* ENGINEERING.md §1 — new tabs ship invisible. Any install that has ever
         opened the modules screen has a saved settings.modules array that
         predates Playbook, so without this backfill the tab simply never
         appears and nothing looks broken. */
      if(amOwner&&Array.isArray(st.modules)&&num(st.modulesV)<7){
        st={...st,modules:st.modules.includes('playbook')?st.modules:[...st.modules,'playbook'],modulesV:7};
        try{ await db.saveSettings(st); }catch(err){ console.error('module backfill failed',err); }
      }
      /* Removing a module from ALL_MODULES is not enough on its own: a saved
         settings.modules array still lists it, so the tab keeps rendering for
         every existing install. Same trap as adding one, in reverse. */
      /* AUDIT #25/#26. Every retainerStart on this install was written by the
         toggle, not by anyone deciding to bill — App.jsx stamped it on flip
         until this build. A date nobody chose is not a start date, and leaving
         them would keep four quoted retainers reading as $526 of MRR that
         cannot be collected. Cleared once, stamped with retainerStartCleared so
         it never runs twice and never touches a date set deliberately after
         this point. Setting a real start date is an ordinary edit afterwards. */
      if(amOwner&&!st.retainerStartCleared){
        const stale=s.filter(l=>l&&l.retainerStart&&(!Array.isArray(l.retainerPayments)||!l.retainerPayments.length));
        if(stale.length){ const fixed=stale.map(l=>({...l,retainerStart:''}));
          s=s.map(l=>fixed.find(x=>x.id===l.id)||l);
          try{ await db.upsertMany(fixed); }catch(err){ console.error('retainer start clear failed',err); } }
        st={...st,retainerStartCleared:new Date().toISOString()};
        try{ await db.saveSettings(st); }catch(err){ console.error('retainer clear flag failed',err); }
      }
      if(amOwner&&Array.isArray(st.modules)&&num(st.modulesV)<8){
        st={...st,modules:st.modules.filter(k=>k!=='pipeline'),modulesV:8};
        try{ await db.saveSettings(st); }catch(err){ console.error('module backfill failed',err); }
      }
      /* migrate the sales pipeline (idempotent) */
      const mig=migrateStages(st,s);
      if(amOwner&&mig.stagesChanged){ st={...st,stages:mig.stages}; await db.saveSettings(st); }
      if(amOwner&&mig.changed.length){ s=mig.leads; try{ await db.upsertMany(mig.changed); }catch(err){ console.error('stage migration save failed',err); } }
      setLeads(s); setInvoices(Array.isArray(iv)?iv:[]); setTxns(Array.isArray(tx)?tx:[]); setTasks(Array.isArray(tk)?tk:[]);
      /* Spread the saved object FIRST. This loader names every field
         explicitly, so anything added later — recurring bills, and whatever
         comes next — was silently dropped on load: saved fine, gone on
         refresh. The named fields below still win where they apply defaults. */
      setSettings({...st,logo:st.logo||'',logoSize:st.logoSize||34,options:{...DEFAULT_OPTIONS,...(st.options||{})},stages:st.stages?.length?st.stages:DEFAULT_STAGES,customFields:st.customFields||[],team:st.team||DEFAULT_TEAM,clientPhases:st.clientPhases?.length?st.clientPhases:DEFAULT_CLIENT_PHASES,goals:{...DEFAULT_GOALS,...(st.goals||{})},huddle:st.huddle||null,repPayments:!!st.repPayments,modules:Array.isArray(st.modules)?st.modules:undefined,modulesV:num(st.modulesV),pools:Array.isArray(st.pools)?st.pools:[],notifyEmails:st.notifyEmails||'',leadColumns:st.leadColumns||DEFAULT_LEAD_COLS,deliveryTracks:st.deliveryTracks?.length?st.deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:{...DEFAULT_INVOICING,...(st.invoicing||{}),biz:{...DEFAULT_INVOICING.biz,...((st.invoicing||{}).biz||{})}}});
      setLoaded(true);
    }catch(e){ console.error(e); window.alert('Could not load data: '+(e.message||e)); }
  })(); },[session]);

  const stages=settings.stages?.length?settings.stages:DEFAULT_STAGES;
  /* ---- who is signed in (plain values — deliberately NOT hooks) ---- */
  const myUid=auth.uid(session);
  /* my own crm_users row — from the table when I can read it, otherwise
     rebuilt from whoami (a rep can always read their own row, so this is
     belt and braces for the moment right after a role change).

     EVERY pay field must be carried here. This rebuilt object feeds the rep's
     own earnings block and conversionPatch's commission, so a field left out is
     a rate of zero on their payslip while Settings shows the real number —
     write path and read path disagreeing, which is ENGINEERING §2 wearing a
     different hat. appointment_rate was missing and is why it is called out. */
  const myUser=users.find(u=>u.id===myUid)||((who&&who.role==='rep')?{id:myUid,name:who.name,role:'rep',pools:who.pools,commission_pct:who.commission_pct,appointment_rate:who.appointment_rate,tabs:who.tabs,goal_conversions:who.goal_conversions,active:who.active}:null);
  /* "nobody has been set up yet" is a DB fact, not a guess from what I can see */
  const noUsers=who?!who.setup:users.length===0;
  const isOwner=who?(who.role==='owner'||!who.setup):(users.length===0||(!!myUser&&myUser.role==='owner'));
  const rep=!isOwner;
  const blocked=(who&&who.active===false)||(!!myUser&&myUser.active===false);
  /* display name: their crm_users name when they have one, else the legacy
     username-derived name so single-tenant installs read exactly as before. */
  const me=(myUser&&myUser.name)||cap(auth.username(session))||BRAND.team[0]||'';
  const reps=users.filter(u=>u.role==='rep');
  /* names assignable to build tasks: real crm_users if present, else BRAND.team */
  const teamNames=users.length?users.filter(u=>u.active!==false).map(u=>u.name):BRAND.team;
  /* relationships are people, not deals — keep them out of the sales views */
  const bizLeads=useMemo(()=>leads.filter(l=>!l.isRelationship),[leads]);

  /* Lifted from below the auth early-returns so the Jarvis metrics hook can sit
     with every other hook. Same predicate as before, still the only one. */
  /* a rep with no readable row (signed in, never added) is still a rep —
     never fall back to "not a rep", which would hand them every tab. */
  const repUser=rep?(myUser||{id:myUid,name:me,role:'rep',pools:[],tabs:[],commission_pct:0,appointment_rate:0,active:true}):null;
  /* a rep's world: their own leads, and the pools they've been given */
  const myPools=(repUser&&repUser.pools)||(myUser&&myUser.pools)||[];
  const inMyWorld=l=>!rep||l.owner_id===myUid||l.owner===me||(l.pool&&myPools.includes(l.pool));
  const scoped=leads.filter(inMyWorld);
  const scopedBiz=bizLeads.filter(inMyWorld);
  /* Jarvis is a second screen, and ENGINEERING.md §2 says two screens must never
     disagree — so every dollar it reports comes out of useMetrics, the SAME hook
     the Dashboard uses, over the SAME scopedBiz list. Jarvis derives no money of
     its own. A rep gets null: the figures never enter the request at all. */
  const jvMetrics=useMetrics(scopedBiz,stages,settings,txns);
  const jvMoney=rep?null:{mrr:jvMetrics.mrr,openPipeline:jvMetrics.pipelineValue,revenueMonth:jvMetrics.revenueMonth,collectedMonth:jvMetrics.collectedMonth,outstanding:jvMetrics.outstanding,wonValue:jvMetrics.wonValue,avgDeal:jvMetrics.avgDeal,retainers:jvMetrics.retainers,winRate:jvMetrics.winRate};
  /* leaderboard: a rep cannot read other reps' leads, so the ranking comes
     from a security-definer DB function (names + counts, never dollars). */
  useEffect(()=>{ let dead=false;
    if(!session||!loaded){ return; }
    (async()=>{ try{ const rows=await db.leaderboard(); if(!dead) setBoard(rows); }
      catch(err){ console.error('leaderboard failed',err); if(!dead) setBoard(null); } })();
    return ()=>{dead=true;}; },[session,loaded,users.length,leads.filter(l=>l.isClient).length]);
  /* Every write mirrors the owner name into the real owner_id column (and
     carries the pool) so Row Level Security has something it can actually
     enforce. The name string stays the display truth; owner_id is the law. */
  const stampOwner=l=>{
    if(!l) return l;
    let oid=l.owner_id||null;
    if(!l.owner||l.owner===POOL_OWNER) oid=null;                       // unclaimed → pool
    else if(l.owner===me) oid=myUid||oid;                              // me, whoever I am
    else { const u=users.find(x=>x.name===l.owner); oid=u?u.id:null; } // someone else
    /* REP-AUDIT #2. A claimed lead must NOT keep its pool. The RLS policy is
       `owner_id = auth.uid() OR pool = any(my_pools())`, so a claimed lead that
       still carries its pool stays readable by every OTHER rep who has that
       pool — in Postgres, not merely on screen. ROLES.md defines a pool as a
       bucket of UNCLAIMED leads, so an owned lead in one is a contradiction
       that happened to be load-bearing.
       Never showed up because VERIFY-RLS §2 gives its two test reps DISJOINT
       pools, so the second clause can never fire there. */
    return {...l,owner_id:oid,pool:oid?null:(l.pool||null)};
  };
  /* setLeads is async, so every mutator below used to read the array captured at
     render time. Two writes in one tick therefore both started from the SAME
     snapshot and the second silently threw the first away — and because these
     mutators push a whole rebuilt lead to Supabase, the stale one won there too.
     That is why closing a deal logged the activity and left the deal sitting
     open: writeDeals, then set(closedDeals), then addActivity, each starting
     over from the same stale lead. leadsRef is the current array, readable
     synchronously, so consecutive writes compose instead of racing. */
  const leadsRef=React.useRef(leads);
  leadsRef.current=leads;
  const commitLeads=next=>{ leadsRef.current=next; setLeads(next); return next; };
  /* events live in their own table, one row each. Same synchronous-ref trick as
     leads so two writes in one tick can't race — see the v7 notes. */
  const eventsRef=React.useRef(events);
  eventsRef.current=events;
  const saveEvent=ev=>{ const cur=eventsRef.current;
    const next=cur.some(x=>x.id===ev.id)?cur.map(x=>x.id===ev.id?ev:x):[ev,...cur];
    eventsRef.current=next; setEvents(next); db.upsertEvent(ev).catch(console.error); };
  const removeEvent=id=>{ const next=eventsRef.current.filter(x=>x.id!==id);
    eventsRef.current=next; setEvents(next); db.deleteEvent(id).catch(console.error); };
  /* meeting logs: own table, newest first — the write is awaited so the page can
     show a failure instead of pretending a transcript was saved. */
  const saveMlog=async l=>{ await db.upsertMeetingLog(l); setMlogs(p=>[l,...p.filter(x=>x.id!==l.id)]); };
  /* Playbook mutators. Save NEVER publishes: db.upsertKbNote deliberately does
     not write the status column, which only kb_publish/kb_unpublish move. After
     publishing, kb_published and kb_ai_context are re-read rather than patched
     locally — the database is the thing the owner is being shown, so guessing
     what it now holds is the one thing this screen must not do. */
  /* RETURNS the stamped note. The editor holds its own copy of the draft, and
     if that copy keeps the old updatedAt after a save, the "published version
     is behind" indicator stays dark until the screen is re-entered — which is
     precisely the invisible drift the indicator exists to prevent. */
  const saveKbNote=async n=>{ await db.upsertKbNote(n); const saved={...n,updatedAt:new Date().toISOString()};
    setKbNotes(p=>[saved,...p.filter(x=>x.id!==n.id)]); return saved; };
  const delKbNote=async id=>{ await db.deleteKbNote(id); setKbNotes(p=>p.filter(x=>x.id!==id)); setKbPub(p=>p.filter(x=>x.id!==id)); setKbAi(p=>p.filter(x=>x.id!==id)); };
  const kbRefresh=async()=>{ const [n,p,a]=await Promise.all([db.getKbNotes(),db.getKbPublished(),db.kbAiContext()]); setKbNotes(n||[]); setKbPub(p||[]); setKbAi(a||[]); };
  const kbPublishNote=async id=>{ await db.kbPublish(id); await kbRefresh(); };
  const kbUnpublishNote=async id=>{ await db.kbUnpublish(id); await kbRefresh(); };

  /* Pocket. Nothing here writes an output — outputs go through saveMlog and
     saveKbNote, the same mutators every other screen uses, so an output made
     from a recording is indistinguishable from one typed by hand. */
  const payoutRefresh=async()=>{ try{ setPayouts(await db.getPayouts()||[]); }catch(err){ console.error(err); } };
  const addPayout=async row=>{ await db.addPayout(row); await payoutRefresh(); };
  const deletePayout=async id=>{ await db.deletePayout(id); await payoutRefresh(); };
  const pocketRefresh=async()=>{ try{ setPockets(await db.getPocketRecordings()||[]); }catch(err){ console.error(err); } };
  const pocketStatus=async(id,status)=>{ await db.setPocketStatus(id,status); setPockets(p=>p.map(r=>r.id===id?{...r,status}:r)); if(status!=='open') setPocketId(null); };
  const pocketDelete=async id=>{ await db.deletePocketRecording(id); setPockets(p=>p.filter(r=>r.id!==id)); };
  const delMlog=async id=>{ await db.deleteMeetingLog(id); setMlogs(p=>p.filter(x=>x.id!==id)); };
  /* THE ONE PLACE anything from a meeting log crosses into rep-readable data.
     meeting_logs is owner-only; lead activities are read by whoever owns the
     lead. So this never runs on its own — it runs when an owner types a line
     and presses the button, and it publishes THAT line and nothing else. The
     transcript and the extraction stay in their own table.

     The lead gets ONE patch (ENGINEERING §3): re-publishing edits the existing
     activity in place rather than logging a second one, so a corrected line
     doesn't read as two meetings. The activity id is generated here so the log
     can hold on to it and find the same row next time. */
  const publishLogToLead=async(log,text)=>{
    const body=String(text||'').trim(); if(!log||!log.leadId||!body) return;
    const lead=leadsRef.current.find(l=>l.id===log.leadId);
    if(!lead) throw new Error('That lead is no longer on file.');
    const prevId=log.shared&&log.shared.activityId;
    const actId=prevId||uid();
    const ts=new Date().toISOString();
    const acts=lead.activities||[];
    const has=prevId&&acts.some(a=>a&&a.id===prevId);
    const act={id:actId,ts:has?(acts.find(a=>a.id===prevId).ts||ts):ts,type:'Note',text:body,who:me,fromLog:log.id};
    const updated={...lead,activities:has?acts.map(a=>a&&a.id===prevId?{...a,text:body}:a):[act,...acts]};
    commitLeads(leadsRef.current.map(l=>l.id===lead.id?updated:l));
    putLead(updated);
    await saveMlog({...log,shared:{text:body,at:ts,by:me,activityId:actId}});
  };
  /* a guest or sponsor typed in by hand becomes a real lead, sourced to the
     event. That is the whole point — otherwise the night is untracked spend. */
  const quickLead=(name,source,extra)=>{ const lead={id:uid(),name:String(name||'').trim(),company:'',stage:stages[0]&&stages[0].key||'new',
      source:source||'Event',owner:me,createdAt:new Date().toISOString(),activities:[],meetings:[],deals:[],dealValue:0,
      email:(extra&&extra.email)||'',phone:(extra&&extra.phone)||''};
    const next=[stampOwner(lead),...leadsRef.current];
    leadsRef.current=next; setLeads(next); putLead(lead); return lead; };
  const putLead=l=>db.upsertLead(stampOwner(l)).catch(console.error);
  const putMany=arr=>db.upsertMany((arr||[]).map(stampOwner));
  const saveLeads=async n=>{ setLeads(n); try{ await db.deleteAll(); await putMany(n); }catch(e){ console.error(e); window.alert('Save failed: '+(e.message||e)); } };
  const settingsTimer=React.useRef(null);
  const saveSettings=n=>{ setSettings(n); if(settingsTimer.current)clearTimeout(settingsTimer.current); settingsTimer.current=setTimeout(()=>{ db.saveSettings(n).catch(console.error); },700); };
  const saveInvoices=n=>{ setInvoices(n); if(typeof db.saveInvoices==='function') db.saveInvoices(n).catch(console.error); };
  const saveTxns=n=>{ setTxns(n); if(typeof db.saveTxns==='function') db.saveTxns(n).catch(console.error); };
  /* Marking an invoice paid used to be a dead end: it set a status and nothing
     else. The money never reached the client's payments, never ticked
     deposit_paid, so an invoice paid IN FULL still left the client reading
     "payment not collected" with their revenue excluded. One rule now: an
     invoice marked paid is money received, and it lands everywhere money lands.
     Idempotent via invoiceId — marking, unmarking and re-marking can't stack. */
  const applyInvoicePayment=(inv,paid)=>{
    if(!inv||!inv.clientId) return;
    const lead=leadsRef.current.find(l=>l.id===inv.clientId); if(!lead) return;
    const pays=Array.isArray(lead.payments)?lead.payments:[];
    const existing=pays.find(p=>p.invoiceId===inv.id);
    const amount=invTotal(inv);
    if(paid){
      if(existing&&num(existing.amount)===amount) return;    // already recorded
      const when=inv.paidDate||todayISO();
      const row={id:existing?existing.id:uid(),invoiceId:inv.id,amount,date:when,
        note:`Invoice ${inv.number||''}`.trim()};
      const nextPays=existing?pays.map(p=>p.invoiceId===inv.id?row:p):[...pays,row];
      const ob={...(lead.onboarding||{})};
      const wasPaid=normEntry(ob.deposit_paid).done;
      /* first money in also confirms the deposit — the cash landed, so the
         revenue gate has no reason to keep holding it */
      if(!wasPaid) ob.deposit_paid={done:when,due:normEntry(ob.deposit_paid).due||null};
      const acts=[{id:uid(),ts:new Date().toISOString(),type:'Payment',
        text:`Payment received: ${usdc(amount)} — invoice ${inv.number||''}`.trim(),who:me}];
      if(!wasPaid) acts.push({id:uid(),ts:new Date().toISOString(),type:'Note',
        text:`Payment confirmed ${fmtDate(when)} — ${usd(num(lead.dealValue))} now counting.`,who:me});
      updateLead(lead.id,{payments:nextPays,onboarding:ob,
        activities:[...acts,...(lead.activities||[])]});
    } else {
      if(!existing) return;
      /* unmarking removes only the row this invoice created; anything logged by
         hand stays, and deposit_paid is left alone because other money may have
         landed for other reasons */
      updateLead(lead.id,{payments:pays.filter(p=>p.invoiceId!==inv.id),
        activities:[{id:uid(),ts:new Date().toISOString(),type:'Note',
          text:`Invoice ${inv.number||''} marked unpaid — ${usdc(amount)} removed.`.trim(),who:me},
          ...(lead.activities||[])]});
    }
  };
  const upsertTxn=t=>{ const exists=txns.some(x=>x.id===t.id); saveTxns(exists?txns.map(x=>x.id===t.id?t:x):[t,...txns]); };
  const deleteTxn=t=>{ saveTxns(txns.filter(x=>x.id!==t.id)); if(t.receipt?.path&&typeof db.removeReceipt==='function') db.removeReceipt(t.receipt.path).catch(console.error); };
  const saveTasks=n=>{ setTasks(n); if(typeof db.saveTasks==='function') db.saveTasks(n).catch(console.error); };
  const upsertTask=t=>{ const exists=tasks.some(x=>x.id===t.id); saveTasks(exists?tasks.map(x=>x.id===t.id?t:x):[t,...tasks]);
    /* if this task was spawned from a client's build checklist, mirror its
       done-state back onto that checklist item so the two never disagree.
       Read leads through the setter so we never act on a stale closure. */
    if(t.fromOnboarding&&t.leadId){ setLeads(cur=>{ const l=cur.find(x=>x.id===t.leadId); if(!l) return cur;
      const e=normEntry((l.onboarding||{})[t.fromOnboarding]);
      if((!!e.done)===(!!t.done)) return cur;
      const ob={...(l.onboarding||{})}; ob[t.fromOnboarding]={...e,done:t.done?(e.done||todayISO()):null};
      const nl={...l,onboarding:ob}; db.upsertLead(nl).catch(console.error);
      return cur.map(x=>x.id===nl.id?nl:x); }); } };
  const deleteTask=id=>{ saveTasks(tasks.filter(x=>x.id!==id)); };
  const upsertInvoice=inv=>{ const exists=invoices.some(x=>x.id===inv.id); saveInvoices(exists?invoices.map(x=>x.id===inv.id?inv:x):[inv,...invoices]); };
  const deleteInvoice=id=>{ saveInvoices(invoices.filter(x=>x.id!==id)); setInvId(null); };
  const newInvoice=(lead)=>{ const ivset=settings.invoicing||DEFAULT_INVOICING; const number=(ivset.prefix||'INV-')+String(ivset.seq||1).padStart(4,'0'); saveSettings({...settings,invoicing:{...ivset,seq:(ivset.seq||1)+1}}); const issue=todayISO(); const inv={ id:uid(), number, clientId:lead?lead.id:'', billTo:lead?{name:lead.name||'',company:lead.company||'',email:lead.email||'',address:''}:{name:'',company:'',email:'',address:''}, issueDate:issue, dueDate:addDays(issue,ivset.terms||14), items:lead?itemsFromLead(lead):[{id:uid(),label:'',qty:1,amount:0}], taxRate:num(ivset.taxRate), notes:ivset.notes||'', paymentLink:ivset.paymentLink||'', status:'draft', paidDate:'', createdAt:new Date().toISOString() }; upsertInvoice(inv); setInvId(inv.id); };
  const addOption=(listKey,val)=>{const v=(val||'').trim();if(!v)return;const cur=settings.options[listKey]||[];if(cur.includes(v))return;saveSettings({...settings,options:{...settings.options,[listKey]:[...cur,v]}});};

  /* ---- conversion side-effects: commission snapshot + owner alert --------
     Credit goes to the lead's OWNER when that owner is a rep (an owner
     closing a rep's deal doesn't steal it), otherwise to whoever is doing
     the converting if they're a rep. Owners earn no commission. */
  const repForLead=l=>{
    const oid=stampOwner(l).owner_id;
    const byOwner=oid?users.find(u=>u.id===oid):null;
    if(byOwner&&byOwner.role==='rep'&&byOwner.active!==false) return byOwner;
    if(myUser&&myUser.role==='rep') return myUser;
    return null;
  };
  /* returns the patch to merge onto a lead the moment it becomes a client */
  const conversionPatch=l=>{
    const r=repForLead(l); if(!r) return {};
    const patch={};
    if(!cmsnOf(l)&&num(r.commission_pct)>0) patch.commission=mkCommission(l,r);
    patch.onboardingAlert={at:new Date().toISOString(),repId:r.id,repName:r.name,ack:false};
    if(patch.commission&&r.id===myUid) setTimeout(()=>setCelebrate({amount:patch.commission.amount,name:l.company||l.name||'that client'}),0);
    /* Email the owners too, if /api/notify has a provider configured. This is
       deliberately fire-and-forget: the in-app queue above is the real record,
       and a mail failure must never interfere with closing a deal.

       apiPost, not a bare fetch: /api/notify now requires a session. It sends
       from a domain verified in Resend and it took its recipient list off the
       request body, which made it an open mail relay. `to` is still sent and
       still narrows the list, but the server decides what is ON it — these
       addresses come from app_settings, which any listed user can write, so
       the server cannot treat them as authorisation. Anything not on the
       server's allowlist is dropped there. */
    const to=(settings.notifyEmails||'').split(',').map(x=>x.trim()).filter(x=>x.includes('@'));
    try{ apiPost('/api/notify',{kind:'conversion',rep:r.name,client:l.company||l.name||'a client',
      when:fmtDate(todayISO()),amount:patch.commission?patch.commission.amount:null,
      to,link:(typeof window!=='undefined'?window.location.origin:'')}).catch(()=>{});
    }catch{}
    return patch;
  };
  const updateLead=(id,patch)=>{ let updated=null; commitLeads(leadsRef.current.map(l=>{
    if(l.id!==id) return l; const ts=new Date().toISOString(); const m={...l,...patch};
    /* The deal value drives the commission, and reps set it themselves — so
       every change is on the record with a name and a time against it.
       Number fields fire on every keystroke, so consecutive edits by the same
       person inside 15 minutes are folded into ONE entry that keeps the
       original "was" figure. Otherwise the feed fills with noise. */
    /* Closing a deal already writes its own, more specific note and moves the
       value as a side effect, so the generic "deal value set to" audit would be
       duplicate noise on top of it. Every other dealValue change still gets one. */
    if(patch.dealValue!==undefined&&num(patch.dealValue)!==num(l.dealValue)&&patch.closedDeals===undefined){
      m.dealValueBy=me; m.dealValueAt=ts;
      /* build on m.activities: a caller may have passed its own activities in the
         same patch, and rebuilding from l.activities threw them away. That is why
         closing a deal logged "deal value set to" INSTEAD of "Deal closed". */
      const acts=[...(m.activities||l.activities||[])];
      const prev=acts[0];
      const fresh=prev&&prev.dealEdit&&prev.who===me&&(Date.now()-new Date(prev.ts).getTime()<15*60*1000);
      const was=fresh?prev.dealWas:num(l.dealValue);
      const entry={id:fresh?prev.id:uid(),ts,type:'Note',who:me,dealEdit:true,dealWas:was,
        text:`Deal value set to ${usd(patch.dealValue)}${num(was)>0?` (was ${usd(was)})`:''}.`};
      m.activities=fresh?[entry,...acts.slice(1)]:[entry,...acts];
    }
    if(patch.stage&&patch.stage!==l.stage){
      m.activities=[{id:uid(),ts,type:'Note',text:`Stage moved: ${sOf(l.stage,stages).label} → ${sOf(patch.stage,stages).label}`,who:me},...(m.activities||l.activities||[])];
      if(sOf(patch.stage,stages).won){
        if(!l.closedAt) m.closedAt=todayISO();
        /* Signed = auto-onboard: flip to client, seed the universal checklist, start Intake */
        if(!l.isClient){
          m.isClient=true; m.clientPhase=m.clientPhase||'intake'; m.convertedAt=m.convertedAt||todayISO();
          m.onboarding=(l.onboarding&&Object.keys(l.onboarding).length)?l.onboarding:seedOnboarding();
          m.activities=[{id:uid(),ts,type:'Note',text:'Signed — onboarding started.',who:me},...m.activities];
          Object.assign(m,conversionPatch(l));
        }
      }
    }
    /* AUDIT #25. This used to stamp retainerStart the moment the toggle was
       flipped, which is how four QUOTED retainers came to look like billing
       ones and $526 of fictional MRR appeared. Setting a price is not starting
       to charge for it — the start date is now something you state when
       billing actually begins, and the toggle no longer invents one. */
    updated=m; return m;
  })); if(updated) putLead(updated); };
  /* retro-tagging: set the meeting type on a logged 'Booked' activity, and on the
     scheduled meeting it created (when there is one). */
  /* set a meeting's status from ANYWHERE (dashboard, lead modal, meetings tab).
     If the meeting only exists as a migrated 'Booked' activity, materialise it
     as a real meeting record on first touch so the status persists. */
  const setMeetingStatus=(leadId,meetingId,status)=>{ let updated=null;
    setLeads(leads.map(l=>{ if(l.id!==leadId)return l;
      const all=meetingsOf(l); const target=all.find(m=>m.id===meetingId); if(!target)return l;
      const already=(l.meetings||[]).some(m=>m.id===meetingId);
      const nextStatus=target.status===status?'':status;
      let meetings;
      /* REP PAY. Marking held is now a claim for money, so it records who and
         when — and clears that stamp if the mark is taken off, or a corrected
         status leaves evidence behind for a fee that no longer exists. */
      const stamp=m=>nextStatus==='held'
        ? {...m,status:nextStatus,heldBy:me,heldById:myUid||'',heldAt:new Date().toISOString()}
        : {...m,status:nextStatus,heldBy:'',heldById:'',heldAt:''};
      if(already){ meetings=(l.meetings||[]).map(m=>m.id===meetingId?stamp(m):m); }
      else { meetings=[...(l.meetings||[]),{...target,status:nextStatus}]; }   // materialise the migrated one
      const logIt=nextStatus&&nextStatus!==target.status;
      const act=logIt?{id:uid(),ts:new Date().toISOString(),type:'Meeting',meetingId,
        text:`${nextStatus==='held'?'Met':'No-show'}: ${target.title||target.mtype||'meeting'}`,who:me}:null;
      updated={...l,meetings,...(act?{activities:[act,...(l.activities||[])]}:{})}; return updated;
    })); if(updated) db.upsertLead(updated).catch(console.error); };
  /* give a dateless meeting its real date. Same materialise-on-first-touch
     pattern as setMeetingStatus, because the meeting may still only exist as a
     migrated 'Booked' activity. Writes dateUnknown:false explicitly so the
     backfill heuristic never reclaims it. */
  const setMeetingTime=(leadId,meetingId,startLocal,mins)=>{ if(!startLocal)return; let updated=null;
    const startDt=new Date(startLocal); if(isNaN(startDt))return;
    const pad=n=>String(n).padStart(2,'0');
    const loc=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    const start=loc(startDt), end=loc(new Date(startDt.getTime()+(num(mins)||30)*60000));
    setLeads(leads.map(l=>{ if(l.id!==leadId)return l;
      const all=meetingsOf(l); const target=all.find(m=>m.id===meetingId); if(!target)return l;
      const already=(l.meetings||[]).some(m=>m.id===meetingId);
      const patch={start,end,dateUnknown:false};
      const meetings=already?(l.meetings||[]).map(m=>m.id===meetingId?{...m,...patch}:m)
                            :[...(l.meetings||[]),{...target,...patch}];
      const act={id:uid(),ts:new Date().toISOString(),type:'Note',meetingId,
        text:`Dated: ${target.title||target.mtype||'meeting'} — ${fmtMeetingTime(start)}`,who:me};
      updated={...l,meetings,activities:[act,...(l.activities||[])]}; return updated;
    })); if(updated) db.upsertLead(updated).catch(console.error); };
  /* Cancel a meeting from outside the lead modal. Same rules as the modal's
     version: the meeting leaves the count and the calendar, the Booked activity
     that announced it stays and is flagged cancelled, and a note records it. */
  const removeMeeting=(leadId,meetingId)=>{ let updated=null;
    const lead=leadsRef.current.find(l=>l.id===leadId);
    const target=lead&&meetingsOf(lead).find(m=>m.id===meetingId);
    if(target&&target.eventId) deleteCalendarEvent(target.eventId);
    commitLeads(leadsRef.current.map(l=>{ if(l.id!==leadId)return l;
      const acts=(l.activities||[]).map(a=>(a.meetingId===meetingId&&a.type==='Booked')?{...a,cancelled:true}:a);
      const note={id:uid(),ts:new Date().toISOString(),type:'Meeting',
        text:`Cancelled: ${(target&&(target.title||target.mtype))||'meeting'}${target&&target.start&&!datelessOf(target)?` — ${fmtMeetingTime(target.start)}`:''}`,who:me};
      updated={...l,meetings:(l.meetings||[]).filter(m=>m.id!==meetingId),activities:[note,...acts]}; return updated;
    })); if(updated) db.upsertLead(updated).catch(console.error); };
  const tagMeetingType=(leadId,meetingId,mtype)=>{ let updated=null;
    setLeads(leads.map(l=>{ if(l.id!==leadId)return l;
      const all=meetingsOf(l); const target=all.find(m=>m.id===meetingId); if(!target)return l;
      const already=(l.meetings||[]).some(m=>m.id===meetingId);
      let meetings=already?(l.meetings||[]).map(m=>m.id===meetingId?{...m,mtype}:m):[...(l.meetings||[]),{...target,mtype}];
      // keep the source activity's type in sync so the activity feed still reads right
      const acts=(l.activities||[]).map(a=>(a.id===target.fromActivity||a.meetingId===meetingId)?{...a,mtype}:a);
      updated={...l,meetings,activities:acts}; return updated;
    })); if(updated) db.upsertLead(updated).catch(console.error); };
  const tagBooked=(leadId,actId,mtype)=>{ let updated=null; setLeads(leads.map(l=>{ if(l.id!==leadId)return l;
    const src=(l.activities||[]).find(a=>a.id===actId); if(!src)return l;
    const acts=(l.activities||[]).map(a=>a.id===actId?{...a,mtype}:a);
    const mts=(l.meetings||[]).map(m=>(src.meetingId&&m.id===src.meetingId)?{...m,mtype}:m);
    updated={...l,activities:acts,meetings:mts}; return updated; })); if(updated) putLead(updated); };
  const tagMeeting=(leadId,meetingId,mtype)=>{ let updated=null; setLeads(leads.map(l=>{ if(l.id!==leadId)return l;
    const mts=(l.meetings||[]).map(m=>m.id===meetingId?{...m,mtype}:m);
    const acts=(l.activities||[]).map(a=>a.meetingId===meetingId?{...a,mtype}:a);
    updated={...l,meetings:mts,activities:acts}; return updated; })); if(updated) putLead(updated); };
  const addActivity=(id,type,text,who,extra)=>{if(!text.trim())return; let updated=null; commitLeads(leadsRef.current.map(l=>{ if(l.id!==id)return l; updated={...l,activities:[{id:uid(),ts:new Date().toISOString(),type,text:text.trim(),who:who||me,...(extra&&typeof extra==='object'?extra:{})},...l.activities]}; return updated; })); if(updated) putLead(updated); };
  const delActivity=(id,aid)=>{ let updated=null; commitLeads(leadsRef.current.map(l=>{ if(l.id!==id)return l; updated={...l,activities:l.activities.filter(a=>a.id!==aid)}; return updated; })); if(updated) putLead(updated); };
  /* deleting is an owner action — the database enforces it too (leads_delete
     in MIGRATION.sql). This guard just keeps the UI honest. */
  /* Delete a whole import in one go — test data is the reason this exists.
     Scoped to ONE batch id so it can never reach anything typed in by hand,
     owner-only, and it makes you type the count: a misclick here is
     unrecoverable in a way a single delete isn't. */
  const delBatch=async batch=>{
    if(rep){ window.alert('Only an owner can delete leads.'); return; }
    const hit=leadsRef.current.filter(l=>l.importBatch===batch);
    if(!hit.length) return;
    const withWork=hit.filter(l=>(l.activities||[]).some(a=>REACHED_TYPES.has(a.type))
      ||(l.meetings||[]).length||(l.payments||[]).length);
    const warn=withWork.length
      ? `\n\n⚠ ${withWork.length} of these have real activity on them — calls, meetings or payments. That history goes too.`
      : '';
    const typed=window.prompt(
      `Delete all ${hit.length} leads from this import?${warn}\n\nThis cannot be undone. Type ${hit.length} to confirm.`);
    if(String(typed||'').trim()!==String(hit.length)) return;
    const ids=new Set(hit.map(l=>l.id));
    commitLeads(leadsRef.current.filter(l=>!ids.has(l.id)));
    for(const l of hit){ try{ await db.deleteLead(l.id); }catch(e){ console.error('delete failed',l.id,e); } }
  };
  const delLead=id=>{ if(rep){ window.alert('Only an owner can delete a lead.'); return; }
    setLeads(leads.filter(l=>l.id!==id)); db.deleteLead(id).catch(console.error); setActiveId(null); };
  const createNew=lead=>{ setLeads([lead,...leads]); putLead(lead); setActiveId(lead.id); };
  /* Every import gets a batch id and a timestamp. Without them "show me what I
     just added" is guesswork — createdAt alone can't separate an import from
     leads typed the same afternoon. */
  const importLeads=arr=>{ if(!arr||!arr.length)return;
    const batch='imp_'+Date.now().toString(36); const at=new Date().toISOString();
    arr=arr.map(l=>({...l,importBatch:batch,importedAt:at}));
    setLeads([...arr,...leads]); (async()=>{ try{ await putMany(arr); }catch(e){ console.error(e); window.alert('Some imported leads may not have saved: '+(e.message||e)); } })(); };
  /* Converting to a client IS closing the deal. Stamp the close date and move the
     lead onto the won stage so the pipeline, the money numbers and the client board
     all agree — a client should never still be sitting in "Proposal Sent". */
  const convertToClient=id=>{ const l=leads.find(x=>x.id===id); if(!l)return;
    const ob=(l.onboarding&&Object.keys(l.onboarding).length)?l.onboarding:seedOnboarding();
    const wonStage=stages.find(s=>s.won);
    const moved=wonStage&&l.stage!==wonStage.key;
    const ts=new Date().toISOString();
    const acts=[{id:uid(),ts,type:'Note',text:'Converted to client — onboarding started.',who:me}];
    if(moved) acts.unshift({id:uid(),ts,type:'Note',text:`Stage moved: ${sOf(l.stage,stages).label} → ${wonStage.label}`,who:me});
    const updated={...l,isClient:true,clientPhase:l.clientPhase||'intake',convertedAt:l.convertedAt||todayISO(),
      stage:wonStage?wonStage.key:l.stage,
      closedAt:l.closedAt||todayISO(),
      delivery:l.delivery||{},onboarding:ob,activities:[...acts,...l.activities],
      ...conversionPatch(l)};
    setLeads(leads.map(x=>x.id===id?updated:x)); putLead(updated); };
  /* ---- owner-only commission controls (live on the client record) ---- */
  const setCommission=(id,patch)=>{ if(!isOwner) return; let updated=null;
    setLeads(leads.map(l=>{ if(l.id!==id) return l; const c=cmsnOf(l); if(!c) return l;
      const next={...c,...patch}; next.amount=cmsnAmount(next.base,next.pct);
      const ts=new Date().toISOString();
      let act=null;
      if(patch.status==='earned'&&c.status!=='earned'){ next.approvedAt=ts; next.approvedBy=me; next.voidedAt=null;
        act={id:uid(),ts,type:'Note',text:`Commission approved — ${usd(next.amount)} to ${next.repName||'rep'}.`,who:me}; }
      if(patch.status==='void'&&c.status!=='void'){ next.voidedAt=ts;
        act={id:uid(),ts,type:'Note',text:`Commission voided${next.repName?' — '+next.repName:''}.`,who:me}; }
      updated={...l,commission:next,activities:act?[act,...(l.activities||[])]:l.activities};
      return updated; })); if(updated) putLead(updated); };
  /* ---- team management (owner-only; the DB enforces it too) ---- */
  const saveUser=async u=>{ if(!isOwner) return; const next=users.some(x=>x.id===u.id)?users.map(x=>x.id===u.id?{...x,...u}:x):[...users,u];
    setUsers(next); try{ await db.upsertUser(next.find(x=>x.id===u.id)); }catch(e){ console.error(e); window.alert('Could not save that person: '+(e.message||e)); setUsers(users); } };
  /* A person's own sidebar order, saved by that person. saveUser is deliberately
     owner-only and alerts on failure — neither is right here. An agent has to be
     able to order their own sidebar, and a cosmetic preference that fails to
     persist must never interrupt anyone or revert the screen. Worst case it is
     session-only, which is a perfectly acceptable failure for this. */
  const saveNavOrder=async order=>{
    setNavLocal(order);
    if(!myUid) return;
    setUsers(us=>us.map(x=>x.id===myUid?{...x,nav_order:order}:x));
    const row=users.find(x=>x.id===myUid)||myUser;
    if(!row) return;
    try{ await db.upsertUser({...row,nav_order:order}); }
    catch(e){ console.error('Sidebar order not saved (session only):',e); }
  };
  const removeUser=async id=>{ if(!isOwner) return; const prev=users; setUsers(users.filter(u=>u.id!==id));
    try{ await db.deleteUser(id); }catch(e){ console.error(e); window.alert('Could not remove that person: '+(e.message||e)); setUsers(prev); } };
  /* When someone leaves, their leads shouldn't leave with them. Moves every
     lead (name AND owner_id, so RLS follows) from one person to another.
     Commissions already earned are NOT touched — that history is theirs. */
  const reassignLeads=async(fromUser,toUser)=>{
    if(!isOwner||!fromUser) return 0;
    const mine=leads.filter(l=>l.owner_id===fromUser.id||l.owner===fromUser.name);
    if(!mine.length) return 0;
    const ts=new Date().toISOString();
    const toName=toUser?toUser.name:POOL_OWNER;
    const moved=mine.map(l=>({...l,owner:toName,owner_id:toUser?toUser.id:null,
      activities:[{id:uid(),ts,type:'Note',who:me,text:`Reassigned from ${fromUser.name} to ${toName}.`},...(l.activities||[])]}));
    setLeads(leads.map(l=>moved.find(m=>m.id===l.id)||l));
    try{ await putMany(moved); }catch(e){ console.error(e); window.alert('Some leads may not have moved: '+(e.message||e)); }
    return moved.length;
  };
  /* BATCH REASSIGN, driven from a selection on the Leads table.
     Mirrors reassignLeads above deliberately — same "Reassigned from X to Y."
     note, same single putMany write — so two paths that move ownership cannot
     drift into behaving differently.

     Returns a RESULT OBJECT instead of throwing or alerting. A refusal has to
     be able to name the person it could not resolve, and window.alert cannot
     be rendered next to the button that caused it. */
  const reassignMany=async(ids,toUser)=>{
    if(!isOwner) return {ok:false,reason:'not_owner'};
    const idSet=new Set(ids||[]);
    const picked=leadsRef.current.filter(l=>idSet.has(l.id));
    if(!picked.length) return {ok:false,reason:'nothing_selected'};
    const toName=toUser?toUser.name:POOL_OWNER;

    /* TWO PEOPLE, ONE NAME. stampOwner resolves ownership with
       users.find(x => x.name === l.owner), which returns the FIRST match — so
       a duplicated name quietly assigns every lead to whichever row happens to
       come first. Refuse, and say whose name is doubled. */
    if(toUser){
      const sameName=(users||[]).filter(u=>u&&u.active!==false&&String(u.name||'').trim()===String(toName).trim());
      if(sameName.length>1) return {ok:false,reason:'ambiguous_name',name:toName,count:sameName.length};
    }

    const ts=new Date().toISOString();
    const moved=picked.map(l=>({...l,owner:toName,owner_id:toUser?toUser.id:null,
      activities:[{id:uid(),ts,type:'Note',who:me,
        text:`Reassigned from ${l.owner||'nobody'} to ${toName}.`},...(l.activities||[])]}));

    /* THE SILENT-NULL CHECK, and it asks stampOwner rather than trusting the
       owner_id set two lines up. stampOwner is what actually decides the value
       that reaches Postgres, so running it here — same function, same users
       array, before anything is written — is the only check that cannot
       disagree with the write. A null means these leads would have landed in
       nobody's book, readable by no rep, with no error anywhere. */
    if(toUser){
      const unresolved=moved.map(stampOwner).filter(l=>!l.owner_id);
      if(unresolved.length) return {ok:false,reason:'unresolved',name:toName,count:unresolved.length};
    }

    commitLeads(leadsRef.current.map(l=>moved.find(m=>m.id===l.id)||l));
    try{ await putMany(moved); }
    catch(e){ return {ok:false,reason:'write_failed',error:e.message||String(e)}; }
    return {ok:true,n:moved.length,name:toName};
  };
  /* first-run bootstrap: the person standing here becomes the owner */
  const claimOwner=async()=>{ if(!myUid) return;
    await saveUser({id:myUid,name:me,email:auth.email(session),role:'owner',pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0}); };
  /* owner acknowledges a newly converted client in the onboarding queue */
  const ackOnboarding=id=>{ let updated=null; setLeads(leads.map(l=>{ if(l.id!==id) return l;
    updated={...l,onboardingAlert:{...(l.onboardingAlert||{}),ack:true,ackAt:new Date().toISOString(),ackBy:me}}; return updated; }));
    if(updated) putLead(updated); };
  /* Undo a conversion properly. The old version only flipped isClient, which
     left the lead sitting at the WON stage with a closedAt on it — so a misclick
     kept counting in win rate, the funnel and closed-deal counts forever, and
     the record looked reverted while the numbers disagreed. Everything convert
     touched is undone: stage, close date, converted date, commission and the
     onboarding alert. Delivery progress and onboarding ticks are KEPT, because
     a revert is usually a misclick and re-converting shouldn't lose work. */
  const revertClient=(id,toStage)=>{ const l=leads.find(x=>x.id===id); if(!l)return;
    const back=toStage||(stages.find(s=>!s.won&&!s.lost)||stages[0]||{}).key||l.stage;
    const ts=new Date().toISOString();
    const acts=[{id:uid(),ts,type:'Note',text:`Reverted to lead — back to ${sOf(back,stages).label}. Delivery progress kept.`,who:me}];
    const updated={...l,isClient:false,stage:back,clientPhase:'',
      closedAt:null,convertedAt:null,onboardingAlert:null,commission:null,
      activities:[...acts,...(l.activities||[])]};
    setLeads(leads.map(x=>x.id===id?updated:x)); putLead(updated); };
  /* Backfill close tracking for a client created before closedAt was stamped.
     Sets the real close date + moves them into the won stage so every "deals
     closed" and revenue metric counts them, WITHOUT resetting onboarding. */
  const fixCloseTracking=(id,date)=>{ const l=leads.find(x=>x.id===id); if(!l)return;
    const wonStage=stages.find(s=>s.won); const d=date||l.closedAt||l.convertedAt||todayISO();
    const moved=wonStage&&l.stage!==wonStage.key; const ts=new Date().toISOString();
    const acts=[{id:uid(),ts,type:'Note',text:`Close date set to ${fmtDate(d)} — now counted in revenue.`,who:me}];
    if(moved) acts.unshift({id:uid(),ts,type:'Note',text:`Stage moved: ${sOf(l.stage,stages).label} → ${wonStage.label}`,who:me});
    const updated={...l,closedAt:d,convertedAt:l.convertedAt||d,stage:wonStage?wonStage.key:l.stage,activities:[...acts,...(l.activities||[])]};
    setLeads(leads.map(x=>x.id===id?updated:x)); putLead(updated); };
  /* toggle one onboarding item + log it — single atomic write */
  /* Mark a checklist item as not applying to this client, or bring it back.
     Any tick already on it is left in place, so switching it off and on again
     doesn't lose the date it was completed. */
  const toggleOnbSkip=(id,itemKey)=>{ const l=leadsRef.current.find(x=>x.id===id); if(!l) return;
    const cur=skippedOnb(l); const off=cur.includes(itemKey);
    const next=off?cur.filter(k=>k!==itemKey):[...cur,itemKey];
    const label=(ONB_ITEMS.find(i=>i.key===itemKey)||{}).label||itemKey;
    updateLead(id,{onbSkip:next,activities:[{id:uid(),ts:new Date().toISOString(),type:'Note',
      text:off?`Checklist: "${label}" applies again.`:`Checklist: "${label}" marked not applicable.`,who:me},
      ...(l.activities||[])]}); };
  const toggleOnboarding=(id,itemKey)=>{ let updated=null; let linkedTaskId=null; let doneState=false;
    setLeads(leads.map(l=>{ if(l.id!==id)return l;
      const ob={...(l.onboarding||{})}; const cur=normEntry(ob[itemKey]); const doneNow=!cur.done; doneState=doneNow;
      ob[itemKey]={done:doneNow?todayISO():null,due:cur.due||null,assignee:cur.assignee||null,taskId:cur.taskId||null};
      linkedTaskId=cur.taskId||null;
      const item=ONB_ITEMS.find(i=>i.key===itemKey); const label=item?item.label:itemKey;
      updated={...l,onboarding:ob,activities:[{id:uid(),ts:new Date().toISOString(),type:'Task',text:(doneNow?'✓ ':'unchecked: ')+label,who:me},...l.activities]};
      return updated; })); if(updated) putLead(updated);
    /* keep the linked task in lock-step with the checklist item */
    if(linkedTaskId){ const t=tasks.find(x=>x.id===linkedTaskId);
      if(t) upsertTask({...t,done:doneState,doneAt:doneState?new Date().toISOString():'',doneBy:doneState?me:''}); } };
  const setOnboardingDue=(id,itemKey,date)=>{ let updated=null; let linkedTaskId=null;
    setLeads(leads.map(l=>{ if(l.id!==id)return l; const ob={...(l.onboarding||{})}; const cur=normEntry(ob[itemKey]);
      ob[itemKey]={done:cur.done||null,due:date||null,assignee:cur.assignee||null,taskId:cur.taskId||null}; linkedTaskId=cur.taskId||null;
      updated={...l,onboarding:ob}; return updated; })); if(updated) putLead(updated);
    if(linkedTaskId){ const t=tasks.find(x=>x.id===linkedTaskId); if(t) upsertTask({...t,due:date||t.due}); } };
  /* assign (or reassign / unassign) a build-checklist item to a person. Assigning
     spawns a real task in THAT person's Tasks list, linked back to the item so
     checking either one completes both. Reassigning moves the task's owner. */
  const assignOnboarding=(id,itemKey,assignee)=>{ const l=leads.find(x=>x.id===id); if(!l)return;
    const cur=normEntry((l.onboarding||{})[itemKey]);
    const item=ONB_ITEMS.find(i=>i.key===itemKey); const label=item?item.label:itemKey;
    const clientName=l.company||l.name||'client';
    let taskId=cur.taskId||null;
    if(!assignee){ // unassign: drop the linked task, clear the fields
      if(taskId) deleteTask(taskId);
      taskId=null;
    } else if(taskId&&tasks.some(t=>t.id===taskId)){ // reassign existing task
      const t=tasks.find(x=>x.id===taskId); upsertTask({...t,owner:assignee});
    } else { // create a new linked task in their queue
      taskId=uid();
      upsertTask({...newTask(assignee),id:taskId,title:`${label} — ${clientName}`,owner:assignee,leadId:id,
        due:cur.due||todayISO(),done:!!cur.done,doneAt:cur.done?new Date().toISOString():'',
        notes:`Build task for ${clientName}. Auto-linked to the onboarding checklist.`,fromOnboarding:itemKey});
    }
    let updated=null; setLeads(leads.map(x=>{ if(x.id!==id)return x; const ob={...(x.onboarding||{})};
      ob[itemKey]={done:cur.done||null,due:cur.due||null,assignee:assignee||null,taskId};
      updated={...x,onboarding:ob}; return updated; })); if(updated) putLead(updated); };
  /* Phase 5: when a client enters Active, drop two recurring-cadence tasks onto them.
     (No recurring engine — these are one-time tasks the owner recreates on completion.) */
  const seedActiveTasks=(id,ownerHint)=>{ if(tasks.some(t=>t.leadId===id&&t.seededActive)) return;
    const owner=ownerHint&&ownerHint!==POOL_OWNER?ownerHint:me;
    const mk=(title,cadence,days)=>({...newTask(owner),title,leadId:id,seededActive:true,notes:`Recurring ${cadence} — recreate when done.`,due:addDays(todayISO(),days)});
    saveTasks([mk('Monthly results text/email','monthly',30),mk('Quarterly system check + upsell scan','quarterly',90),...tasks]); };
  /* set/advance a client's phase + log it; entering Active seeds handoff tasks */
  const setClientPhase=(id,phase)=>{ const l=leads.find(x=>x.id===id); if(!l)return; let updated=null; setLeads(leads.map(x=>{ if(x.id!==id)return x;
    updated={...x,isClient:true,clientPhase:phase,activities:[{id:uid(),ts:new Date().toISOString(),type:'Note',text:'Phase → '+phaseInfo(phase,settings,l).label,who:me},...x.activities]}; return updated; }));
    if(updated){ putLead(updated); if(phase==='active') seedActiveTasks(id,l.owner); } };
  const addCustomPhase=(id,info)=>{ let updated=null; setLeads(leads.map(l=>{ if(l.id!==id)return l; const cp={key:'cp_'+uid(),label:(info.label||'Custom').trim(),color:info.color||'#7A5CC8',after:info.after||'build'}; updated={...l,customPhases:[...(l.customPhases||[]),cp]}; return updated; })); if(updated) putLead(updated); };
  const removeCustomPhase=(id,key)=>{ let updated=null; setLeads(leads.map(l=>{ if(l.id!==id)return l; const cps=(l.customPhases||[]).filter(c=>c.key!==key); updated={...l,customPhases:cps,clientPhase:l.clientPhase===key?'build':l.clientPhase}; return updated; })); if(updated) putLead(updated); };
  const toggleMilestone=(id,trackKey,milestone)=>{ const l=leads.find(x=>x.id===id); if(!l)return; const d={...(l.delivery||{})}; const tr={...(d[trackKey]||{})}; const cur=normEntry(tr[milestone]); const next={done:cur.done?null:todayISO(),due:cur.due||null}; if(!next.done&&!next.due) delete tr[milestone]; else tr[milestone]=next; d[trackKey]=tr; const patch={delivery:d}; const o=clientOverall({...l,delivery:d},settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS); const won=(stages||[]).find(s=>s.won); if(o.delivered&&won&&l.stage!==won.key) patch.stage=won.key; updateLead(id,patch); };
  const setMilestoneDue=(id,trackKey,milestone,date)=>{ const l=leads.find(x=>x.id===id); if(!l)return; const d={...(l.delivery||{})}; const tr={...(d[trackKey]||{})}; const cur=normEntry(tr[milestone]); const next={done:cur.done||null,due:date||null}; if(!next.done&&!next.due) delete tr[milestone]; else tr[milestone]=next; d[trackKey]=tr; updateLead(id,{delivery:d}); };
  /* COLD LOAD. A pasted ?lead=… link cannot open anything until the leads are
     in memory, so this waits for `loaded` and runs exactly once.
     An id that is not in the set does NOTHING — deleted, or a rep handed an
     owner's link, and Postgres simply did not return it. Silence is the right
     answer to both: there is no error to show that would not be a guess about
     which one happened. The stale ?lead= is cleaned off the URL either way. */
  const coldOpen=React.useRef(false);
  useEffect(()=>{
    if(coldOpen.current||!loaded||typeof window==='undefined') return;
    coldOpen.current=true;
    let id=null; try{ id=new URLSearchParams(window.location.search).get('lead'); }catch{}
    if(!id) return;
    if(leads.some(l=>l.id===id)){ leadUrlRef.current.on=true; setActiveId(id); }
    else{ try{ const u=new URL(window.location.href); u.searchParams.delete('lead');
      window.history.replaceState({},'',u.pathname+u.search); }catch{} }
  },[loaded,leads]);
  const active=activeId&&activeId!=='new'?leads.find(l=>l.id===activeId):null;

  if(!configured) return (<><style>{CSS}</style><div className="gate"><div className="gate-card">
    <span className="nucleus" style={{width:18,height:18,margin:'0 auto 10px',display:'block'}}/>
    <h2>{BRAND.title}</h2>
    <p style={{color:'#b4322e',lineHeight:1.5}}>This deployment isn't connected to a database yet. Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_KEY</b> in Vercel → Settings → Environment Variables, then redeploy.</p>
  </div></div></>);
  if(session===undefined) return (<><style>{CSS}</style><div className="gate"><div className="gate-card"><span className="nucleus" style={{width:18,height:18,margin:'0 auto 10px',display:'block'}}/><h2>{BRAND.title}</h2>{bootErr?<><p style={{color:'#b4322e',lineHeight:1.5}}>Can't reach the database. Your Supabase project may be paused — open the Supabase dashboard and restore it, then retry.</p><button className="btn btn-p" style={{width:'100%',justifyContent:'center',marginTop:6}} onClick={()=>window.location.reload()}>Retry</button></>:<p>Loading…</p>}</div></div></>);
  if(!session) return <Login/>;
  /* A reset link signs them in without them knowing a password. Until they
     choose one, this is the only screen they get — otherwise they'd land in
     the app and be locked out again the moment the session expired. */
  if(recovery) return <SetPassword email={auth.email(session)} firstTime={!users.length}
    onDone={()=>{ setRecovery(false); try{ window.history.replaceState({},'',window.location.pathname+window.location.search); }catch{} }}/>;
  /* deactivated by an owner — their data stays, their access doesn't */
  if(blocked) return (<><style>{CSS}</style><div className="gate"><div className="gate-card">
    <span className="nucleus" style={{width:18,height:18,margin:'0 auto 10px',display:'block'}}/>
    <h2>{BRAND.title}</h2>
    <p style={{lineHeight:1.5}}>Your access has been switched off. Ask an owner to turn it back on.</p>
    <button className="btn btn-g" style={{width:'100%',justifyContent:'center',marginTop:8}} onClick={()=>auth.logout()}><LogOut size={15}/>Sign out</button>
  </div></div></>);

  const NAV=[['dash','Dashboard',<LayoutDashboard size={18}/>],['jarvis',AI_NAME,<Bot size={18}/>],['board','Leaderboard',<Trophy size={18}/>],['huddle','Monday Huddle',<Sparkles size={18}/>],['followup','Follow-Up',<Bell size={18}/>],['tasks','Tasks',<ListTodo size={18}/>],['activity','Activity',<List size={18}/>],['pipeline','Pipeline',<KanbanSquare size={18}/>],['leads','Leads',<Contact2 size={18}/>],['rels','Relationships',<Users size={18}/>],['clients','Clients',<Building2 size={18}/>],['meetings','Meetings',<CalendarCheck size={18}/>],['mlog','Meeting Log',<FileText size={18}/>],['playbook','Playbook',<BookOpen size={18}/>],['events','Events',<Ticket size={18}/>],['sponsors','Sponsors',<Handshake size={18}/>],['invoices','Invoices',<Receipt size={18}/>],['money','Money',<DollarSign size={18}/>],['settings','Settings',<Settings size={18}/>]];
  /* if a section is switched off while you're standing on it — or a rep lands
     on something only owners get — fall back to the dashboard. Computed during
     render — deliberately NOT a hook, because this sits after the auth
     early-returns above. */
  /* repUser / myPools / inMyWorld / scoped / scopedBiz are declared with the
     hooks at the top of App — Jarvis needs useMetrics over scopedBiz, and a
     hook cannot live down here after the auth early-returns. */
  const canSee=k=>canOpen(settings,repUser,k);
  const view=canSee(page)?page:'dash';
  /* A rep sees only tasks addressed to them by name. "Both" is the owners'
     shared list and is none of their business. (UI filter over a shared blob —
     see BUILD-NOTES; the blob itself is not splittable by RLS.) */
  const myTasks=rep?tasks.filter(t=>t.owner===me):tasks;
  /* The Tasks page is handed a FILTERED list for a rep, but "AI rank" and
     "Clear ranking" re-save the whole list they were given. Saving that
     straight to the shared blob would wipe every task belonging to anyone
     else. Merge the rep's slice back over the untouched remainder instead. */
  const saveScopedTasks=next=>{
    if(!rep) return saveTasks(next);
    const others=tasks.filter(t=>t.owner!==me);
    saveTasks([...(next||[]).filter(t=>t.owner===me),...others]);
  };
  const titles={dash:['Dashboard','The whole board at a glance'],jarvis:[AI_NAME,'Ask the CRM anything'],board:['Leaderboard','Clients closed — this month and all time'],huddle:['Monday Huddle','The last 7 days, read and interpreted'],followup:['Follow-Up',"Clear every lead that's due or overdue"],tasks:['Tasks','AI-ranked to-dos for you & Logan'],activity:['Activity','Who did what — calls, texts, meetings & notes'],pipeline:['Pipeline','Drag a card to move a deal'],leads:['Leads','Every contact, every conversation'],rels:['Relationships','The people in your corner — and who introduced them'],clients:['Clients','Closed deals & monthly retainers'],mlog:['Meeting Log','Paste a transcript · Claude pulls out what matters'],invoices:['Invoices','Create, send & track payments'],books:['The Books','Money in, money out, draws & receipts'],money:['Money','Revenue, MRR, forecast & attribution'],settings:['Settings','Customize the CRM · back up your data']};
  if(rep){ titles.dash=['Dashboard','Your month, your commission, your rank']; titles.leads=['Leads','Your leads — and the pools you can claim from']; titles.jarvis=[AI_NAME,'Ask about your leads · flag anything to the owner']; }
  /* the leaderboard the DB gave us; pre-migration an owner can still see one
     computed locally (an owner can read every lead, a rep never could). */
  const localBoard=()=>reps.filter(u=>u.active!==false).map(u=>{ const mine=leads.filter(l=>l.isClient&&l.convertedAt&&l.owner_id===u.id);
    return {id:u.id,name:u.name,month:mine.filter(l=>String(l.convertedAt).slice(0,7)===todayISO().slice(0,7)).length,all:mine.length}; });
  const boardRows=board||(isOwner?localBoard():null);
  /* sidebar reordering — same shape as the dashboard's arrange mode: drag by the
     row, or use the chevrons, which are the only thing that works on a phone.
     The three useState calls live at the top of App with every other hook,
     because there are four early returns between there and here and a hook
     declared after one of them changes the hook count between renders. */
  const NAV_KEYS=NAV.map(([k])=>k);
  const navOrder=navLocal||navOrderOf(myUser,NAV_KEYS);
  const saveNav=next=>saveNavOrder(next);
  const moveNav=(from,to)=>{ if(to<0||to>=navOrder.length)return;
    const n=[...navOrder]; const [x]=n.splice(from,1); n.splice(to,0,x); saveNav(n); };
  const dropNav=key=>{ if(!navDrag||navDrag===key)return;
    moveNav(navOrder.indexOf(navDrag),navOrder.indexOf(key)); setNavDrag(null); };
  const navItems=navOrder.map(k=>NAV.find(([kk])=>kk===k)).filter(Boolean).filter(([k])=>canSee(k));

  return (<><style>{CSS}</style><div className="pt">
    {sbOpen&&<div className="scrim" onClick={()=>setSbOpen(false)}/>}
    <aside className={'sb '+(sbOpen?'open':'')}>
      <SidebarArt/>
      <Brand logo={settings.logo} size={Math.max(88,num(settings.logoSize)||88)} sub={rep?'Sales':'Business Suite'}/>
      {/* Only the tab list scrolls. New Lead / My account / Sign out stay pinned
          below it — signing out shouldn't require scrolling past fifteen tabs,
          and on a short laptop screen they were falling off the bottom
          entirely. */}
      <nav className="sb-scroll">
      {navItems.map(([k,l,ic],i)=>navEdit
        ? (<div key={k} className={'nav-i nav-edit'+(navDrag===k?' dragging':'')}
             draggable onDragStart={()=>setNavDrag(k)} onDragEnd={()=>setNavDrag(null)}
             onDragOver={e=>e.preventDefault()} onDrop={()=>dropNav(k)}>
            <GripVertical size={15} className="nav-grip"/>{ic}<span className="nav-l">{l}</span>
            <span className="nav-mv">
              <button disabled={i===0} onClick={()=>moveNav(i,i-1)} title="Move up"><ChevronLeft size={13} style={{transform:'rotate(90deg)'}}/></button>
              <button disabled={i===navItems.length-1} onClick={()=>moveNav(i,i+1)} title="Move down"><ChevronRight size={13} style={{transform:'rotate(90deg)'}}/></button>
            </span>
          </div>)
        : (<button key={k} className={'nav-i '+(view===k?'on':'')} onClick={()=>{setPage(k);setSbOpen(false);}}>{ic}{l}</button>))}
      <button className={'nav-i nav-reorder'+(navEdit?' on':'')} onClick={()=>setNavEdit(v=>!v)}>
        <GripVertical size={16}/>{navEdit?'Done':'Reorder tabs'}
      </button>
      {navEdit&&<button className="nav-i nav-reset" onClick={()=>saveNav(NAV_KEYS)}>Reset to default</button>}
      </nav>
      <div className="sb-fixed">
        <button className="nav-i" style={{background:'rgba(43,77,224,.16)',color:'#fff'}} onClick={()=>setActiveId('new')}><Plus size={18}/>New Lead</button>
        {/* sat on the Leads page only, which is the last place you look when
            you've just been handed a list */}
        <button className="nav-i" onClick={()=>{setPage('leads');setImportOpen(true);setSbOpen(false);}}><Upload size={18}/>Import a list</button>
        <button className="nav-i" onClick={()=>{setAcct(true);setSbOpen(false);}}><KeyRound size={18}/>My account</button>
        <button className="nav-i" onClick={()=>auth.logout()}><LogOut size={18}/>Sign out ({me})</button>
        <div className="sb-foot"><b>{BRAND.tagline}</b><br/>{BRAND.taglineSub}</div>
      </div>
    </aside>
    <div className="main">
      <div className="top">
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button className="hamb" onClick={()=>setSbOpen(true)}><Menu size={22}/></button>
          <div><h1>{view==='dash'?`Welcome, ${(me||'').split(' ')[0]}`:(titles[view]||[view,''])[0]}</h1><div className="sub">{(titles[page]||['',''])[1]}</div></div>
        </div>
        <button className="btn btn-p" onClick={()=>setActiveId('new')}><Plus size={16}/>New Lead</button>
      </div>
      <div className="body">
        {!loaded?<div className="empty">Loading…</div>:
          view==='huddle'?<Huddle leads={scopedBiz} tasks={myTasks} settings={settings} stages={stages} rels={scoped.filter(l=>l.isRelationship)} saveSettings={saveSettings} me={me} open={()=>setPage('followup')}/>:
          view==='jarvis'?<Jarvis leads={scoped} stages={stages} settings={settings} tasks={myTasks} me={me} myUid={myUid} rep={rep} myPools={myPools} teamNames={teamNames} money={jvMoney} addActivity={addActivity} upsertTask={upsertTask} updateLead={updateLead} openLead={openLead} kb={kbAi}/>:
          view==='dash'?<Dashboard pockets={pockets} openPocket={setPocketId} txns={txns} payouts={payouts} leads={scopedBiz} stages={stages} open={openLead} saveSettings={saveSettings} tagBooked={tagBooked} setMeetingStatus={setMeetingStatus} setMeetingTime={setMeetingTime} tagMeetingType={tagMeetingType} rels={scoped.filter(l=>l.isRelationship)} settings={settings} events={events} goEvents={()=>setPage('events')} rep={rep} me={me} myUser={repUser||myUser} myUid={myUid} board={boardRows} ack={ackOnboarding} goBoard={()=>setPage('board')} team={users} approve={setCommission}/>:
          view==='board'?<Leaderboard rows={boardRows} meId={myUid} rep={rep} users={users}/>:
          view==='followup'?<FollowUp leads={scoped} stages={stages} open={openLead} updateLead={updateLead} me={me} settings={settings} addActivity={addActivity} rep={rep} myPools={myPools}/>:
          view==='tasks'?<Tasks tasks={myTasks} leads={scoped} me={me} upsertTask={upsertTask} deleteTask={deleteTask} saveTasks={saveScopedTasks} open={openLead} rep={rep}/>:
          view==='activity'?<Activity leads={scoped} tasks={myTasks} me={me} open={openLead} rep={rep}/>:
          view==='pipeline'?<Pipeline leads={scopedBiz} stages={stages} open={openLead} updateLead={updateLead} settings={settings} clients={scopedBiz.filter(l=>l.isClient&&(l.clientPhase||'intake')!=='churned')} setClientPhase={setClientPhase} rep={rep}/>:
          view==='leads'?<Leads leads={scopedBiz} settings={settings} stages={stages} open={openLead} saveSettings={saveSettings} importLeads={importLeads} me={me} updateLead={updateLead} rep={rep} myPools={myPools} importOpen={importOpen} setImportOpen={setImportOpen} delBatch={delBatch} users={users} reassignMany={reassignMany}/>:
          view==='rels'?<Relationships leads={scoped} open={openLead} updateLead={updateLead}/>:
          view==='clients'?<Clients leads={bizLeads} stages={stages} settings={settings} open={openLead} toggleOnboarding={toggleOnboarding} setOnboardingDue={setOnboardingDue} assignOnboarding={assignOnboarding} toggleSkip={toggleOnbSkip} team={teamNames} setClientPhase={setClientPhase} addCustomPhase={addCustomPhase} removeCustomPhase={removeCustomPhase}/>:
          view==='invoices'?<Invoices invoices={invoices} leads={bizLeads} settings={settings} onNew={newInvoice} open={id=>setInvId(id)}/>:
          
          view==='meetings'?<MeetingsPage leads={scoped} setMeetingStatus={setMeetingStatus} setMeetingTime={setMeetingTime} tagMeetingType={tagMeetingType} removeMeeting={removeMeeting} open={openLead} settings={settings} rep={rep} myUser={repUser||myUser} myUid={myUid}/>:
          view==='playbook'?<Playbook notes={kbNotes} pub={kbPub} mlogs={mlogs} rep={rep} me={me}
            saveNote={saveKbNote} deleteNote={delKbNote} previewNote={db.kbPreview} publishNote={kbPublishNote} unpublishNote={kbUnpublishNote}/>:
          view==='mlog'?<MeetingLog logs={mlogs} tasks={tasks} leads={scoped} saveLog={saveMlog} deleteLog={delMlog} saveTasks={saveTasks} publishToLead={publishLogToLead} me={me}/>:
          view==='sponsors'?<SponsorsPage leads={scoped} events={events} open={openLead} goEvents={()=>setPage('events')}/>:
          view==='events'?<EventsPage events={events} saveEvent={saveEvent} removeEvent={removeEvent} leads={scoped} quickLead={quickLead} open={openLead} me={me}/>:
          view==='money'?<MoneyPage txns={txns} upsertTxn={upsertTxn} deleteTxn={deleteTxn} leads={scoped} openLead={openLead} settings={settings} saveSettings={saveSettings} stages={stages} users={users} payouts={payouts} />:
          <SettingsPage settings={settings} saveSettings={saveSettings} leads={leads} saveLeads={saveLeads} invoices={invoices} saveInvoices={saveInvoices} gcal={gcal} onDisconnectGcal={disconnectGcal} refreshGcal={refreshGcal}
            isOwner={isOwner} users={users} me={me} myUid={myUid} saveUser={saveUser} removeUser={removeUser} claimOwner={claimOwner} reassignLeads={reassignLeads} noUsers={noUsers} pockets={pockets} refreshPockets={pocketRefresh} updateLead={updateLead} payouts={payouts} addPayout={addPayout}/>}
      </div>
    </div>
    {acct&&<AccountModal name={me} email={auth.email(session)} role={isOwner?'owner':'rep'} onClose={()=>setAcct(false)}/>}
    {celebrate&&<Celebration data={celebrate} onDone={()=>setCelebrate(null)}/>}
    {pocketId&&(()=>{ const rec=pockets.find(r=>r.id===pocketId); if(!rec) return null;
      return <div className="m-back" onClick={e=>{ if(e.target===e.currentTarget) setPocketId(null); }}>
        <div className="m-wrap" style={{maxWidth:900}}><div className="m-body" style={{padding:22}}>
          <Pocket rec={rec} leads={leads} mlogs={mlogs} kbNotes={kbNotes} me={me}
            onClose={()=>setPocketId(null)} loadRecording={db.getPocketRecording}
            saveLog={saveMlog} saveKbNote={saveKbNote} setStatus={pocketStatus}
            deleteRecording={pocketDelete} saveProposals={db.savePocketProposals}/>
        </div></div></div>; })()}
    {(active||activeId==='new')&&<Modal key={activeId} lead={active} isNew={activeId==='new'} settings={settings} stages={stages} addOption={addOption} me={me} myUid={myUid} allLeads={leads} rep={rep} events={events} mlogs={mlogs} goEvents={()=>setPage('events')} isOwner={isOwner} setCommission={setCommission} users={users} teamRoster={team} navList={(navIds&&navIds.length?navIds:leads.map(l=>l.id))} onNav={id=>setActiveId(id)} convertToClient={convertToClient} revertClient={revertClient} fixCloseTracking={fixCloseTracking} toggleMilestone={toggleMilestone} setMilestoneDue={setMilestoneDue} onClose={()=>setActiveId(null)} updateLead={updateLead} addActivity={addActivity} delActivity={delActivity} delLead={delLead} createNew={createNew} gcalConnected={gcal.connected} gcalEmail={gcal.email} createCalendarEvent={createCalendarEvent} deleteCalendarEvent={deleteCalendarEvent} tagMeeting={tagMeeting}/>}
    {invId&&(()=>{const inv=invoices.find(x=>x.id===invId);return inv?<InvoiceModal key={invId} invoice={inv} leads={leads} settings={settings} saveSettings={saveSettings} onSave={upsertInvoice} onDelete={deleteInvoice} onPaid={applyInvoicePayment} onClose={()=>setInvId(null)}/>:null;})()}
  </div></>);
}

/* ===================== metrics ===================== */
function useMetrics(leads,stages,settings,txns){
  return useMemo(()=>{
    const ratioEx=ratioExcludeOf(settings);
    const byStage={}; stages.forEach(s=>byStage[s.key]={count:0,value:0});
    let openCount=0,openValue=0,weighted=0,wonCount=0,wonValue=0,wonValued=0,wonDealCount=0,wonPending=0,lostCount=0,mrr=0,retainers=0,quotedMrr=0,quotedCount=0,upsellCount=0,upsellValue=0;
    /* An upsell to somebody you've already delivered for is at least as likely to
       land as a proposal sitting with a new lead, so it's weighted at the best
       probability on the open stages rather than at an invented number. */
    const upsellProb=Math.max(0,...(stages||[]).filter(x=>x.open).map(x=>num(x.prob)));
    leads.forEach(l=>{const s=sOf(l.stage,stages);byStage[l.stage]=byStage[l.stage]||{count:0,value:0};byStage[l.stage].count++;byStage[l.stage].value+=num(l.dealValue);
      if(s.open){openCount++;openValue+=num(l.dealValue);weighted+=num(l.dealValue)*num(s.prob);}
      /* A won lead's UNSTAMPED deals are the sale that won it — still won revenue.
         Its upsell deals are money on the table and belong in pipeline, which is
         the whole bug: typing an amount on a client used to book it as revenue. */
      /* wonCount only counts deals whose money is confirmed, because wonValue
         does too and avgDeal divides one by the other. Counting the deal but not
         its value made average deal size DROP every time you converted somebody
         who hadn't paid yet. wonPending tracks the rest so nothing is hidden. */
      if(s.won){ if(cashConfirmed(l)){ wonCount++; const v=openSaleValue(l); wonValue+=v;
          /* A retainer-only client has no setup deal, so a $0 setup is not a
             data point about deal SIZE — averaging it in drags the number
             toward zero and misreports what a setup sale is actually worth.
             They still count as a win and their retainer still counts in MRR. */
          /* Both counters, because wonValue takes BOTH parts: this lead's setup
             sale here, and its archived closed deals below. Counting only one
             side is the same population mismatch this fix exists to remove. */
          if(v>0){ wonValued++; wonDealCount++; } }
        else wonPending++;
        const uv=upsellValueOf(l);
        if(uv>0){ upsellCount++; upsellValue+=uv; weighted+=uv*upsellProb; } }
      if(s.lost) lostCount++;
      /* AUDIT #4. This accumulator is OUTSIDE the won branch on purpose — a
         churned client's past deals are still money that was won, and zeroing
         them would move historical revenue (ENGINEERING §4, "nothing historical
         moves"). What WAS wrong is that avgDeal divided this total by a count of
         LEADS, so a repeat client with three closed deals added three deals to
         the numerator and at most one to the divisor, and average deal size read
         high — worse the more repeat business you did. Count the deals that make
         up this total, and divide by that. */
      wonValue+=closedDealsTotal(l);
      wonDealCount+=((l.closedDeals||[]).filter(d=>num(d.amount)>0).length);
      /* AUDIT #26. Only a retainer that is actually BILLING is MRR. A quoted
         rate is a price you intend to charge, counted beside it, never inside. */
      if(billsMrr(l)){mrr+=num(l.retainer);retainers++;}
      else if(quotedRate(l)>0){quotedMrr+=num(l.retainer);quotedCount++;}});
    const pipelineValue=openValue+upsellValue;
    /* same rule as the follow-up page: a nurtured lead's revisit date is the
       only thing that brings them back, so it has to count as overdue */
    const dueOK=l=>{ const st=sOf(l.stage,stages); return st.open||st.nurture; };
    const overdue=leads.filter(l=>l.followUp&&daysUntil(l.followUp)<0&&dueOK(l));
    const dueWeek=leads.filter(l=>{const d=l.followUp?daysUntil(l.followUp):null;return d!==null&&d>=0&&d<=7&&dueOK(l);});
    const hot=leads.filter(l=>l.priority==='high'&&sOf(l.stage,stages).open);
    /* win rate is about SELLING, so a won deal counts the moment it's won
       whether or not the money has landed. Revenue is the cash question.
       Declared here, above its only use — `const` does not hoist, and putting
       it below winRate crashed at render while still building cleanly. */
    const wonForRate=wonCount+wonPending;
    const winRate=(wonForRate+lostCount)>0?wonForRate/(wonForRate+lostCount):0;
    /* Numerator and denominator are now the same population: every deal whose
       money is in wonValue. wonValued (won leads with a non-zero setup) is kept
       because it is what excludes retainer-only clients from counting as a deal
       at all — that part was already right. */
    const avgDeal=wonDealCount>0?wonValue/wonDealCount:0; const avgRet=retainers>0?mrr/retainers:0;
    /* meetings — ONE unified source. Every meeting (scheduled or logged) counts
       once, and held/no-show is read from the same record everywhere. */
    const mKey=todayISO().slice(0,7); const nowMs=Date.now();
    let bookedAll=0,bookedMonth=0,mtgUpcoming=0,heldMonth=0,noShowMonth=0,heldAll=0,noShowAll=0,needsStatusCount=0,needsDateCount=0,onboardedMonth=0,depositsMonth=0,onbNeeded=0,onbMonthlyOnly=0;
    const bookedByType={};
    leads.forEach(l=>{
      meetingsOf(l).forEach(mt=>{ bookedAll++;
        const mk=meetingMonthKey(mt);            // when it happens
        const bk=bookingMonthKey(mt);            // when it was booked
        if(bk===mKey){ bookedMonth++; const t=mt.mtype||'Other'; bookedByType[t]=(bookedByType[t]||0)+1; }
        if(isUpcoming(mt)) mtgUpcoming++;
        if(needsStatus(mt)) needsStatusCount++;
        if(needsDate(mt)) needsDateCount++;
        if(mt.status==='held'){ heldAll++; if(mk===mKey) heldMonth++; }
        else if(mt.status==='noshow'){ noShowAll++; if(mk===mKey) noShowMonth++; }
      });
      /* Both numbers describe the SAME clients — the ones onboarded this month.
         depositsMonth used to scan every lead in the CRM, so a client converted
         in July whose deposit landed in August was counted here but absent from
         the list below it: the tile said "2 deposits" over a list showing one.
         onbNeeded counts only clients a deposit is actually expected from. */
      if(l.isClient&&l.convertedAt&&String(l.convertedAt).slice(0,7)===mKey){ onboardedMonth++;
        if(!onbSkipped(l,'deposit_paid')){ onbNeeded++;
          if(depositPaidAt(l)) depositsMonth++; }
        else onbMonthlyOnly++; }
    });
    /* speed to first touch + follow-up discipline */
    const touchHrs=[]; let untouched=0,fuCleared=0,fuOnTime=0;
    leads.forEach(l=>{ const h=firstTouchHrs(l);
      if(h==null){ if(!(l.activities||[]).some(REAL_TOUCH)) untouched++; } else touchHrs.push(h);
      (l.activities||[]).forEach(a=>{ if(a&&a.fuOnTime!==undefined&&a.ts&&isoOf(new Date(a.ts)).slice(0,7)===mKey){ fuCleared++; if(a.fuOnTime) fuOnTime++; } }); });
    /* monthly close figures — the all-time wonCount can't drive a monthly goal */
    /* a won lead only counts once the money is confirmed — see cashConfirmed */
    let awaitingCash=0,awaitingValue=0,awaitingLog=0,awaitingLogValue=0;
    /* A lead that BOTH reached a won stage this month AND has a deal archived
       into closedDeals this month used to fire both branches and count twice —
       which is why the tile said 3 over a list of 2. The drilldown dedupes by
       lead, so the two never agreed. One lead closing is one close, however its
       money is recorded. Only a SECOND closed deal on the same lead adds again,
       because that genuinely is another close.

       AUDIT #8. That fixed the COUNT, and left three answers to one question:
       the tile showed a count, its subtitle showed cash collected, and the
       drilldown header showed the value of what closed. A deal closed this
       month and paid next month was in one and not the others. The drilldown
       also dropped any row worth $0, so a free close made the tile read 3 over
       a list of 2 — the same symptom, a different cause.

       So this is ONE ARRAY now and everything reads it: closedMonth is its
       closes, closedMonthValue is its value, and the drilldown renders its
       rows. They cannot disagree because there is nothing left to disagree
       with. ENGINEERING §2 — make them share one function. */
    const closedRows=[];
    leads.forEach(l=>{ const cmCount=closedDealsCountInMonth(l,mKey);
      const wonHere=sOf(l.stage,stages).won&&l.closedAt&&String(l.closedAt).slice(0,7)===mKey;
      const confirmed=cashConfirmed(l);
      if(wonHere&&!confirmed){ awaitingCash++; awaitingValue+=num(l.dealValue); }
      if(cmCount>0) closedRows.push({id:l.id,closes:cmCount,value:closedDealsInMonth(l,mKey)});
      else if(wonHere&&confirmed) closedRows.push({id:l.id,closes:1,value:num(l.dealValue)});
    });
    const closedMonth=closedRows.reduce((a,r)=>a+r.closes,0);
    const closedMonthValue=closedRows.reduce((a,r)=>a+r.value,0);

    /* Revenue = money that actually arrived this month, from the payment dates.
       LEGACY FALLBACK: a lead closed this month with cash confirmed but NO
       payments logged still counts at its close date — otherwise every deal
       recorded before payments were tracked would silently vanish from your
       history. Once you log a payment on a lead, its payments take over. */
    let clientRevenueMonth=0,collectedMonth=0,legacyMonth=0,outstanding=0;
    leads.forEach(l=>{
      const pays=paidInMonth(l,mKey);
      if(pays>0){ collectedMonth+=pays; clientRevenueMonth+=pays; }
      /* AUDIT #22. preDatesPayments is the new half of this condition. Without
         it the fallback fired on brand-new closes and reported money that had
         not arrived — Poppell closed on the 17th with no payment logged and
         appeared under "Collected this month". */
      if(!anyPayments(l).length&&preDatesPayments(l)){
        const closedHere=sOf(l.stage,stages).won&&l.closedAt&&String(l.closedAt).slice(0,7)===mKey&&cashConfirmed(l);
        const legacy=(closedHere?num(l.dealValue):0)+closedDealsInMonth(l,mKey);
        if(legacy>0){ legacyMonth+=legacy; clientRevenueMonth+=legacy; }
      }
      /* Closed since payment tracking began, deposit ticked, no payment row —
         it is not collected and it IS owed. Counted so the screen can say so
         instead of the money simply disappearing from both sides. */
      else if(!anyPayments(l).length&&sOf(l.stage,stages).won&&l.closedAt&&String(l.closedAt).slice(0,7)===mKey){
        awaitingLog++; awaitingLogValue+=num(l.dealValue)+closedDealsInMonth(l,mKey);
      }
      outstanding+=owedBy(l,stages);
    });
    /* AUDIT #1. The dashboard read payments-plus-legacy; the Money page summed
       every 'in' transaction. Same label, two numbers, in both directions —
       Money was higher by any hand-entered income and lower by every deal that
       predates payment tracking.
       ONE number now, from one place, with both sources kept apart so the split
       stays visible: money that came from client work, and money that did not.
       OWNER CONTRIBUTIONS ARE NOT REVENUE and are excluded — putting your own
       money into the business is not the business earning it — but they are
       returned separately rather than hidden, because they are still cash that
       arrived and the Money page's net has to account for them. */
    let otherIncomeMonth=0,contribMonth=0;
    (txns||[]).forEach(t=>{
      if(!t||String(t.date||'').slice(0,7)!==mKey) return;
      if(t.type==='income') otherIncomeMonth+=num(t.amount);
      else if(t.type==='contribution') contribMonth+=num(t.amount);
    });
    const revenueMonth=clientRevenueMonth+otherIncomeMonth;
    const firstTouch=median(touchHrs);
    const fuRate=fuCleared>0?fuOnTime/fuCleared:null;
    const funnel=funnelOf(leads,stages);

    /* ---------- higher-order sales analytics ---------- */
    // booked -> held: of meetings that already happened, how many actually did
    const decidedAll=heldAll+noShowAll;
    const showRate=decidedAll>0?heldAll/decidedAll:0;              // held / (held+noshow), all time
    const noShowRate=decidedAll>0?noShowAll/decidedAll:0;
    /* meeting -> close: of leads we ever held a QUALIFYING meeting with, how many
       converted. Qualifying excludes the relationship types (Coffee by default) —
       see countsToRatio. A lead whose only held meeting was coffee is not counted
       on either side of the ratio, so it neither helps nor hurts. */
    let metLeads=0,metAndClosed=0,metNoSalesMtg=0,metAfterCloseOnly=0;
    leads.forEach(l=>{ const held=meetingsOf(l).filter(m=>m.status==='held');
      if(!held.length) return;
      const rightType=held.filter(m=>countsToRatio(m,ratioEx));
      /* held meetings, but none of a counted type: coffee-only leads still at the
         relationship stage, and clients whose only logged meeting was an
         onboarding. Neither belongs on either side of a conversion ratio. */
      if(!rightType.length){ metNoSalesMtg++; return; }
      const qualifying=rightType.filter(m=>heldBeforeClose(m,l));
      if(!qualifying.length){ metAfterCloseOnly++; return; }      // every one came after they signed
      metLeads++;
      if(l.isClient||sOf(l.stage,stages).won) metAndClosed++; });
    const meetCloseRate=metLeads>0?metAndClosed/metLeads:0;
    // average days from lead created -> converted (sales-cycle length)
    const cycleDays=[]; leads.forEach(l=>{ if((l.isClient&&l.convertedAt)||sOf(l.stage,stages).won){
      const end=l.convertedAt||l.closedAt; if(l.createdAt&&end){ const d=(new Date(end)-new Date(l.createdAt))/864e5; if(!isNaN(d)&&d>=0) cycleDays.push(d); } } });
    const avgDaysToClose=cycleDays.length?Math.round(median(cycleDays)):null;
    // pipeline velocity: open deals moving vs rotting (no touch in 14d)
    const openLeadsArr=leads.filter(l=>sOf(l.stage,stages).open);
    const rotting=openLeadsArr.filter(l=>daysSince(lastTouchTs(l)||l.createdAt||todayISO())>=14).length;
    const movingPct=openLeadsArr.length?1-(rotting/openLeadsArr.length):1;
    // source ROI: which lead source actually closes
    const bySource={}; leads.forEach(l=>{ const src=l.source||'—'; bySource[src]=bySource[src]||{total:0,won:0,value:0};
      bySource[src].total++; if(l.isClient||sOf(l.stage,stages).won){ bySource[src].won++; bySource[src].value+=num(l.dealValue); } });
    const sourceROI=Object.entries(bySource).map(([source,v])=>({source,...v,rate:v.total?v.won/v.total:0}))
      .sort((a,b)=>b.won-a.won||b.total-a.total);

    /* revenue by client — lifetime booked value per client, biggest first.
       Counts archived closed deals + any current won dealValue, plus flags MRR. */
    /* Same cash rule as the dashboard. Without it this table showed a client's
       full lifetime value while Revenue Closed excluded them — two screens, two
       answers, and no way to tell which was right. */
    const byClient=leads.filter(l=>l.isClient||sOf(l.stage,stages).won||closedDealsTotal(l)>0).map(l=>{
      const closed=closedDealsTotal(l);
      const current=((sOf(l.stage,stages).won||l.isClient)&&cashConfirmed(l))?num(l.dealValue):0;
      const pending=((sOf(l.stage,stages).won||l.isClient)&&!cashConfirmed(l))?num(l.dealValue):0;
      const lifetime=closed+current;
      /* AUDIT #3. `lifetime` is BOOKED value and always was — payments are not
         read for it. Every other revenue figure in this product is cash-basis
         (ENGINEERING §4), so a table headed "Revenue by client" showing booked
         value was answering a different question to the one next to it. Rather
         than change what `lifetime` means — which would move historical numbers
         — the cash is now carried alongside it and the heading says which is
         which. paid comes from the payment rows; owed is owedBy(), the same
         function the Money page and the client card use. */
      return {id:l.id,name:l.name||l.company||'—',company:l.company,lifetime,closed,current,pending,
        paid:allPaid(l),owed:owedBy(l,stages),
        mrr:billsMrr(l)?num(l.retainer):0,deals:((l.closedDeals||[]).length)+((sOf(l.stage,stages).won||l.isClient)&&num(l.dealValue)>0?1:0)};
    }).filter(c=>c.lifetime>0||c.mrr>0||c.pending>0).sort((a,b)=>b.lifetime-a.lifetime);
    return {byStage,openCount,openValue,upsellCount,upsellValue,pipelineValue,weighted,wonCount,wonValue,lostCount,mrr,retainers,overdue,dueWeek,hot,winRate,avgDeal,avgRet,byClient,
      bookedAll,bookedMonth,mtgUpcoming,heldMonth,noShowMonth,heldAll,noShowAll,needsStatusCount,needsDateCount,showRate,noShowRate,bookedByType,onboardedMonth,depositsMonth,onbNeeded,onbMonthlyOnly,
      firstTouch,untouched,touchHrs,fuCleared,fuOnTime,fuRate,funnel,quotedMrr,quotedCount,closedMonth,closedMonthValue,closedRows,awaitingLog,awaitingLogValue,revenueMonth,clientRevenueMonth,otherIncomeMonth,contribMonth,collectedMonth,legacyMonth,outstanding,awaitingCash,awaitingValue,
      meetCloseRate,metLeads,metAndClosed,metNoSalesMtg,metAfterCloseOnly,ratioEx,wonPending,wonForRate,wonValued,wonDealCount,avgDaysToClose,movingPct,rotting,sourceROI};
  },[leads,stages,settings,txns]);
}

/* ===================== DASHBOARD ===================== */
/* ===================== FOLLOW-UP ===================== */
function FollowUp({leads,stages,open,updateLead,me,settings,addActivity,rep,myPools}){
  const [leaving,setLeaving]=useState({});
  const [cleared,setCleared]=useState(0);
  const t=todayISO();
  const canAll=!rep&&teamAccess(settings,me)==='all';
  const [view,setView]=useState('mine');
  useEffect(()=>{ if(!canAll&&view==='all') setView('mine'); },[canAll,view]);
  const isDue=l=>l.followUp&&daysUntil(l.followUp)<=0;
  const counts={mine:leads.filter(l=>isDue(l)&&l.owner===me).length,pool:leads.filter(l=>isDue(l)&&isPoolLead(l,rep?myPools:null)).length,all:leads.filter(isDue).length};
  const due=scopeLeads(leads,view,me,rep?myPools:null).filter(isDue).sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||''));
  const ids=due.map(l=>l.id);
  const overdue=due.filter(l=>daysUntil(l.followUp)<0);
  const today=due.filter(l=>daysUntil(l.followUp)===0);
  const remaining=due.length;
  const total=remaining+cleared;
  const pct=total?Math.round(cleared/total*100):0;
  /* FUB-style: the note lives with the date. Clearing a follow-up auto-logs the
     old note to the activity feed, then asks for the next date + next note. */
  const [pending,setPending]=useState(null); // {id,date,note}
  const startNext=(l,date)=>{ if(leaving[l.id]||!date)return; setPending({id:l.id,date,note:''}); };
  const confirmNext=l=>{
    const p=pending; if(!p||p.id!==l.id)return;
    const old=(l.nextSteps||'').trim();
    const onTime=l.followUp?daysUntil(l.followUp)>=0:true;
    if(addActivity) addActivity(l.id,'Note',old?`Follow-up done — ${old}`:'Follow-up cleared.',me,{fuOnTime:onTime});
    setPending(null);
    setLeaving(s=>({...s,[l.id]:true})); setCleared(c=>c+1);
    setTimeout(()=>updateLead(l.id,{followUp:p.date,nextSteps:p.note.trim()}),430);
  };
  const QUICK=[['Tomorrow',1],['+3 days',3],['Next week',7],['+2 weeks',14]];
  const Card=({l})=>{ const d=daysUntil(l.followUp); const od=d<0; const lv=!!leaving[l.id];
    const lastTouch=(l.activities||[]).find(a=>a.type&&a.type!=='Note');
    const pend=pending&&pending.id===l.id?pending:null;
    return (<div key={l.id} className={'fu-card'+(od?' od':'')+(lv?' leaving':'')} onClick={()=>!lv&&!pend&&open(l.id,ids)}>
      <div className="fu-top">
        <div style={{minWidth:0}}><div className="fu-name">{l.name||'(no name)'}</div><div className="subcell">{l.company||l.businessType||'—'}</div></div>
        <span className={'badge '+(od?'inv-overdue':'inv-sent')}>{od?Math.abs(d)+'d overdue':'Due today'}</span>
      </div>
      {view!=='mine'&&<div className="fu-owner">{isPoolLead(l,rep?myPools:null)?<button className="claim-btn" onClick={e=>{e.stopPropagation();updateLead(l.id,{owner:me});}}><UserCheck size={13}/>Claim</button>:<span className="own-badge">{l.owner||'—'}</span>}</div>}
      {l.nextSteps?<div className="fu-plan"><StickyNote size={13}/><span>{l.nextSteps}</span></div>:null}
      <div className="fu-meta">{l.nextAction||'Follow up'}{lastTouch?' · last touch '+fmtDate(lastTouch.ts):''}</div>
      <div className="fu-act" onClick={e=>e.stopPropagation()}>
        {pend?(<div className="fu-next">
          <div className="fu-next-h"><CheckCircle2 size={13} color={GREEN}/>Next follow-up <b>{fmtDate(pend.date)}</b></div>
          <textarea className="fu-note" rows={2} autoFocus placeholder="What's the plan for next time? (optional)" value={pend.note} onChange={e=>setPending({...pend,note:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))confirmNext(l);}}/>
          <div className="fu-next-b">
            <button className="btn btn-p btn-sm" onClick={()=>confirmNext(l)}><CheckCircle2 size={14}/>Save &amp; clear</button>
            <button className="btn btn-g btn-sm" onClick={()=>setPending(null)}>Cancel</button>
            {(l.nextSteps||'').trim()&&<span className="fu-next-note">Old note gets logged to activity</span>}
          </div>
        </div>):(<>
          <div className="fu-quick">
            {l.phone&&<a className="fu-ic" href={'tel:'+l.phone} title="Call"><Phone size={15}/></a>}
            {l.phone&&<a className="fu-ic" href={'sms:'+l.phone} title="Text"><MessageSquare size={15}/></a>}
            {l.email&&<a className="fu-ic" href={'mailto:'+l.email} title="Email"><Mail size={15}/></a>}
            {!l.phone&&!l.email&&<span className="subcell" style={{fontSize:11}}>no contact info</span>}
          </div>
          <div className="fu-chips">
            {QUICK.map(([lbl,n])=><button key={lbl} className="fu-chip" onClick={()=>startNext(l,addDays(t,n))}>{lbl}</button>)}
            <label className="fu-chip fu-date" title="Pick a date"><CalendarClock size={13}/><input type="date" min={t} onClick={e=>e.stopPropagation()} onChange={e=>startNext(l,e.target.value)}/></label>
          </div>
        </>)}
      </div>
    </div>);
  };
  const Scope=()=>(<div className="fu-scope"><ScopeSeg view={view} setView={setView} counts={counts} canAll={canAll}/></div>);
  if(!due.length){ return (<><Scope/><div className="fu-done">
    <div className="fu-done-burst"><Sparkles size={20} className="s1"/><Sparkles size={14} className="s2"/><Sparkles size={16} className="s3"/><div className="fu-done-ring"><CheckCircle2 size={54} color={GREEN}/></div></div>
    <h2>{cleared>0?'Inbox zero. Nice work.':view==='mine'?'You\u2019re all caught up':view==='pool'?'Nothing waiting in the pool':'All caught up'}</h2>
    <p>{cleared>0?`You cleared ${cleared} follow-up${cleared>1?'s':''} today — every lead's been handled.`:view==='mine'?(counts.pool>0?`Nothing of yours is due. There ${counts.pool===1?'is':'are'} ${counts.pool} unclaimed follow-up${counts.pool>1?'s':''} in the pool.`:(counts.all>0&&canAll?'Nothing of yours is due — switch to All to see the team\u2019s.':'Nothing is due or overdue right now.')):'Nothing is due or overdue right now. Set follow-up dates on your leads and they\u2019ll show up here the day they\u2019re due.'}</p>
  </div></>); }
  return (<>
    <Scope/>
    <div className="fu-hero">
      <div className="fu-hero-l"><div className="fu-hero-n">{remaining}</div><div className="fu-hero-lbl">lead{remaining>1?'s':''} to clear</div></div>
      <div className="fu-hero-stats">
        {overdue.length>0&&<span className="fu-stat od"><AlertTriangle size={13}/><b>{overdue.length}</b> overdue</span>}
        {today.length>0&&<span className="fu-stat"><CalendarClock size={13}/><b>{today.length}</b> due today</span>}
        {cleared>0&&<span className="fu-stat done"><CheckCircle2 size={13}/><b>{cleared}</b> cleared</span>}
      </div>
      <div className="fu-ring" style={{'--p':pct}}><span>{pct}%</span></div>
    </div>
    {overdue.length>0&&<><div className="fu-band od"><AlertTriangle size={14}/>Overdue · {overdue.length}</div><div className="fu-grid">{overdue.map(l=>Card({l}))}</div></>}
    {today.length>0&&<><div className="fu-band"><CalendarClock size={14}/>Due Today · {today.length}</div><div className="fu-grid">{today.map(l=>Card({l}))}</div></>}
  </>);
}

/* One Dashboard, two audiences. Owners get everything they had before; a rep
   gets their own world — no company pipeline, no MRR, no owner numbers. Every
   hook is declared before the role branch so the hook order never changes. */
function Dashboard({leads,stages,open,tagBooked,setMeetingStatus,setMeetingTime,tagMeetingType,rels,settings,saveSettings,events,goEvents,rep,me,myUser,myUid,board,ack,goBoard,team,approve,pockets,openPocket,txns,payouts}){
  const G=goalsOf(settings);
  const m=useMetrics(leads,stages,settings,txns);
  const [drill,setDrill]=useState(null);
  const [scope,setScope]=useState('month');   // time filter across meeting tabs
  /* Defaults to today every load on purpose: the question this answers is
     "what came in today", and a range that silently persisted from last week
     would answer a different one without saying so. */
  const [addedRange,setAddedRange]=useState('today');
  const [mtab,setMtab]=useState('upcoming'); // upcoming | completed | noshow | needs
  const [arrange,setArrange]=useState(false);   // dashboard layout edit mode
  const [dragSec,setDragSec]=useState(null);
  const tog=k=>{ setDrill(d=>d===k?null:k); };
  const mKey=todayISO().slice(0,7);

  if(rep){
    const mine=myCommissions(leads,myUid);
    const conv=leads.filter(l=>l.isClient&&l.convertedAt);
    const convMonth=conv.filter(l=>String(l.convertedAt).slice(0,7)===mKey);
    const worked=leads.filter(l=>(l.activities||[]).some(a=>REAL_TOUCH(a)&&isoOf(new Date(a.ts)).slice(0,7)===mKey)).length;
    const goal=num(myUser&&myUser.goal_conversions);
    const ranked=[...(board||[])].sort((a,b)=>(b.month-a.month)||String(a.name||'').localeCompare(String(b.name||'')));
    const myRank=ranked.findIndex(r=>r.id===myUid)+1;
    const ahead=myRank>1?ranked[myRank-2]:null;
    const openMine=leads.filter(l=>sOf(l.stage,stages).open);
    const fu=[...m.overdue,...m.dueWeek].sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||'')).slice(0,8);
    /* REP-AUDIT #6. A rep's dashboard was five zeros and two empty states with
       NO next action anywhere — one open lead, and the page neither mentioned
       nor linked to it. The owner has "Your day" doing exactly this job; reps
       did not get it. Same shape, their scope: what is overdue, what is stale,
       what is on today. */
    const today=isoOf(new Date());
    const overdue=m.overdue.slice().sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||''));
    const untouched=openMine.filter(l=>!(l.activities||[]).some(REAL_TOUCH))
      .sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
    const stale=openMine.filter(l=>!untouched.includes(l)&&daysSince(lastTouchTs(l)||l.createdAt||today)>=7)
      .sort((a,b)=>daysSince(lastTouchTs(b)||b.createdAt||today)-daysSince(lastTouchTs(a)||a.createdAt||today));
    const todayMtgs=allMeetings(leads).filter(r=>!r.m.status&&!needsDate(r.m)
      &&String(r.m.start||'').slice(0,10)===today)
      .sort((a,b)=>(a.m.start||'').localeCompare(b.m.start||''));
    const dayTotal=overdue.length+untouched.length+stale.length+todayMtgs.length;

    return (<>
      <div className="kgroup" style={{marginTop:4}}>Your day
        {dayTotal>0&&<span className="td-n">{dayTotal} thing{dayTotal===1?'':'s'}</span>}</div>
      {dayTotal===0
        ? <div className="card today-clear"><CheckCircle2 size={16} color={GREEN}/>
            Nothing waiting on you. No follow-ups overdue, nothing untouched, no meetings today.</div>
        : <div className="card today">
            {todayMtgs.length>0&&<div className="td-grp">
              <div className="td-h"><CalendarClock size={13}/>Meetings today · {todayMtgs.length}</div>
              {todayMtgs.slice(0,6).map(({lead,m:mt})=>(<div className="td-row" key={mt.id}>
                <button className="td-name" onClick={()=>open(lead.id)}>{lead.name||lead.company}</button>
                <span className="td-txt">{mt.title||mt.mtype}</span>
                <span className="td-who">{fmtMeetingTime(mt.start).replace(/^.*?,\s*/,'')}</span>
              </div>))}
            </div>}
            {overdue.length>0&&<div className="td-grp">
              <div className="td-h"><Bell size={13}/>Follow-ups overdue · {overdue.length}</div>
              {overdue.slice(0,6).map(l=>(<div className="td-row" key={l.id}>
                <button className="td-name" onClick={()=>open(l.id)}>{l.name||l.company}</button>
                <span className="td-txt">{l.nextSteps||l.nextAction||'Follow up'}</span>
                <span className="td-who late">{-daysUntil(l.followUp)}d overdue</span>
              </div>))}
              {overdue.length>6&&<div className="subcell">+ {overdue.length-6} more</div>}
            </div>}
            {untouched.length>0&&<div className="td-grp">
              <div className="td-h"><Zap size={13}/>Never contacted · {untouched.length}</div>
              {untouched.slice(0,6).map(l=>(<div className="td-row" key={l.id}>
                <button className="td-name" onClick={()=>open(l.id)}>{l.name||l.company}</button>
                <span className="td-txt">{l.company||l.source||'new lead'}</span>
                <span className="td-who late">{daysSince(l.createdAt)}d old</span>
              </div>))}
              {untouched.length>6&&<div className="subcell">+ {untouched.length-6} more</div>}
            </div>}
            {stale.length>0&&<div className="td-grp">
              <div className="td-h"><Clock size={13}/>Gone quiet · {stale.length}</div>
              {stale.slice(0,6).map(l=>(<div className="td-row" key={l.id}>
                <button className="td-name" onClick={()=>open(l.id)}>{l.name||l.company}</button>
                <span className="td-txt">{sOf(l.stage,stages).label}</span>
                <span className="td-who">{daysSince(lastTouchTs(l)||l.createdAt)}d since a touch</span>
              </div>))}
              {stale.length>6&&<div className="subcell">+ {stale.length-6} more</div>}
            </div>}
          </div>}

      {/* REP PAY. The block a rep sees follows THEIR model. A rep on NEITHER
          sees nothing at all — an honest blank for somebody not yet on a pay
          model, rather than a row of zeros implying they are. */}
      {payModels(myUser||{}).appointment&&(()=>{
        const rate=num((myUser||{}).appointment_rate);
        const appt=apptEarnings(leads,myUid,rate);
        const paidSoFar=(payouts||[]).filter(p=>String(p.rep_id)===String(myUid)).reduce((a,p)=>a+num(p.amount),0);
        return (<>
          <div className="kgroup">Your appointments</div>
          <div className="cmsn-hero">
            <div className="cmsn-main">
              <div className="cmsn-l">Awaiting approval</div>
              <div className="cmsn-v"><CountUp value={appt.pendingTotal} format={v=>usd(v)}/></div>
              <div className="cmsn-d">{appt.pending.length} meeting{appt.pending.length===1?'':'s'} you marked held</div>
            </div>
            <div className="cmsn-main earned">
              <div className="cmsn-l">Approved</div>
              <div className="cmsn-v"><CountUp value={appt.approvedTotal} format={v=>usd(v)}/></div>
              <div className="cmsn-d">{paidSoFar>0?`${usd(paidSoFar)} paid out so far`:'approved — this is real money'}</div>
            </div>
          </div>
          <div className="subcell" style={{margin:'-6px 0 16px'}}>
            {usd(rate)} per meeting, paid once it is marked <b>held</b>. Cancelled and no-shows pay nothing.
          </div>
        </>); })()}

      {payModels(myUser||{}).commission&&<>
      <div className="kgroup">Your commission</div>
      <div className="cmsn-hero">
        <div className="cmsn-main">
          <div className="cmsn-l">Pending</div>
          <div className="cmsn-v"><CountUp value={mine.pending} format={v=>usd(v)}/></div>
          <div className="cmsn-d">{mine.rows.filter(r=>r.c.status==='pending').length} client{mine.rows.filter(r=>r.c.status==='pending').length===1?'':'s'} awaiting owner approval</div>
        </div>
        <div className="cmsn-main earned">
          <div className="cmsn-l">Earned</div>
          <div className="cmsn-v"><CountUp value={mine.earned} format={v=>usd(v)}/></div>
          <div className="cmsn-d">approved — this is real money</div>
        </div>
      </div></>}

      {payModels(myUser||{}).none&&<div className="card" style={{marginBottom:18}}>
        <div className="ch-sub">You are not on a pay model yet. Your owner sets a per-appointment
          rate or a commission percentage in <b>Settings → Team</b>, and your earnings appear here
          the moment they do.</div>
      </div>}

      <div className="kgroup">This month at a glance</div>
      <div className="kgrid">
        <Kpi variant="green" label="Clients Converted" value={<CountUp value={convMonth.length}/>} icon={<UserCheck size={14}/>} d={`${conv.length} all time`} goal={goal} current={convMonth.length}/>
        <Kpi label="Meetings Booked" value={<CountUp value={m.bookedMonth}/>} icon={<CalendarCheck size={14}/>} d={`${m.mtgUpcoming} upcoming`}/>
        <Kpi label="Leads Worked" value={<CountUp value={worked}/>} icon={<Zap size={14}/>} d={`touched this month · ${openMine.length} open`}/>
        <Kpi label="Follow-Ups Due" value={m.overdue.length+m.dueWeek.length} icon={<Bell size={14}/>} d={m.overdue.length?`${m.overdue.length} overdue`:'nothing overdue'} onClick={()=>tog('fu')} active={drill==='fu'}/>
      </div>
      {drill==='fu'&&<Drill title="Follow-ups due" sub={`${m.overdue.length} overdue`} onClose={()=>setDrill(null)}>
        {fu.length?fu.map(l=>(<div className="drow" key={l.id}>
          <div className="drow-m"><span className="drow-t" onClick={()=>open(l.id)}>{l.company||l.name}</span><div className="subcell">{l.nextSteps||l.nextAction||'follow up'}</div></div>
          <Due iso={l.followUp}/>
        </div>)):<div className="empty" style={{padding:'18px 4px'}}>Nothing due — you're clear.</div>}
      </Drill>}
      <div className="row r2">
        <div className="card lift">
          <div className="sec-title" style={{margin:'0 0 4px'}}><Trophy size={15}/>Your rank</div>
          {myRank>0?(<>
            <div className="rank-big">#{myRank}<span> of {ranked.length}</span></div>
            <div className="ch-sub" style={{marginBottom:12}}>{myRank===1?'Top of the board this month. Hold it.':ahead?`${Math.max(1,ahead.month-(ranked[myRank-1]?.month||0))} more client${Math.max(1,ahead.month-(ranked[myRank-1]?.month||0))===1?'':'s'} to pass ${ahead.name}.`:'Convert a client to get on the board.'}</div>
            <button className="btn btn-g btn-sm" onClick={goBoard}><Trophy size={14}/>See the leaderboard</button>
          </>):<div className="empty" style={{padding:'14px 0'}}>Nothing on the board yet this month. Convert a client and you'll appear here.</div>}
        </div>
        <div className="card">
          <div className="sec-title" style={{margin:'0 0 12px'}}><DollarSign size={15}/>Your clients</div>
          {mine.rows.length?mine.rows.slice(0,8).map(({l,c})=>(<div className="drow" key={l.id}>
            <div className="drow-m"><span className="drow-t" onClick={()=>open(l.id)}>{l.company||l.name}</span><div className="subcell">{fmtDate(String(c.convertedAt).slice(0,10))} · {(CMSN_STATE[c.status]||CMSN_STATE.pending).label}</div></div>
            <span className="drow-v" style={{color:(CMSN_STATE[c.status]||CMSN_STATE.pending).color}}>{usd(c.amount)}</span>
          </div>)):<div className="empty" style={{padding:'14px 0'}}>Convert your first client and your commission shows up here.</div>}
        </div>
      </div>
    </>);
  }
  /* ---- owners from here down: the full board, unchanged ---- */
  const alerted=leads.filter(l=>l.onboardingAlert).sort((a,b)=>String(b.onboardingAlert.at||'').localeCompare(String(a.onboardingAlert.at||'')));
  const awaiting=alerted.filter(l=>!l.onboardingAlert.ack);
  const handled=alerted.filter(l=>l.onboardingAlert.ack).slice(0,12);
  /* commissions sitting on an owner's desk */
  const pendingCmsn=leads.map(l=>({l,c:cmsnOf(l)})).filter(r=>r.c&&r.c.status==='pending')
    .sort((a,b)=>String(b.c.convertedAt||'').localeCompare(String(a.c.convertedAt||'')));
  const pendingTotal=pendingCmsn.reduce((a,r)=>a+num(r.c.amount),0);
  /* per-rep scorecard: what each person actually did this month */
  const scorecard=(team||[]).filter(u=>u.role==='rep'&&u.active!==false).map(u=>{
    const mine=leads.filter(l=>l.owner_id===u.id||l.owner===u.name);
    const touches=mine.reduce((a,l)=>a+(l.activities||[]).filter(x=>REAL_TOUCH(x)&&isoOf(new Date(x.ts)).slice(0,7)===mKey).length,0);
    const booked=mine.reduce((a,l)=>a+(l.activities||[]).filter(x=>x.type==='Booked'&&bookingLive(l,x)&&x.ts&&isoOf(new Date(x.ts)).slice(0,7)===mKey).length,0);
    const conv=mine.filter(l=>l.isClient&&String(l.convertedAt||'').slice(0,7)===mKey).length;
    const openL=mine.filter(l=>sOf(l.stage,stages).open);
    const pipe=openL.reduce((a,l)=>a+num(l.dealValue),0);
    const cm=mine.map(cmsnOf).filter(c=>c&&c.repId===u.id&&c.status!=='void');
    const owed=cm.filter(c=>c.status==='earned').reduce((a,c)=>a+num(c.amount),0);
    const pend=cm.filter(c=>c.status==='pending').reduce((a,c)=>a+num(c.amount),0);
    const last=mine.flatMap(l=>(l.activities||[]).filter(REAL_TOUCH).map(x=>x.ts)).sort().pop();
    return {u,touches,booked,conv,open:openL.length,pipe,owed,pend,last};
  }).sort((a,b)=>b.conv-a.conv||b.touches-a.touches);
  const openLeads=leads.filter(l=>sOf(l.stage,stages).open).sort((a,b)=>num(b.dealValue)-num(a.dealValue));
  const [wonScope,setWonScope]=useState('month');
  /* What a lead ACTUALLY closed. dealValue alone is wrong the moment you use
     "Close this deal": that moves the money into closedDeals and empties
     dealValue, so the row read $0 for a deal that was closed properly — which
     is exactly what made the panel look broken while every total was right. */
  const wonRowValue=(l,scoped)=>scoped
    ? ((l.closedAt&&String(l.closedAt).slice(0,7)===mKey&&cashConfirmed(l)?num(l.dealValue):0)+closedDealsInMonth(l,mKey))
    : ((cashConfirmed(l)?num(l.dealValue):0)+closedDealsTotal(l));
  /* AUDIT #8. In MONTH view the rows come straight from m.closedRows — the same
     array the tile's count and its value are made of — so the panel renders the
     tile rather than offering a second opinion about it. Nothing is filtered:
     a close worth $0 is still a close, and dropping it is what made the tile
     read 3 over a list of 2.
     ALL TIME is a genuinely different question (every lead ever won, not this
     month's closes) and keeps its own shape. */
  const wonLeads=(()=>{
    if(wonScope==='month'){
      const byId=new Map(leads.map(l=>[l.id,l]));
      return (m.closedRows||[]).map(r=>({l:byId.get(r.id),v:r.value,setup:r.value,deals:r.closes}))
        .filter(r=>r.l)
        .sort((a,b)=>(b.l.closedAt||'').localeCompare(a.l.closedAt||''));
    }
    return leads
      .filter(l=>sOf(l.stage,stages).won||closedDealsTotal(l)>0)
      .map(l=>({l,v:wonRowValue(l,false),
        setup:(cashConfirmed(l)?num(l.dealValue):0),
        deals:closedDealsTotal(l)}))
      .filter(r=>r.v>0||sOf(r.l.stage,stages).won)
      .sort((a,b)=>(b.l.closedAt||'').localeCompare(a.l.closedAt||'')); })();
  const wonShownTotal=wonLeads.reduce((a,r)=>a+r.v,0);
  const wonShownCloses=wonScope==='month'?wonLeads.reduce((a,r)=>a+r.deals,0):wonLeads.length;
  const retLeads=leads.filter(billsMrr).sort((a,b)=>num(b.retainer)-num(a.retainer));
  const quotedLeads=leads.filter(l=>quotedRate(l)>0).sort((a,b)=>num(b.retainer)-num(a.retainer));
  const onboardedLeads=leads.filter(l=>l.isClient&&l.convertedAt&&String(l.convertedAt).slice(0,7)===mKey);
  const cold=coldList(rels||[]);
  /* one flat list of every meeting, filtered by the active tab + time scope */
  /* which month key a tab is scoped by. Anything that hasn't happened yet is
     scoped by when it was BOOKED, or a meeting you booked today for next month
     disappears from the view you booked it in. Anything in the past is scoped by
     when it happened, which is what "held this month" has to mean. */
  const scopeKeyFor=(tab,mt)=>(tab==='upcoming'||tab==='undated')?bookingMonthKey(mt):meetingMonthKey(mt);
  const meetingRows=(()=>{ let rows=allMeetings(leads);
    if(scope==='month') rows=rows.filter(r=>scopeKeyFor(mtab,r.m)===mKey);
    if(mtab==='upcoming') rows=rows.filter(r=>isUpcoming(r.m));
    else if(mtab==='completed') rows=rows.filter(r=>r.m.status==='held');
    else if(mtab==='noshow') rows=rows.filter(r=>r.m.status==='noshow');
    else if(mtab==='needs') rows=rows.filter(r=>needsStatus(r.m));
    else if(mtab==='undated') rows=rows.filter(r=>needsDate(r.m));
    const dir=mtab==='upcoming'?1:-1;   // upcoming soonest-first, history newest-first
    return rows.sort((a,b)=>dir*((a.m.start||'').localeCompare(b.m.start||''))); })();
  const mtabCounts=(()=>{ const rows=allMeetings(leads);
    const inScope=(tab,r)=>scope!=='month'||scopeKeyFor(tab,r.m)===mKey;
    return { upcoming:rows.filter(r=>inScope('upcoming',r)&&isUpcoming(r.m)).length,
             completed:rows.filter(r=>inScope('completed',r)&&r.m.status==='held').length,
             noshow:rows.filter(r=>inScope('noshow',r)&&r.m.status==='noshow').length,
             needs:rows.filter(r=>inScope('needs',r)&&needsStatus(r.m)).length,
             undated:rows.filter(r=>inScope('undated',r)&&needsDate(r.m)).length }; })();
  const Name=({l})=><span className="drow-t" onClick={()=>open(l.id)}>{l.company||l.name}</span>;
  const Empty=({t})=><div className="empty" style={{padding:'18px 4px'}}>{t}</div>;
  const stageData=stages.filter(s=>s.open).map(s=>({name:s.label,Leads:m.byStage[s.key]?.count||0,color:s.color}));
  const revMix=[{name:'Closed Setup',value:m.wonValue},{name:'Annual MRR',value:m.mrr*12}].filter(d=>d.value>0);
  const followUps=[...m.overdue,...m.dueWeek].sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||'')).slice(0,8);
  const dashOrder=dashOrderOf(settings);
  const dashHidden=dashHiddenOf(settings);
  const saveDash=(order,hidden)=>saveSettings&&saveSettings({...settings,
    dashOrder:order||dashOrder, dashHidden:hidden||dashHidden});
  const moveSec=(from,to)=>{ if(to<0||to>=dashOrder.length)return;
    const n=[...dashOrder]; const [x]=n.splice(from,1); n.splice(to,0,x); saveDash(n,null); };
  const dropSec=key=>{ if(!dragSec||dragSec===key)return;
    moveSec(dashOrder.indexOf(dragSec),dashOrder.indexOf(key)); setDragSec(null); };
  const toggleSec=key=>saveDash(null,dashHidden.includes(key)
    ? dashHidden.filter(k=>k!==key) : [...dashHidden,key]);

  const BLOCKS={
    /* What came in, and when. Defaults to today; the range buttons widen it.
       Counts come from countAdded so this tile and anything that counts intake
       later cannot drift apart. */
    intake:(()=>{
      const days=(ADDED_RANGES.find(r=>r[0]===addedRange)||ADDED_RANGES[0])[1];
      const newLeads=addedWithin(leads,days);
      const newRels=addedWithin(rels,days);
      const label=(ADDED_RANGES.find(r=>r[0]===addedRange)||ADDED_RANGES[0])[2];
      const recent=[...newLeads.map(l=>({l,rel:false})),...newRels.map(l=>({l,rel:true}))]
        .sort((a,b)=>String(b.l.createdAt||'').localeCompare(String(a.l.createdAt||''))).slice(0,6);
      return (<>
        <div className="kgroup" style={{marginTop:4}}>New leads &amp; relationships</div>
        <div className="intake">
          <div className="ik-head">
            <span className="ik-arc"/>
            <div className="ik-ttl">Intake<i>{label==='Today'?'Today':`Last ${label}`}</i></div>
            <div className="ik-ranges">
              {ADDED_RANGES.map(([k,,lab])=>(
                <button key={k} className={'ik-r'+(addedRange===k?' on':'')}
                  onClick={()=>setAddedRange(k)}>{lab}</button>
              ))}
            </div>
          </div>
          <div className="ik-nums">
            <div className="ik-n"><b>{newLeads.length}</b><span>New lead{newLeads.length===1?'':'s'}</span></div>
            <div className="ik-sep"/>
            <div className="ik-n rel"><b>{newRels.length}</b><span>New relationship{newRels.length===1?'':'s'}</span></div>
          </div>
          {recent.length>0
            ? (<div className="ik-list">
                {recent.map(({l,rel})=>(
                  <button key={l.id} className="ik-row" onClick={()=>open(l.id)}>
                    <span className={'ik-dot'+(rel?' rel':'')}/>
                    <span className="ik-nm">{l.name||l.company||'Unnamed'}</span>
                    <span className="ik-meta">{rel?'Relationship':(l.source||'Lead')}</span>
                    <span className="ik-when">{fmtDate(addedOn(l))}</span>
                  </button>
                ))}
                {(newLeads.length+newRels.length)>recent.length
                  && <div className="ik-more">+ {newLeads.length+newRels.length-recent.length} more</div>}
              </div>)
            : (<div className="ik-empty">Nothing added {label==='Today'?'today':`in the last ${label.toLowerCase()}`} yet.</div>)}
        </div>
      </>);
    })(),
    today:(()=>{
      /* Everything waiting on YOU, in one place, before the numbers. Tags other
         people left, follow-ups due, tasks due, and meetings today — each
         linking straight to the thing rather than to a page you then search. */
      const tags=openTagsFor(leads,me);
      const due=leads.filter(l=>l.followUp&&daysUntil(l.followUp)<=0
        &&(sOf(l.stage,stages).open||sOf(l.stage,stages).nurture))
        .sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||''));
      const today=isoOf(new Date());
      const mtgs=allMeetings(leads).filter(r=>!r.m.status&&!needsDate(r.m)
        &&String(r.m.start||'').slice(0,10)===today)
        .sort((a,b)=>(a.m.start||'').localeCompare(b.m.start||''));
      const dates=upcomingDates(leads);
      /* Recordings waiting to be worked through. Counted into `total` or the
         early-exit below renders "Nothing waiting on you" over a queue of five
         — the section's own emptiness check would be lying. */
      const recs=(pockets||[]).filter(r=>r.status==='open');
      const total=tags.length+due.length+mtgs.length+dates.length+recs.length;
      if(!total) return (<>
        <div className="kgroup" style={{marginTop:4}}>Your day</div>
        <div className="card today-clear"><CheckCircle2 size={16} color={GREEN}/>
          Nothing waiting on you. No tags, no follow-ups due, no meetings today, no birthdays coming up.</div>
      </>);
      return (<>
        <div className="kgroup" style={{marginTop:4}}>Your day
          <span className="td-n">{total} thing{total===1?'':'s'}</span></div>
        <div className="card today">
          {recs.length>0&&<div className="td-grp">
            <div className="td-h"><Mic size={13}/>Recordings to work through · {recs.length}</div>
            {recs.slice(0,6).map(r=>{ const n=(r.title||'Untitled recording');
              return (<div className="td-row" key={r.id}>
                <button className="td-name" onClick={()=>openPocket&&openPocket(r.id)}>{n}</button>
                <span className="td-txt">{r.summary?String(r.summary).slice(0,90):'Waiting for Pocket to finish processing'}</span>
                <span className="td-who">{r.duration?`${Math.round(r.duration/60)} min`:''}</span>
              </div>); })}
            {recs.length>6&&<div className="subcell">+ {recs.length-6} more</div>}
          </div>}
          {tags.length>0&&<div className="td-grp">
            <div className="td-h"><AtSign size={13}/>Tagged you · {tags.length}</div>
            {tags.slice(0,6).map(({lead,a})=>(<div className="td-row" key={a.id}>
              <button className="td-name" onClick={()=>open(lead.id)}>{lead.name||lead.company}</button>
              <span className="td-txt">{a.text}</span>
              <span className="td-who">{a.who}{a.ts?` · ${fmtDate(a.ts.slice(0,10))}`:''}</span>
            </div>))}
            {tags.length>6&&<div className="subcell">+ {tags.length-6} more</div>}
          </div>}
          {due.length>0&&<div className="td-grp">
            <div className="td-h"><Bell size={13}/>Follow-ups due · {due.length}</div>
            {due.slice(0,6).map(l=>{ const od=daysUntil(l.followUp)<0;
              return (<div className="td-row" key={l.id}>
                <button className="td-name" onClick={()=>open(l.id)}>{l.name||l.company}</button>
                <span className="td-txt">{l.nextAction||'Follow up'}</span>
                <span className={'td-who'+(od?' late':'')}>{od?`${-daysUntil(l.followUp)}d overdue`:'today'}</span>
              </div>); })}
            {due.length>6&&<div className="subcell">+ {due.length-6} more</div>}
          </div>}
          {dates.length>0&&<div className="td-grp">
            <div className="td-h"><Gift size={13}/>Birthdays &amp; dates · {dates.length}</div>
            {dates.slice(0,6).map(({lead,d,days})=>{ const yrs=yearsAt(d.date,d.annual!==false);
              return (<div className="td-row" key={lead.id+d.id}>
                <button className="td-name" onClick={()=>open(lead.id)}>{lead.name||lead.company}</button>
                <span className="td-txt">{d.label}{yrs?` · turns ${yrs}`:''}</span>
                <span className={'td-who'+(days<=1?' late':'')}>
                  {days===0?'today':days===1?'tomorrow':`in ${days} days`}</span>
              </div>); })}
            {dates.length>6&&<div className="subcell">+ {dates.length-6} more</div>}
          </div>}
          {mtgs.length>0&&<div className="td-grp">
            <div className="td-h"><CalendarClock size={13}/>Meetings today · {mtgs.length}</div>
            {mtgs.map(({lead,m})=>(<div className="td-row" key={m.id}>
              <button className="td-name" onClick={()=>open(lead.id)}>{lead.name||lead.company}</button>
              <span className="td-txt">{m.title||m.mtype}{m.location?` · ${m.location}`:''}</span>
              <span className="td-who">{fmtMeetingTime(m.start).replace(/^.*?,\s*/,'')}</span>
            </div>))}
          </div>}
        </div>
      </>); })(),
    scorecard:(<>
    {scorecard.length>0&&<div className="card" style={{marginBottom:20}}>
      <div className="sec-title" style={{margin:'0 0 4px'}}><Users size={15}/>The team this month</div>
      <div className="ch-sub" style={{marginBottom:12}}>Every rep, what they've done since the 1st. Tap a name to see their activity.</div>
      <div className="tbl-wrap"><table className="tbl sc"><thead><tr>
        <th>Rep</th><th>Touches</th><th>Booked</th><th>Converted</th><th>Open</th><th>Their pipeline</th><th>Commission</th><th>Last touch</th>
      </tr></thead><tbody>
        {scorecard.map(r=>{ const cold=r.last?daysSince(r.last):null;
          return (<tr key={r.u.id}>
            <td><div className="namecell">{r.u.name}</div><div className="subcell">{num(r.u.commission_pct)}%</div></td>
            <td>{r.touches}</td><td>{r.booked}</td>
            <td><b style={{color:r.conv>0?GREEN:'#8E89A8'}}>{r.conv}</b></td>
            <td>{r.open}</td><td>{usd(r.pipe)}</td>
            <td><span style={{color:GOLD}}>{usd(r.pend)}</span> pending · {usd(r.owed)} earned</td>
            <td>{cold==null?<span className="subcell">never</span>:<span style={{color:cold>7?RED:cold>3?'#C05A1E':'#5A5680',fontWeight:600}}>{cold===0?'today':cold+'d ago'}</span>}</td>
          </tr>); })}
      </tbody></table></div>
    </div>}
    </>),
    revenue:(<>
    <div className="kgroup">Pipeline &amp; revenue</div>
    <div className="kgrid">
      <Kpi variant="accent" label="Open Pipeline" value={usd(m.pipelineValue)} icon={<KanbanSquare size={14}/>} d={`${m.openCount} lead${m.openCount===1?'':'s'}${m.upsellCount>0?` · ${m.upsellCount} client upsell${m.upsellCount===1?'':'s'}`:''}${G.revenue>0?` · ${(m.weighted/G.revenue).toFixed(1)}x goal coverage`:''}`} onClick={()=>tog('pipeline')} active={drill==='pipeline'}/>
      <Kpi label="Revenue Collected" value={usd(G.revenue>0?m.revenueMonth:m.weighted)} icon={<Target size={14}/>} d={(G.revenue>0?revenueSplit(m):'weighted forecast')+(m.outstanding>0?` · ${usd(m.outstanding)} still owed`:'')+(m.awaitingLog>0?` · ${m.awaitingLog} closed this month with no payment logged`:'')} onClick={()=>tog('rev')} active={drill==='rev'} goal={G.revenue} current={m.revenueMonth}/>
      <Kpi variant="green" label="Deals Closed" value={G.closed>0?m.closedMonth:m.wonCount} icon={<CheckCircle2 size={14}/>} d={G.closed>0?`this month · ${usd(m.closedMonthValue)} closed`:`${usd(m.wonValue)} setup`} onClick={()=>tog('won')} active={drill==='won'} goal={G.closed} current={m.closedMonth}/>
      <Kpi variant="gold" label="MRR" value={usd(m.mrr)} icon={<Repeat size={14}/>} d={`${m.retainers} billing · ${usdK(m.mrr*12)}/yr`+(m.quotedCount>0?` · quoted ${usd(m.quotedMrr)} across ${m.quotedCount} client${m.quotedCount===1?'':'s'}, not started`:'')} onClick={()=>tog('mrr')} active={drill==='mrr'} goal={G.mrr} current={m.mrr}/>
    </div>
    {drill==='pipeline'&&(()=>{
      /* AUDIT #6. This filtered on upsellValueOf(l)>0 alone, while useMetrics
         only accumulates upsellValue inside `if(s.won)`. An OPEN lead carrying
         an upsell-stamped deal therefore appeared TWICE — once at its full
         dealValue, which already includes that deal, and once again as an
         upsell row — so the panel's rows summed to more than the tile.
         Won only, to match the metric. An open lead's upsell is already inside
         its dealValue and is counted there. */
      const ups=leads.filter(l=>sOf(l.stage,stages).won&&upsellValueOf(l)>0)
        .sort((a,b)=>upsellValueOf(b)-upsellValueOf(a));
      const rows=openLeads.length+ups.length;
      /* And the header states the VALUE, not just a row count. The tile shows a
         dollar figure the panel never restated, so "a drilldown's total must
         equal the sum of its own rows" (ENGINEERING §2) could not be checked by
         eye at all — there was no total to check. */
      const shown=openLeads.reduce((a,l)=>a+num(l.dealValue),0)+ups.reduce((a,l)=>a+upsellValueOf(l),0);
      return (<Drill title="Open pipeline" sub={`${usd(shown)} · ${rows} open${ups.length?` · ${ups.length} client upsell${ups.length===1?'':'s'}`:''}`} onClose={()=>setDrill(null)}>
      {openLeads.map(l=>(<div className="drow" key={l.id}>
        <div className="drow-m"><Name l={l}/><div className="subcell">{sOf(l.stage,stages).label}{l.followUp?` · follow-up ${fmtDate(l.followUp)}`:''}</div></div>
        <span className="drow-v">{num(l.dealValue)>0?usd(l.dealValue):'—'}</span>
      </div>))}
      {ups.map(l=>(<div className="drow" key={'u_'+l.id}>
        <div className="drow-m"><Name l={l}/><div className="subcell"><span className="pill-upsell">Client upsell</span>{dealsOf(l).filter(isUpsellDeal).map(d=>d.label).filter(Boolean).join(', ')}</div></div>
        <span className="drow-v">{usd(upsellValueOf(l))}</span>
      </div>))}
      {!rows&&<Empty t="Nothing open."/>}
    </Drill>); })()}

    {drill==='rev'&&(()=>{ const rows=leads.flatMap(l=>paymentRows(l)
        .filter(p=>p.date&&String(p.date).slice(0,7)===mKey)
        .map(p=>({l,p}))).sort((a,b)=>(b.p.date||'').localeCompare(a.p.date||''));
      /* AUDIT #22. The panel builds these rows ITSELF, so bounding the metric
         without bounding this listed Poppell under a total that excluded it —
         the drilldown contradicting its own header. Same predicate as
         useMetrics, which is the only way these two stay equal. */
      const legacyRows=leads.filter(l=>!anyPayments(l).length&&preDatesPayments(l))
        .map(l=>({l,amt:((sOf(l.stage,stages).won&&l.closedAt&&String(l.closedAt).slice(0,7)===mKey&&cashConfirmed(l))?num(l.dealValue):0)+closedDealsInMonth(l,mKey)}))
        .filter(r=>r.amt>0);
      const otherRows=(txns||[]).filter(t=>t&&t.type==='income'&&String(t.date||'').slice(0,7)===mKey);
      return (<Drill title="Collected this month" sub={usd(m.revenueMonth)+' · '+revenueSplit(m)+(m.outstanding>0?` · ${usd(m.outstanding)} still owed`:'')} onClose={()=>setDrill(null)}>
        {rows.map(({l,p})=>(<div className="drow" key={l.id+p.id}>
          <div className="drow-m"><Name l={l}/><div className="subcell">{fmtDate(p.date)}{p.note?` · ${p.note}`:''}
            {owedBy(l,stages)>0?<span className="mtg-flag"> · {usd(owedBy(l,stages))} still owed</span>:null}</div></div>
          <span className="drow-v">{usdc(p.amount)}</span>
        </div>))}
        {/* deals recorded before payments were tracked — counted at their close
            date so no history disappears, but labelled so it's obvious why */}
        {legacyRows.map(({l,amt})=>(<div className="drow" key={'lg'+l.id}>
          <div className="drow-m"><Name l={l}/><div className="subcell">closed {fmtDate(l.closedAt)} · no payments logged</div></div>
          <span className="drow-v">{usd(amt)}</span>
        </div>))}
        {/* AUDIT #1. Hand-entered income is part of the number above, so it has
            to be part of the list under it — a drilldown's rows must sum to its
            own header (ENGINEERING §2). */}
        {otherRows.map(t=>(<div className="drow" key={'tx'+t.id}>
          <div className="drow-m"><span className="drow-n">{t.who||'Other income'}</span>
            <div className="subcell">{fmtDate(t.date)} · entered by hand{t.note?` · ${t.note}`:''}</div></div>
          <span className="drow-v">{usdc(t.amount)}</span>
        </div>))}
        {!rows.length&&!legacyRows.length&&!otherRows.length&&<Empty t="Nothing collected this month yet."/>}
      </Drill>); })()}

    {/* The header states BOTH numbers the tile shows — the count and the value —
        so tile and panel can be checked against each other by eye, which is the
        entire job of a drilldown (ENGINEERING §2). */}
    {drill==='won'&&<Drill title="Deals closed" sub={`${wonShownCloses} close${wonShownCloses===1?'':'s'} · ${usd(wonShownTotal)}${wonScope==='month'?' this month':' all time'}`} onClose={()=>setDrill(null)}>
      {/* the header total is the sum of the rows below it, always — it used to
          show all-time next to a this-month tile, so the two never agreed */}
      <div className="mtab-time" style={{marginBottom:10}}>
        <button className={wonScope==='month'?'on':''} onClick={()=>setWonScope('month')}>This month</button>
        <button className={wonScope==='all'?'on':''} onClick={()=>setWonScope('all')}>All time</button>
      </div>
      {wonLeads.length?wonLeads.map(({l,v,setup,deals})=>(<div className="drow" key={l.id}>
        <div className="drow-m"><Name l={l}/><div className="subcell">
          {l.closedAt?`closed ${fmtDate(l.closedAt)}`:'—'}{l.owner?` · ${l.owner}`:''}
          {setup>0&&deals>0?` · ${usd(setup)} setup + ${usd(deals)} closed deals`:''}
          {v===0?' · nothing closed yet':''}
        </div></div>
        <span className="drow-v">{usd(v)}</span>
      </div>)):<Empty t={wonScope==='month'?'Nothing closed this month.':'No closed deals yet.'}/>}
    </Drill>}

    {/* AUDIT #26. Quoted rates are listed BELOW the billing ones, never summed
        into them. "$0 · quoted $526 across 4 clients" is honest; $526 of MRR
        that cannot be collected is not. */}
    {drill==='mrr'&&<Drill title="Retainer clients" sub={usd(m.mrr)+'/mo billing'+(m.quotedMrr>0?` · ${usd(m.quotedMrr)}/mo quoted`:'')} onClose={()=>setDrill(null)}>
      {retLeads.map(l=>(<div className="drow" key={l.id}>
        <div className="drow-m"><Name l={l}/><div className="subcell">since {fmtDate(l.retainerStart)}{(()=>{ const a=retainerArrears(l,mKey); return a.months>0?` · ${a.months} month${a.months===1?'':'s'} behind`:' · up to date'; })()}</div></div>
        <span className="drow-v">{usd(l.retainer)}/mo</span>
      </div>))}
      {!retLeads.length&&quotedLeads.length>0&&<div className="subcell" style={{padding:'8px 2px'}}>
        Nothing is being billed yet — every retainer below is a rate agreed at sale, waiting on a start date.</div>}
      {quotedLeads.length>0&&<>
        <div className="kgroup" style={{marginTop:12}}>Quoted · {usd(m.quotedMrr)}/mo · not counted in MRR</div>
        {quotedLeads.map(l=>(<div className="drow" key={'q'+l.id}>
          <div className="drow-m"><Name l={l}/><div className="subcell">rate agreed · no start date set</div></div>
          <span className="drow-v">{usd(l.retainer)}/mo</span>
        </div>))}
      </>}
      {!retLeads.length&&!quotedLeads.length&&<Empty t="No retainers yet."/>}
    </Drill>}
    </>),
    activity:(<>
    <div className="kgroup">Activity &amp; health</div>
    <div className="kgrid">
      <Kpi variant="accent" label="Meetings Booked" value={m.bookedMonth} icon={<CalendarCheck size={14}/>} d={`this month · ${m.mtgUpcoming} upcoming${m.needsDateCount>0?` · ${m.needsDateCount} need a date`:''} · ${m.bookedAll} all time`} onClick={()=>tog('booked')} active={drill==='booked'} goal={G.booked} current={m.bookedMonth}/>
      <Kpi label="Meetings Held" value={m.heldMonth} icon={<CheckCircle2 size={14}/>} d={(m.heldAll+m.noShowAll)>0?<>show rate <Rate part={m.heldAll} whole={m.heldAll+m.noShowAll} warnBelow={0.6}/> · {rateSample(m.heldAll,m.heldAll+m.noShowAll,'kept')}{m.noShowMonth>0?` · ${m.noShowMonth} no-show`:''}{m.needsStatusCount>0?` · ${m.needsStatusCount} unmarked`:''}</>:'mark meetings held to track'} onClick={()=>tog('held')} active={drill==='held'}/>
      <Kpi variant="green" label="Clients Onboarded" value={m.onboardedMonth} icon={<Rocket size={14}/>} d={`this month · ${m.depositsMonth} of ${m.onbNeeded} deposit${m.onbNeeded===1?'':'s'} in${m.onbMonthlyOnly>0?` · ${m.onbMonthlyOnly} monthly-only`:''}`} onClick={()=>tog('onboarded')} active={drill==='onboarded'} goal={G.onboarded} current={m.onboardedMonth}/>
      <Kpi label="Speed to First Touch" value={fmtHrs(m.firstTouch)} icon={<Zap size={14}/>} d={m.untouched>0?`${m.untouched} never contacted`:`median across ${m.touchHrs.length} leads`} onClick={()=>tog('speed')} active={drill==='speed'}/>
      <Kpi label="Follow-Up Health" value={<Rate part={m.fuOnTime} whole={m.fuCleared} warnBelow={0.7} goodAbove={0.9}/>} icon={<Bell size={14}/>} d={`${rateSample(m.fuOnTime,m.fuCleared,'cleared on time')}${m.overdue.length>0?` · ${m.overdue.length} overdue right now`:''}`} onClick={()=>tog('fu')} active={drill==='fu'}/>
      <Kpi label="Going Cold" value={cold.length} icon={<Users size={14}/>} d={cold.length>0?`${cold.filter(x=>x.tier==='champion').length} champion${cold.filter(x=>x.tier==='champion').length===1?'':'s'} need a touch`:'everyone is warm'} onClick={()=>tog('cold')} active={drill==='cold'}/>
    </div>
    {(drill==='booked'||drill==='held')&&<Drill title="Meetings" sub={`${mtabCounts.upcoming} upcoming · ${mtabCounts.completed} held · ${mtabCounts.noshow} no-show`} onClose={()=>setDrill(null)}>
      <div className="mtabs">
        {[['upcoming','Upcoming'],['completed','Completed'],['noshow','No-shows'],['needs','Needs status'],['undated','Needs a date']].map(([k,label])=>(
          <button key={k} className={'mtab'+(mtab===k?' on':'')+(k==='needs'&&mtabCounts.needs>0?' alert':'')+(k==='undated'&&mtabCounts.undated>0?' undated':'')} onClick={()=>setMtab(k)}>
            {label}<span className="mtab-n">{mtabCounts[k]}</span>
          </button>))}
        <div className="mtab-time">
          <button className={scope==='month'?'on':''} onClick={()=>setScope('month')}>This month</button>
          <button className={scope==='all'?'on':''} onClick={()=>setScope('all')}>All time</button>
        </div>
      </div>
      {meetingRows.length?meetingRows.map(({lead,m:mt})=>(<div className={'drow mtg-drow'+(mt.status==='held'?' held':'')+(mt.status==='noshow'?' noshow':'')+(needsStatus(mt)?' needs':'')+(needsDate(mt)?' undated':'')} key={mt.id}>
        <div className="drow-m"><Name l={lead}/><div className="subcell">
          {needsDate(mt)
            ? <>logged {fmtDate(mt.createdAt||mt.start)}<span className="mtg-undated"> · no date set</span></>
            : <>{fmtMeetingTime?fmtMeetingTime(mt.start):fmtDate(mt.start)}{mt.who?` · ${mt.who}`:''}</>}
          {needsStatus(mt)&&<span className="mtg-flag"> · did this happen?</span>}
        </div></div>
        {needsDate(mt)&&<DateFix onSet={(v,mins)=>setMeetingTime&&setMeetingTime(lead.id,mt.id,v,mins)}/>}
        <select className={'mtg-type'+(mt.mtype?'':' unset')} value={mt.mtype||''} onChange={e=>tagMeetingType&&tagMeetingType(lead.id,mt.id,e.target.value)}>
          <option value="">+ type</option>{MEETING_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        {!needsDate(mt)&&<div className="mtg-status">
          <button className={'ms-b held'+(mt.status==='held'?' on':'')} title="It happened" onClick={()=>setMeetingStatus&&setMeetingStatus(lead.id,mt.id,'held')}><CheckCircle2 size={12}/>Held</button>
          <button className={'ms-b no'+(mt.status==='noshow'?' on':'')} title="They didn't show" onClick={()=>setMeetingStatus&&setMeetingStatus(lead.id,mt.id,'noshow')}><X size={12}/>No-show</button>
        </div>}
      </div>)):<Empty t={mtab==='upcoming'?'No upcoming meetings.':mtab==='needs'?'Nothing waiting on a status. Clean.':mtab==='undated'?'Every meeting has a real date on it.':mtab==='noshow'?'No no-shows. Nice.':'Nothing here yet.'}/>}
    </Drill>}

    {drill==='speed'&&<Drill title="Speed to first touch" sub={m.firstTouch!=null?`median ${fmtHrs(m.firstTouch)}`:'no touches yet'} onClose={()=>setDrill(null)}>
      {(()=>{ const rows=leads.map(l=>({l,h:firstTouchHrs(l)}))
          .filter(r=>r.h!=null||!(r.l.activities||[]).some(REAL_TOUCH))
          .sort((a,b)=>(a.h==null?-1:1)-(b.h==null?-1:1)||((b.h||0)-(a.h||0)));
        return rows.length?rows.map(({l,h})=>(<div className={'drow'+(h==null?' untyped':'')} key={l.id}>
          <div className="drow-m"><Name l={l}/><div className="subcell">{h==null?'never contacted':`added ${fmtDate(l.createdAt)}`}</div></div>
          <span className="drow-v">{h==null?'—':fmtHrs(h)}</span>
        </div>)):<Empty t="No leads yet."/>; })()}
    </Drill>}

    {drill==='fu'&&<Drill title="Follow-ups overdue" sub={m.fuCleared>0?`${m.fuOnTime}/${m.fuCleared} cleared on time this month`:'tracking starts as you clear them'} onClose={()=>setDrill(null)}>
      {m.overdue.length?[...m.overdue].sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||'')).map(l=>(<div className="drow untyped" key={l.id}>
        <div className="drow-m"><Name l={l}/><div className="subcell">{l.nextSteps||l.nextAction||'follow up'}</div></div>
        <span className="drow-v" style={{color:RED}}>{Math.abs(daysUntil(l.followUp))}d late</span>
      </div>)):<Empty t="Nothing overdue — you're clear."/>}
    </Drill>}

    {drill==='cold'&&<Drill title="Relationships going cold" sub={`champions ${COLD_DAYS.champion}d · b tier ${COLD_DAYS.b}d · new ${COLD_DAYS.new}d`} onClose={()=>setDrill(null)}>
      {cold.length?cold.map(({r,tier,days,limit})=>(<div className={'drow'+(tier==='champion'?' untyped':'')} key={r.id}>
        <div className="drow-m"><Name l={r}/><div className="subcell">{tierMeta(tier)[1]} · last touch {days>=9999?'never':fmtDate(lastTouchTs(r))}</div></div>
        <span className="drow-v" style={{color:days>limit*2?RED:'#C05A1E'}}>{days>=9999?'never':days+'d ago'}</span>
      </div>)):<Empty t="Everyone's been touched recently. Nice."/>}
    </Drill>}

    {drill==='onboarded'&&<Drill title="Clients onboarded this month" sub={`${m.depositsMonth} of ${m.onbNeeded} deposit${m.onbNeeded===1?'':'s'} in${m.onbMonthlyOnly>0?` · ${m.onbMonthlyOnly} monthly-only`:''}`} onClose={()=>setDrill(null)}>
      {onboardedLeads.length?onboardedLeads.map(l=>{ const st=onboardingStat(l); const dep=normEntry((l.onboarding||{}).deposit_paid).done;
        return (<div className="drow" key={l.id}>
          <div className="drow-m"><Name l={l}/><div className="subcell">since {fmtDate(l.convertedAt)} · {st.done}/{st.total} onboarding{onbSkipped(l,'deposit_paid')?' · monthly only':dep?` · deposit ${fmtDate(dep)}`:' · no deposit yet'}</div></div>
          <span className="drow-v">{l.retainerActive?usd(l.retainer)+'/mo':'—'}</span>
        </div>); }):<Empty t="No clients onboarded this month."/>}
    </Drill>}

    {Object.keys(m.bookedByType||{}).length>0&&<div className="mt-break">
      <span className="mtb-l">Booked this month</span>
      {Object.entries(m.bookedByType).sort((a,b)=>b[1]-a[1]).map(([t,c])=><span key={t} className="mtb"><b>{c}</b>{t}</span>)}
    </div>}
    </>),
    funnel:(<>
    {m.funnel.length>1&&<div className="card" style={{marginBottom:18}}>
      <h3>Conversion funnel</h3>
      <div className="ch-sub">How far leads get, and the share of each stage that ultimately closes</div>
      <div className="funnel">
        <div className="fn-row fn-head"><span className="fn-l"></span><span></span><span className="fn-c">count</span><span className="fn-r">step</span><span className="fn-r">→ close</span></div>
        {m.funnel.map((f,i)=>{ const top=m.funnel[0].count||1;
        return (<div className="fn-row" key={f.key}>
          <span className="fn-l">{f.label}</span>
          <div className="fn-bar"><div style={{width:Math.max(2,Math.round(f.count/top*100))+'%',background:f.color||COBALT}}/></div>
          <span className="fn-c">{f.count}</span>
          {/* AUDIT #7. Both of these were bare percentages with no sample, and
              the close rate turned RED below 50% — on a stage three leads had
              reached. <Rate> shows the fraction instead until there are enough
              to read, and withholds the colour with it. */}
          <span className="fn-r">{i===0?'—':<Rate part={f.count} whole={m.funnel[i-1].count}/>}</span>
          <span className="fn-r close">{i===m.funnel.length-1?'—':
            <Rate part={Math.round(f.closeRate*f.count)} whole={f.count} warnBelow={0.5}/>}</span>
        </div>); })}</div>
    </div>}
    </>),
    analytics:(<>
    {/* higher-order sales analytics — the numbers a sales leader actually runs on */}
    <div className="kgroup">Sales analytics</div>
    <div className="an-grid">
      <div className="an-card"><div className="an-l">Meeting &#8594; Close</div><div className="an-v"><Rate part={m.metAndClosed} whole={m.metLeads} warnBelow={0.25} goodAbove={0.5}/></div><div className="an-d">{m.metAndClosed} of {m.metLeads} closed after a sales meeting{(m.ratioEx||[]).length?` \u00b7 ${(m.ratioEx||[]).join(', ')} not counted`:''}{m.metNoSalesMtg>0?` \u00b7 ${m.metNoSalesMtg} met with no sales meeting logged`:''}{m.metAfterCloseOnly>0?` \u00b7 ${m.metAfterCloseOnly} only met after signing`:''}</div></div>
      <div className="an-card"><div className="an-l">Show Rate</div><div className="an-v"><Rate part={m.heldAll} whole={m.heldAll+m.noShowAll} warnBelow={0.6} goodAbove={0.85}/></div><div className="an-d">{m.noShowAll} no-show{m.noShowAll===1?'':'s'} all time{m.needsStatusCount>0?` \u00b7 ${m.needsStatusCount} unmarked, not counted yet`:''}</div></div>
      <div className="an-card"><div className="an-l">Avg Days to Close</div><div className="an-v">{m.avgDaysToClose==null?'—':m.avgDaysToClose+'d'}</div><div className="an-d">lead created → converted</div></div>
      <div className="an-card"><div className="an-l">Win Rate</div><div className="an-v"><Rate part={m.wonForRate} whole={m.wonForRate+m.lostCount} warnBelow={0.2} goodAbove={0.5}/></div><div className="an-d">of decided deals ({m.wonForRate}W · {m.lostCount}L){m.wonPending>0?` · ${m.wonPending} awaiting payment, counted as won`:''}</div></div>
      {/* The CARD's own warn state is gated on the same floor as the rate inside
    it — colouring the card red while the rate refuses to judge would put the
    alarm back by the side door. */}
<div className={'an-card'+(m.rotting>0&&m.openCount>=RATE_MIN_N?' warn':'')}><div className="an-l">Pipeline Moving</div><div className="an-v"><Rate part={m.openCount-m.rotting} whole={m.openCount} warnBelow={0.6} goodAbove={0.9}/></div><div className="an-d">{rateSample(m.openCount-m.rotting,m.openCount,'still moving')}{m.rotting>0?` · ${m.rotting} cold 14+ days`:''}</div></div>
      <div className="an-card"><div className="an-l">Avg Deal Size</div><div className="an-v">{m.avgDeal?usd(m.avgDeal):'—'}</div><div className="an-d">across {m.wonDealCount} deal{m.wonDealCount===1?'':'s'}{(m.wonCount-m.wonValued)>0?` · ${m.wonCount-m.wonValued} retainer-only, excluded`:''}</div></div>
    </div>
    </>),
    sources:(<>
    {m.sourceROI.length>0&&<div className="card" style={{marginBottom:18}}>
      <h3>Lead source ROI</h3>
      <div className="ch-sub">Which sources actually close — spend your time where the money is</div>
      <div className="src-list">
        <div className="src-row src-head"><span>Source</span><span>Leads</span><span>Closed</span><span>Rate</span><span>Value</span></div>
        {m.sourceROI.map(s=>(<div className="src-row" key={s.source}>
          <span className="src-name">{s.source}</span><span>{s.total}</span><span>{s.won}</span>
          {/* AUDIT #7. This had its OWN threshold — s.total>=3 — hand-rolled and
              lower than everywhere else, so one source could be judged on three
              leads while an identical rate elsewhere was not. The row already
              prints Leads and Closed beside it, so the sample was never the
              problem here; the colour was. One floor now, from <Rate>. */}
          <span><Rate part={s.won} whole={s.total} warnBelow={0.15} goodAbove={0.4}/></span>
          <span>{s.value?usd(s.value):'—'}</span>
        </div>))}
      </div>
    </div>}
    </>),
    clients:(<>
    {m.byClient&&m.byClient.length>0&&<div className="card" style={{marginBottom:18}}>
      <h3>Booked by client</h3>
      <div className="ch-sub">Lifetime <b>booked</b> value per client — what they have bought, not what has landed.
        Collected and outstanding are shown per row.</div>
      <div className="rbc-list">
        {(()=>{ const top=m.byClient[0].lifetime||1; return m.byClient.slice(0,12).map(cl=>(
          <div className="rbc-row" key={cl.id} onClick={()=>open(cl.id)}>
            <div className="rbc-m">
              <span className="rbc-name">{cl.name}</span>
              {cl.deals>1&&<span className="rbc-deals">{cl.deals} deals</span>}
              {cl.mrr>0&&<span className="rbc-mrr">{usd(cl.mrr)}/mo</span>}
              {cl.paid>0&&<span className="rbc-paid">{usd(cl.paid)} collected</span>}
              {cl.owed>0&&<span className="rbc-pend">{usd(cl.owed)} outstanding</span>}
              {cl.owed<=0&&cl.pending>0&&<span className="rbc-pend">{usd(cl.pending)} awaiting deposit</span>}
            </div>
            <div className="rbc-bar"><div style={{width:Math.max(3,Math.round(cl.lifetime/top*100))+'%'}}/></div>
            <span className="rbc-v">{usd(cl.lifetime)}</span>
          </div>)); })()}
      </div>
      {m.byClient.length>12&&<div className="rbc-more">+ {m.byClient.length-12} more clients</div>}
    </div>}
    </>),
    charts:(<>
    <div className="row r3">
      <ChartCard title="Pipeline by Stage" sub="Open leads only" empty={stageData.some(d=>d.Leads>0)?null:'No open leads yet.'}>
        <div className="chart-h"><ResponsiveContainer width="100%" height="100%"><BarChart data={stageData} margin={{top:6,right:10,left:-12,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F6"/><XAxis dataKey="name" tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tipStyle} cursor={{fill:'#F4F6FB'}}/><Bar dataKey="Leads" radius={[6,6,0,0]}>{stageData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
        </BarChart></ResponsiveContainer></div>
      </ChartCard>
      <ChartCard title="Revenue Mix" sub="Setup vs annualized recurring" empty={revMix.length?null:'No closed revenue yet.'}>
        <div className="chart-h"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={revMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={46} outerRadius={80} paddingAngle={2}>{revMix.map((e,i)=><Cell key={i} fill={PIE[i]}/>)}</Pie><Tooltip contentStyle={tipStyle} formatter={v=>usd(v)}/><Legend wrapperStyle={{fontSize:12}}/></PieChart></ResponsiveContainer></div>
      </ChartCard>
    </div>
    </>),
    events:(()=>{ const next=evUpcomingEvents(events||[])[0];
      if(!next) return null;
      const out=evDaysOut(next), left=evSeatsLeft(next), late=evOverdue(next);
      return (<>
        <div className="kgroup" style={{marginTop:4}}>Next event</div>
        <button className="card ev-next" onClick={()=>goEvents&&goEvents()}>
          <div className="ev-next-h">
            <div><div className="ev-name">{next.name||'Untitled event'}</div>
              <div className="ev-venue">{next.venue||'No venue'}{next.date?` · ${fmtDate(next.date)}`:''}</div></div>
            <div className={'ev-count'+(out!==null&&out<=7?' soon':'')}>{out===null?'—':out===0?'Today':out>0?`${out}d`:`${-out}d ago`}</div>
          </div>
          <div className="ev-next-s">
            <span><b>{left}</b> seats left</span>
            <span><b>{evFilled(next).length}/{(next.slots||[]).length||0}</b> sponsors</span>
            <span className={evNetProjected(next)>=0?'good':'bad'}><b>{usd(evNetProjected(next))}</b> projected</span>
          </div>
          {late.length>0&&<div className="ev-late" style={{marginTop:10}}><AlertTriangle size={13}/>
            {late.length} milestone{late.length===1?'':'s'} overdue{late[0]?` · ${late[0].label}`:''}</div>}
        </button>
      </>); })(),
    lists:(<>
    <div className="row r2">
      <div className="card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><div className="sec-title" style={{margin:0}}>Follow-ups Due</div>{m.overdue.length>0&&<span className="pill" style={{background:'rgba(209,67,67,.1)',color:RED}}><AlertTriangle size={11}/>{m.overdue.length} overdue</span>}</div>
        <div style={{marginTop:12}}>{followUps.length?followUps.map(l=>(<div key={l.id} onClick={()=>open(l.id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #F0F0F6',cursor:'pointer'}}><div><div style={{fontWeight:600,color:INK,fontSize:14}}>{l.name}</div><div className="subcell">{l.company} · {l.nextAction}</div></div><Due iso={l.followUp}/></div>)):<div className="empty">Nothing due this week. Clean board.</div>}</div>
      </div>
      <div className="card">
        <div className="sec-title" style={{margin:'0 0 12px'}}>🔥 Hot Leads</div>
        {m.hot.length?m.hot.map(l=>(<div key={l.id} onClick={()=>open(l.id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #F0F0F6',cursor:'pointer'}}><div><div style={{fontWeight:600,color:INK,fontSize:14}}>{l.name}</div><div className="subcell">{l.company}</div></div><StageBadge k={l.stage} stages={stages}/></div>)):<div className="empty">No high-priority open leads.</div>}
      </div>
    </div>
    </>),
  };

  return (<>
    {awaiting.length>0&&<div className="onb-q">
      <div className="onb-h"><Rocket size={15}/><b>Awaiting onboarding</b><span>{awaiting.length} newly converted client{awaiting.length===1?'':'s'}</span></div>
      {awaiting.map(l=>(<div className="onb-row" key={l.id}>
        <div className="onb-m"><span className="drow-t" onClick={()=>open(l.id)}>{l.company||l.name}</span>
          <div className="subcell">{l.onboardingAlert.repName||'A rep'} converted {fmtDate(String(l.onboardingAlert.at||'').slice(0,10))} — start onboarding.</div></div>
        <button className="btn btn-g btn-sm" onClick={()=>ack&&ack(l.id)}><CheckCircle2 size={14}/>Got it</button>
      </div>))}
    </div>}
    {handled.length>0&&<div className="onb-q done">
      <div className="onb-h" onClick={()=>tog('handled')} style={{cursor:'pointer'}}><CheckCircle2 size={15}/><b>Handled conversions</b>
        <span>{handled.length} acknowledged · tap to {drill==='handled'?'hide':'see'}</span></div>
      {drill==='handled'&&handled.map(l=>(<div className="onb-row" key={l.id}>
        <div className="onb-m"><span className="drow-t" onClick={()=>open(l.id)}>{l.company||l.name}</span>
          <div className="subcell">{l.onboardingAlert.repName||'A rep'} · converted {fmtDate(String(l.onboardingAlert.at||'').slice(0,10))}{l.onboardingAlert.ackBy?` · cleared by ${l.onboardingAlert.ackBy}`:''}</div></div>
      </div>))}
    </div>}
    {pendingCmsn.length>0&&<div className="onb-q cmsn">
      <div className="onb-h"><Percent size={15}/><b>Commissions waiting on you</b><span>{pendingCmsn.length} · {usd(pendingTotal)} total</span></div>
      {pendingCmsn.map(({l,c})=>(<div className="onb-row" key={l.id}>
        <div className="onb-m"><span className="drow-t" onClick={()=>open(l.id)}>{l.company||l.name}</span>
          <div className="subcell">{c.repName||'Rep'} · {num(c.pct)}% of {usd(c.base)}{l.dealValueBy?` · value entered by ${l.dealValueBy}`:''}</div></div>
        <span className="drow-v" style={{color:GOLD}}>{usd(c.amount)}</span>
        {approve&&<button className="btn btn-p btn-sm" onClick={()=>approve(l.id,{status:'earned'})}><BadgeCheck size={14}/>Approve</button>}
      </div>))}
    </div>}

    <div className="dash-arrange">
      <button className={'btn btn-g btn-sm'+(arrange?' on':'')} onClick={()=>setArrange(a=>!a)}>
        <GripVertical size={14}/>{arrange?'Done':'Rearrange'}
      </button>
      {arrange&&<>
        <button className="linkbtn" onClick={()=>saveDash(DASH_DEFAULT,[])}>Reset to default</button>
        <span className="subcell">Drag a section, or use the arrows. This layout is saved for everyone on the account.</span>
      </>}
    </div>

    {dashOrder.map((k,i)=>{
      const hidden=dashHidden.includes(k);
      if(hidden&&!arrange) return null;
      if(!arrange) return <React.Fragment key={k}>{BLOCKS[k]}</React.Fragment>;
      return (<div key={k} className={'dsec'+(dragSec===k?' dragging':'')+(hidden?' off':'')}
        draggable onDragStart={()=>setDragSec(k)} onDragEnd={()=>setDragSec(null)}
        onDragOver={e=>e.preventDefault()} onDrop={()=>dropSec(k)}>
        <div className="dsec-h">
          <GripVertical size={14} className="dsec-grip"/>
          <span className="dsec-t">{dashLabel(k)}</span>
          <span className="dsec-btns">
            <button className="dsec-b" disabled={i===0} onClick={()=>moveSec(i,i-1)} title="Move up"><ChevronLeft size={14} style={{transform:'rotate(90deg)'}}/></button>
            <button className="dsec-b" disabled={i===dashOrder.length-1} onClick={()=>moveSec(i,i+1)} title="Move down"><ChevronRight size={14} style={{transform:'rotate(90deg)'}}/></button>
            <button className="dsec-b wide" onClick={()=>toggleSec(k)}>{hidden?'Show':'Hide'}</button>
          </span>
        </div>
        <div className="dsec-body">{BLOCKS[k]}</div>
      </div>);
    })}
  </>);
}

/* The dashboard is a list of named blocks rendered in a saved order, so the
   layout is data rather than markup. That's what makes a realtor build a
   settings change instead of a fork: reorder, hide what doesn't apply, ship.
   Alerts are deliberately NOT in here — an onboarding queue or an unacknowledged
   commission is not decoration and shouldn't be reorderable or hideable. */
/* ---- intake: how many leads and relationships arrived, and when -------------
   "Added" means createdAt, counted on CALENDAR DAY boundaries rather than a
   rolling 24h window, because "added today" has to mean today's date — a lead
   entered at 9am must not stop counting at 9am tomorrow.

   A range of N days is the last N calendar days INCLUDING today, so 'Today' is
   simply N=1 and there is one code path rather than a special case.

   Module level and pure on purpose: the tile, and anything that counts these
   later, share one definition. ENGINEERING.md §2 — two screens must never
   disagree about a number. */
const ADDED_RANGES=[
  ['today',   1,  'Today'],
  ['d7',      7,  '7 days'],
  ['d14',     14, '14 days'],
  ['d30',     30, '30 days'],
  ['d90',     90, '90 days'],
  ['d365',    365,'12 months'],
];
/* The date a record was added, as YYYY-MM-DD, or '' if it has no usable one.
   An unparseable createdAt must return '' rather than a NaN date: "NaN-aN-aN"
   sorts ABOVE any real date as a string and would count in every range. */
const addedOn=r=>{ if(!r||!r.createdAt) return ''; const d=new Date(r.createdAt); return isNaN(d)?'':isoOf(d); };
const addedFrom=days=>{ const d=new Date(); d.setDate(d.getDate()-(Math.max(1,num(days))-1)); return isoOf(d); };
/* Records added within the last `days` calendar days, newest first. */
const addedWithin=(rows,days)=>{ const from=addedFrom(days);
  return (Array.isArray(rows)?rows:[]).filter(r=>{ const d=addedOn(r); return d&&d>=from; })
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))); };
const countAdded=(rows,days)=>addedWithin(rows,days).length;

const DASH_SECTIONS=[
  ['today',    'Your day'],
  ['intake',   'New leads & relationships'],
  ['scorecard','Team scorecard'],
  ['revenue',  'Pipeline & revenue'],
  ['activity', 'Activity & health'],
  ['funnel',   'Conversion funnel'],
  ['analytics','Sales analytics'],
  ['sources',  'Lead source ROI'],
  ['clients',  'Revenue by client'],
  ['charts',   'Pipeline & revenue charts'],
  ['lists',    'Follow-ups & hot leads'],
  ['events',   'Next event'],
];
const DASH_DEFAULT=DASH_SECTIONS.map(x=>x[0]);
/* "Your day" is new, and dashOrderOf appends unknown keys at the END — which
   would bury the one section that's meant to be read first. Anyone with a saved
   layout gets it pulled to the top once. */
const dashPinFirst='today';
const dashLabel=k=>(DASH_SECTIONS.find(x=>x[0]===k)||[k,k])[1];
/* saved order, repaired on read: unknown keys dropped, new ones appended in
   default position, so shipping a new section never leaves it invisible for
   anyone who already saved a layout. */
const dashOrderOf=settings=>{
  const saved=Array.isArray(settings&&settings.dashOrder)?settings.dashOrder.filter(k=>DASH_DEFAULT.includes(k)):[];
  if(!saved.length) return [...DASH_DEFAULT];
  /* Insert anything new at its DEFAULT position relative to a section they
     already have, rather than appending it. Appending is the dashboard's
     version of "new tabs ship invisible": the section is technically there,
     it is just at the bottom of a long page and nobody scrolls to find a
     feature they were never told about. ENGINEERING.md §1. */
  const merged=[...saved];
  DASH_DEFAULT.forEach((k,i)=>{
    if(merged.includes(k)) return;
    const prev=DASH_DEFAULT.slice(0,i).filter(x=>merged.includes(x)).pop();
    merged.splice(prev?merged.indexOf(prev)+1:0,0,k);
  });
  if(!saved.includes(dashPinFirst))
    return [dashPinFirst,...merged.filter(k=>k!==dashPinFirst)];
  return merged;
};
const dashHiddenOf=settings=>Array.isArray(settings&&settings.dashHidden)
  ? settings.dashHidden.filter(k=>DASH_DEFAULT.includes(k)) : [];

/* ========================= EVENTS =========================
   A Suite Night is a series, not a one-off, so the timeline is expressed as
   days BEFORE the event date and generated when the event is created. Same
   cascade idea as contract deadlines, different anchor: move the date and every
   unmet milestone moves with it.
   The point of the module is not logistics. It's proving the event was worth
   doing — every guest added here becomes a lead sourced to the event, so Lead
   Source ROI answers "did this pay for itself" without anyone tallying it. */
const EVENT_MILESTONES=[
  [-28,'Landing page live'],
  [-21,'Sponsor slots filled'],
  [-16,'Print materials ordered'],
  [-12,'Invites sent'],
  [-7 ,'All seats filled'],
  [-3 ,'Final headcount to venue'],
  [-1 ,'Day-before confirmations'],
  [ 0 ,'Event day'],
  [ 2 ,'Follow up with everyone who came'],
];
/* ---- sheet import ----------------------------------------------------------
   Matching order is deliberate: email, then phone, then an exact name. Email is
   the only one that's genuinely unique. Name-only is a SUGGESTION, never an
   automatic merge — "Mike Smith" and "Michael Smith" are one person about half
   the time and two people the other half, and silently merging the wrong pair
   is far worse than asking.
   Every imported guest keeps the key it came in on, so syncing the same sheet
   twice updates rather than duplicates. That is the whole reason a sync button
   is safe to press. */
const normEmail=v=>String(v||'').trim().toLowerCase();
const normPhone=v=>{ const d=String(v||'').replace(/\D/g,''); return d.length===11&&d[0]==='1'?d.slice(1):d; };
const normName=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
const rowKey=r=>normEmail(r.email)||normPhone(r.phone)||normName(r.name);
const GUESS={ name:[/^(full ?)?name$/i,/first.*last/i,/attendee/i,/guest/i],
  email:[/e-?mail/i], phone:[/phone|mobile|cell/i],
  plus:[/plus|guests?\b|\+1|additional/i], notes:[/note|comment|message/i] };
const guessMap=headers=>{ const m={name:'',email:'',phone:'',plus:'',notes:''};
  Object.keys(GUESS).forEach(k=>{ const hit=headers.find(h=>GUESS[k].some(re=>re.test(h))); if(hit) m[k]=hit; });
  if(!m.name){ const h=headers.find(x=>/name/i.test(x)); if(h) m.name=h; }
  return m; };
/* Returns what WOULD happen, so it can be shown before anything is written. */
const planImport=(rows,map,guests,leads)=>{
  /* Someone added by hand from the picker has no srcKey, so keying only on that
     would import them a second time the first time a sheet is synced. Match on
     who they ARE as well: their linked contact, and their own name. */
  const byKey=new Map();
  (guests||[]).forEach(g=>{
    if(g.srcKey) byKey.set(g.srcKey,g);
    if(g.contactId) byKey.set('lead:'+g.contactId,g);
    const n=normName(g.name); if(n) byKey.set('name:'+n,g);
  });
  const seen=(key,g,leadId)=>byKey.has(key)||(leadId&&byKey.has('lead:'+leadId))||byKey.has('name:'+normName(g.name));
  const leadByEmail=new Map((leads||[]).filter(l=>l.email).map(l=>[normEmail(l.email),l]));
  const leadByPhone=new Map((leads||[]).filter(l=>l.phone).map(l=>[normPhone(l.phone),l]));
  const leadByName=new Map();
  (leads||[]).forEach(l=>{ const n=normName(l.name||l.company); if(!n) return;
    leadByName.set(n,leadByName.has(n)?'AMBIGUOUS':l); });   // two people, same name
  const out={already:[],matched:[],fresh:[],unsure:[],skipped:0};
  (rows||[]).forEach(r=>{
    const g={ name:String(r[map.name]||'').trim(), email:String(r[map.email]||'').trim(),
      phone:String(r[map.phone]||'').trim(), plusOnes:num(r[map.plus]),
      notes:String(r[map.notes]||'').trim() };
    if(!g.name&&!g.email){ out.skipped++; return; }
    if(!g.name) g.name=g.email;
    const key=rowKey(g); if(!key){ out.skipped++; return; }
    g.srcKey=key;
    const hit=leadByEmail.get(normEmail(g.email))||leadByPhone.get(normPhone(g.phone));
    if(seen(key,g,hit&&hit.id)){ out.already.push(g); return; }
    if(hit){ out.matched.push({...g,leadId:hit.id,how:'email/phone'}); return; }
    const byName=g.name?leadByName.get(normName(g.name)):null;
    if(byName==='AMBIGUOUS'){ out.unsure.push({...g,why:'more than one contact has that name'}); return; }
    if(byName){ out.unsure.push({...g,leadId:byName.id,why:'name matched, no email or phone to confirm it'}); return; }
    out.fresh.push(g);
  });
  return out;
};

const GUEST_STATUS=[['invited','Invited'],['confirmed','Confirmed'],['attended','Attended'],['noshow','No-show']];
const shiftDay=(iso,days)=>{ if(!iso) return ''; const d=new Date(iso+'T12:00:00');
  if(isNaN(d)) return ''; d.setDate(d.getDate()+days); return isoOf(d); };
const seedMilestones=date=>EVENT_MILESTONES.map(([off,label])=>
  ({id:uid(),label,due:shiftDay(date,off),offset:off,done:false,doneAt:''}));
const blankEvent=()=>({ id:uid(), name:'', venue:'', date:'', seatsTotal:19, houseSeats:2,
  sponsorSeatEach:0, coverPrice:60, status:'planning', notes:'',
  costs:[{id:uid(),label:'Suite',amount:''},{id:uid(),label:'Catering',amount:''}],
  slots:[], guests:[], milestones:[], createdAt:new Date().toISOString() });

const sponsorTotal=(lead,events)=>sponsorshipsOf(lead,events).reduce((a,x)=>a+x.amount,0);
const sponsorPaidTotal=(lead,events)=>sponsorshipsOf(lead,events).filter(x=>x.paid).reduce((a,x)=>a+x.amount,0);
const isSponsor=(lead,events)=>sponsorshipsOf(lead,events).length>0;

const evFilled=e=>(e.slots||[]).filter(s=>s.contactName||s.contactId);
const evSponsorSeats=e=>evFilled(e).length*evNum(e.sponsorSeatEach);
const evHeads=g=>1+evNum(g.plusOnes);
/* a seat is spoken for once someone confirms — invited is not a commitment,
   and a no-show frees the seat back up only after the night is over */
const evTakenGuests=e=>(e.guests||[]).filter(g=>g.status==='confirmed'||g.status==='attended');
const evSeatsTaken=e=>evNum(e.houseSeats)+evSponsorSeats(e)+evTakenGuests(e).reduce((a,g)=>a+evHeads(g),0);
const evSeatsLeft=e=>evNum(e.seatsTotal)-evSeatsTaken(e);
const evSponsorPromised=e=>evFilled(e).reduce((a,s)=>a+evNum(s.price),0);
const evSponsorPaid=e=>evFilled(e).filter(s=>s.paid).reduce((a,s)=>a+evNum(s.price),0);
const evCoverDue=e=>evTakenGuests(e).reduce((a,g)=>a+evHeads(g),0)*evNum(e.coverPrice);
const evCoverPaid=e=>(e.guests||[]).filter(g=>g.paid).reduce((a,g)=>a+evHeads(g),0)*evNum(e.coverPrice);
const evCost=e=>(e.costs||[]).reduce((a,c)=>a+evNum(c.amount),0);
/* projected uses what's promised, banked uses what's actually in the account.
   Showing only one of them is how an event "breaks even" on paper and doesn't. */
const evNetProjected=e=>evSponsorPromised(e)+evCoverDue(e)-evCost(e);
const evNetBanked=e=>evSponsorPaid(e)+evCoverPaid(e)-evCost(e);
const evDaysOut=e=>{ if(!e.date) return null;
  const d=new Date(e.date+'T12:00:00'); if(isNaN(d)) return null;
  return Math.round((d-new Date(isoOf(new Date())+'T12:00:00'))/864e5); };
const evOverdue=e=>(e.milestones||[]).filter(m=>!m.done&&m.due&&m.due<isoOf(new Date()));
const evUpcomingEvents=list=>(list||[]).filter(e=>e.status!=='done')
  .sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));

/* Every meeting in one place. The dashboard drilldown answers "what's the state
   of this month"; this answers "where is everything and let me fix it". Same
   derived model (meetingsOf) and the same mutators, so nothing here can drift
   from what the dashboard reports. */
function MeetingsPage({leads,setMeetingStatus,setMeetingTime,tagMeetingType,removeMeeting,open,settings,rep,myUser,myUid}){
  const [tab,setTab]=useState('upcoming');
  const [q,setQ]=useState('');
  const [who,setWho]=useState('all');
  const Blank=({t})=><div className="empty" style={{padding:'26px 4px'}}>{t}</div>;

  const rows=useMemo(()=>allMeetings(leads),[leads]);
  const owners=useMemo(()=>[...new Set(rows.map(r=>r.m.who).filter(Boolean))].sort(),[rows]);
  const buckets={
    upcoming:r=>isUpcoming(r.m),
    needs:r=>needsStatus(r.m),
    undated:r=>needsDate(r.m),
    held:r=>r.m.status==='held',
    noshow:r=>r.m.status==='noshow',
  };
  const pass=r=>{
    if(who!=='all'&&r.m.who!==who) return false;
    const t=q.trim().toLowerCase(); if(!t) return true;
    const l=r.lead;
    return [l.name,l.company,r.m.title,r.m.mtype].some(v=>String(v||'').toLowerCase().includes(t));
  };
  const counts=Object.keys(buckets).reduce((o,k)=>{o[k]=rows.filter(r=>buckets[k](r)&&pass(r)).length;return o;},{});
  const list=useMemo(()=>{
    const f=rows.filter(r=>buckets[tab](r)&&pass(r));
    /* upcoming reads soonest-first because it's a to-do list; history reads
       newest-first because that's how you look back */
    const dir=tab==='upcoming'?1:-1;
    return f.sort((a,b)=>tab==='undated'
      ? (b.m.createdAt||'').localeCompare(a.m.createdAt||'')
      : dir*((a.m.start||'').localeCompare(b.m.start||'')));
  },[rows,tab,q,who]);

  const TABS=[['upcoming','Upcoming'],['needs','Needs status'],['undated','Needs a date'],['held','Held'],['noshow','No-shows']];
  return (<>
    <div className="sec-h"><div><h2>Meetings</h2>
      <div className="meta">Everything booked, everywhere — fix a date, mark what happened, cancel</div></div></div>

    {/* A rep paid per appointment needs to see the appointments and the money in
        the same place, or checking a payslip means opening leads one at a time.
        Nothing here is a company figure — it is their own meetings at their own
        rate. */}
    {rep&&payModels(myUser||{}).appointment&&(()=>{
      const rate=num((myUser||{}).appointment_rate);
      const e=apptEarnings(leads,myUid,rate);
      return (<div className="card mtg-pay">
        <div className="mtg-pay-l"><b>{usd(rate)} per appointment</b>
          <span className="subcell">paid once a meeting is marked <b>held</b> — cancelled and no-shows pay nothing</span></div>
        <div className="mtg-pay-r">
          <span><em>{e.pending.length}</em> awaiting approval · {usd(e.pendingTotal)}</span>
          <span><em>{e.approved.length}</em> approved · {usd(e.approvedTotal)}</span>
        </div>
      </div>); })()}

    <div className="card" style={{marginBottom:16}}>
      <div className="mtg-filters">
        <input className="mtg-q" placeholder="Search a name, company or title" value={q} onChange={e=>setQ(e.target.value)}/>
        {owners.length>1&&<select value={who} onChange={e=>setWho(e.target.value)}>
          <option value="all">Everyone</option>{owners.map(o=><option key={o} value={o}>{o}</option>)}
        </select>}
      </div>
      <div className="mtabs" style={{marginTop:12}}>
        {TABS.map(([k,label])=>(
          <button key={k} className={'mtab'+(tab===k?' on':'')+(k==='needs'&&counts.needs>0?' alert':'')+(k==='undated'&&counts.undated>0?' undated':'')}
            onClick={()=>setTab(k)}>{label}<span className="mtab-n">{counts[k]}</span></button>))}
      </div>
    </div>

    <div className="card">
      {list.length?list.map(({lead,m})=>(
        <div className={'mrow'+(m.status==='held'?' held':'')+(m.status==='noshow'?' noshow':'')+(needsStatus(m)?' needs':'')+(needsDate(m)?' undated':'')} key={m.id}>
          <div className="mrow-l">
            <button className="mrow-name" onClick={()=>open&&open(lead.id)}>{lead.name||lead.company||'Unnamed'}</button>
            <div className="mrow-sub">
              {needsDate(m)?<><span className="mtg-undated">no date set</span> · logged {fmtDate(m.createdAt||m.start)}</>
                           :fmtMeetingTime(m.start)}
              {m.who?` · ${m.who}`:''}
              {m.title&&m.title!==m.mtype?` · ${m.title}`:''}
              {m.location?<span className="mtg-loc"><MapPin size={11}/>{m.location}</span>:null}
              {needsStatus(m)&&<span className="mtg-flag"> · did this happen?</span>}
              {/* The fee state, on the meeting it belongs to. Only for the rep
                  who SET it — the fee follows the setter, not the lead. */}
              {rep&&payModels(myUser||{}).appointment&&setterOf(m)===myUid&&(()=>{
                const st=feeState(m); if(!st||st==='void') return null;
                const amt=feeRateOf(m,num((myUser||{}).appointment_rate));
                return <span className={'mtg-fee '+st}> · {usd(amt)} {st==='pending'?'awaiting approval':st}</span>; })()}
            </div>
          </div>
          <div className="mrow-r">
            <select className="mrow-type" value={m.mtype||'Other'} onChange={e=>tagMeetingType(lead.id,m.id,e.target.value)}>
              {MEETING_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            {needsDate(m)
              ? <DateFix compact onSet={(v,mins)=>setMeetingTime(lead.id,m.id,v,mins)}/>
              : <div className="mtg-status">
                  <button className={'ms-b held'+(m.status==='held'?' on':'')} onClick={()=>setMeetingStatus(lead.id,m.id,'held')}><CheckCircle2 size={12}/>Held</button>
                  <button className={'ms-b no'+(m.status==='noshow'?' on':'')} onClick={()=>setMeetingStatus(lead.id,m.id,'noshow')}><X size={12}/>No-show</button>
                </div>}
            {m.htmlLink&&<a className="mrow-cal" href={m.htmlLink} target="_blank" rel="noreferrer" title="Open in Google Calendar"><CalendarClock size={14}/></a>}
            <button className="ev-x" title="Cancel this meeting" onClick={()=>{
              if(window.confirm(`Cancel ${m.title||m.mtype||'this meeting'} with ${lead.name||lead.company}?\n\nIt comes off your numbers and the calendar. The booking stays in their history, marked cancelled.`))
                removeMeeting(lead.id,m.id); }}><Trash2 size={13}/></button>
          </div>
        </div>)):<Blank t={
          tab==='upcoming'?'Nothing on the books.':
          tab==='needs'?'Nothing waiting on a status. Clean.':
          tab==='undated'?'Every meeting has a real date on it.':
          tab==='noshow'?'No no-shows. Nice.':'Nothing here yet.'}/>}
    </div>
  </>);
}

/* Who you've worked with, what they gave, and — the point of the page — who to
   ask next. A list of past sponsors is a record; lapsed and never-asked are the
   two lists that actually produce a phone call. */
function SponsorsPage({leads,events,open,goEvents}){
  const [tab,setTab]=useState('sponsors');
  const Blank=({t})=><div className="empty" style={{padding:'26px 4px'}}>{t}</div>;
  const nextEvent=useMemo(()=>evUpcomingEvents(events||[])[0]||null,[events]);
  const onNext=useMemo(()=>new Set((nextEvent?nextEvent.slots||[]:[])
    .filter(sl=>sl.contactId).map(sl=>sl.contactId)),[nextEvent]);

  const rows=useMemo(()=>(leads||[]).map(l=>{
      const hist=sponsorshipsOf(l,events||[]);
      if(!hist.length) return null;
      const total=hist.reduce((a,x)=>a+x.amount,0);
      const owed=hist.filter(x=>!x.paid).reduce((a,x)=>a+x.amount,0);
      const dates=hist.map(x=>x.date).filter(Boolean).sort();
      return { l, hist, total, owed, n:hist.length,
        first:dates[0]||'', last:dates[dates.length-1]||'',
        booked:onNext.has(l.id),
        /* what they sponsor repeatedly — a catering sponsor twice is a
           catering sponsor, and that's what you lead with next time */
        usual:(()=>{ const c={}; hist.forEach(x=>{ const k=(x.label||'').trim(); if(k) c[k]=(c[k]||0)+1; });
          const top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0]; return top&&top[1]>1?top[0]:''; })() };
    }).filter(Boolean).sort((a,b)=>b.total-a.total),[leads,events,onNext]);

  /* sponsored before, not on the next event — the outreach list */
  const lapsed=rows.filter(r=>!r.booked);
  /* warm contacts who have never sponsored, best first */
  const neverAsked=useMemo(()=>(leads||[])
    .filter(l=>!sponsorshipsOf(l,events||[]).length&&(l.isRelationship||l.isClient||l.potentialSponsor))
    .sort((a,b)=>{ const w=x=>(x.isClient?2:0)+(x.potentialSponsor?1:0);
      return w(b)-w(a)||String(a.name||a.company||'').localeCompare(String(b.name||b.company||'')); })
    .slice(0,20),[leads,events]);

  const given=rows.reduce((a,r)=>a+r.total,0);
  const owedAll=rows.reduce((a,r)=>a+r.owed,0);
  const repeat=rows.filter(r=>r.n>1).length;

  const Row=({r})=>(<div className="sp-lrow" key={r.l.id}>
    <div className="sp-lm">
      <button className="mrow-name" onClick={()=>open&&open(r.l.id)}>{r.l.name||r.l.company||'Unnamed'}</button>
      <div className="subcell">
        {r.n} sponsorship{r.n===1?'':'s'}
        {r.last?` · last ${fmtDate(r.last)}`:''}
        {r.usual?` · usually ${r.usual}`:''}
        {r.owed>0?<span className="mtg-flag"> · {usd(r.owed)} owed</span>:null}
      </div>
    </div>
    {r.booked?<span className="sp-on">On the next one</span>
             :nextEvent?<button className="sp-ask" onClick={()=>goEvents&&goEvents()}>Add to {nextEvent.name||'next event'}</button>:null}
    <span className="drow-v">{usd(r.total)}</span>
  </div>);

  return (<>
    <div className="sec-h"><div><h2>Sponsors</h2>
      <div className="meta">Who you've worked with, what they've given, and who to call next</div></div></div>

    <div className="kgrid" style={{marginBottom:16}}>
      <Kpi variant="accent" label="Given all time" value={usd(given)} icon={<Handshake size={14}/>}
        d={`${rows.length} sponsor${rows.length===1?'':'s'}`}/>
      <Kpi label="Came back" value={repeat} icon={<RefreshCw size={14}/>}
        d={rows.length?`${Math.round(repeat/rows.length*100)}% sponsored more than once`:'no history yet'}/>
      <Kpi variant={lapsed.length?'gold':undefined} label="Not on the next one" value={lapsed.length} icon={<Clock size={14}/>}
        d={nextEvent?(nextEvent.name||'next event'):'no event scheduled'}/>
      <Kpi variant={owedAll>0?'gold':undefined} label="Still owed" value={usd(owedAll)} icon={<DollarSign size={14}/>}
        d={owedAll>0?'promised, not collected':'all collected'}/>
    </div>

    <div className="seg" style={{marginBottom:14}}>
      {[['sponsors',`All sponsors · ${rows.length}`],
        ['lapsed',`Not on the next one · ${lapsed.length}`],
        ['never',`Never asked · ${neverAsked.length}`]].map(([k,l])=>
        <button key={k} className={'seg-b '+(tab===k?'on':'')} onClick={()=>setTab(k)}>{l}</button>)}
    </div>

    <div className="card">
      {tab==='sponsors'&&(rows.length?rows.map(r=><Row key={r.l.id} r={r}/>)
        :<Blank t="Nobody has sponsored yet. Attach a sponsor to an event slot and they'll appear here."/>)}
      {tab==='lapsed'&&(lapsed.length?lapsed.map(r=><Row key={r.l.id} r={r}/>)
        :<Blank t={nextEvent?'Every past sponsor is on the next one. Good.':'No upcoming event to compare against.'}/>)}
      {tab==='never'&&(neverAsked.length?neverAsked.map(l=>(<div className="sp-lrow" key={l.id}>
          <div className="sp-lm">
            <button className="mrow-name" onClick={()=>open&&open(l.id)}>{l.name||l.company||'Unnamed'}</button>
            <div className="subcell">{l.isClient?'Client':l.isRelationship?'Relationship':'Lead'}
              {l.potentialSponsor?' · flagged as a potential sponsor':''}</div>
          </div>
        </div>)):<Blank t="Everyone warm has already been asked."/>)}
    </div>
  </>);
}

function EventsPage({events,saveEvent,removeEvent,leads,quickLead,open,me}){
  const [sheetBusy,setSheetBusy]=useState(false);
  const [sheetErr,setSheetErr]=useState('');
  const [plan,setPlan]=useState(null);      // preview, before anything is written
  const [heads,setHeads]=useState([]);
  /* Dashboard's Empty is a local const inside that component, not a shared one.
     Kpi below IS module-level and a function declaration, so it hoists fine. */
  const Blank=({t})=><div className="empty" style={{padding:'18px 4px'}}>{t}</div>;
  const [sel,setSel]=useState(null);
  const [tab,setTab]=useState('slots');
  const [pick,setPick]=useState('');
  const ev=events.find(e=>e.id===sel)||null;
  const set=patch=>{ if(!ev) return; saveEvent({...ev,...patch}); };
  const put=(key,id,patch)=>set({[key]:(ev[key]||[]).map(x=>x.id===id?{...x,...patch}:x)});
  const del=(key,id)=>set({[key]:(ev[key]||[]).filter(x=>x.id!==id)});
  const add=(key,row)=>set({[key]:[...(ev[key]||[]),row]});

  const create=()=>{ const e=blankEvent(); saveEvent(e); setSel(e.id); setTab('slots'); };

  /* Read the sheet and show what would happen. Nothing is written here — the
     import is a second, explicit step, because a mis-mapped column would
     otherwise dump a hundred junk leads into the CRM with no undo. */
  const readSheet=async()=>{
    if(!ev) return; setSheetErr(''); setPlan(null); setSheetBusy(true);
    try{
      const r=await apiPost('/api/sheet-read',{sheet:ev.sheetUrl,tab:ev.sheetTab||''});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'Could not read that sheet.');
      const hs=j.headers||[];
      setHeads(hs);
      const map=(ev.sheetMap&&ev.sheetMap.name)?ev.sheetMap:guessMap(hs);
      const rows=(j.rows||[]).map(row=>{ const o={}; hs.forEach((h,i)=>{o[h]=row[i];}); return o; });
      if(!ev.sheetMap||!ev.sheetMap.name||ev.sheetTab!==j.tab) set({sheetMap:map,sheetTab:j.tab});
      setPlan({...planImport(rows,map,ev.guests,leads),rows,map,tab:j.tab});
    }catch(e){ setSheetErr(e.message||'Could not read that sheet.'); }
    setSheetBusy(false);
  };
  /* Re-plan locally when the mapping changes — no second network call. */
  const remap=(k,v)=>{ if(!plan) return; const map={...plan.map,[k]:v};
    set({sheetMap:map}); setPlan({...planImport(plan.rows,map,ev.guests,leads),rows:plan.rows,map,tab:plan.tab}); };

  const runImport=(includeUnsure)=>{
    if(!plan||!ev) return;
    const take=[...plan.matched,...plan.fresh,...(includeUnsure?plan.unsure:[])];
    if(!take.length) return;
    const added=take.map(g=>{
      let leadId=g.leadId||'';
      if(!leadId){ const lead=quickLead(g.name,ev.name||'Event',{email:g.email,phone:g.phone}); leadId=lead.id; }
      return {id:uid(),contactId:leadId,name:g.name,status:'invited',paid:false,
        plusOnes:g.plusOnes||0,notes:g.notes||'',srcKey:g.srcKey};
    });
    set({guests:[...(ev.guests||[]),...added],sheetSyncedAt:new Date().toISOString()});
    setPlan(null);
  };
  /* moving the date drags every unmet milestone with it, using the offset it was
     created with. Done ones stay put — they happened when they happened. */
  const setDate=d=>set({date:d, milestones:(ev.milestones||[]).length
    ? ev.milestones.map(m=>m.done||m.offset===undefined?m:{...m,due:shiftDay(d,m.offset)})
    : seedMilestones(d)});

  const pool=useMemo(()=>[...(leads||[])].sort((a,b)=>(a.name||a.company||'').localeCompare(b.name||b.company||'')),[leads]);
  const nameOf=l=>l.name||l.company||'Unnamed';
  const attach=(kind,slotId)=>{
    if(!pick) return;
    if(pick.startsWith('new:')){
      const nm=pick.slice(4).trim(); if(!nm) return;
      const lead=quickLead(nm,ev.name||'Event');
      if(kind==='slot') put('slots',slotId,{contactId:lead.id,contactName:nm});
      else add('guests',{id:uid(),contactId:lead.id,name:nm,status:'invited',paid:false,plusOnes:0,notes:''});
    } else {
      const l=pool.find(x=>x.id===pick); if(!l) return;
      if(kind==='slot') put('slots',slotId,{contactId:l.id,contactName:nameOf(l)});
      else add('guests',{id:uid(),contactId:l.id,name:nameOf(l),status:'invited',paid:false,plusOnes:0,notes:''});
    }
    setPick('');
  };
  const Picker=({onPick})=>(<div className="ev-pick">
    <select value={pick.startsWith('new:')?'':pick} onChange={e=>setPick(e.target.value)}>
      <option value="">Pick from your CRM…</option>
      {pool.map(l=><option key={l.id} value={l.id}>{nameOf(l)}{l.isClient?' · client':l.isRelationship?' · relationship':''}</option>)}
    </select>
    <span className="ev-or">or</span>
    <input placeholder="Type a new name" value={pick.startsWith('new:')?pick.slice(4):''}
      onChange={e=>setPick('new:'+e.target.value)}/>
    <button className="btn btn-p btn-sm" disabled={!pick} onClick={onPick}>Add</button>
  </div>);

  if(!ev) return (<>
    <div className="sec-h"><div><h2>Events</h2><div className="meta">Suite nights and anything else you put on</div></div>
      <button className="btn btn-p" onClick={create}><Plus size={15}/>New event</button></div>
    {events.length?<div className="ev-grid">{evUpcomingEvents(events).concat(events.filter(e=>e.status==='done')).map(e=>{
      const out=evDaysOut(e), left=evSeatsLeft(e), od=evOverdue(e).length;
      return (<button key={e.id} className={'ev-card'+(e.status==='done'?' done':'')} onClick={()=>{setSel(e.id);setTab('slots');}}>
        <div className="ev-when">{e.date?fmtDate(e.date):'No date'}{out!==null&&e.status!=='done'?` · ${out===0?'today':out>0?`in ${out}d`:`${-out}d ago`}`:''}</div>
        <div className="ev-name">{e.name||'Untitled event'}</div>
        <div className="ev-venue">{e.venue||'No venue'}</div>
        <div className="ev-stats">
          <span>{left>0?`${left} seats left`:left===0?'Full':`${-left} over`}</span>
          <span>{evFilled(e).length}/{(e.slots||[]).length||0} sponsors</span>
          <span className={evNetProjected(e)>=0?'good':'bad'}>{usd(evNetProjected(e))}</span>
        </div>
        {od>0&&<div className="ev-late"><AlertTriangle size={12}/>{od} milestone{od===1?'':'s'} overdue</div>}
      </button>);})}</div>
      :<Blank t="No events yet. Create one and the timeline builds itself."/>}
  </>);

  const left=evSeatsLeft(ev), out=evDaysOut(ev);
  return (<>
    <div className="sec-h">
      <div><button className="linkbtn" onClick={()=>setSel(null)}>&#8592; All events</button>
        <h2 style={{marginTop:4}}>{ev.name||'Untitled event'}</h2>
        <div className="meta">{ev.venue||'No venue'}{ev.date?` · ${fmtDate(ev.date)}`:''}{out!==null?` · ${out===0?'today':out>0?`${out} days out`:`${-out} days ago`}`:''}</div></div>
      <button className="btn btn-g" onClick={()=>{ if(window.confirm('Delete this event and everything on it?')) {removeEvent(ev.id); setSel(null);} }}><Trash2 size={15}/>Delete</button>
    </div>

    <div className="kgrid" style={{marginBottom:18}}>
      <Kpi variant="accent" label="Seats left" value={left} icon={<Users size={14}/>}
        d={`${evSeatsTaken(ev)} of ${evNum(ev.seatsTotal)} spoken for`}/>
      <Kpi label="Sponsors" value={`${evFilled(ev).length}/${(ev.slots||[]).length||0}`} icon={<Handshake size={14}/>}
        d={`${usd(evSponsorPromised(ev))} promised · ${usd(evSponsorPaid(ev))} in`}/>
      <Kpi variant={evNetProjected(ev)>=0?'green':'gold'} label="Projected net" value={usd(evNetProjected(ev))} icon={<DollarSign size={14}/>}
        d={`${usd(evCost(ev))} out · ${usd(evNetBanked(ev))} banked so far`}/>
      <Kpi label="Confirmed" value={evTakenGuests(ev).reduce((a,g)=>a+evHeads(g),0)} icon={<CheckCircle2 size={14}/>}
        d={`${(ev.guests||[]).length} on the list`}/>
    </div>

    <div className="card" style={{marginBottom:18}}>
      <div className="fgrid">
        <div className="field"><label>Event name</label><input value={ev.name} onChange={e=>set({name:e.target.value})} placeholder="Suite Night · August"/></div>
        <div className="field"><label>Venue</label><input value={ev.venue} onChange={e=>set({venue:e.target.value})} placeholder="Equity Bank Park"/></div>
        <div className="field"><label>Date</label><input type="date" value={ev.date} onChange={e=>setDate(e.target.value)}/></div>
        <div className="field"><label>Seats in total</label><input type="number" value={ev.seatsTotal} onChange={e=>set({seatsTotal:e.target.value})}/></div>
        <div className="field"><label>House seats</label><input type="number" value={ev.houseSeats} onChange={e=>set({houseSeats:e.target.value})}/></div>
        <div className="field"><label>Seats per sponsor</label><input type="number" value={ev.sponsorSeatEach} onChange={e=>set({sponsorSeatEach:e.target.value})}/></div>
        <div className="field"><label>Cover per head</label><input type="number" value={ev.coverPrice} onChange={e=>set({coverPrice:e.target.value})}/></div>
        <div className="field"><label>Status</label><select value={ev.status} onChange={e=>set({status:e.target.value})}>
          <option value="planning">Planning</option><option value="done">Done</option></select></div>
      </div>
    </div>

    <div className="seg" style={{marginBottom:14}}>
      {[['slots','Sponsors'],['guests','Guest list'],['plan','Timeline'],['money','Money']].map(([k,l])=>
        <button key={k} className={'seg-b '+(tab===k?'on':'')} onClick={()=>setTab(k)}>{l}</button>)}
    </div>

    {tab==='slots'&&<div className="card">
      {(ev.slots||[]).map(sl=>(<div className="ev-row" key={sl.id}>
        <input className="ev-lab" value={sl.label} placeholder="What they're sponsoring" onChange={e=>put('slots',sl.id,{label:e.target.value})}/>
        <input className="ev-amt" type="number" value={sl.price} placeholder="0" onChange={e=>put('slots',sl.id,{price:e.target.value})}/>
        {sl.contactName
          ? <span className="ev-who" onClick={()=>sl.contactId&&open&&open(sl.contactId)}>{sl.contactName}
              <button className="ev-x" onClick={e=>{e.stopPropagation();put('slots',sl.id,{contactId:'',contactName:''});}}><X size={12}/></button></span>
          : <Picker onPick={()=>attach('slot',sl.id)}/>}
        <label className={'ev-paid'+(sl.paid?' on':'')}><input type="checkbox" checked={!!sl.paid} onChange={e=>put('slots',sl.id,{paid:e.target.checked})}/>Paid</label>
        <button className="ev-x" onClick={()=>del('slots',sl.id)}><Trash2 size={13}/></button>
      </div>))}
      <button className="deal-add-btn" onClick={()=>add('slots',{id:uid(),label:'',price:'',contactId:'',contactName:'',paid:false})}><Plus size={15}/>Add a sponsor slot</button>
    </div>}

    {tab==='guests'&&<div className="card">
      <div className="sheet-box">
        <div className="sheet-h"><Sheet size={14}/>Pull the guest list from a Google Sheet
          {ev.sheetSyncedAt&&<span className="sheet-when">last synced {fmtDate(ev.sheetSyncedAt.slice(0,10))}</span>}</div>
        <div className="sheet-row">
          <input placeholder="Paste the Google Sheet link" value={ev.sheetUrl||''} onChange={e=>set({sheetUrl:e.target.value})}/>
          <input className="sheet-tab" placeholder="Tab (optional)" value={ev.sheetTab||''} onChange={e=>set({sheetTab:e.target.value})}/>
          <button className="btn btn-p btn-sm" disabled={!ev.sheetUrl||sheetBusy} onClick={readSheet}>
            {sheetBusy?<Loader2 size={14} className="spin"/>:<RefreshCw size={14}/>}{sheetBusy?'Reading…':'Check the sheet'}</button>
        </div>
        {sheetErr&&<div className="mtg-err" style={{marginTop:8}}>{sheetErr}</div>}
        {plan&&<div className="sheet-plan">
          <div className="sheet-map">
            {[['name','Name'],['email','Email'],['phone','Phone'],['plus','Plus-ones'],['notes','Notes']].map(([k,l])=>(
              <label key={k}><span>{l}</span>
                <select value={plan.map[k]||''} onChange={e=>remap(k,e.target.value)}>
                  <option value="">—</option>
                  {heads.map(h=><option key={h} value={h}>{h}</option>)}
                </select></label>))}
          </div>
          <div className="sheet-tally">
            <span className="fresh"><b>{plan.fresh.length}</b> new, will be added as leads</span>
            <span className="match"><b>{plan.matched.length}</b> already in the CRM</span>
            <span className="dupe"><b>{plan.already.length}</b> already on this list</span>
            {plan.unsure.length>0&&<span className="unsure"><b>{plan.unsure.length}</b> need a look</span>}
            {plan.skipped>0&&<span className="skip"><b>{plan.skipped}</b> rows with no name or email</span>}
          </div>
          {plan.unsure.length>0&&<div className="sheet-unsure">
            {plan.unsure.slice(0,6).map((u,i)=><div key={i}><b>{u.name}</b> — {u.why}</div>)}
            {plan.unsure.length>6&&<div>…and {plan.unsure.length-6} more</div>}
          </div>}
          <div className="sheet-acts">
            <button className="btn btn-p btn-sm" disabled={!plan.fresh.length&&!plan.matched.length}
              onClick={()=>runImport(false)}>Add {plan.fresh.length+plan.matched.length} to the guest list</button>
            {plan.unsure.length>0&&<button className="btn btn-g btn-sm" onClick={()=>runImport(true)}>
              Add those {plan.unsure.length} too</button>}
            <button className="linkbtn" onClick={()=>setPlan(null)}>Cancel</button>
          </div>
        </div>}
      </div>
      <Picker onPick={()=>attach('guest')}/>
      {(ev.guests||[]).length?(ev.guests||[]).map(g=>(<div className="ev-row" key={g.id}>
        <span className="ev-who" onClick={()=>g.contactId&&open&&open(g.contactId)}>{g.name}</span>
        <select className="ev-st" value={g.status} onChange={e=>put('guests',g.id,{status:e.target.value})}>
          {GUEST_STATUS.map(([k,l])=><option key={k} value={k}>{l}</option>)}
        </select>
        <label className="ev-plus">+<input type="number" min="0" value={g.plusOnes} onChange={e=>put('guests',g.id,{plusOnes:e.target.value})}/></label>
        <label className={'ev-paid'+(g.paid?' on':'')}><input type="checkbox" checked={!!g.paid} onChange={e=>put('guests',g.id,{paid:e.target.checked})}/>Paid</label>
        <button className="ev-x" onClick={()=>del('guests',g.id)}><Trash2 size={13}/></button>
      </div>)):<Blank t="Nobody on the list yet."/>}
    </div>}

    {tab==='plan'&&<div className="card">
      {!(ev.milestones||[]).length&&<div className="ev-seed">
        <span>No timeline yet.</span>
        <button className="btn btn-p btn-sm" disabled={!ev.date} onClick={()=>set({milestones:seedMilestones(ev.date)})}>
          {ev.date?'Build it from the event date':'Set a date first'}</button></div>}
      {(ev.milestones||[]).slice().sort((a,b)=>(a.due||'').localeCompare(b.due||'')).map(m=>{
        const late=!m.done&&m.due&&m.due<isoOf(new Date());
        return (<div className={'ev-row ms'+(m.done?' done':'')+(late?' late':'')} key={m.id}>
          <button className="ev-tick" onClick={()=>put('milestones',m.id,{done:!m.done,doneAt:!m.done?new Date().toISOString():''})}>
            {m.done?<CheckCircle2 size={16}/>:<Circle size={16}/>}</button>
          <input className="ev-lab" value={m.label} onChange={e=>put('milestones',m.id,{label:e.target.value})}/>
          <input className="ev-date" type="date" value={m.due||''} onChange={e=>put('milestones',m.id,{due:e.target.value,offset:undefined})}/>
          <button className="ev-x" onClick={()=>del('milestones',m.id)}><Trash2 size={13}/></button>
        </div>);})}
      <button className="deal-add-btn" onClick={()=>add('milestones',{id:uid(),label:'',due:ev.date||'',done:false,doneAt:''})}><Plus size={15}/>Add your own</button>
    </div>}

    {tab==='money'&&<div className="card">
      {(ev.costs||[]).map(c=>(<div className="ev-row" key={c.id}>
        <input className="ev-lab" value={c.label} placeholder="What it's for" onChange={e=>put('costs',c.id,{label:e.target.value})}/>
        <input className="ev-amt" type="number" value={c.amount} placeholder="0" onChange={e=>put('costs',c.id,{amount:e.target.value})}/>
        <button className="ev-x" onClick={()=>del('costs',c.id)}><Trash2 size={13}/></button>
      </div>))}
      <button className="deal-add-btn" onClick={()=>add('costs',{id:uid(),label:'',amount:''})}><Plus size={15}/>Add a cost</button>
      <div className="ev-sum">
        <div><span>Costs</span><b>{usd(evCost(ev))}</b></div>
        <div><span>Sponsors promised</span><b>{usd(evSponsorPromised(ev))}</b></div>
        <div><span>Cover due</span><b>{usd(evCoverDue(ev))}</b></div>
        <div className="tot"><span>Projected net</span><b className={evNetProjected(ev)>=0?'good':'bad'}>{usd(evNetProjected(ev))}</b></div>
        <div className="tot"><span>Actually banked</span><b className={evNetBanked(ev)>=0?'good':'bad'}>{usd(evNetBanked(ev))}</b></div>
      </div>
    </div>}
  </>);
}

/* ===================== PIPELINE (cleaner kanban) ===================== */
function Pipeline({leads,stages,open,updateLead,settings,clients,setClientPhase,rep}){
  const [board,setBoard]=useState('leads');
  const [dragId,setDragId]=useState(null);const [over,setOver]=useState(null);const [expanded,setExpanded]=useState({});
  const drop=stage=>{if(dragId)updateLead(dragId,{stage});setDragId(null);setOver(null);};
  const move=(l,dir)=>{const i=sIdx(l.stage,stages);const j=i+dir;if(j<0||j>=stages.length)return;updateLead(l.id,{stage:stages[j].key});};
  const openLeads=leads.filter(l=>sOf(l.stage,stages).open);
  /* clients with money still on the table — their stage says won, but the deal
     hasn't been closed out yet, so it's live pipeline like anything else */
  const upsellLeads=leads.filter(l=>upsellValueOf(l)>0);
  const upsellTotal=upsellLeads.reduce((a,l)=>a+upsellValueOf(l),0);
  const totalOpen=openLeads.reduce((a,l)=>a+num(l.dealValue),0)+upsellTotal;
  const weighted=openLeads.reduce((a,l)=>a+num(l.dealValue)*(sOf(l.stage,stages).prob||0),0)
    +upsellTotal*Math.max(0,...(stages||[]).filter(x=>x.open).map(x=>num(x.prob)));
  const wonC=leads.filter(l=>sOf(l.stage,stages).won).length;
  const lostC=leads.filter(l=>sOf(l.stage,stages).lost).length;
  const winRate=(wonC+lostC)?Math.round(wonC/(wonC+lostC)*100):0;
  const Card=({l})=>{ const i=sIdx(l.stage,stages); const st=sOf(l.stage,stages); const od=l.followUp&&daysUntil(l.followUp)<0; const stale=st.open&&daysSince(lastContact(l))>=7;
    return (<div className={'kcard'+(od?' od':'')+(dragId===l.id?' dragging':'')} draggable onDragStart={()=>setDragId(l.id)} onDragEnd={()=>{setDragId(null);setOver(null);}} onClick={()=>open(l.id)}>
      <div className="kcard-top">
        <div className="kn"><span className="dot" style={{background:(PRIORITIES[l.priority]||PRIORITIES.medium).color}}/>{l.name||'(no name)'}</div>
        {l.owner&&<span className="kown" title={l.owner}>{l.owner[0].toUpperCase()}</span>}
      </div>
      <div className="kco">{l.company||l.businessType}</div>
      {(l.serviceInterest||[]).length>0&&<div className="ktags">{(l.serviceInterest||[]).slice(0,2).map(s2=><span key={s2} className="tag">{s2}</span>)}</div>}
      <div className="kmeta">
        <span className="kvals">{l.dealValue>0&&<span className="kdv">{usd(l.dealValue)}</span>}{l.retainerActive&&num(l.retainer)>0&&<span className="kmrr">{usd(l.retainer)}/mo</span>}</span>
        {l.followUp&&<Due iso={l.followUp}/>}
      </div>
      {stale&&<div className="kstale"><AlertTriangle size={11}/>{daysSince(lastContact(l))}d no contact</div>}
      <div className="kmove" onClick={e=>e.stopPropagation()}>
        <button className="kmv" disabled={i<=0} onClick={()=>move(l,-1)} title="Move back a stage"><ChevronLeft size={16}/></button>
        <span className="kmv-s">{st.label}</span>
        <button className="kmv" disabled={i>=stages.length-1} onClick={()=>move(l,1)} title="Advance a stage"><ChevronRight size={16}/></button>
      </div>
    </div>);
  };
  return (<>
    <div className="seg" style={{marginBottom:16}}>
      <button className={board==='leads'?'on':''} onClick={()=>setBoard('leads')}>Leads<i>{openLeads.length}</i></button>
      <button className={board==='clients'?'on':''} onClick={()=>setBoard('clients')}>Clients<i>{(clients||[]).length}</i></button>
    </div>
    {board==='clients'
     ? ((clients||[]).length?<ClientBoard clients={clients} settings={settings} stages={stages} setClientPhase={setClientPhase} onCard={id=>open(id)}/>:<div className="empty">No clients yet. Move a lead to <b>Signed</b> to start onboarding.</div>)
     : <>
    <div className="kgrid" style={{marginBottom:18}}>
      <Kpi variant="accent" label={rep?'Your Open Pipeline':'Open Pipeline'} value={usd(totalOpen)} icon={<KanbanSquare size={14}/>} d={`${openLeads.length} open deal${openLeads.length===1?'':'s'}`}/>
      <Kpi variant="green" label="Weighted Forecast" value={usd(weighted)} icon={<Target size={14}/>} d="probability-adjusted"/>
      <Kpi label="Win Rate" value={winRate+'%'} icon={<Award size={14}/>} d={`${wonC} won · ${lostC} lost`}/>
    </div>
    <div className="kanban">{stages.map(s=>{const items=leads.filter(l=>l.stage===s.key).sort((a,b)=>num(b.dealValue)-num(a.dealValue)||(a.followUp||'9999').localeCompare(b.followUp||'9999'));const val=items.reduce((a,l)=>a+num(l.dealValue),0);const wtd=val*(s.prob||0);const isClosed=!s.open;const collapsed=isClosed&&!expanded[s.key];
      if(collapsed){ return (<div key={s.key} className="kcol kcollapsed" title={`${s.label} — tap to expand`} onClick={()=>setExpanded(e=>({...e,[s.key]:true}))} onDragOver={e=>{e.preventDefault();setOver(s.key);}} onDragLeave={()=>setOver(c=>c===s.key?null:c)} onDrop={()=>drop(s.key)}>
        <div className="kbar" style={{background:s.color}}/>
        <div className="kcoll-body"><ChevronRight size={15} className="kcoll-exp"/><span className="kcoll-label">{s.label}</span><span className="kc">{items.length}</span></div>
      </div>); }
      return (<div key={s.key} className={'kcol '+(over===s.key?'drag':'')} onDragOver={e=>{e.preventDefault();setOver(s.key);}} onDragLeave={()=>setOver(c=>c===s.key?null:c)} onDrop={()=>drop(s.key)}>
        <div className="kbar" style={{background:s.color}}/>
        <div className="kcol-h"><span className="kt">{s.label}</span><span style={{display:'flex',alignItems:'center',gap:6}}><span className="kc">{items.length}</span>{isClosed&&<button className="kcoll-x" title="Collapse" onClick={e=>{e.stopPropagation();setExpanded(e2=>({...e2,[s.key]:false}));}}><ChevronLeft size={13}/></button>}</span></div>
        <div className="kcol-v">{val>0?usd(val):'—'}{s.open&&val>0&&<span className="kwtd"> · {usd(wtd)} weighted</span>}</div>
        <div className="kcol-body">
          {items.map(l=><Card key={l.id} l={l}/>)}
          {dragId&&over===s.key&&<div className="kdrop">Release to move here</div>}
          {!items.length&&!(dragId&&over===s.key)&&<div className="kdrop">No leads</div>}
        </div>
      </div>);})}</div>
    </>}
  </>);
}

/* ===================== LEADS ===================== */
function Leads({leads,settings,stages,open,saveSettings,importLeads,me,updateLead,rep,myPools,importOpen,setImportOpen,delBatch,users,reassignMany}){
  /* importOpen is owned by App so the sidebar's "Import a list" can open it.
     A local useState here would shadow the prop: the sidebar sets one piece of
     state and the page renders off another, so the modal never appears. */
  /* a rep always has the whole-company view switched off — the database
     wouldn't return anyone else's leads anyway. */
  const canAll=!rep&&teamAccess(settings,me)==='all';
  const [view,setView]=useState('mine');
  const [recent,setRecent]=useState(null);   // null | '1' | '7' | batch id
  const [label,setLabel]=useState('all');
  /* OWNER FILTER. 'all' | a crm_users id | 'none' (nobody owns it).
     Not a new screen: an owner could already see every rep's leads on All, and
     the Owner column is on by default and sortable. The only thing missing was
     going straight to one person's book. */
  const [ownerF,setOwnerF]=useState('all');
  /* Only active people are worth offering — a deactivated rep's leads should be
     found through Unassigned or by name, not by picking a person who cannot
     sign in. */
  const ownerOpts=useMemo(()=>(users||[]).filter(u=>u&&u.active!==false)
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))),[users]);
  /* MATCHES ON owner_id, THE SAME FIELD RLS USES, and deliberately not on the
     owner NAME. A lead carrying a rep's name with a null owner_id is NOT that
     rep's — Postgres will not return it to them — so listing it under their
     name would state the opposite of what the database does. Those leads show
     under "Unassigned", which is the truth, and the hint below counts them. */
  const ownerMatch=l=>{
    if(ownerF==='all') return true;
    if(ownerF==='none') return !l.owner_id;
    return l.owner_id===ownerF;
  };
  /* THE SILENT-NULL DETECTOR, read side. stampOwner() resolves owner_id by
     exact NAME match against crm_users; a miss writes null and the lead lands
     in nobody's book without a word. This counts leads wearing the selected
     person's name that never got their id, so the drift is visible on the same
     screen that caused it rather than in a support conversation weeks later. */
  const ownerSel=ownerOpts.find(u=>u.id===ownerF)||null;
  const orphanedForOwner=useMemo(()=>!ownerSel?0:(leads||[])
    .filter(l=>!l.owner_id&&String(l.owner||'').trim()===String(ownerSel.name||'').trim()).length,[leads,ownerSel]);
  useEffect(()=>{ if(!canAll&&view==='all') setView('mine'); },[canAll,view]);
  useEffect(()=>{ if(!canAll&&ownerF!=='all') setOwnerF('all'); },[canAll,ownerF]);
  /* BATCH SELECTION. Owner-only: moving ownership is an owner action every
     other place it exists (reassignLeads is gated on isOwner). */
  const canBatch=!rep&&typeof reassignMany==='function';
  const [sel,setSel]=useState(()=>new Set());
  const [target,setTarget]=useState('');
  const [confirming,setConfirming]=useState(false);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const counts={mine:leads.filter(l=>l.owner===me).length,pool:leads.filter(l=>isPoolLead(l,rep?myPools:null)).length,all:leads.length};
  /* One chip per import, newest first — "the list I loaded this morning" is a
     click rather than a date guess. createdAt alone can't separate an import
     from leads typed the same afternoon, which is why importBatch exists. */
  const batches=useMemo(()=>{ const m=new Map();
    (leads||[]).forEach(l=>{ if(!l.importBatch)return;
      const cur=m.get(l.importBatch)||{id:l.importBatch,at:l.importedAt||l.createdAt,n:0};
      cur.n++; if((l.importedAt||'')>(cur.at||'')) cur.at=l.importedAt; m.set(l.importBatch,cur); });
    return [...m.values()].sort((a,b)=>(b.at||'').localeCompare(a.at||'')).slice(0,3); },[leads]);
  const recentFilter=l=>{
    if(!recent) return true;
    if(String(recent).startsWith('imp_')) return l.importBatch===recent;
    const t=l.importedAt||l.createdAt;
    return !!t && (Date.now()-new Date(t).getTime())/864e5 <= num(recent);
  };
  /* "Not touched yet" means nobody has REACHED OUT — not that the feed is
     empty. Every lead is born with a "Lead created." note and an import can add
     the note column as a second one, so an empty-array test would always be
     false and the count would read 0 forever. Only a real outbound counts. */
  const untouched=l=>!(l.activities||[]).some(a=>a&&REACHED_TYPES.has(a.type));
  const recentCount=leads.filter(recentFilter).length;
  const toWorkCount=leads.filter(l=>recentFilter(l)&&untouched(l)).length;
  const claim=(e,l)=>{ e.stopPropagation(); if(updateLead) updateLead(l.id,{owner:me}); };
  const customFields=settings.customFields||[];
  const defs=leadColumnDefs(stages,customFields,rep);
  const cols=mergeLeadCols(settings.leadColumns||DEFAULT_LEAD_COLS,customFields).filter(c=>defs[c.key]);
  const visCols=cols.filter(c=>c.visible);
  const setCols=next=>saveSettings({...settings,leadColumns:next});
  const moveCol=(i,d)=>{const j=i+d;if(j<0||j>=cols.length)return;const a=cols.slice();[a[i],a[j]]=[a[j],a[i]];setCols(a);};
  const toggleCol=key=>setCols(cols.map(c=>c.key===key?{...c,visible:!c.visible}:c));
  const [colOpen,setColOpen]=useState(false);
  const [q,setQ]=useState('');const [stage,setStage]=useState('all');const [pri,setPri]=useState('all');const [cold,setCold]=useState('all');const [spon,setSpon]=useState('all');
  const [sortK,setSortK]=useState('followUp');const [dir,setDir]=useState('asc');
  const sortVal=(l,k)=>{
    if(k==='stage') return sIdx(l.stage,stages);
    if(k==='priority') return (PRIORITIES[l.priority]||PRIORITIES.medium).rank;
    if(k==='dealValue') return num(l.dealValue);
    if(k==='lastContacted') return lastContact(l);
    if(k==='followUp') return l.followUp||'9999-99-99';
    if(k.startsWith('cf:')) {const v=l.custom?.[k.slice(3)];return typeof v==='number'?v:(v||'').toString().toLowerCase();}
    return (l[k]||'').toString().toLowerCase();
  };
  const toggleSort=k=>{ if(sortK===k) setDir(d=>d==='asc'?'desc':'asc'); else {setSortK(k);setDir('asc');} };
  const rows=useMemo(()=>{
    let r=scopeLeads(leads,view,me,rep?myPools:null).filter(l=>{
      if(!recentFilter(l))return false;
      if(!ownerMatch(l))return false;
      if(stage!=='all'&&l.stage!==stage)return false;
      if(pri!=='all'&&l.priority!==pri)return false;
      if(cold!=='all'&&daysSince(lastContact(l))<+cold)return false;
      if(spon==='potential'&&!l.potentialSponsor)return false;
      if(spon==='past'&&!l.pastSponsor)return false;
      if(spon==='any'&&!(l.potentialSponsor||l.pastSponsor))return false;
      if(label!=='all'&&!labelsOf(l).includes(label))return false;
      if(q){const s=(l.name+' '+l.company+' '+l.businessType+' '+l.phone+' '+(l.serviceInterest||[]).join(' ')+' '+labelsOf(l).join(' ')+' '+l.source).toLowerCase();if(!s.includes(q.toLowerCase()))return false;}
      return true;
    });
    r.sort((a,b)=>{const av=sortVal(a,sortK),bv=sortVal(b,sortK);const c=av<bv?-1:av>bv?1:0;return dir==='asc'?c:-c;});
    return r;
  },[leads,q,stage,pri,cold,spon,sortK,dir,stages,view,me,recent,label,ownerF]);
  /* Clear the selection whenever the visible set changes. Acting on rows you
     can no longer see is the one way a batch tool does something you did not
     intend, and it is silent when it happens. */
  useEffect(()=>{ setSel(new Set()); setConfirming(false); setResult(null); },
    [view,ownerF,q,stage,pri,cold,spon,label,recent]);
  const rowIds=useMemo(()=>rows.map(l=>l.id),[rows]);
  const allShown=rowIds.length>0&&rowIds.every(id=>sel.has(id));
  const toggleOne=(e,id)=>{ e.stopPropagation();
    setSel(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); };
  /* Selects what is ON SCREEN, never the whole table — the header checkbox sits
     above a filtered list and "all" has to mean the list under it. */
  const toggleAllShown=e=>{ e.stopPropagation();
    setSel(p=>{ if(rowIds.every(id=>p.has(id))) { const n=new Set(p); rowIds.forEach(id=>n.delete(id)); return n; }
      return new Set([...p,...rowIds]); }); };
  const picked=useMemo(()=>rows.filter(l=>sel.has(l.id)),[rows,sel]);
  const targetUser=ownerOpts.find(u=>u.id===target)||null;

  /* WHAT THE CURRENT OWNERS LOSE SIGHT OF.
     Not what they lose — the commission snapshot and the meeting stamps stay
     on the lead, and rep_payouts is a separate table keyed by rep_id. But both
     of a rep's own earnings screens compute over the leads Postgres returns to
     THEM (myCommissions(leads,myUid) and apptEarnings(leads,myUid,rate)), so a
     lead that moves takes its pending money off their screen while still being
     owed. Naming it in the confirm is the difference between a decision and a
     surprise on payday. */
  const impact=useMemo(()=>{
    const by=new Map();
    const at=(id,name)=>{ const k=id||('name:'+name);
      if(!by.has(k)) by.set(k,{id,name:name||'someone',cmsn:0,cmsnN:0,fee:0,feeN:0});
      return by.get(k); };
    picked.forEach(l=>{
      const c=l.commission;
      if(c&&typeof c==='object'&&c.status==='pending'&&num(c.amount)>0){
        const r=at(c.repId,c.repName); r.cmsn+=num(c.amount); r.cmsnN++;
      }
      (l.meetings||[]).forEach(m=>{
        if(feeState(m)!=='pending') return;
        const sid=setterOf(m); if(!sid) return;
        const u=(users||[]).find(x=>x.id===sid);
        /* the rate this meeting actually pays at — frozen once approved, so
           rateOf and not the person's current rate */
        const amt=feeRateOf(m,num(u&&u.appointment_rate));
        if(!(amt>0)) return;
        const r=at(sid,(u&&u.name)||m.setBy); r.fee+=amt; r.feeN++;
      });
    });
    /* only people who are actually losing sight of something, and never the
       person receiving the leads — nothing moves away from them */
    return [...by.values()]
      .filter(r=>(r.cmsnN>0||r.feeN>0)&&(!targetUser||r.id!==targetUser.id))
      .sort((a,b)=>(b.cmsn+b.fee)-(a.cmsn+a.fee));
  },[picked,users,targetUser]);

  const doReassign=async()=>{
    setBusy(true);
    const r=await reassignMany([...sel],targetUser);
    setBusy(false); setConfirming(false); setResult(r);
    if(r&&r.ok){ setSel(new Set()); setTarget(''); }
  };

  const csv=()=>{
    const cols=['name','company','businessType','phone','email','website','stage','priority','source','serviceInterest','nextAction','nextSteps','followUp','expectedClose','owner','dealValue','retainer','retainerActive'];
    const esc=v=>{v=Array.isArray(v)?v.join('; '):(v??'');v=String(v).replace(/"/g,'""');return /[",\n]/.test(v)?`"${v}"`:v;};
    /* REP-AUDIT #14. Same rule in the export as on the screen — otherwise the
       pool's deal values are one CSV button away from the leaderboard the
       column was hidden to prevent. */
    const cell=(l,c)=>(rep&&isPoolLead(l)&&(c==='dealValue'||c==='retainer'||c==='retainerActive'))
      ? '' : (c==='stage'?sOf(l.stage,stages).label:l[c]);
    const head=cols.join(',');const body=rows.map(l=>cols.map(c=>esc(cell(l,c))).join(',')).join('\n');
    const blob=new Blob([head+'\n'+body],{type:'text/csv'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='proytech-leads.csv';a.click();URL.revokeObjectURL(u);
  };
  const Th=({k,children})=>(<th className={sortK===k?'sorted':''} onClick={()=>toggleSort(k)}>{children}<span className="ar">{sortK===k?(dir==='asc'?'▲':'▼'):'↕'}</span></th>);
  return (<>
    {/* A row of chips for "what did I just add". Only shown when there's
        actually something recent, so it stays out of the way otherwise. */}
    {(batches.length>0||leads.some(l=>l.importedAt||daysSince(l.createdAt)<=7))&&(
      <div className="recentbar">
        <span className="rb-l"><Sparkles size={13}/>Recently added</span>
        {[['1','Today'],['7','Last 7 days']].map(([k,label])=>(
          <button key={k} className={'rb '+(recent===k?'on':'')} onClick={()=>setRecent(recent===k?null:k)}>{label}</button>))}
        {batches.map(b=>(
          <button key={b.id} className={'rb '+(recent===b.id?'on':'')} onClick={()=>setRecent(recent===b.id?null:b.id)}>
            <Upload size={12}/>{fmtDate(b.at)} · {b.n}</button>))}
        {recent&&<>
          <span className="rb-n">{recentCount} shown · <b>{toWorkCount}</b> not touched yet</span>
          {/* only for a specific import — never "Today" or "Last 7 days",
              which would sweep up leads typed in by hand */}
          {String(recent).startsWith('imp_')&&delBatch&&
            <button className="rb wipe" onClick={()=>delBatch(recent)}>
              <Trash2 size={12}/>Delete this import</button>}
          <button className="rb clear" onClick={()=>setRecent(null)}>Clear</button>
        </>}
      </div>)}
    <div className="toolbar">
      <ScopeSeg view={view} setView={setView} counts={counts} canAll={canAll}/>
      {/* Owners only. A rep has exactly one owner's leads — their own — so the
          control would be a dropdown with one entry that changes nothing. */}
      {canAll&&ownerOpts.length>0&&(
        <select className="selctl" value={ownerF} onChange={e=>{
          const v=e.target.value; setOwnerF(v);
          /* Picking a person means "show me their book", which cannot be true
             on Mine or Pool. Switching the scope is the only reading of that
             click that returns rows instead of an empty table. */
          if(v!=='all') setView('all');
        }}>
          <option value="all">All owners</option>
          {ownerOpts.map(u=><option key={u.id} value={u.id}>{u.name}{u.role==='owner'?' · owner':''}</option>)}
          <option value="none">Unassigned</option>
        </select>)}
      {/* only shown once something is actually labelled — an empty filter is
          clutter on a fresh install */}
      {(()=>{ const used=[...new Set((leads||[]).flatMap(labelsOf))].sort();
        if(!used.length) return null;
        return (<select className="selctl" value={label} onChange={e=>setLabel(e.target.value)}>
          <option value="all">All labels</option>
          {used.map(x=><option key={x} value={x}>{x} · {(leads||[]).filter(l=>labelsOf(l).includes(x)).length}</option>)}
        </select>); })()}
      <div className="searchbox"><Search size={16} color="#928DAD"/><input placeholder="Search name, company, phone, service…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="selctl" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">All stages</option>{stages.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
      <select className="selctl" value={pri} onChange={e=>setPri(e.target.value)}><option value="all">All priority</option>{Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
      <select className="selctl" value={cold} onChange={e=>setCold(e.target.value)}><option value="all">Any contact age</option><option value="7">Cold · 7+ days</option><option value="14">Cold · 14+ days</option><option value="30">Cold · 30+ days</option></select>
      <select className="selctl" value={spon} onChange={e=>setSpon(e.target.value)}><option value="all">All leads</option><option value="potential">Potential sponsors</option><option value="past">Past sponsors</option><option value="any">Any sponsor</option></select>
      <button className="selctl" onClick={()=>setDir(d=>d==='asc'?'desc':'asc')} title="Toggle direction"><ArrowUpDown size={15}/></button>
      <div className="colmenu-wrap">
        <button className="selctl" onClick={()=>setColOpen(o=>!o)}><SlidersHorizontal size={15}/>Columns</button>
        {colOpen&&<><div className="cm-back" onClick={()=>setColOpen(false)}/><div className="colmenu">
          <div className="cm-row"><span className="cm-name" style={{fontWeight:600,color:INK}}>Name</span><span className="cm-lock">always on</span></div>
          {cols.map((c,i)=>(<div className="cm-row" key={c.key}><input type="checkbox" checked={c.visible} onChange={()=>toggleCol(c.key)}/><span className="cm-name">{defs[c.key]?.label||c.key}</span><button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveCol(i,-1)} disabled={i===0}><ChevronUp size={13}/></button><button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveCol(i,1)} disabled={i===cols.length-1}><ChevronDown size={13}/></button></div>))}
        </div></>}
      </div>
      <button className="btn btn-g" onClick={csv}><Download size={15}/>CSV</button>
      {importLeads&&<button className="btn btn-p" onClick={()=>setImportOpen(true)}><Upload size={15}/>Import</button>}
    </div>
    {/* Drift, said out loud on the screen that causes it. stampOwner() resolves
        owner_id by exact name match; a miss writes null and the lead silently
        belongs to nobody. Counting it here is the difference between noticing
        in ten seconds and noticing when a rep asks where their leads went. */}
    {ownerSel&&orphanedForOwner>0&&(
      <div className="pool-note"><AlertTriangle size={14}/>
        {orphanedForOwner} more {orphanedForOwner===1?'lead carries':'leads carry'} <b>{ownerSel.name}</b>'s name but no owner id, so {orphanedForOwner===1?'it is':'they are'} in nobody's book and {ownerSel.name} cannot see {orphanedForOwner===1?'it':'them'}.
        {' '}<button className="linkbtn inl" onClick={()=>{setOwnerF("none");setView("all");}}>Show unassigned</button>
      </div>)}
    {ownerF==='none'&&(
      <div className="pool-note"><Users size={14}/>Leads with no owner id. Nobody but an owner can see these — a rep is shown leads by owner id, never by the name written on them.</div>)}
    {canBatch&&sel.size>0&&(
      <div className="bulkbar">
        <span className="bb-n"><b>{sel.size}</b> selected</span>
        <select className="selctl" value={target} onChange={e=>{setTarget(e.target.value);setResult(null);}}>
          <option value="">Assign to…</option>
          {ownerOpts.map(u=><option key={u.id} value={u.id}>{u.name}{u.role==='owner'?' · owner':''}</option>)}
          <option value="__pool">Unassign — back to the pool</option>
        </select>
        <button className="btn btn-p btn-sm" disabled={!target||busy} onClick={()=>{setResult(null);setConfirming(true);}}>
          <UserCheck size={14}/>Reassign
        </button>
        <button className="linkbtn inl" onClick={()=>{setSel(new Set());setConfirming(false);}}>Clear selection</button>
      </div>)}

    {/* THE CONFIRM. A styled panel rather than window.confirm because the whole
        point is to NAME what is about to be moved off someone's screen, and a
        browser dialog is one line of unstyled text. */}
    {confirming&&(
      <div className="bulk-confirm">
        <div className="bc-h"><AlertTriangle size={15}/>
          Move <b>{sel.size}</b> {sel.size===1?'lead':'leads'} to <b>{target==='__pool'?POOL_OWNER:(targetUser&&targetUser.name)||'—'}</b>?
        </div>
        {impact.length>0?(
          <div className="bc-body">
            <p className="bc-p">These people keep the money — the commission snapshot and the meeting stamps stay on the lead, and payouts are a separate table. What they lose is <b>sight of it</b>: a rep&rsquo;s earnings screens only show leads the database still returns to them.</p>
            <ul className="bc-list">
              {impact.map(r=>(<li key={r.id||r.name}>
                <b>{r.name}</b>
                {r.cmsnN>0&&<> · {r.cmsnN} pending {r.cmsnN===1?'commission':'commissions'} <b>{usd(r.cmsn)}</b></>}
                {r.feeN>0&&<> · {r.feeN} held {r.feeN===1?'meeting':'meetings'} awaiting approval <b>{usd(r.fee)}</b></>}
              </li>))}
            </ul>
            <p className="bc-p bc-tip">Approving these before moving them keeps them on the rep&rsquo;s screen.</p>
          </div>
        ):(
          <div className="bc-body"><p className="bc-p">Nothing selected carries pending commission or an unapproved held meeting.</p></div>
        )}
        <div className="bc-acts">
          <button className="btn btn-g btn-sm" onClick={()=>setConfirming(false)}>Cancel</button>
          <button className="btn btn-p btn-sm" disabled={busy} onClick={doReassign}>
            {busy?<Loader2 size={14} className="spin"/>:<UserCheck size={14}/>}{busy?'Moving…':`Move ${sel.size}`}
          </button>
        </div>
      </div>)}

    {result&&(
      <div className={'bulk-result'+(result.ok?' good':'')}>
        {result.ok
          ? <><CheckCircle2 size={14}/>Moved {result.n} {result.n===1?'lead':'leads'} to <b>{result.name}</b>.</>
          : <><AlertTriangle size={14}/>{
              result.reason==='ambiguous_name'
                ? <>Nothing was moved. <b>{result.count}</b> active people are named <b>{result.name}</b>, and ownership is resolved by name — assigning would have picked one of them at random. Rename one in Settings → Team first.</>
              : result.reason==='unresolved'
                ? <>Nothing was moved. The name <b>{result.name}</b> did not resolve to a person the database knows, so {result.count===1?'that lead':`all ${result.count} leads`} would have been left owned by nobody and invisible to every rep. Check that <b>{result.name}</b> is an active row in Settings → Team, spelled exactly.</>
              : result.reason==='write_failed'
                ? <>The move failed and nothing was saved: {result.error}</>
              : result.reason==='not_owner' ? <>Only an owner can reassign leads.</>
              : <>Nothing was selected.</>
            }</>}
        <button className="linkbtn inl" onClick={()=>setResult(null)}>Dismiss</button>
      </div>)}

    {view==='pool'&&<div className="pool-note"><Users size={14}/>{rep?`Unclaimed leads in ${(myPools&&myPools.length)?myPools.join(', '):'your pools'}. Claim one and it becomes yours.`:'Unclaimed leads owned by '+POOL_OWNER+'. Claim one and it moves to your list.'}</div>}
    <div className="tbl-wrap"><table className="tbl"><thead><tr>
      {canBatch&&<th className="selcol"><input type="checkbox" checked={allShown} onChange={toggleAllShown} onClick={e=>e.stopPropagation()} title={allShown?'Clear these':'Select the '+rowIds.length+' shown'}/></th>}
      <Th k="name">Name</Th>{visCols.map(c=><Th key={c.key} k={c.key}>{defs[c.key].label}</Th>)}{view==='pool'&&<th></th>}
    </tr></thead><tbody>{rows.map(l=>(<tr key={l.id} className={sel.has(l.id)?'picked':''} onClick={()=>open(l.id,rows.map(r=>r.id))}>
      {/* stopPropagation on the CELL as well as the box: the whole row opens
          the lead, and a click that lands on the padding around the checkbox
          would otherwise open a modal instead of ticking it. */}
      {canBatch&&<td className="selcol" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={sel.has(l.id)} onChange={e=>toggleOne(e,l.id)}/></td>}
      <td><div className="namecell">{l.name}</div><div className="subcell">{l.company}</div></td>
      {visCols.map(c=><td key={c.key}>{defs[c.key].render(l)}</td>)}
      {view==='pool'&&<td style={{textAlign:'right'}}><button className="claim-btn" onClick={e=>claim(e,l)}><UserCheck size={13}/>Claim</button></td>}
    </tr>))}</tbody></table>{!rows.length&&<div className="empty">{view==='mine'?<>No leads assigned to you{q||stage!=='all'?' match those filters':''}. Check the <b>Pool</b> for unclaimed leads{canAll?<> or switch to <b>All</b></>:''}.</>:view==='pool'?'The pool is empty — every lead is claimed.':'No leads match. Adjust filters or add a new lead.'}</div>}</div>
    {importOpen&&<ImportModal onClose={()=>setImportOpen(false)} onImport={arr=>{importLeads(arr);setImportOpen(false);}} businessTypes={settings.options?.businessType||[]}/>}
  </>);
}

/* ===================== CSV IMPORT ===================== */
const IMPORT_FIELDS=[['ignore','— ignore —'],['name','Name'],['company','Company'],['phone','Phone'],['email','Email'],['website','Website'],['businessType','Business type'],['source','Source'],['note','Notes']];
const IMPORT_KEYS=IMPORT_FIELDS.map(f=>f[0]);
const guessField=h=>{const s=(h||'').toLowerCase();
  if(/e-?mail/.test(s))return 'email';
  if(/phone|mobile|cell|tel|number/.test(s))return 'phone';
  if(/web|site|url|domain/.test(s))return 'website';
  if(/company|business\s*name|org|account|dba|firm/.test(s))return 'company';
  if(/first|last|full|contact|name/.test(s))return 'name';
  if(/type|industry|category|vertical/.test(s))return 'businessType';
  if(/source|origin|referr|lead\s*from/.test(s))return 'source';
  if(/note|comment|desc|remark/.test(s))return 'note';
  return 'ignore';};
const parseCSV=text=>{const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(cur);cur='';} else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';} else if(c!=='\r')cur+=c; } }
  if(cur!==''||row.length){row.push(cur);rows.push(row);}
  return rows.filter(r=>r.some(c=>(c||'').trim()!==''));};

function ImportModal({onClose,onImport,businessTypes}){
  /* Sheets and CSV land in the same place: both produce headers + rows and then
     run the same AI mapping, preview and import. The only difference is how the
     bytes arrive, so there's one code path after ingest(). */
  const [src,setSrc]=useState('file');           // file | sheet
  const [sheetUrl,setSheetUrl]=useState('');
  const [sheetTab,setSheetTab]=useState('');
  const [sheetBusy,setSheetBusy]=useState(false);
  const [sheetErr,setSheetErr]=useState('');
  const [headers,setHeaders]=useState(null);
  const [rows,setRows]=useState([]);
  const [mapping,setMapping]=useState({});
  const [markSponsor,setMarkSponsor]=useState(false);
  const [ai,setAi]=useState(null);
  const [fileName,setFileName]=useState('');
  const fileRef=React.useRef(null);
  const ingest=text=>{ const parsed=parseCSV(text); if(parsed.length<2){window.alert('That file needs a header row and at least one data row.');return;}
    const hd=parsed[0].map(h=>(h||'').trim()); const rw=parsed.slice(1);
    setHeaders(hd); setRows(rw);
    const base={}; hd.forEach(h=>base[h]=guessField(h)); setMapping(base);
    setAi('reading');
    (async()=>{ try{ const r=await apiPost('/api/import-leads',{headers:hd,samples:rw.slice(0,6)}); const j=await r.json();
      if(j&&j.ok&&j.mapping){ const m={}; hd.forEach(h=>{const v=j.mapping[h];m[h]=(v&&IMPORT_KEYS.includes(v))?v:base[h];}); setMapping(m); setAi('done'); }
      else setAi('heuristic'); }catch(e){ setAi('heuristic'); } })();
  };
  const ingestRows=(hd,rw)=>{
    setHeaders(hd); setRows(rw);
    const base={}; hd.forEach(h=>base[h]=guessField(h)); setMapping(base);
    setAi('reading');
    (async()=>{ try{ const r=await apiPost('/api/import-leads',{headers:hd,samples:rw.slice(0,6)}); const j=await r.json();
      if(j&&j.ok&&j.mapping){ const m={}; hd.forEach(h=>{const v=j.mapping[h];m[h]=(v&&IMPORT_KEYS.includes(v))?v:base[h];}); setMapping(m); setAi('done'); }
      else setAi('heuristic'); }catch(e){ setAi('heuristic'); } })();
  };
  const readSheet=async()=>{
    setSheetErr(''); setSheetBusy(true);
    try{
      const r=await apiPost('/api/sheet-read',{sheet:sheetUrl,tab:sheetTab||''});
      const j=await r.json();
      if(!r.ok){ setSheetErr(j); setSheetBusy(false); return; }
      const hd=(j.headers||[]).map(h=>String(h||'').trim());
      const rw=(j.rows||[]).map(row=>hd.map((_,i)=>String(row[i]==null?'':row[i]).trim()));
      if(!hd.length||!rw.length) throw new Error('That tab has no header row and data rows.');
      setFileName(`${j.tab||'Sheet'} · ${rw.length} rows`);
      ingestRows(hd,rw);
    }catch(e){ setSheetErr({error:e.message||'Could not read that sheet.'}); }
    setSheetBusy(false);
  };
  const onFile=e=>{ const f=e.target.files?.[0]; e.target.value=''; if(!f)return; setFileName(f.name); const r=new FileReader(); r.onload=()=>ingest(String(r.result)); r.readAsText(f); };
  const buildLead=row=>{ const f={}; headers.forEach((h,i)=>{ const t=mapping[h]; if(!t||t==='ignore')return; const v=(row[i]||'').trim(); if(!v)return; if(t==='name')f.name=(f.name?f.name+' ':'')+v; else if(t==='note')f.note=(f.note?f.note+' | ':'')+v; else f[t]=v; });
    if(!f.name)f.name=f.company||'(no name)'; if(!f.source)f.source='CSV import'; if(markSponsor)f.potentialSponsor=true; return mkLead(f); };
  /* A row with nothing in the name or company column isn't a lead — it's a
     trailing blank, a separator, or a totals row. Importing it as "(no name)"
     means someone has to find and delete it later. */
  const usable=row=>headers.some((h,i)=>['name','company'].includes(mapping[h])&&(row[i]||'').trim());
  const skipped=headers?rows.filter(r=>!usable(r)).length:0;
  const preview=headers?rows.filter(r=>usable(r)).slice(0,6).map(buildLead):[];
  const mapped=k=>headers?headers.filter(h=>mapping[h]===k).length:0;
  /* TWO COLUMNS ONTO ONE FIELD. buildLead treats three cases differently and
     the UI said nothing about any of them:
       name  -> joined with a space   (deliberate: first name + last name)
       note  -> joined with ' | '     (deliberate)
       everything else -> f[t]=v, so the LAST column silently wins and the
                          earlier one is dropped with no warning at all.
     Naming which of the three is about to happen is the whole fix — the
     concatenating pair are a feature, the rest is data loss. */
  const JOINS={name:'joined with a space',note:"joined with ' | '"};
  const dupes=headers
    ? [...new Set(Object.values(mapping))]
        .filter(k=>k&&k!=='ignore'&&mapped(k)>1)
        .map(k=>({field:k,
          label:(IMPORT_FIELDS.find(f=>f[0]===k)||[k,k])[1],
          cols:headers.filter(h=>mapping[h]===k),
          join:JOINS[k]||''}))
    : [];
  const doImport=()=>{ const built=rows.filter(usable).map(buildLead); onImport(built); };
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" style={{maxWidth:720}} onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head"><div><h2>Import leads from CSV</h2><div className="meta">AI maps your columns — you review, then import</div></div><button className="m-x" onClick={onClose}><X size={18}/></button></div>
      <div className="m-scroll">
        {!headers?(<>
          <div className="seg" style={{marginBottom:14}}>
            <button className={'seg-b '+(src==='file'?'on':'')} onClick={()=>setSrc('file')}>File or paste</button>
            <button className={'seg-b '+(src==='sheet'?'on':'')} onClick={()=>setSrc('sheet')}>Google Sheet</button>
          </div>
          {src==='sheet'&&<div style={{marginBottom:6}}>
            <div className="sheet-row">
              <input placeholder="Paste the Google Sheet link" value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)}/>
              <input className="sheet-tab" placeholder="Tab (optional)" value={sheetTab} onChange={e=>setSheetTab(e.target.value)}/>
              <button className="btn btn-p btn-sm" disabled={!sheetUrl||sheetBusy} onClick={readSheet}>
                {sheetBusy?<Loader2 size={14} className="spin"/>:<Sheet size={14}/>}{sheetBusy?'Reading…':'Read the sheet'}</button>
            </div>
            {sheetErr&&<div className="sheet-fail">
              <div className="sf-t"><AlertTriangle size={14}/>{sheetErr.error||String(sheetErr)}</div>
              {sheetErr.fix&&<div className="sf-f">{sheetErr.fix}</div>}
              {sheetErr.link&&<a className="btn btn-p btn-sm" href={sheetErr.link} target="_blank" rel="noreferrer">
                Open Google Cloud<ExternalLink size={13}/></a>}
              {/* Google's own wording is kept, but folded away — it names the
                  project id, which is occasionally the only useful part. */}
              {sheetErr.detail&&<details className="sf-d"><summary>What Google said</summary>{sheetErr.detail}</details>}
            </div>}
            <div className="subcell" style={{marginTop:8}}>Reads through your connected Google account, read-only.
              Nothing is imported until you review the mapping.</div>
          </div>}
          {src==='file'&&<>
          <div className="drop" onClick={()=>fileRef.current?.click()}><Upload size={22}/><div style={{marginTop:8,fontWeight:600,color:INK}}>Choose a .csv file</div><div style={{fontSize:12,color:'#8b88a0',marginTop:3}}>Export your Google Sheet as CSV, or drag any contact list. Messy columns are fine — the AI sorts them out.</div></div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={onFile}/>
          <div style={{textAlign:'center',color:'#c7c5d4',fontSize:12,margin:'12px 0 6px'}}>or paste rows below</div>
          <textarea rows={5} placeholder="Name,Company,Phone,Email&#10;Jane Doe,Acme,3165551234,jane@acme.com" style={{width:'100%',border:'1px solid #E1E2EC',borderRadius:10,padding:10,fontSize:12.5,fontFamily:'monospace'}} onBlur={e=>{if(e.target.value.trim())ingest(e.target.value);}}/>
          </>}

        </>):(<>
          {ai==='reading'&&<div className="ai-banner ai-reading"><Loader2 size={15} className="spin"/>AI is reading your columns…</div>}
          {ai==='done'&&<div className="ai-banner ai-done"><Sparkles size={15}/>AI mapped your columns — check them below and fix any that look off.</div>}
          {ai==='heuristic'&&<div className="ai-banner ai-off"><AlertTriangle size={15}/>Auto-matched columns by name (AI unavailable). Double-check the mapping below.</div>}
          <div className="imp-sub">{rows.length} row{rows.length===1?'':'s'} found{fileName?' · '+fileName:''}. Map each column:</div>
          <div className="imp-map">{headers.map(h=>(<div className="imp-row" key={h}><span className="imp-h" title={h}>{h||'(blank)'}</span><ChevronRight size={13} color="#c7c5d4"/><select value={mapping[h]||'ignore'} onChange={e=>setMapping(m=>({...m,[h]:e.target.value}))}>{IMPORT_FIELDS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>))}</div>
          {!mapped('name')&&<div className="imp-warn"><AlertTriangle size={13}/>No column is mapped to <b>Name</b> — those rows will fall back to the company name.</div>}
          {dupes.map(d=>(
            <div key={d.field} className={d.join?'imp-note':'imp-warn'}>
              {d.join?<Layers size={13}/>:<AlertTriangle size={13}/>}
              <span><b>{d.cols.length}</b> columns are mapped to <b>{d.label}</b> ({d.cols.join(', ')}) — {d.join
                ? <>they will be {d.join}.</>
                : <>only <b>{d.cols[d.cols.length-1]}</b> will be kept. Mapping two columns to {d.label} is not supported, so the others are dropped.</>}</span>
            </div>))}
          {/* The label text is ONE flex item, not three. .spon-tog is inline-flex with
              gap:8px, so a bare text node followed by <b> put an 8px gap on top of
              the space already inside the text — which reads as a double space. */}
          <label className="spon-tog" style={{marginTop:12}}><input type="checkbox" checked={markSponsor} onChange={e=>setMarkSponsor(e.target.checked)}/><span>Mark all imported leads as <b>potential sponsors</b></span></label>
          <div className="imp-sub" style={{marginTop:16}}>Preview (first {preview.length}):</div>
          <div className="tbl-wrap" style={{maxHeight:200,overflow:'auto'}}><table className="tbl"><thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th></tr></thead><tbody>{preview.map((l,i)=>(<tr key={i}><td className="namecell">{l.name}</td><td className="subcell">{l.company||'—'}</td><td className="subcell">{l.phone||'—'}</td><td className="subcell">{l.email||'—'}</td></tr>))}</tbody></table></div>
        </>)}
      </div>
      {/* PINNED, and outside the scrolling body on purpose. Making the body
          scroll already puts Import within reach at any column count; keeping
          the action row out of it means you do not have to scroll past 21
          column mappings to find the button in the first place. */}
      {headers&&<div className="m-foot">
        <button className="btn btn-p" onClick={doImport}><CheckCircle2 size={15}/>Import {rows.length} lead{rows.length===1?'':'s'}</button>
        <button className="btn btn-s btn-sm" onClick={()=>{setHeaders(null);setRows([]);setAi(null);setFileName('');}}>Start over</button>
        {skipped>0&&<span className="m-foot-n">{skipped} row{skipped===1?'':'s'} skipped — no name or company</span>}
      </div>}
    </div>
  </div>);
}

/* ===================== INTRO WEB ===================== */
function NetworkWeb({contacts,open}){
  const [sel,setSel]=useState(null);
  const [fs,setFs]=useState(false);
  useEffect(()=>{ if(!fs)return; const h=e=>{if(e.key==='Escape')setFs(false);}; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[fs]);
  const net=useMemo(()=>buildNetwork(contacts),[contacts]);
  const COL=196,ROW=52,NW=164,NH=36,PAD=22;
  if(!net.nodes.length) return (<div className="card"><div className="empty">No introductions mapped yet. Open any contact, set <b>Introduced by</b>, and the web will draw itself here.</div></div>);
  const rootYs=net.nodes.filter(n=>n.depth===1).map(n=>n.y);
  const youY=rootYs.length?(Math.min(...rootYs)+Math.max(...rootYs))/2:0;
  const X=d=>PAD+d*COL, Y=y=>PAD+y*ROW+NH/2;
  const W=X(net.maxDepth)+NW+PAD, H=PAD*2+Math.max(net.rows,1)*ROW;
  const ancestors=id=>{const c=net.byId[id];return c?introChain(c,contacts).map(p=>p.id):[];};
  const selPath=sel?[...ancestors(sel),sel]:[];
  const onPath=id=>selPath.includes(id);
  const linkOn=(a,b)=>{const i=selPath.indexOf(a);return i>=0&&selPath[i+1]===b;};
  const curve=(x1,y1,x2,y2)=>{const mx=(x1+x2)/2;return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;};
  const colorOf=c=>c.isRelationship?'#7A5CC8':(c.isClient?GREEN:COBALT);
  const inner=(<>
        {net.roots.length>0&&<>
          <rect x={X(0)} y={Y(youY)-NH/2} width={NW} height={NH} rx={9} className="web-you"/>
          <text x={X(0)+NW/2} y={Y(youY)+4} textAnchor="middle" className="web-youtxt">You · ProyTech</text>
          {net.nodes.filter(n=>n.depth===1).map(n=>(
            <path key={'y'+n.id} d={curve(X(0)+NW,Y(youY),X(1),Y(n.y))} className="web-link you"/>
          ))}
        </>}
        {net.links.map(([a,b])=>{
          const na=net.nodes.find(n=>n.id===a),nb=net.nodes.find(n=>n.id===b);
          if(!na||!nb)return null;
          return <path key={a+'>'+b} d={curve(X(na.depth)+NW,Y(na.y),X(nb.depth),Y(nb.y))} className={'web-link'+(linkOn(a,b)?' on':'')}/>;
        })}
        {net.nodes.map(n=>{const c=net.byId[n.id];if(!c)return null;
          const dim=sel&&!onPath(n.id);
          return (<g key={n.id} className={'web-node'+(dim?' dim':'')+(sel===n.id?' sel':'')} onClick={()=>setSel(n.id)} onDoubleClick={()=>open&&open(n.id)}>
            <rect x={X(n.depth)} y={Y(n.y)-NH/2} width={NW} height={NH} rx={9} fill="#fff" stroke={onPath(n.id)?colorOf(c):'#E1E2EC'} strokeWidth={onPath(n.id)?2:1}/>
            <rect x={X(n.depth)} y={Y(n.y)-NH/2} width={4} height={NH} rx={2} fill={colorOf(c)}/>
            <text x={X(n.depth)+12} y={Y(n.y)-1} className="web-name">{(c.name||'').slice(0,20)}</text>
            <text x={X(n.depth)+12} y={Y(n.y)+11} className="web-co">{(c.company||'').slice(0,22)}</text>
            {n.kids>0&&<><circle cx={X(n.depth)+NW-14} cy={Y(n.y)} r={9} fill="#F1F2F8"/><text x={X(n.depth)+NW-14} y={Y(n.y)+3.5} textAnchor="middle" className="web-kids">{n.kids}</text></>}
          </g>);
        })}
  </>);
  const svgEl=fit=>fit
    ? <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="web-svg" style={{width:'100%',height:'100%',display:'block'}}>{inner}</svg>
    : <svg width={W} height={H} className="web-svg">{inner}</svg>;
  const legendEl=full=>(<div className="web-legend">
    <span><i style={{background:'#7A5CC8'}}/>Relationship</span>
    <span><i style={{background:COBALT}}/>Lead</span>
    <span><i style={{background:GREEN}}/>Client</span>
    <span className="web-tip">Tap a name to trace it back · double-tap to open</span>
    <div className="web-actions">
      {sel&&<button className="btn btn-s btn-sm" onClick={()=>setSel(null)}>Clear trace</button>}
      {full?<button className="btn btn-s btn-sm" onClick={()=>setFs(false)}><X size={14}/>Exit</button>
           :<button className="btn btn-s btn-sm" onClick={()=>setFs(true)}><Expand size={14}/>Full screen</button>}
    </div>
  </div>);
  const traceEl=sel?(()=>{const chain=[...ancestors(sel).map(id=>net.byId[id]),net.byId[sel]].filter(Boolean);
    return (<div className="web-trace"><b>{chain[chain.length-1].name}</b>{chain.length>1?<> traces back through {chain.slice(0,-1).map((p,i)=><React.Fragment key={p.id}>{i>0&&' → '}<span onClick={()=>setSel(p.id)}>{p.name}</span></React.Fragment>)}</>:<> — you met them directly</>}</div>);})():null;
  return (<>
    <div className="card web-card">
      {legendEl(false)}
      {traceEl}
      <div className="web-scroll">{svgEl(false)}</div>
    </div>
    {fs&&<div className="web-fs">
      {legendEl(true)}
      {traceEl}
      <div className="web-fs-stage">{svgEl(true)}</div>
    </div>}
  </>);
}

const REL_TIER_DESC={champion:'Your top referrers & hubs',b:'Warm — keep nurturing',new:'Just met — start farming'};
const tierOf=r=>r.relTier||'new';
const tierMeta=k=>REL_TIERS.find(t=>t[0]===k)||REL_TIERS[2];
function Relationships({leads,open,updateLead}){
  const [q,setQ]=useState('');
  const [src,setSrc]=useState('all');
  const [tier,setTier]=useState(null);
  const [view,setView]=useState('grouped');
  const rels=useMemo(()=>leads.filter(l=>l.isRelationship),[leads]);
  const nameOf=id=>{const x=leads.find(l=>l.id===id);return x?x.name:'';};
  const tierCount=k=>rels.filter(r=>tierOf(r)===k).length;
  const sources=useMemo(()=>{
    const m={};
    rels.forEach(r=>{const k=r.introducedBy||'';m[k]=(m[k]||0)+1;});
    return Object.entries(m).map(([id,count])=>({id,count,name:id?nameOf(id)||'(removed contact)':'Direct / no intro'}))
      .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  },[rels,leads]);
  const shown=useMemo(()=>rels.filter(r=>{
    if(tier&&tierOf(r)!==tier)return false;
    if(src!=='all'&&(r.introducedBy||'')!==src)return false;
    if(q){const s=(r.name+' '+r.company+' '+(r.relNote||'')+' '+nameOf(r.introducedBy)).toLowerCase();if(!s.includes(q.toLowerCase()))return false;}
    return true;
  }).sort((a,b)=>(a.name||'').localeCompare(b.name||'')),[rels,q,src,tier,leads]);
  const groups=useMemo(()=>{
    const m={};
    shown.forEach(r=>{const k=r.introducedBy||'';(m[k]=m[k]||[]).push(r);});
    return Object.entries(m).map(([id,list])=>({id,name:id?nameOf(id)||'(removed contact)':'Direct / no intro',list}))
      .sort((a,b)=>b.list.length-a.list.length||a.name.localeCompare(b.name));
  },[shown,leads]);
  const topConnector=sources.filter(s=>s.id)[0];
  const allIntro=useMemo(()=>{
    const m={};
    leads.forEach(l=>{ if(l.introducedBy&&l.introducedBy!==l.id&&leads.some(x=>x.id===l.introducedBy)) m[l.introducedBy]=(m[l.introducedBy]||0)+1; });
    return Object.entries(m).map(([id,count])=>({id,count,name:nameOf(id)})).sort((a,b)=>b.count-a.count);
  },[leads]);
  const topAll=allIntro[0];
  const deepest=useMemo(()=>{
    let best=0,who=null;
    leads.forEach(l=>{const c=introChain(l,leads);if(c.length>best){best=c.length;who=l;}});
    return {len:best,who};
  },[leads]);
  const TierPick=({r})=>{const m=tierMeta(tierOf(r));return (<span className="tier-pick" style={{'--tc':m[2]}} onClick={e=>e.stopPropagation()}>
    <span className="tier-dot"/>
    <select value={tierOf(r)} onChange={e=>updateLead&&updateLead(r.id,{relTier:e.target.value})}>{REL_TIERS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
  </span>);};
  const Row=r=>(<tr key={r.id} onClick={()=>open(r.id,shown.map(x=>x.id))}>
    <td><div className="namecell">{r.name}</div><div className="subcell">{r.company||'—'}</div></td>
    <td onClick={e=>e.stopPropagation()}><TierPick r={r}/></td>
    <td className="subcell">{r.relNote||'—'}</td>
    <td>{r.introducedBy?<span className="rel-chip"><Link2 size={11}/>{nameOf(r.introducedBy)||'—'}</span>:<span className="subcell">Direct</span>}</td>
    <td><Due iso={r.followUp}/></td>
    <td className="subcell">{r.owner||'—'}</td>
  </tr>);
  return (<>
    <div className="rel-tiers">
      {REL_TIERS.map(([key,label,color])=>{const people=rels.filter(r=>tierOf(r)===key).sort((a,b)=>(a.name||'').localeCompare(b.name||''));const on=tier===key;
        const pick=()=>{ if(on){setTier(null);} else {setTier(key);setView('list');} };
        return (<div key={key} className={'rel-tier'+(on?' on':'')} style={{'--tc':color}}>
          <div className="rt-head" onClick={pick}>
            <div className="rt-top"><span className="rt-dot"/>{label}<span className="rt-count">{people.length}</span></div>
            <div className="rt-d">{REL_TIER_DESC[key]}</div>
          </div>
          <div className="rt-people">
            {people.length?people.map(r=>(<div key={r.id} className="rt-person" onClick={()=>open(r.id)}>
              <span className="rt-pn">{r.name||'(no name)'}</span>{r.company?<span className="rt-pc">{r.company}</span>:null}
            </div>)):<div className="rt-empty">No one here yet</div>}
          </div>
          <div className="rt-foot" onClick={pick}>{on?'Listed below · tap to clear':`Tap to list all ${people.length}`}</div>
        </div>);})}
    </div>
    <div className="rel-netline">
      <span>{allIntro.length} connectors</span><span>·</span>
      <span>top: {topAll?`${topAll.name} (${topAll.count})`:'—'}</span><span>·</span>
      <span>longest chain {deepest.len?deepest.len+1:0}</span>
      {tier&&<button className="rel-clearf" onClick={()=>setTier(null)}>Showing {tierMeta(tier)[1]} · clear</button>}
    </div>
    <div className="toolbar">
      <div className="searchbox"><Search size={16} color="#928DAD"/><input placeholder="Search name, company, how you know them…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="selctl" value={src} onChange={e=>setSrc(e.target.value)}>
        <option value="all">Everyone who introduced</option>
        {sources.map(s=><option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
      </select>
      <div className="seg" style={{marginLeft:'auto'}}>
        <button className={view==='grouped'?'on':''} onClick={()=>setView('grouped')}>Grouped</button>
        <button className={view==='list'?'on':''} onClick={()=>setView('list')}>List</button>
        <button className={view==='web'?'on':''} onClick={()=>setView('web')}>Web</button>
      </div>
    </div>
    {view==='web'?<NetworkWeb contacts={leads} open={open}/>
    :!rels.length?<div className="card"><div className="empty">No relationships yet. Open any contact and flip the <b>Relationship</b> toggle at the top to move them here.</div></div>
    :!shown.length?<div className="card"><div className="empty">No relationships in {tier?tierMeta(tier)[1]:'this view'}{q?' matching that search':''}.</div></div>
    :view==='list'?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Tier</th><th>How you know them</th><th>Introduced by</th><th>Follow-up</th><th>Owner</th></tr></thead><tbody>{shown.map(Row)}</tbody></table></div>
    :<>{groups.map(g=>(<div className="card" style={{marginBottom:14}} key={g.id||'direct'}>
        <div className="rel-ghead">
          {g.id?<><span className="rel-gname" onClick={()=>open(g.id)}><Link2 size={13}/>{g.name}</span><span className="rel-gcount">{g.list.length} {g.list.length===1?'intro':'intros'}</span></>
              :<><span className="rel-gname plain"><Users size={13}/>Direct / no intro</span><span className="rel-gcount">{g.list.length}</span></>}
        </div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Tier</th><th>How you know them</th><th>Introduced by</th><th>Follow-up</th><th>Owner</th></tr></thead><tbody>{g.list.map(Row)}</tbody></table></div>
      </div>))}</>}
  </>);
}

/* ===================== CLIENTS ===================== */
function ClientRoadmap({clients,tracks,open}){
  if(!clients.length) return null;
  const PHASES=[['Not Started',p=>p<=0],['Kickoff',p=>p>0&&p<.26],['In Progress',p=>p>=.26&&p<.6],['Review',p=>p>=.6&&p<1]];
  const wp=clients.map(l=>({l,o:clientOverall(l,tracks)}));
  return (<div className="card" style={{marginBottom:18}}>
    <div className="sec-title" style={{margin:'0 0 14px'}}><Rocket size={15}/>Delivery Roadmap</div>
    <div className="rmap-board">{PHASES.map(([label,test])=>{const items=wp.filter(x=>test(x.o.pct));return (
      <div className="rmap-col" key={label}>
        <div className="rmap-colh">{label}<span>{items.length}</span></div>
        {items.map(({l,o})=>(<div className="rmap-card" key={l.id} onClick={()=>open(l.id)}>
          <div className="rc-n">{l.company||l.name}</div>
          <div className="pbar" style={{margin:'7px 0 0'}}><div style={{width:Math.round(o.pct*100)+'%'}}/></div>
          <div className="rc-ph">{o.phase}</div>
        </div>))}
        {!items.length&&<div className="rmap-empty">—</div>}
      </div>);})}
    </div>
    <div className="rmap-rows">{wp.map(({l,o})=>(<div className="rmap-row" key={l.id} onClick={()=>open(l.id)}>
      <div className="rr-name"><div className="namecell">{l.company||l.name}</div><div className="subcell">{Math.round(o.pct*100)}% · {o.phase}{o.overdue>0?<span className="od-tag"> · {o.overdue} overdue</span>:o.nextDue?<span className="due-tag"> · next due {fmtDate(o.nextDue)}</span>:''}</div></div>
      <div className="rr-tracks">{o.tracks.map(tr=>{const p=trackProgress(l,tr);return (
        <div className="rr-track" key={tr.key}><span className="rr-tl">{tr.label}</span><div className="rr-dots">{p.ms.map(m=>{const e=p.entries[m];const done=!!e.done;const od=!done&&e.due&&daysUntil(e.due)<0;return <span key={m} className={'rdot'+(done?' on':'')+(od?' over':'')} title={m+(done?' ✓ '+fmtDate(e.done):e.due?(od?' overdue '+fmtDate(e.due):' due '+fmtDate(e.due)):' (no date)')}/>;})}</div></div>);})}
      </div>
    </div>))}</div>
  </div>);
}

/* shared client kanban — used in the Clients tab and the Pipeline toggle */
function ClientBoard({clients,settings,onCard,setClientPhase,stages}){
  const [dragId,setDragId]=useState(null);const [over,setOver]=useState(null);
  const cols=boardCols(clients,settings);
  const drop=col=>{ if(!dragId){setOver(null);return;} if(!(col.custom&&col.ownerId&&col.ownerId!==dragId)) setClientPhase(dragId,col.key); setDragId(null);setOver(null); };
  const step=(l,dir)=>{ const order=flowOrder(settings,l); const i=order.indexOf(l.clientPhase||'intake'); const j=i+dir; if(i<0){ if(dir>0)setClientPhase(l.id,order[0]); return;} if(j<0||j>=order.length)return; setClientPhase(l.id,order[j]); };
  const Card=({l})=>{ const st=onboardingStat(l); const order=flowOrder(settings,l); const i=order.indexOf(l.clientPhase||'intake');
    return (<div className={'kcard'+(st.overdue>0?' od':'')+(dragId===l.id?' dragging':'')} draggable onDragStart={()=>setDragId(l.id)} onDragEnd={()=>{setDragId(null);setOver(null);}} onClick={()=>onCard&&onCard(l.id)}>
      <div className="kcard-top"><div className="kn"><span className="dot" style={{background:phaseInfo(l.clientPhase||'intake',settings,l).color}}/>{l.name||l.company}</div>{l.owner&&<span className="kown">{l.owner[0].toUpperCase()}</span>}</div>
      <div className="kco">{l.company&&l.company!==l.name?l.company:l.businessType||''}</div>
      {(()=>{ const ds=dealsOf(l).filter(d=>d.label); if(!ds.length) return null;
        return (<div className="kdeals">{ds.map(d=>(<span className="kdeal" key={d.id} title={d.label}>{d.label}{dealBits(d)>0?` · ${usdK?usdK(dealBits(d)):usd(dealBits(d))}`:''}</span>))}</div>); })()}
      <div className="kmeta"><span className="kvals">{(()=>{ /* AUDIT #2. This used to be `dealValue + retainer - every payment ever`.
       dealValue is OPEN deals only — closing one moves its money into closedDeals
       and rewrites dealValue to what is left — so a client with a $5,000 closed
       deal and $2,000 paid computed a NEGATIVE balance and the badge silently
       vanished, while the Money page correctly said $3,000 owed. owedBy() is the
       one function that answers this, and it already encodes the won-or-client
       rule. A hidden wrong number is worse than a visible one. */
      const rem=owedBy(l,stages); return rem>0?<span className="kbal" title="Remaining balance — contracted minus paid">{usdc(rem)} due</span>:null; })()}{(l.closedDeals||[]).length>0&&<span className="kltv" title="Closed deals only — money already won, not deals still open">{usd(closedDealsTotal(l))} closed</span>}{l.retainerActive&&num(l.retainer)>0&&<span className="kmrr">{usd(l.retainer)}/mo</span>}</span>{st.overdue>0?<span className="badge over" style={{padding:'1px 7px'}}>{st.overdue} overdue</span>:st.next?<span className="subcell" style={{fontSize:11}}>next: {st.next.label.slice(0,22)}</span>:<span className="badge done" style={{padding:'1px 7px'}}>done</span>}</div>
      <div className="kmove" onClick={e=>e.stopPropagation()}>
        <button className="kmv" disabled={i<=0} onClick={()=>step(l,-1)} title="Back a phase"><ChevronLeft size={16}/></button>
        <span className="kmv-s">{phaseInfo(l.clientPhase||'intake',settings,l).label}</span>
        <button className="kmv" disabled={i>=0&&i>=order.length-1} onClick={()=>step(l,1)} title="Advance a phase"><ChevronRight size={16}/></button>
      </div>
    </div>);
  };
  return (<div className="kanban">{cols.map(col=>{ const items=clients.filter(l=>(l.clientPhase||'intake')===col.key); const mrr=items.reduce((a,l)=>a+(l.retainerActive?num(l.retainer):0),0); const od=items.reduce((a,l)=>a+onboardingStat(l).overdue,0);
    return (<div key={col.key} className={'kcol '+(over===col.key?'drag':'')} onDragOver={e=>{e.preventDefault();setOver(col.key);}} onDragLeave={()=>setOver(c=>c===col.key?null:c)} onDrop={()=>drop(col)}>
      <div className="kbar" style={{background:col.color}}/>
      <div className="kcol-h"><span className="kt">{col.label}{col.custom&&<span className="cp-tag">custom</span>}</span><span className="kc">{items.length}</span></div>
      <div className="kcol-v">{mrr>0?usd(mrr)+'/mo':'—'}{od>0&&<span className="kwtd" style={{color:RED}}> · {od} overdue</span>}</div>
      <div className="kcol-body">
        {items.map(l=><Card key={l.id} l={l}/>)}
        {dragId&&over===col.key&&<div className="kdrop">Release to move here</div>}
        {!items.length&&!(dragId&&over===col.key)&&<div className="kdrop">{col.custom?'custom phase':'No clients'}</div>}
      </div>
    </div>);})}</div>);
}

function Clients({leads,stages,settings,open,toggleOnboarding,setOnboardingDue,assignOnboarding,toggleSkip,team,setClientPhase,addCustomPhase,removeCustomPhase}){
  /* off by default: hidden items should stay out of the way, but you need a way
     back to them or switching one off would be one-directional */
  const [showSkipped,setShowSkipped]=useState(false);
  const tracks=settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS;
  const [showChurned,setShowChurned]=useState(false);
  const [expand,setExpand]=useState(null);
  const t=todayISO();
  const clients=leads.filter(l=>l.isClient);
  const wonNotConverted=leads.filter(l=>sOf(l.stage,stages).won&&!l.isClient);
  const visible=clients.filter(l=>showChurned?true:(l.clientPhase||'intake')!=='churned');
  /* daily "what needs doing": overdue first, then earliest next-due */
  const ranked=visible.map(l=>({l,st:onboardingStat(l),phase:l.clientPhase||'intake'}))
    .sort((a,b)=>{ if((b.st.overdue>0)-(a.st.overdue>0))return (b.st.overdue>0)-(a.st.overdue>0);
      const ad=a.st.nextDue||'9999',bd=b.st.nextDue||'9999'; return ad.localeCompare(bd); });
  const byPhase=k=>clients.filter(l=>(l.clientPhase||'intake')===k).length;
  const retainerClients=clients.filter(l=>l.retainerActive); const mrr=retainerClients.reduce((a,l)=>a+num(l.retainer),0);
  const totalOverdue=clients.reduce((a,l)=>a+onboardingStat(l).overdue,0);
  const advance=l=>{ const order=flowOrder(settings,l); const cur=l.clientPhase||'intake'; const i=order.indexOf(cur); if(i<0||i>=order.length-1)return; const nextKey=order[i+1];
    const isStd=stdPhases(settings).some(p=>p.key===cur&&p.flow); const pp=isStd?phaseProgress(l,cur):{total:0,done:0}; const left=pp.total-pp.done;
    if(left>0 && !window.confirm(`${left} item${left>1?'s':''} still unchecked in ${phaseInfo(cur,settings,l).label} — advance to ${phaseInfo(nextKey,settings,l).label} anyway?`)) return;
    setClientPhase(l.id,nextKey); };
  const PhaseBadge=({k,client})=>{const m=phaseInfo(k,settings,client);return <span className="phase-badge" style={{background:m.color+'1A',color:m.color}}><span className="dot" style={{background:m.color}}/>{m.label}</span>;};
  const sel=visible.find(l=>l.id===expand);
  return (<>
    <div className="kgrid">
      <Kpi variant="accent" label="Active Clients" value={visible.length} icon={<Award size={14}/>} d={`${byPhase('intake')} intake · ${byPhase('build')} build · ${byPhase('launch')} launch`}/>
      <Kpi variant="green" label="Retainers" value={retainerClients.length} icon={<Repeat size={14}/>} d={`${usd(mrr)} MRR`}/>
      <Kpi label="Overdue items" value={totalOverdue} icon={<AlertTriangle size={14}/>} d="across all onboarding"/>
      <Kpi label="At risk / churned" value={byPhase('atrisk')+byPhase('churned')} icon={<Flag size={14}/>} d={`${byPhase('active')} active`}/>
    </div>
    {wonNotConverted.length>0&&<div className="note" style={{marginBottom:18}}><b>{wonNotConverted.length} signed {wonNotConverted.length===1?'lead is':'leads are'} not onboarding yet.</b> Open {wonNotConverted.length===1?'it':'them'} and hit <b>Convert to Client</b>: {wonNotConverted.slice(0,5).map(l=>l.company||l.name).join(', ')}{wonNotConverted.length>5?'…':''}</div>}
    <div className="toolbar" style={{marginBottom:14}}>
      <div className="sec-title" style={{margin:0}}><KanbanSquare size={15}/>Client Pipeline</div>
      <label className="chip-toggle" style={{marginLeft:'auto'}}><input type="checkbox" checked={showChurned} onChange={e=>setShowChurned(e.target.checked)}/>Show churned</label>
    </div>
    {!visible.length?<div className="empty">No clients yet. Move a lead to <b>Signed</b> (or hit Convert to Client) to start onboarding.</div>
    :<><ClientBoard clients={visible} settings={settings} stages={stages} setClientPhase={setClientPhase} onCard={id=>setExpand(id===expand?null:id)}/>
      {sel?(()=>{ const l=sel; const phase=l.clientPhase||'intake'; const order=flowOrder(settings,l); const i=order.indexOf(phase); const canAdvance=i>=0&&i<order.length-1;
        return (<div className="cli-detail">
          <div className="cli-detail-h">
            <div><div className="cli-name" onClick={()=>open(l.id)}>{l.company||l.name}</div><div className="subcell">{l.name} · {onboardingStat(l).done}/{ONB_ITEMS.length} onboarding complete</div></div>
            <button className="m-x" onClick={()=>setExpand(null)}><X size={17}/></button>
          </div>
          <div className="cli-actions">
            {canAdvance&&<button className="btn btn-p btn-sm" onClick={()=>advance(l)}><ArrowUpRight size={14}/>Advance to {phaseInfo(order[i+1],settings,l).label}</button>}
            <select className="phase-sel" value={phase} onChange={e=>{ if(e.target.value==='churned'&&!window.confirm('Mark this client churned? They drop out of the default view.')) return; setClientPhase(l.id,e.target.value); }}>
              {clientPhaseList(settings,l).map(p=><option key={p.key} value={p.key}>{p.label}{p.custom?' (custom)':''}</option>)}
            </select>
            <CustomPhaseAdd settings={settings} onAdd={info=>addCustomPhase(l.id,info)}/>
          </div>
          {(l.customPhases||[]).length>0&&<div className="cp-list">{(l.customPhases||[]).map(cp=><span key={cp.key} className="cp-chip" style={{borderColor:cp.color,color:cp.color}}><span className="dot" style={{background:cp.color}}/>{cp.label}<span className="subcell" style={{fontWeight:400}}>after {phaseInfo(cp.after,settings).label}</span><button onClick={()=>{if(window.confirm(`Remove custom phase "${cp.label}"?`))removeCustomPhase(l.id,cp.key);}}><X size={11}/></button></span>)}</div>}
          {(()=>{const n=skippedOnb(l).length; return n>0?(<button className="onb-showskip" onClick={()=>setShowSkipped(v=>!v)}>
            {showSkipped?'Hide':'Show'} {n} item{n===1?'':'s'} marked N/A</button>):null;})()}
          {ONBOARDING.map(g=>{const gp=phaseProgress(l,g.phase);return (<div className="onb-group" key={g.phase}>
            <div className="onb-gh"><PhaseBadge k={g.phase}/><span className="onb-gc">{gp.done}/{gp.total}</span></div>
            {g.items.filter(([key])=>showSkipped||!onbSkipped(l,key)).map(([key,label])=>{const e=normEntry((l.onboarding||{})[key]);const done=!!e.done;const od=!done&&e.due&&daysUntil(e.due)<0;const skipped=onbSkipped(l,key);
              if(skipped) return (<div className="onb-item skipped" key={key}>
                <span className="onb-check"><Ban size={15} color="#C9C5D9"/></span>
                <span className="onb-label">{label}</span>
                <button className="onb-skip" onClick={()=>toggleSkip&&toggleSkip(l.id,key)}>Bring back</button>
              </div>);
              return (
              <div className={'onb-item'+(done?' done':'')+(od?' over':'')} key={key}>
                <span className="onb-check" onClick={()=>toggleOnboarding(l.id,key)}>{done?<CheckCircle2 size={17} color={GREEN}/>:<Circle size={17} color={od?RED:'#C9C5D9'}/>}</span>
                <span className="onb-label" onClick={()=>toggleOnboarding(l.id,key)}>{label}</span>
                <select className={'onb-assign'+(e.assignee?' set':'')} value={e.assignee||''} onClick={ev=>ev.stopPropagation()} onChange={ev=>assignOnboarding&&assignOnboarding(l.id,key,ev.target.value)} title={e.assignee?`Assigned to ${e.assignee}`:'Assign to a teammate'}>
                  <option value="">+ assign</option>
                  {(team||[]).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <button className="onb-skip hide" title="Doesn't apply to this client" onClick={()=>toggleSkip&&toggleSkip(l.id,key)}>N/A</button>
                {done?<span className="onb-date done">✓ {fmtDate(e.done)}</span>
                     :<label className="onb-due"><span>{od?'overdue':'due'}</span><input type="date" className={od?'over':''} value={e.due||''} onChange={ev=>setOnboardingDue(l.id,key,ev.target.value)}/></label>}
              </div>);})}
          </div>);})}
        </div>);
      })():<div className="cli-hint"><ChevronUp size={14}/>Tap a client card to open its onboarding checklist and phase controls.</div>}
    </>}
  </>);
}

/* add-a-custom-phase popover (per client) */
function CustomPhaseAdd({settings,onAdd}){
  const [openF,setOpenF]=useState(false);
  const [label,setLabel]=useState(''); const [color,setColor]=useState('#7A5CC8'); const [after,setAfter]=useState('build');
  const flowStd=stdPhases(settings).filter(p=>p.flow);
  const submit=()=>{ if(!label.trim())return; onAdd({label,color,after}); setLabel(''); setOpenF(false); };
  if(!openF) return <button className="btn btn-s btn-sm" onClick={()=>setOpenF(true)}><Plus size={13}/>Custom phase</button>;
  return (<div className="cp-add">
    <input placeholder="Phase name (e.g. Paused)" value={label} onChange={e=>setLabel(e.target.value)} autoFocus/>
    <input type="color" value={color} onChange={e=>setColor(e.target.value)} title="Color"/>
    <label>after<select value={after} onChange={e=>setAfter(e.target.value)}>{flowStd.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
    <button className="btn btn-p btn-sm" onClick={submit}>Add</button>
    <button className="btn btn-g btn-sm" onClick={()=>setOpenF(false)}>Cancel</button>
  </div>);
}

/* ===================== SETTINGS ===================== */
/* ===================== INVOICES ===================== */
function Invoices({invoices,leads,settings,onNew,open}){
  const [filter,setFilter]=useState('all');
  const rows=(invoices||[]).map(inv=>({inv,st:invState(inv),total:invTotal(inv)}));
  const outstanding=rows.filter(r=>r.st!=='paid').reduce((a,r)=>a+r.total,0);
  const paid=rows.filter(r=>r.st==='paid').reduce((a,r)=>a+r.total,0);
  const overdue=rows.filter(r=>r.st==='overdue').length;
  const tabs=[['all','All'],['draft','Draft'],['sent','Sent'],['overdue','Overdue'],['paid','Paid']];
  const shown=rows.filter(r=>filter==='all'?true:r.st===filter).sort((a,b)=>(b.inv.issueDate||'').localeCompare(a.inv.issueDate||''));
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
  return (<>
    <div className="kgrid">
      <Kpi variant="accent" label="Outstanding" value={usd(outstanding)} icon={<Receipt size={14}/>} d={`${rows.filter(r=>r.st!=='paid').length} unpaid`}/>
      <Kpi variant="green" label="Collected" value={usd(paid)} icon={<CheckCircle2 size={14}/>} d={`${rows.filter(r=>r.st==='paid').length} paid`}/>
      <Kpi label="Overdue" value={overdue} icon={<AlertTriangle size={14}/>} d="past due date"/>
    </div>
    <div className="inv-bar">
      <div className="seg">{tabs.map(([k,l])=><button key={k} className={'seg-b '+(filter===k?'on':'')} onClick={()=>setFilter(k)}>{l}</button>)}</div>
      <button className="btn btn-p" onClick={()=>onNew()}><Plus size={15}/>New Invoice</button>
    </div>
    <div className="tbl-wrap">
      {shown.length?<table className="tbl"><thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>{shown.map(({inv,st,total})=>(<tr key={inv.id} onClick={()=>open(inv.id)}>
        <td style={{fontWeight:600,color:INK}}>{inv.number}</td>
        <td><div className="namecell">{inv.billTo?.company||inv.billTo?.name||'—'}</div>{inv.billTo?.company&&inv.billTo?.name&&<div className="subcell">{inv.billTo.name}</div>}</td>
        <td className="subcell">{fmtDate(inv.issueDate)}</td>
        <td className="subcell">{fmtDate(inv.dueDate)}</td>
        <td style={{fontWeight:600,color:INK}}>{usd(total)}</td>
        <td><span className={'badge inv-'+st}>{cap(st)}</span></td>
      </tr>))}</tbody></table>
      :<div className="empty">No invoices yet. Hit <b>New Invoice</b> to bill a client.</div>}
    </div>
  </>);
}

function InvoicePreview({inv,settings,saveSettings}){
  const iv=settings.invoicing||DEFAULT_INVOICING; const biz=iv.biz||DEFAULT_INVOICING.biz;
  const accent=iv.accent||'#2B4DE0'; const logoH=iv.logoH||46;
  const layout=iv.layout||DEFAULT_INVOICING.layout;
  const sections={...DEFAULT_INV_SECTIONS,...(iv.sections||{})};
  const [order,setOrder]=useState(layout.order||DEFAULT_INVOICING.layout.order);
  const [dragK,setDragK]=useState(null);
  const [sel,setSel]=useState(null);
  useEffect(()=>{setOrder((iv.layout||DEFAULT_INVOICING.layout).order||DEFAULT_INVOICING.layout.order);},[((iv.layout||{}).order||[]).join(',')]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const secStyle=k=>{const s=sections[k]||DEFAULT_INV_SECTIONS[k];return {fontSize:s.fz+'px',lineHeight:s.lh};};
  const adj=(k,dfz,dlh)=>{ const cur=sections[k]||DEFAULT_INV_SECTIONS[k]; const next={fz:clamp(+(cur.fz+dfz).toFixed(1),6,30),lh:clamp(+(cur.lh+dlh).toFixed(2),1,2.6)}; if(saveSettings) saveSettings({...settings,invoicing:{...iv,sections:{...sections,[k]:next}}}); };
  const saveLayout=next=>{ if(saveSettings) saveSettings({...settings,invoicing:{...iv,layout:{...layout,...next}}}); };
  const onSecOver=(e,key)=>{ e.preventDefault(); if(!dragK||dragK===key)return; setOrder(o=>{const a=o.filter(k=>k!==dragK);const i=a.indexOf(key);a.splice(i<0?a.length:i,0,dragK);return a;}); };
  const onSecDrop=()=>{ setDragK(null); saveLayout({order}); };
  const swapHeader=()=>saveLayout({headerSwap:!layout.headerSwap});
  const bt=inv.billTo||{}; const items=inv.items||[];
  const sub=invSubtotal(inv),tax=invTax(inv),total=invTotal(inv),st=invState(inv);
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
  return (<div className="inv-preview-wrap">
          <div className="inv-page-tools">
            {sel?(()=>{const s=sections[sel]||DEFAULT_INV_SECTIONS[sel];const NAME={headerLeft:'Header · left',headerRight:'Header · right',billto:'Bill To',items:'Line items',totals:'Totals',pay:'Payment link',notes:'Notes'};return(
              <div className="sec-toolbar">
                <span className="sec-tl">{NAME[sel]}</span>
                <span className="sec-grp">Font<button className="stp" onClick={()=>adj(sel,-0.5,0)}>−</button><span className="val">{s.fz}</span><button className="stp" onClick={()=>adj(sel,0.5,0)}>+</button></span>
                <span className="sec-grp">Spacing<button className="stp" onClick={()=>adj(sel,0,-0.05)}>−</button><span className="val">{s.lh.toFixed(2)}</span><button className="stp" onClick={()=>adj(sel,0,0.05)}>+</button></span>
                <button className="sec-done" onClick={()=>setSel(null)}>Done</button>
              </div>);})():<span className="sec-hint">Tap any section to resize its text &amp; spacing · hover to drag</span>}
            <button className="swapbtn" onClick={swapHeader} title="Swap header sides"><ArrowUpDown size={13} style={{transform:'rotate(90deg)'}}/>Swap header</button>
          </div>
          <div className="inv-preview" id="invprint">
            {(()=>{ const bizBlock=(<div key="biz" className={'ip-biz ip-sec'+(sel==='headerLeft'?' sel':'')} style={secStyle('headerLeft')} onClick={e=>{e.stopPropagation();setSel('headerLeft');}}>
                {(iv.showLogo!==false&&settings.logo)?<img src={settings.logo} alt="logo" className="ip-logo" style={{maxHeight:logoH,maxWidth:logoH*4.5}}/>:<div className="ip-name">{biz.name||'ProyTech'}</div>}
                <div className="ip-bizmeta">{(biz.address||'').split('\n').map((l,i)=><div key={i}>{l}</div>)}{biz.email&&<div>{biz.email}</div>}{biz.phone&&<div>{biz.phone}</div>}</div>
              </div>);
              const metaBlock=(<div key="meta" className={'ip-meta ip-sec'+(layout.headerSwap?' left':'')+(sel==='headerRight'?' sel':'')} style={secStyle('headerRight')} onClick={e=>{e.stopPropagation();setSel('headerRight');}}>
                <div className="ip-title" style={{color:accent}}>INVOICE</div>
                <div className="ip-num">{inv.number}</div>
                <div className="ip-dates"><div><span>Issued</span>{fmtDate(inv.issueDate)}</div><div><span>Due</span>{fmtDate(inv.dueDate)}</div></div>
                <div className={'ip-stamp inv-'+st}>{cap(st)}</div>
              </div>);
              return <div className="ip-top">{layout.headerSwap?[metaBlock,bizBlock]:[bizBlock,metaBlock]}</div>; })()}
            <div className="ip-rule" style={{background:accent}}/>
            {(()=>{ const blocks={
                billto:(<div className="ip-billto" style={secStyle('billto')}><div className="ip-lbl">Bill To</div><div className="ip-btname">{bt.company||bt.name||'—'}</div>{bt.company&&bt.name&&<div>{bt.name}</div>}{(bt.address||'').split('\n').map((l,i)=>l&&<div key={i}>{l}</div>)}{bt.email&&<div>{bt.email}</div>}</div>),
                items:(<table className="ip-table" style={secStyle('items')}><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{items.map((it,i)=>(<tr key={it.id||i}><td>{it.label||'—'}</td><td>{num(it.qty)}</td><td>{usd(it.amount)}</td><td>{usd(num(it.qty)*num(it.amount))}</td></tr>))}</tbody></table>),
                totals:(<div className="ip-totals" style={secStyle('totals')}><div className="ip-tr"><span>Subtotal</span><b>{usd(sub)}</b></div>{num(inv.taxRate)>0&&<div className="ip-tr"><span>Tax ({num(inv.taxRate)}%)</span><b>{usd(tax)}</b></div>}<div className="ip-tr ip-grand"><span>Total Due</span><b style={{color:accent}}>{usd(total)}</b></div></div>),
                pay:(iv.showPay!==false&&inv.paymentLink)?(<div className="ip-pay" style={secStyle('pay')}>Pay online: <a href={inv.paymentLink} style={{color:accent}}>{inv.paymentLink}</a></div>):null,
                notes:(iv.showNotes!==false&&inv.notes)?(<div className="ip-notes" style={secStyle('notes')}>{inv.notes}</div>):null,
              };
              return order.filter(k=>blocks[k]).map(key=>(<div key={key} className={'ip-block ip-sec'+(dragK===key?' dragk':'')+(sel===key?' sel':'')} draggable onDragStart={()=>setDragK(key)} onDragOver={e=>onSecOver(e,key)} onDragEnd={onSecDrop} onClick={e=>{e.stopPropagation();setSel(key);}}>
                <span className="ip-drag" title="Drag to reorder"><GripVertical size={13}/></span>
                {blocks[key]}
              </div>)); })()}
          </div>
        </div>);
}

function InvoiceModal({invoice,leads,settings,saveSettings,onSave,onDelete,onClose,onPaid}){
  const [inv,setInv]=useState(invoice);
  useEffect(()=>setInv(invoice),[invoice.id]);
  const patch=p=>{const n={...inv,...p};setInv(n);onSave(n);};
  const iv=settings.invoicing||DEFAULT_INVOICING;
  const bt=inv.billTo||{};
  const setBT=p=>patch({billTo:{...bt,...p}});
  const items=inv.items||[];
  const setItem=(i,p)=>{const a=items.slice();a[i]={...a[i],...p};patch({items:a});};
  const addItem=()=>patch({items:[...items,{id:uid(),label:'',qty:1,amount:0}]});
  const delItem=i=>patch({items:items.filter((_,j)=>j!==i)});
  const pickClient=id=>{const l=leads.find(x=>x.id===id); if(!l){patch({clientId:''});return;} patch({clientId:id,billTo:{name:l.name||'',company:l.company||'',email:l.email||'',address:bt.address||''},items:itemsFromLead(l)});};
  const sub=invSubtotal(inv),tax=invTax(inv),total=invTotal(inv),st=invState(inv);
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal inv-modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head">
        <div style={{minWidth:0}}><h2>{inv.number}</h2><div className="meta">Invoice · {cap(st)}</div></div>
        <div className="inv-actions">
          {inv.status!=='paid'&&inv.status!=='sent'&&<button className="btn btn-s btn-sm" onClick={()=>patch({status:'sent'})}><Send size={14}/>Mark sent</button>}
          {inv.status!=='paid'
            ? <button className="btn btn-p btn-sm" onClick={()=>{ const d=todayISO();
                patch({status:'paid',paidDate:d}); onPaid&&onPaid({...inv,status:'paid',paidDate:d},true); }}><CheckCircle2 size={14}/>Mark paid</button>
            : <button className="btn btn-s btn-sm" onClick={()=>{
                patch({status:'sent',paidDate:''}); onPaid&&onPaid(inv,false); }}>Unmark paid</button>}
          <button className="btn btn-s btn-sm" onClick={()=>window.print()}><Printer size={14}/>Print / PDF</button>
          <button className="m-x" onClick={onClose}><X size={18}/></button>
        </div>
      </div>
      <div className="inv-body">
        <div className="inv-edit">
          <div className="dh"><Contact2 size={13}/>Bill To</div>
          <div className="field" style={{marginBottom:10}}><label>Client (auto-fills)</label><select value={inv.clientId||''} onChange={e=>pickClient(e.target.value)}><option value="">— Manual / no client —</option>{leads.map(l=><option key={l.id} value={l.id}>{l.company||l.name}</option>)}</select></div>
          <div className="fgrid">
            <div className="field"><label>Company</label><input value={bt.company||''} onChange={e=>setBT({company:e.target.value})}/></div>
            <div className="field"><label>Contact name</label><input value={bt.name||''} onChange={e=>setBT({name:e.target.value})}/></div>
            <div className="field"><label>Email</label><input value={bt.email||''} onChange={e=>setBT({email:e.target.value})}/></div>
            <div className="field full"><label>Address</label><textarea rows={2} value={bt.address||''} onChange={e=>setBT({address:e.target.value})}/></div>
          </div>
          <div className="dh mt"><CalendarClock size={13}/>Invoice details</div>
          <div className="fgrid">
            <div className="field"><label>Invoice #</label><input value={inv.number||''} onChange={e=>patch({number:e.target.value})}/></div>
            <div className="field"><label>Issue date</label><input type="date" value={inv.issueDate||''} onChange={e=>patch({issueDate:e.target.value})}/></div>
            <div className="field"><label>Due date</label><input type="date" value={inv.dueDate||''} onChange={e=>patch({dueDate:e.target.value})}/></div>
          </div>
          <div className="dh mt"><DollarSign size={13}/>Line Items</div>
          <div className="inv-items-edit">
            <div className="iie-h"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span/></div>
            {items.map((it,i)=>(<div className="iie-row" key={it.id||i}>
              <input className="iie-label" value={it.label||''} placeholder="Description" onChange={e=>setItem(i,{label:e.target.value})}/>
              <input className="iie-qty" type="number" value={it.qty??1} onChange={e=>setItem(i,{qty:e.target.value})}/>
              <input className="iie-rate" type="number" value={it.amount??0} onChange={e=>setItem(i,{amount:e.target.value})}/>
              <span className="iie-amt">{usd(num(it.qty)*num(it.amount))}</span>
              <button className="ex-del" onClick={()=>delItem(i)}><X size={14}/></button>
            </div>))}
            <button className="addline" onClick={addItem}><Plus size={13}/>Add item</button>
          </div>
          <div className="fgrid" style={{marginTop:12}}>
            <div className="field"><label>Tax rate (%)</label><input type="number" value={inv.taxRate??0} onChange={e=>patch({taxRate:num(e.target.value)})}/></div>
            <div className="field"><label>Payment link</label><input placeholder="https://…" value={inv.paymentLink||''} onChange={e=>patch({paymentLink:e.target.value})}/></div>
            <div className="field full"><label>Notes / terms</label><textarea rows={2} value={inv.notes||''} onChange={e=>patch({notes:e.target.value})}/></div>
          </div>
          <button className="btn btn-d btn-sm" style={{marginTop:14}} onClick={()=>{if(window.confirm('Delete invoice '+inv.number+'? This cannot be undone.'))onDelete(inv.id);}}><Trash2 size={14}/>Delete invoice</button>
        </div>

        <InvoicePreview inv={inv} settings={settings} saveSettings={saveSettings}/>
      </div>
    </div>
  </div>);
}

const TX_TYPES={
  income:{label:'Money in',dir:'in'},
  contribution:{label:'Owner contribution',dir:'in'},
  expense:{label:'Expense',dir:'out'},
  draw:{label:'Owner draw',dir:'out'},
};
const EXP_CATS=['Software','Advertising','Office','Meals','Travel','Contractors','Fees','Equipment','Other'];
const INC_CATS=['Client payment','Retainer','Refund','Other'];
const TX_WHO=['Business',...BRAND.team];
const TX_METHODS=['Card','Bank transfer','Cash','Check','Other'];
const csvq=s=>{s=String(s==null?'':s);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const toB64=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});

/* ===================== Tasks (shared · AI-ranked) ===================== */
const TASK_OWNERS=[...BRAND.team,'Both'];
const OWNER_PALETTE=[COBALT,'#7A5CC8','#0E9AA7','#D97706'];
const ownerColor=o=>{const i=BRAND.team.indexOf(o);return i>=0?OWNER_PALETTE[i%OWNER_PALETTE.length]:GREEN;};
const meOwner=me=>BRAND.team.includes(me)?me:(BRAND.team[0]||'');
const newTask=owner=>({id:uid(),title:'',notes:'',owner:owner||'Both',leadId:'',due:todayISO(),revenue:3,urgency:3,effort:3,done:false,doneAt:'',doneBy:'',aiRank:null,aiReason:'',createdAt:new Date().toISOString()});
const taskScore=t=>num(t.revenue)*num(t.urgency);

function Tasks({tasks,leads,me,upsertTask,deleteTask,saveTasks,open,rep}){
  const [who,setWho]=useState('all');
  const [show,setShow]=useState('open');
  const [when,setWhen]=useState('all');
  const [title,setTitle]=useState('');
  /* meOwner() falls back to the first name in VITE_TEAM for anyone who isn't
     in it — which for a rep means "Mine" would mean an owner's tasks and new
     tasks would be filed under an owner. A rep is always simply themselves. */
  const mineName=rep?me:meOwner(me);
  const [addOwner,setAddOwner]=useState(mineName);
  const [addDue,setAddDue]=useState(todayISO());
  const [edit,setEdit]=useState(null);
  const [busy,setBusy]=useState(false);
  const leadName=id=>{const l=leads.find(x=>x.id===id);return l?(l.company||l.name||'Lead'):'';};

  const add=()=>{ const t=title.trim(); if(!t)return; upsertTask({...newTask(addOwner),title:t,due:addDue||todayISO()}); setTitle(''); };

  /* "Today" means what you owe today, which includes anything you already owed
     and didn't do — an overdue task is not a future problem. Future-dated work
     sits in Upcoming, undated work in No date, and All is still everything. */
  const TODAY=todayISO();
  const whenOf=t=>!t.due?'none':(t.due<=TODAY?'today':'later');
  const passWho=t=>who==='all'||(who==='mine'&&t.owner===mineName)||(who==='both'&&t.owner==='Both')
    ||(who!=='all'&&who!=='mine'&&who!=='both'&&t.owner===who);
  const passShow=t=>show==='all'||(show==='open'&&!t.done)||(show==='done'&&t.done);
  const base=tasks.filter(t=>passWho(t)&&passShow(t));
  const whenCounts={ today:base.filter(t=>whenOf(t)==='today').length,
                     later:base.filter(t=>whenOf(t)==='later').length,
                     none:base.filter(t=>whenOf(t)==='none').length,
                     all:base.length };
  const overdueCount=base.filter(t=>!t.done&&t.due&&t.due<TODAY).length;
  const filtered=base.filter(t=>when==='all'||whenOf(t)===when);
  const ordered=[...filtered].sort((a,b)=>{
    if(a.done!==b.done)return a.done?1:-1;
    /* in a date view, date leads — an AI rank is about what's worth doing, not
       about what's already late */
    if(when!=='all'&&!a.done&&!b.done&&(a.due||'')!==(b.due||'')) return (a.due||'9999').localeCompare(b.due||'9999');
    if(a.aiRank!=null&&b.aiRank!=null)return a.aiRank-b.aiRank;
    if(a.aiRank!=null)return -1; if(b.aiRank!=null)return 1;
    if(taskScore(b)!==taskScore(a))return taskScore(b)-taskScore(a);
    if(num(a.effort)!==num(b.effort))return num(a.effort)-num(b.effort);
    return (a.createdAt||'').localeCompare(b.createdAt||'');
  });
  const ranked=tasks.some(t=>!t.done&&t.aiRank!=null);

  const runAI=async()=>{
    const open=tasks.filter(t=>!t.done);
    if(!open.length){window.alert('No open tasks to rank yet.');return;}
    setBusy(true);
    try{
      const payload=open.map(t=>({id:t.id,title:t.title,notes:t.notes||'',owner:t.owner,lead:leadName(t.leadId),due:t.due||'',revenue:num(t.revenue),urgency:num(t.urgency),effort:num(t.effort)}));
      const r=await apiPost('/api/rank-tasks',{tasks:payload});
      const j=await r.json();
      if(!j.ok){window.alert('AI ranking isn\u2019t available: '+(j.error||'unknown')+'.\nTasks are still sorted by impact \u00d7 urgency.');setBusy(false);return;}
      const map={}; (j.ranking||[]).forEach((x,i)=>{map[x.id]={rank:i+1,reason:x.reason||''};});
      saveTasks(tasks.map(t=>{ if(t.done)return {...t,aiRank:null}; const m=map[t.id]; return m?{...t,aiRank:m.rank,aiReason:m.reason}:{...t,aiRank:null,aiReason:''}; }));
    }catch(e){window.alert('AI ranking failed: '+(e.message||e));}
    setBusy(false);
  };
  const clearAI=()=>saveTasks(tasks.map(t=>({...t,aiRank:null,aiReason:''})));

  return (<>
    <div className="card" style={{marginBottom:16}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add();}} placeholder={'Add a task and hit Enter\u2026'} style={{flex:'1 1 260px',padding:'11px 13px',border:'1px solid #E2E3EE',borderRadius:11,fontSize:14,background:'#fff',color:INK}}/>
        <div className="task-daypick">
          <button type="button" className={'day-chip'+(addDue===todayISO()?' on':'')} onClick={()=>setAddDue(todayISO())}>Today</button>
          <button type="button" className={'day-chip'+(addDue===addDays(todayISO(),1)?' on':'')} onClick={()=>setAddDue(addDays(todayISO(),1))}>Tomorrow</button>
          <label className="day-date"><CalendarClock size={14}/><input type="date" value={addDue} onChange={e=>setAddDue(e.target.value||todayISO())}/></label>
        </div>
        {!rep&&<div className="seg">{TASK_OWNERS.map(o=><button key={o} className={'seg-b '+(addOwner===o?'on':'')} onClick={()=>setAddOwner(o)}>{o}</button>)}</div>}
        <button className="btn btn-p" onClick={add}><Plus size={16}/>Add</button>
      </div>
    </div>

    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
      {!rep&&<div className="seg">
        <button className={'seg-b '+(who==='all'?'on':'')} onClick={()=>setWho('all')}>All</button>
        <button className={'seg-b '+(who==='mine'?'on':'')} onClick={()=>setWho('mine')}>Mine</button>
        {BRAND.team.filter(o=>o!==meOwner(me)).map(o=><button key={o} className={'seg-b '+(who===o?'on':'')} onClick={()=>setWho(o)}>{o}</button>)}
        <button className={'seg-b '+(who==='both'?'on':'')} onClick={()=>setWho('both')}>Shared</button>
      </div>}
      <div className="seg">
        <button className={'seg-b '+(show==='open'?'on':'')} onClick={()=>setShow('open')}>Open</button>
        <button className={'seg-b '+(show==='done'?'on':'')} onClick={()=>setShow('done')}>Done</button>
        <button className={'seg-b '+(show==='all'?'on':'')} onClick={()=>setShow('all')}>All</button>
      </div>
      <div className="seg">
        {[['today','Today'],['later','Upcoming'],['none','No date'],['all','All']].map(([k,label])=>(
          <button key={k} className={'seg-b '+(when===k?'on':'')} onClick={()=>setWhen(k)}>
            {label}<span className="seg-n">{whenCounts[k]}</span>
          </button>))}
      </div>
      <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
        {ranked&&<button className="btn btn-g btn-sm" onClick={clearAI}>Clear ranking</button>}
        <button className="btn btn-p" disabled={busy} onClick={runAI}>{busy?<Loader2 size={15} className="spin"/>:<Sparkles size={15}/>}{busy?'Ranking\u2026':'AI rank'}</button>
      </div>
    </div>

    {ranked&&<div className="ai-banner ai-done" style={{marginBottom:14}}><Sparkles size={15}/>{'Ranked for the $10K sprint \u2014 top of the list moves cash first.'}</div>}
    {when==='today'&&overdueCount>0&&<div className="task-overdue" style={{marginBottom:14}}><AlertTriangle size={15}/>
      {overdueCount===1?'1 of these was due before today.':`${overdueCount} of these were due before today.`} Oldest first.</div>}
    {when==='today'&&whenCounts.today===0&&whenCounts.none>0&&<div className="task-hint" style={{marginBottom:14}}><CalendarClock size={15}/>
      {`Nothing is dated for today. ${whenCounts.none} ${whenCounts.none===1?'task has':'tasks have'} no date on ${whenCounts.none===1?'it':'them'} \u2014 tap the date chip on any task to schedule it.`}</div>}

    {ordered.length? <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {ordered.map(t=>{
        const du=t.due?daysUntil(t.due):null;
        const dueColor=du==null?'#8b88a0':du<0?RED:du===0?GOLD:'#5A5680';
        const dueLabel=t.due?(du<0?`${-du}d overdue`:du===0?'Due today':du===1?'Due tomorrow':`Due in ${du}d`):'No date';
        return (<div key={t.id} className="card" style={{padding:'13px 15px',display:'flex',gap:12,alignItems:'flex-start',opacity:t.done?.6:1}}>
          <button onClick={()=>upsertTask({...t,done:!t.done,doneAt:t.done?'':new Date().toISOString(),doneBy:t.done?'':(t.owner&&t.owner!=='Both'?t.owner:me),aiRank:t.done?t.aiRank:null,aiReason:t.done?t.aiReason:''})} style={{background:'none',border:'none',cursor:'pointer',padding:0,marginTop:1,color:t.done?GREEN:'#c3c2d4',flex:'none'}} title={t.done?'Mark open':'Mark done'}>{t.done?<CheckCircle2 size={22}/>:<Circle size={22}/>}</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              {t.aiRank!=null&&!t.done&&<span className="pill" style={{background:INK,color:'#fff',fontWeight:700}}>#{t.aiRank}</span>}
              <span style={{fontWeight:600,color:INK,fontSize:15,textDecoration:t.done?'line-through':'none'}}>{t.title}</span>
            </div>
            {t.aiReason&&!t.done&&<div style={{fontSize:12.5,color:COBALT,marginTop:4,display:'flex',alignItems:'center',gap:5}}><Sparkles size={12}/>{t.aiReason}</div>}
            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:8,alignItems:'center'}}>
              <span className="pill" style={{background:ownerColor(t.owner)+'1A',color:ownerColor(t.owner)}}><span className="dot" style={{background:ownerColor(t.owner)}}/>{t.owner}</span>
              {t.leadId&&leadName(t.leadId)&&(()=>{const l=leads.find(x=>x.id===t.leadId);const isC=l&&l.isClient;return <span className="pill" style={{background:isC?'rgba(31,157,85,.12)':'#F0F1F7',color:isC?'#1a7d46':'#5A5680',cursor:open?'pointer':'default'}} onClick={e=>{if(open){e.stopPropagation();open(t.leadId);}}} title={open?'Open '+(isC?'client':'lead'):undefined}>{isC?<Building2 size={11}/>:<Contact2 size={11}/>}{leadName(t.leadId)}{isC?' · client':''}</span>;})()}
              <label className="task-due-chip" style={{background:du!=null&&du<0?'rgba(209,67,67,.1)':'#F0F1F7',color:dueColor}} title="Tap to reschedule"><CalendarClock size={11}/>{dueLabel}<input type="date" value={t.due||''} onChange={e=>upsertTask({...t,due:e.target.value})}/></label>
              <span style={{fontSize:11,color:'#a6a2bc'}}>{`Impact ${t.revenue} \u00b7 Urgency ${t.urgency} \u00b7 Effort ${t.effort}`}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:4,flex:'none'}}>
            <button className="m-x" style={{width:30,height:30}} onClick={()=>setEdit(t)} title="Edit"><SlidersHorizontal size={15}/></button>
            <button className="m-x" style={{width:30,height:30}} onClick={()=>{if(window.confirm('Delete this task?'))deleteTask(t.id);}} title="Delete"><Trash2 size={15}/></button>
          </div>
        </div>);
      })}
    </div>
    : <div className="empty">{show==='done'?'Nothing checked off yet.':'No tasks yet. Add your first one above \u2014 dump everything in your head here.'}</div>}

    {edit&&<TaskModal task={edit} leads={leads} rep={rep} me={me} onSave={t=>{upsertTask(t);setEdit(null);}} onDelete={id=>{deleteTask(id);setEdit(null);}} onClose={()=>setEdit(null)}/>}
  </>);
}

function TaskModal({task,leads,onSave,onDelete,onClose,rep,me}){
  const [d,setD]=useState({...task});
  const set=p=>setD(x=>({...x,...p}));
  const Knob=({label,field,hint})=>(<div className="field"><label>{label}{'\u2014'} {d[field]} <span style={{color:'#a6a2bc',fontWeight:400}}>{hint}</span></label><input type="range" min="1" max="5" value={d[field]} onChange={e=>set({[field]:Number(e.target.value)})}/></div>);
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" style={{maxWidth:520}} onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head"><div><h2>Edit task</h2><div className="meta">Tune the knobs so the AI ranks it right</div></div><button className="m-x" onClick={onClose}><X size={18}/></button></div>
      <div className="m-scroll">
        <div className="field"><label>Task</label><input value={d.title||''} onChange={e=>set({title:e.target.value})} placeholder="What needs doing?"/></div>
        <div className="fgrid">
          <div className="field"><label>Owner</label>{rep
            ? <input value={me||d.owner||''} disabled/>
            : <select value={d.owner} onChange={e=>set({owner:e.target.value})}>{TASK_OWNERS.map(o=><option key={o} value={o}>{o}</option>)}</select>}</div>
          <div className="field"><label>Due date</label><input type="date" value={d.due||''} onChange={e=>set({due:e.target.value})}/></div>
          <div className="field full"><label>Link to a client or lead</label>
            <select value={d.leadId||''} onChange={e=>set({leadId:e.target.value})}>
              <option value="">— none —</option>
              {(()=>{ const lbl=l=>(l.company?l.company+(l.name?` (${l.name})`:''):l.name)||'Untitled';
                const by=f=>leads.filter(f).sort((a,b)=>lbl(a).localeCompare(lbl(b)));
                const cli=by(l=>l.isClient), lds=by(l=>!l.isClient&&!l.isRelationship), rel=by(l=>l.isRelationship&&!l.isClient);
                return (<>
                  {cli.length>0&&<optgroup label="Clients">{cli.map(l=><option key={l.id} value={l.id}>{lbl(l)}</option>)}</optgroup>}
                  {lds.length>0&&<optgroup label="Leads">{lds.map(l=><option key={l.id} value={l.id}>{lbl(l)}</option>)}</optgroup>}
                  {rel.length>0&&<optgroup label="Relationships">{rel.map(l=><option key={l.id} value={l.id}>{lbl(l)}</option>)}</optgroup>}
                </>);
              })()}
            </select>
          </div>
        </div>
        <Knob label="Revenue impact" field="revenue" hint="how much cash it moves"/>
        <Knob label="Urgency" field="urgency" hint="how time-sensitive"/>
        <Knob label="Effort" field="effort" hint="1 = quick win, 5 = heavy lift"/>
        <div className="field"><label>Notes</label><input value={d.notes||''} onChange={e=>set({notes:e.target.value})} placeholder="Any detail that helps the ranking"/></div>
        <div style={{display:'flex',gap:8,marginTop:16,alignItems:'center'}}>
          <button className="btn btn-p" onClick={()=>onSave({...d,title:(d.title||'').trim()||'Untitled task'})}><CheckCircle2 size={15}/>Save</button>
          <button className="btn btn-d btn-sm" onClick={()=>{if(window.confirm('Delete this task?'))onDelete(d.id);}}><Trash2 size={14}/>Delete</button>
        </div>
      </div>
    </div>
  </div>);
}

/* Every payment logged against a client, as a read-only income row. They are
   DERIVED, not copied: a payment lives on the lead, and duplicating it into the
   txns table would mean two records that drift the moment one is edited. So
   The Books shows them, counts them, and sends you to the client to change one.
   This is what turns an expense ledger into an actual P&L — before this, every
   dollar you collected was invisible here. */
/* The ledger shows CASH, so it reads both arrays — a retainer payment is a line
   on a bank statement like any other. Tagged, so the screen can say which. */
/* REP PAY. A payout is money that LEFT, so it belongs in the ledger like any
   other expense — otherwise the biggest cost in the business never reaches the
   month-by-month net or "Where it goes". Derived from rep_payouts the same way
   client payments derive from leads. */
const payoutTxns=(payouts,users)=>(payouts||[]).map(p=>({
  id:'rp_'+p.id, date:String(p.paid_on||'').slice(0,10), type:'expense', amount:num(p.amount),
  who:((users||[]).find(u=>String(u.id)===String(p.rep_id))||{}).name||'Rep',
  note:p.note||'', category:'Rep pay', derived:true,
}));
const paymentTxns=leads=>(leads||[]).flatMap(l=>paymentRows(l).map(p=>({
  id:'pay_'+l.id+'_'+p.id, date:p.date||'', type:'income', amount:num(p.amount),
  who:l.name||l.company||'Client', note:p.note||'', leadId:l.id, derived:true,
  kind:p.kind||'setup',
})));
/* One page for money. "Money" and "The Books" both meant money in the sidebar,
   so answering a single question meant checking two tabs with overlapping
   tiles. Four sections, in the order the questions get asked:
     Now      — what happened this month
     Coming   — committed cash over 90 days (contractual only, never pipeline)
     History  — profit and loss by month
     Where    — expenses by category, and which clients are worth it           */
function MoneyPage({txns,upsertTxn,deleteTxn,leads,openLead,settings,saveSettings,stages,users,payouts}){
  const [tab,setTab]=useState('now');
  /* computed here rather than passed in — `metrics` is local to Dashboard and
     Money, so threading it through the router would mean lifting it for one
     consumer */
  const m=useMetrics(leads,stages,settings,txns);
  const burn=monthlyBurn(settings);
  const mKey=isoOf(new Date()).slice(0,7);
  const all=useMemo(()=>[...txns,...paymentTxns(leads),...payoutTxns(payouts,users)],[txns,leads,payouts,users]);
  const inMonth=k=>all.filter(t=>(t.date||'').slice(0,7)===k);
  const sum=(rows,dir)=>rows.filter(t=>((TX_TYPES[t.type]||{}).dir)===dir)
    .reduce((a,t)=>a+num(t.amount),0);
  const thisIn=sum(inMonth(mKey),'in'), thisOut=sum(inMonth(mKey),'out');

  /* twelve months of in/out/net, oldest first */
  const months=useMemo(()=>{ const out=[]; const d=new Date();
    for(let i=11;i>=0;i--){ const x=new Date(d.getFullYear(),d.getMonth()-i,1);
      const k=`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;
      const rows=all.filter(t=>(t.date||'').slice(0,7)===k);
      const gi=sum(rows,'in'), go=sum(rows,'out');
      out.push({k,label:x.toLocaleDateString(undefined,{month:'short'}),in:gi,out:go,net:gi-go}); }
    return out; },[all]);
  const best=Math.max(1,...months.map(x=>Math.max(x.in,x.out)));

  const byCat=useMemo(()=>{ const c={};
    all.filter(t=>((TX_TYPES[t.type]||{}).dir)==='out').forEach(t=>{
      const k=t.category||'Uncategorised'; c[k]=(c[k]||0)+num(t.amount); });
    return Object.entries(c).sort((a,b)=>b[1]-a[1]); },[all]);
  const catTotal=byCat.reduce((a,x)=>a+x[1],0)||1;

  const due=recurDueIn(settings,90);
  const dueTotal=due.reduce((a,x)=>a+x.amount,0);
  /* retainers are contractual, so three months of them is a fact, not a guess */
  const mrr=(leads||[]).filter(billsMrr).reduce((a,l)=>a+num(l.retainer),0);
  const owedNow=(leads||[]).reduce((a,l)=>a+owedBy(l,stages),0);
  /* REP PAY. The biggest expense this business is taking on, and it was
     invisible here — accrued pay is committed money in exactly the way a signed
     retainer is committed income, so it belongs on this page BEFORE it is paid,
     not after. Approved-and-unpaid is the debt; pending is a claim the owner has
     not agreed to yet and is shown separately rather than folded in. */
  const repRows=(users||[]).filter(u=>u.role==='rep'&&u.active!==false&&num(u.appointment_rate)>0)
    .map(u=>{ const e=apptEarnings(leads,u.id,num(u.appointment_rate));
      const paid=(payouts||[]).filter(p=>String(p.rep_id)===String(u.id)).reduce((a,p)=>a+num(p.amount),0);
      return {u,e,paid,owed:Math.max(0,e.approvedTotal-paid)}; });
  const repOwed=repRows.reduce((a,r)=>a+r.owed,0);
  const repPending=repRows.reduce((a,r)=>a+r.e.pendingTotal,0);
  const repPaidMonth=(payouts||[]).filter(p=>String(p.paid_on||'').slice(0,7)===mKey).reduce((a,p)=>a+num(p.amount),0);

  const setRec=list=>saveSettings({...settings,recurring:list});
  const addRec=()=>{ const name=(window.prompt('What is the bill? (e.g. Supabase Pro)','')||'').trim();
    if(!name) return;
    const amt=num(window.prompt('How much per charge? ($)',''));
    if(amt<=0){ window.alert('Enter a dollar amount.'); return; }
    setRec([...recurringOf(settings),{id:uid(),name,amount:amt,every:'monthly',
      category:'Software',nextDue:isoOf(new Date()),active:true}]); };
  const patchRec=(id,p)=>setRec(recurringOf(settings).map(r=>r.id===id?{...r,...p}:r));

  const Bar=({v,tone})=>(<div className="mn-bar"><div className={'mn-fill '+tone}
    style={{height:Math.max(2,Math.round(v/best*100))+'%'}}/></div>);

  return (<>
    <div className="sec-h"><div><h2>Money</h2>
      <div className="meta">What came in, what's committed, and where it goes</div></div></div>

    <div className="kgrid" style={{marginBottom:16}}>
      {/* AUDIT #1. Was `thisIn` — every 'in' transaction, which included owner
          contributions and excluded every deal that predates payment tracking,
          so this tile and the dashboard's disagreed under the same label. Both
          now read m.revenueMonth. thisOut/net still come from the ledger. */}
      <Kpi variant="accent" label="Collected this month" value={usd(m.revenueMonth)} icon={<DollarSign size={14}/>}
        d={revenueSplit(m)+(thisOut>0?` · ${usd(thisOut)} out`:'')}/>
      <Kpi variant={burn>0?'gold':undefined} label="Monthly burn" value={usd(burn)} icon={<RefreshCw size={14}/>}
        d={`${recurringOf(settings).filter(r=>r.active!==false).length} recurring bill${recurringOf(settings).filter(r=>r.active!==false).length===1?'':'s'}`}/>
      <Kpi variant="green" label="MRR" value={usd(mrr)} icon={<Handshake size={14}/>}
        d={burn>0?`covers burn ${mrr>=burn?'✓':`· ${usd(burn-mrr)} short`}`:'no burn recorded'}/>
      <Kpi variant={owedNow>0?'gold':undefined} label="Owed to you" value={usd(owedNow)} icon={<Clock size={14}/>}
        d={owedNow>0?'sold, not collected':'all collected'}/>
      <Kpi variant={repOwed>0?'gold':undefined} label="Owed to reps" value={usd(repOwed)} icon={<Wallet size={14}/>}
        d={repOwed>0?`approved, not yet paid${repPending>0?` · ${usd(repPending)} awaiting your approval`:''}`
          :(repPending>0?`${usd(repPending)} awaiting your approval`:'nothing outstanding')}/>
    </div>

    <div className="seg" style={{marginBottom:14}}>
      {[['now','This month'],['coming','Next 90 days'],['history','Month by month'],
        ['where','Where it goes'],['bills','Recurring bills']].map(([k,l])=>
        <button key={k} className={'seg-b '+(tab===k?'on':'')} onClick={()=>setTab(k)}>{l}</button>)}
    </div>

    {tab==='now'&&<div className="card">
      <Books txns={txns} upsertTxn={upsertTxn} deleteTxn={deleteTxn} leads={leads} openLead={openLead} embedded/>
    </div>}

    {tab==='coming'&&<div className="card">
      {/* deliberately NOT a forecast. Everything here is under contract — a
          signed retainer or a bill you already owe. No pipeline guesswork. */}
      <div className="mn-note">Committed only — signed retainers and bills you already owe.
        Nothing here is a guess about deals that might close.</div>
      <div className="mn-two">
        <div>
          <div className="td-h"><ArrowDownLeft size={13}/>Expected in · {usd(mrr*3)}</div>
          <div className="mn-row"><span>Retainers, 3 months</span><b className="in">{usd(mrr*3)}</b></div>
          {owedNow>0&&<div className="mn-row"><span>Invoiced, not yet paid</span><b className="in">{usd(owedNow)}</b></div>}
          {repOwed>0&&<div className="mn-row"><span>Rep pay approved, not yet sent</span><b className="out">{usd(repOwed)}</b></div>}
          {repPending>0&&<div className="mn-row"><span>Rep pay awaiting your approval</span><b className="out">{usd(repPending)}</b></div>}
        </div>
        <div>
          <div className="td-h"><ArrowUpRight size={13}/>Going out · {usd(dueTotal)}</div>
          {due.length?due.slice(0,14).map((x,i)=>(<div className="mn-row" key={i}>
            <span>{fmtDate(x.date)} · {x.r.name}</span><b className="out">{usdc(x.amount)}</b></div>))
            :<div className="subcell">No recurring bills yet — add them under Recurring bills.</div>}
          {due.length>14&&<div className="subcell">+ {due.length-14} more</div>}
        </div>
      </div>
      <div className="mn-net">Net over 90 days: <b className={(mrr*3+owedNow-dueTotal)>=0?'in':'out'}>
        {usd(mrr*3+owedNow-dueTotal)}</b></div>
    </div>}

    {tab==='history'&&<div className="card">
      <div className="mn-chart">{months.map(x=>(<div className="mn-col" key={x.k}>
        <div className="mn-bars"><Bar v={x.in} tone="in"/><Bar v={x.out} tone="out"/></div>
        <div className={'mn-net-s '+(x.net>=0?'in':'out')}>{x.net?usdK(x.net):'—'}</div>
        <div className="mn-lbl">{x.label}</div>
      </div>))}</div>
      <div className="mn-key"><span><i className="in"/>in</span><span><i className="out"/>out</span></div>
    </div>}

    {tab==='where'&&<div className="card">
      {byCat.length?byCat.map(([k,v])=>(<div className="mn-cat" key={k}>
        <span className="mn-cat-n">{k}</span>
        <div className="mn-cat-bar"><div style={{width:Math.round(v/catTotal*100)+'%'}}/></div>
        <b>{usd(v)}</b><em>{Math.round(v/catTotal*100)}%</em>
      </div>)):<div className="empty" style={{padding:'24px 4px'}}>No expenses recorded yet.</div>}
      {m&&m.byClient&&m.byClient.length>0&&<>
        {/* AUDIT #3. Same data as the dashboard's card and it must say the same
            thing: this is BOOKED value, and the cash is shown beside it. */}
        <div className="td-h" style={{marginTop:20}}><Building2 size={13}/>Booked by client</div>
        {m.byClient.slice(0,10).map(c=>(<div className="mn-row" key={c.id}>
          <span>{c.name}{c.mrr>0?` · ${usd(c.mrr)}/mo`:''}
            {c.paid>0?<em className="mn-sub"> · {usd(c.paid)} collected</em>:null}
            {c.owed>0?<em className="mn-sub owed"> · {usd(c.owed)} outstanding</em>:null}</span>
          <b className="in">{usd(c.lifetime)}</b></div>))}
      </>}
    </div>}

    {tab==='bills'&&<div className="card">
      <div className="mn-note">Bills that arrive whether or not you sell anything.
        These drive your burn and the 90-day view — they are <b>not</b> added to the ledger,
        so nothing is counted twice.</div>
      {recurringOf(settings).length?recurringOf(settings).map(r=>(<div className={'mn-bill'+(r.active===false?' off':'')} key={r.id}>
        <input className="mn-bn" value={r.name} onChange={e=>patchRec(r.id,{name:e.target.value})}/>
        <input className="mn-ba" type="number" value={r.amount} onChange={e=>patchRec(r.id,{amount:num(e.target.value)})}/>
        <select value={r.every||'monthly'} onChange={e=>patchRec(r.id,{every:e.target.value})}>
          {RECUR_EVERY.map(([k,l])=><option key={k} value={k}>{l}</option>)}
        </select>
        <select value={r.category||'Software'} onChange={e=>patchRec(r.id,{category:e.target.value})}>
          {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={r.nextDue||''} onChange={e=>patchRec(r.id,{nextDue:e.target.value})}/>
        <span className="mn-pm">{usdc(perMonth(r))}/mo</span>
        <button className="linkbtn" onClick={()=>patchRec(r.id,{active:r.active===false})}>
          {r.active===false?'On':'Pause'}</button>
        <button className="ev-x" onClick={()=>{ if(window.confirm(`Remove ${r.name}?`))
          setRec(recurringOf(settings).filter(x=>x.id!==r.id)); }}><Trash2 size={13}/></button>
      </div>)):<div className="empty" style={{padding:'20px 4px'}}>
        Nothing yet. Add Supabase, Vercel, your domain — anything that bills on a schedule.</div>}
      <button className="deal-add-btn" onClick={addRec}><Plus size={14}/>Add a recurring bill</button>
      {burn>0&&<div className="mn-net">Total burn: <b className="out">{usd(burn)}/mo</b>
        <span className="subcell"> · {usd(burn*12)} a year</span></div>}
    </div>}
  </>);
}

function Books({txns,upsertTxn,deleteTxn,leads,openLead,embedded}){
  const thisYear=todayISO().slice(0,4);
  const [year,setYear]=useState(thisYear);
  const [filter,setFilter]=useState('all');
  const [edit,setEdit]=useState(null); // {txn, file}
  const [busy,setBusy]=useState(false);
  const fileRef=React.useRef(null);
  /* client payments are folded in alongside hand-entered transactions */
  const all=useMemo(()=>[...txns,...paymentTxns(leads)],[txns,leads]);
  const years=useMemo(()=>{const s=new Set(all.map(t=>(t.date||'').slice(0,4)).filter(Boolean));s.add(thisYear);return [...s].sort().reverse();},[all,thisYear]);
  const yearTxns=useMemo(()=>all.filter(t=>(t.date||'').slice(0,4)===year).sort((a,b)=>(b.date||'').localeCompare(a.date||'')),[all,year]);
  const shown=yearTxns.filter(t=>{const d=TX_TYPES[t.type]?.dir;return filter==='all'||(filter==='in'&&d==='in')||(filter==='out'&&d==='out')||(filter==='draw'&&t.type==='draw');});
  const sum=pred=>yearTxns.filter(pred).reduce((a,t)=>a+num(t.amount),0);
  const moneyIn=sum(t=>TX_TYPES[t.type]?.dir==='in');
  const moneyOut=sum(t=>TX_TYPES[t.type]?.dir==='out');
  const net=moneyIn-moneyOut;
  const expenses=sum(t=>t.type==='expense');
  const draws=BRAND.team.map(nm=>({nm,amt:sum(t=>t.type==='draw'&&t.who===nm)}));
  const drawTotal=draws.reduce((a,d)=>a+d.amt,0);
  const openReceipt=async t=>{ if(!t.receipt?.path)return; try{ const url=await db.receiptUrl(t.receipt.path); if(url){window.open(url,'_blank');return;} }catch(e){} try{ const blob=await db.downloadReceipt(t.receipt.path); const u=URL.createObjectURL(blob); window.open(u,'_blank'); }catch(e){ window.alert('Could not open the receipt file.'); } };
  const onPickReceipt=e=>{ const f=e.target.files?.[0]; e.target.value=''; if(!f)return; setEdit({txn:null,file:f}); };
  const downloadYear=async()=>{
    if(!yearTxns.length){window.alert('No transactions for '+year+' yet.');return;}
    setBusy(true);
    try{
      const zip=new JSZip();
      const head=['Date','Type','Category','Vendor/Source','Method','Who','Amount','Notes','Receipt file'];
      const lines=[head.join(',')].concat(yearTxns.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(t=>{
        const signed=(TX_TYPES[t.type]?.dir==='out'?-1:1)*num(t.amount);
        return [t.date||'',TX_TYPES[t.type]?.label||t.type,t.category||'',csvq(t.party),t.method||'',t.who||'',signed,csvq(t.notes),t.receipt?.name||''].join(',');
      }));
      lines.push(['','','','','','','TOTALS','',''].join(','));
      lines.push(['Money in','','','','','',moneyIn,'',''].join(','));
      lines.push(['Money out','','','','','',moneyOut,'',''].join(','));
      lines.push(['Net','','','','','',net,'',''].join(','));
      zip.file(`books-${year}.csv`,lines.join('\n'));
      const rf=zip.folder('receipts');
      let missing=0;
      for(const t of yearTxns){ if(t.receipt?.path&&typeof db.downloadReceipt==='function'){ try{ const blob=await db.downloadReceipt(t.receipt.path); rf.file((t.date||'')+'-'+(t.receipt.name||t.receipt.path.split('/').pop()),blob);}catch(e){missing++;} } }
      const out=await zip.generateAsync({type:'blob'});
      const u=URL.createObjectURL(out);const a=document.createElement('a');a.href=u;a.download=`the-books-${year}.zip`;a.click();URL.revokeObjectURL(u);
      if(missing)window.alert('Bundle downloaded. '+missing+' receipt file(s) could not be fetched (storage may not be set up yet).');
    }catch(e){window.alert('Could not build the bundle: '+(e.message||e));}
    setBusy(false);
  };
  return (<>
    <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}} onChange={onPickReceipt}/>
    <div className="card" style={{marginBottom:18}}>
      <div className="bk-actions">
        <button className="btn btn-p" onClick={()=>fileRef.current?.click()}><Upload size={15}/>Upload receipt</button>
        <button className="btn btn-s" onClick={()=>setEdit({txn:null,file:null})}><Plus size={15}/>Add transaction</button>
        <button className="btn btn-s" style={{marginLeft:'auto'}} disabled={busy} onClick={downloadYear}>{busy?<Loader2 size={15} className="spin"/>:<FileDown size={15}/>}Download {year} for CPA</button>
      </div>
    </div>
    <div className="kpis">
      <Kpi variant="accent" label="Money in" value={usd(moneyIn)} icon={<ArrowDownLeft size={14}/>} d={year}/>
      <Kpi label="Money out" value={usd(moneyOut)} icon={<ArrowUpRight size={14}/>} d={`${usd(expenses)} expenses`}/>
      <Kpi label="Net" value={usd(net)} icon={<Wallet size={14}/>} d={net>=0?'positive':'negative'}/>
      <Kpi label="Owner draws" value={usd(drawTotal)} icon={<Wallet size={14}/>} d={draws.map(d=>`${d.nm[0]} ${usd(d.amt)}`).join(' · ')||'—'}/>
    </div>
    <div className="bk-filters">
      {[['all','All'],['in','Money in'],['out','Money out'],['draw','Draws']].map(([k,l])=>(
        <button key={k} className={'bk-chip'+(filter===k?' on':'')} onClick={()=>setFilter(k)}>{l}</button>))}
      <div className="bk-yr"><span style={{fontSize:12,color:'#8b88a0',fontWeight:600}}>Year</span><select value={year} onChange={e=>setYear(e.target.value)}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
    </div>
    <div className="card">
      {shown.length?<table className="tbl"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Vendor / Source</th><th>Who</th><th>Receipt</th><th style={{textAlign:'right'}}>Amount</th></tr></thead>
      {/* A derived payment row opens its CLIENT, not the transaction editor —
          the record lives on the lead and there is nothing here to edit. */}
      <tbody>{shown.map(t=>{const m=TX_TYPES[t.type]||{};const out=m.dir==='out';return(<tr key={t.id}
        className={t.derived?'tx-derived':''}
        onClick={()=>t.derived?(openLead&&openLead(t.leadId)):setEdit({txn:t,file:null})}>
        <td className="subcell">{fmtDate(t.date)}</td>
        <td><span className="tx-type">{out?<ArrowUpRight size={13} color="#b4322e"/>:<ArrowDownLeft size={13} color="#1f9d63"/>}{m.label||t.type}
          {t.derived&&<span className="tx-src">client payment</span>}</span></td>
        <td className="subcell">{t.category||(t.derived?'Client revenue':'—')}</td>
        <td><div className="namecell">{t.party||t.who||'—'}</div>{(t.notes||t.note)&&<div className="subcell">{t.notes||t.note}</div>}</td>
        <td className="subcell">{t.who||'—'}</td>
        <td onClick={e=>{e.stopPropagation();if(t.receipt)openReceipt(t);}}>{t.receipt?<span className="rc-btn"><Paperclip size={13}/>View</span>:<span className="rc-none">—</span>}</td>
        <td style={{textAlign:'right'}}><span className={'tx-amt '+(out?'tx-out':'tx-in')}>{out?'−':'+'}{usd(num(t.amount))}</span></td>
      </tr>);})}</tbody></table>
      :<div className="empty">No {filter==='all'?'':TX_TYPES[filter]?'':''}transactions for {year} yet. Hit <b>Upload receipt</b> or <b>Add transaction</b> to start the books.</div>}
    </div>
    {edit&&<TxnModal txn={edit.txn} file={edit.file} onSave={t=>{upsertTxn(t);setEdit(null);}} onDelete={t=>{deleteTxn(t);setEdit(null);}} onClose={()=>setEdit(null)}/>}
  </>);
}

function TxnModal({txn,file,onSave,onDelete,onClose}){
  const [d,setD]=useState(txn?{...txn}:{id:uid(),type:file?'expense':'expense',date:todayISO(),amount:'',category:'',party:'',method:'Card',who:'Business',notes:'',receipt:null,createdAt:new Date().toISOString()});
  const [ai,setAi]=useState(null); // null | reading | done | off
  const [saving,setSaving]=useState(false);
  const set=p=>setD(x=>({...x,...p}));
  useEffect(()=>{ if(!file||txn) return; let go=true; (async()=>{ setAi('reading');
    try{ const b64=await toB64(file); const r=await apiPost('/api/parse-receipt',{file:b64,mime:file.type}); const j=await r.json();
      if(go&&j&&j.ok&&j.fields){ const f=j.fields; setD(x=>({...x,type:'expense',party:f.vendor||x.party,date:f.date||x.date,amount:f.total||x.amount,category:f.category||x.category,notes:f.summary||x.notes})); setAi('done'); }
      else if(go){ setAi('off'); } }
    catch(e){ if(go)setAi('off'); } })(); return ()=>{go=false;}; },[]);
  const cats=(d.type==='income'||d.type==='contribution')?INC_CATS:EXP_CATS;
  const showCat=d.type==='income'||d.type==='expense';
  const save=async()=>{
    let receipt=d.receipt||null;
    if(file){ setSaving(true);
      const yr=(d.date||todayISO()).slice(0,4);
      const safe=(file.name||'receipt.pdf').replace(/[^\w.\-]+/g,'_');
      const path=`${yr}/${d.id}-${safe}`;
      try{ if(typeof db.uploadReceipt==='function'){ await db.uploadReceipt(path,file); receipt={path,name:file.name||safe,uploadedAt:new Date().toISOString()}; } }
      catch(e){ window.alert('Transaction saved — but the receipt file could not be stored yet. Finish the one-time Storage setup, then re-upload this receipt. ('+(e.message||e)+')'); }
      setSaving(false);
    }
    onSave({...d,amount:num(d.amount),receipt});
  };
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" style={{maxWidth:560}} onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head"><div><h2>{txn?'Edit transaction':'New transaction'}</h2><div className="meta">The Books</div></div><button className="m-x" onClick={onClose}><X size={18}/></button></div>
      <div className="m-scroll">
        {ai==='reading'&&<div className="ai-banner ai-reading"><Loader2 size={15} className="spin"/>Reading the receipt…</div>}
        {ai==='done'&&<div className="ai-banner ai-done"><Sparkles size={15}/>Filled in from your receipt — review and tweak below.</div>}
        {ai==='off'&&<div className="ai-banner ai-off"><AlertTriangle size={15}/>AI read-back isn't on yet — type the details (your file is still attached). </div>}
        <div className="fgrid">
          <div className="field"><label>Type</label><select value={d.type} onChange={e=>set({type:e.target.value})}>{Object.entries(TX_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          <div className="field"><label>Amount</label><input type="number" inputMode="decimal" value={d.amount} onChange={e=>set({amount:e.target.value})} placeholder="0.00"/></div>
          <div className="field"><label>Date</label><input type="date" value={d.date||''} onChange={e=>set({date:e.target.value})}/></div>
          {showCat&&<div className="field"><label>Category</label><select value={d.category||''} onChange={e=>set({category:e.target.value})}><option value="">— pick —</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
          <div className="field"><label>{TX_TYPES[d.type]?.dir==='in'?'Source':'Vendor'}</label><input value={d.party||''} onChange={e=>set({party:e.target.value})} placeholder={TX_TYPES[d.type]?.dir==='in'?'Who paid you':'Who you paid'}/></div>
          <div className="field"><label>Method</label><select value={d.method||'Card'} onChange={e=>set({method:e.target.value})}>{TX_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          <div className="field"><label>Who</label><select value={d.who||'Business'} onChange={e=>set({who:e.target.value})}>{TX_WHO.map(w=><option key={w} value={w}>{w}</option>)}</select></div>
          <div className="field full"><label>Notes</label><input value={d.notes||''} onChange={e=>set({notes:e.target.value})} placeholder="What was this for?"/></div>
        </div>
        {file&&<div className="rcfile"><Paperclip size={14}/>{file.name}<span style={{marginLeft:'auto',color:'#8b88a0'}}>will be saved with this entry</span></div>}
        {!file&&d.receipt&&<div className="rcfile"><Paperclip size={14}/>{d.receipt.name}<span style={{marginLeft:'auto',color:'#8b88a0'}}>receipt on file</span></div>}
        <div style={{display:'flex',gap:8,marginTop:16,alignItems:'center'}}>
          <button className="btn btn-p" disabled={saving} onClick={save}>{saving?<Loader2 size={15} className="spin"/>:<CheckCircle2 size={15}/>}Save</button>
          {txn&&<button className="btn btn-d btn-sm" onClick={()=>{if(window.confirm('Delete this transaction?'))onDelete(txn);}}><Trash2 size={14}/>Delete</button>}
        </div>
      </div>
    </div>
  </div>);
}

const ACT_COLORS={Booked:'#E0662B',Call:'#2B4DE0',Text:'#1F9D55',Meeting:'#7A5CC8',Note:'#C8A24A',Email:'#D14343',Task:'#0E9AA7'};
const ACT_ORDER=['Booked','Call','Text','Meeting','Note','Email','Task'];
const ACT_ICON={Booked:CalendarCheck,Note:StickyNote,Call:PhoneCall,Text:MessageSquare,Meeting:CalendarClock,Email:Mailbox,Task:ListTodo,Payment:DollarSign};
function Activity({leads,tasks,me,open,rep}){
  const [mode,setMode]=useState('day');
  const [anchor,setAnchor]=useState(todayISO());
  const [who,setWho]=useState('All');
  const [typeF,setTypeF]=useState('All');
  const range=useMemo(()=>{
    const d=new Date(anchor+'T00:00:00'); let start,end,label;
    if(mode==='day'){ start=new Date(d); end=new Date(d); label=d.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}); }
    else if(mode==='week'){ const dow=d.getDay(); start=new Date(d); start.setDate(d.getDate()-dow); end=new Date(start); end.setDate(start.getDate()+6); label=start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+end.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
    else { start=new Date(d.getFullYear(),d.getMonth(),1); end=new Date(d.getFullYear(),d.getMonth()+1,0); label=d.toLocaleDateString(undefined,{month:'long',year:'numeric'}); }
    start.setHours(0,0,0,0); end.setHours(23,59,59,999); return {start,end,label};
  },[mode,anchor]);
  const all=useMemo(()=>{
    const acts=leads.flatMap(l=>(l.activities||[]).map(a=>({...a,leadId:l.id,leadName:l.name,company:l.company,
      cancelled:a.type==='Booked'?!bookingLive(l,a):!!a.cancelled})));
    /* completed tasks count as work done — fold them into the same feed */
    const done=(tasks||[]).filter(t=>t.done).map(t=>{
      /* Tasks completed before we started stamping doneAt have no completion time.
         Fall back to the best real date the task already carries (due, then created)
         so they still show — flagged approximate rather than invented. */
      const stamp=t.doneAt || t.createdAt || '';
      if(!stamp) return null;
      const l=leads.find(x=>x.id===t.leadId);
      return {id:'task-'+t.id,ts:stamp,type:'Task',text:t.title||'(untitled task)',
        who:t.doneBy||(t.owner&&t.owner!=='Both'?t.owner:'—'),
        leadId:t.leadId||'',leadName:l?l.name:'',company:l?l.company:'',isTask:true,approx:!t.doneAt};
    }).filter(Boolean);
    return [...acts,...done];
  },[leads,tasks]);
  const inRange=useMemo(()=>all.filter(a=>{const t=new Date(a.ts);return t>=range.start&&t<=range.end;}),[all,range]);
  /* owners get the whole team in the picker; a rep gets only the names that
     actually appear in their own feed — never the owners'. */
  const people=useMemo(()=>{const s=new Set(inRange.map(a=>a.who||'—'));
    if(!rep) BRAND.team.forEach(p=>s.add(p));
    return [...s].filter(Boolean).sort();},[inRange,rep]);
  /* the person filter drives the WHOLE tab — KPIs, chart, matrix and log */
  const scope=useMemo(()=>inRange.filter(a=>who==='All'||a.who===who),[inRange,who]);
  /* the LOG shows cancelled bookings (struck through — they happened, and hiding
     them would quietly rewrite the day). The NUMBERS don't count them. */
  const live=useMemo(()=>scope.filter(a=>!a.cancelled),[scope]);
  const shown=scope.filter(a=>typeF==='All'||a.type===typeF).sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));
  const matrix=useMemo(()=>{const m={};const zero=()=>ACT_ORDER.reduce((o,k)=>(o[k]=0,o),{total:0});live.forEach(a=>{const p=a.who||'—';m[p]=m[p]||zero();if(m[p][a.type]!=null)m[p][a.type]++;m[p].total++;});return m;},[live]);
  const chartData=Object.entries(matrix).map(([person,c])=>({person,...c})).sort((a,b)=>b.total-a.total);
  const totals=ACT_ORDER.reduce((o,t)=>{o[t]=live.filter(a=>a.type===t).length;return o;},{});
  const grand=live.length;
  const cancelledCount=scope.length-live.length;
  const shift=dir=>{const d=new Date(anchor+'T00:00:00');if(mode==='day')d.setDate(d.getDate()+dir);else if(mode==='week')d.setDate(d.getDate()+7*dir);else d.setMonth(d.getMonth()+dir);setAnchor(d.toISOString().slice(0,10));};
  const fmtTime=ts=>{try{return new Date(ts).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}catch{return '';}};
  const dayHead=ts=>new Date(ts).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  const kIcon=t=>{const I=ACT_ICON[t];return I?React.createElement(I,{size:14}):null;};
  let lastDay=null;
  return (<>
    <div className="card" style={{marginBottom:16}}>
      <div className="act-ctrl">
        <div className="seg">{[['day','Day'],['week','Week'],['month','Month']].map(([k,l])=><button key={k} className={mode===k?'on':''} onClick={()=>setMode(k)}>{l}</button>)}</div>
        <div className="act-nav"><button className="iconbtn" onClick={()=>shift(-1)}><ChevronLeft size={16}/></button><b>{range.label}</b><button className="iconbtn" onClick={()=>shift(1)}><ChevronRight size={16}/></button></div>
        <input type="date" value={anchor} onChange={e=>setAnchor(e.target.value)} style={{padding:'7px 10px',border:'1px solid #E1E2EC',borderRadius:9,fontSize:13,color:INK}}/>
        <button className="btn btn-s btn-sm" style={{marginLeft:'auto'}} onClick={()=>{setMode('day');setAnchor(todayISO());}}>Today</button>
      </div>
      <div className="bk-filters" style={{margin:0}}>
        <button className={'bk-chip'+(who==='All'?' on':'')} onClick={()=>setWho('All')}>Everyone</button>
        {people.map(p=><button key={p} className={'bk-chip'+(who===p?' on':'')} onClick={()=>setWho(p)}>{p}</button>)}
        <span style={{width:1,height:22,background:'#E4E5EE',margin:'0 4px'}}/>
        <button className={'bk-chip'+(typeF==='All'?' on':'')} onClick={()=>setTypeF('All')}>All types</button>
        {ACT_ORDER.map(t=><button key={t} className={'bk-chip'+(typeF===t?' on':'')} onClick={()=>setTypeF(t)}>{t}</button>)}
      </div>
    </div>
    <div className="kpis">
      <Kpi variant="accent" label="Total logged" value={grand} icon={<List size={14}/>} d={(who==='All'?'Everyone':who)+' · '+range.label+(cancelledCount>0?` · ${cancelledCount} cancelled, not counted`:'')}/>
      {ACT_ORDER.map(t=><Kpi key={t} variant={t==='Booked'?'accent':undefined} label={actPlural(t)} value={totals[t]} icon={kIcon(t)}/>)}
    </div>
    {chartData.length>0&&<div className="card" style={{marginBottom:16}}>
      <div className="ch-title">Activity by person</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{top:8,right:8,left:-14,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F5" vertical={false}/>
          <XAxis dataKey="person" tick={{fontSize:12,fill:'#6a6788'}}/>
          <YAxis allowDecimals={false} tick={{fontSize:12,fill:'#9b98ad'}}/>
          <Tooltip/>
          <Legend wrapperStyle={{fontSize:12}}/>
          {ACT_ORDER.map(t=><Bar key={t} dataKey={t} stackId="a" fill={ACT_COLORS[t]} radius={t==='Email'?[4,4,0,0]:0}/>)}
        </BarChart>
      </ResponsiveContainer>
    </div>}
    {chartData.length>0&&<div className="card" style={{marginBottom:16}}>
      <table className="tbl"><thead><tr><th>Person</th>{ACT_ORDER.map(t=><th key={t} style={{textAlign:'right'}}>{t}</th>)}<th style={{textAlign:'right'}}>Total</th></tr></thead>
      <tbody>{chartData.map(r=>(<tr key={r.person}><td className="namecell">{r.person}</td>{ACT_ORDER.map(t=><td key={t} style={{textAlign:'right'}} className="subcell">{r[t]||0}</td>)}<td style={{textAlign:'right',fontWeight:800,color:INK}}>{r.total}</td></tr>))}</tbody></table>
    </div>}
    <div className="card">
      <div className="ch-title">Log · {shown.length} {shown.length===1?'entry':'entries'}</div>
      {shown.length?<div className="act-feedlist">{shown.map(a=>{const Ic=ACT_ICON[a.type]||StickyNote;const dk=(a.ts||'').slice(0,10);const head=mode!=='day'&&dk!==lastDay;lastDay=dk;return(
        <React.Fragment key={a.id}>
          {head&&<div className="act-daysep">{dayHead(a.ts)}</div>}
          <div className={'act-row'+(a.cancelled?' cancelled':'')} onClick={()=>open&&open(a.leadId)}>
            <div className="act-ic" style={{background:a.cancelled?'#B9B6C6':(ACT_COLORS[a.type]||'#8b88a0')}}><Ic size={15}/></div>
            <div className="act-body">
              <div className="act-top"><span className="act-lead">{a.leadName||'—'}</span><span className="act-who">{a.who||'—'}</span><span className="act-time" title={a.approx?'Completed before we tracked exact times — showing its due date':undefined}>{a.approx?'~':''}{fmtTime(a.ts)}</span></div>
              <div className="act-txt">{a.text}{a.cancelled&&<span className="fcancel">cancelled</span>}</div>
            </div>
          </div>
        </React.Fragment>);})}</div>
      :<div className="empty">No activity logged for {mode==='day'?'this day':'this '+mode}{who!=='All'?' by '+who:''}{typeF!=='All'?' · '+typeF:''}. Log calls, texts &amp; meetings from any lead and they'll show up here.</div>}
    </div>
  </>);
}

/* ===================== TEAM (owner-only) =====================
   Everything about a person lives here: their login, their commission %,
   which pools they can see, which tabs they get, and whether they're active.
   The database enforces the lead-level part of this (see MIGRATION.sql);
   the tab list is a UI convenience on top of it, not a security boundary. */
function TeamCard({users,settings,saveSettings,saveUser,removeUser,claimOwner,reassign,me,myUid,noUsers}){
  const [openId,setOpenId]=useState(null);
  const [adding,setAdding]=useState(false);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState(null);
  /* REP PAY. Both rates default to ZERO on a new hire — "on no pay model yet"
     is the honest starting state, and a rate you meant to set is better as a
     blank you notice than a 10% you did not choose. */
  const blank={name:'',email:'',role:'rep',commission_pct:0,appointment_rate:0,pools:[],tabs:REP_DEFAULT_TABS,password:'',goal_conversions:0};
  const [f,setF]=useState(blank);
  const pools=poolList(settings);
  const setPools=next=>saveSettings({...settings,pools:next});
  const addPool=()=>{ const v=(window.prompt('Name this lead pool (e.g. "Inbound", "Wichita")')||'').trim(); if(!v||pools.includes(v))return; setPools([...pools,v]); };
  const genPw=()=>Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,6).toUpperCase()+'!1';
  const toggleIn=(arr,v)=>arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];
  const create=async()=>{
    const name=f.name.trim(), email=f.email.trim().toLowerCase();
    if(!name){ setMsg({bad:true,t:'Give them a name.'}); return; }
    if(!/.+@.+\..+/.test(email)){ setMsg({bad:true,t:'A real email address is required — that is their login.'}); return; }
    const pw=f.password.trim()||genPw();
    setBusy(true); setMsg(null);
    try{
      const {id,needsConfirm}=await auth.createLogin(email,pw);
      if(!id||needsConfirm) throw new Error('Supabase created the login but did not return a user id — switch "Confirm email" OFF in Authentication → Providers → Email, then add them again.');
      await saveUser({id,name,email,role:f.role,pools:f.pools,commission_pct:num(f.commission_pct),appointment_rate:num(f.appointment_rate),active:true,
        tabs:f.role==='rep'?f.tabs:[],goal_conversions:num(f.goal_conversions)});
      setMsg({t:`${name} can sign in with ${email} and the temporary password ${pw} — give it to them, or send a reset email below.`,pw,email});
      setF(blank); setAdding(false);
    }catch(e){ setMsg({bad:true,t:e.message||String(e)}); }
    setBusy(false);
  };
  const reset=async email=>{ try{ await auth.sendReset(email); setMsg({t:`Password email sent to ${email}.`}); }
    catch(e){ setMsg({bad:true,t:e.message||String(e)}); } };
  return (<div className="card" style={{marginBottom:18}}>
    <div className="sec-title"><Users size={15}/>Team</div>
    <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Owners see everything. Sales reps see only their own leads plus the pools you give them — enforced in the database, not just hidden in the app.</div>

    {noUsers&&<div className="note" style={{marginBottom:14}}>
      <b>Nobody is set up yet.</b> This install still behaves exactly as it always has. Claim ownership to start adding people — nothing changes for you.
      <div style={{marginTop:10}}><button className="btn btn-p btn-sm" onClick={claimOwner}><BadgeCheck size={14}/>Make me the owner</button></div>
    </div>}

    <div className="tm-list">
      {users.map(u=>{ const open=openId===u.id; const isR=u.role==='rep'; const tabs=tabsOf(u);
        const set=patch=>saveUser({...u,...patch});
        return (<div className={'tm-row'+(u.active===false?' off':'')} key={u.id}>
          <div className="tm-head" onClick={()=>setOpenId(open?null:u.id)}>
            <span className="team-av">{(u.name||'?')[0]}</span>
            <span className="tm-name">{u.name}{u.id===myUid&&<i>you</i>}<span className="subcell">{u.email||'—'}</span></span>
            <span className={'tm-role '+u.role}>{u.role==='owner'?'Owner':'Sales Rep'}</span>
            {/* The pay model on the COLLAPSED row, so who is on what is visible
                without opening anybody — which is how a leftover rate from an
                old default gets noticed rather than discovered on a payslip. */}
            {isR&&(()=>{ const c=num(u.commission_pct), a=num(u.appointment_rate);
              if(!c&&!a) return <span className="tm-nopay">no pay model</span>;
              return (<span className="tm-pay">
                {a>0&&<em>{usd(a)}/appt</em>}
                {c>0&&<em>{c}% commission</em>}
              </span>); })()}
            {u.active===false&&<span className="tm-off">inactive</span>}
            <ChevronDown size={15} className={'msec-ch'+(open?' on':'')}/>
          </div>
          {open&&<div className="tm-body">
            <div className="fgrid">
              <div className="field"><label>Name</label><input value={u.name||''} onChange={e=>set({name:e.target.value})}/></div>
              <div className="field"><label>Role</label><select value={u.role} onChange={e=>set({role:e.target.value})}><option value="owner">Owner</option><option value="rep">Sales Rep</option></select></div>
              {/* REP PAY. Two rates, INDEPENDENT. A rep is on a model when its
                  rate is non-zero — either, both, or neither — so there is no
                  third field to keep in sync with two numbers that already say
                  everything. Both zero is a valid, quiet state and is what a
                  new hire looks like. */}
              {isR&&<div className="field full"><div className="subcell" style={{fontWeight:700,color:'#181530'}}>How this rep is paid</div>
                <div className="subcell">Set either, both, or neither. <b>Zero means they are not on that model.</b></div></div>}
              {isR&&<div className="field"><label>Per appointment $</label><input type="number" min="0" step="5" value={u.appointment_rate??0} onChange={e=>set({appointment_rate:num(e.target.value)})}/>
                <div className="subcell" style={{marginTop:4}}>Paid when a meeting they set is marked <b>held</b>. Cancelled and no-shows pay nothing.</div></div>}
              {isR&&<div className="field"><label>Commission %</label><input type="number" min="0" step="0.5" value={u.commission_pct??0} onChange={e=>set({commission_pct:num(e.target.value)})}/>
                <div className="subcell" style={{marginTop:4}}>Paid on the deal value at conversion.</div></div>}
              {isR&&<div className="field"><label>Monthly conversion goal</label><input type="number" min="0" value={u.goal_conversions??0} onChange={e=>set({goal_conversions:num(e.target.value)})}/></div>}
            </div>
            {isR&&<>
              <div className="tm-sub">Lead pools they can see</div>
              <div className="chips">{pools.map(p=><button key={p} className={'chip'+((u.pools||[]).includes(p)?' on':'')} onClick={()=>set({pools:toggleIn(u.pools||[],p)})}>{p}</button>)}
                <button className="chip add" onClick={addPool}><Plus size={12}/>New pool</button></div>
              <div className="tm-sub">Tabs they see</div>
              <div className="chips">{ALL_MODULES.filter(([k])=>REP_TABS.includes(k)).map(([k,label])=>{ const on=tabs.includes(k); const money=MONEY_TABS.includes(k);
                return (<button key={k} className={'chip'+(on?' on':'')+(money?' warn':'')} title={money?'Shows company money — off by default':undefined}
                  onClick={()=>set({tabs:toggleIn(tabs,k)})}>{label}{money&&on?' ⚠':''}</button>); })}</div>
              <div className="subcell" style={{marginTop:8}}>Dashboard is always on. Tabs marked ⚠ expose company revenue — leave them off unless you mean it. A rep can never see a tab this install has globally switched off in <b>Sections</b>.</div>
            </>}
            {isR&&<div className="tm-reassign">
              <span>Move every lead of theirs to</span>
              <select defaultValue="" onChange={async e=>{ const v=e.target.value; e.target.value='';
                if(!v) return; const to=v==='__pool'?null:users.find(x=>x.id===v);
                if(!window.confirm(`Move every lead owned by ${u.name} to ${to?to.name:'the unclaimed pool'}? Their commission history stays with them.`)) return;
                const n=await reassign(u,to); window.alert(n?`${n} lead${n===1?'':'s'} moved.`:'They had no leads to move.'); }}>
                <option value="">— pick someone —</option>
                {users.filter(x=>x.id!==u.id&&x.active!==false).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
                <option value="__pool">The unclaimed pool</option>
              </select>
            </div>}
            <div className="tm-acts">
              <button className="btn btn-g btn-sm" onClick={()=>set({active:u.active===false})}>{u.active===false?<><BadgeCheck size={14}/>Reactivate</>:<><Ban size={14}/>Deactivate</>}</button>
              {u.email&&<button className="btn btn-g btn-sm" onClick={()=>reset(u.email)}><KeyRound size={14}/>Send password email</button>}
              {u.id!==myUid&&<button className="btn btn-d btn-sm" onClick={()=>{ if(window.confirm(`Remove ${u.name} from the CRM? Their leads and history stay — their access ends.`)) removeUser(u.id); }}><Trash2 size={14}/>Remove</button>}
            </div>
            <div className="subcell" style={{marginTop:8}}>Deactivating keeps every lead, note and commission — it only ends their access and takes them off the leaderboard.</div>
          </div>}
        </div>); })}
      {!users.length&&!noUsers&&<div className="empty">No people yet.</div>}
    </div>

    {adding?(<div className="tm-add">
      <div className="tm-sub">New hire</div>
      <div className="fgrid">
        <div className="field"><label>Name</label><input autoFocus value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
        <div className="field"><label>Email (this is their login)</label><input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div>
        <div className="field"><label>Role</label><select value={f.role} onChange={e=>setF({...f,role:e.target.value})}><option value="rep">Sales Rep</option><option value="owner">Owner</option></select></div>
        {f.role==='rep'&&<div className="field"><label>Per appointment $</label><input type="number" min="0" step="5" value={f.appointment_rate} onChange={e=>setF({...f,appointment_rate:e.target.value})}/></div>}
        {f.role==='rep'&&<div className="field"><label>Commission %</label><input type="number" min="0" step="0.5" value={f.commission_pct} onChange={e=>setF({...f,commission_pct:e.target.value})}/></div>}
        <div className="field full"><label>Temporary password (blank = generate one)</label><input value={f.password} onChange={e=>setF({...f,password:e.target.value})} placeholder="leave blank and we'll make one"/></div>
      </div>
      {f.role==='rep'&&<>
        <div className="tm-sub">Lead pools they can see</div>
        <div className="chips">{pools.map(p=><button key={p} className={'chip'+(f.pools.includes(p)?' on':'')} onClick={()=>setF({...f,pools:toggleIn(f.pools,p)})}>{p}</button>)}
          <button className="chip add" onClick={addPool}><Plus size={12}/>New pool</button></div>
        <div className="tm-sub">Tabs they see</div>
        <div className="chips">{ALL_MODULES.filter(([k])=>REP_TABS.includes(k)).map(([k,label])=>{ const on=f.tabs.includes(k); const money=MONEY_TABS.includes(k);
          return <button key={k} className={'chip'+(on?' on':'')+(money?' warn':'')} onClick={()=>setF({...f,tabs:toggleIn(f.tabs,k)})}>{label}</button>; })}</div>
      </>}
      <div className="tm-acts">
        <button className="btn btn-p btn-sm" disabled={busy} onClick={create}><UserPlus size={14}/>{busy?'Creating…':'Create login'}</button>
        <button className="btn btn-g btn-sm" onClick={()=>{setAdding(false);setF(blank);}}>Cancel</button>
      </div>
    </div>):<button className="btn btn-p btn-sm" style={{marginTop:12}} onClick={()=>{setAdding(true);setMsg(null);}}><UserPlus size={14}/>Add a person</button>}

    {msg&&<div className={'note '+(msg.bad?'bad':'')} style={{marginTop:14}}>
      {msg.t}
      {msg.pw&&<div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="btn btn-g btn-sm" onClick={()=>reset(msg.email)}><KeyRound size={14}/>Email them a set-password link instead</button></div>}
    </div>}
    <div className="subcell" style={{marginTop:12}}>Creating a login needs <b>Email</b> sign-ups enabled in Supabase → Authentication → Providers, with <b>Confirm email</b> off (otherwise Supabase won't hand back the user id we need).</div>

    <div className="rep-pay-toggle" onClick={()=>saveSettings({...settings,repPayments:!settings.repPayments})}>
      <span className={'sw '+(settings.repPayments?'on':'')}><b/></span>
      <div><b>Let sales reps log payments</b><div className="subcell" style={{marginTop:2}}>Off by default. When on, reps get the Payment button in a lead's activity log. They still never see company revenue totals.</div></div>
    </div>
  </div>);
}

/* ---- Pocket import -------------------------------------------------------
   Recordings that predate the webhook. One button, because six recordings is
   not a bulk import problem — and because importing twice is a no-op, which is
   what let the date picker, the paging and the pick-list be cut (POCKET-PLAN
   §13 r4).

   "Already here" is computed HERE, from the recordings the app already holds.
   No second source of truth and no server round trip to answer it. */
function PocketImport({pockets,onDone}){
  const [busy,setBusy]=useState(false);
  const [rows,setRows]=useState(null);
  const [err,setErr]=useState('');
  const have=useMemo(()=>new Set((pockets||[]).map(r=>r.id)),[pockets]);

  const post=async body=>{
    const mod=await import('./lib/supabase');
    const sess=await mod.auth.session();
    const tok=(sess&&sess.access_token)||'';
    const r=await fetch('/api/pocket-backfill',{method:'POST',
      headers:{'Content-Type':'application/json',...(tok?{authorization:`Bearer ${tok}`}:{})},
      body:JSON.stringify(body)});
    return r.json();
  };

  const run=async()=>{
    setBusy(true); setErr(''); setRows(null);
    try{
      const list=await post({action:'list'});
      if(!list.ok){ setErr(list.error||'Could not reach Pocket.'); setBusy(false); return; }
      const found=list.recordings||[];
      if(!found.length){ setRows([]); setBusy(false); return; }
      /* One at a time: the browser drives the loop so a long transcript cannot
         time the function out, and one failure costs one recording. */
      const out=[];
      for(const rec of found){
        const already=have.has(rec.id);
        setRows([...out,{...rec,state:'working'}]);
        const res=await post({action:'import',id:rec.id});
        out.push({...rec,state:res.ok?(already?'refreshed':(res.created?'imported':'refreshed')):'failed',
          error:res.error||'',noTranscript:res.ok&&res.transcript===false,shape:res.shape||null});
        setRows([...out]);
      }
      setRows(out);
      if(onDone) await onDone();
    }catch{ setErr('Could not reach Pocket.'); }
    setBusy(false);
  };

  const label={imported:'Imported',refreshed:'Already here — refreshed',failed:'Failed',working:'…'};
  const colour={imported:GREEN,refreshed:'#8b88a0',failed:RED,working:'#8b88a0'};

  return (<div className="card" style={{marginBottom:18}}>
    <div className="sec-title"><Mic size={15}/>Pocket</div>
    <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>
      New recordings arrive on their own through the webhook. This pulls in ones that
      predate it — your 20 most recent. Running it again is safe: a recording already
      here is refreshed, never duplicated, and one you have finished with stays finished.
    </div>
    <button className="btn btn-p" onClick={run} disabled={busy}>
      {busy?<Loader2 size={15} className="spin"/>:<FileDown size={15}/>}
      {busy?' Importing…':' Import recent recordings'}
    </button>
    {err&&<div className="mtg-warn" style={{marginTop:12}}><AlertTriangle size={15}/><div>{err}</div></div>}
    {rows&&!rows.length&&<div className="empty" style={{marginTop:12}}>Pocket has no recordings to import.</div>}
    {rows&&rows.length>0&&<div className="hlist" style={{marginTop:12}}>
      {rows.map(r=>(<div className="hli" key={r.id}>
        <span style={{flex:1}}><b>{r.title}</b>
          <span className="ch-sub" style={{display:'block'}}>{r.createdAt?fmtDate(r.createdAt.slice(0,10)):''}{r.duration?` · ${Math.round(r.duration/60)} min`:''}</span></span>
        <span className="pill" style={{background:'#F1F2F8',color:colour[r.state]||'#5A6178'}}>{label[r.state]||r.state}</span>
      </div>))}
    </div>}
    {rows&&rows.some(r=>r.state==='failed')&&<div className="subcell" style={{marginTop:8}}>
      {rows.filter(r=>r.state==='failed').map(r=>r.error).filter(Boolean)[0]}
    </div>}
    {/* Pocket has never documented the fields inside its response, so when a
        transcript is not where we look, the screen reports the shape that came
        back — key names and types only, never values. Diagnosable from here
        instead of from a log you would have to go and find. */}
    {rows&&rows.some(r=>r.noTranscript)&&<div className="mtg-warn" style={{marginTop:12}}>
      <AlertTriangle size={15}/>
      <div>
        <b>{rows.filter(r=>r.noTranscript).length} imported without a transcript.</b> The recording
        is saved and Deep extract will be unavailable on it until this is sorted. Pocket returned
        these fields — send them over and it is a one-line fix:
        <div style={{marginTop:6,fontFamily:'monospace',fontSize:11,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
          {(rows.find(r=>r.noTranscript)||{}).shape?.join('\n')||'(nothing)'}
        </div>
      </div>
    </div>}
  </div>);
}

function SettingsPage({settings,saveSettings,leads,saveLeads,invoices,saveInvoices,gcal,onDisconnectGcal,refreshGcal,isOwner,users,me,myUid,saveUser,removeUser,claimOwner,reassignLeads,noUsers,pockets,refreshPockets,updateLead,payouts,addPayout}){
  const onLogo=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>saveSettings({...settings,logo:r.result});r.readAsDataURL(f);};
  const setOptions=(key,arr)=>saveSettings({...settings,options:{...settings.options,[key]:arr}});
  const exportAll=()=>{const data={app:'proytech-crm',version:4,exportedAt:new Date().toISOString(),leads,settings,invoices};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`proytech-crm-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(u);};
  const importAll=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.leads)throw 0;if(window.confirm(`Restore ${d.leads.length} leads from this backup? This replaces everything currently in the CRM.`)){saveLeads(d.leads);if(d.settings)saveSettings({logo:d.settings.logo||'',logoSize:d.settings.logoSize||34,options:{...DEFAULT_OPTIONS,...(d.settings.options||{})},stages:d.settings.stages?.length?d.settings.stages:DEFAULT_STAGES,customFields:d.settings.customFields||[],team:d.settings.team||DEFAULT_TEAM,clientPhases:d.settings.clientPhases||DEFAULT_CLIENT_PHASES,goals:{...DEFAULT_GOALS,...(d.settings.goals||{})},huddle:d.settings.huddle||null,modules:Array.isArray(d.settings.modules)?d.settings.modules:undefined,modulesV:num(d.settings.modulesV),pools:Array.isArray(d.settings.pools)?d.settings.pools:[],notifyEmails:d.settings.notifyEmails||'',leadColumns:d.settings.leadColumns||DEFAULT_LEAD_COLS,deliveryTracks:d.settings.deliveryTracks?.length?d.settings.deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:{...DEFAULT_INVOICING,...(d.settings.invoicing||{}),biz:{...DEFAULT_INVOICING.biz,...((d.settings.invoicing||{}).biz||{})}}});if(saveInvoices)saveInvoices(Array.isArray(d.invoices)?d.invoices:[]);window.alert('Backup restored.');}}catch(err){window.alert('That file is not a valid ProyTech backup.');}};r.readAsText(f);e.target.value='';};

  return (<>
    {/* team & roles — owner-only */}
    {isOwner&&<TeamCard users={users||[]} settings={settings} saveSettings={saveSettings} saveUser={saveUser} removeUser={removeUser} claimOwner={claimOwner} reassign={reassignLeads} me={me} myUid={myUid} noUsers={noUsers}/>}

    {/* conversion alerts */}
    {isOwner&&<div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Bell size={15}/>Conversion alerts</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Every rep conversion always lands in <b>Awaiting onboarding</b> on your dashboard. Add addresses here and it gets emailed too.</div>
      <div className="field full"><label>Email these people on every conversion</label>
        <input placeholder="garrett@getproytech.com, logan@getproytech.com" value={settings.notifyEmails||''}
          onChange={e=>saveSettings({...settings,notifyEmails:e.target.value})}/></div>
      <div className="subcell" style={{marginTop:10}}>Email needs <b>RESEND_API_KEY</b> and <b>NOTIFY_FROM</b> set in Vercel → Settings → Environment Variables, with the sending domain verified at resend.com. Until then this quietly does nothing and the dashboard queue carries on regardless.</div>
    </div>}

    {/* legacy name-based lead visibility (still drives Mine / Pool / All) */}
    {(()=>{ const people=(settings.options?.owner||OWNERS).filter(o=>o!==POOL_OWNER);
      const setAccess=(name,access)=>{ const t=(settings.team||[]).filter(x=>x.name!==name); saveSettings({...settings,team:[...t,{name,access}]}); };
      return (<div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Users size={15}/>Team &amp; lead visibility</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Everyone lands on <b>their own</b> leads by default. This controls whether they can switch to <b>All</b> and see the whole company's list. Leads owned by <b>{POOL_OWNER}</b> sit in the shared <b>Pool</b> — anyone can see and claim those.</div>
      <div className="team-list">
        {people.map(p=>{const a=teamAccess(settings,p);return (<div className="team-row" key={p}>
          <span className="team-av">{p[0]}</span>
          <span className="team-name">{p}</span>
          <div className="seg team-seg">
            <button className={a==='own'?'on':''} onClick={()=>setAccess(p,'own')}>Own + Pool</button>
            <button className={a==='all'?'on':''} onClick={()=>setAccess(p,'all')}>Everything</button>
          </div>
        </div>);})}
      </div>
      <div className="ch-sub" style={{marginTop:12,marginBottom:0}}>Add a new salesperson under <b>Dropdown options → Owner</b> and they'll appear here. Give them <b>Own + Pool</b> and they'll only ever see their own leads plus the shared pool.</div>
    </div>); })()}

    {/* monthly goals */}
    {(()=>{ const G=goalsOf(settings);
      const setGoal=(k,v)=>saveSettings({...settings,goals:{...G,[k]:Math.max(0,num(v))}});
      const anySet=Object.values(G).some(v=>num(v)>0);
      return (<div className="card" style={{marginBottom:18}}>
        <div className="sec-title"><Target size={15}/>Monthly goals</div>
        <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Set a target and the matching dashboard tile grows a progress bar that tells you if you’re on pace for the month. Leave one at 0 to hide it.</div>
        <div className="goal-grid">{GOAL_FIELDS.map(([k,label,note,kind])=>(
          <div className="goal-row" key={k}>
            <div className="goal-l"><b>{label}</b><span>{note}</span></div>
            <div className="goal-in">{kind==='$'&&<i>$</i>}<input type="number" min="0" value={G[k]||''} placeholder="0" onChange={e=>setGoal(k,e.target.value)}/></div>
          </div>))}</div>
        {!anySet&&<div className="subcell" style={{marginTop:10}}>No goals set yet — tiles show plain numbers until you add one.</div>}
      </div>); })()}

    {/* which meeting types count toward conversion ratios */}
    {(()=>{ const ex=ratioExcludeOf(settings);
      const toggle=k=>{ const next=ex.includes(k)?ex.filter(x=>x!==k):[...ex,k];
        saveSettings({...settings,ratioExcludeTypes:next}); };
      const counted=MEETING_TYPES.filter(t=>!ex.includes(t));
      return (<div className="card" style={{marginBottom:18}}>
        <div className="sec-title"><Target size={15}/>What counts as a sales meeting</div>
        <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>The <b>Meeting &#8594; Close</b> ratio only counts a lead if it had one of these <b>before</b> it closed. Coffee is the top of the cycle rather than a sales conversation, and onboarding and check-ins only happen after somebody signs, so counting those would make the ratio improve every time you deliver instead of every time you sell. Every type still counts toward meetings booked, meetings held and show rate either way.</div>
        <div className="mod-grid">{MEETING_TYPES.map(t=>(
          <label key={t} className={'mod-row'+(!ex.includes(t)?' on':'')}>
            <input type="checkbox" checked={!ex.includes(t)} onChange={()=>toggle(t)}/>
            <span>{t}</span>
            {!ex.includes(t)?<CheckCircle2 size={15} color={GREEN}/>:<Circle size={15} color="#C9C5D9"/>}
          </label>))}</div>
        <div className="subcell" style={{marginTop:10}}>
          {counted.length?`Counting: ${counted.join(', ')}.`:'Nothing is counted, so the ratio will read as a dash.'}
        </div>
      </div>); })()}

    {/* modules */}
    {(()=>{ const on=modList(settings);
      const toggle=k=>{ const next=on.includes(k)?on.filter(x=>x!==k):[...on,k]; saveSettings({...settings,modules:next}); };
      return (<div className="card" style={{marginBottom:18}}>
        <div className="sec-title"><LayoutDashboard size={15}/>Sections</div>
        <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Switch off anything this install doesn’t need — it disappears from the sidebar. Dashboard and Settings always stay. Handy when a client buys the CRM but not invoicing.</div>
        <div className="mod-grid">{ALL_MODULES.map(([k,label])=>(
          <label key={k} className={'mod-row'+(on.includes(k)?' on':'')}>
            <input type="checkbox" checked={on.includes(k)} onChange={()=>toggle(k)}/>
            <span>{label}</span>
            {on.includes(k)?<CheckCircle2 size={15} color={GREEN}/>:<Circle size={15} color="#C9C5D9"/>}
          </label>))}</div>
        <div className="subcell" style={{marginTop:10}}>{on.length} of {ALL_MODULES.length} sections on. Data is never deleted — switching a section back on brings everything with it.</div>
      </div>); })()}

    {/* pocket backfill — recordings that predate the webhook.
        Lives here rather than in "Your day" because that group is hidden when
        there are no open recordings, so on a fresh install it could not be the
        way in. */}
    {/* AUDIT #23. Sorting which money paid for the WORK and which paid for the
        MONTH. Above the Pocket panel because it is fixing wrong numbers rather
        than adding a feature. */}
    {isOwner&&<PaymentReview leads={leads} updateLead={updateLead}/>}

    {isOwner&&<PocketImport pockets={pockets} onDone={refreshPockets}/>}

    {isOwner&&<RepPay reps={(users||[]).filter(u=>u.role==='rep'&&u.active!==false)} leads={leads}
      payouts={payouts} me={me} updateLead={updateLead} addPayout={addPayout}/>}

    {/* google calendar */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><CalendarClock size={15}/>Google Calendar</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Connect a Google account so meetings you book on a lead post automatically to that calendar. Use <b>admin@getproytech.com</b> when the Google sign-in appears.</div>
      {gcal&&gcal.connected
        ? <div className="gcal-on"><div className="gcal-dot"/><div><b>Connected{gcal.email?` — ${gcal.email}`:''}</b><div className="subcell">Meetings booked on a lead land here automatically.</div></div><button className="btn btn-g btn-sm" style={{marginLeft:'auto'}} onClick={onDisconnectGcal}>Disconnect</button></div>
        : <div className="gcal-off"><button className="btn btn-p" onClick={()=>{window.location.href='/api/google-auth';}}><CalendarClock size={15}/>Connect Google Calendar</button><span className="subcell">You’ll approve once, then you’re set.</span></div>}
    </div>

    {/* client phases */}
    {(()=>{ const phases=stdPhases(settings);
      const savePhases=next=>saveSettings({...settings,clientPhases:next});
      const patch=(i,p)=>{const n=phases.map((x,j)=>j===i?{...x,...p}:x);savePhases(n);};
      const move=(i,dir)=>{const j=i+dir;if(j<0||j>=phases.length)return;const n=phases.slice();[n[i],n[j]]=[n[j],n[i]];savePhases(n);};
      return (<div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><KanbanSquare size={15}/>Client phases</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>These are the columns on the Client Pipeline board. Rename, recolor, or reorder them. The 6 keys stay fixed because the onboarding checklist maps to them — for one-off steps, add a <b>custom phase</b> on an individual client from the Clients tab.</div>
      <div className="phase-editor">{phases.map((p,i)=>(<div className="phase-row" key={p.key}>
        <input type="color" value={p.color} onChange={e=>patch(i,{color:e.target.value})}/>
        <input className="phase-label" value={p.label} onChange={e=>patch(i,{label:e.target.value})}/>
        <span className="phase-key">{p.flow?'flow':'terminal'}</span>
        <div className="phase-moves">
          <button className="m-x" style={{width:26,height:26}} disabled={i===0} onClick={()=>move(i,-1)}><ChevronUp size={13}/></button>
          <button className="m-x" style={{width:26,height:26}} disabled={i===phases.length-1} onClick={()=>move(i,1)}><ChevronDown size={13}/></button>
        </div>
      </div>))}</div>
      <button className="linkbtn" onClick={()=>savePhases(DEFAULT_CLIENT_PHASES)}>Reset to defaults</button>
    </div>); })()}

    {/* logo */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><ImageIcon size={15}/>Brand / Logo</div>
      {settings.logo&&<div style={{marginBottom:14,padding:'16px',background:INK,borderRadius:12,display:'inline-block'}}><img src={settings.logo} alt="logo" style={{maxHeight:(settings.logoSize||34),maxWidth:(settings.logoSize||34)*5,objectFit:'contain',display:'block'}}/></div>}
      <label className="logo-drop"><ImageIcon size={22} style={{marginBottom:6}}/><div style={{fontWeight:600}}>{settings.logo?'Replace logo':'Upload your ProyTech logo'}</div><div style={{fontSize:12,marginTop:4}}>PNG or SVG, transparent background ideal</div><input type="file" accept="image/*" onChange={onLogo} style={{display:'none'}}/></label>
      {settings.logo&&<div className="logosize">
        <div className="logosize-h"><span>Logo size</span><b>{settings.logoSize||34}px</b></div>
        <input type="range" min="20" max="90" step="1" value={settings.logoSize||34} onChange={e=>saveSettings({...settings,logoSize:Number(e.target.value)})}/>
      </div>}
      {settings.logo&&<button className="btn btn-d" style={{marginTop:12}} onClick={()=>saveSettings({...settings,logo:''})}><Trash2 size={15}/>Remove logo</button>}
    </div>

    {/* invoicing defaults */}
    {(()=>{ const iv=settings.invoicing||DEFAULT_INVOICING; const biz=iv.biz||DEFAULT_INVOICING.biz; const setIv=patch=>saveSettings({...settings,invoicing:{...iv,...patch}}); const setBiz=patch=>setIv({biz:{...biz,...patch}});
      return (<div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Receipt size={15}/>Invoicing</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Your business details and defaults. These fill in automatically on every new invoice.</div>
      <div className="fgrid">
        <div className="field"><label>Business name</label><input value={biz.name||''} onChange={e=>setBiz({name:e.target.value})}/></div>
        <div className="field"><label>Email</label><input value={biz.email||''} onChange={e=>setBiz({email:e.target.value})}/></div>
        <div className="field full"><label>Business address</label><textarea rows={2} value={biz.address||''} onChange={e=>setBiz({address:e.target.value})}/></div>
        <div className="field"><label>Invoice prefix</label><input value={iv.prefix||''} onChange={e=>setIv({prefix:e.target.value})}/></div>
        <div className="field"><label>Next invoice #</label><input type="number" value={iv.seq||1} onChange={e=>setIv({seq:Math.max(1,Math.round(num(e.target.value)))})}/></div>
        <div className="field"><label>Payment terms (days)</label><input type="number" value={iv.terms??14} onChange={e=>setIv({terms:Math.round(num(e.target.value))})}/></div>
        <div className="field"><label>Default tax rate (%)</label><input type="number" value={iv.taxRate??0} onChange={e=>setIv({taxRate:num(e.target.value)})}/></div>
        <div className="field full"><label>Payment link (Stripe / PayPal / etc.)</label><input placeholder="https://…" value={iv.paymentLink||''} onChange={e=>setIv({paymentLink:e.target.value})}/></div>
        <div className="field full"><label>Default notes / terms</label><textarea rows={2} value={iv.notes||''} onChange={e=>setIv({notes:e.target.value})}/></div>
      </div>
      <div className="ch-sub" style={{margin:'18px 0 12px',fontWeight:700,color:INK,textTransform:'uppercase',letterSpacing:'.05em',fontSize:11}}>Invoice design</div>
      <div className="fgrid">
        <div className="field"><label>Brand accent color</label><div className="acc-row"><input type="color" value={iv.accent||'#2B4DE0'} onChange={e=>setIv({accent:e.target.value})}/><input value={iv.accent||'#2B4DE0'} onChange={e=>setIv({accent:e.target.value})}/></div></div>
        <div className="field"><label>Invoice logo size — {iv.logoH||46}px</label><input type="range" className="invrange" min="24" max="80" value={iv.logoH||46} onChange={e=>setIv({logoH:Number(e.target.value)})}/></div>
      </div>
      <div className="inv-toggles">
        <label className="invtog"><input type="checkbox" checked={iv.showLogo!==false} onChange={e=>setIv({showLogo:e.target.checked})}/>Show logo</label>
        <label className="invtog"><input type="checkbox" checked={iv.showNotes!==false} onChange={e=>setIv({showNotes:e.target.checked})}/>Show notes / terms</label>
        <label className="invtog"><input type="checkbox" checked={iv.showPay!==false} onChange={e=>setIv({showPay:e.target.checked})}/>Show payment link</label>
      </div>
      <div className="ch-sub" style={{margin:'20px 0 8px',fontWeight:700,color:INK,textTransform:'uppercase',letterSpacing:'.05em',fontSize:11}}>Page layout &amp; text sizes</div>
      <div className="ch-sub" style={{marginTop:-2,marginBottom:10}}>Tap any section in this sample to set its font size &amp; spacing. Drag sections to reorder, or swap the header. Whatever you set here becomes the default on every new invoice — no need to redo it each time.</div>
      <div className="inv-design-stage">
        <InvoicePreview settings={settings} saveSettings={saveSettings} inv={{number:(iv.prefix||'INV-')+String(iv.seq||1).padStart(4,'0'),issueDate:todayISO(),dueDate:addDays(todayISO(),iv.terms||14),status:'sent',taxRate:num(iv.taxRate),paymentLink:iv.paymentLink||'https://buy.stripe.com/your-link',notes:iv.notes||'Thank you for your business.',billTo:{company:'Acme Realty Group',name:'Jordan Blake',email:'jordan@acmerealty.com',address:'88 Douglas Ave\nWichita, KS 67202'},items:[{id:'s1',label:'Website foundation — design & build',qty:1,amount:1200},{id:'s2',label:'AI front office — monthly retainer',qty:1,amount:199}]}}/>
      </div>
    </div>); })()}

    {/* dropdown options */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><SlidersHorizontal size={15}/>Dropdown Options</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Add or remove the choices that appear in every lead. Applies everywhere instantly.</div>
      <OptionEditor label="Service Interest" items={settings.options.service} onChange={a=>setOptions('service',a)}/>
      <OptionEditor label="Lead Source" items={settings.options.source} onChange={a=>setOptions('source',a)}/>
      <OptionEditor label="Business Type" items={settings.options.businessType} onChange={a=>setOptions('businessType',a)}/>
      <OptionEditor label="Next Action" items={settings.options.nextAction} onChange={a=>setOptions('nextAction',a)}/>
      {/* labelVocab falls back to the defaults when this has never been saved,
          so the editor has to be seeded with the same list or the first edit
          would wipe every built-in label. */}
      <OptionEditor label="Labels (Military, Police, Fire…)" items={labelVocab(settings)} onChange={a=>setOptions('labels',a)}/>
      <OptionEditor label="Key date types (Birthday, anniversaries…)" items={dateVocab(settings)} onChange={a=>setOptions('keyDates',a)}/>
      <OptionEditor label="Owner" items={settings.options.owner||OWNERS} onChange={a=>setOptions('owner',a)}/>
    </div>

    {/* stages */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Layers size={15}/>Pipeline Stages</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Rename, recolor, reorder, or add stages. Mark one or more as <b>Won</b> (counts as closed revenue) or <b>Lost</b>.</div>
      <StageEditor stages={settings.stages} onChange={s=>saveSettings({...settings,stages:s})}/>
    </div>

    {/* delivery tracks */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Rocket size={15}/>Delivery Tracks</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>The fulfillment steps clients move through after converting. Each track shows only for clients who bought a matching service.</div>
      <DeliveryEditor tracks={settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS} services={settings.options.service} onChange={t=>saveSettings({...settings,deliveryTracks:t})}/>
    </div>

    {/* custom fields */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><List size={15}/>Custom Fields</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Add your own columns to every lead. Toggle "show in table" to put them on the Leads page.</div>
      <CustomFieldEditor fields={settings.customFields||[]} onChange={f=>saveSettings({...settings,customFields:f})}/>
    </div>

    {/* backup */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><FileText size={15}/>Backup & Restore</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Download a full snapshot (every lead, note, setting, and custom field) — or restore one. Save these regularly.</div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <button className="btn btn-p" onClick={exportAll}><Download size={15}/>Export full backup (JSON)</button>
        <label className="btn btn-g" style={{cursor:'pointer'}}><Upload size={15}/>Restore from backup<input type="file" accept="application/json,.json" onChange={importAll} style={{display:'none'}}/></label>
        <button className="btn btn-d" onClick={()=>{if(window.confirm('Reset to the sample demo leads? Export a backup first if you want to keep current data.'))saveLeads(seed());}}><Trash2 size={15}/>Reset to seed leads</button>
      </div>
    </div>

    <div className="note">
      <b>This preview saves to your browser.</b> The next step wires it to Supabase so you and Logan share one live board with separate logins — and your data lives in the database, not the code, so future redeploys can never wipe a single lead. Keep exporting JSON backups as your offline safety net.
    </div>
  </>);
}

function OptionEditor({label,items,onChange}){
  const [val,setVal]=useState('');
  const add=()=>{const v=val.trim();if(!v||items.includes(v))return;onChange([...items,v]);setVal('');};
  return (<div style={{marginBottom:18}}>
    <div style={{fontSize:12.5,fontWeight:700,color:INK,marginBottom:9}}>{label}</div>
    <div>{items.map(it=><span className="opt-chip" key={it}>{it}<button onClick={()=>onChange(items.filter(x=>x!==it))}><X size={13}/></button></span>)}</div>
    <div className="addrow"><input placeholder={`Add ${label.toLowerCase()}…`} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}/><button className="btn btn-g btn-sm" onClick={add}><Plus size={14}/>Add</button></div>
  </div>);
}

function StageEditor({stages,onChange}){
  const upd=(i,patch)=>onChange(stages.map((s,j)=>j===i?{...s,...patch}:s));
  const move=(i,dir)=>{const j=i+dir;if(j<0||j>=stages.length)return;const a=[...stages];[a[i],a[j]]=[a[j],a[i]];onChange(a);};
  const del=i=>{if(stages.length<=2){window.alert('Keep at least two stages.');return;}onChange(stages.filter((_,j)=>j!==i));};
  const add=()=>{const key='stage'+uid();onChange([...stages,{key,label:'New Stage',color:STAGE_COLORS[stages.length%STAGE_COLORS.length],prob:0.3,open:true,won:false,lost:false}]);};
  const setType=(i,t)=>upd(i,{open:t==='open',won:t==='won',lost:t==='lost',prob:t==='won'?1:t==='lost'?0:0.3});
  const typeOf=s=>s.won?'won':s.lost?'lost':'open';
  return (<div>
    {stages.map((s,i)=>(<div className="set-row" key={s.key}>
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        <button className="iconbtn" style={{height:18,width:24}} onClick={()=>move(i,-1)} disabled={i===0}><ChevronUp size={14}/></button>
        <button className="iconbtn" style={{height:18,width:24}} onClick={()=>move(i,1)} disabled={i===stages.length-1}><ChevronDown size={14}/></button>
      </div>
      <input type="color" className="swatch" value={s.color} onChange={e=>upd(i,{color:e.target.value})}/>
      <input style={{flex:1,minWidth:90,padding:'8px 10px',border:'1px solid #DEDFEA',borderRadius:8,fontSize:13.5,fontFamily:'Inter'}} value={s.label} onChange={e=>upd(i,{label:e.target.value})}/>
      <select className="selctl" value={typeOf(s)} onChange={e=>setType(i,e.target.value)}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select>
      {s.open&&<input type="number" min="0" max="100" title="Win %" style={{width:64,padding:'8px 8px',border:'1px solid #DEDFEA',borderRadius:8,fontSize:13}} value={Math.round(num(s.prob)*100)} onChange={e=>upd(i,{prob:num(e.target.value)/100})}/>}
      <button className="iconbtn" onClick={()=>del(i)} title="Delete stage"><Trash2 size={14}/></button>
    </div>))}
    <button className="btn btn-g btn-sm" style={{marginTop:12}} onClick={add}><Plus size={14}/>Add stage</button>
  </div>);
}

function CustomFieldEditor({fields,onChange}){
  const [label,setLabel]=useState('');const [type,setType]=useState('text');const [opts,setOpts]=useState('');
  const add=()=>{const l=label.trim();if(!l)return;const f={id:uid(),label:l,type,showInTable:false};if(type==='select')f.options=opts.split(',').map(x=>x.trim()).filter(Boolean);onChange([...fields,f]);setLabel('');setOpts('');setType('text');};
  return (<div>
    {fields.map((f,i)=>(<div className="set-row" key={f.id}>
      <Tag size={15} color="#928DAD"/>
      <div style={{flex:1}}><div style={{fontWeight:600,color:INK,fontSize:13.5}}>{f.label}</div><div className="subcell">{f.type}{f.type==='select'&&f.options?` · ${f.options.join(', ')}`:''}</div></div>
      <label className="toggle" style={{margin:0,fontSize:12}}><span className={'sw sm '+(f.showInTable?'on':'')} onClick={()=>onChange(fields.map(x=>x.id===f.id?{...x,showInTable:!x.showInTable}:x))}><b/></span>in table</label>
      <button className="iconbtn" onClick={()=>onChange(fields.filter(x=>x.id!==f.id))}><Trash2 size={14}/></button>
    </div>))}
    {!fields.length&&<div className="empty" style={{padding:'10px 0',textAlign:'left'}}>No custom fields yet.</div>}
    <div className="addrow">
      <input placeholder="Field name (e.g. Contract Link)" value={label} onChange={e=>setLabel(e.target.value)}/>
      <select value={type} onChange={e=>setType(e.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></select>
      {type==='select'&&<input placeholder="Options, comma-separated" value={opts} onChange={e=>setOpts(e.target.value)} style={{flex:1,minWidth:160}}/>}
      <button className="btn btn-g btn-sm" onClick={add}><Plus size={14}/>Add field</button>
    </div>
  </div>);
}

function DeliveryEditor({tracks,services,onChange}){
  const upd=(i,patch)=>onChange(tracks.map((t,j)=>j===i?{...t,...patch}:t));
  const addTrack=()=>onChange([...tracks,{key:'track'+uid(),label:'New Track',services:[],milestones:['Step 1']}]);
  const delTrack=i=>{if(window.confirm('Delete this delivery track?'))onChange(tracks.filter((_,j)=>j!==i));};
  const toggleSvc=(i,s)=>{const cur=tracks[i].services||[];upd(i,{services:cur.includes(s)?cur.filter(x=>x!==s):[...cur,s]});};
  const Milestones=({i})=>{const [v,setV]=useState('');const ms=tracks[i].milestones||[];
    const addM=()=>{const x=v.trim();if(!x||ms.includes(x))return;upd(i,{milestones:[...ms,x]});setV('');};
    const moveM=(k,d)=>{const j=k+d;if(j<0||j>=ms.length)return;const a=ms.slice();[a[k],a[j]]=[a[j],a[k]];upd(i,{milestones:a});};
    return (<div style={{marginTop:8}}>
      {ms.map((m,k)=>(<div key={m} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0'}}>
        <span style={{flex:1,fontSize:13,color:'#3a3658'}}>{k+1}. {m}</span>
        <button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveM(k,-1)} disabled={k===0}><ChevronUp size={13}/></button>
        <button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveM(k,1)} disabled={k===ms.length-1}><ChevronDown size={13}/></button>
        <button className="iconbtn" style={{width:24,height:24}} onClick={()=>upd(i,{milestones:ms.filter(x=>x!==m)})}><Trash2 size={12}/></button>
      </div>))}
      <div className="addrow"><input placeholder="Add milestone…" value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addM()} style={{flex:1,minWidth:160}}/><button className="btn btn-g btn-sm" onClick={addM}><Plus size={14}/>Add</button></div>
    </div>);
  };
  return (<div>
    {tracks.map((t,i)=>(<div key={t.key} style={{border:'1px solid #E8E9F2',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <input style={{flex:1,padding:'9px 11px',border:'1px solid #DEDFEA',borderRadius:8,fontSize:14,fontFamily:'Inter',fontWeight:600}} value={t.label} onChange={e=>upd(i,{label:e.target.value})}/>
        <button className="iconbtn" onClick={()=>delTrack(i)}><Trash2 size={14}/></button>
      </div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:'#928DAD',marginBottom:7}}>Shows for services</div>
      <div className="chips">{services.map(s=><span key={s} className={'chip '+((t.services||[]).includes(s)?'on':'')} onClick={()=>toggleSvc(i,s)}>{s}</span>)}</div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:'#928DAD',margin:'14px 0 0'}}>Milestones</div>
      <Milestones i={i}/>
    </div>))}
    <button className="btn btn-g btn-sm" onClick={addTrack}><Plus size={14}/>Add track</button>
  </div>);
}

/* ===================== shared ===================== */
function Huddle({leads,tasks,settings,stages,rels,saveSettings,me,open}){
  const H=useMemo(()=>buildHuddle(leads,tasks,settings,stages,rels),[leads,tasks,settings,stages,rels]);
  const saved=(settings&&settings.huddle)||null;
  /* With a rolling window the period start moves every day, so keying on it
     exactly would throw away yesterday's huddle the moment the clock ticked
     over — you'd open it Tuesday and find Monday's gone. A written huddle stays
     the current one for 7 days, then goes stale, which matches how long the
     stretch it describes stays relevant. */
  const savedAge=saved&&saved.generatedAt
    ? Math.floor((Date.now()-new Date(saved.generatedAt).getTime())/864e5) : null;
  const fresh=saved&&savedAge!==null&&savedAge<7?saved:null;
  const stale=saved&&savedAge!==null&&savedAge>=1?savedAge:0;
  const [brief,setBrief]=useState(fresh?fresh.brief:null);
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('');
  useEffect(()=>{ setBrief(fresh?fresh.brief:null); },[saved&&saved.generatedAt]);
  const cur=H.lastWeek, prev=H.weekBefore;
  const write=async()=>{ setErr(''); setBusy(true);
    try{
      const r=await apiPost('/api/huddle',{digest:H,brand:BRAND.name});
      const j=await r.json();
      if(!j.ok) throw new Error(j.error||'could not write the huddle');
      setBrief(j.brief);
      saveSettings({...settings,huddle:{weekKey:H.period.from,periodTo:H.period.to,brief:j.brief,generatedAt:new Date().toISOString(),by:me}});
    }catch(e){ setErr(e.message||'something went wrong'); }
    setBusy(false); };
  const Delta=({a,b,money})=>{ const c=pctChange(a,b);
    if(c===null) return <span className="dl up">new</span>;
    if(c===0) return <span className="dl flat">flat</span>;
    return <span className={'dl '+(c>0?'up':'down')}>{c>0?'▲':'▼'} {Math.abs(c)}%</span>; };
  const Stat=({label,value,a,b,money})=>(<div className="hstat">
    <div className="hs-l">{label}</div>
    <div className="hs-v">{value}<Delta a={a} b={b}/></div>
    <div className="hs-p">was {money?usd(b):b}</div>
  </div>);
  const copyText=()=>{
    const L=[];
    L.push(`MONDAY HUDDLE — last 7 days · ${H.period.label}`);
    if(brief){ L.push(''); L.push(brief.headline); L.push(''); L.push(brief.readout);
      if(brief.wins.length){L.push('');L.push('WINS');brief.wins.forEach(w=>L.push('• '+w));}
      if(brief.concerns.length){L.push('');L.push('WATCH');brief.concerns.forEach(w=>L.push('• '+w));}
      if(brief.focus.length){L.push('');L.push('FOCUS THIS WEEK');brief.focus.forEach((f,i)=>L.push(`${i+1}. ${f.title} — ${f.why}`));}
      if(brief.projection){L.push('');L.push('PROJECTION');L.push(brief.projection);} }
    L.push(''); L.push('LAST WEEK');
    L.push(`• ${cur.booked} meetings booked (was ${prev.booked})`);
    L.push(`• ${cur.held} held, ${cur.noshow} no-show`);
    L.push(`• ${cur.touches} touches (was ${prev.touches})`);
    L.push(`• ${cur.newLeads} new leads (was ${prev.newLeads})`);
    L.push(`• ${cur.closed} closed, ${usd(cur.closedValue)} (was ${prev.closed})`);
    L.push(`• ${cur.tasksDone} tasks done (was ${prev.tasksDone})`);
    if(H.slipping.overdueTotal) L.push(`• ${H.slipping.overdueTotal} follow-ups overdue`);
    try{ navigator.clipboard.writeText(L.join('\n')); }catch{}
  };
  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t">Monday Morning Huddle</div>
        <div className="hud-d">{H.period.label} · the last 7 days</div>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="btn btn-g btn-sm" onClick={copyText}><Clipboard size={14}/>Copy</button>
        <button className="btn btn-p" disabled={busy} onClick={write}>{busy?<Loader2 size={15} className="spin"/>:<Sparkles size={15}/>}{busy?'Reading the week…':brief?'Rewrite':'Write the huddle'}</button>
      </div>
    </div>
    {err&&<div className="mtg-warn"><AlertTriangle size={13}/><span>{err}</span></div>}

    {brief?(<div className="hud-brief">
      <div className="hb-head">{brief.headline}</div>
      <p className="hb-read">{brief.readout}</p>
      <div className="hb-cols">
        {brief.wins.length>0&&<div className="hb-col win"><div className="hb-ct"><CheckCircle2 size={13}/>Wins</div>{brief.wins.map((w,i)=><div className="hb-li" key={i}>{w}</div>)}</div>}
        {brief.concerns.length>0&&<div className="hb-col warn"><div className="hb-ct"><AlertTriangle size={13}/>Watch</div>{brief.concerns.map((w,i)=><div className="hb-li" key={i}>{w}</div>)}</div>}
      </div>
      {brief.focus.length>0&&<div className="hb-focus">
        <div className="hb-ct"><Target size={13}/>Focus now</div>
        {brief.focus.map((f,i)=><div className="hb-f" key={i}><b>{i+1}. {f.title}</b><span>{f.why}</span></div>)}
      </div>}
      {brief.projection&&<div className="hb-proj"><Zap size={13}/><span>{brief.projection}</span></div>}
      {fresh&&<div className="hb-when">Written {fmtStamp(fresh.generatedAt)}{fresh.by?` · ${fresh.by}`:''}
        {stale>0&&<span className="hb-stale"> · covers the 7 days to {fmtDate(fresh.weekKey&&fresh.periodTo?fresh.periodTo:isoOf(new Date()))}, {stale} day{stale===1?'':'s'} ago — rewrite for today</span>}</div>}
    </div>):(<div className="hud-empty">
      <Sparkles size={22}/><b>Nothing written for this stretch yet</b>
      <span>The numbers below are live. Hit <b>Write the huddle</b> and Claude reads the last 7 days and tells you what it means.</span>
    </div>)}

    <div className="kgroup">The last 7 days by the numbers</div>
    <div className="hstats">
      <Stat label="Meetings booked" value={cur.booked} a={cur.booked} b={prev.booked}/>
      <Stat label="Meetings held" value={cur.held} a={cur.held} b={prev.held}/>
      <Stat label="Touches" value={cur.touches} a={cur.touches} b={prev.touches}/>
      <Stat label="New leads" value={cur.newLeads} a={cur.newLeads} b={prev.newLeads}/>
      <Stat label="Deals closed" value={cur.closed} a={cur.closed} b={prev.closed}/>
      <Stat label="Revenue closed" value={usd(cur.closedValue)} a={cur.closedValue} b={prev.closedValue} money/>
      <Stat label="Tasks done" value={cur.tasksDone} a={cur.tasksDone} b={prev.tasksDone}/>
      <Stat label="Clients onboarded" value={cur.onboarded} a={cur.onboarded} b={prev.onboarded}/>
    </div>

    <div className="r2">
      <div className="card">
        <h3>What moved</h3>
        <div className="ch-sub">Deals, clients and work that changed in the last 7 days</div>
        {(cur.stageMoves.length||cur.wonNames.length||cur.newClientNames.length||cur.taskTitles.length)?(<div className="hlist">
          {cur.wonNames.map((w,i)=><div className="hli win" key={'w'+i}><CheckCircle2 size={13}/>Closed — {w}</div>)}
          {cur.newClientNames.map((w,i)=><div className="hli win" key={'c'+i}><Rocket size={13}/>New client — {w}</div>)}
          {cur.stageMoves.slice(0,8).map((w,i)=><div className="hli" key={'s'+i}><ArrowUpRight size={13}/>{w}</div>)}
          {cur.taskTitles.slice(0,8).map((w,i)=><div className="hli done" key={'t'+i}><ListTodo size={13}/>{w}</div>)}
        </div>):<div className="empty">Quiet week — nothing changed stage.</div>}
      </div>
      <div className="card">
        <h3>What's slipping</h3>
        <div className="ch-sub">Right now, not the last 7 days — this is the to-do list</div>
        <div className="hlist">
          {H.slipping.overdueFollowUps.map((o,i)=><div className="hli bad" key={'o'+i}><Bell size={13}/><span onClick={()=>open&&open()}>{o.who}</span> — {o.daysLate}d overdue</div>)}
          {H.slipping.coldRelationships.map((o,i)=><div className="hli warn" key={'k'+i}><Users size={13}/>{o.who} — {o.daysSinceTouch==null?'never touched':o.daysSinceTouch+'d since contact'} ({o.tier})</div>)}
          {H.slipping.stalledDeals.map((o,i)=><div className="hli warn" key={'d'+i}><KanbanSquare size={13}/>{o.who} — {o.daysSinceTouch}d cold in {o.stage}{o.value?` · ${usd(o.value)}`:''}</div>)}
          {H.slipping.neverContacted>0&&<div className="hli bad"><Zap size={13}/>{H.slipping.neverContacted} lead{H.slipping.neverContacted===1?'':'s'} never contacted</div>}
          {!H.slipping.overdueFollowUps.length&&!H.slipping.coldRelationships.length&&!H.slipping.stalledDeals.length&&!H.slipping.neverContacted&&<div className="empty">Nothing slipping. Clean board.</div>}
        </div>
      </div>
    </div>
  </>);
}

/* ---- rates -----------------------------------------------------------------
   AUDIT #7. EVERY rate in this app renders through <Rate>. Two rules, and
   neither is a per-call-site choice:

   1. A PERCENTAGE IS NEVER SHOWN WITHOUT THE SAMPLE IT CAME FROM.
   2. BELOW RATE_MIN_N THERE IS NO PERCENTAGE AND NO COLOUR. A funnel close
      rate of 33% from three leads used to turn RED. That is worse than no
      alarm: an alarm reads as information, and a red one gets acted on. Under
      the floor it shows the raw fraction instead — "1/3" is honest, and just
      as actionable, without pretending to be a rate.

   The floor lives in the COMPONENT, not at each call site, so it cannot drift
   back apart the way four hand-rolled Math.round(x*100)+'%' calls already had.
   If you are about to write that expression, you want this instead. */
const RATE_MIN_N=5;

/** part/whole, or null when there is nothing to divide. */
const rateOf=(part,whole)=>(num(whole)>0?num(part)/num(whole):null);
/** The sample, for a caption. A rate without one of these is not finished. */
const rateSample=(part,whole,noun='')=>`${num(part)} of ${num(whole)}${noun?' '+noun:''}`;

/** part / whole. `warnBelow` and `goodAbove` are 0-1 fractions and are only
 *  ever applied above the floor. */
function Rate({part,whole,warnBelow,goodAbove,min=RATE_MIN_N,empty='\u2014',className='',title}){
  const w=num(whole),p=num(part);
  const cls=x=>('rate '+x+' '+className).replace(/\s+/g,' ').trim();
  if(!w) return <span className={cls('rate-none')} title={title||'nothing to measure yet'}>{empty}</span>;
  const r=p/w;
  if(w<min) return (<span className={cls('rate-thin')}
    title={`Only ${w} so far — too few to read as a rate, so the raw figure is shown instead`}>{p}/{w}</span>);
  const tone=(warnBelow!=null&&r<warnBelow)?'warn':((goodAbove!=null&&r>=goodAbove)?'good':'');
  return <span className={cls(tone)} title={title||rateSample(p,w)}>{Math.round(r*100)}%</span>;
}

function Kpi({label,value,d,variant,icon,onClick,active,goal,current}){
  return (<div className={'kpi '+(variant||'')+(onClick?' clickable':'')+(active?' active':'')} onClick={onClick} role={onClick?'button':undefined}>
    <div className="kl">{icon}{label}{onClick&&<ChevronDown size={13} className={'kpi-ch'+(active?' on':'')}/>}</div>
    <div className="kv">{value}</div>{d&&<div className="kd">{d}</div>}
    {goal>0&&current!=null&&(()=>{ const pct=Math.min(100,Math.round(current/goal*100));
      const hit=current>=goal; const behind=!hit&&current<goal*monthPace();
      return (<div className="kgoal">
        <div className="kgbar"><div style={{width:Math.max(2,pct)+'%',background:hit?GREEN:behind?'#E0662B':COBALT}}/></div>
        <div className="kgt"><span>{pct}% of goal</span><b className={hit?'hit':behind?'behind':''}>{hit?'hit':behind?'behind pace':'on pace'}</b></div>
      </div>); })()}
  </div>);
}
/* ===================== LEADERBOARD =====================
   Ranked by CLIENTS CLOSED, never by revenue — reps compete on a number
   they're proud of, not on the dollars the company took in. Owners never
   appear on it, and no money appears on it for anybody. */
function Leaderboard({rows,meId,rep,users}){
  const [period,setPeriod]=useState('month');
  if(!rows) return (<div className="empty">The leaderboard needs the database function from <b>MIGRATION.sql</b>. Run it on this install and refresh.</div>);
  const list=[...rows].sort((a,b)=>(num(b[period])-num(a[period]))||String(a.name||'').localeCompare(String(b.name||'')));
  if(!list.length) return (<div className="empty">No sales reps yet. Add one in <b>Settings → Team</b> and the board fills itself.</div>);
  const top=num(list[0][period]);
  let rank=0,prev=null;
  const ranked=list.map((r,i)=>{ const v=num(r[period]); if(v!==prev){ rank=i+1; prev=v; } return {...r,rank,v}; });
  return (<>
    <div className="lb-top">
      <div className="seg"><button className={period==='month'?'on':''} onClick={()=>setPeriod('month')}>This month</button>
        <button className={period==='all'?'on':''} onClick={()=>setPeriod('all')}>All time</button></div>
      <span className="subcell">Clients closed{rep?' — everyone competes on the same number':''}</span>
    </div>
    <div className="lb">
      {ranked.map(r=>(<div key={r.id} className={'lb-row lift'+(r.id===meId?' me':'')}>
        <span className="lb-rank">{r.rank===1&&r.v>0?<Crown size={15}/>:r.rank}</span>
        <div className="lb-mid">
          <div className="lb-name">{r.name}{r.id===meId&&<i>you</i>}</div>
          <div className="lb-bar"><div style={{width:(top>0?Math.max(2,Math.round(r.v/top*100)):2)+'%'}}/></div>
        </div>
        <span className="lb-n"><b><CountUp value={r.v}/></b>{r.v===1?'client':'clients'}</span>
      </div>))}
    </div>
    <div className="note" style={{marginTop:16}}>Ranked by clients closed. Owners don't appear here, and commission dollars never show on the board.</div>
  </>);
}

/* The one celebration. Under a second of motion, never blocks anything. */
function Celebration({data,onDone}){
  const reduced=useReducedMotion();
  useEffect(()=>{ const t=setTimeout(()=>onDone&&onDone(),reduced?1800:2200); return ()=>clearTimeout(t); },[reduced,onDone]);
  return (<div className={'cel'+(reduced?' still':'')} role="status" onClick={onDone}>
    <div className="cel-ic"><Sparkles size={18}/></div>
    <div><b>{usd(data.amount)} pending</b><span>{data.name} converted — nice work.</span></div>
  </div>);
}

/* the panel that opens under the tiles when you tap one */
function Drill({title,sub,onClose,children}){
  return (<div className="drill">
    <div className="drill-h"><span className="drill-t">{title}</span>{sub&&<span className="drill-s">{sub}</span>}<button className="m-x" style={{width:28,height:28,marginLeft:'auto'}} onClick={onClose}><X size={15}/></button></div>
    <div className="drill-b">{children}</div>
  </div>);
}
function ChartCard({title,sub,children,empty}){return (<div className="card"><h3>{title}</h3>{sub&&<div className="ch-sub">{sub}</div>}{empty?<div className="empty">{empty}</div>:children}</div>);}
