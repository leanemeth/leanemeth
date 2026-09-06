/* ============================================================
   DEV SWITCH
   Set to true to skip the loader AND the carousel intro and land
   straight on the Home. Flip back to false before shipping.
   ============================================================ */
const SKIP_LOADER = true;

/* ============================================================
   LOADER
   ============================================================ */

const slides = [
  { image: "assets/dessiner.png", word: "dessiner," },
  { image: "assets/raconter des histoires..png", word: "raconter des histoires." },
  { image: "assets/decouper.png", word: "découper," },
  { image: "assets/coudre.png", word: "coudre," },
  { image: "assets/sculpter.png", word: "sculpter," },
  { image: "assets/peindre.png", word: "peindre," },
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

const pauseDuration = prefersReducedMotion ? 700 : 2000;
const transitionDuration = 1200;

/* How many verbs the loader shows before it hands over to the Home.
   slides.length runs the full "J'aimerais …" phrase once through;
   lower it for a shorter intro. */
const verbsBeforeHome = slides.length;

let currentIndex = 0;
let shownCount = 1; // "dessiner," is already on screen at start

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
      window.setTimeout(endLoader, transitionDuration + pauseDuration);
    }
  }, pauseDuration + transitionDuration);
}

/* ============================================================
   LOADER → HOME
   ============================================================ */

function revealHome() {
  // The one-time intro plays on a genuine first load, not when coming back
  // from a project page (#home) or when the visitor asked for less motion.
  const withIntro =
    !SKIP_LOADER && !prefersReducedMotion && window.location.hash !== "#home";
  loader.hidden = true;
  home.hidden = false;
  void home.offsetWidth; // flush layout
  initHome(withIntro);
  requestAnimationFrame(() => {
    home.classList.add("is-visible");
    document.querySelector(".site-nav")?.classList.add("is-visible");
  });
}

function endLoader() {
  loader.classList.add("is-done");
  window.setTimeout(revealHome, 900);
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

  /* ---- one-time intro: blurry cluster → fanned deck → tight row → carousel ----
     The five states below are keyframes on a single continuous spline
     (Catmull-Rom), sampled every frame against a linear clock. The motion
     therefore flows through the stages with no stop or corner between them. */

  const INTRO_MS = 2000;
  const ROW_SCALE = SCALE_MIN;
  const POSE_FIELDS = ["x", "y", "rot", "scale", "opacity", "blur", "z"];

  // The pose of card `k` (relative index `rel` from the front card) at each stage.
  function introKeyframe(stage, rel, isEdge, isFront, F) {
    const dist = Math.abs(rel);
    if (stage === 1) {
      // invisible, tiny, piled at the centre
      return { x: 0, y: 0, rot: 0, scale: 0.1, opacity: 0, blur: 8, z: 900 - dist };
    }
    if (stage === 2) {
      // a small blurry cluster fades in, ~10% size
      return { x: rel * 7, y: dist * 4, rot: rel * 3, scale: 0.13, opacity: 0.55, blur: 6, z: 900 - dist };
    }
    if (stage === 3) {
      // the cluster grows to near full height, still a slightly fanned deck,
      // the START_SLUG cover in front and sharp
      return {
        x: rel * 20,
        y: dist * 9,
        rot: rel * 4.5,
        scale: ROW_SCALE * 0.95,
        opacity: isFront ? 1 : 0.82,
        blur: isFront ? 0 : 3.5,
        z: isFront ? 1000 : 820 - dist,
      };
    }
    if (stage === 4) {
      // cards slide apart into a tight row, same size, all sharp but the two ends
      return {
        x: rel * boxW * ROW_SCALE,
        y: 0,
        rot: 0,
        scale: ROW_SCALE,
        opacity: isEdge ? 0.32 : 1,
        blur: isEdge ? 7 : 0,
        z: isFront ? 1000 : 820 - dist,
      };
    }
    // stage 5 === the exact carousel start pose (seamless hand-off)
    return { x: F.x, y: 0, rot: 0, scale: F.scale, opacity: F.opacity, blur: F.blur, z: F.z };
  }

  function catmullRom(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  }

  // Sample the 5-keyframe spline for one card at global progress g ∈ [0, 1].
  function sampleSpline(keys, g) {
    const span = keys.length - 1; // 4 segments
    const f = Math.max(0, Math.min(span - 1e-6, g * span));
    const seg = Math.floor(f);
    const t = f - seg;
    const k0 = keys[Math.max(0, seg - 1)];
    const k1 = keys[seg];
    const k2 = keys[seg + 1];
    const k3 = keys[Math.min(span, seg + 2)];
    const out = { pointer: false };
    for (const field of POSE_FIELDS) {
      out[field] = catmullRom(k0[field], k1[field], k2[field], k3[field], t);
    }
    return out;
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
      const poses = new Array(links.length).fill(null);
      cards.forEach((c, k) => {
        poses[c.i] = sampleSpline(cardKeys[k], g);
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
  let dragX = 0;
  let dragMoved = 0;

  function onDragMove(event) {
    const dx = event.clientX - dragX;
    dragX = event.clientX;
    dragMoved += Math.abs(dx);
    nudge(-dx);
    velocity = -dx * 0.4;
  }

  function onDragEnd() {
    gallery.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    if (dragMoved > 6) {
      gallery.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        { capture: true, once: true }
      );
    }
  }

  gallery.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragX = event.clientX;
    dragMoved = 0;
    velocity = 0;
    gallery.classList.add("is-dragging");
    driftAt = performance.now() + RESUME_DELAY;
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
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

if (SKIP_LOADER || window.location.hash === "#home") {
  // Dev switch, or coming back from a project page: go straight to the Home.
  revealHome();
} else if (prefersReducedMotion) {
  window.setTimeout(endLoader, 1200);
} else {
  scheduleNextSlide();
}
