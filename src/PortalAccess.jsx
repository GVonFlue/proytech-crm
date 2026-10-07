/* The Portal tab on a client's record: who can sign in to this client's
   portal, when they last did, and the owner's controls (invite another
   person, send a fresh link, remove). OWNER ONLY: App renders it only for an
   owner, every action goes through api/portal-admin.js (requireOwner), and
   client_users is owner-only in Postgres. */
import React, { useEffect, useState } from 'react';
import { KeyRound, Send, UserMinus, UserPlus } from 'lucide-react';

const when = s => { if (!s) return 'never'; const d = new Date(s); return isNaN(d) ? 'never' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

export default function PortalAccess({ lead, apiPost }) {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [f, setF] = useState({ email: '', name: '' });
  const call = async body => { const r = await apiPost('/api/portal-admin', body); const j = await r.json().catch(() => ({})); return { ok: r.ok && j.ok !== false, ...j }; };
  const load = async () => { const j = await call({ action: 'list', leadId: lead.id }); setUsers(j.ok ? j.users || [] : []); if (!j.ok) setMsg({ bad: true, t: j.error || 'Could not load portal access.' }); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id]);
  const act = async (key, body, ok) => { setBusy(key); setMsg(null); const j = await call(body); setBusy(''); setMsg(j.ok ? { t: ok } : { bad: true, t: j.error || 'That did not work.' }); if (j.ok) load(); };
  const who = lead.company || lead.name || 'this client';
  return (<div className="card pa-card">
    <div className="sec-title"><KeyRound size={15} />Client portal</div>
    <div className="ch-sub" style={{ marginTop: -8, marginBottom: 12 }}>The people who can sign in to {who}'s portal with an email link. They see this client only: its stage, launch date, what is waiting on them, the proposal they accepted and their onboarding answers. A login is made automatically when they accept a proposal.</div>
    {msg && <div className={'note' + (msg.bad ? ' bad' : '')} style={{ marginBottom: 12 }}>{msg.t}</div>}
    {users === null ? <div className="subcell">Loading…</div> : !users.length ? <div className="subcell" style={{ marginBottom: 12 }}>Nobody has portal access yet.</div>
      : <div className="pa-list">{users.map(u => (<div key={u.id} className={'pa-row' + (u.active ? '' : ' off')}>
        <div><b>{u.name || u.email}</b><span>{u.email}{u.active ? ` · last signed in ${when(u.last_login_at)}` : ` · removed ${when(u.removed_at)}`}</span></div>
        {u.active && <div className="pa-acts">
          <button className="btn btn-g btn-sm" disabled={!!busy} onClick={() => act('r' + u.id, { action: 'resend', id: u.id }, `A fresh sign-in link is on its way to ${u.email}.`)}><Send size={13} />Send a link</button>
          <button className="btn btn-g btn-sm pa-rm" disabled={!!busy} onClick={() => { if (window.confirm(`Remove ${u.email} from ${who}'s portal? They are signed out and can no longer see anything.`)) act('x' + u.id, { action: 'remove', id: u.id }, `${u.email} can no longer sign in.`); }}><UserMinus size={13} />Remove</button>
        </div>}
      </div>))}</div>}
    <div className="pa-add">
      <input type="email" placeholder="Email (e.g. their office manager)" aria-label="Email to invite" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <input placeholder="Their name" aria-label="Name to invite" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <button className="btn btn-p btn-sm" disabled={!!busy || !f.email.trim()} onClick={async () => { await act('invite', { action: 'invite', leadId: lead.id, email: f.email.trim(), name: f.name.trim() }, `Invited ${f.email.trim()}: they will get an email with a sign-in link.`); setF({ email: '', name: '' }); }}><UserPlus size={13} />Invite</button>
    </div>
    <style>{`.pa-list{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}.pa-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid #ECEEF5;border-radius:12px;padding:10px 12px}.pa-row b{display:block;font-size:13.5px}.pa-row span{font-size:12px;color:#56607A}.pa-row.off{opacity:.6}.pa-acts{display:flex;gap:6px}.pa-rm{color:#B42F2F}.pa-add{display:flex;gap:8px;flex-wrap:wrap}.pa-add input{flex:1 1 180px;min-width:0}.note.bad{background:#FDECEC;color:#9B2C2C}`}</style>
  </div>);
}
