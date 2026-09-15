// The pages search engines actually see.
//
// None of this is exercised by the app, so nothing else would notice it
// breaking: a malformed JSON-LD block is silently ignored by Google, and a
// sitemap entry pointing at a page that disowns itself just quietly wastes
// crawl budget. These are static checks over the shipped HTML.
const fs = require('fs'), path = require('path');
const { APP, createReporter } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const ORIGIN = 'https://get-arete.com';

// A sitemap URL is served extensionless by Cloudflare Pages; map it back.
function fileFor(loc) {
  let p = loc.replace(ORIGIN, '').replace(/^\//, '');
  if (!p) return 'landing.html';          // "/" renders the landing page
  return /\.html$/.test(p) ? p : p + '.html';
}

module.exports = function () {
  const r = createReporter('seo');

  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

  r.section('the sitemap points at pages that exist');
  {
    r.check('it lists something', locs.length > 0);
    for (const loc of locs) {
      const f = fileFor(loc);
      r.check(`${loc} -> ${f}`, fs.existsSync(path.join(APP, f)), '(404 in the sitemap)');
    }
  }

  // Listing a URL whose page names a different canonical asks Google to index
  // something the page itself says is not the real address.
  r.section('no listed page disowns its own URL');
  {
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const m = read(f).match(/rel="canonical"\s+href="([^"]+)"/);
      if (!m) { r.check(`${f} has a canonical`, false, '(no canonical at all)'); continue; }
      const canon = m[1].replace(/\/$/, '');
      const want = loc.replace(/\/$/, '');
      r.check(`${f} canonical agrees with the sitemap`, canon === want,
        `(sitemap says ${want}, page says ${canon})`);
    }
  }

  r.section('every indexable page is describable');
  {
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const src = read(f);
      const title = (src.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const desc = (src.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
      r.check(`${f} has a title`, title.length > 10 && title.length < 70, `(${title.length} chars)`);
      r.check(`${f} has a description`, desc.length > 50, `(${desc.length} chars)`);
    }
  }

  // Malformed structured data is not an error anywhere — it is simply ignored,
  // so it can rot indefinitely without a symptom.
  r.section('structured data parses and says the right things');
  {
    let found = 0;
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const blocks = [...read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      r.check(`${f} carries structured data`, blocks.length > 0, '(no rich result possible)');
      for (const b of blocks) {
        found++;
        let d = null;
        try { d = JSON.parse(b[1]); } catch (e) {
          r.check(`${f} JSON-LD parses`, false, `(${e.message})`);
          continue;
        }
        r.check(`${f} JSON-LD parses`, true);
        r.check(`${f} declares a type`, !!d['@type']);
        if (d.offers) {
          r.check(`${f} states it is free`, String(d.offers.price) === '0',
            `(price ${d.offers.price})`);
        }
      }
    }
    r.check('some structured data exists at all', found > 0);
  }

  // Arete has no reviews. Marking up a rating would be a Google structured-data
  // violation and a straightforward lie to anyone reading the search result.
  r.section('no invented review data');
  {
    for (const loc of locs) {
      const f = fileFor(loc);
      if (!fs.existsSync(path.join(APP, f))) continue;
      const src = read(f);
      r.check(`${f} claims no rating`, !/aggregateRating|"ratingValue"|"reviewCount"/.test(src),
        '(fabricated reviews)');
    }
  }

  // Pages that are reachable but not meant to be found have to say so
  // themselves. robots.txt Disallow would be the wrong tool: it blocks the
  // crawl, so the directive is never read and the URL lingers in the index.
  r.section('pages outside the sitemap refuse indexing');
  {
    const listed = new Set(locs.map(fileFor));
    const PUBLIC_BY_DESIGN = new Set(['privacy.html', 'index.html']);
    const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html'));
    for (const f of pages) {
      if (listed.has(f) || PUBLIC_BY_DESIGN.has(f)) continue;
      const m = read(f).match(/<meta name="robots" content="([^"]*)"/);
      r.check(`${f} is noindex`, !!m && /noindex/.test(m[1]),
        '(reachable and indexable but not a page you meant to rank)');
    }
  }

  r.section('robots does not block the site');
  {
    const robots = read('robots.txt');
    r.check('references the sitemap', robots.includes('sitemap.xml'));
    r.check('does not disallow everything', !/Disallow:\s*\/\s*$/m.test(robots),
      '(whole site blocked from search)');
  }

  // The policy has to match the code. It previously said error reports exclude
  // your email — true of error reports, while a separate user_properties call
  // sent it on every launch.
  r.section('the privacy policy matches what the app actually sends');
  {
    const fs = require('fs'), path = require('path');
    const policy = read('privacy.html');
    const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    const i = app.indexOf('Identify user in GA4');
    const block = i === -1 ? '' : app.slice(i, i + 900);

    const sendsEmail = /user_email|\.email/.test(block);
    r.check('the app sends no email to analytics', !sendsEmail, '(PII in the payload)');
    r.check('and the policy says so', /not<\/strong> send your email address|does <strong>not<\/strong> send/.test(policy),
      '(policy silent on what is sent)');
    r.check('the policy names the pseudonymous identifier',
      /pseudonymous account identifier/.test(policy),
      '(policy omits the identifier that is sent)');
  }

  // iOS terminates an app that touches the camera or photo library without a
  // usage description in Info.plist. Arete does both, from the meal scanner and
  // progress photos, so a missing key is a guaranteed crash rather than a
  // warning — and it is invisible until someone taps the button on a device.
  r.section('iOS declares why it wants the camera');
  {
    const fs = require('fs'), path = require('path');
    const plist = path.join(APP, 'native/ios/App/App/Info.plist');
    const src = fs.existsSync(plist) ? fs.readFileSync(plist, 'utf8') : '';
    r.check('Info.plist exists', src.length > 0);

    // Only require a key for a capability the web app actually uses.
    const web = ['diet.js', 'profile.js']
      .map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('');
    const usesCamera = /capture\s*=\s*"(environment|user)"/.test(web);
    const usesPhotos = /accept\s*=\s*"image\/\*"/.test(web);

    if (usesCamera) {
      r.check('NSCameraUsageDescription present', /NSCameraUsageDescription/.test(src),
        '(the app terminates when the camera is opened)');
    }
    if (usesPhotos) {
      r.check('NSPhotoLibraryUsageDescription present',
        /NSPhotoLibraryUsageDescription/.test(src),
        '(the app terminates when the picker is opened)');
    }
    // Apple rejects boilerplate; the string has to say what it is actually for.
    const strings = [...src.matchAll(/<key>NS\w*UsageDescription<\/key>\s*<string>([^<]*)<\/string>/g)]
      .map(m => m[1]);
    r.check('each reason is specific', strings.every(t => t.length > 40),
      `(${JSON.stringify(strings.filter(t => t.length <= 40))})`);
  }

  // iOS 27 traps in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption
  // and kills any app still on the pre-scene lifecycle. Capacitor's iOS template
  // ships exactly that, so the adoption here is hand-written and a regenerated
  // project would quietly drop it — and the symptom is the app dying at launch
  // on a real device, which nothing in the web test suite would otherwise see.
  r.section('iOS adopts the scene lifecycle');
  {
    const fs = require('fs'), path = require('path');
    const IOS = path.join(APP, 'native/ios/App/App');
    const plist = path.join(IOS, 'Info.plist');
    const src = fs.existsSync(plist) ? fs.readFileSync(plist, 'utf8') : '';

    r.check('Info.plist declares a scene manifest',
      /<key>UIApplicationSceneManifest<\/key>/.test(src),
      '(the app is terminated at launch on iOS 27)');

    // The manifest alone launched the app into an empty black window: nothing
    // instantiated the storyboard into the scene. It has to name a delegate.
    const m = src.match(/<key>UISceneDelegateClassName<\/key>\s*<string>([^<]*)<\/string>/);
    r.check('the manifest names a scene delegate', !!m,
      '(app launches to a black screen)');

    // $(PRODUCT_MODULE_NAME).SceneDelegate -> SceneDelegate.swift
    const cls = m ? m[1].split('.').pop() : '';
    r.check(`${cls || 'the delegate'} exists as a source file`,
      !!cls && fs.existsSync(path.join(IOS, cls + '.swift')),
      '(Info.plist points at a class that is not in the project)');

    // Xcode compiles what the pbxproj lists, not what is on disk. A file added
    // to the folder but not the build phase is simply absent at runtime, and
    // the manifest then names a class that does not exist.
    const pbx = path.join(APP, 'native/ios/App/App.xcodeproj/project.pbxproj');
    const proj = fs.existsSync(pbx) ? fs.readFileSync(pbx, 'utf8') : '';
    r.check(`${cls || 'the delegate'} is in the build phase`,
      !!cls && new RegExp(`${cls}\\.swift in Sources`).test(proj),
      '(on disk but never compiled)');

    // Xcode 27 refuses to build anything below 15.0.
    const targets = [...proj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)]
      .map(x => parseFloat(x[1]));
    r.check('deployment target builds on current Xcode',
      targets.length > 0 && targets.every(t => t >= 15),
      `(${JSON.stringify(targets.filter(t => t < 15))} below the 15.0 minimum)`);
  }

  return r.finish();
};
