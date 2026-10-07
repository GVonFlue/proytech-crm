// api/client-emails-cron.js — the daily client-email job (api/_clientemail.js
// runDaily): the "We saved your seat" reminders, the day-10 call-task claim,
// and the backstops for "You're locked in" and the Launch Day ticket.
//
// THE SCHEDULER (a GET carrying `Bearer $CRON_SECRET`, isCronCaller, the same
// constant-time check content-slate uses; an unset secret refuses it), or a
// signed-in OWNER (guard requireOwner), who may force a run now.
//
// 10:00 AM IN THE BUSINESS'S ZONE, ONCE. vercel.json schedules it at 15:00
// AND 16:00 UTC, which are 10 AM in Chicago in daylight time (CDT, UTC-5) and
// standard time (CST, UTC-6). The run that is not 10 o'clock locally does
// nothing, so clients get one reminder a day, in the morning, never overnight,
// on any Vercel plan (daily schedules only).
import { isCronCaller, cronDenial } from './_content.js';
import { guard, sweep } from './_guard.js';
import { runDaily } from './_clientemail.js';

/* TWO CALLERS. The scheduler: a GET with `Bearer $CRON_SECRET`. Or an OWNER,
   through guard({requireOwner}), the same fallback content-slate has: a POST
   with {force: true} runs the job now, whatever the hour (an owner's
   deliberate act, for checking it after switching an email on). Nothing in
   the body chooses a client or an address. */
export default async function handler(req, res) {
  if (isCronCaller(req)) {
    const r = await runDaily(Date.now());
    console.log('[client-emails-cron]', JSON.stringify(r).slice(0, 2000));
    res.status(200).json(r);
    return;
  }
  const why = cronDenial(req);
  if (why) { res.status(401).json({ ok: false, error: why }); return; }
  const gate = await guard(req, res, { name: 'client-emails-cron', perIp: 10, windowMin: 10, perDay: 50, maxChars: 200, requireOwner: true });
  if (!gate.ok) return;
  sweep();
  const b = req.body || {};
  const r = await runDaily(Date.now(), { force: b.force === true });
  res.status(200).json(r);
}
