// The AuBs theme.
//
// A light theme in five pinks (Blush, Pastel Pink, Cherry Blossom, Cotton
// Candy, Petal Rouge) with a warm near-black for text. These hold that it is
// those pinks, that every role is set, that text stays readable on every pink
// it sits on, that it leaves the brand palette and the data colours alone,
// and that choosing it in Settings applies it and comes back after a reload.
const fs = require('fs'), path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

const tokens = fs.readFileSync(path.join(APP, 'tokens.css'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const SEL = '[data-theme="light"][data-palette="aubs"]';

function block(sel) {
  const i = tokens.indexOf(sel + ' {');
  return i === -1 ? '' : tokens.slice(i, tokens.indexOf('\n}', i));
}
const aubs = block(SEL);
const val = name => { const m = new RegExp(name + ':\\s*([^;]+);').exec(aubs); return m ? m[1].trim() : null; };

// WCAG contrast, from hex.
function lum(h) {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = rgb => '#' + rgb.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const over = (fg, a, bg) => hex(rgbOf(fg).map((f, i) => a * f + (1 - a) * rgbOf(bg)[i]));

function boot() {
  const s = createSandbox({ files: ['data.js', 'app.js', 'connect.js', 'premium.js', 'workout.js', 'diet.js', 'integrations.js', 'profile.js'],
    store: { hvi_onboarded: 'true' } });
  run(s, `settings={}; curView='stats'; habits=[]; log={}; journal={};
          workoutLog={}; workoutMeta={}; mealLog={}; weightLog={};
          meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
          sleepLog={}; prs={}; gamification={xp:0,level:1}; achievements=[];
          routines={}; routineLog={}; challenges=[]; goals=[]; habitLinks={};
          tdeeProfile=null; customPrograms={}; qTimer=null;
          dietMeta={dailyGoals:{calories:2200,protein:160,carbs:220,fat:70}};
          track=function(){}; history={pushState:function(){}};
          _attrs = {};
          document.documentElement.setAttribute = function (k, v) { _attrs[k] = String(v); };
          document.documentElement.removeAttribute = function (k) { delete _attrs[k]; };`);
  return s;
}

module.exports = function () {
  const r = createReporter('themes');

  r.section('AuBs is her five pinks');
  {
    const want = { '--aubs-blush': '#FFE5EC', '--aubs-pastel': '#FFC2D1', '--aubs-cherry': '#FFB3C6', '--aubs-candy': '#FF8FAB', '--aubs-rouge': '#FB6F92' };
    for (const [k, v] of Object.entries(want)) r.check(`${k} is ${v}`, val(k) === v, `(${val(k)})`);
    r.check('Pastel Pink is the ground, Blush the cards', val('--bg') === 'var(--aubs-pastel)' && val('--surface') === 'var(--aubs-blush)');
    r.check('Petal Rouge takes orange\'s place', val('--orange') === 'var(--aubs-rouge)' && val('--orange-rgb') === 'var(--aubs-rouge-rgb)');
    const roles = ['--bg', '--surface', '--surface-rgb', '--surface2', '--border', '--border2', '--text', '--text-rgb', '--text-dim', '--text-muted', '--overlay', '--on-orange'];
    r.check('it sets every role, so nothing falls through to the dark theme', roles.every(v => val(v)), `(${roles.filter(v => !val(v)).join(', ')})`);
    r.check('it sits on top of the light theme, so the light-ground fixes apply', tokens.indexOf(SEL) > tokens.indexOf('[data-theme="light"] {'));
  }

  r.section('text stays readable on every pink');
  {
    const ink = val('--aubs-ink'), muted = 0.72;
    const ground = { pastel: val('--aubs-pastel'), blush: val('--aubs-blush') };
    const rouge = val('--aubs-rouge');
    const chip = g => over(rouge, 0.14, g);
    r.check('text on the background and on cards, 4.5:1 or more', contrast(ink, ground.pastel) >= 4.5 && contrast(ink, ground.blush) >= 4.5);
    r.check('muted text too', [ground.pastel, ground.blush].every(g => contrast(over(ink, muted, g), g) >= 4.5),
      `(${[ground.pastel, ground.blush].map(g => contrast(over(ink, muted, g), g).toFixed(2)).join(', ')})`);
    r.check('and on a chip', [ground.pastel, ground.blush].every(g => contrast(over(ink, muted, chip(g)), chip(g)) >= 4.5));
    r.check('muted is ink at 72%, as tested', /rgba\(var\(--aubs-ink-rgb\),\s*0\.72\)/.test(val('--text-muted')) && val('--text-dim') === val('--text-muted'));
    r.check('labels on Petal Rouge are dark, not white', val('--on-orange') === 'var(--aubs-ink)' && contrast(ink, rouge) >= 4.5 && contrast('#FFFFFF', rouge) < 4.5);
    r.check('labels on Cotton Candy are dark', contrast(ink, val('--aubs-candy')) >= 4.5 && /\.unit-btn-active[^}]*color:\s*var\(--text\)/.test(css));
    r.check('errors and success read on pastel', ['--danger', '--success'].every(k => /^#/.test(val(k)) && contrast(val(k), ground.pastel) >= 4.5),
      `(${['--danger', '--success'].map(k => val(k) && contrast(val(k), ground.pastel).toFixed(2)).join(', ')})`);
    r.check('the ink is her near-black, not plum', ink === '#2B1E20');
  }

  r.section('it leaves the brand alone');
  {
    r.check('the accent stays dark, so text in it reads', !/--accent(-b)?\s*:/.test(aubs));
    r.check('its tints are pink', ['--accent-rgb', '--accent-b-rgb', '--accent-hi-rgb'].every(k => val(k) === 'var(--aubs-rouge-rgb)'));
    // Pink tints are safe only while no text is drawn in a strong one.
    const strongText = [...css.matchAll(/(^|[;{\s])color:\s*rgba\(var\(--accent[\w-]*-rgb\),\s*(0?\.\d+|1)\)/g)].filter(m => parseFloat(m[2]) >= 0.5);
    r.check('and no text is drawn in a strong accent tint', strongText.length === 0, `(${strongText.length})`);
    r.check('no brand colour is redefined, so share images stay on-brand', !/--c-[\w-]+\s*:/.test(aubs));
    r.check('the macro colours are not repainted', !/--(pro|carb|fat|cal)\s*:/.test(aubs));
    const sec = css.slice(css.indexOf('AuBs (tokens.css)'));
    r.check('the pinks go on the fills: progress bars and the active tab', /\.hm-hero-xp span[^{]*\{\s*background:\s*var\(--orange\)/.test(sec) && /\.ni\.active svg\s*\{\s*stroke:\s*var\(--orange\)/.test(sec));
    r.check('every AuBs rule is keyed on the theme', sec.split('\n').filter(l => /^\S.*\{/.test(l)).every(l => l.startsWith('[data-palette="aubs"]')));
  }

  r.section('choosing it');
  {
    const s = boot();
    run(s, `settings.theme = 'aubs'; applyTheme();`);
    r.check('AuBs: a light theme with the pink palette on top', run(s, '_attrs["data-theme"]') === 'light' && run(s, '_attrs["data-palette"]') === 'aubs');
    run(s, `settings.theme = 'light'; applyTheme();`);
    r.check('light: no pink left behind', run(s, '_attrs["data-theme"]') === 'light' && run(s, '_attrs["data-palette"]') === undefined);
    run(s, `settings.theme = 'aubs'; applyTheme(); settings.theme = 'dark'; applyTheme();`);
    r.check('dark: back to ink', run(s, '_attrs["data-theme"]') === 'dark' && run(s, '_attrs["data-palette"]') === undefined);
    run(s, `settings.theme = 'winter'; applyTheme();`);
    r.check('anything unknown gets dark', run(s, '_attrs["data-theme"]') === 'dark' && run(s, 'themeChoice()') === 'dark');

    run(s, `settings.theme = 'dark'; window._statsSubView = 'profile'; renderStats();`);
    const html = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('Settings offers Dark, Light and AuBs', /onclick="chooseTheme\('dark'\)">Dark</.test(html) && /onclick="chooseTheme\('light'\)">Light</.test(html) && /onclick="chooseTheme\('aubs'\)">AuBs</.test(html), `(${html.length})`);
    run(s, `chooseTheme('aubs');`);
    r.check('tapping AuBs applies it and keeps it', run(s, '_attrs["data-palette"]') === 'aubs' && JSON.parse(run(s, `JSON.stringify(LS.get('hvi_settings', {}))`)).theme === 'aubs');
    const after = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('and shows it as the one chosen', /unit-btn unit-btn-active" onclick="chooseTheme\('aubs'\)/.test(after) && !/unit-btn-active" onclick="chooseTheme\('dark'\)/.test(after));
    r.check('the choice syncs with the rest of the settings', run(s, `SYNC_KEYS.indexOf('hvi_settings') !== -1`) === true);
  }

  return r.finish();
};
