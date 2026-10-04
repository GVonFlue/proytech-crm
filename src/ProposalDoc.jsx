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

const usd = v => {
  const n = Number(v) || 0; const c = Math.round(Math.abs(n) * 100) % 100;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: 2 });
};
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
  const plan = c.plan || {};
  const hasPlan = !!(plan.goal || (plan.numbers || []).length || (plan.levers || []).length);
  let sec = 0; const no = () => String(++sec).padStart(2, '0');
  const validLine = expiresAt ? `Valid until ${fmtDay(expiresAt)}` : `Valid ${body.validDays || 7} days from the date it is sent`;

  return (<div className="pdoc">
    <div className="pd-plate">
      <span className="pd-mark">{co.name || 'Proposal'}</span>
      <span className="pd-plate-r">{(cl.company || cl.name || '').toUpperCase()} · {(c.headline || 'Proposal').toUpperCase()}</span>
    </div>

    <div className="pd-top">
      <div className="pd-kicker">{co.name ? co.name + ' ' : ''}proposal · prepared {fmtDay(body.preparedOn)}</div>
      <div className="pd-head"><Field edit={edit} value={c.headline} onChange={v => set(['headline'], v)} rows={1} /></div>
      <h1 className="pd-client">{cl.company || cl.name}</h1>
      <div className="pd-meta">Prepared for {[cl.name, cl.company, cl.city, cl.website].filter(Boolean).join(' · ')}</div>
      {co.name && <div className="pd-meta">Prepared by {[co.name, co.people, co.website].filter(Boolean).join(' · ')}</div>}
      <p className="pd-summary"><Field edit={edit} value={c.summary} onChange={v => set(['summary'], v)} rows={5} /></p>
    </div>

    {hasPlan && <section className="pd-sec">
      <div className="pd-label">Section {no()} — your plan</div>
      <h2>Where you said you want to go</h2>
      {(plan.goal || edit) && <p className="pd-goal"><Field edit={edit} value={plan.goal} onChange={v => set(['plan', 'goal'], v)} rows={2} /></p>}
      {(plan.numbers || []).length > 0 && <div className="pd-nums">{plan.numbers.map((n, i) => (
        <div className="pd-num" key={i}><b><Field edit={edit} value={n.value} onChange={v => set(['plan', 'numbers', i, 'value'], v)} rows={1} /></b>
          <span><Field edit={edit} value={n.label} onChange={v => set(['plan', 'numbers', i, 'label'], v)} rows={1} /></span></div>))}</div>}
      {(plan.levers || []).length > 0 && <div className="pd-levers">{plan.levers.map((l, i) => (
        <div className="pd-lever" key={i}><span>Lever {i + 1}</span><Field edit={edit} value={l} onChange={v => set(['plan', 'levers', i], v)} rows={2} /></div>))}</div>}
    </section>}

    {(c.gaps || []).length > 0 && <section className="pd-sec">
      <div className="pd-label">Section {no()} — the gap</div>
      <h2>What is costing you right now</h2>
      <ol className="pd-gaps">{c.gaps.map((g, i) => (<li key={i}>
        <span className="pd-gn">{String(i + 1).padStart(2, '0')}</span>
        <div><b><Field edit={edit} value={g.title} onChange={v => set(['gaps', i, 'title'], v)} rows={1} /></b>{' '}
          <Field edit={edit} value={g.text} onChange={v => set(['gaps', i, 'text'], v)} rows={3} /></div>
      </li>))}</ol>
    </section>}

    {(c.build || []).length > 0 && <section className="pd-sec pd-break">
      <div className="pd-label">Section {no()} — the build</div>
      <h2>Everything that gets installed</h2>
      <div className="pd-build">{c.build.map((b, i) => (<div className="pd-bi" key={i}>
        <b><Field edit={edit} value={b.title} onChange={v => set(['build', i, 'title'], v)} rows={1} /></b>
        {b.tag && <em>{b.tag}</em>}{' '}
        <Field edit={edit} value={b.text} onChange={v => set(['build', i, 'text'], v)} rows={3} />
      </div>))}</div>
    </section>}

    {(st.underneath || []).length > 0 && <section className="pd-sec">
      <div className="pd-label">Section {no()} — underneath it</div>
      <h2>What you do not see, and why it matters</h2>
      <ul className="pd-arrows two">{st.underneath.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </section>}

    <section className="pd-sec">
      <div className="pd-label">Section {no()} — the investment</div>
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
      <h2>How it runs</h2>
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

    <div className="pd-foot"><span>{[co.name, co.city].filter(Boolean).join(' · ')}</span><span>{validLine}</span></div>
  </div>);
}

/* Styles live with the component so the public page and the CRM render the
   same document. Colours are tokens with defaults; nothing here names a
   company. Print rules turn the page into the PDF. */
export const PROPOSAL_CSS = `
.pdoc{--pd-ink:#14122B;--pd-mute:#5E5A7A;--pd-blue:#2B4DE0;--pd-navy:#05071A;--pd-hot:#FF6B2C;--pd-line:#E4E6F0;
  background:#fff;color:var(--pd-ink);font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;
  max-width:880px;margin:0 auto;padding:34px 40px 26px;border-radius:14px;box-shadow:0 20px 60px -30px rgba(5,7,26,.35)}
.pd-plate{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--pd-navy);color:#fff;border-radius:14px;padding:16px 20px;margin-bottom:22px}
.pd-mark{font-weight:800;font-size:19px;letter-spacing:-.01em}
.pd-plate-r{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.12em;color:#C9CCE8;text-align:right}
.pd-kicker,.pd-label{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--pd-blue)}
.pd-head{font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-mute);margin-top:6px}
.pd-client{font-size:38px;line-height:1.05;margin:8px 0 10px;letter-spacing:-.02em}
.pd-meta{font-size:12.5px;color:var(--pd-mute)}
.pd-summary{font-size:15px;margin:16px 0 4px}
.pd-sec{margin-top:26px}
.pd-sec h2{font-size:21px;margin:4px 0 12px;letter-spacing:-.01em}
.pd-goal{font-size:16px;font-weight:600;margin:0 0 12px}
.pd-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px}
.pd-num{border:1px solid var(--pd-line);border-radius:10px;padding:10px 12px}
.pd-num b{display:block;font-size:20px}
.pd-num span{font-size:12px;color:var(--pd-mute)}
.pd-levers{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.pd-lever{background:#F4F6FF;border-radius:10px;padding:10px 12px}
.pd-lever span{display:block;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-blue);margin-bottom:2px}
.pd-gaps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
.pd-gaps li{display:flex;gap:12px}
.pd-gn{font-family:ui-monospace,Menlo,monospace;color:var(--pd-blue);font-weight:700;padding-top:1px}
.pd-build{display:grid;grid-template-columns:1fr 1fr;gap:12px 22px}
.pd-bi em{font-style:normal;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-hot);margin-left:6px}
.pd-arrows{list-style:none;padding:0;margin:0}
.pd-arrows li{position:relative;padding-left:18px;margin:3px 0}
.pd-arrows li:before{content:"→";position:absolute;left:0;color:var(--pd-blue)}
.pd-arrows.two{columns:2;column-gap:28px}
.pd-arrows.two li{break-inside:avoid}
.pd-arrows.light li:before{color:#fff}
.pd-inv{display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:12px;margin-top:6px}
.pd-price{background:var(--pd-hot);color:#fff;border-radius:16px;padding:16px 18px}
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
.pd-guar{margin-top:12px;border:2px solid var(--pd-blue);border-radius:12px;padding:10px 14px;font-size:14px}
.pd-terms{margin-top:8px;font-size:12px;color:var(--pd-mute)}
.pd-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.pd-step{border-top:3px solid var(--pd-blue);padding-top:8px}
.pd-step span{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--pd-blue)}
.pd-step b{display:block;margin:2px 0}
.pd-step p{margin:0;font-size:12.5px;color:var(--pd-mute)}
.pd-band{margin-top:22px;background:var(--pd-blue);color:#fff;border-radius:16px;padding:18px 20px;display:grid;grid-template-columns:1fr 1fr;gap:22px}
.pd-bandh{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#C9D4FF;margin-bottom:6px}
.pd-band p{margin:0 0 10px}
.pd-accept{margin-top:18px;background:#F4F6FF;border-radius:16px;padding:16px 18px}
.pd-accept-h{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.pd-accept-h b{display:block;font-size:16px}
.pd-accept-h span{font-size:13px;color:var(--pd-mute)}
.pd-sign{text-align:right;font-weight:700;color:var(--pd-blue);font-size:13px}
.pd-foot{display:flex;justify-content:space-between;gap:12px;margin-top:16px;padding-top:10px;border-top:1px solid var(--pd-line);font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-mute)}
.pd-edit{width:100%;box-sizing:border-box;font:inherit;color:inherit;background:#FFFBEA;border:1px dashed #E8B04A;border-radius:6px;padding:4px 6px;resize:vertical}
@media (max-width:700px){
  .pdoc{padding:20px 16px;border-radius:0;box-shadow:none}
  .pd-client{font-size:30px}
  .pd-build,.pd-inv,.pd-band{grid-template-columns:1fr}
  .pd-arrows.two{columns:1}
  .pd-plate-r{display:none}
}
@media print{
  @page{size:letter;margin:0.45in}
  .pdoc{box-shadow:none;border-radius:0;padding:0;max-width:none;font-size:11.5px}
  .pd-client{font-size:30px}
  .pd-big{font-size:32px}
  .pd-sec,.pd-inv,.pd-band,.pd-accept,.pd-step,.pd-bi,.pd-gaps li{break-inside:avoid}
  .pd-break{break-before:page}
  .pd-plate,.pd-price,.pd-band{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pd-noprint{display:none!important}
}
`;
