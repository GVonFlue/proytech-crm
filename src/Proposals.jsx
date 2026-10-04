/* PROPOSALS — build one in under five minutes, review it, send it.

   Flow: pick the client, pick what they bought and what you quoted, type your
   notes, Generate. The AI writes the words (api/proposal-draft.js); every
   number is computed here by lib/proposal quote() and can only be changed in
   the price fields, never in the prose. Review and edit, then Download PDF,
   Copy link, or Email it to the address on the lead.

   OWNER ONLY. The tab is off the rep tab list, the table is owner-only in
   Postgres, and both server routes require an owner session.

   A SENT PROPOSAL IS FROZEN. What the client saw is what stays on record; a new
   offer is a new proposal. saveProposal refuses to update anything but a draft. */
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles, Download, Link2, Send, X, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Trash2, Check, ArrowUp, ArrowDown } from 'lucide-react';
import ProposalDoc, { PROPOSAL_CSS } from './ProposalDoc';
import { readOffer, quote, cleanCopy, buildBody, newToken, isExpired, readiness, validateOffer, safeAsset } from './lib/proposal';
import { personLabel, todayISO, servicesOf } from './lib/lead';
// the shipped example offer, for "Load default offer" in Settings → Proposals
import DEFAULT_OFFER from '../PROPOSAL-OFFER.json';
import { db } from './lib/supabase';

/* cents always show two digits, as on the proposal: $2,249.50, never $2,249.5 */
const usd = v => { const n = Number(v) || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
const fmt = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
/* "Oct 4 · 2:14 PM" — when a client opened it matters to the hour, because the
   best time to call is right after they have read it. */
const fmtAt = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? `${fmt(iso)} · ${new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''; };
/* A proposal's value is its SETUP total — the same number an acceptance writes
   to the lead as dealValue (lib/proposal acceptancePatch), so this list and the
   lead never disagree (ENGINEERING §2). The monthly is shown beside it, never
   folded in. A quote with no number shows a dash, not a plausible $0. */
const valueOf = p => { const q = (p && p.body && p.body.quote) || {}; const s = Number(q.setup), m = Number(q.monthly);
  return { setup: Number.isFinite(s) ? s : null, monthly: Number.isFinite(m) ? m : null }; };
const linkFor = token => `${window.location.origin}/proposal.html#t=${encodeURIComponent(token)}`;

export function statusOf(p, now = Date.now()) {
  if (!p) return 'draft';
  if (p.status === 'accepted') return 'accepted';
  if ((p.status === 'sent' || p.status === 'viewed') && isExpired(p.expires_at, now)) return 'expired';
  return p.status;
}
const PILL = { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', accepted: 'Accepted', expired: 'Expired' };
const FILTERS = ['all', 'draft', 'sent', 'viewed', 'accepted', 'expired'];

const blankSel = (offer) => {
  const pkg = offer && offer.packages[0];
  return { packageId: pkg ? pkg.id : '', addonIds: [], prices: {}, seats: pkg ? pkg.seatsIncluded : 0, prepay: true };
};

export default function Proposals({ leads, settings, apiPost, me, openLead, proposals, reload, onSaved }) {
  const { offer, missing } = useMemo(() => readOffer(settings), [settings]);
  const [cur, setCur] = useState(null);           // the proposal being built or viewed
  const [filter, setFilter] = useState('all');
  const leadsById = useMemo(() => Object.fromEntries((leads || []).map(l => [l.id, l])), [leads]);

  if (proposals === null) return (<div className="card pp-empty">
    <b>Proposals are not set up on this install yet.</b>
    <p>Run <code>PROPOSALS-MIGRATION.sql</code> in Supabase, then reload. Nothing else is affected.</p></div>);

  if (cur) return <Builder key={cur.id || cur.token} start={cur} offer={offer} missing={missing} leads={leads}
    leadsById={leadsById} apiPost={apiPost} me={me} openLead={openLead}
    onBack={() => { setCur(null); reload && reload(); }} onSaved={onSaved} />;

  const all = proposals || [];
  const rows = all.map(p => ({ p, st: statusOf(p), v: valueOf(p), lead: leadsById[p.lead_id] }));
  const count = k => (k === 'all' ? rows.length : rows.filter(r => r.st === k).length);
  const shown = filter === 'all' ? rows : rows.filter(r => r.st === filter);
  const open = rows.filter(r => r.st === 'sent' || r.st === 'viewed');
  const sum = list => list.reduce((a, r) => a + (r.v.setup || 0), 0);
  const won = rows.filter(r => r.st === 'accepted');
  /* opened = ever viewed, among everything ever sent: an accepted or expired
     proposal was still opened, and leaving it out undercounts the rate */
  const sentRows = rows.filter(r => r.p.sent_at);
  const opened = sentRows.filter(r => r.p.viewed_at);
  const start = () => setCur({ token: newToken(), status: 'draft', isNew: true });
  const canStart = !!(offer && offer.packages.length);

  return (<div className="pp-page">
    <style>{PROPOSAL_CSS + PROPOSALS_CSS}</style>
    <div className="pp-head">
      <div>
        <div className="pp-kick">Proposals</div>
        <h1 className="pp-h1">Send a proposal they can say yes to</h1>
        <p className="pp-sub">Pick the client and what they are buying, add your notes, and review the draft. They accept from their phone.</p>
      </div>
      <button className="btn btn-p pp-new" disabled={!canStart} onClick={start}><Plus size={16} />New proposal</button>
    </div>
    {missing.length > 0 && <div className="pp-warn"><AlertTriangle size={15} />
      <span><b>{missing.includes('offer') ? 'No offer is set up yet.' : 'Your offer is incomplete.'}</b> Missing: {missing.join(', ')}. Add it in Settings → Proposals. Until then nothing can be priced.</span></div>}

    {rows.length > 0 && <div className="pp-stats">
      <div className="pp-stat"><span>Waiting on a client</span><b>{open.length}</b><em>{open.length ? usd(sum(open)) + ' in setup' : 'none out right now'}</em></div>
      <div className="pp-stat"><span>Opened</span><b>{opened.length}</b><em>of {sentRows.length} sent</em></div>
      <div className="pp-stat win"><span>Accepted</span><b>{won.length}</b><em>{won.length ? usd(sum(won)) + ' in setup' : 'none yet'}</em></div>
      <div className="pp-stat"><span>Drafts</span><b>{count('draft')}</b><em>not sent</em></div>
    </div>}

    {rows.length > 0 && <div className="pp-filters" role="tablist">
      {FILTERS.filter(k => k !== 'expired' || count('expired') > 0).map(k => (
        <button key={k} role="tab" aria-selected={filter === k} className={'pp-chip ' + k + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>
          {k !== 'all' && <i />}{k === 'all' ? 'All' : PILL[k]}<span>{count(k)}</span></button>))}
    </div>}

    {!rows.length && <div className="pp-emptycard">
      <div className="pp-kick">Nothing sent yet</div>
      <h2>No proposals yet</h2>
      <p>Your first one takes about five minutes. Every price comes from your offer in Settings, and the AI writes only the words.</p>
      <button className="btn btn-p pp-new" disabled={!canStart} onClick={start}><Plus size={16} />New proposal</button>
    </div>}

    {rows.length > 0 && !shown.length && <div className="pp-emptycard small">No {PILL[filter] ? PILL[filter].toLowerCase() : ''} proposals.</div>}

    {shown.length > 0 && <div className="pp-list">{shown.map(({ p, st, v, lead }) => {
      const q = (p.body && p.body.quote) || {};
      const title = (p.body && p.body.copy && p.body.copy.headline) || (q.items || []).map(i => i.name).join(' + ') || 'Untitled proposal';
      return (<button className={'pp-row ' + st} key={p.id} onClick={() => setCur(p)}>
        <div className="pp-who"><b>{lead ? personLabel(lead) : 'Lead removed'}</b><span>{title}</span></div>
        <div className="pp-val"><b>{v.setup === null ? '—' : usd(v.setup)}</b><span>{v.monthly ? usd(v.monthly) + '/mo' : 'no monthly'}</span></div>
        <div className="pp-when">
          <span className={'pp-pill ' + st}><i />{PILL[st]}</span>
          <div className="pp-trail">{st === 'draft' ? <span>Last edited {fmt(p.updated_at)}</span> : <>
            {p.sent_at && <span>Sent {fmt(p.sent_at)}</span>}
            {p.viewed_at ? <span className="seen">Viewed {fmtAt(p.viewed_at)}</span> : (st !== 'accepted' && p.sent_at && <span className="muted">Not opened yet</span>)}
            {st === 'accepted' ? <span className="won">Accepted {fmtAt(p.accepted_at)} by {p.accepted_name}</span>
              : st === 'expired' ? <span className="lost">Expired {fmt(p.expires_at)}</span>
              : p.expires_at ? <span className="muted">Good until {fmt(p.expires_at)}</span> : null}
          </>}</div>
        </div>
        <ChevronRight size={18} className="pp-go" />
      </button>);
    })}</div>}
  </div>);
}

/* The numbers a proposal shows. A SENT proposal shows the quote frozen in its
   body, whatever the offer in Settings says now: changing a price must never
   reach a proposal a client already has. Only a draft is priced live. */
export function quoteFor(start, offer, sel) {
  const frozen = !!(start && start.status && start.status !== 'draft');
  if (frozen) return { ok: true, ...((start.body && start.body.quote) || {}) };
  return quote(offer, sel);
}

function Builder({ start, offer, missing, leads, leadsById, apiPost, me, openLead, onBack, onSaved }) {
  const frozen = !!(start.status && start.status !== 'draft');
  const startBody = start.body || {};
  const sq = startBody.quote || {};
  const [id, setId] = useState(start.id || null);
  const [token] = useState(start.token);
  const [leadId, setLeadId] = useState(start.lead_id || '');
  const [sel, setSel] = useState(() => start.body ? {
    packageId: sq.packageId, addonIds: (sq.items || []).filter(i => i.kind === 'addon').map(i => i.id),
    prices: Object.fromEntries((sq.items || []).map(i => [i.id, { setup: i.setup, monthly: i.monthly }])),
    seats: sq.seats || 0, prepay: !!sq.prepay,
  } : blankSel(offer));
  const [validDays, setValidDays] = useState(start.valid_days || (offer && offer.validDays) || 7);
  const [notes, setNotes] = useState(start.notes || '');
  const [copy, setCopy] = useState(startBody.copy || null);
  const [warnings, setWarnings] = useState([]);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [mail, setMail] = useState(null);         // {subject, message} while the email panel is open
  const [pub, setPub] = useState({ status: start.status, expires_at: start.expires_at });
  const lead = leadsById[leadId] || null;
  /* "I've read every section" is a claim about THIS text: any edit clears it */
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => { setReviewed(false); }, [copy, sel, validDays, leadId]);

  const q = useMemo(() => quoteFor(start, offer, sel), [offer, sel, start]);
  const body = useMemo(() => {
    if (frozen) return startBody;
    if (!q.ok || !copy || !lead) return null;
    return buildBody({ offer, q, copy, client: clientOf(lead), preparedOn: todayISO(), validDays });
  }, [frozen, q, copy, lead, offer, validDays]);

  /* THE PROPOSAL STANDARD, on the body that will be published — the same
     readiness() api/proposal-send.js enforces. Link and email differ only by
     the email rule. */
  const readyLink = readiness(body, { mode: 'link', reviewed });
  const readyEmail = readiness(body, { mode: 'email', leadEmail: lead && lead.email, reviewed });
  const pkgs = offer ? offer.packages : []; const addons = offer ? offer.addons : [];
  const chosen = offer ? [pkgs.find(p => p.id === sel.packageId), ...sel.addonIds.map(a => addons.find(x => x.id === a))].filter(Boolean) : [];
  const pkg = pkgs.find(p => p.id === sel.packageId);
  const setPrice = (iid, k, v) => setSel(s => ({ ...s, prices: { ...s.prices, [iid]: { ...(s.prices[iid] || {}), [k]: v } } }));
  const priceOf = (it, k) => { const o = sel.prices[it.id]; return o && o[k] !== undefined ? o[k] : it[k]; };
  const say = (kind, text) => setMsg({ kind, text });

  const generate = async () => {
    if (!lead) return say('err', 'Pick the client first.');
    if (!q.ok) return say('err', q.error);
    if (notes.trim().length < 40) return say('err', 'Add a few more notes first. The proposal is only as specific as what you give it.');
    setBusy('gen'); setMsg(null);
    try {
      const r = await apiPost('/api/proposal-draft', {
        client: clientOf(lead), notes, validDays,
        ownerName: String(me || '').split(' ')[0], agency: offer.company.name,
        items: chosen.map(c => ({ id: c.id, name: c.name, kind: c.kind, summary: c.summary, includes: c.includes })),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { say('err', j.error || 'The draft did not come back. Try again.'); return; }
      // link each build entry to what was bought (readiness rule 'build')
      const { copy: c, warnings: w } = cleanCopy(j.draft, chosen.map(x => ({ id: x.id, name: x.name })));
      setCopy(c); setWarnings(w); say('ok', 'Draft ready. Read it through, edit anything, then save or send.');
    } catch { say('err', 'Could not reach the server.'); }
    finally { setBusy(''); }
  };

  const save = async () => {
    if (frozen) return id;
    if (!body) { say('err', !lead ? 'Pick the client first.' : !q.ok ? q.error : 'Generate the draft first.'); return null; }
    setBusy('save');
    try {
      const nid = await db.saveProposal({ id, lead_id: leadId, token, body, notes, valid_days: validDays });
      setId(nid); onSaved && onSaved(); say('ok', 'Saved.'); return nid;
    } catch (e) { say('err', e.message || 'Could not save.'); return null; }
    finally { setBusy(''); }
  };

  const publish = async (mode, extra) => {
    const pid = await save(); if (!pid) return null;
    setBusy(mode);
    try {
      // the server re-runs the same readiness() and refuses if anything fails
      const r = await apiPost('/api/proposal-send', { id: pid, mode, reviewed, ...(extra || {}) });
      const j = await r.json().catch(() => ({}));
      if (j.link) setPub(p => ({ ...p, status: p.status === 'viewed' ? 'viewed' : 'sent', expires_at: j.expiresAt }));
      if (!j.ok) { say('err', j.error || 'That did not go through.'); return j; }
      onSaved && onSaved(); return j;
    } catch { say('err', 'Could not reach the server.'); return null; }
    finally { setBusy(''); }
  };

  const copyLink = async () => {
    if (pub.status === 'accepted') return;
    const j = frozen && !isExpired(pub.expires_at) ? { ok: true, link: linkFor(token) } : await publish('link');
    if (!j || !j.ok) return;
    try { await navigator.clipboard.writeText(j.link); say('ok', 'Link copied. It is good for ' + validDays + ' days from now.'); }
    catch { say('ok', 'Link: ' + j.link); }
  };

  const sendEmail = async () => {
    if (!mail) return;
    const j = await publish('email', { subject: mail.subject, message: mail.message });
    if (j && j.ok) { setMail(null); say('ok', `Sent to ${j.to}. Good until ${fmt(j.expiresAt)}.`); }
  };

  const printPdf = () => {
    setEdit(false);
    document.body.classList.add('pd-printing');
    const done = () => { document.body.classList.remove('pd-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
  };

  const st = statusOf({ ...start, ...pub });
  const leadsSorted = useMemo(() => (leads || []).filter(l => !l.isRelationship).slice().sort((a, b) => personLabel(a).localeCompare(personLabel(b))), [leads]);

  return (<div className="pp-wrap">
    <style>{PROPOSAL_CSS + PROPOSALS_CSS}</style>
    <div className="toolbar pd-noprint" style={{ marginBottom: 12 }}>
      <button className="btn btn-g btn-sm" onClick={onBack}><ChevronLeft size={15} />All proposals</button>
      <span className={'pp-pill ' + st}>{PILL[st]}</span>
    </div>
    {msg && <div className={'pp-msg pd-noprint ' + msg.kind}>{msg.kind === 'err' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}<span>{msg.text}</span>
      <button onClick={() => setMsg(null)}><X size={14} /></button></div>}
    <div className="pp-grid">
      {!frozen && <div className="pp-form pd-noprint">
        {missing.length > 0 && <div className="pp-warn"><AlertTriangle size={15} /><span>Offer incomplete: {missing.join(', ')}. Settings → Proposals.</span></div>}
        {/* where you are in a new proposal; each step ticks when it is done */}
        <ol className="pp-steps">{[
          ['Client', !!lead],
          ['Package & price', !!lead && q.ok],
          ['Your notes', notes.trim().length >= 40],
          ['Review & send', !!copy && (pub.status === 'sent' || pub.status === 'viewed')],
        ].map(([label, done], i, arr) => {
          const current = !done && arr.slice(0, i).every(x => x[1]);
          return <li key={label} className={done ? 'done' : current ? 'now' : ''}><span>{done ? <Check size={12} /> : i + 1}</span>{label}</li>;
        })}</ol>
        <label className="pp-l">Client</label>
        <select value={leadId} onChange={e => setLeadId(e.target.value)}>
          <option value="">Pick a client or lead…</option>
          {leadsSorted.map(l => <option key={l.id} value={l.id}>{personLabel(l)}</option>)}
        </select>
        {lead && !lead.email && <div className="pp-hint">No email on this lead. You can still copy the link or download the PDF. <button onClick={() => openLead && openLead(lead.id)}>Add an email</button></div>}

        <label className="pp-l">Package</label>
        <div className="pp-opts">{pkgs.map(p => (<button key={p.id} className={'pp-opt' + (sel.packageId === p.id ? ' on' : '')}
          onClick={() => setSel(s => ({ ...s, packageId: p.id, seats: Math.max(Number(s.seats) || 0, p.seatsIncluded) }))}>
          <b>{p.name}</b><span>usually {usd(p.setup)} + {usd(p.monthly)}/mo</span></button>))}</div>
        {addons.length > 0 && <><label className="pp-l">Add-ons</label>
          <div className="pp-opts">{addons.map(a => { const on = sel.addonIds.includes(a.id); return (<button key={a.id} className={'pp-opt' + (on ? ' on' : '')}
            onClick={() => setSel(s => ({ ...s, addonIds: on ? s.addonIds.filter(x => x !== a.id) : [...s.addonIds, a.id] }))}>
            <b>{on ? '✓ ' : '+ '}{a.name}</b><span>usually {usd(a.setup)} + {usd(a.monthly)}/mo</span></button>); })}</div></>}

        <label className="pp-l">What you quoted them</label>
        {chosen.map(c => (<div className="pp-price" key={c.id}><span>{c.name}</span>
          <label>$<input type="number" min="0" value={priceOf(c, 'setup')} onChange={e => setPrice(c.id, 'setup', e.target.value)} aria-label={`${c.name} setup`} /><em>setup</em></label>
          <label>$<input type="number" min="0" value={priceOf(c, 'monthly')} onChange={e => setPrice(c.id, 'monthly', e.target.value)} aria-label={`${c.name} monthly`} /><em>/mo</em></label>
        </div>))}
        {pkg && pkg.seatsIncluded > 0 && <div className="pp-price"><span>Seats</span>
          <label><input type="number" min={pkg.seatsIncluded} value={sel.seats} onChange={e => setSel(s => ({ ...s, seats: e.target.value }))} aria-label="Seats" /><em>{pkg.seatsIncluded} included, then {usd(pkg.extraSeat)}/mo each</em></label></div>}
        {offer && offer.prepay && <label className="pp-check"><input type="checkbox" checked={sel.prepay} onChange={e => setSel(s => ({ ...s, prepay: e.target.checked }))} />
          Offer the {offer.prepay.months}-month prepay ({offer.prepay.free} months free)</label>}
        <div className="pp-price"><span>Good for</span><label><input type="number" min="1" max="60" value={validDays} onChange={e => setValidDays(Math.max(1, Math.min(60, Number(e.target.value) || 7)))} aria-label="Days valid" /><em>days from when it is sent</em></label></div>
        {q.ok ? <div className="pp-total">Setup <b>{usd(q.setup)}</b> · deposit <b>{usd(q.deposit)}</b> · monthly <b>{usd(q.monthly)}</b>{q.prepay ? <> · prepay <b>{usd(q.prepay.total)}</b></> : null}</div>
          : <div className="pp-total err">{q.error}</div>}

        <label className="pp-l">Your notes from the meeting</label>
        <textarea className="pp-notes" rows={9} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Their goal, their numbers, what is not working, what they want, what they said. The more specific, the better the proposal. Nothing here is shown to the client." />
        <div className="pp-acts">
          <button className="btn btn-p" onClick={generate} disabled={!!busy}><Sparkles size={15} />{busy === 'gen' ? 'Writing…' : copy ? 'Regenerate' : 'Generate proposal'}</button>
          <button className="btn btn-g" onClick={save} disabled={!!busy || !body}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
          {id && !frozen && <button className="btn btn-g" title="Delete this draft" onClick={async () => { if (!window.confirm('Delete this draft?')) return; try { await db.deleteProposal(id); onBack(); } catch (e) { say('err', e.message); } }}><Trash2 size={14} /></button>}
        </div>
      </div>}

      <div className="pp-preview">
        {!body && <div className="card pp-empty pd-noprint">{!lead ? 'Pick a client to start.' : !q.ok ? q.error : 'Add your notes and press Generate. The proposal renders here for review.'}</div>}
        {body && <>
          {st !== 'accepted' && <ReadyChecklist link={readyLink} email={readyEmail} reviewed={reviewed} onReviewed={setReviewed} />}
          <div className="pp-bar pd-noprint">
            {!frozen && <button className={'btn btn-sm ' + (edit ? 'btn-p' : 'btn-g')} onClick={() => setEdit(e => !e)}>{edit ? 'Done editing' : 'Edit text'}</button>}
            <button className="btn btn-g btn-sm" onClick={printPdf}><Download size={14} />Download PDF</button>
            {st !== 'accepted' && <button className="btn btn-g btn-sm" onClick={copyLink} disabled={!!busy || !readyLink.ok} title={readyLink.ok ? '' : 'Finish the checklist first'}><Link2 size={14} />{busy === 'link' ? 'Publishing…' : 'Copy client link'}</button>}
            {st !== 'accepted' && <button className="btn btn-p btn-sm" disabled={!!busy || !readyEmail.ok} title={readyEmail.ok ? '' : 'Finish the checklist first'} onClick={() => {
              if (!lead || !lead.email) { say('err', 'This lead has no email on file. Add one to the lead first.'); return; }
              if (frozen && !window.confirm('This proposal was already sent. Sending again restarts its ' + validDays + '-day window. Send again?')) return;
              const e = (body.copy && body.copy.email) || {}; setMail({ subject: e.subject || `Your proposal from ${offer ? offer.company.name : ''}`, message: e.body || '' });
            }}><Send size={14} />Email to client</button>}
          </div>
          {warnings.length > 0 && <div className="pp-warn pd-noprint"><AlertTriangle size={15} /><span>{warnings.join(' ')}</span></div>}
          {mail && <div className="card pp-mail pd-noprint">
            <div className="pp-mail-h"><b>Email to {lead && lead.email}</b><button onClick={() => setMail(null)}><X size={15} /></button></div>
            <label className="pp-l">Subject</label>
            <input value={mail.subject} onChange={e => setMail(m => ({ ...m, subject: e.target.value }))} />
            <label className="pp-l">Message</label>
            <textarea rows={9} value={mail.message} onChange={e => setMail(m => ({ ...m, message: e.target.value }))} />
            <div className="pp-hint">A "View your proposal" button and the good-until date are added below your message automatically.</div>
            <button className="btn btn-p" onClick={sendEmail} disabled={!!busy || !readyEmail.ok || mail.message.trim().length < 20}><Send size={14} />{busy === 'email' ? 'Sending…' : 'Send it'}</button>
          </div>}
          {st === 'accepted' && <div className="pp-msg ok pd-noprint"><CheckCircle2 size={15} /><span>Accepted {fmt(start.accepted_at)} by <b>{start.accepted_name}</b>{start.accepted_plan === 'annual' ? ', with the prepay' : ''}. Next: send the deposit payment link.</span></div>}
          <div className="pd-print-area">
            <ProposalDoc body={body} edit={edit && !frozen} onCopy={setCopy} expiresAt={pub.expires_at}
              acceptSlot={<div className="pp-acceptph pd-noprint">The client sees an Accept button here: typed name, agree to terms, then onboarding.</div>} />
          </div>
        </>}
      </div>
    </div>
  </div>);
}

/* READY TO SEND. One row per rule from lib/proposal readiness(): a tick, or
   what is missing. Send stays disabled until every row passes; the server
   checks the same rules again and refuses if they do not. */
export function ReadyChecklist({ link, email, reviewed, onReviewed }) {
  const rows = email.checks;            // email mode = every rule, link's + the email one
  const done = rows.filter(c => c.ok).length;
  return (<div className={'pp-ready pd-noprint' + (email.ok ? ' ok' : link.ok ? ' part' : '')}>
    <div className="pp-ready-h">
      <div><div className="pp-kick">Ready to send</div>
        <b>{email.ok ? 'Everything checks out. Send it.' : link.ok ? 'Ready as a link. Add an email to the lead to send it by email.' : `${rows.length - done} thing${rows.length - done === 1 ? '' : 's'} to fix before this can go out`}</b></div>
      <span className="pp-ready-n">{done}/{rows.length}</span>
    </div>
    <ul>{rows.map(c => (<li key={c.key} className={c.ok ? 'ok' : 'no'}>
      <i>{c.ok ? <Check size={12} /> : <X size={12} />}</i>
      <span>{c.label}{c.key === 'email' ? <em> (email only)</em> : null}</span>
      {c.detail && <small>{c.detail}</small>}
    </li>))}</ul>
    <label className="pp-ready-tick"><input type="checkbox" checked={!!reviewed} onChange={e => onReviewed(e.target.checked)} />
      I've read every section of this proposal, as the client will see it.</label>
  </div>);
}

/* SETTINGS → PROPOSALS: THE PRICE EDITOR.

   A form, not a JSON box: a card per package and add-on, the deposit and
   validity rules, the standard sections and the company block. It edits a
   DRAFT of settings.offer and writes nothing until Save, and Save refuses
   until validateOffer() (lib/proposal: readOffer's rules, plus every blank,
   non-number and duplicate named by field) comes back clean.

   WHAT SAVING CANNOT DO: change a proposal already sent. A proposal's prices,
   terms and company block are copied into its body by buildBody() when it is
   built, deep-copied so they share nothing with this offer, and the body is
   frozen once sent (saveProposal updates drafts only). This screen writes
   settings.offer and nothing else. tests/offereditor.mjs proves all three.

   OWNER ONLY. The Settings tab can be switched on for a rep; the offer is
   prices, so a rep sees a notice instead of the form. (app_settings itself is
   writable by any listed user — ROLES.md, the honest limits — so this is the
   screen's rule, not the database's.) */

const clone = v => JSON.parse(JSON.stringify(v));
const slug = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const blankItem = kind => ({ id: '', name: '', service: '', setup: '', monthly: '', seatsIncluded: 0, extraSeat: 0, summary: '', includes: [], covers: [], ...(kind === 'package' ? { onboardingUrl: '' } : {}) });
const blankOffer = () => ({ company: { name: '', people: '', email: '', website: '', city: '', logo: '', mark: '' }, depositPct: 50, validDays: 7, prepay: { months: 12, free: 2 },
  guarantee: '', terms: '', cancel: '', packages: [blankItem('package')], addons: [], underneath: [], quotedSeparately: [], steps: [], needFromYou: [] });
/* numbers are typed as text; they are saved as numbers, never as "" */
const NUM = ['setup', 'monthly', 'seatsIncluded', 'extraSeat'];
export function offerForSave(d) {
  const o = clone(d);
  for (const g of ['packages', 'addons']) o[g] = (o[g] || []).map(it => { const x = { ...it }; for (const k of NUM) if (x[k] !== '' && x[k] != null) x[k] = Number(x[k]); return x; });
  for (const k of ['depositPct', 'validDays']) if (o[k] !== '' && o[k] != null) o[k] = Number(o[k]);
  if (o.prepay) o.prepay = { months: Number(o.prepay.months), free: Number(o.prepay.free) };
  return o;
}
/* How a price line will read on a proposal — computed by quote(), the same
   function that prices real proposals, so the preview cannot disagree. */
export function priceLine(draft, group, i) {
  const it = (draft[group] || [])[i] || {};
  const num = v => (v === '' || v == null ? NaN : Number(v));
  if (!Number.isFinite(num(it.setup)) || num(it.setup) < 0 || !Number.isFinite(num(it.monthly)) || num(it.monthly) < 0) return 'Set a setup and a monthly price to see how it reads.';
  // cents always show two digits, as on the proposal itself: $999.50, never $999.5
  const usd2 = v => { const n = Number(v); return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  const seats = Number(it.seatsIncluded) > 0 ? ` · ${Number(it.seatsIncluded)} seats included, then ${usd2(num(it.extraSeat) || 0)}/mo each` : '';
  if (group === 'addons') return `+ ${it.name || 'This add-on'}: ${usd2(it.setup)} setup + ${usd2(it.monthly)}/mo, on top of any package`;
  const { offer } = readOffer({ offer: offerForSave({ ...draft, company: { ...(draft.company || {}), name: (draft.company && draft.company.name) || 'x' } }) });
  const q = offer && quote(offer, { packageId: it.id || slug(it.name), seats: 0 });
  if (!q || !q.ok) return `${it.name || 'This package'}: ${usd2(it.setup)} setup + ${usd2(it.monthly)}/mo${seats}`;
  return `${it.name}: ${usd2(q.setup)} setup + ${usd2(q.monthly)}/mo${seats} · ${q.depositPct}% deposit, ${usd2(q.deposit)} at signing`
    + (q.prepay ? ` · or ${q.prepay.months} months up front for ${usd2(q.prepay.total)} (${q.prepay.free} free)` : '');
}

function Fld({ label, path, errs, children, hint, wide }) {
  const e = errs[path];
  return (<label className={'oe-f' + (wide ? ' wide' : '') + (e ? ' bad' : '')} data-path={path}><span>{label}</span>{children}
    {e ? <em className="oe-err">{e}</em> : hint ? <em className="oe-hint">{hint}</em> : null}</label>);
}

function ListEdit({ label, items, onChange, path, errs, placeholder, add = 'Add a line' }) {
  const list = Array.isArray(items) ? items : [];
  const move = (i, d) => { const n = list.slice(); const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (<div className="oe-list" data-path={path}><div className="oe-ll">{label}</div>
    {list.map((v, i) => (<div className={'oe-li' + (errs[`${path}.${i}`] ? ' bad' : '')} key={i}>
      <input value={v} placeholder={placeholder} onChange={e => { const n = list.slice(); n[i] = e.target.value; onChange(n); }} aria-label={`${label} ${i + 1}`} />
      <button type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
      <button type="button" title="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
      <button type="button" title="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}><X size={13} /></button>
    </div>))}
    <button type="button" className="oe-addl" onClick={() => onChange([...list, ''])}>+ {add}</button>
  </div>);
}

export function OfferEditor({ settings, saveSettings, isOwner = true, defaultOffer = DEFAULT_OFFER }) {
  const [draft, setDraft] = useState(() => (settings && settings.offer ? clone(settings.offer) : null));
  const [json, setJson] = useState(null);           // text while "Advanced: edit JSON" is open
  const [jsonErr, setJsonErr] = useState('');
  const [tried, setTried] = useState(false);        // show every error once Save has been pressed
  const [saved, setSaved] = useState(false);
  const v = useMemo(() => (draft ? validateOffer(offerForSave(draft)) : null), [draft]);
  const errs = useMemo(() => Object.fromEntries(((v && v.errors) || []).map(e => [e.path, e.msg])), [v]);
  const shownErrs = tried ? errs : Object.fromEntries(Object.entries(errs).filter(([k]) => !/\.(name|id|service|setup|monthly)$|^company\.name$|^terms$/.test(k)));

  if (!isOwner) return (<div className="oe-locked"><AlertTriangle size={15} /><span>Only an owner can change the offer and its prices.</span></div>);

  const edit = fn => { setSaved(false); setDraft(d => { const n = clone(d); fn(n); return n; }); };
  const setAt = (path, val) => edit(d => { let o = d; for (let k = 0; k < path.length - 1; k++) { if (o[path[k]] == null) o[path[k]] = {}; o = o[path[k]]; } o[path[path.length - 1]] = val; });
  const loadDefault = () => {
    if (draft && !window.confirm('Replace what is in the editor with the default offer? Nothing is saved until you press Save.')) return;
    setJson(null); setJsonErr(''); setTried(false); setSaved(false); setDraft(clone(defaultOffer));
  };
  const save = async () => {
    setTried(true);
    let d = draft;
    if (json !== null) { try { d = JSON.parse(json); } catch (e) { setJsonErr('That is not valid JSON: ' + e.message); return; } setDraft(d); }
    const out = offerForSave(d); const chk = validateOffer(out);
    if (!chk.ok) return;
    try { await saveSettings({ ...settings, offer: out }); setSaved(true); } catch { setJsonErr('Could not save. Try again.'); }
  };
  const toggleJson = () => {
    if (json === null) { setJson(JSON.stringify(offerForSave(draft || blankOffer()), null, 2)); setJsonErr(''); return; }
    try { setDraft(JSON.parse(json)); setJson(null); setJsonErr(''); } catch (e) { setJsonErr('Fix the JSON before going back to the form: ' + e.message); }
  };

  if (!draft) return (<div className="oe">
    <style>{PROPOSALS_CSS}</style>
    <div className="oe-empty"><div className="pp-kick">No offer yet</div><b>Set up what you sell, once.</b>
      <p>Packages, add-ons, prices and the standard sections every proposal uses. Start from the default offer and change what differs.</p>
      <div className="oe-acts"><button className="btn btn-p btn-sm" onClick={loadDefault}>Load default offer</button>
        <button className="btn btn-g btn-sm" onClick={() => setDraft(blankOffer())}>Start from scratch</button></div></div>
  </div>);

  const errCount = ((v && v.errors) || []).length;
  const co = draft.company || {};
  const card = (group, it, i) => {
    const p = `${group}.${i}`; const kind = group === 'packages' ? 'package' : 'addon';
    const setIt = (k, val) => edit(d => { const x = d[group][i]; const autoId = !x.id || x.id === slug(x.name); x[k] = val; if (k === 'name' && autoId) x.id = slug(val); });
    const toggleKind = () => edit(d => { const [x] = d[group].splice(i, 1); const to = group === 'packages' ? 'addons' : 'packages'; d[to] = [...(d[to] || []), x]; });
    const remove = () => { if (!window.confirm(`Remove ${it.name || 'this item'} from the offer? Proposals already sent keep their own copy.`)) return; edit(d => { d[group].splice(i, 1); }); };
    return (<div className={'oe-card ' + kind} key={p} data-path={p}>
      <div className="oe-card-h">
        <div className="oe-kind" role="group" aria-label="Package or add-on">
          <button type="button" className={kind === 'package' ? 'on' : ''} onClick={() => kind !== 'package' && toggleKind()}>Package</button>
          <button type="button" className={kind === 'addon' ? 'on' : ''} onClick={() => kind !== 'addon' && toggleKind()}>Add-on</button>
        </div>
        <button type="button" className="oe-rm" onClick={remove}><Trash2 size={14} />Remove</button>
      </div>
      <div className="oe-grid">
        <Fld label="Name" path={p + '.name'} errs={shownErrs} wide><input value={it.name || ''} onChange={e => setIt('name', e.target.value)} placeholder="Package or add-on name" aria-label="Item name" /></Fld>
        <Fld label="Counts as service" path={p + '.service'} errs={shownErrs} hint="The catalog service a won deal is filed under."><input list="oe-services" value={it.service || ''} onChange={e => setIt('service', e.target.value)} placeholder="Web+CRM" /></Fld>
        <Fld label="Setup price" path={p + '.setup'} errs={shownErrs}><div className="oe-money"><i>$</i><input inputMode="decimal" value={it.setup ?? ''} onChange={e => setIt('setup', e.target.value)} aria-label={`${it.name || 'Item'} setup price`} /></div></Fld>
        <Fld label="Monthly price" path={p + '.monthly'} errs={shownErrs}><div className="oe-money"><i>$</i><input inputMode="decimal" value={it.monthly ?? ''} onChange={e => setIt('monthly', e.target.value)} aria-label={`${it.name || 'Item'} monthly price`} /><i>/mo</i></div></Fld>
        <Fld label="Seats included" path={p + '.seatsIncluded'} errs={shownErrs} hint="0 = no seat rule"><input inputMode="numeric" value={it.seatsIncluded ?? ''} onChange={e => setIt('seatsIncluded', e.target.value)} /></Fld>
        <Fld label="Extra seat" path={p + '.extraSeat'} errs={shownErrs}><div className="oe-money"><i>$</i><input inputMode="decimal" value={it.extraSeat ?? ''} onChange={e => setIt('extraSeat', e.target.value)} /><i>/mo</i></div></Fld>
        <Fld label="Id" path={p + '.id'} errs={shownErrs} hint="Set from the name. Proposals record it."><input value={it.id || ''} onChange={e => setIt('id', e.target.value)} /></Fld>
        {kind === 'package' && <Fld label="Onboarding form (https)" path={p + '.onboardingUrl'} errs={shownErrs} hint="Where the client goes after accepting."><input value={it.onboardingUrl || ''} onChange={e => setIt('onboardingUrl', e.target.value)} placeholder="https://" /></Fld>}
        <Fld label="Summary" path={p + '.summary'} errs={shownErrs} wide><textarea rows={2} value={it.summary || ''} onChange={e => setIt('summary', e.target.value)} /></Fld>
      </div>
      <div className="oe-lists">
        <ListEdit label="Includes" items={it.includes} onChange={n => setIt('includes', n)} path={p + '.includes'} errs={errs} add="Add what it includes" />
        <ListEdit label="The monthly covers" items={it.covers} onChange={n => setIt('covers', n)} path={p + '.covers'} errs={errs} add="Add what the monthly covers" />
      </div>
      <div className="oe-line"><b>On a proposal:</b> {priceLine(offerForSave(draft), group, i)}</div>
    </div>);
  };

  return (<div className="oe">
    <style>{PROPOSALS_CSS}</style>
    <datalist id="oe-services">{servicesOf(settings).map(x => <option key={x.name} value={x.name} />)}</datalist>
    <div className="oe-top">
      <div className="oe-acts">
        <button className="btn btn-g btn-sm" onClick={loadDefault}>Load default offer</button>
        <button className="btn btn-g btn-sm" onClick={toggleJson}>{json === null ? 'Advanced: edit JSON' : 'Back to the form'}</button>
      </div>
    </div>

    {json !== null ? <textarea className="pp-json" rows={22} value={json} spellCheck={false} onChange={e => { setJson(e.target.value); setSaved(false); }} aria-label="Offer JSON" /> : <>
      <div className="oe-sec"><div className="oe-sh">Packages</div>
        {(draft.packages || []).map((it, i) => card('packages', it, i))}
        {shownErrs.packages && <div className="oe-err">{shownErrs.packages}</div>}
        <button type="button" className="oe-add" onClick={() => edit(d => { d.packages = [...(d.packages || []), blankItem('package')]; })}><Plus size={14} />Add a package</button>
      </div>
      <div className="oe-sec"><div className="oe-sh">Add-ons</div>
        {(draft.addons || []).map((it, i) => card('addons', it, i))}
        <button type="button" className="oe-add" onClick={() => edit(d => { d.addons = [...(d.addons || []), blankItem('addon')]; })}><Plus size={14} />Add an add-on</button>
      </div>

      <div className="oe-sec"><div className="oe-sh">Deposit, validity and prepay</div>
        <div className="oe-card"><div className="oe-grid">
          <Fld label="Deposit at signing" path="depositPct" errs={shownErrs}><div className="oe-money"><input inputMode="decimal" value={draft.depositPct ?? ''} onChange={e => setAt(['depositPct'], e.target.value)} aria-label="Deposit percent" /><i>%</i></div></Fld>
          <Fld label="Good for" path="validDays" errs={shownErrs}><div className="oe-money"><input inputMode="numeric" value={draft.validDays ?? ''} onChange={e => setAt(['validDays'], e.target.value)} aria-label="Valid days" /><i>days</i></div></Fld>
          <label className="oe-f oe-check"><span>Prepay</span><span className="oe-cb"><input type="checkbox" checked={!!draft.prepay} onChange={e => setAt(['prepay'], e.target.checked ? { months: 12, free: 2 } : null)} />Offer a prepay</span></label>
          {draft.prepay && <Fld label="Months paid up front" path="prepay.months" errs={shownErrs}><input inputMode="numeric" value={draft.prepay.months ?? ''} onChange={e => setAt(['prepay', 'months'], e.target.value)} aria-label="Prepay months" /></Fld>}
          {draft.prepay && <Fld label="Of which free" path="prepay.free" errs={shownErrs}><input inputMode="numeric" value={draft.prepay.free ?? ''} onChange={e => setAt(['prepay', 'free'], e.target.value)} aria-label="Free months" /></Fld>}
          <Fld label="Payment terms" path="terms" errs={shownErrs} wide hint="Required: the client agrees to these when they accept."><textarea rows={2} value={draft.terms || ''} onChange={e => setAt(['terms'], e.target.value)} /></Fld>
          <Fld label="Guarantee" path="guarantee" errs={shownErrs} wide><textarea rows={2} value={draft.guarantee || ''} onChange={e => setAt(['guarantee'], e.target.value)} /></Fld>
          <Fld label="Cancelling" path="cancel" errs={shownErrs} wide><textarea rows={2} value={draft.cancel || ''} onChange={e => setAt(['cancel'], e.target.value)} /></Fld>
        </div></div>
      </div>

      <div className="oe-sec"><div className="oe-sh">How it runs</div>
        <div className="oe-card">{(draft.steps || []).map((st, i) => (<div className={'oe-step' + (errs[`steps.${i}.title`] || errs[`steps.${i}.text`] ? ' bad' : '')} key={i}>
          <span className="oe-n">{String(i + 1).padStart(2, '0')}</span>
          <input value={st.title || ''} placeholder="Title" onChange={e => setAt(['steps', i, 'title'], e.target.value)} aria-label={`Step ${i + 1} title`} />
          <input value={st.text || ''} placeholder="What happens" onChange={e => setAt(['steps', i, 'text'], e.target.value)} aria-label={`Step ${i + 1} text`} />
          <button type="button" title="Move up" disabled={i === 0} onClick={() => edit(d => { [d.steps[i - 1], d.steps[i]] = [d.steps[i], d.steps[i - 1]]; })}><ArrowUp size={13} /></button>
          <button type="button" title="Move down" disabled={i === draft.steps.length - 1} onClick={() => edit(d => { [d.steps[i + 1], d.steps[i]] = [d.steps[i], d.steps[i + 1]]; })}><ArrowDown size={13} /></button>
          <button type="button" title="Remove" onClick={() => edit(d => { d.steps.splice(i, 1); })}><X size={13} /></button>
        </div>))}
          <button type="button" className="oe-addl" onClick={() => edit(d => { d.steps = [...(d.steps || []), { title: '', text: '' }]; })}>+ Add a step</button></div>
      </div>

      <div className="oe-sec"><div className="oe-sh">Standard sections</div>
        <div className="oe-card oe-lists">
          <ListEdit label="What we need from you" items={draft.needFromYou} onChange={n => setAt(['needFromYou'], n)} path="needFromYou" errs={errs} />
          <ListEdit label="Underneath it" items={draft.underneath} onChange={n => setAt(['underneath'], n)} path="underneath" errs={errs} />
          <ListEdit label="Quoted separately" items={draft.quotedSeparately} onChange={n => setAt(['quotedSeparately'], n)} path="quotedSeparately" errs={errs} />
        </div>
      </div>

      <div className="oe-sec"><div className="oe-sh">Your company, on the cover</div>
        <div className="oe-card"><div className="oe-grid">
          <Fld label="Company name" path="company.name" errs={shownErrs}><input value={co.name || ''} onChange={e => setAt(['company', 'name'], e.target.value)} /></Fld>
          <Fld label="People" path="company.people" errs={shownErrs}><input value={co.people || ''} onChange={e => setAt(['company', 'people'], e.target.value)} /></Fld>
          <Fld label="Email" path="company.email" errs={shownErrs}><input value={co.email || ''} onChange={e => setAt(['company', 'email'], e.target.value)} /></Fld>
          <Fld label="Website" path="company.website" errs={shownErrs}><input value={co.website || ''} onChange={e => setAt(['company', 'website'], e.target.value)} /></Fld>
          <Fld label="City" path="company.city" errs={shownErrs}><input value={co.city || ''} onChange={e => setAt(['company', 'city'], e.target.value)} /></Fld>
          <Fld label="Logo" path="company.logo" errs={shownErrs} hint="https:// or a path on this site, e.g. /logo.png"><input value={co.logo || ''} onChange={e => setAt(['company', 'logo'], e.target.value)} /></Fld>
          <Fld label="Footer mark" path="company.mark" errs={shownErrs} hint="https:// or a path on this site"><input value={co.mark || ''} onChange={e => setAt(['company', 'mark'], e.target.value)} /></Fld>
          {safeAsset(co.logo) && <div className="oe-logo"><img src={safeAsset(co.logo)} alt="Logo preview" /></div>}
        </div></div>
      </div>
    </>}

    <div className="oe-save">
      {jsonErr && <div className="oe-err">{jsonErr}</div>}
      {tried && errCount > 0 && <div className="oe-err">Fix {errCount} thing{errCount === 1 ? '' : 's'} before saving: {((v && v.errors) || []).slice(0, 4).map(e => e.msg).join(' ')}{errCount > 4 ? ' …' : ''}</div>}
      <button className="btn btn-p" onClick={save}>Save offer</button>
      {saved && <span className="pp-hint">Saved. New proposals use it now; proposals already sent keep their own prices.</span>}
    </div>
  </div>);
}

/* The client block on the proposal, from the lead record. */
export function clientOf(l) {
  return {
    name: String(l.name || '').trim(), company: String(l.company || '').trim(),
    businessType: String(l.businessType || '').trim(),
    city: String(l.city || l.area || '').trim(), website: String(l.website || '').trim(),
  };
}

export const PROPOSALS_CSS = `
.pp-empty{padding:22px;color:#5E5A7A}
.pp-offer-sum{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#4a4763;margin-bottom:10px}
.pp-json{width:100%;box-sizing:border-box;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;border:1px solid #E1E2EC;border-radius:9px;padding:10px}
.pp-empty code{background:#F1F2F7;padding:1px 5px;border-radius:5px}
.pp-warn{display:flex;gap:8px;align-items:flex-start;background:#FFF6EC;border:1px solid #F0C9A8;color:#8A4A16;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.pp-grid{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:18px;align-items:start}
.pp-form{background:#fff;border:1px solid #E6E7F0;border-radius:14px;padding:16px;position:sticky;top:10px;max-height:calc(100vh - 40px);overflow-y:auto}
.pp-form select,.pp-form textarea,.pp-mail input,.pp-mail textarea{width:100%;box-sizing:border-box;border:1px solid #E1E2EC;border-radius:9px;padding:9px 10px;font:inherit;font-size:14px}
.pp-l{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8b88a0;margin:14px 0 6px}
.pp-opts{display:flex;flex-direction:column;gap:6px}
.pp-opt{text-align:left;border:1px solid #E1E2EC;background:#fff;border-radius:10px;padding:9px 11px;cursor:pointer;font:inherit}
.pp-opt b{display:block;font-size:13.5px}
.pp-opt span{font-size:12px;color:#8b88a0}
.pp-opt.on{border-color:#2B4DE0;background:#F4F7FF;box-shadow:0 0 0 2px rgba(43,77,224,.12)}
.pp-price{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0;font-size:13px}
.pp-price>span{flex:1 1 100%;font-weight:650}
.pp-price label{display:flex;align-items:center;gap:4px;color:#8b88a0}
.pp-price input{width:96px;border:1px solid #E1E2EC;border-radius:8px;padding:7px 8px;font:inherit;font-size:14px}
.pp-price em{font-style:normal;font-size:12px}
.pp-check{display:flex;gap:8px;align-items:center;font-size:13px;margin:8px 0}
.pp-total{margin-top:10px;background:#F4F6FF;border-radius:10px;padding:9px 11px;font-size:13px}
.pp-total.err{background:#FBECEC;color:#b4322e}
.pp-notes{min-height:160px}
.pp-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.pp-hint{font-size:12px;color:#8b88a0;margin-top:6px}
.pp-hint button{border:none;background:none;color:#2B4DE0;font:inherit;font-weight:650;cursor:pointer;padding:0}
.pp-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.pp-msg{display:flex;gap:8px;align-items:center;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}
.pp-msg.ok{background:#E6F6EE;color:#14663E}
.pp-msg.err{background:#FBECEC;color:#8E2420}
.pp-msg span{flex:1}
.pp-msg button,.pp-mail-h button{border:none;background:none;cursor:pointer;color:inherit}
.pp-mail{padding:16px;margin-bottom:14px}
.pp-mail-h{display:flex;justify-content:space-between;align-items:center}
.pp-mail .btn{margin-top:12px}
.pp-acceptph{margin-top:10px;border:1px dashed #B7C3F5;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#5E5A7A;background:#fff}
@media (max-width:980px){ .pp-grid{grid-template-columns:1fr} .pp-form{position:static;max-height:none} }
@media print{
  body.pd-printing *{visibility:hidden}
  body.pd-printing .pd-print-area,body.pd-printing .pd-print-area *{visibility:visible}
  body.pd-printing .pd-print-area{position:absolute;left:0;top:0;width:100%}
  body.pd-printing .pd-noprint{display:none!important}
}

/* ---- the list: the proposal's own brand language, inside the CRM ---- */
.pp-page{--pp-ink:#0B1633;--pp-mute:#56637F;--pp-blue:#1F6FEB;--pp-elec:#2E9BFF;--pp-ice:#38BDF8;--pp-navy:#061431;--pp-hot:#FB6926;--pp-line:#DCE5F4;color:var(--pp-ink)}
.pp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;padding:20px 22px;border-radius:18px;border:1px solid var(--pp-line);
  background:radial-gradient(60% 140% at 100% 0%,rgba(56,189,248,.18),transparent 60%),linear-gradient(180deg,#FFFFFF,#EEF4FF);position:relative;overflow:hidden}
.pp-head:after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,var(--pp-elec),var(--pp-ice) 60%,var(--pp-hot))}
.pp-kick{display:inline-flex;align-items:center;gap:8px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--pp-blue)}
.pp-kick:before{content:"";width:22px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--pp-elec),var(--pp-hot))}
.pp-h1{font-family:"Space Grotesk",Inter,sans-serif;font-size:26px;line-height:1.15;letter-spacing:-.02em;color:var(--pp-navy);margin:6px 0 4px}
.pp-sub{margin:0;color:var(--pp-mute);font-size:13.5px;max-width:560px}
.pp-new{display:inline-flex;align-items:center;gap:6px;font-weight:700;padding:11px 18px;border-radius:12px}
.pp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.pp-stat{background:#fff;border:1px solid var(--pp-line);border-top:3px solid var(--pp-elec);border-radius:14px;padding:12px 14px}
.pp-stat.win{border-top-color:#1f8a55}
.pp-stat span{display:block;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--pp-mute)}
.pp-stat b{display:block;font-family:"Space Grotesk",Inter,sans-serif;font-size:26px;line-height:1.1;color:var(--pp-navy);margin-top:4px}
.pp-stat em{font-style:normal;font-size:12px;color:var(--pp-mute)}
.pp-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.pp-chip{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:13px;font-weight:600;color:var(--pp-ink);background:#fff;border:1px solid var(--pp-line);border-radius:99px;padding:6px 12px;cursor:pointer}
.pp-chip span{font-size:11.5px;font-weight:700;color:var(--pp-mute);background:#F1F4FA;border-radius:99px;padding:1px 7px}
.pp-chip.on{border-color:var(--pp-blue);background:#F4F7FF;box-shadow:0 0 0 2px rgba(31,111,235,.12)}
.pp-chip i,.pp-pill i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.pp-chip.draft i{color:#8B93A7}.pp-chip.sent i{color:var(--pp-blue)}.pp-chip.viewed i{color:#D99A00}.pp-chip.accepted i{color:#1f8a55}.pp-chip.expired i{color:#b4322e}
.pp-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:99px;padding:3px 10px;background:#EEF0F6;color:#5A5680;white-space:nowrap}
.pp-pill.sent{background:#EAF0FF;color:#1F4FD0}
.pp-pill.viewed{background:#FFF4D9;color:#8A5A00}
.pp-pill.accepted{background:#E6F6EE;color:#1a7a4b}
.pp-pill.expired{background:#FBECEC;color:#b4322e}
.pp-list{display:flex;flex-direction:column;gap:8px}
.pp-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(110px,.6fr) minmax(0,1.6fr) 20px;align-items:center;gap:14px;width:100%;text-align:left;font:inherit;color:inherit;
  background:#fff;border:1px solid var(--pp-line);border-left:4px solid #C9D2E3;border-radius:14px;padding:13px 16px;cursor:pointer;transition:box-shadow .15s,border-color .15s}
.pp-row:hover{border-color:#BFD0EE;box-shadow:0 10px 24px -18px rgba(6,20,49,.5)}
.pp-row.sent{border-left-color:var(--pp-blue)}.pp-row.viewed{border-left-color:#E8A400}.pp-row.accepted{border-left-color:#1f8a55}.pp-row.expired{border-left-color:#d06a66}
.pp-who b{display:block;font-size:14.5px;color:var(--pp-navy)}
.pp-who span{display:block;font-size:12.5px;color:var(--pp-mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-val b{display:block;font-family:"Space Grotesk",Inter,sans-serif;font-size:18px;color:var(--pp-navy)}
.pp-val span{font-size:12px;color:var(--pp-mute)}
.pp-when{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0}
.pp-trail{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--pp-ink)}
.pp-trail .seen{color:#8A5A00;font-weight:600}.pp-trail .won{color:#1a7a4b;font-weight:600}.pp-trail .lost{color:#b4322e}.pp-trail .muted{color:var(--pp-mute)}
.pp-go{color:#9AA6BF}
.pp-emptycard{background:#fff;border:1px dashed #C9D6EE;border-radius:18px;padding:28px 24px;text-align:center}
.pp-emptycard h2{font-family:"Space Grotesk",Inter,sans-serif;font-size:22px;color:var(--pp-navy);margin:8px 0 6px}
.pp-emptycard p{color:var(--pp-mute);margin:0 auto 16px;max-width:460px;font-size:13.5px}
.pp-emptycard.small{padding:16px;color:var(--pp-mute);font-size:13.5px}
.pp-steps{list-style:none;margin:0 0 6px;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;counter-reset:s}
.pp-steps li{display:flex;flex-direction:column;align-items:flex-start;gap:4px;font-size:11px;font-weight:600;color:#8b88a0;border-top:3px solid #E6E9F2;padding-top:6px}
.pp-steps li span{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#EEF1F7;color:#6B6885;font-size:11px;font-weight:700}
.pp-steps li.now{color:#1F6FEB;border-top-color:#2E9BFF}.pp-steps li.now span{background:#1F6FEB;color:#fff}
.pp-steps li.done{color:#1a7a4b;border-top-color:#3DBB7E}.pp-steps li.done span{background:#E6F6EE;color:#1a7a4b}
@media (max-width:760px){
  .pp-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pp-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"who val" "when when";row-gap:8px}
  .pp-who{grid-area:who}.pp-val{grid-area:val;text-align:right}.pp-when{grid-area:when}.pp-go{display:none}
  .pp-h1{font-size:22px}.pp-new{width:100%;justify-content:center}
}

/* ---- ready to send: the proposal standard, on the review screen ---- */
.pp-ready{background:#fff;border:1px solid #DCE5F4;border-left:4px solid #E5484D;border-radius:14px;padding:14px 16px;margin-bottom:12px}
.pp-ready.part{border-left-color:#E8A400}
.pp-ready.ok{border-left-color:#1f8a55;background:linear-gradient(90deg,rgba(61,187,126,.07),#fff 40%)}
.pp-ready-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
.pp-ready-h b{display:block;font-family:"Space Grotesk",Inter,sans-serif;font-size:16px;color:#061431;margin-top:4px}
.pp-ready-n{font-family:"Space Grotesk",Inter,sans-serif;font-weight:700;font-size:20px;color:#061431}
.pp-ready ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
.pp-ready li{display:grid;grid-template-columns:20px 1fr;align-items:start;gap:0 8px;font-size:13px;padding:3px 0}
.pp-ready li i{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;margin-top:1px}
.pp-ready li.ok i{background:#E6F6EE;color:#1a7a4b}
.pp-ready li.no i{background:#FDECEC;color:#C2322C}
.pp-ready li.no span{font-weight:600;color:#0B1633}
.pp-ready li.ok span{color:#4A5470}
.pp-ready li small{grid-column:2;font-size:11.5px;color:#8B93A7}
.pp-ready li.no small{color:#B4322E}
.pp-ready li em{font-style:normal;color:#8B93A7;font-weight:500}
.pp-ready-tick{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding-top:10px;border-top:1px solid #EEF1F7;font-size:13px;font-weight:600;color:#0B1633;cursor:pointer}
.pp-ready-tick input{width:17px;height:17px;margin-top:1px}
/* a blocked Send must LOOK blocked, not just refuse the click */
.pp-bar .btn:disabled,.pp-mail .btn:disabled{opacity:.42;cursor:not-allowed;filter:saturate(.4)}

/* ---- Settings → Proposals: the price editor ---- */
.oe{--oe-line:#DCE5F4;--oe-blue:#1F6FEB;--oe-hot:#FB6926;--oe-mute:#56637F;--oe-navy:#061431}
.oe-top{display:flex;justify-content:flex-end;margin-bottom:6px}
.oe-acts{display:flex;gap:8px;flex-wrap:wrap}
.oe-sec{margin-top:16px}
.oe-sh{display:flex;align-items:center;gap:8px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--oe-blue);margin-bottom:8px}
.oe-sh:before{content:"";width:22px;height:2px;border-radius:2px;background:linear-gradient(90deg,#2E9BFF,#FB6926)}
.oe-card{background:#fff;border:1px solid var(--oe-line);border-top:3px solid #2E9BFF;border-radius:14px;padding:14px 16px;margin-bottom:10px}
.oe-card.addon{border-top-color:var(--oe-hot)}
.oe-card-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.oe-kind{display:inline-flex;background:#F1F4FA;border-radius:99px;padding:3px}
.oe-kind button{font:inherit;font-size:12px;font-weight:700;border:none;background:none;border-radius:99px;padding:5px 12px;color:var(--oe-mute);cursor:pointer}
.oe-kind button.on{background:#fff;color:var(--oe-navy);box-shadow:0 1px 3px rgba(6,20,49,.15)}
.oe-rm{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:12px;font-weight:600;color:#B4322E;background:none;border:1px solid #F1C9C6;border-radius:9px;padding:5px 10px;cursor:pointer}
.oe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px 12px}
.oe-f{display:flex;flex-direction:column;gap:4px;min-width:0}
.oe-f.wide{grid-column:1/-1}
.oe-f>span{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8B93A7}
.oe-f input,.oe-f textarea,.oe-li input,.oe-step input{font:inherit;font-size:14px;border:1px solid #DDE3EE;border-radius:9px;padding:8px 10px;background:#fff;color:#0B1633;min-width:0;width:100%;box-sizing:border-box}
.oe-f textarea{resize:vertical}
.oe-f.bad input,.oe-f.bad textarea,.oe-li.bad input,.oe-step.bad input{border-color:#E9A09B;background:#FFF7F6}
.oe-money{display:flex;align-items:center;gap:6px}
.oe-money i{font-style:normal;color:#8B93A7;font-size:13px}
.oe-err{display:block;color:#B4322E;font-size:12px;font-style:normal}
.oe-hint{display:block;color:#8B93A7;font-size:11.5px;font-style:normal}
.oe-check .oe-cb{white-space:nowrap;display:flex;align-items:center;gap:8px;font-size:14px;color:#0B1633;padding-top:8px;text-transform:none;letter-spacing:0;font-weight:600}
.oe-lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:12px}
.oe-ll{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8B93A7;margin-bottom:6px}
.oe-li,.oe-step{display:flex;gap:4px;align-items:center;margin-bottom:5px}
.oe-li button,.oe-step button{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;border:1px solid #E1E6F0;background:#fff;border-radius:8px;color:#6B7590;cursor:pointer}
.oe-li button:disabled,.oe-step button:disabled{opacity:.35;cursor:default}
.oe-step input:first-of-type{flex:0 0 160px}
.oe-n{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--oe-blue);width:22px;flex:none}
.oe-addl{font:inherit;font-size:12.5px;font-weight:600;color:var(--oe-blue);background:none;border:none;padding:4px 0;cursor:pointer}
.oe-add{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:700;color:var(--oe-blue);background:#F4F7FF;border:1px dashed #B7C8F3;border-radius:12px;padding:10px 14px;cursor:pointer;width:100%;justify-content:center}
.oe-line{margin-top:12px;font-size:13px;color:#0B1633;background:#F5F8FD;border:1px solid #E2E9F5;border-radius:10px;padding:9px 12px}
.oe-line b{color:var(--oe-blue)}
.oe-logo{display:flex;align-items:center;background:linear-gradient(180deg,#fff,#EEF4FF);border:1px solid var(--oe-line);border-radius:10px;padding:8px 12px}
.oe-logo img{height:30px;width:auto}
.oe-save{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;padding:12px 0;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 30%)}
.oe-save .oe-err{flex-basis:100%}
.oe-empty{border:1px dashed #C9D6EE;border-radius:14px;padding:20px;text-align:center}
.oe-empty b{display:block;font-family:"Space Grotesk",Inter,sans-serif;font-size:19px;color:#061431;margin:6px 0}
.oe-empty p{color:#56637F;font-size:13.5px;margin:0 auto 12px;max-width:440px}
.oe-empty .oe-acts{justify-content:center}
.oe-locked{display:flex;gap:8px;align-items:center;color:#56637F;font-size:13.5px}
@media (max-width:760px){ .pp-ready ul{grid-template-columns:1fr} .oe-step{flex-wrap:wrap} .oe-step input:first-of-type{flex:1 1 100%} }
`;
