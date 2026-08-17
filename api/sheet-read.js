import { guard, sweep } from './_guard.js';
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

// Google's own errors are long and bury the actionable part at the end. Turn
// the two failures that actually happen into a short instruction plus a link,
// and keep Google's text as a secondary detail rather than the headline.
function explain(status, body) {
  const raw = (body && body.error && body.error.message) || '';
  // "API has not been used in project N before or it is disabled" — the Sheets
  // API is off in Google Cloud. Nothing in this app can fix that.
  const proj = raw.match(/project (\d+)/);
  if (/has not been used in project|is disabled/i.test(raw)) {
    return {
      error: 'The Google Sheets API is switched off for this project.',
      fix: 'Enable it in Google Cloud, wait about two minutes, then reconnect Google under Settings.',
      link: proj
        ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${proj[1]}`
        : 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview',
      detail: raw,
    };
  }
  // A token issued before spreadsheets.readonly existed still looks valid and
  // still returns 403, which is why this needs saying explicitly.
  if (status === 403) return {
    error: 'This Google connection cannot read Sheets yet.',
    fix: 'Reconnect Google under Settings → Google Calendar. The sheet permission was added after you connected.',
    detail: raw,
  };
  if (status === 404) return {
    error: 'That sheet could not be opened.',
    fix: 'Check the link, and that the connected Google account has access to it.',
    detail: raw,
  };
  return { error: raw || 'Sheet read failed.' };
}

export default async function handler(req, res) {
  // Signed-in users only, plus per-IP and a global daily ceiling. These
  // endpoints cost money, so an open one is a direct line to the card.
  const gate = await guard(req, res, { name: 'sheet-read', perIp: 40, perDay: 1500, requireAuth: true });
  if (!gate.ok) return;
  sweep();

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
      if (!meta.ok) return res.status(meta.status).json(explain(meta.status, mj));
      range = ((mj.sheets || [])[0] || {}).properties?.title || 'Sheet1';
    }

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}` +
      `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json(explain(r.status, j));

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
