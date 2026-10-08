/* ============================================================================
   ONBOARDING — the owner's view of every client onboarding.

   OWNER ONLY, three ways that agree: canOpen() never shows this tab to a rep
   (and it cannot be switched on per rep), both tables are owner-only in
   Postgres (VERIFY-RLS §14), and api/onboarding-admin.js runs requireOwner.

   NOTHING HERE IS A SECOND COPY
   - Deposit paid and access received are the LEAD's checklist items
     (deposit_paid, access_dns, access_gbp). The toggles below call the same
     toggleOnboarding the Clients page uses, so the two screens cannot
     disagree (ENGINEERING §2, §5).
   - The launch clock is derived (lib/onboarding launchState), never stored.
   - Status, "X of Y" and "still needed" come from lib/onboarding, the same
     functions the client's own dashboard reads.
   - The prompts are the ones the submit built; Regenerate calls the same
     buildOutputs with the current answers and files.

   THE ANSWERS PDF is the browser's print, like the proposal's: AnswersDoc
   renders the answers frozen at submit (outputs.snapshot) or, before submit,
   the live answers, and only it prints. Thumbnails come from five-minute
   signed links (onboarding-admin `files`); sensitive files never get one.
   ========================================================================== */
import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Download, RefreshCw, Link2, Trash2, Plus, X, CheckCircle2, AlertTriangle, Pencil, Rocket } from 'lucide-react';
import {
  ctxOf, readOnbConfig, progress, stillNeeded, missingRequired, launchState, checklistState, requiredAccess, visibleSections,
  shownFields, sectionTitle, sectionIcon, fieldLabel, answerText, cleanAnswers, productsFor, productLine, PRODUCTS, INDUSTRIES,
  DEFAULT_PRODUCT_NAMES, FILE_SLOTS, longDate, shortDate,
} from './lib/onboarding';
import { buildOutputs } from './lib/onboarding-prompts';
import { readOffer, newToken } from './lib/proposal';
import { personLabel } from './lib/lead';
import { db } from './lib/supabase';
import { Field } from './onboarding/Fields';
import { THEME, PORTAL_CSS } from './onboarding/theme';
import DEFAULT_ONB_CONFIG from '../ONBOARDING-CONFIG.json';

const A = v => (Array.isArray(v) ? v : []);
/* App's apiPost returns the raw Response (it attaches the session token);
   every call here wants the JSON, and a failure to parse is a refusal. */
const admin = async (apiPost, body) => {
  const r = await apiPost('/api/onboarding-admin', body).catch(() => null);
  if (!r) return null;
  return typeof r.json === 'function' ? r.json().catch(() => ({ ok: false })) : r;
};
const STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', needs_info: 'Needs info' };
const ago = iso => {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '—';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const filesOf = o => A(o && o.onboarding_files).filter(f => f && f.state === 'ok').map(f => ({ ...f, name: f.original_name }));
/* the config, once, the same way the route reads it */
export function useOnbConfig(settings) {
  return useMemo(() => { const { offer } = readOffer(settings); return { ...readOnbConfig(settings, offer), offer }; }, [settings]);
}

/** One onboarding's numbers, from the shared library. The list, the detail,
 *  the client record and the portal all call these same functions. */
export function summarize(o, lead, cfg) {
  const answers = (o && o.answers) || {};
  const ctx = ctxOf(o, answers, cfg);
  const files = filesOf(o);
  const checklist = { ...((lead && lead.onboarding) || {}), onbSkip: (lead && lead.onbSkip) || [] };
  const prog = progress(ctx, answers, files, o.sections || {}, cfg);
  return {
    ctx, answers, files, checklist, prog,
    need: stillNeeded(ctx, answers, files, checklist, cfg),
    missing: missingRequired(ctx, answers, files, cfg),
    launch: launchState({ submittedAt: o.submitted_at, checklist, ctx, answers, launchDays: cfg.launchDays }),
    statusText: o.status === 'in_progress' ? `In progress (${prog.done} of ${prog.total})` : STATUS_LABEL[o.status] || o.status,
  };
}

const copy = async (text, setMsg, what) => {
  try { await navigator.clipboard.writeText(text); setMsg({ kind: 'ok', text: `${what} copied.` }); }
  catch { setMsg({ kind: 'err', text: `Could not copy ${what.toLowerCase()}. Select it below instead.` }); }
};

/* ---------------------------------------------------------------- the PDF */
export function AnswersDoc({ o, lead, cfg, thumbs = {} }) {
  const snap = o.status === 'submitted' && o.outputs && o.outputs.snapshot ? o.outputs.snapshot : null;
  const answers = snap ? snap.answers : (o.answers || {});
  const row = snap ? { industry: snap.industry, lender_kind: snap.lenderKind, products: snap.products } : o;
  const ctx = ctxOf(row, answers, cfg);
  const files = snap ? A(snap.files) : filesOf(o);
  const checklist = { ...((lead && lead.onboarding) || {}), onbSkip: (lead && lead.onbSkip) || [] };
  const need = stillNeeded(ctx, answers, files, checklist, cfg).filter(x => !x.ok);
  const biz = answers['biz.name'] || (lead && (lead.company || lead.name)) || 'Client';
  return (<div className="oa-doc">
    <div className="oa-cover">
      {cfg.agencyLogo ? <img src={cfg.agencyLogo} alt={cfg.agency} className="oa-logo" /> : <b className="oa-agency">{cfg.agency}</b>}
      <div className="oa-kick">Client onboarding</div>
      <h1>{biz}</h1>
      <div className="oa-meta">
        <span><i>Bought</i>{o.package_name || productLine(ctx.products, cfg.productNames) || '—'}</span>
        <span><i>Industry</i>{{ realtor: 'Realtor', lender: ctx.lenderKind === 'lo' ? 'Lender · loan officer' : ctx.lenderKind === 'company' ? 'Lender · mortgage company' : 'Lender', service: 'Service business' }[ctx.industry] || '—'}</span>
        <span><i>Submitted</i>{o.submitted_at ? longDate(o.submitted_at) : 'Not yet (live answers)'}</span>
        <span><i>Contact</i>{[answers['biz.contact_name'], answers['biz.email'], answers['biz.phone']].filter(Boolean).join(' · ') || '—'}</span>
      </div>
    </div>
    {visibleSections(ctx).map(s => {
      const rows = shownFields(s, ctx, answers).filter(f => f.type !== 'note' && f.type !== 'file')
        .map(f => [fieldLabel(f, ctx), answerText(f, answers[f.id], ctx, cfg)]).filter(([, v]) => v);
      return (<section className="oa-sec" key={s.id}>
        <h2>{sectionIcon(s, ctx)} {sectionTitle(s, ctx)}</h2>
        {rows.length ? <dl>{rows.map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl> : <p className="oa-none">Nothing entered.</p>}
      </section>);
    })}
    <section className="oa-sec">
      <h2>📸 Files</h2>
      {files.length ? <div className="oa-files">{files.map(f => (<div className="oa-file" key={f.id || f.path}>
        {thumbs[f.id] ? <img src={thumbs[f.id]} alt="" /> : <span className="oa-ic">{f.sensitive ? '🔒' : '📄'}</span>}
        <span><b>{f.name}</b><br />{(FILE_SLOTS[f.slot] || {}).label || f.slot}{f.bytes ? ` · ${Math.max(1, Math.round(f.bytes / 1024))} KB` : ''}</span>
      </div>))}</div> : <p className="oa-none">No files uploaded.</p>}
    </section>
    <section className="oa-sec">
      <h2>Still needed</h2>
      {need.length ? <ul>{need.map(x => <li key={x.key}>{x.label}{x.where ? ` (${x.where})` : ''}</li>)}</ul> : <p className="oa-none">Nothing outstanding.</p>}
    </section>
  </div>);
}
export const ANSWERS_CSS = `
.oa-doc{--oa-ink:${THEME.ink};--oa-mute:${THEME.mute};--oa-line:${THEME.line};--oa-blue:${THEME.blue};--oa-hot:${THEME.hot};--oa-navy:${THEME.navy};
  max-width:820px;margin:0 auto;background:#fff;color:var(--oa-ink);font-family:Inter,-apple-system,"Segoe UI",Arial,sans-serif;border-radius:18px;overflow:hidden;border:1px solid var(--oa-line)}
.oa-doc h1,.oa-doc h2{font-family:"Space Grotesk",Inter,sans-serif;letter-spacing:-.02em;margin:0}
.oa-cover{padding:28px 32px 24px;background:linear-gradient(160deg,#0A2257,var(--oa-navy) 75%);color:#fff;position:relative}
.oa-cover:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,#2E9BFF,#38BDF8 60%,var(--oa-hot))}
.oa-logo{height:30px;filter:brightness(0) invert(1)}
.oa-agency{font:700 18px "Space Grotesk",sans-serif}
.oa-kick{margin-top:18px;font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.2em;text-transform:uppercase;color:#7DD3FC}
.oa-cover h1{font-size:32px;margin:6px 0 14px}
.oa-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;font-size:13px}
.oa-meta i{display:block;font:700 9.5px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#7DD3FC;font-style:normal}
.oa-sec{padding:18px 32px;border-top:1px solid var(--oa-line);break-inside:avoid}
.oa-sec h2{font-size:17px;margin-bottom:10px}
.oa-sec dl{display:grid;grid-template-columns:minmax(150px,36%) 1fr;gap:5px 16px;margin:0;font-size:12.5px}
.oa-sec dt{color:var(--oa-mute)}
.oa-sec dd{margin:0;word-break:break-word}
.oa-sec ul{margin:0;padding-left:18px;font-size:13px}
.oa-none{color:var(--oa-mute);font-size:12.5px;margin:0}
.oa-files{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.oa-file{display:flex;gap:10px;align-items:center;border:1px solid var(--oa-line);border-radius:10px;padding:8px;font-size:12px;color:var(--oa-mute)}
.oa-file b{color:var(--oa-ink)}
.oa-file img,.oa-ic{width:54px;height:54px;object-fit:contain;border-radius:8px;background:#F7FAFF;display:grid;place-items:center;font-size:22px;flex:none}
@media screen and (max-width:600px){
  .oa-cover{padding:20px 16px}.oa-cover h1{font-size:24px}.oa-meta{grid-template-columns:1fr}
  .oa-sec{padding:14px 16px}.oa-sec dl{grid-template-columns:1fr;gap:0}.oa-sec dt{margin-top:8px}
}
@media print{
  @page{size:letter;margin:0.45in}
  body.oa-printing > *{display:none!important}
  body.oa-printing .oa-print-root{display:block!important}
  .oa-doc{border:0;border-radius:0;max-width:none}
  .oa-doc,.oa-doc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
.oa-print-root{display:none}
`;
/* Print ONE document: a copy of it mounted at the top of <body>, everything
   else hidden while the dialog is open. The CRM's own chrome never prints. */
function printDoc(id) {
  const src = document.getElementById(id); if (!src) return;
  const host = document.createElement('div'); host.className = 'oa-print-root'; host.innerHTML = src.outerHTML;
  document.body.appendChild(host); document.body.classList.add('oa-printing');
  const done = () => { document.body.classList.remove('oa-printing'); host.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
}

/* ------------------------------------------------------------ the editor */
function AnswerEditor({ o, cfg, onSaved, onCancel }) {
  const [answers, setAnswers] = useState(o.answers || {});
  const ctx = ctxOf(o, answers, cfg);
  const vis = visibleSections(ctx);
  const [sec, setSec] = useState(vis[0] ? vis[0].id : 'biz');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const s = vis.find(x => x.id === sec) || vis[0];
  const files = filesOf(o);
  const save = async () => {
    setErr('');
    /* the SAME clean the portal's route runs: the owner cannot store a value
       the client could not (no SSN, no card number, no unknown field) */
    const c = cleanAnswers(answers, ctx, cfg);
    if (c.error) { setErr(c.error); return; }
    setBusy(true);
    try { await db.updateOnboarding(o.id, { answers: c.answers }); onSaved(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (<div className="ob ob-embed" style={Object.fromEntries(Object.entries(THEME).map(([k, v]) => [`--o-${k}`, v]))}>
    <div className="ob-chips" style={{ marginBottom: 12 }}>
      {vis.map(x => <label key={x.id} className={'ob-chip' + (x.id === sec ? ' on' : '')}><input type="radio" name="onb-edit-sec" checked={x.id === sec} onChange={() => setSec(x.id)} />{sectionTitle(x, ctx)}</label>)}
    </div>
    {s && s.fields.filter(f => f.type !== 'file' && (!f.when || f.when(ctx, answers))).map(f => (
      <Field key={f.id} f={f} value={answers[f.id]} onChange={(id, v) => setAnswers(a => ({ ...a, [id]: v }))} ctx={ctx} cfg={cfg} answers={answers} files={files} />
    ))}
    {err && <div className="ob-err" role="alert">{err}</div>}
    <div className="ob-nav">
      <button type="button" className="ob-ghost" onClick={onCancel}>Cancel</button>
      <button type="button" className="ob-cta" style={{ margin: 0 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save answers'}</button>
    </div>
  </div>);
}

/* ------------------------------------------------------------ the detail */
export function OnboardingDetail({ o, lead, settings, apiPost, reload, toggleChecklist, compact }) {
  const { config: cfg } = useOnbConfig(settings);
  const sm = summarize(o, lead, cfg);
  const [msg, setMsg] = useState(null);
  const [files, setFiles] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showPrompt, setShowPrompt] = useState('');
  const thumbs = useMemo(() => Object.fromEntries(A(files).filter(f => f.thumb).map(f => [f.id, f.thumb])), [files]);
  const out = o.outputs || {};
  const has = p => A(o.products).includes(p);
  useEffect(() => {
    let alive = true;
    if (!sm.files.length) { setFiles([]); return; }
    admin(apiPost, { action: 'files', id: o.id }).then(j => { if (alive) setFiles(j && j.ok ? j.files : []); }).catch(() => alive && setFiles([]));
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id, sm.files.length]);

  const link = async () => {
    const j = await admin(apiPost, { action: 'link', id: o.id });
    if (j && j.ok) copy(j.link, setMsg, 'Client link'); else setMsg({ kind: 'err', text: (j && j.error) || 'Could not get the link.' });
  };
  const regenerate = async () => {
    setMsg(null);
    const j = await admin(apiPost, { action: 'files', id: o.id });
    const withPaths = j && j.ok ? j.files : sm.files;
    const outputs = buildOutputs({ row: o, answers: sm.answers, ctx: sm.ctx, files: withPaths, checklist: sm.checklist, cfg });
    try { await db.updateOnboarding(o.id, { outputs }); setMsg({ kind: 'ok', text: 'Prompts regenerated from the current answers and files.' }); reload(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const setStatus = async status => {
    try { await db.updateOnboarding(o.id, { status }); setMsg({ kind: 'ok', text: status === 'needs_info' ? 'Reopened. The client can edit and submit again.' : 'Status updated.' }); reload(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const del = async () => {
    const j = await admin(apiPost, { action: 'delete', id: o.id });
    if (j && j.ok) reload(); else setMsg({ kind: 'err', text: (j && j.error) || 'Could not delete.' });
  };
  const cl = checklistState(sm.checklist);
  const access = requiredAccess(sm.ctx, sm.answers);
  const accessKey = { dns: 'access_dns', gbp: 'access_gbp' };
  const docId = 'oa-doc-' + o.id;
  return (<div className="onbd">
    <div className="onbd-head">
      <div>
        <div className="onbd-status"><span className={'onbd-pill s-' + o.status}>{sm.statusText}</span><span>last activity {ago(o.last_activity_at || o.updated_at)}</span></div>
        <div className="onbd-sub">{o.package_name || productLine(o.products, cfg.productNames) || 'No products set'}{sm.ctx.industry ? ` · ${sm.ctx.industry}` : ''}</div>
      </div>
      <div className="onbd-actions">
        <button className="btn btn-g btn-sm" onClick={link}><Link2 size={14} />Copy client link</button>
        <button className="btn btn-g btn-sm" onClick={() => printDoc(docId)}><Download size={14} />Download PDF</button>
        {has('website') && <button className="btn btn-g btn-sm" disabled={!out.websitePrompt} onClick={() => copy(out.websitePrompt, setMsg, 'Website prompt')} title={out.websitePrompt ? '' : 'Generated on submit, or press Regenerate'}><Copy size={14} />Copy website prompt</button>}
        {has('suite') && <button className="btn btn-g btn-sm" disabled={!out.suitePrompt} onClick={() => copy(out.suitePrompt, setMsg, 'Business Suite prompt')} title={out.suitePrompt ? '' : 'Generated on submit, or press Regenerate'}><Copy size={14} />Copy Business Suite prompt</button>}
        <button className="btn btn-g btn-sm" onClick={regenerate}><RefreshCw size={14} />Regenerate</button>
      </div>
    </div>
    {msg && <div className={'pp-msg ' + msg.kind} role="status">{msg.kind === 'err' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}<span>{msg.text}</span><button className="x" onClick={() => setMsg(null)} aria-label="Dismiss"><X size={13} /></button></div>}

    <div className="onbd-grid">
      <div className="card onbd-card">
        <div className="sec-title"><Rocket size={15} />Launch</div>
        <label className="chip-toggle onbd-tog"><input type="checkbox" checked={!!cl.depositAt} disabled={cl.depositSkipped} onChange={() => lead && toggleChecklist(lead.id, 'deposit_paid')} />
          Deposit paid{cl.depositAt ? ` · ${shortDate(cl.depositAt)}` : ''}{cl.depositSkipped ? ' · not applicable' : ''}</label>
        {access.length ? access.map(k => (<label className="chip-toggle onbd-tog" key={k}><input type="checkbox" checked={!!cl.access[k]} onChange={() => lead && toggleChecklist(lead.id, accessKey[k])} />
          {k === 'dns' ? 'Domain access received' : 'Google profile access received'}{cl.access[k] ? ` · ${shortDate(cl.access[k])}` : ''}</label>))
          : <div className="onbd-mute">No access required for what they bought.</div>}
        <div className="onbd-launch">{sm.launch.started
          ? <><b>Launch clock started {longDate(sm.launch.startedOn)}</b>{sm.launch.target ? <> · target launch <b>{longDate(sm.launch.target)}</b> ({sm.launch.launchDays} days)</> : ' · no target: launch days are not set in the offer'}</>
          : <>Waiting on: {sm.launch.waiting.join(', ')}</>}</div>
        <div className="onbd-mute">These are the client's checklist items on the Clients page; ticking here ticks there.</div>
      </div>
      <div className="card onbd-card">
        <div className="sec-title">What we still need</div>
        <ul className="onbd-need">{sm.need.map(x => <li key={x.key} className={x.ok ? 'ok' : ''}>{x.ok ? '✓' : '○'} {x.label}<em>{x.note}</em></li>)}</ul>
        {sm.missing.length > 0 && <div className="onbd-mute">Required and empty: {sm.missing.map(m => m.label).join(', ')}.</div>}
      </div>
    </div>

    <div className="card onbd-card">
      <div className="toolbar" style={{ marginBottom: 8 }}><div className="sec-title" style={{ margin: 0 }}>Files</div><span className="onbd-mute" style={{ marginLeft: 'auto' }}>links last five minutes</span></div>
      {files === null ? <div className="onbd-mute">Loading…</div> : !files.length ? <div className="onbd-mute">No files yet.</div>
        : <div className="onbd-files">{files.map(f => (<a key={f.id} className="onbd-file" href={f.url || undefined} target="_blank" rel="noopener noreferrer">
          {f.thumb ? <img src={f.thumb} alt="" /> : <span className="ic">{f.sensitive ? '🔒' : '📄'}</span>}
          <span><b>{f.name}</b><br />{(FILE_SLOTS[f.slot] || {}).label || f.slot} · {Math.max(1, Math.round((f.bytes || 0) / 1024))} KB</span></a>))}</div>}
    </div>

    <div className="card onbd-card">
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <div className="sec-title" style={{ margin: 0 }}>Answers{o.status === 'submitted' ? ' (as submitted)' : ''}</div>
        {!editing && <button className="btn btn-g btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}><Pencil size={14} />Edit answers</button>}
      </div>
      {editing ? <AnswerEditor o={o} cfg={cfg} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setMsg({ kind: 'ok', text: 'Answers saved. Press Regenerate to rebuild the prompts.' }); reload(); }} />
        : <div id={docId}><AnswersDoc o={o} lead={lead} cfg={cfg} thumbs={thumbs} /></div>}
    </div>

    {(out.websitePrompt || out.suitePrompt) && <div className="card onbd-card">
      <div className="sec-title">Build prompts{out.generatedAt ? <span className="onbd-mute" style={{ fontWeight: 400 }}> · generated {ago(out.generatedAt)}</span> : null}</div>
      <div className="seg" style={{ marginBottom: 8 }}>
        {out.websitePrompt && <button className={'seg-b ' + (showPrompt === 'w' ? 'on' : '')} onClick={() => setShowPrompt(showPrompt === 'w' ? '' : 'w')}>Website</button>}
        {out.suitePrompt && <button className={'seg-b ' + (showPrompt === 's' ? 'on' : '')} onClick={() => setShowPrompt(showPrompt === 's' ? '' : 's')}>Business Suite</button>}
      </div>
      {showPrompt && <textarea className="onbd-prompt" readOnly value={showPrompt === 'w' ? out.websitePrompt : out.suitePrompt} aria-label="Build prompt" />}
    </div>}

    {!compact && <div className="onbd-foot">
      {o.status === 'submitted' && <button className="btn btn-g btn-sm" onClick={() => setStatus('needs_info')}>Needs info: reopen for the client</button>}
      {confirmDel
        ? <span className="onbd-confirm">Delete this onboarding, its answers and every file? <button className="btn btn-sm" style={{ background: THEME.bad, color: '#fff' }} onClick={del}>Delete for good</button><button className="btn btn-g btn-sm" onClick={() => setConfirmDel(false)}>Keep it</button></span>
        : <button className="btn btn-g btn-sm" onClick={() => setConfirmDel(true)}><Trash2 size={14} />Delete</button>}
    </div>}
  </div>);
}

/* ------------------------------------------------------------ create */
function CreateForm({ leads, proposals, onboardings, settings, onDone, onCancel }) {
  const { config: cfg } = useOnbConfig(settings);
  const [leadId, setLeadId] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [products, setProducts] = useState([]);
  const [industry, setIndustry] = useState('');
  const [err, setErr] = useState('');
  const taken = new Set(A(onboardings).map(x => x.proposal_id).filter(Boolean));
  const accepted = A(proposals).filter(p => p && p.lead_id === leadId && p.status === 'accepted' && !taken.has(p.id));
  const pickProposal = id => {
    setProposalId(id);
    const p = accepted.find(x => x.id === id);
    if (p) setProducts(productsFor(A(p.body && p.body.quote && p.body.quote.items).map(i => i.id), cfg.productMap));
  };
  const sorted = A(leads).filter(l => l && !l.isRelationship).slice().sort((a, b) => (b.isClient ? 1 : 0) - (a.isClient ? 1 : 0) || personLabel(a).localeCompare(personLabel(b)));
  const go = async () => {
    setErr('');
    if (!leadId) { setErr('Pick the client.'); return; }
    if (!products.length) { setErr('Pick at least one product, so the right sections show.'); return; }
    const p = accepted.find(x => x.id === proposalId);
    const pkg = p ? ((A(p.body && p.body.quote && p.body.quote.items).find(i => i.kind === 'package') || {}).name || '') : '';
    try { await db.createOnboarding({ lead_id: leadId, token: newToken(), products, industry: industry || null, proposal_id: p ? p.id : null, package_name: pkg }); onDone(); }
    catch (e) { setErr(e.message); }
  };
  return (<div className="card onbd-card">
    <div className="sec-title"><Plus size={15} />New onboarding</div>
    <div className="onbd-form">
      <label>Client<select value={leadId} onChange={e => { setLeadId(e.target.value); setProposalId(''); }}>
        <option value="">Pick a client…</option>{sorted.map(l => <option key={l.id} value={l.id}>{personLabel(l)}{l.isClient ? ' · client' : ''}</option>)}</select></label>
      {accepted.length > 0 && <label>From their accepted proposal<select value={proposalId} onChange={e => pickProposal(e.target.value)}>
        <option value="">None (set products by hand)</option>{accepted.map(p => <option key={p.id} value={p.id}>Accepted {shortDate(p.accepted_at)}</option>)}</select></label>}
      <fieldset><legend>Products</legend>{PRODUCTS.map(p => <label key={p} className="chip-toggle"><input type="checkbox" checked={products.includes(p)} onChange={e => setProducts(e.target.checked ? [...products, p] : products.filter(x => x !== p))} />{(cfg.productNames || DEFAULT_PRODUCT_NAMES)[p]}</label>)}</fieldset>
      <label>Industry (optional: the client answers this first)<select value={industry} onChange={e => setIndustry(e.target.value)}><option value="">Let them pick</option>{INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}</select></label>
    </div>
    {err && <div className="pp-msg err"><AlertTriangle size={15} /><span>{err}</span></div>}
    <div className="toolbar" style={{ marginTop: 10 }}><button className="btn btn-g btn-sm" onClick={onCancel}>Cancel</button><button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={go}>Create</button></div>
  </div>);
}

/* ------------------------------------------------------------ config */
/* PORTAL SETTINGS (licensing state, product map, kickoff link, pipelines,
   tiles) live in Settings → Onboarding portal since Oct 2026, so every setting
   is in Settings. The card is unchanged and is rendered THERE (App's
   SettingsPage); this page keeps a pointer to it. */
export function ConfigCard({ settings, saveSettings }) {
  const { fellBack } = useOnbConfig(settings);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(settings.onboarding || DEFAULT_ONB_CONFIG, null, 2));
  const [err, setErr] = useState('');
  const warn = fellBack.filter(f => !['pipelines', 'tiles'].includes(f));
  const save = async () => {
    setErr('');
    let v; try { v = JSON.parse(text); } catch { setErr('That is not valid JSON.'); return; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { setErr('The portal settings are one JSON object.'); return; }
    try { await saveSettings({ ...settings, onboarding: v }); setOpen(false); } catch (e) { setErr(e.message || 'Could not save.'); }
  };
  return (<div className={'card onbd-card' + (warn.length ? ' onbd-warn' : '')}>
    <div className="toolbar"><div className="sec-title" style={{ margin: 0 }}>Portal settings</div>
      <button className="btn btn-g btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button></div>
    {warn.length > 0 ? <div className="onbd-mute">Using a built-in default for: <b>{warn.join(', ')}</b>. {warn.includes('onboarding') ? 'The portal settings have never been saved.' : ''}{warn.includes('offer.launchDays') ? ' Launch days come from the offer (Settings → Proposals).' : ''}</div>
      : <div className="onbd-mute">Licensing state, product mapping and the kickoff link are set. People and launch days come from the offer.</div>}
    {open && <>
      <textarea className="onbd-prompt" value={text} onChange={e => setText(e.target.value)} aria-label="Portal settings JSON" />
      {err && <div className="pp-msg err"><AlertTriangle size={15} /><span>{err}</span></div>}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn btn-g btn-sm" onClick={() => setText(JSON.stringify(DEFAULT_ONB_CONFIG, null, 2))}>Start from the shipped settings</button>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={save}>Save</button></div>
    </>}
  </div>);
}

/* ------------------------------------------------------------ the tab */
export default function Onboarding({ leads, settings, saveSettings, apiPost, onboardings, proposals, reload, toggleChecklist, openLead, selected, setSelected, openSettings }) {
  const { config: cfg, fellBack: onbFellBack } = useOnbConfig(settings);
  const [creating, setCreating] = useState(false);
  const byId = useMemo(() => Object.fromEntries(A(leads).map(l => [l.id, l])), [leads]);
  if (onboardings === undefined) return <div className="empty">Loading…</div>;
  if (onboardings === null) return <div className="empty">Onboarding is not set up yet. Run <b>ONBOARDING-MIGRATION.sql</b> in Supabase (see VERIFY-RLS.md §14), then reload.</div>;
  const sel = A(onboardings).find(o => o.id === selected);
  if (sel) {
    const lead = byId[sel.lead_id];
    return (<div><style>{ANSWERS_CSS + ONBD_CSS + PORTAL_CSS + EMBED_CSS}</style>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button className="btn btn-g btn-sm" onClick={() => setSelected(null)}>← All onboardings</button>
        <b style={{ fontSize: 17 }}>{lead ? personLabel(lead) : 'Unknown client'}</b>
        {lead && <button className="btn btn-g btn-sm" onClick={() => openLead(lead.id)}>Open the client</button>}
      </div>
      <OnboardingDetail o={sel} lead={lead} settings={settings} apiPost={apiPost} reload={reload} toggleChecklist={toggleChecklist} />
    </div>);
  }
  return (<div><style>{ANSWERS_CSS + ONBD_CSS}</style>
    {/* the portal settings moved to Settings → Onboarding portal; a fallback
        still warns here, where the onboardings are */}
    {(() => { const warn = onbFellBack.filter(f => !['pipelines', 'tiles'].includes(f));
      return (<div className={'onbd-moved' + (warn.length ? ' warn' : '')}>
        <span>{warn.length ? <>Portal settings are using a built-in default for <b>{warn.join(', ')}</b>.</> : 'Portal settings (licensing state, product map, kickoff link) are in Settings.'}</span>
        {openSettings && <button className="btn btn-g btn-sm" onClick={() => openSettings('onboarding-portal')}>Open in Settings</button>}
      </div>); })()}
    {creating ? <CreateForm leads={leads} proposals={proposals} onboardings={onboardings} settings={settings} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />
      : <div className="toolbar" style={{ marginBottom: 12 }}><div className="sec-title" style={{ margin: 0 }}><Rocket size={15} />Onboardings</div>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}><Plus size={14} />New onboarding</button></div>}
    {!onboardings.length ? <div className="empty">No onboardings yet. One is created when a client accepts a proposal, or press <b>New onboarding</b>.</div>
      : <div className="onbd-list">{onboardings.map(o => {
        const lead = byId[o.lead_id]; const sm = summarize(o, lead, cfg);
        return (<button key={o.id} className="onbd-row" onClick={() => setSelected(o.id)}>
          <span className="who"><b>{(o.answers || {})['biz.name'] || (lead ? personLabel(lead) : 'Unknown client')}</b><span>{o.package_name || productLine(o.products, cfg.productNames)}</span></span>
          <span className={'onbd-pill s-' + o.status}>{sm.statusText}</span>
          <span className="onbd-mute">{sm.need.filter(x => !x.ok).length} still needed</span>
          <span className="onbd-mute">{sm.launch.started ? `launch ${sm.launch.target ? shortDate(sm.launch.target) : 'clock running'}` : o.status === 'submitted' ? `waiting on ${sm.launch.waiting.join(', ')}` : ''}</span>
          <span className="onbd-mute">{ago(o.last_activity_at || o.updated_at)}</span>
        </button>);
      })}</div>}
  </div>);
}

/* the client record's Onboarding tab: the same detail, compact */
export function ClientOnboarding({ lead, onboardings, settings, apiPost, reload, toggleChecklist, openOnboarding }) {
  const mine = A(onboardings).filter(o => o.lead_id === lead.id);
  if (onboardings === null) return <div className="empty">Onboarding is not set up yet (ONBOARDING-MIGRATION.sql).</div>;
  if (!mine.length) return <div className="empty">No onboarding for this client yet. Create one from the Onboarding tab.</div>;
  return (<div><style>{ANSWERS_CSS + ONBD_CSS + PORTAL_CSS + EMBED_CSS}</style>
    {mine.map(o => (<div key={o.id} style={{ marginBottom: 14 }}>
      <OnboardingDetail o={o} lead={lead} settings={settings} apiPost={apiPost} reload={reload} toggleChecklist={toggleChecklist} compact />
      {openOnboarding && <button className="btn btn-g btn-sm" onClick={() => openOnboarding(o.id)}>Open in Onboarding</button>}
    </div>))}
  </div>);
}

const EMBED_CSS = `.ob.ob-embed{min-height:0;background:none;padding:4px 0}`;
export const ONBD_CSS = `
.onbd-moved{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;font-size:13px;color:#56607A;background:#F6F7FC;border:1px solid #E3E6F2;border-radius:12px;padding:9px 12px;margin-bottom:14px}
.onbd-moved.warn{background:#FFF6E6;border-color:#F2D9A6;color:#8A5A12}
.onbd-head{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}
.onbd-status{display:flex;gap:10px;align-items:center;font-size:13px;color:#56637F}
.onbd-sub{font-size:13px;color:#56637F;margin-top:4px}
.onbd-actions{display:flex;gap:6px;flex-wrap:wrap}
.onbd-pill{display:inline-block;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase;border-radius:99px;padding:3px 10px;background:#EEF2F8;color:#4F5B73}
.onbd-pill.s-in_progress{background:#FFF1E8;color:#B23A07}
.onbd-pill.s-submitted{background:#E6F6EE;color:#17663F}
.onbd-pill.s-needs_info{background:#FDECEC;color:#B4322E}
.onbd-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.onbd-card{margin-bottom:14px}
.onbd-warn{border-color:#F5C9A8}
.onbd-tog{display:flex;margin:6px 0}
.onbd-launch{margin:10px 0 6px;font-size:14px}
.onbd-mute{font-size:12.5px;color:#56637F}
.onbd-need{list-style:none;padding:0;margin:0;font-size:13.5px}
.onbd-need li{display:flex;gap:8px;padding:5px 0;border-top:1px solid #EEF2F8}
.onbd-need li:first-child{border-top:0}
.onbd-need li.ok{color:#56637F;text-decoration:line-through}
.onbd-need em{margin-left:auto;font-style:normal;font-size:11.5px;color:#56637F;text-decoration:none}
.onbd-files{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.onbd-file{display:flex;gap:10px;align-items:center;border:1px solid #DCE5F4;border-radius:10px;padding:8px;font-size:12px;color:#56637F;text-decoration:none}
.onbd-file b{color:#0B1633}
.onbd-file img,.onbd-file .ic{width:54px;height:54px;object-fit:cover;border-radius:8px;background:#F7FAFF;display:grid;place-items:center;font-size:22px;flex:none}
.onbd-prompt{width:100%;min-height:280px;font:12.5px ui-monospace,Menlo,monospace;border:1px solid #DCE5F4;border-radius:10px;padding:10px;margin-top:8px}
.onbd-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}
.onbd-confirm{display:flex;gap:8px;align-items:center;font-size:13.5px}
.onbd-list{display:grid;gap:8px}
.onbd-row{display:grid;grid-template-columns:2fr auto 1fr 1.4fr auto;gap:12px;align-items:center;text-align:left;background:#fff;border:1px solid #DCE5F4;border-radius:12px;padding:12px 14px;cursor:pointer;font:inherit;color:inherit}
.onbd-row:hover{border-color:#9DB8E8}
.onbd-row .who{display:flex;flex-direction:column}
.onbd-row .who span{font-size:12.5px;color:#56637F}
.onbd-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.onbd-form label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600}
.onbd-form fieldset{border:0;padding:0;margin:0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.onbd-form legend{font-size:13px;font-weight:600;margin-bottom:4px;width:100%}
@media (max-width:760px){.onbd-grid,.onbd-form{grid-template-columns:1fr}.onbd-row{grid-template-columns:1fr auto}.onbd-row > .onbd-mute{display:none}}
`;
