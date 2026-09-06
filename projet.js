/* ============================================================
   PROJECT PAGE — data + gallery transition
   Content (title, description, metadata, images) comes from the shared
   assets/projects-data.js — see that file for the actual project list.
   ============================================================ */

/* ---- desktop track (calibrated against maquette/schema.mov, a bare-
   rectangle reference demo): a single continuous filmstrip, like the home
   carousel, running behind fixed screen positions — centre (the stage,
   full size), an immediate left neighbour (small) and right neighbour
   (bigger, but still smaller than centre) — asymmetric on purpose, matching
   the reference. Navigating shifts EVERY image's position by one step at
   once (not just the current one): the old centre slides down to become the
   new left neighbour, the old right neighbour slides in to become the new
   centre, and the old left neighbour keeps sliding further left, off-screen
   — while, simultaneously, a new occurrence of that same image (the gallery
   loops) slides in from off-screen on the right to become the new right
   neighbour. See buildTrack()/renderTrack() below for how the clones that
   make this possible are managed. ---- */
const TRACK_DURATION = 600; // ms — keep in sync with .project__track-item's transition-duration in projet.css
const TRACK_GAP = 46; // px kept between the scaled edges of neighbouring cards
// Pose per position, relative to the current index (0 = centre/stage).
// Deliberately asymmetric (small left, bigger right); ±2 is the transiting
// "ghost" only ever glimpsed mid-shift — invisible at rest — before/after
// which every further position just reuses the ±2 pose (see trackPoseFor()).
const TRACK_RANGE = 2;
// Blur is applied to each card before it's scaled down, so the same CSS
// blur() radius reads as much fainter once shrunk — these are picked large
// enough that, after that shrink, the side previews are unrecognisable as
// pictures (just soft colour/shape), not merely "soft-focus". blur: 125
// matches the Figma spec; opacity: 0.5 fades them further into the
// background rather than sitting fully solid.
const TRACK_POSES = {
  "-2": { scale: 0.14, opacity: 0, blur: 160 },
  "-1": { scale: 0.3, opacity: 0.5, blur: 125 },
  0: { scale: 1, opacity: 1, blur: 0 },
  1: { scale: 0.65, opacity: 0.5, blur: 125 },
  2: { scale: 0.32, opacity: 0, blur: 160 },
};

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
const stageEl = document.querySelector(".project__stage");
const viewport = document.querySelector(".project__viewport");
const thumbsWrap = document.querySelector(".project__thumbs");
const arrowsWrap = document.querySelector(".project__arrows");
const arrows = [...document.querySelectorAll(".project__arrow")];
const nextLink = document.querySelector(".project__next");
const trackEl = document.querySelector(".project__track");

let index = 0;
let currentFrame = null; // mobile only — see makeFrame()/goToMobile()
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
  frame.appendChild(makeMedia(image));
  const veil = document.createElement("span");
  veil.className = "project__veil";
  frame.appendChild(veil);
  return frame;
}

// A video autoplays on arrival, muted (required by browsers to autoplay
// without a click) and looping, so it reads as a living image rather than a
// media player at rest. Its controls — a custom, minimal bar rather than the
// browser's own (see setupVideoControls()) — stay hidden until hovered.
function makeMedia(image) {
  if (image.type === "video") {
    const wrapper = document.createElement("div");
    wrapper.className = "project__video";

    const video = document.createElement("video");
    video.src = image.src;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    wrapper.appendChild(video);
    wrapper.appendChild(buildVideoControls(wrapper, video));
    return wrapper;
  }
  const img = document.createElement("img");
  img.src = image.src;
  img.width = image.w;
  img.height = image.h;
  img.alt = "";
  img.draggable = false;
  return img;
}

// A plain-text, no-icon control bar — play/pause by clicking the video
// itself, a thin draggable seek line, and two text toggles (mirroring the
// nav's own Menu/Close pattern) for sound and fullscreen.
function buildVideoControls(wrapper, video) {
  const bar = document.createElement("div");
  bar.className = "project__video-controls";

  const seekHit = document.createElement("div");
  seekHit.className = "project__video-seek-hit";
  const seek = document.createElement("div");
  seek.className = "project__video-seek";
  const seekFill = document.createElement("div");
  seekFill.className = "project__video-seek-fill";
  seek.appendChild(seekFill);
  seekHit.appendChild(seek);

  const row = document.createElement("div");
  row.className = "project__video-row";
  const muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "project__video-btn project__video-mute";
  const fsBtn = document.createElement("button");
  fsBtn.type = "button";
  fsBtn.className = "project__video-btn project__video-fullscreen";
  fsBtn.textContent = "Plein écran";
  row.append(muteBtn, fsBtn);

  bar.append(seekHit, row);

  function updateMuteLabel() {
    muteBtn.textContent = video.muted ? "Son" : "Muet";
  }
  updateMuteLabel();
  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    updateMuteLabel();
  });

  function updateSeek() {
    if (!video.duration) return;
    seekFill.style.width = `${((video.currentTime / video.duration) * 100).toFixed(2)}%`;
  }
  video.addEventListener("timeupdate", updateSeek);
  video.addEventListener("loadedmetadata", updateSeek);

  let scrubbing = false;
  function seekTo(clientX) {
    const rect = seek.getBoundingClientRect();
    if (!video.duration || rect.width === 0) return;
    video.currentTime = clamp01((clientX - rect.left) / rect.width) * video.duration;
  }
  function onScrubMove(event) {
    if (scrubbing) seekTo(event.clientX);
  }
  function stopScrub() {
    scrubbing = false;
    window.removeEventListener("pointermove", onScrubMove);
    window.removeEventListener("pointerup", stopScrub);
  }
  seekHit.addEventListener("pointerdown", (event) => {
    scrubbing = true;
    seekTo(event.clientX);
    window.addEventListener("pointermove", onScrubMove);
    window.addEventListener("pointerup", stopScrub);
  });

  fsBtn.addEventListener("click", () => {
    if (document.fullscreenElement === wrapper) document.exitFullscreen();
    else wrapper.requestFullscreen();
  });
  document.addEventListener("fullscreenchange", () => {
    fsBtn.textContent = document.fullscreenElement === wrapper ? "Réduire" : "Plein écran";
  });

  // click-anywhere-on-the-picture play/pause, instead of a dedicated button
  video.addEventListener("click", () => {
    if (video.paused) video.play();
    else video.pause();
  });

  return bar;
}

// A non-interactive preview: a video just shows its first frame, muted and
// with no controls. Used by the thumbnail strip and the side peeks below.
function makeStaticMedia(image) {
  if (image.type === "video") {
    const video = document.createElement("video");
    video.src = image.src;
    video.muted = true;
    video.preload = "metadata";
    return video;
  }
  const img = document.createElement("img");
  img.src = image.src;
  img.alt = "";
  return img;
}

// x is in vw (viewport width), so a given shift travels the same real
// distance across the screen regardless of the (much smaller) frame's own size.
// Removing a video element from the DOM eventually stops it, but not
// necessarily right away — pause it explicitly first so an outgoing video
// never keeps playing (and audible) a moment after its frame is gone.
function removeFrame(frame) {
  const video = frame.querySelector("video");
  if (video) video.pause();
  frame.remove();
}

function setPose(frame, { x = 0, scale = 1, blur = 0, opacity = 1, veil = 0 }) {
  frame.style.transform = `translate(${x.toFixed(2)}vw, 0) scale(${scale.toFixed(4)})`;
  frame.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "";
  frame.style.opacity = opacity.toFixed(3);
  frame.querySelector(".project__veil").style.opacity = veil.toFixed(3);
}

function buildInfo() {
  document.title = `${project.title} — Léa Nemeth`;
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

const MAX_VISIBLE_THUMBS = 5;

function buildThumbs() {
  thumbsWrap.innerHTML = "";
  const track = document.createElement("div");
  track.className = "project__thumbs-track";
  project.images.forEach((image, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "project__thumb";
    btn.setAttribute("aria-label", `Image ${i + 1}`);
    const thumb = makeStaticMedia(image);
    const veil = document.createElement("span");
    veil.className = "project__thumb-veil";
    btn.append(thumb, veil);
    btn.addEventListener("click", () => navigate(i));
    track.appendChild(btn);
  });
  thumbsWrap.appendChild(track);
  layoutThumbs();
  markCurrentThumb();
}

function thumbsTrack() {
  return thumbsWrap.querySelector(".project__thumbs-track");
}

function thumbVeil(i) {
  return thumbsTrack().children[i].querySelector(".project__thumb-veil");
}

/* ---- track: the desktop image display. A flat, cyclic list of clones —
   trackItems[c] always shows project.images[c % n] — long enough that
   offsets from -TRACK_RANGE-1 to +TRACK_RANGE+1 relative to `centerClone`
   always land on distinct clones (needed for the ghost effect: the same
   image exiting one side and re-entering the other are two different
   clones, each animating its own continuous path). Navigating moves
   `centerClone` by however many steps the target is away, wrapping it back
   into range with modulo (see wrapOffset()) rather than ever rebuilding —
   so the loop never needs to "reset" and never snaps, however many times
   you navigate, in either direction, forever. Every clone's pose is then
   recomputed from its (now different) offset, and the CSS transition on
   .project__track-item glides it there. */

let trackItems = [];
let centerClone = 0;
let centerVideoWrap = null; // the currently-promoted (interactive) video, if any

function trackPoseFor(offset) {
  const clamped = Math.max(-TRACK_RANGE, Math.min(TRACK_RANGE, offset));
  return TRACK_POSES[clamped];
}

// Shortest signed distance from `raw` to 0 around a ring of size `total`
// (e.g. wrapOffset(1, 9) === 1, wrapOffset(8, 9) === -1) — this is what lets
// `centerClone` wrap indefinitely while every clone's *visual* offset stays
// exactly the same as plain subtraction would give nearby the centre.
function wrapOffset(raw, total) {
  let d = ((raw % total) + total) % total; // into [0, total)
  if (d > total / 2) d -= total;
  return d;
}

function buildTrack() {
  if (!trackEl) return;
  trackEl.innerHTML = "";
  trackItems = [];
  const n = project.images.length;
  if (n === 0) return;

  // enough repeats that every tracked offset always has its own clone, with
  // a little slack either side
  const needed = (TRACK_RANGE + 1) * 2 + 3;
  const repeat = Math.max(1, Math.ceil(needed / n));
  for (let r = 0; r < repeat; r += 1) {
    for (let i = 0; i < n; i += 1) {
      const el = document.createElement("div");
      el.className = "project__track-item";
      el.appendChild(makeStaticMedia(project.images[i]));
      trackEl.appendChild(el);
      trackItems.push(el);
    }
  }
  centerClone = Math.floor(repeat / 2) * n + index;
  centerVideoWrap = null;
}

function setTrackPose(el, x, pose, z) {
  el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, 0) scale(${pose.scale.toFixed(3)})`;
  el.style.opacity = pose.opacity.toFixed(3);
  el.style.filter = pose.blur > 0.1 ? `blur(${pose.blur.toFixed(2)}px)` : "";
  el.style.zIndex = String(z);
}

// Whichever clone now sits at offset 0 becomes the interactive one (if it's
// a video — a plain image already looks identical either way): autoplay,
// sound, seek, fullscreen, sized to the stage. Any other clone still
// carrying that interactive video gets swapped back to a static preview.
function promoteCenter() {
  const el = trackItems[centerClone];
  if (!el || !stageEl) return;
  const meta = project.images[centerClone % project.images.length];
  if (!meta) return;

  trackItems.forEach((other, clone) => {
    if (other === el) return;
    const video = other.querySelector(".project__video");
    if (video) video.replaceWith(makeStaticMedia(project.images[clone % project.images.length]));
  });

  if (meta.type === "video" && !el.querySelector(".project__video")) {
    el.innerHTML = "";
    el.appendChild(makeMedia(meta));
  }
  el.classList.add("is-current");

  const videoWrap = el.querySelector(".project__video");
  centerVideoWrap = videoWrap || null;
  if (videoWrap) {
    const stageRect = stageEl.getBoundingClientRect();
    const scale = Math.min(stageRect.width / meta.w, stageRect.height / meta.h);
    sizeVideo(videoWrap, meta, scale);
  }
}

function renderTrack() {
  if (!trackEl || !stageEl || !trackItems.length) return;
  const stageRect = stageEl.getBoundingClientRect();
  const hw = stageRect.width / 2;
  const centreX = stageRect.left + hw;
  const reach = TRACK_RANGE + 1;

  const xByOffset = { 0: 0 };
  let edge = hw;
  for (let off = 1; off <= reach; off += 1) {
    const s = trackPoseFor(off).scale;
    const x = edge + TRACK_GAP + hw * s;
    xByOffset[off] = x;
    edge = x + hw * s;
  }
  edge = -hw;
  for (let off = -1; off >= -reach; off -= 1) {
    const s = trackPoseFor(off).scale;
    const x = edge - TRACK_GAP - hw * s;
    xByOffset[off] = x;
    edge = x - hw * s;
  }

  const total = trackItems.length;
  trackItems.forEach((el, clone) => {
    el.classList.remove("is-current");
    // every clone shares one base box — the stage's own size — and is only
    // ever shrunk visually via transform:scale(), never resized itself
    el.style.width = `${stageRect.width.toFixed(1)}px`;
    el.style.height = `${stageRect.height.toFixed(1)}px`;
    const offset = Math.max(-reach, Math.min(reach, wrapOffset(clone - centerClone, total)));
    setTrackPose(el, centreX + xByOffset[offset], trackPoseFor(offset), 100 - Math.abs(offset));
  });

  promoteCenter();
}

// The stage box has a fixed size, but the image/video inside only fills it
// via object-fit: contain — its real rendered height depends on its own
// aspect ratio (and on the box's, which changes as the window is resized).
// Since it's anchored to the top (object-position: center top in
// projet.css), the gap always opens up at the bottom — so the arrows,
// sitting just to the right of the image, need their *bottom* edge moved
// up to that real edge instead of the stage box's, or they'd drift away
// from it. `bottom` (distance from the stage's own bottom) does that.
function positionArrows(i = index, ms = MOBILE_DURATION) {
  if (!stageEl || !arrowsWrap) return;
  const meta = project.images[i];
  if (!meta) return;
  const boxW = stageEl.clientWidth;
  const boxH = stageEl.clientHeight;
  const scale = Math.min(boxW / meta.w, boxH / meta.h);
  const renderedH = meta.h * scale;
  arrowsWrap.style.transitionDuration = `${ms}ms`;
  arrowsWrap.style.bottom = `${(boxH - renderedH).toFixed(1)}px`;

  // a video's wrapper needs resizing to match too (see the note next to
  // .project__video in projet.css) — same measurement, so it rides along on
  // every call site that already keeps the arrows in sync. Mobile sizes
  // currentFrame's video (see makeFrame()); desktop sizes the track's
  // currently-promoted one (see promoteCenter()).
  const videoWrap = (currentFrame && currentFrame.querySelector(".project__video")) || centerVideoWrap;
  if (videoWrap) sizeVideo(videoWrap, meta, scale);
}

// Sets the video wrapper's own width/height (not just the picture inside
// it) to its real rendered size, so the custom control bar hugs the actual
// frame instead of stretching across the whole (often taller) stage box.
function sizeVideo(videoWrap, meta, scale) {
  videoWrap.style.width = `${(meta.w * scale).toFixed(1)}px`;
  videoWrap.style.height = `${(meta.h * scale).toFixed(1)}px`;
}

// Sizes the viewport to show at most MAX_VISIBLE_THUMBS thumbnails — the
// rest sit clipped outside it, revealed by sliding (see scrollThumbsToCurrent).
// The blurred white edge fade only switches on once there's actually more
// than fits (see .project__thumbs.has-overflow in projet.css).
function layoutThumbs() {
  const track = thumbsTrack();
  const first = track.children[0];
  if (!first) return;
  const n = project.images.length;
  const thumbW = first.offsetWidth;
  const gap = parseFloat(getComputedStyle(track).gap) || 0;
  const visible = Math.min(MAX_VISIBLE_THUMBS, n);
  thumbsWrap.style.width = `${visible * thumbW + (visible - 1) * gap}px`;
  thumbsWrap.classList.toggle("has-overflow", n > MAX_VISIBLE_THUMBS);
  scrollThumbsToCurrent(index, 0); // land in place, no slide-in on load
}

// Slides the track so the given image's thumbnail stays inside the visible
// window (centred when possible) instead of just cutting the rest. `ms`
// lets the slide run on the same clock as whichever image transition
// triggered it, so the strip moves *with* the image, not after it.
function scrollThumbsToCurrent(target = index, ms = MOBILE_DURATION) {
  const track = thumbsTrack();
  const first = track.children[0];
  if (!first) return;
  const n = project.images.length;
  const visible = Math.min(MAX_VISIBLE_THUMBS, n);
  const thumbW = first.offsetWidth;
  const gap = parseFloat(getComputedStyle(track).gap) || 0;
  const step = thumbW + gap;
  let start = target - Math.floor((visible - 1) / 2);
  start = Math.max(0, Math.min(start, n - visible));
  track.style.transitionDuration = `${ms}ms`;
  track.style.transform = `translateX(${(-start * step).toFixed(1)}px)`;
}

function markCurrentThumb(i = index) {
  [...thumbsTrack().children].forEach((el, k) => {
    el.classList.toggle("is-current", k === i);
    el.querySelector(".project__thumb-veil").style.opacity = "";
  });
}

/* ---- navigation (desktop): shifts the whole track by the signed distance
   to `target` (see buildTrack()/renderTrack() above) — one step for an
   arrow click, however many for a thumbnail click further away. ---- */

function goTo(target, dir) {
  if (busy || target === index) return;
  const n = project.images.length;
  target = ((target % n) + n) % n;
  if (target === index) return;

  // signed shortest distance, so a multi-step thumbnail jump shifts the
  // track that many steps at once rather than just ±1
  const forward = (target - index + n) % n;
  const backward = (index - target + n) % n;
  const delta = forward <= backward ? forward : -backward;
  dir = dir || (delta >= 0 ? 1 : -1);

  index = target;
  // wrapped with modulo (not just += delta) so this can run forever in
  // either direction without ever needing to rebuild the clone list
  centerClone = ((centerClone + delta) % trackItems.length + trackItems.length) % trackItems.length;

  markCurrentThumb();
  scrollThumbsToCurrent(target, TRACK_DURATION);
  positionArrows(target, TRACK_DURATION);
  renderTrack();

  if (prefersReducedMotion) return;

  busy = true;
  arrows.forEach((a) => (a.disabled = true));
  window.setTimeout(() => {
    busy = false;
    arrows.forEach((a) => (a.disabled = false));
  }, TRACK_DURATION);
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

  // the desktop track stays hidden on mobile, but keeping it in sync means
  // it's already correct if the viewport is later resized past the
  // breakpoint without another navigation happening first.
  const forward = (target - index + n) % n;
  const backward = (index - target + n) % n;
  const trackDelta = forward <= backward ? forward : -backward;
  centerClone = ((centerClone + trackDelta) % trackItems.length + trackItems.length) % trackItems.length;

  const stageW = document.querySelector(".project__stage").offsetWidth || window.innerWidth;
  const outFrame = continueFrame || currentFrame;
  const inFrame = makeFrame(project.images[target]);
  viewport.appendChild(inFrame);
  currentFrame = inFrame;
  index = target;
  markCurrentThumb();
  scrollThumbsToCurrent(target, prefersReducedMotion ? 0 : MOBILE_DURATION);
  positionArrows(target, prefersReducedMotion ? 0 : MOBILE_DURATION); // hidden on mobile, kept in sync anyway
  renderTrack();

  if (prefersReducedMotion) {
    setMobilePose(inFrame, {});
    removeFrame(outFrame);
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
    removeFrame(outFrame);
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
    // a tap starting on the video itself, or on its custom controls bar
    // (play/seek/sound/fullscreen), must reach them untouched — otherwise
    // the slightest finger movement during the tap gets read as a swipe and
    // the browser cancels the click, so play/pause/seeking never fires.
    if (event.target.closest(".project__video")) return;
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
buildTrack();
currentFrame = makeFrame(project.images[index]);
setPose(currentFrame, {});
viewport.appendChild(currentFrame);
positionArrows(index, 0);
renderTrack();

arrows.forEach((arrow) => {
  const dir = Number(arrow.dataset.dir);
  arrow.addEventListener("click", () => goTo(index + dir, dir));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") navigate(index - 1, -1);
  else if (event.key === "ArrowRight") navigate(index + 1, 1);
});

// thumbnail size / the stage's own aspect change on resize — re-measure both.
window.addEventListener("resize", () => {
  layoutThumbs();
  positionArrows(index, 0);
  renderTrack();
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
