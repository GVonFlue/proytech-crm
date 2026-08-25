import { useEffect } from 'react';

/* ============================================================================
   BODY SCROLL LOCK — one implementation, used by every modal.
   ----------------------------------------------------------------------------
   THE BUG

   A modal is `position:fixed` over the page, but the PAGE behind it is still
   scrollable. So a wheel or a trackpad swipe anywhere over the scrim scrolls
   the CRM underneath instead of the modal — and once the pointer is over the
   modal's own scroll area, reaching its end hands the remaining scroll straight
   back to the page (scroll chaining). On a lead view that is disorienting. On a
   panel taller than the viewport it is worse than disorienting: the bottom of
   the modal becomes genuinely unreachable, because every attempt to get there
   moves the page instead.

   WHY A COUNTER AND NOT A BOOLEAN

   Modals nest. The lead view opens, and a scheduler or a confirm opens on top
   of it. If the inner one restores `overflow` when it closes, the outer one is
   still open and the page starts scrolling behind it again — a bug that only
   appears when two things are open at once, which is exactly the case nobody
   tests by hand. The lock is reference counted: the page unlocks when the LAST
   modal closes, not the first.

   WHY THE PADDING

   Hiding the body's scrollbar reclaims its width, and everything on the page
   jumps sideways by ~15px at the moment a modal opens and back when it closes.
   The width is measured and replaced as padding so nothing moves. On overlay
   scrollbars (macOS default, all touch devices) the measurement is 0 and this
   costs nothing.

   RESTORES WHAT WAS THERE, not a hardcoded default: another feature may have
   set an inline overflow for its own reasons, and a lock that "restores" by
   assuming `''` would silently undo it.
   ========================================================================== */

let depth = 0;
let prev = null;

export function lockScroll() {
  if (typeof document === 'undefined' || !document.body) return;
  if (depth === 0) {
    const b = document.body;
    prev = { overflow: b.style.overflow, paddingRight: b.style.paddingRight };
    /* innerWidth includes the scrollbar; clientWidth does not. The difference
       is its width, or 0 where the scrollbar is an overlay.

       BOUNDED, BECAUSE THE MEASUREMENT CAN BE NONSENSE. Anywhere layout has not
       run — jsdom, a detached document, a hidden iframe — clientWidth reads 0
       and this subtraction returns the FULL WINDOW WIDTH. Applying that as
       padding shoves the entire page a thousand pixels sideways at the moment a
       modal opens, which is far worse than the sideways jump it exists to
       prevent. A scrollbar is never wider than about forty pixels, so anything
       outside that is a measurement failure and is refused rather than trusted.
       Found by tests/scrolllock.mjs, which reported 1024px. */
    const gap = window.innerWidth - document.documentElement.clientWidth;
    b.style.overflow = 'hidden';
    if (gap > 0 && gap <= 40) b.style.paddingRight = gap + 'px';
  }
  depth++;
}

export function unlockScroll() {
  if (typeof document === 'undefined' || !document.body) return;
  depth = Math.max(0, depth - 1);
  if (depth === 0 && prev) {
    document.body.style.overflow = prev.overflow;
    document.body.style.paddingRight = prev.paddingRight;
    prev = null;
  }
}

/** Lock the page behind a modal for as long as it is mounted.
 *
 *  Call it UNCONDITIONALLY at the top of the modal component, not behind an
 *  `if` — a hook inside a branch is the rules-of-hooks crash this codebase has
 *  hit three times. Pass `active` when a component renders in both states. */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    lockScroll();
    return unlockScroll;
  }, [active]);
}

/* Test seam. The counter is module state, so a suite that mounts and unmounts
   modals needs to be able to assert on it rather than infer it from styles. */
export const _lockDepth = () => depth;
