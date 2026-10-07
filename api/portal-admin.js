// The owner's controls for a client's portal logins. OWNER ONLY.
//
//   list   { leadId }                 who has access, and when they last signed in
//   invite { leadId, email, name }    add a person (an office manager, a partner)
//   resend { id }                     a fresh sign-in link to that person
//   remove { id }                     switch them off: active=false in
//                                     client_users (the portal reads nothing
//                                     for them from that moment) AND banned at
//                                     Supabase, so the login cannot refresh
//
// The email for an added person is the one the OWNER typed; every email that
// follows goes to the address on that person's client_users row.
// portal_link_client() refuses a CRM user and refuses to move a login that
// belongs to a different client. A rep never reaches any of this.
import { guard, sweep } from './_guard.js';
import { SUPA_URL, SUPA_KEY } from './_env.js';
import { rpc, linkFor, inviteEmail, signInEmail } from './_portal.js';
import { sendClientMail } from './_mail.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' });
const rest = (path, opts = {}) => fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H(), ...opts });

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'portal-admin', perIp: 60, windowMin: 10, perDay: 1000, maxChars: 800, requireOwner: true });
  if (!gate.ok) return;
  sweep();
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(b.action || '');
  const leadId = String(b.leadId || '').slice(0, 120);
  const id = String(b.id || '');
  const send = (code, body) => res.status(code).json(body);

  try {
    if (action === 'list') {
      if (!leadId) return send(400, { ok: false, error: 'Which client?' });
      const r = await rest(`client_users?lead_id=eq.${encodeURIComponent(leadId)}&select=id,email,name,active,invited_at,last_login_at,removed_at&order=invited_at.asc`);
      return send(200, { ok: true, users: r.ok ? await r.json() : [] });
    }
    if (action === 'invite') {
      const email = String(b.email || '').trim().toLowerCase();
      const name = String(b.name || '').trim().slice(0, 120);
      if (!leadId) return send(400, { ok: false, error: 'Which client?' });
      if (!EMAIL.test(email)) return send(400, { ok: false, error: 'Type a real email address.' });
      const l = await linkFor(email, 'invite');
      if (!l.ok) return send(502, { ok: false, error: 'Supabase would not make a login for that address.' });
      const linked = await rpc('portal_link_client', { p_uid: l.uid, p_lead_id: leadId, p_name: name, p_invited_by: (gate.user && gate.user.id) || null });
      const why = { crm_user: 'That address belongs to someone on your team. A team login cannot also be a client login.', other_client: 'That address already has a portal for a different client.', no_lead: 'That client was not found.', no_login: 'Supabase did not keep the login. Try again.' };
      if (!linked.ok || linked.data !== 'linked') return send(409, { ok: false, error: why[linked.data] || 'Could not add them.' });
      /* someone removed earlier and invited again: lift the ban remove set */
      await fetch(`${SUPA_URL}/auth/v1/admin/users/${l.uid}`, { method: 'PUT', headers: H(), body: JSON.stringify({ ban_duration: 'none' }) });
      const lr = await rest(`leads?id=eq.${encodeURIComponent(leadId)}&select=data`);
      const lead = lr.ok ? ((await lr.json())[0] || {}).data || {} : {};
      const sent = await sendClientMail({ clientUserId: l.uid, ...inviteEmail({ name, company: lead.company || lead.name, link: l.link }), tag: 'portal-invite' });
      return send(200, { ok: true, id: l.uid, emailed: !!sent.ok });
    }
    if (action === 'resend' || action === 'remove') {
      if (!UUID.test(id)) return send(400, { ok: false, error: 'Which person?' });
      const r = await rest(`client_users?id=eq.${id}&select=id,email,active`);
      const row = r.ok ? (await r.json())[0] : null;
      if (!row) return send(404, { ok: false, error: 'Not found.' });
      if (action === 'resend') {
        if (!row.active) return send(409, { ok: false, error: 'They were removed. Invite them again instead.' });
        const l = await linkFor(row.email, 'magiclink');
        if (!l.ok || l.uid !== row.id) return send(502, { ok: false, error: 'Could not make a link.' });
        const sent = await sendClientMail({ clientUserId: row.id, ...signInEmail({ link: l.link }), tag: 'portal-login' });
        return send(200, { ok: !!sent.ok });
      }
      await rest(`client_users?id=eq.${id}`, { method: 'PATCH', headers: { ...H(), prefer: 'return=minimal' }, body: JSON.stringify({ active: false, removed_at: new Date().toISOString() }) });
      /* the portal reads nothing for them from this moment (portal_lead needs
         active); the ban stops the login refreshing its session */
      const ban = await fetch(`${SUPA_URL}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: H(), body: JSON.stringify({ ban_duration: '876000h' }) });
      return send(200, { ok: true, banned: ban.ok });
    }
    return send(400, { ok: false, error: 'Unknown action.' });
  } catch (e) {
    console.error('[portal-admin]', String((e && e.message) || e).slice(0, 200));
    return send(502, { ok: false, error: 'Could not reach Supabase.' });
  }
}
