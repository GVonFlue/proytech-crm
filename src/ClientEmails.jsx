/* SETTINGS → CLIENT EMAILS (owner only): one switch per onboarding email.

   Reads and writes settings.clientEmails through lib/clientemails, the same
   definition the server reads (api/_clientemail.js), so the switch on screen
   and the switch the daily job obeys cannot disagree.

   NEVER SAVED MEANS OFF, said by name. Switching one ON stamps today as its
   `since`, and that date is the past-client guard: only a deposit tick,
   onboarding activity or submit on or after it can send, so switching an
   email on never mails the clients who already paid. Switching off and on
   again moves `since` to the new day, on purpose. */
import React from 'react';
import { Mail } from 'lucide-react';
import { SWITCHES, readSwitches } from './lib/clientemails';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmt = iso => { const d = new Date(String(iso) + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

export function ClientEmailSettings({ settings, saveSettings }) {
  const sw = readSwitches(settings);
  const set = (k, on) => {
    const cur = (settings && settings.clientEmails) || {};
    const next = { ...cur, [k]: { on, since: on ? today() : (sw[k].since || null) } };
    saveSettings({ ...settings, clientEmails: next });
  };
  return (<div className="card" style={{ marginBottom: 18 }}>
    <div className="sec-title"><Mail size={15} />Client emails</div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 14 }}>Sent to the email on the client's record, never to anything typed elsewhere. Each one goes out once. Switching one on only applies from today: clients who already paid or finished are never emailed.</div>
    {sw.fellBack.length > 0 && <div className="lc-fb">Never switched on, so <b>off</b>: {sw.fellBack.map(k => SWITCHES.find(x => x[0] === k)[1]).join(', ')}.</div>}
    <div className="ce-rows">{SWITCHES.map(([k, label, when]) => (<label key={k} className="ce-row">
      <input type="checkbox" checked={sw[k].on} onChange={e => set(k, e.target.checked)} aria-label={`${label}: ${sw[k].on ? 'on' : 'off'}`} />
      <span className="ce-t"><b>{label}</b><em>{when}</em>
        {sw[k].on && sw[k].since ? <i>On since {fmt(sw[k].since)}</i> : null}</span>
    </label>))}</div>
  </div>);
}

export const CLIENT_EMAILS_CSS = `
.ce-rows{display:flex;flex-direction:column;gap:8px}
.ce-row{display:flex;align-items:flex-start;gap:10px;border:1px solid #ECEEF5;border-radius:12px;padding:10px 12px;cursor:pointer}
.ce-row input{margin-top:3px}
.ce-t{display:flex;flex-direction:column;gap:2px;font-size:13px;color:#3A4160}
.ce-t b{color:#14122B;font-size:13.5px}
.ce-t em{font-style:normal;color:#56607A;font-size:12.5px}
.ce-t i{font-style:normal;color:#14663E;font-size:12px;font-weight:600}
`;
