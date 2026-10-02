/* LABEL YOUR DEALS.

   Sold-by-service groups money by the service on each deal, and every deal
   made before the service catalog has none, so the chart was one big
   "Unassigned" bar. This screen lists every deal on every record, open and
   closed, and puts a service picker on each one. A pick saves immediately.

   It only ever writes a service NAME. assignDealService (lib/lead) puts that
   name into whichever shape the deal already lives in and touches nothing
   else, so no amount, date or total anywhere in the CRM can move. */
import React, { useMemo, useState } from 'react';
import { X, Tags, ExternalLink } from 'lucide-react';
import { dealRows, assignDealService, servicesOf, personLabel, usd, usdc, fmtDate, anyPayments, paymentService, isRetainerPayment, tagPayment } from './lib/lead';

export default function ServiceAssign({ leads, settings, stages, updateLead, onClose, openLead }) {
  const [show, setShow] = useState('todo');
  const names = servicesOf(settings).map(s => s.name);

  const groups = useMemo(() => (leads || [])
    .map(l => ({ l, rows: dealRows(l).filter(r => r.amount > 0) }))
    .filter(g => g.rows.length)
    .sort((a, b) => (b.l.isClient ? 1 : 0) - (a.l.isClient ? 1 : 0) || personLabel(a.l).localeCompare(personLabel(b.l))),
  [leads]);

  const all = groups.flatMap(g => g.rows);
  const todo = all.filter(r => !r.service);
  const todoValue = todo.reduce((a, r) => a + r.amount, 0);
  const shown = groups
    .map(g => ({ ...g, rows: show === 'todo' ? g.rows.filter(r => !r.service) : g.rows }))
    .filter(g => g.rows.length);

  /* PAYMENTS TO PLACE: cash that cannot be put under a service for certain.
     A retainer payment is placed by the client's retainer service, so the
     picker sets that once for the client. A work payment is placed by the
     deal it paid for, so the picker tags it to a deal (tagPayment writes
     payment.dealId only). Neither ever touches an amount. */
  const unplaced = (leads || []).flatMap(l => anyPayments(l)
    .filter(p => p && Number(p.amount) && !paymentService(l, p, stages))
    .map(p => ({ l, p, retainer: isRetainerPayment(p) })));
  const unplacedValue = unplaced.reduce((a, x) => a + Number(x.p.amount || 0), 0);
  const placeWork = (l, p, dealId) => { const patch = tagPayment(l, p.id, dealId); if (patch) updateLead(l.id, patch); };
  const placeRetainer = (l, service) => updateLead(l.id, { retainerService: service });

  const pick = (l, row, service) => {
    const patch = assignDealService(l, row, service);
    if (patch) updateLead(l.id, patch);
  };

  return (<div className="sa-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sa-card" role="dialog" aria-label="Label your deals">
      <div className="sa-head">
        <div>
          <div className="sa-title"><Tags size={16}/>Label your deals</div>
          <div className="sa-sub">
            {todo.length
              ? <>{todo.length} of {all.length} deals have no service yet, worth <b>{usd(todoValue)}</b>.</>
              : <>All {all.length} deals have a service.</>}
            {' '}{unplaced.length
              ? <><b>{usdc(unplacedValue)}</b> of collected cash is not placed under a service yet.</>
              : <>All collected cash is placed.</>}
          </div>
        </div>
        <button className="sa-x" onClick={onClose} title="Close"><X size={16}/>Close</button>
      </div>
      <div className="sa-tabs">
        <button className={show === 'todo' ? 'on' : ''} onClick={() => setShow('todo')}>Needs a service ({todo.length})</button>
        <button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>All deals ({all.length})</button>
        <button className={show === 'pay' ? 'on' : ''} onClick={() => setShow('pay')}>Payments to place ({unplaced.length})</button>
      </div>
      {show === 'pay' ? <div className="sa-body">
        {!unplaced.length && <div className="sa-empty">Every payment is placed under a service.</div>}
        {unplaced.map(({ l, p, retainer }) => {
          const rows = dealRows(l).filter(r => r.amount > 0);
          return (<div className="sa-row todo sa-pay" key={l.id + p.id}>
            <div className="sa-deal">
              <b>{usdc(p.amount)} · {personLabel(l)}</b>
              <span>{p.date ? fmtDate(p.date) : 'no date'}{p.purpose ? ' · ' + p.purpose : ''}{p.note ? ' · ' + p.note : ''}</span>
            </div>
            {retainer
              ? <select value="" onChange={e => placeRetainer(l, e.target.value)} aria-label="Retainer is for">
                  <option value="">Retainer is for…</option>
                  {names.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              : rows.length
                ? <select value="" onChange={e => placeWork(l, p, e.target.value)} aria-label="Which deal was this for">
                    <option value="">Which deal?</option>
                    {rows.map(r => <option key={r.kind + r.id} value={r.id}>{r.label}{r.service ? ` (${r.service})` : ' (no service yet)'} · {usd(r.amount)}</option>)}
                  </select>
                : <span className="sa-none">No deal on this client yet. {openLead && <button onClick={() => openLead(l.id)}>Add one</button>}</span>}
          </div>);
        })}
        {unplaced.some(x => !x.retainer) && <div className="sa-note">Tagged to a deal with no service yet? Label that deal under Needs a service and the payment follows it.</div>}
      </div> : <div className="sa-body">
        {!shown.length && <div className="sa-empty">{show === 'todo' ? 'Nothing left to label.' : 'No deals with an amount yet.'}</div>}
        {shown.map(({ l, rows }) => (<div className="sa-group" key={l.id}>
          <div className="sa-who">
            <span>{personLabel(l)}{l.isClient && <em>client</em>}</span>
            {openLead && <button onClick={() => openLead(l.id)} title="Open the record"><ExternalLink size={13}/></button>}
          </div>
          {rows.map(r => (<div className={'sa-row' + (r.service ? '' : ' todo')} key={r.kind + r.id}>
            <div className="sa-deal">
              <b>{r.label}</b>
              <span>{r.kind === 'closed' ? `closed ${r.when ? fmtDate(r.when) : ''}` : 'open'} · {usd(r.amount)}</span>
            </div>
            <select value={r.service} onChange={e => pick(l, r, e.target.value)} aria-label={`Service for ${r.label}`}>
              <option value="">Service?</option>
              {r.service && !names.includes(r.service) && <option value={r.service}>{r.service}</option>}
              {names.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>))}
        </div>))}
      </div>}
      <div className="sa-foot">This only records which service a deal or payment was for. No amount, date or total changes.</div>
    </div>
  </div>);
}
