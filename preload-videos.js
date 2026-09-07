/* ============================================================
   VIDEO PRE-WARMING
   The project videos are the heaviest assets on the site and, left alone,
   only start downloading when someone opens the project page — a visible
   stall. This warms the browser cache in the background while the loader /
   home is up (and keeps going on every later page), so by the time a
   project is opened its video is already on disk.

   - Sequential, not parallel: one download at a time so the first video
     gets the whole pipe instead of every video crawling at once.
   - PROJET_01/asset_01.mp4 goes first — it's ~24 MB, several times any
     other — then the rest in gallery order.
   - Low priority and deferred to `load`, so it never competes with the
     carousel images or anything else the page needs first.
   - Skipped on a data-saver / slow connection.

   Loaded after assets/projects-data.js on every page, so the list stays in
   sync with the data and the warming carries on as you move around.
   ============================================================ */

(function () {
  if (!window.fetch) return;

  var PRIORITY = "assets/PROJET_01/asset_01.mp4"; // heaviest — always first
  var ABOUT_VIDEO = "assets/asset_about_5.mp4"; // not in SITE_PROJECTS

  var VIDEOS = [];
  if (typeof SITE_PROJECTS !== "undefined") {
    SITE_PROJECTS.forEach(function (p) {
      (p.images || []).forEach(function (im) {
        if (im && im.type === "video" && VIDEOS.indexOf(im.src) === -1) VIDEOS.push(im.src);
      });
    });
  }
  if (VIDEOS.indexOf(PRIORITY) === -1) VIDEOS.unshift(PRIORITY);
  VIDEOS.sort(function (a, b) {
    return a === PRIORITY ? -1 : b === PRIORITY ? 1 : 0;
  });
  if (VIDEOS.indexOf(ABOUT_VIDEO) === -1) VIDEOS.push(ABOUT_VIDEO);

  var conn = navigator.connection || navigator.webkitConnection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return;

  // Videos the current page is already loading itself (the project on screen)
  // — don't fetch those a second time in parallel.
  function onPage(url) {
    var abs;
    try {
      abs = new URL(url, location.href).href;
    } catch (e) {
      return false;
    }
    var els = document.querySelectorAll("video[src], video source[src]");
    for (var k = 0; k < els.length; k++) {
      var s = els[k].getAttribute("src");
      if (!s) continue;
      try {
        if (new URL(s, location.href).href === abs) return true;
      } catch (e) {}
    }
    return false;
  }

  var i = 0;
  var started = false;

  function drain(res) {
    // Pull the body through so the response actually finishes and lands in
    // the HTTP cache, but discard the bytes as they arrive (no 24 MB blob
    // sitting in memory).
    if (!res || !res.body || !res.body.getReader) return;
    var reader = res.body.getReader();
    return (function pump() {
      return reader.read().then(function (r) {
        return r.done ? undefined : pump();
      });
    })();
  }

  function next() {
    if (i >= VIDEOS.length) return;
    var url = VIDEOS[i++];
    if (onPage(url)) {
      next();
      return;
    }
    var go = function () {
      // small gap between files so a click-through navigation can grab
      // bandwidth immediately rather than waiting on the next chunk
      window.setTimeout(next, 150);
    };
    var opts = { credentials: "same-origin" };
    try {
      opts.priority = "low"; // honoured where Priority Hints exist, ignored elsewhere
    } catch (e) {}
    fetch(url, opts)
      .then(drain)
      .then(go, go);
  }

  function start() {
    if (started) return;
    started = true;
    window.setTimeout(next, 400);
  }

  // Kick off once the page's own critical resources have loaded (on a normal
  // connection that's while the loader is still running) — with a long
  // fallback only for the case where a stuck resource never fires `load`.
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
  window.setTimeout(start, 8000);
})();
