/* THE PROPOSAL, AS THE CLIENT SEES IT.

   One component, rendered in two places: the CRM's review screen and the
   public page the client opens. They are the same code on purpose, so what
   the owner approves is exactly what the client reads.

   Imports nothing from the CRM (no database client, no lead helpers), because
   the public page bundles this file and must ship nothing it does not need.

   Every number comes from body.quote (computed by lib/proposal quote()).
   Every sentence the AI wrote comes from body.copy. In edit mode the copy
   fields become text boxes; numbers are never editable here, only in the
   builder's price fields, so a number cannot be typed into prose by accident
   and disagree with the investment section. */
import React from 'react';

import { usd } from './lib/proposal';
const fmtDay = iso => {
  const t = Date.parse(iso && iso.length <= 10 ? iso + 'T12:00:00' : iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

function Field({ edit, value, onChange, rows = 2, className = '' }) {
  if (!edit) return <>{value}</>;
  return <textarea className={'pd-edit ' + className} rows={rows} value={value} onChange={e => onChange(e.target.value)} />;
}

export default function ProposalDoc({ body, edit = false, onCopy, expiresAt, acceptSlot }) {
  if (!body || !body.quote) return null;
  const c = body.copy || {}; const q = body.quote; const st = body.standard || {};
  const co = body.company || {}; const cl = body.client || {};
  const set = (path, v) => {
    if (!onCopy) return;
    const next = JSON.parse(JSON.stringify(c));
    let o = next; for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = v; onCopy(next);
  };
  /* add/remove a list entry while editing, so the owner can meet the
     proposal standard (lib/proposal readiness) without regenerating */
  const listAt = (o, path) => { for (const k of path) { if (o[k] == null) o[k] = {}; o = o[k]; } return o; };
  const push = (path, blank) => { if (!onCopy) return; const next = JSON.parse(JSON.stringify(c));
    const parent = listAt(next, path.slice(0, -1)); const k = path[path.length - 1];
    parent[k] = [...(Array.isArray(parent[k]) ? parent[k] : []), blank]; onCopy(next); };
  const drop = (path, i) => { if (!onCopy) return; const next = JSON.parse(JSON.stringify(c));
    const parent = listAt(next, path.slice(0, -1)); const k = path[path.length - 1];
    parent[k] = (parent[k] || []).filter((_, j) => j !== i); onCopy(next); };
  const X = (path, i, what) => edit && <button type="button" className="pd-x" aria-label={`Remove ${what}`} onClick={() => drop(path, i)}>×</button>;
  const Add = (path, blank, label) => edit && <button type="button" className="pd-add" onClick={() => push(path, blank)}>+ {label}</button>;
  const plan = c.plan || {};
  const hasPlan = edit || !!(plan.goal || (plan.numbers || []).length || (plan.levers || []).length);
  let sec = 0; const no = () => String(++sec).padStart(2, '0');
  const validLine = expiresAt ? `Valid until ${fmtDay(expiresAt)}` : `Valid ${body.validDays || 7} days from the date it is sent`;

  return (<div className="pdoc">
    {/* THE COVER. The brand plate and the client block share one light
        .pd-hero; the summary sits below it, on white. The plate is the
        company's LOGO when the offer has one (company.logo, per install),
        and its name as text only when it does not. */}
    <div className="pd-hero">
      <div className="pd-plate">
        {co.logo ? <img className="pd-logo" src={co.logo} alt={co.name || 'Logo'} />
          : <span className="pd-mark">{co.name || 'Proposal'}</span>}
        <span className="pd-plate-r">{(cl.company || cl.name || '').toUpperCase()} · {(c.headline || 'Proposal').toUpperCase()}</span>
      </div>
      <div className="pd-top">
        <div className="pd-kicker">{co.name ? co.name + ' ' : ''}proposal · prepared {fmtDay(body.preparedOn)}</div>
        <div className="pd-head"><Field edit={edit} value={c.headline} onChange={v => set(['headline'], v)} rows={1} /></div>
        <h1 className="pd-client">{cl.company || cl.name}</h1>
        <div className="pd-meta">Prepared for {[cl.name, cl.company, cl.city, cl.website].filter(Boolean).join(' · ')}</div>
        {co.name && <div className="pd-meta">Prepared by {[co.name, co.people, co.website].filter(Boolean).join(' · ')}</div>}
      </div>
    </div>
    <p className="pd-summary"><Field edit={edit} value={c.summary} onChange={v => set(['summary'], v)} rows={5} /></p>

    {hasPlan && <section className="pd-sec">
      <div className="pd-label">Section {no()} — your plan</div>
      <h2>Where you're headed</h2>
      {(plan.goal || edit) && <p className="pd-goal"><Field edit={edit} value={plan.goal} onChange={v => set(['plan', 'goal'], v)} rows={2} /></p>}
      {((plan.numbers || []).length > 0 || edit) && <div className="pd-nums">{(plan.numbers || []).map((n, i) => (
        <div className="pd-num" key={i}>{X(['plan', 'numbers'], i, 'number')}<b><Field edit={edit} value={n.value} onChange={v => set(['plan', 'numbers', i, 'value'], v)} rows={1} /></b>
          <span><Field edit={edit} value={n.label} onChange={v => set(['plan', 'numbers', i, 'label'], v)} rows={1} /></span></div>))}
        {Add(['plan', 'numbers'], { label: '', value: '' }, 'Add a number')}</div>}
      {((plan.levers || []).length > 0 || edit) && <div className="pd-levers">{(plan.levers || []).map((l, i) => (
        <div className="pd-lever" key={i}>{X(['plan', 'levers'], i, 'lever')}<span>Lever {i + 1}</span><Field edit={edit} value={l} onChange={v => set(['plan', 'levers', i], v)} rows={2} /></div>))}
        {Add(['plan', 'levers'], '', 'Add a lever')}</div>}
    </section>}

    {((c.gaps || []).length > 0 || edit) && <section className="pd-sec">
      <div className="pd-label">Section {no()} — the gap</div>
      <h2>What's holding you back</h2>
      <ol className="pd-gaps">{(c.gaps || []).map((g, i) => (<li key={i}>
        <span className="pd-gn">{String(i + 1).padStart(2, '0')}</span>
        <div><b><Field edit={edit} value={g.title} onChange={v => set(['gaps', i, 'title'], v)} rows={1} /></b>{' '}
          <Field edit={edit} value={g.text} onChange={v => set(['gaps', i, 'text'], v)} rows={3} /></div>
        {X(['gaps'], i, 'gap')}
      </li>))}</ol>
      {Add(['gaps'], { title: '', text: '' }, 'Add a gap')}
    </section>}

    {((c.build || []).length > 0 || edit) && <section className="pd-sec pd-break">
      <div className="pd-label">Section {no()} — the build</div>
      <h2>What we're building for you</h2>
      <div className="pd-build">{(c.build || []).map((b, i) => (<div className="pd-bi" key={i}>
        {X(['build'], i, 'build item')}
        <b><Field edit={edit} value={b.title} onChange={v => set(['build', i, 'title'], v)} rows={1} /></b>
        {b.tag && <em>{b.tag}</em>}{' '}
        <Field edit={edit} value={b.text} onChange={v => set(['build', i, 'text'], v)} rows={3} />
        {/* which purchased item this is part of: the proposal standard
            refuses a build item that is not linked to something bought */}
        {edit && <label className={'pd-link' + ((q.items || []).some(it => it.id === b.item) ? '' : ' bad')}>Part of
          <select value={b.item || ''} onChange={e => set(['build', i, 'item'], e.target.value)}>
            <option value="">Pick what they are buying…</option>
            {(q.items || []).map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select></label>}
      </div>))}</div>
      {Add(['build'], { title: '', tag: 'new', text: '', item: '' }, 'Add a build item')}
    </section>}

    {(st.underneath || []).length > 0 && <section className="pd-sec">
      <div className="pd-label">Section {no()} — underneath it</div>
      <h2>What you do not see, and why it matters</h2>
      <ul className="pd-arrows two">{st.underneath.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </section>}

    <section className="pd-sec">
      <div className="pd-label">Section {no()} — your investment in growth</div>
      <div className="pd-inv">
        <div className="pd-price">
          <div className="pd-pl">Install</div>
          <div className="pd-big">{usd(q.setup)}</div>
          <div className="pd-small">One time. {q.items.map(it => it.name).join(' + ')}.</div>
          <div className="pd-split">{q.depositPct}% at signing: <b>{usd(q.deposit)}</b><br />{100 - q.depositPct}% at launch: <b>{usd(q.balance)}</b></div>
          {q.monthly > 0 && <><div className="pd-pl" style={{ marginTop: 14 }}>Then</div>
            <div className="pd-big">{usd(q.monthly)}<small>/mo</small></div>
            <div className="pd-small">Starts at launch, not before.{q.extraSeats > 0 ? ` Includes ${q.extraSeats} extra seat${q.extraSeats === 1 ? '' : 's'} at ${usd(q.extraSeat)}/mo each.` : (q.seatsIncluded > 0 ? ` Up to ${q.seatsIncluded} seats included.` : '')}</div></>}
        </div>
        <div className="pd-box">
          {(st.covers || []).length > 0 && q.monthly > 0 && <><div className="pd-bh">The {usd(q.monthly)} covers</div>
            <ul className="pd-arrows">{st.covers.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {q.prepay && q.monthly > 0 && <div className="pd-prepay"><b>Pay {q.prepay.months} months up front, get {q.prepay.free} free.</b> {usd(q.prepay.total)} at launch instead of {usd(q.monthly * q.prepay.months)}, saving {usd(q.prepay.saves)}.</div>}
        </div>
        <div className="pd-box muted">
          {(st.quotedSeparately || []).length > 0 && <><div className="pd-bh">Quoted separately</div>
            <ul className="pd-arrows">{st.quotedSeparately.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <div className="pd-small dark">We quote before doing any of it. Nothing gets billed by surprise.</div></>}
        </div>
      </div>
      {st.guarantee && <div className="pd-guar"><b>Our guarantee.</b> {st.guarantee}</div>}
      {(st.terms || st.cancel) && <div className="pd-terms">{[st.terms, st.cancel].filter(Boolean).join(' ')}</div>}
    </section>

    {(st.steps || []).length > 0 && <section className="pd-sec">
      <div className="pd-label">Section {no()} — order of operations</div>
      <h2>Your road to Launch Day</h2>
      <div className="pd-steps">{st.steps.map((s, i) => (<div className="pd-step" key={i}>
        <span>{String(i + 1).padStart(2, '0')}</span><b>{s.title}</b><p>{s.text}</p></div>))}</div>
    </section>}

    {((st.needFromYou || []).length > 0 || (c.whyNow || []).length > 0) && <div className="pd-band">
      {(st.needFromYou || []).length > 0 && <div><div className="pd-bandh">What we need from you</div>
        <ul className="pd-arrows light">{st.needFromYou.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {(c.whyNow || []).length > 0 && <div><div className="pd-bandh">Why this is worth doing now</div>
        {c.whyNow.map((w, i) => <p key={i}><Field edit={edit} value={w} onChange={v => set(['whyNow', i], v)} rows={4} /></p>)}</div>}
    </div>}

    <div className="pd-accept">
      <div className="pd-accept-h">
        <div><b>This price and proposal are good for {body.validDays || 7} days.</b>
          <span>{validLine}. To get started, accept below.</span></div>
        {co.name && <div className="pd-sign">{co.name}<br /><span>{[co.people, co.email].filter(Boolean).join(' · ')}</span></div>}
      </div>
      {acceptSlot}
    </div>

    <div className={'pd-foot' + (co.mark ? ' has-mark' : '')}>
      {co.mark && <img className="pd-foot-mark" src={co.mark} alt="" />}
      <span>{[co.name, co.city].filter(Boolean).join(' · ')}</span><span>{validLine}</span></div>
  </div>);
}

/* The brand's line art: circuit traces on the cover, and the small trace
   mark in each section's corner. Inline SVG, under 1.5 KB together, so the
   public page needs no extra request for them. */
const HERO_ART = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMjIwIiB2aWV3Qm94PSIwIDAgMzIwIDIyMCI+PGRlZnM+PGZpbHRlciBpZD0iZyI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMiIgcmVzdWx0PSJiIi8+PGZlTWVyZ2U+PGZlTWVyZ2VOb2RlIGluPSJiIi8+PGZlTWVyZ2VOb2RlIGluPSJTb3VyY2VHcmFwaGljIi8+PC9mZU1lcmdlPjwvZmlsdGVyPjwvZGVmcz4KPGcgZmlsdGVyPSJ1cmwoI2cpIiBmaWxsPSJub25lIiBzdHJva2Utd2lkdGg9IjIuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNNDAgNjAgSDE1MCBMMTgwIDMwIEgzMjAiIHN0cm9rZT0iIzJFOUJGRiIgc3Ryb2tlLW9wYWNpdHk9Ii44Ii8+PHBhdGggZD0iTTkwIDExMCBIMjAwIEwyMzAgMTQwIEgzMjAiIHN0cm9rZT0iI0ZCNjkyNiIgc3Ryb2tlLW9wYWNpdHk9Ii44Ii8+PHBhdGggZD0iTTEzMCAxNzUgSDIyMCBMMjQ1IDE1MCBIMzIwIiBzdHJva2U9IiMyRTlCRkYiIHN0cm9rZS1vcGFjaXR5PSIuNiIvPjxwb2x5Z29uIHBvaW50cz0iMzA5LDgwIDI5MiwxMDkgMjU4LDEwOSAyNDEsODAgMjU4LDUxIDI5Miw1MSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkI2OTI2IiBzdHJva2Utb3BhY2l0eT0iMC43IiBzdHJva2Utd2lkdGg9IjIiLz48cG9seWdvbiBwb2ludHM9IjI2NCwxOTUgMjUyLDIxNiAyMjgsMjE2IDIxNiwxOTUgMjI4LDE3NCAyNTIsMTc0IiBmaWxsPSJub25lIiBzdHJva2U9IiMyRTlCRkYiIHN0cm9rZS1vcGFjaXR5PSIwLjUiIHN0cm9rZS13aWR0aD0iMiIvPjwvZz4KPGcgZmlsdGVyPSJ1cmwoI2cpIj48Y2lyY2xlIGN4PSIxNTAiIGN5PSI2MCIgcj0iNCIgZmlsbD0iIzJFOUJGRiIvPjxjaXJjbGUgY3g9IjIwMCIgY3k9IjExMCIgcj0iNCIgZmlsbD0iI0ZCNjkyNiIvPjxjaXJjbGUgY3g9IjIyMCIgY3k9IjE3NSIgcj0iNCIgZmlsbD0iIzM4QkRGOCIvPjwvZz48L3N2Zz4=';
const SEC_MARK = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDkwIDQwIj48ZyBmaWxsPSJub25lIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMCA4IEg0NCBMNTggMjIgSDg4IiBzdHJva2U9IiMyRTlCRkYiIHN0cm9rZS1vcGFjaXR5PSIuNTUiLz48cGF0aCBkPSJNMzAgMzQgSDYyIEw3MCAyNiIgc3Ryb2tlPSIjRkI2OTI2IiBzdHJva2Utb3BhY2l0eT0iLjU1Ii8+PC9nPjxjaXJjbGUgY3g9IjU4IiBjeT0iMjIiIHI9IjIuNiIgZmlsbD0iIzM4QkRGOCIvPjxjaXJjbGUgY3g9IjcwIiBjeT0iMjYiIHI9IjIuNCIgZmlsbD0iI0ZCNjkyNiIvPjwvc3ZnPg==';

/* Styles live with the component so the public page and the CRM render the
   same document. Colours are tokens; nothing here names a company — the logo
   and footer mark are images from the offer (company.logo, company.mark).
   The approved design is Sample_Proposal_Reed_Realty_v5: a light cover
   holding the brand plate and the client, the summary on white below it, and
   each section an outlined card. Phones get their own block; print turns the
   page into the PDF. */
export const PROPOSAL_CSS = `
.pdoc{--pd-ink:#0B1633;--pd-mute:#56637F;--pd-blue:#1F6FEB;--pd-elec:#2E9BFF;--pd-ice:#38BDF8;--pd-navy:#061431;--pd-hot:#FB6926;--pd-line:#DCE5F4;
  position:relative;color:var(--pd-ink);font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;
  max-width:880px;margin:0 auto;padding:0 0 26px;overflow:hidden;
  border:1.5px solid transparent;border-radius:22px;
  background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--pd-elec),var(--pd-ice) 45%,var(--pd-hot)) border-box;
  box-shadow:0 30px 80px -30px rgba(6,20,49,.45)}
.pdoc h2,.pd-client,.pd-num b,.pd-big{font-family:"Space Grotesk",Inter,Arial,sans-serif}

/* the cover */
.pd-hero{position:relative;overflow:hidden;border-radius:20px 20px 0 0;border-bottom:1px solid var(--pd-line);
  background:radial-gradient(60% 120% at 100% 0%,rgba(56,189,248,.22),transparent 60%),linear-gradient(180deg,#FFFFFF,#EEF4FF)}
.pd-hero:before{content:"";position:absolute;top:0;right:0;bottom:0;width:30%;
  background:url("${HERO_ART}") right top/contain no-repeat;
  -webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 40%);mask-image:linear-gradient(90deg,transparent 0%,#000 40%)}
.pd-hero:after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,var(--pd-elec),var(--pd-ice) 60%,var(--pd-hot))}
.pd-plate{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:22px 40px 0;color:var(--pd-navy)}
.pd-plate img.pd-logo{height:40px;width:auto;display:block}
.pd-mark{font-weight:800;font-size:19px;letter-spacing:-.01em;color:var(--pd-navy)}
.pd-plate-r{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.12em;color:var(--pd-mute);text-align:right}
.pd-top{position:relative;z-index:1;padding:10px 40px 24px;color:var(--pd-ink)}
.pd-kicker,.pd-label{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--pd-blue)}
.pd-head{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-hot);margin-top:6px}
.pd-client{font-size:40px;line-height:1.05;margin:6px 0 8px;letter-spacing:-.02em;color:var(--pd-navy)}
.pd-meta{font-size:12.5px;color:var(--pd-mute);max-width:660px}
.pd-summary{font-size:15.5px;color:#1C2A4A;margin:24px 0 4px;padding:0 40px}

/* sections: outlined cards, a trace mark in the corner */
.pd-sec{position:relative;margin:34px 40px 0;padding:22px 24px 20px;background:#fff;border:1px solid #E2E9F5;border-radius:18px;box-shadow:0 1px 0 rgba(6,20,49,.02)}
.pd-sec:after{content:"";position:absolute;top:10px;right:12px;width:90px;height:40px;background:url("${SEC_MARK}") no-repeat;opacity:.9;pointer-events:none}
.pd-label{display:inline-flex;align-items:center;gap:8px;font-weight:700}
.pd-label:before{content:"";width:22px;height:2px;background:linear-gradient(90deg,var(--pd-elec),var(--pd-hot));border-radius:2px}
.pd-sec h2{font-size:25px;margin:6px 0 14px;padding-right:90px;letter-spacing:-.02em}

/* your plan */
.pd-goal{font-size:17px;font-weight:600;margin:0 0 12px;padding:14px 16px;border-radius:12px;background:#F5F8FD;border-left:4px solid var(--pd-elec)}
.pd-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px}
.pd-num{background:#fff;border:1px solid var(--pd-line);border-top:3px solid var(--pd-elec);border-radius:12px;padding:12px 14px;box-shadow:0 8px 20px -14px rgba(31,111,235,.45)}
.pd-num b{display:block;font-size:24px;color:var(--pd-navy)}
.pd-num span{font-size:12px;color:var(--pd-mute)}
.pd-levers{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.pd-lever{background:#fff;color:var(--pd-ink);border:1px solid var(--pd-line);border-left:4px solid var(--pd-hot);border-radius:12px;padding:12px 14px;box-shadow:0 8px 20px -16px rgba(6,20,49,.5)}
.pd-lever span{display:block;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-hot);margin-bottom:2px}

/* the gap */
.pd-gaps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
.pd-gaps li{display:flex;gap:12px}
.pd-gn{display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0;border-radius:50%;background:rgba(46,155,255,.12);
  font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;color:var(--pd-blue)}

/* the build */
.pd-build{display:grid;grid-template-columns:1fr 1fr;gap:12px 22px}
.pd-bi{background:#fff;border:1px solid var(--pd-line);border-radius:12px;padding:12px 14px;box-shadow:0 8px 20px -16px rgba(31,111,235,.5)}
.pd-bi em{font-style:normal;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;
  color:#fff;background:var(--pd-hot);padding:2px 7px;border-radius:99px;margin-left:6px}

/* lists */
.pd-arrows{list-style:none;padding:0;margin:0}
.pd-arrows li{position:relative;padding-left:18px;margin:3px 0}
.pd-arrows li:before{content:"→";position:absolute;left:0;color:var(--pd-elec)}
.pd-arrows.two{columns:2;column-gap:28px}
.pd-arrows.two li{break-inside:avoid}

/* the investment */
.pd-inv{display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:12px;margin-top:6px}
.pd-price{color:#fff;border-radius:18px;padding:16px 18px;background:radial-gradient(90% 90% at 100% 0%,#FF8A4C,var(--pd-hot) 55%,#E2531A);box-shadow:0 18px 40px -16px rgba(251,105,38,.65)}
.pd-pl{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;opacity:.9}
.pd-big{font-size:40px;font-weight:800;line-height:1.05;letter-spacing:-.02em}
.pd-big small{font-size:16px;font-weight:700}
.pd-small{font-size:12.5px;opacity:.95}
.pd-small.dark{color:var(--pd-mute);margin-top:8px}
.pd-split{margin-top:10px;font-size:13px;background:rgba(255,255,255,.16);border-radius:10px;padding:8px 10px}
.pd-box{border:1px solid var(--pd-line);border-radius:16px;padding:14px 16px;font-size:13px}
.pd-box.muted{background:#FAFAFD}
.pd-bh{font-weight:700;color:var(--pd-blue);margin-bottom:4px}
.pd-box.muted .pd-bh{color:var(--pd-mute)}
.pd-prepay{margin-top:10px;background:#F4F6FF;border-radius:10px;padding:8px 10px;font-size:12.5px}
.pd-guar{margin-top:12px;border:1.5px solid var(--pd-elec);border-radius:14px;padding:10px 14px;font-size:14px;background:linear-gradient(90deg,rgba(46,155,255,.10),#fff)}
.pd-terms{margin:8px 40px 0;font-size:12px;color:var(--pd-mute)}

/* how it runs */
.pd-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.pd-step{border-top:3px solid var(--pd-elec);padding-top:10px}
.pd-step:nth-child(5){border-top-color:var(--pd-hot)}
.pd-step span{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--pd-blue)}
.pd-step b{display:block;margin:2px 0}
.pd-step p{margin:0;font-size:12.5px;color:var(--pd-mute)}

/* what we need, why now */
.pd-band{position:relative;overflow:hidden;margin:22px 40px 0;padding:18px 20px;display:grid;grid-template-columns:1fr 1fr;gap:22px;
  background:#F5F8FD;color:var(--pd-ink);border:1px solid var(--pd-line);border-radius:18px}
.pd-bandh{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--pd-blue);margin-bottom:6px}
.pd-band p{margin:0 0 10px}

/* accept, and the foot */
.pd-accept{margin:18px 40px 0;background:#F4F6FF;border-radius:14px;padding:16px 18px}
.pd-accept-h{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.pd-accept-h b{display:block;font-size:16px}
.pd-accept-h span{font-size:13px;color:var(--pd-mute)}
.pd-sign{text-align:right;font-weight:700;color:var(--pd-blue);font-size:13px}
.pd-foot{position:relative;display:flex;justify-content:space-between;gap:12px;margin:22px 40px 0;padding-top:10px;min-height:40px;border-top:1px solid var(--pd-line);
  font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-mute)}
.pd-foot.has-mark{padding-left:46px}
.pd-foot-mark{position:absolute;left:0;top:50%;transform:translateY(-50%);width:36px;height:36px;object-fit:contain}

.pd-edit{width:100%;box-sizing:border-box;font:inherit;color:inherit;background:#FFFBEA;border:1px dashed #E8B04A;border-radius:6px;padding:4px 6px;resize:vertical}
/* edit mode only (the CRM's review screen; the client never sees these) */
.pd-num,.pd-lever,.pd-bi,.pd-gaps li{position:relative}
.pd-x{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:1px solid var(--pd-line);background:#fff;color:var(--pd-mute);font:inherit;font-size:14px;line-height:1;cursor:pointer}
.pd-x:hover{color:#b4322e;border-color:#E9B4B1}
.pd-add{font:inherit;font-size:12.5px;font-weight:600;color:var(--pd-blue);background:#F4F7FF;border:1px dashed #B7C8F3;border-radius:10px;padding:8px 12px;cursor:pointer;margin-top:8px}
.pd-link{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11.5px;font-weight:600;color:var(--pd-mute)}
.pd-link select{font:inherit;font-size:12px;border:1px solid var(--pd-line);border-radius:8px;padding:4px 6px;background:#fff}
.pd-link.bad select{border-color:#E9A09B;background:#FFF5F4}

@media (max-width:700px){
  .pd-build,.pd-inv,.pd-band{grid-template-columns:1fr}
  .pd-arrows.two{columns:1}
  .pd-plate-r{display:none}
}
@media (max-width:600px){
  .pd-hero:before{width:45%;height:150px;opacity:.6}
  .pd-plate,.pd-top{padding-left:20px;padding-right:20px}
  .pd-client{font-size:32px}
  .pd-summary{padding-left:20px;padding-right:20px}
  .pd-sec{margin:22px 14px 0;padding:18px 16px}
  .pd-sec:after{width:70px;height:32px;background-size:contain}
  /* On a phone the corner mark sits beside the label, not the title: give
     the label room so the two never overlap, and let the title use the full
     width instead of wrapping around a mark that is not beside it. */
  .pd-sec .pd-label{display:flex;padding-right:66px}
  .pd-sec h2{padding-right:0}
  /* every block lines up with the section cards, edge to edge */
  .pd-band,.pd-accept,.pd-foot{margin-left:14px;margin-right:14px}
  .pd-foot{flex-direction:column;justify-content:center;gap:2px}
  .pd-terms{margin-left:0;margin-right:0}
  .pd-sign{text-align:left}
}
@media print{
  @page{size:letter;margin:0.45in}
  .pdoc{max-width:none;font-size:11.5px}
  .pd-big{font-size:32px}
  .pd-sec,.pd-inv,.pd-band,.pd-accept,.pd-step,.pd-bi,.pd-gaps li{break-inside:avoid}
  .pd-break{break-before:page}
  /* the brand colours print whether or not "background graphics" is ticked */
  .pdoc,.pdoc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  /* shadows are a screen affordance; on paper they become grey slabs, and
     Preview draws the rasterised ones as solid blocks behind every card */
  .pdoc,.pd-sec,.pd-num,.pd-lever,.pd-bi,.pd-price{box-shadow:none}
  .pd-sec h2,.pd-label{break-after:avoid}
  .pd-noprint{display:none!important}
}
`;
