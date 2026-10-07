/* TOP SOURCES, ON SCREEN: the Relationships page's "Sources" view (owner
   only) and the dashboard's Lead source ROI card, which is the top of the
   same leaderboard.

   Everything here READS lib/sources sourceRollup. Nothing sums money on its
   own, so the leaderboard, the dashboard card, a relationship record's
   "Sent to you" and the Money page cannot disagree: the revenue underneath
   all of them is lib/lead revenueForMonth. */
import React, { useState } from 'react';
import { Trophy, ChevronDown } from 'lucide-react';
import { sourceRollup, PERIODS } from './lib/sources';

const usd0 = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const pct = r => (r === null || r === undefined ? '—' : Math.round(r * 100) + '%');

/** The full leaderboard, ranked by who gets credit, with the channels they
 *  arrived through as a breakdown under each row. */
export function SourcesView({ leads, stages, open, today }) {
  const [period, setPeriod] = useState('all');
  const [openKey, setOpenKey] = useState(null);
  const ro = sourceRollup(leads, stages, { period, today });
  return (<div className="card src-board">
    <div className="src-board-h">
      <div className="sec-title" style={{ margin: 0 }}><Trophy size={15} />Top sources</div>
      <div className="seg src-periods" role="tablist">{PERIODS.map(([k, l]) =>
        <button key={k} role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
    </div>
    <div className="ch-sub" style={{ margin: '6px 0 12px' }}>Ranked by who gets the credit: the person who referred them, or how they arrived when nobody did. Setup won is cash collected in the period, the Money page's way; MRR is what their clients pay now. Open a row to see how those leads arrived.</div>
    {!ro.rows.length ? <div className="src-empty">Nothing referred{period === 'all' ? ' yet' : ' in this period'}.</div>
      : <div className="tbl-wrap"><table className="tbl src-tbl">
        <thead><tr><th>#</th><th>Referred by</th><th>Leads</th><th>Clients won</th><th>Conversion</th><th>Setup won</th><th>MRR now</th></tr></thead>
        <tbody>{ro.rows.map((x, i) => <React.Fragment key={x.key}>
          <tr className={'src-r ' + x.kind} onClick={() => setOpenKey(k => (k === x.key ? null : x.key))}>
            <td className="src-rank">{i + 1}</td>
            <td><div className="src-who">
              <ChevronDown size={13} className={'src-ch' + (openKey === x.key ? ' on' : '')} />
              {x.kind === 'person' && !x.gone && open
                ? <button type="button" className="src-person" onClick={e => { e.stopPropagation(); open(x.id); }}>{x.label}</button>
                : <span className={'src-label ' + x.kind}>{x.label}</span>}
              {x.kind !== 'person' && <span className="src-kind">{x.kind === 'source' ? 'channel' : x.kind === 'unlinked' ? 'link a person' : x.kind === 'unrecorded' ? 'no person' : ''}</span>}
            </div></td>
            <td>{x.leads}</td><td>{x.won}</td><td>{pct(x.rate)}</td>
            <td className="src-money">{usd0(x.setup)}</td><td className="src-money">{x.mrr ? usd0(x.mrr) : '—'}</td>
          </tr>
          {openKey === x.key && <tr className="src-sub"><td /><td colSpan={6}>
            <div className="src-chs">{x.channels.length ? x.channels.map(c => <span key={c.key} className="src-chip">
              <b>{c.label}</b> {c.leads} lead{c.leads === 1 ? '' : 's'} · {c.won} won · {usd0(c.setup)}</span>)
              : <span className="subcell">No arrivals in this period.</span>}</div>
          </td></tr>}
        </React.Fragment>)}</tbody>
        <tfoot><tr><td /><td>All sources</td><td>{ro.totals.leads}</td><td>{ro.totals.won}</td><td /><td className="src-money">{usd0(ro.totals.setup)}</td><td className="src-money">{ro.totals.mrr ? usd0(ro.totals.mrr) : '—'}</td></tr></tfoot>
      </table></div>}
  </div>);
}

/** The dashboard's Lead source ROI card: the top five of the same board. */
export function SourcesTop({ leads, stages, goAll, today }) {
  const ro = sourceRollup(leads, stages, { period: 'all', today });
  if (!ro.rows.length) return null;
  return (<div className="card src-top" style={{ marginBottom: 18 }}>
    <h3>Lead source ROI</h3>
    <div className="ch-sub">Who and what actually closes, all time: the top of the Sources leaderboard</div>
    <div className="src-list">
      <div className="src-row src-head"><span>Referred by</span><span>Leads</span><span>Won</span><span>Rate</span><span>Setup won</span></div>
      {ro.rows.slice(0, 5).map(x => <div className="src-row" key={x.key}>
        <span className="src-name">{x.label}</span><span>{x.leads}</span><span>{x.won}</span><span>{pct(x.rate)}</span><span>{x.setup ? usd0(x.setup) : '—'}</span>
      </div>)}
    </div>
    {goAll && <button type="button" className="linkbtn" onClick={goAll}>See every source{ro.rows.length > 5 ? ` (${ro.rows.length})` : ''} in Relationships → Sources</button>}
  </div>);
}

export const SOURCES_CSS = `
/* THE REFERRALS LEDGER ON THE LIGHT RECORD (.leadfs). Every rl-* rule was
   scoped to .modal.lead, the retired dark skin, so on today's full-screen
   record the ledger rendered as raw browser buttons; nobody saw it because
   the section had no Jump-to entry either (added with this). Light rules,
   same shapes; tests/relsources.mjs requires each outside the dark scope. */
.heard{margin-top:10px;padding:10px 12px;border-radius:10px;background:#F8F9FD;border:1px solid #E3E6F2;font-size:12.5px;color:#3A4160;display:flex;flex-direction:column;gap:6px}
.heard b{color:#14122B}
.heard-on{color:#5F6680}
.heard-sug{display:flex;flex-direction:column;gap:6px}
.heard-q{font-weight:700;color:#3A4160}
.heard-p{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid #E3E6F2;border-radius:8px;padding:6px 9px}
.heard-p i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#56607A;margin-left:4px}
.heard-link{font:inherit;font-size:12px;font-weight:700;border:1px solid #CBD3F5;background:#F3F5FE;color:#2B4DE0;border-radius:8px;padding:4px 9px;cursor:pointer}
.heard-none{color:#5F6680}
.leadfs .rl-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;background:#F4F6FE;border:1px solid #DDE3F6}
.leadfs .rl-stat{display:flex;flex-direction:column;gap:1px;min-width:0}
.leadfs .rl-stat b{font-size:19px;font-weight:800;color:#14122B;font-family:'Space Grotesk',sans-serif;line-height:1.1}
.leadfs .rl-stat span{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#56607A}
.leadfs .rl-sep{width:1px;align-self:stretch;background:#DDE3F6}
.leadfs .rl-list{display:flex;flex-direction:column;gap:6px}
.leadfs .rl-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;background:#fff;border:1px solid #E3E6F2}
.leadfs .rl-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.leadfs .rl-link{background:none;border:0;padding:0;text-align:left;cursor:pointer;font:inherit;font-size:13.5px;font-weight:650;color:#2B4DE0}
.leadfs .rl-link:hover{text-decoration:underline}
.leadfs .rl-name{font-size:13.5px;font-weight:650;color:#14122B}
.leadfs .rl-name em{font-style:normal;font-weight:600;color:#56607A}
.leadfs .rl-note{font-size:11.5px;color:#56607A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.leadfs .rl-when{flex:none;font-size:11.5px;font-weight:600;color:#56607A}
.leadfs .rl-empty{font-size:12.5px;color:#56607A;padding:8px 0 4px}
.leadfs .rl-add{display:flex;align-items:center;gap:7px;width:100%;justify-content:center;margin-top:8px;padding:9px;border-radius:10px;border:1px dashed #C7D0EE;background:transparent;color:#2B4DE0;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.leadfs .rl-add:hover{border-style:solid;background:#F4F6FE}
.leadfs .rl-form{display:flex;flex-direction:column;gap:7px;margin-top:8px;padding:11px;border-radius:11px;background:#F8F9FD;border:1px solid #E3E6F2}
.leadfs .rl-in{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid #D7DCEB;background:#fff;color:#14122B;font:inherit;font-size:13px}
.leadfs .rl-in:focus{outline:none;border-color:#2B4DE0}
.leadfs .rl-acts{display:flex;align-items:center;gap:8px}
.leadfs .rl-hint{flex:1;min-width:0;font-size:11px;color:#56607A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.leadfs .rl-hint b{color:#3A4160}
.src-board{margin-bottom:18px}
.src-board-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.src-empty{padding:14px 2px;color:#5F6680;font-size:13px}
.src-tbl td{vertical-align:middle}
.src-r{cursor:pointer}
.src-rank{font-weight:800;color:#56607A;width:28px}
.src-who{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.src-ch{color:#7A819A;transition:transform .15s}.src-ch.on{transform:rotate(180deg)}
.src-person{font:inherit;font-weight:700;color:#2B4DE0;background:none;border:0;padding:0;cursor:pointer;text-align:left}
.src-label{font-weight:700;color:#14122B}
.src-label.unknown,.src-label.unrecorded,.src-label.unlinked{color:#56607A}
.src-kind{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#56607A;background:#F0F1F7;border-radius:999px;padding:1px 7px}
.src-money{font-weight:700;white-space:nowrap}
.src-sub td{background:#F8F9FD}
.src-chs{display:flex;flex-wrap:wrap;gap:6px}
.src-chip{font-size:12px;color:#3A4160;background:#fff;border:1px solid #E3E6F2;border-radius:8px;padding:4px 8px}
.src-tbl tfoot td{font-weight:700;border-top:2px solid #E3E6F2}
`;
