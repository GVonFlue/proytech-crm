/* ============================================================
   BRAND / TENANT CONFIG
   ------------------------------------------------------------
   Everything that changes per client lives here, driven by Vite
   env vars. One repo -> many Vercel projects, each with its own
   env vars pointing at its own Supabase.

   Set these in Vercel -> Project -> Settings -> Environment Variables.
   Anything not set falls back to the ProyTech defaults below,
   EXCEPT the Supabase creds, which are required on purpose so a
   misconfigured client project can never fall back to our database.
   ============================================================ */

const val = (v, d) => { const s = (v ?? '').toString().trim(); return s ? s : d; };
const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'crm';

const NAME = val(import.meta.env.VITE_BRAND_NAME, 'ProyTech');

export const BRAND = {
  /* identity */
  id:       val(import.meta.env.VITE_BRAND_ID, 'proytech'),        // picks /public/brands/<id>/ icons
  name:     NAME,                                                   // "ProyTech"
  title:    val(import.meta.env.VITE_APP_TITLE, NAME + ' CRM'),     // "ProyTech CRM"
  short:    val(import.meta.env.VITE_BRAND_SHORT, NAME),            // home-screen label

  /* sign-in maps username -> username@<authDomain> in Supabase Auth */
  authDomain: val(import.meta.env.VITE_AUTH_DOMAIN, slug(NAME) + '.app'),

  /* sidebar footer */
  tagline:    val(import.meta.env.VITE_TAGLINE, 'No conversation lives outside the CRM.'),
  taglineSub: val(import.meta.env.VITE_TAGLINE_SUB, 'Capture it the moment it happens.'),

  /* people: VITE_TEAM="Garrett,Logan" — first one is the default owner on new leads */
  team: val(import.meta.env.VITE_TEAM, 'Garrett,Logan').split(',').map(s => s.trim()).filter(Boolean),
  /* the shared/unclaimed pool owner — defaults to the company name */
  pool: val(import.meta.env.VITE_POOL_NAME, NAME),

  /* which sections this install ships with. Empty = everything on.
     e.g. VITE_MODULES="followup,tasks,activity,pipeline,leads,rels,clients"
     leaves out invoices / books / money for a client who didn't buy them. */
  modules: val(import.meta.env.VITE_MODULES, '').split(',').map(s => s.trim()).filter(Boolean),

  /* colors */
  colors: {
    cobalt: val(import.meta.env.VITE_COLOR_COBALT, '#2B4DE0'),
    indigo: val(import.meta.env.VITE_COLOR_INDIGO, '#3B3470'),
    ink:    val(import.meta.env.VITE_COLOR_INK,    '#181530'),
    gold:   val(import.meta.env.VITE_COLOR_GOLD,   '#C8A24A'),
    green:  val(import.meta.env.VITE_COLOR_GREEN,  '#1F9D55'),
    red:    val(import.meta.env.VITE_COLOR_RED,    '#D14343'),
  },

  /* invoice defaults (client can edit these in Settings afterwards) */
  biz: {
    name:    val(import.meta.env.VITE_BIZ_NAME, NAME),
    address: val(import.meta.env.VITE_BIZ_ADDRESS, '150 N Main St\nWichita, KS 67202').replace(/\\n/g, '\n'),
    email:   val(import.meta.env.VITE_BIZ_EMAIL, 'getproytech@gmail.com'),
    phone:   val(import.meta.env.VITE_BIZ_PHONE, ''),
  },
};

/* ---- Content Studio's palette --------------------------------------------
   Its own five, separate from BRAND.colors above, because WEEKEND1 §E names
   these five env vars specifically and a white-label install must be able to
   restyle the Studio without touching the CRM chrome it sits inside.

   THIS IS THE ONLY PLACE THE STUDIO'S HEX VALUES APPEAR. src/ContentStudio.jsx
   contains no hex at all — it reads these, publishes them as CSS custom
   properties on its root, and every rule in its style block goes through a
   var(). tests/content.mjs asserts the file stays hex-free, because "don't
   inline a colour" is a rule that decays the first time someone is in a hurry. */
export const CONTENT_BRAND = {
  primary:    val(import.meta.env.VITE_BRAND_PRIMARY,     '#1338DE'),
  accent:     val(import.meta.env.VITE_BRAND_ACCENT,      '#FB6926'),
  accentText: val(import.meta.env.VITE_BRAND_ACCENT_TEXT, '#D97706'),
  navy:       val(import.meta.env.VITE_BRAND_NAVY,        '#000110'),
  ink:        val(import.meta.env.VITE_BRAND_INK,         '#111528'),
};

/* hex -> rgba, so a screen can derive borders, tints and shadows from the five
   above instead of inventing a sixth colour. Returns the input untouched if it
   is not a hex, so a client who sets VITE_BRAND_PRIMARY to a CSS keyword or an
   rgb() string gets something usable rather than "rgba(NaN,NaN,NaN)". */
export const tint = (hex, alpha = 1) => {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((hex || '').trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/* Is the Content Studio module built into this deployment at all?
   Default OFF (WEEKEND1 §2) — the tab does not exist unless this is the exact
   string 'true', so a typo leaves it off rather than half on. */
export const CONTENT_STUDIO_ON =
  (import.meta.env.VITE_CONTENT_STUDIO || '').toString().trim() === 'true';

/* The in-CRM assistant's name. Per-tenant on purpose: the internal ProyTech
   install calls it something we would not ship to a client, and this is a one
   env var difference rather than a fork. Set VITE_AI_NAME per Vercel project.

   The default is keyed off BRAND.id rather than hardcoded, so OUR install is
   JARVIS out of the box while a client project — which sets its own
   VITE_BRAND_ID — still falls back to the neutral name. Forgetting to set a
   var must never leak an internal name into somebody else's CRM. */
export const AI_NAME = val(
  import.meta.env.VITE_AI_NAME,
  BRAND.id === 'proytech' ? 'JARVIS' : 'Assistant',
);

export const icon = f => `/brands/${BRAND.id}/${f}`;

/* Supabase creds are REQUIRED — no fallback on purpose. */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY || '').trim();
export const SUPABASE_OK  = !!(SUPABASE_URL && SUPABASE_KEY);
