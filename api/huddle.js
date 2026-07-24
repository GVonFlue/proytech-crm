// Monday Morning Huddle — reads a pre-computed digest of last week and writes
// the interpretation: what happened, what it means, what to do about it.
//
// The CRM does all the arithmetic before calling this. We send counts and names,
// never the raw database. That keeps the call small, fast, cheap and private —
// and stops the model doing maths it might get wrong.
//
// Sonnet (not Haiku) on purpose: this is the one place in the app where the job
// is judgement rather than extraction, and it runs once a week, so the cost
// difference is a rounding error.

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }); return; }

  const digest = (req.body && req.body.digest) || null;
  const brand = (req.body && req.body.brand) || 'the business';
  if (!digest) { res.status(400).json({ ok: false, error: 'no digest' }); return; }

  const system = `You write the Monday morning huddle for ${brand}, a small team that sells and delivers websites and AI automation to realtors and lenders.

You are given a JSON digest of LAST WEEK's activity, the week before it for comparison, the current pipeline, month-to-date progress against goals, and a list of things that are slipping.

Your job is interpretation, not recitation. The team can already see the numbers. Tell them what the numbers MEAN.

Rules:
- Be specific. Name real leads, clients and people from the digest. "Chris Waipa has gone 95 days without contact" beats "some relationships need attention".
- Draw conclusions the numbers imply but don't state. Connect cause and effect across sections where it's justified.
- If something got worse, say so plainly. Do not cheerlead. An honest brief is worth more than a nice one.
- If the week was quiet, say that — don't inflate it.
- Projections: use month-to-date pace against the goals given. If no goals are set, project from the weekly run rate. Be explicit that it's a projection.
- Focus items must be concrete enough to act on today, and ordered by what would move revenue most.
- Never invent a number, name or event that is not in the digest.

Return ONLY valid JSON, no markdown fences, no preamble:
{
  "headline": "one sentence, max 15 words, the week in a nutshell",
  "readout": "2-4 sentences interpreting what actually happened and why it matters",
  "wins": ["specific things that went well, max 4, empty array if none"],
  "concerns": ["specific things that are slipping and why they matter, max 4"],
  "focus": [{"title": "short action", "why": "one sentence on the payoff"}],
  "projection": "1-2 sentences on where the month lands if this pace holds"
}
"focus" should have 2-4 items.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1600,
        system,
        messages: [{ role: 'user', content: 'Here is last week:\n\n' + JSON.stringify(digest, null, 1) }],
      }),
    });
    const j = await r.json();
    if (!r.ok) { res.status(200).json({ ok: false, error: (j.error && j.error.message) || 'api error' }); return; }

    let text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let brief;
    try { brief = JSON.parse(text); }
    catch {
      // model wandered off JSON — salvage the first object rather than failing outright
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) { res.status(200).json({ ok: false, error: 'could not read the response' }); return; }
      try { brief = JSON.parse(m[0]); } catch { res.status(200).json({ ok: false, error: 'could not read the response' }); return; }
    }
    const arr = v => Array.isArray(v) ? v : [];
    res.status(200).json({ ok: true, brief: {
      headline: String(brief.headline || ''),
      readout: String(brief.readout || ''),
      wins: arr(brief.wins).map(String).slice(0, 4),
      concerns: arr(brief.concerns).map(String).slice(0, 4),
      focus: arr(brief.focus).filter(f => f && f.title).map(f => ({ title: String(f.title), why: String(f.why || '') })).slice(0, 4),
      projection: String(brief.projection || ''),
    }});
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'error' });
  }
}
