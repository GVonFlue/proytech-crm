// Reads a Google Sheet tab through the account already connected for Calendar.
// Read-only, and only sheets that account can open — no extra credentials, no
// published-to-web URL, so a guest list full of emails and phone numbers never
// becomes a public document.
import { getAccessToken } from './_google.js';

// Accepts a full Sheets URL or a bare id.
export function sheetIdFrom(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : (/^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { sheet, tab } = req.body || {};
    const id = sheetIdFrom(sheet);
    if (!id) return res.status(400).json({ error: 'That does not look like a Google Sheet link.' });

    const token = await getAccessToken();
    if (!token) return res.status(400).json({ error: 'Google is not connected. Settings → Google Calendar.' });

    // No tab named: read the first one rather than guessing at "Sheet1", which
    // is wrong the moment anybody renames it.
    let range = tab && String(tab).trim();
    if (!range) {
      const meta = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`,
        { headers: { Authorization: `Bearer ${token}` } });
      const mj = await meta.json();
      if (!meta.ok) {
        const msg = (mj.error && mj.error.message) || 'Could not open that sheet.';
        // 403 with a good token almost always means the scope was added after
        // the grant. Say so instead of "permission denied".
        const hint = meta.status === 403
          ? ' Reconnect Google under Settings — the sheet permission is new.'
          : meta.status === 404 ? ' Check the link, and that this Google account can open it.' : '';
        return res.status(meta.status).json({ error: msg + hint });
      }
      range = ((mj.sheets || [])[0] || {}).properties?.title || 'Sheet1';
    }

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}` +
      `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: (j.error && j.error.message) || 'Sheet read failed.' });

    const rows = j.values || [];
    if (!rows.length) return res.status(200).json({ headers: [], rows: [], tab: range });

    const headers = (rows[0] || []).map(h => String(h == null ? '' : h).trim());
    // Ragged rows are normal in Sheets — a short row means trailing blanks, not
    // a malformed record, so pad rather than drop.
    const body = rows.slice(1)
      .map(r2 => headers.map((_, i) => String(r2[i] == null ? '' : r2[i]).trim()))
      .filter(r2 => r2.some(v => v !== ''));

    res.status(200).json({ headers, rows: body, tab: range });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Sheet read failed.' });
  }
}
