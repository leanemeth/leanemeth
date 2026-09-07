/* ============================================================
   CUSTOM CURSOR
   A small element that trails the pointer with mix-blend-mode: difference —
   black on light, white on dark, magenta on green (see .custom-cursor in
   styles.css). The real cursor is hidden while this runs. Pointer devices
   only; touch keeps the native behaviour.
   ============================================================ */

(function () {
  if (!window.matchMedia || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const dot = document.createElement("div");
  dot.className = "custom-cursor";
  dot.setAttribute("aria-hidden", "true");

  function mount() {
    document.body.appendChild(dot);
    document.documentElement.classList.add("js-cursor");
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  let x = -100;
  let y = -100;
  let raf = 0;
  let shown = false;

  function place() {
    raf = 0;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      x = event.clientX;
      y = event.clientY;
      if (!shown) {
        shown = true;
        dot.style.opacity = "1";
      }
      if (!raf) raf = requestAnimationFrame(place);
    },
    { passive: true }
  );

  // fade out when the pointer leaves the window, back in when it returns
  document.addEventListener("mouseleave", () => {
    dot.style.opacity = "0";
  });
  document.addEventListener("mouseenter", () => {
    if (shown) dot.style.opacity = "1";
  });
})();
