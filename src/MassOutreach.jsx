import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MessageSquare, Loader2, Check, AlertTriangle, ShieldAlert, Send, X, RotateCcw,
} from 'lucide-react';
import {
  pickable, excludedCounts, eligibility, planRun, cardOf, chunk, parseDrafts,
  validateDraft, smsHref, sentActivity, campaignKey, hasSubstance,
  OUTREACH_MAX, DRAFT_MAX_CHARS,
} from './lib/outreach';

/* ============================================================================
   MASS OUTREACH — one occasion, a hand-picked audience, one text each.
   ----------------------------------------------------------------------------
   Tick people, say what the message is about, press Generate, then work down
   the list pressing Text and confirming each one went.

   WHAT IS DELIBERATELY NOT HERE

   No audience proposal, no filters of its own, no tiering. The owner picks by
   hand, in the lead table they already use — this screen renders the REAL
   <Leads> component (passed in as a prop, because it lives inside App.jsx and
   cannot be imported from here without a cycle), so the search, the stage and
   priority filters, the columns and the checkbox behaviour are the ones that
   already existed rather than a second set that drifts from them.

   THE THREE RULES, AND WHERE EACH ONE ACTUALLY LIVES

     1. DNC and dead numbers are removed by `pickable()` BEFORE the table is
        handed the list, so they are not on screen to be ticked. Not unticked
        by default — absent. The count of what was removed is stated below the
        table, because a list quietly shorter than the book is a list nobody
        can trust.

     2. Memorial Day is not drafted for veterans and military families.
        `planRun()` splits them out and they arrive in the review list FLAGGED,
        with an empty box and the reason, for the owner to write themselves.

     3. Nothing is sent from here. A row produces an `sms:` link; Messages
        opens; a person presses send. There is no send path in this file, in
        api/outreach-draft.js, or anywhere else in the app.

   WHY THE SEND IS TWO CLICKS AND NOT ONE

   The browser cannot see Messages. Clicking Text hands off to another
   application and nothing comes back — no event, no callback, no way to know
   whether the message was sent, edited first, or abandoned. So the row asks.

   Logging on the click instead would be the exact failure CLAUDE.md names: a
   missing value that renders as a plausible one. The activity would read
   'Text' with a timestamp, on every screen, identically to a text that
   actually went — and the lead's clock would reset for a conversation that
   never happened. One extra click is the price of the log being true.

   WHY THE WHOLE RUN IS IN localStorage

   Drafts must survive a refresh: a hundred rows is more than one sitting, and
   clicking an sms: link may navigate the tab. app_settings — the no-migration
   home used by tasks, invoices and txns — is readable by ANY active crm_users
   row under `settings_read`, reps included, so a hundred drafted messages
   naming the whole book would be readable by a rep through the API with no UI
   at all. Drafts are the owner's private working copy until they are sent, so
   they stay in this browser. A proper owner-only table is a schema change and
   is deliberately not in this build.
   ========================================================================== */

const CSS = `
.mo{max-width:1180px}
.mo *{box-sizing:border-box}
.mo-step{background:#fff;border:1px solid #E2E5F2;border-radius:14px;margin-bottom:16px;overflow:hidden}
.mo-h{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #EEF0F8;background:#FBFCFF}
.mo-h .n{width:24px;height:24px;flex:none;border-radius:50%;background:#2B4DE0;color:#fff;display:flex;
  align-items:center;justify-content:center;font-size:12px;font-weight:700}
.mo-h b{font-size:14.5px;color:#181530}
.mo-h .sub{font-size:12.5px;color:#6b6785;margin-left:auto;text-align:right}
.mo-body{padding:16px 18px}
.mo-body.flush{padding:0}

.mo-note{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.55;color:#56527a;
  background:#F4F5FB;border:1px solid #E6E9F5;border-radius:9px;padding:10px 12px;margin:14px 18px}
.mo-note.warn{background:#FDFAEF;border-color:#E7D9A8;color:#6a5a2a}
.mo-note svg{flex:none;margin-top:1px}

.mo-occ{width:100%;min-height:78px;padding:11px 13px;border:1px solid #D6DDF8;border-radius:10px;
  font:14px/1.6 inherit;resize:vertical;color:#181530}
.mo-occ:focus{outline:0;border-color:#2B4DE0;box-shadow:0 0 0 3px rgba(43,77,224,.12)}
.mo-eg{font-size:12px;color:#8a86a3;margin-top:8px;line-height:1.6}

.mo-go{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
.mo-count{font-size:13px;color:#56527a}
.mo-count b{color:#181530;font-size:14px}

.mo-prog{height:4px;border-radius:3px;background:#E6E9F5;overflow:hidden;margin-top:12px}
.mo-prog i{display:block;height:100%;background:linear-gradient(90deg,#2B4DE0,#4E6DF0);transition:width .25s}

/* ------------------------------------------------------------- review rows */
.mo-row{display:grid;grid-template-columns:190px 1fr 132px;gap:14px;padding:14px 18px;
  border-bottom:1px solid #EEF0F8;align-items:start}
.mo-row:last-child{border-bottom:0}
.mo-row.done{background:#F7FBF8}
.mo-row.held{background:#FDFAEF}
.mo-row.bad{background:#FDF4F5}
.mo-who b{display:block;font-size:13.5px;color:#181530;line-height:1.35}
.mo-who .co{font-size:12px;color:#6b6785;margin-top:1px}
.mo-who .ph{font-size:12px;color:#56527a;margin-top:5px;font-family:ui-monospace,monospace}
.mo-who .src{font-size:11px;color:#8a86a3;margin-top:5px;font-style:italic;line-height:1.4}
.mo-msg textarea{width:100%;min-height:66px;padding:9px 11px;border:1px solid #D6DDF8;border-radius:8px;
  font:13.5px/1.6 inherit;resize:vertical;color:#181530;background:#fff}
.mo-msg textarea:focus{outline:0;border-color:#2B4DE0;box-shadow:0 0 0 3px rgba(43,77,224,.10)}
.mo-msg .len{font-size:11px;color:#8a86a3;margin-top:4px;font-family:ui-monospace,monospace}
.mo-msg .len.over{color:#C1352B;font-weight:600}
.mo-msg .why{font-size:12px;line-height:1.5;color:#6a5a2a;margin-bottom:7px}
.mo-msg .why.bad{color:#8a3b3b}
.mo-acts{display:flex;flex-direction:column;gap:6px}
.mo-b{border:0;border-radius:8px;padding:8px 10px;font-size:12.5px;font-weight:600;cursor:pointer;
  font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;width:100%}
.mo-b:disabled{opacity:.45;cursor:not-allowed}
.mo-b.p{background:#2B4DE0;color:#fff}
.mo-b.p:hover:not(:disabled){background:#2340c4}
.mo-b.g{background:#2E9E5B;color:#fff}
.mo-b.g:hover:not(:disabled){background:#268a4e}
.mo-b.q{background:#fff;color:#56527a;border:1px solid #D6DDF8}
.mo-b.q:hover:not(:disabled){background:#F4F5FB}
.mo-sent{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#2f6b45;font-weight:600;
  justify-content:center;padding:8px 0}
.mo-skip{font-size:11.5px;color:#8a86a3;text-align:center;padding:2px 0}
.mo-ask{font-size:11.5px;color:#6b6785;text-align:center;line-height:1.4;margin-bottom:2px}

.mo-tally{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:#56527a;
  padding:12px 18px;border-top:1px solid #EEF0F8;background:#FBFCFF}
.mo-tally b{color:#181530}
`;

const S = v => String(v == null ? '' : v);

/* One row of the review list. Its own component so that typing in one message
   does not re-render the other ninety-nine. */
function Row({ row, onEdit, onOpen, onLogged, onSkip, onReopen }) {
  const over = row.text.length > DRAFT_MAX_CHARS;
  const href = smsHref(row.phone, row.text);
  const cls = row.status === 'sent' ? ' done' : row.status === 'held' ? ' held'
    : row.status === 'refused' ? ' bad' : '';

  return (
    <div className={'mo-row' + cls}>
      <div className="mo-who">
        <b>{row.name || 'Unnamed'}</b>
        {row.company && <div className="co">{row.company}</div>}
        <div className="ph">{row.phone || 'no number'}</div>
        {/* What the drafter says it personalised from, shown beside the message
            so the claim can be checked against the record at a glance. "generic"
            is a fine answer and is shown as one — a plain warm note is not a
            failure, an invented detail is. */}
        {row.from && <div className="src">from: {row.from}</div>}
      </div>

      <div className="mo-msg">
        {row.status === 'held' && (
          <div className="why"><ShieldAlert size={12} style={{ verticalAlign: '-1px' }} /> {row.reason}</div>
        )}
        {row.status === 'refused' && (
          <div className="why bad"><AlertTriangle size={12} style={{ verticalAlign: '-1px' }} /> {row.reason}</div>
        )}
        <textarea
          value={row.text}
          placeholder={row.status === 'held' ? 'Write this one yourself…' : 'Nothing drafted — write it here…'}
          onChange={e => onEdit(row.id, e.target.value)}
          disabled={row.status === 'sent'}
        />
        <div className={'len' + (over ? ' over' : '')}>
          {row.text.length}/{DRAFT_MAX_CHARS}{over ? ' — too long for one text' : ''}
        </div>
      </div>

      <div className="mo-acts">
        {row.status === 'sent' ? (
          <>
            <div className="mo-sent"><Check size={14} />Logged</div>
            <button className="mo-b q" onClick={() => onReopen(row.id)}><RotateCcw size={12} />Undo</button>
          </>
        ) : row.status === 'skipped' ? (
          <>
            <div className="mo-skip">Skipped</div>
            <button className="mo-b q" onClick={() => onReopen(row.id)}><RotateCcw size={12} />Put back</button>
          </>
        ) : row.status === 'opened' ? (
          <>
            {/* THE HONEST BIT. Messages is a different application and tells the
                browser nothing, so the only way to know a text went is to ask
                the person who sent it. */}
            <div className="mo-ask">Did it send?</div>
            <button className="mo-b g" onClick={() => onLogged(row.id)}><Check size={13} />Yes, log it</button>
            <button className="mo-b q" onClick={() => onReopen(row.id)}>No, not yet</button>
          </>
        ) : (
          <>
            <a
              className={'mo-b p' + (href ? '' : ' disabled')}
              href={href || undefined}
              onClick={e => { if (!href) { e.preventDefault(); return; } onOpen(row.id); }}
              style={!href ? { opacity: .45, pointerEvents: 'none' } : undefined}
              title={href ? 'Opens Messages with this text loaded' : 'Needs a number and a message'}
            >
              <MessageSquare size={13} />Text
            </a>
            <button className="mo-b q" onClick={() => onSkip(row.id)}><X size={12} />Skip</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function MassOutreach({
  leads, settings, stages, open, me, updateLead, rep, myPools, users,
  addActivity, saveSettings, LeadTable,
}) {
  /* THE LIST THE TABLE IS GIVEN. Filtered before it is rendered, not after it
     is ticked — see rule 1 at the top of this file. */
  const all = useMemo(() => (leads || []), [leads]);
  const shown = useMemo(() => pickable(all), [all]);
  const gone = useMemo(() => excludedCounts(all), [all]);

  const [sel, setSel] = useState(() => new Set());
  const [occasion, setOccasion] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ done: 0, of: 0 });
  const [err, setErr] = useState('');
  const [rows, setRows] = useState([]);
  const [campaign, setCampaign] = useState('');
  const byId = useMemo(() => { const m = {}; all.forEach(l => { m[String(l.id)] = l; }); return m; }, [all]);

  /* ---- the run survives a refresh, and a navigation, and a closed laptop ---
     Written on every change rather than on unload: clicking an sms: link hands
     off to Messages and MAY navigate the tab depending on the browser, and a
     beforeunload handler is not reliably reached in that path. Cheap enough at
     a couple of hundred rows that there is no reason to be clever. */
  const LS = 'outreach:v1';
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.rows)) {
          setRows(o.rows);
          setOccasion(S(o.occasion));
          setCampaign(S(o.campaign));
        }
      }
    } catch { /* a private window, or cleared storage. Start empty. */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { window.localStorage.setItem(LS, JSON.stringify({ occasion, campaign, rows })); }
    catch { /* storage full or blocked — the run still works in this tab */ }
  }, [rows, occasion, campaign]);

  const picked = useMemo(() => shown.filter(l => sel.has(l.id)), [shown, sel]);
  /* Ticked but untextable. Counted rather than silently dropped, so the number
     that gets drafted is explained instead of just being smaller. */
  const noPhone = useMemo(() => picked.filter(l => !eligibility(l).ok), [picked]);
  const ready = picked.length - noPhone.length;
  const overMax = ready > OUTREACH_MAX;

  const setRow = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  /* ------------------------------------------------------------- generate */
  const generate = async () => {
    const occ = occasion.trim();
    if (!occ || !ready || busy) return;
    setErr('');
    setBusy(true);

    const key = campaignKey(occ, new Date());
    setCampaign(key);

    const eligible = picked.filter(l => eligibility(l).ok);
    const { draft, held } = planRun(eligible, occ);

    /* Held records land first and complete. They are never sent to the model —
       that is the whole point of holding them. */
    const base = held.map(h => ({
      id: String(h.lead.id), name: S(h.lead.name), company: S(h.lead.company),
      phone: S(h.lead.phone), status: 'held', text: '', from: '', reason: h.reason,
    }));
    /* Everyone else starts as pending so the list shows its full length
       immediately and fills in, rather than growing and moving under the
       cursor while chunks land. */
    const pending = draft.map(l => ({
      id: String(l.id), name: S(l.name), company: S(l.company),
      phone: S(l.phone), status: 'drafting', text: '', from: '', reason: '',
    }));
    setRows([...base, ...pending]);

    const chunks = chunk(draft);
    setProg({ done: 0, of: chunks.length });

    let failed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const people = chunks[i].map(cardOf);
      const askedIds = people.map(p => p.id);
      try {
        const tok = await tokenOf();
        const r = await fetch('/api/outreach-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
          body: JSON.stringify({ occasion: occ, from: me, people }),
        });
        const j = await r.json();
        if (!j.ok) {
          /* A capped budget or a refused request stops the run rather than
             quietly producing a shorter list. */
          setErr(j.error || 'The drafter refused that request.');
          setRows(rs => rs.map(x => x.status === 'drafting'
            ? { ...x, status: 'refused', reason: 'The run stopped before this one was drafted.' } : x));
          break;
        }
        const got = parseDrafts(j.text, askedIds);
        setRows(rs => rs.map(x => {
          if (!askedIds.includes(x.id)) return x;
          const d = got.get(x.id);
          if (!d) return { ...x, status: 'refused', reason: 'No draft came back for this one. Write it yourself.' };
          const v = validateDraft(d.text);
          if (!v.ok) {
            failed++;
            return { ...x, status: 'refused', text: v.text, from: d.from,
              reason: `The draft was thrown away because it ${v.problem}. Write it yourself.` };
          }
          return { ...x, status: 'ready', text: v.text, from: d.from, reason: '' };
        }));
      } catch {
        setRows(rs => rs.map(x => askedIds.includes(x.id)
          ? { ...x, status: 'refused', reason: 'That batch could not be reached. Write it yourself or start again.' } : x));
      }
      setProg({ done: i + 1, of: chunks.length });
    }
    setBusy(false);
  };

  /* The session token, read the same way JARVIS reads it. Imported lazily so
     this file does not drag the Supabase client into a bundle that may not
     need it. */
  const tokenOf = async () => {
    try {
      const m = await import('./lib/supabase');
      const s = await m.supabase.auth.getSession();
      return (s && s.data && s.data.session && s.data.session.access_token) || '';
    } catch { return ''; }
  };

  /* ----------------------------------------------------------- the sending */
  const onEdit = (id, text) => setRow(id, { text });
  const onOpen = id => setRow(id, { status: 'opened' });
  const onSkip = id => setRow(id, { status: 'skipped' });
  const onReopen = id => setRow(id, { status: 'ready', sentAt: '' });

  /* THE ONLY WRITE IN THIS FILE, and it happens exactly once, only after a
     human has confirmed the message actually went.

     Through addActivity — the app's own mutator, the same one every other
     screen calls — so the write goes through commitLeads and cannot race
     (ENGINEERING.md §3). Never a direct Supabase call from a screen. */
  const onLogged = id => {
    const row = rows.find(r => r.id === id);
    if (!row || row.status === 'sent') return;
    const lead = byId[id];
    if (!lead || !addActivity) { setErr('That lead is no longer on screen — nothing was logged.'); return; }
    addActivity(lead.id, 'Text', row.text, me, sentActivity(occasion, new Date()));
    setRow(id, { status: 'sent', sentAt: new Date().toISOString() });
  };

  const clearRun = () => {
    if (!window.confirm('Clear this run? Anything not yet sent is lost. Activities already logged stay on their leads.')) return;
    setRows([]); setCampaign(''); setProg({ done: 0, of: 0 }); setErr('');
  };

  const tally = useMemo(() => {
    const t = { sent: 0, waiting: 0, held: 0, refused: 0, skipped: 0 };
    rows.forEach(r => {
      if (r.status === 'sent') t.sent++;
      else if (r.status === 'held') t.held++;
      else if (r.status === 'refused') t.refused++;
      else if (r.status === 'skipped') t.skipped++;
      else t.waiting++;
    });
    return t;
  }, [rows]);

  const thin = useMemo(() => picked.filter(l => eligibility(l).ok && !hasSubstance(l)).length, [picked]);

  return (
    <>
      <style>{CSS}</style>
      <div className="mo">

        {/* ------------------------------------------------ 1. pick people */}
        <div className="mo-step">
          <div className="mo-h">
            <span className="n">1</span><b>Pick who this goes to</b>
            <span className="sub">{ready} ready{noPhone.length ? ` · ${noPhone.length} ticked with no number` : ''}</span>
          </div>
          {gone.total > 0 && (
            <div className="mo-note">
              <ShieldAlert size={14} />
              <span>
                <b>{gone.total}</b> {gone.total === 1 ? 'record is' : 'records are'} not in this list and cannot be
                added: {gone.dnc > 0 && <><b>{gone.dnc}</b> marked do-not-call</>}
                {gone.dnc > 0 && gone.bad > 0 && ', '}
                {gone.bad > 0 && <><b>{gone.bad}</b> with a dead or wrong number</>}.
              </span>
            </div>
          )}
          <div className="mo-body flush">
            {LeadTable ? (
              <LeadTable
                leads={shown} settings={settings} stages={stages} open={open}
                saveSettings={saveSettings} me={me} updateLead={updateLead}
                rep={rep} myPools={myPools} users={users}
                selection={sel} onSelection={setSel} initialView="all"
              />
            ) : <div className="mo-body">The lead table is unavailable on this install.</div>}
          </div>
        </div>

        {/* ------------------------------------------ 2. what it is about */}
        <div className="mo-step">
          <div className="mo-h"><span className="n">2</span><b>What are you reaching out about?</b></div>
          <div className="mo-body">
            <textarea
              className="mo-occ" value={occasion} onChange={e => setOccasion(e.target.value)}
              placeholder="Memorial Day, wishing them a good weekend and hoping they get some time with family"
            />
            <div className="mo-eg">
              Write it the way you would say it. This is the message — what is on each person&rsquo;s
              record only changes how it is worded for them.
            </div>

            <div className="mo-go">
              <button className="btn btn-p" disabled={!occasion.trim() || !ready || busy || overMax} onClick={generate}>
                {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                {busy ? `Drafting… ${prog.done}/${prog.of}` : `Generate ${ready} ${ready === 1 ? 'message' : 'messages'}`}
              </button>
              {rows.length > 0 && !busy && (
                <button className="btn btn-g" onClick={clearRun}>Clear this run</button>
              )}
              <span className="mo-count">
                {!ready ? 'Tick some people above.' : <>Drafting for <b>{ready}</b>.</>}
                {thin > 0 && ready > 0 && <> {thin} of them have little on file and will get a plain, non-specific note.</>}
              </span>
            </div>

            {overMax && (
              <div className="mo-note warn" style={{ margin: '12px 0 0' }}>
                <AlertTriangle size={14} />
                <span><b>{ready}</b> is past the {OUTREACH_MAX}-per-run ceiling this screen sets by default.
                  Untick some, or run it in two passes — every message still needs a tap from you either way.</span>
              </div>
            )}
            {busy && <div className="mo-prog"><i style={{ width: prog.of ? `${(prog.done / prog.of) * 100}%` : '0%' }} /></div>}
            {err && (
              <div className="mo-note warn" style={{ margin: '12px 0 0' }}>
                <AlertTriangle size={14} /><span>{err}</span>
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------- 3. review + send */}
        {rows.length > 0 && (
          <div className="mo-step">
            <div className="mo-h">
              <span className="n">3</span><b>Review and send</b>
              <span className="sub">
                {tally.sent} sent · {tally.waiting} to go
                {tally.held ? ` · ${tally.held} for you to write` : ''}
              </span>
            </div>
            <div className="mo-note">
              <MessageSquare size={14} />
              <span>
                <b>Text</b> opens Messages with the message loaded and their number in the To field —
                you still press send there. Come back and confirm it went, and it is logged as a
                Text on that lead. Nothing is logged until you confirm, because this page cannot see Messages.
              </span>
            </div>
            <div>
              {rows.map(r => (
                <Row key={r.id} row={r}
                  onEdit={onEdit} onOpen={onOpen} onLogged={onLogged}
                  onSkip={onSkip} onReopen={onReopen} />
              ))}
            </div>
            <div className="mo-tally">
              <span><b>{tally.sent}</b> sent &amp; logged</span>
              <span><b>{tally.waiting}</b> still to go</span>
              {tally.held > 0 && <span><b>{tally.held}</b> flagged for you to write</span>}
              {tally.refused > 0 && <span><b>{tally.refused}</b> need rewriting</span>}
              {tally.skipped > 0 && <span><b>{tally.skipped}</b> skipped</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
