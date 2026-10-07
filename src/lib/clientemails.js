/* CLIENT EMAILS: the owner's on/off switches, read in ONE place by the CRM's
   Settings card and the server (api/_clientemail.js). Pure, browser-safe. */
/* Owner-only, in settings.clientEmails, each {on, since}. NEVER SAVED MEANS
   OFF, and the screen says which fell back: a client email must not start
   going out because a deploy happened. `since` is the day it was switched on,
   and it is the past-client guard: only a deposit tick, onboarding activity or
   a submit ON OR AFTER that day can trigger the email, so switching one on
   never mails every client who already paid. */
export const SWITCHES = [
  ['lockedIn', '"You\'re locked in"', 'When the deposit is ticked on the client\'s checklist'],
  ['seat', '"We saved your seat"', '24 hours, day 3 and day 6 after their last onboarding activity, until they submit'],
  ['stall', 'Day-10 call task', 'No email: a "Call [client]" task for the point of contact, 10 days after their last activity'],
  ['ticket', '"Launch Day Ticket"', 'When they submit onboarding'],
];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function readSwitches(settings) {
  const saved = (settings && settings.clientEmails && typeof settings.clientEmails === 'object') ? settings.clientEmails : {};
  const out = {}, fellBack = [];
  for (const [k] of SWITCHES) {
    const s = saved[k];
    if (!s || typeof s !== 'object' || typeof s.on !== 'boolean') { out[k] = { on: false, since: null }; fellBack.push(k); continue; }
    out[k] = { on: s.on, since: DAY.test(String(s.since || '')) ? s.since : null };
  }
  return { ...out, fellBack };
}
/** On, and the triggering day is on or after the day it was switched on. */
export const allowed = (sw, dayISO) => !!(sw && sw.on && sw.since && DAY.test(String(dayISO || '').slice(0, 10)) && String(dayISO).slice(0, 10) >= sw.since);

