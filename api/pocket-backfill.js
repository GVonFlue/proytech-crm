import { guard, sweep } from './_guard.js';
import { str, asList, readTranscript, recordingIdOf, upsertMerge, findTranscriptIn, keyShape, TRANSCRIPT_MAX } from './_pocket.js';

// api/pocket-backfill.js — pull recordings that predate the webhook.
//
// Two actions:
//   list    the 20 most recent recordings in Pocket. WRITES NOTHING.
//   import  one recording, by id, into pocket_recordings.
//
// ONE RECORDING PER REQUEST, AND WHY THAT IS NOT OVER-ENGINEERING
//
//   Not for volume — for timeouts. Twenty transcripts fetched from Pocket and
//   upserted inside one Vercel invocation is plausibly past the function limit,
//   and a timeout mid-import is a worse failure than the ten-line browser loop
//   that avoids it. The browser also gets progress for free.
//
// THIS IS THE FIRST ENDPOINT WHERE A BROWSER CAN CAUSE A SERVICE-KEY WRITE
//
//   api/pocket-hook.js also writes with the service key, but Pocket is its only
//   caller and HMAC authenticates it. Every other endpoint in this project
//   (jarvis, meeting-log, kb-draft, pocket-segment) only reads and returns
//   text — none of them touch the database.
//
//   guard({requireAuth:true}) proves there is a VALID SESSION. It does not
//   prove the session is an OWNER. A rep cannot read pocket_recordings, but
//   without the check below they could cause writes to it and fill the owner's
//   queue with noise.
//
//   So the role is verified server-side by calling crm_whoami() with the
//   CALLER'S OWN JWT. That function is security definer and derives the role
//   from auth.uid(), so a caller cannot assert their own role. Deliberately NOT
//   a role passed up in the request body: that is a claim, not a check.
//
// IDEMPOTENCY IS NOT THIS FILE'S JOB
//
//   pocket_recordings.id IS Pocket's recording id, and importing goes through
//   the SAME upsertMerge the webhook uses (api/_pocket.js). Re-importing a
//   recording the webhook already delivered refreshes fields and creates
//   nothing; `status` is never written by a merge, so one you already marked
//   done stays done. That is what makes this safe to re-run, which is what
//   let the date picker, the pagination and the select-and-pick list be cut.
//
// COSTS NOTHING. No Anthropic call anywhere in here. Deep extract remains the
// only thing in this feature that spends money.

const API  = 'https://public.heypocketai.com/api/v1';
const SUPA = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PK   = process.env.POCKET_API_KEY;

/* Page one only. Six recordings exist; if that ever changes, `has_more` is
   surfaced so the screen can say so rather than quietly showing a subset. */
const PAGE_LIMIT = 20;

/** Is the caller an owner? Asked of Postgres, using their token, through the
 *  function the app already trusts for exactly this question. */
async function isOwner(token) {
  try {
    const r = await fetch(`${SUPA}/rest/v1/rpc/crm_whoami`, {
      method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return false;
    const rows = await r.json();
    const me = Array.isArray(rows) ? rows[0] : rows;
    return !!(me && me.role === 'owner' && me.active !== false);
  } catch {
    // A failure to PROVE ownership is not permission. Unlike the rate limiter,
    // this one fails closed.
    return false;
  }
}

async function pocket(path) {
  const r = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${PK}`, accept: 'application/json' },
  });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}

/* The REST object, mapped.
 *
 * The docs give the envelope ({data, error, pagination, success}) and do not
 * name the fields INSIDE data — the same gap the webhook payload had. The
 * webhook shape is now known-good in the wild and this is very likely the same
 * `recording` / `summarizations` / `transcript` shape, so both spellings are
 * tried. If it turns out to differ, this function is the only thing that
 * changes. */
function fromRest(rec) {
  const r = (rec && rec.recording) || rec || {};
  const sums = (rec && (rec.summarizations || rec.summarization)) || r.summarizations || {};

  /* A direct `rec.transcript` read came back empty against real data, and the
     docs have never named the field. So this searches the plausible names at
     the plausible depths and reports WHERE it found one — which is how the
     next version of this file gets to be a plain property access again.
     Falls back to the direct read so the known-good webhook shape still wins
     if it is present. */
  const found = findTranscriptIn(rec);
  const t = found ? readTranscript(found.value) : readTranscript(rec && (rec.transcript ?? r.transcript));
  const full = t.text;
  const clamped = full.length > TRANSCRIPT_MAX;

  return {
    title:       str(r.title ?? r.name, 300),
    description: str(r.description, 2000),
    createdAt:   str(r.createdAt ?? r.created_at ?? r.recordedAt ?? r.recorded_at, 60),
    duration:    Number(r.duration ?? r.durationSeconds ?? r.duration_seconds) || 0,
    language:    str(r.language, 40),
    summary:     str(sums.summary ?? sums.summaryText ?? sums.text ?? (sums.summary && sums.summary.text), 20000),
    actionItems: asList(sums.actionItems ?? sums.action_items).slice(0, 100),
    transcript:  clamped ? full.slice(0, TRANSCRIPT_MAX) : full,
    segments:    t.segments.slice(0, 5000),
    truncated:   clamped || undefined,
    unknownTranscriptShape: t.unknownShape || undefined,
    /* Visible provenance: this row came in through the back door, not the
       webhook. Worth knowing when a field looks wrong. */
    importedAt:  new Date().toISOString(),
    transcriptPath: found ? found.path : undefined,
  };
}

const lightRow = (rec) => {
  const r = (rec && rec.recording) || rec || {};
  const { id } = recordingIdOf({ recording: r, id: r.id, user: rec && rec.user });
  return {
    id,
    title: str(r.title ?? r.name, 300) || 'Untitled recording',
    createdAt: str(r.createdAt ?? r.created_at ?? r.recordedAt, 60),
    duration: Number(r.duration ?? r.durationSeconds) || 0,
    language: str(r.language, 40),
  };
};

export default async function handler(req, res) {
  // Small bodies: an action and maybe an id. maxChars set accordingly rather
  // than inheriting a default sized for something else.
  const gate = await guard(req, res, {
    name: 'pocket-backfill', perIp: 120, windowMin: 10, perDay: 600,
    maxChars: 2000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();

  const token = String(req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!(await isOwner(token))) {
    res.status(403).json({ ok: false, error: 'Only an owner can import recordings.' });
    return;
  }

  if (!PK) { res.status(200).json({ ok: false, error: 'POCKET_API_KEY is not set on this install.' }); return; }

  const body = req.body || {};
  const action = str(body.action, 20);

  /* ------------------------------------------------------------------ list */
  if (action === 'list') {
    const r = await pocket(`/public/recordings?page=1&limit=${PAGE_LIMIT}`);
    if (r.status === 429) { res.status(200).json({ ok: false, rateLimited: true, error: 'Pocket is rate limiting. Wait a minute and try again.' }); return; }
    if (!r.ok) { res.status(200).json({ ok: false, error: (r.body && r.body.error) || `Pocket returned ${r.status}.` }); return; }

    const rows = asList(r.body && r.body.data);

    /* The one unknown left in this feature. Key NAMES only — the values are
       transcripts. One real call settles the shape permanently. */
    if (rows.length) {
      console.error('[pocket-backfill] first record keys:',
        JSON.stringify(Object.keys(rows[0] || {})),
        'recording:', JSON.stringify(Object.keys((rows[0] && rows[0].recording) || {})));
    }

    const pg = (r.body && r.body.pagination) || {};
    res.status(200).json({
      ok: true,
      recordings: rows.map(lightRow).filter(x => x.id),
      hasMore: !!pg.has_more,
      total: Number(pg.total) || rows.length,
    });
    return;
  }

  /* ---------------------------------------------------------------- import */
  if (action === 'import') {
    const id = str(body.id, 200);
    if (!id) { res.status(400).json({ ok: false, error: 'no id' }); return; }

    const r = await pocket(`/public/recordings/${encodeURIComponent(id)}?include_transcript=true&include_summarizations=true`);
    if (r.status === 429) { res.status(200).json({ ok: false, id, rateLimited: true, error: 'Pocket is rate limiting. Wait a minute and continue.' }); return; }
    /* A 404 on ONE recording must not abort the run — the browser reports it
       against that row and carries on with the rest. */
    if (r.status === 404) { res.status(200).json({ ok: false, id, error: 'Pocket no longer has that recording.' }); return; }
    if (!r.ok) { res.status(200).json({ ok: false, id, error: (r.body && r.body.error) || `Pocket returned ${r.status}.` }); return; }

    const rec = (r.body && r.body.data) || null;
    if (!rec) { res.status(200).json({ ok: false, id, error: 'Pocket returned nothing for that recording.' }); return; }

    const patch = fromRest(rec);
    const out = await upsertMerge(id, patch, { event: 'backfill', at: new Date().toISOString() });
    if (!out.ok) { res.status(500).json({ ok: false, id, error: 'Could not store that recording.' }); return; }

    /* If no transcript was found, say SO and say WHAT WAS THERE — key names and
       types only, never values. A shape mismatch that reports itself on the
       screen is a one-round-trip fix; one that only whispers into a log
       somebody has to go and find is several. */
    const shape = patch.transcript ? null : keyShape(rec);
    if (shape) console.error('[pocket-backfill] no transcript for', id, 'shape:', JSON.stringify(shape));

    res.status(200).json({
      ok: true, id, created: !!out.created,
      transcript: !!patch.transcript,
      transcriptPath: patch.transcriptPath || null,
      shape,
    });
    return;
  }

  res.status(400).json({ ok: false, error: 'unknown action' });
}
