// Vercel serverless function — ranks the open task list with Claude.
// Requires env var ANTHROPIC_API_KEY (already set in Vercel for parse-receipt.js).
// The key NEVER reaches the browser; it only lives here on the server.

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'AI not configured' }); return; }

  try {
    const { tasks, context } = req.body || {};
    if (!Array.isArray(tasks) || !tasks.length) { res.status(200).json({ ok: false, error: 'No tasks provided' }); return; }

    const list = tasks.map(t => ({
      id: t.id,
      title: t.title || '',
      notes: t.notes || '',
      owner: t.owner || 'Both',
      lead: t.lead || '',
      due: t.due || '',
      revenue: Number(t.revenue) || 3,
      urgency: Number(t.urgency) || 3,
      effort: Number(t.effort) || 3,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const prompt =
      'You are the operating chief of staff for ProyTech, a two-person web design + AI automation agency in Wichita. '
      + 'Right now the mission is to collect $10,000 in CASH within 3 weeks. Rank the open tasks from most to least important to that goal.\n\n'
      + 'Scoring rules:\n'
      + '- Core score = revenue impact (1-5) times urgency (1-5).\n'
      + '- Break ties by effort: lower effort (faster cash) ranks higher.\n'
      + '- Sprint weighting: a task tied to a specific lead/deal or to collecting money outranks internal or admin work.\n'
      + '- A task whose due date is near or already past (today is ' + today + ') jumps up.\n'
      + (context ? ('- Extra context: ' + context + '\n') : '')
      + '\nTasks (JSON):\n' + JSON.stringify(list)
      + '\n\nRespond with ONLY minified JSON, no markdown, no prose: {"ranking":[{"id":string,"reason":string}]} ordered best-first. '
      + 'reason is a punchy 4-9 word explanation of why it ranks there. Include every task id exactly once.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] }),
    });
    if (!r.ok) { const t = await r.text(); res.status(200).json({ ok: false, error: 'AI request failed', detail: t.slice(0, 300) }); return; }
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g, '').trim();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (!parsed || !Array.isArray(parsed.ranking)) { res.status(200).json({ ok: false, error: 'Could not parse AI output' }); return; }
    res.status(200).json({ ok: true, ranking: parsed.ranking });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
