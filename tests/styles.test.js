// Custom properties that nothing defines.
//
// A var() with no fallback and no definition makes the whole declaration
// invalid, and the browser drops it silently. `font-family: var(--sans)` on
// three buttons and a toggle did nothing at all for as long as it had been
// there: those elements inherited whatever font surrounded them, and nothing
// anywhere reported a problem. Typos in custom property names cannot fail
// loudly, so they have to be checked.
const fs = require('fs'), path = require('path');
const { APP, createReporter } = require('./harness');

module.exports = function () {
  const r = createReporter('styles');

  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  // Colours, type and motion are defined in tokens.css, loaded first.
  const tokens = fs.readFileSync(path.join(APP, 'tokens.css'), 'utf8');

  // Somewhere a property can legitimately come from: a declaration anywhere in
  // the stylesheet, an @property rule with an initial value, or JavaScript
  // setting it inline on the element.
  const declared = new Set([...(css + tokens).matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)].map(m => m[2]));
  for (const m of css.matchAll(/@property\s+(--[\w-]+)/g)) declared.add(m[1]);

  const js = ['app.js', 'profile.js', 'connect.js', 'today.js', 'workout.js', 'diet.js',
              'social.js', 'coach.js', 'premium.js', 'integrations.js', 'bodymap.js']
    .filter(f => fs.existsSync(path.join(APP, f)))
    .map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
  for (const m of js.matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]);
  for (const m of js.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) declared.add(m[1]);

  r.section('every custom property used in the stylesheet exists');
  {
    // A var() with its own fallback is fine — the fallback is the definition.
    const used = [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(m => m[1]);
    const missing = [...new Set(used)].filter(v => !declared.has(v));
    r.check('none are undefined', missing.length === 0,
      `(${missing.join(', ')} — the whole declaration is dropped, silently)`);
  }

  // The two that were actually broken, named so a regression is obvious.
  r.section('the fonts those rules were written for are real');
  {
    for (const sel of ['.milestone-btn', '.tour-skip', '.tour-next', '.hab-toggle-btn']) {
      const i = css.indexOf(sel + ' ');
      const block = i === -1 ? '' : css.slice(i, css.indexOf('}', i));
      r.check(`${sel} names a defined font`, !/var\(--(sans|body)\)/.test(block),
        '(renders in whatever it inherits)');
    }
  }

  // A theme that misses a variable does not fail: it silently inherits the
  // dark one. Every role the dark theme sets for surfaces and text, the light
  // theme has to set too.
  r.section('both themes come from the tokens');
  {
    const block = sel => {
      const i = tokens.indexOf(sel + ' {');
      return i === -1 ? '' : tokens.slice(i, tokens.indexOf('\n}', i));
    };
    const vars = b => new Set([...b.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    const dark = vars(block(':root')), light = vars(block('[data-theme="light"]'));
    const roles = ['--bg', '--surface', '--surface-rgb', '--surface2', '--border', '--border2', '--text', '--text-rgb', '--text-dim', '--text-muted', '--overlay'];
    r.check('the dark theme sets every role', roles.every(v => dark.has(v)), `(${roles.filter(v => !dark.has(v)).join(', ')})`);
    r.check('the light theme sets every role', roles.every(v => light.has(v)), `(${roles.filter(v => !light.has(v)).join(', ')})`);
    r.check('the stylesheet no longer defines a palette of its own', !/^\s*--(bg|text|accent|surface)\s*:/m.test(css));
    r.check('Winter is retired: no rules of its own', !/data-theme="winter"/.test(css));
    // Orange only where it is opted into: the old accent is a neutral.
    r.check('the old accent is neutral, not orange', /--accent:\s*var\(--text\)/.test(tokens) && /--accent-rgb:\s*var\(--text-rgb\)/.test(tokens));
  }

  // The palette, and nothing else, in the tokens.
  r.section('the palette is exactly the brand palette');
  {
    const want = { '--c-ink': '#0B0B0B', '--c-surface': '#161616', '--c-line': '#262422', '--c-white': '#F8F8F8',
      '--c-muted': '#8A8580', '--c-divider': '#707070', '--c-cream': '#F2EEE6', '--c-orange': '#FF561E' };
    for (const [k, v] of Object.entries(want)) r.check(`${k} is ${v}`, new RegExp(k + ':\\s*' + v + ';').test(tokens));
    const hexIn = s => [...s.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
    r.check('the stylesheet has no literal colours left', hexIn(css).length === 0, `(${hexIn(css).slice(0, 6).join(', ')})`);
    const rgbIn = [...css.matchAll(/rgba?\(\s*\d/g)].length;
    r.check('and no literal rgb() either', rgbIn === 0, `(${rgbIn})`);
  }

  // Colour carries meaning on the rings. A theme is allowed to change what the
  // app is made of, not what it is telling you.
  r.section('no theme repaints the data colours');
  {
    const i = tokens.indexOf('[data-theme="light"] {');
    const b = i === -1 ? '' : tokens.slice(i, tokens.indexOf('\n}', i));
    const repainted = ['--pro', '--carb', '--fat', '--cal'].filter(v => new RegExp(v + '\\s*:').test(b));
    r.check('the light theme leaves the macro colours alone', repainted.length === 0, `(${repainted.join(', ')})`);
  }

  // An animation keyed on a state class replays every time that state is
  // drawn: with the ripple on .done, every finished habit rippled again each
  // time the list rendered. It belongs to the tap.
  r.section('the habit ripple belongs to the tap');
  {
    r.check('it is not keyed on the finished state alone', !/\.hi\.done \.hi-check::after\s*\{/.test(css), '(replays on every render)');
    r.check('it is keyed on the tap', /\.hi\.done \.hi-check\.pop::after\s*\{[^}]*ripple-out/.test(css), '(ripple missing)');
    r.check('cards enter only while a screen is arriving', /#view:not\(\.view-arriving\) \.ani\s*\{\s*animation:\s*none/.test(css), '(redraws replay every entrance)');
  }


  // position:fixed is relative to the screen only while no ancestor has a
  // transform or filter. The scrolling view kept both from its arrival
  // animation, so the rest-timer pill scrolled away with the page.
  r.section('nothing pins fixed elements to the scrolling page');
  {
    const slide = (css.match(/\.view-slide-in\s*\{([^}]*)\}/) || [])[1] || '';
    r.check('the arrival animation leaves nothing behind', /viewSlide/.test(slide) && !/\b(forwards|both)\b/.test(slide), `(${slide.trim()})`);
    const app = (css.match(/#app\s*\{([^}]*)\}/) || [])[1] || '';
    r.check('the shell is as tall as what is visible, not 100vh', /height:\s*100%/.test(app) && !/height:\s*100vh/.test(app.replace(/\/\*[\s\S]*?\*\//g, '')), '(off-screen bottom on iOS)');
  }


  // The same rule home follows, on the two tabs people log in: nothing smaller
  // than 12.5px and no labels in capitals. Both pages were full of 10px
  // letterspaced captions ("THIS WEEK", "VOLUME KG", "14-DAY CALORIES").
  r.section('workout and nutrition have no tiny text');
  {
    const fs = require('fs'), path = require('path');
    const read = f => fs.readFileSync(path.join(require('./harness').APP, f), 'utf8');
    const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const injected = read('diet.js');     // the nutrition cards carry their own styles
    const check = (source, classes) => {
      const bad = [];
      for (const cls of classes) {
        const re = new RegExp('(^|[\\s,}])\\.' + cls + '\\s*(,[^{]*)?\\{([^}]*)\\}', 'g');
        let m, found = false;
        while ((m = re.exec(source))) {
          found = true;
          const size = /font-size:\s*([\d.]+)px/.exec(m[3]);
          // The brand standard sets headings and small labels in capitals, so
          // capitals are allowed now; the size floor from the cleanup stays.
          if (size && +size[1] < 12.5) bad.push(`${cls} ${size[1]}px`);
        }
        if (!found) bad.push(`${cls} (no rule)`);
      }
      return bad;
    };
    const workout = check(sheet, ['w-stat-val', 'w-stat-lbl', 'w-day-label', 'w-hero-day', 'w-hero-focus', 'w-hero-cta',
      'w-ex-preview-name', 'w-ex-preview-muscle', 'w-advice-head', 'w-advice-detail']);
    r.check('the workout tab', workout.length === 0, `(${workout.join(', ')})`);
    const nutrition = check(sheet, ['d-ring-val', 'd-ring-label', 'd-water-label', 'd-water-count', 'd-adjust-main', 'd-adjust-base',
      'd-meal-name', 'd-meal-macros', 'd-mi-name', 'd-mi-p', 'd-mi-cal'])
      .concat(check(injected, ['da-h', 'da-stat-val', 'da-stat-lbl', 'da-goal-btn', 'da-apply', 'da-rec-val', 'da-rec-lbl',
        'dw-logged', 'dw-log-btn', 'dw-history', 'dw-trend-link', 'dw-drift-text']));
    r.check('the nutrition tab', nutrition.length === 0, `(${nutrition.join(', ')})`);
    r.check('no letterspaced caption is left on either page',
      !/class="sec-lbl"/.test(read('workout.js').slice(read('workout.js').indexOf('function renderWorkout() {'), read('workout.js').indexOf('function renderWorkoutPicker()'))) &&
      !/class="sec-lbl"/.test(injected.slice(injected.indexOf('function renderDiet() {'), injected.indexOf('function renderDietAddMeal()'))) &&
      !/class="sec-lbl"/.test(injected.slice(injected.indexOf('function _buildCalorieTrendChart'), injected.indexOf('const ML_PER_GLASS'))),
      '(an old caption is back)');
  }

  // Screen titles used to spell themselves in a letter at a time, which read
  // as fussy. They now rise a line at a time, and must not move anything
  // around them while they do.
  r.section('screen titles rise a line at a time');
  {
    const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    const at = app.indexOf('function riseText(');
    const fn = at < 0 ? '' : app.slice(at, app.indexOf('\n}\n', at));
    r.check('no word is split into letters', fn && !/\[\.\.\.part\]|split\(''\)|rise-c/.test(fn), '(letters are back)');
    r.check('the heading goes back to its own markup afterwards', /setTimeout\(settle/.test(fn) && /normalize\(\)/.test(fn));
    const line = (/\.rise-ln\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
    r.check('a line clips itself with no padding or margin, so nothing around it moves',
      /clip-path/.test(line) && !/padding|margin/.test(line), `(${line.trim()})`);
    r.check('reduced motion stills the lines and the full stop',
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*\.rise-li[^@]*\.rising \.dot/.test(css));
  }

  // The brand rule is no em dashes anywhere. A lone dash standing for "no data"
  // is a placeholder, not punctuation, and the meal-parsing prompts only ever
  // produce JSON, so those are allowed.
  r.section('the app copy has no em dashes');
  {
    const files = ['app.js', 'coach.js', 'diet.js', 'workout.js', 'connect.js', 'today.js', 'profile.js', 'social.js',
      'premium.js', 'integrations.js', 'data.js', 'index.html', 'manifest.json',
      'review.js', 'patterns.js', 'logany.js', 'oauth-return.html'];
    const bad = [];
    for (const f of files) {
      fs.readFileSync(path.join(APP, f), 'utf8').split('\n').forEach((l, i) => {
        const code = l.replace(/^\s*(\/\/|\*|\/\*|<!--).*$/, '').replace(/\s\/\/\s.*$/, '');
        const rest = code.replace(/(['"`>])(—|\\u2014)(['"`<])/g, '$1$3');
        if (/—|\\u2014|&mdash;/.test(rest) && !/raw JSON array|never refuse|LOOK CAREFULLY|Bowls often/.test(rest)) bad.push(`${f}:${i + 1}`);
      });
    }
    r.check('none outside comments, placeholders and the meal-parsing prompts', bad.length === 0, `(${bad.slice(0, 8).join(', ')})`);
  }

  return r.finish();
};
