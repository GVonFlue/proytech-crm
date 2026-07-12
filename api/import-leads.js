// Vercel serverless function — figures out how a messy CSV's columns map to CRM lead fields.
// It maps columns ONCE from the header + a few sample rows; the browser then applies that map to
// every row (so a 500-row import is still a single cheap AI call). Requires ANTHROPIC_API_KEY.

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: false, error: 'AI not configured' }); return; }

  try {
    const { headers, samples } = req.body || {};
    if (!Array.isArray(headers) || !headers.length) { res.status(400).json({ error: 'No headers' }); return; }

    const prompt =
      'You are importing a contact list into a CRM. Map each CSV column to the correct CRM field.\n' +
      'Valid CRM fields: name, company, phone, email, website, businessType, source, note. ' +
      'Use "ignore" for columns that do not fit any field.\n' +
      'CSV columns: ' + JSON.stringify(headers) + '\n' +
      'Sample rows (arrays aligned to the columns): ' + JSON.stringify((samples || []).slice(0, 6)) + '\n' +
      'Respond with ONLY minified JSON, no markdown: an object whose keys are the exact CSV column names ' +
      'and whose values are one of the CRM fields or "ignore". Every column must appear exactly once. ' +
      'If two columns look like a first name and last name, map both to "name" (the app will join them).';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) { const t = await r.text(); res.status(200).json({ ok: false, error: 'AI request failed', detail: t.slice(0, 300) }); return; }
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g, '').trim();
    let mapping = null;
    try { mapping = JSON.parse(text); } catch { mapping = null; }
    if (!mapping || typeof mapping !== 'object') { res.status(200).json({ ok: false, error: 'Could not parse AI output' }); return; }
    res.status(200).json({ ok: true, mapping });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
