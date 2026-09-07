/* ============================================================
   ABOUT — fade the page in on arrival, fade it out before leaving.
   Same idea as the project pages (see projet.js's leaveTo). The nav is a
   sibling of .about, so it stays put across the dissolve.
   ============================================================ */

(function () {
  const about = document.querySelector(".about");
  if (!about) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Double rAF so the browser paints the opacity-0 start once before is-ready
  // flips it — otherwise the two collapse into one recalc and it just appears.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      about.classList.remove("is-leaving");
      about.classList.add("is-ready");
    });
  });

  if (prefersReducedMotion) return;

  let leaving = false;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || leaving) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

    let dest;
    try {
      dest = new URL(link.href, location.href);
    } catch (e) {
      return;
    }
    if (dest.origin !== location.origin) return; // external — let it be
    // same page (e.g. the "About" link itself): swallow it, don't reload
    if (dest.pathname === location.pathname && dest.search === location.search) {
      if (!dest.hash || dest.hash === location.hash) event.preventDefault();
      return;
    }

    leaving = true;
    event.preventDefault();
    document.querySelectorAll("video").forEach((v) => {
      try {
        v.pause();
      } catch (e) {
        /* ignore */
      }
    });
    about.classList.remove("is-ready");
    about.classList.add("is-leaving");

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      location.href = link.href;
    };
    about.addEventListener("transitionend", (e) => {
      if (e.target === about && e.propertyName === "opacity") go();
    });
    window.setTimeout(go, 420); // backstop > .about.is-leaving's 320ms
  });

  // restored from the back/forward cache mid-leave — clear the leaving state
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    leaving = false;
    about.classList.remove("is-leaving");
    about.classList.add("is-ready");
  });
})();
