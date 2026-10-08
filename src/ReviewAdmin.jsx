/* The Review tab on a client's record (client portal B-2): the preview link,
   the rounds, every note the client pinned (page, screenshot, their words,
   status), "Send for review", "Copy revision prompt", and the approval.
   OWNER ONLY: App renders it for an owner only, every action goes through
   api/review-admin.js (requireOwner), and the review tables are owner-read,
   server-write in Postgres (REVIEW-MIGRATION.sql). */
import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, Eye, Send, Link2 } from 'lucide-react';
import { readReview, parseHosts, previewOk, roundsModel, groupByPage, progressOf, revisionPrompt, NOTE_STATUS } from './lib/review';

const when = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const whenTime = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

export default function ReviewAdmin({ lead, apiPost, settings, onOpened, onChanged }) {
  const [data, setData] = useState(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState(null);           // the round being looked at
  const [confirmExtra, setConfirmExtra] = useState(false);
  const [reasons, setReasons] = useState({});
  const [prompt, setPrompt] = useState('');
  const call = async body => { const r = await apiPost('/api/review-admin', body); const j = await r.json().catch(() => ({})); return { ok: r.ok && j.ok !== false, ...j }; };
  const load = async () => {
    const j = await call({ action: 'get', leadId: lead.id });
    if (!j.ok) { setData({ state: {}, notes: [], rounds: [], links: {} }); setMsg({ bad: true, t: j.error || 'Could not load the review. Has REVIEW-MIGRATION.sql been run?' }); return; }
    setData(j); setUrl((j.state && j.state.preview_url) || '');
  };
  useEffect(() => { setPick(null); setPrompt(''); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id]);

  const hosts = readReview(settings);
  const m = useMemo(() => roundsModel(data && data.state), [data]);
  if (!data) return <div className="card"><div className="subcell">Loading…</div></div>;
  const who = lead.company || lead.name || 'this client';
  const notes = data.notes || [];
  const round = (pick && m.rounds.find(r => r.id === pick)) || m.current;
  const rNotes = round ? notes.filter(n => n.round_id === round.id) : [];
  const prog = progressOf(rNotes);
  const isOpen = round && !round.submitted_at;
  const nextN = m.used + 1;
  const nextExtra = nextN > m.included;
  const saved = data.state && data.state.preview_url;
  const urlChk = url.trim() ? previewOk(url.trim(), hosts.hosts) : null;
  const L = data.links || {};

  const act = async (key, body, ok) => { setBusy(key); setMsg(null); const j = await call(body); setBusy(''); setMsg(j.ok ? { t: typeof ok === 'function' ? ok(j) : ok } : { bad: true, t: j.error || 'That did not work.' }); if (j.ok) { await load(); if (onChanged) onChanged(); } return j; };
  const send = async () => {
    setConfirmExtra(false);
    const j = await act('open', { action: 'open', leadId: lead.id }, r => `Round ${r.number}${r.extra ? ' (quoted change round)' : ''} is open. ${r.emailed ? `"Your site is ready for review" went to ${r.emailed} portal login${r.emailed === 1 ? '' : 's'}.` : 'No email went out: nobody has portal access yet (Portal tab).'}`);
    if (j.ok && onOpened) onOpened(lead.id);
  };
  const setStatus = (n, status) => {
    const reason = (reasons[n.id] || '').trim();
    if (status === 'wont_do' && !reason) { setMsg({ bad: true, t: "Type why it won't be done first: the client sees the reason." }); return; }
    act('s' + n.id, { action: 'status', noteId: n.id, status, reason }, status === 'open' ? 'Reopened.' : status === 'done' ? 'Marked done.' : "Marked won't do.");
  };
  const copyPrompt = async () => {
    setBusy('prompt'); setMsg(null);
    const j = await call({ action: 'links', leadId: lead.id });
    const links = {};
    for (const [id, v] of Object.entries((j.ok && j.links) || {})) if (v && (v.shot || v.attach)) links[id] = [v.shot, v.attach].filter(Boolean).join(' · ');
    const text = revisionPrompt({ company: who, siteUrl: saved || '', round, included: m.included, notes: rNotes, links });
    setPrompt(text); setBusy('');
    try { await navigator.clipboard.writeText(text); setMsg({ t: 'Revision prompt copied. Screenshot links in it work for 7 days.' }); }
    catch { setMsg({ t: 'Your browser blocked the copy: select the text below and copy it.' }); }
  };

  return (<div className="card ra-card">
    <div className="sec-title"><Eye size={15} />Site review</div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 12 }}>{who} reviews their preview site in their portal: they pin notes to it, submit each round, and approve it. {m.included} round{m.included === 1 ? '' : 's'} included{m.included === 2 ? ' (Terms 3.4 default)' : ' (from the proposal)'}; more are quoted.</div>
    {msg && <div className={'note' + (msg.bad ? ' bad' : '')} style={{ marginBottom: 12 }}>{msg.t}</div>}

    <div className="ra-url">
      <label>Preview link<input value={url} placeholder={`https://… (${hosts.hosts.join(', ')})`} onChange={e => setUrl(e.target.value)} aria-label="Preview link" disabled={!!m.approved} /></label>
      <button className="btn btn-g btn-sm" disabled={!!busy || !urlChk || !urlChk.ok || url.trim() === saved || !!m.approved} onClick={() => act('url', { action: 'site', leadId: lead.id, url: url.trim() }, 'Preview link saved.')}><Link2 size={13} />Save</button>
      {saved && <a className="linkbtn" href={saved} target="_blank" rel="noopener noreferrer">Open ↗</a>}
    </div>
    {urlChk && !urlChk.ok && <div className="ra-warn">{urlChk.why === 'host_not_allowed' ? `${urlChk.host} is not an allowed preview host. Allowed: ${hosts.hosts.join(', ')} (Settings → Site review).` : 'Paste the full https:// link.'}</div>}
    {hosts.fellBack.length > 0 && <div className="ra-fb">Allowed preview hosts: the built-in default (<b>{hosts.hosts.join(', ')}</b>). Change it in Settings → Site review.</div>}
    <div className="ra-hint">The preview build must carry the review script (the website build prompt includes it) and must load in a frame: turn Vercel Deployment Protection off for preview builds, or the client sees a blank page.</div>

    {m.approved ? <div className="ra-ok"><b>Approved</b> by {data.approval ? data.approval.typed_name : m.approved.typed_name} on {whenTime(m.approved.approved_at)}{data.approval && data.approval.ip ? ` · IP ${data.approval.ip}` : ''}{data.approval && data.approval.round_number ? ` · after round ${data.approval.round_number}` : ''}. Permanent.</div>
      : !m.open && saved ? <div className="ra-send">
        {!confirmExtra ? <button className="btn btn-p btn-sm" disabled={!!busy} onClick={() => (nextExtra ? setConfirmExtra(true) : send())}><Send size={13} />{m.used ? `Send round ${nextN} for review` : 'Send for review'}</button>
          : <><span>Round {nextN} is beyond the {m.included} included: a <b>quoted</b> change round. Send it anyway?</span><button className="btn btn-p btn-sm" disabled={!!busy} onClick={send}>Yes, send</button><button className="btn btn-g btn-sm" onClick={() => setConfirmExtra(false)}>Cancel</button></>}
        <span className="ra-sub">Opens the round and emails every portal login of {who}.</span></div>
      : m.open ? <div className="ra-open">{m.label} is open: {who} is reviewing ({notes.filter(n => n.round_id === m.open.id).length} draft note{notes.filter(n => n.round_id === m.open.id).length === 1 ? '' : 's'} so far).</div> : null}

    {m.rounds.length > 0 && <div className="ra-rounds">{m.rounds.map(r => { const p = progressOf(notes.filter(n => n.round_id === r.id)); return (
      <button key={r.id} className={'ra-chip' + (round && round.id === r.id ? ' on' : '')} onClick={() => { setPick(r.id); setPrompt(''); }}>
        {r.extra ? `Change ${r.number}` : `Round ${r.number}`}<span>{r.submitted_at ? `${p.handled}/${p.total} done` : 'open'}</span></button>); })}</div>}

    {round && <div className="ra-round">
      <div className="ra-rh"><b>{round.extra || round.number > m.included ? `Change round ${round.number} (quoted)` : `Round ${round.number} of ${m.included}`}</b>
        <span>{round.submitted_at ? `submitted ${whenTime(round.submitted_at)} · ${prog.handled} of ${prog.total} done` : `opened ${when(round.opened_at)} · the client is still writing`}</span>
        {round.submitted_at && <button className="btn btn-g btn-sm" disabled={!!busy || !rNotes.length} onClick={copyPrompt}><ClipboardCopy size={13} />{busy === 'prompt' ? 'Building…' : 'Copy revision prompt'}</button>}</div>
      {!rNotes.length && <div className="subcell">No notes in this round yet.</div>}
      {groupByPage(rNotes).map((g, gi) => <div key={gi} className="ra-g"><div className="ra-page">{g.suite ? 'Business Suite' : g.path}</div>
        {g.notes.map(n => { const ln = L[n.id] || {}; return (<div key={n.id} className={'ra-n ' + n.status}>
          {ln.shot ? <a href={ln.shot} target="_blank" rel="noopener noreferrer"><img src={ln.shot} alt="Screenshot of the marked spot" /></a> : <div className="ra-noshot">{g.suite ? 'Suite' : 'No screenshot'}</div>}
          <div className="ra-nb">
            <div className="ra-c">{n.comment}</div>
            {!g.suite && <div className="ra-m">{n.snippet ? <>On “{n.snippet.slice(0, 90)}{n.snippet.length > 90 ? '…' : ''}” · </> : null}<code>{n.selector || '—'}</code>{n.device ? ` · ${n.device}${n.vw ? ` ${n.vw}×${n.vh}` : ''}` : ''}{ln.attach ? <> · <a href={ln.attach} target="_blank" rel="noopener noreferrer">attached image</a></> : null}</div>}
            {round.submitted_at ? <div className="ra-st">
              {NOTE_STATUS.map(([k, l]) => <button key={k} className={'ra-sb' + (n.status === k ? ' on ' + k : '')} disabled={!!busy || n.status === k} onClick={() => setStatus(n, k)}>{l}</button>)}
              {n.status === 'wont_do' ? <span className="ra-why">Why: {n.reason}</span>
                : <input className="ra-reason" placeholder="Reason, if won't do" value={reasons[n.id] || ''} onChange={e => setReasons({ ...reasons, [n.id]: e.target.value })} aria-label="Reason it won't be done" />}
            </div> : <div className="ra-m">Draft: the client can still edit this.</div>}
          </div></div>); })}</div>)}
      {prompt && <textarea className="ra-prompt" readOnly value={prompt} aria-label="Revision prompt" />}
    </div>}
    <style>{`.ra-url{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.ra-url label{flex:1 1 280px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#56607A}.ra-url input{min-width:0}
.ra-warn{margin-top:6px;font-size:12px;color:#B42F2F}.ra-fb{margin-top:6px;font-size:12px;color:#8A5A00;background:#FFF7E6;border-radius:8px;padding:6px 8px}
.ra-hint{margin:8px 0 12px;font-size:12px;color:#7A819A}
.ra-ok{background:#EFFAF3;color:#14663E;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.ra-open{background:#F3F5FE;color:#2B4DE0;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.ra-send{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;font-size:13px}.ra-sub{font-size:12px;color:#7A819A}
.ra-rounds{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.ra-chip{display:flex;flex-direction:column;align-items:flex-start;font:inherit;font-size:12.5px;font-weight:600;border:1px solid #D7DCF3;background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}.ra-chip span{font-size:11px;font-weight:500;color:#56607A}.ra-chip.on{border-color:#2B4DE0;background:#F3F5FE}
.ra-rh{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:13px}.ra-rh span{color:#56607A;font-size:12px;flex:1}
.ra-page{font:600 12px ui-monospace,Menlo,monospace;color:#56607A;margin:12px 0 6px;word-break:break-all}
.ra-n{display:grid;grid-template-columns:120px 1fr;gap:12px;border:1px solid #ECEEF5;border-radius:12px;padding:10px;margin-bottom:8px}
.ra-n img{width:120px;max-height:90px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid #ECEEF5;display:block}
.ra-noshot{width:120px;height:70px;border-radius:8px;background:#F6F7FC;color:#9AA1B8;font-size:11px;display:grid;place-items:center}
.ra-n.done{background:#FAFEFB}.ra-n.wont_do{opacity:.75}
.ra-c{font-size:13.5px;white-space:pre-wrap;word-break:break-word}.ra-m{font-size:11.5px;color:#7A819A;margin-top:4px;word-break:break-word}.ra-m code{font-size:11px}
.ra-st{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
.ra-sb{font:inherit;font-size:11.5px;font-weight:600;border:1px solid #D7DCF3;background:#fff;border-radius:8px;padding:3px 9px;cursor:pointer}.ra-sb.on.done{background:#EFFAF3;border-color:#C9E7D6;color:#14663E}.ra-sb.on.wont_do{background:#F1F2F6}.ra-sb.on.open{background:#F3F5FE;color:#2B4DE0}
.ra-reason{flex:1 1 160px;min-width:0;font-size:12px;padding:4px 8px}.ra-why{font-size:12px;color:#56607A}
.ra-prompt{width:100%;min-height:220px;font:12px ui-monospace,Menlo,monospace;margin-top:10px}
@media (max-width:600px){.ra-n{grid-template-columns:1fr}.ra-n img,.ra-noshot{width:100%;max-height:160px}}`}</style>
  </div>);
}

/** Settings → Site review: the hosts the portal may frame. */
export function ReviewSettings({ settings, saveSettings }) {
  const cur = readReview(settings);
  const [text, setText] = useState(cur.hosts.join('\n'));
  const [note, setNote] = useState(null);
  const save = () => {
    const { hosts, bad } = parseHosts(text);
    if (!hosts.length) { setNote({ bad: true, t: 'Add at least one host, e.g. *.vercel.app' }); return; }
    saveSettings({ ...settings, review: { ...(settings.review || {}), hosts } });
    setNote(bad.length ? { bad: true, t: `Saved. Not hosts, left out: ${bad.join(', ')}` } : { t: 'Saved.' });
  };
  return (<div className="card" style={{ marginBottom: 18 }}>
    <div className="sec-title"><Eye size={15} />Site review</div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 10 }}>The hosts a client's preview site may be on. The portal shows a preview only on these, and the review script works only inside the portal. One per line; <code>*.vercel.app</code> covers every Vercel preview. Never list a live site's domain.</div>
    {cur.fellBack.length > 0 && <div className="lc-fb">Using the built-in default: <b>{cur.hosts.join(', ')}</b>. Save to make it yours.</div>}
    <textarea value={text} onChange={e => setText(e.target.value)} rows={3} aria-label="Allowed preview hosts" style={{ width: '100%', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13 }} />
    {note && <div className={'note' + (note.bad ? ' bad' : '')} style={{ margin: '8px 0' }}>{note.t}</div>}
    <button className="btn btn-p btn-sm" onClick={save}>Save hosts</button>
  </div>);
}
