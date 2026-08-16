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
  deleteLead: async () => {}, deleteAll: async () => {},
  getEvents: async () => JSON.parse(JSON.stringify(globalThis.__EVENTS__ || [])),
  upsertEvent: async (e) => { globalThis.__EVENT_WRITES__.push(JSON.parse(JSON.stringify(e)));
    const a=globalThis.__EVENTS__||[]; const i=a.findIndex(x=>x.id===e.id); if(i>=0) a[i]=e; else a.unshift(e); },
  deleteEvent: async (id) => { globalThis.__EVENTS__=(globalThis.__EVENTS__||[]).filter(x=>x.id!==id); },
  getSettings: async () => (globalThis.__SETTINGS__ || null), saveSettings: async (st) => { globalThis.__SETTINGS_WRITES__ = globalThis.__SETTINGS_WRITES__||[]; globalThis.__SETTINGS_WRITES__.push(st); },
  getInvoices: async () => [], saveInvoices: async () => {},
  getTxns: async () => [], saveTxns: async () => {},
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
