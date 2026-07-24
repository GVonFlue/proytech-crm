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

export const icon = f => `/brands/${BRAND.id}/${f}`;

/* Supabase creds are REQUIRED — no fallback on purpose. */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY || '').trim();
export const SUPABASE_OK  = !!(SUPABASE_URL && SUPABASE_KEY);
