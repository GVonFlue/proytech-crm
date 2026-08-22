/* A component defined inside a component must not be rendered as JSX.
   ============================================================================

   Define a component inside another component and it gets a NEW function
   identity on every render. React compares element types by identity, sees a
   different type, and unmounts the old subtree to mount a fresh one. Anything
   focused inside it loses focus; anything mid-gesture drops the gesture.

   Three of these shipped, all invisible to every other test in this repo,
   because the DOM is correct after the remount — only the focus is gone:

     FollowUpBlock   lead view. The Next Action select is type-ahead, so each
                     keypress changed the value, re-rendered Modal and remounted
                     the block. You typed one letter and were kicked out. The
                     date input and the "what to do" textarea beside it had the
                     same fault, the textarea worse — a sentence is a keystroke
                     each.
     Knob            task modal. <input type="range"> fires onChange
                     continuously while dragging, so the drag was dropped after
                     the first step: clickable one notch at a time, not
                     draggable.
     Picker          events page. A select that re-renders its own parent.

   The fix is to CALL them instead of rendering them, which removes the
   component boundary — the idiom F, Sel, Sec and Row already use in these
   files. This test is what stops the fourth one.

   SCOPE: only helpers that contain a focusable field are failed. Plenty of
   others are defined inline and remount harmlessly; making those fail would be
   a style rule rather than a bug guard, and would bury this signal in noise.
*/
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 800) : '')); } };

const FILES = ['src/App.jsx', 'src/LeadView.jsx', 'src/Jarvis.jsx', 'src/Playbook.jsx', 'src/LeadBits.jsx'];
const FIELD = /<(input|textarea|select)[\s/>]/;

const offenders = [], checked = [];
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  /* COMMENTS ARE STRIPPED BEFORE THE USAGE SCAN.

     The first version of this failed on its own fix: the comment explaining
     "Called, not rendered as <Knob/>" reads as a usage of <Knob/>. A scanner
     that trips on prose will trip on the next person's prose too.

     Block comments are blanked line by line so line numbers survive, and `//`
     is only honoured at the start of a line — a bare regex for it eats the rest
     of any line containing an https:// URL, which has bitten this repo before. */
  const lines = raw.split('\n');
  let inBlock = false;
  const code = lines.map(l => {
    let out = l;
    if (inBlock) { const e = out.indexOf('*/'); if (e === -1) return ''; inBlock = false; out = out.slice(e + 2); }
    for (;;) {
      const b = out.indexOf('/*');
      if (b === -1) break;
      const e = out.indexOf('*/', b + 2);
      if (e === -1) { out = out.slice(0, b); inBlock = true; break; }
      out = out.slice(0, b) + ' ' + out.slice(e + 2);
    }
    return /^\s*\/\//.test(out) ? '' : out;
  });

  /* Indented `const Name = ...` is a definition inside something else; a
     definition at column 0 is module scope and is fine however it is used. */
  const defs = new Map();
  code.forEach((l, i) => {
    const m = /^(\s+)const ([A-Z][A-Za-z0-9]*)\s*=\s*(\(|\{|[A-Za-z])/.exec(l);
    if (m && m[1]) defs.set(m[2], i);
  });

  for (const [name, at] of defs) {
    /* the helper's own body: from its definition to the next declaration at
       the same or lower indent, capped so a runaway scan cannot swallow the
       file and report every field in it as this one's */
    let body = '';
    for (let i = at; i < Math.min(at + 20, code.length); i++) {
      if (i > at && /^\s{0,6}(const|function|return|export)\s/.test(code[i])) break;
      body += code[i] + '\n';
    }
    if (!FIELD.test(body)) continue;
    checked.push(`${file}:${at + 1} ${name}`);
    const used = code
      .map((l, i) => (new RegExp('<' + name + '[\\s/>]').test(l) ? i + 1 : 0))
      .filter(Boolean);
    if (used.length) offenders.push(`${file}:${at + 1}  <${name}/> rendered at line(s) ${used.join(', ')} — call it instead: {${name}({...})}`);
  }
}

ok(`inline helpers containing a field are checked (${checked.length} found)`, checked.length > 0,
   checked.join('\n        '));
ok('none of them is rendered as JSX', offenders.length === 0, offenders.join('\n        '));

/* And prove the scanner can still see one, so it cannot rot into a pass. */
const probe = `
function Outer(){
  const Inner=({x})=>(<div><input value={x}/></div>);
  return (<div><Inner x={1}/></div>);
}`;
const pl = probe.split('\n');
const pdef = pl.findIndex(l => /^\s+const Inner/.test(l));
const pused = pl.some(l => /<Inner[\s/>]/.test(l));
ok('the scanner still detects the shape it was written for', pdef > 0 && pused);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
