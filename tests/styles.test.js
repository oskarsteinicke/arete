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

  return r.finish();
};
