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
    // On a project page, the entry for the project on screen is nudged
    // slightly to the right (see .is-current in styles.css) so it reads as
    // the one currently being viewed.
    const currentSlug = new URLSearchParams(location.search).get("p");
    list.innerHTML = "";
    SITE_PROJECTS.forEach((project, i) => {
      const li = document.createElement("li");
      if (project.slug === currentSlug) li.classList.add("is-current");
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

  /* ---- "Contact" opens a blurred overlay in place, instead of navigating
     to contact.html — just the email, centred; click anywhere to close. ---- */
  const contactLink = nav.querySelector('a[href="contact.html"]');
  if (contactLink) {
    const overlay = document.createElement("div");
    overlay.className = "contact-overlay";
    overlay.innerHTML =
      '<div class="contact-overlay__content">' +
      '<span class="contact-overlay__email">lea@nemeth.com</span>' +
      '<span class="contact-overlay__phone">+33 6 95 37 19 57</span>' +
      "</div>";
    document.body.appendChild(overlay);

    function closeContact() {
      overlay.classList.remove("is-visible");
    }

    overlay.addEventListener("click", closeContact);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeContact();
    });

    contactLink.addEventListener("click", (e) => {
      e.preventDefault();
      overlay.classList.add("is-visible");
    });
  }
})();
