/* Can this text actually be read against what is behind it?  — the engine
   ============================================================================

   Replaces darksurface.mjs. That engine answered one question — "is this text
   light enough for a navy plate" — and it was right only as long as the whole
   view was navy. The lead view, the client dashboard and Relationships are now
   white with a navy band across the top, so "light text" is correct in the
   band and invisible everywhere else. A luminance threshold cannot say which;
   only the thing behind the text can.

   So this measures a real WCAG contrast ratio, per element:

     TEXT     the element's resolved colour, faded by its own alpha and by
              every ancestor's opacity (a dimmed chip really is dimmer).
     GROUND   walk up from the element collecting background colours and
              composite them — translucent tints over whatever is opaque
              beneath, down to the first opaque layer, or white if none.

   What it cannot see: a background painted only as background-image (a
   gradient). Anything that paints text over a gradient therefore ALSO sets
   background-color — the navy band does, on purpose, so this can read it.

   jsdom resolves the cascade but hands back var() verbatim, so custom
   properties are resolved by hand against the nearest element declaring them.

   USAGE
     import { contrast } from './contrast.mjs';
     const { count, low } = contrast(root, { win: dom.window });
     ok(`${count} elements readable`, !low.length, low.join('\n'));
*/

export const MIN = 3;   // WCAG AA for UI text and large type; our body text clears 4.5

export const nameOf = e => e.tagName.toLowerCase() +
  ((e.className || '').toString().split(' ').filter(Boolean).map(c => '.' + c).join(''));

const lin = v => { const q = v / 255; return q <= 0.03928 ? q / 12.92 : ((q + 0.055) / 1.055) ** 2.4; };
export const luminance = rgb => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export const ratio = (a, b) => { const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (top, a, under) => top.map((c, i) => Math.round(c * a + under[i] * (1 - a)));

export function parseColor(v) {
  v = String(v || '').trim();
  if (!v || v === 'transparent') return null;
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
    const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { rgb, a };
  }
  m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(v);
  if (m) {
    let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]);
    return { rgb: [1, 2, 3].map(i => Math.round(+m[i])), a };
  }
  if (/^white$/i.test(v)) return { rgb: [255, 255, 255], a: 1 };
  if (/^black$/i.test(v)) return { rgb: [0, 0, 0], a: 1 };
  return null;
}

/* jsdom caches computed styles and does NOT invalidate the cache when a
   <style> element's text changes in place — which is exactly what the app does
   when it re-renders its stylesheet. Reads then return whatever the element
   resolved to on first paint: the lead header read white while the live page
   was navy. Adding a stylesheet node does invalidate, so every read goes
   through this first. The empty node is left in place: removing it again
   restores the stale reads. Found while writing this engine; the engine it
   replaced was reading the same stale values. */
export function fresh(win) {
  const s = win.document.createElement('style');
  s.setAttribute('data-contrast-bust', '');
  (win.document.head || win.document.documentElement).appendChild(s);
}

export function contrast(root, opts = {}) {
  const win = opts.win;
  if (!win) throw new Error('contrast(root, {win}) — the window is required');
  const min = opts.min || MIN;
  const skip = opts.skip || null;          // selector for deliberate exceptions
  fresh(win);
  const cs = n => win.getComputedStyle(n);

  /* READ TOP-DOWN, ONCE. jsdom resolves an element's computed style
     differently depending on whether a descendant was resolved first: after
     reading the text inside the lead header, the header itself read white
     instead of navy. Reading every ground in document order before touching
     any text sidesteps that — a parent is always resolved before its child. */
  const above = []; for (let a = root.parentElement; a; a = a.parentElement) above.unshift(a);
  const bgOf = new Map(), opOf = new Map();
  for (const a of [...above, root, ...root.querySelectorAll('*')]) {
    const st = cs(a); bgOf.set(a, st.backgroundColor); opOf.set(a, st.opacity);
  }
  const bgRaw = a => (bgOf.has(a) ? bgOf.get(a) : cs(a).backgroundColor);
  const opRaw = a => (opOf.has(a) ? opOf.get(a) : cs(a).opacity);

  const deVar = (v, node) => {
    let out = String(v || '');
    for (let i = 0; i < 4 && /var\(/.test(out); i++) {
      out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g, (_, name, fb) => {
        for (let a = node; a; a = a.parentElement) {
          const got = cs(a).getPropertyValue(name).trim();
          if (got) return got;
        }
        return (fb || '').trim();
      });
    }
    return out;
  };
  const col = (raw, node) => parseColor(deVar(raw, node));

  const ground = node => {
    const layers = [];
    for (let a = node; a && a.nodeType === 1; a = a.parentElement) {
      const c = col(bgRaw(a), a);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) break; }
    }
    let g = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) g = over(layers[i].rgb, layers[i].a, g);
    return g;
  };
  const fade = node => { let k = 1;
    for (let a = node; a && a.nodeType === 1; a = a.parentElement) {
      const o = parseFloat(opRaw(a)); if (!isNaN(o)) k *= o; }
    return k; };

  const nodes = [...root.querySelectorAll('*')].filter(n => {
    if (/^(SCRIPT|STYLE|OPTION)$/.test(n.tagName) || n.closest('svg')) return false;
    if (skip && n.closest(skip)) return false;
    if (cs(n).display === 'none' || cs(n).visibility === 'hidden') return false;
    return [...n.childNodes].some(c => c.nodeType === 3 && (c.textContent || '').trim());
  });

  const low = [];
  for (const n of nodes) {
    const t = col(cs(n).color, n);
    if (!t) { low.push(`${nameOf(n)}  color unresolved: ${cs(n).color}`); continue; }
    const g = ground(n);
    const k = fade(n);
    const seen = over(t.rgb, t.a * k, g);
    const r = ratio(seen, g);
    if (r < min) {
      const chain = []; for (let a = n.parentElement, i = 0; a && i < 3 && a !== root; a = a.parentElement, i++) chain.unshift(nameOf(a));
      low.push(`${chain.join(' > ')} > ${nameOf(n)}  ${r.toFixed(2)}:1  text=rgb(${seen}) on rgb(${g})` +
               `  "${(n.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return { count: nodes.length, low };
}
