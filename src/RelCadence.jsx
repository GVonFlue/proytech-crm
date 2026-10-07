/* STAYING IN TOUCH, ON SCREEN: "Log touch", the "Reach out" list, Settings →
   Relationship cadence, and the per-person cadence on a relationship record.

   Everything here READS lib/relationships (reachOut, nextTouch, readCadence).
   Nothing computes a due date on its own, so the dashboard, the Relationships
   page's "Needs attention" strip and the record cannot disagree.

   A touch is written as ONE activity through the CRM's addActivity (the same
   write the record's composer makes), so last touch moves the moment it is
   logged and nothing new is stored. */
import React, { useState, useRef, useEffect } from 'react';
import { HeartHandshake, Cake, Check } from 'lucide-react';
import { reachOut, readCadence, cadenceOf, tierOf, tierMeta, tierLetter, REACH_GROUPS, TOUCH_KINDS, TIER_KEYS, REL_TIER_DESC, CADENCE_DEFAULT, CADENCE_MIN, CADENCE_MAX, cleanDays } from './lib/relationships';

/** One tap to open, one tap on the kind to log. The note is optional and is
 *  typed BEFORE the kind, so the kind is the last tap, never a Save button. */
export function LogTouch({ name, onLog, compact }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const log = k => { onLog(k, note); setNote(''); setOpen(false); setDone(k); setTimeout(() => setDone(''), 1800); };
  return (<span className={'lt' + (compact ? ' compact' : '')} ref={ref} onClick={e => e.stopPropagation()}>
    <button type="button" className={'lt-b' + (done ? ' done' : '')} aria-expanded={open} aria-label={`Log touch: ${name || ''}`.trim()} onClick={() => setOpen(o => !o)}>
      {done ? <><Check size={13} />{done} logged</> : <><HeartHandshake size={13} />Log touch</>}
    </button>
    {open && <div className="lt-pop" role="dialog" aria-label={`Log a touch with ${name || 'this relationship'}`}>
      <input className="lt-note" value={note} placeholder="Note (optional)" aria-label="Note (optional)" maxLength={2000} onChange={e => setNote(e.target.value)} />
      <div className="lt-kinds">{TOUCH_KINDS.map(k => <button type="button" key={k.key} className="lt-k" onClick={() => log(k.key)}>{k.key}</button>)}</div>
    </div>}
  </span>);
}

/** The rows of the "Reach out" list, grouped. Shared by the dashboard (owner
 *  and rep) and the Relationships page's strip. */
export function ReachOutList({ data, openLead, onLog, max = 8, empty }) {
  if (!data.count) return <div className="ro-empty">{empty || 'Nobody to reach out to this week.'}</div>;
  return (<div className="ro">{REACH_GROUPS.map(([k, title]) => data[k].length > 0 && <div key={k} className={'ro-grp ' + k}>
    <div className="ro-h">{k === 'birthdays' ? <Cake size={12} /> : null}{title}<i>{data[k].length}</i></div>
    {data[k].slice(0, max).map(x => <div key={k + x.id} className="ro-row">
      <span className="ro-tier" style={{ '--tc': tierMeta(x.tier)[2] }} title={tierMeta(x.tier)[1]}>{tierLetter(x.tier)}</span>
      <button type="button" className="ro-name" onClick={() => openLead && openLead(x.id)}>{x.name}</button>
      <span className="ro-why">{x.why}</span>
      {onLog && <LogTouch compact name={x.name} onLog={(kind, note) => onLog(x.id, kind, note)} />}
    </div>)}
    {data[k].length > max && <div className="ro-more">+{data[k].length - max} more</div>}
  </div>)}</div>);
}

/** A rep's dashboard card: only relationships they own, nothing else from
 *  "What's due" (client delivery is not a rep screen, ROLES.md). */
export function ReachOutCard({ rels, settings, me, today, openLead, onLog }) {
  const data = reachOut(rels, { cfg: readCadence(settings), today, mine: me });
  return (<div className="card ro-card">
    <div className="sec-title" style={{ margin: '0 0 10px' }}><HeartHandshake size={15} />Reach out</div>
    <ReachOutList data={data} openLead={openLead} onLog={onLog} empty="None of your relationships are due this week." />
  </div>);
}

/** Settings → Relationship cadence. */
export function CadenceSettings({ settings, saveSettings }) {
  const cfg = readCadence(settings);
  const [draft, setDraft] = useState(null);
  const val = k => (draft && k in draft ? draft[k] : String(cfg.days[k]));
  const commit = k => {
    if (!draft || !(k in draft)) return;
    const d = cleanDays(draft[k]);
    setDraft(x => { const n = { ...x }; delete n[k]; return n; });
    if (d === null) return;               /* refuse junk; the saved value stays */
    saveSettings({ ...settings, relCadence: { ...cfg.days, ...(settings.relCadence || {}), [k]: d } });
  };
  return (<div className="card" style={{ marginBottom: 18 }}>
    <div className="sec-title"><HeartHandshake size={15} />Relationship cadence</div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 14 }}>How often each tier should hear from you. Next touch is due this many days after the last one (a call, text, email, coffee, meeting, event, intro, referral, or a note you wrote). A date set on the record wins when it is sooner. Anyone can have their own number on their record.</div>
    {cfg.fellBack.length > 0 && <div className="lc-fb">Using the built-in default for: <b>{cfg.fellBack.map(k => `${tierMeta(k)[1]} (${CADENCE_DEFAULT[k]} days)`).join(', ')}</b>. Change a number to make it yours.</div>}
    <div className="cad-rows">{TIER_KEYS.map(k => <label key={k} className="cad-row" style={{ '--tc': tierMeta(k)[2] }}>
      <span className="cad-t"><span className="cad-dot" />{tierMeta(k)[1]}<em>{REL_TIER_DESC[k]}</em></span>
      <span className="cad-in">every<input type="number" inputMode="numeric" min={CADENCE_MIN} max={CADENCE_MAX} value={val(k)} aria-label={`${tierMeta(k)[1]} cadence in days`}
        onChange={e => setDraft(x => ({ ...(x || {}), [k]: e.target.value }))} onBlur={() => commit(k)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />days</span>
    </label>)}</div>
  </div>);
}

/** On the record: this person's own cadence, blank for the tier's. */
export function PersonCadence({ lead, settings, onChange }) {
  const cad = cadenceOf(lead, readCadence(settings));
  const tierDays = readCadence(settings).days[tierOf(lead)];
  const [v, setV] = useState(null);
  const shown = v !== null ? v : (cad.source === 'person' ? String(cad.days) : '');
  const commit = () => {
    if (v === null) return;
    const d = cleanDays(v); setV(null);
    if (v.trim() === '') onChange('');
    else if (d !== null) onChange(d);
  };
  return (<label className="cad-person">Reach out every
    <input type="number" inputMode="numeric" min={CADENCE_MIN} max={CADENCE_MAX} placeholder={String(tierDays)} value={shown} aria-label="This person's cadence in days"
      onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    days <span className="cad-src">{cad.source === 'person' ? `(their own; the tier says ${tierDays})` : '(the tier\'s)'}</span>
  </label>);
}

export const REL_CADENCE_CSS = `
.lt{position:relative;display:inline-flex}
.lt-b{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:12px;font-weight:700;border:1px solid #CBD3F5;background:#F3F5FE;color:#2B4DE0;border-radius:8px;padding:4px 9px;cursor:pointer;white-space:nowrap}
.lt-b:hover{background:#E8ECFD}
.lt-b.done{border-color:#C9E7D6;background:#EFFAF3;color:#14663E}
.lt.compact .lt-b{padding:3px 8px;font-size:11.5px}
.lt-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:40;width:min(300px,86vw);background:#fff;border:1px solid #DCE1F2;border-radius:12px;box-shadow:0 14px 34px -12px rgba(20,18,43,.35);padding:10px}
.lt-note{width:100%;box-sizing:border-box;font:inherit;font-size:13px;border:1px solid #D7DCEB;border-radius:8px;padding:7px 9px;margin-bottom:8px;color:#14122B;background:#fff}
.lt-kinds{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.lt-k{font:inherit;font-size:12px;font-weight:700;border:1px solid #D7DCF3;background:#F6F7FC;color:#14122B;border-radius:8px;padding:7px 4px;cursor:pointer}
.lt-k:hover{background:#2B4DE0;border-color:#2B4DE0;color:#fff}
.ro-empty{padding:10px 2px;color:#5F6680;font-size:13px}
.ro-grp{margin-top:4px}
.ro-h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#56607A;margin:10px 0 6px}
.ro-h i{font-style:normal;background:#EEF0F7;border-radius:999px;padding:0 7px;color:#3A4160}
.ro-grp.overdue .ro-h{color:#B42F2F}.ro-grp.overdue .ro-h i{background:rgba(209,67,67,.12);color:#B42F2F}
.ro-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #F0F1F7;flex-wrap:wrap}
.ro-row:last-child{border-bottom:0}
.ro-tier{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:6px;font-size:11px;font-weight:800;color:#14122B;border:2px solid var(--tc)}
.ro-name{font:inherit;font-size:13.5px;font-weight:700;color:#14122B;background:none;border:0;padding:0;cursor:pointer;text-align:left}
.ro-why{flex:1;min-width:120px;font-size:12.5px;color:#56607A}
.ro-more{font-size:12px;color:#56607A;padding:4px 0 0 28px}
.ro-card{margin-bottom:18px}
.lc-reach{margin-top:14px;padding-top:10px;border-top:1px dashed #E3E5EF}
.lc-reach-t{display:flex;align-items:center;gap:6px;font-weight:700;font-size:13.5px;color:#14122B}
.cad-rows{display:flex;flex-direction:column;gap:8px}
.cad-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:1px solid #ECEEF5;border-radius:12px;padding:10px 12px}
.cad-t{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;color:#14122B}
.cad-t em{font-style:normal;font-weight:500;color:#56607A;font-size:12.5px}
.cad-dot{width:9px;height:9px;border-radius:50%;background:var(--tc)}
.cad-in{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#3A4160}
.cad-in input{width:64px}
.cad-person{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:#3A4160;margin-top:8px}
.cad-person input{width:64px}
.cad-src{color:#5F6680}
/* on a phone the row's button sits at the left edge, so a popover anchored
   to its right runs off screen: it becomes a sheet along the bottom */
@media (max-width:560px){.lt-pop{position:fixed;left:12px;right:12px;top:auto;bottom:calc(12px + env(safe-area-inset-bottom, 0px));width:auto}}
.rel-lt{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:12.5px;color:#3A4160}
`;
