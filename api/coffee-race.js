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
import { calendarTz } from './_google.js';
import { wallParts } from '../src/lib/availability.js';

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
/* The day a meeting happened, in the CALENDAR's zone — not by slicing the
   string. A stamp with an offset or Z is an instant: 7:30 PM Central on Sat
   Oct 10 is '2026-10-11T00:30:00.000Z', and slicing that credited it to Oct 11,
   outside the race. A stamp WITHOUT an offset is already calendar wall clock
   (coffee-book writes 'YYYY-MM-DDTHH:MM:SS' in calendarTz()), so its date is
   its own first ten characters, whatever zone this server runs in. */
const ZONED = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i;
const pad2 = n => String(n).padStart(2, '0');
export function meetingDay(m, tz = calendarTz()) {
  const raw = String((m && (m.start || m.heldAt)) || '').trim();
  if (ZONED.test(raw)) {
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) return '';
    const w = wallParts(ts, tz);
    return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
}

export function countRace(leads, start = START, end = END, tz = calendarTz()) {
  const counts = Object.fromEntries(RACERS.map(r => [r, 0]));
  for (const row of leads || []) {
    for (const m of ((row && row.data) || {}).meetings || []) {
      if (String(m.mtype || '').toLowerCase() !== 'coffee' || m.status !== 'held') continue;
      const day = meetingDay(m, tz);
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
