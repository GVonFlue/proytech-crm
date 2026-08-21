/* ============================================================================
   src/LeadBits.jsx — the small components the lead view and App.jsx both draw.
   ----------------------------------------------------------------------------
   Two stage/priority badges and the date-fix control, in their own file, for
   one reason: BOTH sides render them. Which three those are was determined by
   walking the JSX tags each component actually renders, not by reading it off
   — an earlier pass counted textually, missed that MeetingsPage renders
   DateFix, and moved it away from a caller that needed it. Leaving them in App.jsx would mean src/LeadView.jsx importing from the
   file that imports IT, and a cycle whose failure mode — a value read before
   its module finished initialising — is the TDZ crash this codebase has already
   shipped once. Putting them in LeadView.jsx instead would make the Leads table
   depend on the lead view, which is backwards.
   Neither is redefined anywhere. That is the rule the whole extraction exists
   to keep.
   ========================================================================== */

import React, { useState } from 'react';
import { PRIORITIES, sOf } from './lib/lead';
import { CalendarClock, Flag } from 'lucide-react';

/* ===================== small UI ===================== */
export const StageBadge=({k,stages})=>{const s=sOf(k,stages);return <span className="pill" style={{background:s.color+'1A',color:s.color}}><span className="dot" style={{background:s.color}}/>{s.label}</span>;};
export const PriBadge=({p})=>{const x=PRIORITIES[p]||PRIORITIES.medium;return <span className="pill" style={{background:x.bg,color:x.color}}><Flag size={11}/>{x.label}</span>;};
/* ===================== MODAL ===================== */
/* meeting list + scheduler used inside the lead modal. Top-level so form state
   survives modal re-renders. */
/* the one control a dateless meeting needs: when is it. Defaults to the next
   round hour so the common case is two taps, and it is deliberately the only
   thing offered on the row — no Held/No-show, because that question does not
   apply until somebody says when. */
export function DateFix({onSet,compact}){
  const pad=n=>String(n).padStart(2,'0');
  const soon=(()=>{ const d=new Date(); d.setMinutes(0,0,0); d.setHours(d.getHours()+1);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`; })();
  const [v,setV]=useState(soon);
  const [mins,setMins]=useState(30);
  return (<div className={'mtg-fix'+(compact?' sm':'')} onClick={e=>e.stopPropagation()}>
    <input type="datetime-local" step={900} value={v} onChange={e=>setV(e.target.value)} aria-label="Meeting date and time"/>
    <select value={mins} onChange={e=>setMins(+e.target.value)} aria-label="Length">
      {[15,30,45,60,90,120].map(m=><option key={m} value={m}>{m<60?m+'m':(m/60)+'h'+(m%60?'30':'')}</option>)}
    </select>
    <button className="btn btn-p btn-sm" disabled={!v} onClick={()=>onSet&&onSet(v,mins)}><CalendarClock size={13}/>Set date</button>
  </div>);
}
