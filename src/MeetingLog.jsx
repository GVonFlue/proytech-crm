import React, { useState, useMemo } from 'react';
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, Target, ListTodo, Trash2,
  FileText, Clock, TrendingUp, ShieldAlert, Plus, ArrowLeft, ChevronRight,
} from 'lucide-react';
import { BRAND } from './lib/brand';
import {
  MEETING_SOURCES, newMeetingLog, normLog, sortLogs, taskFromAction,
  pendingActions, openLoops, todayISO,
} from './lib/meetinglog';

/* ============================================================
   MEETING LOG
   ------------------------------------------------------------
   Paste a transcript, Claude turns it into structured data, you
   approve which action items become real tasks.

   Styling: every class here is one the CRM already ships —
   .card / .fgrid / .field / .hud-brief / .hb-* / .hli / .kgroup /
   .pill / .mtg-warn. Nothing bespoke, so this page inherits any
   future theme change for free. The extraction deliberately reuses
   the Huddle's dark .hud-brief treatment, because it is the same
   kind of object: Claude's read on something, not raw data.

   Two rules this screen exists to enforce:
   1. Claude PROPOSES, you APPROVE. Nothing auto-creates a task.
      The moment the task list fills with junk you stop trusting
      it, and then the whole module is dead weight.
   2. The transcript is written once and never read by anything
      except the person who pasted it (owner-only RLS — see
      MEETING-MIGRATION.sql).
   ============================================================ */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : '')); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

const TIER = {
  now:   { label: 'Now',   bg: 'rgba(209,67,67,.10)',  fg: '#b4322e' },
  soon:  { label: 'Soon',  bg: 'rgba(224,102,43,.10)', fg: '#9a5a16' },
  later: { label: 'Later', bg: '#F1F2F8',              fg: '#8b88a0' },
};
const TierPill = ({ t }) => { const s = TIER[t] || TIER.soon; return <span className="pill" style={{ background: s.bg, color: s.fg }}>{s.label}</span>; };

export default function MeetingLog({ logs, tasks, saveLog, deleteLog, saveTasks, me }) {
  const all = useMemo(() => sortLogs((logs || []).map(normLog)), [logs]);
  const loops = useMemo(() => openLoops(all), [all]);

  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const current = all.find(l => l.id === openId) || null;

  if (adding) return <Composer me={me} onCancel={() => setAdding(false)} onSaved={id => { setAdding(false); setOpenId(id); }} saveLog={saveLog} />;
  if (current) return <Detail log={current} tasks={tasks} saveTasks={saveTasks} deleteLog={id => { deleteLog(id); setOpenId(null); }} onBack={() => setOpenId(null)} />;

  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t">Meeting Log</div>
        <div className="hud-d">{all.length ? `${all.length} meeting${all.length === 1 ? '' : 's'} on record` : 'Nothing logged yet'}</div>
      </div>
      <button className="btn btn-p" onClick={() => setAdding(true)}><Plus size={15} />Log a meeting</button>
    </div>

    {loops.length > 0 && (<>
      <div className="kgroup">Still open</div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Carried forward</h3>
        <div className="ch-sub">Raised in an earlier meeting and still not closed. The count is how long it has been sitting there.</div>
        <div className="hlist">
          {loops.slice(0, 12).map(x => (
            <div className={'hli ' + (x.weeks >= 3 ? 'bad' : x.weeks >= 2 ? 'warn' : '')} key={x.key}>
              <Clock size={13} />
              <span style={{ flex: 1 }}>{x.title}</span>
              <b style={{ whiteSpace: 'nowrap' }}>{x.weeks} wk{x.weeks === 1 ? '' : 's'} · {x.seen} mtg{x.seen === 1 ? '' : 's'}</b>
            </div>
          ))}
        </div>
      </div>
    </>)}

    {all.length === 0 ? (
      <div className="hud-empty">
        <FileText size={22} /><b>No meetings logged yet</b>
        <span>Paste a transcript and Claude pulls out the decisions, the action items, and the things you keep putting off.</span>
      </div>
    ) : (<>
      <div className="kgroup">Every meeting</div>
      <div className="card">
        <div className="hlist" style={{ maxHeight: 'none' }}>
          {all.map(l => (
            <div className="hli" key={l.id} style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setOpenId(l.id)}>
              <FileText size={13} style={{ marginTop: 2 }} />
              <span style={{ flex: 1 }}>
                <b style={{ display: 'block', color: '#181530' }}>{l.extraction.title || 'Untitled meeting'}</b>
                {l.extraction.headline && <span style={{ display: 'block', marginTop: 2 }}>{l.extraction.headline}</span>}
              </span>
              <b style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.meetingDate)}</b>
              <ChevronRight size={14} />
            </div>
          ))}
        </div>
      </div>
    </>)}
  </>);
}

/* ---------------------------------------------------------------- composer */
function Composer({ me, onCancel, onSaved, saveLog }) {
  const [date, setDate] = useState(todayISO());
  const [source, setSource] = useState(MEETING_SOURCES[0]);
  const [who, setWho] = useState(BRAND.team.join(', '));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const chars = text.trim().length;
  const ready = chars >= 200 && chars <= 120000;

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/meeting-log', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: text, brand: BRAND.name, team: BRAND.team, meetingDate: date, priorOpen: [] }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Could not read that transcript.');
      const rec = {
        ...newMeetingLog(me),
        meetingDate: date, source,
        attendees: who.split(',').map(s => s.trim()).filter(Boolean),
        transcript: text, extraction: j.extraction,
      };
      await saveLog(rec);
      onSaved(rec.id);
    } catch (e) { setErr(e.message || 'Something went wrong.'); }
    setBusy(false);
  };

  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t">Log a meeting</div>
        <div className="hud-d">Paste the transcript · Claude does the rest</div>
      </div>
      <button className="btn btn-g btn-sm" onClick={onCancel} disabled={busy}><ArrowLeft size={14} />Back</button>
    </div>

    {err && <div className="mtg-warn"><AlertTriangle size={13} /><span>{err}</span></div>}

    <div className="card">
      <div className="fgrid">
        <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field"><label>Source</label>
          <select value={source} onChange={e => setSource(e.target.value)}>
            {MEETING_SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field full"><label>Who was there</label>
          <input value={who} onChange={e => setWho(e.target.value)} placeholder="Garrett, Logan" />
        </div>
        <div className="field full"><label>Transcript</label>
          <textarea rows={14} value={text} onChange={e => setText(e.target.value)}
            placeholder="Paste the raw transcript. Messy is fine — no speaker labels needed, and filler and side chat get ignored." />
        </div>
      </div>

      <div className="sec-hint" style={{ marginTop: 8 }}>
        {chars.toLocaleString()} characters
        {chars > 0 && chars < 200 ? ' · too short to read' : ''}
        {chars > 120000 ? ' · too long, split it into two meetings' : ''}
      </div>

      <button className="btn btn-p" style={{ marginTop: 14 }} disabled={!ready || busy} onClick={run}>
        {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
        {busy ? 'Reading the meeting…' : 'Read it'}
      </button>
    </div>
  </>);
}

/* ------------------------------------------------------------------ detail */
function Detail({ log, tasks, saveTasks, deleteLog, onBack }) {
  const e = log.extraction;
  const pending = useMemo(() => pendingActions(log, tasks), [log, tasks]);
  const [picked, setPicked] = useState(() => new Set(pending.filter(a => a.tier === 'now').map(a => a.title)));
  const [added, setAdded] = useState(0);

  const toggle = t => setPicked(p => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const accept = () => {
    const chosen = pending.filter(a => picked.has(a.title));
    if (!chosen.length) return;
    saveTasks([...chosen.map(a => taskFromAction(a, log.id, uid)), ...(tasks || [])]);
    setAdded(chosen.length); setPicked(new Set());
  };

  const remove = () => {
    if (window.confirm('Delete this meeting log? The transcript and the extraction both go. Tasks already created stay.')) deleteLog(log.id);
  };

  const openD = e.decisions.filter(d => d.status === 'open');
  const madeD = e.decisions.filter(d => d.status !== 'open');

  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t">{e.title || 'Meeting'}</div>
        <div className="hud-d">{fmtDate(log.meetingDate)} · {log.source}{log.attendees.length ? ' · ' + log.attendees.join(', ') : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-g btn-sm" onClick={onBack}><ArrowLeft size={14} />Back</button>
        <button className="btn btn-d btn-sm" onClick={remove}><Trash2 size={14} />Delete</button>
      </div>
    </div>

    {e.headline && (
      <div className="hud-brief">
        <div className="hb-head">{e.headline}</div>
        {e.summary && <p className="hb-read">{e.summary}</p>}
        {(madeD.length > 0 || e.risks.length > 0) && (
          <div className="hb-cols">
            {madeD.length > 0 && (
              <div className="hb-col win">
                <div className="hb-ct"><CheckCircle2 size={13} />Decided</div>
                {madeD.map((d, i) => <div className="hb-li" key={i}>{d.decision}</div>)}
              </div>
            )}
            {e.risks.length > 0 && (
              <div className="hb-col warn">
                <div className="hb-ct"><ShieldAlert size={13} />Risks</div>
                {e.risks.map((r, i) => <div className="hb-li" key={i}>{r}</div>)}
              </div>
            )}
          </div>
        )}
        {openD.length > 0 && (
          <div className="hb-focus">
            <div className="hb-ct"><Target size={13} />Still undecided</div>
            {openD.map((d, i) => (
              <div className="hb-f" key={i}>
                <b>{d.decision}</b>
                <span>{d.detail}{d.options.length ? '  ·  ' + d.options.join('   ') : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {pending.length > 0 && (<>
      <div className="kgroup">Action items</div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Tick what should become a real task</h3>
        <div className="ch-sub">Nothing reaches your task list until you press the button.</div>
        <div className="hlist" style={{ maxHeight: 'none' }}>
          {pending.map((a, i) => (
            <label className="hli" key={i} style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={picked.has(a.title)} onChange={() => toggle(a.title)} style={{ marginTop: 3, accentColor: '#2B4DE0', flex: 'none' }} />
              <span style={{ flex: 1 }}>
                <b style={{ display: 'block', color: '#181530' }}>{a.title}</b>
                <span style={{ display: 'block', marginTop: 2 }}>
                  {a.why}{a.why ? ' · ' : ''}{a.owner}{a.due ? ' · due ' + fmtDate(a.due) : ''}
                </span>
              </span>
              <TierPill t={a.tier} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-p" disabled={!picked.size} onClick={accept}>
            <ListTodo size={15} />Add {picked.size || ''} to Tasks
          </button>
          {added > 0 && <span className="sec-hint"><CheckCircle2 size={13} style={{ verticalAlign: '-2px' }} /> {added} added</span>}
        </div>
      </div>
    </>)}

    {e.themes.length > 0 && (<>
      <div className="kgroup">What was discussed</div>
      <div className="card" style={{ marginBottom: 18 }}>
        {e.themes.map((t, i) => (
          <div key={i} style={{ marginTop: i ? 16 : 0 }}>
            <b style={{ fontSize: 14, color: '#181530' }}>{t.title}</b>
            <p style={{ margin: '5px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#56527a' }}>{t.body}</p>
          </div>
        ))}
      </div>
    </>)}

    {e.numbers.length > 0 && (<>
      <div className="kgroup">Numbers mentioned</div>
      <div className="card">
        <div className="hlist" style={{ maxHeight: 'none' }}>
          {e.numbers.map((n, i) => (
            <div className="hli" key={i}>
              <TrendingUp size={13} />
              <span style={{ flex: 1 }}>{n.label}{n.note ? <span style={{ opacity: .75 }}> — {n.note}</span> : null}</span>
              <b style={{ whiteSpace: 'nowrap', color: '#181530' }}>{n.value}</b>
            </div>
          ))}
        </div>
      </div>
    </>)}
  </>);
}
