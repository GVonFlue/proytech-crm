import { guard } from '@getproytech/core/guard';
import { brandContext, spentCentsThisMonth } from './_content.js';

// api/content-usage.js — what has been spent this month, and the ceiling.
//
// WHY THIS EXISTS AT ALL
//
//   The Studio header shows month-to-date spend against the cap. The ledger is
//   content_usage, and content_usage is written by the SERVICE KEY from the two
//   generator routes. The browser has no path to it: there is no SELECT policy
//   for it and this weekend may not add one, because adding one is a database
//   change.
//
//   So the number comes back through a route instead. That keeps the ledger
//   readable exactly where it is already written — server side, service key —
//   and adds no schema, no policy and no client privilege.
//
//   The alternative was to let the browser read the table directly. If the
//   policy were missing the read would succeed and return ZERO ROWS, and the
//   header would say $0.00 — a plausible value for a real state (nothing spent
//   yet). That is precisely the failure ENGINEERING.md §2 is about: the bug and
//   the intended state rendering pixel-identical.
//
// WHAT IT IS NOT
//
//   Not a generator. It spends nothing, calls no model, and writes nothing. It
//   is the cheapest route in this directory and it is still owner-only, because
//   the monthly spend of the business is company money and ROLES.md keeps that
//   off a rep's screen.

export default async function handler(req, res) {
  // perIp is generous and perDay is high because this is a page-load read, not
  // a generation: the Studio asks for it whenever it opens. maxChars is tiny —
  // the body is always {}.
  const gate = await guard(req, res, {
    name: 'content-usage', perIp: 120, windowMin: 60, perDay: 4000,
    maxChars: 500, requireAdmin: true,
  });
  if (!gate.ok) return;

  const brand = await brandContext();
  if (!brand.ok) {
    console.error('[content-usage] brand context unreadable:', brand.error);
    res.status(502).json({ ok: false, error: 'Could not read the spend cap. ' + brand.error });
    return;
  }

  const spent = await spentCentsThisMonth();
  if (spent === null) {
    // The same posture the cap itself takes: an unreadable ledger is reported,
    // never rendered as zero. The header shows a dash, not $0.00.
    res.status(503).json({ ok: false, error: 'The spend ledger could not be read.' });
    return;
  }

  res.status(200).json({
    ok: true,
    spent_cents: spent,
    cap_cents: Number(brand.config.monthly_cap_cents) || 0,
    config_defaults_used: brand.missing,
  });
}
