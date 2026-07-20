// Forgets the stored Google connection.
import { clearGoogle } from './_google.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try { await clearGoogle(); res.status(200).json({ ok: true }); }
  catch (e) { res.status(200).json({ ok: false, error: e.message }); }
}
