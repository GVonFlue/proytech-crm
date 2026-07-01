// Vercel serverless function — reads a receipt (PDF or image) with Claude and returns structured fields.
// Requires env var ANTHROPIC_API_KEY (set in Vercel → Project → Settings → Environment Variables).
// The key NEVER reaches the browser; it only lives here on the server.

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'AI not configured' }); return; }

  try {
    const { file, mime } = req.body || {};
    if (!file) { res.status(400).json({ error: 'No file provided' }); return; }

    const isPdf = (mime || '').includes('pdf');
    const block = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } }
      : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: file } };

    const prompt = 'You are reading a business expense receipt. Extract the details and respond with ONLY minified JSON, no markdown, no prose: '
      + '{"vendor":string,"date":"YYYY-MM-DD","total":number,"tax":number,"category":string,"summary":string}. '
      + 'category must be one of: Software, Advertising, Office, Meals, Travel, Contractors, Fees, Equipment, Other. '
      + 'total is the final amount paid as a number (no currency symbol). If a field is unknown, use "" for strings and 0 for numbers. summary is a 3-6 word description of what was purchased.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] }),
    });
    if (!r.ok) { const t = await r.text(); res.status(200).json({ ok: false, error: 'AI request failed', detail: t.slice(0, 300) }); return; }
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g, '').trim();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (!parsed) { res.status(200).json({ ok: false, error: 'Could not parse AI output' }); return; }
    res.status(200).json({ ok: true, fields: parsed });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
