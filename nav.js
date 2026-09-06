/* ============================================================
   SITE NAV
   1. Builds the numbered project list from assets/projects-data.js
      (single source of truth — see that file), so index.html and
      projet.html never have to keep two hand-written copies in sync.
   2. The mobile "Menu" toggle: on desktop the nav is a plain fixed
      column and this is a no-op (the toggle button is hidden by CSS).
      Below the mobile breakpoint (see styles.css) the button reveals
      the nav as a gradient panel sliding down from the top; the label
      flips to "Close" to reverse it.
   ============================================================ */

(function () {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;

  const list = nav.querySelector(".site-nav__list--projects");
  if (list && typeof SITE_PROJECTS !== "undefined") {
    list.innerHTML = "";
    SITE_PROJECTS.forEach((project, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `projet.html?p=${encodeURIComponent(project.slug)}`;
      const index = document.createElement("span");
      index.className = "site-nav__index";
      index.textContent = `[${String(i + 1).padStart(2, "0")}]`;
      a.append(index, ` ${project.navLabel}`);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  const toggle = nav.querySelector(".site-nav__toggle");
  if (!toggle) return;

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    toggle.textContent = open ? "Close" : "Menu";
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", () => {
    setOpen(!nav.classList.contains("is-open"));
  });

  // Following a link (or resizing past the mobile breakpoint) closes it,
  // so it's never left open over the next page or the desktop layout.
  nav.querySelectorAll(".site-nav__list a").forEach((a) => {
    a.addEventListener("click", () => setOpen(false));
  });

  const mobile = window.matchMedia("(max-width: 820px)");
  mobile.addEventListener("change", (e) => {
    if (!e.matches) setOpen(false);
  });
})();
