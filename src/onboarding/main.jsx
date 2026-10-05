/* THE ONBOARDING PORTAL A CLIENT OPENS. No login, no database client, no CRM.
   ============================================================================

   Same rules as the proposal page (src/proposal/main.jsx):
   - The token rides in the URL FRAGMENT (#t=...), which browsers never send
     to a server, so it is in no access log or referrer. Only
     api/onboarding-public.js reads it.
   - This bundle imports lib/onboarding (pure) and nothing that talks to the
     database. tests/onboardingpage.mjs checks the bundle for that.

   SAVING. Every answer autosaves: debounced while typing, flushed on every
   section change, and flushed with `keepalive` when the tab is hidden, so
   closing the phone mid-sentence loses at most the last second. What the
   server refuses (an SSN-shaped value, say) comes back naming the field and
   is shown on that field; nothing is saved until it is fixed.

   UPLOADS go straight to Storage on a URL the server signed for one path it
   chose; the server then checks the bytes. The thumbnail is the local file,
   so it appears immediately and nothing is downloaded to show it. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  TOKEN_RE, ctxOf, visibleSections, progress, stillNeeded, missingRequired, withDefaults, SECTIONS,
} from '../lib/onboarding';
import { THEME, themeVars, PORTAL_CSS } from './theme';
import { TopBar, Dashboard, Review, Launched } from './Screens';
import Section from './Section';

export function tokenFromHash(hash) {
  const m = String(hash || '').match(/(?:^#|&)t=([^&]+)/);
  let t = '';
  try { t = m ? decodeURIComponent(m[1]) : ''; } catch { t = ''; }
  return TOKEN_RE.test(t) ? t : '';
}
export const SAVE_DEBOUNCE_MS = 1200;
const API = '/api/onboarding-public';

async function call(body, opts = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...opts });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

/* PUT the file to the signed URL. XHR rather than fetch for one reason:
   upload progress, which fetch cannot report, and a 30 MB video on a phone
   with no progress bar looks frozen. Body shape is supabase-js's
   uploadToSignedUrl: FormData with the file under an empty key. */
function putFile(url, file, mime, onPct) {
  return new Promise(resolve => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload && (xhr.upload.onprogress = e => { if (e.lengthComputable) onPct(e.loaded / e.total); });
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      const fd = new FormData();
      fd.append('cacheControl', '3600');
      fd.append('', new File([file], file.name, { type: mime }));
      xhr.send(fd);
    } catch { resolve(false); }
  });
}
const isPreviewable = f => /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(f.type || '');

export function Portal() {
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [state, setState] = useState({ loading: true });
  const [answers, setAnswers] = useState({});
  const [sections, setSections] = useState({});
  const [files, setFiles] = useState([]);
  const [view, setView] = useState('dash');
  const [save, setSave] = useState({ state: 'saved', at: null });
  const [errors, setErrors] = useState({});
  const [uploads, setUploads] = useState({});
  const [previews, setPreviews] = useState({});
  const [logoPreview, setLogoPreview] = useState(null);
  const [later, setLater] = useState(null);
  const [submit, setSubmit] = useState({ busy: false, error: '' });

  const latest = useRef({ answers: {}, sections: {} });
  const dirty = useRef(false);
  const timer = useRef(null);
  const inflight = useRef(null);
  latest.current = { answers, sections };

  /* ---- load ---- */
  useEffect(() => {
    if (!token) { setState({ error: 'This onboarding link is not valid. Reply to any of our emails and we will send a fresh one.' }); return; }
    call({ t: token, action: 'load' }).then(j => {
      if (!j.ok) { setState({ error: j.error || 'This onboarding could not be loaded.' }); return; }
      const o = j.onboarding;
      setAnswers(o.answers || {}); setSections(o.sections || {}); setFiles(o.files || []);
      setState({ data: o });
      if (o.status === 'submitted') setView('done');
      const biz = (o.answers || {})['biz.name'];
      document.title = `${biz ? biz + ' · ' : ''}Onboarding${o.agency && o.agency.name ? ' · ' + o.agency.name : ''}`;
    }).catch(() => setState({ error: 'This onboarding could not be loaded. Check your connection and try again.' }));
  }, [token]);

  /* ---- save ---- */
  const flush = useCallback(async (opts = {}) => {
    clearTimeout(timer.current);
    if (!dirty.current) return inflight.current;
    dirty.current = false;
    setSave(s => ({ ...s, state: 'saving' }));
    const body = { t: token, action: 'save', answers: latest.current.answers, sections: latest.current.sections };
    const p = call(body, opts.keepalive ? { keepalive: true } : {}).then(j => {
      if (j.ok) { setSave({ state: 'saved', at: j.savedAt || new Date().toISOString() }); setErrors({}); return true; }
      if (j.locked) { setState(s => ({ ...s, data: { ...s.data, status: 'submitted' } })); setView('done'); return false; }
      if (j.field) { setErrors({ [j.field]: j.error }); setSave({ state: 'error', at: null, message: j.error }); return false; }
      dirty.current = true; setSave({ state: 'error', at: null, message: j.error || 'Not saved yet.' });
      timer.current = setTimeout(() => flush(), 5000);       // keep trying; the answers are still on screen
      return false;
    }).catch(() => { dirty.current = true; setSave({ state: 'error', at: null }); timer.current = setTimeout(() => flush(), 5000); return false; });
    inflight.current = p;
    return p;
  }, [token]);

  const schedule = useCallback(() => { dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(() => flush(), SAVE_DEBOUNCE_MS); }, [flush]);
  const setAnswer = useCallback((id, v) => {
    setAnswers(a => { const n = { ...a, [id]: v }; latest.current = { ...latest.current, answers: n }; return n; });
    setErrors(e => (e[id] ? { ...e, [id]: undefined } : e));
    schedule();
  }, [schedule]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') flush({ keepalive: true }); };
    const gone = () => flush({ keepalive: true });
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', gone);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', gone); clearTimeout(timer.current); };
  }, [flush]);

  const data = state.data;
  const cfg = data ? data.config : {};
  const ctx = useMemo(() => ctxOf({ industry: data && data.industry, lender_kind: data && data.lenderKind, products: data && data.products }, answers, cfg), [data, answers, cfg]);
  const prog = useMemo(() => (data ? progress(ctx, answers, files, sections, cfg) : null), [data, ctx, answers, files, sections, cfg]);
  const need = useMemo(() => (data ? stillNeeded(ctx, answers, files, data.checklist, cfg) : []), [data, ctx, answers, files, cfg]);
  const missing = useMemo(() => (data ? missingRequired(ctx, answers, files, cfg) : []), [data, ctx, answers, files, cfg]);
  const business = answers['biz.name'] || '';

  /* ---- navigation: every move saves first ---- */
  const open = useCallback((to, focusField) => {
    flush();
    const s = SECTIONS.find(x => x.id === to);
    if (s) {
      const withD = withDefaults(latest.current.answers, s, ctx);
      if (withD !== latest.current.answers) { setAnswers(withD); latest.current = { ...latest.current, answers: withD }; dirty.current = true; }
    }
    setView(to);
    setTimeout(() => {
      try { window.scrollTo(0, 0); } catch { /* jsdom */ }
      const el = focusField ? document.getElementById('f-' + focusField.replace(/\./g, '-')) : document.getElementById('ob-sec-h');
      if (el && el.focus) { if (!focusField) el.setAttribute('tabindex', '-1'); el.focus(); }
    }, 0);
  }, [flush, ctx]);

  const next = useCallback(() => {
    const vis = visibleSections(ctx);
    const i = vis.findIndex(s => s.id === view);
    const waiting = missingRequired(ctx, latest.current.answers, files, cfg).some(m => m.section === view);
    const nextSecs = { ...latest.current.sections };
    if (!waiting) nextSecs[view] = { done: true }; else delete nextSecs[view];
    setSections(nextSecs); latest.current = { ...latest.current, sections: nextSecs }; dirty.current = true;
    open(vis[i + 1] ? vis[i + 1].id : 'review');
  }, [ctx, view, files, cfg, open]);
  const back = useCallback(() => {
    const vis = visibleSections(ctx); const i = vis.findIndex(s => s.id === view);
    open(i > 0 ? vis[i - 1].id : 'dash');
  }, [ctx, view, open]);

  /* ---- uploads ---- */
  const onUpload = useCallback(async (slot, list) => {
    for (const file of list) {
      const key = Math.random().toString(36).slice(2);
      const preview = isPreviewable(file) ? URL.createObjectURL(file) : null;
      const set = patch => setUploads(u => ({ ...u, [key]: { ...(u[key] || {}), ...patch } }));
      const fail = msg => { set({ error: msg }); setTimeout(() => setUploads(u => { const n = { ...u }; delete n[key]; return n; }), 6000); };
      set({ key, slot, name: file.name, pct: 0, preview });
      const sg = await call({ t: token, action: 'upload-sign', slot, name: file.name, bytes: file.size }).catch(() => ({ ok: false }));
      if (!sg.ok) { fail(sg.error || 'Could not upload.'); continue; }
      const put = await putFile(sg.uploadUrl, file, sg.mime, pct => set({ pct }));
      if (!put) { fail('Upload failed. Try again.'); continue; }
      const done = await call({ t: token, action: 'upload-done', path: sg.path }).catch(() => ({ ok: false }));
      if (!done.ok) { fail(done.error || 'Could not save that upload.'); continue; }
      setFiles(prev => {
        const known = new Set(prev.map(x => x.id));
        const added = (done.files || []).filter(x => !known.has(x.id) && x.name === file.name);
        if (preview && added[0]) setPreviews(p => ({ ...p, [added[0].id]: preview }));
        return done.files || prev;
      });
      if (slot === 'logos' && preview) setLogoPreview(preview);
      setUploads(u => { const n = { ...u }; delete n[key]; return n; });
    }
  }, [token]);
  const onRemove = useCallback(async id => {
    const j = await call({ t: token, action: 'file-remove', id }).catch(() => ({ ok: false }));
    if (j.ok) setFiles(j.files || []);
  }, [token]);

  const sendLater = useCallback(async () => {
    await flush();
    setLater('sending');
    const j = await call({ t: token, action: 'resume-mail' }).catch(() => ({ ok: false }));
    setLater(j.ok ? 'sent' : { error: j.error || 'That did not go out. Everything is saved.' });
  }, [token, flush]);

  const doSubmit = useCallback(async () => {
    setSubmit({ busy: true, error: '' });
    dirty.current = true; await flush();
    const j = await call({ t: token, action: 'submit' }).catch(() => ({ ok: false }));
    if (!j.ok) { setSubmit({ busy: false, error: j.error || 'We could not submit just now. Everything is saved; try again in a moment.' }); return; }
    setState(s => ({ ...s, data: j.onboarding }));
    setSubmit({ busy: false, error: '' });
    setView('done');
    try { window.scrollTo(0, 0); } catch { /* jsdom */ }
  }, [token, flush]);

  const rootStyle = useMemo(() => Object.fromEntries(Object.entries(THEME).map(([k, v]) => [`--o-${k}`, v])), []);
  if (state.loading) return <div className="ob" style={rootStyle}><div className="ob-msg"><p>Loading your onboarding…</p></div></div>;
  if (state.error) return <div className="ob" style={rootStyle}><div className="ob-msg"><h1>Onboarding unavailable</h1><p>{state.error}</p></div></div>;

  const locked = data.status === 'submitted';
  const live = { ...data, answers };
  const sec = SECTIONS.find(s => s.id === view && s.when(ctx));
  const upload = { uploads, previews, onUpload, onRemove, logoPreview, disabled: locked };
  return (<div className="ob" style={rootStyle}>
    <a href="#main" className="sr">Skip to content</a>
    <TopBar data={live} business={business} save={save} onHome={() => open(locked ? 'done' : 'dash')} />
    {view === 'done' || locked
      ? <Launched data={live} business={business} need={need} />
      : sec
        ? <Section s={sec} ctx={ctx} cfg={cfg} answers={answers} files={files} errors={errors} setAnswer={setAnswer} upload={upload}
            onBack={back} onNext={next} onLater={sendLater} laterState={later} locked={locked} />
        : view === 'review'
          ? <Review data={live} ctx={ctx} cfg={cfg} answers={answers} files={files} need={need} missing={missing} onOpen={open} onSubmit={doSubmit} submitting={submit.busy} error={submit.error} />
          : <Dashboard data={live} ctx={ctx} prog={prog} need={need} business={business} onOpen={open} />}
  </div>);
}

if (typeof document !== 'undefined' && document.getElementById('root') && !globalThis.__NO_MOUNT__) {
  const style = document.createElement('style'); style.textContent = `:root{${themeVars()}}` + PORTAL_CSS; document.head.appendChild(style);
  createRoot(document.getElementById('root')).render(<Portal />);
}
