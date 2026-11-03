// The loading screen.
//
// The iPhone app's launch screen was a 2732 px square stretched to fill the
// phone, with the mark in its bottom-right corner, so a phone showed plain
// black for the seconds the app took to start; the web app showed nothing at
// all until its scripts had drawn a screen. Now both show the Arete mark,
// 96 points and centred, on brand black, and the web one hands over to the
// first screen with a short fade. These hold that the two match, that it
// leaves when the first screen is drawn (and never hides an error), and that
// it does not flicker.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { APP, createReporter } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const html = read('index.html'), css = read('style.css'), app = read('app.js');
const IOS = 'native/ios/App/App';

// A PNG's size, from its header.
const pngSize = f => { const b = fs.readFileSync(path.join(APP, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

// The page's own boot script, run against a stand-in for the page.
function bootPage(now, native, noFrames) {
  const events = [];
  const boot = { classes: [], parentNode: null, classList: { add(c) { boot.classes.push(c); events.push('fade'); } } };
  const body = { removeChild(el) { if (el === boot) boot.removed = true; } };
  boot.parentNode = body;
  const timers = [], listeners = {};
  const win = {
    performance: { now: () => now },
    requestAnimationFrame: fn => { if (!noFrames) fn(); },
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    addEventListener: (k, fn) => { listeners[k] = fn; },
  };
  win.window = win;
  win.document = { getElementById: id => (id === 'boot' ? boot : null) };
  if (native) win.Capacitor = { Plugins: { SplashScreen: { hide(o) { events.push('native:' + JSON.stringify(o)); } } } };
  const src = html.slice(html.indexOf('<div id="boot"'));
  const script = src.slice(src.indexOf('<script>') + 8, src.indexOf('</script>'));
  vm.runInNewContext(script, win);
  // Runs the queued timers in order, the way the page would.
  const flush = () => { const seen = []; while (timers.length) { const t = timers.shift(); seen.push(t.ms); t.fn(); } return seen; };
  return { win, boot, timers, listeners, flush, events };
}

module.exports = function () {
  const r = createReporter('boot');

  r.section('it is there from the first paint');
  {
    const body = html.slice(html.indexOf('<body>'));
    const first = body.slice(6).trim();
    r.check('the first thing in the page body is the loading screen', first.startsWith('<!--') ? /^<!--[\s\S]*?-->\s*<div id="boot"/.test(first) : first.startsWith('<div id="boot"'));
    r.check('before any of the app\'s scripts', body.indexOf('id="boot"') < body.indexOf('src="app.js'));
    r.check('screen readers hear that it is loading', /<div id="boot" role="status" aria-label="Loading Arete">/.test(html));
    const iconPath = (read('icon.svg').match(/ d="([^"]+)"/) || [])[1];
    const bootPath = (html.match(/class="boot-mark"[\s\S]*? d="([^"]+)"/) || [])[1];
    r.check('the mark is the app icon\'s own, not a copy that can drift', !!iconPath && iconPath === bootPath);
    r.check('drawn in the text colour, no colour of its own', /class="boot-mark"[^>]*>[^]*?fill="currentColor"/.test(html) && !/class="boot-mark"[^<]*<g[^>]*><path fill="#/.test(html));
  }

  r.section('it looks like the launch screen');
  {
    const rule = sel => { const i = css.indexOf(sel + ' {'); return i === -1 ? '' : css.slice(i, css.indexOf('}', i)); };
    const boot = rule('#boot'), mark = rule('#boot .boot-mark');
    r.check('it covers the whole screen', /position:\s*fixed/.test(boot) && /inset:\s*0/.test(boot));
    r.check('on brand black whatever the theme', /background:\s*var\(--c-ink\)/.test(boot));
    const z = Math.max(...[...css.replace(rule('#boot'), '').matchAll(/z-index:\s*(\d+)/g)].map(m => +m[1]));
    r.check('above everything else the app draws', +(boot.match(/z-index:\s*(\d+)/) || [])[1] > z, `(highest elsewhere ${z})`);
    const webSize = +(mark.match(/width:\s*(\d+)px/) || [])[1];
    const sb = read(`${IOS}/Base.lproj/LaunchScreen.storyboard`);
    const iosW = +(sb.match(/firstAttribute="width" constant="(\d+)"/) || [])[1], iosH = +(sb.match(/firstAttribute="height" constant="(\d+)"/) || [])[1];
    r.check('the mark is the same size as on the iPhone launch screen', webSize === 96 && iosW === webSize && iosH === webSize, `(web ${webSize}, iOS ${iosW}x${iosH})`);
    r.check('and centred, as it is there', /display:\s*flex/.test(boot) && /align-items:\s*center/.test(boot) && /justify-content:\s*center/.test(boot)
      && /firstAttribute="centerX" secondItem="[^"]+" secondAttribute="centerX"/.test(sb) && /firstAttribute="centerY" secondItem="[^"]+" secondAttribute="centerY"/.test(sb));
    r.check('the loading line waits half a second, so a quick start never shows it', /animation:\s*boot-line-in[^;]*0\.5s/.test(rule('#boot .boot-line')));
    r.check('reduced motion: the line stands still, the mark does not grow',
      /prefers-reduced-motion: reduce\)\s*\{\s*#boot \.boot-line::after\s*\{\s*animation:\s*none/.test(css) && /#boot\.boot-out \.boot-mark\s*\{\s*transform:\s*none/.test(css));
  }

  r.section('the iPhone launch screen');
  {
    const sb = read(`${IOS}/Base.lproj/LaunchScreen.storyboard`);
    r.check('brand black, not the system background (white in light mode)', /<color key="backgroundColor" red="0\.0431372549\d*" green="0\.0431372549\d*" blue="0\.0431372549\d*"/.test(sb) && !/systemBackgroundColor/.test(sb));
    r.check('the mark keeps its shape instead of filling the screen', /contentMode="scaleAspectFit"[^>]*image="Splash"/.test(sb) && !/scaleAspectFill/.test(sb));
    const set = JSON.parse(read(`${IOS}/Assets.xcassets/Splash.imageset/Contents.json`)).images;
    const sizes = set.map(i => [i.scale, pngSize(`${IOS}/Assets.xcassets/Splash.imageset/${i.filename}`)]);
    r.check('one image per screen density, 96 points each', JSON.stringify(sizes) === JSON.stringify([['1x', [96, 96]], ['2x', [192, 192]], ['3x', [288, 288]]]), `(${JSON.stringify(sizes)})`);
  }

  r.section('it leaves once the first screen is drawn');
  {
    const init = app.slice(app.indexOf('async function init()'), app.indexOf('// ── MILESTONE & INVITE PROMPTS'));
    r.check('after onboarding is drawn', /renderOnboarding\(0\);[\s\S]{0,140}bootDone\(\);\s*return;/.test(init));
    r.check('after the first screen is drawn', /go\(view, \{\}, false\);\s*if \(typeof bootDone === 'function'\) bootDone\(\);/.test(init));

    const slow = bootPage(2400);
    slow.win.bootDone();
    r.check('a slow start: it goes at once', slow.timers[0].ms === 0);
    slow.flush();
    r.check('with a fade, then out of the page', slow.boot.classes.includes('boot-out') && slow.boot.removed === true);

    const quick = bootPage(150);
    quick.win.bootDone();
    r.check('a quick start: it stays to 600 ms, so it does not flicker', quick.timers[0].ms === 450 && !quick.boot.classes.length);
    quick.win.bootDone();
    r.check('and asking twice changes nothing', quick.timers.length === 1);

    const broken = bootPage(300);
    broken.listeners.error({ message: 'boom' });
    broken.flush();
    r.check('if starting up throws, it steps aside for the error message', broken.boot.removed === true);
    const rejected = bootPage(300);
    rejected.listeners.unhandledrejection({});
    rejected.flush();
    r.check('and the same for a failed promise', rejected.boot.removed === true);
    const img = bootPage(300);
    img.listeners.error({});
    r.check('a picture that fails to load is not a failed start', img.timers.length === 0);
  }

  // A web view paints nothing while it loads, so in the iPhone and Android
  // apps the loading screen above never got on screen: it was black until the
  // app appeared. The launch screen now stays on top until the first screen
  // is drawn, then goes in the same frame this one starts to fade.
  r.section('in the iPhone and Android apps, the launch screen holds until then');
  {
    const cfg = JSON.parse(read('native/capacitor.config.json')).plugins.SplashScreen || {};
    r.check('the launch screen is held over the loading web view', !!cfg.launchShowDuration);
    r.check('with a ceiling, so a start that never finishes is not hidden forever', cfg.launchAutoHide === true && cfg.launchShowDuration >= 5000 && cfg.launchShowDuration <= 15000, `(${cfg.launchShowDuration})`);
    r.check('on brand black, with no spinner and no fade of its own', cfg.backgroundColor === '#0B0B0B' && cfg.showSpinner === false && cfg.launchFadeOutDuration === 0);
    const pkg = JSON.parse(read('native/package.json')).dependencies;
    r.check('the plugin is the same major version as Capacitor', /^\^?7\./.test(pkg['@capacitor/splash-screen'] || '') && /^\^?7\./.test(pkg['@capacitor/core']));
    r.check('and is built into the iPhone app', /CapacitorSplashScreen/.test(read('native/ios/App/CapApp-SPM/Package.swift')));

    const app = bootPage(2400, true);
    app.win.bootDone(); app.flush();
    r.check('the first screen drawn: the launch screen goes at once, then this one fades', JSON.stringify(app.events) === JSON.stringify(['native:{"fadeOutDuration":0}', 'fade']), `(${app.events.join(', ')})`);
    const still = bootPage(2400, true, true);
    still.win.bootDone(); still.flush();
    r.check('a page drawing no frames (a background tab, a web view behind the launch screen) still hands over', still.boot.removed === true && JSON.stringify(still.events) === JSON.stringify(['native:{"fadeOutDuration":0}', 'fade']), `(${still.events.join(', ')})`);
    const web = bootPage(2400, false);
    web.win.bootDone(); web.flush();
    r.check('on the website there is no launch screen to hide, and nothing breaks', web.boot.removed === true && web.events.join() === 'fade');
  }

  return r.finish();
};
