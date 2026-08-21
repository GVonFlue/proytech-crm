/* ============================================================================
   src/LeadView.jsx — the lead record, opened.
   ----------------------------------------------------------------------------
   Moved out of src/App.jsx unchanged. This is the screen the redesign is about,
   extracted FIRST and with no behaviour change, so that every later diff reads
   against a file of its own rather than against a 1,200-line block inside a
   9,000-line one.

   WHAT CAME WITH IT: the three components only this screen uses — MeetingList,
   MeetingScheduler, MeetingBlock — and DateFix, which only MeetingList uses.

   WHAT DID NOT: anything shared. Every helper it reads a lead through — cmsnOf,
   owedBy, clientOverall, closedDealsTotal, dealsOf, trackProgress,
   MEETING_TYPES, needsDate — is IMPORTED from src/lib/lead.js, and the two
   badges it shares with the Leads table come from src/LeadBits.jsx. Nothing is
   copied. Two spellings of owedBy() is the ENGINEERING §2 bug, and a redesign
   is exactly the moment a second one appears.

   The component is still named Modal and still the default export. Renaming it
   would be a change to App.jsx's call site, and this PR changes nothing that
   runs.
   ========================================================================== */

import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { BRAND } from './lib/brand';
import {
  ACT_TYPES,
  CMSN_STATE,
  DATE_LEAD_DEFAULT,
  DEFAULT_DELIVERY_TRACKS,
  GREEN,
  MEETING_TYPES,
  OWNERS,
  PRIORITIES,
  REL_TIERS,
  actLabel,
  activeTracks,
  allMeetings,
  blankFirst,
  bookedCount,
  calendarOwner,
  clientOverall,
  closedDealsTotal,
  cmsnAmount,
  cmsnOf,
  dateVocab,
  datelessOf,
  dayLabel,
  daysToDate,
  daysUntil,
  dealsOf,
  depositPaidAt,
  evNum,
  fmtDate,
  fmtMeetingTime,
  fmtStamp,
  introChain,
  isPoolLead,
  isUpsellDeal,
  isoOf,
  keyDatesOf,
  labelVocab,
  labelsOf,
  lastContact,
  manualSponsorships,
  needsDate,
  normEntry,
  num,
  nurtureDaysOf,
  onbSkipped,
  owedBy,
  pct,
  poolList,
  sOf,
  seedOnboarding,
  sponsorshipsOf,
  stdPhases,
  stripTagText,
  tagCleared,
  tagsOn,
  todayISO,
  trackProgress,
  uid,
  usd,
  usdc,
  yearsAt,
} from './lib/lead';
import { meetingLogsOf } from './lib/meetinglog';
import {
  AlertTriangle,
  AtSign,
  Award,
  BadgeCheck,
  Ban,
  Bell,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Contact2,
  DollarSign,
  Expand,
  FileText,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Maximize2,
  MessageSquare,
  Minimize2,
  Percent,
  Phone,
  Plus,
  Rocket,
  Settings,
  SlidersHorizontal,
  StickyNote,
  Tag,
  Target,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { DateFix, PriBadge, StageBadge } from './LeadBits';

/* The ONE place a meeting gets booked. The Meetings section and the activity
   log's "Meeting Booked" button both render this, so there is a single path to
   the calendar and a single path into the numbers. Two things that used to be
   silently wrong here:
   - the connected account was hardcoded in the warning text, so when events
     landed on a different Google account than the one you were looking at there
     was nothing on screen to tell you. It now names the real account.
   - "Invite client" was disabled with no visible reason whenever the lead had
     no email, which reads exactly like a broken checkbox. It now shows the
     field and writes the address back to the lead. */
/* `rep` and `calOwner` drive the two lines at the top of this form and nothing
   else. Passed in rather than derived here: this component is presentational,
   and Modal already holds both users[] and the role. */
export function MeetingScheduler({lead,gcalConnected,gcalEmail,rep,calOwner,onSchedule,onLogUndated,recentLocations}){
  const [date,setDate]=useState(todayISO());
  const [time,setTime]=useState('10:00');
  const [dur,setDur]=useState(30);
  const [mtype,setMtype]=useState('Coffee');
  const [title,setTitle]=useState('');
  const [invite,setInvite]=useState(false);
  const [meet,setMeet]=useState(false);
  const [notes,setNotes]=useState('');
  const [loc,setLoc]=useState('');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const [addEmail,setAddEmail]=useState('');
  /* both the Meetings section and the activity composer can be on screen at
     once, so the quarter-hour datalist needs an id of its own per instance */
  const [listId]=useState(()=>'mtgq-'+Math.random().toString(36).slice(2,8));
  const [locListId]=useState(()=>'mtgl-'+Math.random().toString(36).slice(2,8));
  /* places used before, newest first, deduped case-insensitively */
  const recentLocs=useMemo(()=>{ const seen=new Set(); const out=[];
    (recentLocations||[]).forEach(v=>{ const k=String(v||'').trim(); if(!k) return;
      const lk=k.toLowerCase(); if(seen.has(lk)) return; seen.add(lk); out.push(k); });
    return out.slice(0,8); },[recentLocations]);
  const leadEmail=(lead.email||'').trim();
  const typed=addEmail.trim();
  const inviteEmail=leadEmail||typed;
  const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail);
  const pad=n=>String(n).padStart(2,'0');
  const localISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  const go=async()=>{
    setErr('');
    const startDt=new Date(`${date}T${time}:00`);
    if(isNaN(startDt)){ setErr('Pick a valid date and time.'); return; }
    if(invite&&!emailOk){ setErr('That email doesn’t look right — fix it or switch off Invite client.'); return; }
    const endDt=new Date(startDt.getTime()+dur*60000);
    const t=title.trim()||`${mtype} with ${lead.name||lead.company||'client'}`;
    setBusy(true);
    try{
      /* a typed address rides along IN THE SAME PATCH as the meeting. Saving it
         separately looks fine and silently loses it: both writes read the same
         stale draft inside one tick and the second overwrites the first. */
      await onSchedule({title:t,mtype,start:localISO(startDt),end:localISO(endDt),
        invited:invite&&emailOk,attendees:(invite&&emailOk)?[inviteEmail]:[],meet,notes:notes.trim(),
        location:meet?'':loc.trim(),
        saveEmail:(invite&&emailOk&&!leadEmail)?inviteEmail:''});
      setTitle('');setNotes('');setLoc('');setInvite(false);setMeet(false);setAddEmail('');
    }catch(e){ setErr(e.message||'Could not schedule'); }
    setBusy(false);
  };
  const logUndated=()=>{ if(!onLogUndated)return;
    onLogUndated({mtype,title:title.trim(),notes:notes.trim()});
    setTitle('');setNotes(''); };
  return (<div className="mtg-form">
    {/* Both branches say something different to a rep, and both have to.
        CONNECTED: the event lands on the owner's calendar, not theirs. A rep
        who is not told that assumes it appeared in their own Google account,
        goes looking, and finds nothing.
        DISCONNECTED: the owner copy says "Open Settings → Google Calendar",
        and a rep cannot open Settings AT ALL (canOpen() refuses it by role).
        Telling them to do something the app will not let them do is worse than
        telling them nothing, so the rep version names who can do it instead.
        The owner branches are untouched. */}
    {gcalConnected
      ? (rep
          /* Name the ACCOUNT, and prefix the person only when we can prove
             who it is. gcalEmail comes from /api/google-status, which any
             signed-in user may call — so it is the one answer a rep can always
             be given, and it is the literal truth about where the event goes.
             The name is the nicety; the address is the fact. Two owners with
             no matching email means we decline to name one rather than guess,
             but the rep is no longer left with a nameless sentence. */
          ? <div className="mtg-acct"><CalendarClock size={12}/>Goes on {
              calOwner&&gcalEmail ? <><b>{calOwner}</b>’s calendar — <b>{gcalEmail}</b></>
              : calOwner ? <><b>{calOwner}</b>’s Google Calendar</>
              : gcalEmail ? <><b>{gcalEmail}</b></>
              : <>the owner’s Google Calendar</>
            }, not yours{invite&&emailOk?<> · invite to <b>{inviteEmail}</b></>:null}</div>
          : <div className="mtg-acct"><CalendarClock size={12}/>Goes on <b>{gcalEmail||'the connected Google account'}</b>{invite&&emailOk?<> · invite to <b>{inviteEmail}</b></>:null}</div>)
      : (rep
          ? <div className="mtg-warn"><AlertTriangle size={13}/><span>Google Calendar isn’t connected, so this won’t reach a calendar. {calOwner?<><b>{calOwner}</b> has to connect it</>:<>The owner has to connect it</>} — schedule anyway, the meeting is saved in the CRM either way.</span></div>
          : <div className="mtg-warn"><AlertTriangle size={13}/><span>Google Calendar isn’t connected, so this won’t reach a calendar. Open <b>Settings → Google Calendar</b> and hit Connect.</span></div>)}
    <div className="mtype-row">{MEETING_TYPES.map(t=><button key={t} type="button" className={'mtype'+(mtype===t?' on':'')} onClick={()=>setMtype(t)}>{t}</button>)}</div>
    <div className="fgrid">
      <div className="field full"><label>Title</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={`${mtype} with ${lead.name||lead.company||'client'}`}/></div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      <div className="field"><label>Time</label><input type="time" step={900} value={time} onChange={e=>setTime(e.target.value)} list={listId}/></div>
      <div className="field"><label>Length</label><select value={dur} onChange={e=>setDur(+e.target.value)}>{[15,30,45,60,90,120].map(m=><option key={m} value={m}>{m<60?m+' min':(m/60)+' hr'+(m%60?' 30m':'')}</option>)}</select></div>
      <div className="field"><label>&nbsp;</label><div className="mtg-toggles">
        <label className={'mtg-chk'+(invite?' on':'')}><input type="checkbox" checked={invite} onChange={e=>setInvite(e.target.checked)}/><UserPlus size={13}/>Invite client</label>
        <label className={'mtg-chk'+(meet?' on':'')}><input type="checkbox" checked={meet} onChange={e=>setMeet(e.target.checked)}/><Video size={13}/>Meet link</label>
      </div></div>
      {invite&&!leadEmail&&<div className="field full"><label>Client email (saved to the lead)</label>
        <input type="email" inputMode="email" placeholder="name@company.com" value={addEmail} onChange={e=>setAddEmail(e.target.value)}/></div>}
      {/* Hidden when Meet Link is on: a video call has no address, and an
          invite carrying both is just confusing. Recent places are remembered
          so the coffee shop you always use is one tap the second time. */}
      {!meet&&<div className="field full"><label>Where {recentLocs.length>0&&<span className="loc-recent">
          {recentLocs.slice(0,3).map(r=><button key={r} type="button" onClick={()=>setLoc(r)}>{r}</button>)}</span>}</label>
        <input list={locListId} placeholder="Address or place — goes on the calendar invite"
          value={loc} onChange={e=>setLoc(e.target.value)}/>
        <datalist id={locListId}>{recentLocs.map(r=><option key={r} value={r}/>)}</datalist>
      </div>}
      <div className="field full"><label>Notes (optional)</label><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Agenda, what to prep…"/></div>
    </div>
    {err&&<div className="mtg-err">{err}</div>}
    <div className="mtg-actions">
      <button className="btn btn-p" disabled={busy} onClick={go}>{busy?<Loader2 size={15} className="spin"/>:<CalendarClock size={15}/>}{busy?'Scheduling…':gcalConnected?'Schedule + add to Calendar':'Schedule (no calendar)'}</button>
      {onLogUndated&&<button className="linkbtn" type="button" onClick={logUndated}>No date yet — just log it</button>}
    </div>
    <datalist id={listId}>{Array.from({length:96},(_,i)=>`${pad(Math.floor(i/4))}:${pad((i%4)*15)}`).map(v=><option key={v} value={v}/>)}</datalist>
  </div>);
}
export function MeetingList({meetings,onRemove,onStatus,onType,onTime}){
  const now=Date.now();
  const all=[...(meetings||[])].map(m=>({...m,dateUnknown:datelessOf(m)}));
  const sorted=all.sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  const undated=sorted.filter(m=>needsDate(m));
  const dated=sorted.filter(m=>!needsDate(m));
  const upcoming=dated.filter(m=>new Date(m.end||m.start).getTime()>=now);
  const past=dated.filter(m=>new Date(m.end||m.start).getTime()<now).reverse();
  if(!sorted.length) return <div className="mtg-empty">No meetings yet. Schedule one below.</div>;
  const Row=m=>(<div className={'mtg-row'+(m.status==='held'?' held':'')+(m.status==='noshow'?' noshow':'')+(needsDate(m)?' undated':'')} key={m.id}>
    <div className="mtg-when"><CalendarClock size={13}/>{needsDate(m)?<span className="mtg-undated">no date set</span>:fmtMeetingTime(m.start)}
      {m.location&&<span className="mtg-loc"><MapPin size={11}/>{m.location}</span>}</div>
    <div className="mtg-mid"><div className="mtg-title">{m.title}</div><div className="mtg-badges">
      <select className={'mtg-type'+(m.mtype?'':' unset')} value={m.mtype||''} onClick={e=>e.stopPropagation()} onChange={e=>onType&&onType(m,e.target.value)}>
        <option value="">+ type</option>{MEETING_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      {m.invited&&<span className="mtg-b"><UserPlus size={10}/>invited</span>}
      {m.meet&&(m.meetLink?<a className="mtg-b link" href={m.meetLink} target="_blank" rel="noreferrer"><Video size={10}/>Join</a>:<span className="mtg-b"><Video size={10}/>Meet</span>)}
      {m.htmlLink&&<a className="mtg-b link" href={m.htmlLink} target="_blank" rel="noreferrer"><Expand size={10}/>Calendar</a>}
    </div></div>
    {needsDate(m)
      ? <DateFix compact onSet={(v,mins)=>onTime&&onTime(m,v,mins)}/>
      : <div className="mtg-status">
          <button className={'ms-b held'+(m.status==='held'?' on':'')} title="It happened" onClick={()=>onStatus&&onStatus(m,'held')}><CheckCircle2 size={12}/>Held</button>
          <button className={'ms-b no'+(m.status==='noshow'?' on':'')} title="They didn't show" onClick={()=>onStatus&&onStatus(m,'noshow')}><X size={12}/>No-show</button>
        </div>}
    <button className="m-x" style={{width:28,height:28,flex:'none'}} title="Cancel + remove from calendar" onClick={()=>{if(window.confirm('Cancel this meeting and remove it from Google Calendar?'))onRemove(m);}}><X size={14}/></button>
  </div>);
  return (<div className="mtg-list">
    {undated.length>0&&<><div className="mtg-band undated">Needs a date · {undated.length}</div>{undated.map(Row)}</>}
    {upcoming.length>0&&<><div className="mtg-band">Upcoming · {upcoming.length}</div>{upcoming.map(Row)}</>}
    {past.length>0&&<><div className="mtg-band past">Past · {past.length}</div>{past.map(Row)}</>}
  </div>);
}
export function MLogRow({label,children}){
  return (<div style={{display:'flex',gap:8,marginTop:5,alignItems:'baseline'}}>
    <span style={{flex:'none',width:86,fontSize:10.5,fontWeight:800,letterSpacing:'.04em',
      textTransform:'uppercase',color:'#A6A2BC'}}>{label}</span>
    <span style={{flex:1,minWidth:0,fontSize:12.5,lineHeight:1.5,color:'#56527a'}}>{children}</span>
  </div>);
}
export function MeetingBlock({r}){
  const wants=r.wants||[],objections=r.objections||[],people=r.people||[];
  const commits=r.commitments||[];
  const ours=commits.filter(c=>c&&c.side!=='client'),theirs=commits.filter(c=>c&&c.side==='client');
  const ns=r.nextStep||{},bud=r.budget||{},tmp=r.temperature||{};
  const money=[bud.stated&&'budget '+bud.stated,bud.paying&&'paying '+bud.paying,bud.note].filter(Boolean).join(' · ');
  const t=MTEMP[tmp.read]||null;
  if(!wants.length&&!objections.length&&!people.length&&!ours.length&&!theirs.length
     &&!ns.what&&!money&&!t) return null;
  const commitText=c=>String(c.what||'')+(c.due?' (by '+c.due+')':'');
  return (<div style={{marginTop:8,paddingTop:8,borderTop:'1px solid rgba(43,77,224,.14)'}}>
    {wants.length>0&&<MLogRow label="Wants">
      {wants.map((w,i)=>(<span key={i}>{i?'  ·  ':''}{w.want}
        {w.quote?<i style={{opacity:.8}}> &ldquo;{w.quote}&rdquo;</i>:null}</span>))}
    </MLogRow>}
    {objections.length>0&&<MLogRow label="Held back">
      {objections.map((o,i)=>(<span key={i}>{i?'  ·  ':''}<b style={{color:'#3a3658'}}>{o.objection}</b>
        {o.detail?' — '+o.detail:''}</span>))}
    </MLogRow>}
    {!!money&&<MLogRow label="Money">{money}</MLogRow>}
    {ours.length>0&&<MLogRow label="We owe">{ours.map(commitText).join('  ·  ')}</MLogRow>}
    {theirs.length>0&&<MLogRow label="They owe">{theirs.map(commitText).join('  ·  ')}</MLogRow>}
    {people.length>0&&<MLogRow label="Who else">
      {people.map(x=>x.name+(x.role?' ('+x.role+')':'')+(x.influence==='decides'?' · decides':'')).join('  ·  ')}
    </MLogRow>}
    {!!ns.what&&<MLogRow label="Next">
      <b style={{color:'#3a3658'}}>{ns.what}</b>{ns.who?' — '+ns.who:''}{ns.when?' · '+ns.when:''}
    </MLogRow>}
    {t&&<MLogRow label="Read">
      <span className="pill" style={{background:t.bg,color:t.fg,marginRight:6}}>{t.label}</span>
      {tmp.why||''}
    </MLogRow>}
  </div>);
}
export function Modal({lead,isNew,settings,stages,addOption,me,myUid,allLeads,navList,onNav,convertToClient,revertClient,fixCloseTracking,toggleMilestone,setMilestoneDue,onClose,updateLead,addActivity,delActivity,delLead,createNew,gcalConnected,gcalEmail,createCalendarEvent,deleteCalendarEvent,tagMeeting,rep,isOwner,setCommission,users,teamRoster,events,mlogs,goEvents}){
  const _list=navList||[]; const _idx=isNew?-1:_list.indexOf(lead?.id);
  const prevId=_idx>0?_list[_idx-1]:null; const nextId=(_idx>=0&&_idx<_list.length-1)?_list[_idx+1]:null;
  const opt=settings.options; const customFields=settings.customFields||[];
  const blank={id:uid(),name:'',company:'',businessType:'—',phone:'',email:'',website:'',stage:stages[0].key,priority:'medium',source:'',nextAction:'Follow Up Call',nextSteps:'',followUp:'',expectedClose:'',serviceInterest:[],owner:me||BRAND.team[0]||'',dealValue:0,retainer:0,retainerActive:false,retainerStart:'',closedAt:'',isRelationship:false,introducedBy:'',relNote:'',relTier:'',meetings:[],custom:{},createdAt:new Date().toISOString(),activities:[]};
  const [draft,setDraft]=useState(isNew?blank:lead);
  /* 'Call', not 'Note'. The button that opens this says "Log a call, note or
     text" and then handed you a note, so logging the most common thing a rep
     does all day cost an extra click every single time.

     It is not only friction. REACHED_TYPES has 'Call' and not 'Note', and it
     drives touch counts, the untouched filter and the conversion ratio — so a
     call logged as a note is invisible to the numbers the rep is measured on.
     The default was quietly corrupting them.

     The new-lead composer below already defaults to 'Call' (firstType); this
     just stops the two disagreeing. */
  const [atype,setAtype]=useState('Call');const [atext,setAtext]=useState('');const [pendTags,setPendTags]=useState([]);const [kdLabel,setKdLabel]=useState('Birthday');const [kdDate,setKdDate]=useState('');const [who,setWho]=useState(me||BRAND.team[0]||'');const [feedFilter,setFeedFilter]=useState('All');const [composeOpen,setComposeOpen]=useState(false);
  const [wideFeed,setWideFeed]=useState(()=>{ try{return localStorage.getItem('pt_widefeed')==='1';}catch{return false;} });
  const [openSec,setOpenSec]=useState({});
  const [showMore,setShowMore]=useState(false);
  const [firstNote,setFirstNote]=useState('');
  const [logMtype,setLogMtype]=useState('Coffee');
  const [payAmt,setPayAmt]=useState('');const [payNote,setPayNote]=useState('');
  /* who can log a payment from the composer: owners always; reps only if the
     owner has switched it on for the install. */
  const canLogPayment=!rep||(settings&&settings.repPayments);
  const [firstType,setFirstType]=useState('Call');
  useEffect(()=>{if(!isNew&&lead)setDraft(lead);},[lead,isNew]);
  /* Escape closes. A full-viewport surface reads as a page, and Escape is what
     people press to leave one — the X moved a long way from where it sat on a
     960px card. Ignored while a text field has focus, or Escape would throw
     away a half-written note; the browser's own "revert this input" behaviour
     wins there. */
  useEffect(()=>{
    if(typeof window==='undefined') return;
    const h=e=>{
      if(e.key!=='Escape') return;
      const t=e.target||{}; const tag=(t.tagName||'').toUpperCase();
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||t.isContentEditable) return;
      onClose&&onClose();
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[onClose]);
  /* functional form so two set() calls in one tick compose instead of the second
     spreading a stale draft over the first */
  const set=patch=>{
    /* Moving to a nurture stage without a revisit date means the lead simply
       disappears: not in the pipeline, not lost, not in follow-ups. The date IS
       the feature, so it's asked for at the moment the stage changes. */
    /* ...unless the caller already supplied one — the one-tap button below sets
       its own date, and prompting after a single tap would defeat the point. */
    if(patch.stage&&patch.stage!==draft.stage&&sOf(patch.stage,stages).nurture&&!patch.followUp&&!draft.followUp){
      const d=new Date(); d.setMonth(d.getMonth()+3);
      const when=window.prompt(
        'When should this come back to you? (YYYY-MM-DD)\n\n'+
        'They said not right now, so they leave the pipeline. This date is the only thing that surfaces them again.',
        isoOf(d));
      if(when!==null){ const clean=String(when).trim().slice(0,10);
        if(/^\d{4}-\d{2}-\d{2}$/.test(clean)) patch={...patch,followUp:clean,
          nextAction:draft.nextAction||'Check back in — said not right now'}; }
    }
    setDraft(d=>({...d,...patch})); if(!isNew) updateLead(draft.id,patch); };
  /* One booking path, used by the Meetings section AND the activity log's
     Meeting Booked button. Always writes the meeting + the Booked activity, so
     it always reaches the dashboard numbers; the Google Calendar event is the
     part that can be absent. When the calendar isn't connected we skip the call
     entirely rather than throwing — the meeting is still real, it just isn't on
     a calendar, and the row says so instead of the booking failing outright. */
  /* every place already used, newest first — the scheduler turns these into
     one-tap chips so a regular coffee spot isn't retyped every week */
  const recentLocations=useMemo(()=>allMeetings(allLeads||[])
    .filter(r=>r.m.location).sort((a,b)=>(b.m.createdAt||'').localeCompare(a.m.createdAt||''))
    .map(r=>r.m.location),[allLeads]);
  /* Only a rep is ever shown this, but it is computed either way — a hook that
     runs conditionally is a hook that changes the render's hook count. */
  const calOwner=useMemo(()=>calendarOwner(teamRoster,users,gcalEmail),[teamRoster,users,gcalEmail]);
  /* REP PAY. The appointment fee follows WHOEVER SET IT, not the lead's owner —
   leads get reassigned and a rep must not lose a fee they earned because a lead
   moved. Stamped once, at creation, and never changed. */
  const doSchedule=async(m)=>{ let ev={eventId:'',htmlLink:'',meetLink:''};
    if(gcalConnected) ev=await createCalendarEvent(m);
    const meeting={id:uid(),eventId:ev.eventId,htmlLink:ev.htmlLink,meetLink:ev.meetLink,title:m.title,mtype:m.mtype||'Other',status:'',start:m.start,end:m.end,setBy:me,setById:myUid||'',invited:!!m.invited,meet:!!m.meet,notes:m.notes||'',location:m.location||'',createdAt:new Date().toISOString(),dateUnknown:false};
    const activity={id:uid(),ts:new Date().toISOString(),type:'Booked',mtype:m.mtype||'Other',meetingId:meeting.id,text:`${m.mtype||'Meeting'} booked: ${m.title} — ${fmtDate(m.start)}`,who:me};
    set({meetings:[...(draft.meetings||[]),meeting],activities:[activity,...(draft.activities||[])],
      ...(m.saveEmail?{email:m.saveEmail}:{})}); return meeting; };
  /* the escape hatch: a meeting you know about but haven't pinned a time to.
     Lands in Needs a date, exactly where the dated-meeting fix puts them. */
  const doLogUndated=({mtype,title,notes})=>{ const now=new Date().toISOString(); const mid=uid();
    const meeting={id:mid,title:title||`${mtype} with ${draft.name||draft.company||'lead'}`,mtype:mtype||'Other',
      start:now,end:now,status:'',who:me,setBy:me,setById:myUid||'',createdAt:now,logged:true,dateUnknown:true,notes:notes||''};
    const activity={id:uid(),ts:now,type:'Booked',mtype:mtype||'Other',meetingId:mid,
      text:`${mtype||'Meeting'} booked${notes?': '+notes:''} — no date set yet`,who:me};
    set({meetings:[...(draft.meetings||[]),meeting],activities:[activity,...(draft.activities||[])]}); };
  /* cancelling is not deleting: the meeting leaves the count and the calendar,
     the history of having booked it stays and is marked cancelled. */
  const doRemove=async(mt)=>{ await deleteCalendarEvent(mt.eventId);
    const acts=(draft.activities||[]).map(a=>(a.meetingId===mt.id&&a.type==='Booked')?{...a,cancelled:true}:a);
    const note={id:uid(),ts:new Date().toISOString(),type:'Meeting',
      text:`Cancelled: ${mt.title||mt.mtype||'meeting'}${mt.start&&!datelessOf(mt)?` — ${fmtMeetingTime(mt.start)}`:''}`,who:me};
    set({meetings:(draft.meetings||[]).filter(x=>x.id!==mt.id),activities:[note,...acts]}); };
  /* did it actually happen? booked is a promise, held is the result. */
  /* REP PAY. Marking held used to be neutral bookkeeping; with an appointment
     fee attached it is a CLAIM FOR MONEY, so the record carries who said so and
     when. Cleared when the mark is removed, or a corrected status would leave
     evidence behind for a fee that no longer exists. */
  const doStatus=(mt,status)=>{ const on=mt.status!==status; const now=new Date().toISOString();
    const next=(draft.meetings||[]).map(x=>x.id===mt.id?{...x,status:on?status:'',
      ...(status==='held'?(on?{heldBy:me,heldById:myUid||'',heldAt:now}:{heldBy:'',heldById:'',heldAt:''}):{})}:x);
    const was=(draft.meetings||[]).find(x=>x.id===mt.id); const flip=was&&was.status===status;
    const act=flip?null:{id:uid(),ts:new Date().toISOString(),type:'Meeting',text:`${status==='held'?'Met':'No-show'}: ${mt.title}`,who:me};
    set(act?{meetings:next,activities:[act,...(draft.activities||[])]}:{meetings:next}); };
  /* same job as setMeetingTime on the dashboard, against the modal's draft */
  const doTime=(mt,startLocal,mins)=>{ const d0=new Date(startLocal); if(!startLocal||isNaN(d0))return;
    const pad=n=>String(n).padStart(2,'0');
    const loc=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    const start=loc(d0), end=loc(new Date(d0.getTime()+(num(mins)||30)*60000));
    const next=(draft.meetings||[]).map(x=>x.id===mt.id?{...x,start,end,dateUnknown:false}:x);
    const act={id:uid(),ts:new Date().toISOString(),type:'Note',meetingId:mt.id,text:`Dated: ${mt.title||mt.mtype||'meeting'} — ${fmtMeetingTime(start)}`,who:me};
    set({meetings:next,activities:[act,...(draft.activities||[])]}); };
  const setCustom=(id,v)=>set({custom:{...(draft.custom||{}),[id]:v}});
  const toggleSvc=s=>{const cur=draft.serviceInterest||[];set({serviceInterest:cur.includes(s)?cur.filter(x=>x!==s):[...cur,s]});};
  const addCustomAction=()=>{const v=window.prompt('New Next Action:');if(v&&v.trim()){addOption('nextAction',v.trim());set({nextAction:v.trim()});}};
  const addCustomSvc=()=>{const v=window.prompt('New Service Interest:');if(v&&v.trim()){addOption('service',v.trim());toggleSvc(v.trim());}};
  /* THE FOLLOW-UP BLOCK, DEFINED ONCE.
     It used to exist twice — "Follow-up date" here and "Follow-up Date" in the
     create form's extra details — the same field, the same write path, two
     labels. That is the one duplication this redesign was allowed to collapse.
     Rendered in both places from this definition, so they cannot drift again.

     The presets write followUp through the same set() every other control uses.
     No new field, no new calculation: "in 3 days" is a date, and this is the
     date picker with the four answers people actually give. */
  const fuPreset=(label,days)=>{
    const d=new Date(); d.setDate(d.getDate()+days);
    return (<button key={label} type="button" className="fu-chip"
      onClick={()=>set({followUp:isoOf(d)})}>{label}</button>);
  };
  const FollowUpBlock=()=>(<div className="fu-block">
    <div className="fu-set">
      {[['Tomorrow',1],['+3 days',3],['Next week',7],['+2 weeks',14]].map(([l,n])=>fuPreset(l,n))}
      {draft.followUp&&<button type="button" className="fu-chip clear"
        onClick={()=>set({followUp:''})}>Clear</button>}
    </div>
    <div className="fgrid">
      {F({label:'Follow-up date',k:'followUp',type:'date'})}
      <div className="field"><label>Next action</label><select value={draft.nextAction} onChange={e=>set({nextAction:e.target.value})}>{opt.nextAction.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
    </div>
    <div className="field full" style={{marginTop:10}}>
      <label>What to do on this follow-up</label>
      <textarea className="fu-note" rows={2} placeholder="e.g. Ask about their listing site — he said call back after the 15th" value={draft.nextSteps||''} onChange={e=>set({nextSteps:e.target.value})}/>
    </div>
    {draft.followUp&&<div className={'fu-when'+(daysUntil(draft.followUp)<0?' od':'')}>{daysUntil(draft.followUp)<0?`${Math.abs(daysUntil(draft.followUp))} days overdue`:daysUntil(draft.followUp)===0?'Due today':`Due in ${daysUntil(draft.followUp)} days`} · {fmtDate(draft.followUp)}</div>}
  </div>);
  const F=({label,k,type,full})=>(<div className={'field'+(full?' full':'')}><label>{label}</label><input type={type||'text'} value={draft[k]??''} onChange={e=>set({[k]:e.target.value})}/></div>);
  const dealSum=d=>num(d.setup)+num(d.website)+num(d.integration)+(d.extras||[]).reduce((a,e)=>a+num(e.amount),0);
  /* MULTI-DEAL MODEL. A client can have several deals running at once.
     draft.deals is the array of OPEN deals; dealValue stays as their sum so
     every existing metric (commission, forecast, funnel) keeps working.
     Legacy single-deal records (draft.deal) are migrated on read. */
  const openDeals=(()=>{
    if(Array.isArray(draft.deals)) return draft.deals;
    if(draft.deal&&typeof draft.deal==='object'&&dealSum(draft.deal)>0)
      return [{id:'d_legacy',label:'Deal',setup:draft.deal.setup??'',website:draft.deal.website??'',integration:draft.deal.integration??'',extras:Array.isArray(draft.deal.extras)?draft.deal.extras:[]}];
    if(num(draft.dealValue)>0) return [{id:'d_legacy',label:'Deal',setup:draft.dealValue,website:'',integration:'',extras:[]}];
    return [];
  })();
  const openDealsTotal=openDeals.reduce((a,d)=>a+dealSum(d),0);
  /* write the whole deals array + keep dealValue = sum of open deals */
  const writeDeals=next=>set({deals:next,dealValue:next.reduce((a,d)=>a+dealSum(d),0)});
  const updateDeal=(id,patch)=>writeDeals(openDeals.map(d=>d.id===id?{...d,...patch}:d));
  const addDeal=()=>{ const label=window.prompt('Name this deal (e.g. "Website build", "Q3 advisory"):','Deal '+(openDeals.length+1)); if(label===null) return;
    writeDeals([...openDeals,{id:uid(),label:label.trim()||('Deal '+(openDeals.length+1)),setup:'',website:'',integration:'',extras:[],
      addedAt:new Date().toISOString(), upsell:!!draft.isClient}]); };
  const removeDeal=id=>{ if(!window.confirm('Remove this open deal? Nothing is archived.')) return; writeDeals(openDeals.filter(d=>d.id!==id)); };
  /* One patch, not three. Removing the deal, archiving it and logging the note
     are a single event and have to land together — done separately, whichever
     write went last rebuilt the lead from the same stale draft and undid the
     others, so the note appeared and the deal never moved. */
  const closeDeal=d=>{ const amount=dealSum(d); if(amount<=0){ window.alert('Add a dollar amount before closing this deal.'); return; }
    const closed={id:uid(),label:d.label||'Deal',amount,deal:{...d},closedAt:todayISO(),by:me};
    const nextOpen=openDeals.filter(x=>x.id!==d.id);
    /* Winning work from somebody who is already a client means a NEW build. The
       checklist is one object on the lead, so the finished build's record is
       archived onto the deal that paid for it before a fresh one is seeded —
       the ticks and dates from the last project are kept, not overwritten. It
       is asked, never assumed: not every deal is a build. */
    let rebuild={};
    if(draft.isClient){
      const prev=draft.onboarding||{};
      const doneCount=Object.values(prev).filter(x=>x&&x.done).length;
      const start=window.confirm(
        `Start a new build for ${draft.company||draft.name||'this client'}?\n\n`+
        (doneCount?`Their current checklist (${doneCount} item${doneCount===1?'':'s'} done) will be archived on this deal, and a fresh one starts at Intake.`
                  :'A fresh checklist starts at Intake.')+
        `\n\nCancel closes the deal without touching the checklist.`);
      if(start){
        closed.onboarding=prev; closed.clientPhase=draft.clientPhase||'';
        /* client phases are objects with .key — CLIENT_PHASES is the array-shaped
           legacy constant and indexing this one the same way wrote undefined */
        rebuild={onboarding:seedOnboarding(),clientPhase:(stdPhases(settings)[0]||{}).key||'intake'};
      }
    }
    /* stamped here because updateLead's generic dealValue audit is skipped for a
       deal close — the trail still needs a name and a time against it */
    const note={id:uid(),ts:new Date().toISOString(),type:'Note',
      text:`Deal closed: ${closed.label} — ${usd(amount)}${isUpsellDeal(d)?' (client upsell)':''}`,who:me};
    set({ deals:nextOpen,
          dealValue:nextOpen.reduce((a,x)=>a+dealSum(x),0),
          dealValueBy:me, dealValueAt:new Date().toISOString(),
          closedDeals:[...(draft.closedDeals||[]),closed],
          ...rebuild,
          activities:[...(rebuild.onboarding?[{id:uid(),ts:new Date().toISOString(),type:'Note',
            text:`New build started: ${closed.label}. Previous checklist archived.`,who:me}]:[]),
            note,...(draft.activities||[])] }); };
  const Sel=({label,k,opts})=>(<div className="field"><label>{label}</label><select value={draft[k]} onChange={e=>set({[k]:e.target.value})}>{opts.map(o=>typeof o==='string'?<option key={o} value={o}>{o||'—'}</option>:<option key={o.v} value={o.v}>{o.l}</option>)}</select></div>);
  /* collapsible section. called as a function (not <Sec/>) so inputs inside
     never remount and lose focus while typing. */
  /* one-tap access: open a section and bring it into view. Clicking a header
     fact or a jump chip lands you on the right block with no scrolling. */
  const jumpTo=k=>{ setOpenSec(o=>({...o,[k]:true}));
    setTimeout(()=>{ const el=document.getElementById('msec-'+k); if(el&&el.scrollIntoView) el.scrollIntoView({behavior:'smooth',block:'start'}); },70); };
  const Sec=(k,icon,title,summary,body,defOpen)=>{
    const isOpen=openSec[k]??!!defOpen;
    return (<div className={'msec'+(isOpen?' open':'')} id={'msec-'+k} key={k}>
      <div className="msec-h" onClick={()=>setOpenSec(o=>({...o,[k]:!isOpen}))}>
        <span className="msec-t">{icon}{title}</span>
        {!isOpen&&summary?<span className="msec-s">{summary}</span>:null}
        <ChevronDown size={15} className="msec-ch"/>
      </div>
      {isOpen&&<div className="msec-b">{body}</div>}
    </div>);
  };
  const logIt=()=>{
    const t=atext.trim()||(atype==='Booked'?`${logMtype} booked.`:''); if(!t)return;
    const tags=[...pendTags];
    if(atype==='Booked'){
      /* a logged meeting IS a meeting — create the record so it shows up with a
         Held/No-show control, not just a line in the activity feed. It has no
         real date though: start is only the moment this was typed. dateUnknown
         says so out loud, which keeps it out of Upcoming (where it would sit
         for all of zero seconds) and out of Needs status (where it would turn
         up overdue a minute later). It lands in Needs a date instead. */
      const mid=uid(); const now=new Date().toISOString();
      const meeting={id:mid,title:`${logMtype} with ${draft.name||'lead'}`,mtype:logMtype,start:now,end:now,status:'',who,setBy:me,setById:myUid||'',createdAt:now,logged:true,dateUnknown:true};
      const act={id:uid(),ts:now,type:'Booked',mtype:logMtype,meetingId:mid,text:stripTagText(t,tags)||t,who,...(tags.length?{tags}:{})};
      const patch={meetings:[...(draft.meetings||[]),meeting],activities:[act,...(draft.activities||[])]};
      setDraft(d=>({...d,...patch})); updateLead(draft.id,patch);
    } else {
      /* tags ride WITH the activity — a separate write would race it, and the
         note would land tagged for nobody (see the v7 stale-write notes) */
      addActivity(draft.id,atype,stripTagText(t,tags)||t,who,tags.length?{tags}:undefined);
    }
    setAtext(''); setPendTags([]); setComposeOpen(false);
  };
  /* log a payment straight from the composer — same payments[] the deal panel
     reads, so paid / remaining update everywhere at once. ONE write: the payment
     and its activity go together, or the second write clobbers the first from a
     stale `leads` closure. */
  const logPaymentFromComposer=()=>{
    const amount=num(payAmt); if(amount<=0){ window.alert('Enter a payment amount.'); return; }
    const note=payNote.trim();
    const pay={id:uid(),amount,date:todayISO(),note};
    const pays=Array.isArray(draft.payments)?draft.payments:[];
    const act={id:uid(),ts:new Date().toISOString(),type:'Payment',text:`Payment received: ${usdc(amount)}${note?` — ${note}`:''}`,who};
    const patch={payments:[...pays,pay],activities:[act,...(draft.activities||[])]};
    setDraft(d=>({...d,...patch})); updateLead(draft.id,patch);
    setPayAmt(''); setPayNote('');
  };
  const create=()=>{
    if(!draft.name.trim()){window.alert('Add a name first.');return;}
    const ts=new Date().toISOString();
    const acts=[{id:uid(),ts,type:'Note',text:'Lead created.',who}];
    if(firstNote.trim()) acts.unshift({id:uid(),ts,type:firstType,text:firstNote.trim(),who});
    createNew({...draft,activities:acts});
  };
  /* Client meeting logs read through onto the lead — DERIVED, never copied,
     the same rule sponsorshipsOf follows. Editing or re-running a log updates
     what shows here for free, and deleting it takes the row with it.

     `mlogs` is owner-only at the database, so a rep gets an empty array and
     these rows simply do not exist for them. That is the whole visibility
     model: Postgres decides, not a hidden div.

     They are DISPLAY-ONLY. Nothing here feeds touch counts, REACHED_TYPES or
     the untouched filter — those keep reading `activities` alone, so every
     role counts the same lead identically (ENGINEERING §2). */
  const logRows=useMemo(()=>isNew?[]:meetingLogsOf(lead,mlogs||[]),[lead,mlogs,isNew]);
  const feed=useMemo(()=>{
    const acts=(isNew?[]:(lead?.activities||[])).filter(a=>feedFilter==='All'||a.type===feedFilter);
    /* only under All: the type chips count activities, and a derived row is
       not one — showing them under a chip would make its count read wrong */
    if(feedFilter!=='All'||!logRows.length) return acts;
    return [...acts,...logRows].sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||'')));
  },[lead,isNew,feedFilter,logRows]);
  /* WHICH NOTES THE APP WROTE ABOUT ITSELF.
     Eighteen distinct texts are written by the CRM rather than by a person —
     "Stage moved: …", "Follow-up cleared.", "Payment confirmed …" and the rest.
     They are real history and are never hidden; they are just not what anyone
     opens a lead to read, and on a lead worked for a month they arrive in runs
     that push the actual conversation off the screen.

     PRESENTATION ONLY. This changes which rows are collapsed together, nothing
     else: not what is stored, not any count. The Notes chip and the contact
     tally are still inflated by these, which is a separate and real bug —
     written up in TOUCH-COUNT-FINDING.md and deliberately not fixed here. */
  const SYS_NOTE=/^(Lead created\.|Follow-up cleared\.|Follow-up done —|Stage moved:|Deal value set to|Phase →|Close date set to|Commission approved|Commission voided|Converted to client|Signed — onboarding|Reverted to lead|Invoice |Payment confirmed |Payment marked as not collected|Deal closed:|New build started:|Sponsorship logged:|Dated:)/;
  const isSysNote=a=>!!a&&a.type==='Note'&&!a.derived&&SYS_NOTE.test(String(a.text||''));
  /* Runs of them collapse into one line. A single one is left alone — hiding
     it behind a disclosure would cost a click to read one sentence. */
  const feedRuns=useMemo(()=>{
    const out=[]; let run=[];
    const flush=()=>{ if(!run.length) return;
      out.push(run.length>1?{kind:'sysrun',items:run,id:'run-'+run[0].id}:{kind:'row',a:run[0],id:run[0].id});
      run=[]; };
    for(const a of feed){
      if(isSysNote(a)){ run.push(a); continue; }
      flush(); out.push({kind:'row',a,id:a.id});
    }
    flush();
    return out;
  },[feed]);
  const [openRuns,setOpenRuns]=useState({});
  const noteCount=(lead?.activities||[]).filter(a=>a.type==='Note').length;
  /* How much contact there has actually been, by type. The filter chips already
     existed but only Notes carried a count — so the answer to "how many times
     have we spoken" was to click each chip and count rows by eye. */
  const touch=useMemo(()=>{
    const acts=(lead?.activities||[]);
    const by={}; ACT_TYPES.forEach(t=>by[t.key]=0);
    let first='',last='';
    acts.forEach(a=>{ if(by[a.type]!==undefined) by[a.type]++;
      const d=String(a.ts||'').slice(0,10); if(!d) return;
      if(!first||d<first) first=d; if(!last||d>last) last=d; });
    /* "Lead created." is written by the system, not by you — counting it as a
       note would mean every lead claims one touch it never had. */
    const sysNotes=acts.filter(a=>a.type==='Note'&&/^Lead created\.$/.test(a.text||'')).length;
    by.Note=Math.max(0,by.Note-sysNotes);
    const spoken=(by.Call||0)+(by.Meeting||0)+(by.Booked||0);
    const total=Object.values(by).reduce((x,y)=>x+y,0);
    return {by,first,last,total,spoken};
  },[lead]);
  /* `lead` is what widens this to the full viewport; every other modal in the
     app keeps the 960px card. Structure below is untouched — this PR moves no
     element and renames no class. */
  return (<div className="scrim2 lead" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal lead" onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head">
        <div style={{minWidth:0}}>
          <h2>{draft.name||draft.company||'New Lead'}</h2>{!isNew&&<div className="co">{[draft.company,draft.businessType].filter(Boolean).join(' · ')}</div>}
          {!isNew&&<div className="meta">Added {fmtDate(draft.createdAt)} · Last contact {fmtDate(lastContact(draft))}</div>}
          {!isNew&&<div className="qa">
            <StageBadge k={draft.stage} stages={stages}/><PriBadge p={draft.priority}/>
            {draft.phone&&<a className="qbtn" href={`tel:${draft.phone}`}><Phone size={12}/>Call</a>}
            {draft.phone&&<a className="qbtn" href={`sms:${draft.phone}`}><MessageSquare size={12}/>Text</a>}
            {draft.email&&<a className="qbtn" href={`mailto:${draft.email}`}><Mail size={12}/>Email</a>}
            {draft.website&&<a className="qbtn" href={draft.website.startsWith('http')?draft.website:'https://'+draft.website} target="_blank" rel="noreferrer"><Globe size={12}/>Site</a>}
          </div>}
        </div>
        <div className="m-headright">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {!isNew&&_list.length>1&&<>
              <button className="m-x" disabled={!prevId} onClick={()=>prevId&&onNav(prevId)} title="Previous lead"><ChevronLeft size={18}/></button>
              <span style={{fontSize:12,fontWeight:600,color:'#928DAD',minWidth:46,textAlign:'center'}}>{_idx+1} / {_list.length}</span>
              <button className="m-x" disabled={!nextId} onClick={()=>nextId&&onNav(nextId)} title="Next lead"><ChevronRight size={18}/></button>
            </>}
            <button className="m-x" onClick={onClose}><X size={18}/></button>
          </div>
          {!isNew&&(()=>{ const bc=bookedCount(draft);
            const next=[...(draft.meetings||[])].filter(mt=>new Date(mt.end||mt.start).getTime()>=Date.now()).sort((a,b)=>(a.start||'').localeCompare(b.start||''))[0];
            const st=sOf(draft.stage,stages);
            const facts=[
              {k:'stage', l:'Stage',    v:st.label||'—', dot:st.color},
              {k:'pri',   l:'Priority', v:(PRIORITIES[draft.priority]||{}).label||'—',
                dot:(PRIORITIES[draft.priority]||{}).color},
              {k:'qual',  l:'Source',   v:draft.source||'—'},
              {k:'qual',  l:'Owner',    v:draft.owner||'—'},
              {k:'qual',  l:'Type',     v:draft.businessType&&draft.businessType!=='—'?draft.businessType:'—'},
              {k:'qual',  l:'Close',    v:draft.expectedClose?fmtDate(draft.expectedClose):'—'},
              /* REP-AUDIT #14, same rule in the modal: theirs yes, the pool's
                 not until they claim it. */
              (rep&&isPoolLead(draft))?null:{k:'deal',l:'Deal',v:num(draft.dealValue)>0?usd(draft.dealValue):'—'},
              (rep&&cmsnOf(draft))?{k:'mycmsn',l:'Your cut',v:usd(cmsnOf(draft).amount)}:null,
              {k:'meetings',l:'Meetings',v:next?fmtDate(next.start):(bc?bc+' booked':'—'),hot:!!next},
            ].filter(Boolean);
            /* Stage and Priority are pickers, not jump links — they're the two
               things you change most and they were buried in the form below. */
            return (<div className="m-facts">{facts.map((f,i)=>{
              if(f.k==='stage') return (<label key={i} className="mf mf-sel">
                <i>Stage</i>
                <span className="mf-v"><em style={{background:f.dot}}/>{f.v}</span>
                <select value={draft.stage} onChange={e=>set({stage:e.target.value})}>
                  {stages.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
                </select></label>);
              if(f.k==='pri') return (<label key={i} className="mf mf-sel">
                <i>Priority</i>
                <span className="mf-v"><em style={{background:f.dot}}/>{f.v}</span>
                <select value={draft.priority||'medium'} onChange={e=>set({priority:e.target.value})}>
                  {Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select></label>);
              return (<button key={i} className={'mf'+(f.hot?' hot':'')} onClick={()=>jumpTo(f.k)} title={`Open ${f.k==='qual'?'Qualifying':f.k==='deal'?'Deal':'Meetings'}`}>
                <i>{f.l}</i><b>{f.v}</b>
              </button>);})}</div>);
          })()}
        </div>
      </div>
      {!isNew&&<div className="m-jump">
        <span className="mj-l">Jump to</span>
        {[['meetings','Meetings',CalendarCheck,bookedCount(draft)||''],
          ['qual','Qualifying',SlidersHorizontal,''],
          ['svc','Service',Target,(draft.serviceInterest||[]).length||''],
          ['type','Intro',Users,''],
          ['deal','Deal',DollarSign,'']].map(([k,label,Ic,badge])=>(
          <button key={k} className={'mj'+(openSec[k]?' on':'')} onClick={()=>jumpTo(k)}><Ic size={13}/>{label}{badge!==''&&<i>{badge}</i>}</button>
        ))}
      </div>}
      {/* THREE COLUMNS, IN THE ORDER THE WORK HAPPENS.
          prep · history · record. The old two-column split put a contact form
          on the left and squeezed the activity log into the right — proportions
          that made sense at 960px and became a form with a lot of empty space
          beside a compressed feed once the surface went full width. History is
          what this screen is opened for, so it takes the middle and all the
          slack; the two rails are fixed and narrow. */}
      <div className={'m-grid lead3'+(wideFeed?' wide':'')}>
        {/* ---------- PREP: what you need before you call ---------- */}
        {!isNew&&<div className="m-prep">
          <div className="dh"><Bell size={13}/>Follow-up</div>
          <FollowUpBlock/>
          {touch.total>0&&<>
            <div className="dh mt"><MessageSquare size={13}/>Contact so far</div>
            <div className="touchbar prep">
              <b>{touch.spoken>0?`${touch.spoken} conversation${touch.spoken===1?'':'s'}`:'No calls or meetings yet'}</b>
              <span>
                {[['Call','call'],['Text','text'],['Meeting','meeting'],['Booked','booked'],['Email','email']]
                  .filter(([k])=>touch.by[k]>0)
                  .map(([k,w])=>`${touch.by[k]} ${w}${touch.by[k]===1?'':'s'}`).join(' · ')||'notes only'}
              </span>
              {touch.first&&<em>since {fmtDate(touch.first)}</em>}
            </div>
          </>}
        </div>}
        <div className="m-right">
          {isNew?<div className="empty">Save the lead to start logging activity.</div>:<>
            {/* Follow Up Boss, HubSpot and Salesforce all treat the timeline as
                the primary object, not a side rail — because reading history is
                what you open a contact for. A two-column split can never give
                the feed more than half the window, so this lets it take the
                whole modal on demand and remembers the choice. */}
            <div className="dh"><MessageSquare size={13}/>Activity Log
              <button className="feed-wide" title={wideFeed?'Back to split view':'Give the log the full window'}
                onClick={()=>{ setWideFeed(!wideFeed); try{localStorage.setItem('pt_widefeed',wideFeed?'0':'1');}catch{} }}>
                {wideFeed?<><Minimize2 size={12}/>Split</>:<><Maximize2 size={12}/>Expand</>}
              </button>
            </div>
            {/* A one-line answer to "how much have we actually talked", above
                the fold. The composer used to fill the whole panel and push the
                history out of sight, which is the opposite of what you open a
                lead to see. */}
            {/* the contact tally moved to the prep rail — it is something you
                read BEFORE calling, not part of the history you scroll */}
            {/* One tap for the most common cold-call outcome. Logs the call,
                parks the lead out of the pipeline, and books the revisit — all
                in ONE patch, because three separate writes in a tick overwrite
                each other (see the v7 stale-write notes). */}
            {!sOf(draft.stage,stages).nurture&&!sOf(draft.stage,stages).won&&(()=>{
              const days=nurtureDaysOf(settings);
              const park=()=>{
                const d=new Date(); d.setDate(d.getDate()+days);
                const back=isoOf(d);
                const ts=new Date().toISOString();
                set({ stage:(stages.find(x=>x.nurture)||{}).key||draft.stage,
                  followUp:back,
                  nextAction:'Check back in — said not right now',
                  activities:[
                    {id:uid(),ts,type:'Call',text:`Not interested right now. Parked until ${fmtDate(back)}.`,who:me},
                    ...(draft.activities||[])] });
              };
              return (<button className="notnow" onClick={park}>
                <Clock size={13}/>Not right now
                <span>logs the call · revisit {fmtDate((()=>{const d=new Date();d.setDate(d.getDate()+days);return isoOf(d);})())}</span>
              </button>);
            })()}
            {/* collapsed to a single row until you actually want to write
                something — the feed is what you came for */}
            {!composeOpen&&!isNew&&<button className="compose-open" onClick={()=>setComposeOpen(true)}>
              <Plus size={14}/>Log a call, note or text</button>}
            {(composeOpen||isNew)&&<>
            <div className="act-types">{ACT_TYPES.map(({key,icon:Ic})=><button key={key} className={'act-t '+(atype===key?'on':'')+(key==='Booked'?' booked':'')} onClick={()=>setAtype(key)}><Ic size={12}/>{actLabel(key)}</button>)}
              {canLogPayment&&<button className={'act-t pay'+(atype==='Payment'?' on':'')} onClick={()=>setAtype('Payment')}><DollarSign size={12}/>Payment</button>}
            </div>
            {atype==='Booked'
              ? <div className="bookc"><MeetingScheduler lead={draft} gcalConnected={gcalConnected} gcalEmail={gcalEmail} rep={rep} calOwner={calOwner}
                  onSchedule={doSchedule} onLogUndated={doLogUndated} recentLocations={recentLocations}/></div>
              : null}
            {atype==='Payment'
              ? <div className="pay-compose">
                  <div className="pay-compose-row">
                    <div className="pc-amt"><span>$</span><input type="number" inputMode="decimal" placeholder="0.00" value={payAmt} onChange={e=>setPayAmt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')logPaymentFromComposer();}}/></div>
                    <input className="pc-note" placeholder="Note (e.g. Square deposit)" value={payNote} onChange={e=>setPayNote(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')logPaymentFromComposer();}}/>
                  </div>
                </div>
              : atype==='Booked' ? null
              : <textarea className="act-input" placeholder={`Log a ${atype.toLowerCase()}… (saved with today's date)`} value={atext} onChange={e=>setAtext(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))logIt();}}/>}
            {/* Who needs to see this. Names come from crm_team(), so it can't
                drift from who actually has a login.
                It used to come from `users`, which RLS narrows to a REP'S OWN
                ROW — so for a rep the list was [me], minus me, empty, and the
                whole control returned null. A rep has never been able to tag
                anybody, which is the one thing REP-AUDIT #3 says is most worth
                their while. crm_team() carries names and roles and no money.
                Falls back to `users` then BRAND.team so an install without
                TEAM-MIGRATION.sql behaves exactly as it does today. */}
            {(()=>{ const roster=(teamRoster&&teamRoster.length?teamRoster.map(u=>u.name)
                : (users&&users.length?users.filter(u=>u.active!==false).map(u=>u.name):BRAND.team))
                .filter(n=>n&&n!==me);
              const team=[...new Set(roster)];
              if(!team.length) return null;
              return (<div className="tagpick">
                <span>Tag</span>
                {team.map(n=>(<button key={n} type="button"
                  className={'tagchip'+(pendTags.includes(n)?' on':'')}
                  onClick={()=>setPendTags(t=>t.includes(n)?t.filter(x=>x!==n):[...t,n])}>
                  <AtSign size={11}/>{n}</button>))}
                {pendTags.length>0&&<span className="tagpick-n">shows on {pendTags.join(' and ')}{pendTags.length===1?"'s":"'"} dashboard</span>}
              </div>); })()}
            {atype!=='Booked'&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,gap:8}}>
              {rep
                ? <span className="subcell" style={{fontWeight:600}}>logging as {me}</span>
                : <select className="selctl" style={{padding:'7px 9px',fontSize:12.5}} value={who} onChange={e=>setWho(e.target.value)}>{(opt.owner||OWNERS).map(o=><option key={o} value={o}>{o}</option>)}</select>}
              {atype==='Payment'
                ? <button className="btn btn-g" style={{padding:'8px 16px'}} onClick={logPaymentFromComposer}><DollarSign size={14}/>Log Payment</button>
                : <button className="btn btn-p" style={{padding:'8px 16px'}} onClick={logIt}>Log {actLabel(atype)}</button>}
            </div>}
            </>}
            <div className="afilter" style={{marginTop:14}}>
              {/* every chip carries its count, so the filter row doubles as the
                  contact tally — one place, not two things to keep in sync */}
              <button className={feedFilter==='All'?'on':''} onClick={()=>setFeedFilter('All')}>All{touch.total?` (${touch.total})`:''}</button>
              <button className={feedFilter==='Note'?'on':''} onClick={()=>setFeedFilter('Note')}>Notes{noteCount?` (${noteCount})`:''}</button>
              {ACT_TYPES.filter(t=>t.key!=='Note').map(t=>{ const n=touch.by[t.key]||0;
                return (<button key={t.key} className={(feedFilter===t.key?'on':'')+(n?'':' none')}
                  onClick={()=>setFeedFilter(t.key)}>{actLabel(t.key)}{n?` (${n})`:''}</button>); })}
            </div>
            {/* A day heading whenever the date changes. Without it a long feed
                is one undifferentiated wall and you can't tell a call from
                yesterday from one in March without reading every timestamp. */}
            <div className="feed">{feedRuns.map((r,ri)=>{
              /* A RUN OF MACHINE NOTES, folded. Quiet by default and never
                 hidden: one tap opens every line in it, and the day heading is
                 still drawn so the timeline does not skip. */
              if(r.kind==='sysrun'){
                const open=!!openRuns[r.id];
                const rd=String(r.items[0].ts||'').slice(0,10);
                const rprev=ri>0?String((feedRuns[ri-1].a||feedRuns[ri-1].items[feedRuns[ri-1].items.length-1]).ts||'').slice(0,10):null;
                return (<Fragment key={r.id}>
                  {rd&&rd!==rprev&&<div className="fday">{dayLabel(rd)}</div>}
                  <button className={'sysrun'+(open?' open':'')} onClick={()=>setOpenRuns(o=>({...o,[r.id]:!open}))}>
                    <ChevronDown size={13} className="sysrun-ch"/>
                    <span><b>{r.items.length}</b> automatic {r.items.length===1?'note':'notes'}</span>
                    <em>{r.items[0].text}</em>
                  </button>
                  {open&&r.items.map(a=>{const T=ACT_TYPES.find(t=>t.key===a.type);const Ic=T?T.icon:StickyNote;
                    return (<div className="fitem note sys" key={a.id}>
                      <div className="fic"><Ic size={14}/></div>
                      <div style={{minWidth:0}}><div className="ftxt">{a.text}</div>
                        <div className="fmeta">{a.who?a.who+' · ':''}{actLabel(a.type)} · {fmtStamp(a.ts)}</div></div>
                      <button className="fdel" onClick={()=>delActivity(draft.id,a.id)}><Trash2 size={13}/></button>
                    </div>); })}
                </Fragment>);
              }
              const a=r.a; const T=ACT_TYPES.find(t=>t.key===a.type);const Ic=T?T.icon:StickyNote;
              const d=String(a.ts||'').slice(0,10);
              const pr=ri>0?feedRuns[ri-1]:null;
              const prevA=pr?(pr.a||pr.items[pr.items.length-1]):null;
              const prev=prevA?String(prevA.ts||'').slice(0,10):null;
              const head=d&&d!==prev?d:null;
              /* A meeting log, read through from its own table. Deliberately
                 not a .fitem: it is not an activity, it has no delete button
                 here (delete the log, not the row), and it must not be
                 mistaken for something a rep can see. */
              if(a.derived) return (<Fragment key={a.id}>
                {head&&<div className="fday">{dayLabel(head)}</div>}
                <div className="fitem" style={{background:'rgba(43,77,224,.04)',borderLeft:'2px solid #2B4DE0',paddingLeft:10,borderRadius:6}}>
                  <div className="fic"><FileText size={14}/></div>
                  <div style={{minWidth:0}}>
                    <div className="ftxt"><b>{a.title}</b>{a.headline?' — '+a.headline:''}</div>
                    {a.summary&&<div className="fmeta" style={{marginTop:4,lineHeight:1.55,whiteSpace:'normal'}}>{a.summary}</div>}
                    <MeetingBlock r={a}/>
                    <div className="fmeta" style={{marginTop:6}}>
                      Meeting log · {a.source}{a.attendees.length?' · '+a.attendees.join(', '):''} · {fmtStamp(a.ts)}
                      {' · '}<span style={{color:a.published?'#2B4DE0':'#8b88a0',fontWeight:600}}>
                        {a.published?'a line is on this lead':'owner only'}</span>
                    </div>
                  </div>
                </div>
              </Fragment>);
              return (<Fragment key={a.id}>
              {head&&<div className="fday">{dayLabel(head)}</div>}
              <div className={'fitem'+(a.type==='Note'?' note':'')}>
              <div className="fic"><Ic size={14}/></div><div style={{minWidth:0}}><div className={'ftxt'+(a.cancelled?' cancelled':'')}>{a.text}{a.cancelled&&<span className="fcancel">cancelled</span>}
          {tagsOn(a).map(n=>{ const done=tagCleared(a).includes(n);
            return (<span key={n} className={'ftag'+(done?' done':'')}
              title={done?`${n} cleared this`:(n===me?'Tap to clear':`Waiting on ${n}`)}
              onClick={e=>{ e.stopPropagation(); if(n!==me) return;
                const next=done?tagCleared(a).filter(x=>x!==n):[...tagCleared(a),n];
                set({activities:(draft.activities||[]).map(x=>x.id===a.id?{...x,tagsDone:next}:x)}); }}>
              <AtSign size={10}/>{n}{done?' ✓':''}</span>); })}</div><div className="fmeta">{a.who?a.who+' · ':''}{actLabel(a.type)} · {fmtStamp(a.ts)}</div></div>
              <button className="fdel" onClick={()=>delActivity(draft.id,a.id)}><Trash2 size={13}/></button></div></Fragment>);})}
              {!feedRuns.length&&<div className="empty" style={{padding:'18px 0'}}>{feedFilter==='All'?'No activity yet. Log your first touch above.':`No ${feedFilter.toLowerCase()} entries yet.`}</div>}</div>
            {/* pinned under the feed, never scrolls, never grows */}
            <div className="m-danger">{rep
              ? (()=>{ const lost=(stages||[]).find(x=>x.lost);
                  return lost&&draft.stage!==lost.key
                    ? <><button className="btn btn-g" onClick={()=>{ if(window.confirm(`Mark ${draft.name||'this lead'} as ${lost.label}? Nothing is deleted — an owner can bring it back.`)) set({stage:lost.key}); }}><Ban size={15}/>Mark {lost.label}</button>
                        <div className="subcell" style={{marginTop:8}}>Leads are never deleted — mark it {lost.label.toLowerCase()} and it stays on the record.</div></>
                    : <div className="subcell">Only an owner can delete a lead. Nothing here is ever lost.</div>; })()
              : <button className="btn btn-d" onClick={()=>{if(window.confirm('Delete this lead permanently?'))delLead(draft.id);}}><Trash2 size={15}/>Delete lead</button>}</div>
          </>}
        </div>
        <div className="m-left">
          {/* ---------- 1. CONTACT — always first, always open ---------- */}
          <div className="dh"><Contact2 size={13}/>{isNew?'New lead':'Contact'}</div>
          <div className="fgrid">
            {F({label:'Name',k:'name'})}{F({label:'Company',k:'company'})}
            {F({label:'Phone',k:'phone',type:'tel'})}{F({label:'Email',k:'email',type:'email'})}
            {F({label:'Website',k:'website',full:true})}
            {/* Who they are, for reaching a whole group at once. Add-new writes
                straight into settings so the next person gets the same list. */}
            {/* Birthdays and anniversaries. Kept separate from the follow-up
                date, which is a one-off task — these recur every year and need
                the NEXT occurrence, not a date twenty years past. */}
            <div className="field full"><label>Birthdays &amp; key dates</label>
              {keyDatesOf(draft).length>0&&<div className="kd-list">
                {keyDatesOf(draft).map(d=>{ const days=daysToDate(d.date,d.annual!==false);
                  const yrs=d.annual!==false?yearsAt(d.date,true):null;
                  const soon=days!==null&&days<=(num(d.lead)||DATE_LEAD_DEFAULT);
                  return (<div className={'kd-row'+(soon?' soon':'')} key={d.id}>
                    <span className="kd-l">{d.label}</span>
                    <span className="kd-d">{fmtDate(d.date)}
                      {days===0?<b> · today</b>:days!==null?<b> · in {days}d</b>:null}
                      {yrs?<em> · turns {yrs}</em>:null}</span>
                    <button className="ev-x" title="Remove" onClick={()=>
                      set({keyDates:keyDatesOf(draft).filter(x=>x.id!==d.id)})}><Trash2 size={13}/></button>
                  </div>); })}
              </div>}
              <div className="kd-add">
                <select value={kdLabel} onChange={e=>setKdLabel(e.target.value)}>
                  {dateVocab(settings).map(x=><option key={x} value={x}>{x}</option>)}
                  <option value="__new">Something else…</option>
                </select>
                <input type="date" value={kdDate} onChange={e=>setKdDate(e.target.value)}/>
                <button className="btn btn-p btn-sm" disabled={!kdDate} onClick={()=>{
                  let label=kdLabel;
                  if(label==='__new'){ label=(window.prompt('What is this date?','')||'').trim();
                    if(!label) return; addOption&&addOption('keyDates',label); }
                  set({keyDates:[...keyDatesOf(draft),
                    {id:uid(),label,date:kdDate,annual:true,lead:DATE_LEAD_DEFAULT}]});
                  setKdDate(''); setKdLabel('Birthday');
                }}><Plus size={13}/>Add</button>
              </div>
              <div className="subcell" style={{marginTop:6}}>
                Repeats every year. If you don't know the year, put any year — only the day and month are used.
              </div>
            </div>
            <div className="field full"><label>Labels</label>
              <div className="lbl-pick">
                {labelVocab(settings).map(x=>{ const on=labelsOf(draft).includes(x);
                  return (<button key={x} type="button" className={'lblchip'+(on?' on':'')}
                    onClick={()=>set({labels:on?labelsOf(draft).filter(v=>v!==x):[...labelsOf(draft),x]})}>{x}</button>); })}
                <button type="button" className="lblchip add" onClick={()=>{
                  const v=(window.prompt('New label (saved for everyone)','')||'').trim();
                  if(!v) return;
                  addOption&&addOption('labels',v);
                  set({labels:[...labelsOf(draft),v]});
                }}><Plus size={11}/>New</button>
              </div>
            </div>
          </div>
          {isNew&&(draft.phone||draft.email)&&(()=>{
            const dupes=(allLeads||[]).filter(x=>{
              const ph=(v)=>(v||'').replace(/\D/g,'');
              return (draft.phone&&ph(x.phone)&&ph(x.phone)===ph(draft.phone))||(draft.email&&x.email&&x.email.toLowerCase()===draft.email.toLowerCase());
            });
            return dupes.length?(<div className="dupe-warn"><AlertTriangle size={14}/><span>Already in the CRM: <b onClick={()=>onNav&&onNav(dupes[0].id)}>{dupes[0].name}</b>{dupes[0].company?` · ${dupes[0].company}`:''}{dupes[0].owner?` · owned by ${dupes[0].owner}`:''}</span></div>):null;
          })()}

          {/* ---------- 3. QUICK ADD: everything else behind one tap ---------- */}
          {isNew&&<>
            <div className="dh mt"><MessageSquare size={13}/>First note</div>
            <div className="fn-block">
              <div className="act-types">{ACT_TYPES.map(({key,icon:Ic})=><button key={key} className={'act-t '+(firstType===key?'on':'')+(key==='Booked'?' booked':'')} onClick={()=>setFirstType(key)}><Ic size={12}/>{actLabel(key)}</button>)}</div>
              <textarea className="fu-note" style={{marginTop:9}} rows={3} placeholder={`How'd the ${firstType.toLowerCase()} go? What did they say?`} value={firstNote} onChange={e=>setFirstNote(e.target.value)}/>
              <div className="fn-hint">{firstNote.trim()?<><CheckCircle2 size={12} color={GREEN}/>Logs as a {firstType} from {who} the moment you save</>:'Optional — but log it now while it\u2019s fresh'}</div>
            </div>

            <button className="morebtn" onClick={()=>setShowMore(!showMore)}>
              <ChevronDown size={14} className={'mb-ch'+(showMore?' on':'')}/>{showMore?'Hide extra details':'Add more details'}
              {!showMore&&<i>optional — {draft.owner} · {draft.nextAction}</i>}
            </button>
            {showMore&&<><div className="dh mt"><Bell size={13}/>Follow-up</div><FollowUpBlock/></>}
            {showMore&&<div className="fgrid" style={{marginTop:12}}>
              {Sel({label:'Business Type',k:'businessType',opts:blankFirst(opt.businessType)})}{Sel({label:'Lead Source',k:'source',opts:['',...opt.source]})}
              {Sel({label:'Stage',k:'stage',opts:stages.map(s=>({v:s.key,l:s.label}))})}{Sel({label:'Priority',k:'priority',opts:Object.entries(PRIORITIES).map(([v,x])=>({v,l:x.label}))})}
              {Sel({label:'Next Action',k:'nextAction',opts:opt.nextAction})}
              {rep?<div className="field"><label>Owner</label><input value={draft.owner||''} disabled/></div>:Sel({label:'Owner',k:'owner',opts:opt.owner||OWNERS})}
              {F({label:'Expected Close',k:'expectedClose',type:'date'})}
              {F({label:'Notes for the follow-up',k:'nextSteps',full:true})}
            </div>}
          </>}

          {/* ---------- 4. DELIVERY (clients only) ---------- */}
          {!isNew&&draft.isClient&&(()=>{ const tracks=activeTracks(draft,settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS); const ov=clientOverall(draft,settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS);
            return (<div className="dr-sec deliv">
              <div className="dh" style={{justifyContent:'space-between',display:'flex'}}><span style={{display:'flex',alignItems:'center',gap:8}}><Rocket size={13}/>Delivery</span><span style={{fontSize:11,color:'#928DAD',fontWeight:600}}>Client since {fmtDate(draft.convertedAt)}</span></div>
              {tracks.map(tr=>{ const p=trackProgress(draft,tr); return (<div className="track" key={tr.key}>
                <div className="track-h"><b>{tr.label}</b>{p.overdue>0?<span className="phase od">{p.overdue} overdue</span>:p.nextDue?<span className="phase">Next due {fmtDate(p.nextDue)}</span>:<span className="phase">{p.current?p.current:'Delivered ✓'}</span>}</div>
                <div className="pbar"><div style={{width:Math.round(p.pct*100)+'%'}}/></div>
                <div className="mslist">{p.ms.map(m=>{ const e=p.entries[m]; const done=!!e.done; const od=!done&&e.due&&daysUntil(e.due)<0; return (<div className={'ms'+(done?' on':'')+(od?' over':'')} key={m}>
                  <span className="mcheck" onClick={()=>toggleMilestone(draft.id,tr.key,m)}>{done?<CheckCircle2 size={17} color={GREEN}/>:<Circle size={17} color={od?'#D14343':'#C9C5D9'}/>}<span className="mtxt">{m}</span></span>
                  {done
                    ? <span className="mdate done">✓ {fmtDate(e.done)}</span>
                    : <label className="msdue-w"><span className="msdue-l">{od?'overdue':'due'}</span><input type="date" className={'msdue'+(od?' over':'')} value={e.due||''} onClick={ev=>ev.stopPropagation()} onChange={ev=>setMilestoneDue(draft.id,tr.key,m,ev.target.value)}/></label>}
                </div>); })}</div>
              </div>); })}
              {ov.delivered&&<div className="deliv-done"><CheckCircle2 size={15} color={GREEN}/>All delivery steps complete{ov.doneDate?` · ${fmtDate(ov.doneDate)}`:''} — client marked completed.</div>}
              <button className="linkbtn" onClick={()=>{ if(window.confirm(
                'Revert this client back to a lead?\n\n'+
                '· They come off the client board and out of closed-deal counts\n'+
                '· Their delivery checklist and any ticks are kept\n'+
                '· Any closed deals stay closed — those are separate\n\n'+
                'You can convert them again at any time.')) revertClient(draft.id); }}>Revert to lead</button>
            </div>);
          })()}

          {/* ---------- 5. EVERYTHING ELSE — collapsed ---------- */}
          {!isNew&&<div className="msecs">
            {Sec('meetings',<CalendarClock size={13}/>,'Meetings',
              (()=>{ const bc=bookedCount(draft); const ms=draft.meetings||[]; if(!ms.length) return bc?`${bc} booked`:'none scheduled'; const next=[...ms].filter(m=>new Date(m.end||m.start).getTime()>=Date.now()).sort((a,b)=>(a.start||'').localeCompare(b.start||''))[0]; return (bc?`${bc} booked · `:'')+(next?`next: ${fmtMeetingTime(next.start)}`:`${ms.length} past`); })(),
              <>
                <MeetingList meetings={draft.meetings} onRemove={doRemove} onStatus={doStatus} onTime={doTime} onType={(mt,v)=>{tagMeeting&&tagMeeting(draft.id,mt.id,v);setDraft(d=>({...d,meetings:(d.meetings||[]).map(x=>x.id===mt.id?{...x,mtype:v}:x)}));}}/>
                <MeetingScheduler lead={draft} gcalConnected={gcalConnected} gcalEmail={gcalEmail} rep={rep} calOwner={calOwner} onSchedule={doSchedule} onLogUndated={doLogUndated} recentLocations={recentLocations}/>
              </>, (draft.meetings||[]).some(m=>new Date(m.end||m.start).getTime()>=Date.now()))}
            {Sec('qual',<SlidersHorizontal size={13}/>,'Qualifying',
              [draft.source,draft.businessType!=='—'?draft.businessType:null,sOf(draft.stage,stages)?.label,PRIORITIES[draft.priority]?.label].filter(Boolean).join(' · ')||'not set',
              <div className="fgrid">
                {Sel({label:'Lead Source',k:'source',opts:['',...opt.source]})}{Sel({label:'Business Type',k:'businessType',opts:blankFirst(opt.businessType)})}
                {Sel({label:'Stage',k:'stage',opts:stages.map(s=>({v:s.key,l:s.label}))})}{Sel({label:'Priority',k:'priority',opts:Object.entries(PRIORITIES).map(([v,x])=>({v,l:x.label}))})}
                {rep?<div className="field"><label>Owner</label><input value={draft.owner||''} disabled/></div>:Sel({label:'Owner',k:'owner',opts:opt.owner||OWNERS})}
                {F({label:'Expected Close',k:'expectedClose',type:'date'})}
                {!rep&&<div className="field"><label>Lead pool</label><select value={draft.pool||''} onChange={e=>set({pool:e.target.value||null})}>
                  <option value="">— none —</option>{poolList(settings).map(p=><option key={p} value={p}>{p}</option>)}</select></div>}
                <div className="field full"><button className="chip add" onClick={addCustomAction}><Plus size={12}/>Add custom Next Action</button></div>
              </div>)}

            {Sec('svc',<Target size={13}/>,'Service Interest',
              (draft.serviceInterest||[]).length?`${(draft.serviceInterest||[]).length} selected`:'none',
              <div className="chips">{opt.service.map(s=><span key={s} className={'chip '+((draft.serviceInterest||[]).includes(s)?'on':'')} onClick={()=>toggleSvc(s)}>{s}</span>)}<span className="chip add" onClick={addCustomSvc}><Plus size={12}/>Custom</span></div>)}

            {(()=>{ const candidates=(allLeads||[]).filter(x=>x.id!==draft.id).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
              const intros=(allLeads||[]).filter(x=>x.introducedBy===draft.id);
              const chain=introChain(draft,allLeads||[]);
              const root=chain.length?chain[0]:null;
              const summary=[draft.isRelationship?'Relationship':'Lead',chain.length?`via ${chain[chain.length-1].name}`:null].filter(Boolean).join(' · ');
              return Sec('type',<Users size={13}/>,'Type & Introduction',summary,<>
                <div className="spon-row">
                  <label className={'spon-tog rel'+(draft.isRelationship?' on':'')}><input type="checkbox" checked={!!draft.isRelationship} onChange={e=>set({isRelationship:e.target.checked})}/>{draft.isRelationship?'Relationship — not a ProyTech lead':'ProyTech lead'}</label>
                </div>
                {draft.isRelationship&&<div className="rel-hint">Kept out of Pipeline, Money &amp; Dashboard — still shows in Follow-Up when due.</div>}
                {draft.isRelationship&&<div className="tier-btns">{REL_TIERS.map(([k,l,c])=><button key={k} type="button" className={'tier-btn'+((draft.relTier||'new')===k?' on':'')} style={{'--tc':c}} onClick={()=>set({relTier:k})}><span className="tier-dot"/>{l}</button>)}</div>}
                <div className="fgrid" style={{marginTop:10}}>
                  <div className="field"><label>Introduced by</label>
                    <select value={draft.introducedBy||''} onChange={e=>set({introducedBy:e.target.value})}>
                      <option value="">— nobody / direct —</option>
                      {candidates.map(x=><option key={x.id} value={x.id}>{x.name}{x.company?' · '+x.company:''}</option>)}
                    </select>
                  </div>
                  {F({label:'How you know them',k:'relNote'})}
                </div>
                {chain.length>0&&<div className="rel-chain">
                  <div className="rc-lbl">Intro chain</div>
                  <div className="rc-path">
                    {chain.map((pp,i)=>(<React.Fragment key={pp.id}>
                      <span className={'rc-node'+(i===0?' root':'')} onClick={()=>onNav&&onNav(pp.id)}>{pp.name}</span>
                      <ChevronRight size={12} className="rc-arrow"/>
                    </React.Fragment>))}
                    <span className="rc-node self">{draft.name||'this contact'}</span>
                  </div>
                  {chain.length>1&&root&&<div className="rc-root">It all traces back to <b onClick={()=>onNav&&onNav(root.id)}>{root.name}</b></div>}
                </div>}
                {intros.length>0&&<div className="rel-gave"><UserPlus size={13}/><span><b>{intros.length}</b> {intros.length===1?'person':'people'} in your CRM came from {draft.name||'this contact'}</span></div>}
              </>);
            })()}

            {Sec('spon',<Award size={13}/>,'Sponsorship',
              draft.pastSponsor?'Past sponsor':draft.potentialSponsor?'Potential sponsor':'no',
              <>
                <div className="spon-row">
                  <label className={'spon-tog'+(draft.potentialSponsor?' on':'')}><input type="checkbox" checked={!!draft.potentialSponsor} onChange={e=>set({potentialSponsor:e.target.checked})}/>Potential sponsor</label>
                  <label className={'spon-tog past'+(draft.pastSponsor?' on':'')}><input type="checkbox" checked={!!draft.pastSponsor} onChange={e=>set({pastSponsor:e.target.checked})}/>Past sponsor</label>
                </div>
                {(()=>{ const hist=sponsorshipsOf(draft,events||[]);
                  const total=hist.reduce((a,x)=>a+x.amount,0);
                  const owed=hist.filter(x=>!x.paid).reduce((a,x)=>a+x.amount,0);
                  const addManual=()=>{
                    const name=(window.prompt('What did they sponsor? (event or description)','')||'').trim();
                    if(!name) return;
                    const amt=evNum(window.prompt('How much? ($)',''));
                    if(amt<=0){ window.alert('Enter a dollar amount.'); return; }
                    const when=(window.prompt('When? (YYYY-MM-DD)',todayISO())||'').trim().slice(0,10);
                    if(!/^\d{4}-\d{2}-\d{2}$/.test(when)){ window.alert('Please use YYYY-MM-DD.'); return; }
                    const paid=window.confirm('Has this been paid?\n\nOK = paid · Cancel = still owed');
                    set({ sponsorships:[...manualSponsorships(draft),
                        {id:uid(),eventName:name,label:name,date:when,amount:amt,paid}],
                      pastSponsor:true,
                      activities:[{id:uid(),ts:new Date().toISOString(),type:'Note',
                        text:`Sponsorship logged: ${name} — ${usd(amt)}${paid?'':' (unpaid)'}`,who:me},
                        ...(draft.activities||[])] });
                  };
                  return (<div className="sp-hist">
                    <div className="sp-h">
                      <span>Sponsorship history</span>
                      {hist.length>0&&<b>{usd(total)} across {hist.length}{owed>0?` · ${usd(owed)} owed`:''}</b>}
                    </div>
                    {hist.length?hist.map(x=>(<div className="sp-row" key={x.id}>
                      <div className="sp-m">
                        <button className="sp-name" disabled={!x.eventId}
                          onClick={()=>x.eventId&&goEvents&&goEvents()}>{x.eventName}</button>
                        <div className="subcell">{x.date?fmtDate(x.date):'no date'}
                          {x.label&&x.label!==x.eventName?` · ${x.label}`:''}
                          {x.source==='manual'?<span className="sp-tag">logged by hand</span>:null}
                          {x.source==='legacy'?<span className="sp-tag">before events</span>:null}
                        </div>
                      </div>
                      <span className={'sp-amt'+(x.paid?'':' owed')}>{usd(x.amount)}{x.paid?'':' owed'}</span>
                      {x.source==='manual'&&<button className="ev-x" title="Remove"
                        onClick={()=>{ if(window.confirm('Remove this sponsorship?'))
                          set({sponsorships:manualSponsorships(draft).filter(m=>m.id!==x.id)}); }}><Trash2 size={13}/></button>}
                    </div>)):<div className="subcell" style={{padding:'6px 0 10px'}}>
                      Nothing yet. Sponsorships attached to an event show up here on their own.</div>}
                    <button className="deal-add-btn" onClick={addManual}><Plus size={14}/>Log one by hand</button>
                  </div>); })()}
                {(draft.potentialSponsor||draft.pastSponsor)&&<div className="fgrid" style={{marginTop:10}}>
                  {F({label:'Sponsor tier',k:'sponsorTier'})}
                  {/* once real sponsorships exist this single number is noise —
                      the history above is the truth, so it becomes "possible" */}
                  {F({label:sponsorshipsOf(draft,events||[]).some(x=>x.source!=='legacy')
                    ?'Amount possible ($)':(draft.pastSponsor?'Amount given ($)':'Amount possible ($)'),
                    k:'sponsorAmount',type:'number'})}
                </div>}
              </>)}

            {customFields.length>0&&Sec('custom',<Tag size={13}/>,'Custom Fields',
              `${customFields.length} field${customFields.length>1?'s':''}`,
              <div className="fgrid">
                {customFields.map(f=>(<div className="field" key={f.id} style={f.type==='checkbox'?{gridColumn:'1/-1'}:undefined}>
                  <label>{f.label}</label>
                  {f.type==='select'?<select value={draft.custom?.[f.id]||''} onChange={e=>setCustom(f.id,e.target.value)}><option value="">—</option>{(f.options||[]).map(o=><option key={o} value={o}>{o}</option>)}</select>
                  :f.type==='checkbox'?<label className="toggle" style={{marginTop:2}}><span className={'sw sm '+(draft.custom?.[f.id]?'on':'')} onClick={()=>setCustom(f.id,!draft.custom?.[f.id])}><b/></span>{draft.custom?.[f.id]?'Yes':'No'}</label>
                  :<input type={f.type==='number'?'number':f.type==='date'?'date':'text'} value={draft.custom?.[f.id]??''} onChange={e=>setCustom(f.id,e.target.value)}/>}
                </div>))}
              </div>)}

            {/* A rep never sees the deal value, the base, or anyone's numbers
                but their own — they get their commission and its state. */}
            {rep&&cmsnOf(draft)&&Sec('mycmsn',<DollarSign size={13}/>,'Your commission',
              (CMSN_STATE[cmsnOf(draft).status]||CMSN_STATE.pending).label,
              (()=>{ const c=cmsnOf(draft); const st=CMSN_STATE[c.status]||CMSN_STATE.pending;
                return (<div className="cmsn-box">
                  <div className="cmsn-row"><span>Your commission</span><b style={{color:st.color}}>{usd(c.amount)}</b></div>
                  <div className="cmsn-row"><span>Status</span><b style={{color:st.color}}>{st.label}</b></div>
                  <div className="subcell" style={{marginTop:6}}>{c.status==='pending'?'Counts toward your running total. An owner approves it to make it real.':c.status==='earned'?`Approved ${c.approvedAt?fmtDate(String(c.approvedAt).slice(0,10)):''} — this one is yours.`:'This commission was voided.'}</div>
                </div>); })(),true)}
            {isOwner&&!isNew&&draft.isClient&&cmsnOf(draft)&&Sec('cmsn',<Percent size={13}/>,'Commission',
              (()=>{ const c=cmsnOf(draft); return `${c.repName||'rep'} · ${usd(c.amount)} · ${(CMSN_STATE[c.status]||CMSN_STATE.pending).label}`; })(),
              (()=>{ const c=cmsnOf(draft); const st=CMSN_STATE[c.status]||CMSN_STATE.pending; const locked=c.status!=='pending';
                const patch=p=>{ setCommission&&setCommission(draft.id,p); setDraft(d=>({...d,commission:{...cmsnOf(d),...p,amount:cmsnAmount(p.base??cmsnOf(d).base,p.pct??cmsnOf(d).pct)}})); };
                return (<div className="cmsn-box">
                  <div className="cmsn-row"><span>Rep</span><b>{c.repName||'—'}</b></div>
                  {draft.dealValueBy&&<div className="cmsn-row"><span>Deal value entered by</span><b>{draft.dealValueBy}{draft.dealValueAt?` · ${fmtDate(String(draft.dealValueAt).slice(0,10))}`:''}</b></div>}
                  <div className="fgrid" style={{marginTop:8}}>
                    <div className="field"><label>Rate at conversion (%)</label><input type="number" min="0" step="0.5" disabled={locked} value={c.pct??0} onChange={e=>patch({pct:num(e.target.value)})}/></div>
                    <div className="field"><label>Deal value used ($)</label><input type="number" min="0" disabled={locked} value={c.base??0} onChange={e=>patch({base:num(e.target.value)})}/></div>
                  </div>
                  <div className="cmsn-row big"><span>Commission</span><b style={{color:st.color}}>{usd(c.amount)}</b></div>
                  <div className="cmsn-row"><span>State</span><b style={{color:st.color}}>{st.label}{c.approvedAt?` · ${fmtDate(String(c.approvedAt).slice(0,10))} by ${c.approvedBy||'—'}`:''}</b></div>
                  <div className="tm-acts">
                    {c.status!=='earned'&&<button className="btn btn-p btn-sm" onClick={()=>patch({status:'earned'})}><BadgeCheck size={14}/>Approve commission</button>}
                    {c.status!=='void'&&<button className="btn btn-d btn-sm" onClick={()=>{ if(window.confirm('Void this commission? It leaves the rep’s pending and earned counts entirely.')) patch({status:'void'}); }}><Ban size={14}/>Void</button>}
                    {c.status==='void'&&<button className="btn btn-g btn-sm" onClick={()=>patch({status:'pending'})}>Put back to pending</button>}
                  </div>
                  <div className="subcell" style={{marginTop:8}}>{locked?'Approved and voided commissions are frozen — put it back to pending to edit the numbers.':'Edit the base if the deal value changed before approval. Changing this rep’s % in Settings later will NOT touch this record.'}</div>
                </div>); })(),true)}

            {Sec('deal',<DollarSign size={13}/>,'Deal',
              (openDealsTotal>0||num(draft.retainer)>0)?[openDealsTotal>0?usd(openDealsTotal):null,openDeals.length>1?`${openDeals.length} deals`:null,num(draft.retainer)>0?usd(draft.retainer)+'/mo':null].filter(Boolean).join(' · '):'not set',
              <>
                {(draft.closedDeals||[]).length>0&&(()=>{ const hist=draft.closedDeals||[];
                  const histTotal=hist.reduce((a,d)=>a+num(d.amount),0);
                  return (<div className="deal-hist">
                    <div className="dh-head"><span>Closed deals</span><b>{usd(histTotal)} · {hist.length} deal{hist.length===1?'':'s'}</b></div>
                    {hist.map(d=>(<div className="dh-row" key={d.id}>
                      <div className="dh-m"><b>{d.label||'Deal'}</b><span>closed {fmtDate(d.closedAt)}{d.by?` · ${d.by}`:''}</span></div>
                      <span className="dh-v">{usd(d.amount)}</span>
                      <button className="ex-del" title="Remove from history" onClick={()=>{ if(window.confirm('Remove this closed deal from history? It will no longer count toward total revenue.')){ set({closedDeals:hist.filter(x=>x.id!==d.id)}); } }}><X size={13}/></button>
                    </div>))}
                    <div className="dh-note">Lifetime with this client: <b>{usd(histTotal+openDealsTotal)}</b></div>
                  </div>); })()}

                {openDeals.map((d,di)=>(<div className="deal-card" key={d.id}>
                  <div className="deal-card-h">
                    <input className="deal-name" value={d.label||''} placeholder={`Deal ${di+1}`} onChange={e=>updateDeal(d.id,{label:e.target.value})}/>
                    <span className="deal-card-v">{usd(dealSum(d))}</span>
                    {openDeals.length>1&&<button className="ex-del" title="Remove this deal" onClick={()=>removeDeal(d.id)}><X size={14}/></button>}
                  </div>
                  <div className="fgrid">
                    <div className="field"><label>Setup $</label><input type="number" value={d.setup??''} onChange={e=>updateDeal(d.id,{setup:e.target.value})}/></div>
                    <div className="field"><label>Website $</label><input type="number" value={d.website??''} onChange={e=>updateDeal(d.id,{website:e.target.value})}/></div>
                    <div className="field"><label>Integration $</label><input type="number" value={d.integration??''} onChange={e=>updateDeal(d.id,{integration:e.target.value})}/></div>
                  </div>
                  {(d.extras||[]).length>0&&<div className="extras">{d.extras.map((ex,i)=>(
                    <div className="extra-row" key={ex.id||i}>
                      <input className="ex-label" placeholder="Line item (e.g. Extra web page)" value={ex.label||''} onChange={e=>{const x=d.extras.slice();x[i]={...x[i],label:e.target.value};updateDeal(d.id,{extras:x});}}/>
                      <div className="ex-amt-w"><span>$</span><input className="ex-amt" type="number" placeholder="0" value={ex.amount||''} onChange={e=>{const x=d.extras.slice();x[i]={...x[i],amount:e.target.value};updateDeal(d.id,{extras:x});}}/></div>
                      <button className="ex-del" title="Remove" onClick={()=>{const x=d.extras.filter((_,j)=>j!==i);updateDeal(d.id,{extras:x});}}><X size={14}/></button>
                    </div>))}</div>}
                  <button className="addline" onClick={()=>updateDeal(d.id,{extras:[...(d.extras||[]),{id:uid(),label:'',amount:''}]})}><Plus size={13}/>Add line item</button>
                  {dealSum(d)>0&&<button className="deal-close-btn sm" onClick={()=>closeDeal(d)}><CheckCircle2 size={14}/>{isUpsellDeal(d)?'Won it — close this deal':'Close this deal'}</button>}
                </div>))}

                <button className="deal-add-btn" onClick={addDeal}><Plus size={15}/>{openDeals.length?'Add another deal':'Add a deal'}</button>

                {openDeals.length>0&&<div className="deal-total"><span>{openDeals.length>1?'All open deals':'One-time total'}</span><b>{usd(openDealsTotal)}</b></div>}
                <div className="field" style={{marginTop:12}}><label>Monthly Retainer $</label><input type="number" value={draft.retainer??''} onChange={e=>set({retainer:e.target.value})}/></div>
                <div className="toggle" onClick={()=>set({retainerActive:!draft.retainerActive})}><span className={'sw '+(draft.retainerActive?'on':'')}><b/></span>{draft.retainerActive?'On monthly retainer':'Not on retainer'}</div>

                {/* ---- Payments: what's been collected against what's owed ---- */}
                {(()=>{
                  const pays=Array.isArray(draft.payments)?draft.payments:[];
                  const paid=pays.reduce((a,p)=>a+num(p.amount),0);
                  /* AUDIT #21. This computed its own total — open deals + closed
                     deals + ONE MONTH OF RETAINER — while the dashboard and the
                     Money page used owedBy(), which has no retainer in it. Same
                     word, two numbers: Justus read $763 on one screen and
                     $1,011.75 on the other.

                     owedBy() wins, and the retainer stays OUT of it, for three
                     reasons:

                     1. A debt figure has to be able to reach zero and stay
                        there. A retainer recurs forever by design, so folding a
                        month of it into "owed" makes the number permanently
                        non-zero — which stops it meaning anything.
                     2. owedBy() is summed across every client into `outstanding`
                        and shown as "Owed to you" and "Invoiced, not yet paid".
                        A month of retainer per client would drift that total
                        upward every month no matter how well you collected.
                     3. Retainer PAYMENTS already land in paidTotal and reduce
                        owed. Adding the retainer to the owed side as well means
                        the same recurring money moves the number in both
                        directions — see AUDIT #23.

                     MRR already answers "what recurs". It is shown beside this
                     rather than folded into it, so nothing is hidden. */
                  const firstMonth=draft.retainerActive?num(draft.retainer):0;
                  /* GROSS for the bar ("$X paid of $Y"), NET from owedBy for the
                     figure. owedBy already subtracts payments, so reusing it as
                     the gross and subtracting again would net them off twice. */
                  const owed=openDealsTotal+closedDealsTotal(draft);
                  const remaining=owedBy(draft,stages);
                  const over=paid-owed;
                  const logPayment=()=>{
                    const raw=window.prompt('Payment amount received ($):', remaining>0?String(remaining):'');
                    if(raw===null) return; const amount=num(raw); if(amount<=0){ window.alert('Enter a dollar amount.'); return; }
                    /* the DATE matters now: revenue lands in the month the money
                       arrived, so a deposit in July and a balance in August show
                       in their own months rather than both at the close date. */
                    const dRaw=window.prompt('What date did it land? (YYYY-MM-DD)',todayISO());
                    if(dRaw===null) return;
                    const date=String(dRaw).trim().slice(0,10);
                    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ window.alert('Please use YYYY-MM-DD, e.g. 2026-08-07.'); return; }
                    const note=(window.prompt('Note (e.g. "Square deposit", "balance on delivery") — optional:','')||'').trim();
                    const pay={id:uid(),amount,date,note};
                    const act={id:uid(),ts:new Date().toISOString(),type:'Payment',text:`Payment received: ${usdc(amount)}${note?` — ${note}`:''}`,who:me};
                    set({payments:[...pays,pay],activities:[act,...(draft.activities||[])]});
                  };
                  return (<div className="pay-panel">
                    <div className="pay-head"><span>Payments</span>{owed>0&&<b className={remaining>0?'due':'clear'}>{remaining>0?`${usdc(remaining)} remaining`:'paid in full'}</b>}</div>
                    {/* The retainer is shown BESIDE the balance, never inside it —
                        it recurs, so it can never be paid off, and a debt figure
                        that cannot reach zero stops meaning anything. */}
                    {firstMonth>0&&<div className="pay-mrr">plus {usdc(firstMonth)}/mo recurring — not counted in the balance</div>}
                    {owed>0&&<div className="pay-bars">
                      <div className="pay-bar"><div style={{width:Math.min(100,Math.round(paid/owed*100))+'%'}}/></div>
                      <div className="pay-nums"><span>{usdc(paid)} paid</span><span>of {usdc(owed)}</span></div>
                    </div>}
                    {pays.length>0&&<div className="pay-list">{pays.map(p=>(
                      <div className="pay-row" key={p.id}>
                        <div className="pay-m"><b>{usdc(p.amount)}</b><span>{fmtDate(p.date)}
                          {/* the month is what the dashboard actually counts on,
                              so it's spelled out rather than inferred from the date */}
                          {p.date?<span className="pay-mon">counts in {new Date(p.date+'T12:00:00').toLocaleString(undefined,{month:'long'})}</span>:null}
                          {p.note?` · ${p.note}`:''}</span></div>
                        <button className="ex-del" title="Remove payment" onClick={()=>{ if(window.confirm('Remove this payment?')) set({payments:pays.filter(x=>x.id!==p.id)}); }}><X size={13}/></button>
                      </div>))}</div>}
                    {/* AUDIT #23. Retainer payments land in this same array, so on a
                        retainer client `paid` legitimately climbs past the one-off
                        total every month. Warning about that would cry wolf forever.
                        The real fix is categorising payments as setup vs retainer;
                        until then this stays quiet where it would be wrong. */}
                    {over>0&&!draft.retainerActive&&<div className="pay-over">{usdc(over)} paid over the deal total (extra / tip / adjust the deal)</div>}
                    {over>0&&draft.retainerActive&&<div className="pay-mrr">{usdc(paid)} received in total — more than the {usdc(owed)} of one-off work, because retainer payments are logged here too</div>}
                    <button className="pay-add" onClick={logPayment}><Plus size={14}/>Log a payment</button>
                  </div>);
                })()}
              </>)}
          </div>}

          {/* ---------- 6. CONVERT — the last thing, not the first ---------- */}
          {!isNew&&!draft.isClient&&<div className="convert-banner">
            <div><b>Won the deal?</b><div style={{fontSize:12.5,color:'#56527a',marginTop:2}}>Convert to a client to start tracking delivery.</div></div>
            <button className="btn btn-p" onClick={()=>convertToClient(draft.id)}><UserCheck size={15}/>Convert to Client</button>
          </div>}

          {/* legacy clients created before close-tracking: offer a one-click backfill */}
          {/* A client banner that's always there: says whether the money has
              landed yet, and puts the undo where you'd look for it rather than
              at the bottom of the delivery checklist. */}
          {!isNew&&draft.isClient&&(()=>{
            const paid=depositPaidAt(draft);
            const noSetup=onbSkipped(draft,'deposit_paid');
            const doRevert=()=>{ if(window.confirm(
              'Revert this client back to a lead?\n\n'+
              '· They come off the client board and out of closed-deal counts\n'+
              '· Their delivery checklist and any ticks are kept\n'+
              '· Any closed deals stay closed — those are separate\n\n'+
              'You can convert them again at any time.')) revertClient(draft.id); };
            return (<div className={'client-bar'+(paid?' paid':'')}>
              <div className="cb-l">
                {noSetup&&!paid
                  ? <><CheckCircle2 size={14} color={GREEN}/><span><b>Monthly only — no setup fee</b>{draft.retainerActive?` · ${usd(num(draft.retainer))}/mo`:''} · nothing held back</span></>
                  : paid?<><CheckCircle2 size={14} color={GREEN}/><span><b>Payment confirmed {fmtDate(paid)}</b> · counting in your numbers</span></>
                     :<><Clock size={14} color="#D97706"/><span><b>Client, payment not collected yet</b> · {usd(num(draft.dealValue))} counts once you tick <i>Deposit / first payment collected</i></span></>}
              </div>
              {/* The tick lives here, not just on the Clients page. Gating
                  revenue on a checkbox you can only reach from another screen
                  would mean money silently not counting with no way to fix it
                  from the record you're looking at. */}
              {/* Confirming payment and logging it are the same event, so this
                  does both in one write. Previously it only ticked the flag and
                  you had to log the money again in the Payments panel below —
                  two places for one thing, and the payments total would sit at
                  $0 while the record claimed payment was confirmed.
                  It reads the payments already logged so pressing this after
                  using the panel confirms without double-counting. */}
              {(!noSetup||paid)&&<button className={'cb-pay'+(paid?' on':'')} onClick={()=>{
                const ob={...(draft.onboarding||{})};
                const cur=normEntry(ob.deposit_paid);
                if(cur.done){
                  if(!window.confirm('Mark the payment as NOT collected?\n\nIt stops counting in your numbers. Any payments you logged stay on the record.')) return;
                  ob.deposit_paid={done:null,due:cur.due||null};
                  const act={id:uid(),ts:new Date().toISOString(),type:'Note',text:'Payment marked as not collected.',who:me};
                  set({onboarding:ob,activities:[act,...(draft.activities||[])]});
                  return;
                }
                const d=window.prompt('What date did the payment land? (YYYY-MM-DD)',todayISO());
                if(d===null) return; const clean=String(d).trim().slice(0,10);
                if(!/^\d{4}-\d{2}-\d{2}$/.test(clean)){ window.alert('Please use YYYY-MM-DD, e.g. 2026-08-01.'); return; }
                ob.deposit_paid={done:clean,due:cur.due||null};

                const pays=Array.isArray(draft.payments)?draft.payments:[];
                const already=pays.reduce((a,x)=>a+num(x.amount),0);
                const owed=dealsOf(draft).reduce((a,x)=>a+dealSum(x),0)+(draft.retainerActive?num(draft.retainer):0);
                const suggest=Math.max(0,owed-already);
                const raw=window.prompt(
                  already>0?`How much came in? (${usdc(already)} already logged)`:'How much came in? ($)',
                  suggest>0?String(suggest):'');
                /* Cancel here still confirms the date — you said the money
                   landed, and refusing to record that because the amount prompt
                   was dismissed would be the more surprising outcome. */
                const amount=raw===null?0:num(raw);
                const patch={onboarding:ob};
                const acts=[];
                if(amount>0){
                  const note=(window.prompt('Note (e.g. "Square deposit", "cash at discovery") — optional:','')||'').trim();
                  patch.payments=[...pays,{id:uid(),amount,date:clean,note}];
                  acts.push({id:uid(),ts:new Date().toISOString(),type:'Payment',
                    text:`Payment received: ${usdc(amount)}${note?` — ${note}`:''}`,who:me});
                }
                acts.push({id:uid(),ts:new Date().toISOString(),type:'Note',
                  text:`Payment confirmed ${fmtDate(clean)} — ${usd(num(draft.dealValue))} now counting.`,who:me});
                set({...patch,activities:[...acts,...(draft.activities||[])]});
              }}>{paid?<><CheckCircle2 size={13}/>Payment collected</>:<><DollarSign size={13}/>Mark payment collected</>}</button>}
              <button className="linkbtn cb-undo" onClick={doRevert}>Revert to lead</button>
            </div>);
          })()}
          {!isNew&&draft.isClient&&(()=>{
            const wonStage=stages.find(s=>s.won); const inWon=wonStage&&draft.stage===wonStage.key;
            const counted=inWon&&draft.closedAt;
            if(counted) return null;
            return (<div className="convert-banner fix">
              <div><b>Not counted in your numbers</b><div style={{fontSize:12.5,color:'#56527a',marginTop:2}}>This client has no close date{!inWon?' and isn’t in your won stage':''}, so deals-closed and revenue skip them. Set the date the deal actually closed.</div></div>
              <button className="btn btn-p" onClick={()=>{
                const d=window.prompt('What date did this deal close? (YYYY-MM-DD)', draft.convertedAt||draft.closedAt||todayISO());
                if(d===null) return; const clean=String(d).trim().slice(0,10);
                if(!/^\d{4}-\d{2}-\d{2}$/.test(clean)){ window.alert('Please use YYYY-MM-DD, e.g. 2026-07-25.'); return; }
                fixCloseTracking&&fixCloseTracking(draft.id,clean);
              }}><CheckCircle2 size={15}/>Fix close tracking</button>
            </div>);
          })()}
        </div>

      </div>
      {isNew&&<div className="m-foot">
        <button className="btn btn-p" onClick={create}><Plus size={16}/>Create Lead</button>
        <button className="btn btn-g" onClick={onClose}>Cancel</button>
        <span className="m-foot-n">{draft.name.trim()
          ? <><CheckCircle2 size={13} color={GREEN}/>{draft.name}{draft.company?' · '+draft.company:''} &rarr; {draft.owner}</>
          : 'Name is the only thing required'}</span>
      </div>}
    </div>
  </div>);
}


/* Moved in with the view: declared in App.jsx, referenced by nothing that
   stayed there. */
/* The structured read on a client, rendered inside their own lead's feed.

   Everything here comes from meeting_logs through meetingLogsOf, so it is on
   screen only for someone Postgres let read that table — an owner. That is why
   the candid three (objections, budget, the temperature read) can be shown
   here while being deliberately absent from the draft the publish box offers.
   The rule is about what is OFFERED for publishing to a rep, not about what an
   owner may see on a lead they own.

   Renders nothing at all when the log predates these fields, which is every
   log written before this shipped — an empty scaffold of headings would make
   an old meeting look like a meeting where nobody said anything. */
const MTEMP={warm:{label:'Warm',fg:'#1F9D55',bg:'rgba(31,157,85,.10)'},
  neutral:{label:'Neutral',fg:'#8b88a0',bg:'#F1F2F8'},
  cool:{label:'Cooling',fg:'#b4322e',bg:'rgba(209,67,67,.10)'}};

export default Modal;
