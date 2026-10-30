// A virtual clock for the app, injected before anything else runs.
// Timers, requestAnimationFrame, Date, performance.now and every CSS/Web
// animation follow `vt`, which only moves when __advance(ms) is called. Each
// captured frame is then exactly 1/fps of app time later than the last, so the
// app's own motion comes out smooth however slow the screenshots are.
(function () {
  const RD = Date;
  const BASE = new RD(2026, 9, 29, 7, 42, 0).getTime();   // a Thursday morning
  let vt = 0;
  function VDate(...a) {
    if (!(this instanceof VDate)) return new RD(BASE + vt).toString();
    return a.length ? new RD(...a) : new RD(BASE + vt);
  }
  VDate.prototype = RD.prototype;
  VDate.now = () => BASE + vt;
  VDate.UTC = RD.UTC; VDate.parse = RD.parse;
  window.Date = VDate;
  const P0 = 5000;
  performance.now = () => P0 + vt;

  let tid = 1;
  const timers = new Map();
  window.setTimeout = (fn, ms, ...args) => { const id = tid++; timers.set(id, { due: vt + Math.max(0, +ms || 0), fn, args, every: 0, seq: id }); return id; };
  window.setInterval = (fn, ms, ...args) => { const e = Math.max(4, +ms || 0); const id = tid++; timers.set(id, { due: vt + e, fn, args, every: e, seq: id }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  const rafs = new Map(); let rid = 1;
  window.requestAnimationFrame = cb => { const id = rid++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { rafs.delete(id); };
  window.requestIdleCallback = cb => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 40 }), 1);
  window.cancelIdleCallback = id => timers.delete(id);

  // Network: the app's own servers answer from window.__mock (set per clip),
  // on the virtual clock. Anything else external fails fast, like offline.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, opts) => {
    const url = String((input && input.url) || input);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('/') || !/^https?:/.test(url)) return realFetch(input, opts);
    return new Promise((res, rej) => {
      let route = null;
      try { route = window.__mock ? window.__mock(url, opts || {}) : null; } catch (e) { console.error(e); }
      if (!route) { window.setTimeout(() => rej(new TypeError('Failed to fetch')), 30); return; }
      window.setTimeout(() => res(new Response(typeof route.body === 'string' ? route.body : JSON.stringify(route.body),
        { status: route.status || 200, headers: { 'Content-Type': 'application/json' } })), route.delay == null ? 500 : route.delay);
    });
  };
  try { Object.defineProperty(navigator, 'sendBeacon', { value: () => true }); } catch {}

  const born = new WeakMap();
  function syncAnims() {
    for (const a of document.getAnimations()) {
      let b = born.get(a);
      if (b === undefined) { b = vt; born.set(a, b); try { a.pause(); } catch {} }
      if (a.playState === 'finished') continue;
      let end = Infinity;
      try { end = a.effect.getComputedTiming().endTime; } catch {}
      const local = (vt - b) * (a.playbackRate || 1);
      if (isFinite(end) && local >= end) { try { a.finish(); } catch { a.currentTime = end; } }
      else { try { a.currentTime = local; } catch {} }
    }
  }
  const flush = async () => { for (let k = 0; k < 8; k++) await null; };
  window.__vt = () => vt;
  window.__advance = async (ms) => {
    const target = vt + ms;
    for (let guard = 0; guard < 5000; guard++) {
      let pick = null;
      for (const t of timers.values()) if (t.due <= target && (!pick || t.due < pick.due || (t.due === pick.due && t.seq < pick.seq))) pick = t;
      if (!pick) break;
      vt = Math.max(vt, pick.due);
      const id = [...timers.entries()].find(([, v]) => v === pick)[0];
      if (pick.every) { pick.due = vt + pick.every; pick.seq = tid++; } else timers.delete(id);
      try { typeof pick.fn === 'function' ? pick.fn(...pick.args) : (0, eval)(pick.fn); } catch (e) { console.error('timer', e && e.message); }
      await flush();
    }
    vt = target;
    const cbs = [...rafs.values()]; rafs.clear();
    for (const cb of cbs) { try { cb(P0 + vt); } catch (e) { console.error('raf', e && e.message); } }
    await flush();
    syncAnims();
    return vt;
  };
  window.__sync = syncAnims;
})();
