import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send, Loader2, Cpu, Zap, X, Paperclip, Check, AlertTriangle,
  StickyNote, ListTodo, CalendarClock, AtSign, Trash2,
} from 'lucide-react';
import { BRAND, AI_NAME } from './lib/brand';
import {
  buildPayload, parseReply, validateActions, describeAction,
  visibleLeads, JARVIS_MAX_TURNS,
} from './lib/jarvis';

/* ============================================================================
   JARVIS — ask the CRM anything.
   ----------------------------------------------------------------------------
   The chat surface. All of the security-critical logic lives in
   src/lib/jarvis.js so it can be unit-tested without a browser; this file is
   presentation, plus the one thing that must be here: running a confirmed
   action through the app's OWN mutators.

   That last part matters. This component never writes to Supabase and never
   builds a lead object. It calls addActivity / upsertTask / updateLead, the
   same functions every other screen calls, so per ENGINEERING.md §3 every
   write still goes through commitLeads and cannot race.

   Styling is a self-contained <style> block scoped under .jv. Nothing here
   leaks into the rest of the CRM and nothing in the CRM restyles it.
   ========================================================================== */

const CSS = `
.jv{--arc:#4FD8FF;--arc2:#8BE9FF;--hot:#C1352B;--gold:#E0A22B;--plate:#12162E;--plate2:#0A0D1F;
  display:flex;flex-direction:column;height:calc(100vh - 168px);min-height:440px;
  border-radius:20px;overflow:hidden;position:relative;
  background:radial-gradient(1100px 460px at 50% -12%,rgba(79,216,255,.14),transparent 62%),linear-gradient(168deg,var(--plate) 0%,var(--plate2) 100%);
  border:1px solid rgba(79,216,255,.2);box-shadow:0 26px 70px -34px rgba(0,0,0,.85),inset 0 1px 0 rgba(139,233,255,.1)}
.jv *{box-sizing:border-box}
.jv-scan{position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.3;
  background:repeating-linear-gradient(0deg,rgba(79,216,255,.05) 0 1px,transparent 1px 3px)}
.jv>*:not(.jv-scan){position:relative;z-index:1}

.jv-top{display:flex;align-items:center;gap:13px;padding:15px 18px;
  border-bottom:1px solid rgba(79,216,255,.16);background:rgba(6,9,22,.5)}
.jv-arc{width:34px;height:34px;flex:none;border-radius:50%;position:relative;
  background:radial-gradient(circle,#EAFBFF 0%,var(--arc2) 26%,var(--arc) 46%,rgba(79,216,255,.12) 68%,transparent 74%);
  box-shadow:0 0 18px rgba(79,216,255,.75),0 0 40px rgba(79,216,255,.28)}
.jv-arc:before,.jv-arc:after{content:'';position:absolute;border-radius:50%;border:1px solid rgba(139,233,255,.6)}
.jv-arc:before{inset:6px}
.jv-arc:after{inset:11px;border-color:rgba(234,251,255,.9)}
.jv[data-busy="1"] .jv-arc{animation:jvspin 1.15s linear infinite}
@keyframes jvspin{to{transform:rotate(360deg)}}
.jv-name{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#EAF9FF;letter-spacing:.14em;text-transform:uppercase;line-height:1.15}
.jv-sub{font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;color:rgba(139,233,255,.62);letter-spacing:.2em;text-transform:uppercase;margin-top:2px}
.jv-meter{margin-left:auto;text-align:right;font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;color:rgba(139,233,255,.6);letter-spacing:.1em}
.jv-bar{width:96px;height:3px;border-radius:2px;background:rgba(79,216,255,.16);margin-top:5px;overflow:hidden}
.jv-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--arc),var(--arc2))}
.jv-bar.warn i{background:linear-gradient(90deg,var(--gold),#F2C55C)}
.jv-bar.over i{background:linear-gradient(90deg,var(--hot),#E4695E)}

.jv-feed{flex:1;overflow-y:auto;padding:20px 18px 8px;display:flex;flex-direction:column;gap:16px;scrollbar-width:thin}
.jv-feed::-webkit-scrollbar{width:7px}
.jv-feed::-webkit-scrollbar-thumb{background:rgba(79,216,255,.22);border-radius:4px}

.jv-hello{margin:auto 0;text-align:center;padding:16px 8px}
.jv-hello h3{font-family:'Space Grotesk',sans-serif;color:#EAF9FF;font-size:19px;margin:0 0 6px;font-weight:600}
.jv-hello p{color:rgba(200,229,242,.62);font-size:13px;margin:0 0 20px;line-height:1.6}
.jv-seeds{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:560px;margin:0 auto}
.jv-seed{background:rgba(79,216,255,.07);border:1px solid rgba(79,216,255,.24);color:#B9E9FA;
  border-radius:999px;padding:8px 15px;font-size:12.5px;cursor:pointer;font-family:inherit;transition:.15s;text-align:left}
.jv-seed:hover{background:rgba(79,216,255,.16);border-color:rgba(79,216,255,.5);color:#EAF9FF}

.jv-msg{display:flex;flex-direction:column;gap:5px;max-width:88%}
.jv-msg.me{align-self:flex-end;align-items:flex-end}
.jv-tag{font-family:'Space Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(139,233,255,.5)}
.jv-msg.me .jv-tag{color:rgba(224,162,43,.72)}
.jv-body{padding:12px 15px;border-radius:14px;font-size:14px;line-height:1.68;white-space:pre-wrap;word-break:break-word}
.jv-msg.them .jv-body{background:rgba(79,216,255,.07);border:1px solid rgba(79,216,255,.2);color:#DCF3FB;border-top-left-radius:4px}
.jv-msg.me .jv-body{background:rgba(224,162,43,.12);border:1px solid rgba(224,162,43,.3);color:#F6E7C8;border-top-right-radius:4px}
.jv-err .jv-body{background:rgba(193,53,43,.14);border-color:rgba(193,53,43,.44);color:#FFC9C2}

.jv-acts{display:flex;flex-direction:column;gap:7px;margin-top:9px;width:100%}
.jv-alab{font-family:'Space Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:rgba(224,162,43,.8)}
.jv-act{display:flex;align-items:center;gap:10px;background:rgba(224,162,43,.08);
  border:1px solid rgba(224,162,43,.32);border-radius:11px;padding:10px 12px}
.jv-act svg{flex:none;color:var(--gold)}
.jv-act span{flex:1;font-size:12.5px;color:#F1DFBB;line-height:1.45;word-break:break-word}
.jv-act button{border:0;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;flex:none}
.jv-run{background:var(--gold);color:#241B06}
.jv-run:hover{background:#F0B23C}
.jv-skip{background:transparent;color:rgba(241,223,187,.55)}
.jv-skip:hover{color:#F1DFBB}
.jv-act.done{border-color:rgba(63,185,120,.45);background:rgba(63,185,120,.1)}
.jv-act.done svg,.jv-act.done span{color:#A8E9C4}

.jv-foot{border-top:1px solid rgba(79,216,255,.16);background:rgba(6,9,22,.6);padding:12px 14px}
.jv-pins{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}
.jv-pin{display:inline-flex;align-items:center;gap:6px;background:rgba(79,216,255,.12);
  border:1px solid rgba(79,216,255,.34);border-radius:999px;padding:4px 6px 4px 11px;font-size:11.5px;color:#BDEAFA}
.jv-pin button{background:none;border:0;color:rgba(189,234,250,.6);cursor:pointer;display:flex;padding:1px}
.jv-pin button:hover{color:#fff}
.jv-row{display:flex;align-items:flex-end;gap:8px}
.jv-in{flex:1;background:rgba(79,216,255,.06);border:1px solid rgba(79,216,255,.26);border-radius:13px;
  padding:11px 13px;color:#EAF9FF;font-size:14px;font-family:inherit;resize:none;max-height:132px;line-height:1.5}
.jv-in:focus{outline:none;border-color:rgba(79,216,255,.62);box-shadow:0 0 0 3px rgba(79,216,255,.13)}
.jv-in::placeholder{color:rgba(139,233,255,.36)}
.jv-ico{width:40px;height:40px;flex:none;border-radius:11px;border:1px solid rgba(79,216,255,.26);
  background:rgba(79,216,255,.06);color:#8BE9FF;display:flex;align-items:center;justify-content:center;cursor:pointer}
.jv-ico:hover{background:rgba(79,216,255,.15)}
.jv-ico.on{background:rgba(224,162,43,.18);border-color:rgba(224,162,43,.5);color:var(--gold)}
.jv-send{width:40px;height:40px;flex:none;border-radius:11px;border:0;cursor:pointer;
  background:linear-gradient(150deg,var(--arc2),var(--arc));color:#04121A;display:flex;align-items:center;justify-content:center}
.jv-send:disabled{opacity:.35;cursor:default}
.jv-hint{font-family:'Space Mono',ui-monospace,monospace;font-size:9px;color:rgba(139,233,255,.4);
  letter-spacing:.1em;margin-top:8px;display:flex;gap:14px;flex-wrap:wrap}

.jv-picker{position:absolute;left:14px;right:14px;bottom:72px;max-height:260px;overflow-y:auto;z-index:5;
  background:#0B0F22;border:1px solid rgba(79,216,255,.34);border-radius:14px;padding:9px;box-shadow:0 20px 50px -18px rgba(0,0,0,.9)}
.jv-psearch{width:100%;background:rgba(79,216,255,.07);border:1px solid rgba(79,216,255,.24);border-radius:9px;
  padding:8px 11px;color:#EAF9FF;font-size:13px;font-family:inherit;margin-bottom:7px}
.jv-psearch:focus{outline:none;border-color:rgba(79,216,255,.6)}
.jv-prow{display:block;width:100%;text-align:left;background:none;border:0;color:#CDEBF8;padding:8px 10px;
  border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit}
.jv-prow:hover{background:rgba(79,216,255,.13)}
.jv-prow i{display:block;font-style:normal;font-size:11px;color:rgba(139,233,255,.5);margin-top:1px}
.jv-pempty{padding:12px;text-align:center;color:rgba(139,233,255,.45);font-size:12.5px}

@media(prefers-reduced-motion:reduce){.jv[data-busy="1"] .jv-arc{animation:none}}
@media(max-width:720px){.jv{height:calc(100vh - 210px)}.jv-msg{max-width:96%}.jv-meter{display:none}}
`;

const ICONS = { note: StickyNote, task: ListTodo, followup: CalendarClock, tag: AtSign };

const SEEDS = [
  'Who has gone quiet that I should call this week?',
  'Where are we with my newest client?',
  'What should I be doing next to move the pipeline?',
  'Which relationships have introduced me to the most people?',
];
const REP_SEEDS = [
  'Which of my leads has gone quiet?',
  'What should I work on first today?',
  'Summarise where my pipeline stands',
  'Draft a follow-up note for my newest lead',
];

export default function Jarvis({
  leads, stages, settings, tasks, me, myUid, rep, myPools, teamNames,
  money, addActivity, upsertTask, updateLead, openLead,
}) {
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [deep, setDeep] = useState(false);
  const [pins, setPins] = useState([]);
  const [picker, setPicker] = useState(false);
  const [pq, setPq] = useState('');
  const [spend, setSpend] = useState(null);
  const feed = useRef(null);
  const box = useRef(null);

  /* The rep's own leads, computed the same way RLS computes them. Everything
     downstream — the index, the detail, and the id whitelist that actions are
     validated against — reads from THIS array, so a rep can never end up with
     another rep's record in play. */
  const mine = useMemo(
    () => visibleLeads(leads, { rep, myUid, me, pools: myPools }),
    [leads, rep, myUid, me, myPools]
  );
  const visibleIds = useMemo(() => mine.map(l => String(l.id)), [mine]);
  const byId = useMemo(() => {
    const m = {};
    for (const l of mine) m[String(l.id)] = l;
    return m;
  }, [mine]);

  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [msgs, busy]);

  const grow = e => {
    setQ(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(132, el.scrollHeight) + 'px';
  };

  const ask = async text => {
    const question = String(text == null ? q : text).trim();
    if (!question || busy) return;
    setQ('');
    if (box.current) box.current.style.height = 'auto';
    setPicker(false);

    /* Only the plain text of earlier turns is replayed — never the data blocks.
       Resending 12k tokens of index per historical turn is how a chat feature
       quietly costs ten times what it should. */
    const history = msgs
      .filter(m => !m.error)
      .slice(-JARVIS_MAX_TURNS * 2)
      .map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));

    const next = [...msgs, { who: 'me', text: question, pins: [...pins] }];
    setMsgs(next);
    setBusy(true);

    try {
      const { payload, stats } = buildPayload({
        leads: mine, question, pinned: pins.map(p => p.id), history,
        rep, me, stages, money, tasks, teamNames,
      });

      let tok = '';
      try {
        const mod = await import('./lib/supabase');
        const sess = await mod.auth.session();
        tok = (sess && sess.access_token) || '';
      } catch { /* unauthenticated call will be refused by the guard */ }

      const r = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ payload, deep }),
      });
      const j = await r.json();

      if (!j.ok) {
        setMsgs(m => [...m, { who: 'them', text: j.error || 'Something went wrong.', error: true }]);
      } else {
        const parsed = parseReply(j.text);
        const { actions } = validateActions(parsed.actions, { visibleIds, rep, teamNames });
        setMsgs(m => [...m, {
          who: 'them',
          text: parsed.answer || 'I could not put an answer together for that one.',
          actions: actions.map(a => ({ ...a, state: 'open' })),
          stats,
        }]);
        if (j.spent !== null && j.spent !== undefined) setSpend({ spent: j.spent, budget: j.budget });
      }
    } catch {
      setMsgs(m => [...m, { who: 'them', text: 'Could not reach the assistant. Check your connection and try again.', error: true }]);
    }
    setBusy(false);
    setPins([]);
  };

  /* Confirmed actions run through the app's own mutators — never a direct
     write. If a mutator is missing (a client install without tasks, say) the
     action is refused rather than silently doing nothing. */
  const run = (mi, ai) => {
    const msg = msgs[mi];
    const a = msg && msg.actions && msg.actions[ai];
    if (!a || a.state !== 'open') return;
    const lead = byId[String(a.leadId)];
    try {
      if (a.kind === 'note') {
        if (!lead || !addActivity) throw new Error('no');
        addActivity(lead.id, 'Note', a.text, me);
      } else if (a.kind === 'task') {
        if (!upsertTask) throw new Error('no');
        upsertTask({
          id: 'jv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: a.title, notes: '', owner: a.owner || me, done: false,
          due: a.due || '', lead: lead ? (lead.name || lead.company) : '',
          leadId: lead ? lead.id : '', createdAt: new Date().toISOString(),
        });
      } else if (a.kind === 'followup') {
        if (!lead || !updateLead) throw new Error('no');
        updateLead(lead.id, { followUp: a.date });
      } else if (a.kind === 'tag') {
        if (!lead || !addActivity) throw new Error('no');
        addActivity(lead.id, 'Note', `@${a.who} ${a.text}`, me);
      }
      setMsgs(m => m.map((x, i) => i !== mi ? x
        : { ...x, actions: x.actions.map((y, k) => k === ai ? { ...y, state: 'done' } : y) }));
    } catch {
      setMsgs(m => m.map((x, i) => i !== mi ? x
        : { ...x, actions: x.actions.map((y, k) => k === ai ? { ...y, state: 'failed' } : y) }));
    }
  };

  const skip = (mi, ai) => setMsgs(m => m.map((x, i) => i !== mi ? x
    : { ...x, actions: x.actions.map((y, k) => k === ai ? { ...y, state: 'skipped' } : y) }));

  const pick = l => {
    if (!pins.some(p => p.id === l.id)) {
      setPins([...pins, { id: l.id, name: l.name || l.company || 'Unnamed' }]);
    }
    setPicker(false);
    setPq('');
  };

  const results = useMemo(() => {
    const s = pq.trim().toLowerCase();
    const pool = s
      ? mine.filter(l => `${l.name || ''} ${l.company || ''}`.toLowerCase().includes(s))
      : mine.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return pool.slice(0, 40);
  }, [mine, pq]);

  const pct = spend && spend.budget ? Math.min(100, (spend.spent / spend.budget) * 100) : 0;
  const barClass = pct >= 100 ? 'jv-bar over' : pct >= 75 ? 'jv-bar warn' : 'jv-bar';
  const seeds = rep ? REP_SEEDS : SEEDS;

  return (
    <>
      <style>{CSS}</style>
      <div className="jv" data-busy={busy ? '1' : '0'}>
        <div className="jv-scan" />

        <div className="jv-top">
          <div className="jv-arc" />
          <div>
            <div className="jv-name">{AI_NAME}</div>
            <div className="jv-sub">{busy ? 'Processing' : `${BRAND.name} · ${mine.length} records online`}</div>
          </div>
          {spend && (
            <div className="jv-meter">
              ${spend.spent.toFixed(2)} / ${spend.budget}
              <div className={barClass}><i style={{ width: pct + '%' }} /></div>
            </div>
          )}
        </div>

        <div className="jv-feed" ref={feed}>
          {!msgs.length && (
            <div className="jv-hello">
              <h3>At your service.</h3>
              <p>
                Ask me anything about {rep ? 'your leads' : 'the pipeline, a client, or where things stand'}.
                I can see every record you can{rep ? '' : ' — pin one with the clip if you want the full history'}.
              </p>
              <div className="jv-seeds">
                {seeds.map(s => (
                  <button key={s} className="jv-seed" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, mi) => (
            <div key={mi} className={'jv-msg ' + (m.who === 'me' ? 'me' : 'them') + (m.error ? ' jv-err' : '')}>
              <div className="jv-tag">
                {m.who === 'me' ? (me || 'You') : AI_NAME}
                {m.stats && m.stats.hydrated > 0 ? ` · read ${m.stats.hydrated} in full` : ''}
              </div>
              <div className="jv-body">{m.text}</div>

              {!!(m.actions && m.actions.length) && (
                <div className="jv-acts">
                  <div className="jv-alab">Suggested — nothing happens until you say so</div>
                  {m.actions.map((a, ai) => {
                    const Ico = ICONS[a.kind] || StickyNote;
                    const lead = byId[String(a.leadId)];
                    const label = describeAction(a, lead && (lead.name || lead.company));
                    if (a.state === 'skipped') return null;
                    return (
                      <div key={ai} className={'jv-act' + (a.state === 'done' ? ' done' : '')}>
                        {a.state === 'done' ? <Check size={15} /> : a.state === 'failed' ? <AlertTriangle size={15} /> : <Ico size={15} />}
                        <span>
                          {label}
                          {a.kind === 'note' || a.kind === 'tag' ? <><br />“{a.text}”</> : null}
                          {a.kind === 'followup' && a.why ? <><br />{a.why}</> : null}
                        </span>
                        {a.state === 'open' && (
                          <>
                            <button className="jv-run" onClick={() => run(mi, ai)}>Do it</button>
                            <button className="jv-skip" onClick={() => skip(mi, ai)}>Skip</button>
                          </>
                        )}
                        {a.state === 'done' && <span style={{ flex: 'none', fontSize: 11.5 }}>Done</span>}
                        {a.state === 'failed' && <span style={{ flex: 'none', fontSize: 11.5 }}>Couldn't</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="jv-msg them">
              <div className="jv-tag">{AI_NAME}</div>
              <div className="jv-body" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Loader2 size={14} className="spin" style={{ animation: 'jvspin 1s linear infinite' }} />
                Reading the CRM…
              </div>
            </div>
          )}
        </div>

        {picker && (
          <div className="jv-picker">
            <input
              className="jv-psearch" autoFocus placeholder="Search leads and relationships…"
              value={pq} onChange={e => setPq(e.target.value)}
            />
            {results.length ? results.map(l => (
              <button key={l.id} className="jv-prow" onClick={() => pick(l)}>
                {l.name || l.company || 'Unnamed'}
                <i>{[l.company, l.stage].filter(Boolean).join(' · ')}</i>
              </button>
            )) : <div className="jv-pempty">Nothing matches that.</div>}
          </div>
        )}

        <div className="jv-foot">
          {!!pins.length && (
            <div className="jv-pins">
              {pins.map(p => (
                <span className="jv-pin" key={p.id}>
                  {p.name}
                  <button onClick={() => setPins(pins.filter(x => x.id !== p.id))}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="jv-row">
            <button
              className={'jv-ico' + (picker ? ' on' : '')} title="Pin a lead to this question"
              onClick={() => setPicker(!picker)}
            ><Paperclip size={17} /></button>
            <button
              className={'jv-ico' + (deep ? ' on' : '')} title={deep ? 'Deep reasoning on — slower, costs more' : 'Deep reasoning off — fast and cheap'}
              onClick={() => setDeep(!deep)}
            >{deep ? <Zap size={17} /> : <Cpu size={17} />}</button>
            <textarea
              ref={box} className="jv-in" rows={1} value={q} onChange={grow}
              placeholder={`Ask ${AI_NAME} anything…`}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            />
            <button className="jv-send" disabled={busy || !q.trim()} onClick={() => ask()}>
              {busy ? <Loader2 size={17} style={{ animation: 'jvspin 1s linear infinite' }} /> : <Send size={17} />}
            </button>
          </div>
          <div className="jv-hint">
            <span>Enter to send · Shift+Enter for a new line</span>
            <span>{deep ? 'Deep reasoning' : 'Fast mode'}</span>
            {!!msgs.length && (
              <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => { setMsgs([]); setPins([]); }}>
                <Trash2 size={10} style={{ verticalAlign: -1 }} /> Clear
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
