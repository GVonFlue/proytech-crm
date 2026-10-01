// api/coffee-book.js — PUBLIC endpoint for the /coffee page. One call does it all:
//   1. Re-check the window is still free (guards against two people grabbing it).
//   2. Create the event on the connected Google Calendar, inviting the guest.
//   3. Upsert the lead in the CRM:
//        match an existing lead by email -> phone(digits) -> name;
//        if found, attach the coffee as a meeting + keyDate + activity note;
//        if not, create a new lead in the pool with the coffee details.
//   4. Email Garrett + Logan via the existing notify pipe (Resend).
//
// Reuses the CRM's own helpers so there is ONE source of truth for calendar
// auth, the free/busy rule, the lead shape, and email.
//
// Env (already set for the CRM): GOOGLE_* , CALENDAR_IDS, CALENDAR_TZ,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, NOTIFY_FROM, NOTIFY_TO,
//   plus VITE_POOL_NAME (defaults to "ProyTech") to match the app's pool owner.

import { guard, sweep } from './_guard.js';
import { getAccessToken, calendarIds, calendarTz } from './_google.js';
import { SUPA_URL, SUPA_KEY } from './_env.js';
import { createClient } from '@supabase/supabase-js';
import {
  dayWindow, availabilityFor, isBookable, slotAt, slotsForDay, slotWallClock,
} from '../src/lib/availability.js';
import { COFFEE_WINDOWS } from './coffee-availability.js';

const SHOPS = {
  'Mokas Coffee — Delano': 'Mokas Coffee, Delano District, Wichita, KS',
  'Greater Grounds — Old Town': 'Greater Grounds, Old Town, Wichita, KS',
  'Starbucks — Downtown / Douglas': 'Starbucks, Downtown on Douglas, Wichita, KS',
};
const WINDOW_LABEL = { '0900': '9:00–10:00 AM', '1030': '10:30–11:30 AM', '1200': '12:00–1:00 PM' };
const POOL = process.env.VITE_POOL_NAME || process.env.VITE_BRAND_NAME || 'ProyTech';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cors(res, origin) {
  const ok = origin === 'https://www.getproytech.com' || origin === 'https://getproytech.com';
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : 'https://www.getproytech.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const digits = s => String(s || '').replace(/\D/g, '');
const store = () => (SUPA_URL && SUPA_KEY) ? createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } }) : null;

/* Match an existing lead by email, then phone (last 10 digits), then name. */
function findLead(rows, { email, phone, name }) {
  const e = String(email || '').trim().toLowerCase();
  const p = digits(phone).slice(-10);
  const n = String(name || '').trim().toLowerCase();
  for (const r of rows) {
    const d = r.data || {};
    if (e && String(d.email || '').trim().toLowerCase() === e) return r;
  }
  if (p && p.length === 10) for (const r of rows) {
    if (digits((r.data || {}).phone).slice(-10) === p) return r;
  }
  if (n) for (const r of rows) {
    if (String((r.data || {}).name || '').trim().toLowerCase() === n) return r;
  }
  return null;
}

async function sendNotify(appUrl, subject, html) {
  // Reuse the CRM's own notify endpoint (Resend + NOTIFY_TO allow-list).
  try {
    await fetch(appUrl + '/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject, html }),
    });
  } catch (e) { /* fail-soft: a missed email never blocks a booking */ }
}

export default async function handler(req, res) {
  cors(res, req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const gate = await guard(req, res, { name: 'coffee-book', perIp: 10, windowMin: 10, perDay: 300, maxChars: 6000 });
  if (!gate.ok) return;
  sweep();

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const host = String(b.host || 'Garrett').trim() || 'Garrett';
  const date = String(b.date || '').slice(0, 10);
  const slot = String(b.slot || '').trim();           // '0900' | '1030' | '1200'
  const shop = String(b.shop || '').trim();
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const heard = String(b.heard || '').trim();
  const referrer = String(b.referrer || '').trim();

  // ---- validate ----
  const win = COFFEE_WINDOWS.find(w => w.id === slot);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !win) { res.status(400).json({ ok: false, error: 'bad date/slot' }); return; }
  if (!name || digits(phone).length < 10 || !EMAIL.test(email)) { res.status(400).json({ ok: false, error: 'name, phone and a valid email are required' }); return; }
  if (!SHOPS[shop]) { res.status(400).json({ ok: false, error: 'pick a listed coffee shop' }); return; }

  const tz = calendarTz();
  const appUrl = process.env.APP_URL || 'https://proytech-crm.vercel.app';

  try {
    const token = await getAccessToken();
    if (!token) { res.status(200).json({ ok: false, error: 'calendar_not_connected' }); return; }

    // ---- 1. re-check the window is STILL free across all calendars ----
    const { start, end } = dayWindow(date, tz);
    const ids = calendarIds();
    let events = [];
    for (const id of ids) {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`
        + `?singleEvents=true&orderBy=startTime&maxResults=250`
        + `&timeMin=${encodeURIComponent(new Date(start).toISOString())}&timeMax=${encodeURIComponent(new Date(end).toISOString())}`;
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { res.status(200).json({ ok: false, error: 'calendar_read_failed' }); return; }
      const j = await r.json();
      if (Array.isArray(j.items)) events = events.concat(j.items);
    }
    const lattice = availabilityFor(date, events, { tz, now: Date.now() });
    const stillFree = win.slots.every(hhmm => { const s = slotAt(lattice, hhmm); return s && isBookable(s); });
    if (!stillFree) { res.status(200).json({ ok: false, error: 'slot_taken' }); return; }

    // Wall-clock start/end spanning the full 60-min window (first slot start → second slot end).
    const first = slotAt(slotsForDay(date, tz), win.slots[0]);
    const second = slotAt(slotsForDay(date, tz), win.slots[1]);
    const wc = { start: slotWallClock(first, tz).start, end: slotWallClock(second, tz).end, timezone: tz };

    // ---- 2. create the Google Calendar event, inviting the guest ----
    const title = `Coffee: ${name} ×​ ${host} (ProyTech)`;
    const noteLines = [
      `Coffee booked via getproytech.com/coffee`,
      `Guest: ${name} · ${phone} · ${email}`,
      `Host: ${host}`,
      `Where: ${SHOPS[shop]}`,
      heard ? `Heard about us: ${heard}${heard === 'intro' && referrer ? ' — ' + referrer : (referrer ? ' — ' + referrer : '')}` : '',
    ].filter(Boolean);
    const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const evResp = await fetch(`${CAL}?sendUpdates=all`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        description: noteLines.join('\n'),
        location: SHOPS[shop],
        start: { dateTime: wc.start, timeZone: tz },
        end: { dateTime: wc.end, timeZone: tz },
        attendees: [{ email }],
      }),
    });
    const ev = await evResp.json();
    if (!evResp.ok) { res.status(200).json({ ok: false, error: (ev.error && ev.error.message) || 'calendar create failed' }); return; }
    const eventId = ev.id || '';
    const htmlLink = ev.htmlLink || '';

    // ---- 3. upsert the lead in the CRM ----
    const sb = store();
    let crmResult = 'skipped';
    if (sb) {
      const nowISO = new Date().toISOString();
      const whenLabel = `${date} · ${WINDOW_LABEL[slot]}`;
      const srcLine = heard ? (heard === 'intro' && referrer ? `Intro from ${referrer}` : heard) : 'Coffee page';
      const meetingText = `Coffee booked — ${whenLabel} at ${SHOPS[shop]} (host: ${host})`;
      const detailNote =
        `Booked a coffee via getproytech.com/coffee.\n`
        + `When: ${whenLabel}\nWhere: ${SHOPS[shop]}\nHost: ${host}\n`
        + `Phone: ${phone}\nEmail: ${email}\n`
        + (heard ? `How they heard: ${heard}${referrer ? ' (' + referrer + ')' : ''}\n` : '')
        + (htmlLink ? `Calendar: ${htmlLink}` : '');

      const meeting = {
        id: uid(), mtype: 'Coffee', title: `Coffee with ${name}`,
        start: wc.start, end: wc.end, location: SHOPS[shop],
        status: 'scheduled', eventId, host, createdAt: nowISO,
      };
      const keyDate = { id: uid(), label: `Coffee with ${name}`, date, lead: 2, annual: false };
      const bookedAct = { id: uid(), ts: nowISO, type: 'Meeting', meetingId: meeting.id, text: meetingText };
      const noteAct = { id: uid(), ts: nowISO, type: 'Note', text: detailNote };

      // read all leads (service role bypasses RLS)
      let rows = [];
      try {
        const { data } = await sb.from('leads').select('id,data,owner_id,pool');
        rows = data || [];
      } catch (e) { rows = []; }

      const existing = findLead(rows, { email, phone, name });

      if (existing) {
        const d = existing.data || {};
        const merged = {
          ...d,
          id: existing.id,
          phone: d.phone || phone,
          email: d.email || email,
          meetings: [...(d.meetings || []), meeting],
          keyDates: [...(d.keyDates || []), keyDate],
          activities: [bookedAct, noteAct, ...(d.activities || [])],
          nextAction: 'Coffee meeting',
        };
        try {
          await sb.from('leads').upsert({ id: existing.id, data: merged, owner_id: existing.owner_id || null, pool: existing.pool || null });
          crmResult = 'attached';
        } catch (e) { crmResult = 'error'; }
      } else {
        const id = uid();
        const lead = {
          id, name, company: '', businessType: '—', phone, email, website: '',
          stage: 'new', priority: 'medium', source: srcLine,
          nextAction: 'Coffee meeting', nextSteps: '', followUp: '', expectedClose: '',
          serviceInterest: [], owner: POOL, dealValue: 0, retainer: 0,
          potentialSponsor: false, pastSponsor: false, sponsorTier: '', sponsorAmount: 0,
          labels: ['Coffee'], keyDates: [keyDate],
          isRelationship: false, introducedBy: (heard === 'intro' ? referrer : ''), relNote: '', relTier: '',
          retainerActive: false, retainerStart: '', closedAt: '', closedDeals: [], custom: {},
          createdAt: nowISO,
          meetings: [meeting],
          activities: [bookedAct, noteAct, { id: uid(), ts: nowISO, type: 'Note', text: 'Lead created from coffee booking.' }],
        };
        try {
          // owner===POOL makes owner_id null -> shows unclaimed in the Pool for both of you
          await sb.from('leads').upsert({ id, data: { ...lead, id }, owner_id: null, pool: null });
          crmResult = 'created';
        } catch (e) { crmResult = 'error'; }
      }
    }

    // ---- 4. email Garrett + Logan ----
    const esc = s => String(s).replace(/</g, '&lt;');
    const html =
      `<h2>New coffee booked ☕</h2>`
      + `<p><b>${esc(name)}</b> booked a coffee with <b>${esc(host)}</b>.</p>`
      + `<ul>`
      + `<li><b>When:</b> ${esc(date)} · ${esc(WINDOW_LABEL[slot])}</li>`
      + `<li><b>Where:</b> ${esc(SHOPS[shop])}</li>`
      + `<li><b>Phone:</b> ${esc(phone)}</li>`
      + `<li><b>Email:</b> ${esc(email)}</li>`
      + (heard ? `<li><b>Heard:</b> ${esc(heard)}${referrer ? ' — ' + esc(referrer) : ''}</li>` : '')
      + `<li><b>CRM:</b> ${crmResult === 'attached' ? 'attached to existing lead' : crmResult === 'created' ? 'new lead created' : crmResult}</li>`
      + `</ul>`
      + (htmlLink ? `<p><a href="${htmlLink}">View on Google Calendar</a></p>` : '');
    await sendNotify(appUrl, `Coffee booked: ${name} × ${host}`, html);

    res.status(200).json({ ok: true, crm: crmResult, eventId });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'error' });
  }
}
