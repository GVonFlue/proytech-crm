import React, { useState, useMemo, useEffect } from 'react';
import {
  Mic, ArrowLeft, Loader2, Sparkles, Plus, Trash2, Check, X, AlertTriangle,
  FileText, User, Users, BookOpen, ChevronRight, Clock, Lock, Eye,
} from 'lucide-react';
import { BRAND } from './lib/brand';
import { matchSegment, explainMatch } from './lib/pocketmatch';
import { newMeetingLog, emptyExtraction, todayISO } from './lib/meetinglog';
import { newKbNote } from './lib/kb';

/* ============================================================
   POCKET RECORDING — the source, and what you make from it.
   ------------------------------------------------------------
   One recording is not one note. A Sunday call is ten minutes
   about a client, five about internal decisions and two of
   process worth publishing. So the recording STAYS, permanently,
   and you create one or more outputs from it.

   THREE RULES THIS SCREEN EXISTS TO ENFORCE

   1. NO OUTPUT EVER CARRIES THE TRANSCRIPT. Outputs are prose
      you edited; the recording keeps the only copy of the raw
      text. A client meeting log made here has `transcript: ''`
      by construction, which means a lead-attached log created
      this way has never held a transcript at all.

   2. WHAT COMES OUT IS DERIVED, NOT TRACKED. The outputs list is
      computed by scanning meeting_logs and kb_notes for this
      recording's id. A stored outputs[] array would be a second
      copy of a fact and wrong the moment one was deleted
      (ENGINEERING §2, the same rule meetingLogsOf follows).

   3. AN AMBIGUOUS MATCH OFFERS, IT NEVER PICKS. Two leads named
      Mark Kaufmann is a real case here. Pre-selection is the only
      thing on a proposal card that carries risk, because a
      pre-selected wrong destination turns confirming into a
      rubber stamp.

   Deep extract is the only button that spends anything. Pocket's
   own summary and action items are free — they ran before the
   webhook fired — so they are shown immediately.
   ============================================================ */

const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const fmtDur = s => { const n = Number(s) || 0; if (!n) return ''; const m = Math.round(n / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const dayOf = iso => { const d = new Date(iso); return isNaN(d) ? todayISO() : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const DESTINATIONS = [
  { key: 'client',       label: 'A lead',          icon: User,     needsTarget: true,  hint: 'Filed on their record as a client meeting. Owner-only; nothing reaches a rep until you publish a line yourself.' },
  { key: 'relationship', label: 'A relationship',  icon: Users,    needsTarget: true,  hint: 'Same as a lead, on the relationship’s record.' },
  { key: 'internal',     label: 'Sunday meeting',  icon: Users,    needsTarget: false, hint: 'Feeds the open-loop ladder and the Monday huddle.' },
  { key: 'note',         label: 'Business note',   icon: FileText, needsTarget: false, hint: 'No person attached, and deliberately kept out of the huddle.' },
  { key: 'playbook',     label: 'Playbook draft',  icon: BookOpen, needsTarget: false, hint: 'Saved as an UNPUBLISHED draft. Reps see nothing until you publish it through its own preview.' },
];
const destOf = k => DESTINATIONS.find(d => d.key === k) || DESTINATIONS[3];

/* ---------------------------------------------------- what came out of it */

/** Index every output by the recording it was made from.
 *  Built once per render from data already in memory. Derived, never stored. */
export function outputIndex(mlogs, kbNotes) {
  const m = new Map();
  const add = (o) => {
    const id = o && o.sourcePocketId;
    if (!id) return;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(o);
  };
  (mlogs || []).forEach(l => add({
    id: l.id, kind: l.kind, leadId: l.leadId, sourcePocketId: l.sourcePocketId,
    title: (l.extraction && l.extraction.title) || 'Untitled', where: 'log',
  }));
  (kbNotes || []).forEach(n => add({
    id: n.id, kind: 'playbook', sourcePocketId: n.sourcePocketId,
    title: n.title || 'Untitled', where: 'kb', status: n.status,
  }));
  return m;
}

/* ------------------------------------------------------------- a proposal */

function Proposal({ p, leads, leadName, onCreate, onSkip, busy }) {
  const [dest, setDest] = useState(p.destination);
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [deep, setDeep] = useState(true);
  const [showTargets, setShowTargets] = useState(false);

  /* Matched on THIS segment, not the whole recording. A recording that mentions
     three clients matches all three and can pre-select none of them; a segment
     resolves to one person. Recomputed as the text is edited, and never
     stored. */
  const match = useMemo(() => matchSegment(`${p.target} ${title} ${body}`, leads), [p.target, title, body, leads]);
  const [targetId, setTargetId] = useState(() => (match.best ? match.best.id : ''));

  const d = destOf(dest);
  const needs = d.needsTarget;
  const ready = title.trim() && body.trim() && (!needs || targetId);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="hud-top" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <input value={title} onChange={e => setTitle(e.target.value)}
            style={{ fontWeight: 700, fontSize: 15, width: '100%' }} placeholder="Title" />
          {(p.locator.start || p.locator.quote) && (
            <div className="ch-sub" style={{ marginTop: 4 }}>
              <Clock size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              {p.locator.start ? `≈${p.locator.start}${p.locator.end ? '–' + p.locator.end : ''}` : 'somewhere in this recording'}
              {p.locator.quote ? ` · “${p.locator.quote}”` : ''}
            </div>
          )}
        </div>
        <span className="pill" style={{ background: '#F1F2F8', color: '#5A6178' }}>{p.confidence}</span>
      </div>

      <div className="afilter" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {DESTINATIONS.map(x => (
          <button key={x.key} type="button" className={dest === x.key ? 'on' : ''} onClick={() => setDest(x.key)}>
            <x.icon size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />{x.label}
          </button>
        ))}
      </div>
      <div className="sec-hint" style={{ marginTop: 6 }}>
        {dest === 'playbook' ? <><Lock size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />{d.hint}</> : d.hint}
      </div>

      {needs && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>Which {dest === 'relationship' ? 'relationship' : 'lead'}</label>
          {/* An ambiguous match OFFERS. It never picks — two people called Mark
              Kaufmann is a real case, and a pre-selected wrong destination gets
              confirmed by accident. */}
          <div className="sec-hint" style={{ marginBottom: 6 }}>{explainMatch(match)}</div>
          <div className="afilter" style={{ flexWrap: 'wrap' }}>
            {(match.ambiguous ? match.tied : match.matches).slice(0, 6).map(m => (
              <button key={m.id} type="button" className={targetId === m.id ? 'on' : ''} onClick={() => setTargetId(m.id)}>
                {m.label}{m.lead && m.lead.company && m.lead.company !== m.label ? ` · ${m.lead.company}` : ''}
              </button>
            ))}
            <button type="button" onClick={() => setShowTargets(v => !v)}>
              {match.matches.length ? 'Someone else…' : 'Pick someone'}
            </button>
          </div>
          {showTargets && (
            <select value={targetId} onChange={e => { setTargetId(e.target.value); setShowTargets(false); }} style={{ marginTop: 8 }}>
              <option value="">— pick —</option>
              {(leads || []).filter(l => (dest === 'relationship') === !!l.isRelationship)
                .slice(0, 400).map(l => <option key={l.id} value={l.id}>{l.name || l.company}</option>)}
            </select>
          )}
          {targetId && <div className="sec-hint" style={{ marginTop: 6 }}>Will be filed on <b>{leadName.get(targetId) || 'that record'}</b>.</div>}
        </div>
      )}

      <div className="field full" style={{ marginTop: 12 }}>
        <label>The note <span className="ch-sub" style={{ fontWeight: 400 }}>— edit it before you file it</span></label>
        <textarea rows={7} value={body} onChange={e => setBody(e.target.value)} />
      </div>

      {needs && (
        <label className="sec-hint" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
          <input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            Also run the deep read on this part — the seven fields that show on their record.
            This is the only thing here that costs anything, and it reads <b>this part only</b>,
            not the whole recording.
          </span>
        </label>
      )}

      <div className="kgroup" style={{ marginTop: 14 }}>
        <button className="btn btn-p" disabled={!ready || busy}
          onClick={() => onCreate({ ...p, destination: dest, title: title.trim(), body: body.trim() }, targetId, deep && needs)}>
          {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Create it
        </button>
        <button className="btn btn-d" onClick={onSkip} disabled={busy}><X size={15} /> Skip</button>
      </div>
    </div>
  );
}

/* ================================================================= screen */

export default function Pocket({
  rec, leads, mlogs, kbNotes, me, onClose,
  loadRecording, saveLog, saveKbNote, setStatus, deleteRecording, saveProposals,
}) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [segBusy, setSegBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [manual, setManual] = useState(null);

  const leadName = useMemo(() => {
    const m = new Map();
    (leads || []).forEach(l => m.set(l.id, l.name || l.company || 'Unnamed'));
    return m;
  }, [leads]);

  /* Derived, never stored. Delete an output and it leaves this list without
     the recording row being touched. */
  const outs = useMemo(() => outputIndex(mlogs, kbNotes).get(rec.id) || [], [mlogs, kbNotes, rec.id]);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    loadRecording(rec.id).then(r => {
      if (dead) return;
      setFull(r);
      setProposals(Array.isArray(r && r.proposals) ? r.proposals : []);
      setLoading(false);
    }).catch(() => { if (!dead) { setErr('Could not load that recording.'); setLoading(false); } });
    return () => { dead = true; };
  }, [rec.id, loadRecording]);

  const segment = async () => {
    if (!full || !full.transcript) { setErr('This recording has no transcript yet.'); return; }
    setSegBusy(true); setErr('');
    try {
      const mod = await import('./lib/supabase');
      const sess = await mod.auth.session();
      const tok = (sess && sess.access_token) || '';
      const r = await fetch('/api/pocket-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ transcript: full.transcript }),
      });
      const j = await r.json();
      if (!j.ok) setErr(j.error || 'Could not split that recording.');
      else {
        setProposals(j.proposals);
        /* Cached so reopening this screen does not spend again. Re-running is a
           separate, deliberate press. */
        saveProposals(rec.id, j.proposals).catch(() => {});
      }
    } catch { setErr('Could not reach the assistant.'); }
    setSegBusy(false);
  };

  /* THE ONE PLACE OUTPUTS ARE MADE. Note what is absent from every branch:
     the transcript. An output is the prose the owner just read and edited. */
  /* `onDone` removes the card, and the CALLER supplies it holding the ORIGINAL
     proposal object. The card hands back an edited copy — different title, body
     and destination — so filtering the list by identity against that copy never
     matches, and a proposal that was already filed stays on screen to be filed
     a second time. Found by tests/pocketscreen.mjs, with a green build. */
  const create = async (p, targetId, deep, onDone) => {
    setBusy(true); setErr('');
    const seg = { start: p.locator.start, end: p.locator.end, quote: p.locator.quote };
    try {
      if (p.destination === 'playbook') {
        await saveKbNote({
          ...newKbNote(me),
          title: p.title, body: p.body, category: 'Process',
          sourcePocketId: rec.id, sourceSegment: seg,
        });
      } else {
        const kind = (p.destination === 'client' || p.destination === 'relationship') ? 'client'
          : p.destination === 'note' ? 'note' : 'internal';

        /* The deep read runs on THIS SEGMENT, not the whole recording — so the
           seven fields end up about this client rather than about a Sunday
           morning, and the call producing them never contains the parts of the
           recording that were about something else. */
        let extraction = { ...emptyExtraction(), title: p.title, headline: '', summary: p.body };
        if (deep) {
          try {
            const mod = await import('./lib/supabase');
            const sess = await mod.auth.session();
            const tok = (sess && sess.access_token) || '';
            const r = await fetch('/api/meeting-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
              body: JSON.stringify({
                transcript: p.body, brand: BRAND.name, team: BRAND.team,
                meetingDate: dayOf(full.createdAt || rec.received_at), kind: 'client',
                leadName: leadName.get(targetId) || '', priorOpen: [],
              }),
            });
            const j = await r.json();
            if (j.ok && j.extraction) extraction = j.extraction;
          } catch { /* the note is still worth filing without the deep read */ }
        }

        await saveLog({
          ...newMeetingLog(me, kind),
          leadId: (p.destination === 'client' || p.destination === 'relationship') ? targetId : '',
          meetingDate: dayOf(full.createdAt || rec.received_at),
          source: 'Pocket AI',
          attendees: [],
          transcript: '',                       // never. the recording keeps it.
          extraction,
          sourcePocketId: rec.id,
          sourceSegment: seg,
        });
      }
      if (onDone) onDone();
    } catch (e) { setErr((e && e.message) || 'Could not file that.'); }
    setBusy(false);
  };

  if (loading) return <div className="card"><Loader2 size={16} className="spin" /> Loading the recording…</div>;

  const title = (full && full.title) || 'Untitled recording';

  return (<>
    <div className="hud-top">
      <div>
        <div className="hud-t"><Mic size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />{title}</div>
        <div className="hud-d">
          {fmtDate((full && full.createdAt) || rec.received_at)}
          {full && full.duration ? ` · ${fmtDur(full.duration)}` : ''}
          {full && full.truncated ? ' · transcript truncated' : ''}
          {full && full.deletedInPocket ? ' · deleted in Pocket' : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-g btn-sm" onClick={onClose}><ArrowLeft size={14} />Back</button>
        <button className="btn btn-d btn-sm" onClick={() => setStatus(rec.id, 'done')}><Check size={14} />Done with it</button>
        <button className="btn btn-d btn-sm" onClick={() => {
          if (window.confirm('Delete this recording and its transcript? Anything you already made from it stays where it is.')) {
            deleteRecording(rec.id); onClose();
          }
        }}><Trash2 size={14} />Delete</button>
      </div>
    </div>

    {full && full.idGuessed && (
      <div className="mtg-warn" style={{ marginTop: 12 }}>
        <AlertTriangle size={15} />
        <div>Pocket did not send an id we recognise, so this recording is filed under a
        content hash. It still de-duplicates correctly; the field name just needs confirming.</div>
      </div>
    )}
    {err && <div className="mtg-warn" style={{ marginTop: 12 }}><AlertTriangle size={15} /><div>{err}</div></div>}

    {/* Free, and already done before the webhook fired. */}
    {full && full.summary && (
      <div className="hud-brief" style={{ marginTop: 14 }}>
        <div className="hud-top"><div className="hud-t">Pocket's summary</div></div>
        <div style={{ whiteSpace: 'pre-wrap', padding: '10px 2px', lineHeight: 1.6 }}>{full.summary}</div>
        {!!(full.actionItems || []).length && (
          <div className="hlist">
            {full.actionItems.slice(0, 12).map((a, i) => (
              <div className="hli" key={i}>{typeof a === 'string' ? a : (a && (a.title || a.text)) || JSON.stringify(a)}</div>
            ))}
          </div>
        )}
      </div>
    )}

    <div className="kgroup" style={{ marginTop: 18 }}>What came out of this</div>
    <div className="card">
      {!outs.length && <div className="empty">Nothing made from this recording yet.</div>}
      {!!outs.length && (
        <div className="hlist">
          {outs.map(o => (
            <div className="hli" key={o.where + o.id}>
              <span style={{ flex: 1 }}>
                <b>{o.title}</b>
                <span className="ch-sub" style={{ display: 'block' }}>
                  {o.kind === 'playbook' ? `Playbook draft${o.status === 'published' ? ' · published' : ''}`
                    : o.kind === 'client' ? `On ${leadName.get(o.leadId) || 'a record'}`
                    : o.kind === 'note' ? 'Business note' : 'Sunday meeting'}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="kgroup" style={{ marginTop: 12 }}>
        <button className="btn btn-p" onClick={segment} disabled={segBusy || !(full && full.transcript)}>
          {segBusy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {segBusy ? ' Reading the recording…' : proposals.length ? ' Split it again' : ' Deep extract'}
        </button>
        <button className="btn btn-g" onClick={() => setManual({
          destination: 'note', target: '', title: '', body: '',
          locator: { start: '', end: '', quote: '' }, confidence: 'medium',
        })} disabled={busy}><Plus size={15} /> New output, by hand</button>
      </div>
      <div className="sec-hint" style={{ marginTop: 8 }}>
        Deep extract is the only thing here that spends anything. Making an output by hand
        costs nothing, and the transcript is below to work from.
      </div>
    </div>

    {manual && (<>
      <div className="kgroup" style={{ marginTop: 18 }}>By hand</div>
      <Proposal p={manual} leads={leads} leadName={leadName} busy={busy}
        onCreate={(payload, targetId, deep) => create(payload, targetId, deep, () => setManual(null))}
        onSkip={() => setManual(null)} />
    </>)}

    {!!proposals.length && (<>
      <div className="kgroup" style={{ marginTop: 18 }}>
        Proposed · {proposals.length}
        <span className="td-n">nothing is filed until you press Create</span>
      </div>
      {proposals.map((p, i) => (
        <Proposal key={i + p.title} p={p} leads={leads} leadName={leadName} busy={busy}
          onCreate={(payload, targetId, deep) => create(payload, targetId, deep, () => setProposals(ps => ps.filter(x => x !== p)))}
          onSkip={() => setProposals(ps => ps.filter(x => x !== p))} />
      ))}
    </>)}

    <div className="kgroup" style={{ marginTop: 18 }}>
      <button className="btn btn-d btn-sm" onClick={() => setShowTranscript(v => !v)}>
        <Eye size={14} /> {showTranscript ? 'Hide' : 'Show'} the transcript
      </button>
    </div>
    {showTranscript && (
      <div className="card">
        <div className="sec-hint" style={{ marginBottom: 8 }}>
          <Lock size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          Owner-only, and it stays on this recording — no output ever carries it.
        </div>
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto', lineHeight: 1.6, fontSize: 13 }}>
          {(full && full.transcript) || 'No transcript on this recording yet.'}
        </div>
      </div>
    )}
  </>);
}
