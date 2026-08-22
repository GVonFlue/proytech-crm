import { createClient } from '@supabase/supabase-js';
import { BRAND, SUPABASE_URL, SUPABASE_KEY, SUPABASE_OK } from './brand';

/* Per-tenant Supabase, from Vercel env vars (see src/lib/brand.js).
   The publishable key is safe in client code — real protection is Row Level
   Security + logins. NEVER put the secret/service key here.
   If the env vars are missing we create a dud client so the app can render a
   clear setup screen instead of silently pointing at the wrong database. */
export const supabase = createClient(
  SUPABASE_OK ? SUPABASE_URL : 'https://missing.supabase.co',
  SUPABASE_OK ? SUPABASE_KEY : 'missing'
);
export const configured = SUPABASE_OK;

/* ---- auth ----
   New people sign in with their REAL email. Legacy single-tenant installs
   signed in with a bare username, which we still map to username@authDomain
   so nobody gets locked out. Anything containing '@' is used verbatim. */
const emailFor = u => { const s = (u || '').trim().toLowerCase(); return s.includes('@') ? s : `${s}@${BRAND.authDomain}`; };
export const auth = {
  login(identifier, password) { return supabase.auth.signInWithPassword({ email: emailFor(identifier), password }); },
  logout() { return supabase.auth.signOut(); },
  async session() { const { data } = await supabase.auth.getSession(); return data.session; },
  /* the event matters: PASSWORD_RECOVERY means they arrived from a reset
     link and must be shown the "choose a password" screen, not the app. */
  onChange(cb) { return supabase.auth.onAuthStateChange((e, s) => cb(s, e)); },
  /* did this page load land on a recovery link? (checked before supabase-js
     consumes and clears the URL fragment) */
  isRecoveryUrl() {
    try { return /type=recovery/.test((window.location.hash || '') + (window.location.search || '')); }
    catch { return false; }
  },
  /* set the password of whoever is signed in right now */
  async setPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message || 'Could not set that password.');
    return true;
  },
  username(session) { return (session?.user?.email || '').split('@')[0]; },
  uid(session) { return session?.user?.id || null; },
  email(session) { return session?.user?.email || ''; },
  /* Create a login for a new hire WITHOUT touching the owner's own session.
     supabase.auth.signUp() would swap the browser session over to the new
     user (and sign the owner out), so we call the gotrue endpoint directly.
     Returns the new auth uid when the project returns one. */
  async createLogin(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ email: (email || '').trim().toLowerCase(), password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.error || 'Could not create that login.');
    const id = j.id || j.user?.id || null;
    return { id, needsConfirm: !id };
  },
  /* password-reset / set-your-password email.
     redirectTo pins the link to THIS deployment, so a stale "Site URL" in the
     Supabase dashboard can't send people to localhost — as long as this origin
     is in Authentication → URL Configuration → Redirect URLs. */
  async sendReset(email) {
    let redirectTo; try { redirectTo = window.location.origin; } catch { redirectTo = undefined; }
    const { error } = await supabase.auth.resetPasswordForEmail(
      (email || '').trim().toLowerCase(), redirectTo ? { redirectTo } : undefined);
    if (error) throw new Error(error.message || 'Could not send that email.');
    return true;
  },
};

/* ---- data: leads as JSON rows + one shared settings row ----
   owner_id / pool are REAL columns beside the jsonb blob because Row Level
   Security cannot read policy values out of jsonb reliably. The client
   mirrors them on every write. Installs that haven't run MIGRATION.sql yet
   have no such columns, so every call falls back to plain (id,data). */
const SENTINEL = '00000000-0000-0000-0000-000000000000';
let COLS = null;   // null = unknown, true = migrated, false = legacy schema
/* 42P01 = table does not exist, 42883 = function does not exist. Either means
   KB-MIGRATION.sql has not been run on this install. PGRST202 is PostgREST
   failing to find the rpc in its schema cache, which looks the same to a user. */
/* Same shape as kbMissing: POCKET-MIGRATION.sql has not been run on this
   install, so the feature degrades to absent rather than taking the app down. */
/* Missing table or column — REP-PAY-MIGRATION.sql has not been run. */
const payMissing = e =>
  e?.code === '42P01' || e?.code === '42703' || e?.code === 'PGRST205' ||
  /rep_payouts|appointment_rate/.test(`${e?.message || ''} ${e?.details || ''}`);

const pocketMissing = e =>
  e?.code === '42P01' || e?.code === 'PGRST205' ||
  /pocket_recordings/.test(`${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`);

const kbMissing = e =>
  e?.code === '42P01' || e?.code === '42883' || e?.code === 'PGRST202' ||
  /kb_notes|kb_published|kb_preview|kb_publish|kb_unpublish|kb_ai_context/.test(
    `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`) && /does not exist|not find/i.test(
    `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`);

/* Content Studio's tables were created by hand and ship in no migration in
   this repo, so an install that has not had them made yet is an ordinary state,
   not a bug. Same shape as kbMissing: the tab degrades to empty, the app does
   not go down. */
const contentMissing = e =>
  e?.code === '42P01' || e?.code === 'PGRST205' ||
  /content_brand_context|content_research|content_posts|content_usage/.test(
    `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`);

/* The column lists for Content Studio, in one place each. api/_content.js holds
   the server-side twin of CONTENT_POST_COLS and tests/content.mjs asserts the
   two agree — one table must not have two ideas of which columns it has. */
const CONTENT_CONTEXT_COLS  = 'id,category,key,value,active,sort_order';
const CONTENT_RESEARCH_COLS = 'id,source_type,url,platform,format,raw,why_it_worked,used,captured_at';
const CONTENT_POST_COLS =
  'id,week_of,mix_class,surface,pillar,format,hook,concept,image_prompt,'
  + 'carousel_slides,captions,cta_key,value_statement,source_research,status,'
  + 'generated_at,posted_at,platform_post_ids,performance,created_at';

const missingCol = e => {
  const s = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`.toLowerCase();
  return e?.code === '42703' || s.includes('owner_id') || s.includes('pool') || s.includes('column');
};
const leadRow = l => ({ id: l.id, data: { ...l, id: l.id }, owner_id: l.owner_id || null, pool: l.pool || null });
export const db = {
  get migrated() { return COLS === true; },
  async getLeads() {
    if (COLS !== false) {
      const { data, error } = await supabase.from('leads').select('id,data,owner_id,pool');
      if (!error) { COLS = true; return (data || []).map(r => ({ ...r.data, id: r.id, owner_id: r.owner_id || null, pool: r.pool || null })); }
      if (!missingCol(error)) throw error;
      COLS = false;
    }
    const { data, error } = await supabase.from('leads').select('id,data');
    if (error) throw error;
    return (data || []).map(r => ({ ...r.data, id: r.id }));
  },
  async upsertLead(lead) {
    if (COLS !== false) {
      const { error } = await supabase.from('leads').upsert(leadRow(lead));
      if (!error) { COLS = true; return; }
      if (!missingCol(error)) throw error;
      COLS = false;
    }
    const { error } = await supabase.from('leads').upsert({ id: lead.id, data: { ...lead, id: lead.id } });
    if (error) throw error;
  },
  async upsertMany(leads) {
    if (!leads.length) return;
    if (COLS !== false) {
      const { error } = await supabase.from('leads').upsert(leads.map(leadRow));
      if (!error) { COLS = true; return; }
      if (!missingCol(error)) throw error;
      COLS = false;
    }
    const rows = leads.map(l => ({ id: l.id, data: { ...l, id: l.id } }));
    const { error } = await supabase.from('leads').upsert(rows);
    if (error) throw error;
  },
  async deleteLead(id) {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
  },
  async deleteAll() {
    const { error } = await supabase.from('leads').delete().neq('id', SENTINEL);
    if (error) throw error;
  },
  /* events: one row each, mirroring leads rather than the app_settings blob */
  async getEvents() {
    const { data, error } = await supabase.from('events').select('id,data').order('created_at', { ascending: false });
    if (error) { if (error.code === '42P01') return []; throw error; }
    return (data || []).map(r => ({ ...(r.data || {}), id: r.id }));
  },
  async upsertEvent(ev) {
    if (!ev || !ev.id) return;
    const { id, ...rest } = ev;
    const { error } = await supabase.from('events').upsert({ id, data: rest, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async deleteEvent(id) {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
  },
  /* meeting logs: one row each, owner-only at the RLS level. The transcript
     lives here and is never read by anything except the person who wrote it. */
  async getMeetingLogs() {
    const { data, error } = await supabase.from('meeting_logs').select('id,data').order('created_at', { ascending: false });
    if (error) { if (error.code === '42P01') return []; throw error; }
    return (data || []).map(r => ({ ...(r.data || {}), id: r.id }));
  },
  async upsertMeetingLog(log) {
    if (!log || !log.id) return;
    const { id, ...rest } = log;
    const { error } = await supabase.from('meeting_logs').upsert({ id, data: rest, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async deleteMeetingLog(id) {
    const { error } = await supabase.from('meeting_logs').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---- Pocket recordings (POCKET-MIGRATION.sql) ---------------------------
     Owner-only, same policy as meeting_logs — a rep gets zero rows, proved in
     VERIFY-RLS.md §7. Written by the service key from api/pocket-hook.js; the
     browser reads them and moves their status.

     TWO READS ON PURPOSE. The list must not carry transcripts: fifty
     recordings at a few hundred KB each is tens of megabytes into the browser,
     and ENGINEERING §7 already warns about loading everything into memory. So
     the list selects named jsonb keys only, and the transcript arrives when one
     recording is opened. */
  async getPocketRecordings() {
    const cols = [
      'id', 'status', 'received_at', 'updated_at',
      'title:data->>title', 'summary:data->>summary', 'createdAt:data->>createdAt',
      'duration:data->>duration', 'language:data->>language',
      'actionItems:data->actionItems', 'proposals:data->proposals',
      'truncated:data->>truncated', 'idGuessed:data->>idGuessed',
      'deletedInPocket:data->>deletedInPocket', 'events:data->events',
    ].join(',');
    const { data, error } = await supabase.from('pocket_recordings')
      .select(cols).order('received_at', { ascending: false });
    if (error) { if (pocketMissing(error)) return []; throw error; }
    return (data || []).map(r => ({ ...r, duration: Number(r.duration) || 0 }));
  },
  /* The whole row, transcript included. Called when a recording is opened. */
  async getPocketRecording(id) {
    const { data, error } = await supabase.from('pocket_recordings')
      .select('id,data,status,received_at,updated_at').eq('id', id).maybeSingle();
    if (error) { if (pocketMissing(error)) return null; throw error; }
    return data ? { ...(data.data || {}), id: data.id, status: data.status, received_at: data.received_at } : null;
  },
  async setPocketStatus(id, status) {
    const { error } = await supabase.from('pocket_recordings')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  /* Caches the last segmentation so reopening the screen does not re-spend.
     Reads the row first rather than patching blind: `data` is one jsonb column
     and writing a bare object would drop the transcript. */
  async savePocketProposals(id, proposals) {
    const { data, error } = await supabase.from('pocket_recordings')
      .select('data').eq('id', id).maybeSingle();
    if (error) throw error;
    const next = { ...((data && data.data) || {}), proposals };
    const { error: e2 } = await supabase.from('pocket_recordings')
      .update({ data: next, updated_at: new Date().toISOString() }).eq('id', id);
    if (e2) throw e2;
  },
  async deletePocketRecording(id) {
    const { error } = await supabase.from('pocket_recordings').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---- Playbook (KB-MIGRATION.sql) ----------------------------------------
     TWO tables, and the split is the security model rather than a schema
     preference. RLS is ROW-level and an owner and a rep are the same Postgres
     role, so a rep allowed to read a published ROW would be allowed to read
     every COLUMN of it — including the owner's working text. So drafts live in
     kb_notes (owner-only) and the rep-readable surface is kb_published, which
     has no INSERT/UPDATE/DELETE policy at all: the ONLY writer is kb_publish().
     That is why publishing below is an rpc and not an upsert.

     Every call degrades to empty on an install that has not run
     KB-MIGRATION.sql yet — 42P01 is a missing table, 42883 a missing function.
     Same posture as getMeetingLogs: a missing migration must not take the app
     down, it must take the tab down. */
  async getKbNotes() {
    const { data, error } = await supabase.from('kb_notes')
      .select('id,data,status,created_at,updated_at').order('updated_at', { ascending: false });
    if (error) { if (kbMissing(error)) return []; throw error; }
    return (data || []).map(r => ({
      ...(r.data || {}), id: r.id, status: r.status,
      createdAt: (r.data && r.data.createdAt) || r.created_at, updatedAt: r.updated_at,
    }));
  },
  /* status is NOT written here. It is a real column that only kb_publish() and
     kb_unpublish() move, so an ordinary save can never publish something by
     writing the wrong field. */
  async upsertKbNote(note) {
    if (!note || !note.id) return;
    const { id, status, createdAt, updatedAt, ...rest } = note;
    const { error } = await supabase.from('kb_notes')
      .upsert({ id, data: { ...rest, createdAt }, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async deleteKbNote(id) {
    const { error } = await supabase.from('kb_notes').delete().eq('id', id);
    if (error) throw error;
  },
  /* The rep-readable surface, read directly. Six named columns — if this ever
     needs a seventh field, the COLUMN has to exist first, which is the whole
     reason that table is not a jsonb blob. */
  async getKbPublished() {
    const { data, error } = await supabase.from('kb_published')
      .select('id,title,category,tags,body,published_at').order('published_at', { ascending: false });
    if (error) { if (kbMissing(error)) return []; throw error; }
    return data || [];
  },
  /* The preview. This is the same function kb_publish() inserts FROM, so what
     it returns and what a rep ends up seeing cannot disagree. The screen must
     render THIS, never a client-side re-render of the editor's state — that
     would be a mockup of the truth, and mockups drift. */
  async kbPreview(id) {
    const { data, error } = await supabase.rpc('kb_preview', { p_id: id });
    if (error) { if (kbMissing(error)) return null; throw error; }
    const row = Array.isArray(data) ? data[0] : data;
    return row || null;
  },
  async kbPublish(id) {
    const { error } = await supabase.rpc('kb_publish', { p_id: id });
    if (error) throw error;
  },
  async kbUnpublish(id) {
    const { error } = await supabase.rpc('kb_unpublish', { p_id: id });
    if (error) throw error;
  },
  /* What JARVIS may be given. Reads kb_published and does not name kb_notes,
     so an OWNER calling it gets published rows only, exactly like a rep. There
     is no argument to pass to widen it. */
  async kbAiContext() {
    const { data, error } = await supabase.rpc('kb_ai_context');
    if (error) { if (kbMissing(error)) return []; throw error; }
    return data || [];
  },

  /* ---- Content Studio -----------------------------------------------------
     The tables were created by hand and are NOT in any migration in this repo;
     nothing here writes DDL. Every call degrades to empty on an install that
     does not have them, the same posture as the Playbook and Pocket reads
     above: a missing table takes the TAB down, never the app.

     EVERY COLUMN THIS FEATURE WRITES IS NAMED IN A SELECT LIST BELOW.
     ENGINEERING.md §2 — a column written and not selected is a column that
     vanishes, and that has shipped three times in this project. The columns
     WEEKEND1 reserves for later phases (idea_id, parent_id, series_key,
     series_index, source_insights, recycled_from) are deliberately absent:
     nothing here writes them, so a read path for them would be a read of a
     value nothing produces. They stay null and untouched.

     The api/ routes read and write these same tables with the SERVICE key.
     The lists here and POST_COLS in api/_content.js must stay identical —
     tests/content.mjs asserts that they are, because two column lists for one
     table is the same drift in a new costume. */
  async getContentContext() {
    const { data, error } = await supabase.from('content_brand_context')
      .select(CONTENT_CONTEXT_COLS).order('category', { ascending: true }).order('sort_order', { ascending: true });
    if (error) { if (contentMissing(error)) return []; throw error; }
    return data || [];
  },
  /* One row in or out. `id` is omitted on a new row so Postgres assigns it. */
  async saveContentContext(row) {
    const body = {
      category: row.category, key: row.key, value: row.value,
      active: row.active !== false, sort_order: Number(row.sort_order) || 0,
    };
    if (row.id) body.id = row.id;
    const { data, error } = await supabase.from('content_brand_context')
      .upsert(body).select(CONTENT_CONTEXT_COLS);
    if (error) throw error;
    return (data || [])[0] || null;
  },
  /* The import path. ADDITIVE — insert, never upsert: an import that collided
     with an existing key would rewrite the owner's own pricing silently, which
     is the one thing WEEKEND1 §D forbids. The screen decides what to send. */
  async addContentContext(rows) {
    const body = (rows || []).map(r => ({
      category: r.category, key: r.key, value: r.value,
      active: r.active !== false, sort_order: Number(r.sort_order) || 0,
    }));
    if (!body.length) return [];
    const { data, error } = await supabase.from('content_brand_context')
      .insert(body).select(CONTENT_CONTEXT_COLS);
    if (error) throw error;
    return data || [];
  },
  async deleteContentContext(id) {
    const { error } = await supabase.from('content_brand_context').delete().eq('id', id);
    if (error) throw error;
  },

  async getContentPosts() {
    const { data, error } = await supabase.from('content_posts')
      .select(CONTENT_POST_COLS).order('week_of', { ascending: false }).limit(400);
    if (error) { if (contentMissing(error)) return []; throw error; }
    return data || [];
  },
  /* The screen only ever writes these six. Hook, concept, pillar and the rest
     are the model's output and are changed by api/content-regenerate.js, not
     by a textarea — except `captions`, which WEEKEND1 §D makes editable on the
     card, so it is here. */
  async updateContentPost(id, patch) {
    const allowed = ['status', 'captions', 'posted_at', 'platform_post_ids', 'performance', 'week_of'];
    const body = {};
    for (const k of allowed) if (k in patch) body[k] = patch[k];
    const { data, error } = await supabase.from('content_posts')
      .update(body).eq('id', id).select(CONTENT_POST_COLS);
    if (error) throw error;
    return (data || [])[0] || null;
  },

  async getContentResearch() {
    const { data, error } = await supabase.from('content_research')
      .select(CONTENT_RESEARCH_COLS).order('captured_at', { ascending: false }).limit(200);
    if (error) { if (contentMissing(error)) return []; throw error; }
    return data || [];
  },
  /* captured_at and used are left to their column defaults on insert — the
     capture form has no field for either, and stamping a client clock on a row
     Postgres is about to stamp itself is how two timestamps for one event
     start disagreeing. */
  async addContentResearch(row) {
    const { data, error } = await supabase.from('content_research').insert({
      source_type: row.source_type || '', url: row.url || '',
      platform: row.platform || '', format: row.format || '',
      raw: row.raw || '', why_it_worked: row.why_it_worked || '',
    }).select(CONTENT_RESEARCH_COLS);
    if (error) throw error;
    return (data || [])[0] || null;
  },

  async getSettings() {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    return data?.data || null;
  },
  async saveSettings(obj) {
    const { error } = await supabase.from('app_settings').upsert({ id: 'main', data: obj });
    if (error) throw error;
  },
  async getInvoices() {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 'invoices').maybeSingle();
    if (error) throw error;
    return (data?.data?.list) || [];
  },
  async saveInvoices(list) {
    const { error } = await supabase.from('app_settings').upsert({ id: 'invoices', data: { list } });
    if (error) throw error;
  },
  async getTxns() {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 'txns').maybeSingle();
    if (error) throw error;
    return (data?.data?.list) || [];
  },
  async saveTxns(list) {
    const { error } = await supabase.from('app_settings').upsert({ id: 'txns', data: { list } });
    if (error) throw error;
  },
  async getTasks() {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 'tasks').maybeSingle();
    if (error) throw error;
    return (data?.data?.list) || [];
  },
  async saveTasks(list) {
    const { error } = await supabase.from('app_settings').upsert({ id: 'tasks', data: { list } });
    if (error) throw error;
  },
  /* ---- people: one crm_users row per Supabase Auth user ----
     Missing table (install hasn't run MIGRATION.sql) returns [] so the
     existing two-owner install keeps working untouched. */
  async getUsers() {
    /* appointment_rate is READ here as well as written in upsertUser. It was
       written and never read, so a rate you typed saved to the database, came
       back undefined on the next load, and rendered as 0 — which looks exactly
       like a field that does not work. Same shape as the settings loader that
       silently dropped `recurring` in v36: a field written but not read is a
       field that vanishes. ENGINEERING §2. */
    const OPTIONAL = ['appointment_rate', 'nav_order'];
    const base = 'id,name,email,role,pools,commission_pct,appointment_rate,active,tabs,goal_conversions,nav_order';
    /* 42703 = column doesn't exist. Two can be missing independently —
       nav_order on an install that hasn't re-run MIGRATION.sql,
       appointment_rate on one that hasn't run REP-PAY-MIGRATION.sql — so drop
       them ONE AT A TIME and SAY WHICH.

       Saying which is the whole point. A dropped appointment_rate arrives as
       undefined, coerces to 0, and 0 is a legitimate rate for a rep who is not
       on appointment pay. Silent, the missing column and the deliberate zero
       are the same screen. This is the only place that can still tell them
       apart, so it is the only place that can raise it. */
    const dropped = [];
    let cols = base, data = null, error = null;
    for (;;) {
      ({ data, error } = await supabase.from('crm_users').select(cols));
      if (!error || error.code !== '42703') break;
      const next = OPTIONAL.find(c => cols.includes(c) && !dropped.includes(c));
      if (!next) break;
      dropped.push(next);
      cols = cols.replace(',' + next, '');
    }
    for (const c of dropped)
      console.error(
        `[crm_users] the column "${c}" does not exist in your database, so it was not read. ` +
        (c === 'appointment_rate'
          ? 'Every rep will read as $0 per appointment and no rep can be put on appointment pay. Run REP-PAY-MIGRATION.sql.'
          : 'Custom sidebar order will not load. Re-run MIGRATION.sql.'));
    if (error) { if (error.code === '42P01') return []; throw error; }
    return (data || []).map(u => ({ ...u, pools: u.pools || [], tabs: u.tabs || [], nav_order: u.nav_order || [],
      commission_pct: Number(u.commission_pct) || 0, appointment_rate: Number(u.appointment_rate) || 0,
      /* so a screen can tell "not on appointment pay" from "column never ran" */
      _missingCols: dropped }));
  },
  /* WHO ELSE IS ON THE TEAM — names and roles only.
     Separate from getUsers() on purpose. getUsers() reads crm_users directly,
     and RLS (users_read) gives a REP exactly one row: their own. Anything in
     the app that needs "the team" — the @mention picker, naming the owner
     whose calendar a booking lands on — was therefore getting a list of one
     and silently degrading.
     crm_team() is a security-definer RPC in TEAM-MIGRATION.sql returning
     id/name/role and nothing else. No money crosses it, by construction.
     Falls back to [] on an install that has not run the migration, so the
     callers degrade exactly as they do today rather than throwing. */
  async team() {
    const { data, error } = await supabase.rpc('crm_team');
    if (error) {
      /* 42883 / PGRST202 = the function does not exist yet */
      if (error.code === '42883' || error.code === 'PGRST202') return [];
      throw error;
    }
    return (data || []).map(u => ({ id: u.id, name: u.name || '', role: u.role || 'rep' }));
  },
  async whoami() {
    const { data, error } = await supabase.rpc('crm_whoami');
    if (error) { if (error.code === '42883' || error.code === 'PGRST202') return null; throw error; }
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return null;
    return { role: r.role, active: r.active !== false, setup: !!r.setup, name: r.name || '',
      pools: r.pools || [], commission_pct: Number(r.commission_pct) || 0,
      /* the SECOND read path for pay. It carried commission_pct and not
         appointment_rate, so a rep rebuilt from whoami read as $0/appt while
         Settings showed their real rate — two reads of one value disagreeing.
         Older installs whose crm_whoami() predates the column return undefined
         here, which is why upsertUser/getUsers stay the source of truth. */
      appointment_rate: Number(r.appointment_rate) || 0,
      tabs: r.tabs || [], nav_order: r.nav_order || [], goal_conversions: Number(r.goal_conversions) || 0 };
  },
  async upsertUser(u) {
    const row = { id: u.id, name: u.name, email: u.email || null, role: u.role || 'rep', pools: u.pools || [],
      commission_pct: Number(u.commission_pct) || 0, active: u.active !== false, tabs: u.tabs || [],
      appointment_rate: Number(u.appointment_rate) || 0,
      goal_conversions: Number(u.goal_conversions) || 0, nav_order: u.nav_order || [] };
    let { error } = await supabase.from('crm_users').upsert(row);
    /* Same fallback as getUsers. Without this, an install that hasn't re-run
       MIGRATION.sql would fail EVERY user save, not just the sidebar order. */
    /* An install that has not run REP-PAY-MIGRATION.sql has no appointment_rate
       column, and without this fallback EVERY user save would fail rather than
       just the new field. Same shape as the nav_order fallback below it. */
    if (error && error.code === '42703') {
      const { appointment_rate, ...noRate } = row;
      const retry = await supabase.from('crm_users').upsert(noRate);
      if (!retry.error) return;
      error = retry.error;
    }
    if (error && error.code === '42703') {
      const { nav_order, appointment_rate, ...rest } = row;
      ({ error } = await supabase.from('crm_users').upsert(rest));
    }
    if (error) throw error;
  },
  async deleteUser(id) {
    const { error } = await supabase.from('crm_users').delete().eq('id', id);
    if (error) throw error;
  },
  /* Leaderboard counts. A rep can only READ their own leads, so the ranking
     cannot be computed in the browser — it comes from a security-definer
     function that returns names and conversion COUNTS only, never money. */
  /* ---- rep payouts (REP-PAY-MIGRATION.sql) --------------------------------
     RLS: a rep reads their OWN rows, an owner reads and writes all. A rep
     paying themselves is impossible at the database, not behind a hidden
     button — proved in VERIFY-RLS.md §8.
     Degrades to empty if the migration has not been run, same posture as the
     Playbook and Pocket helpers: a missing migration takes the FEATURE down,
     never the app. */
  async getPayouts() {
    const { data, error } = await supabase.from('rep_payouts')
      .select('id,rep_id,amount,paid_on,period,note,created_by,created_at')
      .order('paid_on', { ascending: false });
    if (error) { if (payMissing(error)) return []; throw error; }
    return data || [];
  },
  async addPayout(row) {
    const { error } = await supabase.from('rep_payouts').insert(row);
    if (error) throw error;
  },
  async deletePayout(id) {
    const { error } = await supabase.from('rep_payouts').delete().eq('id', id);
    if (error) throw error;
  },

  async leaderboard() {
    const { data, error } = await supabase.rpc('crm_leaderboard');
    if (error) { if (error.code === '42883' || error.code === 'PGRST202') return null; throw error; }
    return (data || []).map(r => ({ id: r.user_id, name: r.name, month: Number(r.clients_month) || 0, all: Number(r.clients_all) || 0 }));
  },
  /* ---- receipt files live in Supabase Storage (bucket 'receipts'), NOT in the DB ---- */
  async uploadReceipt(path, file) {
    const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type || 'application/pdf', upsert: true });
    if (error) throw error;
    return path;
  },
  async downloadReceipt(path) {
    const { data, error } = await supabase.storage.from('receipts').download(path);
    if (error) throw error;
    return data; // Blob
  },
  async removeReceipt(path) {
    const { error } = await supabase.storage.from('receipts').remove([path]);
    if (error) throw error;
  },
  async receiptUrl(path) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
    if (error) throw error;
    return data?.signedUrl || null;
  },
};
