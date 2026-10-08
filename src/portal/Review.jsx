/* THE CLIENT PORTAL'S REVIEW AREA (B-2): the preview site, pins and notes,
   rounds (Terms 3.4), and "Approve my site".

   The preview site is framed ONLY when its URL is https and on a host
   Settings → Site review allows (lib/review previewOk). The page talks to the
   frame's review script (/review.js) with postMessage, aimed at the preview's
   own origin, after a one-time nonce handshake that names the exact host;
   anything from another window, origin or nonce is ignored.

   What a client can read and write is decided in Postgres: portal_review()
   and portal_note_save() find the lead from the session alone. Submitting,
   approving, deleting and uploads go to api/portal-review.js with the
   session's token, and that route finds the lead from the session too. The
   client types every note HERE, never into the third-party page. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { previewOk, roundsModel, groupByPage, statusLabel, progressOf } from '../lib/review.js';

const fmt = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const nonceOf = () => { const a = new Uint8Array(16); (globalThis.crypto || window.crypto).getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
const dataUrlBlob = u => { const m = /^data:([^;]+);base64,(.*)$/.exec(String(u || '')); if (!m) return null; const bin = atob(m[2]); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: m[1] }); };
const extOfType = t => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[t] || '';

/** The pins the frame draws: this round's site notes on this page, numbered
 *  in the order they were left. */
export function pinsFor(notes, roundId, path) {
  const mine = (notes || []).filter(n => n.round_id === roundId && n.kind === 'site').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return mine.map((n, i) => ({ n: i + 1, note: n })).filter(x => x.note.path === path)
    .map(x => ({ n: x.n, selector: x.note.selector, x_pct: x.note.x_pct, y_pct: x.note.y_pct, done: x.note.status !== 'open' }));
}

function putFile(url, blob, name) {
  return new Promise(resolve => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new File([blob], name, { type: blob.type }));
      xhr.send(fd);
    } catch { resolve(false); }
  });
}

export default function Review({ client, session, review, reload, products, firstName }) {
  const [device, setDevice] = useState('desktop');
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const [path, setPath] = useState('/');
  const [draft, setDraft] = useState(null);      // { pin, key, shot, comment, file, useShot }
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(null);        // { id, comment }
  const [links, setLinks] = useState({});
  const [approving, setApproving] = useState(false);
  const [name, setName] = useState('');
  const [suiteText, setSuiteText] = useState('');
  const frame = useRef(null);
  const nonce = useRef('');

  const m = useMemo(() => roundsModel(review), [review]);
  const chk = useMemo(() => (review && review.preview_url ? previewOk(review.preview_url, review.hosts) : { ok: false }), [review]);
  const notes = (review && review.notes) || [];
  const cur = m.current;
  const curNotes = cur ? notes.filter(n => n.round_id === cur.id) : [];
  const open = !!m.open && !m.approved;
  const hasSuite = (products || []).includes('suite');

  const api = async body => {
    try {
      const r = await fetch('/api/portal-review', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok && j.ok !== false, ...j };
    } catch { return { ok: false, error: 'Could not reach us. Check your connection and try again.' }; }
  };
  const post = msgOut => { const w = frame.current && frame.current.contentWindow; if (w && chk.ok) w.postMessage({ src: 'pt-portal', nonce: nonce.current, ...msgOut }, chk.origin); };

  /* the images on notes: five-minute links, fetched when the notes change */
  useEffect(() => { if (!notes.some(n => n.has_shot || n.has_attach)) return; api({ action: 'files' }).then(j => j.ok && setLinks(j.links || {})); /* eslint-disable-next-line */ }, [review]);

  /* the frame's messages: only from THAT window, THAT origin, THIS nonce */
  useEffect(() => {
    if (!chk.ok) return undefined;
    const on = e => {
      const w = frame.current && frame.current.contentWindow;
      if (!w || e.source !== w || e.origin !== chk.origin) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || d.src !== 'pt-review' || d.nonce !== nonce.current) return;
      if (d.type === 'ready' || d.type === 'page') { setReady(true); setPath(String(d.path || '/').slice(0, 500)); }
      else if (d.type === 'pin' && d.pin && typeof d.pin === 'object') {
        setPicking(false);
        setDraft({ key: String(d.key || ''), pin: d.pin, shot: null, shotPending: true, comment: '', file: null, useShot: true });
      } else if (d.type === 'shot') {
        setDraft(x => (x && x.key === d.key ? { ...x, shotPending: false, shot: typeof d.data === 'string' && /^data:image\/jpeg;base64,/.test(d.data) ? d.data : null } : x));
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [chk.ok, chk.origin]);
  /* keep the frame's pins in step with the notes and the page */
  useEffect(() => { if (ready && cur) post({ type: 'pins', pins: pinsFor(notes, cur.id, path) }); /* eslint-disable-next-line */ }, [ready, review, path, cur && cur.id]);

  const onFrameLoad = () => { setReady(false); setPicking(false); nonce.current = nonceOf(); post({ type: 'hello', host: chk.host }); };
  const togglePick = () => { const on = !picking; setPicking(on); post({ type: 'mode', on }); };

  const upload = async (noteId, kind, blob) => {
    const ext = extOfType(blob.type);
    if (!ext) return 'Images only: JPG, PNG or WebP.';
    const s = await api({ action: 'upload', noteId, kind, ext, bytes: blob.size });
    if (!s.ok) return s.error;
    if (!(await putFile(s.uploadUrl, blob, `${kind}.${ext}`))) return 'The image did not upload.';
    const a = await api({ action: 'attach', noteId, kind, path: s.path });
    return a.ok ? null : a.error;
  };
  const saveDraft = async () => {
    if (!draft || !draft.comment.trim()) return;
    setBusy('save'); setMsg(null);
    const { data, error } = await client.rpc('portal_note_save', { p_note: { ...draft.pin, kind: 'site', comment: draft.comment.trim() } });
    if (error || !data) { setBusy(''); setMsg({ bad: true, t: /no_open_round/.test((error && error.message) || '') ? 'This round is closed.' : 'Your note was not saved. Try again.' }); return; }
    const errs = [];
    if (draft.useShot && draft.shot) { const b = dataUrlBlob(draft.shot); const e = b && await upload(data, 'shot', b); if (e) errs.push('screenshot: ' + e); }
    if (draft.file) { const e = await upload(data, 'attach', draft.file); if (e) errs.push('image: ' + e); }
    setBusy(''); setDraft(null);
    setMsg(errs.length ? { bad: true, t: `Note saved, but the ${errs.join('; ')}` } : { t: 'Note saved. Leave another, or submit the round when you are done.' });
    reload();
  };
  const saveSuite = async () => {
    if (!suiteText.trim()) return;
    setBusy('suite');
    const { error } = await client.rpc('portal_note_save', { p_note: { kind: 'suite', comment: suiteText.trim() } });
    setBusy(''); if (error) { setMsg({ bad: true, t: 'Your note was not saved. Try again.' }); return; }
    setSuiteText(''); reload();
  };
  const saveEdit = async () => {
    if (!edit || !edit.comment.trim()) return;
    setBusy('edit');
    const { error } = await client.rpc('portal_note_save', { p_note: { id: edit.id, comment: edit.comment.trim() } });
    setBusy(''); if (error) { setMsg({ bad: true, t: 'That note can no longer change.' }); return; }
    setEdit(null); reload();
  };
  const del = async id => { setBusy('del' + id); const j = await api({ action: 'delete', id }); setBusy(''); if (!j.ok) setMsg({ bad: true, t: j.error }); reload(); };
  const act = async (key, body, okText) => { setBusy(key); setMsg(null); const j = await api(body); setBusy(''); setMsg(j.ok ? { t: okText } : { bad: true, t: j.error }); if (j.ok) reload(); return j.ok; };

  if (!review) return <div className="empty">Loading…</div>;
  const groups = groupByPage(curNotes);
  const prog = progressOf(curNotes);
  const past = m.rounds.filter(r => r !== cur && r.submitted_at).reverse();

  return (<div className="rv">
    <div className="rv-head card">
      <div><span className="kick">Review</span><h2>{m.approved ? 'Your site is approved.' : chk.ok ? 'Tap anything you want changed.' : 'Your site preview'}</h2>
        <p>{m.approved ? `Approved by ${m.approved.typed_name} on ${fmt(m.approved.approved_at)}. Next stop: Launch Day.`
          : open ? `${m.label}. Press "Leave a note", tap the spot, and tell us what should change. Submit the round when you are done.`
          : m.canRequestExtra ? `You have used your ${m.included} included round${m.included === 1 ? '' : 's'}.`
          : m.used ? `${m.label} is with us. We will email you when the next version is ready.`
          : 'We will email you when your site is ready for review.'}</p></div>
      <div className="rv-badge">{m.label}</div>
    </div>
    {msg && <div className={msg.bad ? 'err-msg' : 'ok-msg'} style={{ marginBottom: 12 }}>{msg.t}</div>}

    <div className="rv-cols">
      <div>
        {!chk.ok ? <div className="card rv-wait"><b>Your site preview isn't ready yet.</b><span>We will email you the moment it is.</span></div> : <>
          <div className="rv-bar">
            <div className="seg">{[['desktop', 'Desktop'], ['phone', 'Phone']].map(([k, l]) => <button key={k} className={device === k ? 'on' : ''} onClick={() => setDevice(k)}>{l}</button>)}</div>
            <span className="rv-path" title={path}>{path}</span>
            <a className="rv-full" href={chk.url} target="_blank" rel="noopener noreferrer">Open full size ↗</a>
            {open && <button className={'rv-pick' + (picking ? ' on' : '')} disabled={!ready || !!draft} onClick={togglePick}>{picking ? 'Tap the spot… (cancel)' : '+ Leave a note'}</button>}
          </div>
          <div className={'rv-frame ' + device}>
            <iframe ref={frame} title="Your site preview" src={chk.url} onLoad={onFrameLoad}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />
          </div>
          {open && !ready && <p className="rv-hint">Loading the review tools… If "Leave a note" stays grey, your preview is missing our review script: tell us and we will fix it.</p>}
        </>}
      </div>

      <div>
        {draft && <div className="card rv-draft">
          <div className="h3"><h3>Your note</h3><span>{draft.pin.path}</span></div>
          {draft.pin.snippet && <p className="rv-snip">On: “{draft.pin.snippet.slice(0, 120)}{draft.pin.snippet.length > 120 ? '…' : ''}”</p>}
          <textarea autoFocus aria-label="What should change here?" placeholder="What should change here?" maxLength={2000} value={draft.comment} onChange={e => setDraft({ ...draft, comment: e.target.value })} />
          <div className="rv-shot">{draft.shotPending ? <span>Taking a screenshot…</span> : draft.shot
            ? <label><input type="checkbox" checked={draft.useShot} onChange={e => setDraft({ ...draft, useShot: e.target.checked })} /> Include this screenshot<img src={draft.shot} alt="Screenshot of the spot you marked" /></label>
            : <span>No screenshot this time. Your note still marks the exact spot.</span>}</div>
          <label className="rv-file">Attach an image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setDraft({ ...draft, file: (e.target.files && e.target.files[0]) || null })} /></label>
          <div className="rv-acts"><button className="btn" disabled={!draft.comment.trim() || !!busy || draft.shotPending} onClick={saveDraft}>{busy === 'save' ? 'Saving…' : 'Save note'}</button>
            <button className="pt-me" onClick={() => setDraft(null)}>Cancel</button></div>
        </div>}

        {cur && <div className="card rv-notes">
          <div className="h3"><h3>{open ? 'Notes this round' : `${m.label}`}</h3><span>{open ? `${curNotes.length} note${curNotes.length === 1 ? '' : 's'}` : `${prog.handled} of ${prog.total} done`}</span></div>
          {!curNotes.length && <p className="terms">{open ? 'No notes yet. Press "Leave a note" and tap anything on your site.' : 'No notes in this round.'}</p>}
          {groups.map((g, gi) => (<div key={gi} className="rv-g"><h4>{g.suite ? 'Business Suite' : g.path}</h4>
            {g.notes.map(n => { const i = curNotes.filter(x => x.kind === 'site').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).indexOf(n) + 1; const L = links[n.id] || {}; return (
              <div key={n.id} className={'rv-n ' + n.status}>
                <span className="rv-num">{n.kind === 'site' ? i : '•'}</span>
                <div className="rv-body">
                  {edit && edit.id === n.id ? <><textarea aria-label="Edit your note" maxLength={2000} value={edit.comment} onChange={e => setEdit({ ...edit, comment: e.target.value })} />
                    <div className="rv-acts sm"><button className="pt-me" disabled={!!busy} onClick={saveEdit}>Save</button><button className="pt-me" onClick={() => setEdit(null)}>Cancel</button></div></>
                    : <p>{n.comment}</p>}
                  <div className="rv-meta">{n.status !== 'open' || !open ? <b className={'st ' + n.status}>{statusLabel(n.status)}</b> : null}
                    {n.status === 'wont_do' && n.reason ? <span>Why: {n.reason}</span> : null}
                    {L.shot && <a href={L.shot} target="_blank" rel="noopener noreferrer">Screenshot</a>}{L.attach && <a href={L.attach} target="_blank" rel="noopener noreferrer">Image</a>}</div>
                  {open && !(edit && edit.id === n.id) && <div className="rv-acts sm"><button className="pt-me" onClick={() => setEdit({ id: n.id, comment: n.comment })}>Edit</button><button className="pt-me" disabled={!!busy} onClick={() => del(n.id)}>Delete</button></div>}
                </div></div>); })}
          </div>))}
          {open && <button className="btn" disabled={!curNotes.length || !!busy} onClick={() => act('submit', { action: 'submit' }, 'Round submitted. We got your notes, and an email is on its way.')}>
            {busy === 'submit' ? 'Submitting…' : `Submit round${curNotes.length ? ` (${curNotes.length} note${curNotes.length === 1 ? '' : 's'})` : ''}`}</button>}
        </div>}

        {hasSuite && open && <div className="card rv-suite"><div className="h3"><h3>Business Suite feedback</h3><span>No pin needed</span></div>
          <textarea aria-label="Business Suite feedback" placeholder="Anything to change in your Business Suite? Pipeline stages, dashboard, automations…" maxLength={2000} value={suiteText} onChange={e => setSuiteText(e.target.value)} />
          <button className="pt-me" disabled={!suiteText.trim() || !!busy} onClick={saveSuite}>Add to this round</button></div>}

        {m.canRequestExtra && <div className="card"><div className="h3"><h3>Need more changes?</h3></div>
          <p className="terms">Your {m.included} included round{m.included === 1 ? ' is' : 's are'} used. Ask for a change round and leave your notes as usual: we will send you a quote before doing the work.</p>
          <button className="pt-me" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => act('extra', { action: 'extra' }, 'Change round open. Leave your notes; we will quote them before any work.')}>Ask for a change round</button></div>}

        {chk.ok && !m.approved && <div className="card rv-approve"><div className="h3"><h3>Happy with it?</h3></div>
          {!approving ? <><p className="terms">When everything looks right, approve your site and we will get it ready for Launch Day.</p>
            <button className="pt-me" style={{ marginTop: 10 }} onClick={() => { setApproving(true); setName(''); }}>Approve my site</button></>
            : <><p className="terms">Type your full name to approve the site as it is in the preview, ready to launch.</p>
              <input aria-label="Your full name" placeholder="Your full name" value={name} maxLength={120} onChange={e => setName(e.target.value)} />
              <div className="rv-acts"><button className="btn" disabled={name.trim().length < 2 || !!busy} onClick={async () => { if (await act('approve', { action: 'approve', name: name.trim() }, 'Approved. Thank you! We will be in touch about Launch Day.')) setApproving(false); }}>{busy === 'approve' ? 'Approving…' : 'Approve my site'}</button>
                <button className="pt-me" onClick={() => setApproving(false)}>Cancel</button></div></>}
        </div>}

        {past.length > 0 && <div className="card rv-past"><div className="h3"><h3>Earlier rounds</h3></div>
          {past.map(r => { const ns = notes.filter(n => n.round_id === r.id); const p = progressOf(ns); return (
            <details key={r.id}><summary>{r.extra ? `Change round ${r.number}` : `Round ${r.number}`} · submitted {fmt(r.submitted_at)} · {p.handled} of {p.total} done</summary>
              <ul>{ns.map(n => <li key={n.id}><b className={'st ' + n.status}>{statusLabel(n.status)}</b> {n.comment}{n.status === 'wont_do' && n.reason ? <em> (why: {n.reason})</em> : null}</li>)}</ul></details>); })}
        </div>}
      </div>
    </div>
  </div>);
}

export const REVIEW_CSS = `
.rv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.rv-head h2{font-size:24px;margin:8px 0 4px}.rv-head p{margin:0;color:var(--mute);font-size:14px;max-width:640px}
.rv-badge{flex:0 0 auto;font:700 12px Inter,sans-serif;padding:7px 12px;border-radius:99px;background:#FFF4ED;color:#B23F07;border:1px solid rgba(251,105,38,.5)}
.rv-cols{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr);gap:18px;align-items:start}.rv-cols>*{min-width:0}.rv-head>div{min-width:0}
.rv-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.rv-bar .seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.rv-bar .seg button{border:0;background:none;padding:8px 12px;font:600 13px Inter,sans-serif;color:var(--mute);cursor:pointer}.rv-bar .seg button.on{background:var(--navy);color:#fff}
.rv-path{font:600 12px ui-monospace,Menlo,monospace;color:var(--mute);flex:1 1 120px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rv-full{font-size:13px;color:var(--blue);font-weight:600;text-decoration:none}
.rv-pick{font:700 14px Inter,sans-serif;color:#fff;background:var(--hotx);border:0;border-radius:10px;padding:10px 14px;cursor:pointer;box-shadow:0 10px 22px -10px rgba(251,105,38,.8)}
.rv-pick.on{background:var(--navy)}.rv-pick:disabled{opacity:.5;cursor:default}
.rv-frame{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 24px 60px -40px rgba(6,20,49,.6)}
.rv-frame iframe{display:block;width:100%;height:72vh;border:0}
.rv-frame.phone{width:390px;max-width:100%;margin:0 auto;border-radius:26px;border:8px solid var(--navy)}
.rv-frame.phone iframe{height:760px;max-height:76vh}
.rv-hint{font-size:12.5px;color:var(--mute);margin:8px 2px}
.rv-wait{display:flex;flex-direction:column;gap:4px;padding:40px 22px;text-align:center}.rv-wait span{color:var(--mute);font-size:14px}
.rv textarea,.rv input:not([type=checkbox]):not([type=file]){width:100%;font:inherit;font-size:15px;border:1px solid #C9CDE3;border-radius:12px;padding:11px 12px;margin:6px 0 10px}
.rv textarea{min-height:92px;resize:vertical}
.rv-snip{font-size:13px;color:var(--mute);margin:0 0 4px}
.rv-shot{font-size:13px;color:var(--mute);margin-bottom:10px}.rv-shot img{display:block;width:100%;border:1px solid var(--line);border-radius:10px;margin-top:6px}
.rv-file{display:block;font-size:13px;color:var(--mute);margin-bottom:12px}.rv-file input{display:block;margin-top:6px;font-size:13px}
.rv-acts{display:flex;gap:8px;align-items:center}.rv-acts .btn{width:auto;flex:1}.rv-acts.sm{margin-top:6px}.rv-acts.sm .pt-me{padding:5px 10px;font-size:12px}
.rv-draft{border-color:rgba(251,105,38,.6);box-shadow:0 14px 34px -22px rgba(251,105,38,.8)}
.rv-g h4{font:600 12px ui-monospace,Menlo,monospace;color:var(--mute);margin:12px 0 4px;word-break:break-all}
.rv-n{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:10px 0;border-top:1px solid #EEF2F8}
.rv-num{width:26px;height:26px;border-radius:50%;background:var(--hotx);color:#fff;font:700 12px/26px Inter,sans-serif;text-align:center}
.rv-n.done .rv-num{background:var(--ok)}.rv-n.wont_do .rv-num{background:#8792AB}
.rv-body p{margin:0;font-size:14px;white-space:pre-wrap;word-break:break-word}
.rv-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--mute);margin-top:4px}.rv-meta a{color:var(--blue);font-weight:600}
.st{font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:#EEF2F8;color:var(--mute)}.st.done{background:#E9F7F0;color:var(--ok)}.st.wont_do{background:#F1F2F6;color:#56607A}
.rv-notes .btn{margin-top:12px}
.rv-past details{border-top:1px solid #EEF2F8;padding:8px 0;font-size:13.5px}.rv-past summary{cursor:pointer;font-weight:600}.rv-past ul{margin:8px 0 0;padding-left:0}.rv-past li{list-style:none;padding:4px 0;font-size:13px}
@media (max-width:900px){.rv-cols{grid-template-columns:minmax(0,1fr)}.rv-head{flex-direction:column}.rv-frame iframe{height:62vh}}
`;
