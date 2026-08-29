/* ============================================================================
   src/lib/lead.js — the pure helpers a lead record is read and written through.
   ----------------------------------------------------------------------------
   WHY THIS FILE EXISTS

   The lead view is being redesigned and moves to src/LeadView.jsx. It reads a
   lead through most of these — cmsnOf, owedBy, clientOverall, closedDealsTotal,
   dealsOf, trackProgress and the rest — and so do the Dashboard, the Leads
   table, the Money page and the Clients board.

   src/RepPay.jsx set the precedent of REDEFINING helpers locally (its own usd0,
   num, uid). For formatting that survives. For a money helper it is exactly the
   read-path duplication ENGINEERING §2 is about: two definitions of "what is
   owed" that agree today and drift in six months. So the lead view IMPORTS
   every one of these, and this file is what it imports from.

   NOTHING HERE CHANGED IN THE MOVE. Every declaration is byte-identical to the
   one it replaced in App.jsx, in the same order, carrying the comments that
   documented it. The order is preserved deliberately rather than tidied: it is
   the order known to initialise without a temporal-dead-zone crash, and this
   codebase has shipped that bug before.

   WHAT BELONGS HERE: a pure function or constant that reads or shapes a lead.
   WHAT DOES NOT: anything that renders. No JSX is in this file, which is what
   keeps it importable from anywhere without dragging a component tree behind
   it. The icons below are values inside data tables (ACT_TYPES), not markup.
   ========================================================================== */


import {
  CalendarCheck, CalendarClock, Mailbox, MessageSquare, PhoneCall, Send, StickyNote,
} from 'lucide-react';
import { BRAND } from './brand';
/* AUDIT #23 — setupPaid and allPayments are the retainer module's answers to
   "what has been paid", and stay there. Imported rather than reimplemented,
   which is the whole reason this file exists. */
import { setupPaid, allPayments as paymentRows } from './retainer';

/* ===================== brand ===================== */
export const COBALT=BRAND.colors.cobalt, INDIGO=BRAND.colors.indigo, INK=BRAND.colors.ink, GOLD=BRAND.colors.gold, GREEN=BRAND.colors.green, RED=BRAND.colors.red;
/* ===================== editable defaults ===================== */
export const DEFAULT_OPTIONS={
  businessType:['—','Real Estate','Lending','Restaurant','Retail','Law Firm','Construction','Professional Services','Other'],
  source:['Referral',...BRAND.team,'Cold Outreach','Instagram','Networking','Walk-in','Website','Other'],
  service:['Web Design','AI Integration','Both','Unknown','Missed-Call Text-Back','AI Receptionist','Booking / Scheduling','CRM Setup','Full Front Office'],
  nextAction:['Schedule Coffee','Schedule Sit Down','Text in 1 Week','Visit and Introduce','Send Proposal','Follow Up Call','Close','—'],
  owner:[...BRAND.team,BRAND.pool],
  /* HOW the money arrived, and WHAT IT WAS FOR. Two separate questions that
     used to live mashed together in one free-text note ("square deposit"),
     which worked only while one person typed four exact phrases — a single
     "sqare deposit" and that payment was uncategorisable forever.

     payMethod drives the card-fee estimate: Square costs a percentage plus a
     fixed amount per payment, Venmo and cash cost nothing, so the fee is a
     property of the rail rather than of the revenue. payPurpose groups the
     P&L. Both editable in Settings like every other list here, so a new
     payment rail does not need a developer. */
  payMethod:['Square','Venmo','Cash','Check','Bank transfer','Other'],
  payPurpose:['Deposit','Final payment','Retainer','Milestone','Other'],
  /* Who someone IS, not what stage they're at — so you can reach every veteran
     or first responder at once when something relevant comes up. Deliberately
     separate from @mention tags, which mean "act on this". Editable in
     Settings, so a client install ships whatever vocabulary fits them. */
  labels:['Military','Veteran','Police','Fire / EMS','First Responder','Teacher',
    'Healthcare','Small Business Owner','Chamber Member','Church','Alumni','VIP'],
  keyDates:['Birthday','Spouse birthday','Work anniversary','Business anniversary',
    'Home purchase anniversary','Closing anniversary','Client since','Wedding anniversary'],
};
/* ---- Layer 2: client phase + universal onboarding checklist ---- */
export const CLIENT_PHASES=[
  ['intake','Intake','#6B73C9'],['build','Build',COBALT],['launch','Launch','#7A5CC8'],
  ['active','Active',GREEN],['atrisk','At Risk','#E0662B'],['churned','Churned','#8E89A8'],
];
/* editable standard phases (label/color/order in Settings; keys locked to the checklist) */
export const DEFAULT_CLIENT_PHASES=[
  {key:'intake',label:'Intake',color:'#6B73C9',flow:true},
  {key:'build', label:'Build', color:COBALT,   flow:true},
  {key:'launch',label:'Launch',color:'#7A5CC8',flow:true},
  {key:'active',label:'Active',color:GREEN,    flow:true},
  {key:'atrisk',label:'At Risk',color:'#E0662B',terminal:true},
  {key:'churned',label:'Churned',color:'#8E89A8',terminal:true},
];
export const stdPhases=settings=>(settings&&settings.clientPhases&&settings.clientPhases.length)?settings.clientPhases:DEFAULT_CLIENT_PHASES;
export const ONBOARDING=[
  {phase:'intake',items:[
    ['agreement_signed','Service agreement signed (Square)'],
    ['deposit_paid','Deposit / first payment collected'],
    ['drive_folder','Client folder created in Drive'],
    ['welcome_sent','Welcome msg + /onboard link sent'],
    ['intake_form','Intake form completed (/onboard)'],
    ['logo_received','Logo received (vector/PNG)'],
    ['headshot_received','Headshot(s) received'],
    ['brand_assets','Brand colors / assets received'],
    ['testimonials','Testimonials/reviews received or permission'],
    ['access_dns','Access: domain / DNS'],
    ['access_gbp','Access: Google Business Profile'],
    ['access_social','Access: Facebook / Instagram'],
    ['access_crm_host','Access: existing CRM / host (if any)'],
    ['brand_voice_doc','Brand Voice Doc produced'],
    ['kickoff_call','Kickoff call + voice memo done'],
  ]},
  {phase:'build',items:[
    ['site_built','Website built (preview URL)'],
    ['revision_round','Revision round collected (one consolidated list)'],
    ['automations_config','Automations configured (GHL snapshot + Custom Values)'],
    ['newsletter_setup','Newsletter set up (if sold)'],
    ['qa_passed','Internal QA passed (forms, automations, mobile, links, license/brokerage disclosure, Equal Housing logo)'],
  ]},
  {phase:'launch',items:[
    ['launch_call','Launch call completed'],
    ['go_live','Go live (DNS flipped, automations on)'],
    ['cheat_sheet_sent',"'How your system works' cheat sheet sent"],
    ['review_scheduled','30-day review scheduled'],
    ['testimonial_booked','Testimonial / case study booked (founding clients)'],
    ['retainer_confirmed','First retainer auto-bill confirmed (Square)'],
  ]},
  {phase:'active',items:[
    ['day30_review','Day-30 review call done (results, testimonial, 2 warm intros)'],
  ]},
];
export const ONB_ITEMS=ONBOARDING.flatMap(g=>g.items.map(([key,label])=>({key,label,phase:g.phase})));
/* Not every checklist item applies to every client. A monthly-only client has
   no setup fee, so "Deposit / first payment collected" would sit unticked
   forever and read like something is outstanding when nothing is. Skipped items
   are hidden, excluded from the x/y progress, and — importantly — cannot hold
   up anything that waits on them. Per client, because two clients on the same
   plan can still be sold differently. */
export const skippedOnb=l=>Array.isArray(l&&l.onbSkip)?l.onbSkip:[];
export const onbSkipped=(l,key)=>skippedOnb(l).includes(key);
export const seedOnboarding=()=>{const o={};ONB_ITEMS.forEach(i=>o[i.key]={done:null,due:null});return o;};
export const PRIORITIES={high:{label:'High',color:'#E0662B',bg:'rgba(224,102,43,.12)',rank:0},medium:{label:'Medium',color:COBALT,bg:'rgba(43,77,224,.10)',rank:1},low:{label:'Low',color:'#8E89A8',bg:'#F0F1F7',rank:2}};
export const OWNERS=[...BRAND.team,BRAND.pool];
/* A dropdown with no empty option shows its FIRST entry, so a new lead silently
   became whatever happened to be at the top — Real Estate. Installs that saved
   their Business Type list before '—' existed have no blank to select, so one
   is prepended at render rather than depending on saved settings. Lead Source
   already did this; Business Type didn't. */
export const blankFirst=list=>{ const a=Array.isArray(list)?list:[];
  return a.some(x=>x===''||x==='—')?a:['—',...a]; };
export const dayLabel=iso=>{ const t=isoOf(new Date());
  if(iso===t) return 'Today';
  const y=new Date(); y.setDate(y.getDate()-1);
  if(iso===isoOf(y)) return 'Yesterday';
  const d=new Date(iso+'T12:00:00'); if(isNaN(d)) return iso;
  const sameYear=d.getFullYear()===new Date().getFullYear();
  return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',
    ...(sameYear?{}:{year:'numeric'})});
};
/* what counts as real outreach — shared by the untouched filter and the
   batch-delete warning so the two can't drift apart */
export const REACHED_TYPES=new Set(['Call','Text','Email','Meeting','Booked','Payment']);

/* ---- disposition codes ----------------------------------------------------

   SOP-02's outcome for a single dial. A DISPOSITION IS A FIELD ON A CALL, NOT
   A NEW ACTIVITY TYPE. `REACHED_TYPES` above is untouched and `type` stays
   'Call' (or 'Booked' for BK, which reuses the meeting record the show rate
   reads). Two reasons, and the second is the one that would have gone wrong
   quietly:

     1. Activities already live in leads.data jsonb, so this needs no migration.
     2. isRealTouch below is ONE predicate feeding lastTouch, daysSinceTouch,
        firstTouchHrs and the untouched lists. Adding a ninth member to
        REACHED_TYPES would move every one of those numbers for the owners, who
        never set a disposition at all.

   `contact` — was a person actually reached? This is what isRealTouch reads.
   `attempt` — does this dial count against the three-attempt cap?

   THE TWO FALSE ONES ARE THE POINT. A dial that rang out and a number that does
   not work are both activity where NOBODY SPOKE TO ANYBODY. Counting them as
   contact would make a lead nobody has ever reached read as worked, reset its
   clock to today, and post a first-touch time for a call in which nothing
   happened — which is exactly the bug the imported-note change fixed, at ten
   times the volume, since most of a new rep's dials are no-answers. */
export const DISPOSITIONS=[
  {code:'NA', label:'No answer',   hint:'Rang out, no voicemail',        contact:false, attempt:true },
  {code:'BAD',label:'Bad number',  hint:'Dead, wrong or disconnected',   contact:false, attempt:false},
  {code:'VM', label:'Voicemail',   hint:'First attempt only',            contact:true,  attempt:true },
  {code:'CB', label:'Callback',    hint:'Needs a day and a time',        contact:true,  attempt:true },
  {code:'NF', label:'Not a fit',   hint:'Needs a reason',                contact:true,  attempt:true },
  {code:'SO', label:'Send only',   hint:'Goes to the owners today',      contact:true,  attempt:true },
  {code:'BK', label:'Booked',      hint:'Needs their contact details',   contact:true,  attempt:true },
  {code:'HV', label:'High value',  hint:'Goes to the owners today',      contact:true,  attempt:true },
  {code:'DNC',label:'Do not call', hint:'Permanent, immediate',          contact:true,  attempt:true },
];
export const DISP_CODES=DISPOSITIONS.map(d=>d.code);
export const dispOf=code=>DISPOSITIONS.find(d=>d.code===code)||null;
export const dispLabel=code=>{const d=dispOf(code);return d?d.label:'';};

/* AN ALLOWLIST, NOT A DENYLIST. A code added later and forgotten here defaults
   to NOT contact, which is the safe direction: declining to count an activity
   can only age a clock, never warm it, and "no lead may get warmer" is the
   invariant tests/realtouch.mjs asserts three times. A denylist fails the other
   way — add a code, forget the set, and every row of it silently reads as
   somebody having been spoken to. */
export const CONTACT_DISP=new Set(DISPOSITIONS.filter(d=>d.contact).map(d=>d.code));

/* An activity with NO disposition is contact-by-default, and it has to be: the
   owners never set one, and every row already in the database predates the
   vocabulary. That default is a hole, and it is closed AT THE WRITE rather than
   here — dispRequired() below, enforced in the composer. It cannot be closed
   here, because a row carries `who` (a display NAME) and no role, so there is
   no honest way to look at a stored row and tell who wrote it. */
export const dispIsContact=a=>!a||!a.disp||CONTACT_DISP.has(a.disp);

/* Which dispositions a rep must choose between when logging a call. Required
   at the write for REP-AUTHORED calls only — `rep` comes from the signed-in
   user's crm_users.role, which is known at the moment of writing and is the
   only place this is knowable. */
export const dispRequired=(rep,type)=>!!rep&&type==='Call';

/* ---- the attempt cap ------------------------------------------------------

   SOP-04: three attempts on a cold number across two weeks, then it dies.

   BAD SHORT-CIRCUITS THE CAP RATHER THAN COUNTING AGAINST IT. A disconnected
   number is not one of three chances — it is a number that will never work, and
   spending the other two on it is two dials a new rep does not have to waste.
   DNC is the same shape for a different reason: they asked. Both make the lead
   dead immediately, which is why they are `dead` and not merely capped. */
export const DEAD_DISP=new Set(['BAD','DNC']);
export const ATTEMPT_DISP=new Set(DISPOSITIONS.filter(d=>d.attempt).map(d=>d.code));
export const MAX_ATTEMPTS=3;
export const ATTEMPT_WINDOW_DAYS=14;

/* Why the lead can no longer be dialled, or ''. Ordered by how permanent it is,
   so a number that is both DNC and capped reads as DNC — the stronger and more
   actionable answer. */
export const deadReason=l=>{
  let bad='';
  for(const a of ((l&&l.activities)||[])){
    if(!a||!a.disp) continue;
    if(a.disp==='DNC') return 'DNC';
    if(a.disp==='BAD') bad='BAD';
  }
  return bad;
};

/* Attempts inside the rolling window. Counts dispositions only, so an owner's
   undisposed call is not silently spending a rep's attempts. */
export const attemptsOn=(l,from)=>{
  const now=(from?new Date(from):new Date()).getTime();
  const floor=now-ATTEMPT_WINDOW_DAYS*864e5;
  let n=0;
  for(const a of ((l&&l.activities)||[])){
    if(!a||!a.disp||!ATTEMPT_DISP.has(a.disp)) continue;
    const t=new Date(a.ts).getTime();
    if(isNaN(t)||t<floor) continue;
    n++;
  }
  return n;
};

/* One answer to "may I dial this?", so the lead screen and any future call list
   cannot disagree. `dead` is permanent; `capped` is only true within the
   window and goes away as attempts age out. */
export const dialState=(l,from)=>{
  const dead=deadReason(l);
  const attempts=attemptsOn(l,from);
  if(dead) return {dial:false,dead,reason:dead,attempts,left:0};
  const capped=attempts>=MAX_ATTEMPTS;
  return {dial:!capped,dead:'',reason:capped?'CAP':'',attempts,left:Math.max(0,MAX_ATTEMPTS-attempts)};
};

/* Has a voicemail already been left? SOP-02: first attempt only, never a
   second. Enforced at the write rather than trusted to memory. */
export const hasVoicemail=l=>((l&&l.activities)||[]).some(a=>a&&a.disp==='VM');

/* ---- machine notes, and what actually counts as contact --------------------

   The app writes notes about itself. Every one of them is stored as
   type:'Note', identical in shape to a note a person typed, so anything that
   counts notes counts the app talking to itself as human contact.

   ONE PREDICATE, not a copy per caller. This regex previously lived as a local
   inside LeadView, read only by the feed's fold, while two counters on the same
   screen each did their own thing — which is how All (6) and Notes (7) ended up
   disagreeing on one lead.

   THE LIST WAS VERIFIED AGAINST THE WRITERS, not inherited. Doing that turned
   up two families TOUCH-COUNT-FINDING.md never had: `Reassigned from X to Y.`
   (added later, by the batch-reassign work) and `Checklist: "X"...`. A list of
   prefixes maintained by hand goes stale the moment someone adds a note, and
   this one already had — so tests/systemnotes.mjs scans the source for note
   writers and fails the build when one appears that this does not match.
   The list is the fallback for rows already in the database; the test is what
   keeps it honest. */
export const SYS_NOTE=/^(Lead created\.|Follow-up cleared\.|Follow-up done —|Stage moved:|Deal value set to|Phase →|Close date set to|Commission approved|Commission voided|Converted to client|Signed — onboarding|Reverted to lead|Invoice |Payment confirmed |Payment marked as not collected|Deal closed:|New build started:|Sponsorship logged:|Dated:|Reassigned from |Checklist: )/;
export const isSystemNote=a=>!!a&&a.type==='Note'&&!a.derived&&SYS_NOTE.test(String(a.text||''));

/* A REAL TOUCH is a reached type, or a note a person actually wrote.
   Excluding notes wholesale would be as wrong as including everything: on a
   relationship, "saw him at the chamber lunch" is the touch. */
/* An imported note is not contact. It arrived in a spreadsheet column, nobody
   spoke to anybody, and it is stamped at the moment of import rather than at a
   moment when anything happened — so counting it makes a lead look worked AND
   gives it a first-touch time of zero. Marked at the source by mkLead; rows
   imported before that mark existed need IMPORT-NOTE-BACKFILL.sql. */
/* A no-answer is not contact either, for the identical reason and at far
   greater volume: a new rep runs at one booking per twenty-five to thirty
   dials, so most rows are NA. Counting them would take every dialled-once lead
   off the untouched list, reset its clock to today, and give it a first touch
   measured from a call in which nobody said anything. The gate is on the
   DISPOSITION, not the type — 'Call' stays in REACHED_TYPES, so nothing the
   owners log changes. See DISPOSITIONS above. */
export const isRealTouch=a=>!!a&&!a.imported&&dispIsContact(a)&&(REACHED_TYPES.has(a.type)||(a.type==='Note'&&!isSystemNote(a)));

/* The last time a person and this record were actually in contact.

   NOT lastContact(), which takes the newest activity of ANY type and falls back
   to createdAt. That reads a "Follow-up cleared." as contact, so a record you
   have not spoken to in eight months can look like yesterday, and it reads an
   untouched record as contacted on the day it was created.

   Returns null when there has been no real touch. That is a true answer and a
   useful row — "never contacted" is precisely who you are looking for — so it
   is deliberately not softened into a date. */
export const lastTouch=l=>{
  let best=null;
  for(const a of ((l&&l.activities)||[])){
    if(!isRealTouch(a)||!a.ts) continue;
    if(best===null||String(a.ts)>String(best)) best=a.ts;
  }
  return best;
};
/* Whole days since the last real touch; null when there has never been one. */
export const daysSinceTouch=(l,from)=>{
  const t=lastTouch(l); if(!t) return null;
  const then=new Date(t).getTime(); if(isNaN(then)) return null;
  const now=(from?new Date(from):new Date()).getTime();
  return Math.max(0,Math.floor((now-then)/864e5));
};
export const labelsOf=l=>Array.isArray(l&&l.labels)?l.labels:[];
/* ---- birthdays and key dates ---------------------------------------------
   Stored as {id,label,date,annual,lead}. `date` is YYYY-MM-DD; the year is kept
   when known (so "turns 40" is answerable) and set to 0000 when it isn't,
   because plenty of people will give you a day and month and nothing else.
   Recurring dates need the NEXT occurrence, not a comparison against a date
   twenty years in the past — that's the whole reason this can't reuse followUp. */
export const keyDatesOf=l=>Array.isArray(l&&l.keyDates)?l.keyDates:[];
export const DATE_LABELS=['Birthday','Spouse birthday','Work anniversary','Business anniversary',
  'Home purchase anniversary','Closing anniversary','Client since','Wedding anniversary'];
export const dateVocab=settings=>{ const o=(settings&&settings.options&&settings.options.keyDates);
  return Array.isArray(o)&&o.length?o:DATE_LABELS; };
/* Next time this date comes around. Feb 29 is the trap: in a non-leap year
   there is no Feb 29, and `new Date(2027,1,29)` silently rolls to March 1 —
   so a leap-day birthday would quietly move. Pinned to Feb 28 instead, which
   is what most people celebrate and, more importantly, is deliberate. */
export const nextOccurrence=(iso,annual,from=new Date())=>{
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return null;
  const mo=+m[2]-1, dy=+m[3];
  if(!annual){ const d=new Date(+m[1],mo,dy); return isNaN(d)?null:d; }
  const base=new Date(from.getFullYear(),from.getMonth(),from.getDate());
  const build=y=>{ const leapOK=(mo===1&&dy===29)&&!(new Date(y,1,29).getMonth()===1);
    return new Date(y,mo,leapOK?28:dy); };
  let d=build(base.getFullYear());
  if(d<base) d=build(base.getFullYear()+1);
  return d;
};
export const daysToDate=(iso,annual,from=new Date())=>{ const d=nextOccurrence(iso,annual,from);
  if(!d) return null;
  const base=new Date(from.getFullYear(),from.getMonth(),from.getDate());
  return Math.round((d-base)/864e5); };
/* how many years it will be, when a real year was given */
export const yearsAt=(iso,annual)=>{ const m=String(iso||'').match(/^(\d{4})/); if(!m) return null;
  const y=+m[1]; if(y<1900) return null;
  const nx=nextOccurrence(iso,annual); return nx?nx.getFullYear()-y:null; };
export const DATE_LEAD_DEFAULT=7;
export const labelVocab=settings=>{ const o=(settings&&settings.options&&settings.options.labels);
  return Array.isArray(o)&&o.length?o:DEFAULT_OPTIONS.labels; };
/* ---- @mentions ------------------------------------------------------------
   A tag is stored as a name on the activity, NOT parsed out of the text every
   time it's read. Parsing would break the moment someone writes an email
   address or renames themselves, and there'd be no way to mark one done.
   Cleared is per-person: Logan ticking his tag off must not clear it for
   Garrett, so it's an array of names rather than a boolean. */
export const tagsOn=a=>Array.isArray(a&&a.tags)?a.tags:[];
export const tagCleared=a=>Array.isArray(a&&a.tagsDone)?a.tagsDone:[];
/* strips a trailing "@Name" the composer already turned into a real tag, so the
   note doesn't read "call him @Logan @Logan" */
export const stripTagText=(text,names)=>{ let t=String(text||'');
  (names||[]).forEach(n=>{ t=t.replace(new RegExp('@'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi'),''); });
  return t.replace(/\s{2,}/g,' ').trim(); };
/* ---- team scoping: everyone sees their own leads; "ProyTech" is the shared pool ---- */
export const POOL_OWNER=BRAND.pool;
/* "the pool" = anything nobody has claimed: the legacy company-owned leads,
   plus any lead sitting in a named pool with no owner_id on it. */
export const isPoolLead=(l,myPools)=>l.owner===POOL_OWNER||(!l.owner_id&&!!l.pool&&(!myPools||myPools.includes(l.pool)));
export const ACT_TYPES=[{key:'Booked',icon:CalendarCheck},{key:'Note',icon:StickyNote},{key:'Call',icon:PhoneCall},{key:'Text',icon:MessageSquare},{key:'Meeting',icon:CalendarClock},{key:'Email',icon:Mailbox}];
/* named buckets of unclaimed leads. A rep sees the pools they're given. */
export const DEFAULT_POOLS=['General'];
export const poolList=settings=>{ const p=(settings&&settings.pools)||[]; return p.length?p:DEFAULT_POOLS; };
/* WHOSE CALENDAR A BOOKING ACTUALLY LANDS ON.
   There is ONE Google connection per install (ENGINEERING §6 — not
   multi-tenant), so when a rep schedules a meeting the event is created on
   somebody else's primary calendar. They never see it appear anywhere and the
   owner gets entries they did not make. The scheduler now says so, which means
   it needs a name to say.

   WHICH owner, when an install has two: the one whose CRM email matches the
   connected Google account. That is the only answer actually derivable from
   what we have. Failing that, a single active owner is unambiguous. Failing
   THAT, return '' and let the caller say "the owner" — naming the wrong
   person is worse than naming nobody, and on this screen a wrong name reads
   as a fact about where the rep's work went.

   Name first, email as the fallback, because a crm_users row can be created
   with a blank name and a bold empty string is not a message. Both come from
   crm_users rather than from the Google account: gcalEmail is empty on the
   disconnected branch, and one rule has to work on both. */
export const calendarOwner=(roster,users,gcalEmail)=>{
  const norm=s=>String(s==null?'':s).trim().toLowerCase();
  /* TWO SOURCES, because neither is sufficient alone.
     `users` reads crm_users, which carries emails but which RLS narrows to a
     REP'S OWN ROW — so for a rep it contains no owners at all and this
     function could never resolve, whatever the emails said.
     `roster` is crm_team(), which carries every active person's name and role
     and deliberately no email. Merge them: emails where we have them, names
     where we do not. */
  const byId=new Map();
  (roster||[]).forEach(u=>{ if(u&&u.id) byId.set(u.id,{id:u.id,name:u.name,role:u.role,email:''}); });
  (users||[]).forEach(u=>{ if(!u||!u.id) return;
    if(u.active===false){ byId.delete(u.id); return; }
    byId.set(u.id,{...(byId.get(u.id)||{}),id:u.id,name:u.name,role:u.role,email:u.email||''}); });
  const owners=[...byId.values()].filter(u=>u.role==='owner');
  const g=norm(gcalEmail);
  const pick=(g&&owners.find(u=>norm(u.email)===g))||(owners.length===1?owners[0]:null);
  if(!pick) return '';
  return String(pick.name||'').trim()||String(pick.email||'').trim();
};
/* ---- commissions ----------------------------------------------------------
   A commission is a flat % of the deal, SNAPSHOT onto the lead at conversion:
   { repId, repName, pct, base, amount, status, convertedAt, approvedAt,
     approvedBy, voidedAt }. Snapshotting is the point — editing a rep's % or
   the deal value later must never silently rewrite history.
   pending = counted in the rep's running total, not money yet.
   earned  = an owner approved it. void = cancelled, out of every count.       */
export const cmsnAmount=(base,pct)=>Math.round(num(base)*num(pct))/100;
export const cmsnOf=l=>(l&&l.commission&&typeof l.commission==='object')?l.commission:null;
export const CMSN_STATE={pending:{label:'Pending',color:'#C8A24A'},earned:{label:'Earned',color:GREEN},void:{label:'Voided',color:'#8E89A8'}};
/* migrate any legacy 'Booked' activity that never became a meeting into one,
   so old history shows up in the new unified views. Idempotent: an activity
   already linked to a meeting (meetingId) is skipped. */
/* A meeting can exist without anybody ever having said WHEN it is. Two ways in:
   a legacy 'Booked' activity migrated below, and a meeting logged from the
   activity composer. Both only ever knew the moment they were typed, so their
   start is the log time, not the meeting time. Those carry dateUnknown and get
   asked for a DATE, never for a status — "did this happen?" is the wrong
   question about a meeting nobody has scheduled yet, and it is the reason a
   batch of meetings entered in one sitting all turned up overdue five minutes
   later. Backfill is a heuristic on existing rows (logged, and start never
   moved off createdAt) and is written down for real the first time a date is
   set, so it can never flip back. */
export const datelessOf=m=>m.dateUnknown!==undefined&&m.dateUnknown!==null
  ? !!m.dateUnknown
  : (!!m.logged&&!!m.start&&m.start===m.createdAt);
export const meetingsOf=l=>{
  const existing=(l.meetings||[]).map(m=>({...m,status:m.status||'',dateUnknown:datelessOf(m)}));
  const haveIds=new Set(existing.map(m=>m.id));
  const linked=new Set(existing.map(m=>m.meetingId).filter(Boolean));
  const fromActs=(l.activities||[])
    .filter(a=>a&&a.type==='Booked'&&a.ts&&!a.meetingId&&!linked.has(a.id))
    .map(a=>({ id:'m_'+a.id, fromActivity:a.id, title:(a.text||'Meeting').replace(/ booked:.*/i,'').replace(/ booked\.?$/i,'')||'Meeting',
      mtype:a.mtype||'Other', start:a.ts, end:a.ts, status:a.status||'', who:a.who, createdAt:a.ts, logged:true, dateUnknown:true }))
    .filter(m=>!haveIds.has(m.id));
  return [...existing,...fromActs];
};
/* every meeting across every lead, flattened with its lead attached */
export const allMeetings=leads=>(leads||[]).flatMap(l=>meetingsOf(l).map(m=>({lead:l,m})));
/* how far out "Not right now" parks a lead. 45 days is the default because
   that's roughly a sales quarter's patience — long enough not to annoy, short
   enough that the trail is still warm. Editable per install. */
export const NURTURE_DAYS_DEFAULT=45;
export const nurtureDaysOf=settings=>{ const n=num(settings&&settings.nurtureDays);
  return n>0?n:NURTURE_DAYS_DEFAULT; };
/* how far each lead ever got, read back out of the logged stage moves.
   rate = step conversion (this stage / previous). closeRate = share of leads
   that reached this stage which ultimately CLOSED (the last stage in the flow). */
/* archived (previously-closed) deals on a repeat client */
export const closedDealsTotal=l=>((l&&l.closedDeals)||[]).reduce((a,d)=>a+num(d.amount),0);
/* AUDIT #23. paidTotal is GONE. It summed one array and was used to answer two
   different questions — "how much cash arrived" and "is the balance settled" —
   and a retainer payment silently settling a build is what that cost. The
   unqualified question no longer has a name to call:
     setupPaid(l)     against the work        -> balances
     retainerPaid(l)  against the retainer    -> arrears
     allPaid(l)       every dollar            -> revenue and the ledger
   Any cash logged at all, for the legacy-fallback checks below. */
export const anyPayments=l=>paymentRows(l);
/* everything this client has been sold: open deals, archived closed deals, and
   a bare dealValue for leads that never used deal rows */
export const contractedTotal=l=>{
  const closed=closedDealsTotal(l);
  /* dealBits, not dealSum — dealSum is a local inside the lead modal, so calling
     it from module scope crashed at render while building cleanly. Same shape,
     module-level. */
  const open=dealsOf(l).reduce((a,d)=>a+dealBits(d),0);
  return closed+open;
};
/* ---- card fees ------------------------------------------------------------
   The CRM records payments GROSS — the invoice amount, not what landed in the
   bank after the processor's cut. So a Square fee is real money leaving that
   appears nowhere, and it is NOT a percentage of revenue: a Venmo payment of
   the same size costs nothing. It is a property of the rail.

   Only a card rail carries one. Anything else, and anything with no method
   recorded, contributes zero — an unknown payment is never assumed to be card,
   because understating this line is the safe direction. A number that is too
   low gets checked; one that is too high gets believed. */
export const CARD_METHODS=['Square'];
export const isCardPayment=p=>!!p&&CARD_METHODS.indexOf(String(p.method||''))!==-1;
/* rate lives in settings so it is correctable from a statement without a deploy */
export const cardFeeOf=(p,fees)=>{
  if(!isCardPayment(p)) return 0;
  const pct=num(fees&&fees.cardPct), fixed=num(fees&&fees.cardFixed);
  const amt=num(p.amount);
  if(amt<=0) return 0;
  return (amt*pct/100)+fixed;
};
/* The estimate AND how much of the book it actually covers. Callers render the
   coverage next to the number rather than choosing whether to mention it. */
export function cardFeeSummary(payments,fees){
  const rows=Array.isArray(payments)?payments:[];
  let fee=0,counted=0,inferred=0,unknown=0,free=0;
  rows.forEach(p=>{
    if(!p) return;
    if(!p.method){ unknown++; return; }
    if(p.methodSource==='inferred') inferred++;
    if(isCardPayment(p)){ fee+=cardFeeOf(p,fees); counted++; }
    else free++;
  });
  return { fee:Math.round(fee*100)/100, counted, inferred, unknown, free, total:rows.length };
}

/* ---- one record, two jobs -------------------------------------------------
   A relationship can also be a genuine lead. The rule for whether it counts as
   business is NOT the isRelationship flag — it is whether real money is
   attached, which is the same test the lead view already used to decide
   whether to keep showing the Deal panel on a record somebody flipped into a
   relationship (LeadView, the 'deal' section).

   That test lived inline in one component while the money screens filtered on
   the flag instead, which is how the Dashboard and the Money page came to
   disagree. It lives here now and both call it, so they cannot drift apart. */
export const hasRealDeal=l=>{
  if(!l) return false;
  if(dealsOf(l).reduce((a,d)=>a+dealBits(d),0)>0) return true;
  if((Array.isArray(l.closedDeals)?l.closedDeals:[]).length>0) return true;
  if(num(l.retainer)>0) return true;
  if(paymentRows(l).length>0) return true;
  return false;
};
/* Does this record belong in the pipeline, the forecast and the money tiles?
   Every business lead does. A relationship does only once it carries a real
   deal — so a connector never inflates the pipeline, and a connector who
   actually bought something is not quietly missing from revenue. */
export const countsAsBusiness=l=>!!l&&(!l.isRelationship||hasRealDeal(l));

/* What's still owed. A lead with NO payments logged but a confirmed deposit is
   treated as settled, because that's exactly how revenue counts it — the legacy
   fallback. Saying "revenue counted" and "still owes it" about the same client
   would be two answers to one question. */
export const owedBy=(l,stages)=>{
  /* Only money you've actually WON can be owed. An open lead sitting at
     Discovery hasn't bought anything, and counting its deal value as debt made
     "still owed" read as roughly the whole open pipeline. Lost leads owe
     nothing either. */
  const won=!!(l&&(l.isClient||(stages&&sOf(l.stage,stages).won)));
  if(!won) return 0;
  /* AUDIT #21 + #22. This read `cashConfirmed(l) ? 0 : ...`, treating ANY
     deposit-ticked client with no payment rows as settled — the mirror of the
     revenue fallback, wrong the same way and for the same reason. Both read
     legacySettled() now, so a lead closed since payment tracking began is "not
     collected" AND "still owed": one coherent answer instead of two that
     contradict each other.

     RETAINERS ARE DELIBERATELY NOT IN HERE — see the note on the lead panel. */
  if(!anyPayments(l).length) return legacySettled(l)?0:contractedTotal(l);
  /* setupPaid, not every payment. This is the line Justus's $249 was going
     through: a month of retainer paying down a $1,011.75 automations deal. */
  return Math.max(0,contractedTotal(l)-setupPaid(l));
};
/* open deals on a lead, migrating legacy single-deal / bare-dealValue shapes.
   Mirrors the modal's openDeals so the card and the modal always agree. */
export const dealBits=d=>num(d.setup)+num(d.website)+num(d.integration)+((d.extras||[]).reduce((a,e)=>a+num(e.amount),0));
/* paymentsPaid deleted with paidTotal — it was a second name for the same sum
   (AUDIT #24), and its last caller went when the client card moved to owedBy. */
/* A deal opened on somebody who is ALREADY a client is new business in progress,
   not revenue already earned. It gets stamped at creation, because guessing after
   the fact from dates is fragile. Deals with no stamp are every deal that existed
   before this build plus every original sale, and they keep counting exactly as
   they did — no historical number moves. */
export const isUpsellDeal=d=>!!(d&&d.upsell);
export const openSaleValue=l=>dealsOf(l).filter(d=>!isUpsellDeal(d)).reduce((a,d)=>a+dealBits(d),0);
export const dealsOf=l=>{
  /* An EMPTY deals array is not the same as "no deals" — a lead can carry a
     dealValue with no itemised deal rows (imported, or typed straight into the
     header). Returning [] for that made openSaleValue read $0 while
     revenueMonth read the dealValue, so Revenue Closed and Avg Deal Size
     disagreed about the same lead. Fall through to the legacy shapes instead. */
  if(Array.isArray(l&&l.deals)&&l.deals.length) return l.deals;
  /* Once a deal has been CLOSED, its money lives in closedDeals — and the old
     `deal` object / bare dealValue it came from are still sitting on the record.
     Falling through to them then counts the same money twice: Justus showed
     $2,499 closed plus a $2,499 phantom open deal, so "still owed" read $2,250
     against a client who had paid in full. A lead with closed deals has no
     legacy open deal by definition. */
  if((l&&l.closedDeals||[]).length) return [];
  if(l&&l.deal&&typeof l.deal==='object'&&dealBits(l.deal)>0) return [{id:'d_legacy',label:'Deal',...l.deal}];
  if(l&&num(l.dealValue)>0) return [{id:'d_legacy',label:'Deal',setup:l.dealValue}];
  return [];
};
export const ACT_LABEL={Booked:'Meeting Booked'};
export const actLabel=t=>ACT_LABEL[t]||t;
/* Counts come from meetingsOf() and nowhere else. This used to count 'Booked'
   ACTIVITIES instead, which is why cancelling a meeting left the header saying
   "2 booked" over a list that said "No meetings yet" — the meeting was gone, the
   activity that announced it wasn't. The activity feed is history and should
   keep the cancelled booking; the count is state and must not. */
export const bookedCount=l=>meetingsOf(l).length;
/* ===================== helpers ===================== */
export const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
export const num=v=>{const n=Number(v);return isNaN(n)?0:n;};
export const usd=v=>(num(v)<0?'-$':'$')+Math.abs(Math.round(num(v))).toLocaleString();
/* cents-aware money (payments can be $1,498.50) — shows cents only when non-zero */
export const usdc=v=>{ const x=num(v); const cents=Math.round(Math.abs(x)*100)%100; return (x<0?'-$':'$')+Math.abs(x).toLocaleString(undefined,{minimumFractionDigits:cents?2:0,maximumFractionDigits:2}); };
export const pct=v=>(num(v)*100).toFixed(0)+'%';
export const isoOf=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const todayISO=()=>isoOf(new Date());
export const fmtDate=iso=>{if(!iso)return '';const d=new Date(iso+(iso.length<=10?'T00:00:00':''));return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
export const fmtStamp=ts=>{const d=new Date(ts);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});};
export const daysUntil=iso=>{if(!iso)return null;const a=new Date(iso+'T00:00:00'),b=new Date(todayISO()+'T00:00:00');return Math.round((a-b)/86400000);};
/* lastContact() lived here: newest activity of ANY type, falling back to
   createdAt. It is gone rather than deprecated — every caller reads lastTouch
   now, and leaving a second clock in the file is how a third one gets written
   by somebody who finds it first. */
export const sOf=(k,stages)=>stages.find(s=>s.key===k)||stages[0];
/* ===================== delivery (post-sale fulfillment) ===================== */
export const DEFAULT_DELIVERY_TRACKS=[
  { key:'website', label:'Website', services:['Web Design','Website','Both','Full Front Office'],
    milestones:['Discovery call complete','Website dev pending','Website V1 sent','Revisions','Final proof sent','Website approved by client'] },
  { key:'ai', label:'AI / Integrations', services:['AI Integration','AI Receptionist','Missed-Call Text-Back','Booking / Scheduling','CRM Setup','Both','Full Front Office'],
    milestones:['Discovery & scoping','Integrations started','Build & configuration','Testing','Integrations delivered'] },
];
export const activeTracks=(lead,tracks)=>{ const svc=lead.serviceInterest||[]; const m=(tracks||[]).filter(tr=>(tr.services||[]).some(s=>svc.includes(s))); return m.length?m:(tracks||[]); };
/* ---- the referral ledger --------------------------------------------------

   Two directions, deliberately asymmetric.

   RECEIVED is already in the data and always was: a lead carries introducedBy
   pointing at the relationship who sent them. Those are your leads, so you know
   what they closed for, and the money is worth showing.

   GIVEN is new, and it is a count of favours with no outcome attached. You will
   never reliably learn what a referral was worth to the other person, and a
   field nobody fills is worse than no field — so an entry is: sent, dated,
   optionally linked to a lead of yours, and that is all.

   An entry keeps BOTH the lead id and the name as it was at the time. The id is
   the link; the name is what survives the lead being deleted. "I sent them
   Marcus" stays true after Marcus's record is gone, and the entry degrades to
   the unlinked shape rather than to a blank. introducedBy already behaves this
   way on the receiving side — it renders "(removed contact)" — so both halves
   of the ledger tolerate a dangling id by design rather than by accident.

   Stored in the lead's jsonb, so it rides the same single patch every other
   edit does. It inherits the leads RLS exactly: a relationship you own is
   unreadable to a rep, which is what makes this owner-only in practice. NOT by
   construction — put a relationship in a pool and the rep in that pool reads
   the ledger with it. Enforcing it would take a table with its own policy;
   that trade was made deliberately and is written down here so the next person
   does not have to rediscover it. */
export const referralsOut=l=>Array.isArray(l&&l.referralsOut)?l.referralsOut:[];
export const mkReferral=o=>({id:uid(),leadId:(o&&o.leadId)||'',name:String((o&&o.name)||'').trim(),
  note:String((o&&o.note)||'').trim(),sentAt:(o&&o.sentAt)||todayISO()});
/* The leads this relationship sent you. Self-reference is excluded: a record
   pointed at itself would otherwise count as its own introduction. */
export const introducedLeads=(rel,all)=>!rel?[]:(all||[]).filter(l=>l&&l.id!==rel.id&&l.introducedBy===rel.id);
/* What an outbound entry should render as, given the leads currently on file.
   The stored name is the fallback, never the source of truth while the link
   resolves — a lead that was renamed should read by its current name. */
export const referralTarget=(r,all)=>{
  const hit=r&&r.leadId?(all||[]).find(l=>l&&l.id===r.leadId):null;
  return hit?{name:hit.name||hit.company||'(unnamed)',lead:hit,gone:false}
            :{name:(r&&r.name)||'(unnamed)',lead:null,gone:!!(r&&r.leadId)};
};

/* ---- introduction network: who introduced whom ---- */
/* returns [root, ..., directIntroducer] for a contact — cycle-safe */
export function introChain(lead,all){
  if(!lead) return [];
  const byId={}; (all||[]).forEach(x=>byId[x.id]=x);
  const chain=[]; const seen=new Set([lead.id]); let cur=lead;
  while(cur&&cur.introducedBy){
    const p=byId[cur.introducedBy];
    if(!p||seen.has(p.id))break;
    seen.add(p.id); chain.unshift(p); cur=p;
  }
  return chain;
}
export const normEntry=v=>{ if(!v) return {done:null,due:null,assignee:null,taskId:null}; if(typeof v==='string') return {done:v,due:null,assignee:null,taskId:null}; return {done:v.done||null,due:v.due||null,assignee:v.assignee||null,taskId:v.taskId||null}; };
/* ---- when money counts -----------------------------------------------------
   Converting somebody to a client means they SAID YES. It is not the same event
   as money arriving, and treating it as one books revenue that hasn't landed —
   which is exactly backwards for a business that converts on the yes and
   collects at the discovery meeting a week later.
   The onboarding checklist already has "Deposit / first payment collected".
   That tick is now the thing revenue waits on. Nothing else about converting
   changes: the stage moves, onboarding starts, the client appears on the board.
   A closed DEAL (closedDeals) is unaffected — closing one is already an
   explicit act, so it counts the moment you do it. */
export const depositPaidAt=l=>normEntry((l&&l.onboarding||{}).deposit_paid).done||'';
/* legacy: clients converted before this rule existed have no deposit tick, and
   silently zeroing their revenue would rewrite history. They keep counting. */
export const CASH_RULE_FROM='2026-08-01';
/* ---- AUDIT #22 -------------------------------------------------------------
   WHEN THE LEGACY FALLBACK IS ALLOWED TO FIRE.

   The fallback exists so deals closed BEFORE payment rows existed still count
   at their close date — otherwise switching payment tracking on would have
   silently deleted every historical month (ENGINEERING §4).

   It was never date-bound, so it kept firing forever: a deal closed last week
   with the deposit box ticked and no payment logged was reported as COLLECTED.
   That is the opposite of the rule it sits inside — revenue is cash, and
   nothing is cash until a payment is logged against it.

   Bounded here. A lead closed on or after this date needs a real payment row to
   count as collected; before it, the fallback still protects history. Moving
   this date FORWARD restates past revenue downward, which §4 calls worse than
   the bug — so only move it once those months are genuinely backfilled. */
export const PAYMENTS_FROM='2026-08-01';
/* Closed before payment tracking, so missing payment rows are an artefact of
   WHEN it happened rather than money that has not arrived. */
export const preDatesPayments=l=>{ const c=String((l&&l.closedAt)||'').slice(0,10);
  return !!c && c < PAYMENTS_FROM; };
/* The one predicate BOTH revenue and owedBy read, so "we counted this as
   collected" and "they still owe it" can never both be true of one lead — which
   is the contradictory pair the unbounded fallback used to produce. */
export const legacySettled=l=>!anyPayments(l).length && cashConfirmed(l) && preDatesPayments(l);
export const cashConfirmed=l=>{ if(!l) return false;
  if(depositPaidAt(l)) return true;
  /* deposit switched off for this client — monthly-only, no setup fee to
     collect — so there is nothing for revenue to wait on. Without this they'd
     read "awaiting payment" forever over a $0 setup. */
  if(onbSkipped(l,'deposit_paid')) return true;
  const conv=String(l.convertedAt||l.closedAt||'').slice(0,10);
  return !!conv && conv < CASH_RULE_FROM; };
export const trackProgress=(lead,track)=>{ const raw=(lead.delivery&&lead.delivery[track.key])||{}; const ms=track.milestones||[]; const entries={}; let completed=0,overdue=0,nextDue=null;
  ms.forEach(m=>{ const e=normEntry(raw[m]); entries[m]=e; if(e.done) completed++; else if(e.due){ if(daysUntil(e.due)<0) overdue++; if(!nextDue||e.due<nextDue) nextDue=e.due; } });
  const current=ms.find(m=>!entries[m].done)||null;
  return {entries,ms,completedCount:completed,total:ms.length,pct:ms.length?completed/ms.length:0,current,overdue,nextDue}; };
export const clientOverall=(lead,tracks)=>{ const ts=activeTracks(lead,tracks); let c=0,t=0,phase='',overdue=0,nextDue=null,lastDone=null; ts.forEach(tr=>{const p=trackProgress(lead,tr);c+=p.completedCount;t+=p.total;overdue+=p.overdue; if(p.nextDue&&(!nextDue||p.nextDue<nextDue))nextDue=p.nextDue; if(p.current&&!phase)phase=`${tr.label}: ${p.current}`; Object.values(p.entries).forEach(e=>{ if(e.done&&(!lastDone||e.done>lastDone)) lastDone=e.done; }); }); const delivered=t>0&&c>=t; return {pct:t?c/t:0,phase:phase||'Delivered',tracks:ts,overdue,nextDue,completed:c,total:t,delivered,doneDate:lastDone}; };
export const evNum=v=>{const n=Number(v);return isNaN(n)?0:n;};
/* ---- sponsorship history -------------------------------------------------
   DERIVED from event slots, not stored twice. A filled slot already holds the
   contact, the amount and whether it's paid, so a sponsorships[] array on the
   lead would be a second copy of the same fact — and two records of one fact
   drift the moment either is edited. That's the bug that produced $0 rows in
   the Deals Closed panel.
   Two exceptions are kept as MANUAL entries on the lead, clearly marked:
   sponsorships from before the Events module existed, and sponsorships of
   something that was never a CRM event. */
export const manualSponsorships=l=>Array.isArray(l&&l.sponsorships)?l.sponsorships:[];
export const sponsorshipsOf=(lead,events)=>{
  if(!lead) return [];
  const fromEvents=(events||[]).flatMap(ev=>(ev.slots||[])
    .filter(sl=>sl.contactId===lead.id&&(sl.price!==''&&sl.price!=null))
    .map(sl=>({ id:ev.id+'_'+sl.id, eventId:ev.id, eventName:ev.name||'Untitled event',
      date:ev.date||ev.createdAt||'', label:sl.label||'Sponsorship',
      amount:evNum(sl.price), paid:!!sl.paid, source:'event' })));
  const manual=manualSponsorships(lead).map(m=>({ ...m, source:'manual',
    amount:evNum(m.amount), eventName:m.eventName||m.label||'Sponsorship' }));
  /* the legacy single-amount field, only when there's nothing better — so an
     install that recorded one number before any of this keeps showing it */
  const legacy=(!fromEvents.length&&!manual.length&&evNum(lead.sponsorAmount)>0&&lead.pastSponsor)
    ? [{id:'legacy_'+lead.id,eventName:lead.sponsorTier||'Sponsorship',date:'',
        label:'Recorded before events were tracked',amount:evNum(lead.sponsorAmount),
        paid:true,source:'legacy'}] : [];
  return [...fromEvents,...manual,...legacy]
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
};
/* ===================== RELATIONSHIPS ===================== */
export const REL_TIERS=[['champion','Champions','#C8A24A'],['b','B Tier','#2B4DE0'],['new','New Relationships','#1F9D55']];
export function fmtMeetingTime(iso){ try{ const d=new Date(iso); return d.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }catch{ return iso; } }

/* Meeting shape — moved here in the LeadView extraction (PR 1b) rather than
   copied into it. MEETING_TYPES and needsDate are read by BOTH the Meetings
   page and the lead view's scheduler; isDateless is what needsDate asks. */
/* meeting types — coffee and discovery are different motions, track them apart */
export const MEETING_TYPES=['Coffee','Discovery Call','Proposal / Pitch','Onboarding','Check-in','Other'];

export const isDateless=m=>!!m&&!!m.dateUnknown;

export const needsDate=m=>!m.status&&isDateless(m);

/* GMAIL COMPOSE.

   Gmail numbers the accounts you are signed into in the order you added them,
   so /u/0 is one person's work account and the next person's personal one.
   That number is a property of THIS BROWSER PROFILE, not of the CRM user — the
   same person on a second machine can have a different one — so it is read from
   localStorage rather than settings or the crm_users row. Nothing to migrate,
   nothing to sync, and no way for one person's choice to change another's. */
export const GMAIL_KEY = 'gmailAccount';
export const gmailIndex = () => {
  try { const n = parseInt(localStorage.getItem(GMAIL_KEY) || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0; } catch { return 0; }
};
export const setGmailIndex = n => {
  try { localStorage.setItem(GMAIL_KEY, String(Math.max(0, parseInt(n, 10) || 0))); } catch {}
};
export const gmailCompose = (email, idx) =>
  `https://mail.google.com/mail/u/${idx === undefined ? gmailIndex() : idx}/?view=cm&fs=1&to=${encodeURIComponent(email || '')}`;

/* Who to escalate to, with the SAME fallback the @mention picker already uses.

   crm_team() returns [] on an install that has not run TEAM-MIGRATION.sql, and
   the escalation path read it directly — so on those installs SO, HV and DNC
   tagged NOBODY and did it silently. The picker beside them had a fallback and
   the automatic path did not, which is the two-code-paths-one-job shape that
   drifts by definition. One function now, used by both. */
export const ownerNames = (roster, users) => {
  const fromRoster = (Array.isArray(roster) ? roster : [])
    .filter(u => u && u.role === 'owner' && u.name).map(u => u.name);
  if (fromRoster.length) return [...new Set(fromRoster)];
  const fromUsers = (Array.isArray(users) ? users : [])
    .filter(u => u && u.role === 'owner' && u.active !== false && u.name).map(u => u.name);
  if (fromUsers.length) return [...new Set(fromUsers)];
  /* Last resort: the names this deployment was configured with. Better than
     tagging nobody, and it is what the picker falls back to. */
  return [...new Set((BRAND.team || []).filter(Boolean))];
};

/* ---- the five things, captured when a call is booked ----------------------

   SOP-03 has the rep asking for these on the call and texting them to Logan
   within ten minutes, because Logan builds the site in the half hour before
   the appointment and cannot start until they land. The rep already has them
   in front of him at that moment — writing them here is recording what he
   just heard, not extra work.

   NO MIGRATION. A lead is a jsonb blob: `leadRow` writes `data: {...lead}`
   with no column list and `getLeads` spreads it straight back, so a new key
   rides along untouched.

   WEBSITE IS NOT IN THIS LIST. `lead.website` already exists, and a second
   home for one fact is two screens that can disagree. It is asked for at the
   same moment and validated alongside — see briefMissing below. */
/* lead.js has no string helper of its own — `S` lives in kb.js. A local one,
   declared before every use, because const does not hoist and this file is
   imported into a module graph that renders immediately (ENGINEERING.md §1). */
const bs = (v, cap = 400) => String(v == null ? '' : v).slice(0, cap);

export const BRIEF_FIELDS = [
  { key: 'nameAsWritten', label: 'Business name, exactly how they want it written',
    hint: 'Not how the list spells it — how they say it' },
  { key: 'wants', label: 'The three things they want the phone ringing for',
    hint: '"If you could pick what the phone rings for, what is it?"' },
  { key: 'area', label: 'Where they work', hint: 'Town, radius, or the areas they cover' },
  { key: 'photos', label: 'Where their photos live', hint: 'Facebook, Google, or they will send some' },
];
export const BRIEF_KEYS = BRIEF_FIELDS.map(f => f.key);

export const briefOf = l => (l && l.brief && typeof l.brief === 'object') ? l.brief : {};

/* WHY THERE IS A "they have no website" FLAG.

   An empty website field means one of two completely different things: nobody
   asked, or they do not have one. Those are not the same fact and they must
   not render the same, because the first is a gap Logan has to chase and the
   second is an answer he can build against. A blank that could be either is
   exactly the "missing value that renders as a plausible one" failure. So the
   rep says which. */
export const briefMissing = (l) => {
  const b = briefOf(l);
  const out = BRIEF_FIELDS.filter(f => !bs(b[f.key], 400).trim()).map(f => f.key);
  if (!bs(l && l.website, 300).trim() && !b.noWebsite) out.push('website');
  return out;
};
export const briefComplete = l => briefMissing(l).length === 0;

/* Everything SOP-03 says goes in the text to Logan, in one object, so the
   notification and any screen showing it read the SAME assembly rather than
   each building their own and drifting. */
export const bookingBrief = (l, meeting) => {
  const b = briefOf(l);
  return {
    company: bs(l && l.company, 200) || bs(l && l.name, 200),
    contact: bs(l && l.name, 200),
    phone: bs(l && l.phone, 40),
    email: bs(l && l.email, 200),
    industry: bs(l && l.businessType, 80),
    when: bs(meeting && meeting.start, 40),
    nameAsWritten: bs(b.nameAsWritten, 200),
    website: bs(l && l.website, 300) || (b.noWebsite ? 'They do not have one' : ''),
    wants: bs(b.wants, 400),
    area: bs(b.area, 200),
    photos: bs(b.photos, 200),
  };
};

/* The brief as an event description — plain text, because a Google Calendar
   description is read on a phone lock screen as often as in a browser.

   ONE ASSEMBLY, shared with bookingBrief(), so what Logan reads in the invite
   and what the CRM holds cannot drift. */
export const briefText = (b) => {
  const L = [];
  if (b.contact) L.push(`Contact: ${b.contact}`);
  if (b.phone) L.push(`Phone: ${b.phone}`);
  if (b.email) L.push(`Email: ${b.email}`);
  if (b.industry) L.push(`Industry: ${b.industry}`);
  L.push('');
  L.push('WHAT THEY ASKED FOR');
  if (b.nameAsWritten) L.push(`Name as written: ${b.nameAsWritten}`);
  L.push(`Current site: ${b.website || 'not captured'}`);
  if (b.wants) L.push(`Wants calls for: ${b.wants}`);
  if (b.area) L.push(`Works: ${b.area}`);
  if (b.photos) L.push(`Photos: ${b.photos}`);
  return L.join('\n');
};

/* ---- picking a time on a live call ----------------------------------------

   "Are mornings or afternoons better for you? … Thursday at ten, or Thursday
   at two?" — SOP-03. That is the conversation, so the control matches it: a
   day, then a time, two taps and no typing.

   HALF HOURS, NOT QUARTERS. Nobody books 10:15. Forty chips is slower to scan
   than the raw field it replaces, which would make the control worse than what
   it replaced — so the common times are half-hours and the raw
   <input type="datetime-local"> stays one tap away for the prospect who says
   "Thursday at 3:45".

   ORDERED BY WHEN PEOPLE ACTUALLY PICK UP, which SOP-01 states per industry.
   The lead's businessType decides which block leads. */
/* HOW LONG THE DEMO IS — ten minutes, because that is the number the rep
   already said out loud.

   The script promises it six times: "Takes ten minutes", "Ten minutes, and if
   yours is better, keep yours", "One job: ten minutes on Logan's calendar".
   The prospect hears ten and then opens a calendar invite. If that invite says
   anything else, the first written thing we ever send them contradicts the
   first spoken thing we ever told them — over a detail we chose for our own
   convenience. It shipped as thirty, then fifteen; both were wrong for the
   same reason, and fifteen was wrong in the more insidious way because it
   looked considered.

   IF LOGAN NEEDS A BREATH BETWEEN DEMOS, that is a gap between slots on his
   calendar, not a meeting longer than the one we sold. Named here and not
   inlined at the booking so the next person changing it has to read this.

   The owner-side MeetingScheduler keeps its own Length select and is
   deliberately NOT bound to this: an owner picking 45 minutes for a real
   meeting made no such promise. This is the cold-call demo only. */
export const DEMO_MIN = 10;

export const CALL_WINDOWS = [
  { key: 'trades', label: '8–10 and 4–6', match: /roof|hvac|plumb|auto|pdr|landscap|electric|concrete|paint/i,
    early: ['08:00','08:30','09:00','09:30'], late: ['16:00','16:30','17:00','17:30'] },
  { key: 'desk', label: '9–11 and 1–3', match: /real estate|realtor|agent|lend|loan|mortgage|insur|broker/i,
    early: ['09:00','09:30','10:00','10:30'], late: ['13:00','13:30','14:00','14:30'] },
];

/* THE FALLBACK IS THE POINT, not an afterthought: most leads have no
   businessType, so the unknown case is the COMMON case and must be the most
   sensible list rather than the leftovers. A general business day, widest
   sensible spread, no industry guess baked in. */
export const DEFAULT_TIMES =
  ['09:00','09:30','10:00','10:30','11:00','13:00','13:30','14:00','14:30','15:00','16:00'];

export const windowFor = (businessType) => {
  const t = bs(businessType, 80).trim();
  if (!t || t === '—') return null;
  return CALL_WINDOWS.find(w => w.match.test(t)) || null;
};

/** The time chips to offer, in the order they should be scanned.
 *  Returns { times, label } — `label` says WHY this order, or '' when the lead
 *  gives no reason and the general list is being used. */
export function timesFor(businessType) {
  const w = windowFor(businessType);
  if (!w) return { times: DEFAULT_TIMES, label: '' };
  return { times: [...w.early, ...w.late], label: `${w.label} is when they pick up` };
}

/* Quarter-hours, only when asked for. Built from the offered list rather than
   from a fixed grid, so expanding never reorders what was already on screen. */
export const quartersFrom = (times) => {
  const out = [];
  for (const t of times) {
    const [h, m] = t.split(':').map(Number);
    for (const add of [0, 15, 30, 45]) {
      const tot = h * 60 + m + add;
      if (m === 30 && add >= 30) continue;   /* :30 only expands to :45 */
      if (m === 0 && add === 30) continue;   /* :30 is already in the list */
      const hh = Math.floor(tot / 60), mm = tot % 60;
      if (hh > 19) continue;
      const s = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      if (!out.includes(s)) out.push(s);
    }
  }
  return out.sort();
};

/** The next N weekdays, as { iso, label }. Today and tomorrow are named,
 *  because that is how somebody on a call refers to them. */
export function nextDays(n = 5, from) {
  const base = from ? new Date(from + 'T12:00:00') : new Date();
  const out = [];
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  while (out.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {          /* SOP-01: avoid weekends */
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const days = Math.round((d - new Date(base.getFullYear(), base.getMonth(), base.getDate())) / 864e5);
      /* Assembled rather than formatted in one call: a locale-dependent
         {weekday, day} ordering renders "31 Mon" outside en-US, and a chip a
         rep scans mid-call should read the way he says it. */
      out.push({ iso, label: days === 0 ? 'Today' : days === 1 ? 'Tomorrow'
        : `${d.toLocaleDateString(undefined,{weekday:'short'})} ${d.getDate()}` });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* "14:30" -> "2:30" for a chip, which has no room for meridiem on every one. */
export const chipTime = (hhmm) => {
  const [h, m] = bs(hhmm, 5).split(':').map(Number);
  if (isNaN(h)) return hhmm;
  const ampm = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''}${ampm}`;
};

/* A chosen day + time as the value datetime-local speaks, so the escape hatch
   and the chips write the SAME field and cannot disagree. */
export const joinWhen = (iso, hhmm) => (iso && hhmm) ? `${iso}T${hhmm}` : '';
export const splitWhen = (v) => {
  const s = bs(v, 40);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s);
  return m ? { day: m[1], time: m[2] } : { day: '', time: '' };
};

/* ---- how a person is written, everywhere -----------------------------------
   Six pickers across four files each had their own idea of how to label a
   person: "name || company", "company || name", "Company (Name)", "name ·
   company", and two more. So the same lead read differently depending on which
   screen you were on, and you could not search for one reliably.

   One convention: NAME — BUSINESS. Both when we have both, whichever exists
   when we have one, and something identifying rather than a blank row when we
   have neither.

   `businessType` defaults to an em dash elsewhere in this codebase and CSV
   imports happily carry a literal "-" into a name field, so a value that is
   only punctuation is treated as no value at all. Otherwise a picker shows a
   row reading "-" that cannot be searched for or recognised. */
const JUNK_LABEL = /^[\s\-–—._/\\|]*$/;
const clean = v => {
  const s = (v == null ? '' : String(v)).trim();
  if (!s || JUNK_LABEL.test(s)) return '';
  if (/^(n\/?a|none|unknown|null|undefined|tbd|\?+)$/i.test(s)) return '';
  return s;
};

/* the person's own name, with the junk values stripped */
export const personName = l => clean(l && l.name);
/* the business, same treatment */
export const personBiz  = l => clean(l && l.company);

/* "Devin Hammann — Kleen Stripe". Never returns an empty string: a lead with
   no name and no company falls back to whatever identifies it, so it stays
   findable instead of rendering as a blank or a dash. */
export function personLabel(l) {
  if (!l) return '';
  const n = personName(l), b = personBiz(l);
  if (n && b) return `${n} — ${b}`;
  if (n || b) return n || b;
  const contact = clean(l.email) || clean(l.phone);
  return contact ? `Unnamed — ${contact}` : 'Unnamed';
}

/* true when the record carries neither a name nor a business. These are real
   records — usually a half-finished import — so pickers sort them last rather
   than hiding them, which would make them unreachable and look like data loss. */
export const isUnlabelled = l => !personName(l) && !personBiz(l);

/* What a type-ahead matches on. Both name and business, so either gets you
   there, plus email and phone because people search by the thing they have in
   front of them. Digits are kept bare so "3165550142" finds "(316) 555-0142". */
export function personSearchText(l) {
  if (!l) return '';
  const parts = [personName(l), personBiz(l), clean(l.email), clean(l.phone)];
  const phone = clean(l && l.phone).replace(/\D/g, '');
  if (phone) parts.push(phone);
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/* Ranked match: every whitespace-separated term must appear somewhere, so
   "kleen devin" and "devin kleen" both land. Returns a score for ordering —
   a name that starts with what you typed beats one that merely contains it. */
export function personMatch(l, q) {
  const query = (q || '').trim().toLowerCase();
  if (!query) return 0;
  const hay = personSearchText(l);
  const terms = query.split(/\s+/).filter(Boolean);
  if (!terms.every(t => hay.includes(t))) return -1;
  const n = personName(l).toLowerCase(), b = personBiz(l).toLowerCase();
  if (n.startsWith(query) || b.startsWith(query)) return 3;
  if (n.split(/\s+/).some(w => w.startsWith(query)) ||
      b.split(/\s+/).some(w => w.startsWith(query))) return 2;
  return 1;
}
