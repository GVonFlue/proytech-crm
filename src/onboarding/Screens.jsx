/* The portal's screens other than a section: the top bar, the dashboard, the
   review, and the launch ticket after submit. Pure presentation over the
   state main.jsx holds; every number comes from lib/onboarding, so the
   dashboard, the review and the CRM cannot disagree about it. */
import React from 'react';
import {
  sectionTitle, sectionIcon, sectionBlurb, visibleSections, shownFields, fieldLabel, answerText, longDate,
} from '../lib/onboarding';

const A = v => (Array.isArray(v) ? v : []);
const first = s => String(s || '').trim().split(/\s+/)[0] || '';
const telOf = c => String((c && c.phone) || '').replace(/[^\d+]/g, '');
export const helpContact = data => A(data.contacts).find(c => c.phone) || A(data.contacts).find(c => c.email) || null;

export function TopBar({ data, business, save, onHome }) {
  const help = helpContact(data);
  const helpHref = help ? (help.phone ? `sms:${telOf(help)}` : `mailto:${help.email}`) : (data.agency.email ? `mailto:${data.agency.email}` : null);
  return (<header className="ob-top">
    <button type="button" className="brand" onClick={onHome} aria-label={`${data.agency.name || 'Home'}: back to your dashboard`}>
      {data.agency.logo ? <img src={data.agency.logo} alt={data.agency.name || ''} /> : (data.agency.name || 'Onboarding')}
    </button>
    <div className="r">
      <span className={'ob-save' + (save.state === 'saving' ? ' saving' : save.state === 'error' ? ' err' : '')} role="status" aria-live="polite">
        {save.state === 'saving' ? 'Saving…' : save.state === 'error' ? 'Not saved' : <>Saved<span className="long">{save.at ? ' just now' : ''}</span></>}
      </span>
      {business && <span className="ob-biz">{business}</span>}
      {helpHref && <a className="ob-help" href={helpHref}>Need help?</a>}
    </div>
  </header>);
}

export function Ticket({ data, business, launch, compact }) {
  const dep = data.checklist.depositSkipped ? 'Not needed' : data.checklist.depositAt ? 'Paid ✓' : 'Link coming';
  const days = data.launchDays;
  const kick = data.config.kickoffUrl;
  return (<div className="ob-ticket">
    {data.agency.mark && <img className="nuc" src={data.agency.mark} alt="" />}
    <div className="adm">ADMIT ONE · LAUNCH DAY</div>
    <h2>{business || 'Your launch'}</h2>
    <div className="sub">{data.productLine}</div>
    <div className="row">
      <div><span>Deposit</span><b>{dep}</b></div>
      <div><span>Kickoff</span><b>{kick ? <a href={kick} target="_blank" rel="noopener noreferrer">Pick a time</a> : 'We\'ll book it'}</b></div>
      <div><span>Launch</span><b className="o">{launch && launch.target ? longDate(launch.target).replace(/^\w+, /, '') : days ? `~${days} days` : '—'}</b></div>
    </div>
    {!compact && <div className="sub" style={{ marginTop: 12 }}>{days ? `Your ${days}-day clock starts the day you finish onboarding.` : 'Your launch clock starts the day you finish onboarding.'}</div>}
  </div>);
}

export function Crew({ contacts }) {
  const list = A(contacts);
  if (!list.length) return null;
  return (<div className="ob-card"><div className="ob-h3"><h3>Your build crew</h3></div>
    <div className="ob-crew">{list.map(c => (<div className="ob-mem" key={c.name}>
      {c.photo ? <img src={c.photo} alt="" /> : <span className="ini" aria-hidden="true">{first(c.name).slice(0, 1)}</span>}
      <b>{first(c.name)}</b>{c.role && <span>{c.role}</span>}
    </div>))}</div></div>);
}

export function HelpNote({ data }) {
  const h = helpContact(data);
  return (<div className="ob-note"><span aria-hidden="true">💬</span><span>Stuck on anything? {h && h.phone
    ? <><b>Text us at <a href={`sms:${telOf(h)}`}>{h.phone}</a></b> or reply to any of our emails.</>
    : <>Reply to any of our emails.</>} A real person answers.</span></div>);
}

export function NeedList({ items }) {
  const open = items.filter(x => !x.ok).length;
  return (<div className="ob-card ob-need"><div className="ob-h3" style={{ marginBottom: 6 }}><h3>What we still need</h3><span>{open ? `${open} left` : 'All set'}</span></div>
    <ul>{items.map(x => (<li key={x.key} className={x.ok ? 'ok' : ''}><i aria-hidden="true" /><span>{x.label}<span className="sr">{x.ok ? ' (done)' : ' (still needed)'}</span></span><em>{x.note}</em></li>))}</ul></div>);
}

export function Dashboard({ data, ctx, prog, need, business, onOpen }) {
  const name = first((data.answers || {})['biz.contact_name']);
  const pct = prog.total ? (prog.done / prog.total) * 100 : 0;
  const cur = prog.allDone ? null : visibleSections(ctx).find(s => s.id === prog.current);
  const totalMin = prog.sections.reduce((a, s) => a + s.minutes, 0);
  return (<main className="ob-wrap" id="main">
    {data.status === 'needs_info' && <div className="ob-banner" role="status"><b>We need a little more from you.</b> Your answers are open again. Check "What we still need", then submit when you're ready.</div>}
    <div className="ob-hero">
      <section className="ob-welcome" aria-labelledby="ob-hi">
        <span className="ob-kick">Your {data.productLine || ''} onboarding</span>
        <h1 id="ob-hi">Welcome to {data.agency.name || 'the team'}{name ? `, ${name}` : ''}.<br /><em>Let's build {business ? `${business}'s` : 'your'} system.</em></h1>
        <p>About {Math.max(5, Math.round(totalMin / 5) * 5)} minutes total. Everything saves as you go, so you can stop anytime and pick up right where you left off.</p>
        <div className="ob-prog">
          <div className="ob-ring" style={{ background: `conic-gradient(var(--o-elec) 0 ${pct}%, var(--o-track) ${pct}% 100%)` }} role="img" aria-label={`${prog.done} of ${prog.total} sections done`}><b>{prog.done}/{prog.total}</b></div>
          <div className="t"><b>{prog.done} of {prog.total} sections done</b><span>{prog.allDone ? 'Ready to review' : `About ${prog.minutesLeft} minute${prog.minutesLeft === 1 ? '' : 's'} left`}</span></div>
          <button type="button" className="ob-cta" onClick={() => onOpen(prog.allDone ? 'review' : prog.current)}>
            <span>{prog.allDone ? 'Review & submit' : `${prog.done ? 'Continue' : 'Start'}: ${sectionTitle(cur, ctx)}`}<small>{prog.allDone ? 'One last look, then launch' : prog.done ? 'Pick up where you left off' : 'The easy ones first'}</small></span><span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
      <Ticket data={data} business={business} launch={data.launch} />
    </div>
    <div className="ob-cols">
      <section aria-labelledby="ob-secs">
        <div className="ob-h3"><h3 id="ob-secs">Your sections</h3><span>Tap any section to jump in</span></div>
        <div className="ob-grid">
          {visibleSections(ctx).map(s => {
            const st = prog.sections.find(x => x.id === s.id) || {};
            const pill = { done: ['done', '✓ Done'], now: ['now', st.filled ? 'In progress' : 'Start here'], next: ['next', 'Up next'], later: ['later', 'Not started'] }[st.state] || ['later', 'Not started'];
            const left = st.state === 'now' && st.total ? Math.max(1, Math.round(s.minutes * (1 - st.filled / st.total))) : s.minutes;
            return (<button type="button" key={s.id} className={'ob-sec' + (st.state === 'done' ? ' done' : st.state === 'now' ? ' now' : '')}
              style={st.state === 'now' && st.total ? { '--pct': `${Math.round((st.filled / st.total) * 100)}%` } : undefined} onClick={() => onOpen(s.id)}>
              <span className="ic" aria-hidden="true">{sectionIcon(s, ctx)}</span>
              <span><h4>{sectionTitle(s, ctx)}</h4><p>{sectionBlurb(s, ctx)}</p>
                <span className="meta"><span className={'ob-pill ' + pill[0]}>{pill[1]}</span>{st.state !== 'done' && <span>{st.state === 'now' && st.filled ? `${left} min left` : `~${left} min`}</span>}</span></span>
            </button>);
          })}
          <button type="button" className="ob-sec" onClick={() => onOpen('review')}>
            <span className="ic" aria-hidden="true">🚀</span>
            <span><h4>Review & submit</h4><p>One last look, then your launch clock starts.</p>
              <span className="meta"><span className={'ob-pill ' + (prog.allDone ? 'now' : 'later')}>{prog.allDone ? 'Ready' : 'Last step'}</span></span></span>
          </button>
        </div>
      </section>
      <aside>
        <NeedList items={need} />
        <Crew contacts={data.contacts} />
        <HelpNote data={data} />
      </aside>
    </div>
  </main>);
}

export function Review({ data, ctx, cfg, answers, files, need, missing, onOpen, onSubmit, submitting, error }) {
  return (<main className="ob-wrap" id="main">
    <div className="ob-cols">
      <div className="ob-form">
        <span className="ob-kick">Last step · Review & submit</span>
        <h2>One last look.</h2>
        <p className="lead">Check anything you like, edit it if you need to, then submit. Skipped something optional? That's fine: it's on our list, not yours.</p>
        {visibleSections(ctx).map(s => {
          const rows = shownFields(s, ctx, answers).filter(f => f.type !== 'note').map(f => {
            if (f.type === 'file') { const n = A(files).filter(x => x.slot === f.slot); return n.length ? [fieldLabel(f, ctx), n.map(x => x.name).join(', ')] : null; }
            const t = answerText(f, answers[f.id], ctx, cfg); return t ? [fieldLabel(f, ctx), t] : null;
          }).filter(Boolean);
          return (<section className="ob-q ob-rev" key={s.id} aria-labelledby={'rv-' + s.id}>
            <h3 id={'rv-' + s.id}><span>{sectionIcon(s, ctx)} {sectionTitle(s, ctx)}</span><button type="button" className="ob-link" onClick={() => onOpen(s.id)}>Edit<span className="sr"> {sectionTitle(s, ctx)}</span></button></h3>
            {rows.length ? <dl>{rows.map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl> : <p style={{ color: 'var(--o-mute)', fontSize: 13.5, marginTop: 6 }}>Nothing here yet.</p>}
          </section>);
        })}
        {missing.length > 0 && <div className="ob-banner" role="alert" style={{ marginTop: 16 }}>
          <b>Needed before you can submit:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{missing.map(m => <li key={m.id}><button type="button" className="ob-link" onClick={() => onOpen(m.section, m.id)}>{m.label}</button> <span style={{ color: 'var(--o-mute)' }}>({m.sectionTitle})</span></li>)}</ul>
        </div>}
        {error && <div className="ob-err" role="alert">{error}</div>}
        <div className="ob-nav">
          <button type="button" className="ob-ghost" onClick={() => onOpen('dash')}>← Dashboard</button>
          <button type="button" className="ob-cta" style={{ margin: 0 }} disabled={missing.length > 0 || submitting} onClick={onSubmit}>{submitting ? 'Submitting…' : 'Submit and start my launch'} <span aria-hidden="true">🚀</span></button>
        </div>
      </div>
      <aside className="ob-side">
        <NeedList items={need} />
        <div className="ob-card"><h4>What happens next</h4><p className="why">We read everything the same day, set up your build, and {data.config.kickoffUrl ? 'you pick a kickoff time.' : 'reach out to book your kickoff.'} Your launch clock starts once your deposit and access are in.</p></div>
      </aside>
    </div>
  </main>);
}

export function Launched({ data, business, need }) {
  const L = data.launch || {};
  const name = first((data.answers || {})['biz.contact_name']);
  const days = data.launchDays;
  const wait = A(L.waiting).filter(w => w !== 'your onboarding');
  const list = wait.length > 1 ? wait.slice(0, -1).join(', ') + ' and ' + wait[wait.length - 1] : wait[0];
  return (<main className="ob-wrap" id="main"><div className="ob-launch">
    <div className="ob-ticket" style={{ padding: '28px 28px 30px' }}>
      {data.agency.mark && <img className="nuc" src={data.agency.mark} alt="" />}
      <div className="adm">ADMIT ONE · LAUNCH DAY · {business ? business.toUpperCase() : ''}</div>
      <h1 className="big">{L.started ? 'Your launch clock starts now.' : `You did it${name ? `, ${name}` : ''}.`}</h1>
      <div className="sub" style={{ fontSize: 15 }}>
        {L.started
          ? (L.target ? <>Target launch: <b style={{ color: 'var(--o-peach)' }}>{longDate(L.target)}</b>{days ? ` (${days} days).` : '.'}</> : 'We start building today.')
          : <>We'll start your {days ? `${days} days` : 'launch clock'} as soon as {list || 'everything is in'}.</>}
      </div>
      <div className="row">
        <div><span>Onboarding</span><b>Done ✓</b></div>
        <div><span>Deposit</span><b>{data.checklist.depositSkipped ? 'Not needed' : data.checklist.depositAt ? 'Paid ✓' : 'Waiting'}</b></div>
        <div><span>Kickoff</span><b>{data.config.kickoffUrl ? <a href={data.config.kickoffUrl} target="_blank" rel="noopener noreferrer">Pick a time →</a> : 'We\'ll book it'}</b></div>
      </div>
    </div>
    <div style={{ height: 18 }} />
    {need.some(x => !x.ok) && <NeedList items={need} />}
    <Crew contacts={data.contacts} />
    <HelpNote data={data} />
  </div></main>);
}
