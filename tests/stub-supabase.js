/* signed-in stub of ./lib/supabase — no network, no Postgres */
export const configured = true;
export const supabase = {};
/* The signed-in identity. Fixed at u_owner unless a test says otherwise —
   __UID__/__EMAIL__ let a test sign a DIFFERENT person in without a reload,
   which is the only way to exercise anything keyed on who is signed in. */
const SESSION = { user: {
  get id() { return globalThis.__UID__ || 'u_owner'; },
  get email() { return globalThis.__EMAIL__ || 'garrett@getproytech.com'; },
} };
export const auth = {
  login: async () => ({ data: { session: SESSION }, error: null }),
  logout: async () => {},
  session: async () => SESSION,
  onChange: (cb) => { setTimeout(() => cb(SESSION, 'SIGNED_IN'), 0); return { data: { subscription: { unsubscribe(){} } } }; },
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
  whoami: async () => { const u=(globalThis.__USERS__||[])[0]; return u?{role:u.role,active:true,setup:true,name:u.name,pools:u.pools||[],commission_pct:0,tabs:u.tabs||[],nav_order:u.nav_order||[],goal_conversions:0}:null; },
  upsertUser: async (u) => { if(globalThis.__USER_SAVE_FAILS__) throw new Error('column nav_order does not exist');
    globalThis.__USER_WRITES__.push(JSON.parse(JSON.stringify(u)));
    const arr=globalThis.__USERS__||[]; const i=arr.findIndex(x=>x.id===u.id); if(i>=0) arr[i]={...arr[i],...u}; },
  deleteUser: async () => {},
  leaderboard: async () => [],
  uploadReceipt: async () => {}, downloadReceipt: async () => null,
  removeReceipt: async () => {}, receiptUrl: async () => '',
};
