// Creates the sign-in for a new team member. OWNER ONLY.
//
// It used to be done from the browser through Supabase's public sign-up
// endpoint (/auth/v1/signup) with the anon key. That only works while
// "Allow new users to sign up" is ON in Supabase, and with it on, ANYONE can
// make an account against the project's public URL. Signups are now OFF
// (AUTH-LISTED-2026-10), so the login is made here, with the service key,
// through the admin API: it works with signups off, marks the email as
// confirmed (no "Confirm email" switch to remember), and never touches the
// owner's own browser session.
//
// It creates the LOGIN only. The crm_users row (name, role, pools) is still
// written by the owner's browser through saveUser, under the owner-only RLS
// policy on crm_users, exactly as before. A login with no crm_users row gets
// nothing: no lead, no setting, no guarded route.
import { guard, sweep } from './_guard.js';
import { SUPA_URL, SUPA_KEY } from './_env.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'team-login', perIp: 10, windowMin: 10, perDay: 50,
    maxChars: 600, requireOwner: true,
  });
  if (!gate.ok) return;
  sweep();

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!EMAIL.test(email) || email.length > 200) { res.status(400).json({ ok: false, error: 'A real email address is required: that is their login.' }); return; }
  if (password.length < 8 || password.length > 200) { res.status(400).json({ ok: false, error: 'The temporary password must be at least 8 characters.' }); return; }
  if (!SUPA_URL || !SUPA_KEY) { res.status(500).json({ ok: false, error: 'The server is not connected to Supabase.' }); return; }

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(j.msg || j.message || j.error_description || j.error || '');
      const taken = r.status === 422 || /already/i.test(msg);
      res.status(taken ? 409 : 502).json({ ok: false, error: taken ? `${email} already has a login. Add their team row instead, or send them a password reset.` : 'Supabase would not create that login.' });
      if (!taken) console.error('[team-login] admin create failed:', r.status, msg.slice(0, 200));
      return;
    }
    const id = j.id || (j.user && j.user.id) || null;
    if (!id) { res.status(502).json({ ok: false, error: 'Supabase created the login but returned no id.' }); return; }
    res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('[team-login]', String((e && e.message) || e).slice(0, 200));
    res.status(502).json({ ok: false, error: 'Could not reach Supabase.' });
  }
}
