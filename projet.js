/* ============================================================
   PROJECT PAGE — data + gallery transition
   Content (title, description, metadata, images) comes from the shared
   assets/projects-data.js — see that file for the actual project list.
   ============================================================ */

/* ---- desktop transition tuning (calibrated against the reference screen
   recording). Distances are in vw (viewport width), like the home carousel,
   so the incoming/outgoing image travels to/past the actual screen edges
   rather than a fraction of its own (much smaller) box.
   The outgoing image clears the frame quickly (front-loaded), the incoming
   one keeps gliding/shrinking/focusing over the whole duration. Both are
   mirrored by `dir`: going to the next image sends the outgoing left and
   brings the incoming in from the right; going to the previous one reverses
   it (outgoing right, incoming from the left). ---- */
const DURATION = 1100; // ms — full length of one image change
const OUT_SHIFT = -58; // vw the outgoing image travels (past the left edge)
const OUT_SCALE_END = 0.3; // outgoing shrinks to this
const OUT_BLUR_END = 22; // px
const OUT_VEIL_END = 0.96; // white wash over the outgoing image
const OUT_EXIT = 0.5; // fraction of the timeline the outgoing takes to leave (front-loaded)
const IN_SHIFT = 58; // vw the incoming image starts from (past the right edge)
const IN_SCALE_START = 0.72; // incoming arrives smaller than final, then grows in
const IN_BLUR_START = 30; // px
const IN_OPACITY_START = 0.22;

/* ---- mobile transition tuning: a swipe drags the current image with it,
   blurring toward the sides; releasing past the threshold commits to the
   next/previous image (continuing smoothly from the drag), otherwise it
   snaps back. A tap on a thumbnail plays the same settle animation. ---- */
const MOBILE_BREAKPOINT = "(max-width: 820px)";
const MOBILE_DURATION = 300; // ms
const MOBILE_BLUR_MAX = 10; // px reached at the sides
const MOBILE_FADE_MAX = 0.3; // opacity lost at the sides
const MOBILE_COMMIT_RATIO = 0.16; // fraction of the stage width to trigger a swipe

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const requestedSlug = new URLSearchParams(location.search).get("p");
const project =
  SITE_PROJECTS.find((p) => p.slug === requestedSlug) || SITE_PROJECTS[0];

const root = document.querySelector(".project");
const viewport = document.querySelector(".project__viewport");
const thumbsWrap = document.querySelector(".project__thumbs");
const arrows = [...document.querySelectorAll(".project__arrow")];
const nextLink = document.querySelector(".project__next");

let index = 0;
let currentFrame = null;
let busy = false;

const isMobile = () => window.matchMedia(MOBILE_BREAKPOINT).matches;

/* ---- easing ---- */
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Which way is "shorter" around the loop when no explicit direction was given
// (e.g. tapping a thumbnail rather than an arrow).
function resolveDir(target) {
  const n = project.images.length;
  const forward = (target - index + n) % n;
  const backward = (index - target + n) % n;
  return forward <= backward ? 1 : -1;
}

// Dispatches to the desktop (edge-to-edge) or mobile (light blur) transition.
function navigate(target, dir) {
  if (isMobile()) goToMobile(target, dir);
  else goTo(target, dir);
}

/* ---- build ---- */

function makeFrame(image) {
  const frame = document.createElement("div");
  frame.className = "project__frame";
  const img = document.createElement("img");
  img.src = image.src;
  img.width = image.w;
  img.height = image.h;
  img.alt = "";
  img.draggable = false;
  const veil = document.createElement("span");
  veil.className = "project__veil";
  frame.append(img, veil);
  return frame;
}

// x is in vw (viewport width), so a given shift travels the same real
// distance across the screen regardless of the (much smaller) frame's own size.
function setPose(frame, { x = 0, scale = 1, blur = 0, opacity = 1, veil = 0 }) {
  frame.style.transform = `translate(${x.toFixed(2)}vw, 0) scale(${scale.toFixed(4)})`;
  frame.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "";
  frame.style.opacity = opacity.toFixed(3);
  frame.querySelector(".project__veil").style.opacity = veil.toFixed(3);
}

function buildInfo() {
  document.querySelector(".project__title").textContent = project.title;
  const desc = document.querySelector(".project__desc");
  desc.innerHTML = "";
  for (const para of project.description) {
    const p = document.createElement("p");
    p.textContent = para;
    desc.appendChild(p);
  }
  document.querySelector(".project__meta-technique").textContent = project.technique;
  document.querySelector(".project__meta-year").textContent = project.year;
}

function buildThumbs() {
  thumbsWrap.innerHTML = "";
  project.images.forEach((image, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "project__thumb";
    btn.setAttribute("aria-label", `Image ${i + 1}`);
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = "";
    const veil = document.createElement("span");
    veil.className = "project__thumb-veil";
    btn.append(img, veil);
    btn.addEventListener("click", () => navigate(i));
    thumbsWrap.appendChild(btn);
  });
  markCurrentThumb();
}

function thumbVeil(i) {
  return thumbsWrap.children[i].querySelector(".project__thumb-veil");
}

function markCurrentThumb(i = index) {
  [...thumbsWrap.children].forEach((el, k) => {
    el.classList.toggle("is-current", k === i);
    el.querySelector(".project__thumb-veil").style.opacity = "";
  });
}

/* ---- navigation (desktop): edge-to-edge, mirrors with direction ---- */

function goTo(target, dir) {
  if (busy || target === index) return;
  const n = project.images.length;
  target = ((target % n) + n) % n;
  if (target === index) return;
  dir = dir || resolveDir(target);

  const outFrame = currentFrame;
  const inFrame = makeFrame(project.images[target]);
  viewport.appendChild(inFrame);
  currentFrame = inFrame;

  if (prefersReducedMotion) {
    setPose(inFrame, {});
    outFrame.remove();
    index = target;
    markCurrentThumb();
    return;
  }

  busy = true;
  arrows.forEach((a) => (a.disabled = true));

  // the thumbnail strip is re-veiled in step with the image change
  const fromVeil = thumbVeil(index);
  const toVeil = thumbVeil(target);
  thumbsWrap.classList.add("is-changing");

  // dir flips which side each image travels to/from: next (dir=1) sends the
  // outgoing left and brings the incoming in from the right; previous
  // (dir=-1) mirrors it — outgoing right, incoming from the left.
  const outShift = OUT_SHIFT * dir;
  const inShift = IN_SHIFT * dir;

  setPose(inFrame, {
    x: inShift,
    scale: IN_SCALE_START,
    blur: IN_BLUR_START,
    opacity: IN_OPACITY_START,
    veil: 0,
  });
  inFrame.getBoundingClientRect(); // flush the start pose

  const started = performance.now();

  function step(now) {
    const t = clamp01((now - started) / DURATION);

    // outgoing: leaves promptly (front-loaded), so it clears the incoming
    const out = easeOut(clamp01(t / OUT_EXIT));
    const outBlur = easeOut(clamp01(t / 0.38));
    // incoming: glides the whole way, focus resolves earlier
    const inn = easeOut(t);
    const inFocus = easeOut(clamp01(t / 0.5));
    const inFade = easeOut(clamp01(t / 0.42));

    setPose(outFrame, {
      x: outShift * out,
      scale: 1 + (OUT_SCALE_END - 1) * out,
      blur: OUT_BLUR_END * outBlur,
      opacity: 1,
      veil: OUT_VEIL_END * out,
    });

    setPose(inFrame, {
      x: inShift * (1 - inn),
      scale: IN_SCALE_START + (1 - IN_SCALE_START) * inn,
      blur: IN_BLUR_START * (1 - inFocus),
      opacity: IN_OPACITY_START + (1 - IN_OPACITY_START) * inFade,
      veil: 0,
    });

    // thumbnail strip: old one re-veils, new one un-veils, on the same clock
    const swap = easeOut(clamp01(t / 0.9));
    fromVeil.style.opacity = (0.62 * swap).toFixed(3);
    toVeil.style.opacity = (0.62 * (1 - swap)).toFixed(3);

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      setPose(inFrame, {});
      outFrame.remove();
      index = target;
      thumbsWrap.classList.remove("is-changing");
      markCurrentThumb();
      busy = false;
      arrows.forEach((a) => (a.disabled = false));
    }
  }

  requestAnimationFrame(step);
}

/* ---- navigation (mobile): light blur-toward-the-sides settle, driven by
   CSS transitions rather than a rAF tween — see .project__frame's mobile
   rule in projet.css. Swiping calls this with `continueFrame` so it picks up
   exactly where the drag left off instead of resetting. ---- */

function setMobilePose(frame, { x = 0, blur = 0, opacity = 1 }) {
  frame.style.transform = `translate(${x.toFixed(1)}px, 0)`;
  frame.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "";
  frame.style.opacity = opacity.toFixed(3);
}

function goToMobile(target, dir, continueFrame) {
  if ((busy && !continueFrame) || target === index) return;
  const n = project.images.length;
  target = ((target % n) + n) % n;
  if (target === index) return;
  dir = dir || resolveDir(target);

  const stageW = document.querySelector(".project__stage").offsetWidth || window.innerWidth;
  const outFrame = continueFrame || currentFrame;
  const inFrame = makeFrame(project.images[target]);
  viewport.appendChild(inFrame);
  currentFrame = inFrame;
  index = target;
  markCurrentThumb();

  if (prefersReducedMotion) {
    setMobilePose(inFrame, {});
    outFrame.remove();
    return;
  }

  busy = true;

  if (!continueFrame) {
    outFrame.style.transition = "none";
    setMobilePose(outFrame, { x: 0, blur: 0, opacity: 1 });
    outFrame.getBoundingClientRect();
    outFrame.style.transition = "";
  }

  inFrame.style.transition = "none";
  setMobilePose(inFrame, { x: dir * stageW, blur: MOBILE_BLUR_MAX, opacity: 1 - MOBILE_FADE_MAX });
  inFrame.getBoundingClientRect();
  inFrame.style.transition = "";

  requestAnimationFrame(() => {
    setMobilePose(outFrame, { x: -dir * stageW, blur: MOBILE_BLUR_MAX, opacity: 1 - MOBILE_FADE_MAX });
    setMobilePose(inFrame, { x: 0, blur: 0, opacity: 1 });
  });

  window.setTimeout(() => {
    outFrame.remove();
    busy = false;
  }, MOBILE_DURATION + 30);
}

/* ---- swipe: drags the current image, blurring toward the sides;
   releasing past the threshold commits (continuing the motion), otherwise
   it springs back. Pointer events so it works with touch and mouse alike. ---- */

(function initSwipe() {
  const stage = document.querySelector(".project__stage");
  let dragging = false;
  let startX = 0;
  let dx = 0;

  function poseFromDrag(distance) {
    const stageW = stage.offsetWidth || window.innerWidth;
    const reach = Math.min(1, Math.abs(distance) / (stageW * 0.6));
    return {
      x: distance,
      blur: MOBILE_BLUR_MAX * reach,
      opacity: 1 - MOBILE_FADE_MAX * reach,
    };
  }

  function onMove(event) {
    if (!dragging) return;
    dx = event.clientX - startX;
    setMobilePose(currentFrame, poseFromDrag(dx));
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);

    const stageW = stage.offsetWidth || window.innerWidth;
    currentFrame.style.transition = `transform ${MOBILE_DURATION}ms ease, filter ${MOBILE_DURATION}ms ease, opacity ${MOBILE_DURATION}ms ease`;

    if (Math.abs(dx) > stageW * MOBILE_COMMIT_RATIO) {
      const dir = dx < 0 ? 1 : -1; // dragged left -> next, dragged right -> previous
      goToMobile(index + dir, dir, currentFrame);
    } else {
      setMobilePose(currentFrame, { x: 0, blur: 0, opacity: 1 });
      const settled = currentFrame;
      settled.addEventListener(
        "transitionend",
        () => {
          settled.style.transition = "";
        },
        { once: true }
      );
    }
  }

  stage.addEventListener("pointerdown", (event) => {
    if (!isMobile() || busy) return;
    dragging = true;
    startX = event.clientX;
    dx = 0;
    currentFrame.style.transition = "none";
    stage.classList.add("is-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
})();

/* ---- init ---- */

buildInfo();
buildThumbs();
currentFrame = makeFrame(project.images[index]);
setPose(currentFrame, {});
viewport.appendChild(currentFrame);

arrows.forEach((arrow) => {
  const dir = Number(arrow.dataset.dir);
  arrow.addEventListener("click", () => goTo(index + dir, dir));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") navigate(index - 1, -1);
  else if (event.key === "ArrowRight") navigate(index + 1, 1);
});

// mobile-only "Next project" link (see projet.css): cycles to the next
// entry in SITE_PROJECTS, wrapping back to the first after the last.
if (nextLink) {
  const projectIndex = SITE_PROJECTS.indexOf(project);
  const next = SITE_PROJECTS[(projectIndex + 1) % SITE_PROJECTS.length];
  nextLink.href = `projet.html?p=${encodeURIComponent(next.slug)}`;
}

requestAnimationFrame(() => {
  root.classList.add("is-ready");
  document.querySelector(".site-nav")?.classList.add("is-visible");
});
