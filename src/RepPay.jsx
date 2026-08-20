import React, { useState, useMemo } from 'react';
import {
  Wallet, Check, AlertTriangle, Loader2, ChevronDown, ChevronRight, Ban, Undo2,
} from 'lucide-react';
import {
  apptEarnings, payModels, approveFee, voidFee, feeStale, rateOf,
} from './lib/reppay';

/* ============================================================
   REP PAY — what each rep has earned, and marking it paid.
   ------------------------------------------------------------
   Two structures, either or both, per rep. This screen is the
   owner's half: approve what has been claimed, and record what
   has actually been sent.

   FOUR RULES IT ENFORCES

   1. APPROVAL IS A BATCH. "Dana · 12 held · $600 · Approve all"
      is one click a week. Per-meeting approval is what would
      make three reps unmanageable, so it is not the default
      action — it is the exception, available per row.

   2. APPROVING FREEZES THE RATE. Change a rep's rate afterwards
      and nothing already approved moves. Same reason commission
      snapshots its pct and base at conversion.

   3. A FEE THAT IS NO LONGER HELD IS FLAGGED, NEVER REVERSED.
      Silently clawing back approved pay is how a working
      relationship ends. Surface it; a human decides.

   4. A PAYOUT IS A NEW ROW, ALWAYS. Money that has left is
      corrected with another line, never edited — ENGINEERING §4
      pointed outward.
   ============================================================ */

const usd0 = n => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function RepBlock({ rep, leads, payouts, me, onApprove, onVoid, onPay, busy }) {
  const [open, setOpen] = useState(true);
  const rate = num(rep.appointment_rate);
  const e = useMemo(() => apptEarnings(leads, rep.id, rate), [leads, rep.id, rate]);
  const paid = (payouts || []).filter(p => String(p.rep_id) === String(rep.id))
    .reduce((a, p) => a + num(p.amount), 0);
  const owed = Math.max(0, e.approvedTotal - paid);

  const payAll = () => {
    if (owed <= 0) return;
    const period = new Date().toISOString().slice(0, 7);
    if (!window.confirm(`Record ${usd0(owed)} paid to ${rep.name}? This does not send money — it records that you did.`)) return;
    onPay({ id: 'po_' + uid(), rep_id: rep.id, amount: owed, paid_on: new Date().toISOString().slice(0, 10),
      period, note: `${e.approved.length} appointment${e.approved.length === 1 ? '' : 's'}`, created_by: me || '' });
  };

  return (<div className="rp-rep">
    <div className="rp-head" onClick={() => setOpen(v => !v)}>
      <b>{rep.name}</b>
      <span className="subcell">{usd0(rate)}/appointment</span>
      <span className="rp-nums">
        {e.pending.length > 0 && <em className="rp-pend">{usd0(e.pendingTotal)} to approve</em>}
        {owed > 0 && <em className="rp-owed">{usd0(owed)} owed</em>}
        {e.pending.length === 0 && owed === 0 && <em className="subcell">nothing outstanding</em>}
      </span>
      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
    </div>

    {open && <>
      {/* RULE 1: the batch is the primary action. */}
      {e.pending.length > 0 && <div className="rp-batch">
        <div>
          <b>{e.pending.length} held meeting{e.pending.length === 1 ? '' : 's'} awaiting approval</b>
          <div className="subcell">{usd0(e.pendingTotal)} — marked held by {rep.name}, not yet agreed by you</div>
        </div>
        <button className="btn btn-p btn-sm" disabled={busy}
          onClick={() => onApprove(e.pending, rate)}>
          {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Approve all {usd0(e.pendingTotal)}
        </button>
      </div>}

      {e.pending.map(r => (<div className="rp-row" key={r.m.id}>
        <div className="rp-m">
          <b>{r.lead.name || r.lead.company}</b>
          <span className="subcell">{r.m.title || r.m.mtype}{r.m.heldAt ? ` · marked held ${String(r.m.heldAt).slice(0, 10)}` : ''}{r.m.heldBy ? ` by ${r.m.heldBy}` : ''}</span>
        </div>
        <span className="rp-v">{usd0(r.amount)}</span>
        <button className="btn btn-g btn-sm" disabled={busy} onClick={() => onApprove([r], rate)}><Check size={13} /></button>
      </div>))}

      {/* RULE 3: flagged, not reversed. */}
      {e.stale.length > 0 && <div className="rp-stale">
        <AlertTriangle size={14} />
        <div>
          <b>{e.stale.length} approved fee{e.stale.length === 1 ? '' : 's'} no longer marked held.</b>
          {' '}Nothing has been reversed. Void them if they should not be paid, or leave them.
          {e.stale.map(r => (<div className="rp-row" key={'s' + r.m.id}>
            <div className="rp-m"><b>{r.lead.name || r.lead.company}</b>
              <span className="subcell">approved at {usd0(r.amount)} · now “{r.m.status || 'unmarked'}”</span></div>
            <button className="btn btn-d btn-sm" disabled={busy} onClick={() => onVoid(r)}><Ban size={13} />Void</button>
          </div>))}
        </div>
      </div>}

      <div className="rp-foot">
        <span className="subcell">
          approved {usd0(e.approvedTotal)} · paid out {usd0(paid)} · <b>{usd0(owed)} owed</b>
        </span>
        <button className="btn btn-p btn-sm" disabled={owed <= 0 || busy} onClick={payAll}>
          <Wallet size={14} /> Mark {usd0(owed)} paid
        </button>
      </div>

      {(payouts || []).filter(p => String(p.rep_id) === String(rep.id)).slice(0, 6).map(p => (
        <div className="rp-row paid" key={p.id}>
          <div className="rp-m"><b>{usd0(p.amount)}</b>
            <span className="subcell">paid {p.paid_on}{p.note ? ` · ${p.note}` : ''}</span></div>
        </div>))}
    </>}
  </div>);
}

export default function RepPay({ reps, leads, payouts, me, updateLead, addPayout }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onAppt = (reps || []).filter(r => payModels(r).appointment);

  /* RULE 2 + ENGINEERING §3. Approving stamps the frozen rate onto each meeting,
     and every meeting on one lead is written in ONE updateLead — approving a
     batch that touches the same lead twice would otherwise have the second
     write start from a stale draft and lose the first. */
  const approve = async (rows, rate) => {
    setBusy(true); setErr('');
    try {
      const byLead = new Map();
      rows.forEach(r => {
        if (!byLead.has(r.lead.id)) byLead.set(r.lead.id, { lead: r.lead, ids: new Set() });
        byLead.get(r.lead.id).ids.add(r.m.id);
      });
      for (const { lead, ids } of byLead.values()) {
        const now = new Date().toISOString();
        await updateLead(lead.id, {
          meetings: (lead.meetings || []).map(m => ids.has(m.id) ? approveFee(m, rateOf(m, rate), me, now) : m),
        });
      }
    } catch (e) { setErr((e && e.message) || 'Could not approve those.'); }
    setBusy(false);
  };

  const voidOne = async (r) => {
    if (!window.confirm(`Void ${usd0(r.amount)} for ${r.lead.name || r.lead.company}? It leaves their approved total.`)) return;
    setBusy(true); setErr('');
    try {
      await updateLead(r.lead.id, {
        meetings: (r.lead.meetings || []).map(m => m.id === r.m.id ? voidFee(m, me, new Date().toISOString()) : m),
      });
    } catch (e) { setErr((e && e.message) || 'Could not void that.'); }
    setBusy(false);
  };

  const pay = async (row) => {
    setBusy(true); setErr('');
    try { await addPayout(row); }
    catch (e) { setErr((e && e.message) || 'Could not record that payout. Has REP-PAY-MIGRATION.sql been run?'); }
    setBusy(false);
  };

  if (!onAppt.length) {
    return (<div className="card" style={{ marginBottom: 18 }}>
      <div className="sec-title"><Wallet size={15} />Rep pay</div>
      <div className="ch-sub" style={{ marginTop: -8 }}>
        Nobody is on the per-appointment model yet. Set a rate on a rep in <b>Team</b> above and
        their held meetings start accruing here.
      </div>
    </div>);
  }

  return (<div className="card" style={{ marginBottom: 18 }}>
    <div className="sec-title"><Wallet size={15} />Rep pay</div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 12 }}>
      A rep marks a meeting <b>held</b> and it appears here as a claim. You approve — in a batch —
      and approving <b>freezes the rate</b>, so changing what they earn later never restates what
      you already agreed. Marking it paid records money you have sent; it does not send it.
    </div>
    {err && <div className="mtg-warn" style={{ marginBottom: 10 }}><AlertTriangle size={15} /><div>{err}</div></div>}
    {onAppt.map(r => (
      <RepBlock key={r.id} rep={r} leads={leads} payouts={payouts} me={me} busy={busy}
        onApprove={approve} onVoid={voidOne} onPay={pay} />
    ))}
  </div>);
}
