import React, { useState, useMemo } from 'react';
import {
  Wallet, Check, AlertTriangle, Loader2, ChevronDown, ChevronRight, Info,
} from 'lucide-react';
import {
  proposeAll, applyProposals, needsReview, setupPaid, retainerPaid, allPaid,
} from './lib/retainer';

/* ============================================================
   PAYMENT REVIEW — which money paid for the work, and which
   paid for the month.
   ------------------------------------------------------------
   AUDIT #23. Every payment currently sits in one array, so a
   retainer payment settles a build. Justus's $249 paid his
   $1,011.75 automations deal down to $762.75 — the CRM saying
   he owed $249 less than he does.

   THREE RULES THIS SCREEN ENFORCES

   1. NOTHING IS RECLASSIFIED SILENTLY. Every row is proposed
      with the reason it was proposed, and a human presses the
      button. This is the fourth time that shape has been the
      right one here — Meeting Log actions, Playbook drafts,
      Pocket outputs, and now this.

   2. AN UNDECIDED ROW IS NOT GUESSED. The tempting default is
      "assume setup", and assuming setup IS the bug: it applies
      retainer money to a balance. Those rows say so and block
      the lead until answered.

   3. ONE WRITE PER LEAD. applyProposals returns both arrays in
      one object and it goes through updateLead once — two calls
      would have the second overwrite the first from a stale
      snapshot (ENGINEERING §3, the closeDeal race).

   Money never changes here. Only which QUESTION it answers:
   revenue reads both arrays and is identical before and after.
   ============================================================ */

const usd0 = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KINDS = [
  { k: 'setup',    label: 'The work' },
  { k: 'retainer', label: 'The retainer' },
  { k: 'split',    label: 'Both' },
];

function LeadRows({ lead, onSave, saving }) {
  const proposed = useMemo(() => proposeAll(lead), [lead]);
  const [choice, setChoice] = useState(() => {
    const m = {};
    proposed.forEach(p => { m[p.id] = { kind: p.kind, split: p.split || null }; });
    return m;
  });

  const pays = Array.isArray(lead.payments) ? lead.payments : [];
  const undecided = pays.filter(p => !(choice[p.id] || {}).kind).length;
  const rate = Number(lead.retainer) || 0;

  const set = (id, kind) => setChoice(c => {
    const p = pays.find(x => x.id === id) || {};
    const amt = Number(p.amount) || 0;
    return { ...c, [id]: {
      kind,
      /* A split defaults to one month of retainer and the rest against the
         work — the shape it almost always is. Editable below. */
      split: kind === 'split'
        ? ((c[id] && c[id].split) || { setup: Math.round((amt - rate) * 100) / 100, retainer: rate })
        : null,
    } };
  });

  const setSplit = (id, part, v) => setChoice(c => {
    const p = pays.find(x => x.id === id) || {};
    const amt = Number(p.amount) || 0;
    const n = Math.max(0, Math.min(amt, Number(String(v).replace(/[^0-9.]/g, '')) || 0));
    const other = Math.round((amt - n) * 100) / 100;
    return { ...c, [id]: { kind: 'split',
      split: part === 'retainer' ? { setup: other, retainer: n } : { setup: n, retainer: other } } };
  });

  return (<div className="pr-lead">
    <div className="pr-head">
      <b>{lead.name || lead.company || 'Unnamed'}</b>
      <span className="subcell">
        {usd0(allPaid(lead))} received{rate > 0 ? ` · ${usd0(rate)}/mo rate` : ''}
      </span>
    </div>

    {proposed.map(pr => {
      const p = pays.find(x => x.id === pr.id) || {};
      const c = choice[pr.id] || {};
      return (<div className={'pr-row' + (c.kind ? '' : ' undecided')} key={pr.id}>
        <div className="pr-m">
          <b>{usd0(p.amount)}</b>
          <span className="subcell">{p.date}{p.note ? ` · ${p.note}` : ''}</span>
          {/* The reason, always. A proposal you cannot check is a guess with
              better manners. */}
          <span className="pr-why"><Info size={11} /> {pr.why}</span>
        </div>
        <div className="pr-pick">
          {KINDS.map(k => (
            <button key={k.k} type="button" className={c.kind === k.k ? 'on' : ''}
              disabled={k.k !== 'setup' && rate <= 0}
              title={k.k !== 'setup' && rate <= 0 ? 'This lead has no retainer rate set' : ''}
              onClick={() => set(pr.id, k.k)}>{k.label}</button>
          ))}
        </div>
        {c.kind === 'split' && (<div className="pr-split">
          <label>work <input value={(c.split || {}).setup ?? ''} onChange={e => setSplit(pr.id, 'setup', e.target.value)} /></label>
          <label>retainer <input value={(c.split || {}).retainer ?? ''} onChange={e => setSplit(pr.id, 'retainer', e.target.value)} /></label>
          <span className="subcell">
            {usd0(((c.split || {}).setup || 0) + ((c.split || {}).retainer || 0))} of {usd0(p.amount)}
          </span>
        </div>)}
      </div>);
    })}

    <div className="pr-foot">
      {undecided > 0
        ? <span className="pr-block"><AlertTriangle size={13} /> {undecided} still to answer — nothing is assumed</span>
        : <span className="subcell">
            after: {usd0(preview(lead, choice).setup)} toward the work · {usd0(preview(lead, choice).retainer)} retainer
          </span>}
      <button className="btn btn-p btn-sm" disabled={!!undecided || saving}
        onClick={() => onSave(lead, Object.entries(choice).map(([id, v]) => ({ id, kind: v.kind, split: v.split })))}>
        {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Save {lead.name || 'lead'}
      </button>
    </div>
  </div>);
}

/** What the two totals become, without writing anything. */
function preview(lead, choice) {
  const decisions = Object.entries(choice).map(([id, v]) => ({ id, kind: v.kind, split: v.split }));
  const next = { ...lead, ...applyProposals(lead, decisions) };
  return { setup: setupPaid(next), retainer: retainerPaid(next) };
}

export default function PaymentReview({ leads, updateLead }) {
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState('');
  const [done, setDone] = useState([]);
  const [err, setErr] = useState('');

  const pending = useMemo(
    () => (leads || []).filter(l => needsReview(l) && !done.includes(l.id)),
    [leads, done]);

  const save = async (lead, decisions) => {
    setSaving(lead.id); setErr('');
    try {
      /* ONE write. applyProposals hands back payments, retainerPayments and the
         reviewed flag together precisely so this cannot be three calls. */
      await updateLead(lead.id, applyProposals(lead, decisions));
      setDone(d => [...d, lead.id]);
    } catch (e) { setErr((e && e.message) || 'Could not save that.'); }
    setSaving('');
  };

  if (!pending.length) {
    return (<div className="card" style={{ marginBottom: 18 }}>
      <div className="sec-title"><Wallet size={15} />Payments</div>
      <div className="ch-sub" style={{ marginTop: -8 }}>
        {done.length
          ? `${done.length} client${done.length === 1 ? '' : 's'} sorted. Every payment now says whether it paid for the work or for the month.`
          : 'Every payment is already classified. Nothing to sort.'}
      </div>
    </div>);
  }

  return (<div className="card" style={{ marginBottom: 18 }}>
    <div className="sec-title" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer' }}>
      <Wallet size={15} />Payments · {pending.length} client{pending.length === 1 ? '' : 's'} to sort
      {open ? <ChevronDown size={15} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={15} style={{ marginLeft: 'auto' }} />}
    </div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 12 }}>
      A payment can pay for <b>the work</b>, for <b>the month</b>, or for both — a first month
      billed on top of a deposit is one payment doing two jobs. Until each one says which,
      retainer money pays down build balances and clients look more settled than they are.
      <b> The money does not move.</b> Only which question it answers, so revenue is identical
      before and after.
    </div>
    {err && <div className="mtg-warn" style={{ marginBottom: 10 }}><AlertTriangle size={15} /><div>{err}</div></div>}
    {open && pending.map(l => (
      <LeadRows key={l.id} lead={l} saving={saving === l.id} onSave={save} />
    ))}
  </div>);
}
