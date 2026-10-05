/* src/lib/onboarding.js — the client onboarding portal, as data and pure functions.
   ============================================================================

   ONE VOCABULARY, DEFINED ONCE (CLAUDE.md). The portal page, the public route,
   the CRM's Onboarding view, the answers PDF and both build prompts all read
   the sections, the fields, the branching and the "still needed" rules from
   here. Nothing below touches the network, the DOM or a database, so the
   server and both bundles import it and the tests drive it directly.

   SHAPE
   - A SECTION has an id, a title, a time estimate, "why we ask", a `when(ctx)`
     and its FIELDS.
   - A FIELD has a stable id (`biz.name`), a type, a label and optionally:
       req   (bool | ctx => bool)  blocks submit when empty
       need  (string | ctx => str) not blocking; listed as "still needed" when
                                   empty, under that label
       when  (ctx, answers) => bool  shown at all
       options [{v, l, d?}]        for select / multi; `unsure: true` adds the
                                   "Not sure / you decide" choice
       fields                      for `list` (repeatable rows)
       slot                        for `file` (see FILE_SLOTS)
   - ANSWERS are one flat object keyed by field id. The ids are what the PDF
     and the prompts quote, so they never change once shipped: rename a label,
     never an id.
   - The context `ctx` is { industry, lenderKind, products, state, rules }.

   WHAT IS NOT HERE
   - Deposit paid and access received: those are the lead's onboarding
     checklist (lib/lead ONB_ITEMS deposit_paid, access_dns, access_gbp). This
     file only READS them, through `checklistState`.
   - Anything ProyTech-specific. The licensing state, the product mapping,
     the people and the kickoff link come from settings (readOnbConfig) and
     the offer; the rules for a state are keyed by its code (STATE_RULES). */

const S = (v, n = 2000) => (v == null ? '' : String(v)).slice(0, n);
const A = v => (Array.isArray(v) ? v : []);
const blank = v => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

/* ---------- vocabularies ---------- */
export const PRODUCTS = ['website', 'suite', 'automations'];
export const INDUSTRIES = ['realtor', 'lender', 'service'];
export const LENDER_KINDS = ['lo', 'company'];
export const ONB_STATUSES = ['not_started', 'in_progress', 'submitted', 'needs_info'];
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/* display names for the products; an install renames them in settings */
export const DEFAULT_PRODUCT_NAMES = { website: 'Website', suite: 'Business Suite', automations: 'Automations' };
export const UNSURE = { v: 'unsure', l: 'Not sure / you decide' };

/* Rules that depend on WHERE the client is licensed. Keyed by state code so a
   second state is data, not a branch. An install with no state set gets the
   generic labels and no state-specific hints. */
export const STATE_RULES = {
  KS: {
    name: 'Kansas',
    teamNameBanned: ['realty', 'brokerage', 'company'],
    roofingRegistration: 'Kansas Attorney General roofing registration number',
  },
};

/* ---------- files ---------- */
/* slot -> storage folder, accepted extensions, sensitive (EIN letters,
   insurance, contact lists: never shown as a thumbnail to anyone, downloaded
   only through a signed URL like everything else). */
const IMG = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'svg'];
const DOC = ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'heic'];
export const FILE_SLOTS = {
  logos:     { folder: 'logos',     exts: [...IMG, 'pdf'], label: 'Logos' },
  headshot:  { folder: 'photos',    exts: IMG, label: 'Headshot' },
  team:      { folder: 'photos',    exts: IMG, label: 'Team photos' },
  work:      { folder: 'photos',    exts: [...IMG, 'mp4', 'mov'], label: 'Work and proof photos' },
  office:    { folder: 'photos',    exts: IMG, label: 'Office or storefront' },
  videos:    { folder: 'photos',    exts: ['mp4', 'mov'], label: 'Videos' },
  contacts:  { folder: 'contacts',  exts: ['csv', 'xls', 'xlsx'], label: 'Contact list', sensitive: true },
  documents: { folder: 'documents', exts: DOC, label: 'Documents', sensitive: true },
};
/* the one type each extension is uploaded AS. The browser re-labels the file
   with this before upload, the bucket only accepts these, and the server
   checks the first bytes match (fileKindOk). */
export const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp4: 'video/mp4', mov: 'video/quicktime',
};
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const extOf = name => { const m = /\.([a-z0-9]{2,5})$/i.exec(S(name, 300).trim()); return m ? m[1].toLowerCase() : ''; };

/** Is this upload allowed into this slot? -> {ok, ext, mime} or {ok:false, error} */
export function fileAllowed(slot, name, bytes) {
  const s = FILE_SLOTS[slot];
  if (!s) return { ok: false, error: 'That upload area does not exist.' };
  const ext = extOf(name);
  if (!ext || !s.exts.includes(ext)) return { ok: false, error: `${s.label}: ${ext ? '.' + ext + ' files are' : 'that file is'} not accepted here. Use ${s.exts.map(e => e.toUpperCase()).filter((e, i, a) => a.indexOf(e) === i).join(', ')}.` };
  const n = Number(bytes);
  if (!(n > 0)) return { ok: false, error: 'That file is empty.' };
  if (n > MAX_FILE_BYTES) return { ok: false, error: `That file is ${Math.round(n / 1048576)} MB. The limit is 50 MB. Reply to any of our emails with it instead.` };
  return { ok: true, ext, mime: EXT_MIME[ext] };
}

/* THE FILE IS WHAT ITS BYTES SAY, not what its name says. `head` is the first
   bytes of the uploaded object (a Uint8Array). Text formats (csv, svg) are
   checked for being text; zip-based formats (docx, xlsx) can only be told
   apart by name once they are proven to be a zip. */
export function fileKindOk(ext, head) {
  const b = head instanceof Uint8Array ? head : new Uint8Array(0);
  const at = (i, ...xs) => xs.every((x, k) => b[i + k] === x);
  const str = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  switch (ext) {
    case 'jpg': case 'jpeg': return at(0, 0xFF, 0xD8, 0xFF);
    case 'png': return at(0, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
    case 'webp': return str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP';
    case 'pdf': return str(0, 5) === '%PDF-';
    case 'docx': case 'xlsx': return at(0, 0x50, 0x4B, 0x03, 0x04);
    case 'xls': return at(0, 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1);
    case 'heic': return str(4, 4) === 'ftyp' && /^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(str(8, 4));
    case 'mp4': case 'mov': return str(4, 4) === 'ftyp' || (ext === 'mov' && /^(moov|mdat|wide|free|skip|pnot)$/.test(str(4, 4)));
    case 'csv': return b.length > 0 && !b.includes(0);
    case 'svg': { if (!b.length || b.includes(0)) return false; const t = new TextDecoder().decode(b).toLowerCase(); return t.includes('<svg') || t.trimStart().startsWith('<?xml'); }
    default: return false;
  }
}

/* ---------- option lists ---------- */
const o = (v, l, d) => (d ? { v, l, d } : { v, l });
const YN = [o('yes', 'Yes'), o('no', 'No')];
const YNU = [...YN, UNSURE];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => o(m.toLowerCase(), m));
export const FEEL_OPTIONS = [
  o('luxury', 'Luxury', 'Polished, high end'), o('modern', 'Modern', 'Clean, current'),
  o('warm', 'Warm / local', 'Approachable, hometown'), o('bold', 'Bold', 'Big, confident'),
  o('minimal', 'Minimal', 'Simple, lots of space'), o('classic', 'Classic', 'Timeless, trusted'),
  o('friendly', 'Friendly', 'Fun, easygoing'), o('techy', 'Techy', 'Sharp, innovative'),
];
export const REGISTRARS = [o('godaddy', 'GoDaddy'), o('namecheap', 'Namecheap'), o('squarespace', 'Squarespace / Google Domains'), o('cloudflare', 'Cloudflare'), o('other', 'Somewhere else'), UNSURE];

/* §5 of the spec: industry templates are DATA. These are the shipped
   defaults; settings.onboarding.pipelines overrides any of them. */
export const DEFAULT_PIPELINES = {
  realtor: ['New lead', 'Contacted', 'Appointment set', 'Active buyer / Listing signed', 'Under contract', 'Inspection', 'Appraisal', 'Closed', 'Past client'],
  lender: ['New lead', 'Pre-qual', 'Application', 'Processing', 'Underwriting', 'Clear to close', 'Funded'],
  service: ['New lead', 'Estimate scheduled', 'Estimate sent', 'Sold', 'Scheduled', 'Completed', 'Paid', 'Review requested'],
};
/* §6: dashboard tiles. `all` plus the industry's extras. */
export const DEFAULT_TILES = {
  all: ['Revenue vs goal', 'New leads this week', 'Follow-ups due', 'Appointments today', 'Pipeline value', 'Close rate', 'Lead sources', 'Team leaderboard', 'Commissions', 'Reviews', 'Money in and out', 'Lifestyle goal'],
  realtor: ['Closings this year', 'Pending deals', 'Listings active', 'Sphere touches'],
  lender: ['Loans in process', 'Funded this month', 'Volume this year', 'Realtor partner referrals'],
  service: ['Estimates out', 'Jobs this week', 'Average ticket', 'Repeat customers'],
};
export const GOAL_SUGGESTIONS = {
  realtor: ['Closings', 'GCI', 'New leads a month'],
  lender: ['Loans funded', 'Volume', 'Applications a month'],
  service: ['Revenue', 'Jobs completed', 'Leads a month'],
};
const PAGES = {
  common: [o('home', 'Home'), o('about', 'About'), o('services', 'Services'), o('reviews', 'Reviews'), o('contact', 'Contact'), o('blog', 'Blog'), o('faq', 'FAQ'), o('areas', 'Service areas')],
  realtor: [o('listings', 'Listings / home search')],
  lender: [o('programs', 'Loan programs'), o('calculators', 'Calculators')],
  service: [o('gallery', 'Gallery / our work')],
};
const PAGE_DEFAULTS = { realtor: ['home', 'about', 'reviews', 'contact', 'areas', 'listings'], lender: ['home', 'about', 'reviews', 'contact', 'programs', 'calculators'], service: ['home', 'about', 'services', 'reviews', 'contact', 'areas', 'gallery'] };
export const AUTOMATIONS = [o('missed_call', 'Missed-call text back'), o('reviews', 'Review requests'), o('instant_reply', 'Instant lead replies'), o('reminders', 'Appointment reminders'), o('followup', 'New lead follow-up')];

/* ---------- context ---------- */
export const has = (ctx, p) => A(ctx && ctx.products).includes(p);
export const isGrowth = ctx => has(ctx, 'website') && has(ctx, 'suite');
const ind = (...xs) => ctx => xs.includes(ctx && ctx.industry);
const ans = (a, id) => (a || {})[id];

/** The context every rule reads. Industry comes from the client's own answer
 *  first (it is the first question), then whatever the owner set. */
export function ctxOf(row, answers, config) {
  const a = answers || {};
  const r = row || {};
  const industry = INDUSTRIES.includes(a['biz.industry']) ? a['biz.industry'] : INDUSTRIES.includes(r.industry) ? r.industry : '';
  const lenderKind = LENDER_KINDS.includes(a['biz.lender_kind']) ? a['biz.lender_kind'] : LENDER_KINDS.includes(r.lender_kind) ? r.lender_kind : '';
  const state = S(config && config.state, 4).toUpperCase();
  return { industry, lenderKind, products: A(r.products).filter(p => PRODUCTS.includes(p)), state, rules: STATE_RULES[state] || null };
}
const stateName = ctx => (ctx.rules ? ctx.rules.name + ' ' : '');

/* ---------- the sections ---------- */
export const SECTIONS = [
  {
    id: 'biz', title: 'Your business', icon: '🏢', minutes: 4,
    blurb: 'Name, contact info, service area, hours',
    lead: 'The basics first. Most of this we already have, so just check it.',
    why: 'This is what goes on your website footer, your Google profile and every email your system sends. One spelling everywhere.',
    when: () => true,
    fields: [
      { id: 'biz.industry', type: 'select', label: 'What kind of business are you?', req: true,
        options: [o('realtor', 'Realtor', 'Agent or team'), o('lender', 'Lender', 'Loan officer or mortgage company'), o('service', 'Service business', 'Contractor, trades, local services')] },
      { id: 'biz.lender_kind', type: 'select', label: 'Are you an individual loan officer or a mortgage company?', req: true,
        when: ctx => ctx.industry === 'lender', options: [o('lo', 'Individual loan officer'), o('company', 'Mortgage company')] },
      { id: 'biz.contact_name', type: 'text', label: 'Your name', req: true },
      { id: 'biz.role', type: 'text', label: 'Your role', hint: 'Owner, team lead, broker, office manager…' },
      { id: 'biz.phone', type: 'phone', label: 'Best phone', req: true },
      { id: 'biz.email', type: 'email', label: 'Best email', req: true },
      { id: 'biz.name', type: 'text', label: 'Business name, as customers know it', req: true },
      { id: 'biz.legal_name', type: 'text', label: 'Legal business name', hint: 'Only if it is different.' },
      { id: 'biz.address', type: 'text', label: 'Business address' },
      { id: 'biz.hide_address', type: 'check', label: 'I work from home. Hide my address.' },
      { id: 'biz.area', type: 'tags', label: 'Service area', hint: 'Cities, counties or a radius. Press Enter after each.' },
      { id: 'biz.hours', type: 'hours', label: 'Hours' },
      { id: 'biz.year', type: 'number', label: 'Year started' },
      { id: 'biz.team_size', type: 'select', label: 'Team size', options: [o('1', 'Just me'), o('2-5', '2 to 5'), o('6-15', '6 to 15'), o('16-50', '16 to 50'), o('50+', 'More than 50')] },
      { id: 'biz.approver_name', type: 'text', label: 'Who approves the work, if not you?', hint: 'Name. Leave blank if it is you.' },
      { id: 'biz.approver_email', type: 'email', label: 'Their email', when: (c, a) => !blank(ans(a, 'biz.approver_name')) },
    ],
  },
  {
    id: 'web', title: 'Online presence', icon: '🌐', minutes: 3,
    blurb: 'Website, Google Business Profile, social links',
    lead: 'Where people find you today. Paste links; skip anything you do not have.',
    why: 'We read your current site for copy worth keeping, pull reviews from your Google profile, and link your socials so nothing you built is lost.',
    when: () => true,
    fields: [
      { id: 'web.site', type: 'url', label: 'Current website', when: (c, a) => ans(a, 'web.no_site') !== true },
      { id: 'web.no_site', type: 'check', label: 'I don\'t have a website' },
      { id: 'web.gbp_status', type: 'select', label: 'Google Business Profile', options: [o('have', 'I have one'), o('none', 'I don\'t have one'), UNSURE] },
      { id: 'web.gbp', type: 'url', label: 'Google Business Profile link', when: (c, a) => ans(a, 'web.gbp_status') === 'have', hint: 'Search your business on Google Maps, press Share, paste the link.' },
      { id: 'web.facebook', type: 'url', label: 'Facebook' },
      { id: 'web.instagram', type: 'url', label: 'Instagram' },
      { id: 'web.linkedin', type: 'url', label: 'LinkedIn' },
      { id: 'web.tiktok', type: 'url', label: 'TikTok' },
      { id: 'web.youtube', type: 'url', label: 'YouTube' },
      { id: 'web.zillow', type: 'url', label: 'Zillow profile', when: ind('realtor', 'lender') },
      { id: 'web.realtor_com', type: 'url', label: 'Realtor.com profile', when: ind('realtor', 'lender') },
      { id: 'web.yelp', type: 'url', label: 'Yelp', when: ind('service') },
      { id: 'web.angi', type: 'url', label: 'Angi', when: ind('service') },
      { id: 'web.nextdoor', type: 'url', label: 'Nextdoor', when: ind('service') },
      { id: 'web.bbb', type: 'url', label: 'BBB', when: ind('service') },
      { id: 'web.analytics', type: 'select', label: 'Do you use Google Analytics or Search Console?', options: YNU },
      { id: 'web.domain_own', type: 'select', label: 'Do you own a domain?', options: YNU },
      { id: 'web.domain', type: 'text', label: 'Which domain?', hint: 'For example yourbusiness.com', when: (c, a) => ans(a, 'web.domain_own') === 'yes' },
      { id: 'web.registrar', type: 'select', label: 'Where did you buy it?', options: REGISTRARS, when: (c, a) => ans(a, 'web.domain_own') === 'yes' },
    ],
  },
  {
    id: 'ind', title: 'Industry details', icon: '🧭', minutes: 4,
    titleFor: ctx => ({ realtor: 'Realtor details', lender: 'Lender details', service: 'Service details' }[ctx.industry] || 'Industry details'),
    iconFor: ctx => ({ realtor: '🏡', lender: '🏦', service: '🛠️' }[ctx.industry] || '🧭'),
    blurbFor: ctx => ({ realtor: 'License, brokerage, broker approval, areas you serve', lender: 'NMLS, loan products, compliance contact', service: 'Your trade, services, licenses and guarantees' }[ctx.industry] || 'Tell us what kind of business you are first'),
    lead: 'The details that keep your marketing compliant and specific to what you do.',
    why: 'Your industry has advertising rules. Getting these right up front means your site launches compliant instead of being fixed after.',
    when: () => true,
    fields: [
      { id: 'ind.pick_first', type: 'note', label: 'Pick what kind of business you are in "Your business" first, and the right questions appear here.', when: ctx => !ctx.industry },
      // realtor
      { id: 're.license', type: 'text', labelFor: ctx => `${stateName(ctx)}license number`, req: true, when: ind('realtor') },
      { id: 're.other_states', type: 'tags', label: 'Other states you are licensed in', when: ind('realtor') },
      { id: 're.brokerage', type: 'text', label: 'Brokerage name, exactly as licensed', req: true, when: ind('realtor') },
      { id: 're.brokerage_logo', type: 'file', slot: 'logos', label: 'Brokerage logo', hint: 'Optional. It goes beside your name where the rules require it.', when: ind('realtor') },
      { id: 're.broker_name', type: 'text', label: 'Supervising broker\'s name', req: true, when: ind('realtor'), hint: 'They approve your advertising, so they see the site before it goes live.' },
      { id: 're.broker_email', type: 'email', label: 'Supervising broker\'s email', req: true, when: ind('realtor') },
      { id: 're.solo', type: 'select', label: 'Solo agent or a team?', options: [o('solo', 'Solo'), o('team', 'Team')], when: ind('realtor') },
      { id: 're.team_name', type: 'text', label: 'Team name', when: (c, a) => c.industry === 'realtor' && ans(a, 're.solo') === 'team',
        hintFor: ctx => (ctx.rules && ctx.rules.teamNameBanned ? `In ${ctx.rules.name}, a team name cannot include ${ctx.rules.teamNameBanned.map(w => `"${w}"`).join(', ')}.` : '') },
      { id: 're.focus', type: 'multi', label: 'Who do you focus on?', when: ind('realtor'),
        options: [o('buyers', 'Buyers'), o('sellers', 'Sellers'), o('investors', 'Investors'), o('relocation', 'Relocation'), o('luxury', 'Luxury'), o('first_time', 'First-time buyers'), o('land', 'Land / rural')] },
      { id: 're.areas', type: 'tags', label: 'Neighborhoods and cities you serve', when: ind('realtor') },
      { id: 're.price_range', type: 'text', label: 'Typical price range', when: ind('realtor') },
      { id: 're.designations', type: 'tags', label: 'Designations', hint: 'CRS, ABR, GRI…', when: ind('realtor') },
      { id: 're.listings', type: 'select', label: 'Show listings on your website?', options: YNU, when: ind('realtor') },
      { id: 're.mls', type: 'text', label: 'Which MLS?', when: (c, a) => c.industry === 'realtor' && ans(a, 're.listings') === 'yes',
        hint: 'Listings need your broker\'s sign-off and an approved feed, which can take longer than the 14-day launch.' },
      { id: 're.sales', type: 'list', label: 'Recent sales to feature', hint: 'Optional. Up to six.', max: 6, when: ind('realtor'),
        fields: [{ id: 'area', type: 'text', label: 'Address or area' }, { id: 'price', type: 'text', label: 'Price' },
          { id: 'role', type: 'select', label: 'Your side', options: [o('buyer', 'Buyer'), o('seller', 'Seller'), o('both', 'Both')] }] },
      // lender
      { id: 'ln.lo_name', type: 'text', label: 'Your name as it appears on NMLS', req: true, when: ctx => ctx.industry === 'lender' && ctx.lenderKind === 'lo' },
      { id: 'ln.lo_nmls', type: 'text', label: 'Your personal NMLS number', req: true, when: ctx => ctx.industry === 'lender' && ctx.lenderKind === 'lo' },
      { id: 'ln.company', type: 'text', label: 'Company name', req: true, when: ind('lender') },
      { id: 'ln.company_nmls', type: 'text', label: 'Company NMLS number', req: true, when: ind('lender') },
      { id: 'ln.states', type: 'tags', label: 'States licensed', when: ind('lender') },
      { id: 'ln.officers', type: 'list', label: 'Your loan officers', hint: 'Add their photos in Photos & files.', max: 40, when: ctx => ctx.industry === 'lender' && ctx.lenderKind === 'company',
        fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'nmls', type: 'text', label: 'NMLS' }, { id: 'title', type: 'text', label: 'Title' }, { id: 'email', type: 'email', label: 'Email' }] },
      { id: 'ln.products', type: 'multi', label: 'Loan products', when: ind('lender'),
        options: [o('conventional', 'Conventional'), o('fha', 'FHA'), o('va', 'VA'), o('usda', 'USDA'), o('jumbo', 'Jumbo'), o('dscr', 'DSCR / investor'), o('nonqm', 'Non-QM'), o('reverse', 'Reverse'), o('refi', 'Refinance'), o('heloc', 'HELOC')] },
      { id: 'ln.fha', type: 'select', label: 'Are you an FHA-approved lender or a bank?', options: YNU, when: ind('lender'), hint: 'This decides the Equal Housing logo. We show it unless you tell us otherwise.' },
      { id: 'ln.pos', type: 'url', label: 'Online application link', when: ind('lender') },
      { id: 'ln.compliance_name', type: 'text', label: 'Who approves your marketing?', when: ind('lender'), need: 'Compliance contact' },
      { id: 'ln.compliance_email', type: 'email', label: 'Their email', when: ind('lender') },
      { id: 'ln.rates', type: 'select', label: 'Show rates on the website?', options: [o('no', 'No'), o('yes', 'Yes, with compliance-approved wording')], when: ind('lender'),
        hint: 'Rates trigger required disclosures. We only show them with wording your compliance contact has approved.' },
      { id: 'ln.partners', type: 'list', label: 'Realtor referral partners to track', hint: 'Optional.', max: 40, when: ind('lender'),
        fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'company', type: 'text', label: 'Brokerage' }] },
      // service
      { id: 'sv.trade', type: 'select', label: 'Your trade', req: true, when: ind('service'),
        options: [o('roofing', 'Roofing'), o('hvac', 'HVAC'), o('plumbing', 'Plumbing'), o('electrical', 'Electrical'), o('landscaping', 'Landscaping'), o('cleaning', 'Cleaning'), o('painting', 'Painting'), o('remodeling', 'Remodeling'), o('pest', 'Pest control'), o('other', 'Something else')] },
      { id: 'sv.trade_other', type: 'text', label: 'What is it?', when: (c, a) => c.industry === 'service' && ans(a, 'sv.trade') === 'other' },
      { id: 'sv.services', type: 'list', label: 'Your services', req: true, max: 30, when: ind('service'), hint: 'One row per service. A sentence or two each is plenty.',
        fields: [{ id: 'name', type: 'text', label: 'Service' }, { id: 'desc', type: 'text', label: 'What it is' },
          { id: 'show_price', type: 'select', label: 'Show a price?', options: [o('yes', 'Yes'), o('from', '"Starting at"'), o('no', 'No')] }, { id: 'price', type: 'text', label: 'Price' }] },
      { id: 'sv.licensed', type: 'select', label: 'Licensed?', options: YN, when: ind('service') },
      { id: 'sv.license_type', type: 'text', label: 'License type', when: (c, a) => c.industry === 'service' && ans(a, 'sv.licensed') === 'yes' },
      { id: 'sv.license_no', type: 'text', label: 'License number', when: (c, a) => c.industry === 'service' && ans(a, 'sv.licensed') === 'yes' },
      { id: 'sv.insured', type: 'select', label: 'Insured?', options: YN, when: ind('service') },
      { id: 'sv.insurance', type: 'file', slot: 'documents', label: 'Insurance certificate', hint: 'We only say "insured" on your site if we have this.', when: (c, a) => c.industry === 'service' && ans(a, 'sv.insured') === 'yes' },
      { id: 'sv.bonded', type: 'select', label: 'Bonded?', options: YNU, when: ind('service') },
      { id: 'sv.ag_reg', type: 'text', labelFor: ctx => (ctx.rules && ctx.rules.roofingRegistration) || 'Roofing registration number',
        when: (c, a) => c.industry === 'service' && ans(a, 'sv.trade') === 'roofing' && !!(c.rules && c.rules.roofingRegistration),
        req: (c, a) => c.industry === 'service' && ans(a, 'sv.trade') === 'roofing' && !!(c.rules && c.rules.roofingRegistration) },
      { id: 'sv.emergency', type: 'select', label: 'Emergency or after-hours service?', options: YN, when: ind('service') },
      { id: 'sv.estimates', type: 'select', label: 'Free estimates?', options: YN, when: ind('service') },
      { id: 'sv.financing', type: 'select', label: 'Financing available?', options: YN, when: ind('service') },
      { id: 'sv.warranty', type: 'text', label: 'Warranty or guarantee', hint: 'In your words, if you offer one.', when: ind('service') },
      { id: 'sv.busy', type: 'multi', label: 'Busy months', options: MONTHS, when: ind('service') },
    ],
  },
  {
    id: 'brand', title: 'Brand & design', icon: '🎨', minutes: 4,
    blurb: 'Logo, colors, the look and feel you want',
    lead: 'This shapes your website and your Business Suite. Not sure on something? Pick "you decide" and we\'ll take it from here.',
    leadFor: ctx => (has(ctx, 'website') && has(ctx, 'suite') ? null : has(ctx, 'website') ? 'This shapes your website. Not sure on something? Pick "you decide" and we\'ll take it from here.' : 'Not sure on something? Pick "you decide" and we\'ll take it from here.'),
    why: 'Your colors and feel go into everything we build, so it all looks like one brand from day one.',
    when: () => true,
    fields: [
      { id: 'brand.logo_status', type: 'select', label: 'Your logo', options: [o('have', 'I have one'), o('none', 'I don\'t have one'), o('refresh', 'I have one but want a refresh')] },
      { id: 'brand.logo', type: 'file', slot: 'logos', label: 'Upload your logo', hint: 'PNG, SVG or PDF. The largest version you have.', when: (c, a) => ans(a, 'brand.logo_status') !== 'none', need: 'Your logo' },
      { id: 'brand.colors', type: 'colors', label: 'Brand colors', hint: 'Pull them from your logo, pick your own, or leave it to us.' },
      { id: 'brand.fonts', type: 'text', label: 'Fonts you use', hint: 'Optional.' },
      { id: 'brand.feel', type: 'multi', label: 'Pick up to 3 words for the feel', hint: 'What should people feel when they land on your site?', max: 3, options: FEEL_OPTIONS },
      { id: 'brand.love', type: 'list', label: '3 websites you love', hint: 'Any industry. Tell us what you like about each.', max: 3,
        fields: [{ id: 'url', type: 'url', label: 'Link' }, { id: 'why', type: 'text', label: 'What you like' }] },
      { id: 'brand.avoid_url', type: 'url', label: 'One website you don\'t want to look like', hint: 'Optional.' },
      { id: 'brand.avoid_why', type: 'text', label: 'Why not?', when: (c, a) => !blank(ans(a, 'brand.avoid_url')) },
      { id: 'brand.words', type: 'tags', label: '3 words your best clients use to describe you', max: 3 },
    ],
  },
  {
    id: 'site', title: 'Your website', icon: '💻', minutes: 5,
    blurb: 'Your story, services, the #1 thing visitors should do',
    lead: 'The goal of your site, the pages it needs, and the story only you can tell.',
    why: 'A site with one clear job converts. Your story is the part no template can write for you.',
    when: ctx => has(ctx, 'website'),
    fields: [
      { id: 'site.action', type: 'select', label: 'The #1 thing visitors should do', options: [o('call', 'Call'), o('book', 'Book a time'), o('quote', 'Request a quote'), o('apply', 'Apply'), o('search', 'Search homes'), o('other', 'Something else')] },
      { id: 'site.action_other', type: 'text', label: 'What is it?', when: (c, a) => ans(a, 'site.action') === 'other' },
      { id: 'site.lead_emails', type: 'tags', label: 'Where should new leads be emailed?', hint: 'One or more addresses.' },
      { id: 'site.into_suite', type: 'note', label: 'Every lead from your site also lands straight in your Business Suite.', when: ctx => isGrowth(ctx) },
      { id: 'site.booking', type: 'url', label: 'Booking link, if you use one', hint: 'Calendly or similar.' },
      { id: 'site.pages', type: 'multi', label: 'Pages', hint: 'We checked the usual ones for your industry. Change anything.',
        optionsFor: ctx => [...PAGES.common, ...(PAGES[ctx.industry] || [])], defaultFor: ctx => PAGE_DEFAULTS[ctx.industry] || ['home', 'about', 'services', 'contact'] },
      { id: 'site.story_why', type: 'long', label: 'Why did you start?', hint: 'A few sentences, in your own words.', need: 'Your story' },
      { id: 'site.story_diff', type: 'long', label: 'What makes you different?' },
      { id: 'site.ideal', type: 'long', label: 'Who do you love working with?' },
      { id: 'site.must_say', type: 'text', label: 'Anything the site must say' },
      { id: 'site.must_not', type: 'text', label: 'Anything it must never say' },
      { id: 'site.testimonials', type: 'list', label: 'Testimonials', hint: 'Only if you don\'t have Google reviews. We need permission to use each one.', max: 10,
        when: (c, a) => ans(a, 'web.gbp_status') !== 'have',
        fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'text', type: 'text', label: 'What they said' }, { id: 'ok', type: 'check', label: 'I have their permission' }] },
    ],
  },
  {
    id: 'suite', title: 'Your Business Suite', icon: '📊', minutes: 6,
    blurb: 'Your 3 goals, dashboard tiles, team, how you sell',
    lead: 'Your goals become your dashboard. Your sales steps become your pipeline.',
    why: 'Your Business Suite opens on your own numbers from day one, not a blank template.',
    when: ctx => has(ctx, 'suite'),
    fields: [
      { id: 'suite.goals', type: 'list', label: '3 number goals for the next 12 months', req: true, min: 3, max: 3, need: 'Your 3 goals',
        hintFor: ctx => (GOAL_SUGGESTIONS[ctx.industry] ? `For example: ${GOAL_SUGGESTIONS[ctx.industry].join(', ')}.` : 'A label and a target number for each.'),
        fields: [{ id: 'label', type: 'text', label: 'Goal' }, { id: 'target', type: 'text', label: 'Target' }] },
      { id: 'suite.why', type: 'text', label: 'One lifestyle goal', hint: 'The why. It sits on your dashboard.' },
      { id: 'suite.avg', type: 'number', labelFor: ctx => (ctx.industry === 'service' ? 'Average job value ($)' : 'Average deal value ($)'), hint: 'For your revenue projections.' },
      { id: 'suite.tiles', type: 'multi', label: 'Dashboard tiles', hint: 'Pick what you want to see first thing.', optionsFor: (ctx, cfg) => tilesFor(ctx, cfg).map(t => o(t, t)) },
      { id: 'suite.sources', type: 'multi', label: 'How do leads come in today?',
        options: [o('referrals', 'Referrals'), o('website', 'Website'), o('google', 'Google'), o('zillow', 'Zillow'), o('social', 'Social'), o('open_houses', 'Open houses'), o('signs', 'Signs'), o('angi', 'Angi / Thumbtack'), o('walk_ins', 'Walk-ins'), o('other', 'Other')] },
      { id: 'suite.pipeline', type: 'pipeline', label: 'Your sales stages', hint: 'Rename, reorder, add or remove. This becomes your pipeline.' },
      { id: 'suite.speed_now', type: 'select', label: 'How fast do you follow up today?', options: [o('5m', 'Within 5 minutes'), o('1h', 'Within the hour'), o('day', 'Same day'), o('next', 'Next day'), o('later', 'Longer'), UNSURE] },
      { id: 'suite.speed_goal', type: 'select', label: 'How fast would you like to?', options: [o('5m', 'Within 5 minutes'), o('1h', 'Within the hour'), o('day', 'Same day'), UNSURE] },
      { id: 'suite.team', type: 'list', label: 'Your team', max: 50, hintFor: (ctx, cfg) => (cfg && cfg.seatsIncluded ? `${cfg.seatsIncluded} seats are included. Each person here gets one.` : 'Each person here gets a seat.'),
        fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'email', type: 'email', label: 'Email' },
          { id: 'role', type: 'select', label: 'Role', options: [o('owner', 'Owner'), o('member', 'Team member')] }, { id: 'pct', type: 'text', label: 'Commission % (optional)' }] },
      { id: 'suite.tools', type: 'multi', label: 'What are you moving off?',
        options: [o('sheets', 'Spreadsheets'), o('phone', 'Phone / notes'), o('crm', 'Another CRM'), o('quickbooks', 'QuickBooks'), o('gcal', 'Google Calendar'), o('outlook', 'Outlook'), o('other', 'Other')] },
      { id: 'suite.crm_name', type: 'text', label: 'Which CRM?', when: (c, a) => A(ans(a, 'suite.tools')).includes('crm') },
      { id: 'suite.calendar', type: 'select', label: 'Your calendar', options: [o('google', 'Google'), o('outlook', 'Outlook'), UNSURE] },
    ],
  },
  {
    id: 'text', title: 'Texting setup', icon: '💬', minutes: 5,
    blurb: 'Carrier registration so your texts get delivered',
    lead: 'Carriers require a registration before a business can text. These answers have to match your tax records exactly.',
    why: 'Carrier approval usually takes 2 to 3 weeks and runs outside your launch. Texting switches on the day it is approved.',
    when: ctx => has(ctx, 'automations'),
    fields: [
      { id: 'tx.legal_name', type: 'text', label: 'Legal business name', hint: 'Exactly as on your IRS EIN letter.', req: true },
      { id: 'tx.biz_type', type: 'select', label: 'Business type', req: true,
        options: [o('llc', 'LLC'), o('corp', 'Corporation'), o('scorp', 'S corporation'), o('partnership', 'Partnership'), o('sole', 'Sole proprietor'), o('nonprofit', 'Nonprofit')] },
      { id: 'tx.ein', type: 'text', label: 'EIN', hint: 'Nine digits, like 12-3456789. Sole proprietor without one? Leave it blank. Never enter a Social Security number.',
        req: (c, a) => ans(a, 'tx.biz_type') !== 'sole' },
      { id: 'tx.address', type: 'text', label: 'Business address, matching your tax records', req: true },
      { id: 'tx.rep_name', type: 'text', label: 'Authorized representative: name', req: true },
      { id: 'tx.rep_title', type: 'text', label: 'Their title', req: true },
      { id: 'tx.rep_email', type: 'email', label: 'Their email', req: true },
      { id: 'tx.rep_mobile', type: 'phone', label: 'Their mobile', req: true },
      { id: 'tx.ein_letter', type: 'file', slot: 'documents', label: 'EIN letter', hint: 'IRS CP 575 or 147C. A photo is fine.', need: (c, a) => (ans(a, 'tx.biz_type') !== 'sole' ? 'Your EIN letter' : '') },
      { id: 'tx.number', type: 'select', label: 'Text from…', options: [o('new', 'A new number'), o('keep', 'My current number')] },
      { id: 'tx.keep_number', type: 'phone', label: 'Which number?', when: (c, a) => ans(a, 'tx.number') === 'keep' },
      { id: 'tx.hours', type: 'text', label: 'Business hours for automatic replies' },
      { id: 'tx.alert_name', type: 'text', label: 'Who gets new-lead alerts?' },
      { id: 'tx.alert_mobile', type: 'phone', label: 'Their mobile' },
      { id: 'tx.review_link', type: 'url', label: 'Your Google review link' },
      { id: 'tx.which', type: 'multi', label: 'Which automations?', options: AUTOMATIONS, defaultFor: () => AUTOMATIONS.map(x => x.v) },
      { id: 'tx.optin', type: 'multi', label: 'Where do customers give you their number?', options: [o('web', 'Web forms'), o('calls', 'Phone calls'), o('in_person', 'In person'), o('other', 'Other')] },
      { id: 'tx.optin_how', type: 'text', label: 'How do you get their permission to text?' },
    ],
  },
  {
    id: 'access', title: 'Access', icon: '🔑', minutes: 3,
    blurb: 'Invite us to your domain and Google profile. Never a password.',
    lead: 'We will never ask for a password, a card number or a Social Security number. Each item below is an invite you send us.',
    why: 'Invites can be removed any time, from your side. A shared password can\'t.',
    when: () => true,
    fields: [
      { id: 'ax.none', type: 'note', label: 'Nothing to do here for what you bought. Skip ahead.', when: (c, a) => !accessItems(c, a).length },
      { id: 'ax.domain', type: 'access', label: 'Your domain', guide: 'domain', need: 'Domain access', when: (c, a) => has(c, 'website') && ans(a, 'web.domain_own') !== 'no' },
      { id: 'ax.gbp', type: 'access', label: 'Google Business Profile', guide: 'gbp', need: 'Google profile access', when: (c, a) => ans(a, 'web.gbp_status') === 'have' },
      { id: 'ax.meta', type: 'access', label: 'Facebook and Instagram', guide: 'meta', when: (c, a) => !blank(ans(a, 'web.facebook')) || !blank(ans(a, 'web.instagram')) },
      { id: 'ax.analytics', type: 'access', label: 'Google Analytics and Search Console', guide: 'analytics', when: (c, a) => ans(a, 'web.analytics') === 'yes' },
    ],
  },
  {
    id: 'files', title: 'Photos & files', icon: '📸', minutes: 3,
    blurb: 'Headshots, photos, your contact list. Easiest on a computer.',
    lead: 'Drag files in, or tap to choose. On a phone this is slower; a computer is easiest. Or reply to any of our emails with the files.',
    why: 'Real photos beat stock every time, and your contact list means your Business Suite starts full.',
    when: () => true,
    fields: [
      { id: 'fl.logos', type: 'file', slot: 'logos', label: 'Logos', hint: 'Any versions not added in Brand & design: white, black, icon.' },
      { id: 'fl.headshot', type: 'file', slot: 'headshot', label: 'Headshot', need: ctx => (has(ctx, 'website') ? 'A headshot' : '') },
      { id: 'fl.team', type: 'file', slot: 'team', label: 'Team photos' },
      { id: 'fl.work', type: 'file', slot: 'work', labelFor: ctx => ({ realtor: 'Listings and happy clients', lender: 'Happy clients and closings', service: 'Your work: jobs, before and after' }[ctx.industry] || 'Your work') },
      { id: 'fl.office', type: 'file', slot: 'office', label: 'Office or storefront' },
      { id: 'fl.videos', type: 'file', slot: 'videos', label: 'Videos' },
      { id: 'fl.contacts', type: 'file', slot: 'contacts', label: 'Contact list for your Business Suite', hint: 'CSV, XLS or XLSX, any shape. Kept private.', when: ctx => has(ctx, 'suite') },
      { id: 'fl.documents', type: 'file', slot: 'documents', label: 'Other documents', hint: 'Insurance certificate, EIN letter, anything else. Kept private.' },
      { id: 'fl.rights', type: 'check', label: 'I own or have permission to use everything I upload.', req: (c, a, files) => A(files).length > 0 },
    ],
  },
];
export const REVIEW = { id: 'review', title: 'Review & submit', icon: '🚀' };
/* the big line at the top of each section screen */
const HEADLINES = {
  biz: 'Let\'s start with the basics.', web: 'Where people find you today.', brand: 'Let\'s get the look right.',
  site: 'Your website\'s one job.', suite: 'Your numbers. Your pipeline.', text: 'Get your texts delivered.',
  access: 'Invite us in. Never a password.', files: 'Bring the real stuff.',
};
export const sectionHeadline = (s, ctx) => (s.id === 'ind'
  ? ({ realtor: 'Keep your marketing broker-approved.', lender: 'Keep your marketing compliant.', service: 'Show what you do best.' }[ctx && ctx.industry] || 'Tell us what you do.')
  : HEADLINES[s.id] || s.title);
/** Multi-selects that start pre-checked (pages, automations) get their
 *  defaults WRITTEN into the answers the first time the section opens, so
 *  what the screen shows checked is what gets saved and built. */
export function withDefaults(answers, s, ctx) {
  let a = answers;
  for (const f of s.fields) if (f.defaultFor && (answers || {})[f.id] === undefined && fieldShown(f, ctx, answers)) { a = a === answers ? { ...answers } : a; a[f.id] = f.defaultFor(ctx); }
  return a;
}

/* the access guides: short, plain steps. `agency` is who to invite. */
export function accessGuide(key, { agency = 'us', agencyEmail = '', registrar = '' } = {}) {
  const who = agencyEmail || `the email ${agency} sends you`;
  const g = {
    domain: {
      godaddy: [`Sign in to GoDaddy and open Settings → Account → Delegate access.`, `Invite ${who} with "Products, Domains & Purchase" access.`, 'Tick Done below.'],
      namecheap: ['Sign in to Namecheap and open Profile → Sharing & Transfer.', `Share the domain with ${who} (Share access, not Transfer).`, 'Tick Done below.'],
      cloudflare: ['Sign in to Cloudflare and open Manage Account → Members.', `Invite ${who} as Administrator for this domain.`, 'Tick Done below.'],
      _: ['Prefer not to share access? Choose "Send me the 2 DNS records" and we will email you exactly what to add.', 'Or sign in where you bought the domain and look for "delegate", "share" or "members".', `Invite ${who}, then tick Done below.`],
    },
    gbp: [`Open business.google.com and choose your business.`, 'Menu → Business Profile settings → People and access → Add.', `Add ${who} as a Manager (not Owner), then tick Done.`],
    meta: ['Open business.facebook.com → Settings → Partners.', `Add ${agency} as a partner using the business ID we send you, with access to your Page and Instagram account.`, 'Tick Done below.'],
    analytics: [`Analytics: Admin → Account access management → Add ${who} as a Viewer.`, `Search Console: Settings → Users and permissions → Add ${who} with Full access.`, 'Tick Done below.'],
  }[key];
  if (key === 'domain') return g[registrar] || g._;
  return g || [];
}

/* ---------- reading sections and fields against a context ---------- */
const call = (v, ...args) => (typeof v === 'function' ? v(...args) : v);
export const sectionTitle = (s, ctx) => (s.titleFor ? s.titleFor(ctx) : s.title);
export const sectionIcon = (s, ctx) => (s.iconFor ? s.iconFor(ctx) : s.icon);
export const sectionBlurb = (s, ctx) => (s.blurbFor ? s.blurbFor(ctx) : s.blurb);
export const sectionLead = (s, ctx) => (s.leadFor && s.leadFor(ctx)) || s.lead;
export const fieldLabel = (f, ctx) => (f.labelFor ? f.labelFor(ctx) : f.label);
export const fieldHint = (f, ctx, cfg) => (f.hintFor ? f.hintFor(ctx, cfg) : f.hint) || '';
export const fieldOptions = (f, ctx, cfg) => (f.optionsFor ? f.optionsFor(ctx, cfg) : A(f.options));

/** The sections this client sees, in order (review not included). */
export const visibleSections = ctx => SECTIONS.filter(s => s.when(ctx));
export const fieldShown = (f, ctx, answers) => !f.when || !!f.when(ctx, answers || {});
export const shownFields = (s, ctx, answers) => s.fields.filter(f => fieldShown(f, ctx, answers));
export const isRequired = (f, ctx, answers, files) => !!call(f.req, ctx, answers || {}, files || []);
export const needLabel = (f, ctx, answers) => S(call(f.need, ctx, answers || {})) || '';
export const ALL_FIELDS = SECTIONS.flatMap(s => s.fields.map(f => ({ ...f, section: s.id })));
const FIELD_BY_ID = Object.fromEntries(ALL_FIELDS.map(f => [f.id, f]));
export const fieldById = id => FIELD_BY_ID[id] || null;
export const tilesFor = (ctx, cfg) => {
  const t = (cfg && cfg.tiles) || DEFAULT_TILES;
  return [...A(t.all), ...A(t[ctx && ctx.industry])];
};
export const pipelineFor = (ctx, cfg) => A(((cfg && cfg.pipelines) || DEFAULT_PIPELINES)[ctx && ctx.industry]).slice();
export const accessItems = (ctx, answers) => SECTIONS.find(s => s.id === 'access').fields.filter(f => f.type === 'access' && fieldShown(f, ctx, answers));

/* ---------- is a field answered? ---------- */
/** files: [{slot}] already uploaded. A `file` field is answered when its slot
 *  holds a file; `brand.logo` also counts any logo uploaded elsewhere. */
export function answered(f, answers, files, ctx, cfg) {
  const v = (answers || {})[f.id];
  switch (f.type) {
    case 'note': return true;
    case 'file': return A(files).some(x => x && x.slot === f.slot);
    case 'check': return v === true;
    case 'list': {
      const rows = A(v).filter(r => r && Object.values(r).some(x => !blank(x) && x !== false));
      if (f.min) return rows.filter(r => f.fields.every(sf => sf.type === 'check' || !blank(r[sf.id]))).length >= f.min;
      return rows.length > 0;
    }
    case 'colors': return !!(v && (v.mode === 'decide' || A(v.list).length));
    case 'hours': return !!(v && (v.mode === 'appt' || Object.values(v.days || {}).some(d => d && d.open)));
    case 'access': return !!(v && (v.done === true || v.method === 'dns'));
    case 'pipeline': return A(v).length > 0 || pipelineFor(ctx, cfg).length > 0;
    default: return !blank(v);
  }
}

/* ---------- required and still needed ---------- */
/** Required fields that are empty, in the client's sections. These block
 *  submit. -> [{id, label, section, sectionTitle}] */
export function missingRequired(ctx, answers, files, cfg) {
  const out = [];
  for (const s of visibleSections(ctx)) for (const f of shownFields(s, ctx, answers)) {
    if (isRequired(f, ctx, answers, files) && !answered(f, answers, files, ctx, cfg)) out.push({ id: f.id, label: fieldLabel(f, ctx), section: s.id, sectionTitle: sectionTitle(s, ctx) });
  }
  return out;
}

/** "What we still need": the deposit (from the lead's checklist), every field
 *  with a `need` label, and any required field still empty. Done items stay in
 *  the list, ticked, the way the mockup shows them. Never blocks submit on its
 *  own; missingRequired() does that.
 *  -> [{key, label, where, ok, note}] */
export function stillNeeded(ctx, answers, files, checklist, cfg) {
  const out = [];
  const cl = checklistState(checklist);
  if (!cl.depositSkipped) out.push({ key: 'deposit', label: 'Deposit', where: '', ok: !!cl.depositAt, note: cl.depositAt ? `Paid ${shortDate(cl.depositAt)}` : 'We send the link' });
  const seen = new Set();
  for (const s of visibleSections(ctx)) for (const f of shownFields(s, ctx, answers)) {
    const need = needLabel(f, ctx, answers);
    const req = isRequired(f, ctx, answers, files);
    if (!need && !req) continue;
    const label = need || fieldLabel(f, ctx);
    if (seen.has(label)) continue; seen.add(label);
    const okk = answered(f, answers, files, ctx, cfg);
    if (!need && okk) continue;                 // a filled required field is not news
    out.push({ key: f.id, label, where: sectionTitle(s, ctx), section: s.id, ok: okk, note: okk ? 'Added' : sectionTitle(s, ctx) });
  }
  return out;
}

/* ---------- the lead's checklist, read ---------- */
const doneOf = v => (!v ? null : typeof v === 'string' ? v : v.done || null);
/** checklist: the jsonb onboarding_public() returns (deposit_paid, access_dns,
 *  access_gbp, access_social, onbSkip), or a lead's own `onboarding` object
 *  plus `onbSkip`. */
export function checklistState(checklist) {
  const c = checklist || {};
  if ('depositAt' in c && 'access' in c) return c;     // already normalised (the portal gets this shape)
  const skip = A(c.onbSkip);
  return {
    depositAt: skip.includes('deposit_paid') ? null : doneOf(c.deposit_paid),
    depositSkipped: skip.includes('deposit_paid'),
    access: { dns: doneOf(c.access_dns), gbp: doneOf(c.access_gbp), social: doneOf(c.access_social) },
  };
}
/** Which checklist access items this client's launch waits on. */
export function requiredAccess(ctx, answers) {
  const keys = [];
  if (accessItems(ctx, answers).some(f => f.id === 'ax.domain')) keys.push('dns');
  if (accessItems(ctx, answers).some(f => f.id === 'ax.gbp')) keys.push('gbp');
  return keys;
}

/* ---------- the launch clock: derived, never stored ---------- */
export function addBusinessDays(isoDate, n) {
  const d = new Date(String(isoDate).slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime())) return null;
  let left = Math.max(0, Math.floor(Number(n) || 0));
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return d.toISOString().slice(0, 10);
}
/** The clock starts on the LATEST of: submitted, deposit paid, and each
 *  required access item received. Until all are in, it has not started and
 *  `waiting` names what it waits on. launchDays null means the offer never set
 *  it, and the target is null rather than a guess. */
export function launchState({ submittedAt, checklist, ctx, answers, launchDays }) {
  const cl = checklistState(checklist);
  const waits = [];
  const dates = [];
  if (submittedAt) dates.push(String(submittedAt).slice(0, 10)); else waits.push('your onboarding');
  if (cl.depositSkipped) { /* monthly-only client: nothing to wait for */ }
  else if (cl.depositAt) dates.push(String(cl.depositAt).slice(0, 10)); else waits.push('your deposit');
  for (const k of requiredAccess(ctx, answers)) {
    if (cl.access[k]) dates.push(String(cl.access[k]).slice(0, 10));
    else waits.push(k === 'dns' ? 'domain access' : 'Google profile access');
  }
  if (waits.length) return { started: false, waiting: waits, startedOn: null, target: null };
  const startedOn = dates.sort().pop();
  const days = Number.isInteger(launchDays) && launchDays > 0 ? launchDays : null;
  return { started: true, waiting: [], startedOn, target: days ? addBusinessDays(startedOn, days) : null, launchDays: days };
}

/* ---------- progress ---------- */
/** Per-section status for the dashboard. A section is DONE when the client
 *  pressed "Save & continue" on it and nothing required in it is empty; NOW is
 *  the first section that is not done; the rest are NEXT (the one after NOW
 *  reads "Up next"). */
export function progress(ctx, answers, files, sections, cfg) {
  const vis = visibleSections(ctx);
  const req = missingRequired(ctx, answers, files, cfg);
  const st = vis.map(s => {
    const marked = !!(sections && sections[s.id] && sections[s.id].done);
    const empties = shownFields(s, ctx, answers).filter(f => f.type !== 'note' && f.type !== 'access');
    const filled = empties.filter(f => answered(f, answers, files, ctx, cfg)).length;
    return { id: s.id, done: marked && !req.some(r => r.section === s.id), filled, total: empties.length, minutes: s.minutes };
  });
  const nowIdx = st.findIndex(x => !x.done);
  st.forEach((x, i) => { x.state = x.done ? 'done' : i === nowIdx ? 'now' : i === nowIdx + 1 ? 'next' : 'later'; });
  const done = st.filter(x => x.done).length;
  const left = st.filter(x => !x.done).reduce((a, x) => a + (x.state === 'now' && x.total ? Math.max(1, Math.round(x.minutes * (1 - x.filled / x.total))) : x.minutes), 0);
  return { sections: st, done, total: st.length, minutesLeft: left, current: nowIdx >= 0 ? st[nowIdx].id : 'review', allDone: nowIdx < 0 };
}

/* ---------- cleaning what the browser sends (the server's half) ---------- */
/* NEVER A PASSWORD, A CARD OR AN SSN (spec §11). The portal says so; this
   enforces it at the write. Any string anywhere in the answers that looks
   like a US Social Security number (3-2-4 digits, separated) or a card number
   (13-19 digits that pass the Luhn check) is refused, naming the field. An EIN
   (2-7) does not match. Phone numbers are too short to pass as cards. */
const SSN_RE = /(^|[^\d])(\d{3})[-\s.](\d{2})[-\s.](\d{4})(?!\d)/;
function luhn(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) { let d = digits.charCodeAt(i) - 48; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
  return sum % 10 === 0;
}
export function forbiddenNumber(s) {
  const t = String(s || '');
  const m = SSN_RE.exec(t);
  if (m && m[2] !== '000' && m[2] !== '666' && m[2][0] !== '9') return 'ssn';
  for (const run of t.match(/\d[\d -]{11,22}\d/g) || []) {
    const digits = run.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits) && !/^(\d)\1+$/.test(digits)) return 'card';
  }
  return null;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanScalar(type, v, f, ctx, cfg) {
  switch (type) {
    case 'check': return v === true;
    case 'select': { const opts = fieldOptions(f, ctx, cfg).map(x => x.v); const s = S(v, 60); return opts.includes(s) ? s : undefined; }
    case 'number': { const s = S(v, 20).replace(/[,$\s]/g, ''); return /^\d+(\.\d+)?$/.test(s) ? s : (s ? undefined : ''); }
    case 'long': return S(v, 3000);
    case 'url': return S(v, 500).trim();   // kept as typed; the page hints, the prompt quotes
    default: return S(v, type === 'email' || type === 'phone' ? 160 : 600);
  }
}

/** Rebuild the answers from the schema: unknown ids are dropped, each value is
 *  coerced to its field's type and capped, option values must exist. Returns
 *  { answers } or { error, field } when a value is a forbidden number. Answers
 *  for sections the client cannot currently see are KEPT (switching industry
 *  back must not lose what they typed); the outputs only read visible ones. */
export function cleanAnswers(raw, ctx, cfg) {
  const a = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [id, v] of Object.entries(a)) {
    const f = FIELD_BY_ID[id];
    if (!f || f.type === 'note' || f.type === 'file') continue;
    let c;
    switch (f.type) {
      case 'multi': { const opts = new Set(fieldOptions(f, ctx, cfg).map(x => x.v)); c = [...new Set(A(v).map(x => S(x, 80)))].filter(x => opts.has(x)); if (f.max) c = c.slice(0, f.max); break; }
      case 'tags': c = A(v).map(x => S(x, 120).trim()).filter(Boolean).slice(0, f.max || 40); break;
      case 'pipeline': c = A(v).map(x => S(x, 60).trim()).filter(Boolean).slice(0, 20); break;
      case 'colors': c = v && typeof v === 'object' ? { mode: ['logo', 'pick', 'decide'].includes(v.mode) ? v.mode : 'pick', list: A(v.list).filter(x => HEX_RE.test(String(x))).map(x => String(x).toUpperCase()).slice(0, 8) } : undefined; break;
      case 'hours': c = v && typeof v === 'object' ? { mode: v.mode === 'appt' ? 'appt' : 'hours', days: Object.fromEntries(DAYS.map(d => { const x = (v.days || {})[d] || {}; return [d, { open: x.open === true, from: TIME_RE.test(x.from) ? x.from : '09:00', to: TIME_RE.test(x.to) ? x.to : '17:00' }]; })) } : undefined; break;
      case 'access': c = v && typeof v === 'object' ? { done: v.done === true, method: v.method === 'dns' ? 'dns' : 'invite' } : undefined; break;
      case 'list': c = A(v).slice(0, f.max || 20).map(r => {
        const row = {};
        for (const sf of f.fields) { const x = cleanScalar(sf.type, r && r[sf.id], sf, ctx, cfg); if (x !== undefined && x !== '') row[sf.id] = x; }
        return row;
      }).filter(r => Object.keys(r).length); break;
      default: c = cleanScalar(f.type, v, f, ctx, cfg);
    }
    if (c === undefined) continue;
    const bad = forbiddenNumber(JSON.stringify(c));
    if (bad) return { error: bad === 'ssn'
      ? `"${fieldLabel(f, ctx)}" looks like a Social Security number. We never need one. Please remove it.`
      : `"${fieldLabel(f, ctx)}" looks like a card number. We never need one. Please remove it.`, field: id };
    out[id] = c;
  }
  return { answers: out };
}

export function cleanSections(raw) {
  const ids = new Set(SECTIONS.map(s => s.id));
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) if (ids.has(k) && v && v.done === true) out[k] = { done: true };
  return out;
}

/* ---------- prefill ---------- */
/** What we already know, as answers. Only fills fields the client has never
 *  set, and never overwrites. `plan` is the proposal's copy.plan; its numbers
 *  become the Business Suite goals. */
export function prefill(answers, { client = {}, plan = null, products = [] } = {}) {
  const a = { ...(answers || {}) };
  const put = (id, v) => { if (a[id] === undefined && !blank(v)) a[id] = v; };
  put('biz.contact_name', S(client.name, 120));
  put('biz.email', S(client.email, 160));
  put('biz.phone', S(client.phone, 40));
  put('biz.name', S(client.company, 160));
  put('web.site', S(client.website, 300));
  if (products.includes('suite') && plan && A(plan.numbers).length) {
    put('suite.goals', A(plan.numbers).slice(0, 3).map(n => ({ label: S(n && n.label, 80), target: S(n && n.value, 40) })));
  }
  return a;
}

/* ---------- config ---------- */
/** settings.onboarding plus the offer, normalised. Returns { config, fellBack }
 *  where fellBack NAMES each value that came from a default because the row
 *  never set it (CLAUDE.md: "never set up" and "chosen" must not look alike).
 *  People, launch days and the agency's name and email come from the OFFER
 *  (settings.offer, lib/proposal readOffer): one place for each. */
export function readOnbConfig(settings, offer) {
  const raw = settings && settings.onboarding && typeof settings.onboarding === 'object' ? settings.onboarding : null;
  const fellBack = [];
  const r = raw || {};
  if (!raw) fellBack.push('onboarding');
  const state = S(r.state, 4).toUpperCase();
  if (!state) fellBack.push('state');
  const map = r.productMap && typeof r.productMap === 'object' ? r.productMap : null;
  if (!map) fellBack.push('productMap');
  const productMap = {};
  for (const [k, v] of Object.entries(map || {})) { const ps = A(v).filter(p => PRODUCTS.includes(p)); if (ps.length) productMap[S(k, 60)] = ps; }
  const names = { ...DEFAULT_PRODUCT_NAMES };
  for (const p of PRODUCTS) if (r.productNames && S(r.productNames[p], 60).trim()) names[p] = S(r.productNames[p], 60).trim();
  const pipes = {};
  for (const i of INDUSTRIES) { const v = A(r.pipelines && r.pipelines[i]).map(x => S(x, 60).trim()).filter(Boolean); pipes[i] = v.length ? v : DEFAULT_PIPELINES[i]; }
  if (!r.pipelines) fellBack.push('pipelines');
  const tiles = { all: A(r.tiles && r.tiles.all).length ? A(r.tiles.all).map(x => S(x, 60)) : DEFAULT_TILES.all };
  for (const i of INDUSTRIES) tiles[i] = A(r.tiles && r.tiles[i]).length ? A(r.tiles[i]).map(x => S(x, 60)) : DEFAULT_TILES[i];
  if (!r.tiles) fellBack.push('tiles');
  const kick = S(r.kickoffUrl, 500).trim();
  const kickoffUrl = /^https:\/\/[^\s]+$/i.test(kick) ? kick : '';
  if (!kickoffUrl) fellBack.push('kickoffUrl');
  const of = offer || {};
  const co = of.company || {};
  if (!co.name) fellBack.push('offer.company.name');
  const launchDays = Number.isInteger(of.launchDays) ? of.launchDays : null;
  if (!launchDays) fellBack.push('offer.launchDays');
  const seats = A(of.packages).map(p => Number(p.seatsIncluded) || 0).filter(Boolean);
  return {
    fellBack,
    config: {
      state, productMap, productNames: names, pipelines: pipes, tiles, kickoffUrl,
      agency: S(co.name, 120), agencyEmail: S(co.email, 160), agencyLogo: S(co.logo, 500), agencyMark: S(co.mark, 500),
      contacts: A(co.contacts), launchDays, seatsIncluded: seats.length ? Math.max(...seats) : 0,
    },
  };
}

/** Offer item ids (a proposal's quote) -> portal products, via productMap. */
export function productsFor(itemIds, productMap) {
  const out = new Set();
  for (const id of A(itemIds)) for (const p of A((productMap || {})[id])) out.add(p);
  return PRODUCTS.filter(p => out.has(p));
}
/** "Growth OS", "Website + Automations"… the package name when the proposal
 *  gave one, else composed from the product names. */
export function productLine(products, names = DEFAULT_PRODUCT_NAMES) {
  return PRODUCTS.filter(p => A(products).includes(p)).map(p => names[p] || p).join(' + ');
}

/* ---------- small display helpers ---------- */
export function shortDate(iso) {
  const d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
}
export function longDate(iso) {
  const d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
}
/** The client link: {base}/onboarding/{slug}#t={token}. The slug is cosmetic,
 *  exactly like the proposal link's; only the token in the fragment opens it. */
export function onboardingUrl(base, slug, token) {
  return `${String(base || '').replace(/\/+$/, '')}/onboarding/${slug || 'start'}#t=${encodeURIComponent(String(token || ''))}`;
}

/** An answer as one line of text, for the PDF, the review screen and the
 *  prompts. Lists become "a; b; c". Empty is ''. */
export function answerText(f, v, ctx, cfg) {
  if (v == null) return '';
  const opt = x => { const m = fieldOptions(f, ctx, cfg).find(o2 => o2.v === x); return m ? m.l : String(x); };
  switch (f.type) {
    case 'check': return v === true ? 'Yes' : '';
    case 'select': return opt(v);
    case 'multi': return A(v).map(opt).join(', ');
    case 'tags': case 'pipeline': return A(v).join(f.type === 'pipeline' ? ' → ' : ', ');
    case 'colors': return v.mode === 'decide' ? 'You decide' : A(v.list).join(', ') + (v.mode === 'logo' ? ' (from the logo)' : '');
    case 'hours': return v.mode === 'appt' ? 'By appointment' : DAYS.filter(d => v.days && v.days[d] && v.days[d].open).map(d => `${d[0].toUpperCase()}${d.slice(1)} ${v.days[d].from}–${v.days[d].to}`).join(', ');
    case 'access': return v.method === 'dns' ? 'Send me the DNS records instead' : v.done ? 'Done (to verify)' : '';
    case 'list': return A(v).map(r => f.fields.map(sf => { const x = r[sf.id]; return x == null || x === '' || x === false ? '' : sf.type === 'check' ? sf.label : sf.type === 'select' ? (A(sf.options).find(q => q.v === x) || {}).l || x : String(x); }).filter(Boolean).join(' · ')).join('; ');
    default: return String(v);
  }
}

/** "Pull from my logo": the n most common distinct colours in an image, from
 *  its RGBA pixel data (a canvas getImageData().data). Transparent and
 *  near-white pixels are background, not brand, and are skipped; colours are
 *  bucketed so anti-aliasing does not split one colour into fifty, and two
 *  picks closer than `minDist` count as one. Pure, so it is tested without a
 *  canvas. -> ['#0E2A47', ...] */
export function paletteFrom(data, n = 3, minDist = 48) {
  const px = data || [];
  const counts = new Map();
  for (let i = 0; i + 3 < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
    if (a < 128) continue;
    if (r > 240 && g > 240 && b > 240) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => [((k >> 8) & 15) * 16 + 8, ((k >> 4) & 15) * 16 + 8, (k & 15) * 16 + 8]);
  const picked = [];
  for (const c of ranked) {
    if (picked.every(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) >= minDist)) picked.push(c);
    if (picked.length >= n) break;
  }
  return picked.map(c => '#' + c.map(x => Math.min(255, x).toString(16).padStart(2, '0')).join('').toUpperCase());
}
