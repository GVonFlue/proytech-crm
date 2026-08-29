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

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from './lib/brand';
import {
  DEMO_MINUTES, SLOT_MINUTES, TZ_DEFAULT,
  isBookable, markSlots, slotAt, slotWallClock, slotsForDay,
} from './lib/availability.js';
import {
  ACT_TYPES, CMSN_STATE, DATE_LEAD_DEFAULT, DEFAULT_DELIVERY_TRACKS,
  MEETING_TYPES, OWNERS, PRIORITIES, REL_TIERS, actLabel, activeTracks, allMeetings,
  blankFirst, bookedCount, calendarOwner, clientOverall, closedDealsTotal, cmsnAmount,
  cmsnOf, dateVocab, datelessOf, dayLabel, daysToDate, daysUntil, dealsOf, depositPaidAt,
  evNum, fmtDate, fmtMeetingTime, fmtStamp, introChain, isPoolLead, isUpsellDeal, isoOf,
  keyDatesOf, labelVocab, labelsOf, manualSponsorships, needsDate, normEntry,
  num, nurtureDaysOf, onbSkipped, owedBy, pct, poolList, sOf, seedOnboarding, sponsorshipsOf,
  stdPhases, stripTagText, tagCleared, tagsOn, todayISO, trackProgress, uid, usd, usdc,
  gmailCompose, isSystemNote, yearsAt,
  referralsOut, mkReferral, introducedLeads, referralTarget,
  lastTouch,
  DISPOSITIONS, dispIsContact, dispLabel, dispRequired, hasVoicemail, dialState,
  MAX_ATTEMPTS, BRIEF_FIELDS, briefMissing, briefOf, ownerNames, bookingBrief, briefText,
  timesFor, nextDays, chipTime, joinWhen, splitWhen, quartersFrom, DEMO_MIN, personLabel,
} from './lib/lead';
import { meetingLogsOf } from './lib/meetinglog';
import { useScrollLock } from './lib/scrolllock';
import {
  AlertTriangle,
  AtSign,
  Award,
  BadgeCheck,
  Ban,
  Bell,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Contact2,
  DollarSign,
  Expand,
  FileText,
  Gift,
  Globe,
  Handshake,
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
  Star,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { apptEarnings, payModels } from './lib/reppay';
import { DateFix, PriBadge, StageBadge } from './LeadBits';
import PersonPicker from './PersonPicker';

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
/* ONE AVAILABILITY READ, SHARED BY EVERY CONTROL THAT NEEDS IT.
   ============================================================================

   There are two booking surfaces in this file — WhenPicker in the disposition
   bar, which is how a rep books off a call, and MeetingScheduler in the
   Meetings section. They need identical answers to "is 3pm free", and the fast
   way to get two screens that disagree is to give them a state machine each.
   So the fetch, the marking, the degraded fallback and the pre-booking re-check
   all live here once (ENGINEERING §2, §5).

   `enabled` rather than a bare early return: hooks cannot be called
   conditionally, and a control that is on screen but not gated still has to
   render something.                                                          */
function useAvailability({ enabled, date, readAvailability }) {
  const [slots, setSlots] = useState([]);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [tz, setTz] = useState(TZ_DEFAULT);

  /* READ LIVE, every time the picker opens or the day changes. Not cached: a
     rep is on the phone, one call is nothing, and a cached grid is wrong at
     exactly the moment it matters. */
  useEffect(() => {
    if (!enabled || !date) { setSlots([]); setChecked(false); setError(''); return undefined; }
    let dead = false;
    setLoading(true); setChecked(false); setError('');
    (async () => {
      const j = readAvailability ? await readAvailability(date) : { ok: false, error: 'Availability checking isn’t wired up.' };
      if (dead) return;
      const zone = (j && j.tz) || TZ_DEFAULT;
      setTz(zone);
      if (j && j.ok) {
        /* The server's clock decides what is past, not the browser's. A laptop
           an hour out would grey out live slots or offer gone ones. */
        setSlots(markSlots(slotsForDay(date, zone), j.intervals || [], { now: j.now || Date.now() }));
        setChecked(true); setError('');
      } else {
        setSlots(markSlots(slotsForDay(date, zone), [], { now: Date.now() }));
        setChecked(false);
        setError(j && j.error === 'not_connected'
          ? 'Google Calendar isn’t connected, so nothing could be checked.'
          : (j && j.error) || 'Couldn’t reach the calendar.');
      }
      setLoading(false);
    })();
    return () => { dead = true; };
  }, [enabled, date, reload, readAvailability]);

  /* THE RE-CHECK, IMMEDIATELY BEFORE THE BOOKING.
     Google has no conditional create — no "insert only if this window is still
     free" — so the gap between seeing a slot and taking it cannot be closed,
     only narrowed. The picker may have been open for minutes while the rep
     talked; this shrinks it to one round trip.

     IT ALSO CLOSES THE TWO-REP RACE, for a reason worth writing down: the
     booking we create lands on the very calendar we read, carrying no colour,
     which makes it HARD. A slot another rep took thirty seconds ago comes back
     blocked here with no lock, no extra table and no second source of truth.
     The calendar is the lock.

     Returns null when the rep must be told no. */
  const recheck = useCallback(async (hhmm) => {
    if (!date || !hhmm) return null;
    const j = readAvailability ? await readAvailability(date) : null;
    const zone = (j && j.tz) || TZ_DEFAULT;
    setTz(zone);
    if (!j || !j.ok) {
      /* Could not confirm AT THE MOMENT OF BOOKING. The rep is not blocked —
         that holds whatever Google is doing — but the flag has to mean
         "verified when it was taken", so an unconfirmable booking is stamped
         unverified even if the grid was green a minute ago. */
      const fresh = markSlots(slotsForDay(date, zone), [], { now: Date.now() });
      setSlots(fresh); setChecked(false);
      setError((j && j.error) || 'Couldn’t reach the calendar.');
      return { slot: slotAt(fresh, hhmm), zone, verified: false, soft: false };
    }
    const fresh = markSlots(slotsForDay(date, zone), j.intervals || [], { now: j.now || Date.now() });
    setSlots(fresh); setChecked(true); setError('');
    const slot = slotAt(fresh, hhmm);
    if (!slot || !isBookable(slot)) return null;
    return { slot, zone, verified: true, soft: slot.state === 'soft' };
  }, [date, readAvailability]);

  return { slots, checked, error, loading, tz, recheck, refresh: () => setReload(n => n + 1) };
}

/* THE LATTICE A REP PICKS FROM.
   ============================================================================

   MODULE SCOPE, DELIBERATELY. Defining this inside MeetingScheduler would give
   it a new function identity every render, React would unmount and remount the
   whole grid on each keystroke elsewhere in the form, and the selected chip
   would lose its focus ring mid-booking. That is the same fault the Next Action
   field had, written up at length further down this file; it is not being
   reintroduced two hundred lines above the explanation.

   It holds no state. What slot is picked belongs to the form that submits it.

   WHAT A REP IS AND IS NOT TOLD. Open and soft look different, because the
   choice between "take an empty slot" and "displace something" is his to make
   and he cannot make it if they look the same. What is being displaced is NOT
   shown — he is deciding whether, never which, and the contents of the owner's
   calendar have no business on a rep's screen to answer a question he was not
   asked. */
const SLOT_STATE = {
  open:    { cls: 'open',    hint: 'Free' },
  soft:    { cls: 'soft',    hint: 'Free — a soft block is here, booking it displaces that' },
  blocked: { cls: 'blocked', hint: 'Booked' },
  past:    { cls: 'past',    hint: 'Gone' },
};

function SlotGrid({ slots, picked, onPick, checked, loading, error, onRetry, preferred, label, why }) {
  /* SOP-01 EMPHASISES, IT NEVER ADDS. The call windows say when a trade or a
     desk business picks up, and that is worth a rep's eye — but the lattice is
     decided by the calendar and nothing else. A preferred time that is booked
     stays booked and unmarked; a free time outside the window is still offered.
     Emphasis rather than re-ordering, so the same time is always in the same
     place: a grid that reshuffles is one a rep has to read carefully every
     time, which is the opposite of what a control used mid-call is for. */
  const pref = new Set(Array.isArray(preferred) ? preferred : []);
  const anyPref = slots.some(s => pref.has(s.hhmm) && (s.state === 'open' || s.state === 'soft'));
  return (<div className="slotgrid-wrap">
    <div className="slot-head">
      <label>{label || 'Time'}</label>
      {loading
        ? <span className="slot-note"><Loader2 size={11} className="spin"/>Checking the calendar…</span>
        : checked
          ? <span className="slot-note ok"><CalendarClock size={11}/>Checked just now · {SLOT_MINUTES} min hold, {DEMO_MINUTES} min demo</span>
          : <span className="slot-note warn"><AlertTriangle size={11}/>Not checked</span>}
    </div>
    {/* THE DEGRADED BANNER. A rep with a prospect saying yes must not be told
        to wait, so every slot stays tappable when the calendar is unreachable.
        What he must not do is believe it was checked — so the grid says so on
        its face, the chips are drawn differently, and the booking is stamped
        unverified where the owner will see it. */}
    {/* ITS OWN CLASS, NOT .mtg-warn. That selector already means "which Google
        account this booking lands on", and another component reads the first
        .mtg-warn in the modal to find it. Borrowing the class for a second,
        unrelated warning made this banner answer a question it was never asked
        — ENGINEERING §2, one layer down. */}
    {!loading && !checked && <div className="slot-unver">
      <AlertTriangle size={13}/>
      <span>{error||'Couldn’t reach the calendar.'} These times are <b>not checked against anyone’s calendar</b> — book if you have to, and it will be flagged for review.
        {onRetry&&<> <button type="button" className="linkbtn" onClick={onRetry}>Try again</button></>}</span>
    </div>}
    <div className={'slotgrid'+(checked?'':' unverified')}>
      {slots.map(s=>{
        const st=SLOT_STATE[s.state]||SLOT_STATE.blocked;
        /* Unchecked means unknown, and unknown is not the same as free. Every
           chip is offered, none of them claims to be open. */
        /* Unchecked does not make yesterday bookable. Whether a time has gone
           is a fact about the clock, not about Google, so it survives the
           calendar being unreachable. */
        const cls=checked?st.cls:(s.state==='past'?'past':'unknown');
        const can=checked?isBookable(s):s.state!=='past';
        /* marked only when it is actually takeable — a star on a blocked chip
           is an invitation to tap something that cannot be tapped */
        const star=pref.has(s.hhmm)&&can;
        return (<button key={s.hhmm} type="button" disabled={!can}
          className={'slot '+cls+(picked===s.hhmm?' on':'')+(star?' pref':'')}
          title={checked?st.hint:'Not checked against the calendar'}
          onClick={()=>can&&onPick(s.hhmm)}>{s.label}</button>);
      })}
    </div>
    {why&&anyPref&&<div className="slot-why"><Star size={10}/>{why}</div>}
    {/* Shown whenever NOTHING on this day can be tapped, not only when the
        calendar answered. Late in the evening every slot on today's lattice has
        already started, so a rep opening the picker at 9pm saw twenty-four dead
        chips and no explanation — the commonest way to hit this, and the one
        case the old condition did not cover. */}
    {!loading&&slots.length>0&&!slots.some(s=>checked?isBookable(s):s.state!=='past')&&
      <div className="slot-none">
        {slots.every(s=>s.state==='past')
          ? <>Every slot today has already started. Pick another day.</>
          : <>Nothing free on this day. Try another day, or log it with no date and it lands in the owner’s queue.</>}
      </div>}
  </div>);
}

export function MeetingScheduler({lead,gcalConnected,gcalEmail,rep,calOwner,onSchedule,onLogUndated,recentLocations,readAvailability}){
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
  /* ---- AVAILABILITY, FOR REPS ONLY ------------------------------------------
     The owner keeps the free time field: "no custom times" is a rule about
     reps, and the person a rep escalates 3:45 TO cannot be the person the rule
     blocks. Through the SAME hook WhenPicker uses, so the two booking surfaces
     in this file cannot answer "is 3pm free" differently (ENGINEERING §2). */
  const av=useAvailability({enabled:!!rep,date,readAvailability});
  const [picked,setPicked]=useState('');
  /* a new day is a new lattice; a slot picked on Tuesday means nothing on
     Wednesday, and leaving it selected books the wrong day */
  useEffect(()=>{ setPicked(''); },[date]);
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
    if(invite&&!emailOk){ setErr('That email doesn’t look right — fix it or switch off Invite client.'); return; }
    const t=title.trim()||`${mtype} with ${lead.name||lead.company||'client'}`;
    let when=null, verified=true, displaced=false;
    if(rep){
      if(!picked){ setErr('Pick a time.'); return; }
      setBusy(true);
      const again=await av.recheck(picked);
      if(!again){
        setBusy(false);
        setPicked('');
        setErr('That time just filled — it’s gone from the list. Pick another.');
        return;
      }
      if(!again.slot){ setBusy(false); setErr('That time is no longer on the list. Pick another.'); return; }
      when=slotWallClock(again.slot,again.zone||av.tz);
      verified=again.verified; displaced=again.soft;
    }else{
      const startDt=new Date(`${date}T${time}:00`);
      if(isNaN(startDt)){ setErr('Pick a valid date and time.'); return; }
      const endDt=new Date(startDt.getTime()+dur*60000);
      when={start:localISO(startDt),end:localISO(endDt)};
      setBusy(true);
    }
    try{
      /* a typed address rides along IN THE SAME PATCH as the meeting. Saving it
         separately looks fine and silently loses it: both writes read the same
         stale draft inside one tick and the second overwrites the first. */
      await onSchedule({title:t,mtype,start:when.start,end:when.end,
        invited:invite&&emailOk,attendees:(invite&&emailOk)?[inviteEmail]:[],meet,notes:notes.trim(),
        location:meet?'':loc.trim(),
        /* Two facts about HOW this was booked, carried onto the meeting so the
           owner sees them where he already looks rather than in a new channel:
           whether a calendar actually confirmed it, and whether taking it
           pushed one of his own soft blocks aside. */
        availabilityChecked:verified,displacedSoft:displaced,
        saveEmail:(invite&&emailOk&&!leadEmail)?inviteEmail:''});
      setTitle('');setNotes('');setLoc('');setInvite(false);setMeet(false);setAddEmail('');
      if(rep){ setPicked(''); av.refresh(); }
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
          ? <div className="mtg-acct"><CalendarClock size={12}/><span>Goes on {
              calOwner&&gcalEmail ? <><b>{calOwner}</b>’s calendar — <b>{gcalEmail}</b></>
              : calOwner ? <><b>{calOwner}</b>’s Google Calendar</>
              : gcalEmail ? <><b>{gcalEmail}</b></>
              : <>the owner’s Google Calendar</>
            }, not yours{invite&&emailOk?<> · invite to <b>{inviteEmail}</b></>:null}</span></div>
          : <div className="mtg-acct"><CalendarClock size={12}/><span>Goes on <b>{gcalEmail||'the connected Google account'}</b>{invite&&emailOk?<> · invite to <b>{inviteEmail}</b></>:null}</span></div>)
      : (rep
          ? <div className="mtg-warn"><AlertTriangle size={13}/><span>Google Calendar isn’t connected, so this won’t reach a calendar. {calOwner?<><b>{calOwner}</b> has to connect it</>:<>The owner has to connect it</>} — schedule anyway, the meeting is saved in the CRM either way.</span></div>
          : <div className="mtg-warn"><AlertTriangle size={13}/><span>Google Calendar isn’t connected, so this won’t reach a calendar. Open <b>Settings → Google Calendar</b> and hit Connect.</span></div>)}
    <div className="mtype-row">{MEETING_TYPES.map(t=><button key={t} type="button" className={'mtype'+(mtype===t?' on':'')} onClick={()=>setMtype(t)}>{t}</button>)}</div>
    <div className="fgrid">
      <div className="field full"><label>Title</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={`${mtype} with ${lead.name||lead.company||'client'}`}/></div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      {/* THE FORK. A rep gets the lattice — half hours, 8 to 8, only what is
          actually free. The owner keeps the free time field and the length
          dropdown, because the person a rep escalates 3:45 TO cannot be the
          person the rule blocks. Same component, one condition, so the two
          cannot drift into two screens that disagree. */}
      {rep
        ? <div className="field full slotfield">{SlotGrid({slots:av.slots,picked,onPick:setPicked,
            checked:av.checked,loading:av.loading,error:av.error,onRetry:av.refresh})}</div>
        : <>
            <div className="field"><label>Time</label><input type="time" step={900} value={time} onChange={e=>setTime(e.target.value)} list={listId}/></div>
            <div className="field"><label>Length</label><select value={dur} onChange={e=>setDur(+e.target.value)}>{[15,30,45,60,90,120].map(m=><option key={m} value={m}>{m<60?m+' min':(m/60)+' hr'+(m%60?' 30m':'')}</option>)}</select></div>
          </>}
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
  const Row=(m,kind)=>(<div className={'mtg-row'+(kind?' '+kind:'')+(m.status==='held'?' held':'')+(m.status==='noshow'?' noshow':'')+(needsDate(m)?' undated':'')} key={m.id}>
    <div className="mtg-when"><CalendarClock size={13}/>{needsDate(m)?<span className="mtg-undated">no date set</span>:fmtMeetingTime(m.start)}
      {m.location&&<span className="mtg-loc"><MapPin size={11}/>{m.location}</span>}</div>
    <div className="mtg-mid"><div className="mtg-title">{m.title}</div><div className="mtg-badges">
      <select className={'mtg-type'+(m.mtype?'':' unset')} value={m.mtype||''} onClick={e=>e.stopPropagation()} onChange={e=>onType&&onType(m,e.target.value)}>
        <option value="">+ type</option>{MEETING_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      {m.invited&&<span className="mtg-b"><UserPlus size={10}/>invited</span>}
      {/* Where the owner already looks. Not a notification: a booking that
          pushed a soft block aside is worth knowing about, and worth knowing
          about ONCE, next to the meeting it describes. */}
      {m.displacedSoft&&<span className="mtg-b soft" title="Booked over one of your Banana blocks">
        <CalendarClock size={10}/>displaced a soft block</span>}
      {m.availabilityChecked===false&&<span className="mtg-b unver" title="Google was unreachable when this was booked — nothing was checked against a calendar">
        <AlertTriangle size={10}/>not checked</span>}
      {/* THE INVITE THAT DID NOT GO, ON THE RECORD. A toast disappears; this is
          the state a rep or an owner reopens the lead and sees. Without it the
          only difference between "Logan was told" and "Logan was not told" is
          the absence of a badge, which is not a difference anybody notices. */}
      {m.inviteFailed&&<span className="mtg-b noinvite" title={m.inviteFailed}>
        <AlertTriangle size={10}/>no invite sent</span>}
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
    {undated.length>0&&<><div className="mtg-band undated">Needs a date · {undated.length}</div>{undated.map(m=>Row(m,'undated'))}</>}
    {upcoming.length>0&&<><div className="mtg-band">Upcoming · {upcoming.length}</div>{upcoming.map(m=>Row(m,'upcoming'))}</>}
    {past.length>0&&<><div className="mtg-band past">Past · {past.length}</div>{past.map(m=>Row(m,'past'))}</>}
  </div>);
}
export function MLogRow({label,children}){
  return (<div style={{display:'flex',gap:8,marginTop:5,alignItems:'baseline'}}>
    <span style={{flex:'none',width:86,fontSize:10.5,fontWeight:800,letterSpacing:'.04em',
      textTransform:'uppercase',color:'var(--ink-mid)'}}>{label}</span>
    <span style={{flex:1,minWidth:0,fontSize:12.5,lineHeight:1.5,color:'var(--dim)'}}>{children}</span>
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
      {objections.map((o,i)=>(<span key={i}>{i?'  ·  ':''}<b style={{color:'var(--ink-hi)'}}>{o.objection}</b>
        {o.detail?' — '+o.detail:''}</span>))}
    </MLogRow>}
    {!!money&&<MLogRow label="Money">{money}</MLogRow>}
    {ours.length>0&&<MLogRow label="We owe">{ours.map(commitText).join('  ·  ')}</MLogRow>}
    {theirs.length>0&&<MLogRow label="They owe">{theirs.map(commitText).join('  ·  ')}</MLogRow>}
    {people.length>0&&<MLogRow label="Who else">
      {people.map(x=>x.name+(x.role?' ('+x.role+')':'')+(x.influence==='decides'?' · decides':'')).join('  ·  ')}
    </MLogRow>}
    {!!ns.what&&<MLogRow label="Next">
      <b style={{color:'var(--ink-hi)'}}>{ns.what}</b>{ns.who?' — '+ns.who:''}{ns.when?' · '+ns.when:''}
    </MLogRow>}
    {t&&<MLogRow label="Read">
      <span className="pill" style={{background:t.bg,color:t.fg,marginRight:6}}>{t.label}</span>
      {tmp.why||''}
    </MLogRow>}
  </div>);
}

/* One contact action. An <a> when there is somewhere to go, a disabled <button>
   when there is not: an anchor without an href still focuses and still looks
   live, which is the confusion this is meant to remove.

   The value is shown, not just linked. On a desktop `tel:` hands off to
   whatever the OS registered — FaceTime on a Mac, nothing at all where no
   handler exists — so the number itself is often what you actually want. Copy
   puts it on the clipboard without opening anything. */
function ContactAct({ icon, label, value, href, missing, blank }){
  const [copied,setCopied]=useState(false);
  if(!href) return (<button className="m-act" disabled title={missing}>
    <i>{icon}</i><b>{label}</b><span className="m-act-v">Not on file</span></button>);
  return (<div className="m-act-row">
    <a className="m-act" href={href} title={value} {...(blank?{target:'_blank',rel:'noreferrer'}:{})}>
      <i>{icon}</i><b>{label}</b><span className="m-act-v">{value}</span></a>
    <button className="m-act-copy" title={`Copy ${value}`} onClick={()=>{
      try{ navigator.clipboard&&navigator.clipboard.writeText(String(value)); }catch{}
      setCopied(true); setTimeout(()=>setCopied(false),1200); }}>
      {copied?<Check size={13}/>:<Copy size={13}/>}</button>
  </div>);
}


/* ADDING AN OUTBOUND REFERRAL.

   Two shapes, one control. Either it is a lead already on file — pick it, and
   the entry carries the link plus the name as it stands today — or it is a name
   that was never your lead, typed in. The picker is a datalist rather than a
   select so typing a name nobody has on file is a first-class outcome instead
   of a dead end: what you type becomes the unlinked shape.

   No outcome field, on purpose. See lib/lead's note. */
function ReferralAdd({leads,onAdd}){
  const [who,setWho]=useState('');
  const [note,setNote]=useState('');
  const [when,setWhen]=useState(todayISO());
  const [open,setOpen]=useState(false);
  /* The datalist now offers "Name — Business", so matching on the bare name
     alone silently stopped linking: picking a real lead off the list produced
     an UNLINKED entry carrying the whole label as its name. Match the label
     too — and keep the bare forms, because typing just a name still counts. */
  const norm=v=>String(v||'').trim().toLowerCase();
  const match=(leads||[]).find(l=>{ const q=norm(who); if(!q) return false;
    return norm(personLabel(l))===q||norm(l.name)===q||norm(l.company)===q; });
  const add=()=>{ const name=who.trim(); if(!name) return;
    onAdd({leadId:match?match.id:'',name:match?(match.name||match.company||name):name,note,sentAt:when||todayISO()});
    setWho(''); setNote(''); setWhen(todayISO()); setOpen(false); };
  if(!open) return (<button className="rl-add" onClick={()=>setOpen(true)}><Plus size={13}/>Log one you sent</button>);
  return (<div className="rl-form">
    <input list="rl-leads" className="rl-in" autoFocus placeholder="Who did you send them?"
      value={who} onChange={e=>setWho(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}/>
    <datalist id="rl-leads">{(leads||[]).map(l=><option key={l.id} value={personLabel(l)}/>)}</datalist>
    <input className="rl-in" placeholder="Note (optional)" value={note} onChange={e=>setNote(e.target.value)}
      onKeyDown={e=>e.key==='Enter'&&add()}/>
    <input type="date" className="rl-in rl-date" value={when} onChange={e=>setWhen(e.target.value)}/>
    <div className="rl-acts">
      <span className="rl-hint">{match?<>links to <b>{match.name||match.company}</b></>:who.trim()?'not a lead on file — saved as a name':'\u00a0'}</span>
      <button className="btn btn-p btn-sm" disabled={!who.trim()} onClick={add}>Add</button>
      <button className="btn btn-g btn-sm" onClick={()=>{setOpen(false);setWho('');setNote('');}}>Cancel</button>
    </div>
  </div>);
}

/* ============================================================================
   PICKING A TIME ON A LIVE CALL.
   ----------------------------------------------------------------------------
   "Are mornings or afternoons better for you? … Thursday at ten, or Thursday
   at two?" — SOP-03. The control matches the sentence: a day, then a time.
   Two taps, no typing, no scrolling a native picker through sixty minutes to
   find :30 while somebody waits on the phone.

   HALF HOURS. Nobody books 10:15, and forty chips is slower to scan than the
   raw field this replaces — a picker that is slower than what it replaced is
   not an improvement. `+15` expands to quarters only when asked.

   AND THE RAW FIELD IS STILL ONE TAP AWAY. "Another time" reveals the exact
   <input type="datetime-local"> that was here before, for the prospect who
   says "Thursday at 3:45". Both write the same value through joinWhen, so the
   two halves cannot disagree.
   ========================================================================== */
function WhenPicker({value,onChange,businessType,label,avail,day:gDay,onDay}){
  const {day,time}=splitWhen(value);
  const [raw,setRaw]=useState(false);
  const [fine,setFine]=useState(false);
  const days=useMemo(()=>nextDays(5),[]);
  const {times,label:why}=useMemo(()=>timesFor(businessType),[businessType]);
  const shown=fine?quartersFrom(times):times;
  /* Pick the day for him when he taps a time first — on a call the day is
     usually already agreed, and making him tap a chip he would have chosen
     anyway is the kind of friction this control exists to remove. */
  const pickTime=t=>onChange(joinWhen(day||days[0].iso,t));
  /* ---- GATED: a rep booking a demo -----------------------------------------
     `avail` is passed ONLY for BK, and only for a rep. When it is here the
     curated DEFAULT_TIMES list does not appear at all — 8am to 8pm means 8am to
     8pm, and a list that skipped 11:30, noon and 12:30 was deciding on the
     rep's behalf that those hours do not exist. The lattice is the whole
     bookable day, minus whatever the calendar says is taken.

     +15 AND "ANOTHER TIME" ARE BOTH GONE HERE, and that is the point rather
     than a side effect: a grid that can be bypassed is not a gate. Quarter
     hours and a raw datetime-local each made 3:45 bookable, which is the exact
     thing this is for. 3:45 is an escalation — the undated log below takes it
     and puts it in the owner's queue. Both survive untouched on the owner's own
     controls, and for a rep's CALLBACK, which is when a prospect said to ring
     back and has nothing to do with anybody's calendar. */
  if(avail){
    /* THE DAY IS ITS OWN STATE HERE, not read back out of `value`.
       joinWhen() returns '' unless BOTH halves are present, so a day chip that
       wrote joinWhen(iso,'') would discard the very day it was selecting and
       the grid would silently keep showing today. The gated control therefore
       reports the day upward the moment it is tapped — the caller needs it
       anyway, to know which day to read availability for. */
    return (<div className="whenp gated">
      <div className="whenp-row">
        {days.map(d=>(
          <button key={d.iso} type="button" className={'whenp-c'+(gDay===d.iso?' on':'')}
            onClick={()=>{ onDay&&onDay(d.iso); onChange(''); }}>{d.label}</button>
        ))}
      </div>
      {SlotGrid({slots:avail.slots,picked:time,onPick:t=>onChange(joinWhen(gDay,t)),
        checked:avail.checked,loading:avail.loading,error:avail.error,onRetry:avail.refresh,
        preferred:times,label,why})}
    </div>);
  }
  return (<div className="whenp">
    <label className="whenp-l">{label}</label>
    <div className="whenp-row">
      {days.map(d=>(
        <button key={d.iso} type="button" className={'whenp-c'+(day===d.iso?' on':'')}
          onClick={()=>onChange(joinWhen(d.iso,time||shown[0]))}>{d.label}</button>
      ))}
    </div>
    <div className="whenp-row">
      {shown.map(t=>(
        <button key={t} type="button" className={'whenp-c t'+(time===t?' on':'')}
          onClick={()=>pickTime(t)}>{chipTime(t)}</button>
      ))}
      <button type="button" className="whenp-more" onClick={()=>setFine(f=>!f)}>
        {fine?'fewer':'+15'}</button>
    </div>
    {why&&<div className="whenp-why">{why}</div>}
    <button type="button" className="whenp-raw" onClick={()=>setRaw(r=>!r)}>
      {raw?'Use the chips':'Another time…'}</button>
    {raw&&<input type="datetime-local" value={value||''} onChange={e=>onChange(e.target.value)}/>}
  </div>);
}

export function Modal({lead,isNew,newRel,inbound,settings,stages,addOption,me,myUid,allLeads,navList,onNav,convertToClient,revertClient,fixCloseTracking,toggleMilestone,setMilestoneDue,onClose,updateLead,addActivity,delActivity,delLead,createNew,onBooked,gcalConnected,gcalEmail,createCalendarEvent,deleteCalendarEvent,readAvailability,tagMeeting,rep,isOwner,setCommission,users,teamRoster,events,mlogs,goEvents}){
  const _list=navList||[]; const _idx=isNew?-1:_list.indexOf(lead?.id);
  const prevId=_idx>0?_list[_idx-1]:null; const nextId=(_idx>=0&&_idx<_list.length-1)?_list[_idx+1]:null;
  const opt=settings.options; const customFields=settings.customFields||[];
  const blank={id:uid(),name:'',company:'',businessType:'—',phone:'',email:'',website:'',stage:stages[0].key,priority:'medium',source:'',nextAction:'Follow Up Call',nextSteps:'',followUp:'',expectedClose:'',serviceInterest:[],owner:me||BRAND.team[0]||'',dealValue:0,retainer:0,retainerActive:false,retainerStart:'',closedAt:'',isRelationship:!!newRel,introducedBy:'',relNote:'',relTier:'',meetings:[],custom:{},createdAt:new Date().toISOString(),activities:[]};
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
  /* THE NOTE BOX GROWS WITH THE NOTE.

     It was two lines tall and fixed, so writing anything real meant scrolling
     inside a slot while typing. It starts at six lines now and grows to about
     fifteen before it scrolls, which is where a note stops being a note.

     Height is set imperatively rather than by rows, because rows cannot follow
     content. The ref is also how the box gets small again after a save: the
     value is cleared in code, no input event fires, and without this it would
     stay at whatever height the last note left it. */
  const noteRef=useRef(null);
  const NOTE_MAX=340;
  const sizeNote=el=>{ if(!el) return; el.style.height='auto';
    el.style.height=Math.min(NOTE_MAX,el.scrollHeight)+'px'; };
  const growNote=e=>{ setAtext(e.target.value); sizeNote(e.target); };
  /* The page behind a modal must not scroll. Unconditional and first. */
  useScrollLock();
  const [atype,setAtype]=useState('Call');const [adisp,setAdisp]=useState('');const [cbAt,setCbAt]=useState('');const [brief,setBrief]=useState({});const [atext,setAtext]=useState('');const [pendTags,setPendTags]=useState([]);const [kdLabel,setKdLabel]=useState('Birthday');const [kdDate,setKdDate]=useState('');const [who,setWho]=useState(me||BRAND.team[0]||'');const [feedFilter,setFeedFilter]=useState('All');const [composeOpen,setComposeOpen]=useState(!!rep);
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
    /* HOW it was booked rides on the meeting, not on a side channel. Both
       fields default to the honest answer for a booking that never went near
       an availability check: the owner's own bookings are not "unverified",
       they are simply not subject to the rule, so undefined reads as neither
       flag rather than as a warning on every meeting he makes himself. */
    const meeting={id:uid(),eventId:ev.eventId,htmlLink:ev.htmlLink,meetLink:ev.meetLink,title:m.title,mtype:m.mtype||'Other',status:'',start:m.start,end:m.end,setBy:me,setById:myUid||'',invited:!!m.invited,meet:!!m.meet,notes:m.notes||'',location:m.location||'',createdAt:new Date().toISOString(),dateUnknown:false,
      ...(m.availabilityChecked===false?{availabilityChecked:false}:{}),
      ...(m.displacedSoft?{displacedSoft:true}:{})};
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
  /* CALLED AS A FUNCTION, NOT RENDERED AS A JSX ELEMENT.

     Defining a component inside another component gives it a NEW function
     identity on every render. React compares types by identity, sees a
     different type, and unmounts the old subtree to mount a new one — so every
     field inside it is destroyed and recreated, and whatever you were typing
     into loses focus.

     That is the Next Action bug: the select is type-ahead, so each keypress
     changes the value, which re-renders Modal, which remounts this block. The
     date input and the "what to do" textarea beside it had exactly the same
     fault — the textarea worse, since a whole sentence is a keystroke each.

     Calling it as a function removes the component boundary altogether: the
     elements it returns belong to Modal's own tree, so nothing remounts. That
     is also how F, Sel, Sec and Row in this file are already used, so this is
     the file's existing idiom rather than a workaround for it. These helpers
     hold no state and call no hooks, which is what makes it safe.

     Hoisting to module scope would work too and would cost eight props
     threaded through; there is no behavioural difference. */
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
  /* ---- the disposition on a call ----------------------------------------

     REQUIRED FOR A REP, ABSENT FOR AN OWNER. `rep` is the signed-in user's
     crm_users.role, which is the only place "who is writing this" is knowable:
     an activity row stores `who`, a display NAME, so a stored row can never be
     asked what role wrote it. Enforcing here is therefore not a convenience,
     it is the only place the question has an answer — and it is what closes
     the `!a.disp` default that lets an owner's undisposed call still count as
     contact (lib/lead.js, dispIsContact).

     dispErr is what STOPS the write. Every rule SOP-02 states as something the
     rep must remember is re-imposed here instead, because a model told not to
     do something is a request and a rep told not to do something is a Tuesday. */
  /* Seeded from the lead so a re-booking does not ask again for what is
     already known, and so a half-filled brief survives closing the composer. */
  useEffect(()=>{ setBrief(briefOf(draft)); },[draft.id]);
  const dispErr=(()=>{
    if(!dispRequired(rep,atype)) return '';
    if(!adisp) return 'Pick what happened on the call.';
    if(adisp==='VM'&&hasVoicemail(draft)) return 'A voicemail has already been left on this lead. SOP-02: first attempt only, never a second.';
    if(adisp==='CB'&&!cbAt) return 'A callback needs the day AND the time they gave you — not "next week".';
    if(adisp==='NF'&&!atext.trim()) return 'Not a fit needs a reason. A disqualify with no reason is a lost lead dressed up as a decision.';
    if(adisp==='BK'&&!(draft.name&&draft.email&&draft.phone)) return 'Booked needs their name, email and mobile on the lead first — a booked call with a missing mobile is a no-show.';
    /* THE TIME. The most time-critical field in Logan's half hour, and the BK
       path captured none of it — a booking with no time is a text he has to
       send anyway. Same requirement CB already carries, for a weaker reason. */
    if(adisp==='BK'&&!cbAt) return 'A booking needs the day AND the time you agreed. Logan builds their site in the half hour before it.';
    /* THE FIVE THINGS. SOP-03 has the rep asking for these on the call, so this
       is recording what he already has in front of him — and it is what lets
       the notification replace the text instead of duplicating it. */
    if(adisp==='BK'){ const miss=briefMissing({...draft,brief}); if(miss.length)
      return 'Booked still needs: '+miss.map(k=>k==='website'?'their current website (or tick "no website")':(BRIEF_FIELDS.find(f=>f.key===k)||{}).label).join(' · '); }
    return '';
  })();

  /* ---- BK: a real Google event, not only a local record ------------------

     THE INVITE IS THE NOTIFICATION. calendar-event.js already sets
     sendUpdates=all, so Google mails every attendee — the owners get the
     booking in the place a meeting belongs, with no new OAuth scope, no new
     service and no new failure coupling. The five things ride in the event
     description.

     THE BOOKING SAVES EVEN IF THE INVITE DOES NOT. Google being disconnected
     or down must never cost a rep a booking he actually made — a far worse
     failure than a missing email. So the record is written either way, and the
     OUTCOME IS STORED ON THE MEETING rather than shown as a toast that
     disappears: `invited:true`, or `inviteFailed` with the reason. A rep who
     has to fall back to the SOP-03 text must be able to see that he does, ten
     minutes later, on a screen he reopens. */
  /* THE GATE LIVES WHERE THE BOOKING LIVES. cbAt is Modal's state and bookIt is
     Modal's function, so the same hook that feeds the grid does the re-check
     before the event is created. Putting the read inside WhenPicker would have
     left bookIt unable to re-check without a second copy of it.
     Enabled for a REP marking BK only: a callback is not a demo and consumes
     nobody's calendar. */
  /* The first day WhenPicker offers, which skips weekends — not todayISO(),
     or a Saturday booking session reads a day no chip can select. */
  const [bkDay,setBkDay]=useState(()=>nextDays(1)[0].iso);
  const bkAvail=useAvailability({enabled:!!rep&&adisp==='BK',date:bkDay,readAvailability});
  const [bookMsg,setBookMsg]=useState(null);
  const bookIt=async()=>{
    const t=atext.trim()||dispLabel('BK')+'.';
    const tags=[...pendTags];
    /* RE-CHECK BEFORE ANYTHING IS WRITTEN. Not after the meeting record, not
       in parallel with it: a booking that is refused must leave no trace, or
       the dashboard counts a demo that never existed. */
    let verified=true, displaced=false, slotStart=null;
    if(rep){
      const again=await bkAvail.recheck(splitWhen(cbAt).time);
      if(!again||!again.slot){
        setBookMsg({bad:true,t:'That time just filled — it’s gone from the list. Pick another.'});
        return;
      }
      verified=again.verified; displaced=again.soft; slotStart=again.slot.start;
    }
    const mid=uid(); const now=new Date().toISOString();
    /* THE INSTANT COMES FROM THE SLOT, NOT FROM PARSING cbAt.
       cbAt is 'YYYY-MM-DDTHH:MM' with no zone, and new Date() reads that in the
       BROWSER'S zone. A rep travelling, or a laptop left on the wrong zone,
       would book an hour or more away from the slot the availability check just
       approved — the grid would say 3pm, the invite would say 4pm, and both
       would look right to the person who caused it.

       The slot already carries the instant, computed in the CALENDAR OWNER'S
       zone by the same code that decided the slot was free. Using it means the
       time that was verified is the time that gets booked, and the rep's
       machine has no vote. The owner's own path keeps parsing cbAt: he is the
       calendar, so his local time IS the calendar's. */
    const start=new Date(slotStart!=null?slotStart:new Date(cbAt).getTime()).toISOString();
    /* TEN. The length is DEMO_MIN, not a number chosen here — see lead.js for
       why it is the script's number and not ours. The half-hour lattice is what
       gives Logan his gap between demos; the meeting stays the ten minutes the
       prospect was promised. */
    const end=new Date(new Date(start).getTime()+DEMO_MIN*6e4).toISOString();
    const merged={...draft,brief:{...brief}};
    const b=bookingBrief(merged,{start});
    const title=`Demo with ${b.company||'lead'}`;

    /* The owners, and the lead. SOP-03 has the rep saying "you will get a
       calendar invite from Logan in the next few minutes" — so the prospect is
       an attendee, or the app makes the rep a liar. Drop `draft.email` from
       this list to make it internal-only. Three people on a normal booking,
       well inside calendar-event.js's cap of five. */
    const owners=ownerNames(teamRoster,users);
    const ownerEmails=(users||[]).filter(u=>u&&u.role==='owner'&&u.active!==false&&u.email).map(u=>u.email);
    const attendees=[...new Set([draft.email,...ownerEmails].filter(Boolean))];

    let ev={eventId:'',htmlLink:''}, failed='';
    if(gcalConnected&&createCalendarEvent){
      try{ ev=await createCalendarEvent({title,start,end,notes:briefText(b),attendees,meet:false}); }
      catch(e){ failed=(e&&e.message)||'Google would not create the event.'; }
    } else {
      failed='Google Calendar is not connected on this install.';
    }

    const meeting={id:mid,eventId:ev.eventId||'',htmlLink:ev.htmlLink||'',
      title,mtype:'Demo',start,end,status:'',who,setBy:me,setById:myUid||'',
      createdAt:now,logged:true,dateUnknown:false,
      invited:!failed,...(failed?{inviteFailed:failed}:{}),
      /* how it was booked, where the owner already looks */
      ...(verified===false?{availabilityChecked:false}:{}),
      ...(displaced?{displacedSoft:true}:{})};
    /* The dashboard tag fires either way — belt and braces, and the same
       @mention path SO/HV/DNC already use rather than a second mechanism. */
    const allTags=[...new Set([...tags,...owners])];
    const act={id:uid(),ts:now,type:'Booked',disp:'BK',mtype:'Demo',meetingId:mid,cbAt,
      text:stripTagText(t,tags)||t,who,...(myUid?{whoId:myUid}:{}),...(allTags.length?{tags:allTags}:{})};
    const patch={brief:{...brief},meetings:[...(draft.meetings||[]),meeting],
      activities:[act,...(draft.activities||[])]};
    setDraft(d=>({...d,...patch})); updateLead(draft.id,patch);
    setBookMsg(failed
      ? {bad:true,t:`Booked, and saved — but NO CALENDAR INVITE WENT OUT. ${failed} Text ${owners.join(' and ')||'the owners'} the details now, the way SOP-03 describes.`}
      : {t:`Booked. Calendar invite sent to ${attendees.length} ${attendees.length===1?'person':'people'} — ${owners.join(' and ')||'the owners'}${draft.email?' and the prospect':''}.`});
    setAtext(''); setPendTags([]); setComposeOpen(false); setAdisp(''); setCbAt('');
    setBrief({}); if(noteRef.current) noteRef.current.style.height='';
  };

  const logIt=()=>{
    if(dispErr) return;
    const t=atext.trim()||(atype==='Booked'?`${logMtype} booked.`:'')
      ||(adisp?dispLabel(adisp)+'.':''); if(!t)return;
    const tags=[...pendTags];

    /* BK MAKES A MEETING. This branched on `atype` alone, and the disposition
       bar only renders when atype==='Call' — so a rep marking BK fell through
       to the plain-activity branch and NO MEETING RECORD WAS EVER CREATED. No
       Held/No-show control, nothing in Upcoming or Needs status, and nothing
       for the show rate or held-bookings to be true of. The disposition said
       "booked" and the app did not agree. */
    if(adisp==='BK'){ bookIt(); return; }

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
         note would land tagged for nobody (see the v7 stale-write notes).

         SO, HV and DNC go to the owners the same day. That is the EXISTING
         @mention path, not a second notification system: a tag lands on their
         dashboard through openTagsFor, which already works and which they
         already read. The tag rides in the same write for the same reason the
         manual ones do. */
      const owners=ownerNames(teamRoster,users);
      const escalate=adisp==='SO'||adisp==='HV'||adisp==='DNC';
      const allTags=[...new Set(escalate?[...tags,...owners]:tags)];
      const extra={
        ...(allTags.length?{tags:allTags}:{}),
        ...(adisp?{disp:adisp}:{}),
        ...(adisp==='CB'&&cbAt?{cbAt}:{}),
      };
      addActivity(draft.id,atype,stripTagText(t,tags)||t,who,Object.keys(extra).length?extra:undefined);
      /* A callback is a promise with a time on it, so it becomes the follow-up
         rather than living only in the feed. DNC and BAD take the lead out of
         circulation; dialState() is what every screen asks, so nothing here
         needs a second flag to stay in sync. */
      if(adisp==='CB'&&cbAt) updateLead(draft.id,{followUp:cbAt.slice(0,10),nextAction:`Callback agreed for ${cbAt.replace('T',' ')}`});
    }
    setAtext(''); setPendTags([]); setComposeOpen(false); setAdisp(''); setCbAt('');
    if(noteRef.current) noteRef.current.style.height='';
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
    /* 'NoAnswer' is a disposition, not a type — and Call must EXCLUDE them, or
       the Call chip says 5 and clicking it shows 27 rows. The chip counts and
       the feed have to come from the same rule. */
    const acts=(isNew?[]:(lead?.activities||[])).filter(a=>
      feedFilter==='All' ? true
      : feedFilter==='NoAnswer' ? !!(a.disp&&!dispIsContact(a))
      : a.type===feedFilter && !(a.disp&&!dispIsContact(a)));
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
  /* isSystemNote lives in lib/lead now — the fold and anything that counts
     notes have to agree, and they cannot agree while each keeps its own list. */
  const isSysNote=isSystemNote;
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
  /* TONY'S SIDE OF THIS LEAD.
     `users` is the rep's own crm_users row and nothing else — RLS narrows it
     to `id = auth.uid()` — so his rate comes from there without a new prop and
     without any chance of reading somebody else's.

     apptEarnings() is the SAME function RepPay and the Money page call, handed
     an array of one lead. Not a reimplementation, not a per-lead variant: the
     figure here and the figure on his pay screen come from one place, which is
     the only way they cannot disagree. */
  const myRow=useMemo(()=>(users||[]).find(u=>u&&u.id===myUid)||null,[users,myUid]);
  const myPay=useMemo(()=>payModels(myRow||{}),[myRow]);
  const myAppts=useMemo(()=>(rep&&!isNew&&myPay.appointment)
    ? apptEarnings([draft],myUid,num(myRow&&myRow.appointment_rate))
    : null,[rep,isNew,myPay,draft,myUid,myRow]);
          /* Computed once and rendered in ONE of two places. For a
     relationship it is the FIRST thing in the record rail and opens by
     default; for a lead it stays where it was, collapsed, at the bottom.
     Same JSX either way — a second copy is how the two drift. */
  const typeSection=(()=>{ const candidates=(allLeads||[]).filter(x=>x.id!==draft.id).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
      const intros=(allLeads||[]).filter(x=>x.introducedBy===draft.id);
      const chain=introChain(draft,allLeads||[]);
      const root=chain.length?chain[0]:null;
      const summary=[draft.isRelationship?'Relationship':'Lead',chain.length?`via ${chain[chain.length-1].name}`:null].filter(Boolean).join(' · ');
      return Sec('type',<Users size={13}/>,draft.isRelationship?'The relationship':'Type & Introduction',summary,<>
        <div className="spon-row">
          <label className={'spon-tog rel'+(draft.isRelationship?' on':'')}><input type="checkbox" checked={!!draft.isRelationship} onChange={e=>set({isRelationship:e.target.checked})}/>{draft.isRelationship?'Relationship — not a ProyTech lead':'ProyTech lead'}</label>
        </div>
        {draft.isRelationship&&<div className="rel-hint">Kept out of Pipeline, Money &amp; Dashboard — still shows in Follow-Up when due.</div>}
        {draft.isRelationship&&<div className="tier-btns">{REL_TIERS.map(([k,l,c])=><button key={k} type="button" className={'tier-btn'+((draft.relTier||'new')===k?' on':'')} style={{'--tc':c}} onClick={()=>set({relTier:k})}><span className="tier-dot"/>{l}</button>)}</div>}
        <div className="fgrid" style={{marginTop:10}}>
          <div className="field"><label>Introduced by</label>
            <PersonPicker people={candidates} value={draft.introducedBy||''}
              onChange={id=>set({introducedBy:id})}
              emptyLabel={'\u2014 nobody / direct \u2014'} placeholder="Search a name or business…"/>
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
      </>,draft.isRelationship);
    })();
  const noteCount=(lead?.activities||[]).filter(a=>a.type==='Note').length;
  /* How much contact there has actually been, by type. The filter chips already
     existed but only Notes carried a count — so the answer to "how many times
     have we spoken" was to click each chip and count rows by eye. */
  const touch=useMemo(()=>{
    const acts=(lead?.activities||[]);
    const by={}; ACT_TYPES.forEach(t=>by[t.key]=0);
    let first='',last='';
    /* A NO-ANSWER IS A DIAL, NOT A CALL, AND IT GETS ITS OWN COUNT.

       This tally is raw — it counts by `type` and does not go through
       isRealTouch. A no-answer is type:'Call', so without this split one lead
       renders "Call (27)" in the chip row while its own header two hundred
       pixels away says "never contacted", because that header reads lastTouch,
       which declines a no-answer. Two numbers disagreeing on one screen.

       Shown rather than silently subtracted. The rep needs the dial count —
       it is the numerator of his whole week — so hiding it would be its own
       small lie. The same trade this function already makes for
       "Lead created." one line down, but visible. */
    let noAnswer=0;
    acts.forEach(a=>{
      if(a&&a.disp&&!dispIsContact(a)) noAnswer++;
      else if(by[a.type]!==undefined) by[a.type]++;
      const d=String(a.ts||'').slice(0,10); if(!d) return;
      if(!first||d<first) first=d; if(!last||d>last) last=d; });
    /* "Lead created." is written by the system, not by you — counting it as a
       note would mean every lead claims one touch it never had. */
    const sysNotes=acts.filter(a=>a.type==='Note'&&/^Lead created\.$/.test(a.text||'')).length;
    by.Note=Math.max(0,by.Note-sysNotes);
    /* `spoken` is the "N conversations" line on the prep rail. A dial nobody
       answered is not a conversation, and it is already out of `by.Call`. */
    const spoken=(by.Call||0)+(by.Meeting||0)+(by.Booked||0);
    const total=Object.values(by).reduce((x,y)=>x+y,0)+noAnswer;
    return {by,first,last,total,spoken,noAnswer};
  },[lead]);
  /* `lead` is what widens this to the full viewport; every other modal in the
     app keeps the 960px card. Structure below is untouched — this PR moves no
     element and renames no class. */
  return (<div className="scrim2 lead" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal lead" onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head">
        <div style={{minWidth:0}}>
          <h2>{draft.name||draft.company||(newRel?'New Relationship':'New Lead')}</h2>{!isNew&&<div className="co">{[draft.company,draft.businessType].filter(Boolean).join(' · ')}</div>}
          {!isNew&&<div className="meta">Added {fmtDate(draft.createdAt)} · {lastTouch(draft)?`Last contact ${fmtDate(lastTouch(draft))}`:'never contacted'}</div>}
          {!isNew&&<div className="qa">
            <StageBadge k={draft.stage} stages={stages}/><PriBadge p={draft.priority}/>
          </div>}
        </div>
        <div className="m-headright">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {!isNew&&_list.length>1&&<>
              <button className="m-x" disabled={!prevId} onClick={()=>prevId&&onNav(prevId)} title="Previous lead"><ChevronLeft size={18}/></button>
              <span style={{fontSize:12,fontWeight:600,color:'var(--dim)',minWidth:46,textAlign:'center'}}>{_idx+1} / {_list.length}</span>
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
          {/* CONTACT ACTIONS.

              These were four 11px chips wedged between the badges in the header,
              which is the smallest thing on screen given to the thing done most
              often. They are the top of the prep rail now, at a real size.

              DISABLED, NOT HIDDEN. Rendering only the ones with a value made a
              missing phone number indistinguishable from a view that cannot
              call: nothing to see either way. Disabled says which datum is
              missing, and keeps the row the same shape on every lead, so the
              button you want is always in the same place. */}
          <div className="dh"><Phone size={13}/>Reach out</div>
          <div className="m-acts">
            <ContactAct icon={<Phone size={15}/>} label="Call" value={draft.phone}
              href={draft.phone?`tel:${draft.phone}`:null} missing="No phone number on this record yet"/>
            <ContactAct icon={<MessageSquare size={15}/>} label="Text" value={draft.phone}
              href={draft.phone?`sms:${draft.phone}`:null} missing="No phone number on this record yet"/>
            <ContactAct icon={<Mail size={15}/>} label="Email" value={draft.email}
              href={draft.email?gmailCompose(draft.email):null} blank
              missing="No email address on this record yet"/>
            <ContactAct icon={<Globe size={15}/>} label="Site" value={draft.website}
              href={draft.website?(draft.website.startsWith('http')?draft.website:'https://'+draft.website):null}
              blank missing="No website on this record yet"/>
          </div>
          <div className="dh mt"><Bell size={13}/>Follow-up</div>
          {FollowUpBlock()}
          {/* KEY DATES, for a relationship, in the prep rail.
              A birthday is the reason you call a referral partner — it is prep,
              not a form field, and on their record it was three sections down
              inside Contact. Same keyDatesOf() the Contact block edits; this
              only reads it, and only for a relationship, so a lead's layout is
              untouched. */}
          {draft.isRelationship&&keyDatesOf(draft).length>0&&<>
            <div className="dh mt"><Gift size={13}/>Key dates</div>
            <div className="kd-list prep">
              {keyDatesOf(draft).map(d=>{ const days=daysToDate(d.date,d.annual!==false);
                const yrs=d.annual!==false?yearsAt(d.date,true):null;
                const soon=days!==null&&days<=(num(d.lead)||DATE_LEAD_DEFAULT);
                return (<div className={'kd-row'+(soon?' soon':'')} key={d.id}>
                  <span className="kd-l">{d.label}</span>
                  <span className="kd-d">{fmtDate(d.date)}
                    {days===0?<b> · today</b>:days!==null?<b> · in {days}d</b>:null}
                    {yrs?<em> · turns {yrs}</em>:null}</span>
                </div>); })}
            </div>
          </>}
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
          {isNew?<div className="empty">{newRel?'Save the relationship to start logging activity.':'Save the lead to start logging activity.'}</div>:<>
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
            {/* ONE PLACE FOR A REP TO LOG A CALL, so this is owner-only.

                Its own comment below already conceded the problem: "This is the
                SECOND path a rep can write a Call from". Same shape as the
                scheduler-versus-BK split fixed in #68 — two controls, one
                outcome, two different records — and it wrote the WORSE of the
                two. The composer goes through addActivity, which stamps
                `whoId`. This builds its activity by hand with `who:me` and no
                id, so actIsBy falls back to matching on NAME: rename the rep in
                Settings and every call he parked this way stops counting toward
                his dials, his dials-per-booking and his standing. Silently, and
                only for calls logged through this button.

                WHAT AN OWNER KEEPS is a genuine convenience on a pipeline they
                actually manage. WHAT A REP LOSES is the one tap that also moved
                the lead to the nurture stage — CB in the composer still sets
                the callback, the follow-up date and the next action, so the
                lead comes back to him on the day. It just stays in its current
                stage, which is a pipeline decision rather than his.

                One tap for the most common cold-call outcome. Logs the call,
                parks the lead out of the pipeline, and books the revisit — all
                in ONE patch, because three separate writes in a tick overwrite
                each other (see the v7 stale-write notes). */}
            {!rep&&!sOf(draft.stage,stages).nurture&&!sOf(draft.stage,stages).won&&(()=>{
              const days=nurtureDaysOf(settings);
              const park=()=>{
                const d=new Date(); d.setDate(d.getDate()+days);
                const back=isoOf(d);
                const ts=new Date().toISOString();
                set({ stage:(stages.find(x=>x.nurture)||{}).key||draft.stage,
                  followUp:back,
                  nextAction:'Check back in — said not right now',
                  activities:[
                    /* CB, and stamped as one. This is the SECOND path a rep can
                       write a Call from, so without a disposition it would be the
                       one undisposed rep-authored call in the app — the exact hole
                       the composer's dispErr exists to close. CB and not NF because
                       they said "not right now": they spoke, and a date is being
                       set, which is what SOP-04 calls a callback. */
                    {id:uid(),ts,type:'Call',disp:'CB',cbAt:back,text:`Not interested right now. Parked until ${fmtDate(back)}.`,who:me},
                    ...(draft.activities||[])] });
              };
              return (<button className="notnow" onClick={park}>
                <Clock size={13}/>Not right now
                <span>logs the call · revisit {fmtDate((()=>{const d=new Date();d.setDate(d.getDate()+days);return isoOf(d);})())}</span>
              </button>);
            })()}
            {/* collapsed to a single row until you actually want to write
                something — the feed is what you came for */}
            {/* WHAT THE REP SEES WHEN THE INVITE DID NOT GO. He must not walk
                away believing Logan has been told. Rendered ABOVE the composer
                so it survives the composer closing, and dismissable rather
                than auto-hiding — a message about something that did not
                happen should not disappear on its own. */}
            {bookMsg&&<div className={'bookmsg'+(bookMsg.bad?' bad':'')}>
              {bookMsg.bad?<AlertTriangle size={15}/>:<CheckCircle2 size={15}/>}
              <div>{bookMsg.t}</div>
              <button onClick={()=>setBookMsg(null)} aria-label="Dismiss"><X size={13}/></button>
            </div>}
            {!composeOpen&&!isNew&&<button className="compose-open" onClick={()=>setComposeOpen(true)}>
              <Plus size={14}/>Log a call, note or text</button>}
            {(composeOpen||isNew)&&<div className="compose">
            {/* ONE WAY FOR A REP TO BOOK.

                The MEETINGS panel's scheduler and the BK disposition do the
                same job and write DIFFERENT records: doSchedule stamps no
                `disp`, and dayStats counts a booking as disp==='BK'. So a rep
                who booked through the scheduler got ZERO credit — his
                dials-per-booking, his position on the SOP curve and his Booked
                tile all read as though it never happened — while
                bookingOutcomes, which counts MEETINGS, did see it. Two numbers
                on his own profile disagreeing, caused by two paths.

                He also skipped the brief and the contact check, so Logan got
                no invite worth reading.

                A rep books exactly one thing: the ten minutes with Logan. Type,
                length and Meet link are not his decisions, so the scheduler is
                an owner control and BK is his. */}
            <div className="act-types">{ACT_TYPES.filter(t=>!(rep&&t.key==='Booked')).map(({key,icon:Ic})=><button key={key} className={'act-t '+(atype===key?'on':'')+(key==='Booked'?' booked':'')} onClick={()=>setAtype(key)}><Ic size={12}/>{actLabel(key)}</button>)}
              {canLogPayment&&<button className={'act-t pay'+(atype==='Payment'?' on':'')} onClick={()=>setAtype('Payment')}><DollarSign size={12}/>Payment</button>}
            </div>
            {/* WHAT HAPPENED ON THE CALL. Shown to a rep only: the owners log
                calls without a disposition and nothing about their rows
                changes. First row of the composer because SOP-01 asks for it
                "the second you hang up" — five seconds, before the note. */}
            {dispRequired(rep,atype)&&<div className="dispbar">
              <div className="disp-row">
                {DISPOSITIONS.map(d=>(
                  <button key={d.code} type="button" title={d.hint}
                    className={'disp-b'+(adisp===d.code?' on':'')+(d.contact?'':' quiet')}
                    onClick={()=>setAdisp(c=>c===d.code?'':d.code)}>
                    <b>{d.code}</b>{d.label}
                  </button>))}
              </div>
              {(adisp==='CB'||adisp==='BK')&&
                <WhenPicker value={cbAt} onChange={setCbAt} businessType={draft.businessType}
                  avail={(rep&&adisp==='BK')?bkAvail:null} day={bkDay} onDay={setBkDay}
                  label={adisp==='BK'?'The time you agreed':'Exactly when did they say?'}/>}
              {/* WHOSE CALENDAR IT LANDS ON — moved here, not deleted.

                  This line was written for reps (REP-AUDIT): a rep booking a
                  demo needs to know the invite goes out from the OWNER's
                  account and not his. It lived in the MEETINGS scheduler, which
                  is now owner-only, so leaving it there would have retired a
                  rep-facing answer from the only audience it was written for.
                  It belongs wherever the rep actually books. */}
              {adisp==='BK'&&(gcalConnected
                ? <div className="mtg-acct"><CalendarClock size={12}/><span>
                    The invite goes out from <b>{gcalEmail||'the connected Google account'}</b>
                    {calOwner?<> — <b>{calOwner}</b>’s calendar</>:null}, not yours
                    {draft.email?<> · <b>{draft.email}</b> gets one too</>:null}</span></div>
                : <div className="mtg-warn"><AlertTriangle size={13}/><span>
                    Google Calendar isn’t connected, so no invite will go out.
                    {calOwner?<> <b>{calOwner}</b> has to connect it.</>:<> The owner has to connect it.</>}
                    {' '}Book anyway — it saves, and you will be told to text them.</span></div>)}
              {/* THE FIVE THINGS, at the moment he has them.

                  SOP-03 has the rep asking for these on the call and texting
                  them to Logan within ten minutes, because Logan builds the
                  site in the half hour before the appointment. Asking here is
                  recording what is already in front of him — and it is what
                  lets the notification carry everything the text carried,
                  instead of the app sending half and a human sending the rest. */}
              {adisp==='BK'&&<div className="disp-brief">
                <div className="disp-brief-h">What Logan needs to build it</div>
                {BRIEF_FIELDS.map(f=>(
                  <div className="field full" key={f.key}>
                    <label>{f.label}<span> — {f.hint}</span></label>
                    <input value={brief[f.key]||''} placeholder={f.hint}
                      onChange={e=>setBrief(b=>({...b,[f.key]:e.target.value}))}/>
                  </div>
                ))}
                <div className="field full">
                  <label>Their current website<span> — leave blank and tick below if they have none</span></label>
                  <input value={draft.website||''} placeholder="alvarezroofing.com"
                    onChange={e=>set({website:e.target.value})}/>
                  {/* An empty website means one of two different things: nobody
                      asked, or they have none. Those must not render the same —
                      the first is a gap Logan chases, the second is an answer
                      he can build against. */}
                  <label className="disp-none">
                    <input type="checkbox" checked={!!brief.noWebsite}
                      onChange={e=>setBrief(b=>({...b,noWebsite:e.target.checked}))}/>
                    They do not have a website
                  </label>
                </div>
              </div>}
              {adisp&&!dispIsContact({disp:adisp})&&<div className="disp-note">
                Logged as a dial. It does not count as contact, so this lead stays on the untouched list.
              </div>}
              {/* NOT UNTIL HE HAS DONE SOMETHING.

                  The composer opens by default for a rep now, so rendering
                  dispErr on mount greeted him with "Pick what happened on the
                  call" before he had touched anything — an error about a form
                  nobody has used yet, on every lead he opens. It nags, and a
                  message that is always on screen is one nobody reads when it
                  finally means something.

                  Shown once he has picked a disposition or started typing.
                  NOT on a press of the Log button: that button is disabled
                  while dispErr stands, and a disabled button fires no click —
                  a `tried` flag set from its handler could never become true.
                  Its title carries the reason for anyone who hovers. */}
              {dispErr&&(adisp||atext.trim())&&
                <div className="disp-err"><AlertTriangle size={13}/>{dispErr}</div>}
            </div>}
            {atype==='Booked'
              ? <div className="bookc"><MeetingScheduler lead={draft} gcalConnected={gcalConnected} gcalEmail={gcalEmail} rep={rep} calOwner={calOwner} readAvailability={readAvailability}
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
              : <textarea ref={noteRef} className="act-input" placeholder={`Log a ${atype.toLowerCase()}… (saved with today's date)`} value={atext} onChange={growNote} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))logIt();}}/>}
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
                : <button className="btn btn-p" style={{padding:'8px 16px'}} onClick={logIt} disabled={!!dispErr}
                    title={dispErr||''}>Log {adisp?dispLabel(adisp):actLabel(atype)}</button>}
            </div>}
            </div>}
            <div className="afilter" style={{marginTop:14}}>
              {/* every chip carries its count, so the filter row doubles as the
                  contact tally — one place, not two things to keep in sync */}
              <button className={feedFilter==='All'?'on':''} onClick={()=>setFeedFilter('All')}>All{touch.total?` (${touch.total})`:''}</button>
              {/* Its own chip, never folded into Call. A dial nobody answered
                  is the numerator of a rep's week and it is not a conversation;
                  showing it here is what keeps this row from disagreeing with
                  "never contacted" in the header above. */}
              {touch.noAnswer>0&&<button className={feedFilter==='NoAnswer'?'on':''}
                onClick={()=>setFeedFilter('NoAnswer')}>No answer ({touch.noAnswer})</button>}
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
              <AtSign size={10}/>{n}{done?' ✓':''}</span>); })}</div><div className="fmeta">{a.who?a.who+' · ':''}{actLabel(a.type)} · {fmtStamp(a.ts)}
              {/* say where it came from, so a note nobody wrote does not read as
                  one somebody did — and so the timestamp is understood as the
                  moment of import rather than a moment of contact */}
              {a.imported?<span className="fmeta-src"> · from the import</span>:null}</div></div>
              <button className="fdel" onClick={()=>delActivity(draft.id,a.id)}><Trash2 size={13}/></button></div></Fragment>);})}
              {!feedRuns.length&&<div className="empty" style={{padding:'18px 0'}}>{feedFilter==='All'?'No activity yet. Log your first touch above.':`No ${feedFilter==='NoAnswer'?'no-answer':feedFilter.toLowerCase()} entries yet.`}</div>}</div>
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
              <div className="act-types">{ACT_TYPES.filter(t=>!(rep&&t.key==='Booked')).map(({key,icon:Ic})=><button key={key} className={'act-t '+(firstType===key?'on':'')+(key==='Booked'?' booked':'')} onClick={()=>setFirstType(key)}><Ic size={12}/>{actLabel(key)}</button>)}</div>
              <textarea className="fu-note" style={{marginTop:9}} rows={3} placeholder={`How'd the ${firstType.toLowerCase()} go? What did they say?`} value={firstNote} onChange={e=>setFirstNote(e.target.value)}/>
              <div className="fn-hint">{firstNote.trim()?<><CheckCircle2 size={12} color="var(--ok2)"/>Logs as a {firstType} from {who} the moment you save</>:'Optional — but log it now while it\u2019s fresh'}</div>
            </div>

            <button className="morebtn" onClick={()=>setShowMore(!showMore)}>
              <ChevronDown size={14} className={'mb-ch'+(showMore?' on':'')}/>{showMore?'Hide extra details':'Add more details'}
              {!showMore&&<i>optional — {draft.owner} · {draft.nextAction}</i>}
            </button>
            {showMore&&<><div className="dh mt"><Bell size={13}/>Follow-up</div>{FollowUpBlock()}</>}
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
              <div className="dh" style={{justifyContent:'space-between',display:'flex'}}><span style={{display:'flex',alignItems:'center',gap:8}}><Rocket size={13}/>Delivery</span><span style={{fontSize:11,color:'var(--dim)',fontWeight:600}}>Client since {fmtDate(draft.convertedAt)}</span></div>
              {tracks.map(tr=>{ const p=trackProgress(draft,tr); return (<div className="track" key={tr.key}>
                <div className="track-h"><b>{tr.label}</b>{p.overdue>0?<span className="phase od">{p.overdue} overdue</span>:p.nextDue?<span className="phase">Next due {fmtDate(p.nextDue)}</span>:<span className="phase">{p.current?p.current:'Delivered ✓'}</span>}</div>
                <div className="pbar"><div style={{width:Math.round(p.pct*100)+'%'}}/></div>
                <div className="mslist">{p.ms.map(m=>{ const e=p.entries[m]; const done=!!e.done; const od=!done&&e.due&&daysUntil(e.due)<0; return (<div className={'ms'+(done?' on':'')+(od?' over':'')} key={m}>
                  <span className="mcheck" onClick={()=>toggleMilestone(draft.id,tr.key,m)}>{done?<CheckCircle2 size={17} color="var(--ok2)"/>:<Circle size={17} color={od?'#D14343':'#C9C5D9'}/>}<span className="mtxt">{m}</span></span>
                  {done
                    ? <span className="mdate done">✓ {fmtDate(e.done)}</span>
                    : <label className="msdue-w"><span className="msdue-l">{od?'overdue':'due'}</span><input type="date" className={'msdue'+(od?' over':'')} value={e.due||''} onClick={ev=>ev.stopPropagation()} onChange={ev=>setMilestoneDue(draft.id,tr.key,m,ev.target.value)}/></label>}
                </div>); })}</div>
              </div>); })}
              {ov.delivered&&<div className="deliv-done"><CheckCircle2 size={15} color="var(--ok2)"/>All delivery steps complete{ov.doneDate?` · ${fmtDate(ov.doneDate)}`:''} — client marked completed.</div>}
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
            {/* a relationship leads with what it is, not with what it is not */}
            {draft.isRelationship&&typeSection}
            {Sec('meetings',<CalendarClock size={13}/>,'Meetings',
              (()=>{ const bc=bookedCount(draft); const ms=draft.meetings||[]; if(!ms.length) return bc?`${bc} booked`:'none scheduled'; const next=[...ms].filter(m=>new Date(m.end||m.start).getTime()>=Date.now()).sort((a,b)=>(a.start||'').localeCompare(b.start||''))[0]; return (bc?`${bc} booked · `:'')+(next?`next: ${fmtMeetingTime(next.start)}`:`${ms.length} past`); })(),
              <>
                <MeetingList meetings={draft.meetings} onRemove={doRemove} onStatus={doStatus} onTime={doTime} onType={(mt,v)=>{tagMeeting&&tagMeeting(draft.id,mt.id,v);setDraft(d=>({...d,meetings:(d.meetings||[]).map(x=>x.id===mt.id?{...x,mtype:v}:x)}));}}/>
                <MeetingScheduler lead={draft} gcalConnected={gcalConnected} gcalEmail={gcalEmail} rep={rep} calOwner={calOwner} readAvailability={readAvailability} onSchedule={doSchedule} onLogUndated={doLogUndated} recentLocations={recentLocations}/>
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

          {!draft.isRelationship&&typeSection}

            {/* THE REFERRAL LEDGER — relationships only.

                Asymmetric on purpose. Received is a count and a dollar figure,
                because those are leads of yours and you know what they closed
                for. Given is a count of favours with no outcome: you will never
                reliably learn what a referral was worth to them, and a field
                nobody fills is worse than no field.

                The money comes in as a prop from useMetrics — the same hook the
                Dashboard runs — rather than being summed here, so the two
                screens cannot disagree about what a closed deal is worth. */}
            {draft.isRelationship&&Sec('refer',<Handshake size={13}/>,'Referrals',
              (()=>{ const g=referralsOut(draft).length; const r=(inbound&&inbound.count)||0;
                return g||r?`${g} given · ${r} received`:'none yet'; })(),
              <>
                <div className="rl-head">
                  <div className="rl-stat"><b>{referralsOut(draft).length}</b><span>given</span></div>
                  <div className="rl-sep"/>
                  <div className="rl-stat"><b>{(inbound&&inbound.count)||0}</b><span>received</span></div>
                  <div className="rl-sep"/>
                  <div className="rl-stat" title="Won and collected — not pipeline. The same figure the Dashboard counts as revenue.">
                    <b>{usdc((inbound&&inbound.value)||0)}</b><span>collected</span></div>
                </div>

                <div className="dh mt"><UserPlus size={13}/>Sent to them</div>
                {referralsOut(draft).length===0
                  ? <div className="rl-empty">Nothing logged yet. Add the last person you passed their way.</div>
                  : <div className="rl-list">
                      {[...referralsOut(draft)].sort((a,b)=>String(b.sentAt).localeCompare(String(a.sentAt))).map(r=>{
                        const t=referralTarget(r,allLeads||[]);
                        return (<div className="rl-row" key={r.id}>
                          <div className="rl-who">
                            {t.lead
                              ? <button className="rl-link" onClick={()=>onNav&&onNav(t.lead.id)}>{t.name}</button>
                              : <span className="rl-name">{t.name}{t.gone?<em> · record removed</em>:null}</span>}
                            {r.note?<span className="rl-note">{r.note}</span>:null}
                          </div>
                          <span className="rl-when">{fmtDate(r.sentAt)}</span>
                          <button className="ex-del" title="Remove from the ledger" onClick={()=>
                            set({referralsOut:referralsOut(draft).filter(x=>x.id!==r.id)})}><X size={13}/></button>
                        </div>);
                      })}
                    </div>}
                <ReferralAdd leads={(allLeads||[]).filter(l=>!l.isRelationship)}
                  onAdd={e=>set({referralsOut:[...referralsOut(draft),mkReferral(e)]})}/>

                <div className="dh mt"><Users size={13}/>Sent to you</div>
                {(()=>{ const got=introducedLeads(draft,allLeads||[]);
                  if(!got.length) return <div className="rl-empty">No one yet.</div>;
                  return (<div className="rl-list">
                    {got.map(l=>(<div className="rl-row" key={l.id}>
                      <div className="rl-who">
                        <button className="rl-link" onClick={()=>onNav&&onNav(l.id)}>{l.name||l.company||'(unnamed)'}</button>
                        {l.company&&l.name?<span className="rl-note">{l.company}</span>:null}
                      </div>
                      <span className="rl-when">{fmtDate(l.createdAt)}</span>
                    </div>))}
                  </div>); })()}
              </>
            )}
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
            {/* ---------- YOUR WORK ON THIS LEAD (a rep only) ----------
                Tony's screen is composed, not redacted. The owner's Commission
                section — rate, base, approve, void — is absent for him, and
                rather than leaving the gap where it was, what he DOES have is
                gathered under one heading: his cut, and the appointments he set
                on this lead. Both are his own money and neither exists on the
                owner's version of this rail, so the two screens are different
                compositions rather than one with holes punched in it. */}
            {/* the heading only exists if something is under it — apptEarnings
                returns an object with count 0 for a rep on a rate who has set
                no appointments here, which is truthy and would have left the
                heading standing over nothing */}
            {rep&&!isNew&&(cmsnOf(draft)||(myAppts&&myAppts.count>0))&&
              <div className="dh mt"><DollarSign size={13}/>Your work on this lead</div>}
            {rep&&myAppts&&myAppts.count>0&&Sec('myappt',<CalendarCheck size={13}/>,'Your appointments',
              `${myAppts.count} · ${usd(myAppts.pendingTotal+myAppts.approvedTotal+myAppts.paidTotal)}`,
              (<div className="cmsn-box">
                <div className="cmsn-row"><span>Appointments you set</span><b>{myAppts.count}</b></div>
                {myAppts.pending.length>0&&<div className="cmsn-row"><span>Awaiting approval</span>
                  <b style={{color:'var(--gold2)'}}>{myAppts.pending.length} · {usd(myAppts.pendingTotal)}</b></div>}
                {myAppts.approved.length>0&&<div className="cmsn-row"><span>Approved</span>
                  <b style={{color:'var(--ok2)'}}>{myAppts.approved.length} · {usd(myAppts.approvedTotal)}</b></div>}
                {myAppts.paid.length>0&&<div className="cmsn-row"><span>Paid</span>
                  <b>{myAppts.paid.length} · {usd(myAppts.paidTotal)}</b></div>}
                <div className="subcell" style={{marginTop:6}}>
                  Counted once a meeting is marked <b>held</b>. Cancelled and no-shows pay nothing.
                  These are your own appointments on this lead — your full total is on Your Pay.
                </div>
              </div>),true)}
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

            {/* Hidden on a relationship — but only when it is EMPTY. Somebody
                who flips a lead carrying a live deal into a relationship must
                not lose the panel that edits it; hiding data a person entered
                is worse than a slightly odd-looking screen. */}
            {(!draft.isRelationship
              ||openDealsTotal>0||(draft.closedDeals||[]).length>0
              ||num(draft.retainer)>0||(Array.isArray(draft.payments)&&draft.payments.length>0))
              &&Sec('deal',<DollarSign size={13}/>,'Deal',
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
          {/* A relationship is not a deal you are trying to win. "Won the deal?
              Convert to Client" on a referral partner is the app asking the
              wrong question, and it was the loudest thing at the bottom of
              their record. Same for the close-tracking prompt below. */}
          {!isNew&&!draft.isClient&&!draft.isRelationship&&<div className="convert-banner">
            <div><b>Won the deal?</b><div style={{fontSize:12.5,color:'var(--dim)',marginTop:2}}>Convert to a client to start tracking delivery.</div></div>
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
                  ? <><CheckCircle2 size={14} color="var(--ok2)"/><span><b>Monthly only — no setup fee</b>{draft.retainerActive?` · ${usd(num(draft.retainer))}/mo`:''} · nothing held back</span></>
                  : paid?<><CheckCircle2 size={14} color="var(--ok2)"/><span><b>Payment confirmed {fmtDate(paid)}</b> · counting in your numbers</span></>
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
              <div><b>Not counted in your numbers</b><div style={{fontSize:12.5,color:'var(--dim)',marginTop:2}}>This client has no close date{!inWon?' and isn’t in your won stage':''}, so deals-closed and revenue skip them. Set the date the deal actually closed.</div></div>
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
        <button className="btn btn-p" onClick={create}><Plus size={16}/>{newRel?'Create Relationship':'Create Lead'}</button>
        <button className="btn btn-g" onClick={onClose}>Cancel</button>
        <span className="m-foot-n">{draft.name.trim()
          ? <><CheckCircle2 size={13} color="var(--ok2)"/>{draft.name}{draft.company?' · '+draft.company:''} &rarr; {draft.owner}</>
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
