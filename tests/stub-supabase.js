/* signed-in stub of ./lib/supabase — no network, no Postgres */
export const configured = true;
export const supabase = {};
/* The signed-in identity. Fixed at u_owner unless a test says otherwise —
   __UID__/__EMAIL__ let a test sign a DIFFERENT person in without a reload,
   which is the only way to exercise anything keyed on who is signed in. */
const SESSION = {
  /* apiPost reads this to attach the bearer token, so a test can tell an
     authenticated call from an unauthenticated one — which is the whole
     difference the guarded endpoints care about. */
  access_token: 'test-access-token',
  user: {
  get id() { return globalThis.__UID__ || 'u_owner'; },
  get email() { return globalThis.__EMAIL__ || 'garrett@getproytech.com'; },
} };
export const auth = {
  login: async () => ({ data: { session: SESSION }, error: null }),
  logout: async () => {},
  /* A test can start the app SIGNED OUT and sign in later. That is the only way
     to exercise anything whose correctness depends on WHEN the session arrives
     — an effect keyed on mount looks identical to one keyed on the session
     until the two happen in a different order. Default is unchanged: signed in
     immediately, so no existing test sees a difference. */
  session: async () => (globalThis.__SIGNED_OUT__ ? null : SESSION),
  onChange: (cb) => {
    (globalThis.__AUTH_SUBS__ || (globalThis.__AUTH_SUBS__ = new Set())).add(cb);
    setTimeout(() => cb(globalThis.__SIGNED_OUT__ ? null : SESSION,
      globalThis.__SIGNED_OUT__ ? 'SIGNED_OUT' : 'SIGNED_IN'), 0);
    return { data: { subscription: { unsubscribe(){ globalThis.__AUTH_SUBS__.delete(cb); } } } };
  },
  isRecoveryUrl: () => false,
  setPassword: async () => true,
  username: s => (s?.user?.email || '').split('@')[0],
  uid: s => s?.user?.id || null,
  email: s => s?.user?.email || '',
  createLogin: async () => ({ id: 'u_new', needsConfirm: false }),
  sendReset: async () => true,
};
export const LEADS = globalThis.__LEADS__ || [];
export const db = {
  get migrated(){ return true; },
  getLeads: async () => JSON.parse(JSON.stringify(globalThis.__LEADS__ || [])),
  upsertLead: async (l) => { globalThis.__WRITES__.push(l); },
  upsertMany: async (a) => { globalThis.__MANY__ = globalThis.__MANY__||[]; globalThis.__MANY__.push(JSON.parse(JSON.stringify(a))); a.forEach(l=>globalThis.__WRITES__.push(l)); },
  getMeetingLogs: async () => globalThis.__MLOGS__ || [],
  /* Playbook. TWO reads because there are two tables, and the stub keeps them
     genuinely separate: __KB_NOTES__ is what kb_notes returns (a rep's array is
     empty because Postgres gave them nothing), __KB_PUB__ is kb_published.
     kbAiContext reads __KB_PUB__ and NEVER __KB_NOTES__ — the stub mirrors what
     kb_ai_context() does in SQL, so a test that leaks a draft through it would
     be a test of a lie. */
  getKbNotes: async () => JSON.parse(JSON.stringify(globalThis.__KB_NOTES__ || [])),
  upsertKbNote: async (n) => { (globalThis.__KB_WRITES__ = globalThis.__KB_WRITES__ || []).push(JSON.parse(JSON.stringify(n)));
    const a=globalThis.__KB_NOTES__||[]; const i=a.findIndex(x=>x.id===n.id); if(i>=0) a[i]={...a[i],...n}; else a.unshift({...n}); },
  deleteKbNote: async (id) => { (globalThis.__KB_DELETED__ = globalThis.__KB_DELETED__ || []).push(id);
    globalThis.__KB_NOTES__=(globalThis.__KB_NOTES__||[]).filter(x=>x.id!==id); },
  getKbPublished: async () => JSON.parse(JSON.stringify(globalThis.__KB_PUB__ || [])),
  kbPreview: async (id) => { (globalThis.__KB_PREVIEWS__ = globalThis.__KB_PREVIEWS__ || []).push(id);
    if (globalThis.__KB_PREVIEW_ROW__) return globalThis.__KB_PREVIEW_ROW__;
    const n=(globalThis.__KB_NOTES__||[]).find(x=>x.id===id);
    return n?{title:n.title||'Untitled',category:n.category||'',tags:n.tags||[],body:n.body||''}:null; },
  kbPublish: async (id) => { (globalThis.__KB_PUBLISHED__ = globalThis.__KB_PUBLISHED__ || []).push(id);
    const n=(globalThis.__KB_NOTES__||[]).find(x=>x.id===id); if(!n) return;
    n.status='published';
    const row={id,title:n.title||'Untitled',category:n.category||'',tags:n.tags||[],body:n.body||'',published_at:new Date().toISOString()};
    const a=globalThis.__KB_PUB__=globalThis.__KB_PUB__||[]; const i=a.findIndex(x=>x.id===id); if(i>=0) a[i]=row; else a.unshift(row); },
  kbUnpublish: async (id) => { (globalThis.__KB_UNPUBLISHED__ = globalThis.__KB_UNPUBLISHED__ || []).push(id);
    const n=(globalThis.__KB_NOTES__||[]).find(x=>x.id===id); if(n) n.status='draft';
    globalThis.__KB_PUB__=(globalThis.__KB_PUB__||[]).filter(x=>x.id!==id); },
  kbAiContext: async () => JSON.parse(JSON.stringify(globalThis.__KB_PUB__ || [])),

  /* ---- Playbook progress and last sign-in (REP-ACTIVITY-MIGRATION.sql) ----

     __KB_READS__ is what kb_reads returns. UNDEFINED means the migration has
     not been run, which the app must survive: getKbReads resolves to null and
     the gate stays open. A suite that wants a gated rep sets it to [].
     __LAST_SEEN__ likewise stands in for crm_last_seen(). */
  getKbReads: async (repId) => {
    if (globalThis.__KB_READS__ === undefined) return null;
    const all = JSON.parse(JSON.stringify(globalThis.__KB_READS__ || []));
    return repId ? all.filter(r => r.rep_id === repId) : all;
  },
  /* kb_mark_read() stamps auth.uid() and takes no parameter for whose read it
     is — the stub keeps that property so a test cannot accidentally prove
     something the real function would refuse. */
  kbMarkRead: async (noteId, kind = 'read') => {
    if (globalThis.__KB_READS__ === undefined) return false;
    const who = (globalThis.__WHOAMI__ && globalThis.__WHOAMI__.id)
      || ((globalThis.__USERS__ || [])[0] || {}).id || 'u_me';
    (globalThis.__KB_MARKS__ = globalThis.__KB_MARKS__ || []).push({ noteId, kind, rep_id: who });
    globalThis.__KB_READS__.push({ id: globalThis.__KB_READS__.length + 1, rep_id: who,
      note_id: noteId, kind, at: new Date().toISOString() });
    return true;
  },
  kbResetProgress: async (repId) => {
    (globalThis.__KB_RESETS__ = globalThis.__KB_RESETS__ || []).push(repId);
    if (globalThis.__KB_READS__ !== undefined) {
      globalThis.__KB_READS__.push({ id: globalThis.__KB_READS__.length + 1, rep_id: repId,
        note_id: null, kind: 'reset', at: new Date().toISOString() });
    }
    return true;
  },
  /* rep_notes. OWNER-ONLY IN POSTGRES — one policy, is_owner() on both sides,
     so a rep's login gets zero rows. The stub models the POLICY, not a filter:
     if the caller is not an owner it returns [] no matter what __REP_NOTES__
     contains, so a suite can hand a rep's browser notes it should never have
     had and watch the app surface none of them. */
  getRepNotes: async (repId) => {
    if (globalThis.__REP_NOTES__ === undefined) return null;
    const who = (globalThis.__WHOAMI__ && globalThis.__WHOAMI__.role)
      || (((globalThis.__USERS__ || [])[0] || {}).role) || 'owner';
    if (who !== 'owner') return [];
    const all = JSON.parse(JSON.stringify(globalThis.__REP_NOTES__ || []));
    return repId ? all.filter(n => n.rep_id === repId) : all;
  },
  addRepNote: async (row) => {
    (globalThis.__REP_NOTE_WRITES__ = globalThis.__REP_NOTE_WRITES__ || []).push(row);
    const n = { id: (globalThis.__REP_NOTES__ || []).length + 1, rep_id: row.repId,
      body: row.body, by_id: row.byId, by_name: row.byName, at: new Date().toISOString() };
    (globalThis.__REP_NOTES__ = globalThis.__REP_NOTES__ || []).push(n);
    return n;
  },
  deleteRepNote: async (id) => {
    globalThis.__REP_NOTES__ = (globalThis.__REP_NOTES__ || []).filter(n => n.id !== id);
  },
  /* MAPPED, exactly as the real db.lastSeen() maps it. The stub REPLACES the db
     module, so returning the raw column name here would let a screen read
     `lastSignInAt` off undefined and render "never signed in" for somebody who
     signs in daily — passing every test while being wrong on the screen. */
  lastSeen: async () => (globalThis.__LAST_SEEN__ === undefined ? null
    : JSON.parse(JSON.stringify(globalThis.__LAST_SEEN__))
        .map(r => ({ id: r.id, lastSignInAt: r.lastSignInAt || r.last_sign_in_at || '' }))),
  /* Content Studio. Only reached by a bundle built with VITE_CONTENT_STUDIO
     set — the tab does not exist otherwise, so every other suite here goes
     nowhere near these. Writes land in __CONTENT_WRITES__ so a test asserts on
     what reached the database rather than on what appeared on screen. */
  getContentContext: async () => JSON.parse(JSON.stringify(globalThis.__CONTENT_CTX__ || [])),
  saveContentContext: async (row) => {
    (globalThis.__CONTENT_WRITES__ = globalThis.__CONTENT_WRITES__ || []).push({ op: 'saveContext', row: JSON.parse(JSON.stringify(row)) });
    const a = globalThis.__CONTENT_CTX__ = globalThis.__CONTENT_CTX__ || [];
    const saved = { ...row, id: row.id || 'ctx_' + (a.length + 1) };
    const i = a.findIndex(x => x.id === saved.id);
    if (i >= 0) a[i] = saved; else a.push(saved);
    return JSON.parse(JSON.stringify(saved));
  },
  addContentContext: async (rows) => {
    (globalThis.__CONTENT_WRITES__ = globalThis.__CONTENT_WRITES__ || []).push({ op: 'addContext', rows: JSON.parse(JSON.stringify(rows)) });
    const a = globalThis.__CONTENT_CTX__ = globalThis.__CONTENT_CTX__ || [];
    const made = (rows || []).map((r, i) => ({ ...r, id: 'imp_' + (a.length + i + 1) }));
    made.forEach(r => a.push(r));
    return JSON.parse(JSON.stringify(made));
  },
  deleteContentContext: async (id) => {
    (globalThis.__CONTENT_WRITES__ = globalThis.__CONTENT_WRITES__ || []).push({ op: 'deleteContext', id });
    globalThis.__CONTENT_CTX__ = (globalThis.__CONTENT_CTX__ || []).filter(x => x.id !== id);
  },
  getContentPosts: async () => JSON.parse(JSON.stringify(globalThis.__CONTENT_POSTS__ || [])),
  updateContentPost: async (id, patch) => {
    (globalThis.__CONTENT_WRITES__ = globalThis.__CONTENT_WRITES__ || []).push({ op: 'updatePost', id, patch: JSON.parse(JSON.stringify(patch)) });
    const a = globalThis.__CONTENT_POSTS__ || [];
    const i = a.findIndex(x => x.id === id);
    if (i < 0) return null;
    a[i] = { ...a[i], ...patch };
    return JSON.parse(JSON.stringify(a[i]));
  },
  getContentResearch: async () => JSON.parse(JSON.stringify(globalThis.__CONTENT_RESEARCH__ || [])),
  addContentResearch: async (row) => {
    (globalThis.__CONTENT_WRITES__ = globalThis.__CONTENT_WRITES__ || []).push({ op: 'addResearch', row: JSON.parse(JSON.stringify(row)) });
    const saved = { id: 'res_new', used: false, captured_at: '2026-08-22T00:00:00.000Z', ...row };
    (globalThis.__CONTENT_RESEARCH__ = globalThis.__CONTENT_RESEARCH__ || []).unshift(saved);
    return JSON.parse(JSON.stringify(saved));
  },
  /* rep payouts — money OUT to a person. Earnings are derived from held
     meetings and never stored, so there is nothing to stub for those. */
  getPayouts: async () => JSON.parse(JSON.stringify(globalThis.__PAYOUTS__ || [])),
  addPayout: async (row) => { (globalThis.__PAYOUT_WRITES__ = globalThis.__PAYOUT_WRITES__ || []).push(row);
    (globalThis.__PAYOUTS__ = globalThis.__PAYOUTS__ || []).unshift(row); },
  deletePayout: async (id) => { globalThis.__PAYOUTS__ = (globalThis.__PAYOUTS__ || []).filter(x => x.id !== id); },
  /* Pocket recordings. The list deliberately omits the transcript, exactly as
     the real getPocketRecordings does — a test that hands the list a transcript
     would hide the bug where a screen reads it from the wrong place. */
  getPocketRecordings: async () => (globalThis.__POCKETS__ || []).map(r => {
    const { transcript, ...rest } = r; return JSON.parse(JSON.stringify(rest));
  }),
  getPocketRecording: async (id) => { (globalThis.__POCKET_LOADS__ = globalThis.__POCKET_LOADS__ || []).push(id);
    const r = (globalThis.__POCKETS__ || []).find(x => x.id === id); return r ? JSON.parse(JSON.stringify(r)) : null; },
  setPocketStatus: async (id, status) => { (globalThis.__POCKET_STATUS__ = globalThis.__POCKET_STATUS__ || []).push({ id, status });
    const r = (globalThis.__POCKETS__ || []).find(x => x.id === id); if (r) r.status = status; },
  savePocketProposals: async (id, proposals) => { (globalThis.__POCKET_PROPOSALS__ = globalThis.__POCKET_PROPOSALS__ || []).push({ id, proposals }); },
  deletePocketRecording: async (id) => { (globalThis.__POCKET_DELETED__ = globalThis.__POCKET_DELETED__ || []).push(id);
    globalThis.__POCKETS__ = (globalThis.__POCKETS__ || []).filter(x => x.id !== id); },
  upsertMeetingLog: async (l) => { (globalThis.__MLOG_WRITES__ = globalThis.__MLOG_WRITES__ || []).push(l); },
  deleteMeetingLog: async () => {},
  deleteLead: async (id) => { (globalThis.__DELETED__ = globalThis.__DELETED__ || []).push(id); }, deleteAll: async () => {},
  getEvents: async () => JSON.parse(JSON.stringify(globalThis.__EVENTS__ || [])),
  upsertEvent: async (e) => { globalThis.__EVENT_WRITES__.push(JSON.parse(JSON.stringify(e)));
    const a=globalThis.__EVENTS__||[]; const i=a.findIndex(x=>x.id===e.id); if(i>=0) a[i]=e; else a.unshift(e); },
  deleteEvent: async (id) => { globalThis.__EVENTS__=(globalThis.__EVENTS__||[]).filter(x=>x.id!==id); },
  getSettings: async () => (globalThis.__SETTINGS__ || null), saveSettings: async (st) => { globalThis.__SETTINGS_WRITES__ = globalThis.__SETTINGS_WRITES__||[]; globalThis.__SETTINGS_WRITES__.push(st); },
  getInvoices: async () => [], saveInvoices: async () => {},
  getTxns: async () => Array.isArray(globalThis.__TXNS__) ? globalThis.__TXNS__ : [],
  saveTxns: async (l) => { globalThis.__TXNS__ = l; },
  getTasks: async () => JSON.parse(JSON.stringify(globalThis.__TASKS__ || [])), saveTasks: async () => {},
  getUsers: async () => JSON.parse(JSON.stringify(globalThis.__USERS__ || [])),
  /* crm_team(): names and roles for every ACTIVE person, and no money. The
     stub mirrors the boundary rather than the convenience — getUsers() above
     is what RLS narrows to one row for a rep, and team() is what does not.
     __TEAM__ unset means the install has not run TEAM-MIGRATION.sql, which
     returns [] and makes every caller fall back to its old behaviour. */
  team: async () => (globalThis.__TEAM__ === undefined ? [] :
    JSON.parse(JSON.stringify(globalThis.__TEAM__ || []))
      .map(u => ({ id: u.id, name: u.name, role: u.role }))),
  /* crm_whoami(). By default it answers from __USERS__[0], exactly as before.
     __WHOAMI__ overrides it outright — including with null — because the three
     states a signed-in user can be in (no row / fresh install / whoami failed)
     are answered by this function and CANNOT be modelled by varying __USERS__:
     an empty __USERS__ returns null, which is only one of the three. */
  whoami: async () => {
    if (Object.prototype.hasOwnProperty.call(globalThis, '__WHOAMI__')) return globalThis.__WHOAMI__;
    const u=(globalThis.__USERS__||[])[0]; return u?{role:u.role,active:true,setup:true,name:u.name,pools:u.pools||[],commission_pct:0,tabs:u.tabs||[],nav_order:u.nav_order||[],goal_conversions:0}:null; },
  upsertUser: async (u) => { if(globalThis.__USER_SAVE_FAILS__) throw new Error('column nav_order does not exist');
    globalThis.__USER_WRITES__.push(JSON.parse(JSON.stringify(u)));
    const arr=globalThis.__USERS__||[]; const i=arr.findIndex(x=>x.id===u.id); if(i>=0) arr[i]={...arr[i],...u}; },
  deleteUser: async () => {},
  leaderboard: async () => [],
  uploadReceipt: async () => {}, downloadReceipt: async () => null,
  removeReceipt: async () => {}, receiptUrl: async () => '',
};
