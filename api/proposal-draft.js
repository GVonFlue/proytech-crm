import { guard, sweep } from './_guard.js';
import { costOf, spentThisMonth, logSpend } from './_spend.js';
import { SUPA_URL, SUPA_KEY } from './_env.js';

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
//
// POCKET RECORDINGS. The browser sends recording IDS, never a transcript. This
// route reads each one (owner-only table, service key, owner-only route):
// Pocket's summary, its action items and the transcript, capped. So nothing
// in a request can pass itself off as something the client said, and the
// request stays small. What comes back is only the draft's words; transcripts
// never reach the proposal body (lib/proposal cleanCopy keeps the schema
// fields only; tests/proposalscope.mjs proves it).

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
1. Use ONLY facts in the notes, the recordings and the client details. The recordings are the client in their own words: take their goals, their pains and any numbers THEY said from there. Never invent a number, a review count, business hours, a competitor, a location or a result. If the notes do not support a section, leave that field empty rather than guessing.
2. NEVER mention a price, a dollar amount, a discount, a deposit or a payment term. The pricing section is generated separately. You may repeat the client's OWN numbers (their leads, close rate, deal size) only inside plan.numbers, and only if the notes state them.
3. Never promise a specific number of jobs, leads or revenue.
4. Do not name the type of meeting the notes came from.
5. The build section describes ONLY the items listed as being purchased, one entry per meaningful component, in the client's terms.
6. No pressure and no fake urgency: no deadlines, no "spots filling up", no "limited time". Momentum, never fear.

FIELDS
- headline: a short, energizing line about THEIR outcome, 3 to 8 words, not a project title, e.g. "Your 48-home year starts here". Only their own goal or outcome from the notes.
- summary: one paragraph, 3 to 5 sentences. Open with their goal as within reach, celebrate what they do well, name what holds them back, and point to the build as the turning point.
- plan.goal: ALWAYS write the client's goal in words, from what they said in the recordings or what the owner wrote. If they said a number, use it exactly; if they did not, write the goal qualitatively ("a steady stream of listings without chasing every lead yourself"). Never leave it empty unless there is genuinely nothing to go on.
- plan.numbers: up to 6 {label, value} pairs ONLY for numbers the client or the owner actually stated (in the recordings or the owner's notes). If none were stated, return []. NEVER estimate, round up, or invent one; an empty list is correct and expected.
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
    `WHAT WE'RE DOING FOR THEM (the owner's notes):\n${S(b.notes, 12000) || '(none)'}`,
    ...(Array.isArray(b.recordings) && b.recordings.length ? [`RECORDINGS OF THE MEETING(S), the client in their own words:\n\n${b.recordings.map((r, i) =>
      `--- Recording ${i + 1}: ${S(r.title, 160) || 'untitled'}${r.date ? ` (${S(r.date, 20)})` : ''}\n${r.summary ? `Summary: ${S(r.summary, 4000)}\n` : ''}${r.actions ? `Action items: ${S(r.actions, 2000)}\n` : ''}Transcript:\n${S(r.transcript, PER_RECORDING)}`).join('\n\n')}`] : []),
  ].join('\n\n');
}

/** NEVER AN INVENTED NUMBER, enforced at the write (CLAUDE.md), not only asked
 *  for in the prompt. A plan number survives only if every figure in it
 *  (digits, commas ignored) appears in what was actually said: the owner's
 *  blurb, the recordings' summaries, action items or transcripts. Anything
 *  else is dropped, and the owner is told how many. */
export function groundNumbers(draft, sourceText) {
  const out = draft && typeof draft === 'object' ? draft : {};
  const plan = out.plan && typeof out.plan === 'object' ? out.plan : null;
  if (!plan || !Array.isArray(plan.numbers)) return { draft: out, dropped: [] };
  const figures = t => (String(t || '').replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) || []);
  const said = new Set(figures(sourceText));
  const kept = [], dropped = [];
  for (const n of plan.numbers) {
    const f = figures(n && n.value);
    if (f.length && f.every(x => said.has(x))) kept.push(n); else dropped.push(n);
  }
  return { draft: { ...out, plan: { ...plan, numbers: kept } }, dropped };
}

/* recordings: at most 3, each transcript capped, all of them together capped,
   so one long meeting cannot run the bill up */
export const MAX_RECORDINGS = 3, PER_RECORDING = 25000, ALL_RECORDINGS = 60000;
const RID = /^[A-Za-z0-9_:.-]{1,120}$/;
/** Read the chosen recordings from pocket_recordings (owner-only), server-side.
 *  Unknown or malformed ids are refused, never silently skipped. */
export async function readRecordings(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(x => String(x || '')).filter(Boolean);
  if (!list.length) return { ok: true, recordings: [] };
  if (list.length > MAX_RECORDINGS) return { ok: false, error: `Attach at most ${MAX_RECORDINGS} recordings.` };
  if (!list.every(x => RID.test(x)) || new Set(list).size !== list.length) return { ok: false, error: 'One of those recordings is not valid.' };
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, error: 'The server is not connected to Supabase.' };
  const r = await fetch(`${SUPA_URL}/rest/v1/pocket_recordings?id=in.(${list.map(encodeURIComponent).join(',')})&select=id,data`, { headers: { apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}` } });
  const rows = r.ok ? await r.json() : null;
  if (!Array.isArray(rows)) return { ok: false, error: 'Could not read the recordings.' };
  if (rows.length !== list.length) return { ok: false, error: 'A recording was not found. It may have been deleted.' };
  let left = ALL_RECORDINGS;
  const recordings = list.map(id => rows.find(x => x.id === id)).map(row => {
    const d = row.data || {};
    const transcript = S(d.transcript, Math.max(0, Math.min(PER_RECORDING, left)));
    left -= transcript.length;
    const actions = Array.isArray(d.actionItems) ? d.actionItems.map(a => (a && (a.text || a.title)) || a).filter(x => typeof x === 'string').join('; ') : '';
    return { title: S(d.title, 160), date: S(d.createdAt, 10), summary: S(d.summary, 4000), actions: S(actions, 2000), transcript };
  });
  return { ok: true, recordings };
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
  const rec = await readRecordings(b.recordingIds);
  if (!rec.ok) { res.status(200).json({ ok: false, error: rec.error }); return; }
  /* with a recording attached, a one-line blurb is enough: the client said the rest */
  if (rec.recordings.length ? notes.length < 10 : notes.length < 40) { res.status(200).json({ ok: false, error: rec.recordings.length ? 'Add a line about what we are doing for them.' : 'Add a few more notes, or attach a Pocket recording. The proposal is only as specific as what you give it.' }); return; }
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
      body: JSON.stringify({ model: MODEL, max_tokens: 3500, system: SYSTEM, messages: [{ role: 'user', content: userMessage({ ...b, recordings: rec.recordings }) }] }),
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
    const source = [notes, ...rec.recordings.map(r => [r.summary, r.actions, r.transcript].join('\n'))].join('\n');
    const g = groundNumbers(out, source);
    res.status(200).json({ ok: true, draft: g.draft, droppedNumbers: g.dropped.length });
  } catch {
    res.status(200).json({ ok: false, error: 'The assistant could not be reached.' });
  }
}
