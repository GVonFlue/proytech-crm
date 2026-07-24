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
  onChange(cb) { return supabase.auth.onAuthStateChange((_e, s) => cb(s)); },
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
  /* password-reset / set-your-password email */
  async sendReset(email) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ email: (email || '').trim().toLowerCase() }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || j.error || 'Could not send that email.'); }
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
    const { data, error } = await supabase.from('crm_users').select('id,name,email,role,pools,commission_pct,active,tabs,goal_conversions');
    if (error) { if (error.code === '42P01') return []; throw error; }
    return (data || []).map(u => ({ ...u, pools: u.pools || [], tabs: u.tabs || [] }));
  },
  /* The definitive answer to "who am I". A rep can only SEE their own
     crm_users row, so the browser cannot tell "no owners exist" apart from
     "I'm not allowed to see the owners" — this function can.
     Returns null on installs that haven't run MIGRATION.sql yet. */
  async whoami() {
    const { data, error } = await supabase.rpc('crm_whoami');
    if (error) { if (error.code === '42883' || error.code === 'PGRST202') return null; throw error; }
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return null;
    return { role: r.role, active: r.active !== false, setup: !!r.setup, name: r.name || '',
      pools: r.pools || [], commission_pct: Number(r.commission_pct) || 0,
      tabs: r.tabs || [], goal_conversions: Number(r.goal_conversions) || 0 };
  },
  async upsertUser(u) {
    const row = { id: u.id, name: u.name, email: u.email || null, role: u.role || 'rep', pools: u.pools || [],
      commission_pct: Number(u.commission_pct) || 0, active: u.active !== false, tabs: u.tabs || [],
      goal_conversions: Number(u.goal_conversions) || 0 };
    const { error } = await supabase.from('crm_users').upsert(row);
    if (error) throw error;
  },
  async deleteUser(id) {
    const { error } = await supabase.from('crm_users').delete().eq('id', id);
    if (error) throw error;
  },
  /* Leaderboard counts. A rep can only READ their own leads, so the ranking
     cannot be computed in the browser — it comes from a security-definer
     function that returns names and conversion COUNTS only, never money. */
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
