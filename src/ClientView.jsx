import React, { useMemo, useState } from 'react';
import {
  X, DollarSign, Repeat, CalendarCheck, CheckCircle2, AlertTriangle,
  FileText, ExternalLink, Clock, Target, Plus, Handshake,
} from 'lucide-react';
import {
  personLabel, usd, num, fmtDate, todayISO, daysUntil, contractedTotal, owedBy,
  anyPayments, meetingsOf, activeTracks, trackProgress, clientOverall,
  projectsOf, projectProgress, lastTouch, daysSinceTouch, dealsOf, dealBits,
  stdPhases,
} from './lib/lead';
import CircuitBand from './CircuitBand';
import { retainerState, monthsDue, monthsPaid, allPaid } from './lib/retainer';

/* ============================================================================
   THE CLIENT DASHBOARD — one screen for a client who is already ours.

   WHY THIS IS NOT THE LEAD VIEW

   A lead screen answers "will they buy?" — stage, disposition, follow-up,
   the next call. A client has already bought. The questions that matter after
   that are different ones, and they were spread across an inline panel under
   the pipeline, the deal section of the lead modal, and the Money page:

     what are they worth, and what have they actually paid
     is the retainer billing, since when, and are they behind
     what have we promised to deliver, and what is late
     what came of the last meeting

   That last one had nowhere to live at all. A meeting carried whether it
   HAPPENED — held, no-show, cancelled — and nothing about what came of it. So
   a client could have four held meetings and the CRM could not say whether any
   of them moved anything. Attendance is not an outcome.

   THE RULE THIS SCREEN FOLLOWS

   Every number here comes from the same function the dashboard and the Money
   page read — owedBy, allPaid, retainerState, trackProgress. Nothing is
   recomputed locally. Two screens showing one client must not be able to
   disagree about what that client owes.
   ========================================================================== */

/* What came of a meeting, as opposed to whether it happened. Deliberately
   short: a vocabulary long enough to need thought is one that gets left blank,
   and a blank outcome is the state this exists to remove. */
export const MEETING_OUTCOMES = [
  'Moved forward',
  'Proposal sent',
  'Needs follow-up',
  'Stalled — no decision',
  'Not a fit',
];

const monthKey = () => new Date().toISOString().slice(0, 7);

export default function ClientView({
  lead, settings, stages, tracks, invoices, team,
  onClose, openRecord, updateLead, setClientPhase, phaseInfo, onInvoice,
  toggleMilestone, setMilestoneDue, toggleProjectMilestone,
}) {
  const [tab, setTab] = useState('delivery');
  if (!lead) return null;
  const l = lead;
  const set = patch => updateLead && updateLead(l.id, patch);

  /* ---------------------------------------------------------------- money */
  const contracted = contractedTotal(l);
  const collected  = allPaid(l);
  const owed       = owedBy(l);
  const rState     = retainerState(l);
  const rate       = num(l.retainer);
  const due        = monthsDue(l, monthKey()).length;
  const paidMonths = monthsPaid(l).size;
  const behind     = Math.max(0, due - paidMonths);
  /* Lifetime is CASH, so it is allPaid and nothing else. It used to add
     closedDealsTotal on top — but a closed deal is BOOKED value, and the payment
     that settled it is already in allPaid. Chris Waipa paid $2,499 for a $2,499
     build and read $4,998. Booked value is the Contracted tile's job. */
  const lifetime   = collected;
  /* Deals ever sold, open or closed. dealsOf() is OPEN deals only — it returns
     [] once a deal closes — so a client who bought one site read "0 deals"
     under $2,499 contracted. */
  const dealCount  = dealsOf(l).length + ((l.closedDeals || []).length);
  const openInv    = (invoices || []).filter(i => i && i.clientId === l.id && i.status !== 'paid');

  /* ------------------------------------------------------------- delivery */
  const overall  = useMemo(() => clientOverall(l, tracks), [l, tracks]);
  const trackSet = useMemo(() => activeTracks(l, tracks), [l, tracks]);
  const projects = projectsOf(l);

  /* ------------------------------------------------------------- meetings */
  const meetings = useMemo(
    () => meetingsOf(l).slice().sort((a, b) => String(b.start || '').localeCompare(String(a.start || ''))),
    [l]
  );
  const setMeeting = (id, patch) => set({
    meetings: (l.meetings || []).map(m => (m.id === id ? { ...m, ...patch } : m)),
  });
  const held      = meetings.filter(m => m.status === 'held');
  const noOutcome = held.filter(m => !m.outcome).length;

  /* ------------------------------------------------------------- activity */
  const acts = (l.activities || []).slice().sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || ''))).slice(0, 10);
  const touched = daysSinceTouch(l);

  const phase = l.clientPhase || 'intake';
  const ph = phaseInfo ? phaseInfo(phase, settings, l) : { label: phase, color: '#6B73C9' };

  const Stat = ({ label, value, sub, tone }) => (
    <div className={'cv-stat' + (tone ? ' ' + tone : '')}>
      <div className="cv-stat-l">{label}</div>
      <div className="cv-stat-v">{value}</div>
      {sub ? <div className="cv-stat-s">{sub}</div> : null}
    </div>
  );

  return (
    <div className="scrim2 lead" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal lead client" onMouseDown={e => e.stopPropagation()}>

        {/* ------------------------------------------------------- header */}
        <div className="cv-head">
          <CircuitBand />
          <div className="cv-head-m">
            <div className="cv-name">{personLabel(l)}</div>
            <div className="cv-sub">
              <span className="cv-phase" style={{ background: ph.color }}>{ph.label}</span>
              {l.convertedAt ? <span>client since {fmtDate(String(l.convertedAt).slice(0, 10))}</span> : null}
              {l.owner ? <span>· {l.owner}</span> : null}
              <span>· {touched == null ? 'never contacted' : `last touch ${touched}d ago`}</span>
            </div>
          </div>
          <div className="cv-head-a">
            <select className="phase-sel" value={phase} onChange={e => setClientPhase && setClientPhase(l.id, e.target.value)}>
              {stdPhases(settings).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button className="btn btn-s btn-sm" onClick={() => openRecord && openRecord(l.id)}>
              <ExternalLink size={14} />Full record
            </button>
            <button className="m-x" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="cv-body">

          {/* ------------------------------------------------------ money */}
          <div className="cv-strip">
            <Stat label="Contracted" value={usd(contracted)} sub={`${dealCount} deal${dealCount === 1 ? '' : 's'}`} />
            <Stat label="Collected" value={usd(collected)} sub={`${anyPayments(l).length} payment${anyPayments(l).length === 1 ? '' : 's'}`} tone="good" />
            <Stat label="Still owed" value={usd(owed)} tone={owed > 0 ? 'warn' : ''}
              sub={owed > 0
                ? (openInv.length ? `invoice ${openInv[0].number || ''} out` : 'never invoiced')
                : 'settled'} />
            <Stat label="MRR" value={rState === 'active' ? usd(rate) + '/mo' : '—'} tone={rState === 'active' ? 'good' : ''}
              sub={rState === 'quoted' ? `${usd(rate)} quoted, not started`
                : rState === 'ended' ? `ended ${fmtDate(l.retainerEnd)}`
                : rState === 'active' ? `${due} billed · ${paidMonths} paid` : 'no retainer'} />
            <Stat label="Lifetime" value={usd(lifetime)} sub="collected, all time" />
          </div>

          {owed > 0 && onInvoice && (
            <div className="cv-act">
              <button className="btn btn-p btn-sm" onClick={() => onInvoice(l)}>
                <FileText size={14} />Invoice {usd(owed)}
              </button>
              {openInv.length > 0 && <span className="cv-act-n">{openInv.length} invoice{openInv.length === 1 ? '' : 's'} already out — check before billing again.</span>}
            </div>
          )}

          {/* --------------------------------------------- the retainer */}
          {(rate > 0 || rState !== 'none') && (
            <div className={'cv-card mrr-set ' + rState}>
              <div className="cv-card-h"><Repeat size={15} />Recurring</div>
              <div className="cv-mrr">
                <div className="field"><label>Monthly rate</label>
                  <input type="number" value={l.retainer ?? ''} onChange={e => set({ retainer: e.target.value })} /></div>
                <div className="field"><label>Billing starts</label>
                  <input type="date" value={l.retainerStart || ''} onChange={e => set({ retainerStart: e.target.value })} /></div>
                <div className="field"><label>Billing ended</label>
                  <input type="date" value={l.retainerEnd || ''} onChange={e => set({ retainerEnd: e.target.value })} /></div>
              </div>
              {rState === 'quoted' && <div className="mrr-note quoted">
                <b>Quoted, not billing.</b> A rate with no start date is deliberately kept out of MRR —
                put a date on it the day billing actually begins.
              </div>}
              {rState === 'active' && <div className="mrr-note live">
                <b>{usd(rate)}/mo counting toward MRR since {fmtDate(l.retainerStart)}.</b>{' '}
                {due} month{due === 1 ? '' : 's'} billed · {paidMonths} paid
                {behind > 0
                  ? <span className="mrr-behind"> · {behind} behind ({usd(behind * rate)})</span>
                  : ' · up to date'}
              </div>}
              {rState === 'ended' && <div className="mrr-note ended">
                <b>Ended {fmtDate(l.retainerEnd)}.</b> Out of MRR from that date; months billed before it stay owed.
              </div>}
            </div>
          )}

          {/* ------------------------------------------------------- tabs */}
          <div className="seg cv-tabs">
            <button className={'seg-b ' + (tab === 'delivery' ? 'on' : '')} onClick={() => setTab('delivery')}>
              Delivery{overall && overall.overdue > 0 ? ` · ${overall.overdue} late` : ''}
            </button>
            <button className={'seg-b ' + (tab === 'meetings' ? 'on' : '')} onClick={() => setTab('meetings')}>
              Meetings{noOutcome > 0 ? ` · ${noOutcome} unrecorded` : ''}
            </button>
            <button className={'seg-b ' + (tab === 'activity' ? 'on' : '')} onClick={() => setTab('activity')}>Activity</button>
          </div>

          {/* --------------------------------------------------- delivery */}
          {tab === 'delivery' && (
            <div className="cv-card">
              {!trackSet.length && !projects.length
                ? <div className="empty">No delivery track picked yet. Choose one on the full record and the milestones appear here.</div>
                : null}

              {projects.map(pj => {
                const pr = projectProgress(pj, tracks);
                return (
                  <div className="cv-proj" key={pj.id}>
                    <div className="cv-proj-h">
                      <b>{pj.label || 'Project'}</b>
                      <span className="cv-proj-p">{pr.done}/{pr.total} steps</span>
                    </div>
                    <div className="pbar"><div style={{ width: (pr.total ? Math.round((pr.done / pr.total) * 100) : 0) + '%' }} /></div>
                    <div className="cv-ms">
                      {(pr.milestones || []).map(m => {
                        const done = !!((pj.milestones || {})[m] && (pj.milestones || {})[m].done);
                        return (
                          <div className={'cv-m' + (done ? ' done' : '')} key={m}>
                            <button className="cv-m-i" onClick={() => toggleProjectMilestone && toggleProjectMilestone(l.id, pj.id, m)}>
                              {done ? <CheckCircle2 size={14} /> : <Target size={14} />}
                            </button>
                            <span className="cv-m-t">{m}</span>
                            <span className="cv-m-d" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {trackSet.map(tr => {
                const p = trackProgress(l, tr);
                return (
                  <div className="cv-track" key={tr.key}>
                    <div className="cv-track-h">
                      <b>{tr.label}</b>
                      <span>{p.completedCount}/{p.total}</span>
                      {p.overdue > 0 && <span className="cv-late"><AlertTriangle size={12} />{p.overdue} overdue</span>}
                      {p.nextDue && <span className="cv-next"><Clock size={12} />next {fmtDate(p.nextDue)}</span>}
                    </div>
                    <div className="pbar"><div style={{ width: Math.round((p.pct || 0) * 100) + '%' }} /></div>
                    <div className="cv-ms">
                      {p.ms.map(m => {
                        const e = p.entries[m] || {};
                        const late = !e.done && e.due && daysUntil(e.due) < 0;
                        return (
                          <div className={'cv-m' + (e.done ? ' done' : '') + (late ? ' late' : '')} key={m}>
                            <button className="cv-m-i" title={e.done ? 'Mark not done' : 'Mark done'}
                              onClick={() => toggleMilestone && toggleMilestone(l.id, tr.key, m)}>
                              {e.done ? <CheckCircle2 size={14} /> : <Target size={14} />}
                            </button>
                            <span className="cv-m-t">{m}</span>
                            {e.done
                              ? <span className="cv-m-d">{e.at ? fmtDate(String(e.at).slice(0, 10)) : 'done'}</span>
                              : <label className={'cv-m-due' + (late ? ' late' : '')}>
                                  <input type="date" value={e.due || ''}
                                    onChange={ev => setMilestoneDue && setMilestoneDue(l.id, tr.key, m, ev.target.value)} />
                                  <span>{e.due ? (late ? `${Math.abs(daysUntil(e.due))}d late` : fmtDate(e.due)) : 'set a date'}</span>
                                </label>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* --------------------------------------------------- meetings */}
          {tab === 'meetings' && (
            <div className="cv-card">
              {noOutcome > 0 && (
                <div className="cv-hint">
                  <b>{noOutcome} meeting{noOutcome === 1 ? '' : 's'} happened with no outcome recorded.</b>{' '}
                  Whether it happened and what came of it are different facts, and only one of them tells you what to do next.
                </div>
              )}
              {!meetings.length
                ? <div className="empty">No meetings on this client yet.</div>
                : meetings.map(m => (
                  <div className={'cv-mtg' + (m.status === 'held' ? ' held' : '') + (m.status === 'noshow' ? ' noshow' : '')} key={m.id}>
                    <div className="cv-mtg-h">
                      <b>{m.title || m.mtype || 'Meeting'}</b>
                      <span className="cv-mtg-d">
                        {m.start ? fmtDate(String(m.start).slice(0, 10)) : 'no date'}
                        {m.status ? ` · ${m.status === 'noshow' ? 'no-show' : m.status}` : ' · booked'}
                      </span>
                    </div>
                    {m.status === 'held' && (
                      <div className="cv-out">
                        <div className="cv-out-row">
                          {MEETING_OUTCOMES.map(o => (
                            <button key={o}
                              className={'cv-out-b' + (m.outcome === o ? ' on' : '')}
                              onClick={() => setMeeting(m.id, { outcome: m.outcome === o ? '' : o, outcomeAt: new Date().toISOString() })}>
                              {o}
                            </button>
                          ))}
                        </div>
                        <input className="cv-out-n" placeholder="What actually came of it…"
                          value={m.outcomeNote || ''}
                          onChange={e => setMeeting(m.id, { outcomeNote: e.target.value })} />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* --------------------------------------------------- activity */}
          {tab === 'activity' && (
            <div className="cv-card">
              {!acts.length ? <div className="empty">Nothing logged yet.</div>
                : acts.map(a => (
                  <div className="cv-a" key={a.id}>
                    <span className="cv-a-t">{a.type}</span>
                    <span className="cv-a-x">{a.text}</span>
                    <span className="cv-a-d">{a.ts ? fmtDate(String(a.ts).slice(0, 10)) : ''}</span>
                  </div>
                ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
