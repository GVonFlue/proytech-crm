/* THE CLIENT PORTAL (B-1): sign in with a link, see your build.

   Its own small bundle (portal.html), like the proposal and onboarding pages:
   no CRM code, no CRM screens. It holds a Supabase session for a CLIENT login
   only, under its own storage key, so a CRM session in the same browser is
   never read or replaced.

   What it can read is decided in Postgres, not here: portal_home() and
   portal_documents() find the client's lead from the session alone and
   return named fields only (PORTAL-MIGRATION.sql). This page never sends a
   lead id, a proposal id or an email to read anything: there is nothing in it
   to change to see someone else's. */
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../lib/brand';
import ProposalDoc, { PROPOSAL_CSS } from '../ProposalDoc';
import { SECTIONS, fieldLabel, fieldOptions, ctxOf } from '../lib/onboarding';
import { PORTAL_CSS } from './theme';
import { greetingFor, homeModel, CLIENT_STAGES } from './view';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = s => { if (!s) return ''; const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const usd = v => '$' + (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: Math.round((Number(v) || 0) * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const tel = s => String(s || '').replace(/[^\d+]/g, '');

/* exported so tests mount the page with a fake client */
export function makeClient() {
  return createClient(SUPABASE_URL || 'https://invalid.local', SUPABASE_KEY || 'missing', {
    auth: { storageKey: 'portal-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });
}

function SignIn({ note }) {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const send = async e => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/portal-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? { ok: true, t: j.message } : { ok: false, t: j.error || 'Try again in a few minutes.' });
    } catch { setMsg({ ok: false, t: 'Could not reach us. Check your connection and try again.' }); }
    setBusy(false);
  };
  return (<form className="signin" onSubmit={send}>
    <span className="kick">Client portal</span>
    <h1>Sign in with your email</h1>
    <p>We'll email you a link that signs you in. No password, ever.</p>
    {note && <div className="err-msg">{note}</div>}
    <input type="email" required autoComplete="email" aria-label="Your email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
    {msg ? <div className={msg.ok ? 'ok-msg' : 'err-msg'}>{msg.t}</div>
      : <button className="btn" disabled={busy || !email}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>}
  </form>);
}

function Home({ m, now }) {
  const c = m.clock;
  const idx = CLIENT_STAGES.findIndex(s => s[0] === m.stage);
  const pct = c.started && c.launchDays ? Math.min(100, Math.round(((c.day || 0) / c.launchDays) * 100)) : 0;
  const next = m.items.find(i => !i.done);
  return (<>
    <div className="hero">
      <div className="welcome">
        <span className="kick">{m.packageLine ? `Your ${m.packageLine} build` : 'Your build'}</span>
        <h1>{greetingFor(now.getHours())}, {m.firstName}.<br /><em>{m.company} {m.stageLine}.</em></h1>
        <p>{m.stage === 'intake' ? 'Here is exactly what happens next, and what we still need from you.' : 'Here is exactly where things stand.'}</p>
        <div className="stages" role="list">{CLIENT_STAGES.map(([k, label], i) => (
          <div key={k} role="listitem" className={'stg' + (i < idx ? ' done' : i === idx ? ' now' : '')}>
            <b>{i < idx ? '✓ ' : i === idx ? '● ' : ''}{label}</b>{i < idx ? 'Done' : i === idx ? 'In progress' : k === 'launch' && c.target ? `By ${fmt(c.target)}` : ''}</div>))}</div>
        {(m.stage === 'build' || m.stage === 'review') && c.started && <div className="big">
          <div className="dring" style={{ background: `conic-gradient(var(--hot) 0 ${pct}%, #E6ECF7 ${pct}% 100%)` }}><b>{c.day}<small>of {c.launchDays || '—'} days</small></b></div>
          <div className="t"><b>{c.paused ? 'Paused: waiting on your feedback' : c.tone === 'late' ? 'Final stretch to Launch Day' : 'On track for Launch Day'}</b>
            <span>{next ? <>Next: <strong style={{ color: 'var(--ink)' }}>{next.label}</strong>{next.due ? `, ${fmt(next.due)}` : ''}. </> : null}{m.waiting.length ? `Waiting on you: ${m.waiting.join(', ')}.` : 'Nothing needed from you right now.'}</span></div>
        </div>}
        {m.stage === 'intake' && !c.started && <div className="big"><div className="t"><b>Your {c.launchDays || ''}{c.launchDays ? '-day ' : ''}clock starts when we receive:</b><span>{m.waiting.join(', ') || 'everything is in. We are starting.'}</span></div></div>}
      </div>
      <div className="ticket">
        <div className="adm">ADMIT ONE · LAUNCH DAY</div>
        <h2>{m.company}</h2>
        <div className="sub">{m.packageLine}</div>
        <div className="row">
          <div><span>Clock started</span><b>{c.started ? fmt(c.startedOn) : 'Not yet'}</b></div>
          <div><span>Today</span><b>{c.started ? `Day ${c.day}` : fmt(iso(now))}</b></div>
          <div><span>Launch</span><b className="o">{c.target ? `By ${fmt(c.target)}` : '—'}</b></div>
        </div>
      </div>
    </div>
    <div className="cols">
      <div>
        <div className="card tl"><div className="h3"><h3>Your road to Launch Day</h3><span>Updated live</span></div>
          <ul>{m.items.map(i => (<li key={i.id} className={i.done ? 'ok' : i === next ? 'nx' : ''}><i aria-hidden="true" />
            <span>{i.label}<span className="sr" style={{ position: 'absolute', left: -9999 }}>{i.done ? ' (done)' : ''}</span></span>
            <em>{i.done ? fmt(i.done) : i.due ? (i === next ? `Due ${fmt(i.due)}` : `By ${fmt(i.due)}`) : ''}</em></li>))}</ul></div>
      </div>
      <div>
        <div className="card need"><div className="h3"><h3>Waiting on you</h3>{m.waiting.length ? <span>{m.waiting.length} to go</span> : <span className="allclear">All clear ✓</span>}</div>
          {m.waiting.length ? <ul>{m.waiting.map(w => <li key={w}><i aria-hidden="true" /><span>{w[0].toUpperCase() + w.slice(1)}</span><em /></li>)}</ul>
            : <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0 }}>Nothing needed right now. Enjoy it, we've got the build.</p>}</div>
        {m.billing && <div className="card bill"><div className="h3"><h3>Billing</h3></div>
          <div className="r"><span>Deposit{m.billing.depositPct ? ` (${m.billing.depositPct}%)` : ''}</span>{m.billing.paid ? <span className="paid">✓ {usd(m.billing.deposit)} paid</span> : <b>{usd(m.billing.deposit)} due</b>}</div>
          <div className="r"><span>Balance, due at launch</span><b>{usd(m.billing.balance)}</b></div>
          {m.billing.monthly > 0 && <div className="r"><span>Monthly, starts Launch Day</span><b>{usd(m.billing.monthly)}/mo</b></div>}</div>}
        {m.contacts.length > 0 && <div className="card"><div className="h3"><h3>Your crew</h3></div><div className="crew">{m.contacts.map(p => (
          <div className="mem" key={p.name}>{p.photo ? <img src={p.photo} alt="" /> : <span className="ini" aria-hidden="true">{String(p.name || '?')[0]}</span>}
            <b>{String(p.name || '').split(' ')[0]}</b>{p.role && <span>{p.role}</span>}
            <div className="act">{p.phone && <a href={`tel:${tel(p.phone)}`}>Call</a>}{p.phone && <a href={`sms:${tel(p.phone)}`}>Text</a>}{p.email && <a href={`mailto:${p.email}`}>Email</a>}</div></div>))}</div></div>}
      </div>
    </div>
  </>);
}

function Answers({ onb }) {
  if (!onb || !onb.answers) return <p className="terms">No onboarding answers yet.</p>;
  const ctx = ctxOf({ products: onb.products, industry: onb.industry }, onb.answers, null);
  /* a choice is shown in the words the client picked it by, not its stored value */
  const word = (f, v) => { const o = (fieldOptions(f, ctx, null) || []).find(x => x && x.v === v); return o ? o.l : v; };
  const show = (f, v) => (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? Object.values(x).filter(Boolean).join(': ') : word(f, x))).join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(word(f, v)));
  const rows = SECTIONS.map(s => ({ s, fields: s.fields.filter(f => f.type !== 'file' && f.type !== 'note' && f.type !== 'access' && onb.answers[f.id] !== undefined && onb.answers[f.id] !== '' && onb.answers[f.id] !== null) })).filter(x => x.fields.length);
  return (<dl className="ans">{rows.map(({ s, fields }) => (<React.Fragment key={s.id}>
    <h4>{s.title}</h4>
    {fields.map(f => <React.Fragment key={f.id}><dt>{fieldLabel(f, ctx)}</dt><dd>{show(f, onb.answers[f.id])}</dd></React.Fragment>)}
  </React.Fragment>))}</dl>);
}

function Documents({ docs }) {
  const [i, setI] = useState(0);
  if (!docs) return <div className="empty">Loading…</div>;
  const props = docs.proposals || [];
  const p = props[i];
  return (<div className="docs">
    <div className="card"><div className="h3"><h3>Your proposal</h3><span>{p ? `Accepted ${fmt(p.accepted_at)} by ${p.accepted_name}` : ''}</span></div>
      {props.length > 1 && <div className="pick">{props.map((x, j) => <button key={j} className={j === i ? 'on' : ''} onClick={() => setI(j)}>Accepted {fmt(x.accepted_at)}</button>)}</div>}
      {p ? <>
        {p.terms_version && <p className="terms">You agreed to our <a href={p.terms_url} target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href={p.privacy_url} target="_blank" rel="noopener noreferrer">Privacy Policy</a>, version {p.terms_version}.</p>}
        <div style={{ marginTop: 14 }}><ProposalDoc body={p.body} acceptSlot={<div className="ok-msg">Accepted by <b>{p.accepted_name}</b> on {fmt(p.accepted_at)}.</div>} /></div>
      </> : <p className="terms">No accepted proposal yet.</p>}</div>
    <div className="card"><div className="h3"><h3>Your onboarding answers</h3><span>{docs.onboarding && docs.onboarding.submitted_at ? `Submitted ${fmt(docs.onboarding.submitted_at)}` : 'Read only'}</span></div>
      <Answers onb={docs.onboarding} /></div>
  </div>);
}

export function Portal({ client, now = new Date() }) {
  const [session, setSession] = useState(undefined);
  const [home, setHome] = useState(undefined);
  const [docs, setDocs] = useState(null);
  const [tab, setTab] = useState('home');
  const [note, setNote] = useState('');
  useEffect(() => {
    /* an expired or used link comes back with an error in the fragment */
    const h = typeof window !== 'undefined' ? window.location.hash : '';
    if (/error_description=/.test(h)) setNote('That sign-in link has expired or was already used. Ask for a new one below.');
    client.auth.getSession().then(({ data }) => setSession((data && data.session) || null));
    const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data && data.subscription && data.subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    if (!session) { setHome(session === null ? null : undefined); return; }
    let alive = true;
    client.rpc('portal_touch').then(() => {}, () => {});
    client.rpc('portal_home').then(({ data, error }) => { if (alive) setHome(error ? false : data || false); });
    return () => { alive = false; };
  }, [session, client]);
  useEffect(() => {
    if (tab !== 'documents' || docs || !session) return;
    client.rpc('portal_documents').then(({ data }) => setDocs(data || { proposals: [], onboarding: null }));
  }, [tab, docs, session, client]);
  const m = useMemo(() => (home ? homeModel(home, iso(now)) : null), [home, now]);
  const signOut = async () => { await client.auth.signOut(); setHome(null); setDocs(null); };

  if (session === undefined || (session && home === undefined)) return (<><style>{PORTAL_CSS}</style><div className="empty">Loading…</div></>);
  if (!session) return (<><style>{PORTAL_CSS}</style><SignIn note={note} /></>);
  if (home === false || !m) return (<><style>{PORTAL_CSS}</style><div className="empty"><h2>This sign-in isn't connected to a client portal.</h2>
    <p>If you think it should be, reply to any email from us.</p><button className="pt-me" onClick={signOut}>Sign out</button></div></>);
  return (<>
    <style>{PORTAL_CSS + PROPOSAL_CSS}</style>
    <div className="pt-top"><div className="pt-brand">{home.config && home.config.company_name ? home.config.company_name : 'Client portal'}</div>
      <div className="r"><span className="hide">{m.company} · Client Portal</span><button className="pt-me" onClick={signOut} title="Sign out">{m.firstName || 'You'} · Sign out</button></div></div>
    <nav className="pt-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'home'} className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>Home</button>
      <button role="tab" aria-selected={tab === 'documents'} className={tab === 'documents' ? 'on' : ''} onClick={() => setTab('documents')}>Documents</button>
    </nav>
    <div className="pt-wrap">{tab === 'home' ? <Home m={m} now={now} /> : <Documents docs={docs} />}</div>
  </>);
}

if (typeof document !== 'undefined' && document.getElementById('root') && !globalThis.__NO_MOUNT__) {
  createRoot(document.getElementById('root')).render(<Portal client={makeClient()} />);
}
