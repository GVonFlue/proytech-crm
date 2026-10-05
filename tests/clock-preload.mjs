/* Freeze the clock for a WHOLE process, for a one-off sweep of the suite:

     TEST_NOW=2026-10-14T23:30 TZ=Pacific/Pago_Pago \
       NODE_OPTIONS="--import ./tests/clock-preload.mjs" npm test

   A no-op when TEST_NOW is unset. A HELPER, not a suite (tests/all.mjs). */
import { freezeClock } from './clock.mjs';
if (process.env.TEST_NOW) freezeClock(process.env.TEST_NOW);
