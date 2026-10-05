import { guard, sweep } from './_guard.js';
import { costOf, spentThisMonth, logSpend } from './_spend.js';

// api/proposal-draft.js — turn the owner's notes into the WORDS of a proposal.
//
// THE AI WRITES WORDS, THE CRM WRITES NUMBERS. No price is sent to the model
// and none it returns is used: the investment section is rendered from
// lib/proposal quote() alone. The model is told not to mention money, and the
// CRM reports any dollar figure it slips in anyway (cleanCopy) for review.
//
// NO FACT THE OWNER DID NOT GIVE. The model writes ONLY from the notes and the
// client details sent. A proposal that confidently states a business's hours
// or review count, wrongly, costs more trust than it ever earns.
//
// IT WRITES NOTHING. The draft lands on the review screen; only what the owner
// saves becomes a proposal, and only what they send leaves the building.
//
// OWNER ONLY (requireOwner): proposals carry prices and client plans. Same
// privacy posture as the other AI routes: the body goes to api.anthropic.com
// and nowhere else, and is not logged.

const MODEL  = process.env.PROPOSAL_MODEL || process.env.KB_MODEL || 'claude-sonnet-4-6';
const BUDGET = Number(process.env.JARVIS_BUDGET) > 0 ? Number(process.env.JARVIS_BUDGET) : 20;

export const SYSTEM = `You write sales proposals for a small agency that builds websites, CRMs and automations for local businesses. The owner met the client and took notes. Turn those notes into the words of a proposal.

VOICE: ENERGIZED AND SPECIFIC
- This client is about to change their business for good. Write like it: a coach who believes in them. Confident, warm, a little fun.
- Lead with THEIR future. Open with their own 12-month goal as something within reach, vivid and specific to them, e.g. "48 homes in 2027 is closer than you think." Use their goal and their numbers only as the notes state them. Never generic.
- Then the arc: celebrate what they already do well, name what is holding them back, and show the build as the turning point.
- Short, punchy sentences with momentum. Second person to the client ("you", "your").
- The excitement comes from specificity and their own goal, never from hype words. Banned: "game-changer", "revolutionary", "unlock", "supercharge", "cutting-edge", and anything like them.
- Never use em dashes or hyphens as punctuation between clauses. Use commas or full stops.

HARD RULES
1. Use ONLY facts in the notes and client details. Never invent a number, a review count, business hours, a competitor, a location or a result. If the notes do not support a section, leave that field empty rather than guessing.
2. NEVER mention a price, a dollar amount, a discount, a deposit or a payment term. The pricing section is generated separately. You may repeat the client's OWN numbers (their leads, close rate, deal size) only inside plan.numbers, and only if the notes state them.
3. Never promise a specific number of jobs, leads or revenue.
4. Do not name the type of meeting the notes came from.
5. The build section describes ONLY the items listed as being purchased, one entry per meaningful component, in the client's terms.
6. No pressure and no fake urgency: no deadlines, no "spots filling up", no "limited time". Momentum, never fear.

FIELDS
- headline: a short, energizing line about THEIR outcome, 3 to 8 words, not a project title, e.g. "Your 48-home year starts here". Only their own goal or outcome from the notes.
- summary: one paragraph, 3 to 5 sentences. Open with their goal as within reach, celebrate what they do well, name what holds them back, and point to the build as the turning point.
- plan.goal: the client's own goal in their words, if the notes state one, else "".
- plan.numbers: up to 6 {label, value} pairs for numbers the notes state about their business, else [].
- plan.levers: exactly 3 short levers that will move the goal, grounded in the notes.
- gaps: 3 to 5 {title, text}. Title is a short punchy statement. Text is 1 to 3 sentences tying it to this business.
- build: the turning point. One {title, tag, text, item} per component being installed, each text saying what it changes for them. item is the [id] of the purchased item it belongs to, copied exactly from the list. tag is "new" or "included". text is 1 to 2 sentences.
- whyNow: 1 or 2 short paragraphs about the momentum they gain by starting now, in their terms. Reasoning, never pressure or fake urgency. No numbers you were not given.
- email.subject and email.body: a short professional cover email from the owner to the client. Thank them, say the proposal is attached as a link, say it is good for the number of days given, and that to get started they click "Lock in my launch" at the bottom of the proposal, after which onboarding and the deposit payment link follow. Sign off with the owner's first name. Plain text, no links (the CRM adds the button), no prices.

Return ONLY valid JSON, no markdown fences, no preamble:
{"headline":"","summary":"","plan":{"goal":"","numbers":[{"label":"","value":""}],"levers":[""]},"gaps":[{"title":"","text":""}],"build":[{"title":"","tag":"new","text":"","item":""}],"whyNow":[""],"email":{"subject":"","body":""}}`;

const S = (v, n) => String(v == null ? '' : v).slice(0, n);

export function userMessage(b) {
  const c = b.client || {};
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 8).map(it =>
    `- [${S(it.id, 60)}] ${S(it.name, 120)}${it.kind === 'addon' ? ' (add-on)' : ''}${it.summary ? `: ${S(it.summary, 400)}` : ''}${Array.isArray(it.includes) && it.includes.length ? `\n  Includes: ${it.includes.slice(0, 12).map(x => S(x, 160)).join('; ')}` : ''}`).join('\n');
  return [
    `CLIENT: ${S(c.name, 120)}${c.company ? `, ${S(c.company, 160)}` : ''}${c.businessType ? ` (${S(c.businessType, 80)})` : ''}${c.city ? `, ${S(c.city, 80)}` : ''}${c.website ? `, ${S(c.website, 160)}` : ''}`,
    `OWNER SIGNING THE EMAIL: ${S(b.ownerName, 80) || 'the owner'}`,
    `AGENCY: ${S(b.agency, 120) || 'the agency'}`,
    `PROPOSAL VALID FOR: ${Math.max(1, Math.min(60, Number(b.validDays) || 7))} days`,
    `BEING PURCHASED:\n${items || '- (nothing listed)'}`,
    `OWNER'S NOTES:\n${S(b.notes, 12000)}`,
  ].join('\n\n');
}

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'proposal-draft', perIp: 30, windowMin: 10, perDay: 120,
    maxChars: 20000, requireOwner: true,
  });
  if (!gate.ok) return;
  sweep();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'AI is not configured on this install (ANTHROPIC_API_KEY).' }); return; }

  const b = req.body || {};
  const notes = String(b.notes || '').trim();
  if (notes.length < 40) { res.status(200).json({ ok: false, error: 'Add a few more notes first. The proposal is only as specific as what you give it.' }); return; }
  if (!Array.isArray(b.items) || !b.items.length) { res.status(200).json({ ok: false, error: 'Pick what they are buying first.' }); return; }

  const spent = await spentThisMonth('jarvis:spend');
  if (spent !== null && spent >= BUDGET) {
    res.status(200).json({ ok: false, capped: true, error: `This month's AI budget of $${BUDGET} is used up. It resets on the 1st.` });
    return;
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 3500, system: SYSTEM, messages: [{ role: 'user', content: userMessage(b) }] }),
    });
    const j = await r.json();
    if (!r.ok) { res.status(200).json({ ok: false, error: (j.error && j.error.message) || 'The assistant is unavailable right now.' }); return; }
    logSpend('jarvis:spend', costOf(MODEL, j.usage)).catch(() => {});
    let text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let out;
    try { out = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      try { out = m ? JSON.parse(m[0]) : null; } catch { out = null; }
    }
    if (!out || typeof out !== 'object') { res.status(200).json({ ok: false, error: 'The draft came back in a shape we could not read. Try again.' }); return; }
    // Shape is clamped on the client by cleanCopy (lib/proposal), the same
    // function the tests exercise, so there is one definition of a valid draft.
    res.status(200).json({ ok: true, draft: out });
  } catch {
    res.status(200).json({ ok: false, error: 'The assistant could not be reached.' });
  }
}
