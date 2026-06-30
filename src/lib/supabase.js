import { createClient } from '@supabase/supabase-js';

/* Publishable key — safe to live in client code (Supabase says so on the API Keys page).
   Real protection is Row Level Security + your two logins. NEVER put the secret key here. */
const SUPABASE_URL = 'https://mqpswqiqhhitdcdugqsp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_v6u7TC2rCbcQjDfG6PV7ew_mKDED3Ym';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---- auth: username + password (mapped to an internal address) ---- */
const emailFor = u => `${(u || '').trim().toLowerCase()}@proytech.app`;
export const auth = {
  login(username, password) { return supabase.auth.signInWithPassword({ email: emailFor(username), password }); },
  logout() { return supabase.auth.signOut(); },
  async session() { const { data } = await supabase.auth.getSession(); return data.session; },
  onChange(cb) { return supabase.auth.onAuthStateChange((_e, s) => cb(s)); },
  username(session) { return (session?.user?.email || '').split('@')[0]; },
};

/* ---- data: leads as JSON rows + one shared settings row ---- */
const SENTINEL = '00000000-0000-0000-0000-000000000000';
export const db = {
  async getLeads() {
    const { data, error } = await supabase.from('leads').select('id,data');
    if (error) throw error;
    return (data || []).map(r => ({ ...r.data, id: r.id }));
  },
  async upsertLead(lead) {
    const { error } = await supabase.from('leads').upsert({ id: lead.id, data: { ...lead, id: lead.id } });
    if (error) throw error;
  },
  async upsertMany(leads) {
    if (!leads.length) return;
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
};
