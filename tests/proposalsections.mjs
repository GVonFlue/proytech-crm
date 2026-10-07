/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_ps = bundleName('ps');
const B_ps_entry_JSX = bundleName('ps-entry', '.jsx');
/* ONLY THE SECTIONS THAT APPLY TO WHAT IS BEING BOUGHT.
   ============================================================================

   Found in the first live test: "What you do not see" and "What we need from
   you" are offer-wide lists, so a Growth OS proposal WITHOUT Automations
   promised "Automations know when to stop" and "Review requests only go to
   customers whose job is finished" — things the client was not buying.

   Each line may now say which package / add-on ids it applies to (appliesTo);
   none means every proposal. buildBody keeps only the lines that apply, and a
   sent proposal keeps the lines it was sent with.                          */
import fs from 'node:fs'; import path from 'node:path'; import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const clone = v => JSON.parse(JSON.stringify(v));

const entry = path.join(ROOT, 'tests/'+B_ps_entry_JSX);
fs.writeFileSync(entry, `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
import ProposalDoc from '../src/ProposalDoc.jsx'; import * as P from '../src/lib/proposal.js';
export const render = body => renderToStaticMarkup(React.createElement(ProposalDoc, { body }));
export { P };`);
const built = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  loader: { '.js': 'jsx' }, external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'], logLevel: 'error' });
const out = path.join(ROOT, 'tests/'+B_ps); fs.writeFileSync(out, built.outputFiles[0].text);
const { render, P } = await import(out + '?' + Date.now());
fs.unlinkSync(entry); fs.unlinkSync(out);

const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'PROPOSAL-OFFER.json'), 'utf8'));
const { offer } = P.readOffer({ offer: RAW });
const bodyFor = (packageId, addonIds = [], o = offer) => {
  const q = P.quote(o, { packageId, addonIds, seats: 5 });
  return P.buildBody({ offer: o, q, copy: { headline: 'H' }, client: { name: 'C', company: 'C Co' }, preparedOn: '2026-10-06', validDays: 7 });
};
const AUTO = ['Automations know when to stop', 'Review requests only go to customers whose job is finished', 'Opt outs are handled automatically'];
const HOSTING = 'Hosting, SSL, backups and uptime monitoring are handled for you.';
const OWN = "You own what's yours";
const DOMAIN = 'Access to your domain, Google Business Profile and phone line where needed';
const has = (list, frag) => list.some(x => x.includes(frag));

console.log('\nthe shipped offer is tagged');
{
  const tag = t => (RAW.underneath.concat(RAW.needFromYou).find(e => e.text.startsWith(t)) || {}).appliesTo;
  ok('the three automation lines apply to automations only', AUTO.every(t => JSON.stringify(tag(t)) === '["automations"]'), AUTO.map(tag));
  ok('hosting / SSL applies to growth-os and website', JSON.stringify(tag('Hosting, SSL')) === '["growth-os","website"]');
  ok('"You own what\'s yours" applies to everything', JSON.stringify(tag(OWN)) === '[]');
  ok('domain / phone access applies to growth-os and website', JSON.stringify(tag('Access to your domain')) === '["growth-os","website"]');
  ok('the other "what we need" lines apply to everything', ['The onboarding form', 'Your customer list', 'Real photos'].every(t => JSON.stringify(tag(t)) === '[]'));
  ok('and the offer is still valid', P.validateOffer(RAW).ok, JSON.stringify(P.validateOffer(RAW).errors));
}

console.log('\nwhat each proposal gets');
{
  const g = bodyFor('growth-os').standard;
  ok('Growth OS alone: NO automation lines', !AUTO.some(t => has(g.underneath, t)), g.underneath);
  ok('  but hosting and "you own all of it"', has(g.underneath, HOSTING) && has(g.underneath, OWN));
  ok('  and domain access is something we need', has(g.needFromYou, DOMAIN) && g.needFromYou.length === 4);
  const ga = bodyFor('growth-os', ['automations']).standard;
  ok('Growth OS + Automations: every automation line', AUTO.every(t => has(ga.underneath, t)), ga.underneath);
  ok('  plus hosting and ownership', has(ga.underneath, HOSTING) && has(ga.underneath, OWN));
  const s = bodyFor('suite').standard;
  ok('Business Suite alone: no hosting line, no automation lines, ownership kept', !has(s.underneath, 'Hosting') && !AUTO.some(t => has(s.underneath, t)) && has(s.underneath, OWN), s.underneath);
  ok('  and no domain access to ask for', !has(s.needFromYou, DOMAIN) && s.needFromYou.length === 3);
  const w = bodyFor('website').standard;
  ok('Website alone: hosting, no automations', has(w.underneath, HOSTING) && !AUTO.some(t => has(w.underneath, t)));
  ok('the body stores plain lines, so the page and old proposals read it as before', g.underneath.every(x => typeof x === 'string') && g.needFromYou.every(x => typeof x === 'string'));
}

console.log('\nthe client sees it');
{
  const g = render(bodyFor('growth-os'));
  ok('the Growth OS proposal does not mention what automations do', !/Automations know when to stop/.test(g) && !/Review requests only go/.test(g));
  const ga = render(bodyFor('growth-os', ['automations']));
  ok('the Growth OS + Automations proposal does', /Automations know when to stop/.test(ga) && /Review requests only go/.test(ga));
}

console.log('\nolder offers and odd inputs');
{
  const plain = clone(RAW); plain.underneath = RAW.underneath.map(e => e.text); plain.needFromYou = RAW.needFromYou.map(e => e.text);
  const { offer: o } = P.readOffer({ offer: plain });
  ok('an offer saved before tags (plain strings) still puts every line on every proposal', bodyFor('growth-os', [], o).standard.underneath.length === 5);
  ok('appliesTo: one shared rule', P.appliesTo({ appliesTo: [] }, ['x']) && P.appliesTo({ appliesTo: ['a'] }, ['a', 'b']) && !P.appliesTo({ appliesTo: ['a'] }, ['b']));
  const bad = clone(RAW); bad.underneath[0].appliesTo = ['seo'];
  const v = P.validateOffer(bad);
  ok('a tag naming an item that is not in the offer is refused', !v.ok && v.errors.some(e => e.path === 'underneath.0.appliesTo' && /seo/.test(e.msg)), JSON.stringify(v.errors));
  const empty = clone(RAW); empty.needFromYou.push({ text: '  ', appliesTo: [] });
  ok('an empty tagged line is refused', P.validateOffer(empty).errors.some(e => e.path === `needFromYou.${RAW.needFromYou.length}`));
  const none = clone(RAW); none.underneath = RAW.underneath.filter(e => JSON.stringify(e.appliesTo) === '["automations"]');
  const { offer: o2 } = P.readOffer({ offer: none });
  ok('when nothing applies, the section is simply empty (and not rendered)', bodyFor('suite', [], o2).standard.underneath.length === 0 && !/What you do not see/.test(render(bodyFor('suite', [], o2))));
}

console.log('\na sent proposal keeps the lines it was sent with');
{
  const body = bodyFor('growth-os', ['automations']);
  const before = JSON.stringify(body);
  offer.underneath[0].appliesTo = ['website']; offer.underneath[0].text = 'CHANGED';
  ok('re-tagging or rewording the offer afterwards does not reach the body', JSON.stringify(body) === before);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
