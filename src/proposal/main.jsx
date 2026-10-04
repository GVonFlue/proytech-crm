/* THE PAGE A CLIENT OPENS. No login, no database client, no CRM code.

   The token rides in the URL FRAGMENT (#t=...), which browsers never send to
   a server, so it does not appear in any access log or referrer. This page
   reads it and POSTs it to api/proposal-public.js, the only way in.

   Accept: typed full name, a terms checkbox, the plan if a prepay is offered,
   then the server records it (time and IP) and the page sends them to the
   onboarding form for their package. The button is a POST from this page and
   never a link, because business mail scanners open every link in an email
   to check it, and a link that accepted would accept proposals nobody read. */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProposalDoc, { PROPOSAL_CSS } from '../ProposalDoc';
import { TOKEN_RE } from '../lib/proposal';

export function tokenFromHash(hash) {
  const m = String(hash || '').match(/(?:^#|&)t=([^&]+)/);
  const t = m ? decodeURIComponent(m[1]) : '';
  return TOKEN_RE.test(t) ? t : '';
}

const PAGE_CSS = `
body{font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.pg{padding:28px 14px 60px}
.pg-msg{max-width:560px;margin:60px auto;background:#fff;border-radius:16px;padding:28px;text-align:center;color:#14122B;box-shadow:0 20px 60px -30px rgba(5,7,26,.35)}
.pg-msg h1{font-size:22px;margin:0 0 8px}
.pg-msg p{color:#5E5A7A;margin:0}
.pg-acc{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.pg-acc input[type=text]{font:inherit;font-size:16px;border:1px solid #C9CDE3;border-radius:10px;padding:12px 14px;background:#fff}
.pg-row{display:flex;gap:8px;flex-wrap:wrap}
.pg-plan{flex:1 1 200px;display:flex;gap:8px;align-items:flex-start;border:1px solid #C9CDE3;background:#fff;border-radius:10px;padding:10px 12px;cursor:pointer;font-size:14px}
.pg-plan.on{border-color:#2B4DE0;box-shadow:0 0 0 2px rgba(43,77,224,.15)}
.pg-agree{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:#14122B}
.pg-agree input{margin-top:3px;width:18px;height:18px}
.pg-btn{font:inherit;font-size:17px;font-weight:700;color:#fff;background:#FF6B2C;border:none;border-radius:12px;padding:15px 20px;cursor:pointer}
.pg-btn:disabled{opacity:.5;cursor:default}
.pg-err{color:#B4322E;font-size:14px}
.pg-done{background:#E6F6EE;color:#14663E;border-radius:12px;padding:14px 16px;font-size:15px}
.pg-print{display:block;margin:14px auto 0;font:inherit;font-size:14px;color:#2B4DE0;background:none;border:none;cursor:pointer;text-decoration:underline}
@media print{ body{background:#fff} .pg{padding:0} .pg-print,.pg-acc,.pg-done{display:none!important} }
`;

async function call(body) {
  const r = await fetch('/api/proposal-public', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

function Accept({ token, proposal, onAccepted }) {
  const q = (proposal.body && proposal.body.quote) || {};
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [plan, setPlan] = useState('monthly');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const usd = v => '$' + (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

  if (proposal.status === 'accepted') return <div className="pg-done">Accepted by <b>{proposal.acceptedName}</b>. Thank you. Your onboarding and deposit link are on the way.</div>;
  if (proposal.expired) return <div className="pg-err">This proposal has expired. Reply to our email and we will send you a fresh one.</div>;

  const go = async () => {
    setErr('');
    if (name.trim().length < 2) { setErr('Type your full name to sign.'); return; }
    if (!agree) { setErr('Tick the box to agree to the terms.'); return; }
    setBusy(true);
    const j = await call({ t: token, action: 'accept', name: name.trim(), agree: true, plan }).catch(() => ({ ok: false }));
    setBusy(false);
    if (!j.ok) { setErr(j.error || 'That did not go through. Please try again.'); return; }
    onAccepted(j);
  };

  return (<div className="pg-acc">
    {q.prepay && Number(q.monthly) > 0 && <div className="pg-row">
      <label className={'pg-plan' + (plan === 'monthly' ? ' on' : '')}><input type="radio" checked={plan === 'monthly'} onChange={() => setPlan('monthly')} />
        <span><b>Monthly</b><br />{usd(q.monthly)}/mo from launch</span></label>
      <label className={'pg-plan' + (plan === 'annual' ? ' on' : '')}><input type="radio" checked={plan === 'annual'} onChange={() => setPlan('annual')} />
        <span><b>{q.prepay.months} months up front</b><br />{usd(q.prepay.total)} at launch, {q.prepay.free} months free</span></label>
    </div>}
    <input type="text" placeholder="Type your full name to sign" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
    <label className="pg-agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
      <span>I agree to this proposal, its terms, and the {q.depositPct}% deposit of {usd(q.deposit)} due at signing.</span></label>
    {err && <div className="pg-err">{err}</div>}
    <button className="pg-btn" onClick={go} disabled={busy}>{busy ? 'Recording…' : 'Accept proposal'}</button>
  </div>);
}

function Page() {
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!token) { setState({ error: 'This proposal link is not valid. Ask us for a fresh one.' }); return; }
    call({ t: token, action: 'view' }).then(j => {
      if (!j.ok) { setState({ error: j.error || 'This proposal could not be loaded.' }); return; }
      const co = j.proposal.body.company || {}; const cl = j.proposal.body.client || {};
      document.title = `Proposal for ${cl.company || cl.name || 'you'}${co.name ? ' · ' + co.name : ''}`;
      setState({ proposal: j.proposal });
    }).catch(() => setState({ error: 'This proposal could not be loaded. Check your connection and try again.' }));
  }, [token]);

  const accepted = j => {
    setState(s => ({ ...s, proposal: { ...s.proposal, status: 'accepted', acceptedName: s.proposal.acceptedName || 'you' }, done: j }));
    if (j.onboardingUrl && /^https:\/\//.test(j.onboardingUrl)) setTimeout(() => { window.location.href = j.onboardingUrl; }, 1800);
  };

  if (state.loading) return <div className="pg-msg"><p>Loading your proposal…</p></div>;
  if (state.error) return <div className="pg-msg"><h1>Proposal unavailable</h1><p>{state.error}</p></div>;
  const p = state.proposal;
  const slot = state.done
    ? <div className="pg-done"><b>Accepted. Thank you.</b> {state.done.onboardingUrl ? 'Taking you to your onboarding form now…' : 'Your onboarding form and deposit payment link are on the way today.'}</div>
    : <Accept token={token} proposal={p} onAccepted={accepted} />;
  return (<div className="pg">
    <ProposalDoc body={p.body} expiresAt={p.expiresAt} acceptSlot={slot} />
    <button className="pg-print" onClick={() => window.print()}>Download PDF</button>
  </div>);
}

if (typeof document !== 'undefined' && document.getElementById('root') && !globalThis.__NO_MOUNT__) {
  const style = document.createElement('style'); style.textContent = PROPOSAL_CSS + PAGE_CSS; document.head.appendChild(style);
  createRoot(document.getElementById('root')).render(<Page />);
}
export { Page };
