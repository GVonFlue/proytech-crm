import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Copy, Check, Trash2, AlertTriangle, ShieldAlert, CheckCircle2,
  Server, Palette, LayoutGrid, ListChecks, Building2, KeyRound,
} from 'lucide-react';
import {
  TEMPLATE_SECTIONS, TEMPLATE_COLORS, TEMPLATE_VERSION, TEMPLATE_REPO,
  PRESETS, blankInstall, diffEnv, envText, SECRET_KEYS, preflight, runbook,
} from './lib/provision';

/* ============================================================================
   BuildConsole.jsx — provisioning a client CRM from inside ours.

   WHAT IT DOES. Produces the environment variable list that configures one
   install of the realtor template, plus the runbook to stand it up. Saved
   installs live in app_settings under the key 'installs', through the same
   getInstalls/saveInstalls pair the invoices and txns rows use, so this needed
   no migration and inherits whatever policy already guards that table.

   WHAT IT DELIBERATELY DOES NOT DO. It does not deploy. Creating the Vercel
   project and writing the variables means holding a Vercel token and a GitHub
   token with repo-create scope, and neither belongs in a browser. When that is
   built it goes behind /api with the tokens server side, and this screen keeps
   its shape and grows a button.

   It also never generates, stores or displays a secret. Supabase keys, the
   client's Anthropic key and the lead intake token are listed BY NAME so an
   install sheet is complete, and their values never pass through here. A leak
   of the installs row leaks somebody's brand colours.

   ENGINEERING.md §1, the invisible tab. This ships as module key 'build' and
   needs the modulesV bump and backfill in App.jsx, or it exists and nobody
   ever sees it.

   ENGINEERING.md §2, two screens disagreeing. Every number and every string on
   this screen is derived from src/lib/provision.js. The preview, the variable
   block and the preflight checks all read the same functions, so the sidebar
   preview cannot show one colour while the generated variable says another.
   ============================================================================ */

const B = {
  card: { background: '#fff', border: '1px solid #E6E8EF', borderRadius: 14, padding: 18 },
  lab: { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5, color: '#111528' },
  hint: { display: 'block', fontWeight: 400, color: '#5B6478', fontSize: 11.5, marginTop: 2 },
  inp: {
    width: '100%', font: 'inherit', fontSize: 13.5, padding: '8px 10px',
    border: '1px solid #E6E8EF', borderRadius: 8, marginBottom: 13, background: '#fff',
  },
  legend: {
    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 10,
    letterSpacing: '.15em', textTransform: 'uppercase', color: '#D97706', fontWeight: 700,
    display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13,
  },
  pre: {
    background: '#000110', color: '#E6E9F5', borderRadius: 11, padding: '15px 17px',
    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12,
    lineHeight: 1.8, overflowX: 'auto', whiteSpace: 'pre', margin: 0,
  },
};

function Field({ label, hint, value, onChange, placeholder, area }) {
  const Tag = area ? 'textarea' : 'input';
  return (
    <div>
      <label style={B.lab}>{label}{hint && <span style={B.hint}>{hint}</span>}</label>
      <Tag
        style={{ ...B.inp, ...(area ? { minHeight: 58, resize: 'vertical' } : {}) }}
        value={value || ''}
        placeholder={placeholder || ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

export default function BuildConsole({ installs, saveInstalls }) {
  const list = Array.isArray(installs) ? installs : [];
  const [sel, setSel] = useState(list.length ? 0 : -1);
  const [tab, setTab] = useState('setup');
  const [copied, setCopied] = useState('');

  useEffect(() => { if (sel >= list.length) setSel(list.length - 1); }, [list.length, sel]);

  const x = sel >= 0 ? list[sel] : null;

  const env = useMemo(() => (x ? diffEnv(x) : []), [x]);
  const flags = useMemo(() => (x ? preflight(x) : []), [x]);
  const steps = useMemo(() => (x ? runbook(x) : []), [x]);

  const patch = fields => {
    const next = list.slice();
    next[sel] = { ...next[sel], ...fields };
    saveInstalls(next);
  };
  const addInstall = () => { saveInstalls([...list, blankInstall()]); setSel(list.length); setTab('setup'); };
  const removeInstall = i => {
    if (!window.confirm('Delete this install configuration? The deployed project is not affected.')) return;
    saveInstalls(list.filter((_, n) => n !== i));
  };
  const copy = (text, key) => {
    const done = () => { setCopied(key); setTimeout(() => setCopied(''), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => {});
    else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing to do */ }
      document.body.removeChild(ta);
    }
  };

  const toggleMod = k => {
    const m = x.modules || [];
    patch({ modules: m.includes(k) ? m.filter(v => v !== k) : [...m, k] });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

      {/* ---------------- install list ---------------- */}
      <div style={{ ...B.card, padding: 13, position: 'sticky', top: 12 }}>
        <div style={{ ...B.legend, marginBottom: 10 }}><Server size={12} /> Installs</div>
        {list.map((it, i) => (
          <button
            key={i}
            onClick={() => setSel(i)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', font: 'inherit', fontSize: 13,
              padding: '8px 10px', borderRadius: 8, marginBottom: 3, cursor: 'pointer',
              border: '1px solid ' + (i === sel ? '#1338DE' : 'transparent'),
              background: i === sel ? '#F1F4FE' : 'transparent',
              fontWeight: i === sel ? 700 : 500, color: '#111528',
            }}
          >
            {it.name || it.id || 'Untitled'}
            <span style={{ display: 'block', fontFamily: 'ui-monospace,monospace', fontSize: 10.5, color: '#5B6478', fontWeight: 400 }}>
              {it.id || 'no id'}
            </span>
          </button>
        ))}
        {!list.length && <p style={{ fontSize: 12.5, color: '#5B6478', margin: '0 0 8px' }}>No installs yet.</p>}
        <button
          onClick={addInstall}
          style={{ width: '100%', marginTop: 8, background: 'transparent', border: '1px dashed #C7CCDA',
                   color: '#5B6478', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 12.5, cursor: 'pointer' }}
        >
          <Plus size={12} style={{ verticalAlign: -2 }} /> New install
        </button>
        <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#5B6478', lineHeight: 1.7, marginTop: 13, paddingTop: 11, borderTop: '1px solid #E6E8EF' }}>
          Template {TEMPLATE_VERSION}<br />{TEMPLATE_REPO}
        </p>
      </div>

      {/* ---------------- editor ---------------- */}
      <div>
        {!x && (
          <div style={B.card}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Nothing selected</h3>
            <p style={{ margin: 0, color: '#5B6478', fontSize: 13.5 }}>
              Add an install to generate the environment variables that configure one client CRM.
            </p>
          </div>
        )}

        {x && (
          <>
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E6E8EF', marginBottom: 16 }}>
              {[['setup', 'Setup'], ['modules', 'Modules'], ['output', 'Variables'], ['runbook', 'Runbook']].map(([k, lbl]) => (
                <button key={k} onClick={() => setTab(k)} style={{
                  background: 'none', border: 'none', borderBottom: '2px solid ' + (tab === k ? '#1338DE' : 'transparent'),
                  font: 'inherit', fontSize: 13.5, fontWeight: 700, padding: '8px 12px', marginBottom: -1,
                  color: tab === k ? '#1338DE' : '#5B6478', cursor: 'pointer',
                }}>{lbl}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={() => removeInstall(sel)} title="Delete this configuration" style={{
                background: 'none', border: 'none', color: '#D14343', cursor: 'pointer', padding: '8px 10px',
              }}><Trash2 size={15} /></button>
            </div>

            {/* -------- preview, on every tab, because it is the point -------- */}
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', border: '1px solid #E6E8EF',
                          borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
              <div style={{ background: x.colors?.ink || '#111528', color: '#fff', padding: '14px 12px' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.15 }}>{x.name || 'Dwell Real Estate Group'}</div>
                <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 9, letterSpacing: '.13em',
                              textTransform: 'uppercase', marginTop: 3, color: x.colors?.gold || '#C8A24A' }}>
                  {x.short || 'dwellWICHITA'}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
                  {(x.modules?.length ? x.modules : PRESETS.all).slice(0, 6).map((k, i) => {
                    const s = TEMPLATE_SECTIONS.find(t => t[0] === k);
                    return (
                      <li key={k} style={{
                        fontSize: 11, padding: '3px 7px', borderRadius: 5, marginBottom: 1,
                        opacity: i === 0 ? 1 : .8, fontWeight: i === 0 ? 700 : 400,
                        background: i === 0 ? (x.colors?.cobalt || '#1338DE') : 'transparent',
                      }}>{s ? s[1] : k}</li>
                    );
                  })}
                </ul>
              </div>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{x.product || 'ProyTech Business Suite'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {[['cobalt', 'Primary'], ['gold', 'Accent'], ['green', 'Won'], ['red', 'Lost']].map(([k, lbl]) => (
                    <span key={k} style={{
                      fontFamily: 'ui-monospace,monospace', fontSize: 9.5, letterSpacing: '.09em',
                      textTransform: 'uppercase', padding: '4px 8px', borderRadius: 5,
                      background: x.colors?.[k], color: k === 'gold' ? (x.colors?.ink || '#111528') : '#fff',
                    }}>{lbl}</span>
                  ))}
                </div>
                <p style={{ color: '#5B6478', fontSize: 12.5, margin: '12px 0 0' }}>
                  {x.bizName || '—'}{x.license ? ` · Licence ${x.license}` : ''}
                </p>
              </div>
            </div>

            {/* -------------------------- SETUP -------------------------- */}
            {tab === 'setup' && (
              <>
                <div style={{ ...B.card, marginBottom: 16 }}>
                  <div style={B.legend}><Building2 size={12} /> Identity</div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Install id" hint="Lowercase. Becomes VITE_BRAND_ID and the asset folder."
                             value={x.id} placeholder="alexcolon" onChange={v => patch({ id: v })} />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Client name" hint="Shows in their sidebar."
                             value={x.name} placeholder="Alexander Colón" onChange={v => patch({ name: v })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Sidebar mark" value={x.short} placeholder="colónWICHITA" onChange={v => patch({ short: v })} />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Assistant name" hint="Blank becomes the word Assistant."
                             value={x.ai} placeholder="Lark" onChange={v => patch({ ai: v })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Product name" value={x.product} placeholder="Alexander Colón Business Suite" onChange={v => patch({ product: v })} />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Browser tab title" value={x.title} placeholder="Alexander Colón — Business Suite" onChange={v => patch({ title: v })} />
                    </div>
                  </div>
                  <div style={{ borderLeft: '3px solid #FB6926', background: '#FFF7F2', padding: '10px 13px',
                                borderRadius: '0 8px 8px 0', fontSize: 12.5, margin: '0 0 13px' }}>
                    <b>Auth domain is pinned deliberately.</b> Sign-in maps a bare username to
                    username@authDomain. Changing it after anyone has logged in locks out every user who
                    signs in without a full email. Decide it once, at install.
                  </div>
                  <Field label="Auth domain" value={x.authDomain} onChange={v => patch({ authDomain: v })} />
                </div>

                <div style={{ ...B.card, marginBottom: 16 }}>
                  <div style={B.legend}><ListChecks size={12} /> Business details</div>
                  <div style={{ borderLeft: '3px solid #FB6926', background: '#FFF7F2', padding: '10px 13px',
                                borderRadius: '0 8px 8px 0', fontSize: 12.5, margin: '0 0 13px' }}>
                    These print on client-facing output. For an agent under a brokerage the business name
                    is <b>the brokerage</b>, not the agent: most states require the supervising broker on
                    advertising, and a net sheet is advertising.
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Business name" value={x.bizName} placeholder="At Home Wichita Real Estate" onChange={v => patch({ bizName: v })} />
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <Field label="Licence number" value={x.license} placeholder="00252387" onChange={v => patch({ license: v })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Email" value={x.email} onChange={v => patch({ email: v })} />
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <Field label="Phone" value={x.phone} onChange={v => patch({ phone: v })} />
                    </div>
                  </div>
                  <Field area label="Address" hint="Line breaks survive: they are encoded and decoded by brand.js."
                         value={x.address} onChange={v => patch({ address: v })} />
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label style={B.lab}>Timezone</label>
                      <select style={B.inp} value={x.tz} onChange={e => patch({ tz: e.target.value })}>
                        {['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles',
                          'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Field label="Logo URL" hint="Optional. Blank falls back to the bundled mark."
                             value={x.logo} onChange={v => patch({ logo: v })} />
                    </div>
                  </div>
                  <Field label="Their website repo" hint="Optional. Recorded so the lead webhook has a known other end."
                         value={x.siteRepo} placeholder="GVonFlue/alexcolon-site" onChange={v => patch({ siteRepo: v })} />
                </div>

                <div style={{ ...B.card, marginBottom: 16 }}>
                  <div style={B.legend}><Palette size={12} /> Colours</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '0 18px' }}>
                    {TEMPLATE_COLORS.map(c => (
                      <div key={c[0]} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, width: 52, flex: 'none' }}>{c[1]}</span>
                        <input type="color" value={x.colors?.[c[0]] || c[2]}
                               onChange={e => patch({ colors: { ...x.colors, [c[0]]: e.target.value } })}
                               style={{ width: 38, height: 32, padding: 0, border: '1px solid #E6E8EF', borderRadius: 7, background: 'none', flex: 'none', cursor: 'pointer' }} />
                        <input type="text" value={x.colors?.[c[0]] || c[2]}
                               onChange={e => patch({ colors: { ...x.colors, [c[0]]: e.target.value } })}
                               style={{ ...B.inp, margin: 0, fontFamily: 'ui-monospace,monospace', fontSize: 12.5 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ borderLeft: '3px solid #FB6926', background: '#FFF7F2', padding: '10px 13px',
                                borderRadius: '0 8px 8px 0', fontSize: 12.5 }}>
                    <b>Green and red are outcomes, not brand colours.</b> They mean won and lost across the
                    whole product. Bending them to fit a palette makes a lost deal read as a won one.
                  </div>
                </div>

                <div style={B.card}>
                  <div style={B.legend}><ListChecks size={12} /> Notes</div>
                  <Field area label="Anything the next person needs" hint="Who holds the intake token, what is still unverified, what the client asked for and did not get."
                         value={x.notes} onChange={v => patch({ notes: v })} />
                </div>
              </>
            )}

            {/* ------------------------- MODULES ------------------------- */}
            {tab === 'modules' && (
              <div style={B.card}>
                <div style={B.legend}><LayoutGrid size={12} /> Modules</div>
                <div style={{ borderLeft: '3px solid #FB6926', background: '#FFF7F2', padding: '10px 13px',
                              borderRadius: '0 8px 8px 0', fontSize: 12.5, marginBottom: 14 }}>
                  These become one comma-separated <b>VITE_MODULES</b> string, which gates their sidebar.
                  Every box ticked emits nothing, because an empty list means everything is on. Same
                  install, one fewer variable to read past.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8, marginBottom: 14 }}>
                  {TEMPLATE_SECTIONS.map(s => {
                    const on = (x.modules || []).includes(s[0]);
                    return (
                      <label key={s[0]} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                        border: '1px solid ' + (on ? '#1338DE' : '#E6E8EF'), borderRadius: 9,
                        padding: '9px 11px', background: on ? '#F1F4FE' : '#fff',
                      }}>
                        <input type="checkbox" checked={on} onChange={() => toggleMod(s[0])}
                               style={{ width: 16, height: 16, marginTop: 2, accentColor: '#1338DE', flex: 'none' }} />
                        <span>
                          <b style={{ display: 'block', fontSize: 13 }}>{s[1]}</b>
                          <small style={{ display: 'block', color: '#5B6478', fontSize: 11.5, lineHeight: 1.4 }}>{s[2]}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['solo', 'Solo agent'], ['team', 'Team'], ['all', 'Everything']].map(([k, lbl]) => (
                    <button key={k} onClick={() => patch({ modules: PRESETS[k].slice() })} style={{
                      background: '#fff', border: '1px solid #E6E8EF', borderRadius: 8,
                      font: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', cursor: 'pointer',
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ------------------------- OUTPUT -------------------------- */}
            {tab === 'output' && (
              <>
                <div style={{ marginBottom: 14 }}>
                  {flags.map((f, i) => {
                    const tone = f[0] === 'bad' ? ['#FEF2F2', '#991B1B', <ShieldAlert key="i" size={15} />]
                              : f[0] === 'warn' ? ['#FFFBEB', '#92400E', <AlertTriangle key="i" size={15} />]
                              : ['#F0FDF4', '#166534', <CheckCircle2 key="i" size={15} />];
                    return (
                      <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 12px',
                                            borderRadius: 9, marginBottom: 6, fontSize: 13,
                                            background: tone[0], color: tone[1] }}>
                        <span style={{ flex: 'none', marginTop: 1 }}>{tone[2]}</span>
                        <span>{f[1]}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <button onClick={() => copy(envText(x), 'env')} style={{
                    background: '#1338DE', color: '#fff', border: 'none', borderRadius: 9,
                    font: 'inherit', fontSize: 13.5, fontWeight: 700, padding: '9px 16px', cursor: 'pointer',
                  }}>
                    {copied === 'env' ? <><Check size={14} style={{ verticalAlign: -2 }} /> Copied</>
                                      : <><Copy size={14} style={{ verticalAlign: -2 }} /> Copy {env.length} variable{env.length === 1 ? '' : 's'}</>}
                  </button>
                  <button onClick={() => copy('VITE_DEMO=1', 'demo')} style={{
                    background: '#fff', color: '#111528', border: '1px solid #E6E8EF', borderRadius: 9,
                    font: 'inherit', fontSize: 13.5, fontWeight: 600, padding: '9px 16px', cursor: 'pointer',
                  }}>{copied === 'demo' ? 'Copied' : 'Copy demo variable'}</button>
                </div>

                <pre style={{ ...B.pre, marginBottom: 14 }}>
                  {env.length
                    ? env.map(p => p[0].padEnd(Math.max(...env.map(q => q[0].length))) + '  ' + p[1]).join('\n')
                    : '# Nothing to set. Every value matches the template default.'}
                </pre>

                <div style={{ ...B.card, marginBottom: 14 }}>
                  <div style={B.legend}><KeyRound size={12} /> Set separately, never here</div>
                  <p style={{ fontSize: 12.5, color: '#5B6478', margin: '0 0 11px' }}>
                    None of these are generated or stored by this console. They are listed so an install
                    sheet is complete without their values ever passing through our database.
                  </p>
                  <pre style={B.pre}>
                    {SECRET_KEYS.map(k => k[0].padEnd(26) + '# ' + k[1]).join('\n')}
                  </pre>
                </div>

                <div style={{ borderLeft: '3px solid #FB6926', background: '#FFF7F2', padding: '10px 13px',
                              borderRadius: '0 8px 8px 0', fontSize: 12.5 }}>
                  <b>Paste the block straight into Vercel.</b> Project → Settings → Environment Variables →
                  paste into the key field and it parses the whole thing. Tick Production and Preview both,
                  then redeploy: variables only apply to builds that run after they are set.
                </div>
              </>
            )}

            {/* ------------------------- RUNBOOK ------------------------- */}
            {tab === 'runbook' && (
              <div style={B.card}>
                <div style={B.legend}><ListChecks size={12} /> Runbook</div>
                <ol style={{ listStyle: 'none', padding: 0, margin: 0, counterReset: 'rb' }}>
                  {steps.map((s, i) => (
                    <li key={i} style={{ position: 'relative', padding: '0 0 14px 32px',
                                         borderLeft: i === steps.length - 1 ? '1px solid transparent' : '1px solid #E6E8EF',
                                         marginLeft: 10 }}>
                      <span style={{ position: 'absolute', left: -10, top: 0, width: 20, height: 20,
                                     borderRadius: '50%', background: '#1338DE', color: '#fff',
                                     fontFamily: 'ui-monospace,monospace', fontSize: 9.5, fontWeight: 700,
                                     display: 'grid', placeItems: 'center' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <b style={{ display: 'block', fontSize: 13.5, marginBottom: 2 }}>{s[0]}</b>
                      <p style={{ margin: 0, color: '#5B6478', fontSize: 12.5 }}>{s[1]}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
