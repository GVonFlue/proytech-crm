/* The onboarding portal's palette and stylesheet.
   ============================================================================

   THE ONLY PLACE THE PORTAL'S HEX VALUES APPEAR. Every rule below goes through
   a var(); the values are published on the page root from THEME. Each one can
   be overridden per install with a VITE_PORTAL_* variable (white-label), the
   same way CONTENT_BRAND works for the Studio. The defaults are the approved
   proposal's (v5) language: ice background, navy, electric blue to orange.

   ONE DEPARTURE FROM THE MOCKUP, ON PURPOSE: the mockup's CTA is white on
   #FB6926, which measures about 2.9:1 and fails WCAG AA at every size. The
   button fill is `cta` (#CC4A0A, about 4.6:1 with white); #FB6926 stays as
   `hot`, the accent on rings, borders, pills and the ticket stripe, where it
   carries no text. tests/onboardingpage.mjs measures both. */
const env = k => { try { return String((import.meta.env && import.meta.env[k]) || '').trim(); } catch { return ''; } };
const v = (k, d) => (/^#[0-9a-f]{6}$/i.test(env(k)) ? env(k) : d);

export const THEME = {
  ink: v('VITE_PORTAL_INK', '#0B1633'),
  mute: v('VITE_PORTAL_MUTE', '#56637F'),
  line: v('VITE_PORTAL_LINE', '#DCE5F4'),
  blue: v('VITE_PORTAL_BLUE', '#1F6FEB'),
  elec: v('VITE_PORTAL_ELEC', '#2E9BFF'),
  ice: v('VITE_PORTAL_ICE', '#38BDF8'),
  navy: v('VITE_PORTAL_NAVY', '#061431'),
  hot: v('VITE_PORTAL_HOT', '#FB6926'),
  cta: v('VITE_PORTAL_CTA', '#CC4A0A'),
  ok: v('VITE_PORTAL_OK', '#1F8A55'),
  bad: v('VITE_PORTAL_BAD', '#B4322E'),
  track: v('VITE_PORTAL_TRACK', '#E6ECF7'),   // the progress ring's empty part
  peach: v('VITE_PORTAL_PEACH', '#FFB38A'),   // the launch date on the navy ticket
  bg1: v('VITE_PORTAL_BG1', '#F7FAFF'),
  bg2: v('VITE_PORTAL_BG2', '#EEF4FF'),
};
export const themeVars = () => Object.entries(THEME).map(([k, x]) => `--o-${k}:${x}`).join(';');

/* the circuit art from the mockup, inline (no extra request, no host) */
const ART = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><g fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M40 60 H150 L180 30 H320" stroke="#2E9BFF" stroke-opacity=".8"/><path d="M90 110 H200 L230 140 H320" stroke="#FB6926" stroke-opacity=".8"/><path d="M130 175 H220 L245 150 H320" stroke="#2E9BFF" stroke-opacity=".6"/><polygon points="309,80 292,109 258,109 241,80 258,51 292,51" stroke="#FB6926" stroke-opacity=".7" stroke-width="2"/><polygon points="264,195 252,216 228,216 216,195 228,174 252,174" stroke="#2E9BFF" stroke-opacity=".5" stroke-width="2"/></g><circle cx="150" cy="60" r="4" fill="#2E9BFF"/><circle cx="200" cy="110" r="4" fill="#FB6926"/><circle cx="220" cy="175" r="4" fill="#38BDF8"/></svg>')}`;

export const PORTAL_CSS = `
.ob,.ob *{box-sizing:border-box}
.ob{font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--o-ink);min-height:100vh;
  background:radial-gradient(60% 40% at 100% 0%,color-mix(in srgb,var(--o-ice) 16%,transparent),transparent 60%),linear-gradient(180deg,var(--o-bg1),var(--o-bg2))}
.ob h1,.ob h2,.ob h3,.ob h4,.ob .sg{font-family:"Space Grotesk",Inter,sans-serif;letter-spacing:-.02em;margin:0}
.ob p{margin:0}
.ob button{font:inherit;cursor:pointer}
.ob :focus-visible{outline:3px solid var(--o-blue);outline-offset:2px}
.ob .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ob-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 34px;border-bottom:1px solid var(--o-line);background:color-mix(in srgb,#fff 82%,transparent);backdrop-filter:blur(6px)}
.ob-top img{height:34px;display:block}
.ob-top .brand{font:700 20px "Space Grotesk",sans-serif;color:var(--o-ink);background:none;border:0;padding:0}
.ob-top .r{display:flex;gap:12px;align-items:center;font-size:13px;color:var(--o-mute);min-width:0}
.ob-save{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:99px;background:#E9F7F0;color:var(--o-ok);font-weight:600;font-size:12px;white-space:nowrap}
.ob-save:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.ob-save.saving{background:#EEF2F8;color:var(--o-mute)}
.ob-save.err{background:#FDECEC;color:var(--o-bad)}
.ob-help{padding:8px 14px;border:1px solid var(--o-line);border-radius:10px;background:#fff;font-weight:600;color:var(--o-ink);white-space:nowrap;text-decoration:none}
.ob-biz{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.ob-wrap{max-width:1180px;margin:0 auto;padding:28px 34px 60px}
.ob-kick{display:inline-flex;align-items:center;gap:8px;font:700 10.5px ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--o-blue)}
.ob-kick:before{content:"";width:22px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--o-elec),var(--o-hot))}
.ob-banner{border-radius:14px;padding:12px 16px;margin-bottom:16px;font-size:14px;background:#FFF6F1;border:1px solid color-mix(in srgb,var(--o-hot) 45%,transparent)}
.ob-hero{display:grid;grid-template-columns:1.5fr 1fr;gap:22px;margin-bottom:22px}
.ob-welcome{position:relative;overflow:hidden;border-radius:22px;padding:28px 30px;border:1.5px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--o-elec),var(--o-ice) 45%,var(--o-hot)) border-box;box-shadow:0 24px 60px -34px rgba(6,20,49,.5)}
.ob-welcome:before{content:"";position:absolute;right:0;top:0;width:34%;height:100%;background:url("${ART}") right top/contain no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent,#000 45%);mask-image:linear-gradient(90deg,transparent,#000 45%);pointer-events:none}
.ob-welcome h1{font-size:34px;line-height:1.08;margin:10px 0 8px;position:relative}
.ob-welcome h1 em{font-style:normal;color:var(--o-cta)}
.ob-welcome > p{color:var(--o-mute);font-size:15px;max-width:560px;position:relative}
.ob-prog{display:flex;align-items:center;gap:18px;margin-top:22px;position:relative}
.ob-ring{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;flex:none}
.ob-ring b{width:58px;height:58px;border-radius:50%;background:#fff;display:grid;place-items:center;font:700 17px "Space Grotesk",sans-serif}
.ob-prog .t b{display:block;font:700 18px "Space Grotesk",sans-serif}
.ob-prog .t span{color:var(--o-mute);font-size:13px}
.ob-cta{margin-left:auto;display:inline-flex;align-items:center;gap:10px;background:var(--o-cta);color:#fff;font-weight:700;font-size:15px;padding:15px 22px;border-radius:14px;border:0;box-shadow:0 12px 26px -10px color-mix(in srgb,var(--o-hot) 70%,transparent);text-align:left;text-decoration:none}
.ob-cta small{display:block;font-weight:500;font-size:11.5px;opacity:.95}
.ob-cta:disabled{opacity:.55;cursor:default;box-shadow:none}
.ob-ticket{position:relative;border-radius:22px;background:linear-gradient(160deg,#0A2257,var(--o-navy) 75%);color:#fff;padding:22px 24px;overflow:hidden;box-shadow:0 24px 60px -30px rgba(6,20,49,.8)}
.ob-ticket:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--o-elec),var(--o-ice) 60%,var(--o-hot))}
.ob-ticket .nuc{position:absolute;right:-30px;top:-30px;width:170px;opacity:.85}
.ob-ticket .adm{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#7DD3FC;position:relative}
.ob-ticket h2{font-size:26px;margin:8px 0 4px;position:relative;max-width:75%}
.ob-ticket .sub{color:#C5D4EC;font-size:13px;position:relative}
.ob-ticket .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:18px;border-top:1px dashed rgba(125,211,252,.35);padding-top:14px;position:relative}
.ob-ticket .row span{display:block;font:700 9.5px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#7DD3FC;text-transform:uppercase}
.ob-ticket .row b{font:700 15px "Space Grotesk",sans-serif}
.ob-ticket .row b.o{color:var(--o-peach)}
.ob-ticket a{color:#fff}
.ob-cols{display:grid;grid-template-columns:1.5fr 1fr;gap:22px;align-items:start}
.ob-h3{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:2px 0 12px}
.ob-h3 h3{font-size:19px}
.ob-h3 span{color:var(--o-mute);font-size:13px}
.ob-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ob-sec{position:relative;background:#fff;border:1px solid var(--o-line);border-radius:16px;padding:16px 16px 14px;display:grid;grid-template-columns:42px 1fr;gap:12px;align-items:start;text-align:left;color:inherit;width:100%}
.ob-sec:hover{border-color:color-mix(in srgb,var(--o-elec) 50%,var(--o-line))}
.ob-sec .ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--o-elec) 10%,transparent);font-size:19px}
.ob-sec h4{font-size:15px;margin-bottom:3px}
.ob-sec p{color:var(--o-mute);font-size:12.5px;line-height:1.4}
.ob-sec .meta{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:11.5px;color:var(--o-mute)}
.ob-sec.now{border-color:color-mix(in srgb,var(--o-hot) 55%,transparent);box-shadow:0 12px 28px -18px color-mix(in srgb,var(--o-hot) 60%,transparent)}
.ob-sec.now:after{content:"";position:absolute;left:16px;right:16px;bottom:0;height:3px;border-radius:3px;background:linear-gradient(90deg,var(--o-hot) var(--pct,0%),#F2E6DE var(--pct,0%))}
.ob-sec.done .ic{background:#E6F6EE}
.ob-pill{display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;border-radius:99px;padding:3px 9px}
.ob-pill.done{background:#E6F6EE;color:#17663F}
.ob-pill.now{background:#FFF1E8;color:#B23A07}
.ob-pill.next,.ob-pill.later{background:#EEF2F8;color:#4F5B73}
.ob-card{background:#fff;border:1px solid var(--o-line);border-radius:18px;padding:18px;margin-bottom:16px}
.ob-card h4{font-size:14px;margin-bottom:8px}
.ob-need ul{padding:0;margin:0}
.ob-need li{list-style:none;display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid #EEF2F8;font-size:13.5px}
.ob-need li:first-child{border-top:0}
.ob-need i{width:20px;height:20px;border-radius:6px;border:1.6px solid #C9D3E6;display:block}
.ob-need li.ok i{background:var(--o-ok);border-color:var(--o-ok)}
.ob-need li.ok span{color:var(--o-mute);text-decoration:line-through}
.ob-need em{font-style:normal;font-size:11px;color:var(--o-mute);text-align:right}
.ob-crew{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ob-mem{border:1px solid var(--o-line);border-radius:14px;padding:12px;text-align:center;background:linear-gradient(180deg,var(--o-bg1),#fff)}
.ob-mem img,.ob-mem .ini{width:62px;height:62px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 0 0 2px var(--o-elec);display:inline-grid;place-items:center;background:var(--o-bg2);font:700 20px "Space Grotesk",sans-serif;color:var(--o-ink)}
.ob-mem:nth-child(2n) img,.ob-mem:nth-child(2n) .ini{box-shadow:0 0 0 2px var(--o-hot)}
.ob-mem b{display:block;font:700 14px "Space Grotesk",sans-serif;margin-top:6px}
.ob-mem span{font-size:11.5px;color:var(--o-mute)}
.ob-note{display:flex;gap:10px;align-items:center;background:#F5F8FD;border:1px solid var(--o-line);border-radius:14px;padding:12px 14px;font-size:13px;color:var(--o-mute)}
.ob-note b{color:var(--o-ink)}
.ob-note a{color:var(--o-blue);font-weight:600}
.ob-link{background:none;border:0;padding:0;color:var(--o-blue);font-weight:600;text-decoration:underline;text-align:left}
.ob-steps{display:flex;gap:6px;margin:4px 0 18px}
.ob-steps span{flex:1;height:6px;border-radius:6px;background:#E3EAF5}
.ob-steps span.d{background:var(--o-ok)}
.ob-steps span.n{background:linear-gradient(90deg,var(--o-hot) 50%,#F6D9C8 50%)}
.ob-form{border:1.5px solid transparent;border-radius:22px;padding:26px 28px;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--o-elec),var(--o-ice) 45%,var(--o-hot)) border-box}
.ob-form h2{font-size:26px;margin:8px 0 4px}
.ob-form .lead{color:var(--o-mute);font-size:14px;margin-bottom:18px}
.ob-q{border-top:1px solid #EEF2F8;padding:18px 0}
.ob-q > label,.ob-q > .lbl,.ob-q legend{display:block;font:700 15px "Space Grotesk",sans-serif;margin-bottom:4px;padding:0}
.ob-q fieldset{border:0;margin:0;padding:0;min-width:0}
.ob-q .req{color:var(--o-cta);margin-left:3px}
.ob-q small.h{display:block;color:var(--o-mute);font-size:12.5px;margin-bottom:10px}
.ob-q .er{color:var(--o-bad);font-size:12.5px;margin-top:6px}
.ob-in{width:100%;font:inherit;font-size:16px;border:1px solid var(--o-line);border-radius:11px;padding:11px 12px;color:var(--o-ink);background:#fff}
.ob-in::placeholder{color:#7C88A1}
textarea.ob-in{min-height:84px;resize:vertical}
.ob-in.bad{border-color:var(--o-bad)}
.ob-chips{display:flex;gap:8px;flex-wrap:wrap}
.ob-chip{position:relative;display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:99px;border:1px solid var(--o-line);font-size:13px;font-weight:600;color:var(--o-ink);background:#fff;cursor:pointer}
.ob-chip input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.ob-chip.on{background:var(--o-navy);color:#fff;border-color:var(--o-navy)}
.ob-chip:focus-within{outline:3px solid var(--o-blue);outline-offset:2px}
.ob-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.ob-tile{position:relative;border:1.5px solid var(--o-line);border-radius:14px;padding:12px;font-weight:700;font-size:13.5px;background:#fff;cursor:pointer;display:block}
.ob-tile input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.ob-tile small{display:block;font-weight:500;color:var(--o-mute);font-size:11.5px;margin:3px 0 0}
.ob-tile.on{border-color:var(--o-hot);background:#FFF6F1}
.ob-tile.on:after{content:"✓";position:absolute;top:8px;right:10px;width:20px;height:20px;border-radius:50%;background:var(--o-cta);color:#fff;font-size:12px;display:grid;place-items:center}
.ob-tile:focus-within{outline:3px solid var(--o-blue);outline-offset:2px}
.ob-check{display:flex;gap:10px;align-items:flex-start;font-size:14px;cursor:pointer}
.ob-check input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:var(--o-cta)}
.ob-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.ob-tag{display:inline-flex;align-items:center;gap:6px;background:var(--o-bg2);border:1px solid var(--o-line);border-radius:99px;padding:5px 6px 5px 11px;font-size:13px}
.ob-tag button{border:0;background:none;width:22px;height:22px;border-radius:50%;color:var(--o-mute)}
.ob-sw{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ob-swatch{position:relative;width:44px;height:44px;border-radius:12px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);overflow:hidden}
.ob-swatch input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.ob-swatch button{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;border:0;background:#fff;color:var(--o-ink);font-size:11px;line-height:18px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.ob-row{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));align-items:center;padding:10px;border:1px solid var(--o-line);border-radius:12px;margin-bottom:8px;background:var(--o-bg1)}
.ob-row .x{justify-self:end;border:0;background:none;color:var(--o-mute);font-size:13px;text-decoration:underline}
.ob-add{border:1px dashed #A9C5EE;background:#FAFCFF;color:var(--o-blue);font-weight:600;border-radius:11px;padding:10px 14px}
.ob-hours{display:grid;gap:6px}
.ob-hours .d{display:grid;grid-template-columns:90px 1fr 1fr;gap:8px;align-items:center;font-size:14px}
.ob-pipe{display:grid;gap:6px}
.ob-pipe .s{display:grid;grid-template-columns:28px 1fr auto;gap:8px;align-items:center}
.ob-pipe .s b{font:700 13px "Space Grotesk",sans-serif;color:var(--o-mute);text-align:center}
.ob-pipe .s .ctl{display:flex;gap:4px}
.ob-pipe .s .ctl button{border:1px solid var(--o-line);background:#fff;border-radius:8px;min-width:34px;height:34px}
.ob-access{border:1px solid var(--o-line);border-radius:14px;padding:14px;background:var(--o-bg1);margin-top:4px}
.ob-access ol{margin:6px 0 10px;padding-left:20px;font-size:13.5px;line-height:1.55;color:var(--o-ink)}
.ob-info{background:#EEF6FF;border:1px solid #CFE3FB;border-radius:12px;padding:12px 14px;font-size:13.5px;color:var(--o-ink)}
.ob-drop{display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:start}
.ob-thumbs{display:flex;flex-wrap:wrap;gap:8px;grid-column:1/-1}
.ob-thumb{position:relative;width:96px;height:84px;border-radius:12px;border:1px solid var(--o-line);display:grid;place-items:center;background:var(--o-bg1);overflow:hidden;font-size:11px;color:var(--o-mute);text-align:center;padding:4px}
.ob-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.ob-thumb button{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;border:0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);font-size:12px}
.ob-thumb .bar{position:absolute;left:6px;right:6px;bottom:6px;height:4px;border-radius:4px;background:#E3EAF5;overflow:hidden}
.ob-thumb .bar i{display:block;height:100%;background:var(--o-hot)}
.ob-dz{position:relative;border:1.6px dashed #A9C5EE;border-radius:12px;padding:16px;color:var(--o-mute);font-size:13px;background:#FAFCFF;grid-column:1/-1}
.ob-dz.over{border-color:var(--o-hot);background:#FFF6F1}
.ob-dz b{color:var(--o-blue)}
.ob-dz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.ob-dz .ph{display:none}
.ob-nav{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;padding-top:18px;border-top:1px solid #EEF2F8;flex-wrap:wrap}
.ob-ghost{padding:12px 18px;border-radius:12px;border:1px solid var(--o-line);font-weight:600;background:#fff;color:var(--o-ink)}
.ob-side .why{font-size:13px;color:var(--o-mute);line-height:1.5}
.ob-rev h3{font-size:16px;display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.ob-rev dl{display:grid;grid-template-columns:minmax(120px,38%) 1fr;gap:6px 14px;margin:10px 0 0;font-size:13.5px}
.ob-rev dt{color:var(--o-mute)}
.ob-rev dd{margin:0;word-break:break-word}
.ob-err{color:var(--o-bad);font-size:14px;margin-top:10px}
.ob-launch{max-width:720px;margin:0 auto}
.ob-launch .ob-ticket h2{max-width:100%;font-size:30px}
.ob-launch .big{font:700 34px "Space Grotesk",sans-serif;margin:6px 0 6px;position:relative}
.ob-msg{max-width:560px;margin:80px auto;background:#fff;border-radius:16px;padding:28px;text-align:center;box-shadow:0 20px 60px -30px rgba(5,7,26,.35)}
.ob-msg h1{font-size:22px;margin:0 0 8px}
.ob-msg p{color:var(--o-mute)}
@media (max-width:700px){
  .ob-top{padding:10px 14px;gap:8px}
  .ob-top img{height:26px}
  .ob-top .brand{font-size:17px}
  .ob-top .r{gap:8px}
  .ob-biz,.ob-save .long{display:none}
  .ob-save{padding:5px 9px}
  .ob-help{padding:7px 10px}
  .ob-wrap{padding:16px 14px 40px}
  .ob-hero,.ob-cols{grid-template-columns:1fr}
  .ob-welcome{padding:22px 18px}
  .ob-welcome h1{font-size:27px}
  .ob-prog{flex-wrap:wrap}
  .ob-cta{margin-left:0;width:100%;justify-content:center}
  .ob-grid{grid-template-columns:1fr}
  .ob-tiles{grid-template-columns:1fr 1fr}
  .ob-form{padding:20px 16px}
  .ob-drop{grid-template-columns:1fr}
  .ob-dz .ph{display:block;margin-top:6px}
  .ob-hours .d{grid-template-columns:76px 1fr 1fr}
  .ob-nav .ob-cta{width:auto;flex:1}
}
@media (prefers-reduced-motion:reduce){.ob *{transition:none!important;animation:none!important}}
`;
