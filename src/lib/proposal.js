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
/* A STANDARD-SECTION LINE THAT ONLY APPLIES TO SOME PURCHASES.
   "What you do not see" and "What we need from you" are offer-wide lists, so
   a Growth OS proposal without Automations used to promise "automations know
   when to stop". Each entry may now carry appliesTo: the package / add-on ids
   it is about. An empty list — or a plain string, which is what every offer
   saved before this was — means it applies to every proposal. */
const tagged = v => A(v).map(x => (typeof x === 'string'
  ? { text: S(x, 400).trim(), appliesTo: [] }
  : { text: S(x && x.text, 400).trim(), appliesTo: A(x && x.appliesTo).map(id => S(id, 60).trim()).filter(Boolean) }))
  .filter(x => x.text);
/* ONE rule for "does this line belong on this proposal" */
export const appliesTo = (entry, ids) => !entry || !A(entry.appliesTo).length || A(entry.appliesTo).some(id => A(ids).includes(id));
export const linesFor = (list, ids) => tagged(list).filter(e => appliesTo(e, ids)).map(e => e.text);

/* ---------- vocabulary, defined once ---------- */
export const PROPOSAL_STATUSES = ['draft', 'sent', 'viewed', 'accepted'];
export const PLANS = ['monthly', 'annual'];
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/* ONE email rule: the readiness check here and api/_mail.js (which re-exports
   it) must never disagree about whether a lead can be emailed. */
export const isEmail = s => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(s || '').trim());

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
      underneath: tagged(raw.underneath),
      covers: lines(raw.covers),
      quotedSeparately: lines(raw.quotedSeparately),
      steps: A(raw.steps).map(s => ({ title: S(s && s.title, 60).trim(), text: S(s && s.text, 300).trim() })).filter(s => s.title),
      needFromYou: tagged(raw.needFromYou),
      /* after they accept: where onboarding lives (offer-wide, else the
         package's own), the deposit payment link, and how long to launch */
      onboardingUrl: safeHttps(raw.onboardingUrl),
      paymentUrl: safeHttps(raw.paymentUrl),
      /* the Terms of Service and Privacy Policy a client agrees to on accept:
         per install (white-label), frozen into each proposal at send */
      legal: readLegal(raw.legal),
      launchDays: Number.isInteger(num(raw.launchDays)) && num(raw.launchDays) >= 1 && num(raw.launchDays) <= 120 ? num(raw.launchDays) : null,
      company: {
        name: S(company.name, 120).trim(), people: S(company.people, 160).trim(),
        email: S(company.email, 160).trim(), website: S(company.website, 160).trim(),
        city: S(company.city, 120).trim(),
        /* the brand on the cover and in the footer, per install (white-label):
           the shipped offer points at ProyTech's files in public/, another
           install points at its own. Unset falls back to the name as text. */
        logo: safeAsset(company.logo), mark: safeAsset(company.mark),
        /* the people a client may hear from; ONE or more is chosen per
           proposal (chosenContacts) and frozen into its body */
        contacts: normContacts(company.contacts),
      },
    },
  };
}

/* THE CLIENT LINK: {base}/p/{client-slug}#t={token}.
   The slug is COSMETIC. Nothing on the server reads it — the token in the
   fragment is still the only key (api/proposal-public.js), so a wrong, stale
   or hand-edited slug opens the same proposal and access rules do not change.
   It exists so the link a client sees names them, not "proposal.html". */
export function clientSlug(client) {
  const c = client && typeof client === 'object' ? client : {};
  const raw = S(c.company, 300).trim() || S(c.name, 300).trim();
  let s = raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 60) { const cut = s.slice(0, 61); const at = cut.lastIndexOf('-'); s = (at >= 20 ? cut.slice(0, at) : s.slice(0, 60)).replace(/-+$/g, ''); }
  return s || 'proposal';
}
export function proposalUrl(base, client, token) {
  return `${String(base || '').replace(/\/+$/, '')}/p/${clientSlug(client)}#t=${encodeURIComponent(String(token || ''))}`;
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
/* `items` is what is being bought ([{id, name}]). Each build entry is LINKED
   to one of them by id (b.item), because "every build item matches something
   purchased" is a send rule (readiness) and a title like "A custom website
   that converts" cannot be matched to "Growth OS" by its words. The model is
   asked for the id; an id that was not purchased is dropped, and an entry
   whose title IS an item's name is linked to it. Anything else stays
   unlinked and the review screen asks the owner to pick. */
export function cleanCopy(raw, items = []) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const bought = A(items).filter(x => x && x.id);
  const linkOf = b => {
    const id = S(b && b.item, 60).trim();
    if (bought.some(x => x.id === id)) return id;
    const byName = bought.find(x => S(x.name).trim().toLowerCase() === S(b && b.title).trim().toLowerCase());
    return byName ? byName.id : '';
  };
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
    build: A(r.build).map(b => ({ title: t(b && b.title, 80), tag: t(b && b.tag, 20), text: t(b && b.text, 400), item: linkOf(b) })).filter(b => b.title).slice(0, 10),
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
export function buildBody({ offer, q, copy, client, preparedOn, validDays, contacts }) {
  const pkg = offer.packages.find(p => p.id === q.packageId) || {};
  const chosen = q.items.map(it => offer.packages.concat(offer.addons).find(x => x.id === it.id) || {});
  const uniq = arr => [...new Set(arr)];
  const ids = q.items.map(it => it.id);
  /* A SNAPSHOT, not a view: deep-copied so nothing this returns shares an
     object with the offer in Settings. Editing prices, terms or the company
     block afterwards cannot reach a body already built, saved or sent. */
  return JSON.parse(JSON.stringify({
    v: 1,
    client: {
      name: S(client && client.name, 120), company: S(client && client.company, 160),
      city: S(client && client.city, 120), website: S(client && client.website, 160),
    },
    /* the company block WITHOUT its contact list: only the contacts chosen
       for this proposal travel, below */
    company: (({ contacts: _all, ...co }) => co)(offer.company || {}),
    contacts: normContacts(contacts),
    preparedOn: S(preparedOn, 10),
    validDays: Math.floor(num(validDays)) || offer.validDays,
    copy,
    quote: q,
    standard: {
      /* only the lines that apply to what is being bought: an item's own
         lines, plus the offer-wide lines tagged for it or for everything */
      underneath: uniq([...chosen.flatMap(c => c.underneath || []), ...linesFor(offer.underneath, ids)]),
      covers: uniq(chosen.flatMap(c => c.covers || [])).length ? uniq(chosen.flatMap(c => c.covers || [])) : offer.covers,
      quotedSeparately: offer.quotedSeparately,
      steps: offer.steps,
      needFromYou: linesFor(offer.needFromYou, ids),
      guarantee: offer.guarantee, terms: offer.terms, cancel: offer.cancel,
    },
    onboardingUrl: offer.onboardingUrl || pkg.onboardingUrl || '',
    paymentUrl: offer.paymentUrl || '',
    /* what the client is shown and agrees to; proposal_accept() copies these
       into the acceptance record from THIS stored body, never from a request */
    legal: offer.legal || null,
    launchDays: offer.launchDays || null,
  }));
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
    text: `${acceptanceRecord(p).text}${plan} Setup $${(Number(q.setup) || 0).toLocaleString()}, deposit $${(Number(q.deposit) || 0).toLocaleString()} due now.${monthlyNote}${rep} Next: send the payment link.`,
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


/* ---------- THE PROPOSAL STANDARD ----------
   What a proposal must have before it may leave the building. ONE function,
   called by the review screen (to show the checklist and disable Send) and by
   api/proposal-send.js (to refuse). The screen is a courtesy; the server is
   the boundary, so a hand-made request cannot skip a rule the screen shows.

   It reads the BODY that will be published — the frozen snapshot — never the
   offer or a draft in memory, so what is checked is exactly what is sent.
   `mode` is 'link' or 'email'; the email rule only applies to email.
   `reviewed` is the owner's own tick, sent with each request. */
export const READY_RULES = ['package', 'goal', 'numbers', 'levers', 'gaps', 'build', 'email', 'reviewed'];
export function readiness(body, { mode = 'link', leadEmail = '', reviewed = false } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const q = b.quote || {}; const c = b.copy || {}; const plan = c.plan || {};
  const items = A(q.items).filter(Boolean);
  const ids = new Set(items.map(i => i.id).filter(Boolean));
  const filled = v => !!S(v).trim();
  const nums = A(plan.numbers).filter(n => n && filled(n.label) && filled(n.value));
  const levers = A(plan.levers).filter(filled);
  const gaps = A(c.gaps).filter(g => g && filled(g.title));
  const buildItems = A(c.build).filter(x => x && S(x.title).trim());
  const unlinked = A(c.build).filter(x => !x || !ids.has(x.item));
  const pkg = items.find(i => i.id === q.packageId && i.kind !== 'addon');
  const checks = [
    { key: 'package', label: 'A package is selected', ok: !!pkg, detail: pkg ? pkg.name : 'Pick a package.' },
    { key: 'goal', label: 'Their goal is filled in', ok: filled(plan.goal), detail: filled(plan.goal) ? '' : 'Add the goal in their words.' },
    { key: 'numbers', label: 'At least 3 of their numbers', ok: nums.length >= 3, detail: nums.length >= 3 ? `${nums.length} numbers` : `${nums.length} of 3` },
    { key: 'levers', label: 'Exactly 3 levers', ok: levers.length === 3, detail: `${levers.length} of 3` },
    { key: 'gaps', label: '3 to 5 gaps', ok: gaps.length >= 3 && gaps.length <= 5, detail: `${gaps.length} gap${gaps.length === 1 ? '' : 's'}` },
    /* at least one, and every one tied to something bought: a proposal with
       no build section never says what the client is getting */
    { key: 'build', label: 'Every build item is part of what they are buying', ok: buildItems.length > 0 && unlinked.length === 0,
      detail: !buildItems.length ? 'Add at least one build item' : unlinked.length ? `Not linked: ${unlinked.map(x => (x && x.title) || 'untitled').join(', ')}` : '' },
  ];
  if (mode === 'email') checks.push({ key: 'email', label: 'The lead has a valid email', ok: isEmail(leadEmail), detail: isEmail(leadEmail) ? S(leadEmail, 160).trim() : 'Add an email to the lead.' });
  checks.push({ key: 'reviewed', label: "You've read every section", ok: reviewed === true, detail: reviewed === true ? '' : 'Tick the box once you have.' });
  return { ok: checks.every(x => x.ok), checks, missing: checks.filter(x => !x.ok).map(x => x.key) };
}

/* ---------- validating an offer before it is saved ----------
   readOffer() is forgiving on purpose: it reads whatever is saved and drops
   what it cannot use, so a proposal never crashes on a bad row. The EDITOR
   must not be: an item with no name or a price of "abc" would otherwise be
   saved and then silently vanish from the builder. So this runs readOffer's
   own rules and also NAMES every problem, by field path, before anything is
   written. A price is a number of 0 or more — blank is an error, never $0. */
export function validateOffer(raw) {
  const errors = [];
  const err = (path, msg) => { if (!errors.some(e => e.path === path)) errors.push({ path, msg }); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: [{ path: 'offer', msg: 'There is no offer to save.' }], offer: null };
  const blank = v => !S(v).trim();
  const isPrice = v => v !== '' && v !== null && v !== undefined && typeof v !== 'boolean' && Number.isFinite(Number(v)) && Number(v) >= 0;
  const isWhole = (v, min) => v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v)) && Number(v) >= min;
  const co = raw.company && typeof raw.company === 'object' ? raw.company : {};
  if (blank(co.name)) err('company.name', 'Company name is required.');
  if (!blank(co.email) && !isEmail(co.email)) err('company.email', 'That is not a valid email.');
  for (const k of ['logo', 'mark']) if (!blank(co[k]) && !safeAsset(co[k])) err('company.' + k, 'Use an https:// address, or a path on this site such as /logo.png.');
  if (!A(raw.packages).length) err('packages', 'Add at least one package.');
  const seen = new Set();
  const groups = [['packages', A(raw.packages)], ['addons', A(raw.addons)]];
  for (const [g, list] of groups) list.forEach((x, i) => {
    const p = `${g}.${i}`; const it = x && typeof x === 'object' ? x : {};
    if (blank(it.name)) err(p + '.name', 'Name is required.');
    if (blank(it.id)) err(p + '.id', 'Id is required.');
    else if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(it.id)) err(p + '.id', 'Use lowercase letters, numbers and dashes.');
    else if (seen.has(it.id)) err(p + '.id', `Another item already uses the id "${it.id}".`);
    else seen.add(it.id);
    if (blank(it.service)) err(p + '.service', 'Pick the service this counts as.');
    if (!isPrice(it.setup)) err(p + '.setup', 'Setup must be a number, 0 or more.');
    if (!isPrice(it.monthly)) err(p + '.monthly', 'Monthly must be a number, 0 or more.');
    if (it.seatsIncluded !== undefined && it.seatsIncluded !== '' && !isWhole(it.seatsIncluded, 0)) err(p + '.seatsIncluded', 'Seats must be a whole number, 0 or more.');
    if (it.extraSeat !== undefined && it.extraSeat !== '' && !isPrice(it.extraSeat)) err(p + '.extraSeat', 'Extra seat price must be a number, 0 or more.');
    if (!blank(it.onboardingUrl) && !safeHttps(it.onboardingUrl)) err(p + '.onboardingUrl', 'An onboarding link must start with https://');
    for (const list2 of ['includes', 'covers']) A(it[list2]).forEach((v, j) => { if (blank(v)) err(`${p}.${list2}.${j}`, 'This line is empty.'); });
  });
  if (!(Number(raw.depositPct) > 0 && Number(raw.depositPct) <= 100) || raw.depositPct === '' || raw.depositPct == null) err('depositPct', 'Deposit must be more than 0% and at most 100%.');
  if (!(isWhole(raw.validDays, 1) && Number(raw.validDays) <= 60)) err('validDays', 'Good-for days must be a whole number from 1 to 60.');
  if (raw.prepay) {
    const m = raw.prepay.months, f = raw.prepay.free;
    if (!isWhole(m, 1)) err('prepay.months', 'Prepay months must be a whole number, 1 or more.');
    if (!isWhole(f, 0)) err('prepay.free', 'Free months must be a whole number, 0 or more.');
    else if (isWhole(m, 1) && Number(f) >= Number(m)) err('prepay.free', 'Free months must be fewer than the months paid up front.');
  }
  if (!blank(raw.onboardingUrl) && !safeHttps(raw.onboardingUrl)) err('onboardingUrl', 'The onboarding link must start with https://');
  if (!blank(raw.paymentUrl) && !safeHttps(raw.paymentUrl)) err('paymentUrl', 'The payment link must start with https://');
  if (raw.launchDays !== undefined && raw.launchDays !== null && raw.launchDays !== '' && !(isWhole(raw.launchDays, 1) && Number(raw.launchDays) <= 120))
    err('launchDays', 'Days to launch must be a whole number from 1 to 120.');
  A(co.contacts).forEach((c, i) => {
    const x = c && typeof c === 'object' ? c : {};
    if (blank(x.name)) err(`company.contacts.${i}.name`, 'Name is required.');
    if (blank(x.phone) && blank(x.email)) err(`company.contacts.${i}.phone`, 'Add a phone or an email, so a client can reach them.');
    if (!blank(x.email) && !isEmail(x.email)) err(`company.contacts.${i}.email`, 'That is not a valid email.');
    if (!blank(x.phone) && S(x.phone).replace(/\D/g, '').length < 7) err(`company.contacts.${i}.phone`, 'That is not a phone number.');
    if (!blank(x.photo) && !safeAsset(x.photo)) err(`company.contacts.${i}.photo`, 'A photo must be an https:// link or a path on this site, like /team/me.jpg.');
  });
  /* legal: all or nothing. A half-filled block would let a proposal be
     accepted against a policy with no version, or a version with no policy. */
  const lg = raw.legal && typeof raw.legal === 'object' ? raw.legal : null;
  if (lg && (!blank(lg.termsUrl) || !blank(lg.privacyUrl) || !blank(lg.version))) {
    if (blank(lg.termsUrl)) err('legal.termsUrl', 'Add the Terms of Service link (or clear all three).');
    else if (!safeHttps(lg.termsUrl)) err('legal.termsUrl', 'The Terms link must start with https://');
    if (blank(lg.privacyUrl)) err('legal.privacyUrl', 'Add the Privacy Policy link (or clear all three).');
    else if (!safeHttps(lg.privacyUrl)) err('legal.privacyUrl', 'The Privacy link must start with https://');
    if (blank(lg.version)) err('legal.version', 'Add the version clients agree to, e.g. 2026-10-04.');
    else if (S(lg.version).trim().length > 40) err('legal.version', 'Keep the version under 40 characters.');
  }
  if (blank(raw.terms)) err('terms', 'Payment terms are required: the client agrees to them when they accept.');
  A(raw.steps).forEach((st, i) => {
    if (blank(st && st.title)) err(`steps.${i}.title`, 'Step title is required.');
    if (blank(st && st.text)) err(`steps.${i}.text`, 'Say what happens in this step.');
  });
  const itemIds = new Set([...A(raw.packages), ...A(raw.addons)].map(x => x && x.id).filter(Boolean));
  const textOf = v => (v && typeof v === 'object' ? v.text : v);
  for (const k of ['underneath', 'quotedSeparately', 'needFromYou']) A(raw[k]).forEach((v, j) => {
    if (blank(textOf(v))) err(`${k}.${j}`, 'This line is empty.');
    const unknown = A(v && typeof v === 'object' ? v.appliesTo : []).filter(id => !itemIds.has(id));
    if (unknown.length) err(`${k}.${j}.appliesTo`, `Applies to an item that is not in the offer: ${unknown.join(', ')}.`);
  });
  // and whatever readOffer itself would report missing, by its own name
  const r = readOffer({ offer: raw });
  for (const m of r.missing) if (!errors.some(e => e.path === m || e.path.startsWith(m + '.'))) err(m, `Missing: ${m}.`);
  return { ok: errors.length === 0, errors, offer: errors.length ? null : r.offer };
}


/* ---------- points of contact ----------
   The offer lists the people a client may hear from (company.contacts). Each
   proposal names ONE of them, or all of them ("both"), and that choice is
   frozen into the body when it is built, like every other thing the client
   sees. The "You're in" screen speaks in those names. */
export const CONTACTS_ALL = 'both';
function normContacts(v) {
  /* role and photo are optional: the onboarding portal's "build crew" card
     shows them (a photo is an https URL or a path on this site, safeAsset) */
  return A(v).map(x => ({ name: S(x && x.name, 80).trim(), phone: S(x && x.phone, 40).trim(), email: S(x && x.email, 160).trim(),
    role: S(x && x.role, 60).trim(), photo: safeAsset(x && x.photo) }))
    .filter(c => c.name);
}
/* the contact whose name matches the signed-in owner, else the first */
export function defaultContactPick(contacts, me) {
  const list = normContacts(contacts);
  if (!list.length) return '';
  const m = S(me).trim().toLowerCase(), first = m.split(/\s+/)[0];
  const hit = m && list.find(c => c.name.toLowerCase() === m || c.name.toLowerCase().split(/\s+/)[0] === first);
  return (hit || list[0]).name;
}
/* a pick ('both', or a contact's name) -> the contacts it means */
export function chosenContacts(contacts, pick) {
  const list = normContacts(contacts);
  if (pick === CONTACTS_ALL) return list;
  const one = list.find(c => c.name === pick);
  return one ? [one] : list.slice(0, 1);
}
/* "Logan will send", "Garrett or Logan will send", "We'll send" */
export function whoWillSend(contacts) {
  const names = normContacts(contacts).map(c => c.name.split(/\s+/)[0]);
  if (!names.length) return "We'll send";
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return `${who} will send`;
}
/* tel: link from a typed phone number (US numbers get +1) */
export function telHref(phone) {
  const d = S(phone).replace(/\D/g, '');
  if (d.length < 7) return '';
  return 'tel:' + (d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : d);
}


/* ---------- legal: the terms a client agrees to, and the record of it ---------- */
function readLegal(v) {
  const x = v && typeof v === 'object' ? v : {};
  const termsUrl = safeHttps(x.termsUrl), privacyUrl = safeHttps(x.privacyUrl), version = S(x.version, 40).trim();
  return termsUrl && privacyUrl && version ? { termsUrl, privacyUrl, version } : null;
}
/* Does this proposal ask the client to agree to Terms and Privacy? The SAME
   test proposal_accept() makes in Postgres: either link present in the body. */
export const hasLegal = body => !!(body && body.legal && (body.legal.termsUrl || body.legal.privacyUrl));

/* "Oct 5, 2026, 2:14 PM CDT" — in the calendar's zone, with the zone named,
   so a record read in another zone is never an hour out without saying so. */
export function fmtWhen(iso, tz = 'America/Chicago') {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(t));
}

/* THE acceptance record, one wording for the proposal screen and the lead's
   activity: "Accepted by [name] on [date, time] from IP [ip]. Agreed to Terms
   of Service and Privacy Policy, version [version]." The terms part comes
   from the acceptance columns Postgres wrote (accepted_terms_*), which it
   copied from the stored proposal — not from anything the client sent. */
export function acceptanceRecord(p, tz = 'America/Chicago') {
  const r = p || {};
  const when = fmtWhen(r.accepted_at, tz);
  const base = `Accepted by ${S(r.accepted_name, 120) || 'the client'}${when ? ` on ${when}` : ''} from IP ${S(r.accepted_ip, 64) || 'unknown'}.`;
  const v = S(r.accepted_terms_version, 40).trim();
  if (!v) return { text: base, base, version: '', termsUrl: '', privacyUrl: '' };
  const termsUrl = safeHttps(r.accepted_terms_url), privacyUrl = safeHttps(r.accepted_privacy_url);
  const agreed = `Agreed to Terms of Service and Privacy Policy, version ${v}.`;
  return { text: `${base} ${agreed}${termsUrl ? ` Terms: ${termsUrl}` : ''}${privacyUrl ? ` Privacy: ${privacyUrl}` : ''}`, base, agreed, version: v, termsUrl, privacyUrl };
}

/** Money on everything a client sees: whole dollars as "$2,249", and any cents
 *  always as two digits, "$2,249.50", never "$2,249.5". The CRM's own rule
 *  (Proposals.jsx), defined once here so the page and the document agree. */
export function usd(v) {
  const n = Number(v) || 0; const c = Math.round(Math.abs(n) * 100) % 100;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: 2 });
}
