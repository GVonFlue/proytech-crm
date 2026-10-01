/* REACH OUT HAS A WHITE-SURFACE STYLE.

   The Call / Text / Email / Site buttons in the lead's prep rail were styled
   only under .modal.lead, the dark skin. When the record moved to leadfs those
   rules stopped matching and the buttons shipped as raw underlined browser
   links. Nothing went red, because nothing checked.

   This reads App.jsx with comments stripped (a comment that mentions a selector
   must not satisfy the test) and requires each rule to exist OUTSIDE the dark
   scope. Seen red: deleting the REACH OUT block in App.jsx fails every check. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule whose selector is not scoped to the dark skin.
const light = src.split('\n').filter(l => !l.includes('.modal.lead '));
const has = sel => light.some(l => l.trimStart().startsWith(sel + '{') || l.includes('}' + sel + '{'));

const checks = [
  ['the button column lays out', '.m-acts'],
  ['a button and its copy sit on one row', '.m-act-row'],
  ['the button itself is a plate, not a link', '.m-acts .m-act'],
  ['the icon has its tile', '.m-acts .m-act i'],
  ['the value truncates instead of wrapping', '.m-acts .m-act .m-act-v'],
  ['the copy button is styled', '.m-acts .m-act-copy'],
  ['a missing value reads as disabled', '.m-acts button.m-act[disabled]'],
];

let failed = 0;
for (const [name, sel] of checks) {
  if (has(sel)) console.log('  ok  ' + name);
  else { failed++; console.log('  FAIL ' + name + '  (no light rule for ' + sel + ')'); }
}

// The plate must actually kill the link underline, or it still looks like a link.
// The rule runs to the next selector line, not the first brace: \${INK} inside it
// contains a closing brace of its own.
const plate = light.join('\n').match(/\.m-acts \.m-act\{[\s\S]*?\n(?=\.)/);
if (plate && /text-decoration:none/.test(plate[0])) console.log('  ok  no underline on the plate');
else { failed++; console.log('  FAIL the plate does not remove the link underline'); }

console.log(`\n${checks.length + 1 - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
