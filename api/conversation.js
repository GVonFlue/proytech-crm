import { guard, sweep } from '@getproytech/core/guard';
// Conversation capture — turn a pasted thread into structured notes.
//
// Sonnet, not Haiku. This is judgement, not extraction: who said what, what was
// actually promised, what is an objection versus a passing worry. The whole
// value of the feature is that it gets those right.
//
// PRIVACY, WHICH IS THE POINT OF THIS ENDPOINT'S DESIGN:
//   - the thread goes to api.anthropic.com and NOWHERE else
//   - nothing is logged here, not the body, not on error
//   - the CRM never stores the raw thread; only the structured result is saved
//
// The response is strict JSON. It is parsed defensively on both sides — a
// malformed answer becomes "couldn't read that, here's your text as a note",
// never a crash. See src/lib/convo.js for the client-side validation.

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You read one conversation between a salesperson and a prospect or client, and return structured notes for a CRM.

Two jobs, in this order.

JOB 1 — WHO IS WHO.
The thread may have clear labels, useless labels (initials, phone numbers, "Me:"), or no labels at all.

You are given the lead's name and company, the signed-in user's name, and a list of the speaker labels actually present with locally-computed signals about each.

Rules, and these matter more than anything else you do here:
- NEVER guess to be helpful. A wrong mapping writes "the client said they're ready to move forward" when in fact the salesperson said it. That is a confidently false record and it is worse than no record.
- Use hard signals: explicit self-labels (Me/I/You), a label matching the lead record, a label matching the signed-in user, email From:/wrote: direction markers.
- Softer signals — who asks versus answers, who quotes pricing, who talks about their own budget or timeline — may support a mapping but must never be the ONLY basis for a confident one.
- If the thread genuinely has no signal, set confidence "none" and ambiguous true. Say so. Do not pick.
- confidence "high" means the evidence is explicit. "medium" means one strong signal. "low" means inference only. When in doubt, go lower.
- "evidence" must quote or name the actual thing you used. "labelled Me:" or "matches lead record Sarah Chen", not "seems like the client".

JOB 2 — WHAT HAPPENED.
Extract, do not transcribe. A 200-message thread pasted into an activity feed is unusable; the summary is what someone reads before the next call.

- summary: a short paragraph — what this conversation actually was.
- wants: what they said they need, in their words where you can.
- promised: anything the SALESPERSON committed to, with a date if one was given. Only real commitments.
- objections: concerns, hesitations, pushback.
- openQuestions: asked and not answered, either direction, with who asked.
- facts: budget, timeline, decision makers, competitors, property details, family details — anything that makes the next conversation better. Set "field" ONLY when the value clearly belongs in that exact CRM field: email, phone, dealValue, retainer, timeline, source, address. Leave "field" empty otherwise.
- followUps: suggested next actions. These are proposals for a human to accept, not tasks you are creating.
- dates: any date mentioned, ISO format, with what it refers to.

Absolute rules:
- Never invent a fact, name, number or date that is not in the thread.
- Empty arrays where there is nothing. Do not pad.
- Relative dates ("next Tuesday") resolve against the conversation date given to you. If you cannot resolve one confidently, leave it out of "dates" and mention it in the summary instead.

Return ONLY valid JSON, no markdown fences, no preamble:
{
  "speakers": [{"key": "the label lowercased exactly as given to you", "label": "as written", "role": "lead|us|other|unknown", "evidence": "the signal you used"}],
  "confidence": "high|medium|low|none",
  "ambiguous": false,
  "reasoning": "one sentence on how you mapped them",
  "summary": "",
  "wants": [],
  "promised": [{"what": "", "by": "YYYY-MM-DD", "who": ""}],
  "objections": [],
  "openQuestions": [{"question": "", "askedBy": ""}],
  "facts": [{"label": "", "value": "", "field": ""}],
  "followUps": [{"title": "", "due": "YYYY-MM-DD"}],
  "dates": [{"date": "YYYY-MM-DD", "what": ""}]
}`;

export default async function handler(req, res) {
  // Signed-in users only, plus per-IP and a global daily ceiling. These
  // endpoints cost money, so an open one is a direct line to the card.
  // 210k, not the 12k default: this endpoint takes a pasted email thread and
  // already refuses one over 200k itself (below). On the default that check was
  // dead code — every thread over 12k was rejected up here instead, with a
  // message about a limit the product never advertised.
  const gate = await guard(req, res, { name: 'conversation', perIp: 20, perDay: 600, maxChars: 210000, requireAuth: true });
  if (!gate.ok) return;
  sweep();

  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }); return; }

  const b = req.body || {};
  const text = typeof b.text === 'string' ? b.text : '';
  if (!text.trim()) { res.status(400).json({ ok: false, error: 'nothing to read' }); return; }
  if (text.length > 200000) { res.status(413).json({ ok: false, error: 'that conversation is too long to read in one go' }); return; }

  const lead = b.lead || {};
  const context = [
    `Lead on file: ${lead.name || '(no name)'}${lead.company ? ` at ${lead.company}` : ''}.`,
    `Signed-in user (the salesperson): ${b.me || '(unknown)'}.`,
    `Conversation date: ${b.when || '(not given — assume today and do not resolve relative dates)'}.`,
    b.channel ? `Channel: ${b.channel}.` : '',
    b.signals ? `Speaker labels present, with locally-detected signals:\n${JSON.stringify(b.signals, null, 1)}` : '',
    b.part ? `This is part ${b.part} of ${b.parts} of a long conversation. Summarise THIS part only; the parts are merged afterwards.` : '',
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: SYSTEM,
        messages: [{ role: 'user', content: `${context}\n\n--- CONVERSATION ---\n${text}` }],
      }),
    });
    const j = await r.json();
    if (!r.ok) { res.status(200).json({ ok: false, error: (j.error && j.error.message) || 'api error' }); return; }

    let out = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    out = out.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(out); }
    catch {
      // model wandered off JSON — salvage the first object rather than failing outright
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) { res.status(200).json({ ok: false, error: 'could not read the response' }); return; }
      try { parsed = JSON.parse(m[0]); } catch { res.status(200).json({ ok: false, error: 'could not read the response' }); return; }
    }
    // shape is validated properly on the client (src/lib/convo.js) so the two
    // never drift apart; here we only guarantee it is an object
    res.status(200).json({ ok: true, result: parsed && typeof parsed === 'object' ? parsed : {} });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'error' });
  }
}
