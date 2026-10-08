/* src/lib/onboarding-prompts.js — the two build prompts, from a client's answers.
   ============================================================================

   DETERMINISTIC TEMPLATES, NOT MODEL CALLS. Each prompt is built from the
   answers by plain string assembly, so the same answers always give the same
   prompt, nothing is spent to make one, and a test can assert on every line.
   The submit route and the CRM's Regenerate button call the same function.

   WHAT GOES IN
   - Only fields the client can SEE under their current industry and
     products. Switching from realtor to service keeps the realtor answers in
     the row (so switching back loses nothing) but they never reach a prompt.
   - The agency is named from the offer (config.agency), never from code.
   - Compliance rules are per industry, written as rules for the builder to
     follow, and marked "verify with {agency}" because they are a summary of
     the research, not legal advice. State-specific lines come from
     STATE_RULES via the context, never from a hardcoded state.
   - An EIN is masked to its last four. The builder needs to know there is
     one; the number itself lives in the CRM, not in a prompt someone pastes
     into another tool.

   A product not bought gives an empty string, never a prompt with the
   sections left blank: "Website-only produces no Suite prompt" is enforced
   here, not by a caller remembering to check. */
import {
  SECTIONS, has, isGrowth, visibleSections, shownFields, fieldById, fieldLabel, answerText, stillNeeded,
  pipelineFor, sectionTitle, productLine, FILE_SLOTS, missingRequired,
} from './onboarding.js';
import { reviewScriptTag, DEFAULT_HOSTS } from './review.js';

const A = v => (Array.isArray(v) ? v : []);

/** A reader over the client's answers that only sees VISIBLE fields. */
function reader(answers, ctx, cfg) {
  const a = answers || {};
  const visible = new Set(visibleSections(ctx).flatMap(s => shownFields(s, ctx, a).map(f => f.id)));
  const raw = id => (visible.has(id) ? a[id] : undefined);
  const txt = id => { const f = fieldById(id); const v = raw(id); return f && v !== undefined ? answerText(f, v, ctx, cfg).trim() : ''; };
  const line = (label, id) => { const t = txt(id); return t ? `- ${label}: ${t}` : ''; };
  return { raw, txt, line, visible };
}
const block = (title, lines) => { const body = A(lines).flat().filter(Boolean); return body.length ? `## ${title}\n\n${body.join('\n')}\n` : ''; };
const industryName = ctx => ({ realtor: 'real estate agent', lender: 'mortgage lender', service: 'local service business' }[ctx.industry] || 'business');
const maskEin = s => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 4 ? `on file (ends ${d.slice(-4)})` : ''; };

function fileLines(files) {
  const ok = A(files).filter(f => f && f.path);
  if (!ok.length) return ['- No files uploaded yet.'];
  return ok.map(f => `- ${(FILE_SLOTS[f.slot] || {}).label || f.slot}: ${f.name || f.original_name || 'file'} → storage: onboarding/${f.path}${f.drive_path ? ` · Drive: ${f.drive_path}` : ''}${f.sensitive ? ' (private)' : ''}`);
}
function neededLines(ctx, answers, files, checklist, cfg) {
  const open = stillNeeded(ctx, answers, files, checklist, cfg).filter(x => !x.ok).map(x => `- ${x.label}${x.where ? ` (${x.where})` : ''}`);
  const req = missingRequired(ctx, answers, files, cfg).map(m => `- REQUIRED, still empty: ${m.label} (${m.sectionTitle})`);
  const out = [...new Set([...req, ...open])];
  return out.length ? out : ['- Nothing outstanding.'];
}
function snapshotLines(r, ctx, cfg, packageName) {
  return [
    r.txt('biz.contact_name') ? `- Contact: ${r.txt('biz.contact_name')}${r.txt('biz.role') ? ` (${r.txt('biz.role')})` : ''}` : '',
    r.line('Business', 'biz.name'), r.line('Legal name', 'biz.legal_name'),
    r.line('Phone', 'biz.phone'), r.line('Email', 'biz.email'),
    r.raw('biz.hide_address') === true ? '- Address: works from home, DO NOT publish the address' : r.line('Address', 'biz.address'),
    r.line('Service area', 'biz.area'), r.line('Hours', 'biz.hours'), r.line('Year started', 'biz.year'), r.line('Team size', 'biz.team_size'),
    r.txt('biz.approver_name') ? `- Approves the work: ${r.txt('biz.approver_name')}${r.txt('biz.approver_email') ? ` <${r.txt('biz.approver_email')}>` : ''}` : '',
    `- Bought: ${packageName || productLine(ctx.products, cfg.productNames)}`,
  ];
}
function brandLines(r, files) {
  const logos = A(files).filter(f => f.slot === 'logos').map(f => f.name || f.original_name);
  const status = r.txt('brand.logo_status');
  const love = A(r.raw('brand.love')).filter(x => x && (x.url || x.why)).map(x => `  - ${x.url || '(no link)'}${x.why ? ` — ${x.why}` : ''}`);
  return [
    r.line('Colors', 'brand.colors'),
    r.line('Feel', 'brand.feel'),
    r.line('Fonts they use', 'brand.fonts'),
    logos.length ? `- Logo files: ${logos.join(', ')}` : status ? `- Logo: ${status}` : '- Logo: not provided yet',
    love.length ? `- Sites they love:\n${love.join('\n')}` : '',
    r.txt('brand.avoid_url') ? `- Do not look like: ${r.txt('brand.avoid_url')}${r.txt('brand.avoid_why') ? ` — ${r.txt('brand.avoid_why')}` : ''}` : '',
    r.line('Words their best clients use', 'brand.words'),
  ];
}

/* ---------- compliance, by industry ---------- */
export function complianceLines(ctx, r, cfg) {
  const verify = `verify with ${cfg.agency || 'the agency'}`;
  const rules = ctx.rules;
  if (ctx.industry === 'realtor') return [
    `> These are a summary of the research, not legal advice: ${verify} before launch.`,
    `- The brokerage name${r.txt('re.brokerage') ? ` ("${r.txt('re.brokerage')}")` : ''} must appear adjacent to the agent or team name wherever the agent or team name appears.`,
    '- The agent or team name must be no more than twice the font size of the brokerage name.',
    `- The supervising broker${r.txt('re.broker_name') ? ` (${r.txt('re.broker_name')}${r.txt('re.broker_email') ? `, ${r.txt('re.broker_email')}` : ''})` : ''} approves the site before it goes live. Do not launch without that approval.`,
    '- Fair housing: describe homes and neighborhoods, never the people who live there or who "should" live there. No steering language.',
    '- Listings or home search only through an IDX feed from a broker-approved vendor. Never scrape or hand-copy listings.',
    rules && rules.teamNameBanned ? `- ${rules.name}: a team name may not include ${rules.teamNameBanned.map(w => `"${w}"`).join(', ')}.` : '',
    r.txt('re.license') ? `- Show the license number where the rules require it: ${r.txt('re.license')}.` : '',
  ];
  if (ctx.industry === 'lender') return [
    `> These are a summary of the research, not legal advice: ${verify} before launch.`,
    `- Company name and company NMLS number in the footer of EVERY page${r.txt('ln.company') ? `: ${r.txt('ln.company')}` : ''}${r.txt('ln.company_nmls') ? `, NMLS ${r.txt('ln.company_nmls')}` : ''}.`,
    '- Each loan officer profile shows the officer\'s name and personal NMLS number.',
    `- Equal Housing ${r.raw('ln.fha') === 'no' ? 'Opportunity' : 'Lender'} logo on every page${r.raw('ln.fha') === 'no' ? ' (they said they are not FHA-approved or a bank; confirm which logo applies)' : ''}.`,
    r.raw('ln.rates') === 'yes'
      ? '- Rates are wanted, but ONLY with compliance-approved wording supplied by their compliance contact. Until that wording arrives, show no rates and no payment examples.'
      : '- No rates and no payment examples anywhere on the site.',
    '- Link the NMLS Consumer Access page (nmlsconsumeraccess.org) from the footer.',
    r.txt('ln.compliance_name') ? `- Marketing approval: ${r.txt('ln.compliance_name')}${r.txt('ln.compliance_email') ? ` <${r.txt('ln.compliance_email')}>` : ''} signs off before launch.` : '- No compliance contact given yet: get one before launch.',
  ];
  if (ctx.industry === 'service') return [
    `> These are a summary of the research, not legal advice: ${verify} before launch.`,
    r.raw('sv.licensed') === 'yes' && r.txt('sv.license_no') ? `- Licensed: show ${r.txt('sv.license_type') || 'license'} #${r.txt('sv.license_no')}.` : '- Do NOT claim "licensed" anywhere: no license details were given.',
    '- Claim "insured" only if an insurance certificate was uploaded (see Assets). If none is listed, do not claim it.',
    r.raw('sv.bonded') === 'yes' ? '- They say they are bonded; confirm before claiming it.' : '- Do not claim "bonded".',
    r.raw('sv.trade') === 'roofing' ? (r.txt('sv.ag_reg') ? `- Roofing: show the registration number ${r.txt('sv.ag_reg')}.` : `- Roofing: ${rules && rules.roofingRegistration ? `the ${rules.roofingRegistration} is required and missing` : 'check whether the state requires a roofing registration number'}.`) : '',
    '- Reviews: real reviews only. No invented testimonials, and no review gating (asking only happy customers to post publicly).',
  ];
  return ['- Industry not given yet. Ask at kickoff before writing any claims.'];
}

/* ---------- the website prompt ---------- */
export function websitePrompt({ answers, ctx, files = [], checklist = {}, cfg = {}, packageName = '' }) {
  if (!has(ctx, 'website')) return '';
  const r = reader(answers, ctx, cfg);
  const biz = r.txt('biz.name') || 'this business';
  const agency = cfg.agency || 'the agency';
  const pages = r.txt('site.pages');
  const services = ctx.industry === 'service' ? A(r.raw('sv.services')).map(s => `  - ${s.name || 'Service'}${s.desc ? `: ${s.desc}` : ''}${s.show_price === 'yes' && s.price ? ` — ${s.price}` : s.show_price === 'from' && s.price ? ` — starting at ${s.price}` : ' — no price shown'}`) : [];
  const sales = A(r.raw('re.sales')).map(s => `  - ${[s.area, s.price, s.role].filter(Boolean).join(' · ')}`);
  const testimonials = A(r.raw('site.testimonials')).filter(t => t && t.text).map(t => `  - "${t.text}" — ${t.name || 'a client'}${t.ok ? '' : ' (NO permission recorded: do not use)'}`);
  return [
    `# Website build: ${biz}`,
    '',
    `You are building a website for ${biz} (${industryName(ctx)}) on ${agency}'s stack. The goal is one clear job: get the visitor to ${r.txt('site.action') ? r.txt('site.action').toLowerCase() : 'take the next step'}${r.txt('site.action_other') ? ` (${r.txt('site.action_other')})` : ''}. Write in the client's own voice from the answers below; never invent facts, numbers, awards or reviews.`,
    '',
    block('Client snapshot', snapshotLines(r, ctx, cfg, packageName)),
    block('Brand', brandLines(r, files)),
    block('Pages and the #1 action', [
      pages ? `- Pages: ${pages}` : '- Pages: not chosen; use the standard set for the industry.',
      r.line('#1 action', 'site.action'), r.line('Booking link', 'site.booking'),
      r.line('Email new leads to', 'site.lead_emails'),
      isGrowth(ctx) ? '- Lead routing: every form submission ALSO goes straight into their Business Suite as a new lead (Growth OS).' : '',
    ]),
    block('Content inputs', [
      r.line('Why they started', 'site.story_why'), r.line('What makes them different', 'site.story_diff'),
      r.line('Ideal client', 'site.ideal'), r.line('Must say', 'site.must_say'), r.line('Must NEVER say', 'site.must_not'),
      services.length ? `- Services:\n${services.join('\n')}` : '',
      ctx.industry === 'realtor' ? [r.line('Focus', 're.focus'), r.line('Areas', 're.areas'), r.line('Price range', 're.price_range'), r.line('Designations', 're.designations'), r.raw('re.listings') === 'yes' ? `- Listings wanted${r.txt('re.mls') ? ` (MLS: ${r.txt('re.mls')})` : ''}: needs broker sign-off and an approved IDX feed, may land after launch.` : ''] : [],
      ctx.industry === 'lender' ? [r.line('Loan products', 'ln.products'), r.line('Online application', 'ln.pos'), r.line('States', 'ln.states'),
        A(r.raw('ln.officers')).length ? `- Loan officers:\n${A(r.raw('ln.officers')).map(o => `  - ${o.name || '?'}${o.title ? `, ${o.title}` : ''}${o.nmls ? `, NMLS ${o.nmls}` : ''}`).join('\n')}` : '',
        r.txt('ln.lo_name') ? `- Loan officer: ${r.txt('ln.lo_name')}${r.txt('ln.lo_nmls') ? `, NMLS ${r.txt('ln.lo_nmls')}` : ''}` : ''] : [],
      ctx.industry === 'service' ? [r.line('Trade', 'sv.trade'), r.line('Other trade', 'sv.trade_other'), r.line('Emergency service', 'sv.emergency'), r.line('Free estimates', 'sv.estimates'), r.line('Financing', 'sv.financing'), r.line('Warranty', 'sv.warranty'), r.line('Busy months', 'sv.busy')] : [],
      sales.length ? `- Recent sales to feature:\n${sales.join('\n')}` : '',
      testimonials.length ? `- Testimonials:\n${testimonials.join('\n')}` : '',
    ]),
    block('Online presence', [
      r.txt('web.site') ? `- Current site: ${r.txt('web.site')}. Read it for existing copy and structure worth keeping before writing anything new.` : '- No current website.',
      r.txt('web.gbp') ? `- Google Business Profile: ${r.txt('web.gbp')}. Pull their real reviews from it.` : r.line('Google Business Profile', 'web.gbp_status'),
      ['web.facebook', 'web.instagram', 'web.linkedin', 'web.tiktok', 'web.youtube', 'web.zillow', 'web.realtor_com', 'web.yelp', 'web.angi', 'web.nextdoor', 'web.bbb']
        .map(id => r.line(fieldLabel(fieldById(id), ctx), id)),
      r.txt('web.domain') ? `- Domain: ${r.txt('web.domain')}${r.txt('web.registrar') ? ` (at ${r.txt('web.registrar')})` : ''}` : r.line('Owns a domain', 'web.domain_own'),
    ]),
    block(`Compliance rules (${industryName(ctx)})`, complianceLines(ctx, r, cfg)),
    block('Standards', [
      '- Mobile first; test at 390 px before anything else.',
      '- WCAG 2.1 AA: real labels, visible focus, AA contrast, alt text on every meaningful image.',
      '- Fast: compressed images, no heavy scripts above the fold.',
      '- Local SEO basics: title and description per page, LocalBusiness schema, NAP identical to the Google profile.',
      '- City or area pages only where the content is real and distinct. No doorway pages with the city name swapped.',
    ]),
    block('Preview builds: client review', reviewLines(cfg)),
    block('Assets', fileLines(files)),
    block('Still needed and open questions for kickoff', neededLines(ctx, answers, files, checklist, cfg)),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* Every preview build is review-ready (client portal B-2, spec B4): the
   client reviews it inside their portal, which only works when the preview
   carries the review script from the PORTAL's origin and can load in a
   frame. cfg.reviewOrigin is the portal's origin (the server's PORTAL_URL on
   submit, the CRM's own origin on Regenerate); cfg.reviewHosts the allowed
   preview hosts (Settings → Site review). */
export function reviewLines(cfg = {}) {
  const origin = String(cfg.reviewOrigin || '').replace(/\/+$/, '');
  const hosts = Array.isArray(cfg.reviewHosts) && cfg.reviewHosts.length ? cfg.reviewHosts : DEFAULT_HOSTS;
  return [
    origin ? `- Every PREVIEW build includes this tag, just before </body>: \`${reviewScriptTag(origin)}\`` : '- Every PREVIEW build includes the review script from the client portal (`<portal origin>/review.js`, with `defer`), just before </body>.',
    '- PREVIEW BUILDS ONLY. The production site never carries it. (Outside the client portal it does nothing, but it does not belong on a live site.)',
    `- Publish previews on an allowed preview host (${hosts.join(', ')}), reachable without a password or deployment protection, and with no X-Frame-Options or frame-ancestors header that stops the portal showing it in a frame.`,
    '- Give sections, headings and buttons stable ids where you can: the client\'s notes point at elements, and stable ids keep each note on the right element after revisions.',
  ];
}

/* ---------- the Business Suite prompt ---------- */
export function suitePrompt({ answers, ctx, files = [], checklist = {}, cfg = {}, packageName = '' }) {
  if (!has(ctx, 'suite')) return '';
  const r = reader(answers, ctx, cfg);
  const biz = r.txt('biz.name') || 'this business';
  const goals = A(r.raw('suite.goals')).filter(g => g && (g.label || g.target)).map(g => `- ${g.label || 'Goal'}: ${g.target || '(no target)'}`);
  const stages = A(r.raw('suite.pipeline')).length ? A(r.raw('suite.pipeline')) : pipelineFor(ctx, cfg);
  const edited = A(r.raw('suite.pipeline')).length > 0;
  const team = A(r.raw('suite.team')).filter(t => t && t.name).map(t => `- ${t.name}${t.email ? ` <${t.email}>` : ''} · ${t.role === 'owner' ? 'owner' : 'team member'}${t.pct ? ` · ${t.pct}% commission` : ''}`);
  const contactFiles = A(files).filter(f => f.slot === 'contacts').map(f => `${f.name || f.original_name} (storage: onboarding/${f.path})`);
  const seats = cfg.seatsIncluded;
  return [
    `# Business Suite setup: ${biz}`,
    '',
    `Start from the **${ctx.industry || '(industry not given)'}** template of the CRM and configure it for ${biz}, exactly as below. Their dashboard should open on their own goals from day one.`,
    '',
    block('Client snapshot and branding', [...snapshotLines(r, ctx, cfg, packageName), ...brandLines(r, files)]),
    block('Goals', [
      goals.length ? goals : '- No number goals yet: get three at kickoff.',
      r.line('Lifestyle goal (show on the dashboard as "the why")', 'suite.why'),
      r.line(fieldLabel(fieldById('suite.avg'), ctx).replace(/ \(\$\)$/, ''), 'suite.avg'),
    ]),
    block('Dashboard tiles', [r.txt('suite.tiles') ? `- ${r.txt('suite.tiles')}` : '- Not chosen: use the template\'s default dashboard.']),
    block('Pipeline stages', [`${edited ? 'As edited by the client' : 'The template default (not edited)'}:`, stages.map((s, i) => `${i + 1}. ${s}`)]),
    block('Leads and follow-up', [
      r.line('Lead sources today', 'suite.sources'), r.line('Follow-up speed today', 'suite.speed_now'), r.line('Follow-up speed wanted', 'suite.speed_goal'),
      r.line('Moving off', 'suite.tools'), r.line('Current CRM', 'suite.crm_name'),
      contactFiles.length ? `- Contact list to import: ${contactFiles.join(', ')}` : '- No contact list uploaded yet.',
    ]),
    block('Team seats', [team.length ? team : '- Only the owner so far.', seats ? `- ${seats} seats included; ${team.length > seats ? `${team.length - seats} extra seat(s) to bill` : 'within the included seats'}.` : '']),
    block('Calendar and automations', [
      r.line('Calendar', 'suite.calendar'),
      has(ctx, 'automations') ? [
        r.line('Automations wanted', 'tx.which'),
        r.line('Legal name (carrier registration)', 'tx.legal_name'), r.line('Business type', 'tx.biz_type'),
        r.txt('tx.ein') ? `- EIN: ${maskEin(r.txt('tx.ein'))}` : (r.raw('tx.biz_type') === 'sole' ? '- EIN: none (sole proprietor registration)' : '- EIN: missing'),
        r.line('Registered address', 'tx.address'),
        r.txt('tx.rep_name') ? `- Authorized representative: ${[r.txt('tx.rep_name'), r.txt('tx.rep_title'), r.txt('tx.rep_email'), r.txt('tx.rep_mobile')].filter(Boolean).join(' · ')}` : '',
        r.raw('tx.number') === 'keep' ? `- Text from their current number: ${r.txt('tx.keep_number') || '(number missing)'}` : r.line('Text from', 'tx.number'),
        r.line('Auto-reply hours', 'tx.hours'),
        r.txt('tx.alert_name') ? `- New-lead alerts to: ${r.txt('tx.alert_name')}${r.txt('tx.alert_mobile') ? ` (${r.txt('tx.alert_mobile')})` : ''}` : '',
        r.line('Google review link', 'tx.review_link'), r.line('Where numbers are collected', 'tx.optin'), r.line('How consent is captured', 'tx.optin_how'),
        '- Carrier approval usually takes 2 to 3 weeks and is outside the launch window; switch texting on the day it is approved.',
      ] : '- Automations not bought.',
    ]),
    block('Still needed', neededLines(ctx, answers, files, checklist, cfg)),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Everything a submit stores: both prompts and a frozen copy of what they
 *  were built from, so the PDF prints the same answers every time. */
export function buildOutputs({ row, answers, ctx, files, checklist, cfg, now = new Date() }) {
  const args = { answers, ctx, files, checklist, cfg, packageName: (row && row.package_name) || '' };
  return {
    websitePrompt: websitePrompt(args),
    suitePrompt: suitePrompt(args),
    generatedAt: now.toISOString(),
    snapshot: {
      answers, industry: ctx.industry, lenderKind: ctx.lenderKind, products: ctx.products,
      files: A(files).map(f => ({ id: f.id, slot: f.slot, name: f.name || f.original_name, mime: f.mime, bytes: f.bytes, path: f.path, sensitive: !!f.sensitive })),
      sections: visibleSections(ctx).map(s => ({ id: s.id, title: sectionTitle(s, ctx) })),
    },
  };
}
export { SECTIONS };
