// api/coffee-race.js — PUBLIC, read-only scoreboard for the "Race to 20" on
// getproytech.com/coffee. Counts Coffee meetings marked HELD in the CRM, per
// host, inside the race window. Returns numbers only: no names, no leads, no
// contact details ever leave the server.
// Credit goes to the meeting's booked host (set by /api/coffee-book), falling
// back to whoever clicked "held" (heldBy) for coffees added by hand in the CRM.
// Env (optional): RACE_START=2026-10-03  RACE_END=2026-10-10  RACE_GOAL=20
import { guard, sweep } from './_guard.js';
import { SUPA_URL, SUPA_KEY } from './_env.js';
import { createClient } from '@supabase/supabase-js';

const START = process.env.RACE_START || '2026-10-03';
const END   = process.env.RACE_END   || '2026-10-10';
const GOAL  = Number(process.env.RACE_GOAL || 20);
const RACERS = ['Garrett', 'Logan'];

function cors(res, origin) {
  const ok = origin === 'https://www.getproytech.com' || origin === 'https://getproytech.com';
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : 'https://www.getproytech.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Vary', 'Origin');
}

export function racerFor(m) {
  const who = String(m.host || m.heldBy || '').toLowerCase();
  return RACERS.find(r => who.includes(r.toLowerCase())) || null;
}
export function countRace(leads, start = START, end = END) {
  const counts = Object.fromEntries(RACERS.map(r => [r, 0]));
  for (const row of leads || []) {
    for (const m of ((row && row.data) || {}).meetings || []) {
      if (String(m.mtype || '').toLowerCase() !== 'coffee' || m.status !== 'held') continue;
      const day = String(m.start || m.heldAt || '').slice(0, 10);
      if (!day || day < start || day > end) continue;
      const r = racerFor(m); if (r) counts[r]++;
    }
  }
  return counts;
}

export default async function handler(req, res) {
  cors(res, req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ ok: false }); return; }
  const gate = await guard(req, res, { name: 'coffee-race', perIp: 120, windowMin: 10, perDay: 5000 });
  if (!gate.ok) return;
  sweep();
  if (!SUPA_URL || !SUPA_KEY) { res.status(200).json({ ok: false, error: 'not_configured' }); return; }
  try {
    const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from('leads').select('data');
    if (error) throw error;
    const counts = countRace(data);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ ok: true, start: START, end: END, goal: GOAL, counts, updated: new Date().toISOString() });
  } catch (e) {
    console.error('coffee-race', e);
    res.status(200).json({ ok: false, error: 'read_failed' });
  }
}
