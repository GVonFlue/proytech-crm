import React, { useState, useMemo } from 'react';
import {
  BookOpen, Plus, Search, ArrowLeft, Eye, Send, Trash2, Loader2, Lock,
  AlertTriangle, CheckCircle2, FileText, Sparkles, EyeOff, X, Tag,
} from 'lucide-react';
import {
  KB_CATEGORIES, newKbNote, normKbNote, normKbPub, searchKb, isBehind, behindSummary,
} from './lib/kb';

/* ============================================================
   PLAYBOOK — how we run the business, written down.
   ------------------------------------------------------------
   Owner writes notes. Reps read the published ones. JARVIS
   answers from the published ones.

   THE SECURITY MODEL IS THE FEATURE, AND IT IS NOT IN THIS FILE.

   A rep sees no draft because kb_notes RLS returns them zero
   rows — the same policy shape that gives them zero meeting_logs
   rows today. JARVIS sees published text only because
   kb_ai_context() reads kb_published and does not name kb_notes.
   Both are proved in VERIFY-RLS.md §6 against real logins.

   So this screen is not a gate. Everything below is presentation
   of decisions Postgres already made. Two consequences worth
   holding on to while editing it:

   1. THE PREVIEW IS NOT RENDERED FROM EDITOR STATE. It is
      rendered from kb_preview(), the same function kb_publish()
      inserts FROM. Re-rendering the draft here would be a mockup
      of the truth, and a mockup drifts — which is precisely the
      thing the owner is using the preview to rule out.
   2. NOTHING PUBLISHES ITSELF. kb_publish() is called from one
      button, on a screen you arrive at deliberately.

   Styling reuses classes the CRM already ships (.card / .fgrid /
   .field / .hud-brief / .hb-* / .pill / .btn / .empty), so this
   page inherits any future theme change for free.
   ============================================================ */

const fmtWhen = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const StatusPill = ({ note, pub }) => {
  if (note.status !== 'published' || !pub) {
    return <span className="pill" style={{ background: '#EEF0F6', color: '#5A6178' }}>Draft · only you</span>;
  }
  if (isBehind(note, pub)) {
    return <span className="pill" style={{ background: '#FBEEDC', color: '#9A6410' }}>Published · behind</span>;
  }
  return <span className="pill" style={{ background: '#E4F3EA', color: '#2C7A4B' }}>Published · reps can read</span>;
};

/* ============================================================ rep side */

/* Reps get this. It reads `pub`, which came from kb_published —
   the only Playbook table their login can select from at all. */
function RepList({ pub }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => searchKb((pub || []).map(normKbPub), q), [pub, q]);
  const note = open ? rows.find(r => r.id === open) || (pub || []).map(normKbPub).find(r => r.id === open) : null;

  if (note) {
    return (
      <div className="card">
        <button className="btn btn-d btn-sm" onClick={() => setOpen(null)}><ArrowLeft size={14} /> All notes</button>
        <h2 style={{ marginTop: 14 }}>{note.title}</h2>
        <div className="ch-sub" style={{ marginBottom: 12 }}>
          {note.category}{note.tags.length ? ' · ' + note.tags.join(', ') : ''}
          {note.publishedAt ? ' · updated ' + fmtWhen(note.publishedAt) : ''}
        </div>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.62 }}>{note.body}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2><BookOpen size={18} /> Playbook</h2>
      <div className="ch-sub">How we do things here. Search it before you ask.</div>
      <div className="afilter" style={{ marginTop: 12 }}>
        <Search size={15} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the playbook" style={{ flex: 1 }} />
        {q && <button className="btn btn-d btn-sm" onClick={() => setQ('')}><X size={13} /></button>}
      </div>
      {!rows.length && <div className="empty">{q ? 'Nothing matches that.' : 'No notes have been published yet.'}</div>}
      <div className="hlist" style={{ marginTop: 12 }}>
        {rows.map(n => (
          <div key={n.id} className="hli" onClick={() => setOpen(n.id)} style={{ cursor: 'pointer' }}>
            <div style={{ flex: 1 }}>
              <strong>{n.title}</strong>
              <div className="ch-sub">{n.category}{n.tags.length ? ' · ' + n.tags.join(', ') : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ======================================================== owner: preview */

/* THE PREVIEW. Everything rendered here came back from kb_preview(); nothing
   is read off the draft in memory. The two columns are the point of the
   screen: what crosses, and what does not. */
function Preview({ note, row, onBack, onPublish, publishing, alreadyLive }) {
  const p = normKbPub({ ...row, id: note.id });
  return (
    <div className="card">
      <button className="btn btn-d btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back to the note</button>

      <h2 style={{ marginTop: 14 }}><Eye size={18} /> Exactly what a rep will see</h2>
      <div className="ch-sub">
        Read back from the database, not from the editor — this is the output of
        <code style={{ margin: '0 4px' }}>kb_preview()</code>, the same function
        <code style={{ margin: '0 4px' }}>kb_publish()</code> copies from. They cannot disagree.
      </div>

      <div className="hb-cols" style={{ marginTop: 16 }}>
        <div className="hb-col win" style={{ flex: 2 }}>
          <div className="hb-head"><CheckCircle2 size={15} /> Crosses to reps</div>
          <div className="hud-brief" style={{ marginTop: 10 }}>
            <div className="hud-top">
              <div className="hud-t">{p.title || <em>Untitled</em>}</div>
              <div className="hud-d">{p.category}{p.tags.length ? ' · ' + p.tags.join(', ') : ''}</div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.62, padding: '12px 2px' }}>
              {p.body || <em>This note has no text yet. Publishing it would show a rep an empty note.</em>}
            </div>
          </div>
          <div className="sec-hint" style={{ marginTop: 8 }}>
            {p.body.length.toLocaleString()} characters. Six fields cross, and they are the six columns
            <code style={{ margin: '0 4px' }}>kb_published</code> has — a field that is not a column there
            cannot be published by accident.
          </div>
        </div>

        <div className="hb-col" style={{ flex: 1 }}>
          <div className="hb-head"><Lock size={15} /> Stays with you</div>
          <div className="hlist" style={{ marginTop: 10 }}>
            <div className="hli"><div><strong>Any transcript</strong><div className="ch-sub">There is no transcript column on either table. A recording is read once to draft the text and never stored.</div></div></div>
            <div className="hli"><div><strong>The meeting it came from</strong><div className="ch-sub">{note.sourceLogId ? 'This note was started from a meeting log. Reps cannot read that log, and only its id is kept — no text.' : 'Not started from a meeting.'}</div></div></div>
            <div className="hli"><div><strong>Edits after this</strong><div className="ch-sub">Reps keep seeing this version until you publish again.</div></div></div>
            <div className="hli"><div><strong>Every other note</strong><div className="ch-sub">Drafts return zero rows to a rep's login.</div></div></div>
          </div>
        </div>
      </div>

      <div className="kgroup" style={{ marginTop: 18 }}>
        <button className="btn btn-p" onClick={onPublish} disabled={publishing}>
          {publishing ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
          {alreadyLive ? ' Publish these changes' : ' Publish to reps'}
        </button>
        <button className="btn btn-d" onClick={onBack}>Not yet</button>
      </div>
    </div>
  );
}

/* ========================================================= owner: editor */

function Editor({ note, pub, mlogs, onChange, onSave, onDelete, onPreview, onUnpublish, onBack, saving, busy, err }) {
  const [drafting, setDrafting] = useState(false);
  const [pick, setPick] = useState(false);
  const [draftErr, setDraftErr] = useState('');
  const behind = isBehind(note, pub);

  /* Start from a meeting recording.

     The transcript goes to /api/kb-draft, which reads it once and returns
     prose. That prose lands in the TEXTAREA below and nothing is saved. What
     saves is whatever is in the textarea when the owner presses Save — so the
     thing that reaches the database is text a human wrote and edited, never a
     transcript. Two gates, not one: this does not create a note, and a note is
     not published without the preview screen. */
  const draftFrom = async (log) => {
    setPick(false); setDraftErr(''); setDrafting(true);
    try {
      const mod = await import('./lib/supabase');
      const sess = await mod.auth.session();
      const tok = (sess && sess.access_token) || '';
      const r = await fetch('/api/kb-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ transcript: log.transcript || '' }),
      });
      const j = await r.json();
      if (!j.ok) setDraftErr(j.error || 'That did not come back as a draft.');
      else {
        const d = j.draft || {};
        onChange({
          ...note,
          title: note.title || d.title || '',
          category: d.category || note.category,
          tags: (d.tags && d.tags.length) ? d.tags : note.tags,
          body: d.body || '',
          sourceLogId: log.id,
        });
      }
    } catch { setDraftErr('Could not reach the assistant.'); }
    setDrafting(false);
  };

  const withTranscript = (mlogs || []).filter(l => l && (l.transcript || '').length > 200);

  return (
    <div className="card">
      <button className="btn btn-d btn-sm" onClick={onBack}><ArrowLeft size={14} /> All notes</button>

      <div className="hud-top" style={{ marginTop: 14, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{note.title || 'New note'}</h2>
        <StatusPill note={note} pub={pub} />
      </div>

      {/* The drift indicator. kb_publish() stamps both timestamps from the same
          transaction, so this is silent right after publishing and lights up the
          moment the note is edited afterwards. Without it, two screens disagree
          and nobody can tell. */}
      {behind && (
        <div className="mtg-warn" style={{ marginTop: 12 }}>
          <AlertTriangle size={15} />
          <div>
            <strong>Published version is behind.</strong> Reps are still reading what you
            published on {fmtWhen(pub.publishedAt)}. You have changed {behindSummary(note, pub)} since.
            Preview it to see the difference, then publish when you are happy.
          </div>
        </div>
      )}

      {err && <div className="mtg-warn" style={{ marginTop: 12 }}><AlertTriangle size={15} /><div>{err}</div></div>}

      <div className="fgrid" style={{ marginTop: 14 }}>
        <div className="field full">
          <label>Title</label>
          <input value={note.title} onChange={e => onChange({ ...note, title: e.target.value })}
            placeholder="How to handle the rate-lock objection" />
        </div>
        <div className="field">
          <label>Category</label>
          <input list="kb-cats" value={note.category} onChange={e => onChange({ ...note, category: e.target.value })} />
          <datalist id="kb-cats">{KB_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="field">
          <label>Tags</label>
          <input value={(note.tags || []).join(', ')}
            onChange={e => onChange({ ...note, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
            placeholder="lenders, objections" />
        </div>
        <div className="field full">
          <label>
            The note <span className="ch-sub" style={{ fontWeight: 400 }}>— written for a rep who wasn't there</span>
          </label>
          <textarea rows={16} value={note.body} onChange={e => onChange({ ...note, body: e.target.value })}
            placeholder="When a lender says the rate is locked, ask..." />
          <div className="sec-hint">
            {(note.body || '').length.toLocaleString()} / 8,000 characters.
            {(note.body || '').length > 8000 && ' Postgres will refuse to publish over 8,000 — trim before publishing.'}
          </div>
        </div>
      </div>

      {/* Start from a recording */}
      <div className="kgroup" style={{ marginTop: 6 }}>
        <button className="btn btn-d btn-sm" onClick={() => setPick(v => !v)} disabled={drafting || !withTranscript.length}>
          {drafting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
          {drafting ? ' Reading the recording…' : ' Start from a meeting recording'}
        </button>
        {!withTranscript.length && <span className="sec-hint">No meeting logs with a transcript yet.</span>}
      </div>
      {draftErr && <div className="mtg-warn" style={{ marginTop: 8 }}><AlertTriangle size={15} /><div>{draftErr}</div></div>}
      {pick && (
        <div className="hlist" style={{ marginTop: 10 }}>
          <div className="sec-hint" style={{ padding: '4px 2px' }}>
            The recording is read once to draft the text below. It is not saved on this note, and what
            saves is whatever you leave in the box after editing it.
          </div>
          {withTranscript.slice(0, 20).map(l => (
            <div key={l.id} className="hli" style={{ cursor: 'pointer' }} onClick={() => draftFrom(l)}>
              <div style={{ flex: 1 }}>
                <strong>{(l.extraction && l.extraction.title) || 'Untitled meeting'}</strong>
                <div className="ch-sub">{l.meetingDate} · {(l.transcript || '').length.toLocaleString()} characters</div>
              </div>
              <FileText size={15} />
            </div>
          ))}
        </div>
      )}

      <div className="kgroup" style={{ marginTop: 18 }}>
        <button className="btn btn-p" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 size={15} className="spin" /> : null} Save
        </button>
        <button className="btn btn-g" onClick={onPreview} disabled={busy || !note.id}>
          <Eye size={15} /> Preview what a rep sees
        </button>
        {note.status === 'published' && (
          <button className="btn btn-d" onClick={onUnpublish} disabled={busy}>
            <EyeOff size={15} /> Unpublish
          </button>
        )}
        <button className="btn btn-d" onClick={onDelete} disabled={busy}><Trash2 size={15} /> Delete</button>
      </div>
      <div className="sec-hint" style={{ marginTop: 8 }}>
        Saving never publishes. Publishing happens on the preview screen, after you have read
        what crosses.
      </div>
    </div>
  );
}

/* ================================================================= screen */

export default function Playbook({
  notes, pub, mlogs, rep, me,
  saveNote, deleteNote, previewNote, publishNote, unpublishNote,
}) {
  const [view, setView] = useState('list');       // list | edit | preview
  const [draft, setDraft] = useState(null);
  const [row, setRow] = useState(null);           // what kb_preview() returned
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  /* Hooks first, ALWAYS. The rep branch returns below rather than here: a
     conditional return above a useMemo is a rules-of-hooks violation, and the
     failure mode is a "rendered fewer hooks than expected" crash the first
     time the branch flips — with a perfectly green build. ENGINEERING.md §1
     is a list of exactly this kind of bug. */
  const all = useMemo(() => (notes || []).map(normKbNote), [notes]);
  const pubById = useMemo(() => {
    const m = {};
    for (const p of (pub || [])) { const n = normKbPub(p); m[n.id] = n; }
    return m;
  }, [pub]);
  const rows = useMemo(() => searchKb(all, q), [all, q]);
  const behindCount = all.filter(n => isBehind(n, pubById[n.id])).length;

  /* A rep never reaches the owner screens. They also never reach the DATA
     behind them: `notes` is whatever db.getKbNotes() returned, which for a rep
     is an empty array, because kb_notes RLS gives them zero rows. This line is
     a routing decision, not a security one. */
  if (rep) return <RepList pub={pub} />;

  const openNew = () => { setDraft(newKbNote(me)); setErr(''); setView('edit'); };
  const openNote = n => { setDraft({ ...n }); setErr(''); setView('edit'); };

  const doSave = async () => {
    if (!draft) return;
    setSaving(true); setErr('');
    /* Adopt what the save returned. Keeping the pre-save copy would leave the
       editor's updatedAt behind the note that is actually stored, and the
       drift indicator reads exactly that field. */
    try { const saved = await saveNote(draft); if (saved) setDraft(saved); }
    catch (e) { setErr((e && e.message) || 'Could not save that.'); }
    setSaving(false);
  };

  /* Save first, THEN read the preview back. kb_preview() reads the database,
     so previewing unsaved edits would faithfully show the previous text and
     the owner would rightly conclude the preview is broken. */
  const doPreview = async () => {
    if (!draft) return;
    setBusy(true); setErr('');
    try {
      const saved = await saveNote(draft);
      if (saved) setDraft(saved);
      const r = await previewNote(draft.id);
      if (!r) { setErr('The preview came back empty. Has KB-MIGRATION.sql been run on this install?'); }
      else { setRow(r); setView('preview'); }
    } catch (e) { setErr((e && e.message) || 'Could not read the preview back.'); }
    setBusy(false);
  };

  const doPublish = async () => {
    if (!draft) return;
    setBusy(true); setErr('');
    try { await publishNote(draft.id); setDraft(d => ({ ...d, status: 'published' })); setView('edit'); }
    catch (e) { setErr((e && e.message) || 'Could not publish that.'); setView('edit'); }
    setBusy(false);
  };

  const doUnpublish = async () => {
    if (!draft) return;
    if (!window.confirm('Take this note back from the reps? They stop seeing it immediately. Your draft is untouched.')) return;
    setBusy(true); setErr('');
    try { await unpublishNote(draft.id); setDraft(d => ({ ...d, status: 'draft' })); }
    catch (e) { setErr((e && e.message) || 'Could not unpublish that.'); }
    setBusy(false);
  };

  const doDelete = async () => {
    if (!draft) return;
    const live = draft.status === 'published';
    if (!window.confirm(live
      ? 'Delete this note? It is published, so reps lose access to it at the same moment.'
      : 'Delete this note? It has never been published, so nobody else has ever seen it.')) return;
    setBusy(true);
    try { await deleteNote(draft.id); setView('list'); setDraft(null); }
    catch (e) { setErr((e && e.message) || 'Could not delete that.'); }
    setBusy(false);
  };

  if (view === 'preview' && draft) {
    return <Preview note={draft} row={row} onBack={() => setView('edit')} onPublish={doPublish}
      publishing={busy} alreadyLive={draft.status === 'published'} />;
  }

  if (view === 'edit' && draft) {
    return <Editor note={draft} pub={pubById[draft.id]} mlogs={mlogs} onChange={setDraft}
      onSave={doSave} onDelete={doDelete} onPreview={doPreview} onUnpublish={doUnpublish}
      onBack={() => { setView('list'); setDraft(null); }} saving={saving} busy={busy} err={err} />;
  }

  return (
    <div className="card">
      <div className="hud-top" style={{ alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}><BookOpen size={18} /> Playbook</h2>
          <div className="ch-sub">
            How the business runs. Drafts are yours alone; published notes are readable by every rep
            and are what the assistant answers from.
          </div>
        </div>
        <button className="btn btn-p" onClick={openNew}><Plus size={15} /> New note</button>
      </div>

      {behindCount > 0 && (
        <div className="mtg-warn" style={{ marginTop: 12 }}>
          <AlertTriangle size={15} />
          <div>{behindCount === 1 ? 'One note has' : `${behindCount} notes have`} edits reps cannot see yet.</div>
        </div>
      )}

      <div className="afilter" style={{ marginTop: 12 }}>
        <Search size={15} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your notes" style={{ flex: 1 }} />
        {q && <button className="btn btn-d btn-sm" onClick={() => setQ('')}><X size={13} /></button>}
      </div>

      {!rows.length && <div className="empty">{q ? 'Nothing matches that.' : 'Nothing written down yet. The first one is usually the thing you explain most often.'}</div>}

      <div className="hlist" style={{ marginTop: 12 }}>
        {rows.map(n => (
          <div key={n.id} className="hli" onClick={() => openNote(n)} style={{ cursor: 'pointer' }}>
            <div style={{ flex: 1 }}>
              <strong>{n.title || 'Untitled'}</strong>
              <div className="ch-sub">
                {n.category}
                {n.tags.length ? ' · ' + n.tags.join(', ') : ''}
                {n.updatedAt ? ' · edited ' + fmtWhen(n.updatedAt) : ''}
              </div>
            </div>
            <StatusPill note={n} pub={pubById[n.id]} />
          </div>
        ))}
      </div>
    </div>
  );
}
