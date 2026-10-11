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

  // Somewhere a property can legitimately come from: a declaration anywhere in
  // the stylesheet, an @property rule with an initial value, or JavaScript
  // setting it inline on the element.
  const declared = new Set([...css.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)].map(m => m[2]));
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

  // A theme that misses a variable does not fail — it silently inherits the
  // dark one, which is how you end up with a gold button on a steel screen.
  r.section('the Winter theme redefines everything it needs to');
  {
    const block = sel => {
      const i = css.indexOf(sel + ' {');
      return i === -1 ? '' : css.slice(i, css.indexOf('\n}', i));
    };
    const vars = b => new Set([...b.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));

    const light = vars(block('[data-theme="light"]'));
    const winter = vars(block('[data-theme="winter"]'));
    r.check('the Winter block exists', winter.size > 0, '(no theme defined)');

    const missed = [...light].filter(v => !winter.has(v));
    r.check('it covers everything the Light theme covers', missed.length === 0,
      `(${missed.join(', ')} would fall back to the dark palette)`);

    // The gold is spread across 162 literals in the stylesheet, so it is only
    // swappable at all because those go through channel variables.
    for (const v of ['--accent-rgb', '--accent-b-rgb', '--accent-d-rgb', '--accent-hi-rgb']) {
      r.check(`${v} is overridden`, winter.has(v), '(gold would survive into Winter)');
    }
  }

  // Colour carries meaning in four places. A theme is allowed to change what
  // the app is made of, not what it is telling you.
  r.section('no theme repaints the data colours');
  {
    for (const sel of ['[data-theme="light"]', '[data-theme="winter"]']) {
      const i = css.indexOf(sel + ' {');
      const b = i === -1 ? '' : css.slice(i, css.indexOf('\n}', i));
      const repainted = ['--pro', '--carb', '--fat'].filter(v => new RegExp(v + '\\s*:').test(b));
      r.check(`${sel} leaves protein, carbs and fat alone`, repainted.length === 0,
        `(${repainted.join(', ')} — the macro rings stop meaning anything)`);
    }
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
          if (size && +size[1] < 12.5) bad.push(`${cls} ${size[1]}px`);
          if (/text-transform:\s*uppercase/.test(m[3])) bad.push(`${cls} in capitals`);
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

  return r.finish();
};
