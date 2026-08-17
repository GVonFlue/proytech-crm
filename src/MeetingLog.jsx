import React, { useState, useMemo } from 'react';
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, Target, ListTodo, Trash2,
  FileText, Clock, TrendingUp, ShieldAlert, Plus, ArrowLeft, ChevronRight,
  User, Users, Lock, Send, Search, X,
} from 'lucide-react';
import { BRAND } from './lib/brand';
import {
  MEETING_SOURCES, newMeetingLog, normLog, sortLogs, taskFromAction,
  pendingActions, openLoops, todayISO, internalLogs,
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

   Two kinds of meeting share this screen:
   INTERNAL — the Sunday CEO meeting. Stays in meeting_logs, feeds
     the open-loop ladder and the huddle. Nothing leaves the table.
   CLIENT   — attached to a lead. Its summary is DERIVED onto that
     lead's record; only a line you write and publish by hand ever
     becomes something a rep can read.

   Three rules this screen exists to enforce:
   1. Claude PROPOSES, you APPROVE. Nothing auto-creates a task.
      The moment the task list fills with junk you stop trusting
      it, and then the whole module is dead weight.
   2. The transcript is written once and never read by anything
      except the person who pasted it (owner-only RLS — see
      MEETING-MIGRATION.sql). It never reaches a lead.
   3. Nothing crosses into rep-readable data without a human
      pressing a button. See the publish card in Detail.
   ============================================================ */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : '')); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

const TIER = {
  now:   { label: 'Now',   bg: 'rgba(209,67,67,.10)',  fg: '#b4322e' },
  soon:  { label: 'Soon',  bg: 'rgba(224,102,43,.10)', fg: '#9a5a16' },
  later: { label: 'Later', bg: '#F1F2F8',              fg: '#8b88a0' },
};
const TierPill = ({ t }) => { const s = TIER[t] || TIER.soon; return <span className="pill" style={{ background: s.bg, color: s.fg }}>{s.label}</span>; };

export default function MeetingLog({ logs, tasks, leads, saveLog, deleteLog, saveTasks, publishToLead, me }) {
  const all = useMemo(() => sortLogs((logs || []).map(normLog)), [logs]);
  /* the ladder reads internal meetings only — a fortnight of client calls
     would bury the thing that has been open four weeks */
  const loops = useMemo(() => openLoops(all), [all]);
  const leadName = useMemo(() => {
    const m = new Map();
    (leads || []).forEach(l => m.set(l.id, l.name || l.company || 'Unnamed lead'));
    return m;
  }, [leads]);

  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [kindFilter, setKindFilter] = useState('all');
  const current = all.find(l => l.id === openId) || null;

  const shown = kindFilter === 'all' ? all : all.filter(l => (kindFilter === 'client' ? l.kind === 'client' : l.kind !== 'client'));
  const nInternal = internalLogs(all).length;
  const nClient = all.length - nInternal;

  if (adding) return <Composer me={me} leads={leads} onCancel={() => setAdding(false)} onSaved={id => { setAdding(false); setOpenId(id); }} saveLog={saveLog} />;
  if (current) return <Detail log={current} tasks={tasks} saveTasks={saveTasks} leadName={leadName.get(current.leadId) || ''}
    publishToLead={publishToLead} me={me} deleteLog={id => { deleteLog(id); setOpenId(null); }} onBack={() => setOpenId(null)} />;

  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t">Meeting Log</div>
        <div className="hud-d">{all.length ? `${all.length} meeting${all.length === 1 ? '' : 's'} on record` : 'Nothing logged yet'}</div>
      </div>
      <button className="btn btn-p" onClick={() => setAdding(true)}><Plus size={15} />Log a meeting</button>
    </div>

    {/* Only worth showing once both kinds exist — a filter row over one kind
        of thing is noise. Counts sit on the chips so this doubles as the tally. */}
    {nClient > 0 && nInternal > 0 && (
      <div className="afilter" style={{ marginBottom: 14 }}>
        <button className={kindFilter === 'all' ? 'on' : ''} onClick={() => setKindFilter('all')}>All ({all.length})</button>
        <button className={kindFilter === 'internal' ? 'on' : ''} onClick={() => setKindFilter('internal')}>Internal ({nInternal})</button>
        <button className={kindFilter === 'client' ? 'on' : ''} onClick={() => setKindFilter('client')}>Client ({nClient})</button>
      </div>
    )}

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
          {shown.map(l => { const cl = l.kind === 'client'; return (
            <div className="hli" key={l.id} style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setOpenId(l.id)}>
              {cl ? <User size={13} style={{ marginTop: 2 }} /> : <Users size={13} style={{ marginTop: 2 }} />}
              <span style={{ flex: 1 }}>
                <b style={{ display: 'block', color: '#181530' }}>{l.extraction.title || 'Untitled meeting'}</b>
                {cl && <span style={{ display: 'block', marginTop: 2, fontWeight: 600, color: '#2B4DE0' }}>
                  {leadName.get(l.leadId) || 'Lead no longer on file'}
                </span>}
                {l.extraction.headline && <span style={{ display: 'block', marginTop: 2 }}>{l.extraction.headline}</span>}
              </span>
              {cl && (l.shared.text
                ? <span className="pill" style={{ background: 'rgba(43,77,224,.10)', color: '#2B4DE0' }}>On the lead</span>
                : <span className="pill" style={{ background: '#F1F2F8', color: '#8b88a0' }}>Private</span>)}
              <b style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.meetingDate)}</b>
              <ChevronRight size={14} />
            </div>
          ); })}
          {!shown.length && <div className="empty" style={{ padding: '18px 0' }}>No {kindFilter} meetings logged yet.</div>}
        </div>
      </div>
    </>)}
  </>);
}

/* ---------------------------------------------------------------- composer */
function Composer({ me, leads, onCancel, onSaved, saveLog }) {
  const [kind, setKind] = useState('internal');
  const [leadId, setLeadId] = useState('');
  const [q, setQ] = useState('');
  const [date, setDate] = useState(todayISO());
  const [source, setSource] = useState(MEETING_SOURCES[0]);
  const [who, setWho] = useState(BRAND.team.join(', '));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const client = kind === 'client';
  const lead = (leads || []).find(l => l.id === leadId) || null;

  /* Capped at eight. A picker that renders every lead in the install is slow
     at a thousand and useless at ten thousand — type more and narrow it. */
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return (leads || []).filter(l =>
      String(l.name || '').toLowerCase().includes(s) ||
      String(l.company || '').toLowerCase().includes(s) ||
      String(l.email || '').toLowerCase().includes(s)).slice(0, 8);
  }, [q, leads]);

  const chars = text.trim().length;
  /* A client meeting with no lead attached has nowhere to go, so it is not a
     valid record — block it here rather than saving an orphan. */
  const ready = chars >= 200 && chars <= 120000 && (!client || !!lead);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/meeting-log', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript: text, brand: BRAND.name, team: BRAND.team, meetingDate: date,
          kind, leadName: lead ? (lead.name || lead.company || '') : '', priorOpen: [],
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Could not read that transcript.');
      const rec = {
        ...newMeetingLog(me, kind),
        leadId: client && lead ? lead.id : '',
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
      {/* Kind first, because it changes what Claude is asked to look for and
          where the result can end up. Everything below reads differently
          depending on this one choice, so it cannot be buried. */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label>What kind of meeting</label>
        <div className="afilter" style={{ marginTop: 6 }}>
          <button type="button" className={!client ? 'on' : ''} onClick={() => setKind('internal')}>
            <Users size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />Internal
          </button>
          <button type="button" className={client ? 'on' : ''} onClick={() => setKind('client')}>
            <User size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />Client
          </button>
        </div>
        <div className="sec-hint" style={{ marginTop: 8 }}>
          {client
            ? <><Lock size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />Attached to a lead and read back on their record. The transcript still never leaves this table, and nothing reaches a rep until you publish a line yourself.</>
            : <><Lock size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />Owner-only, exactly as it is now. Feeds the open-loop ladder and the Monday huddle. Nothing leaves this table.</>}
        </div>
      </div>

      {client && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Which lead</label>
          {lead ? (
            <div className="hli" style={{ marginTop: 4 }}>
              <User size={13} />
              <span style={{ flex: 1 }}>
                <b style={{ color: '#181530' }}>{lead.name || 'Unnamed lead'}</b>
                {lead.company ? <span style={{ opacity: .75 }}> · {lead.company}</span> : null}
              </span>
              <button type="button" className="btn btn-g btn-sm" onClick={() => { setLeadId(''); setQ(''); }}><X size={13} />Change</button>
            </div>
          ) : (<>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, company or email" />
            {matches.length > 0 && (
              <div className="hlist" style={{ maxHeight: 240, marginTop: 6 }}>
                {matches.map(l => (
                  <div className="hli" key={l.id} style={{ cursor: 'pointer' }} onClick={() => { setLeadId(l.id); setQ(''); }}>
                    <Search size={13} />
                    <span style={{ flex: 1 }}>
                      <b style={{ color: '#181530' }}>{l.name || 'Unnamed lead'}</b>
                      {l.company ? <span style={{ opacity: .75 }}> · {l.company}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {q.trim() && !matches.length && <div className="sec-hint" style={{ marginTop: 6 }}>No lead matches that.</div>}
          </>)}
        </div>
      )}

      <div className="fgrid">
        <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field"><label>Source</label>
          <select value={source} onChange={e => setSource(e.target.value)}>
            {MEETING_SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field full"><label>Who was there</label>
          <input value={who} onChange={e => setWho(e.target.value)} placeholder={client ? 'Garrett, and who was on the client side' : 'Garrett, Logan'} />
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
        {client && !lead ? ' · pick a lead before reading it' : ''}
      </div>

      <button className="btn btn-p" style={{ marginTop: 14 }} disabled={!ready || busy} onClick={run}>
        {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
        {busy ? 'Reading the meeting…' : 'Read it'}
      </button>
    </div>
  </>);
}

/* ------------------------------------------------------------------ detail */
function Detail({ log, tasks, saveTasks, leadName, publishToLead, me, deleteLog, onBack }) {
  const e = log.extraction;
  const client = log.kind === 'client';
  const pending = useMemo(() => pendingActions(log, tasks), [log, tasks]);
  const [picked, setPicked] = useState(() => new Set(pending.filter(a => a.tier === 'now').map(a => a.title)));
  const [added, setAdded] = useState(0);
  /* Seeded from the headline because that is the one line already written to
     be read on its own. It is a starting point, not the thing that gets
     published — the owner edits it before it goes anywhere. */
  const [share, setShare] = useState(log.shared.text || e.headline || '');
  const [pubBusy, setPubBusy] = useState(false);
  const [pubErr, setPubErr] = useState('');

  const publish = async () => {
    const t = share.trim();
    if (!t) return;
    setPubBusy(true); setPubErr('');
    try { await publishToLead(log, t); }
    catch (err) { setPubErr((err && err.message) || 'Could not add that to the lead.'); }
    setPubBusy(false);
  };

  const toggle = t => setPicked(p => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const accept = () => {
    const chosen = pending.filter(a => picked.has(a.title));
    if (!chosen.length) return;
    saveTasks([...chosen.map(a => taskFromAction(a, log.id, uid)), ...(tasks || [])]);
    setAdded(chosen.length); setPicked(new Set());
  };

  const remove = () => {
    /* Say exactly what survives. The summary on the lead is derived, so it
       leaves with the log — but a published line is a real activity that was
       written to the lead, and deleting this row does not reach in and remove
       it. Finding that out afterwards is how you end up with a line on a lead
       and no idea where it came from. */
    const extra = client
      ? (log.shared.text
        ? `\n\nThe summary on ${leadName || 'the lead'}'s record goes with it. The line you published to their activity feed STAYS — remove that from the lead itself.`
        : `\n\nThe summary on ${leadName || 'the lead'}'s record goes with it. Nothing was published to their feed.`)
      : '';
    if (window.confirm('Delete this meeting log? The transcript and the extraction both go. Tasks already created stay.' + extra)) deleteLog(log.id);
  };

  const openD = e.decisions.filter(d => d.status === 'open');
  const madeD = e.decisions.filter(d => d.status !== 'open');

  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t">{e.title || 'Meeting'}</div>
        <div className="hud-d">
          {client && <b style={{ color: '#2B4DE0' }}>{leadName || 'Lead no longer on file'} · </b>}
          {fmtDate(log.meetingDate)} · {log.source}{log.attendees.length ? ' · ' + log.attendees.join(', ') : ''}
        </div>
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

    {client && (<>
      <div className="kgroup">On the lead</div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>What {leadName || 'this lead'}&rsquo;s record shows</h3>
        <div className="ch-sub">
          The summary above is already on their record and updates itself whenever you edit this log — it is read from here, not copied.
          <b> You are the only one who can see it.</b> If a rep should know something from this meeting, write that line below.
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Line for the lead&rsquo;s activity feed</label>
          <textarea rows={3} value={share} onChange={ev => setShare(ev.target.value)}
            placeholder="One or two sentences a rep can act on. Nothing candid." />
        </div>

        <div className="mtg-warn" style={{ marginTop: 10 }}>
          <AlertTriangle size={13} />
          <span>Whoever owns this lead can read this line. Everything else in this log stays owner-only.</span>
        </div>

        {pubErr && <div className="mtg-warn" style={{ marginTop: 10 }}><AlertTriangle size={13} /><span>{pubErr}</span></div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-p" disabled={!share.trim() || pubBusy || !log.leadId} onClick={publish}>
            {pubBusy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            {log.shared.text ? 'Update the line on the lead' : 'Add to lead'}
          </button>
          {log.shared.text && (
            <span className="sec-hint">
              <CheckCircle2 size={13} style={{ verticalAlign: '-2px' }} /> Published {log.shared.at ? fmtDate(log.shared.at.slice(0, 10)) : ''}{log.shared.by ? ' by ' + log.shared.by : ''}
            </span>
          )}
          {!log.leadId && <span className="sec-hint">This log has no lead attached.</span>}
        </div>
      </div>
    </>)}

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
