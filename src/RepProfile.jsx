import React, { useState, useMemo } from 'react';
import {
  X, Lock, CheckCircle2, Clock, Phone, CalendarCheck, DollarSign,
  BookOpen, Loader2, Trash2, AlertTriangle, ShieldAlert, TrendingUp,
} from 'lucide-react';
import {
  CONTACT_DISP, DISPOSITIONS, fmtDate, fmtStamp,
  num, usd, cmsnOf, sOf,
} from './lib/lead';
import {
  repActivities, byDay, dayStats, dialsPerBooking, BLOCK_GAP_MIN,
  startedOn, daysSinceStart, weekNo, standing, DECISION_DAY,
  mixChecks, MIX_SAMPLE_MIN, bookingOutcomes, decidedOf,
} from './lib/repwork';
/* proportion() is the DASHBOARD's, reused rather than reimplemented: it
   carries the Wilson interval and the sample floor, so the profile and the
   dashboard cannot disagree about what a rate is or when it is too early to
   state one. */
import { proportion, DEFAULT_SAMPLE_MIN } from './lib/goals';
import { playbookGate } from './lib/kb';
import { useScrollLock } from './lib/scrolllock';

/* ============================================================================
   A REP, OPENED LIKE A LEAD.
   ----------------------------------------------------------------------------
   A rep is a record you open and work in, not a row you expand in a settings
   form. So this is the LEAD VIEW'S GRAMMAR, deliberately and literally: it
   renders inside `.scrim2.lead` / `.modal.lead`, which is where the dark plate,
   the section cards, the tiles and the type scale already live. Reusing those
   classes means this screen inherits the whole theme — and it means
   tests/leadcontrast.mjs, which walks every text node in that view looking for
   dark-on-dark, covers this screen too. A parallel set of classes would have
   looked the same on the day and drifted by the next one.

   SETTINGS KEEPS THE EDITABLE CONFIG. This screen is where you LOOK at
   somebody. The two are not the same job and the split is on purpose: a number
   you can accidentally retype while reading it is a number that gets retyped.

   ------------------------------------------------------------------ notes
   THE NOTES PANEL IS NOT PROTECTED BY THIS FILE.

   rep_notes is owner-only in Postgres — one policy, is_owner() on both sides,
   so a rep's login gets ZERO ROWS. `notes` arrives here already empty for a
   rep, from the database, not from a filter. The `owner` check below is a
   routing decision, not a security one, and if it were ever removed the screen
   would render an empty panel rather than leak anything.

   That distinction is the whole reason the notes are a separate table instead
   of a column on crm_users: users_read is `id = auth.uid() or is_owner()`, so
   a rep reads his OWN crm_users row whole. An assessment of a person stored
   there would be readable by that person.
   ========================================================================== */

/* Time only. fmtMeetingTime gives a full stamp — "Tue, Aug 25, 4:12 AM" — which
   is right beside a meeting and wrong inside a block range, where the date is
   already the row's own label and repeating it twice per block overflows the
   row. */
const hhmm = ts => {
  const d = new Date(ts);
  return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const KEYS = [
  ['agreement', 'Signed agreement'],
  ['w9', 'W-9'],
  ['payment', 'Payment method'],
];

/* Deals this rep sourced, and what they are worth. Commission is read from the
   SNAPSHOT on the lead (cmsnOf), never recomputed from the rep's current rate —
   editing a percentage must not silently rewrite what somebody already earned. */
function money(leads, rep, stages) {
  let pipe = 0, closedV = 0, closedN = 0, pend = 0, earned = 0;
  const open = [], won = [];
  for (const l of (leads || [])) {
    const c = cmsnOf(l);
    const mine = (c && c.repId === rep.id) || l.owner === rep.name || l.owner_id === rep.id;
    if (!mine) continue;
    const st = sOf(l.stage, stages);
    if (st.won) { closedV += num(l.dealValue); closedN++; won.push(l); }
    else if (!st.nurture) { pipe += num(l.dealValue); open.push(l); }
    if (c && c.repId === rep.id) {
      if (c.status === 'earned') earned += num(c.amount);
      else if (c.status !== 'voided') pend += num(c.amount);
    }
  }
  return { pipe, closedV, closedN, pend, earned, open, won };
}

const Stat = ({ label, value, sub, tone }) => (
  <div className={'rp-stat' + (tone ? ' ' + tone : '')}>
    <span>{label}</span><b>{value}</b>{sub ? <i>{sub}</i> : null}
  </div>
);

export default function RepProfile({
  rep, leads, stages, me, myUid, owner,
  kbPub, kbReads, lastSeen, notes, onAddNote, onDeleteNote, onResetPlaybook, onClose,
}) {
  /* The page behind a modal must not scroll — and this panel is taller than
     the viewport, so without it the notes below the fold are unreachable. */
  useScrollLock();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const acts = useMemo(() => repActivities(leads, rep), [leads, rep]);
  const days = useMemo(() => byDay(acts), [acts]);
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = dayStats((days.find(d => d.day === today) || {}).acts || [], CONTACT_DISP);
  /* Seven days, not "this week": a week that resets on Monday hides Friday's
     work every Monday morning, which is exactly when it is being looked at. */
  const week = days.slice(0, 7);
  const wk = week.reduce((a, d) => {
    const s = dayStats(d.acts, CONTACT_DISP);
    a.dials += s.dials; a.conversations += s.conversations; a.bookings += s.bookings;
    a.blocks += s.blocks.length;
    for (const [c, n] of Object.entries(s.byCode)) a.byCode[c] = (a.byCode[c] || 0) + n;
    return a;
  }, { dials: 0, conversations: 0, bookings: 0, blocks: 0, byCode: {} });

  const $ = useMemo(() => money(leads, rep, stages), [leads, rep, stages]);

  /* ---- where he stands, not just what he did ---- */
  const start = startedOn(rep, acts);
  const dayN = daysSinceStart(start, today);
  const weekOfTenure = weekNo(dayN);
  /* ALL of his dispositioned work, not the seven-day window: a benchmark read
     off one week has a smaller sample than the benchmark needs, and the SOP
     curve is stated per WEEK OF TENURE rather than per rolling week. */
  const allDials = acts.filter(a => a && a.disp).length;
  const out = useMemo(() => bookingOutcomes(leads, rep), [leads, rep]);
  const stand = standing(allDials, out.booked, weekOfTenure);
  /* AND THE HONEST ONE. Dials-per-booking rewards booking anything; this reads
     the same rate against appointments that actually happened. */
  const standHeld = standing(allDials, out.held, weekOfTenure);
  const show = proportion(out.held, decidedOf(out));
  const mix = mixChecks(acts.filter(a => a && a.disp).reduce((m, a) => { m[a.disp] = (m[a.disp] || 0) + 1; return m; }, {}));
  const gate = kbReads === null ? null : playbookGate(kbPub, (kbReads || []).filter(r => r.rep_id === rep.id));
  const ack = (kbReads || []).filter(r => r.rep_id === rep.id && r.kind === 'ack').slice(-1)[0];
  const onb = (rep.onboarding && typeof rep.onboarding === 'object') ? rep.onboarding : {};
  const perBooking = dialsPerBooking(wk.dials, wk.bookings);

  const add = async () => {
    const b = draft.trim(); if (!b) return;
    setBusy(true); setErr('');
    try { await onAddNote(rep.id, b); setDraft(''); }
    catch (e) { setErr((e && e.message) || 'Could not save that.'); }
    setBusy(false);
  };

  return (
    <div className="scrim2 lead" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal lead rp" onMouseDown={e => e.stopPropagation()}>
        <div className="m-head">
          <div style={{ minWidth: 0 }}>
            <h2>{rep.name}</h2>
            <div className="co">{rep.role === 'owner' ? 'Owner' : 'Sales rep'}{rep.active === false ? ' · inactive' : ''}</div>
            <div className="meta">
              {lastSeen && lastSeen.lastSignInAt
                ? <>Last signed in {fmtStamp(lastSeen.lastSignInAt)}</>
                : <>Never signed in</>}
            </div>
          </div>
          <button className="m-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {/* m-scroll, NOT m-body. `.m-body` is a DEAD class with no rule behind
            it — App.jsx says so at the point where .m-scroll was introduced —
            so this panel had no overflow rule at all and everything below the
            fold, including the notes, was simply unreachable. */}
        <div className="m-scroll rp-body">

          {/* ---------------------------------------------------- their work */}
          <div className="msec">
            <div className="msec-h"><Phone size={14} /> Their work</div>
            <div className="rp-stats">
              <Stat label="Dials today" value={todayStats.dials}
                sub={todayStats.blocks.length ? `${todayStats.blocks.length} block${todayStats.blocks.length === 1 ? '' : 's'}` : 'no blocks yet'} />
              <Stat label="Dials, 7 days" value={wk.dials} sub={`${wk.blocks} block${wk.blocks === 1 ? '' : 's'}`} />
              <Stat label="Conversations" value={wk.conversations} sub="7 days" />
              <Stat label="Booked" value={wk.bookings} sub="7 days" tone={wk.bookings ? 'good' : ''} />
              {/* Null, not zero. A rep with no bookings yet has an UNKNOWN rate,
                  and rendering that as "0 per booking" reads as a measured
                  failure rather than as too early to say. */}
              <Stat label="Dials per booking" value={perBooking == null ? '—' : perBooking}
                sub={perBooking == null ? 'no bookings yet' : 'SOP: 25–30 in weeks 1–2'} />
            </div>

            {/* POSITION, NOT A COUNT. SOP-01's own curve, read for the week he
                is actually in — and `unknown` rather than a verdict whenever
                the sample cannot carry one. A confident "behind" off nine
                dials is a judgement about a person made from noise. */}
            <div className="rp-stand">
              <div className={'rp-band ' + stand.state}>
                {/* THE SCOPE IS IN THE LABEL, and it has to be.

                    The stat tiles above are a SEVEN-DAY window; these bands and
                    the checks below are ALL TIME, because SOP-01's curve is
                    stated per week of tenure and a benchmark read off one week
                    has a smaller sample than the benchmark needs.

                    Both are right and they answer different questions — but
                    unlabelled, inches apart, they read as a contradiction: the
                    tile said "1 per 22" while the band said "1 per 24.3" and
                    the check said "73 dials" under chips totalling 44. Two
                    numbers on one screen that cannot be reconciled by eye. */}
                <span className="rw-lbl">Against the SOP curve · bookings MADE · all time</span>
                <b>{stand.state === 'unknown' ? 'Too early to say'
                  : stand.state === 'on' ? 'On the curve'
                  : stand.state === 'ahead' ? 'Ahead of the curve' : 'Behind the curve'}</b>
                <i>
                  {stand.band ? `${stand.band.label}: 1 per ${stand.band.from}–${stand.band.to}` : 'no start date yet'}
                  {stand.rate != null ? ` · he is at 1 per ${stand.rate}` : ''}
                  {stand.why ? ` · ${stand.why}` : ''}
                </i>
              </div>
              {/* The same reading against HELD appointments. A rep can hit the
                  band on bookings that never happen. */}
              {out.booked > 0 && (
                <div className={'rp-band held ' + standHeld.state}>
                  <span className="rw-lbl">Against it on bookings that HELD · all time</span>
                  <b>{out.held} of {out.booked} held{out.undecided ? ` · ${out.undecided} not marked yet` : ''}</b>
                  <i>
                    {show.value == null ? 'no meeting decided yet'
                      : show.thin
                        ? `show rate ${Math.round(show.value * 100)}% — only ${show.n} decided, too thin to trust`
                        : `show rate ${Math.round(show.value * 100)}% across ${show.n}`}
                    {standHeld.rate != null ? ` · 1 held per ${standHeld.rate} dials` : ''}
                  </i>
                </div>
              )}
              {/* WHEN THE TWO DISAGREE, SAY SO.

                  Dials-per-booking rewards booking anything, which is the whole
                  reason the held reading exists. If the made number reads well
                  and the held number does not, the screen was showing a
                  flattering headline in a positive colour with the honest
                  figure underneath in red — and a reader skimming takes the
                  first one. */}
              {out.booked > 0 && (stand.state === 'on' || stand.state === 'ahead')
                && standHeld.state === 'behind' && (
                <div className="rp-check">
                  <AlertTriangle size={14} />
                  <div>
                    <b>On the curve for bookings made, behind it for bookings that held</b>
                    <span>
                      {out.noshow} of {decidedOf(out)} decided appointment{decidedOf(out) === 1 ? '' : 's'} did
                      not happen. The made number is the one a dials-per-booking target rewards, and it is the
                      one that can be hit without anybody showing up — read the held line, not this one.
                    </span>
                  </div>
                </div>
              )}
              <div className="rp-band day">
                <span className="rw-lbl">Day {dayN == null ? '—' : dayN}{weekOfTenure ? ` · week ${weekOfTenure}` : ''}</span>
                <b>{dayN == null ? 'Has not started dialling'
                  : dayN < DECISION_DAY ? `${DECISION_DAY - dayN} day${DECISION_DAY - dayN === 1 ? '' : 's'} to the day-14 review`
                  : `Day-14 review was ${dayN - DECISION_DAY === 0 ? 'today' : `${dayN - DECISION_DAY} days ago`}`}</b>
                <i>{start ? `First dial ${fmtDate(start)}${rep.startedOn ? ' (set by you)' : ' (his first dispositioned call)'}` : 'No dispositioned call yet'}</i>
              </div>
            </div>

            {/* TWO NAMED CHECKS, HELD until the sample can support them —
                deliberately absent rather than greyed out, because a judgement
                the numbers cannot carry should not be on the screen at all. */}
            {mix.ready
              ? mix.checks.map(c => (
                  <div className="rp-check" key={c.key}>
                    <AlertTriangle size={14} />
                    <div><b>{c.title}</b><span>{c.body}</span></div>
                  </div>
                ))
              : <div className="sec-hint" style={{ marginTop: 10 }}>
                  Disposition checks need about {MIX_SAMPLE_MIN} dials before they mean anything — {mix.need} to go.
                </div>}

            {Object.keys(wk.byCode).length > 0 && (
              <div className="rp-codes">
                <span className="scope">Last 7 days</span>
                {DISPOSITIONS.filter(d => wk.byCode[d.code]).map(d => (
                  <span key={d.code} className={d.contact ? '' : 'quiet'} title={d.hint}>
                    <b>{d.code}</b> {wk.byCode[d.code]}<i>{d.label}</i>
                  </span>
                ))}
              </div>
            )}

            {/* Blocks, from the gaps between dials — not from how long he was
                signed in. See src/lib/repwork.js for why that distinction is
                the whole design. */}
            <div className="rp-days">
              {!week.length && <div className="empty">Nothing logged yet.</div>}
              {week.map(d => {
                const s = dayStats(d.acts, CONTACT_DISP);
                return (
                  <div className="rp-day" key={d.day}>
                    <span className="rp-date">{fmtDate(d.day)}</span>
                    <span className="rp-dn">{s.dials} dial{s.dials === 1 ? '' : 's'}</span>
                    <span className="rp-dn">{s.conversations} conv</span>
                    <span className={'rp-dn' + (s.bookings ? ' good' : '')}>{s.bookings} booked</span>
                    <span className="rp-blocks">
                      {s.blocks.length
                        ? s.blocks.map((b, i) => <em key={i}>{hhmm(b.from)}–{hhmm(b.to)} · {b.n}</em>)
                        : <em className="none">no calling block</em>}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="sec-hint">A block is dials with no gap longer than {BLOCK_GAP_MIN} minutes. There is no session or time-in-app anywhere on this screen — see SOP-01.</div>
          </div>

          {/* --------------------------------------------------- their money */}
          <div className="msec">
            <div className="msec-h"><DollarSign size={14} /> Their money</div>
            <div className="rp-stats">
              <Stat label="Their pipeline" value={usd($.pipe)} sub={`${$.open.length} open`} />
              <Stat label="Closed" value={usd($.closedV)} sub={`${$.closedN} deal${$.closedN === 1 ? '' : 's'}`} tone={$.closedN ? 'good' : ''} />
              <Stat label="Commission pending" value={usd($.pend)} sub="counted, not money yet" tone="gold" />
              <Stat label="Commission earned" value={usd($.earned)} sub="the client paid" tone={$.earned ? 'good' : ''} />
            </div>
            {/* THE DEALS BEHIND THE NUMBERS. A total with no rows under it is a
                figure nobody can check — ENGINEERING.md §2's rule that a
                drilldown must equal the sum of its own rows. */}
            {($.won.length > 0 || $.open.length > 0) && (
              <div className="rp-deals">
                {$.won.map(l => { const c = cmsnOf(l);
                  return (<div className="rp-deal" key={l.id}>
                    <span className="rp-dl">{l.company || l.name}</span>
                    <span className="rp-dv">{usd(num(l.dealValue))}</span>
                    <span className={'rp-dc ' + ((c && c.status) || '')}>
                      {c ? `${usd(num(c.amount))} ${c.status || 'pending'}` : 'no commission'}
                    </span>
                  </div>); })}
                {$.open.slice(0, 8).map(l => (
                  <div className="rp-deal open" key={l.id}>
                    <span className="rp-dl">{l.company || l.name}</span>
                    <span className="rp-dv">{num(l.dealValue) ? usd(num(l.dealValue)) : '—'}</span>
                    <span className="rp-dc">{sOf(l.stage, stages).label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* -------------------------------------------------- their record */}
          <div className="msec">
            <div className="msec-h"><BookOpen size={14} /> Their record</div>
            <div className="rp-stats">
              <Stat label="Playbook"
                value={gate === null ? 'not tracked' : gate.complete ? 'Through it' : `${gate.done} of ${gate.total}`}
                sub={gate === null ? 'migration not run'
                  : gate.complete ? (ack ? 'rules confirmed ' + fmtDate(String(ack.at).slice(0, 10)) : 'rules not confirmed')
                  : (gate.ackDone ? 'reading' : 'rules not confirmed')}
                tone={gate === null ? '' : gate.complete ? 'good' : 'gold'} />
              <Stat label="Commission rate" value={`${num(rep.commission_pct)}%`}
                sub={num(rep.appointment_rate) ? usd(num(rep.appointment_rate)) + ' per appointment' : 'no appointment rate'} />
            </div>

            {/* WHETHER AND WHEN. No document is stored — a W-9 carries an SSN
                and it is not going in this database. */}
            <div className="rp-onb">
              {KEYS.map(([k, label]) => { const v = onb[k] || {};
                return (
                  <div className={'rp-onb-i' + (v.done ? ' done' : '')} key={k}>
                    {v.done ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    <span>{label}</span>
                    <i>{v.done ? (v.on ? fmtDate(v.on) : 'received') : 'not yet'}</i>
                  </div>
                );
              })}
            </div>
            <div className="sec-hint">Receipts only. The documents themselves are not stored here and never should be. Edit these in Settings → Team.</div>
            {gate !== null && (
              <div className="kgroup" style={{ marginTop: 10 }}>
                <button className="btn btn-d btn-sm" onClick={() => onResetPlaybook(rep.id)}>
                  Send back through the Playbook
                </button>
              </div>
            )}
          </div>

          {/* ---------------------------------------------------- your notes */}
          {owner && (
            <div className="msec">
              <div className="msec-h"><Lock size={14} /> Your notes on {rep.name}</div>
              <div className="rp-priv">
                <ShieldAlert size={13} />
                <span>
                  Owner-only in the database, not hidden on the screen. {rep.name}
                  {"'"}s login returns zero rows from this table — through the app, the
                  assistant, or any other path.
                </span>
              </div>

              {notes === null
                ? <div className="empty">Notes are not set up on this install yet — run REP-PROFILE-MIGRATION.sql.</div>
                : (<>
                    <textarea className="act-input rp-note-in" rows={3} value={draft}
                      onChange={e => setDraft(e.target.value)}
                      placeholder={`What you want to remember about ${rep.name} — coaching, concerns, what is going well.`} />
                    {err && <div className="mtg-warn" style={{ marginTop: 8 }}><AlertTriangle size={14} /><div>{err}</div></div>}
                    <div className="kgroup" style={{ marginTop: 8 }}>
                      <button className="btn btn-p btn-sm" onClick={add} disabled={busy || !draft.trim()}>
                        {busy ? <Loader2 size={14} className="spin" /> : null} Add note
                      </button>
                    </div>
                    <div className="rp-notes">
                      {!notes.length && <div className="empty">Nothing written down yet.</div>}
                      {notes.map(n => (
                        <div className="rp-note" key={n.id}>
                          <div className="rp-note-m">
                            <b>{n.by_name || 'Someone'}</b>
                            <span>{fmtStamp(n.at)}</span>
                            <button onClick={() => onDeleteNote(n.id)} aria-label="Delete note"><Trash2 size={12} /></button>
                          </div>
                          <div className="rp-note-b">{n.body}</div>
                        </div>
                      ))}
                    </div>
                  </>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
