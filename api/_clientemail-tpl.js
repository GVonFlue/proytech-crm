// api/_clientemail-tpl.js — the three onboarding client emails, as PURE
// functions: the rules for when each is due, the HTML and plain text, and the
// Launch Day calendar file. No network and no clock of its own (`now` is
// passed), so tests render every email and walk every timing in plain Node.
// Underscore prefix => Vercel does not expose this as a route.
//
// The sending (who, once, and the record of it) is ./_clientemail.js.
// Design: the approved mockups (proposal-import/email-mockups/emails2.html,
// email-4/5/6 PNGs), rebuilt email-safe: tables and inline styles, a plain-text
// alternative, every client-supplied string escaped. Names, logo and the
// people come from settings and the onboarding, never from this file.
//
// THE BUTTON IS #CC4A0A, not the mockups' #FB6926: white text on the brand
// orange is about 2.9:1, below WCAG AA. #CC4A0A is 4.61:1, the same fill as
// the proposal's accept button (#97) and the "You're in" screen (#99). The
// brand orange stays, as the button's border glow and the header stripe.

import { esc } from './_mail.js';
import { shortDate, addCalendarDays } from '../src/lib/onboarding.js';

/* The switches and the past-client guard live in src/lib/clientemails.js, so
   the CRM's Settings card and this file read ONE definition. */
import { SWITCHES, readSwitches, allowed } from '../src/lib/clientemails.js';
export { SWITCHES, readSwitches, allowed };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/* ------------------------------------------------------------------ timing */
/* ONCE A DAY AT 10:00 AM in the business's zone. Vercel's cron runs in UTC
   and cannot follow daylight saving, so vercel.json schedules BOTH 15:00 and
   16:00 UTC (10 AM CDT and 10 AM CST) and the job only does anything on the
   run where it is 10 o'clock here. Clients never get a reminder overnight. */
export function localHour(now, tz) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
}
export function localDay(at, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(at)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export const isSendHour = (now, tz) => localHour(now, tz) === 10;

/* The stages, counted from the LAST onboarding activity. "24 hours" means the
   first 10 AM run at least 24 hours after it; day 3 and day 6 the same. Day 10
   is the call task. */
export const STAGES = [['seat_1d', 1, 'seat'], ['seat_3d', 3, 'seat'], ['seat_6d', 6, 'seat'], ['stall_10d', 10, 'stall']];
/** Which reminder (if any) this onboarding is due at `now`. Only the HIGHEST
 *  stage reached counts, and it sends only if neither it nor anything after it
 *  has been claimed: a job that missed days sends the latest one, once, and
 *  never goes back to an earlier one. New activity restarts the count, and a
 *  stage already sent is never sent again. */
export function reminderDue({ status, lastActivityAt, submittedAt }, now, claimed, switches) {
  if (status !== 'in_progress' || submittedAt || !lastActivityAt) return null;
  const last = Date.parse(lastActivityAt); if (!Number.isFinite(last)) return null;
  const days = (now - last) / 864e5;
  const on = STAGES.filter(([, , sw]) => switches && switches[sw] && switches[sw].on);
  const reached = on.filter(([, d]) => days >= d);
  if (!reached.length) return null;
  const top = reached[reached.length - 1];
  const fromTop = on.slice(on.indexOf(top));
  if (fromTop.some(([k]) => claimed.has(k))) return null;
  return top[0];
}

/* ------------------------------------------------------------------ pieces */
const C = { navy: '#061431', navy2: '#0A2257', ink: '#0B1633', body: '#22304D', mute: '#56637F', line: '#DCE5F4', cyan: '#7DD3FC',
  peach: '#FFB38A', btn: '#CC4A0A', glow: '#FB6926', paid: '#14663C', soft: '#F7FAFF', dash: '#9EC2F2' };
const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const HEAD = "'Space Grotesk',Inter,Arial,sans-serif";
const MONO = "ui-monospace,Menlo,Consolas,monospace";
const absUrl = (base, p) => { const s = String(p || ''); if (/^https:\/\//.test(s)) return s; if (s.startsWith('/')) return String(base || '').replace(/\/+$/, '') + s; return ''; };
export const firstName = s => String(s || '').trim().split(/\s+/)[0] || '';

function shell({ preheader, logo, agency, kicker, h1a, h1b, sub, body, sign }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#E9EEF6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9EEF6"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:${FONT};color:${C.ink}">
<tr><td style="background:${C.navy};background-image:linear-gradient(160deg,${C.navy2},${C.navy} 75%);padding:26px 30px 24px">
${logo ? `<img src="${esc(logo)}" alt="${esc(agency)}" height="28" style="height:28px;display:block;border:0">` : `<div style="font:700 18px ${HEAD};color:#ffffff">${esc(agency)}</div>`}
<div style="font:700 11px ${MONO};letter-spacing:.2em;color:${C.cyan};margin-top:18px;text-transform:uppercase">${esc(kicker)}</div>
<h1 style="font:700 30px/1.1 ${HEAD};letter-spacing:-.02em;margin:8px 0 6px;color:#ffffff">${esc(h1a)}<br><span style="color:${C.peach}">${esc(h1b)}</span></h1>
<div style="color:#C6D5EC;font-size:14px;line-height:1.5">${esc(sub)}</div>
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:#2E9BFF;background-image:linear-gradient(90deg,#2E9BFF,#38BDF8 60%,${C.glow})">&nbsp;</td></tr>
<tr><td style="padding:24px 30px">${body}</td></tr>
${sign}
</table></td></tr></table></body></html>`;
}
function button(href, label, small) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0"><tr><td align="center" bgcolor="${C.btn}" style="background:${C.btn};border-radius:12px;border:1px solid ${C.glow};box-shadow:0 10px 22px -10px rgba(251,105,38,.8)">
<a href="${esc(href)}" style="display:block;padding:15px 18px;color:#ffffff;text-decoration:none;font:700 16px ${FONT}">${esc(label)}${small ? `<br><span style="font-weight:500;font-size:12px">${esc(small)}</span>` : ''}</a></td></tr></table>`;
}
function ticketRows(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;border:1.5px dashed ${C.dash};border-radius:14px;background:${C.soft}"><tr><td style="padding:10px 18px">
${rows.map((r, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"${i ? ` style="border-top:1px solid #E6ECF7"` : ''}><tr>
<td style="padding:8px 0;font-size:13.5px;color:${C.mute}">${esc(r[0])}</td>
<td align="right" style="padding:8px 0;font:700 13.5px ${HEAD};color:${r[2] || C.ink}">${esc(r[1])}</td></tr></table>`).join('')}
</td></tr></table>`;
}
function steps(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr>
${items.map((s, i) => `<td width="33%" valign="top" style="padding:${i ? '0 0 0 6px' : '0'}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px"><tr><td style="padding:10px;font-size:12px;color:${C.mute}">
<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:11px;background:${i === items.length - 1 ? C.btn : '#2E7FE0'};color:#ffffff;font-weight:700;font-size:11px">${esc(s[0])}</span>
<div style="font:700 13.5px ${HEAD};color:${C.ink};margin:6px 0 2px">${esc(s[1])}</div>${esc(s[2])}</td></tr></table></td>`).join('')}
</tr></table>`;
}
function signature(base, contact, agency, line) {
  if (!contact || !contact.name) return `<tr><td style="border-top:1px solid #E6ECF7;padding:16px 30px 22px;font-size:12px;color:#5F6B85">${esc(agency)} · ${esc(line)}</td></tr>`;
  const photo = absUrl(base, contact.photo);
  return `<tr><td style="border-top:1px solid #E6ECF7;padding:16px 30px 22px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
${photo ? `<td width="52" valign="middle"><img src="${esc(photo)}" alt="" width="40" height="40" style="width:40px;height:40px;border-radius:20px;display:block;border:0"></td>` : ''}
<td valign="middle" style="font-size:12.5px;color:#5F6B85;line-height:1.45"><b style="color:${C.ink}">${esc(contact.name)}</b> · ${esc(agency)}<br>${esc(line)}</td></tr></table></td></tr>`;
}
const usd = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const PAID_VIA = { ach: 'Bank (ACH)', bank: 'Bank transfer', card: 'Card', check: 'Check', cash: 'Cash', zelle: 'Zelle', venmo: 'Venmo', square: 'Square' };
const via = m => PAID_VIA[String(m || '').toLowerCase()] || (m ? String(m) : '');

/* ------------------------------------------------- 1. "You're locked in" */
/** d: {agency, logo, base, contact, first, company, product, link, launchDays,
 *  deposit:{amount, method, on}|null, nextAmount|null} */
export function lockedIn(d) {
  const days = d.launchDays || 14;
  const rows = [];
  if (d.deposit && d.deposit.amount) rows.push([`Deposit · ${d.product || 'setup'}`, `✓ ${usd(d.deposit.amount)} paid`, C.paid]);
  else rows.push(['Deposit', '✓ Received', C.paid]);
  if (d.deposit && (d.deposit.method || d.deposit.on)) rows.push(['Paid', [via(d.deposit.method), shortDate(d.deposit.on)].filter(Boolean).join(' · ')]);
  if (d.nextAmount > 0) rows.push(['Next payment', `${usd(d.nextAmount)} on Launch Day`]);
  const body = ticketRows(rows)
    + button(d.link, 'Start my onboarding →', 'About 20 minutes · saves as you go')
    + `<div style="font:700 15px ${HEAD};margin:18px 0 6px">Your road to Launch Day</div>`
    + steps([['✓', 'Locked in', 'Done. Nice.'], ['2', 'Onboarding', 'Today, 20 min'], ['3', 'Launch Day', `~${days} days after`]]);
  const subject = `🔒 You're locked in${d.first ? ', ' + d.first : ''}`;
  const html = shell({ preheader: `Deposit received. Your launch countdown starts the day you finish onboarding.`, logo: d.logo, agency: d.agency,
    kicker: `Deposit received${d.company ? ' · ' + d.company : ''}`, h1a: "You're locked in.", h1b: "Let's build.",
    sub: `Your build slot is officially yours. One quick step and the ${days}-day countdown starts.`, body,
    sign: signature(d.base, d.contact, d.agency, d.contact && d.contact.phone ? `Questions? Text me at ${d.contact.phone}.` : 'Questions? Just reply to this email.') });
  const text = [`You're locked in${d.first ? ', ' + d.first : ''}. Let's build.`, '',
    ...rows.map(r => `${r[0]}: ${r[1]}`), '',
    `Start my onboarding (about 20 minutes, saves as you go):`, d.link, '',
    `Your ${days}-day countdown starts the day you finish.`, '', d.contact && d.contact.name ? `${d.contact.name} · ${d.agency}` : d.agency].join('\n');
  return { subject, html, text };
}

/* ------------------------------------------------ 2. "We saved your seat" */
/** d: {agency, logo, base, contact, first, link, launchDays, done, total,
 *  next:{title, minutes}|null, needed:[labels], asset:'logo'|'headshot'|null,
 *  stage:'seat_1d'|'seat_3d'|'seat_6d'} */
export function savedSeat(d) {
  const days = d.launchDays || 14;
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
  const personal = d.stage === 'seat_6d';
  const left = Math.max(0, (d.total || 0) - (d.done || 0));
  const h1a = personal ? 'Want to knock it out together?' : left === 1 ? "You're one section away" : `You're ${d.done} of ${d.total} in.`;
  const h1b = personal ? `I'll walk you through it.` : left === 1 ? 'from the home stretch.' : 'Pick up where you left off.';
  const rows = [];
  if (d.next && d.next.title) rows.push(['Next up', `${d.next.title}${d.next.minutes ? ` · about ${d.next.minutes} min` : ''}`]);
  if (d.needed && d.needed.length) rows.push(['Still needed', d.needed.slice(0, 3).join(', ')]);
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;border:1px solid ${C.line};border-radius:12px"><tr><td style="padding:12px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:700 13px ${HEAD}">Your progress</td><td align="right" style="font:700 13px ${HEAD}">${d.done} of ${d.total} sections</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#EEF2F8;border-radius:8px"><tr><td width="${pct}%" style="height:8px;line-height:8px;font-size:0;border-radius:8px;background:#2E9BFF;background-image:linear-gradient(90deg,#2E9BFF,${C.glow})">&nbsp;</td><td style="font-size:0">&nbsp;</td></tr></table>
</td></tr></table>`
    + (rows.length ? ticketRows(rows) : '')
    + button(d.link, 'Finish my onboarding →', 'Takes you back to where you left off')
    + (d.asset ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0"><tr><td style="background:#EEF4FF;color:#1F3A6E;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:600">📎 Short on time? Just reply to this email with your ${esc(d.asset)} and we'll put it in the right place.</td></tr></table>` : '')
    + `<div style="font-size:13px;color:${C.mute};margin-top:8px">Your ${days}-day launch clock starts the moment you finish.</div>`;
  const signLine = personal ? (d.contact && d.contact.phone ? `Reply and I'll call you, or text me at ${d.contact.phone}.` : "Reply and I'll call you.") : 'Everything you entered is saved.';
  const subject = `💺 We saved your seat${d.first ? ', ' + d.first : ''}`;
  const html = shell({ preheader: `${d.done} of ${d.total} sections done. Everything you entered is saved.`, logo: d.logo, agency: d.agency,
    kicker: `Onboarding · ${d.done} of ${d.total} done`, h1a, h1b,
    sub: personal ? `It takes about ${d.minutesLeft || 20} minutes with me on the phone. Everything you entered is saved.` : `Everything you've entered is saved. Pick up right where you left off.`,
    body, sign: signature(d.base, d.contact, d.agency, signLine) });
  const text = [`We saved your seat${d.first ? ', ' + d.first : ''}.`, '', `You're ${d.done} of ${d.total} sections in.`,
    ...rows.map(r => `${r[0]}: ${r[1]}`), '', 'Finish my onboarding:', d.link, '',
    d.asset ? `Short on time? Reply with your ${d.asset} and we'll put it in the right place.` : '',
    `Your ${days}-day launch clock starts the moment you finish.`, '', personal ? signLine : '', d.contact && d.contact.name ? `${d.contact.name} · ${d.agency}` : d.agency]
    .filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  return { subject, html, text };
}

/* ----------------------------------------------- 3. "Launch Day Ticket" */
/** d: {agency, logo, base, contact, company, productLine, launch:{started,
 *  startedOn, target, waiting:[]}, kickoff:{at|null, url|null}, crew:[{name,
 *  role, photo}], ics:boolean} */
export function launchTicket(d) {
  const L = d.launch || {};
  /* NEVER PROMISE A DATE THE CLOCK HAS NOT STARTED (the spec). */
  const started = !!(L.started && L.startedOn);
  const cell = (k, v, color) => `<td width="33%" valign="top" style="padding:0 6px 0 0"><div style="font:700 9.5px ${MONO};letter-spacing:.14em;color:${C.cyan}">${esc(k)}</div><div style="font:700 15px ${HEAD};color:${color || '#ffffff'};margin-top:3px">${esc(v)}</div></td>`;
  const kick = d.kickoff && d.kickoff.at ? d.kickoff.at : d.kickoff && d.kickoff.url ? 'Book it below' : 'We will text you';
  const cells = started
    ? cell('CLOCK STARTED', shortDate(L.startedOn)) + cell('KICKOFF', kick) + cell('LAUNCH DAY', L.target ? `By ${shortDate(L.target)}` : 'TBD', C.peach)
    : cell('KICKOFF', kick) + `<td width="66%" valign="top"><div style="font:700 9.5px ${MONO};letter-spacing:.14em;color:${C.cyan}">LAUNCH DAY</div><div style="font:600 13.5px ${FONT};color:#ffffff;margin-top:3px">Your countdown starts when we receive ${esc((L.waiting || []).join(', ') || 'the last piece')}.</div></td>`;
  const ticket = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border:1.5px dashed #38BDF8;border-radius:14px;background:${C.navy};background-image:linear-gradient(160deg,${C.navy2},${C.navy})"><tr><td style="padding:16px 18px;color:#ffffff">
<div style="font:700 10.5px ${MONO};letter-spacing:.2em;color:${C.cyan}">ADMIT ONE · LAUNCH DAY</div>
<div style="font:700 24px ${HEAD};margin:6px 0 2px;color:#ffffff">${esc(d.company)}</div>
${d.productLine ? `<div style="color:#B9CBE6;font-size:13px">${esc(d.productLine)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px dashed rgba(125,211,252,.4)"><tr><td style="padding-top:12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr></table>
</td></tr></table>`;
  const crew = (d.crew || []).filter(c => c && c.name).slice(0, 4);
  const crewHtml = crew.length ? `<div style="font:700 15px ${HEAD};margin:16px 0 6px">Meet your build crew</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${crew.map((c, i) => { const p = absUrl(d.base, c.photo); return `<td width="${Math.floor(100 / crew.length)}%" valign="top" style="padding:${i ? '0 0 0 8px' : '0'}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px"><tr>
${p ? `<td width="54" style="padding:10px 0 10px 10px"><img src="${esc(p)}" alt="" width="44" height="44" style="width:44px;height:44px;border-radius:22px;display:block;border:0"></td>` : ''}
<td style="padding:10px;font-size:12.5px;color:${C.mute}"><div style="font:700 14px ${HEAD};color:${C.ink}">${esc(firstName(c.name))}</div>${esc(c.role || '')}</td></tr></table></td>`; }).join('')}
</tr></table>` : '';
  const body = ticket + crewHtml
    + `<div style="font:700 15px ${HEAD};margin:16px 0 6px">What happens now</div>`
    + steps([['1', 'Kickoff call', '30 min, we confirm the plan'], ['2', 'We build', "You don't lift a finger"], ['3', 'Launch Day', 'We go live together']])
    + (d.kickoff && d.kickoff.url && !d.kickoff.at ? button(d.kickoff.url, 'Book my kickoff call →') : '')
    + (d.ics && started ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0"><tr><td style="background:#EEF4FF;color:#1F3A6E;border-radius:12px;padding:12px 14px;font-size:13.5px;font-weight:600">📅 Launch Day is attached. Open <b>launch-day.ics</b> to add it to your calendar.</td></tr></table>` : '');
  const subject = `🎟️ Your Launch Day ticket, ${d.company}`;
  const html = shell({ preheader: started ? `Onboarding done. Your ${L.launchDays || ''}${L.launchDays ? '-day ' : ''}countdown starts now.` : 'Onboarding done. Here is your ticket.',
    logo: d.logo, agency: d.agency, kicker: 'Onboarding complete', h1a: "That's everything we need.",
    h1b: started ? 'The countdown starts now.' : 'Your ticket is ready.',
    sub: `This is the start of the real growth of ${d.company}. Here's your ticket.`, body,
    sign: signature(d.base, d.contact, d.agency, 'Pumped about this one. See you at kickoff.') });
  const text = [`Your Launch Day ticket, ${d.company}.`, '', "That's everything we need.",
    started ? `Clock started: ${shortDate(L.startedOn)}` : `Your countdown starts when we receive ${(L.waiting || []).join(', ') || 'the last piece'}.`,
    `Kickoff: ${kick}${d.kickoff && d.kickoff.url && !d.kickoff.at ? ' (' + d.kickoff.url + ')' : ''}`,
    started && L.target ? `Launch Day: by ${shortDate(L.target)}` : '',
    crew.length ? '' : null, crew.length ? 'Your build crew: ' + crew.map(c => `${firstName(c.name)}${c.role ? ' (' + c.role + ')' : ''}`).join(', ') : null,
    '', 'What happens now: kickoff call, we build, Launch Day.', d.ics && started ? 'Launch Day is attached as launch-day.ics.' : '',
    '', d.contact && d.contact.name ? `${d.contact.name} · ${d.agency}` : d.agency].filter(x => x !== null).join('\n');
  return { subject, html, text };
}

/* ------------------------------------------------------- the calendar file */
const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** An all-day "Launch Day" event, or null when there is no date to promise. */
export function launchIcs({ company, agency, target, uid, now }) {
  if (!DAY.test(String(target || ''))) return null;
  const d = target.replace(/-/g, '');
  const next = addCalendarDays(target, 1).replace(/-/g, '');
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${icsText(agency)}//Launch Day//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${icsText(uid)}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${icsText(`${company} Launch Day`)}`, `DESCRIPTION:${icsText(`Launch Day with ${agency}. We go live together.`)}`,
    'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR'];
  return lines.join('\r\n') + '\r\n';
}

/* --------------------------------- 4. "Your site is ready for review" (B-2) */
/* The two review emails are SENT by api/review-admin.js ("Send for review")
   and api/portal-review.js (a submitted round), each through
   api/_review.js, addressed by portal login id: the address is that login's own. */
const roundWord = (round, included) => (round && (round.extra || (Number.isInteger(included) && round.number > included))
  ? `Change round ${round.number} (quoted)` : `Round ${round ? round.number : 1}${Number.isInteger(included) ? ` of ${included}` : ''}`);

/** d: {agency, logo, base, contact, first, company, link, round:{number, extra}, included} */
export function reviewReady(d) {
  const label = roundWord(d.round, d.included);
  const body = steps([['1', 'Open your site', 'In your portal'], ['2', 'Tap and note', 'Right on the page'], ['3', 'Submit the round', 'We get to work']])
    + `<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>`
    + ticketRows([['Review', label], ['Love it as it is?', 'Approve it in the portal']])
    + button(d.link, 'Review my site →', 'Your notes save as you go');
  const subject = `👀 Your site is ready for review${d.first ? ', ' + d.first : ''}`;
  const html = shell({ preheader: `${d.company || 'Your site'} is ready for you to look over. Tap anything you want changed and leave a note.`, logo: d.logo, agency: d.agency,
    kicker: `${label}${d.company ? ' · ' + d.company : ''}`, h1a: 'Your site is ready.', h1b: 'Tell us what to change.',
    sub: 'Open it in your portal, tap anything you want changed, and leave a note right on it. When you are done, submit the round.', body,
    sign: signature(d.base, d.contact, d.agency, d.contact && d.contact.phone ? `Questions? Text me at ${d.contact.phone}.` : 'Questions? Just reply to this email.') });
  const text = [`Your site is ready for review${d.first ? ', ' + d.first : ''}.`, '', `${label}.`,
    'Open it in your portal, tap anything you want changed and leave a note right on it. When you are done, submit the round.', '',
    'Review my site:', d.link, '', 'Love it as it is? Approve it in the portal.', '', d.contact && d.contact.name ? `${d.contact.name} · ${d.agency}` : d.agency].join('\n');
  return { subject, html, text };
}

/* --------------------------------------- 5. "We got your notes" (B-2) */
/** d: {agency, logo, base, contact, first, company, link, round:{number, extra}, included, count} */
export function notesReceived(d) {
  const label = roundWord(d.round, d.included);
  const n = Number(d.count) || 0;
  const left = d.round && !d.round.extra && Number.isInteger(d.included) ? Math.max(0, d.included - d.round.number) : null;
  const rows = [['Notes received', `${n} change${n === 1 ? '' : 's'}`], ['Round', label]];
  if (left !== null) rows.push(['Included rounds left', String(left)]);
  const body = ticketRows(rows)
    + steps([['✓', 'Notes in', 'Done. Thank you.'], ['2', 'We revise', 'Change by change'], ['3', 'Your next look', 'We email you']])
    + `<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>`
    + button(d.link, 'See my notes →', 'Track each one as we work through them');
  const subject = `✅ We got your notes${d.first ? ', ' + d.first : ''}`;
  const html = shell({ preheader: `${n} change${n === 1 ? '' : 's'} received. We are on it.`, logo: d.logo, agency: d.agency,
    kicker: `${label} submitted${d.company ? ' · ' + d.company : ''}`, h1a: 'We got your notes.', h1b: "We're on it.",
    sub: 'Every note is logged against the exact spot you marked. You can watch each one get done in your portal.', body,
    sign: signature(d.base, d.contact, d.agency, 'We will email you when the next version is ready.') });
  const text = [`We got your notes${d.first ? ', ' + d.first : ''}. We're on it.`, '', ...rows.map(r => `${r[0]}: ${r[1]}`), '',
    'See your notes:', d.link, '', 'We will email you when the next version is ready.', '', d.contact && d.contact.name ? `${d.contact.name} · ${d.agency}` : d.agency].join('\n');
  return { subject, html, text };
}
