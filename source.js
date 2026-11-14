// Where a visitor came from, carried into the app.
//
// The landing page and the search pages are the first thing a new visitor
// sees, and the app is one tap further on. The app records the campaign tags
// on its own address (app.js), but nobody new arrives there: a tagged link to
// the site was sent on to the landing page with its tags dropped, and the
// "Start" link went to a bare "/". So every new person looked like they came
// from nowhere, whichever post, search or invite brought them.
//
// This reads the source once, here, and puts it on every link that leads on
// into the site. Nothing is stored and nothing is sent: it is only passed
// along in the address, and the app decides what to do with it under the
// person's analytics choice.
//
//   A tagged link (?utm_source=instagram&utm_medium=social) keeps its tags.
//   Otherwise the site that sent them is used: a search engine becomes
//   "google / organic", a known network "reddit / social", anything else
//   "example.com / referral". index.html passes that site on as ?ref= when it
//   redirects here, because a redirect loses the browser's own record of it.
(function () {
  var SEARCH = [[/(^|\.)google\./, 'google'], [/(^|\.)bing\.com$/, 'bing'], [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
    [/(^|\.)yahoo\./, 'yahoo'], [/(^|\.)ecosia\.org$/, 'ecosia'], [/(^|\.)brave\.com$/, 'brave'],
    [/(^|\.)yandex\./, 'yandex'], [/(^|\.)baidu\.com$/, 'baidu'], [/(^|\.)startpage\.com$/, 'startpage']];
  var SOCIAL = [[/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)tiktok\.com$/, 'tiktok'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
    [/(^|\.)(x\.com|twitter\.com)$|^t\.co$/, 'x'], [/(^|\.)reddit\.com$/, 'reddit'], [/(^|\.)(facebook\.com|fb\.com)$/, 'facebook'],
    [/(^|\.)pinterest\./, 'pinterest'], [/(^|\.)(linkedin\.com)$|^lnkd\.in$/, 'linkedin'], [/(^|\.)threads\.(net|com)$/, 'threads']];

  function fromHost(host) {
    host = String(host || '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '').slice(0, 64);
    if (!host) return null;
    var own = String(location.hostname || '').toLowerCase().replace(/^www\./, '');
    if (host === own) return null;
    for (var i = 0; i < SEARCH.length; i++) if (SEARCH[i][0].test(host)) return { utm_source: SEARCH[i][1], utm_medium: 'organic' };
    for (var j = 0; j < SOCIAL.length; j++) if (SOCIAL[j][0].test(host)) return { utm_source: SOCIAL[j][1], utm_medium: 'social' };
    return { utm_source: host, utm_medium: 'referral' };
  }

  // { utm_source, utm_medium, utm_campaign } or null when they came direct.
  function areteSource() {
    try {
      var p = new URLSearchParams(location.search);
      if (p.get('utm_source')) {
        var out = {};
        ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { var v = p.get(k); if (v) out[k] = v.slice(0, 64); });
        return out;
      }
      var host = p.get('ref') || '';
      if (!host && document.referrer) { try { host = new URL(document.referrer).hostname; } catch (e) {} }
      return fromHost(host);
    } catch (e) { return null; }
  }

  // Every link that stays on the site carries the source on, so it survives
  // a detour through another page before the app is opened.
  function carry() {
    var s = areteSource();
    if (!s) return;
    var q = new URLSearchParams(s).toString();
    var links = document.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href.indexOf('?') > -1 || href.indexOf('#') > -1 || href.indexOf('//') === 0) continue;
      links[i].setAttribute('href', href + '?' + q);
    }
  }

  window.areteSource = areteSource;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carry);
  else carry();
})();
