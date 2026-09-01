import { guard, sweep } from '@getproytech/core/guard';
import { costOf, spentThisMonth, logSpend } from '@getproytech/core/spend';

// api/kb-draft.js — turn a meeting transcript into a DRAFT Playbook note.
//
// WHY THIS IS NOT A `kind` ON api/meeting-log.js
//
//   meeting-log.js switches system prompts on `kind` but returns THE SAME
//   OUTPUT SCHEMA either way — that is the stated invariant that keeps every
//   downstream consumer unchanged. A Playbook note is prose, not that
//   extraction object. Adding a third kind would break the one promise that
//   file makes about itself, so this is its own endpoint with its own prompt,
//   its own size limit and its own shape.
//
// WHAT THIS ENDPOINT DOES AND DOES NOT DO
//
//   It reads a transcript ONCE and returns text. It does not write anything.
//   The response lands in a TEXTAREA the owner edits, and only what is in that
//   textarea when they press Save becomes a note. The transcript is never
//   stored on a Playbook note — kb_notes has no transcript column and neither
//   does kb_published (KB-MIGRATION.sql).
//
//   That is the whole answer to "a transcript explaining a process also
//   contains pay talk and pricing". The text is not scrubbed on its way to a
//   rep; it never travels. Scrubbing is a filter and filters are wrong
//   sometimes. Not having the text is right every time.
//
// Same privacy posture as the other AI endpoints: the payload goes to
// api.anthropic.com and nowhere else, and nothing is logged here — not the
// body, not on error.

const MODEL  = process.env.KB_MODEL || 'claude-sonnet-4-6';
const BUDGET = Number(process.env.JARVIS_BUDGET) > 0 ? Number(process.env.JARVIS_BUDGET) : 20;

// The published body is capped at 8000 characters in Postgres. Asking for
// noticeably less than that leaves the owner room to expand while editing
// rather than having to cut before they can save.
const SYSTEM = `You are helping the owner of a small business turn a meeting recording into a PROCESS NOTE for an internal playbook that their sales reps will read.

WHAT A PROCESS NOTE IS, AND IS NOT

It is not a summary of the meeting. Nobody wants to read what happened on a Tuesday in March. It is the durable, repeatable part: how something is done, what to say when an objection comes up, the order steps go in, the quirk of a particular vendor, what to check before sending something out.

If the transcript is a conversation about handling a lender's objection, the note is HOW TO HANDLE THAT OBJECTION — not "Garrett and Logan discussed lender objections".

WRITE FOR A SALES REP WHO WASN'T THERE

- Second person. "When a lender says the rate is locked, ask..." not "we decided that...".
- Concrete and ordered. Numbered steps where there is a sequence.
- Keep the specific language worth reusing — an actual phrase that works is the most valuable thing in a transcript.
- No preamble, no "in this note we will". Start with the substance.
- 200 to 900 words. Shorter if the transcript only supports shorter.

WHAT TO LEAVE OUT — THIS MATTERS MORE THAN COMPLETENESS

The transcript is a candid internal conversation and it will contain things that must not go into a note reps read. Leave out, without exception and without alluding to their existence:

- Anyone's pay, commission rate, commission split, or what a person costs.
- Hiring, firing, performance opinions, or candid reads on a named person.
- What a specific client pays, deal values, margins, discounts given, or what the business makes.
- Pricing FLOORS and internal pricing strategy. A pricing RULE a rep must follow is fine ("never quote before the discovery call"); the number the owner will actually accept is not.
- Anything said as a joke, a vent, or thinking out loud that was not a conclusion.

If the useful process cannot be separated from that material, say so in the note rather than writing around it badly.

You are producing a DRAFT. A human reads and edits every word before anything is saved, and publishing it to reps is a separate deliberate act after that. Write it as a strong first version, not as a hedge.

Return ONLY valid JSON. No markdown fences, no preamble:
{"title":"short name for this note, max 8 words","category":"one of: Process, Objections, Onboarding, Vendors, Pricing rules, Tools, Other","tags":["2-5 short lowercase tags"],"body":"the note itself, plain text with line breaks and numbered steps where useful"}`;

export default async function handler(req, res) {
  // maxChars set here rather than inherited: this endpoint takes a pasted
  // transcript and the shared default is sized for a chat box. Same reasoning
  // as meeting-log.js, and the 413 now states the actual numbers.
  const gate = await guard(req, res, {
    name: 'kb-draft', perIp: 20, windowMin: 10, perDay: 60,
    maxChars: 260000, requireAuth: true, module: 'playbook',
  });
  if (!gate.ok) return;
  sweep();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'AI is not configured on this install.' }); return; }

  const b = req.body || {};
  const transcript = String(b.transcript || '').trim();

  if (transcript.length < 200) { res.status(200).json({ ok: false, error: 'That transcript is too short to be worth reading.' }); return; }
  if (transcript.length > 200000) { res.status(200).json({ ok: false, error: 'That transcript is too long. Split it into two meetings.' }); return; }

  const spent = await spentThisMonth('jarvis:spend');
  if (spent !== null && spent >= BUDGET) {
    res.status(200).json({
      ok: false, capped: true,
      error: `This month's AI budget of $${BUDGET} is used up. It resets on the 1st.`,
    });
    return;
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 3000, system: SYSTEM,
        messages: [{ role: 'user', content: 'Transcript follows.\n\n' + transcript }],
      }),
    });
    const j = await r.json();
    if (!r.ok) { res.status(200).json({ ok: false, error: (j.error && j.error.message) || 'The assistant is unavailable right now.' }); return; }

    logSpend('jarvis:spend', costOf(MODEL, j.usage)).catch(() => {});

    let text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let out;
    try { out = JSON.parse(text); }
    catch {
      // Same salvage as huddle.js and meeting-log.js: the model occasionally
      // wraps the object in a sentence.
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) { res.status(200).json({ ok: false, error: 'The draft came back in a shape we could not read. Try again.' }); return; }
      try { out = JSON.parse(m[0]); }
      catch { res.status(200).json({ ok: false, error: 'The draft came back in a shape we could not read. Try again.' }); return; }
    }

    res.status(200).json({
      ok: true,
      draft: {
        title: String(out.title || '').slice(0, 200),
        category: String(out.category || 'Process').slice(0, 60),
        tags: Array.isArray(out.tags) ? out.tags.map(t => String(t).slice(0, 40)).slice(0, 6) : [],
        body: String(out.body || '').slice(0, 8000),
      },
    });
  } catch {
    // Message only. The body is never echoed back or logged — it is a transcript.
    res.status(200).json({ ok: false, error: 'The assistant could not be reached.' });
  }
}
