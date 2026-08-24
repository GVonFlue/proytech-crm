import React, { useState, useMemo, useRef } from 'react';
import {
  BookOpen, Plus, Search, ArrowLeft, Eye, Send, Trash2, Loader2, Lock,
  AlertTriangle, CheckCircle2, FileText, Sparkles, EyeOff, X, Tag,
  ShieldAlert, ChevronRight, Upload,
} from 'lucide-react';
import { BRAND, tint } from './lib/brand';
import {
  KB_CATEGORIES, newKbNote, normKbNote, normKbPub, searchKb, isBehind, behindSummary,
  kbModules, parseBlocks, parseInline, cautionNote, cautionItems, leadOf,
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

/* ============================================================
   THE REP SURFACE — styles.

   NO HEX IN THIS FILE. Every colour is a custom property derived
   from BRAND.colors, the same trade src/ContentStudio.jsx makes
   and for the same reason: a white-label install restyles the
   Playbook by setting env vars, not by editing a component. The
   keyword `white` is not a colour choice, it is paper.

   `tint()` turns one brand hex into the washes, lines and
   shadows the screen needs, so a tenant supplies five colours
   and gets a coherent screen rather than five colours dropped
   onto someone else's greys.
   ============================================================ */
const PB_CSS = `
.pb *{box-sizing:border-box}
.pb-h{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.pb-h h2{margin:0}
.pb-grow{flex:1}

/* ---- module heading ---- */
.pb-mod{margin-top:26px}
.pb-mod:first-of-type{margin-top:14px}
.pb-mod-h{display:flex;align-items:center;gap:9px;margin-bottom:11px}
.pb-mod-h b{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;
  color:var(--pb-dim)}
.pb-mod-h i{flex:1;height:1px;background:var(--pb-line);font-style:normal}
.pb-mod-h u{text-decoration:none;font-size:11px;font-weight:700;color:var(--pb-dim);opacity:.7}

/* ---- tiles ---- */
.pb-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(216px,1fr));gap:10px}
.pb-tile{text-align:left;background:white;border:1px solid var(--pb-line);border-radius:14px;
  padding:15px 15px 13px;cursor:pointer;display:flex;flex-direction:column;gap:7px;
  transition:border-color .12s,box-shadow .12s,transform .12s;font:inherit;color:inherit;width:100%}
.pb-tile:hover{border-color:var(--pb-primary-line);box-shadow:0 10px 24px -20px var(--pb-shadow);
  transform:translateY(-1px)}
.pb-tile strong{font-size:14.5px;line-height:1.32;color:var(--pb-ink);font-weight:700}
.pb-tile span{font-size:12px;line-height:1.45;color:var(--pb-dim)}
.pb-tile .pb-go{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;
  color:var(--pb-primary);margin-top:auto;padding-top:3px}

/* The highest-frequency module gets the biggest target. A rep opening this
   mid-call is reading a trigger phrase, not a title. */
.pb-tiles.lead{grid-template-columns:repeat(auto-fill,minmax(248px,1fr))}
.pb-tiles.lead .pb-tile{padding:18px 17px 15px;background:var(--pb-primary-wash);
  border-color:var(--pb-primary-line)}
.pb-tiles.lead .pb-tile strong{font-size:16.5px}

/* ---- the compliance strip ---- */
.pb-strip{margin-top:18px;border:1px solid var(--pb-warn-line);background:var(--pb-warn-wash);
  border-radius:14px;padding:13px 15px;cursor:pointer;width:100%;text-align:left;font:inherit;
  display:flex;flex-direction:column;gap:9px}
.pb-strip:hover{border-color:var(--pb-warn)}
.pb-strip-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;
  letter-spacing:.13em;text-transform:uppercase;color:var(--pb-warn)}
.pb-strip-h svg{flex:none}
.pb-chips{display:flex;flex-wrap:wrap;gap:6px}
.pb-chip{font-size:11.5px;font-weight:650;color:var(--pb-warn);background:white;
  border:1px solid var(--pb-warn-line);border-radius:999px;padding:3px 10px;line-height:1.5}
.pb-strip-f{font-size:11.5px;color:var(--pb-dim)}

/* ---- one note ---- */
.pb-note{max-width:720px}
.pb-note h1{font-size:23px;line-height:1.25;margin:0;color:var(--pb-ink);font-weight:800;
  letter-spacing:-.015em}
.pb-cat{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;
  color:var(--pb-primary);margin-bottom:7px}

/* SAY — the words out loud. This is the whole point of the screen: on a live
   call the rep reads THIS and nothing else, so it is large, high-contrast and
   physically separated from the reasoning underneath it. */
.pb-say{border-left:3px solid var(--pb-primary);background:var(--pb-primary-wash);
  border-radius:0 12px 12px 0;padding:15px 18px;margin:16px 0}
.pb-say p{margin:0;font-size:18px;line-height:1.52;color:var(--pb-ink);font-weight:600;
  letter-spacing:-.005em}
.pb-say p+p{margin-top:13px;padding-top:13px;border-top:1px solid var(--pb-primary-line)}

/* WHY — secondary by construction. Smaller, lighter, never mistakable for a
   line to read aloud. */
.pb-p{font-size:13.5px;line-height:1.68;color:var(--pb-body);margin:11px 0}
.pb-note h3{font-size:12.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--pb-dim);margin:22px 0 8px}
.pb-ul,.pb-ol{margin:11px 0;padding-left:20px;display:flex;flex-direction:column;gap:6px}
.pb-ul li,.pb-ol li{font-size:13.5px;line-height:1.6;color:var(--pb-body)}
.pb-hr{border:none;border-top:1px solid var(--pb-line);margin:20px 0}
.pb-note code{font-family:ui-monospace,monospace;font-size:12.5px;background:var(--pb-well);
  padding:1px 5px;border-radius:5px}

/* CAUTION — compliance. Reads as a list of rules, never as prose. */
.pb-caution{margin:16px 0;border:1px solid var(--pb-warn-line);background:var(--pb-warn-wash);
  border-radius:12px;padding:6px 4px;display:flex;flex-direction:column}
.pb-caution div{display:flex;gap:9px;align-items:flex-start;padding:9px 13px;font-size:13.5px;
  line-height:1.55;color:var(--pb-body)}
.pb-caution div+div{border-top:1px solid var(--pb-warn-line)}
.pb-caution svg{flex:none;margin-top:2px;color:var(--pb-warn)}
.pb-caution b{color:var(--pb-warn);font-weight:750}

/* Wide content scrolls inside itself. The swap table is six rows of four
   columns and a phone is not four columns wide. */
.pb-tw{overflow-x:auto;margin:16px 0;border:1px solid var(--pb-line);border-radius:12px}
.pb-tw table{border-collapse:collapse;width:100%;min-width:520px}
.pb-tw th{text-align:left;font-size:10.5px;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:var(--pb-dim);padding:10px 13px;background:var(--pb-well);
  border-bottom:1px solid var(--pb-line);white-space:nowrap}
.pb-tw td{font-size:13px;line-height:1.55;color:var(--pb-body);padding:11px 13px;
  border-bottom:1px solid var(--pb-line);vertical-align:top}
.pb-tw tr:last-child td{border-bottom:none}

/* ---- owner status pills ----
   Draft / behind / published, derived from BRAND rather than three hex
   literals. The text colour is mixed TOWARDS ink, not used raw: a brand green
   that reads well as a button is not readable as small text on its own wash,
   and this pill is small text on its own wash. */
.pb-pill.draft{background:var(--pb-well);color:var(--pb-dim)}
.pb-pill.behind{background:var(--pb-gold-wash);color:var(--pb-gold-text)}
.pb-pill.live{background:var(--pb-green-wash);color:var(--pb-green-text)}
`;

const pbVars = {
  '--pb-primary': BRAND.colors.cobalt,
  '--pb-primary-wash': tint(BRAND.colors.cobalt, 0.06),
  '--pb-primary-line': tint(BRAND.colors.cobalt, 0.26),
  '--pb-ink': BRAND.colors.ink,
  '--pb-body': tint(BRAND.colors.ink, 0.78),
  '--pb-dim': tint(BRAND.colors.ink, 0.52),
  '--pb-line': tint(BRAND.colors.ink, 0.11),
  '--pb-well': tint(BRAND.colors.ink, 0.035),
  '--pb-shadow': tint(BRAND.colors.ink, 0.5),
  '--pb-warn': BRAND.colors.red,
  '--pb-warn-wash': tint(BRAND.colors.red, 0.055),
  '--pb-warn-line': tint(BRAND.colors.red, 0.24),
  '--pb-gold-wash': tint(BRAND.colors.gold, 0.16),
  '--pb-gold-text': `color-mix(in srgb, ${BRAND.colors.gold} 58%, ${BRAND.colors.ink})`,
  '--pb-green-wash': tint(BRAND.colors.green, 0.12),
  '--pb-green-text': `color-mix(in srgb, ${BRAND.colors.green} 70%, ${BRAND.colors.ink})`,
};

/* ============================================================ blocks */

/* Inline segments -> elements. Note there is no branch that produces markup
   from a string: `s` is always a text child. */
const Inline = ({ text }) => (
  <>{parseInline(text).map((seg, i) =>
    seg.t === 'b' ? <strong key={i}>{seg.s}</strong>
    : seg.t === 'i' ? <em key={i}>{seg.s}</em>
    : seg.t === 'c' ? <code key={i}>{seg.s}</code>
    : <React.Fragment key={i}>{seg.s}</React.Fragment>)}</>
);

/* One parsed note body. The kind ordering here mirrors lib/kb.js — `say`
   first, because it is the one a reader of this file should notice first. */
function Blocks({ body }) {
  const blocks = useMemo(() => parseBlocks(body), [body]);
  if (!blocks.length) return <div className="empty">This note has no text yet.</div>;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'say') {
          return (
            <div className="pb-say" key={i}>
              {b.paras.map((p, j) => <p key={j}><Inline text={p} /></p>)}
            </div>
          );
        }
        if (b.kind === 'caution') {
          return (
            <div className="pb-caution" key={i}>
              {b.items.map((it, j) => (
                <div key={j}><ShieldAlert size={14} /><span><Inline text={it} /></span></div>
              ))}
            </div>
          );
        }
        if (b.kind === 'h') return <h3 key={i}><Inline text={b.text} /></h3>;
        if (b.kind === 'ul') return <ul className="pb-ul" key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
        if (b.kind === 'ol') return <ol className="pb-ol" key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>;
        if (b.kind === 'hr') return <hr className="pb-hr" key={i} />;
        if (b.kind === 'table') {
          return (
            <div className="pb-tw" key={i}>
              <table>
                <thead><tr>{b.head.map((h, j) => <th key={j}><Inline text={h} /></th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          );
        }
        return <p className="pb-p" key={i}><Inline text={b.text} /></p>;
      })}
    </>
  );
}

/* The first line of a note, for the tile subtitle. Prefers the spoken line —
   on the objection tiles that is the answer itself, so the rep gets a reminder
   of it without opening anything. */
const tileHint = (note) => {
  const bs = parseBlocks(note && note.body);
  const say = bs.find(b => b.kind === 'say');
  const src = say ? (say.paras[0] || '') : (bs.find(b => b.kind === 'p') || {}).text || '';
  const flat = String(src).replace(/[*`>"]/g, '').trim();
  return flat.length > 96 ? flat.slice(0, 95).replace(/\s+\S*$/, '') + '…' : flat;
};

/* Carries `pbVars` itself rather than relying on an ancestor to publish them:
   this pill renders inside the owner list AND inside the editor, and a token
   that resolves on one screen and not the other is a pill that silently loses
   its colour on half its uses. */
const StatusPill = ({ note, pub }) => {
  const kind = (note.status !== 'published' || !pub) ? 'draft' : isBehind(note, pub) ? 'behind' : 'live';
  const label = kind === 'draft' ? 'Draft · only you'
    : kind === 'behind' ? 'Published · behind'
    : 'Published · reps can read';
  return <span className={'pill pb-pill ' + kind} style={pbVars}>{label}</span>;
};

/* ============================================================ rep side */

const Tile = ({ note, onOpen }) => (
  <button className="pb-tile" onClick={() => onOpen(note.id)}>
    <strong>{note.title || 'Untitled'}</strong>
    {(() => { const h = tileHint(note); return h ? <span>{h}</span> : null; })()}
    <span className="pb-go">Open <ChevronRight size={12} /></span>
  </button>
);

/* Reps get this. It reads `pub`, which came from kb_published —
   the only Playbook table their login can select from at all.

   WHAT THIS SCREEN IS FOR, AND THE ONE MEASUREMENT THAT MATTERS

   A rep is on a live call. Someone says "what's the catch." He needs the
   answer in TWO CLICKS: Playbook, then the objection. That is why the
   objections are individual notes rather than sections inside one long note,
   and why the highest-ranked module is rendered first and biggest — a tile
   grid is scannable at a glance, a list of twenty titles is not.

   The compliance list gets a THIRD treatment, neither tile nor prose: a strip
   of headlines he can read without clicking anything, because the moment he
   needs it is the moment he is unsure mid-sentence. Buried at the end of a
   script page it would be read once, on day one, and never again.

   The search box is deliberately below the tiles. Searching is what you do
   when you know what you are looking for and cannot see it; on this screen he
   can usually see it. */
function RepList({ pub }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const all = useMemo(() => (pub || []).map(normKbPub), [pub]);
  const mods = useMemo(() => kbModules(all), [all]);
  const hits = useMemo(() => (q.trim() ? searchKb(all, q) : []), [all, q]);
  const caution = useMemo(() => cautionNote(mods), [mods]);
  const note = open ? all.find(r => r.id === open) : null;

  if (note) {
    const items = cautionItems(note);
    return (
      <div className="card pb">
        <style>{PB_CSS}</style>
        <div style={pbVars}>
          <button className="btn btn-d btn-sm" onClick={() => setOpen(null)}>
            <ArrowLeft size={14} /> Back to the playbook
          </button>
          <div className="pb-note" style={{ marginTop: 18 }}>
            <div className="pb-cat">{note.category}</div>
            <h1>{note.title}</h1>
            <div className="ch-sub" style={{ marginTop: 6 }}>
              {note.tags.length ? note.tags.join(' · ') : null}
              {note.tags.length && note.publishedAt ? ' · ' : ''}
              {note.publishedAt ? 'updated ' + fmtWhen(note.publishedAt) : ''}
            </div>
            <Blocks body={note.body} />
            {/* A compliance note is a reference, so it ends by saying what to do
                when the answer is not on it — the script's own instruction, and
                the thing that keeps a rep from guessing at the edge of it. */}
            {items.length > 0 && (
              <div className="pb-strip-f" style={{ marginTop: 18 }}>
                {items.length} rules. Anything not on this list that you are unsure
                of is an escalation, not a judgement call.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card pb">
      <style>{PB_CSS}</style>
      <div style={pbVars}>
        <div className="pb-h">
          <div className="pb-grow">
            <h2 style={{ margin: 0 }}><BookOpen size={18} /> Playbook</h2>
            <div className="ch-sub">How {BRAND.name} runs a call. Open what you need — it is meant to be used mid-call, not read start to finish.</div>
          </div>
        </div>

        {!all.length && <div className="empty">No notes have been published yet.</div>}

        {/* THE COMPLIANCE STRIP. Above every module except the first, because
            the rule you break is the one you did not remember existed. */}
        {!q.trim() && caution && (() => {
          const leads = cautionItems(caution).map(leadOf).filter(Boolean);
          /* The compliance note is never also a tile — the strip IS its tile.
             It is filtered here as well as in the module map below, because
             the highest-ranked module is the one place it could plausibly
             live and be drawn twice. */
          const first = mods[0];
          const leadNotes = first ? first.notes.filter(n => n.id !== caution.id) : [];
          return (
            <>
              {leadNotes.length > 0 && (
                <div className="pb-mod">
                  <div className="pb-mod-h"><b>{first.key}</b><i /><u>{leadNotes.length}</u></div>
                  <div className="pb-tiles lead">
                    {leadNotes.map(n => <Tile key={n.id} note={n} onOpen={setOpen} />)}
                  </div>
                </div>
              )}
              <button className="pb-strip" onClick={() => setOpen(caution.id)}>
                <div className="pb-strip-h"><ShieldAlert size={14} /> {caution.title}</div>
                {leads.length > 0 && (
                  <div className="pb-chips">{leads.map((l, i) => <span className="pb-chip" key={i}>{l}</span>)}</div>
                )}
                <div className="pb-strip-f">Open the full list <ChevronRight size={11} style={{ verticalAlign: -1 }} /></div>
              </button>
            </>
          );
        })()}

        {/* Every remaining module. The first is drawn above when there is a
            compliance strip to sit under it, and the compliance note itself is
            not repeated as a tile — the strip IS its tile. */}
        {!q.trim() && mods.map((m, mi) => {
          const skipFirst = caution && mi === 0;
          const notes = m.notes.filter(n => !caution || n.id !== caution.id);
          if (skipFirst || !notes.length) return null;
          return (
            <div className="pb-mod" key={m.key}>
              <div className="pb-mod-h"><b>{m.key}</b><i /><u>{notes.length}</u></div>
              <div className={'pb-tiles' + (!caution && mi === 0 ? ' lead' : '')}>
                {notes.map(n => <Tile key={n.id} note={n} onOpen={setOpen} />)}
              </div>
            </div>
          );
        })}

        {all.length > 0 && (
          <div className="afilter" style={{ marginTop: 26 }}>
            <Search size={15} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the playbook" style={{ flex: 1 }} />
            {q && <button className="btn btn-d btn-sm" onClick={() => setQ('')}><X size={13} /></button>}
          </div>
        )}

        {q.trim() && (
          <div style={{ marginTop: 12 }}>
            {!hits.length
              ? <div className="empty">Nothing matches that.</div>
              : <div className="pb-tiles">{hits.map(n => <Tile key={n.id} note={n} onOpen={setOpen} />)}</div>}
          </div>
        )}
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
      <style>{PB_CSS}</style>
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

  /* ---------------------------------------------------------------- import

     Twenty-one notes typed one at a time is most of a morning, and the morning
     it would cost is the one a new rep starts calling. This reads a JSON file
     of notes and creates them as DRAFTS.

     THREE PROPERTIES, ALL OF THEM LOAD-BEARING:

     1. IT CREATES DRAFTS AND CANNOT PUBLISH. There is no call to publishNote
        here. "Nothing publishes itself" is the safety property of this whole
        screen — the owner still reads the preview and presses the button, once
        per note, exactly as before. An importer that published would be a path
        to reps seeing text nobody read.

     2. IT VALIDATES EVERY ROW BEFORE WRITING ANY. CLAUDE.md's rule for patch
        scripts, and the reason is identical: validating as it goes would write
        nine notes, hit a bad tenth, stop, and leave the Playbook half seeded
        with no way to tell which half. Nothing is written until the whole file
        is known to be good.

     3. IT SKIPS TITLES THAT ALREADY EXIST. Re-running is how you find out a
        file was wrong, so re-running must not produce twenty-one duplicates.
        Matched case-insensitively on title, and reported — "skipped 21" and
        "created 21" must never render identically.

     The file lives outside the app on purpose. Bundling ProyTech's script into
     src/ would ship our sales copy to every install that ever buys this. */
  const fileRef = useRef(null);
  const [imp, setImp] = useState(null);   // {ok,msg} | {err}

  const doImport = async (file) => {
    setImp(null);
    if (!file) return;
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { setImp({ err: 'That file is not valid JSON, so nothing was read from it.' }); return; }

    const rows = Array.isArray(parsed) ? parsed : (parsed && parsed.notes);
    if (!Array.isArray(rows) || !rows.length) {
      setImp({ err: 'No notes in that file. Expected {"notes":[{title, category, body}]}.' });
      return;
    }

    /* Validate everything first — see (2) above. */
    const bad = [];
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object') { bad.push(`row ${i + 1}: not an object`); return; }
      if (!String(r.title || '').trim()) bad.push(`row ${i + 1}: no title`);
      if (!String(r.body || '').trim()) bad.push(`row ${i + 1}: "${r.title || '?'}" has no body`);
      if (String(r.body || '').length > 8000) bad.push(`row ${i + 1}: "${r.title}" is over 8,000 characters — Postgres will refuse it`);
    });
    if (bad.length) { setImp({ err: `Nothing was imported. ${bad.length} problem${bad.length === 1 ? '' : 's'}: ` + bad.slice(0, 4).join('; ') + (bad.length > 4 ? '…' : '') }); return; }

    const have = new Set(all.map(n => n.title.trim().toLowerCase()));
    const fresh = rows.filter(r => !have.has(String(r.title).trim().toLowerCase()));
    const skipped = rows.length - fresh.length;

    if (!fresh.length) {
      setImp({ ok: true, msg: `Nothing new — all ${rows.length} notes in that file already exist here by title. None were changed.` });
      return;
    }
    if (!window.confirm(
      `Create ${fresh.length} note${fresh.length === 1 ? '' : 's'} as drafts?` +
      (skipped ? `\n\n${skipped} already exist by title and will be skipped.` : '') +
      `\n\nNothing is published. Reps see none of this until you preview and publish each one.`)) return;

    setBusy(true);
    let made = 0;
    try {
      for (const r of fresh) {
        const n = {
          ...newKbNote(me),
          title: String(r.title).trim(),
          category: String(r.category || 'Process').trim(),
          tags: Array.isArray(r.tags) ? r.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 12) : [],
          body: String(r.body),
        };
        await saveNote(n);
        made++;
      }
      setImp({ ok: true, msg: `Created ${made} draft${made === 1 ? '' : 's'}.` + (skipped ? ` Skipped ${skipped} that already existed.` : '') + ' Nothing is published yet — open each one, preview it, and publish when you are happy.' });
    } catch (e) {
      /* Say how far it got. "It failed" after writing fourteen notes is the
         report that sends someone hunting for a duplicate they cannot name. */
      setImp({ err: `Stopped after creating ${made} of ${fresh.length}. ${(e && e.message) || 'The write failed.'} Re-running skips what already landed.` });
    }
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
      <style>{PB_CSS}</style>
      <div className="hud-top" style={{ alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}><BookOpen size={18} /> Playbook</h2>
          <div className="ch-sub">
            How the business runs. Drafts are yours alone; published notes are readable by every rep
            and are what the assistant answers from.
          </div>
        </div>
        <div className="kgroup" style={{ margin: 0 }}>
          <button className="btn btn-d" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} Import notes
          </button>
          <button className="btn btn-p" onClick={openNew}><Plus size={15} /> New note</button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; doImport(f); }} />

      {imp && imp.err && <div className="mtg-warn" style={{ marginTop: 12 }}><AlertTriangle size={15} /><div>{imp.err}</div></div>}
      {imp && imp.ok && <div className="hli win" style={{ marginTop: 12 }}><CheckCircle2 size={15} /><div>{imp.msg}</div></div>}

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
