/* ===================== PROPOSALS: the pure part =====================
   Everything here is a pure function so it can be tested for what it does,
   and so the CRM, the public page and the server agree on every number by
   calling the same code.

   THE RULE THIS MODULE EXISTS TO HOLD: THE AI WRITES WORDS, THE CRM WRITES
   NUMBERS. Every price, deposit, total and date on a proposal comes from
   quote() below, computed from the offer in Settings and what the owner typed.
   No number the model produced is ever rendered as a price.

   NOTHING HERE IS PROYTECH-SPECIFIC (CLAUDE.md, white-label). The offer lives
   in settings.offer. When it is missing, readOffer says so BY NAME and the
   builder refuses to price anything, rather than inventing a plausible offer
   another install would then send to its clients. */

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const S = (v, cap = 2000) => String(v == null ? '' : v).slice(0, cap);
const A = v => (Array.isArray(v) ? v : []);
const lines = v => A(v).map(x => S(x, 400).trim()).filter(Boolean);

/* ---------- vocabulary, defined once ---------- */
export const PROPOSAL_STATUSES = ['draft', 'sent', 'viewed', 'accepted'];
export const PLANS = ['monthly', 'annual'];
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/* 256 random bits, base64url, 43 characters. The link is the only key to a
   proposal, so it must not be guessable or enumerable. */
export function newToken(cryptoObj) {
  const c = cryptoObj || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('No secure random source available.');
  const b = new Uint8Array(32); c.getRandomValues(b);
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  const b64 = typeof btoa === 'function' ? btoa(s) : Buffer.from(b).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------- the offer ---------- */
/* settings.offer, normalised. Returns { offer, missing } where missing names
   what fell back, so "never set up" and "set to that" never look alike. */
export function readOffer(settings) {
  const raw = settings && settings.offer;
  const missing = [];
  if (!raw || typeof raw !== 'object') return { offer: null, missing: ['offer'] };
  const item = (x, kind) => ({
    id: S(x && x.id, 60).trim(),
    name: S(x && x.name, 120).trim(),
    service: S(x && x.service, 120).trim(),
    setup: num(x && x.setup),
    monthly: num(x && x.monthly),
    seatsIncluded: Math.max(0, Math.floor(num(x && x.seatsIncluded) || 0)),
    extraSeat: num(x && x.extraSeat) >= 0 ? num(x && x.extraSeat) : 0,
    summary: S(x && x.summary, 600),
    includes: lines(x && x.includes),
    covers: lines(x && x.covers),
    underneath: lines(x && x.underneath),
    onboardingUrl: safeHttps(x && x.onboardingUrl),
    kind,
  });
  const packages = A(raw.packages).map(x => item(x, 'package')).filter(x => x.id && x.name);
  const addons = A(raw.addons).map(x => item(x, 'addon')).filter(x => x.id && x.name);
  if (!packages.length) missing.push('packages');
  const pct = num(raw.depositPct);
  const vd = num(raw.validDays);
  const pre = raw.prepay && typeof raw.prepay === 'object' ? raw.prepay : null;
  const company = raw.company && typeof raw.company === 'object' ? raw.company : {};
  if (!S(company.name).trim()) missing.push('company.name');
  if (!(pct > 0 && pct <= 100)) missing.push('depositPct');
  return {
    missing,
    offer: {
      packages, addons,
      depositPct: pct > 0 && pct <= 100 ? pct : 50,
      validDays: vd >= 1 && vd <= 60 ? Math.floor(vd) : 7,
      prepay: pre && num(pre.months) > 0 && num(pre.free) >= 0 && num(pre.free) < num(pre.months)
        ? { months: Math.floor(num(pre.months)), free: Math.floor(num(pre.free)) } : null,
      guarantee: S(raw.guarantee, 300).trim(),
      terms: S(raw.terms, 600).trim(),
      cancel: S(raw.cancel, 400).trim(),
      underneath: lines(raw.underneath),
      covers: lines(raw.covers),
      quotedSeparately: lines(raw.quotedSeparately),
      steps: A(raw.steps).map(s => ({ title: S(s && s.title, 60).trim(), text: S(s && s.text, 300).trim() })).filter(s => s.title),
      needFromYou: lines(raw.needFromYou),
      company: {
        name: S(company.name, 120).trim(), people: S(company.people, 160).trim(),
        email: S(company.email, 160).trim(), website: S(company.website, 160).trim(),
        city: S(company.city, 120).trim(),
        /* the brand on the cover and in the footer, per install (white-label):
           the shipped offer points at ProyTech's files in public/, another
           install points at its own. Unset falls back to the name as text. */
        logo: safeAsset(company.logo), mark: safeAsset(company.mark),
      },
    },
  };
}

/* An image the proposal may load: an https URL, or a path on this site
   ("/logo.png"). Nothing else — not http, not data:, not javascript:, not a
   protocol-relative "//host" — because the offer is typed into Settings and
   the result is rendered on a page a client opens. */
export function safeAsset(u) {
  const s = S(u, 500).trim();
  if (/^\/(?!\/)[A-Za-z0-9._~\-\/]+$/.test(s) && !s.includes('..')) return s;
  return safeHttps(s);
}

/* Only an https URL may become a link a client clicks, and only on accept. */
export function safeHttps(u) {
  const s = S(u, 500).trim();
  try { const x = new URL(s); return x.protocol === 'https:' ? x.toString() : ''; } catch { return ''; }
}

/* ---------- the math, in whole cents ---------- */
const cents = v => Math.round(v * 100);
const dollars = c => c / 100;

/* sel: { packageId, addonIds:[], prices:{ [id]:{ setup, monthly } }, seats, prepay }
   Returns { ok, error, items, ... }. A price that is blank or not a number is
   an ERROR, never a zero: a missing price that renders as $0 is the bug that
   looks exactly like a decision. */
export function quote(offer, sel) {
  if (!offer) return { ok: false, error: 'No offer is set up. Add it in Settings → Proposals.' };
  const s = sel || {};
  const pkg = offer.packages.find(p => p.id === s.packageId);
  if (!pkg) return { ok: false, error: 'Pick a package.' };
  const addons = A(s.addonIds).map(id => offer.addons.find(a => a.id === id)).filter(Boolean);
  const over = s.prices && typeof s.prices === 'object' ? s.prices : {};
  const items = [];
  for (const it of [pkg, ...addons]) {
    const o = over[it.id] || {};
    const setup = o.setup !== undefined && o.setup !== '' ? num(o.setup) : it.setup;
    const monthly = o.monthly !== undefined && o.monthly !== '' ? num(o.monthly) : it.monthly;
    if (!Number.isFinite(setup) || setup < 0) return { ok: false, error: `Set a setup price for ${it.name}.` };
    if (!Number.isFinite(monthly) || monthly < 0) return { ok: false, error: `Set a monthly price for ${it.name}.` };
    items.push({ id: it.id, name: it.name, service: it.service, kind: it.kind, setup: dollars(cents(setup)), monthly: dollars(cents(monthly)) });
  }
  /* seats: the package carries the rule. An install with no seat rule has
     seatsIncluded 0 and no extra-seat line at all. */
  const seats = Math.max(0, Math.floor(num(s.seats) || 0));
  const extraSeats = pkg.seatsIncluded > 0 ? Math.max(0, seats - pkg.seatsIncluded) : 0;
  const seatMonthlyC = extraSeats * cents(pkg.extraSeat);
  const setupC = items.reduce((a, it) => a + cents(it.setup), 0);
  const monthlyC = items.reduce((a, it) => a + cents(it.monthly), 0) + seatMonthlyC;
  /* deposit rounds to the cent, and the balance is the REST, so the two
     always add back to the setup total exactly */
  const depositC = Math.round(setupC * offer.depositPct / 100);
  const pre = s.prepay !== false && offer.prepay ? offer.prepay : null;
  const prepayC = pre ? monthlyC * (pre.months - pre.free) : 0;
  return {
    ok: true,
    packageId: pkg.id, service: pkg.service, items,
    seats: pkg.seatsIncluded > 0 ? Math.max(seats, pkg.seatsIncluded) : 0,
    seatsIncluded: pkg.seatsIncluded, extraSeats, extraSeat: pkg.extraSeat,
    seatMonthly: dollars(seatMonthlyC),
    setup: dollars(setupC), monthly: dollars(monthlyC),
    depositPct: offer.depositPct, deposit: dollars(depositC), balance: dollars(setupC - depositC),
    prepay: pre ? { months: pre.months, free: pre.free, total: dollars(prepayC), saves: dollars(monthlyC * pre.free) } : null,
  };
}

/* ---------- validity ---------- */
export function expiryFrom(sentAtIso, validDays) {
  const t = Date.parse(sentAtIso); const d = Math.floor(num(validDays));
  if (!Number.isFinite(t) || !(d >= 1)) return '';
  return new Date(t + d * 864e5).toISOString();
}
export const isExpired = (expiresAt, now = Date.now()) => { const t = Date.parse(expiresAt); return !Number.isFinite(t) || now > t; };

/* ---------- the AI's words, kept in their lane ----------
   The model returns copy only. This clamps every field to a size and shape,
   and REPORTS any dollar figure outside the client's own numbers, because the
   CRM writes the prices and a stray "$1,500" in a paragraph would contradict
   the investment section. Reported, not silently rewritten: the owner reads
   the warning in review and decides. */
export function cleanCopy(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const t = (v, n) => S(v, n).trim();
  const plan = r.plan && typeof r.plan === 'object' ? r.plan : {};
  const out = {
    headline: t(r.headline, 90),
    summary: t(r.summary, 1200),
    plan: {
      goal: t(plan.goal, 400),
      numbers: A(plan.numbers).map(x => ({ label: t(x && x.label, 60), value: t(x && x.value, 60) })).filter(x => x.label && x.value).slice(0, 6),
      levers: A(plan.levers).map(x => t(x, 300)).filter(Boolean).slice(0, 3),
    },
    gaps: A(r.gaps).map(g => ({ title: t(g && g.title, 120), text: t(g && g.text, 500) })).filter(g => g.title).slice(0, 6),
    build: A(r.build).map(b => ({ title: t(b && b.title, 80), tag: t(b && b.tag, 20), text: t(b && b.text, 400) })).filter(b => b.title).slice(0, 10),
    whyNow: A(r.whyNow).map(x => t(x, 700)).filter(Boolean).slice(0, 2),
    email: { subject: t(r.email && r.email.subject, 150), body: t(r.email && r.email.body, 3000) },
  };
  const warnings = [];
  const money = /\$\s?\d/;
  const check = (where, v) => { if (money.test(v)) warnings.push(`The draft mentions a dollar amount in ${where}. The prices section is filled by the CRM; check this wording.`); };
  check('the summary', out.summary); check('the email', out.email.body);
  out.gaps.forEach((g, i) => check(`gap ${i + 1}`, g.text));
  out.build.forEach(b => check(`"${b.title}"`, b.text));
  out.whyNow.forEach((w, i) => check(`why now ${i + 1}`, w));
  return { copy: out, warnings };
}

/* ---------- the snapshot that becomes the proposal ----------
   Everything the client will see, frozen at send. A later change to the offer
   or the lead cannot rewrite a proposal already sent. The raw meeting notes
   are NOT in here; they live in their own column and never leave the CRM. */
export function buildBody({ offer, q, copy, client, preparedOn, validDays }) {
  const pkg = offer.packages.find(p => p.id === q.packageId) || {};
  const chosen = q.items.map(it => offer.packages.concat(offer.addons).find(x => x.id === it.id) || {});
  const uniq = arr => [...new Set(arr)];
  return {
    v: 1,
    client: {
      name: S(client && client.name, 120), company: S(client && client.company, 160),
      city: S(client && client.city, 120), website: S(client && client.website, 160),
    },
    company: offer.company,
    preparedOn: S(preparedOn, 10),
    validDays: Math.floor(num(validDays)) || offer.validDays,
    copy,
    quote: q,
    standard: {
      underneath: uniq(chosen.flatMap(c => c.underneath || [])).length ? uniq(chosen.flatMap(c => c.underneath || [])) : offer.underneath,
      covers: uniq(chosen.flatMap(c => c.covers || [])).length ? uniq(chosen.flatMap(c => c.covers || [])) : offer.covers,
      quotedSeparately: offer.quotedSeparately,
      steps: offer.steps,
      needFromYou: offer.needFromYou,
      guarantee: offer.guarantee, terms: offer.terms, cancel: offer.cancel,
    },
    onboardingUrl: pkg.onboardingUrl || '',
  };
}

/* ---------- what the CRM does when a proposal comes back accepted ----------
   Returns ONE patch for the lead (ENGINEERING §3: one event, one patch), or
   null when there is nothing to do. Idempotent by activity id: the accepted
   note has a fixed id per proposal, so running this twice (a poll that fires
   while the first write is still landing) changes nothing the second time.

   What it does, and why:
   - Moves the lead to the WON stage, looked up by its flag, never by a key.
   - Deals: the accepted items become this lead's open deals, each carrying
     its service and the setup price agreed. On a PROSPECT, open deals that
     were not from a proposal are replaced: they were the estimate, this is
     the agreement, and keeping both would count the same money twice. On a
     CLIENT, existing open deals are left alone and the new ones are added.
     dealValue is re-summed exactly as writeDeals does.
   - Monthly: set as a QUOTED retainer (no start date). MRR starts on the date
     the owner picks at launch, never inferred. A client who already has a
     retainer keeps it; the note says what to change by hand.
   - Logs the acceptance with the typed name, plan and IP, and sets the next
     step: send the payment link. */
export function acceptancePatch(lead, p, stages, today) {
  if (!lead || !p || p.status !== 'accepted') return null;
  const acts = A(lead.activities);
  const accId = 'prop-acc-' + p.id;
  if (acts.some(a => a && a.id === accId)) return null;
  const body = p.body || {}; const q = body.quote || {};
  const items = A(q.items);
  const won = A(stages).find(s => s && s.won);
  const dealsBefore = A(lead.deals);
  const keep = lead.isClient ? dealsBefore : dealsBefore.filter(d => d && d.proposalId);
  const replaced = dealsBefore.filter(d => !keep.includes(d));
  const newDeals = items.map((it, i) => ({
    id: `prop-${p.id}-${i}`, label: it.name, service: it.service || '', price: String(it.setup),
    setup: '', website: '', integration: '', extras: [], upsell: false,
    addedAt: p.accepted_at || new Date().toISOString(), proposalId: p.id,
  }));
  const deals = [...keep.filter(d => !newDeals.some(n => n.id === d.id)), ...newDeals];
  const sum = d => ['price', 'setup', 'website', 'integration'].reduce((a, k) => a + (Number(d[k]) || 0), 0)
    + A(d.extras).reduce((a, e) => a + (Number(e && e.amount) || 0), 0);
  const patch = { deals, dealValue: deals.reduce((a, d) => a + sum(d), 0) };
  if (won) patch.stage = won.key;
  const monthly = Number(q.monthly) || 0;
  let monthlyNote = '';
  if (monthly > 0) {
    if (Number(lead.retainer) > 0 && lead.isClient) {
      monthlyNote = ` They already have a $${Number(lead.retainer).toLocaleString()}/mo retainer, so the accepted $${monthly.toLocaleString()}/mo was NOT applied; update it by hand.`;
    } else {
      Object.assign(patch, { retainer: String(monthly), retainerActive: true, retainerStart: '', retainerEnd: '', retainerService: q.service || '' });
    }
  }
  const plan = p.accepted_plan === 'annual' && q.prepay ? ` They chose the ${q.prepay.months}-month prepay.` : '';
  const rep = replaced.length ? ` Replaced ${replaced.length} earlier open deal${replaced.length === 1 ? '' : 's'} (${replaced.map(d => d.label || 'Deal').join(', ')}) with what they accepted.` : '';
  const when = p.accepted_at || new Date().toISOString();
  patch.activities = [{
    id: accId, ts: when, type: 'Note', who: 'Proposal',
    text: `Proposal accepted by ${S(p.accepted_name, 120)} (typed signature, IP ${S(p.accepted_ip, 64) || 'unknown'}).${plan} Setup $${(Number(q.setup) || 0).toLocaleString()}, deposit $${(Number(q.deposit) || 0).toLocaleString()} due now.${monthlyNote}${rep} Next: send the payment link.`,
  }, ...acts];
  patch.followUp = S(today, 10);
  patch.nextSteps = 'Send the deposit payment link';
  return patch;
}

/* the "sent" note, once per proposal (a re-send restarts the clock but is
   not a new event on the lead's timeline) */
export function sentPatch(lead, p) {
  if (!lead || !p || !p.sent_at) return null;
  const id = 'prop-sent-' + p.id;
  if (A(lead.activities).some(a => a && a.id === id)) return null;
  const until = p.expires_at ? new Date(p.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return { activities: [{ id, ts: p.sent_at, type: 'Note', who: 'Proposal',
    text: `Proposal sent${p.email_to ? ' to ' + S(p.email_to, 160) : ''}${until ? `, good until ${until}` : ''}.` }, ...A(lead.activities)] };
}

/* All three, merged into ONE patch in timeline order (ENGINEERING §3). */
export function proposalEventsPatch(lead, p, stages, today) {
  let merged = lead, patch = null;
  for (const f of [sentPatch, viewedPatch]) {
    const x = f(merged, p); if (x) { merged = { ...merged, ...x }; patch = { ...(patch || {}), ...x }; }
  }
  const acc = acceptancePatch(merged, p, stages, today);
  if (acc) patch = { ...(patch || {}), ...acc };
  return patch;
}

/* the "they opened it" note, once per proposal */
export function viewedPatch(lead, p) {
  if (!lead || !p || !p.viewed_at) return null;
  const id = 'prop-view-' + p.id;
  if (A(lead.activities).some(a => a && a.id === id)) return null;
  return { activities: [{ id, ts: p.viewed_at, type: 'Note', who: 'Proposal', text: 'Opened the proposal.' }, ...A(lead.activities)] };
}
