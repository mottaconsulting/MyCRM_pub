"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Remembers and restores the window scroll position for a list page, keyed by
 * path + query. Because the contacts list is force-dynamic (re-rendered on
 * every navigation), the framework's own back-scroll restoration is unreliable;
 * this persists scrollY to sessionStorage and puts you back where you were when
 * you return from a contact.
 */
export function ScrollRestore() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `scroll:${pathname}?${search.toString()}`;

  useEffect(() => {
    const target = parseInt(sessionStorage.getItem(key) ?? "", 10);
    let restoring = !Number.isNaN(target) && target > 0;

    // Nudge the scroll back for a short window — the content may still be laying
    // out, and the router can scroll to top after us, so one attempt isn't
    // enough. Stops once we're within a couple px or after ~700ms.
    if (restoring) {
      let tries = 0;
      const restore = () => {
        window.scrollTo(0, target);
        tries++;
        if (Math.abs(window.scrollY - target) > 2 && tries < 45) {
          requestAnimationFrame(restore);
        } else {
          restoring = false;
        }
      };
      requestAnimationFrame(restore);
    }

    let ticking = false;
    const onScroll = () => {
      if (restoring) return; // don't overwrite the target while restoring
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        sessionStorage.setItem(key, String(window.scrollY));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key]);

  return null;
}
