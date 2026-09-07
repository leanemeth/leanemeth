/* ============================================================
   DEV SWITCH
   Set to true to skip the loader AND the carousel intro and land
   straight on the Home. Flip back to false before shipping.
   ============================================================ */
const SKIP_LOADER = false;

/* The loader plays on every real load of the site — a browser reload, wherever
   you are, lands on the Home and runs the whole animation (the other pages
   redirect here on reload; see their inline <head> script). The one thing that
   skips it is an in-site link back to the Home — the "Léa Nemeth" logo or a
   "retour" link — which sets sessionStorage["lea-nav-home"] just before it
   navigates. That flag is one-shot: this load reads it and clears it, so the
   very next reload shows the loader again. */
let cameFromInSiteLink = false;
try {
  cameFromInSiteLink = sessionStorage.getItem("lea-nav-home") === "1";
  if (cameFromInSiteLink) sessionStorage.removeItem("lea-nav-home");
} catch (e) {
  // sessionStorage unavailable — just play the loader
}

// Back / forward that misses the bfcache re-runs this file; it should restore
// the carousel, not replay the whole loader.
let cameViaHistory = false;
try {
  const navEntry = performance.getEntriesByType("navigation")[0];
  cameViaHistory = navEntry ? navEntry.type === "back_forward" : performance.navigation.type === 2;
} catch (e) {
  /* leave it false */
}

const skipLoader = SKIP_LOADER || cameFromInSiteLink || cameViaHistory;

/* ============================================================
   LOADER
   ============================================================ */

// Order here = order shown through the loader. slides[0] must match the
// initial --current image/word hardcoded in index.html; slides[1] matches
// its --next (preloaded there).
const slides = [
  { image: "assets/sculpter.png", word: "sculpter," },
  { image: "assets/dessiner.png", word: "dessiner," },
  { image: "assets/peindre.png", word: "peindre," },
  { image: "assets/decouper.png", word: "découper," },
  { image: "assets/coudre.png", word: "coudre," },
  { image: "assets/raconter des histoires..png", word: "raconter des histoires." },
];

const loader = document.querySelector(".loader");
const currentImage = document.querySelector(".loader__image--current");
const nextImage = document.querySelector(".loader__image--next");
const currentWord = document.querySelector(".loader__word--current");
const nextWord = document.querySelector(".loader__word--next");
const home = document.querySelector(".home");

// Builds the carousel from assets/projects-data.js: only the "cover_*"
// images (2 per project, 1 for the last one, which only has a single image),
// shuffled so the home doesn't just read as project 1, 2, 3... in order.
function buildGallery() {
  const gallery = home.querySelector(".gallery");
  if (!gallery || typeof SITE_PROJECTS === "undefined") return;
  gallery.innerHTML = "";

  const entries = [];
  for (const project of SITE_PROJECTS) {
    for (const cover of project.covers) entries.push({ project, cover });
  }
  for (let i = entries.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  for (const { project, cover } of entries) {
    const a = document.createElement("a");
    a.className = "gallery__link";
    a.href = `projet.html?p=${encodeURIComponent(project.slug)}`;
    a.dataset.slug = project.slug;
    const img = document.createElement("img");
    img.src = cover.src;
    img.width = cover.w;
    img.height = cover.h;
    img.alt = "Projet";
    img.draggable = false;
    a.appendChild(img);
    gallery.appendChild(a);
  }
}
buildGallery();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Loader timing — the whole intro (6 verbs + the fade to the Home) runs in
   ~4.6s: 6 × (pauseDuration + transitionDuration) + loaderFadeMs. The pause is
   kept short relative to the transition so the motion flows rather than
   stop-starting. Keep transitionDuration in sync with the image-out/image-in
   animation durations, and loaderFadeMs with .loader's opacity transition,
   in styles.css. */
const pauseDuration = 240;
const transitionDuration = 460;
const loaderFadeMs = 400;
// the last verb ("raconter des histoires." — the longest phrase) holds a bit
// longer than the rest so there's time to read it before the hand-off
const finalHold = 720;

/* How many verbs the loader shows before it hands over to the Home.
   slides.length runs the full "J'aimerais …" phrase once through;
   lower it for a shorter intro. */
const verbsBeforeHome = slides.length;

let currentIndex = 0;
let shownCount = 1; // "sculpter," is already on screen at start

function showNextSlide() {
  const nextIndex = (currentIndex + 1) % slides.length;
  const nextSlide = slides[nextIndex];

  nextImage.src = nextSlide.image;
  nextWord.textContent = nextSlide.word;
  loader.classList.add("is-transitioning");

  window.setTimeout(() => {
    currentImage.src = nextSlide.image;
    currentWord.textContent = nextSlide.word;
    currentIndex = nextIndex;
    loader.classList.remove("is-transitioning");
  }, transitionDuration);
}

function scheduleNextSlide() {
  window.setTimeout(() => {
    showNextSlide();
    shownCount += 1;

    if (shownCount < verbsBeforeHome) {
      scheduleNextSlide();
    } else {
      window.setTimeout(endLoader, transitionDuration + finalHold);
    }
  }, pauseDuration + transitionDuration);
}

/* ============================================================
   LOADER → HOME
   ============================================================ */

function revealHome() {
  // The carousel intro plays after the loader, not when we skipped straight
  // here from an in-site link, and not under reduced motion.
  const withIntro = !prefersReducedMotion && !skipLoader;

  // tidy the URL — the #home marker (if any) has done its job
  if (window.location.hash === "#home") {
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {
      /* ignore — the hash just stays in the URL */
    }
  }

  loader.hidden = true;
  home.hidden = false;
  void home.offsetWidth; // flush layout
  initHome(withIntro);
  requestAnimationFrame(() => {
    home.classList.add("is-visible");
  });
}

function endLoader() {
  loader.classList.add("is-done");
  window.setTimeout(revealHome, loaderFadeMs);
}

/* ============================================================
   HOME — infinite focus carousel
   ============================================================ */

const GAP = 95; // px kept between the (scaled) edges of two neighbouring images
const SCALE_MIN = 0.7; // scale of the images at the centre (smallest)
const SCALE_MAX = 1.12; // scale reached at the screen edge (largest)
const FLAT_UNTIL = 0.34; // images stay at SCALE_MIN until this |x| / half-viewport, then grow
const OPACITY_EDGE = 0.22; // opacity reached at the screen edge
const BLUR_MAX = 13; // px of blur reached at the screen edge
const FOCUS_FALLOFF = 1.15; // >1 keeps the centre sharp/opaque longer, then falls off faster
const AUTO_DRIFT = 15; // px/sec the carousel drifts on its own (0 disables autoplay)
const DRIFT_DIR = 1; // +1: images travel right, exit right, re-enter from the left
const AUTO_DRIFT_DELAY = 1800; // ms to hold the initial state before the drift starts
const RESUME_DELAY = 2600; // ms of stillness after an interaction before the drift resumes
const START_SLUG = "natures-mortes"; // project whose (first) cover is centred on load

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// gentle at both ends — zero velocity at t=1 in particular, so the intro
// decelerates into the (near-static) carousel instead of stopping dead
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function initHome(withIntro) {
  const gallery = home.querySelector(".gallery");
  const baseLinks = [...gallery.querySelectorAll(".gallery__link:not([data-clone])")];
  const projectCount = baseLinks.length;

  let links = baseLinks;
  let boxW = 0; // image box width in px (identical for every image)
  let gap = GAP; // effective gap (reduced on narrow screens)
  let sMin = SCALE_MIN; // centre scale (eased toward 1 on narrow screens)
  let step = 0; // centre-to-centre distance between two images near the centre
  let span = 0; // one full loop, in px
  let pos = 0; // carousel offset in px (grows as it drifts)
  let velocity = 0; // px/frame carried over from wheel / drag
  let lastFrame = null;
  let driftAt = performance.now() + AUTO_DRIFT_DELAY;

  // Scale as a function of horizontal distance from the screen centre:
  // flat (SCALE_MIN) across the middle, then easing up to SCALE_MAX at the edge.
  function scaleAt(x) {
    const d = Math.min(1, Math.abs(x) / (window.innerWidth / 2));
    return sMin + (SCALE_MAX - sMin) * smoothstep(FLAT_UNTIL, 1, d);
  }

  function build() {
    gallery.querySelectorAll(".gallery__link[data-clone]").forEach((n) => n.remove());

    boxW = baseLinks[0].offsetWidth || window.innerWidth * 0.3;
    gap = Math.min(GAP, window.innerWidth * 0.08);
    // On a phone the images can't afford to shrink much at the centre.
    sMin = window.innerWidth < 640 ? 0.88 : SCALE_MIN;
    step = gap + boxW * sMin;

    // Enough copies that the images always reach past both screen edges.
    let repeat = 1;
    while (repeat * projectCount * step < window.innerWidth * 2.4) repeat += 1;

    for (let r = 1; r < repeat; r += 1) {
      for (const link of baseLinks) {
        const clone = link.cloneNode(true);
        clone.dataset.clone = "1";
        gallery.appendChild(clone);
      }
    }

    links = [...gallery.querySelectorAll(".gallery__link")];
    links.forEach((link, i) => {
      link.dataset.project = i % projectCount;
    });
    span = links.length * step;
  }

  function centreOnStart() {
    const startIndex = Math.max(
      0,
      baseLinks.findIndex((link) => link.dataset.slug === START_SLUG)
    );
    pos = startIndex * step;
  }

  // Compute the target pose of every slot for the current `pos`: march outward
  // from the centred slot, keeping a constant `gap` between the scaled edges.
  function marchPoses() {
    const n = links.length;
    const half = window.innerWidth / 2;
    const hw = boxW / 2;

    const cu = ((pos / step) % n + n) % n;
    const r = Math.round(cu);
    const centreX = -(cu - r) * step;

    const xBySlot = new Array(n).fill(undefined);
    xBySlot[((r % n) + n) % n] = centreX;

    let prev = centreX;
    for (let s = 1; s < n; s += 1) {
      const slot = ((r + s) % n + n) % n;
      if (xBySlot[slot] !== undefined) break;
      let x = prev + gap + hw * scaleAt(prev) + hw * sMin;
      for (let it = 0; it < 3; it += 1) x = prev + gap + hw * scaleAt(prev) + hw * scaleAt(x);
      xBySlot[slot] = x;
      prev = x;
      if (x - hw * scaleAt(x) > window.innerWidth) break;
    }
    prev = centreX;
    for (let s = 1; s < n; s += 1) {
      const slot = ((r - s) % n + n) % n;
      if (xBySlot[slot] !== undefined) break;
      let x = prev - gap - hw * scaleAt(prev) - hw * sMin;
      for (let it = 0; it < 3; it += 1) x = prev - gap - hw * scaleAt(prev) - hw * scaleAt(x);
      xBySlot[slot] = x;
      prev = x;
      if (x + hw * scaleAt(x) < -window.innerWidth) break;
    }

    return links.map((_link, i) => {
      const x = xBySlot[i];
      if (x === undefined) return null;
      const d = Math.min(1, Math.abs(x) / half);
      const k = Math.pow(d, FOCUS_FALLOFF);
      return {
        x,
        y: 0,
        rot: 0,
        scale: scaleAt(x),
        opacity: 1 + (OPACITY_EDGE - 1) * k,
        blur: BLUR_MAX * k,
        z: 1000 - Math.round(d * 1000),
        pointer: d < 0.85,
      };
    });
  }

  function applyPoses(poses) {
    links.forEach((link, i) => {
      const p = poses[i];
      if (!p) {
        link.style.opacity = "0";
        link.style.filter = "";
        link.style.pointerEvents = "none";
        return;
      }
      // the spline can overshoot slightly past a keyframe — clamp the physical values
      const scale = Math.max(0.02, p.scale);
      const opacity = Math.max(0, Math.min(1, p.opacity));
      const blur = Math.max(0, p.blur);
      const rot = Math.abs(p.rot) > 0.01 ? ` rotate(${p.rot.toFixed(2)}deg)` : "";
      link.style.transform =
        `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${(p.y || 0).toFixed(1)}px)${rot} scale(${scale.toFixed(4)})`;
      link.style.opacity = opacity.toFixed(4);
      link.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "";
      link.style.zIndex = String(Math.round(p.z));
      link.style.pointerEvents = p.pointer ? "auto" : "none";
    });
  }

  function render() {
    applyPoses(marchPoses());
  }

  /* ---- one-time intro: stacked & opaque → eases apart while small → tight
     row → carousel ---- The five states below are keyframes on a single
     continuous spline (Catmull-Rom). It's driven by buildIntroClock() — which
     keeps the visible speed constant so no phase crawls or lurches — with
     easeInOutCubic layered on top so it ramps up from rest and settles into
     the live carousel at zero velocity. One unbroken glide, start to finish. */

  const INTRO_MS = 2600;
  const ROW_SCALE = SCALE_MIN;
  const POSE_FIELDS = ["x", "y", "rot", "scale", "opacity", "blur", "z"];

  // The pose of card `k` (relative index `rel` from the front card) at each
  // stage. `z` is fixed for the whole intro at the carousel's own order, so
  // the front cover always stays on top and no card ever pops in front of
  // another mid-animation. Only the front card shows during the stacked beat
  // (the rest are opacity 0, hidden behind it — nothing shows through
  // anything); they fade up only as they slide clear. x grows monotonically
  // (0 → 0.1 → 0.45 → 1 of the row spacing) so the spline never curls
  // backward. Stages 4–5 (row → carousel) are unchanged.
  function introKeyframe(stage, rel, isEdge, isFront, F) {
    const row = rel * boxW * ROW_SCALE; // this card's spot in the tight row
    const z = F.z;
    if (stage === 1) {
      // nothing visible yet
      return { x: 0, y: 0, rot: 0, scale: 0.12, opacity: 0, blur: isFront ? 6 : 0, z };
    }
    if (stage === 2) {
      // just the front card — faded in on white, fully opaque; the rest wait
      // hidden behind it
      return {
        x: row * 0.1,
        y: 0,
        rot: 0,
        scale: 0.24,
        opacity: isFront ? 1 : 0,
        blur: isFront ? 2 : 0,
        z,
      };
    }
    if (stage === 3) {
      // the rest slide out from behind, fading up to opaque as they clear the
      // front card — still small, well under half size
      return { x: row * 0.45, y: 0, rot: 0, scale: 0.5, opacity: 1, blur: 0, z };
    }
    if (stage === 4) {
      // tight row, full row size, ends starting to fall away
      return {
        x: row,
        y: 0,
        rot: 0,
        scale: ROW_SCALE,
        opacity: isEdge ? 0.32 : 1,
        blur: isEdge ? 7 : 0,
        z,
      };
    }
    // stage 5 === the exact carousel start pose (seamless hand-off)
    return { x: F.x, y: 0, rot: 0, scale: F.scale, opacity: F.opacity, blur: F.blur, z };
  }

  const INTRO_SPAN = 4; // 5 keyframes → 4 spline segments

  function catmullRom(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  }

  // Sample one card's keyframe spline at raw parameter f ∈ [0, INTRO_SPAN].
  function sampleSplineAt(keys, f) {
    const ff = Math.max(0, Math.min(INTRO_SPAN - 1e-6, f));
    const seg = Math.floor(ff);
    const t = ff - seg;
    const k0 = keys[Math.max(0, seg - 1)];
    const k1 = keys[seg];
    const k2 = keys[seg + 1];
    const k3 = keys[Math.min(INTRO_SPAN, seg + 2)];
    const out = { pointer: false };
    for (const field of POSE_FIELDS) {
      out[field] = catmullRom(k0[field], k1[field], k2[field], k3[field], t);
    }
    return out;
  }

  /* The 5 keyframes aren't spaced by equal amounts of motion — stages 1–3 are
     a tight cluster near the centre, then the cards fan right out. Advancing
     the spline at a constant parameter rate would crawl through the cluster
     and then lurch through the fan-out (that's the "stop" then "whoosh").
     So walk the spline once, measuring how far the whole set of cards moves
     between fine samples, and build a map from even progress p ∈ [0,1] to the
     spline parameter that holds the *scene's* speed constant. The caller
     layers easeInOutCubic on p for a soft start and a soft landing into the
     live carousel. */
  function buildIntroClock(cardKeys) {
    const STEPS = 96;
    const cum = new Float64Array(STEPS + 1);
    let prev = cardKeys.map((keys) => sampleSplineAt(keys, 0));
    for (let i = 1; i <= STEPS; i += 1) {
      const cur = cardKeys.map((keys) => sampleSplineAt(keys, (i / STEPS) * INTRO_SPAN));
      let moved = 0;
      for (let k = 0; k < cur.length; k += 1) {
        const a = prev[k];
        const b = cur[k];
        moved +=
          Math.hypot(b.x - a.x, b.y - a.y) +
          Math.abs(b.scale - a.scale) * boxW * 0.6 +
          Math.abs(b.opacity - a.opacity) * 130; // a little weight so the fades still register
      }
      cum[i] = cum[i - 1] + moved;
      prev = cur;
    }
    const total = cum[STEPS] || 1;
    return function clock(p) {
      const target = Math.max(0, Math.min(1, p)) * total;
      let lo = 1;
      let hi = STEPS;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const frac = (target - cum[lo - 1]) / (cum[lo] - cum[lo - 1] || 1);
      return ((lo - 1 + frac) / STEPS) * INTRO_SPAN;
    };
  }

  function playIntro(done) {
    const finalPoses = marchPoses();
    const cards = [];
    // Animate the images that end up on (or just past) the screen; the couple of
    // near-invisible ones at the far edges just fade in when the live loop starts.
    const reach = window.innerWidth * 0.72;
    finalPoses.forEach((F, i) => {
      if (F && Math.abs(F.x) <= reach) cards.push({ i, F });
    });
    cards.sort((a, b) => a.F.x - b.F.x);

    let kc = 0;
    cards.forEach((c, k) => {
      if (Math.abs(c.F.x) < Math.abs(cards[kc].F.x)) kc = k;
    });
    const K = cards.length;

    // Pre-bake the five keyframe poses for every card.
    const cardKeys = cards.map((c, k) => {
      const rel = k - kc;
      const isEdge = k === 0 || k === K - 1;
      const isFront = k === kc;
      return [1, 2, 3, 4, 5].map((stage) => introKeyframe(stage, rel, isEdge, isFront, c.F));
    });

    const introClock = buildIntroClock(cardKeys);
    const startedAt = performance.now();
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      done();
    }

    function tick(now) {
      if (finished) return;
      const g = Math.min(1, (now - startedAt) / INTRO_MS);
      const f = introClock(easeInOutCubic(g)); // eased ramp, constant-speed cruise
      const poses = new Array(links.length).fill(null);
      cards.forEach((c, k) => {
        poses[c.i] = sampleSplineAt(cardKeys[k], f);
      });
      applyPoses(poses);

      if (g < 1) requestAnimationFrame(tick);
      else finish();
    }

    requestAnimationFrame(tick);
    // Safety net: never leave the page stuck on the intro if rAF stalls.
    window.setTimeout(finish, INTRO_MS + 500);
  }

  function frame(now) {
    const dt = lastFrame == null ? 0 : Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!prefersReducedMotion && AUTO_DRIFT > 0 && now >= driftAt) {
      pos += DRIFT_DIR * AUTO_DRIFT * dt;
    }
    if (Math.abs(velocity) > 0.01) {
      pos += velocity;
      velocity *= 0.9;
    }
    pos = ((pos % span) + span) % span;

    render();
    requestAnimationFrame(frame);
  }

  function nudge(amount) {
    pos += amount;
    driftAt = performance.now() + RESUME_DELAY;
  }

  window.addEventListener("resize", () => {
    const ratio = span ? pos / span : 0;
    build();
    pos = ratio * span;
    render();
  });

  // Wheel (vertical or horizontal) scrubs the carousel.
  gallery.addEventListener(
    "wheel",
    (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      nudge(delta);
      velocity = delta * 0.2;
      event.preventDefault();
    },
    { passive: false }
  );

  // Click-and-drag to scrub.
  //
  // No setPointerCapture here: the gallery holds the clickable project links,
  // and with capture active the browser retargets the click event to the
  // capturing element, so the links stop navigating. The buttons===0 check
  // below is what keeps the drag from "sticking" to the cursor when the
  // pointerup is missed (released off-window, over browser chrome, alt-tab…).
  const DRAG_SLOP = 10; // px of travel before a press counts as a drag, not a click
  let dragging = false;
  let dragX = 0;
  let dragMoved = 0;
  let suppressClick = false; // eat the click the browser fires right after a drag
  let suppressTimer = 0;

  function onDragMove(event) {
    if (!dragging) return;
    // Every pointermove reports which buttons are still held — 0 means the
    // button was let go somewhere we never got the pointerup, so treat this
    // as the missing release and stop.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      onDragEnd();
      return;
    }
    const dx = event.clientX - dragX;
    dragX = event.clientX;
    dragMoved += Math.abs(dx);
    nudge(-dx);
    velocity = -dx * 0.4;
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    gallery.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    window.removeEventListener("blur", onDragEnd);
    if (dragMoved > DRAG_SLOP) {
      // The browser fires one click after the release — swallow it so a scrub
      // that ends over a project photo doesn't open the project. Time-boxed:
      // if that click never comes (released off-window), the flag clears itself
      // instead of eating the next, legitimate click.
      suppressClick = true;
      clearTimeout(suppressTimer);
      suppressTimer = window.setTimeout(() => {
        suppressClick = false;
      }, 150);
    }
  }

  gallery.addEventListener(
    "click",
    (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      clearTimeout(suppressTimer);
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  // Kill any native image/text drag so it can't swallow the pointer stream
  // mid-scrub (which would leave the carousel stuck to the cursor).
  gallery.addEventListener("dragstart", (event) => event.preventDefault());

  gallery.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragging) onDragEnd(); // clear any stale drag before starting a new one
    dragging = true;
    dragX = event.clientX;
    dragMoved = 0;
    velocity = 0;
    gallery.classList.add("is-dragging");
    driftAt = performance.now() + RESUME_DELAY;
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
    window.addEventListener("blur", onDragEnd);
  });

  function startLiveLoop() {
    driftAt = performance.now() + AUTO_DRIFT_DELAY;
    lastFrame = null;
    render(); // paint the settled carousel immediately, then keep it live
    requestAnimationFrame(frame);
  }

  build();
  centreOnStart();

  if (withIntro) {
    applyPoses(new Array(links.length).fill(null)); // everything invisible to start
    playIntro(startLiveLoop);
  } else {
    render();
    startLiveLoop();
  }
}

/* ============================================================
   START
   ============================================================ */

if (skipLoader) {
  // Dev switch, or an in-site link back to the Home: straight to the carousel.
  revealHome();
} else if (prefersReducedMotion) {
  window.setTimeout(endLoader, 600); // no verb animation — just a brief hold
} else {
  scheduleNextSlide();
}

/* ============================================================
   HOME → elsewhere: a gentle fade out before following an internal link
   (a project, About). The reverse fade in on return is the base .home
   transition (see styles.css) applied when revealHome() adds .is-visible.
   Same idea as projet.js's leaveTo / about.js.
   ============================================================ */

if (!prefersReducedMotion) {
  let leavingHome = false;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || leavingHome) return;
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
    if (dest.pathname === location.pathname && dest.search === location.search) return; // same page

    leavingHome = true;
    event.preventDefault();
    home.classList.remove("is-visible");
    home.classList.add("is-leaving");

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      location.href = link.href;
    };
    home.addEventListener("transitionend", (e) => {
      if (e.target === home && e.propertyName === "opacity") go();
    });
    window.setTimeout(go, 720); // backstop > .home's 600ms fade
  });

  // restored from the back/forward cache mid-leave — clear the leaving state
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    leavingHome = false;
    home.classList.remove("is-leaving");
    home.classList.add("is-visible");
  });
}
