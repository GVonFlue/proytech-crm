/* "YOU'RE IN" — the moment after a client locks in their launch.

   The proposal is the promise; this is the handshake. It shows once they
   accept (with one burst of confetti), and again — quietly, no confetti —
   whenever they come back to the link.

   Everything on it comes from the proposal's frozen body (company, what they
   bought, the point(s) of contact chosen for this proposal, launch days) or
   from the acceptance itself (the name they typed, and the onboarding and
   payment links, which the server only hands over once accepted). Nothing
   here names a company or a person: an offer with no contacts says "we".

   Imports nothing from the CRM: the public page bundles this file. */
import React, { useEffect, useRef } from 'react';
import { whoWillSend, telHref } from '../lib/proposal';

export const CONFETTI_COLORS = ['#2E9BFF', '#38BDF8', '#FB6926'];

/* Motion is opt-out: a visitor who asked their device for less motion gets
   none at all, not a smaller burst. */
export function prefersReducedMotion(win = typeof window !== 'undefined' ? window : null) {
  try { return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

/* One tasteful burst from the top of the screen, then gone. Canvas, no
   library, ~2.6s, and it removes itself. Returns a cancel function. */
export function burst(doc = document, win = window) {
  if (prefersReducedMotion(win)) return () => {};
  const c = doc.createElement('canvas');
  c.className = 'yi-confetti'; c.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(c);
  const ctx = c.getContext && c.getContext('2d');
  if (!ctx) { c.remove(); return () => {}; }
  const dpr = Math.min(2, win.devicePixelRatio || 1);
  const W = win.innerWidth, H = win.innerHeight;
  c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);
  const N = W < 500 ? 90 : 150;
  const parts = Array.from({ length: N }, (_, i) => ({
    x: W * (0.15 + Math.random() * 0.7), y: -20 - Math.random() * H * 0.3,
    vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
  const t0 = win.performance ? win.performance.now() : Date.now();
  let raf = 0, done = false;
  const frame = t => {
    const el = (t || Date.now()) - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = el > 2000 ? Math.max(0, 1 - (el - 2000) / 600) : 1;
    for (const p of parts) {
      p.vy += 0.08; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (el < 2600 && !done) raf = win.requestAnimationFrame(frame); else stop();
  };
  const stop = () => { done = true; if (raf) win.cancelAnimationFrame(raf); c.remove(); };
  raf = win.requestAnimationFrame(frame);
  return stop;
}

const firstOf = s => String(s || '').trim().split(/\s+/)[0] || '';
const safeLink = u => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

export default function Celebrate({ body, name, onboardingUrl, paymentUrl, confetti = false }) {
  const b = body || {}; const cl = b.client || {}; const q = b.quote || {};
  const contacts = Array.isArray(b.contacts) ? b.contacts.filter(c => c && c.name) : [];
  const company = cl.company || cl.name || 'your business';
  const bought = (q.items || []).map(i => i.name).filter(Boolean).join(' + ');
  const first = firstOf(name);
  const who = whoWillSend(contacts);
  const onboarding = safeLink(onboardingUrl), pay = safeLink(paymentUrl);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ block: 'start' });
    if (!confetti || typeof document === 'undefined') return undefined;
    return burst(document, window);
  }, [confetti]);

  return (<section className="yi" ref={ref} aria-labelledby="yi-h">
    <div className="yi-hero">
      <div className="yi-kick">Proposal accepted</div>
      <h1 id="yi-h">You're in{first ? `, ${first}` : ''}. Let's grow.</h1>
      <p className="yi-sub">Today's the day {company} starts running on a real system.</p>
    </div>

    <div className="yi-ticket" role="group" aria-label="Launch Day ticket">
      <div className="yi-ticket-l">
        <span className="yi-admit">Admit one</span>
        <span className="yi-tk">Launch Day ticket</span>
        <b className="yi-co">{company}</b>
        {bought && <span className="yi-bought">{bought}</span>}
      </div>
      <div className="yi-ticket-r">
        {b.launchDays ? <><span className="yi-tk">Launch</span><b className="yi-days">about {b.launchDays} days</b><span className="yi-after">after onboarding</span></>
          : <><span className="yi-tk">Launch</span><b className="yi-days">Day one</b><span className="yi-after">starts with onboarding</span></>}
      </div>
    </div>

    <div className="yi-next">
      <div className="yi-kick">What happens next</div>
      <ol>
        <li><span className="yi-n">01</span><div><b>Your deposit link</b>
          <p>{pay ? 'Pay your deposit whenever you are ready. It locks in your build.' : `${who} your deposit link today.`}</p>
          {pay && <a className="yi-link" href={pay}>Pay my deposit</a>}</div></li>
        <li><span className="yi-n">02</span><div><b>Your onboarding</b>
          <p>About 20 minutes. It saves as you go, so you can stop and come back.</p></div></li>
        <li><span className="yi-n">03</span><div><b>Your kickoff call</b>
          <p>We walk through what you shared and set your Launch Day.</p></div></li>
      </ol>
    </div>

    {onboarding
      ? <a className="yi-go" href={onboarding}>Start my onboarding <span aria-hidden="true">→</span></a>
      : <p className="yi-wait">{who} your deposit and onboarding links today.</p>}

    {contacts.length > 0 && <div className="yi-contacts">
      <div className="yi-kick">{contacts.length === 1 ? 'Your point of contact' : 'Your points of contact'}</div>
      <div className="yi-people">{contacts.map(c => (<div className="yi-person" key={c.name}>
        <b>{c.name}</b>
        {telHref(c.phone) && <a href={telHref(c.phone)}>{c.phone}</a>}
        {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
      </div>))}</div>
    </div>}
  </section>);
}

/* Orange that carries white text is --yi-hot-ink (#CC4A0A, 4.61:1), the same
   fill as the proposal's accept button, the portal and the lead view. The brand
   orange --yi-hot (#FB6926) is only 2.94:1 under white, so it stays where it
   carries no text: borders, glows, confetti. "Start my onboarding" was a
   #FF8A4C..#E2531A gradient (2.34..3.83:1) and the "Admit one" tag sat on
   #FB6926; tests/youreincontrast.mjs holds every stop to 4.5:1. */
export const CELEBRATE_CSS = `
.yi{--yi-ink:#0B1633;--yi-mute:#56637F;--yi-blue:#1F6FEB;--yi-elec:#2E9BFF;--yi-ice:#38BDF8;--yi-navy:#061431;--yi-hot:#FB6926;--yi-hot-ink:#CC4A0A;--yi-line:#DCE5F4;
  max-width:880px;margin:0 auto 22px;color:var(--yi-ink);font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  border:1.5px solid transparent;border-radius:22px;overflow:hidden;
  background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--yi-elec),var(--yi-ice) 45%,var(--yi-hot)) border-box;
  box-shadow:0 30px 80px -30px rgba(6,20,49,.45)}
.yi-hero{position:relative;padding:34px 40px 26px;border-bottom:1px solid var(--yi-line);
  background:radial-gradient(60% 120% at 100% 0%,rgba(56,189,248,.22),transparent 60%),radial-gradient(50% 90% at 0% 100%,rgba(251,105,38,.10),transparent 60%),linear-gradient(180deg,#FFFFFF,#EEF4FF)}
.yi-hero:after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,var(--yi-elec),var(--yi-ice) 60%,var(--yi-hot))}
.yi-kick{display:inline-flex;align-items:center;gap:8px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--yi-blue)}
.yi-kick:before{content:"";width:22px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--yi-elec),var(--yi-hot))}
.yi h1{font-family:"Space Grotesk",Inter,Arial,sans-serif;font-size:42px;line-height:1.05;letter-spacing:-.02em;color:var(--yi-navy);margin:10px 0 8px}
.yi-sub{font-size:17px;color:#1C2A4A;margin:0;max-width:600px}
.yi-ticket{display:grid;grid-template-columns:1fr auto;margin:26px 40px 0;border-radius:18px;overflow:hidden;position:relative;
  background:linear-gradient(120deg,#061431,#0A2257 60%,#123A7A);color:#fff;box-shadow:0 18px 40px -18px rgba(6,20,49,.7)}
.yi-ticket:before,.yi-ticket:after{content:"";position:absolute;width:26px;height:26px;border-radius:50%;background:#fff;top:50%;transform:translateY(-50%)}
.yi-ticket:before{left:-13px}.yi-ticket:after{right:-13px}
.yi-ticket-l{padding:20px 26px 20px 30px;display:flex;flex-direction:column;gap:4px;min-width:0}
.yi-ticket-r{padding:20px 30px 20px 26px;border-left:2px dashed rgba(255,255,255,.28);display:flex;flex-direction:column;justify-content:center;gap:2px;text-align:right;
  background:radial-gradient(120% 120% at 100% 0%,rgba(251,105,38,.35),transparent 60%)}
.yi-admit{align-self:flex-start;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#fff;background:var(--yi-hot-ink);border-radius:99px;padding:3px 10px;box-shadow:0 0 0 1px rgba(251,105,38,.55),0 0 12px rgba(251,105,38,.45)}
.yi-tk{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#9FC4F5;margin-top:6px}
.yi-co{font-family:"Space Grotesk",Inter,sans-serif;font-size:26px;line-height:1.1;letter-spacing:-.01em;overflow-wrap:anywhere}
.yi-bought{font-size:14px;color:#D6E4F7}
.yi-days{font-family:"Space Grotesk",Inter,sans-serif;font-size:24px;line-height:1.1;white-space:nowrap}
.yi-after{font-size:13px;color:#D6E4F7}
.yi-next{margin:28px 40px 0}
.yi-next ol{list-style:none;margin:12px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.yi-next li{display:flex;gap:12px;align-items:flex-start;border:1px solid #E2E9F5;border-top:3px solid var(--yi-elec);border-radius:14px;padding:14px 16px;background:#fff}
.yi-next li:nth-child(3){border-top-color:var(--yi-hot)}
.yi-n{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;color:var(--yi-blue);padding-top:2px}
.yi-next b{display:block;font-size:15px;color:var(--yi-navy)}
.yi-next p{margin:4px 0 0;font-size:13.5px;color:var(--yi-mute);line-height:1.5}
.yi-link{display:inline-block;margin-top:8px;font-size:13.5px;font-weight:700;color:var(--yi-blue)}
.yi-go{display:flex;align-items:center;justify-content:center;gap:10px;margin:26px 40px 0;padding:18px 22px;border-radius:14px;text-decoration:none;
  font-family:"Space Grotesk",Inter,sans-serif;font-size:20px;font-weight:700;color:#fff;
  background:radial-gradient(90% 140% at 100% 0%,var(--yi-hot-ink),#B23F07 55%,#A83A06);box-shadow:0 0 0 1px rgba(251,105,38,.45),0 18px 40px -16px rgba(251,105,38,.75)}
.yi-go:hover{background:radial-gradient(90% 140% at 100% 0%,#B23F07,#A83A06 55%,#963305)}
.yi-wait{margin:26px 40px 0;padding:16px 18px;border-radius:14px;background:#FFF4EC;border:1px solid #F7C9AE;color:#8A3B12;font-size:16px;font-weight:600;text-align:center}
.yi-contacts{margin:24px 40px 28px;padding-top:18px;border-top:1px solid var(--yi-line)}
.yi-people{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.yi-person{flex:1 1 220px;display:flex;flex-direction:column;gap:2px;border:1px solid var(--yi-line);border-radius:12px;padding:12px 14px;background:#F8FAFE}
.yi-person b{font-size:15px;color:var(--yi-navy)}
.yi-person a{font-size:14px;color:var(--yi-blue);text-decoration:none;overflow-wrap:anywhere}
.yi-confetti{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999}
@media (max-width:640px){
  .yi{border-radius:18px}
  .yi-hero{padding:24px 20px 20px}
  .yi h1{font-size:32px}
  .yi-sub{font-size:16px}
  .yi-ticket{grid-template-columns:1fr;margin:20px 14px 0}
  .yi-ticket-l{padding:18px 22px 14px}
  .yi-ticket-r{border-left:none;border-top:2px dashed rgba(255,255,255,.28);text-align:left;padding:14px 22px 18px}
  .yi-ticket:before,.yi-ticket:after{top:auto;bottom:calc(52px);transform:none}
  .yi-next{margin:22px 14px 0}
  .yi-next ol{grid-template-columns:1fr}
  .yi-go{margin:22px 14px 0;font-size:18px}
  .yi-wait{margin:22px 14px 0}
  .yi-contacts{margin:20px 14px 22px}
}
@media (prefers-reduced-motion: reduce){ .yi-confetti{display:none} }
@media print{ .yi{display:none} }
`;
