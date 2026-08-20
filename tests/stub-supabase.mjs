/* Stands in for src/lib/supabase.js inside the jsdom harness.

   Same exported shape as the real module — auth, db, configured — backed by
   globalThis.__DB__ instead of a network. Every mutation is appended to
   __DB__.writes so a test can assert on WHAT REACHED THE DATABASE rather than
   on what appeared on screen, which is the only assertion that would have
   caught the bugs this project has actually shipped.

   Deliberately NOT a mock library: the point is that App.jsx is unmodified and
   does not know it is being tested. */
const S = () => globalThis.__DB__;
const rec = (op, payload) => { S().writes.push({ op, ...payload }); };
const clone = v => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

export const configured = true;

export const auth = {
  async login() { return { data: { session: S().session }, error: null }; },
  async logout() { return { error: null }; },
  async session() { return S().session; },
  onChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  isRecoveryUrl() { return false; },
  async setPassword() { return true; },
  username(s) { return (s?.user?.email || '').split('@')[0]; },
  uid(s) { return s?.user?.id || null; },
  email(s) { return s?.user?.email || ''; },
  async createLogin(email) { rec('createLogin', { email }); return { id: 'uid-new', needsConfirm: false }; },
  async sendReset(email) { rec('sendReset', { email }); return true; },
};

export const db = {
  get migrated() { return true; },

  async getLeads() { return clone(S().leads); },
  async upsertLead(lead) {
    rec('upsertLead', { id: lead.id, lead: clone(lead) });
    const i = S().leads.findIndex(l => l.id === lead.id);
    if (i >= 0) S().leads[i] = clone(lead); else S().leads.push(clone(lead));
  },
  async upsertMany(leads) {
    rec('upsertMany', { count: leads.length, ids: leads.map(l => l.id) });
    leads.forEach(l => { const i = S().leads.findIndex(x => x.id === l.id); if (i >= 0) S().leads[i] = clone(l); else S().leads.push(clone(l)); });
  },
  async deleteLead(id) { rec('deleteLead', { id }); S().leads = S().leads.filter(l => l.id !== id); },
  async deleteAll() { rec('deleteAll', {}); S().leads = []; },

  async getEvents() { return clone(S().events); },
  async upsertEvent(ev) { rec('upsertEvent', { id: ev.id }); S().events.push(clone(ev)); },
  async deleteEvent(id) { rec('deleteEvent', { id }); S().events = S().events.filter(e => e.id !== id); },

  async getSettings() { return clone(S().settings); },
  async saveSettings(obj) { rec('saveSettings', { settings: clone(obj) }); S().settings = clone(obj); },

  async getInvoices() { return clone(S().invoices); },
  async saveInvoices(list) { rec('saveInvoices', { count: list.length }); S().invoices = clone(list); },
  async getTxns() { return clone(S().txns); },
  async saveTxns(list) { rec('saveTxns', { count: list.length }); S().txns = clone(list); },
  async getTasks() { return clone(S().tasks); },
  async saveTasks(list) { rec('saveTasks', { count: list.length, list: clone(list) }); S().tasks = clone(list); },

  /* Playbook. Two tables, kept separate here for the same reason they are
     separate in Postgres: kbAiContext must read the PUBLISHED surface and must
     never be able to reach kbNotes. */
  async getKbNotes() { return clone(S().kbNotes || []); },
  async upsertKbNote(n) { rec('upsertKbNote', { id: n.id, note: clone(n) }); },
  async deleteKbNote(id) { rec('deleteKbNote', { id }); },
  async getKbPublished() { return clone(S().kbPub || []); },
  async kbPreview(id) { rec('kbPreview', { id }); return null; },
  async kbPublish(id) { rec('kbPublish', { id }); },
  async kbUnpublish(id) { rec('kbUnpublish', { id }); },
  async kbAiContext() { return clone(S().kbPub || []); },

  async getPayouts() { return clone(S().payouts || []); },
  async addPayout(row) { rec('addPayout', { id: row.id, rep_id: row.rep_id, amount: row.amount }); },
  async deletePayout(id) { rec('deletePayout', { id }); },

  async getPocketRecordings() { return clone(S().pockets || []); },
  async getPocketRecording(id) { return clone((S().pockets || []).find(r => r.id === id) || null); },
  async setPocketStatus(id, status) { rec('setPocketStatus', { id, status }); },
  async savePocketProposals(id) { rec('savePocketProposals', { id }); },
  async deletePocketRecording(id) { rec('deletePocketRecording', { id }); },

  async getUsers() { return clone(S().users); },
  async whoami() { return clone(S().whoami); },
  async upsertUser(u) { rec('upsertUser', { user: clone(u) }); },
  async deleteUser(id) { rec('deleteUser', { id }); },
  async leaderboard() { return null; },

  async uploadReceipt(path) { rec('uploadReceipt', { path }); return path; },
  async downloadReceipt() { return null; },
  async removeReceipt(path) { rec('removeReceipt', { path }); },
  async receiptUrl() { return null; },
};
