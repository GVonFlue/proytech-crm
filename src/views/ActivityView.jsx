/* ============================================================================
   Activity, modeled on ProyTech's Activity tab.

   WHAT CAME ACROSS: Day / Week / Month with arrows, a date picker and a Today
   button; person and type chips; a KPI row; the stacked "Activity by person"
   chart and the person-by-type table; and a log with day separators and a
   coloured icon per kind.

   WHAT THIS INSTALL KEEPS THAT PROYTECH DOES NOT HAVE: the "What got done /
   Everything" switch. The definition lives in lib/activity.js. The short
   version: a CSV import or a note the app wrote about itself is not somebody's
   work, and counting it would let one import make a week look like 200 calls.

   So the NUMBERS (KPIs, chart, table) always count accomplishments only,
   whatever the switch says. The switch only changes what the LOG shows, and in
   Everything mode a machine entry is labelled as one rather than passing for
   somebody's work.

   Transactions contribute nothing here. Their history is the deadline list
   and the phase, and a date passing is not something a person did.

   Date maths is in lib/activity.js (rangeOf, shiftAnchor, dayIn), not here.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  CalendarCheck, ChevronLeft, ChevronRight, List, ListTodo, Mailbox, MessageSquare,
  PhoneCall, Star, StickyNote, Upload,
} from 'lucide-react';
import { Btn, Empty, IconBtn, Kpi, Seg } from '../components/ui';
import { fmtLong } from '../lib/dates';
import { ACT_TYPES, buildStream, rangeOf, shiftAnchor, tally, timeIn } from '../lib/activity';
import { BRAND } from '../lib/brand';

const C = BRAND.colors;
const TEAL = '#0E9AA7';
const MUTED = '#B9B6C6';

const ICON = {
  call: PhoneCall, text: MessageSquare, email: Mailbox, appointment: CalendarCheck,
  note: StickyNote, feedback: Star, task: ListTodo, import: Upload,
};
const TYPE = Object.fromEntries(ACT_TYPES.map(t => [t.key, t]));
const colorOf = kind => (TYPE[kind] ? (C[TYPE[kind].color] || TEAL) : MUTED);
const labelOf = kind => (TYPE[kind] ? TYPE[kind].label : kind === 'import' ? 'Import' : 'Note');

export default function ActivityView({ ctx }) {
  const me = ctx.me || {};
  const today = ctx.todayIso;
  const canSeeOthers = !!(ctx.isLeader || ctx.isCoordinator);

  const [mode, setMode] = useState('day');
  const [anchor, setAnchor] = useState(today);
  const [who, setWho] = useState('all');
  const [typeF, setTypeF] = useState('all');
  const [preset, setPreset] = useState('done');

  const range = rangeOf(mode, anchor);
  const whoId = canSeeOthers ? (who === 'all' ? '' : who) : (me.id || '');

  const nameOf = id => {
    if (!id) return 'Unassigned';
    if (String(id) === String(me.id || '')) return me.name || 'Me';
    const u = (ctx.users_by_id || {})[id];
    return (u && (u.name || u.email)) || 'Former member';
  };

  const team = useMemo(
    () => (ctx.users || []).filter(u => u && u.active !== false),
    [ctx.users]
  );

  const common = { contacts: ctx.contacts, tasks: ctx.tasks, who: whoId, from: range.from, to: range.to, tz: ctx.tz };

  /* numbers: accomplishments only, always */
  const counted = useMemo(
    () => buildStream({ ...common, preset: 'done' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.contacts, ctx.tasks, whoId, range.from, range.to, ctx.tz]
  );
  /* the log: whatever the switch says, then the type chip */
  const log = useMemo(
    () => buildStream({ ...common, preset }).filter(e => typeF === 'all' || e.kind === typeF),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.contacts, ctx.tasks, whoId, range.from, range.to, ctx.tz, preset, typeF]
  );

  const { byType, byPerson } = useMemo(() => tally(counted), [counted]);
  const chartData = Object.entries(byPerson)
    .map(([id, c]) => ({ person: nameOf(id), ...c }))
    .sort((a, b) => b.total - a.total);
  const showTeamCharts = canSeeOthers && chartData.length > 0;

  const contactById = useMemo(
    () => Object.fromEntries((ctx.contacts || []).filter(Boolean).map(c => [c.id, c])),
    [ctx.contacts]
  );
  const txnById = useMemo(
    () => Object.fromEntries((ctx.transactions || []).filter(Boolean).map(t => [t.id, t])),
    [ctx.transactions]
  );

  const subjectOf = e => {
    if (e.contactName) return e.contactName;
    const c = e.contactId && contactById[e.contactId];
    if (c) return c.name || 'Contact';
    const t = e.transactionId && txnById[e.transactionId];
    if (t) return String(t.address || 'Transaction').split(',')[0];
    return e.kind === 'task' ? 'Task' : '—';
  };
  const open = e => {
    if (e.contactId && contactById[e.contactId]) ctx.go('contacts', { id: e.contactId });
    else if (e.transactionId && txnById[e.transactionId]) ctx.go('transactions', { id: e.transactionId });
  };

  const whoLabel = !canSeeOthers ? 'You' : who === 'all' ? 'Everyone' : nameOf(who);
  const typeName = typeF === 'all' ? '' : (TYPE[typeF] ? TYPE[typeF].plural.toLowerCase() : typeF);

  let lastDay = null;

  return (
    <>
      {/* ---------------------------------------------------- controls */}
      <div className="card act-card">
        <div className="act-ctrl">
          <Seg value={mode} onChange={setMode}
            options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          <div className="act-nav">
            <IconBtn onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} aria-label="Previous" title="Previous"><ChevronLeft size={16} /></IconBtn>
            <b>{range.label}</b>
            <IconBtn onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} aria-label="Next" title="Next"><ChevronRight size={16} /></IconBtn>
          </div>
          <input type="date" className="act-date" value={anchor} aria-label="Jump to a date"
            onChange={e => { if (e.target.value) setAnchor(e.target.value); }} />
          <Btn kind="s" sm style={{ marginLeft: 'auto' }} onClick={() => { setMode('day'); setAnchor(today); }}>Today</Btn>
        </div>
        <div className="bk-filters act-chips">
          {canSeeOthers && (
            <>
              <button className={'bk-chip' + (who === 'all' ? ' on' : '')} onClick={() => setWho('all')}>Everyone</button>
              {team.map(u => (
                <button key={u.id} className={'bk-chip' + (who === u.id ? ' on' : '')} onClick={() => setWho(u.id)}>
                  {String(u.id) === String(me.id) ? 'Me' : (u.name || u.email)}
                </button>
              ))}
              <span className="act-divider" />
            </>
          )}
          <button className={'bk-chip' + (typeF === 'all' ? ' on' : '')} onClick={() => setTypeF('all')}>All types</button>
          {ACT_TYPES.map(t => (
            <button key={t.key} className={'bk-chip' + (typeF === t.key ? ' on' : '')} onClick={() => setTypeF(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- numbers */}
      <div className="kgrid act-kpis">
        <Kpi variant="accent" label="Total logged" value={byType.total} icon={<List size={14} />}
          d={`${whoLabel}, ${range.label}`} />
        {ACT_TYPES.map(t => {
          const I = ICON[t.key];
          return <Kpi key={t.key} label={t.plural} value={byType[t.key]} icon={<I size={14} />} />;
        })}
      </div>

      {showTeamCharts && (
        <div className="card act-chartcard">
          <h3>Activity by person</h3>
          <div className="ch-sub">Calls, texts, appointments, notes and tasks finished. Imports and notes the app wrote are never counted.</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F5" vertical={false} />
              <XAxis dataKey="person" tick={{ fontSize: 12, fill: '#6a6788' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#9b98ad' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#F4F5FA' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {ACT_TYPES.map((t, i) => (
                <Bar key={t.key} dataKey={t.key} name={t.plural} stackId="a" fill={colorOf(t.key)}
                  radius={i === ACT_TYPES.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={72} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {showTeamCharts && (
        <div className="card act-tablecard">
          <div className="tbl-wrap">
            <table className="tbl act-tbl">
              <thead>
                <tr>
                  <th>Person</th>
                  {ACT_TYPES.map(t => <th key={t.key} className="num">{t.label}</th>)}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map(r => (
                  <tr key={r.person}>
                    <td className="namecell">{r.person}</td>
                    {ACT_TYPES.map(t => <td key={t.key} className="num subcell">{r[t.key] || 0}</td>)}
                    <td className="num act-total">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- the log */}
      <div className="card act-logcard">
        <div className="act-loghead">
          <div>
            <h3>Log <span className="act-logn">{log.length} {log.length === 1 ? 'entry' : 'entries'}</span></h3>
            <div className="ch-sub">
              {preset === 'done'
                ? 'What people did: calls, texts, emails, appointments, notes, feedback and finished tasks.'
                : 'Everything recorded against a contact, including imports and notes the app wrote itself.'}
            </div>
          </div>
          <Seg value={preset} onChange={setPreset}
            options={[{ value: 'done', label: 'What got done' }, { value: 'all', label: 'Everything' }]} />
        </div>

        {log.length ? (
          <div className="act-feedlist">
            {log.map(e => {
              const I = ICON[e.kind] || StickyNote;
              const head = mode !== 'day' && e.day !== lastDay;
              lastDay = e.day;
              const time = timeIn(e.at, ctx.tz);
              const clickable = !!((e.contactId && contactById[e.contactId]) || (e.transactionId && txnById[e.transactionId]));
              return (
                <React.Fragment key={`${e.kind}-${e.id}-${e.at}`}>
                  {head && <div className="act-daysep">{e.day === today ? 'Today' : fmtLong(e.day)}</div>}
                  <div className={'act-row' + (e.machine ? ' machine' : '') + (clickable ? '' : ' still')}
                    onClick={() => clickable && open(e)}>
                    <div className="act-ic" style={{ background: e.machine ? MUTED : colorOf(e.kind) }}><I size={15} /></div>
                    <div className="act-body">
                      <div className="act-top">
                        <span className="act-lead">{subjectOf(e)}</span>
                        <span className="act-kind">{labelOf(e.kind)}</span>
                        {canSeeOthers && e.by && <span className="act-who">{nameOf(e.by)}</span>}
                        {e.machine && <span className="act-machine">Written by the app</span>}
                        {time && <span className="act-time">{time}</span>}
                      </div>
                      {e.note && <div className="act-txt">{e.note}</div>}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <Empty>
            Nothing logged {mode === 'day' ? 'on this day' : `this ${mode}`}
            {canSeeOthers && who !== 'all' ? ` by ${nameOf(who)}` : ''}
            {typeName ? ` for ${typeName}` : ''}. Log a call, text or appointment on any contact and it shows up here.
          </Empty>
        )}
      </div>
    </>
  );
}
