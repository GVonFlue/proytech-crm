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
import { Plus, Sparkles, Download, Link2, Send, X, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Trash2, Check } from 'lucide-react';
import ProposalDoc, { PROPOSAL_CSS } from './ProposalDoc';
import { readOffer, quote, cleanCopy, buildBody, newToken, isExpired } from './lib/proposal';
import { personLabel, todayISO } from './lib/lead';
import { db } from './lib/supabase';

const usd = v => '$' + (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
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

  const q = useMemo(() => (frozen ? { ok: true, ...sq } : quote(offer, sel)), [offer, sel, frozen]);
  const body = useMemo(() => {
    if (frozen) return startBody;
    if (!q.ok || !copy || !lead) return null;
    return buildBody({ offer, q, copy, client: clientOf(lead), preparedOn: todayISO(), validDays });
  }, [frozen, q, copy, lead, offer, validDays]);

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
        items: chosen.map(c => ({ name: c.name, kind: c.kind, summary: c.summary, includes: c.includes })),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { say('err', j.error || 'The draft did not come back. Try again.'); return; }
      const { copy: c, warnings: w } = cleanCopy(j.draft);
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
      const r = await apiPost('/api/proposal-send', { id: pid, mode, ...(extra || {}) });
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
          <div className="pp-bar pd-noprint">
            {!frozen && <button className={'btn btn-sm ' + (edit ? 'btn-p' : 'btn-g')} onClick={() => setEdit(e => !e)}>{edit ? 'Done editing' : 'Edit text'}</button>}
            <button className="btn btn-g btn-sm" onClick={printPdf}><Download size={14} />Download PDF</button>
            {st !== 'accepted' && <button className="btn btn-g btn-sm" onClick={copyLink} disabled={!!busy}><Link2 size={14} />{busy === 'link' ? 'Publishing…' : 'Copy client link'}</button>}
            {st !== 'accepted' && <button className="btn btn-p btn-sm" disabled={!!busy} onClick={() => {
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
            <button className="btn btn-p" onClick={sendEmail} disabled={!!busy || mail.message.trim().length < 20}><Send size={14} />{busy === 'email' ? 'Sending…' : 'Send it'}</button>
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

/* SETTINGS → PROPOSALS. The offer is JSON on purpose: it is a structured
   document (packages, add-ons, standard sections), the owner sets it up once,
   and PROPOSAL-OFFER.json in the repo is a complete example to paste. It is
   validated through readOffer, the same reader the builder uses, so the editor
   cannot accept an offer the builder would then misread. */
export function OfferEditor({ settings, saveSettings }) {
  const [text, setText] = useState(() => settings && settings.offer ? JSON.stringify(settings.offer, null, 2) : '');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const { offer, missing } = useMemo(() => readOffer(settings), [settings]);
  const save = async () => {
    setErr(''); setSaved(false);
    let parsed; try { parsed = JSON.parse(text); } catch (e) { setErr('That is not valid JSON: ' + e.message); return; }
    const chk = readOffer({ offer: parsed });
    if (!chk.offer || chk.missing.length) { setErr('Missing: ' + (chk.missing.join(', ') || 'offer') + '.'); return; }
    try { await saveSettings({ ...settings, offer: parsed }); setSaved(true); } catch { setErr('Could not save. Try again.'); }
  };
  return (<div>
    <style>{PROPOSALS_CSS}</style>
    {offer ? <div className="pp-offer-sum">{offer.packages.concat(offer.addons).map(p => (<div key={p.id}>
      <b>{p.name}</b>{p.kind === 'addon' ? ' (add-on)' : ''} · {usd(p.setup)} + {usd(p.monthly)}/mo{p.seatsIncluded ? ` · ${p.seatsIncluded} seats, then ${usd(p.extraSeat)}/mo` : ''} · counts as <i>{p.service || 'no service'}</i>{p.onboardingUrl ? ' · onboarding linked' : ' · no onboarding form yet'}</div>))}
      <div>{offer.depositPct}% deposit · good for {offer.validDays} days{offer.prepay ? ` · prepay ${offer.prepay.months} months, ${offer.prepay.free} free` : ''}</div></div>
      : <div className="pp-warn"><AlertTriangle size={15} /><span>No offer yet. Paste the contents of <code>PROPOSAL-OFFER.json</code> below and save.</span></div>}
    {offer && missing.length > 0 && <div className="pp-warn"><AlertTriangle size={15} /><span>Missing: {missing.join(', ')}.</span></div>}
    <textarea className="pp-json" rows={14} value={text} onChange={e => { setText(e.target.value); setSaved(false); }} spellCheck={false} placeholder='{"company":{...},"packages":[...]}' />
    {err && <div className="pp-total err">{err}</div>}
    <div className="pp-acts"><button className="btn btn-p btn-sm" onClick={save}>Save offer</button>{saved && <span className="pp-hint">Saved. New proposals use it now.</span>}</div>
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
`;
