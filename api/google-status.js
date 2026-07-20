// Tells the app whether a Google account is connected, and which one.
import { loadGoogle } from './_google.js';

export default async function handler(req, res) {
  try {
    const g = await loadGoogle();
    res.status(200).json({ connected: !!(g && g.refresh_token), email: (g && g.email) || '' });
  } catch (e) {
    res.status(200).json({ connected: false, email: '', error: e.message });
  }
}
