// api/client-email.js — OWNER ONLY. The CRM calls this right after an owner
// ticks "deposit paid" on a client's checklist, with the lead's id and nothing
// else. It sends "You're locked in" once (api/_clientemail.js sendLockedIn).
//
// It trusts nothing in the request but the lead id: the tick is re-read from
// the lead, the switch and its switch-on date from settings, the recipient by
// the client-mail door (_mail.js) from the onboarding's lead. A call for a lead whose deposit
// is not ticked, or was ticked before the email was switched on, sends
// nothing and says why. A second call (a double click, the daily job at the
// same moment) finds the claim taken and sends nothing.
//
// Square, later: its webhook ticks the same box server-side and calls
// sendLockedIn() directly, so the tick stays the one trigger.
import { guard, sweep } from './_guard.js';
import { sendLockedIn } from './_clientemail.js';

const REASON = {
  switched_off: '"You\'re locked in" is switched off in Settings.',
  not_ticked: 'The deposit is not ticked on this client\'s checklist.',
  before_switched_on: 'The deposit was ticked before this email was switched on, so it is not sent (past clients are never emailed).',
  no_onboarding: 'This client has no onboarding yet, so there is no link to send. Create one, then tick the deposit again.',
  already_submitted: 'This client already finished onboarding.',
  already: 'Already sent.',
  no_email: 'This client has no email address on their record.',
  not_found: 'That client was not found.',
  not_configured: 'Email is not set up on this deployment.',
};

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'client-email', perIp: 60, windowMin: 10, perDay: 1000, maxChars: 500, requireOwner: true });
  if (!gate.ok) return;
  sweep();
  const b = req.body || {};
  const leadId = String(b.leadId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(leadId)) { res.status(400).json({ ok: false, error: 'Pick a client first.' }); return; }
  const r = await sendLockedIn(leadId);
  res.status(200).json(r.ok ? { ok: true, sent: 'locked_in' } : { ok: false, reason: r.reason, message: REASON[r.reason] || 'The email did not go out.' });
}
