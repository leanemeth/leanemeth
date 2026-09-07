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
const MOBILE_SWIPE_SLOP = 8; // px of sideways travel before a drag engages (vs a vertical scroll)
const MOBILE_FLICK_VELOCITY = 0.4; // px/ms at release that commits a swipe regardless of distance

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// `let`, not `const`: navigating from one project to another is a client-side
// swap (see switchProject() near the bottom), not a page reload — so this
// rebinds instead of the whole document tearing down and rebuilding.
let project =
  SITE_PROJECTS.find((p) => p.slug === new URLSearchParams(location.search).get("p")) ||
  SITE_PROJECTS[0];

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
// media player at rest. `video()` entries also get a custom, minimal control
// bar (hidden until hovered — see buildVideoControls()); `loopVideo()` entries
// are marked `bare` and get no controls at all.
function makeMedia(image) {
  if (image.type === "video") {
    const wrapper = document.createElement("div");
    wrapper.className = image.bare ? "project__video project__video--bare" : "project__video";

    const video = document.createElement("video");
    video.src = image.src;
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    // Mobile Safari/Chrome only grant muted inline autoplay when these are
    // real attributes present on the element before it's inserted — the JS
    // properties above aren't honoured on a freshly-created <video>.
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    wrapper.appendChild(video);
    if (!image.bare) wrapper.appendChild(buildVideoControls(wrapper, video));
    // Even with the attributes, a dynamically-created <video> often needs an
    // explicit play() on mobile — retried once it has enough data, since the
    // first call can land before the source is ready. Rejections (Low Power
    // Mode, backgrounded tab) are harmless.
    keepPlaying(video);
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

// Drives a muted autoplay loop to actually start on mobile: try to play now,
// and again on the first event that means the media is ready, then stop
// listening. Any rejected play() promise is swallowed (Low Power Mode, a
// backgrounded tab) — there's no player UI to fall back to by design.
function keepPlaying(video) {
  let settled = false;
  const attempt = () => {
    const p = video.play();
    if (p && typeof p.then === "function") {
      p.then(
        () => {
          settled = true;
        },
        () => {}
      );
    }
  };
  const retry = () => {
    if (!settled && video.paused) attempt();
  };
  attempt();
  // after the caller has inserted the frame into the DOM
  requestAnimationFrame(retry);
  // ...and whenever the media reaches a playable state (these may have
  // already fired if the file was pre-warmed, hence the rAF above too)
  ["loadeddata", "canplay", "canplaythrough"].forEach((evt) =>
    video.addEventListener(evt, retry, { once: true })
  );
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

  // In fullscreen the pointer is always "over" the video, so :hover can't
  // gate the bar. Instead it follows pointer activity: shown on move, then
  // faded out (bar + cursor) after a couple of seconds of stillness.
  // Listener on `wrapper` (not document) so it's dropped when a demoted
  // clone is swapped back to a still frame.
  let idleTimer = null;
  function wake() {
    wrapper.classList.add("is-active");
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => wrapper.classList.remove("is-active"), 2200);
  }
  wrapper.addEventListener("fullscreenchange", () => {
    const isFs = document.fullscreenElement === wrapper;
    fsBtn.textContent = isFs ? "Réduire" : "Plein écran";
    if (isFs) {
      wrapper.addEventListener("pointermove", wake);
      wake();
    } else {
      wrapper.removeEventListener("pointermove", wake);
      window.clearTimeout(idleTimer);
      wrapper.classList.remove("is-active");
    }
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
    // #t= nudges the browser to seek to and paint the first frame as a still —
    // without it iOS Safari leaves a controls-less <video> blank. playsinline +
    // muted keep it from being treated as a launchable player.
    video.src = image.src + "#t=0.001";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "metadata";
    video.tabIndex = -1;
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
  // the tab always reads "Léa Nemeth" (set in the HTML) — never per-project
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

/* ---- thumbnail strip. When every thumbnail fits (n <= MAX_VISIBLE_THUMBS)
   it stays a plain static row. Once there are more than fit it becomes a
   cyclic strip — the same clone trick as the desktop filmstrip: THUMB_REPEAT
   copies of the n thumbnails laid end to end, `thumbCenter` (the clone index
   of the current image) and the whole track translated so that clone sits in
   the *left-most* visible slot — the current image anchors the left edge and
   the upcoming ones stream in from the right, looping forever. Because every
   clone `c` shows images[c % n], shifting `thumbCenter` by a whole `n` lands
   on identical thumbnails — so after each move we snap it silently back into
   the home band (rebaseThumbs()), one copy in from the left: that single
   left-hand copy absorbs "previous image" moves, the other THUMB_REPEAT - 1
   copies feed the window as it slides right. */
const THUMB_REPEAT = 4;

let thumbEls = [];
let thumbCyclic = false;
let thumbCenter = 0; // clone index of the current image (cyclic strip only)

function buildThumbs() {
  thumbsWrap.innerHTML = "";
  const n = project.images.length;
  thumbCyclic = n > MAX_VISIBLE_THUMBS;

  const track = document.createElement("div");
  track.className = "project__thumbs-track";

  const repeat = thumbCyclic ? THUMB_REPEAT : 1;
  thumbEls = [];
  for (let r = 0; r < repeat; r += 1) {
    project.images.forEach((image, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project__thumb";
      btn.setAttribute("aria-label", `Image ${i + 1}`);
      const veil = document.createElement("span");
      veil.className = "project__thumb-veil";
      btn.append(makeStaticMedia(image), veil);
      btn.addEventListener("click", () => navigate(i));
      track.appendChild(btn);
      thumbEls.push(btn);
    });
  }

  thumbsWrap.appendChild(track);
  // home band = the second copy (one copy of slack on the left)
  thumbCenter = thumbCyclic ? n + index : index;
  layoutThumbs();
  markCurrentThumb();
}

function thumbsTrack() {
  return thumbsWrap.querySelector(".project__thumbs-track");
}

// distance between two thumbnails' left edges (width + flex gap), in px
function thumbStep() {
  const first = thumbEls[0];
  if (!first) return 0;
  const gap = parseFloat(getComputedStyle(thumbsTrack()).gap) || 0;
  return first.offsetWidth + gap;
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
      // click a side preview to jump to it — renderTrack() marks the reachable
      // ones (.is-side / pointer-events:auto); the others ignore the click
      const clone = trackItems.length;
      el.addEventListener("click", () => {
        if (busy) return;
        const off = wrapOffset(clone - centerClone, trackItems.length);
        if (off !== 0 && Math.abs(off) <= TRACK_RANGE) {
          goTo(index + off, off > 0 ? 1 : -1);
        }
      });
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

// `animate` false snaps every clone straight to its pose with the per-item
// CSS transition suppressed — used for the first paint (so the filmstrip
// doesn't slide in sideways from x=0; the gentle arrival is carried by
// .project's own fade+rise instead) and on resize.
function renderTrack(animate = true) {
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
  if (!animate) trackEl.classList.add("is-still");
  trackItems.forEach((el, clone) => {
    el.classList.remove("is-current");
    // every clone shares one base box — the stage's own size — and is only
    // ever shrunk visually via transform:scale(), never resized itself
    el.style.width = `${stageRect.width.toFixed(1)}px`;
    el.style.height = `${stageRect.height.toFixed(1)}px`;
    const offset = Math.max(-reach, Math.min(reach, wrapOffset(clone - centerClone, total)));
    // the two blurry previews either side of the current image are clickable
    el.classList.toggle("is-side", Math.abs(offset) === 1);
    setTrackPose(el, centreX + xByOffset[offset], trackPoseFor(offset), 100 - Math.abs(offset));
  });

  if (!animate) {
    void trackEl.offsetWidth; // commit the poses while item transitions are off
    trackEl.classList.remove("is-still");
  }

  promoteCenter();
}

// Two jobs, kept together because both ride along on every navigation/resize:
//
//  1. The prev/next arrows sit on the "Next project" line (fixed `bottom` in
//     projet.css), with their left edge aligned to the thumbnail strip's
//     left edge — just above its first thumbnail. That edge depends on the
//     strip's width, which depends on the image count, so it can only be
//     read from the laid-out strip (after layoutThumbs()) — hence `left` set
//     here in px rather than in CSS. Mobile hides the arrows, so skip it there.
//
//  2. A promoted video's wrapper is resized to its real rendered size (see
//     the note next to .project__video in projet.css) — same `contain`
//     scale maths as the track/stage. Mobile sizes currentFrame's video
//     (see makeFrame()); desktop sizes the track's currently-promoted one
//     (see promoteCenter()).
function positionArrows(i = index) {
  const meta = project.images[i];
  if (meta && stageEl) {
    const scale = Math.min(stageEl.clientWidth / meta.w, stageEl.clientHeight / meta.h);
    const videoWrap = (currentFrame && currentFrame.querySelector(".project__video")) || centerVideoWrap;
    if (videoWrap) sizeVideo(videoWrap, meta, scale);
  }

  if (arrowsWrap && thumbsWrap && !isMobile()) {
    arrowsWrap.style.left = `${thumbsWrap.getBoundingClientRect().left.toFixed(1)}px`;
  }
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
  scrollThumbsToCurrent(0); // land in place, no slide-in on load
}

// Slides the track so the current image's thumbnail sits at the LEFT edge of
// the visible window, with the upcoming images to its right. `ms` lets the
// slide run on the same clock as whichever image transition triggered it, so
// the strip moves *with* the image, not after it. Cyclic strip: anchors
// `thumbCenter` to the left slot. Plain strip: clamps so it never scrolls
// past either end.
function scrollThumbsToCurrent(ms = MOBILE_DURATION) {
  const track = thumbsTrack();
  if (!thumbEls.length) return;
  const n = project.images.length;
  const visible = Math.min(MAX_VISIBLE_THUMBS, n);
  const step = thumbStep();

  const slot = thumbCyclic
    ? thumbCenter
    : Math.max(0, Math.min(index - Math.floor((visible - 1) / 2), n - visible));
  track.style.transitionDuration = `${prefersReducedMotion ? 0 : ms}ms`;
  track.style.transform = `translateX(${(-slot * step).toFixed(1)}px)`;
}

// After a move the current clone may have drifted out of the home band. Every
// clone `c` shows images[c % n], so nudging `thumbCenter` by a whole `n` puts
// an identical thumbnail under every slot — meaning we can snap it back into
// the home band (one copy in from the left) with the transition off and
// nothing visibly moves. This is what keeps the strip looping with no end.
function rebaseThumbs() {
  if (!thumbCyclic) return;
  const n = project.images.length;
  const home = n;
  const rebased = home + (((thumbCenter - home) % n) + n) % n;
  if (rebased !== thumbCenter) {
    thumbCenter = rebased;
    scrollThumbsToCurrent(0);
    markCurrentThumb();
  }
}

function markCurrentThumb() {
  const n = project.images.length;
  thumbEls.forEach((el, k) => {
    el.classList.toggle("is-current", k % n === index);
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
  // thumbnail strip moves the same signed distance; rebaseThumbs() snaps it
  // back into the middle band once the slide has settled
  thumbCenter += delta;

  markCurrentThumb();
  scrollThumbsToCurrent(TRACK_DURATION);
  positionArrows(target);
  renderTrack();

  if (prefersReducedMotion) {
    rebaseThumbs();
    return;
  }

  busy = true;
  arrows.forEach((a) => (a.disabled = true));
  window.setTimeout(() => {
    busy = false;
    arrows.forEach((a) => (a.disabled = false));
    rebaseThumbs();
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
  thumbCenter += trackDelta;

  const stageW = document.querySelector(".project__stage").offsetWidth || window.innerWidth;
  const outFrame = continueFrame || currentFrame;
  const inFrame = makeFrame(project.images[target]);
  viewport.appendChild(inFrame);
  currentFrame = inFrame;
  index = target;
  markCurrentThumb();
  scrollThumbsToCurrent(MOBILE_DURATION);
  positionArrows(target); // hidden on mobile, kept in sync anyway
  renderTrack();

  if (prefersReducedMotion) {
    setMobilePose(inFrame, {});
    removeFrame(outFrame);
    rebaseThumbs();
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
    rebaseThumbs();
  }, MOBILE_DURATION + 30);
}

/* ---- swipe: drags the current image, blurring toward the sides;
   releasing past the threshold commits (continuing the motion), otherwise
   it springs back. Pointer events so it works with touch and mouse alike. ---- */

(function initSwipe() {
  const stage = document.querySelector(".project__stage");
  let active = false; // pointer is down and hasn't ended yet
  let engaged = false; // travel passed the slop -> we're actually moving the image
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let lastX = 0;
  let lastT = 0;
  let vx = 0; // running release velocity, px/ms

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
    if (!active) return;
    dx = event.clientX - startX;

    if (!engaged) {
      const ady = Math.abs(event.clientY - startY);
      if (Math.abs(dx) < MOBILE_SWIPE_SLOP) return;
      // more vertical than horizontal -> it's a page scroll, let go of it
      if (ady > Math.abs(dx)) {
        end(true);
        return;
      }
      engaged = true;
      stage.classList.add("is-dragging");
      currentFrame.style.transition = "none";
    }

    const now = event.timeStamp || performance.now();
    const dt = now - lastT;
    // smooth the velocity a little so a finger that stalls right before lift
    // doesn't kill the flick
    if (dt > 0) vx = 0.7 * vx + 0.3 * ((event.clientX - lastX) / dt);
    lastX = event.clientX;
    lastT = now;

    setMobilePose(currentFrame, poseFromDrag(dx));
    if (event.cancelable) event.preventDefault();
  }

  function end(cancelled) {
    if (!active) return;
    active = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (!engaged) return; // a tap, or a gesture that turned into a vertical scroll

    engaged = false;
    stage.classList.remove("is-dragging");

    const stageW = stage.offsetWidth || window.innerWidth;
    currentFrame.style.transition = `transform ${MOBILE_DURATION}ms ease, filter ${MOBILE_DURATION}ms ease, opacity ${MOBILE_DURATION}ms ease`;

    const flick = !cancelled && Math.abs(vx) > MOBILE_FLICK_VELOCITY && Math.sign(vx) === Math.sign(dx);
    const past = !cancelled && Math.abs(dx) > stageW * MOBILE_COMMIT_RATIO;

    if (flick || past) {
      const dir = dx < 0 ? 1 : -1; // dragged/flicked left -> next, right -> previous
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

  function onUp() {
    end(false);
  }
  function onCancel() {
    end(true);
  }

  stage.addEventListener("pointerdown", (event) => {
    if (!isMobile() || busy) return;
    // a tap starting on an interactive video — its custom controls bar
    // (play/seek/sound/fullscreen) or the frame itself (click to play/pause) —
    // must reach it untouched, otherwise the slightest finger movement during
    // the tap reads as a swipe and the click never fires. A `loopVideo()` has
    // no controls and behaves as a moving image, so it stays swipeable.
    if (event.target.closest(".project__video:not(.project__video--bare)")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    active = true;
    engaged = false;
    startX = lastX = event.clientX;
    startY = event.clientY;
    lastT = event.timeStamp || performance.now();
    dx = 0;
    vx = 0;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  });
})();

/* ---- per-project build: run once at load, then again on every client-side
   project switch (see switchProject) instead of a full page reload ---- */

// mobile-only "Next project" link (see projet.css): the next entry in
// SITE_PROJECTS, wrapping back to the first after the last.
function updateNextLink() {
  if (!nextLink) return;
  const i = SITE_PROJECTS.indexOf(project);
  const next = SITE_PROJECTS[(i + 1) % SITE_PROJECTS.length];
  nextLink.href = `projet.html?p=${encodeURIComponent(next.slug)}`;
}

// nav.js marks the current project once on load; keep the highlight in step
// when we swap projects without reloading.
function updateNavCurrent() {
  document.querySelectorAll(".site-nav__list--projects li").forEach((li) => {
    const a = li.querySelector("a");
    if (!a) return;
    const slug = new URLSearchParams(new URL(a.href, location.href).search).get("p");
    li.classList.toggle("is-current", slug === project.slug);
  });
}

function renderProject() {
  index = 0;
  busy = false;
  arrows.forEach((a) => (a.disabled = false));
  // nothing to page through on a single-image project (see .project__arrows[hidden])
  if (arrowsWrap) arrowsWrap.hidden = project.images.length < 2;
  buildInfo();
  buildThumbs();
  buildTrack();
  viewport.innerHTML = "";
  currentFrame = makeFrame(project.images[index]);
  setPose(currentFrame, {});
  viewport.appendChild(currentFrame);
  positionArrows(index);
  renderTrack(false); // paint the filmstrip already in place — no sideways slide-in
  updateNextLink();
  updateNavCurrent();
}

/* ---- init ---- */

renderProject();

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
  positionArrows(index);
  renderTrack(false); // re-measure only — a resize shouldn't animate the filmstrip
});

// Double rAF so the browser paints the initial (opacity 0, nudged-down) state
// once before is-ready flips it — otherwise the two can collapse into a single
// style recalc and the entrance snaps in with no transition.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    root.classList.remove("is-leaving");
    root.classList.add("is-ready");
  });
});

/* ---- page transitions ----
   Every project page is the same projet.html with a different ?p=, so going
   from one project to another is a content swap in place — fade the content
   out, rebuild it, fade it back in — with no reload and no white gap. The nav
   never moves. Going to the Home (a real other document that also fades in) is
   a fade-out then a normal navigation. Everything else navigates plainly.
   Reduced motion drops the fades but keeps the in-place swap. ---- */

let inTransition = false;

// run `fn` once the .project fade-out has ended, with a timeout as the backstop
function whenFadedOut(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    root.removeEventListener("transitionend", onEnd);
    fn();
  };
  function onEnd(event) {
    if (event.target === root && event.propertyName === "opacity") run();
  }
  root.addEventListener("transitionend", onEnd);
  window.setTimeout(run, 460); // > .project.is-leaving's 300ms in projet.css
}

function pauseAllVideo() {
  document.querySelectorAll("video").forEach((v) => {
    try {
      v.pause();
    } catch (e) {
      /* ignore */
    }
  });
}

function switchProject(slug, push) {
  const next = SITE_PROJECTS.find((p) => p.slug === slug);
  if (!next || next === project || inTransition) return;
  inTransition = true;

  const commit = () => {
    project = next;
    if (push) history.pushState({ slug }, "", `projet.html?p=${encodeURIComponent(slug)}`);
    pauseAllVideo();
    renderProject();
    window.scrollTo(0, 0);
    // go straight from the faded-out state into the fade-in, skipping the
    // base state's own transition (kill it, commit, restore)
    root.style.transition = "none";
    root.classList.remove("is-leaving");
    void root.offsetWidth;
    root.style.transition = "";
    root.classList.add("is-ready");
    inTransition = false;

    // the URL may have moved again while we were mid-fade (fast back/forward) —
    // catch up to whatever it says now
    const urlSlug = new URLSearchParams(location.search).get("p");
    if (urlSlug && urlSlug !== project.slug) {
      const catchUp = SITE_PROJECTS.find((p) => p.slug === urlSlug);
      if (catchUp) switchProject(catchUp.slug, false);
    }
  };

  if (prefersReducedMotion) {
    commit();
    return;
  }
  root.classList.remove("is-ready");
  root.classList.add("is-leaving");
  whenFadedOut(commit);
}

function leaveTo(href) {
  if (inTransition) return;
  inTransition = true;
  pauseAllVideo();
  if (prefersReducedMotion) {
    location.href = href;
    return;
  }
  root.classList.remove("is-ready");
  root.classList.add("is-leaving");
  whenFadedOut(() => {
    location.href = href;
  });
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented) return;
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

  const page = dest.pathname.split("/").pop();

  // another project → swap in place
  if (page === "projet.html") {
    const slug = new URLSearchParams(dest.search).get("p");
    const target = slug ? SITE_PROJECTS.find((p) => p.slug === slug) : null;
    if (!target) return; // malformed — let the browser take it
    event.preventDefault();
    if (target.slug !== project.slug) switchProject(target.slug, true);
    return;
  }

  // same document, non-project (a bare #hash): only swallow a no-op click
  if (dest.pathname === location.pathname && dest.search === location.search) {
    if (!dest.hash || dest.hash === location.hash) event.preventDefault();
    return;
  }

  // Home and About both fade in on arrival — fade this page out first so it
  // cross-dissolves rather than hard-cutting
  if (page === "" || page === "index.html" || page === "about.html") {
    event.preventDefault();
    leaveTo(link.href);
  }
  // Contact / anything else: plain navigation
});

// back / forward between swapped projects
window.addEventListener("popstate", () => {
  const slug = new URLSearchParams(location.search).get("p");
  const target = SITE_PROJECTS.find((p) => p.slug === slug) || SITE_PROJECTS[0];
  if (target.slug !== project.slug) switchProject(target.slug, false);
});

// restored from the back/forward cache mid-leave — clear the leaving state
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  inTransition = false;
  root.style.transition = "";
  root.classList.remove("is-leaving");
  root.classList.add("is-ready");
});
