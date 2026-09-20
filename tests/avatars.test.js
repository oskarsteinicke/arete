// The character art: which file gets drawn, and whether every path still
// points at a file that exists.
//
// The art is referenced from four places that do not know about each other —
// the home portrait, the character screen, the shareable recap canvas, and the
// public landing page — plus the service worker's precache list, where a
// single missing file makes addAll reject and the worker never installs at
// all. Renaming the set is exactly the change that breaks one of them quietly.
const fs = require('fs'), path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'connect.js', 'today.js', 'premium.js', 'workout.js',
               'diet.js', 'integrations.js', 'profile.js'];

const STAGES = [1, 2, 3, 4, 5, 6];
const read = f => fs.readFileSync(path.join(APP, f), 'utf8');

function sb(extra) {
  const s = createSandbox({ files: FILES, store: { hvi_onboarded: 'true' } });
  run(s, `
    settings={}; curView='home'; track=function(){}; go=function(){};
    tdeeProfile=null; gamification={xp:0}; habits=[]; log={};
  `);
  if (extra) run(s, extra);
  return s;
}

module.exports = function () {
  const r = createReporter('avatars');

  r.section('both sets are complete on disk');
  {
    for (const set of ['m', 'f']) {
      const missing = STAGES.filter(n => !fs.existsSync(path.join(APP, `avatar-${set}-${n}.png`)));
      r.check(`all six ${set === 'm' ? 'male' : 'female'} stages exist`, missing.length === 0,
        `(missing ${JSON.stringify(missing)})`);
    }
    // The old single set is gone; anything still naming it is now a 404.
    const stale = STAGES.filter(n => fs.existsSync(path.join(APP, `avatar-${n}.png`)));
    r.check('the old unsexed set is gone', stale.length === 0, `(${JSON.stringify(stale)} still present)`);
  }

  r.section('nothing still points at the old filenames');
  {
    const sources = ['app.js', 'profile.js', 'connect.js', 'social.js', 'today.js',
                     'service-worker.js', 'index.html', 'landing.html', 'manifest.json'];
    for (const f of sources) {
      if (!fs.existsSync(path.join(APP, f))) continue;
      const hits = (read(f).match(/avatar-[1-6]\.png/g) || []);
      r.check(`${f} is clean`, hits.length === 0, `(${hits.join(', ')})`);
    }
  }

  // A precache entry for a file that does not exist makes the whole install
  // reject, so the service worker never activates and nothing is cached.
  r.section('the service worker precaches only files that exist');
  {
    const sw = read('service-worker.js');
    const listed = [...sw.matchAll(/'\/([^']+)'/g)].map(m => m[1]).filter(p => /\.(js|css|html|png|json)$/.test(p));
    const missing = listed.filter(p => !fs.existsSync(path.join(APP, p)));
    r.check('every precached path resolves', missing.length === 0, `(${JSON.stringify(missing)})`);
    r.check('the art is not precached', !/avatar-/.test(sw),
      '(1.2 MB of character art on every first load)');
  }

  r.section('the set follows an explicit choice before a calorie field');
  {
    const male = sb();
    r.check('defaults to male with nothing known', run(male, 'avatarSet()') === 'm',
      `(${run(male, 'avatarSet()')})`);

    const fromProfile = sb(`tdeeProfile = { sex: 'female' };`);
    r.check('follows the profile when that is all there is',
      run(fromProfile, 'avatarSet()') === 'f', `(${run(fromProfile, 'avatarSet()')})`);

    // Someone who set "female" for calorie maths and then picked the male
    // character must keep the male character.
    const overridden = sb(`tdeeProfile = { sex: 'female' }; settings.avatarSet = 'm';`);
    r.check('an explicit choice wins over it', run(overridden, 'avatarSet()') === 'm',
      `(${run(overridden, 'avatarSet()')})`);

    const s = sb();
    run(s, `setAvatarSet('f')`);
    r.check('the choice persists', JSON.parse(s.localStorage._d.hvi_settings || '{}').avatarSet === 'f',
      `(${s.localStorage._d.hvi_settings})`);
    run(s, `setAvatarSet('nonsense')`);
    r.check('junk is ignored', run(s, 'avatarSet()') === 'f', `(${run(s, 'avatarSet()')})`);
  }

  r.section('every level resolves to a file that exists');
  {
    const s = sb();
    for (const set of ['m', 'f']) {
      const bad = [];
      for (let lvl = 1; lvl <= 30; lvl++) {
        const file = run(s, `avatarFile(${lvl}, '${set}')`).split('?')[0];
        if (!fs.existsSync(path.join(APP, file))) bad.push(`lvl ${lvl} -> ${file}`);
      }
      r.check(`levels 1-30 all resolve for ${set}`, bad.length === 0, `(${bad.slice(0, 3).join('; ')})`);
    }
    r.check('the cache-buster is on the url', /\?v=/.test(run(s, 'avatarFile(1)')),
      `(${run(s, 'avatarFile(1)')})`);
  }

  // The shared recap card draws the portrait onto a canvas separately from the
  // screen. It used to hardcode the filename, so it would have kept drawing
  // the old art — or nothing at all once the files were renamed.
  r.section('the share card uses the same resolver as the screen');
  {
    const src = read('profile.js');
    r.check('no hardcoded portrait filename', !/_loadImage\(`avatar-\$\{[^}]*\}\.png/.test(src),
      '(share card builds its own path)');
    r.check('it calls avatarFile', /_loadImage\(\(typeof avatarFile/.test(src), '(not wired)');
  }

  r.section('picking a character in onboarding records the choice');
  {
    const s = sb();
    run(s, `renderOnboarding(0); _obName='Ada'; obNext(1); _obGender='female'; obNext(2);`);
    r.check('the avatar set is stored', JSON.parse(s.localStorage._d.hvi_settings || '{}').avatarSet === 'f',
      `(${s.localStorage._d.hvi_settings})`);
    r.check('and the profile sex too', JSON.parse(s.localStorage._d.hvi_tdee_profile || '{}').sex === 'female');
  }

  return r.finish();
};
