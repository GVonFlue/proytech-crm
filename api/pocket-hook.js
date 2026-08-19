import { createHmac, timingSafeEqual } from 'node:crypto';
import { guard, sweep } from './_guard.js';
import { RAW_MAX, str, patchFrom, recordingIdOf, upsertMerge, markDeleted } from './_pocket.js';

// api/pocket-hook.js — Pocket AI posts every recording here.
//
// THIS IS THE ONLY ENDPOINT IN THE CRM WITH NO USER SESSION.
//
//   Pocket is the caller, not a browser, so there is nothing to authenticate a
//   session against. The HMAC signature IS the authentication. Everything below
//   follows from that one fact:
//
//   * bodyParser is OFF, because the signature covers the RAW BYTES. Parsing
//     first and re-serialising produces different bytes and a signature that
//     never matches — key order and whitespace are not preserved by a round
//     trip through JSON.parse.
//   * No secret configured means 503 and nothing stored. It must NEVER fall
//     back to trusting the caller: a missing env var would otherwise turn this
//     into an open write endpoint into the CRM.
//   * The signature is checked BEFORE guard(). guard() costs two Supabase round
//     trips; verification is pure CPU and rejects a forgery in microseconds.
//     Spending database calls on forged traffic is how a rate limiter becomes
//     the denial of service. guard() is still here — it bounds a validly signed
//     flood, which is what matters if the secret ever leaks.
//
// WRITES BYPASS RLS, ON PURPOSE
//
//   This writes pocket_recordings with SUPABASE_SERVICE_KEY, the same key
//   _guard.js already uses for api_hits. RLS governs the browser and cannot
//   govern a caller with no session; VERIFY-RLS.md §7 proves the browser side
//   and says so explicitly.
//
// DELIVERY IS AT-LEAST-ONCE
//
//   Pocket retries 3 times with 1s–30s backoff and guarantees at-least-once.
//   So the same recording arrives repeatedly, and several DIFFERENT events
//   (transcription.completed, then summary.completed) each describe the same
//   one. Pocket's recording id is the primary key, which makes "do not store
//   this twice" a database constraint rather than application logic, and every
//   write below is a MERGE that can be replayed without damage.
//
// STATUS CODES ARE CHOSEN FOR HOW POCKET REACTS TO THEM
//
//   200  stored, or already stored, or nothing we act on   -> no retry
//   401  bad or missing signature                          -> retries, then drops. Correct.
//   413  body beyond what we can hold in memory            -> retries, then drops
//   500  the database write failed                         -> retries. The one case retrying helps.
//   503  no signing secret configured                      -> retries, giving you time to set it
//
//   A 429 from guard() COSTS YOU A RECORDING: Pocket retries three times and
//   gives up. The daily cap here is not tuning, it is data loss, so it is set
//   far above real volume and hitting it is an incident.

/* Replay window. Retries back off 1s–30s, so a legitimate redelivery is never
   near five minutes. Without this, a captured delivery replays forever. */
const SKEW_PAST_MS   = 5 * 60 * 1000;
const SKEW_FUTURE_MS = 60 * 1000;

const SECRET = process.env.POCKET_WEBHOOK_SECRET;

/* ------------------------------------------------------------- raw body */

/** Read the body as bytes. Returns null if it exceeds RAW_MAX — the caller
 *  turns that into a 413. We stop reading at the ceiling rather than buffering
 *  a hostile body to the end. */
async function readRaw(req) {
  // Some runtimes (and every test) hand us a string or Buffer directly.
  if (typeof req.body === 'string') return req.body.length > RAW_MAX ? null : req.body;
  if (Buffer.isBuffer(req.body)) return req.body.length > RAW_MAX ? null : req.body.toString('utf8');

  const chunks = [];
  let n = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    n += b.length;
    if (n > RAW_MAX) return null;
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/* ---------------------------------------------------------- verification */

/** HMAC-SHA256(secret, `${timestamp}.${rawBody}`), compared in constant time.
 *  Never ===: a plain string compare leaks the correct prefix through timing
 *  and turns a 256-bit secret into a few thousand guesses. */
function signatureOk(raw, sig, ts) {
  if (!sig || !ts) return false;
  const expected = createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(sig).trim().replace(/^sha256=/i, ''), 'utf8');
  if (a.length !== b.length) return false;      // timingSafeEqual throws on a length mismatch
  return timingSafeEqual(a, b);
}

function timestampOk(ts) {
  const t = Number(ts);
  if (!isFinite(t) || t <= 0) return false;
  const drift = Date.now() - t;
  return drift <= SKEW_PAST_MS && drift >= -SKEW_FUTURE_MS;
}

/* -------------------------------------------------------------- handler */

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // Checked here rather than left to guard(), because guard() runs after the
  // signature and a probe should get 405 rather than 401.
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  // Fail closed. Never fall back to accepting unsigned deliveries — the docs
  // warn that webhooks created before signing existed still send them, and the
  // fix for that is to recreate the webhook, not to trust it.
  if (!SECRET) {
    console.error('[pocket-hook] POCKET_WEBHOOK_SECRET is not set; refusing every delivery');
    res.status(503).json({ error: 'Webhook not configured.' });
    return;
  }

  const raw = await readRaw(req);
  if (raw === null) { res.status(413).json({ error: 'Body too large.' }); return; }

  const sig = req.headers['x-heypocket-signature'];
  const ts  = req.headers['x-heypocket-timestamp'];

  if (!timestampOk(ts))            { res.status(401).json({ error: 'Stale or invalid timestamp.' }); return; }
  if (!signatureOk(raw, sig, ts))  { res.status(401).json({ error: 'Bad signature.' }); return; }

  /* guard() reads req.body for its size check and has a string branch, so
     handing it the raw string measures the true payload and _guard.js needs no
     change. maxChars matches RAW_MAX deliberately: a guard 413 and a readRaw
     413 must not disagree, or a legitimate recording is refused by one limit
     after passing the other. */
  req.body = raw;
  const gate = await guard(req, res, {
    name: 'pocket', perIp: 240, windowMin: 10, perDay: 3000,
    maxChars: RAW_MAX, requireAuth: false,
  });
  if (!gate.ok) return;
  sweep();

  let body;
  try { body = JSON.parse(raw); }
  catch { res.status(200).json({ ok: true, ignored: 'unparseable' }); return; }

  const event = str(body && body.event, 80);
  const { id, guessed } = recordingIdOf(body);
  if (!id) { res.status(200).json({ ok: true, ignored: 'no recording' }); return; }

  const meta = {
    event: event || 'unknown',
    at: str(body && body.timestamp, 60) || new Date().toISOString(),
    idGuessed: guessed || undefined,
  };

  /* First delivery of an unrecognised shape logs its KEY NAMES — never any
     values, which are transcripts. This is what settles the id question. */
  if (guessed) {
    console.error('[pocket-hook] no recording id found; keys were',
      JSON.stringify({ top: Object.keys(body || {}), recording: Object.keys((body && body.recording) || {}) }));
  }

  if (event === 'recording.deleted') {
    const out = await markDeleted(id, meta);
    if (!out.ok) { res.status(500).json({ error: 'Store failed.' }); return; }
    res.status(200).json({ ok: true, id, deleted: true });
    return;
  }

  /* Every other event upserts. Deliberately not an allowlist: you press record
     on purpose, so everything comes, and a new Pocket event type should arrive
     rather than be silently dropped by a list written today. */
  const out = await upsertMerge(id, patchFrom(body), meta);
  if (!out.ok) { res.status(500).json({ error: 'Store failed.' }); return; }
  res.status(200).json({ ok: true, id, created: !!out.created });
}
