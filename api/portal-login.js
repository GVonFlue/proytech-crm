// The client portal's sign-in: "email me a link". PUBLIC, by design: the
// person asking is not signed in yet.
//
// What keeps it from being a door:
//   - The reply is the SAME for every email, known or not, active or not:
//     nobody can use this page to learn who has a portal.
//   - A link is made only for an ACTIVE client_users row that is not a CRM
//     user (portal_login_target), and emailed to the address ON THAT ROW
//     (sendClientMail({ clientUserId })), never to anything in the request.
//   - Sign-ups are OFF: an unknown address never becomes a login.
//   - The link lands on the portal only (_portal.js portalUrl, fixed here).
//   - Rate-limited per IP and per day, before any lookup.
import { guard, sweep } from './_guard.js';
import { rpc, linkFor, signInEmail } from './_portal.js';
import { sendClientMail } from './_mail.js';

export const SAME_REPLY = 'If that email has a client portal, we just sent it a sign-in link. It works once and expires soon.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'portal-login', perIp: 5, windowMin: 15, perDay: 400, maxChars: 400 });
  if (!gate.ok) return;
  sweep();
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) { res.status(400).json({ ok: false, error: 'Type the email address we have for you.' }); return; }

  try {
    const t = await rpc('portal_login_target', { p_email: email });
    const row = t.ok && Array.isArray(t.data) ? t.data[0] : null;
    if (row && row.id) {
      const l = await linkFor(row.email, 'magiclink');
      if (l.ok && l.uid === row.id) {
        const sent = await sendClientMail({ clientUserId: row.id, ...signInEmail({ link: l.link }), tag: 'portal-login' });
        if (!sent.ok) console.error('[portal-login] not sent:', sent.reason);
      } else if (l.ok) {
        console.error('[portal-login] the link was made for a different login than the row; nothing sent');
      } else {
        console.error('[portal-login] link:', l.reason);
      }
    }
  } catch (e) {
    console.error('[portal-login]', String((e && e.message) || e).slice(0, 200));
  }
  res.status(200).json({ ok: true, message: SAME_REPLY });
}
