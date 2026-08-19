/* signed-in stub of ./lib/supabase — no network, no Postgres */
export const configured = true;
export const supabase = {};
const SESSION = { user: { id: 'u_owner', email: 'garrett@getproytech.com' } };
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
  whoami: async () => { const u=(globalThis.__USERS__||[])[0]; return u?{role:u.role,active:true,setup:true,name:u.name,pools:u.pools||[],commission_pct:0,tabs:u.tabs||[],nav_order:u.nav_order||[],goal_conversions:0}:null; },
  upsertUser: async (u) => { if(globalThis.__USER_SAVE_FAILS__) throw new Error('column nav_order does not exist');
    globalThis.__USER_WRITES__.push(JSON.parse(JSON.stringify(u)));
    const arr=globalThis.__USERS__||[]; const i=arr.findIndex(x=>x.id===u.id); if(i>=0) arr[i]={...arr[i],...u}; },
  deleteUser: async () => {},
  leaderboard: async () => [],
  uploadReceipt: async () => {}, downloadReceipt: async () => null,
  removeReceipt: async () => {}, receiptUrl: async () => '',
};
