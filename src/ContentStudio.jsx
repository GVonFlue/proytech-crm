import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sparkles, Loader2, Check, X, Copy, RefreshCw, Send, Plus,
  Trash2, Download, Upload, AlertTriangle, ChevronLeft, ChevronRight,
  Link2, Save, Eye, EyeOff, CircleDot, Sliders,
} from 'lucide-react';
import { BRAND, CONTENT_BRAND, tint } from './lib/brand';
import { db, auth } from './lib/supabase';
import {
  readConfig, normResearch, normContext, postsForWeek, weeksOf,
  todayQueue, researchOrder, comingMonday, currentMonday,
  exportContext, planImportContext, slidesToText, checkCounts,
  MIX_CLASSES, CUSTOM_MAX_PER_RUN, POST_STATUSES, statusOf, unknownStatuses,
} from './lib/content';

/* ============================================================================
   CONTENT STUDIO — next week's slate, the Monday queue, the research box, and
   the table that decides what all of it sounds like.
   ----------------------------------------------------------------------------
   SELF CONTAINED, ON PURPOSE (WEEKEND1 §1). This is its own screen the way
   src/LeadView.jsx is. App.jsx gets a route and a nav entry and nothing else —
   it does not load this data, does not hold this state, and does not know what
   a slate is. Everything reusable lives in src/lib/content.js, which the two
   api/ routes import as well so the browser and the generator cannot disagree
   about what a post is.

   NO HEX IN THIS FILE.

   The five colours are env vars with ProyTech defaults, and they live in
   src/lib/brand.js (CONTENT_BRAND). This component publishes them as CSS
   custom properties on its root and every rule below goes through a var(), so
   a white-label install restyles the Studio with five Vercel settings and no
   code edit. tests/content.mjs fails the build if a hex value appears here.

   NOTHING ABOUT THE GENERATOR IS HARDCODED EITHER.

   The caption tabs come from `config.surfaces` — rows in content_brand_context
   — not from a list in this file. So does the post count, the model and the
   spend cap. When a config row is missing the screen SAYS SO, by name, at the
   top of the Brand tab: ENGINEERING.md §2 is about numbers that go missing and
   render as plausible values, and "the owner set posts_per_week to 4" and "no
   posts_per_week row was ever created" must not be the same screen.

   WHAT THIS SCREEN DOES NOT TOUCH

   content_assets — there is no image generation this weekend (WEEKEND1 §4).
   content_ideas, content_insights, content_mining_state — later phases, out of
   scope, and not read or written anywhere in this file.
   On content_posts, idea_id / parent_id / series_key / series_index /
   source_insights / recycled_from are left null and are not in any select list.
   ========================================================================== */

/* ---- style ---------------------------------------------------------------
   Scoped under .cs, the same way Jarvis scopes under .jv: nothing here leaks
   into the rest of the CRM and nothing in the CRM restyles it. Every colour is
   a var() fed by the block that renders the root, so this string contains no
   colour literals of its own.

   Space Grotesk 600-700 for display, Inter for body, Space Mono for labels —
   all three are already loaded by App.jsx's @import, so this adds no request. */
const CSS = `
.cs{font-family:'Inter',system-ui,sans-serif;color:var(--cs-ink)}
.cs *{box-sizing:border-box}
.cs h1,.cs h2,.cs h3,.cs .cs-disp{font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-.015em;margin:0}
.cs-lbl{font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--cs-dim)}

/* ---- head + tabs ---- */
.cs-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.cs-head h1{font-size:23px}
.cs-head .cs-lbl{display:block;margin-bottom:3px}
.cs-grow{flex:1}
.cs-tabs{display:inline-flex;background:var(--cs-well);border-radius:11px;padding:3px;gap:2px;
  border:1px solid var(--cs-line)}
.cs-tab{border:none;background:none;padding:8px 15px;border-radius:8px;font-family:'Inter';
  font-size:13px;font-weight:600;color:var(--cs-dim);cursor:pointer;display:inline-flex;align-items:center;gap:7px}
.cs-tab.on{background:white;color:var(--cs-primary);box-shadow:0 1px 4px var(--cs-shadow)}
.cs-tab i{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;
  background:var(--cs-line);color:var(--cs-dim)}
.cs-tab.on i{background:var(--cs-primary);color:white}

/* ---- badges ---- */
.cs-badge{display:inline-flex;align-items:center;gap:5px;font-family:'Space Mono',ui-monospace,monospace;
  font-size:9.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  padding:4px 9px;border-radius:6px;white-space:nowrap}
/* personal vs ProyTech must read apart at a glance across a grid of cards, so
   they differ in FILL as well as hue — colour alone is not a distinction for
   everyone, and this screen is used one-handed at speed. */
.cs-badge.mix-personal{background:var(--cs-accent);color:white}
.cs-badge.mix-proytech{background:var(--cs-primary-wash);color:var(--cs-primary);
  border:1px solid var(--cs-primary-line)}
.cs-badge.mix-other{background:var(--cs-well);color:var(--cs-dim);border:1px solid var(--cs-line)}
.cs-badge.surface{background:var(--cs-navy);color:white}
.cs-badge.ghost{background:transparent;color:var(--cs-dim);border:1px solid var(--cs-line)}
.cs-badge.warn{background:var(--cs-accent-wash);color:var(--cs-accent-text);border:1px solid var(--cs-accent-line)}
.cs-badge.good{background:var(--cs-primary-wash);color:var(--cs-primary)}

/* ---- cards ---- */
.cs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(370px,1fr));gap:16px}
.cs-card{background:white;border:1px solid var(--cs-line);border-radius:16px;padding:18px;
  display:flex;flex-direction:column;gap:12px}
.cs-card.killed{opacity:.5}
.cs-card.approved{border-color:var(--cs-primary-line);box-shadow:inset 3px 0 0 var(--cs-primary)}
.cs-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.cs-hook{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;line-height:1.24;
  letter-spacing:-.015em;color:var(--cs-ink)}
.cs-concept{font-size:14.5px;line-height:1.62;color:var(--cs-ink);white-space:pre-wrap}
.cs-value{font-size:12.5px;line-height:1.55;color:var(--cs-body);padding:9px 11px;
  background:var(--cs-well);border-left:2px solid var(--cs-accent);border-radius:0 8px 8px 0}
.cs-meta{font-size:12px;color:var(--cs-dim)}

/* ---- caption tabs, driven by config.surfaces ---- */
.cs-caps{border-top:1px solid var(--cs-line);padding-top:11px}
.cs-capbar{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
.cs-capbar button{border:1px solid var(--cs-line);background:var(--cs-well);border-radius:7px;
  padding:5px 11px;font-family:'Space Mono',ui-monospace,monospace;font-size:10px;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:var(--cs-dim);cursor:pointer}
.cs-capbar button.on{background:var(--cs-primary);border-color:var(--cs-primary);color:white}
.cs textarea,.cs input,.cs select{font-family:'Inter';font-size:13.5px;color:var(--cs-ink);
  width:100%;border:1px solid var(--cs-line);border-radius:9px;padding:10px 12px;background:white}
.cs textarea{line-height:1.6;resize:vertical;min-height:104px}
.cs textarea:focus,.cs input:focus,.cs select:focus{outline:none;border-color:var(--cs-primary);
  box-shadow:0 0 0 3px var(--cs-primary-wash)}

/* ---- buttons ---- */
.cs-btn{font-family:'Inter';font-size:13px;font-weight:600;padding:9px 15px;border-radius:9px;
  border:1px solid var(--cs-line);background:white;color:var(--cs-body);cursor:pointer;
  display:inline-flex;align-items:center;gap:7px;transition:.15s}
.cs-btn:hover:not(:disabled){border-color:var(--cs-primary);color:var(--cs-primary)}
.cs-btn:disabled{opacity:.5;cursor:default}
.cs-btn.p{background:var(--cs-primary);border-color:var(--cs-primary);color:white}
.cs-btn.p:hover:not(:disabled){opacity:.9;color:white}
.cs-btn.a{background:var(--cs-accent);border-color:var(--cs-accent);color:white}
.cs-btn.a:hover:not(:disabled){opacity:.9;color:white}
.cs-btn.sm{padding:6px 11px;font-size:12px;border-radius:8px}
.cs-btn.danger:hover:not(:disabled){border-color:var(--cs-accent-text);color:var(--cs-accent-text)}

/* ---- notices ---- */
.cs-note{border-radius:12px;padding:13px 15px;font-size:13px;line-height:1.55;
  display:flex;gap:10px;align-items:flex-start;margin-bottom:14px}
.cs-note.warn{background:var(--cs-accent-wash);color:var(--cs-accent-text);border:1px solid var(--cs-accent-line)}
.cs-note.info{background:var(--cs-primary-wash);color:var(--cs-primary);border:1px solid var(--cs-primary-line)}
.cs-note b{font-weight:700}
.cs-empty{padding:38px 20px;text-align:center;color:var(--cs-dim);font-size:13.5px;
  background:var(--cs-well);border:1px dashed var(--cs-line);border-radius:14px}

/* ---- Today: one post per screen, phone in one hand ---- */
.cs-today{max-width:560px;margin:0 auto}
.cs-today .cs-card{padding:22px;gap:16px}
.cs-today .cs-hook{font-size:26px;line-height:1.2}
.cs-today textarea{min-height:230px;font-size:15px}
.cs-big{width:100%;justify-content:center;padding:16px 20px;font-size:16px;border-radius:13px}
.cs-nav{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.cs-nav button{flex:none;width:46px;height:46px;justify-content:center;padding:0}
.cs-count{flex:1;text-align:center}

/* ---- Research ---- */
.cs-form{background:white;border:1px solid var(--cs-line);border-radius:16px;padding:18px;
  display:flex;flex-direction:column;gap:11px;margin-bottom:18px}
.cs-fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
.cs-field label{display:block;margin-bottom:5px}
.cs-list{display:flex;flex-direction:column;gap:8px}
.cs-item{background:white;border:1px solid var(--cs-line);border-radius:11px;padding:12px 14px;
  display:flex;gap:11px;align-items:flex-start}
.cs-item.used{opacity:.55}
.cs-item p{margin:5px 0 0;font-size:13px;line-height:1.55;color:var(--cs-body)}
.cs-item a{color:var(--cs-primary);font-size:12px;word-break:break-all}

/* ---- Brand ---- */
.cs-cat{margin-bottom:20px}
.cs-cat h3{font-size:15px;margin-bottom:9px;display:flex;align-items:center;gap:9px}
.cs-tbl{background:white;border:1px solid var(--cs-line);border-radius:13px;overflow:hidden}
.cs-tr{display:grid;grid-template-columns:190px 1fr auto;gap:11px;padding:11px 14px;
  border-top:1px solid var(--cs-line);align-items:start}
.cs-tr:first-child{border-top:none}
.cs-tr.off{background:var(--cs-well)}
.cs-tr.off .cs-k,.cs-tr.off textarea{opacity:.55}
.cs-k{font-family:'Space Mono',ui-monospace,monospace;font-size:11.5px;font-weight:700;
  color:var(--cs-ink);padding-top:10px;word-break:break-word}
.cs-acts{display:flex;gap:5px;align-items:center;padding-top:5px}
.cs-icon{border:1px solid var(--cs-line);background:white;border-radius:8px;width:32px;height:32px;
  display:inline-flex;align-items:center;justify-content:center;color:var(--cs-dim);cursor:pointer}
.cs-icon:hover{border-color:var(--cs-primary);color:var(--cs-primary)}
.cs-icon.on{background:var(--cs-primary);border-color:var(--cs-primary);color:white}

/* ---- the header band ---- */
.cs-band{background:var(--cs-navy);border-radius:16px;padding:18px 22px;margin-bottom:18px;
  display:flex;align-items:center;gap:20px;flex-wrap:wrap;position:relative;overflow:hidden}
/* the accent rule: a lit edge rather than a slab, same idea as the sidebar */
.cs-band::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;
  background:linear-gradient(90deg,var(--cs-accent),var(--cs-primary) 62%,transparent)}
.cs-band::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(680px 200px at 8% -40%,var(--cs-primary-glow),transparent 70%)}
.cs-band>*{position:relative;z-index:1}
.cs-word{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:23px;letter-spacing:-.02em;
  color:white;line-height:1.1;margin:0}
.cs-word i{font-style:normal;color:var(--cs-on-navy-accent)}
.cs-band .cs-lbl{color:var(--cs-on-navy-dim);display:block;margin-bottom:4px}
.cs-chips{display:flex;gap:26px;flex-wrap:wrap;margin-left:auto}
.cs-chip{text-align:right}
.cs-chip b{display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:19px;
  color:white;line-height:1.15;margin-top:3px}
.cs-chip.over b{color:var(--cs-accent)}

/* ---- the image prompt: the whole point of the card until images exist ---- */
.cs-vis{border:1px solid var(--cs-accent-line);background:var(--cs-accent-wash);
  border-radius:11px;padding:12px 13px}
.cs-vis .cs-lbl{color:var(--cs-accent-text);margin-bottom:7px;display:block}
.cs-vis p{margin:0;font-size:13px;line-height:1.6;color:var(--cs-ink);white-space:pre-wrap}

/* ---- carousel slides ---- */
.cs-slides{border:1px solid var(--cs-line);border-radius:11px;padding:12px 13px;background:var(--cs-well)}
.cs-slides ol{margin:8px 0 0;padding:0 0 0 4px;list-style:none;counter-reset:sl}
.cs-slides li{counter-increment:sl;display:grid;grid-template-columns:24px 1fr;gap:9px;
  padding:8px 0;border-top:1px solid var(--cs-line)}
.cs-slides li:first-child{border-top:none;padding-top:2px}
.cs-slides li::before{content:counter(sl);font-family:'Space Mono',ui-monospace,monospace;
  font-size:11px;font-weight:700;color:var(--cs-primary);padding-top:2px}
.cs-slides b{display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;
  color:var(--cs-ink);line-height:1.3;margin-bottom:3px}
.cs-slides span{font-size:13px;line-height:1.55;color:var(--cs-body);white-space:pre-wrap}

/* ---- the custom generate panel ---- */
.cs-panel{background:white;border:1px solid var(--cs-primary-line);border-radius:16px;
  padding:18px;margin-bottom:16px;display:flex;flex-direction:column;gap:13px}
.cs-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
.cs-count-f{border:1px solid var(--cs-line);border-radius:11px;padding:11px 12px}
.cs-count-f input{border:none;padding:4px 0;font-family:'Space Grotesk',sans-serif;
  font-size:26px;font-weight:700;color:var(--cs-ink)}
.cs-count-f input:focus{box-shadow:none}
.cs-count-f.ad{border-color:var(--cs-accent-line);background:var(--cs-accent-wash)}
.cs-total{font-family:'Space Mono',ui-monospace,monospace;font-size:11px;color:var(--cs-dim)}
.cs-total.bad{color:var(--cs-accent-text);font-weight:700}

@media (max-width:640px){
  .cs-grid{grid-template-columns:1fr}
  .cs-tr{grid-template-columns:1fr;gap:7px}
  .cs-k{padding-top:0}
  .cs-head h1{font-size:20px}
  .cs-band{padding:15px 16px;gap:14px}
  .cs-word{font-size:19px}
  .cs-chips{margin-left:0;gap:18px;width:100%}
  .cs-chip{text-align:left}
  .cs-counts{grid-template-columns:1fr}
}
`;

/* ---- small pure helpers, declared before every use ------------------------
   `const` does not hoist and this module renders immediately — ENGINEERING.md
   §1, which this project has been bitten by at render with a green build. */

const fmtWeek = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const mixClassOf = (m) => {
  const s = String(m || '').toLowerCase();
  if (s.includes('personal')) return 'mix-personal';
  if (s) return 'mix-proytech';
  return 'mix-other';
};

const usd = (cents) => '$' + ((Number(cents) || 0) / 100).toFixed(2);

/* One copy-to-clipboard that reports whether it worked. navigator.clipboard is
   absent on http origins and inside the jsdom harness, so the fallback is not
   decoration — without it "Copy caption" silently does nothing on exactly the
   phone this screen is for. */
async function copyText(text) {
  const s = String(text || '');
  if (!s) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch { return false; }
}

/* Signed-in POST to one of our own routes. Same shape as App.jsx's apiPost and
   Playbook's draftFrom — the routes are guarded with requireOwner, so a call
   without the token is a 401 rather than a mystery. */
async function apiPost(url, body) {
  let tok = '';
  try { const s = await auth.session(); tok = (s && s.access_token) || ''; } catch { /* unauthenticated */ }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  return j || { ok: false, error: `The request failed (${r.status}).` };
}

/* ---- badges --------------------------------------------------------------- */

const MixBadge = ({ post: p }) => (
  <span className={'cs-badge ' + mixClassOf(p.mix_class)}>{p.mix_class || 'unclassified'}</span>
);
const SurfaceBadge = ({ post: p }) => (
  p.surface ? <span className="cs-badge surface">{p.surface}</span> : null
);

/* A button that copies something and says whether it worked. Extracted because
   three places now need it and each was growing its own `copied` state — and
   because copyText() can genuinely fail (no clipboard on an http origin), so
   "Copy" that silently does nothing is a real outcome that has to be shown. */
function CopyBtn({ text, label, done, size = 13, className = 'cs-btn sm' }) {
  const [state, setState] = useState('');
  const go = async () => {
    const ok = await copyText(text);
    setState(ok ? 'yes' : 'no');
    setTimeout(() => setState(''), 1800);
  };
  return (
    <button className={className} onClick={go} disabled={!text}>
      <Copy size={size} />
      {state === 'yes' ? (done || 'Copied') : state === 'no' ? 'Copy failed' : label}
    </button>
  );
}

/* THE IMAGE PROMPT. The model has been writing this all along and nothing
   displayed it, which is why the first run produced no visual output. Until
   image generation exists this block IS the deliverable: it is what gets pasted
   into an image generator, so it says so, and it has its own Copy. */
function ImagePrompt({ post: p }) {
  if (!p.image_prompt) return null;
  return (
    <div className="cs-vis">
      <div className="cs-row">
        <span className="cs-lbl">Image prompt — paste into your image generator</span>
        <span className="cs-grow" />
        <CopyBtn text={p.image_prompt} label="Copy" />
      </div>
      <p>{p.image_prompt}</p>
    </div>
  );
}

/* CAROUSEL SLIDES, numbered, headline above body.
   Rendered whenever slides exist rather than when format === 'carousel': a post
   the model labelled `single` while still writing six slides has six slides,
   and hiding them behind the label would lose work that is already in the row.
   normPost has already turned both the old plain-string shape and the new
   {headline, body} shape into the same thing. */
function Slides({ post: p }) {
  const slides = (p.carousel_slides || []).filter(s => s.headline || s.body);
  if (!slides.length) return null;
  return (
    <div className="cs-slides">
      <div className="cs-row">
        <span className="cs-lbl">{slides.length} slides</span>
        <span className="cs-grow" />
        <CopyBtn text={slidesToText(slides)} label="Copy all" done="Copied all" />
      </div>
      <ol>
        {slides.map((s, i) => (
          <li key={i}>
            <div>
              {s.headline ? <b>{s.headline}</b> : null}
              {s.body ? <span>{s.body}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ============================================================ SLATE ======= */

function SlateCard({ post: p, surfaces, onPatch, onRegenerate, busy }) {
  /* The caption tabs are config.surfaces, never a list in this file. A post
     whose captions carry a key the config no longer names still shows it —
     dropping it would hide text the owner may not have copied out yet. */
  const keys = useMemo(() => {
    const extra = Object.keys(p.captions || {}).filter(k => !surfaces.includes(k));
    return surfaces.concat(extra);
  }, [surfaces, p.captions]);

  const [tab, setTab] = useState(() => (keys.includes(p.surface) ? p.surface : keys[0] || ''));
  const [draft, setDraft] = useState(p.captions[tab] || '');
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pid, setPid] = useState(p.platform_post_ids[p.surface] || '');
  const [perf, setPerf] = useState(p.performance || '');
  const [mode, setMode] = useState('');

  /* Reload the textarea when the tab moves or the row changes underneath —
     a regenerate rewrites captions server side and the box must follow. */
  useEffect(() => { setDraft(p.captions[tab] || ''); setDirty(false); }, [tab, p.captions]);
  useEffect(() => { setPid(p.platform_post_ids[p.surface] || ''); setPerf(p.performance || ''); }, [p.platform_post_ids, p.surface, p.performance]);

  const saveCaption = () => {
    if (!dirty) return;
    onPatch(p.id, { captions: { ...p.captions, [tab]: draft } });
    setDirty(false);
  };

  const copy = async () => {
    const ok = await copyText(draft);
    setCopied(ok ? 'yes' : 'no');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={'cs-card' + (p.status === 'approved' ? ' approved' : '') + (p.status === 'killed' ? ' killed' : '')}>
      <div className="cs-row">
        <MixBadge post={p} />
        <SurfaceBadge post={p} />
        {p.pillar ? <span className="cs-badge ghost">{p.pillar}</span> : null}
        {p.format ? <span className="cs-badge ghost">{p.format}</span> : null}
        <span className="cs-grow" />
        {p.status === 'approved' ? <span className="cs-badge good"><Check size={11} />approved</span> : null}
        {p.status === 'killed' ? <span className="cs-badge ghost">killed</span> : null}
        {/* An unrecognised status used to render as nothing at all, which reads
            exactly like a draft while todayQueue's exact match kept it out of
            Monday morning forever. It is now the loudest thing on the card. */}
        {!statusOf(p).known
          ? <span className="cs-badge warn" title={`Not one of: ${POST_STATUSES.join(', ')}`}>
              <AlertTriangle size={11} />status: {statusOf(p).value}
            </span>
          : null}
        {p.posted_at ? <span className="cs-badge good">posted</span> : null}
      </div>

      <div className="cs-hook">{p.hook || 'No hook came back for this one.'}</div>
      {p.concept ? <div className="cs-concept">{p.concept}</div> : null}
      {p.value_statement ? <div className="cs-value">{p.value_statement}</div> : null}
      {p.cta_key ? <div className="cs-meta"><span className="cs-lbl">CTA</span> {p.cta_key}</div> : null}

      {/* THE VISUAL INSTRUCTIONS. Until image generation exists these two blocks
          are what the card is FOR — the model was already writing them and
          nothing rendered them, so the feature produced no visual output at all.
          Neither is behind a toggle: if the model generated it, the card shows
          it (WEEKEND1.5 §B). */}
      <ImagePrompt post={p} />
      <Slides post={p} />

      <div className="cs-caps">
        <div className="cs-capbar">
          {keys.map(k => (
            <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>{k}</button>
          ))}
        </div>
        <textarea
          value={draft}
          onChange={e => { setDraft(e.target.value); setDirty(true); }}
          onBlur={saveCaption}
          placeholder={`The ${tab || 'caption'} caption`}
        />
        <div className="cs-row" style={{ marginTop: 9 }}>
          <button className="cs-btn sm" onClick={copy}>
            <Copy size={13} />{copied === 'yes' ? 'Copied' : copied === 'no' ? 'Copy failed' : 'Copy caption'}
          </button>
          <button className="cs-btn sm" onClick={saveCaption} disabled={!dirty}><Save size={13} />Save</button>
          <span className="cs-grow" />
          <button className="cs-btn sm p" disabled={p.status === 'approved'}
            onClick={() => onPatch(p.id, { status: 'approved' })}><Check size={13} />Approve</button>
          <button className="cs-btn sm danger" disabled={p.status === 'killed'}
            onClick={() => onPatch(p.id, { status: 'killed' })}><X size={13} />Kill</button>
        </div>
      </div>

      <div className="cs-row">
        <span className="cs-lbl">Regenerate</span>
        <button className="cs-btn sm" disabled={busy}
          onClick={() => { setMode('caption'); onRegenerate(p.id, 'caption').finally(() => setMode('')); }}>
          {busy && mode === 'caption' ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}Captions only
        </button>
        <button className="cs-btn sm" disabled={busy}
          onClick={() => { setMode('full'); onRegenerate(p.id, 'full').finally(() => setMode('')); }}>
          {busy && mode === 'full' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}Whole post
        </button>
      </div>

      <div className="cs-fgrid">
        <div className="cs-field">
          <label className="cs-lbl">Platform post ID</label>
          <input value={pid} onChange={e => setPid(e.target.value)}
            onBlur={() => onPatch(p.id, { platform_post_ids: { ...p.platform_post_ids, [p.surface || tab]: pid } })}
            placeholder="paste it after publishing" />
        </div>
        <div className="cs-field">
          <label className="cs-lbl">How it did</label>
          <input value={perf} onChange={e => setPerf(e.target.value)}
            onBlur={() => onPatch(p.id, { performance: perf })}
            placeholder="e.g. 4.2k views, 31 saves" />
        </div>
      </div>
    </div>
  );
}

/* GENERATE CUSTOM — counts per bucket, an optional topic, and which week.
   The weekly cron is untouched; this is the manual path beside it.

   checkCounts() is the SAME function api/content-slate.js validates with, so the
   button here and the route there cannot disagree about where the ceiling is —
   a screen that lets you press a button the server will refuse is the
   two-screens-disagree bug with a 400 as the second screen. */
function CustomPanel({ weeks, defaultWeek, onGenerate, generating, onClose }) {
  const [counts, setCounts] = useState({ personal: 0, proytech: 0, ad: 0 });
  const [focus, setFocus] = useState('');
  const [week, setWeek] = useState(defaultWeek);
  const check = checkCounts(counts);
  const set = k => e => {
    const n = Math.max(0, Math.min(99, Math.floor(Number(e.target.value) || 0)));
    setCounts(c => ({ ...c, [k]: n }));
  };
  const weekList = weeks.includes(defaultWeek) ? weeks : [defaultWeek].concat(weeks);

  return (
    <div className="cs-panel">
      <div className="cs-row">
        <Sliders size={15} />
        <span className="cs-disp" style={{ fontSize: 15 }}>Generate custom</span>
        <span className="cs-grow" />
        <button className="cs-icon" title="Close" onClick={onClose}><X size={15} /></button>
      </div>

      <div className="cs-counts">
        {MIX_CLASSES.map(k => (
          <div className={'cs-count-f' + (k === 'ad' ? ' ad' : '')} key={k}>
            <label className="cs-lbl">{k}</label>
            <input type="number" min="0" max="99" inputMode="numeric"
              value={counts[k]} onChange={set(k)} aria-label={k + ' posts'} />
          </div>
        ))}
      </div>

      <div className="cs-field">
        <label className="cs-lbl">Focus — optional</label>
        <input value={focus} onChange={e => setFocus(e.target.value)}
          placeholder="speed to lead, Military Suite Night…" />
      </div>

      <div className="cs-field">
        <label className="cs-lbl">Week</label>
        <select value={week} onChange={e => setWeek(e.target.value)}>
          {weekList.map(w => <option key={w} value={w}>{fmtWeek(w)}</option>)}
        </select>
      </div>

      <div className="cs-row">
        <span className={'cs-total' + (check.total > CUSTOM_MAX_PER_RUN ? ' bad' : '')}>
          {check.total} / {CUSTOM_MAX_PER_RUN} this run
        </span>
        <span className="cs-grow" />
        <button className="cs-btn p" disabled={!check.ok || generating}
          onClick={() => onGenerate({ counts: check.counts, focus, week_of: week })}>
          {generating ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {generating ? 'Generating…' : `Generate ${check.total || ''}`.trim()}
        </button>
      </div>
      {!check.ok && check.total ? <div className="cs-total bad">{check.error}</div> : null}
      <div className="cs-meta">
        Ads are written for people who have never heard of you, so they carry no names,
        no shared history and no running threads. A custom run does not consume the
        research queue — that belongs to the Sunday job.
      </div>
    </div>
  );
}

function Slate({ posts, surfaces, weekOf, setWeekOf, weeks, onPatch, onRegenerate, busyId, generate, generating, genMsg }) {
  const rows = useMemo(() => postsForWeek(posts, weekOf), [posts, weekOf]);
  /* Across the WHOLE table, not just this week: a post stuck on an unknown
     status is invisible everywhere, so scoping the warning to the visible week
     would hide the ones most likely to be forgotten. */
  const strays = useMemo(() => unknownStatuses(posts), [posts]);
  const [custom, setCustom] = useState(false);
  return (
    <>
      <div className="cs-row" style={{ marginBottom: 14 }}>
        <span className="cs-lbl">Week of</span>
        <select value={weekOf} onChange={e => setWeekOf(e.target.value)} style={{ width: 'auto', minWidth: 190 }}>
          {(weeks.includes(weekOf) ? weeks : [weekOf].concat(weeks)).map(w => (
            <option key={w} value={w}>{fmtWeek(w)}</option>
          ))}
        </select>
        <span className="cs-grow" />
        <button className={'cs-btn' + (custom ? ' a' : '')} onClick={() => setCustom(v => !v)} disabled={generating}>
          <Sliders size={15} />Generate custom
        </button>
        <button className="cs-btn p" onClick={() => generate()} disabled={generating}>
          {generating ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {generating ? 'Generating…' : 'Generate next week'}
        </button>
      </div>

      {custom ? (
        <CustomPanel weeks={weeks} defaultWeek={weekOf} generating={generating}
          onClose={() => setCustom(false)}
          onGenerate={opts => generate(opts).then(() => setCustom(false))} />
      ) : null}

      {strays.length ? (
        <div className="cs-note warn">
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <b>{strays.length} post{strays.length === 1 ? ' has' : 's have'} a status this app does not
            recognise</b> — {Array.from(new Set(strays.map(p => statusOf(p).value))).join(', ')}.
            {' '}Those posts never reach the Today queue. Approve or kill them to put them back in
            the vocabulary ({POST_STATUSES.join(', ')}).
          </div>
        </div>
      ) : null}

      {genMsg ? (
        <div className={'cs-note ' + (genMsg.bad ? 'warn' : 'info')}>
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
          <div>{genMsg.text}</div>
        </div>
      ) : null}

      {rows.length ? (
        <div className="cs-grid">
          {rows.map(p => (
            <SlateCard key={p.id} post={p} surfaces={surfaces} onPatch={onPatch}
              onRegenerate={onRegenerate} busy={busyId === p.id} />
          ))}
        </div>
      ) : (
        <div className="cs-empty">
          Nothing for the week of {fmtWeek(weekOf)} yet. Press <b>Generate next week</b>, or wait for
          the Sunday evening run.
        </div>
      )}
    </>
  );
}

/* ============================================================ TODAY ======= */

/* The screen actually used on a Monday morning, on a phone, in one hand.
   Approved posts only, one per screen, and the two things that matter — the
   surface and the caption — are the two biggest things on it. */
function Today({ posts, surfaces, weekOf, onPatch }) {
  const queue = useMemo(() => todayQueue(posts, weekOf), [posts, weekOf]);
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const at = Math.min(i, Math.max(0, queue.length - 1));
  const p = queue[at];

  useEffect(() => { if (i > queue.length - 1) setI(Math.max(0, queue.length - 1)); }, [queue.length, i]);

  if (!p) {
    return (
      <div className="cs-empty">
        Nothing approved and waiting. Approve posts on the <b>Slate</b> tab and they queue up here.
      </div>
    );
  }

  const keys = surfaces.includes(p.surface) ? [p.surface] : Object.keys(p.captions);
  const caption = p.captions[keys[0]] || p.captions[p.surface] || '';

  const copy = async () => {
    const ok = await copyText(caption);
    setCopied(ok ? 'yes' : 'no');
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="cs-today">
      <div className="cs-nav">
        <button className="cs-btn" onClick={() => setI(Math.max(0, at - 1))} disabled={at === 0}>
          <ChevronLeft size={20} />
        </button>
        <div className="cs-count">
          <span className="cs-lbl">Approved queue</span>
          <div className="cs-disp" style={{ fontSize: 17 }}>{at + 1} of {queue.length}</div>
        </div>
        <button className="cs-btn" onClick={() => setI(Math.min(queue.length - 1, at + 1))}
          disabled={at >= queue.length - 1}><ChevronRight size={20} /></button>
      </div>

      <div className="cs-card">
        <div className="cs-row">
          <SurfaceBadge post={p} />
          <MixBadge post={p} />
          <span className="cs-grow" />
          <span className="cs-badge ghost">{fmtWeek(p.week_of)}</span>
        </div>

        <div className="cs-hook">{p.hook}</div>
        {p.value_statement ? <div className="cs-value">{p.value_statement}</div> : null}

        <button className="cs-btn p cs-big" onClick={copy}>
          <Copy size={19} />{copied === 'yes' ? 'Copied' : copied === 'no' ? 'Copy failed — select it below' : 'Copy the caption'}
        </button>

        <textarea readOnly value={caption} onFocus={e => e.target.select()} />

        <button className="cs-btn a cs-big" onClick={() => onPatch(p.id, { posted_at: new Date().toISOString() })}>
          <Send size={19} />Mark posted
        </button>
      </div>
    </div>
  );
}

/* ========================================================= RESEARCH ======= */

const BLANK_RESEARCH = { source_type: '', url: '', platform: '', format: '', raw: '', why_it_worked: '' };

function Research({ rows, onAdd }) {
  const [f, setF] = useState(BLANK_RESEARCH);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = k => e => setF(d => ({ ...d, [k]: e.target.value }));
  const list = useMemo(() => researchOrder(rows), [rows]);

  /* Suggestions come from what has already been captured, not from a list in
     this file — ENGINEERING.md §5 is a list of things that look like settings
     and aren't, and this is one more that would have joined it. */
  const seen = (key) => Array.from(new Set(rows.map(r => normResearch(r)[key]).filter(Boolean))).slice(0, 20);

  const submit = async () => {
    if (!f.raw.trim() && !f.url.trim()) { setErr('Paste the thing, or its link. Everything else is optional.'); return; }
    setBusy(true); setErr('');
    try { await onAdd(f); setF(BLANK_RESEARCH); }
    catch (e) { setErr((e && e.message) || 'That did not save.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="cs-form">
        <div className="cs-row"><Plus size={15} /><span className="cs-disp" style={{ fontSize: 15 }}>Capture</span></div>
        <div className="cs-fgrid">
          <div className="cs-field">
            <label className="cs-lbl">Source type</label>
            <input value={f.source_type} onChange={set('source_type')} list="cs-src" placeholder="swipe, competitor, idea" />
            <datalist id="cs-src">{seen('source_type').map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div className="cs-field">
            <label className="cs-lbl">Platform</label>
            <input value={f.platform} onChange={set('platform')} list="cs-plat" placeholder="linkedin, instagram" />
            <datalist id="cs-plat">{seen('platform').map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div className="cs-field">
            <label className="cs-lbl">Format</label>
            <input value={f.format} onChange={set('format')} list="cs-fmt" placeholder="carousel, reel, single" />
            <datalist id="cs-fmt">{seen('format').map(v => <option key={v} value={v} />)}</datalist>
          </div>
        </div>
        <div className="cs-field">
          <label className="cs-lbl">URL</label>
          <input value={f.url} onChange={set('url')} placeholder="https://" inputMode="url" />
        </div>
        <div className="cs-field">
          <label className="cs-lbl">The thing itself</label>
          <textarea value={f.raw} onChange={set('raw')} placeholder="Paste the hook, the caption, the script — whatever you saw." />
        </div>
        <div className="cs-field">
          <label className="cs-lbl">Why it worked</label>
          <textarea value={f.why_it_worked} onChange={set('why_it_worked')} style={{ minHeight: 72 }}
            placeholder="One line. This is the part the generator actually uses." />
        </div>
        {err ? <div className="cs-note warn"><AlertTriangle size={16} style={{ flex: 'none' }} /><div>{err}</div></div> : null}
        <button className="cs-btn p cs-big" onClick={submit} disabled={busy}>
          {busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />}Save it
        </button>
      </div>

      <div className="cs-row" style={{ marginBottom: 9 }}>
        <span className="cs-lbl">Captured · unused first</span>
        <span className="cs-grow" />
        <span className="cs-badge ghost">{list.filter(r => !r.used).length} unused</span>
      </div>

      {list.length ? (
        <div className="cs-list">
          {list.map(r => (
            <div key={r.id} className={'cs-item' + (r.used ? ' used' : '')}>
              <CircleDot size={14} style={{ flex: 'none', marginTop: 4 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="cs-row">
                  {r.source_type ? <span className="cs-badge ghost">{r.source_type}</span> : null}
                  {r.platform ? <span className="cs-badge ghost">{r.platform}</span> : null}
                  {r.format ? <span className="cs-badge ghost">{r.format}</span> : null}
                  <span className="cs-grow" />
                  {r.used ? <span className="cs-badge ghost">used</span> : <span className="cs-badge warn">unused</span>}
                </div>
                {r.url ? <p><a href={r.url} target="_blank" rel="noreferrer"><Link2 size={11} /> {r.url}</a></p> : null}
                {r.raw ? <p>{r.raw.slice(0, 320)}{r.raw.length > 320 ? '…' : ''}</p> : null}
                {r.why_it_worked ? <p style={{ fontStyle: 'italic' }}>{r.why_it_worked}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="cs-empty">Nothing captured yet.</div>}
    </>
  );
}

/* ============================================================ BRAND ======= */

function BrandRow({ row, onSave, onDelete }) {
  const [v, setV] = useState(row.value);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setV(row.value); setDirty(false); }, [row.value]);
  return (
    <div className={'cs-tr' + (row.active ? '' : ' off')}>
      <div className="cs-k">{row.key}</div>
      <textarea value={v} style={{ minHeight: 62 }}
        onChange={e => { setV(e.target.value); setDirty(true); }}
        onBlur={() => { if (dirty) { onSave({ ...row, value: v }); setDirty(false); } }} />
      <div className="cs-acts">
        <button className={'cs-icon' + (row.active ? ' on' : '')} title={row.active ? 'Active — used when generating' : 'Off — ignored when generating'}
          onClick={() => onSave({ ...row, active: !row.active })}>
          {row.active ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button className="cs-icon" title="Delete this row" onClick={() => onDelete(row)}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function Brand({ rows, missing, onSave, onDelete, onImport, notice }) {
  const [adding, setAdding] = useState(null);   // category name, or '' for a new category
  const [nk, setNk] = useState('');
  const [nv, setNv] = useState('');
  const [ncat, setNcat] = useState('');
  const [pending, setPending] = useState(null); // the import confirm step
  const fileRef = useRef(null);

  const grouped = useMemo(() => {
    /* groupContext drops inactive rows because the PROMPT must not see them.
       This screen must, so it groups the raw list itself. */
    const out = {};
    for (const raw of rows) {
      const r = normContext(raw);
      if (!r.category) continue;
      (out[r.category] = out[r.category] || []).push(r);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.sort_order - b.sort_order) || a.key.localeCompare(b.key));
    return out;
  }, [rows]);

  const cats = Object.keys(grouped).sort();

  const addRow = async (category) => {
    const cat = (category === '' ? ncat : category).trim();
    if (!cat || !nk.trim()) return;
    await onSave({ id: '', category: cat, key: nk.trim(), value: nv, active: true, sort_order: (grouped[cat] || []).length });
    setNk(''); setNv(''); setNcat(''); setAdding(null);
  };

  const doExport = () => {
    const doc = exportContext(rows);
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brand-context-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const pickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let doc = null;
    try { doc = JSON.parse(await file.text()); }
    catch { setPending({ error: 'That file is not JSON.' }); return; }
    /* NEVER a silent overwrite (WEEKEND1 §D). planImportContext reports what
       would be added and what already exists; nothing is written until the
       confirm below is pressed. */
    setPending(planImportContext(doc, rows));
  };

  return (
    <>
      <div className="cs-note info">
        <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
        <div>
          <b>Everything on this tab changes what gets generated.</b> The next slate — and every
          regenerate — is written from these rows. An edit here is live the moment it saves; there
          is no separate publish step.
        </div>
      </div>

      {missing.length ? (
        <div className="cs-note warn">
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            No <b>config</b> row for {missing.map(m => <code key={m} style={{ fontFamily: "'Space Mono',monospace" }}>{m} </code>)}
            — the built-in default is being used. Add them under the <b>config</b> category to take control of them.
          </div>
        </div>
      ) : null}

      {notice ? <div className={'cs-note ' + (notice.bad ? 'warn' : 'info')}>
        <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} /><div>{notice.text}</div>
      </div> : null}

      <div className="cs-row" style={{ marginBottom: 16 }}>
        <button className="cs-btn" onClick={doExport}><Download size={14} />Export JSON</button>
        <button className="cs-btn" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={14} />Import JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile} style={{ display: 'none' }} />
        <span className="cs-grow" />
        <button className="cs-btn p" onClick={() => { setAdding(''); setNk(''); setNv(''); setNcat(''); }}>
          <Plus size={14} />New category
        </button>
      </div>

      {pending ? (
        <div className="cs-note warn">
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            {pending.error ? <div>{pending.error}</div> : (
              <>
                <div>
                  This will <b>add {pending.add.length} row{pending.add.length === 1 ? '' : 's'}</b>.
                  {pending.collide.length
                    ? <> {pending.collide.length} already exist{pending.collide.length === 1 ? 's' : ''} here
                        and will be <b>left exactly as they are</b> — importing never overwrites what you have.</>
                    : null}
                </div>
                <div className="cs-row" style={{ marginTop: 10 }}>
                  <button className="cs-btn p sm" disabled={!pending.add.length}
                    onClick={async () => { await onImport(pending.add); setPending(null); }}>
                    <Check size={13} />Add {pending.add.length}
                  </button>
                  <button className="cs-btn sm" onClick={() => setPending(null)}><X size={13} />Cancel</button>
                </div>
              </>
            )}
            {pending.error ? <div className="cs-row" style={{ marginTop: 10 }}>
              <button className="cs-btn sm" onClick={() => setPending(null)}><X size={13} />Close</button>
            </div> : null}
          </div>
        </div>
      ) : null}

      {adding === '' ? (
        <div className="cs-form">
          <span className="cs-lbl">New category</span>
          <div className="cs-fgrid">
            <input value={ncat} onChange={e => setNcat(e.target.value)} placeholder="category, e.g. proof" />
            <input value={nk} onChange={e => setNk(e.target.value)} placeholder="key" />
          </div>
          <textarea value={nv} onChange={e => setNv(e.target.value)} style={{ minHeight: 70 }} placeholder="value" />
          <div className="cs-row">
            <button className="cs-btn p sm" onClick={() => addRow('')} disabled={!ncat.trim() || !nk.trim()}><Check size={13} />Add</button>
            <button className="cs-btn sm" onClick={() => setAdding(null)}><X size={13} />Cancel</button>
          </div>
        </div>
      ) : null}

      {cats.length ? cats.map(cat => (
        <div className="cs-cat" key={cat}>
          <h3>
            {cat}
            <span className="cs-badge ghost">{grouped[cat].length}</span>
            <span className="cs-grow" />
            <button className="cs-btn sm" onClick={() => { setAdding(cat); setNk(''); setNv(''); }}><Plus size={13} />Row</button>
          </h3>
          <div className="cs-tbl">
            {grouped[cat].map(r => <BrandRow key={r.id || r.key} row={r} onSave={onSave} onDelete={onDelete} />)}
            {adding === cat ? (
              <div className="cs-tr">
                <input value={nk} onChange={e => setNk(e.target.value)} placeholder="key" />
                <textarea value={nv} onChange={e => setNv(e.target.value)} style={{ minHeight: 62 }} placeholder="value" />
                <div className="cs-acts">
                  <button className="cs-icon on" title="Add" onClick={() => addRow(cat)}><Check size={15} /></button>
                  <button className="cs-icon" title="Cancel" onClick={() => setAdding(null)}><X size={15} /></button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )) : <div className="cs-empty">No brand context yet. Add a category, or import a JSON export.</div>}
    </>
  );
}

/* ============================================================ the screen == */

export default function ContentStudio() {
  const [tab, setTab] = useState('slate');
  const [context, setContext] = useState([]);
  const [posts, setPosts] = useState([]);
  const [research, setResearch] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [weekOf, setWeekOf] = useState(() => comingMonday(new Date()));
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [brandNotice, setBrandNotice] = useState(null);
  /* null = not read yet or unreadable. NOT 0 — the header renders a dash for
     null and a real figure for 0, because "nothing spent this month" and "the
     ledger could not be read" are different facts and $0.00 is a plausible
     value for both. ENGINEERING.md §2. */
  const [spend, setSpend] = useState(null);

  /* The ledger is service-key only, so it comes back through a route rather
     than a table read. api/content-usage.js explains why at length. */
  const refreshSpend = useCallback(async () => {
    try {
      const j = await apiPost('/api/content-usage', {});
      setSpend(j && j.ok ? { spent: j.spent_cents, cap: j.cap_cents } : null);
    } catch { setSpend(null); }
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        refreshSpend();
        const [c, p, r] = await Promise.all([
          db.getContentContext(), db.getContentPosts(), db.getContentResearch(),
        ]);
        if (dead) return;
        setContext(c || []); setPosts(p || []); setResearch(r || []);
        /* Land on the week that actually has posts. Opening on an empty
           "coming Monday" every Tuesday would hide the week being worked. */
        const ws = weeksOf(p || []);
        const cur = currentMonday(new Date());
        if (ws.includes(cur)) setWeekOf(cur);
        else if (ws.length) setWeekOf(ws[0]);
      } catch (e) { console.error('content studio load failed', e); }
      finally { if (!dead) setLoaded(true); }
    })();
    return () => { dead = true; };
  }, [refreshSpend]);

  const { config, missing } = useMemo(() => readConfig(context), [context]);
  const surfaces = config.surfaces;
  const weeks = useMemo(() => weeksOf(posts), [posts]);

  /* One patch per event, and the local row is replaced with WHAT POSTGRES
     RETURNED rather than with what was sent. ENGINEERING.md §3 is about two
     mutations in one tick discarding each other; the same danger lives here,
     and echoing the server's row means the screen can never show a value the
     database declined to store. */
  const patchPost = useCallback(async (id, patch) => {
    try {
      const saved = await db.updateContentPost(id, patch);
      if (saved) setPosts(list => list.map(p => (p.id === id ? saved : p)));
    } catch (e) {
      console.error('content post save failed', e);
      setGenMsg({ bad: true, text: 'That change did not save: ' + ((e && e.message) || 'unknown error') });
    }
  }, []);

  /* ONE generate for both paths. `opts` is undefined for "Generate next week",
     which sends {} and is byte-for-byte the request Weekend 1 sent; the custom
     panel supplies counts/focus/week_of. Two functions here would be two places
     to forget to refresh the spend, or to refresh the posts. */
  const generate = useCallback(async (opts) => {
    setGenerating(true); setGenMsg(null);
    try {
      const j = await apiPost('/api/content-slate', opts || {});
      if (!j.ok) { setGenMsg({ bad: true, text: j.error || 'That did not generate.' }); return; }
      const fresh = await db.getContentPosts();
      setPosts(fresh || []);
      setResearch(await db.getContentResearch() || []);
      if (j.week_of) setWeekOf(j.week_of);
      const bits = [`${j.count} posts for the week of ${fmtWeek(j.week_of)}.`];
      if (j.custom && j.counts) {
        bits.push('Breakdown: ' + MIX_CLASSES.filter(k => j.counts[k] > 0)
          .map(k => `${j.counts[k]} ${k}`).join(', ') + '.');
      }
      if (j.research_used) bits.push(`${j.research_used} research row${j.research_used === 1 ? '' : 's'} used.`);
      if (typeof j.spent_cents === 'number') bits.push(`This run cost about ${usd(j.spent_cents)} of a ${usd(j.cap_cents)} monthly cap.`);
      if (j.config_defaults_used && j.config_defaults_used.length) {
        bits.push(`No config row for ${j.config_defaults_used.join(', ')} — defaults were used.`);
      }
      /* The all-text_only warning is the LOUD one, so it wins the styling: the
         run succeeded and still produced nothing to look at, which is exactly
         the state that went unnoticed the first time. */
      if (j.format_warning) setGenMsg({ bad: true, text: j.format_warning + ' ' + bits.join(' ') });
      else setGenMsg({ bad: false, text: bits.join(' ') });
      refreshSpend();
    } catch (e) {
      setGenMsg({ bad: true, text: (e && e.message) || 'That did not generate.' });
    } finally { setGenerating(false); }
  }, [refreshSpend]);

  const regenerate = useCallback(async (id, mode) => {
    setBusyId(id); setGenMsg(null);
    try {
      const j = await apiPost('/api/content-regenerate', { post_id: id, mode });
      if (!j.ok) { setGenMsg({ bad: true, text: j.error || 'That did not regenerate.' }); return; }
      if (j.post) setPosts(list => list.map(p => (p.id === id ? j.post : p)));
      setGenMsg({
        bad: false,
        text: mode === 'caption' ? 'Captions rewritten. The concept is untouched.' : 'Post rewritten on the same pillar.',
      });
    } catch (e) {
      setGenMsg({ bad: true, text: (e && e.message) || 'That did not regenerate.' });
    } finally { setBusyId(''); }
  }, []);

  const saveContext = useCallback(async (row) => {
    try {
      const saved = await db.saveContentContext(row);
      setContext(list => {
        const i = list.findIndex(x => x.id && saved && x.id === saved.id);
        if (i >= 0) { const next = list.slice(); next[i] = saved; return next; }
        return list.concat(saved ? [saved] : []);
      });
      setBrandNotice(null);
    } catch (e) {
      setBrandNotice({ bad: true, text: 'That row did not save: ' + ((e && e.message) || 'unknown error') });
    }
  }, []);

  const deleteContext = useCallback(async (row) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${row.key}" from ${row.category}? The next slate will be written without it.`)) return;
    try {
      await db.deleteContentContext(row.id);
      setContext(list => list.filter(x => x.id !== row.id));
    } catch (e) {
      setBrandNotice({ bad: true, text: 'That row did not delete: ' + ((e && e.message) || 'unknown error') });
    }
  }, []);

  const importContext = useCallback(async (rows) => {
    try {
      const added = await db.addContentContext(rows);
      setContext(list => list.concat(added || []));
      setBrandNotice({ bad: false, text: `Added ${(added || []).length} rows. Nothing you already had was changed.` });
    } catch (e) {
      setBrandNotice({ bad: true, text: 'The import did not save: ' + ((e && e.message) || 'unknown error') });
    }
  }, []);

  const addResearch = useCallback(async (row) => {
    const saved = await db.addContentResearch(row);
    if (saved) setResearch(list => [saved].concat(list));
  }, []);

  /* The five env-var colours, published once as custom properties. Every rule
     in CSS above reads them through var(), which is why this file contains no
     hex of its own — see the header. */
  const skin = useMemo(() => ({
    '--cs-primary': CONTENT_BRAND.primary,
    '--cs-primary-wash': tint(CONTENT_BRAND.primary, 0.08),
    '--cs-primary-line': tint(CONTENT_BRAND.primary, 0.3),
    '--cs-accent': CONTENT_BRAND.accent,
    '--cs-accent-wash': tint(CONTENT_BRAND.accent, 0.1),
    '--cs-accent-line': tint(CONTENT_BRAND.accent, 0.32),
    '--cs-accent-text': CONTENT_BRAND.accentText,
    '--cs-primary-glow': tint(CONTENT_BRAND.primary, 0.34),
    '--cs-navy': CONTENT_BRAND.navy,
    /* On the navy band: white at reduced alpha rather than a sixth colour. A
       grey picked by eye is a colour a white-label install cannot change. */
    '--cs-on-navy-dim': 'rgba(255,255,255,.55)',
    '--cs-on-navy-accent': CONTENT_BRAND.accent,
    '--cs-ink': CONTENT_BRAND.ink,
    '--cs-body': tint(CONTENT_BRAND.ink, 0.76),
    '--cs-dim': tint(CONTENT_BRAND.ink, 0.5),
    '--cs-line': tint(CONTENT_BRAND.ink, 0.12),
    '--cs-well': tint(CONTENT_BRAND.ink, 0.04),
    '--cs-shadow': tint(CONTENT_BRAND.navy, 0.14),
  }), []);

  const slateCount = useMemo(() => postsForWeek(posts, weekOf).length, [posts, weekOf]);
  const todayCount = useMemo(() => todayQueue(posts, weekOf).length, [posts, weekOf]);
  const unusedCount = useMemo(() => researchOrder(research).filter(r => !r.used).length, [research]);

  /* Approved for the CURRENT week, not the whole table: the band sits above a
     week picker, so a number that ignored the week would disagree with the
     cards underneath it — two screens counting the same thing differently,
     which is the most common bug class in this codebase (ENGINEERING.md §2). */
  const approvedCount = useMemo(
    () => postsForWeek(posts, weekOf).filter(p => p.status === 'approved').length,
    [posts, weekOf],
  );
  const overCap = !!(spend && spend.cap > 0 && spend.spent >= spend.cap);

  const TABS = [
    ['slate', 'Slate', slateCount],
    ['today', 'Today', todayCount],
    ['research', 'Research', unusedCount],
    ['brand', 'Brand', context.length],
  ];

  return (
    <div className="cs" style={skin}>
      <style>{CSS}</style>

      {/* THE BAND (WEEKEND1.5 §D). Navy plate, accent rule along the bottom
          edge, live counts on the right in Space Mono. The wordmark is composed
          from BRAND.name rather than typed, so a white-label install gets its
          own name from the env var it already sets — same rendered text here. */}
      <div className="cs-band">
        <div>
          <span className="cs-lbl">Weekly slate · {fmtWeek(weekOf)}</span>
          <h2 className="cs-word">{BRAND.name} <i>Content Studio</i></h2>
        </div>
        <div className="cs-chips">
          <div className="cs-chip">
            <span className="cs-lbl">This week</span>
            <b>{slateCount}</b>
          </div>
          <div className="cs-chip">
            <span className="cs-lbl">Approved</span>
            <b>{approvedCount}</b>
          </div>
          <div className={'cs-chip' + (overCap ? ' over' : '')}>
            <span className="cs-lbl">Spend · month</span>
            {/* A dash, never $0.00, when the ledger could not be read. Those are
                different facts and one of them is a plausible value. */}
            <b>{spend ? `${usd(spend.spent)} / ${usd(spend.cap)}` : '—'}</b>
          </div>
        </div>
      </div>

      <div className="cs-head">
        <div>
          <span className="cs-lbl">Content Studio</span>
          <h1>{tab === 'today' ? 'Post it' : tab === 'research' ? 'What worked elsewhere' : tab === 'brand' ? 'What it sounds like' : 'Next week'}</h1>
        </div>
        <span className="cs-grow" />
        <div className="cs-tabs">
          {TABS.map(([k, label, n]) => (
            <button key={k} className={'cs-tab' + (k === tab ? ' on' : '')} onClick={() => setTab(k)}>
              {label}{n ? <i>{n}</i> : null}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? <div className="cs-empty">Loading…</div>
        : tab === 'slate' ? (
          <Slate posts={posts} surfaces={surfaces} weekOf={weekOf} setWeekOf={setWeekOf} weeks={weeks}
            onPatch={patchPost} onRegenerate={regenerate} busyId={busyId}
            generate={generate} generating={generating} genMsg={genMsg} />
        ) : tab === 'today' ? (
          <Today posts={posts} surfaces={surfaces} weekOf={weekOf} onPatch={patchPost} />
        ) : tab === 'research' ? (
          <Research rows={research} onAdd={addResearch} />
        ) : (
          <Brand rows={context} missing={missing} onSave={saveContext} onDelete={deleteContext}
            onImport={importContext} notice={brandNotice} />
        )}
    </div>
  );
}
