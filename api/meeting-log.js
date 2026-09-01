import { guard, sweep } from '@getproytech/core/guard';
// Meeting Log — turns a raw team-meeting transcript into structured JSON.
//
// This is the one place in the app that reads a raw transcript. Everything
// downstream (the meeting page, the huddle digest, the task list) reads the
// EXTRACTION, never the transcript. A transcript is ~5,000 tokens of filler
// with maybe 1,200 tokens of signal in it; feeding the raw thing to anything
// else would make every later call slower, dearer and worse.
//
// Sonnet, not Haiku, and for the same reason as huddle.js: this is judgement,
// not extraction. Deciding that "we need an LLC" is a blocking dependency of
// "hire a commission rep" is exactly the kind of call Haiku fumbles. It runs
// once a week, so the cost difference is a rounding error — about six cents.
//
// Requires env var ANTHROPIC_API_KEY. The key never reaches the browser.

export default async function handler(req, res) {
  // Signed-in users only, plus per-IP and a global daily ceiling. These
  // endpoints cost money, so an open one is a direct line to the card.
  // 260k of body, because the transcript alone is allowed to be 200k and the
  // JSON envelope around it (brand, team, attendees, prior open items) is not
  // free. perDay 50, not 900: this is the dearest call in the app by an order
  // of magnitude — a 200k transcript through Sonnet is real money — and it is
  // used a handful of times a week. A cap of 900 on a weekly endpoint is not a
  // cap, it is a number that would only ever be reached by something going
  // wrong.
  const gate = await guard(req, res, {
    name: 'meeting-log', perIp: 30, perDay: 50, maxChars: 260000, requireAuth: true, module: 'mlog',
  });
  if (!gate.ok) return;
  sweep();

  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }); return; }

  const b = req.body || {};
  const transcript = String(b.transcript || '').trim();
  const brand = String(b.brand || 'the business');
  const team = Array.isArray(b.team) && b.team.length ? b.team : ['Garrett', 'Logan'];
  const meetingDate = String(b.meetingDate || '').slice(0, 10);
  // 'internal' (the Sunday team meeting) or 'client' (a meeting with a lead).
  // Same output schema either way — only the reading instructions differ, so
  // every consumer downstream stays exactly as it was.
  const kind = String(b.kind || '') === 'client' ? 'client' : 'internal';
  const leadName = String(b.leadName || '').trim().slice(0, 120);
  // Open items carried in from the last meeting, so the model can score them.
  // Phase 1 sends an empty array; the wiring is here so Phase 2 is a one-line
  // change on the client rather than a rewrite of this prompt.
  const prior = Array.isArray(b.priorOpen) ? b.priorOpen.slice(0, 40) : [];

  if (transcript.length < 200) { res.status(200).json({ ok: false, error: 'That transcript is too short to be worth reading.' }); return; }
  // ~200k characters is roughly 50k tokens — a long client call transcribed
  // with every "um" in it, which is what a real machine transcript of a ninety
  // minute meeting looks like. Past that, refuse loudly rather than silently
  // truncating and losing the end, which is where the action items always are.
  if (transcript.length > 200000) { res.status(200).json({ ok: false, error: 'That transcript is too long. Split it into two meetings.' }); return; }

  // ---- shared tail: the output contract, identical for both kinds ---------
  const SCHEMA = `Return ONLY valid JSON. No markdown fences, no preamble, no commentary:
{
  "title": "short name for this meeting, max 8 words",
  "headline": "one sentence, max 18 words: the single most important thing about this meeting",
  "summary": "3-5 sentences on what this meeting was actually about and what changed",
  "themes": [{"title": "short heading", "body": "2-5 sentences. Explain the thinking, not just the topic."}],
  "decisions": [{"decision": "what was decided or raised", "status": "made" | "open", "detail": "one or two sentences of context", "options": ["A. ...", "B. ..."]}],
  "actions": [{"title": "short imperative task", "owner": "name or Both", "why": "one sentence on the payoff", "due": "YYYY-MM-DD or empty", "revenue": 1-5, "urgency": 1-5, "effort": 1-5, "tier": "now" | "soon" | "later"}],
  "numbers": [{"label": "what it is", "value": "as stated", "note": "context, or empty"}],
  "risks": ["specific risks, named or unnoticed. Empty array if none."],
  "openItems": [{"key": "short-stable-slug", "title": "the thing still outstanding"}],
  "loopReview": [{"key": "the key from the list above", "verdict": "closed" | "open" | "abandoned", "note": "one sentence of evidence from this transcript"}]
}`;

  // ---- client-only tail: the seven fields that accumulate on a person -----
  // These are the part still worth reading in six months. The summary answers
  // "what happened in that meeting"; these answer "who is this person and what
  // do they need", which is the question actually being asked when someone
  // opens a lead before a call.
  //
  // The split at the bottom is load-bearing. Four of the seven can be offered
  // to a rep as a starting draft; three are the owner's private read and must
  // not be. Saying so IN THE PROMPT matters as much as enforcing it in the UI:
  // a field written knowing a rep may read it gets written in a register that
  // survives being read by a rep. See shareSeed() in src/lib/meetinglog.js.
  const CLIENT_FIELDS = `Alongside the fields above, a client meeting carries seven more. Give these
more care than the summary — they are what gets read back before the next call:
{
  "wants": [{"want": "what they are actually trying to fix, in their words — not the product they named", "quote": "the closest thing to their own words the transcript supports, or empty"}],
  "objections": [{"objection": "the hesitation in one line", "detail": "what was actually said, and what they went quiet about"}],
  "budget": {"stated": "a figure or range they said out loud, or empty", "paying": "what they pay for this today, or empty", "note": "one sentence of context, or empty"},
  "commitments": [{"side": "us" | "client", "what": "the specific thing that was promised", "due": "YYYY-MM-DD or empty"}],
  "people": [{"name": "as said", "role": "their part in this, or empty", "influence": "decides" | "influences" | "unknown"}],
  "temperature": {"read": "warm" | "neutral" | "cool", "why": "one sentence of evidence from THIS transcript"},
  "nextStep": {"what": "the next thing that happens on this deal", "who": "who moves first", "when": "YYYY-MM-DD, or plain words if it was only vaguely agreed, or empty"}
}

FIELD RULES:
- "wants": 1-6. Their problem, in their register. If they said "I'm drowning in spreadsheets", that is the want; "wants a CRM" is you paraphrasing away the only bit worth keeping.
- "objections": every hesitation, including the ones they did not finish saying. Silence after a price is an objection. Empty array if there genuinely were none — do not manufacture one.
- "budget": only what was said out loud. Never infer a budget from what ${brand} quoted, and never from what they "seem" able to afford.
- "commitments": both directions, and "side" must be exactly "us" or "client". An unowned commitment is how a deal dies quietly.
- "people": only people actually named or clearly referred to. "influence" is "decides" only if the transcript shows they decide.
- "temperature": your honest read, with evidence from this transcript. If it was a bad meeting, say cool. This field exists to stop a record making a dead deal look alive six months on.
- "nextStep": what happens next on this deal, singular. If nothing was agreed, leave all three empty rather than inventing a plausible one.

WHO READS WHICH:
- "wants", "commitments", "people" and "nextStep" may be offered to the rep who owns this lead. Write them so they read correctly to someone who was not on the call: no shorthand, no in-jokes, no read on the person.
- "objections", "budget" and "temperature" are for the owner alone. Write those candidly and do not soften them to be safe for sharing — nothing is shared without a human deciding to.`;

  // ---- client meeting -----------------------------------------------------
  // A different question entirely. The internal prompt hunts for decisions the
  // team is avoiding; this one is building a durable read on ONE person, which
  // accumulates on their lead record over months. Same base schema, so the
  // meeting page, the task acceptance flow and normLog all work unchanged.
  const clientSystem = `You read the transcript of a sales or client meeting between ${brand} and ${leadName || 'a client'} and turn it into structured data. ${brand} builds websites, CRMs and AI automation for realtors, lenders and local service businesses in Wichita, Kansas. The ${brand} people on the call are ${team.join(' and ')}; everyone else is the client side.

These transcripts are machine transcriptions. They are messy: no speaker labels, mangled names, dropped words, and small talk at both ends. Read past it.

This extraction is not a meeting record that gets read once. It is added to what ${brand} knows about this person, and it will be read back months later before the next conversation. Write it for that reader.

WHAT MATTERS, in order. Each of these has a field of its own below, and the field is where the detail belongs — the summary is not the place to bury it:
1. What they actually want, in their words — the problem they described, not the product they asked for.  -> "wants"
2. Objections, hesitations and the things they went quiet about. A stated objection is worth more than a stated interest.  -> "objections"
3. Money — budget, what they are paying now, what they said a solution is worth. Only if stated.  -> "budget"
4. Commitments made in BOTH directions: what ${brand} promised, and what the client agreed to.  -> "commitments"
5. Who else is involved and who actually decides.  -> "people"
6. Whether this deal is warm or cooling, and what in the transcript tells you.  -> "temperature"
7. The single next thing that happens.  -> "nextStep"
Anything else contextual that would make the next conversation better — their business, their pressures — belongs in "themes".

RULES:
- Never invent a name, number, date or commitment. If the transcript does not contain it, leave it out.
- Distinguish what the CLIENT said from what ${brand} said. Attribute clearly in the detail text — getting this backwards makes the record actively misleading later.
- Transcription mangles proper nouns. Correct an obviously garbled name silently; keep a genuinely ambiguous one as said.
- Do not soften and do not sell. If they sound unconvinced, say they sound unconvinced. An optimistic record of a bad meeting is worse than no record.
- Small talk that reveals something usable about them belongs in themes. Pure pleasantries do not appear anywhere.
- "actions" are what ${brand} must do next. Owners must be one of: ${team.join(', ')}, or "Both".
- Dates must be YYYY-MM-DD or an empty string. Never guess. The meeting was ${meetingDate || 'recently'}.
- Score revenue (1-5, how directly it produces cash), urgency (1-5) and effort (1-5) on each action. Be discriminating.
- "tier": "now" (this week, the deal cools without it), "soon" (next two weeks), "later".
- "decisions" here means what was agreed or left hanging with the client. "risks" means what could lose this deal. "openItems" is every unresolved thread, keyed so the same thread keeps its key next time.
- Return an empty loopReview array.

${SCHEMA}

${CLIENT_FIELDS}

"themes" 2-6 items. "decisions" 0-8. "actions" 1-10. "options" only for decisions with status "open", otherwise an empty array.`;

  const internalSystem = `You read the transcript of an internal team meeting at ${brand} and turn it into structured data. The team is ${team.join(' and ')}. ${brand} builds websites, CRMs and AI automation for realtors, lenders and local service businesses in Wichita, Kansas.

These transcripts are machine transcriptions of voice recordings. They are messy: no speaker labels, mangled names, dropped words, dead ends, and long stretches of personal chat that have nothing to do with the business. Read past all of it. Your job is to find the signal.

WHAT MATTERS, in order:
1. Decisions that were actually made, and decisions that were raised and left open. An open decision is worth more than a made one, because it is still costing them.
2. Concrete commitments — who said they would do what, by when.
3. Money — deals, amounts, deposits, expenses, targets. Only if the transcript states them.
4. Ideas about how the business should work, especially ones that would remove a bottleneck.
5. Risks the team named or walked straight past without noticing.

RULES:
- Never invent a name, number, date or commitment. If the transcript does not contain it, leave it out. A short honest extraction is worth far more than a padded one.
- Transcription mangles proper nouns. If a name is clearly garbled but obvious from context, correct it silently. If it is genuinely ambiguous, keep what was said.
- Personal chat, jokes, insults between the two of them, and anything about cars, TVs, watches or motorcycles: ignore entirely. It is not business content and it should not appear anywhere in your output.
- Do not soften. If the transcript shows them avoiding something, say so.
- Owners must be one of: ${team.join(', ')}, or "Both". Never assign work to someone who is not on the team.
- Dates must be YYYY-MM-DD or an empty string. Never guess a date. The meeting was ${meetingDate || 'recently'}.
- For every action, score revenue (1-5, how directly it produces cash), urgency (1-5) and effort (1-5, where 5 is the most work). These feed an existing ranking system, so be discriminating: not everything is a 5.
- "tier" is your call on when it must happen: "now" (this week, revenue or bleeding), "soon" (next two weeks, structural), or "later" (this month, leverage).

${prior.length ? `OPEN ITEMS FROM LAST MEETING. For each, decide from THIS transcript whether it was closed, is still open, or was quietly dropped without anyone saying so. "abandoned" is the important verdict — it is the one nobody notices.\n${JSON.stringify(prior)}` : 'There are no open items from a previous meeting. Return an empty loopReview array.'}

${SCHEMA}

"themes" 2-6 items. "decisions" 0-8. "actions" 3-15. "options" only for decisions with status "open", otherwise an empty array. "openItems" is every action and open decision that is not finished at the end of this meeting — this is what next week's meeting gets scored against, so give each one a lowercase-hyphenated key that would stay the same if the same item came up again.`;

  const system = kind === 'client' ? clientSystem : internalSystem;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system,
        messages: [{ role: 'user', content: 'Transcript follows.\n\n' + transcript }],
      }),
    });
    const j = await r.json();
    if (!r.ok) { res.status(200).json({ ok: false, error: (j.error && j.error.message) || 'api error' }); return; }

    let text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let out;
    try { out = JSON.parse(text); }
    catch {
      // Same salvage as huddle.js: the model occasionally wraps the object in a
      // sentence. Take the first balanced-looking object rather than failing.
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) { res.status(200).json({ ok: false, error: 'Could not read the response.' }); return; }
      try { out = JSON.parse(m[0]); } catch { res.status(200).json({ ok: false, error: 'Could not read the response.' }); return; }
    }

    // Coerce everything. The UI must never have to defend against a missing
    // field, and a bad score must never poison the task ranker.
    const S = v => String(v == null ? '' : v);
    const A = v => (Array.isArray(v) ? v : []);
    const N = (v, d) => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : d; };
    const OWNERS = team.concat('Both');
    const own = v => { const s = S(v).trim(); return OWNERS.find(o => o.toLowerCase() === s.toLowerCase()) || 'Both'; };
    const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(S(v)) ? S(v) : '');
    const tier = v => (['now', 'soon', 'later'].includes(S(v).toLowerCase()) ? S(v).toLowerCase() : 'soon');
    const slug = v => S(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const O = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    // "us" or "client", never anything else: shareSeed() renders the two sides
    // as different sentences, and a third value would silently render as one
    // of them. Default to "us" — a commitment we did not actually make is a
    // smaller failure than one of ours going unrecorded.
    const side = v => (S(v).toLowerCase() === 'client' ? 'client' : 'us');
    const influence = v => { const x = S(v).toLowerCase(); return ['decides', 'influences', 'unknown'].includes(x) ? x : 'unknown'; };
    // Empty, not "neutral", when the model says nothing. "neutral" is a read;
    // absence is not, and the UI has to be able to tell them apart rather than
    // showing an opinion nobody formed.
    const readOf = v => { const x = S(v).toLowerCase(); return ['warm', 'neutral', 'cool'].includes(x) ? x : ''; };
    // A date if it is one, otherwise the words as said ("after the holidays").
    // Forcing this through date() would throw away the only thing there was.
    const when = v => (/^\d{4}-\d{2}-\d{2}$/.test(S(v)) ? S(v) : S(v).slice(0, 60));
    const budget = O(out.budget), temperature = O(out.temperature), nextStep = O(out.nextStep);

    res.status(200).json({
      ok: true,
      extraction: {
        title: S(out.title).slice(0, 90),
        headline: S(out.headline).slice(0, 220),
        summary: S(out.summary),
        themes: A(out.themes).filter(t => t && t.title).map(t => ({ title: S(t.title), body: S(t.body) })).slice(0, 6),
        decisions: A(out.decisions).filter(d => d && d.decision).map(d => ({
          decision: S(d.decision), status: S(d.status) === 'made' ? 'made' : 'open',
          detail: S(d.detail), options: A(d.options).map(S).slice(0, 5),
        })).slice(0, 8),
        actions: A(out.actions).filter(a => a && a.title).map(a => ({
          title: S(a.title).slice(0, 160), owner: own(a.owner), why: S(a.why), due: date(a.due),
          revenue: N(a.revenue, 3), urgency: N(a.urgency, 3), effort: N(a.effort, 3), tier: tier(a.tier),
        })).slice(0, 15),
        numbers: A(out.numbers).filter(n => n && n.label).map(n => ({ label: S(n.label), value: S(n.value), note: S(n.note) })).slice(0, 12),
        risks: A(out.risks).map(S).filter(Boolean).slice(0, 8),
        openItems: A(out.openItems).filter(o => o && o.title).map(o => ({ key: slug(o.key || o.title), title: S(o.title) })).slice(0, 25),
        loopReview: A(out.loopReview).filter(l => l && l.key).map(l => ({
          key: slug(l.key), verdict: ['closed', 'open', 'abandoned'].includes(S(l.verdict)) ? S(l.verdict) : 'open', note: S(l.note),
        })).slice(0, 40),
        // The seven client fields. An internal meeting is never asked for them,
        // so they coerce to empty and every consumer reads them the same way
        // for both kinds rather than branching on kind.
        wants: A(out.wants).filter(w => w && w.want).map(w => ({ want: S(w.want), quote: S(w.quote) })).slice(0, 6),
        objections: A(out.objections).filter(o => o && o.objection).map(o => ({ objection: S(o.objection), detail: S(o.detail) })).slice(0, 8),
        budget: { stated: S(budget.stated), paying: S(budget.paying), note: S(budget.note) },
        commitments: A(out.commitments).filter(c => c && c.what).map(c => ({ side: side(c.side), what: S(c.what), due: date(c.due) })).slice(0, 12),
        people: A(out.people).filter(x => x && x.name).map(x => ({ name: S(x.name), role: S(x.role), influence: influence(x.influence) })).slice(0, 10),
        temperature: { read: readOf(temperature.read), why: S(temperature.why) },
        nextStep: { what: S(nextStep.what), who: S(nextStep.who), when: when(nextStep.when) },
      },
      usage: j.usage || null,
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: (e && e.message) || 'error' });
  }
}
