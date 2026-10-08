/* SITE REVIEW (B-2) AGAINST A REAL POSTGRES — locally only.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS): it needs PGlite.
     npm i --no-save @electric-sql/pglite && node tests/reviewdb.mjs

   Applies every migration the portal needs, then REVIEW-MIGRATION.sql (twice:
   re-running is safe), and tries everything a client's browser could:

     - client A reads only A's review; there is no argument to aim at B
     - a client writes NO review table directly; only portal_note_save, and
       only into their own OPEN round
     - the server's functions refuse a browser; given a login id, they act on
       that login's client only, and refuse a CRM user or a removed client
     - rounds: one open at a time; an empty round cannot be submitted; the
       client's extra round only after the included ones (Terms 3.4: the
       proposal's revisionRounds, else 2)
     - a submitted note is frozen (only status, reason, done date change) and
       cannot be deleted; an approval can never change or go
     - the review dates the lifecycle reads, and review_summary() for an
       owner only (a rep and a client get nothing)
     - files: only a path the server named for that note
     - RLS-AUDIT.sql still passes
     - the rollback removes it all

   It is not VERIFY-RLS.md §19: PGlite is Postgres, not Supabase.          */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite, pgcrypto;
try { ({ PGlite } = await import('@electric-sql/pglite')); ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto')); }
catch { console.log('tests/reviewdb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 500) : ''))); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SUPABASE = read('tests/onbrlsdb.mjs').match(/const SUPABASE = `([\s\S]*?)`;/)[1];

const OWNER = '00000000-0000-4000-8000-0000000000a1', REP = '00000000-0000-4000-8000-0000000000a2',
  CA = '00000000-0000-4000-8000-0000000000c1', CA2 = '00000000-0000-4000-8000-0000000000c5', CB = '00000000-0000-4000-8000-0000000000c2',
  GONE = '00000000-0000-4000-8000-0000000000c3', BOTH = '00000000-0000-4000-8000-0000000000c4';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec('create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;');
const run = async sql => { try { await db.exec(sql); return ''; } catch (e) { try { await db.exec('rollback'); } catch {} return String(e.message || e); } };
async function as(who, sql, params) {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: who, role: 'authenticated' })}', true)`);
    await db.exec('set local role authenticated');
    const r = await db.query(sql, params);
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec('rollback'); }
}
/* like `as`, but KEEPS what it did (a client's note save is a real write) */
async function asKeep(who, sql, params) {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: who, role: 'authenticated' })}', true)`);
    await db.exec('set local role authenticated');
    const r = await db.query(sql, params);
    await db.exec('commit');
    return { rows: r.rows };
  } catch (e) { await db.exec('rollback'); return { error: String(e.message || e) }; }
}
const svc = async (sql, params) => { await db.exec('begin'); try { await db.exec('set local role service_role'); const r = (await db.query(sql, params)).rows; await db.exec('commit'); return r; } catch (e) { await db.exec('rollback'); return { error: String(e.message || e) }; } };
const one = async (sql, params) => { const r = await svc(sql, params); return Array.isArray(r) ? r[0] : r; };

console.log('\nthe migrations, in order');
await db.exec(SUPABASE);
await db.exec(`alter table auth.users add column if not exists last_sign_in_at timestamptz; alter table auth.users add column if not exists email text;`);
const ORDER = ['MIGRATION.sql', 'TEAM-MIGRATION.sql', 'REP-PAY-MIGRATION.sql', 'WHOAMI-RATE.sql', 'REP-PROFILE-MIGRATION.sql', 'KB-MIGRATION.sql',
  'REP-ACTIVITY-MIGRATION.sql', 'MEETING-MIGRATION.sql', 'POCKET-MIGRATION.sql', 'PAYMENT-METHOD-MIGRATION.sql', 'JARVIS-MIGRATION.sql',
  'PROPOSALS-MIGRATION.sql', 'PROPOSALS-LEGAL-MIGRATION.sql', 'PROPOSALS-ARCHIVE-MIGRATION.sql', 'ONBOARDING-MIGRATION.sql',
  'LIFECYCLE-MIGRATION.sql', 'RLS-TIGHTEN-2026-10.sql', 'STORAGE-TIGHTEN-2026-10.sql', 'AUTH-LISTED-2026-10.sql', 'PORTAL-MIGRATION.sql',
  'CLIENT-EMAILS-MIGRATION.sql', 'REVIEW-MIGRATION.sql'];
for (const f of ORDER) { const e = await run(read(f)); ok(f, e === '', e); }
ok('REVIEW-MIGRATION.sql again (re-running is safe)', (await run(read('REVIEW-MIGRATION.sql'))) === '');

await db.exec(`insert into auth.users (id, email) values ('${OWNER}','owner@agency.test'),('${REP}','rep@agency.test'),('${CA}','a@client-a.test'),('${CA2}','a2@client-a.test'),('${CB}','b@client-b.test'),('${GONE}','gone@client-g.test'),('${BOTH}','rep2@agency.test');
  insert into crm_users (id, name, role, active) values ('${OWNER}','Owner','owner',true),('${REP}','Rep','rep',true),('${BOTH}','Rep Two','rep',true);
  insert into leads (id, data, owner_id) values
    ('LA', '{"name":"Jordan Reed","email":"a@client-a.test","company":"Reed Realty Group","clientPhase":"build"}', '${OWNER}'),
    ('LB', '{"name":"Bea Other","email":"b@client-b.test","company":"Other Co"}', '${REP}'),
    ('LG', '{"name":"Gone","email":"gone@client-g.test","company":"Gone Co"}', '${OWNER}');
  insert into proposals (id, lead_id, token, status, body, accepted_at, accepted_name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','LA','${'A'.repeat(43)}','accepted','{"quote":{"setup":3000}}',now(),'Jordan Reed'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','LB','${'B'.repeat(43)}','accepted','{"quote":{"setup":9999,"revisionRounds":3}}',now(),'Bea');
  insert into client_users (id, lead_id, email, name) values ('${CA}','LA','a@client-a.test','Jordan Reed'),('${CA2}','LA','a2@client-a.test','Office Manager'),('${CB}','LB','b@client-b.test','Bea Other'),('${GONE}','LG','gone@client-g.test','Gone');
  update client_users set active = false where id = '${GONE}';
  insert into review_sites (lead_id, preview_url) values ('LA','https://reed-preview.vercel.app'),('LB','https://other-preview.vercel.app'),('LG','https://gone.vercel.app');
  insert into app_settings (id, data) values ('main', '{"review":{"hosts":["*.vercel.app"]}}') on conflict (id) do update set data = excluded.data;`);
const NOTE = (extra = {}) => JSON.stringify({ path: '/about', selector: 'main > h1', snippet: 'About   us', x_pct: 40, y_pct: 120, vw: 390, vh: 844, device: 'phone', comment: 'Make this bigger', ...extra });

console.log('\nno table is writable from a browser, by anyone');
for (const who of [CA, REP, OWNER]) {
  for (const t of ['review_sites', 'review_rounds', 'review_notes', 'site_approvals']) {
    const i = await as(who, `insert into ${t} default values`);
    const u = await as(who, `update ${t} set lead_id = lead_id`);
    const d = await as(who, `delete from ${t}`);
    ok(`${who === CA ? 'client' : who === REP ? 'rep' : 'owner'}: ${t} insert/update/delete refused or 0 rows`,
      !!i.error && (u.error || u.affected === 0) && (d.error || d.affected === 0), JSON.stringify([i, u, d]).slice(0, 300));
  }
}
ok('a client reads no review table directly', (await Promise.all(['review_sites', 'review_rounds', 'review_notes', 'site_approvals'].map(t => as(CA, `select count(*)::int n from ${t}`)))).every(r => r.error || r.rows[0].n === 0));
ok('a rep reads no review table', (await Promise.all(['review_sites', 'review_rounds', 'review_notes', 'site_approvals'].map(t => as(REP, `select count(*)::int n from ${t}`)))).every(r => r.error || r.rows[0].n === 0));
ok('an owner reads them', (await as(OWNER, 'select count(*)::int n from review_sites')).rows[0].n === 3);

console.log('\nthe server\'s functions refuse a browser');
for (const [f, args] of [['review_client', `'${CA}'`], ['review_state', `'LB'`], ['review_submit', `'${CA}'`], ['review_open_round', `'LA'`],
  ['review_approve', `'${CA}','Jordan','1.1.1.1','x'`], ['review_note_delete', `'${CA}', gen_random_uuid()`], ['review_set_file', `'${CA}', gen_random_uuid(), 'shot', 'x'`],
  ['review_request_extra', `'${CA}'`], ['review_upload_target', `'${CA}', gen_random_uuid()`], ['review_included', `'LA'`], ['review_dates', `'LA'`]]) {
  const r = await as(CA, `select ${f}(${args})`);
  ok(`${f}: a browser cannot call it`, /permission denied/.test(r.error || ''), JSON.stringify(r));
}

console.log('\nrounds: the owner opens, the client writes, one open at a time');
{
  const r0 = await as(CA, `select portal_note_save($1::jsonb) id`, [NOTE()]);
  ok('no open round: a note is refused', /no_open_round/.test(r0.error || ''), JSON.stringify(r0));
  const o1 = await one(`select review_open_round('LA') r`);
  ok('the owner opens round 1 of 2 (the default, no revisionRounds stated)', o1.r.number === 1 && o1.r.extra === false && o1.r.included === 2, JSON.stringify(o1));
  ok('a second open round is refused', (await one(`select review_open_round('LA') r`)).r.error === 'open');
  ok('client B: their proposal states 3 rounds', (await one(`select review_included('LB') n`)).n === 3);
  ok('a lead with no preview link cannot be opened', (await svc(`insert into leads (id, data) values ('LN','{}')`), (await one(`select review_open_round('LN') r`)).r.error === 'no_preview'));

  const s1 = await asKeep(CA, `select portal_note_save($1::jsonb) id`, [NOTE()]);
  ok('client A saves a note into THEIR open round', !s1.error && s1.rows[0].id, JSON.stringify(s1));
  const n1 = s1.rows[0].id;
  const row = (await db.query(`select * from review_notes where id = $1`, [n1])).rows[0];
  ok('  on their lead, their round, by them', row.lead_id === 'LA' && row.author === CA);
  ok('  clamped and cleaned: y 120 → 100, snippet whitespace collapsed', Number(row.y_pct) === 100 && row.snippet === 'About us' && row.device === 'phone');
  const s2 = await asKeep(CA2, `select portal_note_save($1::jsonb) id`, [NOTE({ path: '/', comment: 'Second login of the same client' })]);
  ok('a second login of the SAME client adds to the same round', !s2.error);
  const suite = await asKeep(CA, `select portal_note_save($1::jsonb) id`, [JSON.stringify({ kind: 'suite', comment: 'Pipeline needs a Nurture stage', path: '/x', selector: 'x' })]);
  ok('a Business Suite note: no pin fields kept', !suite.error && (await db.query(`select path, selector from review_notes where id = $1`, [suite.rows[0].id])).rows[0].selector === '');
  ok('a site note with no page is refused', /bad_path/.test((await as(CA, `select portal_note_save($1::jsonb)`, [NOTE({ path: 'about' })])).error || ''));
  ok('an empty comment is refused', /comment_length/.test((await as(CA, `select portal_note_save($1::jsonb)`, [NOTE({ comment: '   ' })])).error || ''));
  const edit = await asKeep(CA, `select portal_note_save($1::jsonb) id`, [JSON.stringify({ id: n1, comment: 'Make this MUCH bigger', selector: 'body', path: '/hack' })]);
  const after = (await db.query(`select comment, selector, path from review_notes where id = $1`, [n1])).rows[0];
  ok('editing a draft changes the comment ONLY (the pin stays)', !edit.error && after.comment === 'Make this MUCH bigger' && after.selector === 'main > h1' && after.path === '/about', JSON.stringify(after));

  ok('client B cannot edit A\'s note: no open round of theirs', /no_open_round/.test((await as(CB, `select portal_note_save($1::jsonb)`, [JSON.stringify({ id: n1, comment: 'mine now' })])).error || ''));
  await svc(`select review_open_round('LB')`);
  ok('  and with one open, it is still "not editable"', /not_editable/.test((await as(CB, `select portal_note_save($1::jsonb)`, [JSON.stringify({ id: n1, comment: 'mine now' })])).error || ''));
  ok('a removed client saves nothing', /not_a_client/.test((await as(GONE, `select portal_note_save($1::jsonb)`, [NOTE()])).error || ''));
  ok('a CRM user is not a client', /not_a_client/.test((await as(BOTH, `select portal_note_save($1::jsonb)`, [NOTE()])).error || ''));

  console.log('\nwhat a client reads');
  const a = (await as(CA, 'select portal_review() j')).rows[0].j;
  const b = (await as(CB, 'select portal_review() j')).rows[0].j;
  ok('A sees A\'s preview, 3 notes, round 1 of 2', a.preview_url === 'https://reed-preview.vercel.app' && a.notes.length === 3 && a.included === 2 && a.rounds.length === 1);
  ok('B sees B\'s and none of A\'s', b.preview_url === 'https://other-preview.vercel.app' && b.notes.length === 0 && !JSON.stringify(b).includes('reed-preview'));
  ok('no storage path, author id or IP leaves', !/shot_path|attach_path|author|"ip"|user_agent/.test(JSON.stringify(a)));
  ok('the hosts from Settings come along', JSON.stringify(a.hosts) === '["*.vercel.app"]');
  ok('a removed client, a CRM user, a rep: null', (await as(GONE, 'select portal_review() j')).rows[0].j === null && (await as(BOTH, 'select portal_review() j')).rows[0].j === null && (await as(REP, 'select portal_review() j')).rows[0].j === null);

  console.log('\nfiles: only the path the server names');
  ok('upload target: A\'s draft for A → LA', (await one(`select review_upload_target('${CA}', '${n1}') l`)).l === 'LA');
  ok('  for B → null', (await one(`select review_upload_target('${CB}', '${n1}') l`)).l === null);
  ok('a path outside the note\'s name is refused', (await one(`select review_set_file('${CA}', '${n1}', 'shot', 'LB/${n1}-shot-abcdefabcdef.jpg') r`)).r.error === 'bad_path');
  ok('  as is a ../ path', (await one(`select review_set_file('${CA}', '${n1}', 'shot', 'LA/${n1}-shot-../../x.jpg') r`)).r.error === 'bad_path');
  ok('the right path is recorded', (await one(`select review_set_file('${CA}', '${n1}', 'shot', 'LA/${n1}-shot-abcdefabcdef.jpg') r`)).r.ok === true);
  ok('  and replacing it hands back the old one to remove', (await one(`select review_set_file('${CA}', '${n1}', 'shot', 'LA/${n1}-shot-bbbbbbbbbbbb.jpg') r`)).r.replaced === `LA/${n1}-shot-abcdefabcdef.jpg`);

  console.log('\nsubmit, freeze');
  ok('B cannot delete A\'s draft', (await one(`select review_note_delete('${CB}', '${n1}') r`)).r === null);
  ok('B submitting submits B\'s (empty) round: refused as empty', (await one(`select review_submit('${CB}') r`)).r.error === 'empty');
  const sub = (await one(`select review_submit('${CA}') r`)).r;
  ok('A submits round 1: 3 notes', sub.number === 1 && sub.notes === 3 && sub.lead_id === 'LA', JSON.stringify(sub));
  ok('a note after submit is refused (no open round)', /no_open_round/.test((await as(CA, `select portal_note_save($1::jsonb)`, [NOTE()])).error || ''));
  ok('a submitted note cannot be deleted by the client', (await one(`select review_note_delete('${CA}', '${n1}') r`)).r === null);
  const frozen = await svc(`update review_notes set comment = 'rewritten' where id = '${n1}'`);
  ok('NOBODY (not even the server) can rewrite what the client wrote', !!frozen.error && /client's record/.test(frozen.error), JSON.stringify(frozen));
  ok('  nor delete it', /cannot be deleted/.test((await svc(`delete from review_notes where id = '${n1}'`)).error || ''));
  ok('  but its status can change', Array.isArray(await svc(`update review_notes set status = 'done', done_at = now() where id = '${n1}'`)));
  ok('won\'t do needs a reason', !!(await svc(`update review_notes set status = 'wont_do', reason = '' where lead_id = 'LA' and kind = 'suite'`)).error);

  console.log('\nthe dates the lifecycle reads');
  let d = (await one(`select review_dates('LA') d`)).d;
  ok('round 1 submitted → feedback_at; revisions not done while a note is open', !!d.feedback_at && d.revised_at === null && d.approved_at === null, JSON.stringify(d));
  await svc(`update review_notes set status = 'done', done_at = now() where lead_id = 'LA' and status = 'open' and kind = 'site'`);
  await svc(`update review_notes set status = 'wont_do', reason = 'Out of scope', done_at = now() where lead_id = 'LA' and kind = 'suite'`);
  d = (await one(`select review_dates('LA') d`)).d;
  ok('every note done or won\'t do → revised_at', !!d.revised_at);
  const sumOwner = await as(OWNER, 'select * from review_summary()');
  ok('review_summary(): an owner gets LA with its dates', !sumOwner.error && sumOwner.rows.some(r => r.lead_id === 'LA' && r.feedback_at && r.revised_at && r.rounds === 1 && r.open_notes === 0), JSON.stringify(sumOwner).slice(0, 300));
  ok('  a rep gets nothing', (await as(REP, 'select * from review_summary()')).rows.length === 0);
  ok('  a client gets nothing', (await as(CA, 'select * from review_summary()')).rows.length === 0);

  console.log('\nrounds beyond the included ones (Terms 3.4)');
  ok('the client cannot open an extra round while included rounds remain', (await one(`select review_request_extra('${CA}') r`)).r.error === 'not_yet');
  ok('the owner opens round 2 of 2 (not extra)', (await one(`select review_open_round('LA') r`)).r.extra === false);
  await asKeep(CA, `select portal_note_save($1::jsonb)`, [NOTE({ comment: 'Round two note' })]);
  await svc(`select review_submit('${CA}')`);
  const ex = (await one(`select review_request_extra('${CA}') r`)).r;
  ok('after both, the client asks: change round 3, extra (quoted)', ex.number === 3 && ex.extra === true, JSON.stringify(ex));
  ok('  a second ask while it is open is refused', (await one(`select review_request_extra('${CA}') r`)).r.error === 'open');

  console.log('\napproval: permanent');
  await asKeep(CA, `select portal_note_save($1::jsonb)`, [NOTE({ comment: 'Draft not submitted' })]);
  ok('refused while a draft note waits', (await one(`select review_approve('${CA}', 'Jordan Reed', '9.9.9.9', 'UA') r`)).r.error === 'unsubmitted');
  const draft = (await db.query(`select n.id from review_notes n join review_rounds r on r.id = n.round_id where n.lead_id = 'LA' and r.submitted_at is null`)).rows[0].id;
  ok('the client deletes the draft (its files come back to remove)', (await one(`select review_note_delete('${CA}', '${draft}') r`)).r !== null);
  ok('a one-letter name is refused', (await one(`select review_approve('${CA}', 'J', '9.9.9.9', 'UA') r`)).r.error === 'name');
  const ap = (await one(`select review_approve('${CA}', '  Jordan Reed ', '9.9.9.9', 'Mozilla') r`)).r;
  ok('approved: name trimmed, IP and browser from the server', ap.typed_name === 'Jordan Reed' && !!ap.approved_at);
  const arow = (await db.query(`select * from site_approvals where lead_id = 'LA'`)).rows[0];
  ok('  the record: IP, browser, preview URL, last round', arow.ip === '9.9.9.9' && arow.user_agent === 'Mozilla' && arow.preview_url === 'https://reed-preview.vercel.app' && arow.round_number === 2, JSON.stringify(arow));
  ok('  the empty open round is closed by it', (await db.query(`select count(*)::int n from review_rounds where lead_id = 'LA' and submitted_at is null`)).rows[0].n === 0);
  ok('a second approval is refused', (await one(`select review_approve('${CA}', 'Jordan Reed', '1.1.1.1', 'x') r`)).r.error === 'already');
  ok('NOBODY can change it', /permanent/.test((await svc(`update site_approvals set typed_name = 'Someone else'`)).error || ''));
  ok('  or delete it', /permanent/.test((await svc(`delete from site_approvals`)).error || ''));
  ok('after approval: no new round, no notes', (await one(`select review_open_round('LA') r`)).r.error === 'approved' && /approved/.test((await as(CA, `select portal_note_save($1::jsonb)`, [NOTE()])).error || ''));
  ok('approved_at reaches the dates', !!(await one(`select review_dates('LA') d`)).d.approved_at);
  ok('B approves B\'s own site (their empty open round closes)', (await one(`select review_approve('${CB}', 'Bea Other', '8.8.8.8', 'x') r`)).r.error === undefined);
  ok('A\'s approval is still A\'s only', (await db.query(`select lead_id from site_approvals order by 1`)).rows.map(r => r.lead_id).join() === 'LA,LB');
}

console.log('\nRLS-AUDIT.sql with the review tables in place');
{
  const e = await run(read('RLS-AUDIT.sql'));
  ok('RLS-AUDIT.sql passes', e === '', e);
  await db.exec(`create policy review_notes_leak on review_notes for update using (crm_listed())`);
  const e2 = await run(read('RLS-AUDIT.sql'));
  ok('  and FAILS when a write policy appears on a review table', /server-write-only/.test(e2), e2.slice(0, 200));
  await db.exec(`drop policy review_notes_leak on review_notes`);
}

console.log('\nthe rollback');
{
  const e = await run(read('REVIEW-MIGRATION-ROLLBACK.sql'));
  const left = (await db.query(`select count(*)::int n from pg_class where relname in ('review_sites','review_rounds','review_notes','site_approvals')`)).rows[0].n
    + (await db.query(`select count(*)::int n from pg_proc where proname like 'review\\_%' or proname in ('portal_review','portal_note_save')`)).rows[0].n;
  ok('drops every table and function', e === '' && left === 0, e || left);
  ok('and the portal still works', !(await as(CA, 'select portal_home() j')).error);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
