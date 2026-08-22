import { guard, sweep } from './_guard.js';
import {
  brandContext, underCap, loadPost, patchPost, logUsage, askAnthropic,
} from './_content.js';
import {
  buildRegeneratePrompt, parseModelJson, postsFrom, captionsFrom, postRow, normPost,
} from '../src/lib/content.js';

// api/content-regenerate.js — keep the concept, fix the wording.
//
// WHY THIS IS NOT A `mode` ON api/content-slate.js
//
//   Same argument api/kb-draft.js makes about api/meeting-log.js. content-slate
//   generates a WEEK and owns the research queue, the week_of stamp and the
//   insert. This rewrites ONE existing row and touches none of that. Folding it
//   in would mean a `dry_run` path, a research path and a post_id path in one
//   handler, each of which must not fire the other two.
//
// WHAT IT SHARES, AND WHY THAT MATTERS
//
//   The brand context. Both routes call brandContext() in api/_content.js,
//   which calls buildSystemPrompt() in src/lib/content.js. If this file
//   composed the voice/forbidden/pillar sections its own way, a regenerated
//   caption would be written against a different brand than the slate it sits
//   in — the two-screens-disagree bug (ENGINEERING.md §2) with two prompts as
//   the disagreeing parties, and invisible, because only one of them is ever
//   on screen at a time.
//
// WHAT IT MAY NOT CHANGE
//
//   week_of, mix_class and pillar. The prompt states them as fixed AND the
//   write below re-imposes them from the stored row, because a model told not
//   to change something is not a constraint — it is a request. Same reasoning
//   as kb_publish() owning the published copy: the guarantee lives where the
//   write happens, not where the instruction was phrased.

const MODES = new Set(['caption', 'full']);
const OPERATION = 'regenerate';

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'content-regenerate', perIp: 30, windowMin: 60, perDay: 200,
    maxChars: 2000, requireOwner: true,
  });
  if (!gate.ok) return;
  sweep();

  const b = req.body || {};
  const postId = String(b.post_id || '').trim();
  const mode = String(b.mode || '').trim();

  if (!postId) { res.status(400).json({ ok: false, error: 'Which post? post_id is required.' }); return; }
  if (!MODES.has(mode)) { res.status(400).json({ ok: false, error: 'mode must be "caption" or "full".' }); return; }

  const found = await loadPost(postId);
  if (!found.ok) {
    console.error('[content-regenerate] post unreadable:', found.error);
    res.status(502).json({ ok: false, error: 'Could not read that post. ' + found.error });
    return;
  }
  if (!found.row) { res.status(404).json({ ok: false, error: 'That post is no longer there.' }); return; }
  const post = normPost(found.row);

  /* --- config, then the cap. Same order and same cap as the slate route. */
  const brand = await brandContext();
  if (!brand.ok) {
    console.error('[content-regenerate] brand context unreadable:', brand.error);
    res.status(502).json({ ok: false, error: 'Could not read the brand context. ' + brand.error });
    return;
  }
  const { config, missing, system } = brand;

  const cap = await underCap(config);
  if (!cap.ok) { res.status(cap.status).json(cap.body); return; }

  const user = buildRegeneratePrompt(post, mode, config.surfaces);
  const call = await askAnthropic({
    model: config.model, system, user,
    /* A rewrite is one post, not a week. Derived from the slate ceiling rather
       than typed in, so moving config.max_tokens moves both. */
    maxTokens: Math.max(1024, Math.round(Number(config.max_tokens) / 4)),
  });
  if (!call.ok) { res.status(502).json({ ok: false, error: call.error }); return; }

  /* Logged before the parse — the tokens were spent either way. */
  const spend = await logUsage(OPERATION + ':' + mode, config.model, call.usage);

  const parsed = parseModelJson(call.text);
  if (!parsed.ok) {
    console.error('[content-regenerate] unparseable response, nothing written. Raw follows:\n' + parsed.raw.slice(0, 4000));
    res.status(502).json({
      ok: false,
      error: 'The rewrite came back in a shape we could not read, so the post was left alone. The raw response is in the function logs.',
      spent_cents: spend.cents,
    });
    return;
  }

  /* --- what actually goes to Postgres ------------------------------------ */
  let patch;
  if (mode === 'caption') {
    const captions = captionsFrom(parsed.value, config.surfaces);
    if (!captions) {
      console.error('[content-regenerate] no captions in the response, post left alone. Raw follows:\n' + parsed.raw.slice(0, 2000));
      res.status(502).json({ ok: false, error: 'That came back with no captions in it, so the post was left alone.', spent_cents: spend.cents });
      return;
    }
    /* ONE FIELD. A caption fix that also rewrote the hook is not a caption fix,
       and the owner kept this concept on purpose. */
    patch = { captions };
  } else {
    const first = postsFrom(parsed.value)[0] || parsed.value;
    const built = postRow(first, {
      weekOf: post.week_of, surfaces: config.surfaces,
      researchIds: post.source_research, generatedAt: new Date().toISOString(),
    });
    if (!built.hook && !built.concept) {
      console.error('[content-regenerate] response held no post, post left alone. Raw follows:\n' + parsed.raw.slice(0, 2000));
      res.status(502).json({ ok: false, error: 'That came back with no post in it, so the original was left alone.', spent_cents: spend.cents });
      return;
    }
    /* week_of, mix_class and pillar come from the STORED ROW, not the model's
       answer. `status` is left alone too: a rewrite of an approved post must
       not silently un-approve it, and `posted_at` / `platform_post_ids` /
       `performance` are facts about the world that a rewrite cannot undo. */
    patch = {
      ...built,
      week_of: post.week_of,
      mix_class: post.mix_class,
      pillar: post.pillar,
    };
    delete patch.status;
  }

  const saved = await patchPost(postId, patch);
  if (!saved.ok) {
    console.error('[content-regenerate] save failed:', saved.error);
    res.status(502).json({ ok: false, error: 'The rewrite could not be saved. ' + saved.error, spent_cents: spend.cents });
    return;
  }

  res.status(200).json({
    ok: true, mode, post: (saved.rows || [])[0] || null,
    config_defaults_used: missing, spent_cents: spend.cents, cap_cents: cap.cap_cents,
  });
}
