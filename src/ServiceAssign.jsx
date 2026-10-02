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
import { dealRows, assignDealService, servicesOf, personLabel, usd, fmtDate } from './lib/lead';

export default function ServiceAssign({ leads, settings, updateLead, onClose, openLead }) {
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
              ? <>{todo.length} of {all.length} deals have no service yet, worth <b>{usd(todoValue)}</b>. That is your Unassigned bar.</>
              : <>All {all.length} deals have a service. Sold by service is complete.</>}
          </div>
        </div>
        <button className="sa-x" onClick={onClose} title="Close"><X size={16}/>Close</button>
      </div>
      <div className="sa-tabs">
        <button className={show === 'todo' ? 'on' : ''} onClick={() => setShow('todo')}>Needs a service ({todo.length})</button>
        <button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>All deals ({all.length})</button>
      </div>
      <div className="sa-body">
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
      </div>
      <div className="sa-foot">Labelling only sets which service a deal was. No amount, date or total changes.</div>
    </div>
  </div>);
}
