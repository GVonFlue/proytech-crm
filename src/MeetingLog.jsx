import React, { useState, useMemo } from 'react';
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, Target, ListTodo, Trash2,
  FileText, Clock, TrendingUp, ShieldAlert, Plus, ArrowLeft,
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

   Two rules this screen exists to enforce:
   1. Claude PROPOSES, you APPROVE. Nothing auto-creates a task.
      The moment the task list fills with junk you stop trusting
      it, and then the whole module is dead weight.
   2. The transcript is written once and never read by anything
      except the person who pasted it. Owner-only at the RLS
      level; see MEETING-MIGRATION.sql.
   ============================================================ */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : '')); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const TIER_LABEL = { now: 'Now', soon: 'Soon', later: 'Later' };

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

    {loops.length > 0 && (
      <div className="card" style={{ marginBottom: 14 }}>
        <h3><Clock size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Still open</h3>
        <div className="ch-sub">Carried forward from previous meetings. The number is how long it has been sitting there.</div>
        <div className="hlist">
          {loops.slice(0, 12).map(x => (
            <div className={'hli ' + (x.weeks >= 3 ? 'bad' : x.weeks >= 2 ? 'warn' : '')} key={x.key}>
              <AlertTriangle size={13} />
              <span>{x.title}</span>
              <b style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{x.weeks} wk{x.weeks === 1 ? '' : 's'} · {x.seen} mtg{x.seen === 1 ? '' : 's'}</b>
            </div>
          ))}
        </div>
      </div>
    )}

    {all.length === 0 ? (
      <div className="hud-empty">
        <FileText size={22} /><b>No meetings logged yet</b>
        <span>Paste a transcript and Claude pulls out the decisions, the action items and the things you keep putting off.</span>
      </div>
    ) : (
      <div className="hlist">
        {all.map(l => (
          <div className="hli" key={l.id} style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setOpenId(l.id)}>
            <FileText size={13} />
            <span style={{ flex: 1 }}>
              <b>{l.extraction.title || 'Untitled meeting'}</b>
              <div style={{ opacity: .75, fontSize: 12, marginTop: 2 }}>{l.extraction.headline}</div>
            </span>
            <b style={{ whiteSpace: 'nowrap', marginLeft: 8 }}>{fmtDate(l.meetingDate)}</b>
          </div>
        ))}
      </div>
    )}
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
      const team = BRAND.team;
      const r = await fetch('/api/meeting-log', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: text, brand: BRAND.name, team, meetingDate: date, priorOpen: [] }),
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
        <div className="hud-d">Paste the transcript. Claude does the rest.</div>
      </div>
      <button className="btn btn-g btn-sm" onClick={onCancel} disabled={busy}><ArrowLeft size={14} />Back</button>
    </div>

    {err && <div className="mtg-warn"><AlertTriangle size={13} /><span>{err}</span></div>}

    <div className="card">
      <div className="r2" style={{ marginBottom: 10 }}>
        <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Source
          <select value={source} onChange={e => setSource(e.target.value)}>
            {MEETING_SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label>Who was there<input value={who} onChange={e => setWho(e.target.value)} placeholder="Garrett, Logan" /></label>
      <label style={{ marginTop: 10 }}>Transcript
        <textarea rows={16} value={text} onChange={e => setText(e.target.value)}
          placeholder="Paste the raw transcript. Messy is fine — no speaker labels needed, filler and side chat get ignored." />
      </label>
      <div className="ch-sub" style={{ marginTop: 6 }}>
        {chars.toLocaleString()} characters
        {chars > 0 && chars < 200 && ' · too short to read'}
        {chars > 120000 && ' · too long, split it into two meetings'}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-p" disabled={!ready || busy} onClick={run}>
          {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {busy ? 'Reading the meeting…' : 'Read it'}
        </button>
      </div>
    </div>
  </>);
}

/* ------------------------------------------------------------------ detail */
function Detail({ log, tasks, saveTasks, deleteLog, onBack }) {
  const e = log.extraction;
  const pending = useMemo(() => pendingActions(log, tasks), [log, tasks]);
  const [picked, setPicked] = useState(() => new Set(pending.filter(a => a.tier === 'now').map(a => a.title)));
  const [added, setAdded] = useState(0);

  const toggle = t => setPicked(p => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const accept = () => {
    const chosen = pending.filter(a => picked.has(a.title));
    if (!chosen.length) return;
    saveTasks([...chosen.map(a => taskFromAction(a, log.id, uid)), ...(tasks || [])]);
    setAdded(chosen.length); setPicked(new Set());
  };

  const remove = () => {
    if (window.confirm('Delete this meeting log? The transcript and the extraction both go. Tasks already created stay.')) deleteLog(log.id);
  };

  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t">{e.title || 'Meeting'}</div>
        <div className="hud-d">{fmtDate(log.meetingDate)} · {log.source}{log.attendees.length ? ' · ' + log.attendees.join(', ') : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-g btn-sm" onClick={onBack}><ArrowLeft size={14} />Back</button>
        <button className="btn btn-g btn-sm" onClick={remove}><Trash2 size={14} />Delete</button>
      </div>
    </div>

    {e.headline && <div className="hud-brief">
      <div className="hb-head">{e.headline}</div>
      {e.summary && <p className="hb-read">{e.summary}</p>}
    </div>}

    {pending.length > 0 && (
      <div className="card" style={{ marginBottom: 14 }}>
        <h3><ListTodo size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Action items</h3>
        <div className="ch-sub">Tick what should become a real task. Nothing is added until you press the button.</div>
        <div className="hlist">
          {pending.map((a, i) => (
            <label className="hli" key={i} style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={picked.has(a.title)} onChange={() => toggle(a.title)} style={{ marginTop: 3 }} />
              <span style={{ flex: 1 }}>
                <b>{a.title}</b>
                <div style={{ opacity: .75, fontSize: 12, marginTop: 2 }}>
                  {a.why}{a.why ? ' · ' : ''}{a.owner}{a.due ? ' · due ' + fmtDate(a.due) : ''}
                </div>
              </span>
              <b style={{ whiteSpace: 'nowrap', marginLeft: 8 }}>{TIER_LABEL[a.tier] || 'Soon'}</b>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button className="btn btn-p" disabled={!picked.size} onClick={accept}>
            <Plus size={15} />Add {picked.size || ''} to Tasks
          </button>
          {added > 0 && <span className="ch-sub"><CheckCircle2 size={13} style={{ verticalAlign: '-2px' }} /> {added} added</span>}
        </div>
      </div>
    )}

    {e.decisions.length > 0 && (
      <div className="card" style={{ marginBottom: 14 }}>
        <h3><Target size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Decisions</h3>
        <div className="hlist">
          {e.decisions.map((d, i) => (
            <div className={'hli ' + (d.status === 'open' ? 'warn' : 'win')} key={i} style={{ alignItems: 'flex-start' }}>
              {d.status === 'open' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              <span style={{ flex: 1 }}>
                <b>{d.decision}</b>
                {d.detail && <div style={{ opacity: .75, fontSize: 12, marginTop: 2 }}>{d.detail}</div>}
                {d.options.map((o, k) => <div key={k} style={{ fontSize: 12, marginTop: 2 }}>{o}</div>)}
              </span>
              <b style={{ marginLeft: 8 }}>{d.status === 'open' ? 'Open' : 'Decided'}</b>
            </div>
          ))}
        </div>
      </div>
    )}

    {e.themes.length > 0 && (
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>What was discussed</h3>
        {e.themes.map((t, i) => (
          <div key={i} style={{ marginTop: i ? 12 : 6 }}>
            <b>{t.title}</b>
            <p style={{ margin: '4px 0 0', opacity: .85 }}>{t.body}</p>
          </div>
        ))}
      </div>
    )}

    <div className="r2">
      {e.numbers.length > 0 && (
        <div className="card">
          <h3><TrendingUp size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Numbers</h3>
          <div className="hlist">
            {e.numbers.map((n, i) => (
              <div className="hli" key={i}>
                <span style={{ flex: 1 }}>{n.label}{n.note ? <span style={{ opacity: .7 }}> — {n.note}</span> : null}</span>
                <b style={{ whiteSpace: 'nowrap' }}>{n.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      {e.risks.length > 0 && (
        <div className="card">
          <h3><ShieldAlert size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Risks</h3>
          <div className="hlist">
            {e.risks.map((r, i) => <div className="hli warn" key={i}><AlertTriangle size={13} /><span>{r}</span></div>)}
          </div>
        </div>
      )}
    </div>
  </>);
}
