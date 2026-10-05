/* One input per field type, for the portal and the CRM's answer editor.
   ============================================================================

   Every input has a real <label> (or a <fieldset><legend> for a group), so a
   screen reader names it and a tap on the words focuses it. Chips and tiles
   are real radio and checkbox inputs underneath, so the keyboard works
   without any handlers of our own. Values are shaped exactly as
   lib/onboarding cleanAnswers() expects; that function is the authority, and
   anything this file gets wrong is corrected (or refused) on the server. */
import React, { useRef, useState } from 'react';
import { THEME } from './theme';
import {
  fieldLabel, fieldHint, fieldOptions, isRequired, pipelineFor, accessGuide, FILE_SLOTS, EXT_MIME, paletteFrom,
} from '../lib/onboarding';

const A = v => (Array.isArray(v) ? v : []);
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const INPUT = {
  email: { type: 'email', inputMode: 'email', autoComplete: 'email' },
  phone: { type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
  url: { type: 'url', inputMode: 'url', placeholder: 'Paste a link…' },
  number: { type: 'text', inputMode: 'decimal' },
  date: { type: 'date' },
  text: { type: 'text' },
};
const AUTOCOMPLETE = { 'biz.contact_name': 'name', 'biz.name': 'organization', 'biz.address': 'street-address', 'tx.address': 'street-address' };

function Plain({ f, id, value, onChange, bad }) {
  const p = INPUT[f.type] || INPUT.text;
  if (f.type === 'long') return <textarea id={id} className={'ob-in' + (bad ? ' bad' : '')} value={value || ''} onChange={e => onChange(e.target.value)} aria-invalid={bad || undefined} />;
  return <input id={id} className={'ob-in' + (bad ? ' bad' : '')} {...p} autoComplete={AUTOCOMPLETE[f.id] || p.autoComplete} value={value || ''} onChange={e => onChange(e.target.value)} aria-invalid={bad || undefined} />;
}

function Choice({ f, name, options, value, onChange, multi, max }) {
  const vals = multi ? A(value) : [value];
  const tiles = multi || options.some(o => o.d);
  const toggle = v => {
    if (!multi) return onChange(v);
    const has = vals.includes(v);
    if (!has && max && vals.length >= max) return;          // "up to 3": the 4th is ignored, not swapped
    onChange(has ? vals.filter(x => x !== v) : [...vals, v]);
  };
  return (<div className={tiles ? 'ob-tiles' : 'ob-chips'}>
    {options.map(o => {
      const on = vals.includes(o.v);
      return (<label key={o.v} className={(tiles ? 'ob-tile' : 'ob-chip') + (on ? ' on' : '')}>
        <input type={multi ? 'checkbox' : 'radio'} name={name} checked={on} onChange={() => toggle(o.v)} />
        {o.l}{o.d && <small>{o.d}</small>}
      </label>);
    })}
  </div>);
}

function Tags({ id, value, onChange, max }) {
  const [draft, setDraft] = useState('');
  const list = A(value);
  const add = () => { const t = draft.trim(); if (!t || list.includes(t) || (max && list.length >= max)) { setDraft(''); return; } onChange([...list, t]); setDraft(''); };
  return (<>
    {list.length > 0 && <div className="ob-tags">{list.map(t => <span className="ob-tag" key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(list.filter(x => x !== t))}>×</button></span>)}</div>}
    <input id={id} className="ob-in" value={draft} onChange={e => setDraft(e.target.value)} onBlur={add}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} placeholder={max && list.length >= max ? `That's ${max}` : 'Type and press Enter'} disabled={!!max && list.length >= max} />
  </>);
}

/* "Pulled from my logo" reads the logo the client uploaded IN THIS VISIT,
   from its local preview, on a canvas: nothing is fetched or sent. A logo
   uploaded on an earlier visit has no local copy, so the button says so. */
async function colorsFromImage(url) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
  const w = Math.min(160, img.naturalWidth || 160), h = Math.max(1, Math.round(w * ((img.naturalHeight || 1) / (img.naturalWidth || 1))));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  return paletteFrom(g.getImageData(0, 0, w, h).data, 3);
}
function Colors({ value, onChange, logoPreview }) {
  const v = value && typeof value === 'object' ? value : { mode: 'pick', list: [] };
  const list = A(v.list);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const set = (patch) => onChange({ mode: v.mode, list, ...patch });
  const pull = async () => {
    if (!logoPreview) { setNote('Upload your logo above first, then tap this.'); return; }
    setBusy(true); setNote('');
    try { const got = await colorsFromImage(logoPreview); if (got.length) set({ mode: 'logo', list: got }); else setNote('We could not find colors in that file. Pick them instead.'); }
    catch { setNote('We could not read that file here. Pick your colors instead.'); }
    setBusy(false);
  };
  return (<>
    <div className="ob-sw">
      {v.mode !== 'decide' && list.map((hex, i) => (
        <span className="ob-swatch" key={i} style={{ background: hex }}>
          <input type="color" value={hex.toLowerCase()} aria-label={`Color ${i + 1}, ${hex}`} onChange={e => set({ mode: 'pick', list: list.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)) })} />
          <button type="button" aria-label={`Remove color ${hex}`} onClick={() => set({ list: list.filter((_, j) => j !== i) })}>×</button>
        </span>))}
      {v.mode !== 'decide' && list.length < 8 && <button type="button" className="ob-chip" onClick={() => set({ mode: v.mode === 'logo' ? 'logo' : 'pick', list: [...list, THEME.elec] })}>+ Add a color</button>}
      <button type="button" className={'ob-chip' + (v.mode === 'logo' ? ' on' : '')} aria-pressed={v.mode === 'logo'} onClick={pull} disabled={busy}>{busy ? 'Reading your logo…' : 'Pulled from my logo'}</button>
      <button type="button" className={'ob-chip' + (v.mode === 'decide' ? ' on' : '')} aria-pressed={v.mode === 'decide'} onClick={() => onChange(v.mode === 'decide' ? { mode: 'pick', list } : { mode: 'decide', list })}>You decide</button>
    </div>
    {note && <small className="h" role="status" style={{ marginTop: 8 }}>{note}</small>}
  </>);
}

function Hours({ value, onChange, id }) {
  const v = value && typeof value === 'object' ? value : { mode: 'hours', days: {} };
  const day = d => ({ open: false, from: '09:00', to: '17:00', ...((v.days || {})[d] || {}) });
  const setDay = (d, patch) => onChange({ ...v, days: { ...(v.days || {}), [d]: { ...day(d), ...patch } } });
  return (<>
    <div className="ob-chips" role="radiogroup" aria-label="Hours" style={{ marginBottom: 10 }}>
      {[['hours', 'Set my hours'], ['appt', 'By appointment']].map(([m, l]) => (
        <label key={m} className={'ob-chip' + (v.mode === m ? ' on' : '')}><input type="radio" name={id + '-mode'} checked={v.mode === m} onChange={() => onChange({ ...v, mode: m })} />{l}</label>))}
    </div>
    {v.mode !== 'appt' && <div className="ob-hours">{DAYS.map(([d, l]) => { const x = day(d); return (
      <div className="d" key={d}>
        <label className="ob-check"><input type="checkbox" checked={x.open} onChange={e => setDay(d, { open: e.target.checked })} />{l.slice(0, 3)}</label>
        <input className="ob-in" type="time" aria-label={`${l} opens`} value={x.from} disabled={!x.open} onChange={e => setDay(d, { from: e.target.value })} />
        <input className="ob-in" type="time" aria-label={`${l} closes`} value={x.to} disabled={!x.open} onChange={e => setDay(d, { to: e.target.value })} />
      </div>); })}</div>}
  </>);
}

function List({ f, id, value, onChange }) {
  const rows = A(value);
  const max = f.max || 20;
  const shown = rows.length ? rows : (f.min ? Array.from({ length: f.min }, () => ({})) : [{}]);
  const setRow = (i, k, x) => { const next = shown.map((r, j) => (j === i ? { ...r, [k]: x } : r)); onChange(next); };
  return (<>
    {shown.map((r, i) => (<div className="ob-row" key={i} role="group" aria-label={`${fieldLabel(f, {})} ${i + 1}`}>
      {f.fields.map(sf => {
        const sid = `${id}-${i}-${sf.id}`;
        if (sf.type === 'check') return <label key={sf.id} className="ob-check"><input id={sid} type="checkbox" checked={r[sf.id] === true} onChange={e => setRow(i, sf.id, e.target.checked)} />{sf.label}</label>;
        if (sf.type === 'select') return (<label key={sf.id} htmlFor={sid}><span className="sr">{sf.label}</span>
          <select id={sid} className="ob-in" value={r[sf.id] || ''} onChange={e => setRow(i, sf.id, e.target.value)}>
            <option value="">{sf.label}</option>{A(sf.options).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>);
        const p = INPUT[sf.type] || INPUT.text;
        return <label key={sf.id} htmlFor={sid}><span className="sr">{sf.label}</span><input id={sid} className="ob-in" {...p} placeholder={sf.label} value={r[sf.id] || ''} onChange={e => setRow(i, sf.id, e.target.value)} /></label>;
      })}
      {(f.min ? shown.length > f.min : rows.length > 0) && <button type="button" className="x" onClick={() => onChange(shown.filter((_, j) => j !== i))}>Remove</button>}
    </div>))}
    {shown.length < max && !(f.min && f.max === f.min) && <button type="button" className="ob-add" onClick={() => onChange([...shown, {}])}>+ Add {f.id === 'suite.team' ? 'a person' : 'another'}</button>}
  </>);
}

function Pipeline({ value, onChange, ctx, cfg, id }) {
  const stages = A(value).length ? A(value) : pipelineFor(ctx, cfg);
  const set = next => onChange(next.filter(s => s !== null));
  const move = (i, d) => { const n = stages.slice(); const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set(n); };
  return (<div className="ob-pipe">
    {stages.map((s, i) => (<div className="s" key={i}>
      <b aria-hidden="true">{i + 1}</b>
      <label htmlFor={`${id}-${i}`}><span className="sr">Stage {i + 1}</span><input id={`${id}-${i}`} className="ob-in" value={s} onChange={e => set(stages.map((x, j) => (j === i ? e.target.value : x)))} /></label>
      <span className="ctl">
        <button type="button" aria-label={`Move ${s || 'stage'} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" aria-label={`Move ${s || 'stage'} down`} disabled={i === stages.length - 1} onClick={() => move(i, 1)}>↓</button>
        <button type="button" aria-label={`Remove ${s || 'stage'}`} disabled={stages.length <= 2} onClick={() => set(stages.filter((_, j) => j !== i))}>×</button>
      </span>
    </div>))}
    {stages.length < 20 && <button type="button" className="ob-add" onClick={() => set([...stages, 'New stage'])}>+ Add a stage</button>}
  </div>);
}

function Access({ f, id, value, onChange, answers, cfg }) {
  const v = value && typeof value === 'object' ? value : { done: false, method: 'invite' };
  const steps = accessGuide(f.guide, { agency: cfg.agency || 'us', agencyEmail: cfg.agencyEmail || '', registrar: answers['web.registrar'] || '' });
  return (<div className="ob-access">
    {f.guide === 'domain' && <div className="ob-chips" style={{ marginBottom: 8 }}>
      {[['invite', 'Invite you to it'], ['dns', 'Send me the 2 DNS records instead']].map(([m, l]) => (
        <label key={m} className={'ob-chip' + (v.method === m ? ' on' : '')}><input type="radio" name={id + '-m'} checked={v.method === m} onChange={() => onChange({ ...v, method: m })} />{l}</label>))}
    </div>}
    {v.method === 'dns' && f.guide === 'domain'
      ? <p style={{ fontSize: 13.5 }}>Perfect. We'll email you the two records to add, with exactly where they go.</p>
      : <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
    {!(v.method === 'dns' && f.guide === 'domain') && <label className="ob-check"><input type="checkbox" checked={v.done === true} onChange={e => onChange({ ...v, done: e.target.checked })} />Done. We'll check it on our side.</label>}
  </div>);
}

/* ---- files ---- */
const KB = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export function FileDrop({ f, id, files, uploads, previews, onUpload, onRemove, disabled }) {
  const slot = FILE_SLOTS[f.slot];
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const mine = A(files).filter(x => x.slot === f.slot);
  const busy = Object.values(uploads || {}).filter(u => u.slot === f.slot);
  const accept = [...new Set(slot.exts.map(e => '.' + e).concat(slot.exts.map(e => EXT_MIME[e])))].join(',');
  const take = list => { const arr = [...(list || [])]; if (arr.length) onUpload(f.slot, arr); if (inputRef.current) inputRef.current.value = ''; };
  return (<div className="ob-drop">
    {(mine.length > 0 || busy.length > 0) && <div className="ob-thumbs">
      {mine.map(x => (<div className="ob-thumb" key={x.id}>
        {previews[x.id] ? <img src={previews[x.id]} alt={x.name} /> : <span>📄<br />{x.name}</span>}
        {!disabled && <button type="button" aria-label={`Remove ${x.name}`} onClick={() => onRemove(x.id)}>×</button>}
      </div>))}
      {busy.map(u => (<div className="ob-thumb" key={u.key} aria-live="polite">
        {u.preview ? <img src={u.preview} alt="" /> : <span>{u.name}</span>}
        {u.error ? <span style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', color: 'var(--o-bad)', padding: 4 }}>{u.error}</span>
          : <span className="bar"><i style={{ width: `${Math.round((u.pct || 0) * 100)}%` }} /></span>}
      </div>))}
    </div>}
    {!disabled && <div className={'ob-dz' + (over ? ' over' : '')}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer && e.dataTransfer.files); }}>
      <input ref={inputRef} id={id} type="file" multiple accept={accept} onChange={e => take(e.target.files)} aria-describedby={id + '-h'} />
      {mine.length ? <>✓ <b>{mine.length === 1 ? mine[0].name : `${mine.length} files`}</b> uploaded · <b>Add more</b></> : <><b>Drop files here</b> or tap to choose</>}
      <span className="ph">Easiest on a computer. Or reply to any of our emails with the files.</span>
      <span style={{ display: 'block', fontSize: 11.5, marginTop: 4 }}>{slot.exts.map(e => e.toUpperCase()).join(', ')} · up to 50 MB each{mine.length ? ` · ${KB(mine.reduce((a, x) => a + (Number(x.bytes) || 0), 0))} so far` : ''}</span>
    </div>}
  </div>);
}

/* ---- the field ---- */
export function Field({ f, value, onChange, ctx, cfg, answers, files, error, upload }) {
  const id = 'f-' + f.id.replace(/\./g, '-');
  const label = fieldLabel(f, ctx);
  const hint = fieldHint(f, ctx, cfg);
  const req = isRequired(f, ctx, answers, files);
  const set = v => onChange(f.id, v);
  const head = (tag = 'label') => {
    const inner = <>{label}{req && <span className="req" aria-hidden="true">*</span>}{req && <span className="sr"> (required)</span>}</>;
    return tag === 'legend' ? <legend>{inner}</legend> : tag === 'div' ? <div className="lbl" id={id + '-l'}>{inner}</div> : <label htmlFor={id}>{inner}</label>;
  };
  const hintEl = hint ? <small className="h" id={id + '-h'}>{hint}</small> : null;
  const err = error ? <div className="er" role="alert">{error}</div> : null;

  if (f.type === 'note') return <div className="ob-q"><div className="ob-info">{label}</div></div>;
  if (f.type === 'check') return (<div className="ob-q">
    <label className="ob-check"><input id={id} type="checkbox" checked={value === true} onChange={e => set(e.target.checked)} />
      <span>{label}{req && <span className="req" aria-hidden="true">*</span>}</span></label>{hintEl}{err}</div>);
  if (f.type === 'select' || f.type === 'multi') {
    const options = fieldOptions(f, ctx, cfg);
    const val = f.type === 'multi' && value === undefined && f.defaultFor ? f.defaultFor(ctx) : value;
    return (<div className="ob-q"><fieldset aria-describedby={hint ? id + '-h' : undefined}>{head('legend')}{hintEl}
      <Choice f={f} name={id} options={options} value={val} onChange={set} multi={f.type === 'multi'} max={f.max} /></fieldset>{err}</div>);
  }
  if (f.type === 'file') return (<div className="ob-q">{head('label')}{hintEl}
    <FileDrop f={f} id={id} files={files} {...upload} />{err}</div>);
  let body;
  if (f.type === 'tags') body = <Tags id={id} value={value} onChange={set} max={f.max} />;
  else if (f.type === 'colors') body = <Colors value={value} onChange={set} logoPreview={upload && upload.logoPreview} />;
  else if (f.type === 'hours') body = <Hours id={id} value={value} onChange={set} />;
  else if (f.type === 'list') body = <List f={f} id={id} value={value} onChange={set} />;
  else if (f.type === 'pipeline') body = <Pipeline id={id} value={value} onChange={set} ctx={ctx} cfg={cfg} />;
  else if (f.type === 'access') body = <Access f={f} id={id} value={value} onChange={set} answers={answers} cfg={cfg} />;
  else body = <Plain f={f} id={id} value={value} onChange={set} bad={!!error} />;
  const group = ['colors', 'hours', 'list', 'pipeline', 'access'].includes(f.type);
  return (<div className="ob-q">
    {group ? <div role="group" aria-labelledby={id + '-l'}>{head('div')}{hintEl}{body}</div> : <>{head('label')}{hintEl}{body}</>}
    {err}
  </div>);
}
