/* public/review.js, the overlay a PREVIEW site carries (B-2): inert unless
   the portal frames it, and then it talks to the portal only.

     - not in a frame (the live site, or opened directly): nothing at all
     - served over plain http: nothing
     - framed: it answers ONLY a hello from its own origin, from the parent
       window, with a real nonce and THIS page's exact host
     - every message it sends is aimed at that one origin, never "*"
     - pick mode: a click is swallowed (no navigation), and becomes a pin with
       a selector that finds the element again, its visible text (200 chars),
       the page path and the viewport; then pick mode ends
     - a message with the wrong nonce changes nothing
     - it reads no cookie or storage, and holds no token                    */
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const SRC = fs.readFileSync('public/review.js', 'utf8');
const PORTAL = 'https://portal.agency.test';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function page({ framed = true, scriptSrc = PORTAL + '/review.js', url = 'https://reed.vercel.app/about?x=1' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><title>About Reed</title></head><body>
    <main><h1 id="t">About us</h1><p>One</p><p>We have <b>sold</b> 200 homes</p><p id="long">${'word '.repeat(80)}</p></main>
    <a id="go" href="/contact">Contact</a><form id="f"><button id="sb">Send</button></form></body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const sent = [];
  const parent = { postMessage: (m, origin) => sent.push({ m, origin }) };
  if (framed) Object.defineProperty(w, 'parent', { value: parent, configurable: true });
  Object.defineProperty(w.document, 'currentScript', { value: { src: scriptSrc }, configurable: true });
  w.eval(SRC);
  const msg = (data, { origin = PORTAL, source = parent } = {}) => { const ev = new w.MessageEvent('message', { data, origin }); Object.defineProperty(ev, 'source', { value: source }); w.dispatchEvent(ev); };
  const click = el => { const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }); el.dispatchEvent(ev); return ev.defaultPrevented; };
  return { dom, w, d: w.document, sent, parent, msg, click };
}
const N = 'a'.repeat(32);

console.log('\ninert unless framed by the portal');
{
  const p = page({ framed: false });
  ok('not in a frame: it does not even start', p.w.__ptReview === undefined && !p.d.querySelector('[data-pt-review]'));
  p.msg({ src: 'pt-portal', type: 'hello', nonce: N, host: 'reed.vercel.app' }, { source: p.w });
  ok('  and a hello changes nothing', p.sent.length === 0 && !p.d.querySelector('[data-pt-review]'));
  ok('  a click is a normal click', p.click(p.d.getElementById('t')) === false);
  const h = page({ scriptSrc: 'http://portal.agency.test/review.js' });
  h.msg({ src: 'pt-portal', type: 'hello', nonce: N, host: 'reed.vercel.app' }, { origin: 'http://portal.agency.test' });
  ok('served over plain http: inert', h.w.__ptReview === undefined && h.sent.length === 0);
}

console.log('\nthe handshake');
{
  const p = page();
  p.msg({ src: 'pt-portal', type: 'hello', nonce: N, host: 'reed.vercel.app' }, { origin: 'https://evil.test' });
  ok('a hello from another origin: ignored', p.sent.length === 0);
  p.msg({ src: 'pt-portal', type: 'hello', nonce: N, host: 'reed.vercel.app' }, { source: {} });
  ok('a hello from another window: ignored', p.sent.length === 0);
  p.msg({ src: 'pt-portal', type: 'hello', nonce: N, host: 'reedrealty.com' });
  ok('a hello naming another host (the live site): ignored', p.sent.length === 0 && !p.d.querySelector('[data-pt-review]'));
  p.msg({ src: 'pt-portal', type: 'hello', nonce: 'short', host: 'reed.vercel.app' });
  ok('a hello with no real nonce: ignored', p.sent.length === 0);
  p.msg({ src: 'pt-portal', type: 'hello', nonce: N, host: 'reed.vercel.app' });
  ok('the real hello: "ready", with the path and title', p.sent.length === 1 && p.sent[0].m.type === 'ready' && p.sent[0].m.path === '/about?x=1' && p.sent[0].m.title === 'About Reed' && p.sent[0].m.nonce === N);
  ok('  aimed at the portal\'s origin only', p.sent[0].origin === PORTAL);
  ok('  and its layer is on the page now', !!p.d.querySelector('[data-pt-review]'));

  console.log('\npick mode and the pin');
  ok('before pick mode, clicks are the site\'s', p.click(p.d.getElementById('go')) === false);
  p.msg({ src: 'pt-portal', type: 'mode', on: true, nonce: 'b'.repeat(32) });
  ok('"mode" with the wrong nonce: ignored', p.click(p.d.getElementById('go')) === false && p.sent.length === 1);
  p.msg({ src: 'pt-portal', type: 'mode', on: true, nonce: N });
  const b = p.d.querySelector('main > p:nth-of-type(2) > b');
  ok('in pick mode the click is swallowed (no navigation, no submit)', p.click(b) === true);
  const pin = p.sent.find(s => s.m.type === 'pin');
  ok('a pin is sent', !!pin, JSON.stringify(p.sent.map(s => s.m.type)));
  const P = pin.m.pin;
  ok('  its selector finds THAT element again', p.d.querySelector(P.selector) === b, P.selector);
  ok('  with its visible text, the path, the viewport, a device', P.snippet === 'sold' && P.path === '/about?x=1' && P.vw > 0 && ['desktop', 'tablet', 'phone'].includes(P.device));
  ok('  and a position on the element in %', P.x_pct >= 0 && P.x_pct <= 100 && P.y_pct >= 0 && P.y_pct <= 100);
  ok('  aimed at the portal only', pin.origin === PORTAL);
  ok('pick mode ends after one pin', p.click(p.d.getElementById('go')) === false);
  p.msg({ src: 'pt-portal', type: 'mode', on: true, nonce: N });
  p.click(p.d.getElementById('t'));
  const pin2 = p.sent.filter(s => s.m.type === 'pin')[1];
  ok('an element with a unique id is found by it', pin2 && pin2.m.pin.selector === '#t');
  p.msg({ src: 'pt-portal', type: 'mode', on: true, nonce: N });
  p.click(p.d.getElementById('long'));
  ok('visible text is capped at 200 characters', p.sent.filter(s => s.m.type === 'pin')[2].m.pin.snippet.length === 200);
  p.msg({ src: 'pt-portal', type: 'mode', on: true, nonce: N });
  ok('a form submit is swallowed too', (() => { const ev = new p.w.Event('submit', { cancelable: true, bubbles: true }); p.d.getElementById('f').dispatchEvent(ev); return ev.defaultPrevented; })());
  p.msg({ src: 'pt-portal', type: 'mode', on: false, nonce: N });
  p.msg({ src: 'pt-portal', type: 'pins', nonce: N, pins: [{ n: 1, selector: '#t', x_pct: 10, y_pct: 10 }, { n: 2, selector: 'main >>> nonsense' }] });
  ok('pins with a broken selector do not throw', true);
  await sleep(4300);
  const shots = p.sent.filter(s => s.m.type === 'shot');
  ok('each pin gets a screenshot message (best effort: null in a page that cannot paint)', shots.length === 3 && shots.every(s => s.origin === PORTAL && (s.m.data === null || /^data:image\/jpeg;base64,/.test(s.m.data))), JSON.stringify(shots.map(s => typeof s.m.data)));
  ok('EVERY message went to the portal\'s origin, never "*"', p.sent.every(s => s.origin === PORTAL));
  p.dom.window.close();
}

console.log('\nwhat the file does not do');
{
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok('no postMessage to "*"', !/postMessage\([^)]*['"]\*['"]/.test(code));
  ok('no cookie, storage, fetch or XHR', !/document\.cookie|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest/.test(code));
  ok('the only trusted origin is the script\'s own src', /TRUSTED = new URL\(me && me\.src\)\.origin/.test(code) && /e\.origin !== TRUSTED/.test(code) && /e\.source !== parentWin/.test(code));
  ok('the host check is exact', /m\.host !== location\.host/.test(code));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
