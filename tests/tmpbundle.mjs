/* A BUNDLE FILE THAT CLEANS UP AFTER ITSELF.
   ============================================================================

   Many suites bundle a source file with esbuild, write it into tests/ (so its
   bare imports resolve against node_modules) and import it. They used to use
   fixed names (tests/.bproj.mjs) and most never deleted them: 174 files and
   221MB had piled up by Oct 2026, and two suites sharing one name could
   overwrite each other's bundle mid-run.

   bundleName('proj') returns a name unique to this process
   (".bproj-<pid>-<random>.mjs") and deletes the file when the process ends:
   normally, on process.exit, on an uncaught error, and on Ctrl-C / SIGTERM.
   Like tests/harness.mjs does for its temp folder.

   tests/all.mjs fails a run that leaves any tests/.b*.mjs behind, and
   tests/bundlehygiene.mjs fails any suite that names a bundle without this. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAG = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const made = new Set();

/** The bare file name (".bNAME-<pid>-<rand>.mjs") for a bundle in tests/.
 *  ext '.jsx' for the throwaway entry file a few suites build from. */
export function bundleName(name, ext = '.mjs') {
  const base = `.b${String(name).replace(/[^A-Za-z0-9_-]/g, '')}-${TAG}${ext}`;
  made.add(path.join(HERE, base));
  return base;
}

export function cleanBundles() {
  for (const f of made) { try { fs.unlinkSync(f); } catch {} }
  made.clear();
}

/* 'exit' also fires after an uncaught exception or unhandled rejection */
process.on('exit', cleanBundles);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(sig, () => { cleanBundles(); process.kill(process.pid, sig); });
}
