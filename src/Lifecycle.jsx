/* THE CLIENT LIFECYCLE ON SCREEN: the strip on each client card, the
   dashboard's "What's due" card and "Launches this month", and Settings →
   Client lifecycle.

   Everything here READS lib/lifecycle (clockOf, dueItems, whatsDue,
   launchesThisMonth). Nothing computes a date or a stage on its own, so the
   card, the dashboard and the client's portal cannot disagree.

   Owner only. App renders none of it for a rep: client delivery is not a rep
   screen (ROLES.md), and the items live on the client's lead, which a rep's
   login does not read. */
import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, Rocket, Send, PauseCircle, RotateCcw } from 'lucide-react';
import { whatsDue, launchesThisMonth, stageSince, DUE_GROUPS, DEFAULT_TEMPLATE, OWNER_ROLES, FLOW, readLifecycle } from './lib/lifecycle';

const fmt = iso => { if (!iso) return ''; const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const daysIn = (since, today) => { if (!since) return null; const n = Math.round((Date.parse(String(today).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(since).slice(0, 10) + 'T12:00:00Z')) / 864e5); return Number.isFinite(n) && n >= 0 ? n : null; };

/** The lifecycle lines on a client card: days in stage, the 14-day count,
 *  what it waits on, who is on it, and the two hand moves. */
export function LifecycleStrip({ row, label, today, onMove }) {
  if (!row) return null;
  const { lead: l, clock, items, waiting } = row;
  const ph = l.clientPhase || 'intake';
  const n = daysIn(stageSince(l), today);
  /* the stage they are in first, earliest date first; an older stage's open
     item only when this one has nothing dated */
  const open = items.filter(i => !i.done && !i.excluded && i.due).sort((a, b) => a.due.localeCompare(b.due));
  const next = open.find(i => i.stage === ph) || open[0];
  const counting = (ph === 'build' || ph === 'review') && clock && clock.started;
  return (<div className="lc-strip" onClick={e => e.stopPropagation()}>
    <div className="lc-line"><span className="lc-in">{n === null ? label(ph) : `${n}d in ${label(ph)}`}</span>
      {counting && <span className={'lc-day ' + clock.tone} title={`Day 0 was ${fmt(clock.startedOn)}`}>
        {clock.paused && <PauseCircle size={11} />}Day {clock.day} of {clock.launchDays || '—'}{clock.target ? ` · launch ${fmt(clock.target)}` : ''}</span>}
    </div>
    {waiting.length > 0 && <div className="lc-wait"><b>Waiting on:</b> {waiting.join(', ')}</div>}
    {(row.ctx.contact || next) && <div className="lc-who">
      {row.ctx.contact && <span>Contact: <b>{row.ctx.contact}</b></span>}
      {next && <span title={next.label}>Next: {next.label.length > 28 ? next.label.slice(0, 27) + '…' : next.label}{next.owner ? ` (${next.owner})` : ''}</span>}
    </div>}
    {ph === 'build' && <button className="lc-act" onClick={() => onMove(l.id, 'review')}><Send size={12} />Send for review</button>}
    {ph === 'review' && <button className="lc-act go" onClick={() => onMove(l.id, 'launch')}><Rocket size={12} />Mark launched</button>}
  </div>);
}

/** Dashboard: Overdue / Today / This week, by client, with one-click done,
 *  and the month's launches. */
export function WhatsDue({ rows, me, today, label, onDone, openLead }) {
  const [mine, setMine] = useState(false);
  const d = whatsDue(rows, { today, mine: mine ? me : '' });
  const launches = launchesThisMonth(rows, today);
  return (<div className="card lc-due">
    <div className="lc-due-h">
      <div className="sec-title" style={{ margin: 0 }}><CalendarClock size={15} />What's due</div>
      <div className="seg lc-seg" role="tablist">
        <button role="tab" aria-selected={!mine} className={'seg-b ' + (!mine ? 'on' : '')} onClick={() => setMine(false)}>Everyone</button>
        <button role="tab" aria-selected={mine} className={'seg-b ' + (mine ? 'on' : '')} onClick={() => setMine(true)}>Mine</button>
      </div>
    </div>
    {launches.length > 0 && <div className="lc-launch">
      <span className="lc-launch-t">Launches this month</span>
      {launches.map(x => <button key={x.leadId} className={'lc-chip ' + x.tone} onClick={() => openLead && openLead(x.leadId)}>
        <b>{x.client}</b><span>Day {x.day} of {x.launchDays || '—'} · {fmt(x.target)}{x.paused ? ' · paused' : ''}</span></button>)}
    </div>}
    {!d.count ? <div className="lc-empty">{mine ? 'Nothing due for you this week.' : 'Nothing due this week.'}</div>
      : DUE_GROUPS.map(([k, title]) => d[k].length > 0 && <div key={k} className={'lc-grp ' + k}>
        <div className="lc-grp-h">{title}<i>{d[k].reduce((a, g) => a + g.items.length, 0)}</i></div>
        {d[k].map(g => <div key={g.leadId} className="lc-client">
          <button className="lc-cname" onClick={() => openLead && openLead(g.leadId)}>{g.client}<span className="lc-stage">{label(g.phase)}</span></button>
          {g.items.map(it => <div key={it.id} className="lc-item">
            <button className="lc-done" title="Mark done" aria-label={`Mark done: ${it.label}`} onClick={() => onDone(g.leadId, it)}><CheckCircle2 size={16} /></button>
            <span className="lc-it">{it.label}</span>
            <span className="lc-meta">{it.owner || '—'} · {fmt(it.due)}</span>
          </div>)}
        </div>)}
      </div>)}
  </div>);
}

/** Settings → Client lifecycle: who builds, and the template's dates. */
export function LifecycleSettings({ settings, saveSettings, team }) {
  const cfg = readLifecycle(settings);
  const save = patch => saveSettings({ ...settings, lifecycle: { builder: cfg.builder, template: cfg.template, ...(settings.lifecycle || {}), ...patch } });
  const setItem = (i, p) => save({ template: cfg.template.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  return (<div className="card" style={{ marginBottom: 18 }}>
    <div className="sec-title"><CalendarClock size={15} />Client lifecycle</div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 14 }}>When a client enters a stage, these items get their dates. Day 0 is the day the 14-day clock starts (deposit, onboarding, access, logo and headshot all in). Calendar days. Items marked <b>no date</b> never count against the 14 days.</div>
    {cfg.fellBack.length > 0 && <div className="lc-fb">Using a built-in default for: <b>{cfg.fellBack.join(', ')}</b>. Save below to make it yours.</div>}
    <label className="lc-builder">Builder (owns build items)
      <select value={cfg.builder} onChange={e => save({ builder: e.target.value })} aria-label="Builder">
        <option value="">— the client's owner —</option>{(team || []).map(n => <option key={n} value={n}>{n}</option>)}
      </select></label>
    <div className="lc-tpl">{FLOW.filter(s => cfg.template.some(t => t.stage === s)).map(stage => <div key={stage} className="lc-tpl-s">
      <div className="lc-tpl-h">{stage === 'launch' ? 'Launched' : stage[0].toUpperCase() + stage.slice(1)}</div>
      {cfg.template.map((t, i) => t.stage !== stage ? null : <div key={t.id} className="lc-tpl-r">
        <input value={t.label} aria-label={`Label: ${t.id}`} onChange={e => setItem(i, { label: e.target.value })} />
        {t.excluded ? <span className="lc-nodate">no date</span>
          : Number.isInteger(t.bizDays) ? <span className="lc-nodate">{t.bizDays} business day after submit</span>
          : <label className="lc-dayin">{t.anchor === 'accept' ? 'accept +' : 'Day'}<input type="number" min="0" max="60" value={t.day} aria-label={`Day: ${t.id}`} onChange={e => setItem(i, { day: Math.max(0, Math.min(60, Math.floor(Number(e.target.value) || 0))) })} /></label>}
        <select value={t.owner} aria-label={`Owner: ${t.id}`} onChange={e => setItem(i, { owner: e.target.value })}>{OWNER_ROLES.map(r => <option key={r} value={r}>{r === 'contact' ? 'Point of contact' : 'Builder'}</option>)}</select>
      </div>)}
    </div>)}</div>
    <button className="linkbtn" onClick={() => save({ template: DEFAULT_TEMPLATE })}><RotateCcw size={12} /> Reset dates to defaults</button>
  </div>);
}

export const LIFECYCLE_CSS = `
.lc-strip{margin-top:8px;padding-top:8px;border-top:1px dashed #E3E5EF;display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:#56607A;cursor:default}
.lc-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.lc-in{font-weight:600;color:#3A4160}
.lc-day{display:inline-flex;align-items:center;gap:3px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(43,77,224,.10);color:#2B4DE0}
.lc-day.warn{background:rgba(224,102,43,.14);color:#B4501C}
.lc-day.late{background:rgba(209,67,67,.14);color:#B42F2F}
.lc-wait b,.lc-who b{color:#3A4160}
.lc-who{display:flex;flex-direction:column;gap:2px}
.lc-act{align-self:flex-start;display:inline-flex;align-items:center;gap:5px;margin-top:3px;font:inherit;font-size:11.5px;font-weight:700;border:1px solid #CBD3F5;background:#F3F5FE;color:#2B4DE0;border-radius:8px;padding:4px 9px;cursor:pointer}
.lc-act.go{border-color:#C9E7D6;background:#EFFAF3;color:#14663E}
.lc-due{margin-bottom:18px}
.lc-due-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.lc-launch{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;margin-bottom:12px;border-radius:12px;background:#F6F7FC}
.lc-launch-t{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#56607A;margin-right:4px}
.lc-chip{display:flex;flex-direction:column;align-items:flex-start;gap:1px;font:inherit;font-size:12px;border:1px solid #D7DCF3;background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer;color:#14122B}
.lc-chip span{color:#2B4DE0;font-weight:600;font-size:11.5px}
.lc-chip.warn{border-color:#F2C7AE}.lc-chip.warn span{color:#B4501C}
.lc-chip.late{border-color:#EDB4B4}.lc-chip.late span{color:#B42F2F}
.lc-empty{padding:14px 2px;color:#7A819A;font-size:13px}
.lc-grp{margin-top:6px}
.lc-grp-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#56607A;margin:10px 0 6px}
.lc-grp-h i{font-style:normal;background:#EEF0F7;border-radius:999px;padding:0 7px;color:#3A4160}
.lc-grp.overdue .lc-grp-h{color:#B42F2F}.lc-grp.overdue .lc-grp-h i{background:rgba(209,67,67,.12);color:#B42F2F}
.lc-client{border:1px solid #ECEEF5;border-radius:12px;padding:8px 10px;margin-bottom:8px}
.lc-cname{display:flex;align-items:center;gap:8px;font:inherit;font-weight:700;font-size:13.5px;color:#14122B;background:none;border:0;padding:0 0 4px;cursor:pointer}
.lc-stage{font-size:10.5px;font-weight:700;color:#56607A;background:#F0F1F7;border-radius:999px;padding:1px 7px}
.lc-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:#2A3150;flex-wrap:wrap}
.lc-done{display:inline-flex;border:0;background:none;color:#9AA1B8;cursor:pointer;padding:2px;border-radius:6px}
.lc-done:hover{color:#14663E;background:#EFFAF3}
.lc-it{flex:1;min-width:140px}
.lc-meta{color:#7A819A;font-size:12px;white-space:nowrap}
.lc-fb{font-size:12.5px;color:#8A5A12;background:#FFF6E6;border-radius:10px;padding:8px 10px;margin-bottom:12px}
.lc-builder{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;font-weight:600;margin-bottom:12px}
.lc-tpl{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:10px}
.lc-tpl-s{border:1px solid #ECEEF5;border-radius:12px;padding:10px}
.lc-tpl-h{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#56607A;margin-bottom:6px}
.lc-tpl-r{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;margin-bottom:6px}
.lc-tpl-r input{min-width:0}
.lc-dayin{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#56607A;white-space:nowrap}
.lc-dayin input{width:54px}
.lc-nodate{font-size:11.5px;color:#7A819A;white-space:nowrap}
@media (max-width:520px){.lc-tpl-r{grid-template-columns:1fr 1fr}.lc-tpl-r input:first-child{grid-column:1/-1}.lc-meta{width:100%;padding-left:28px}}
`;
