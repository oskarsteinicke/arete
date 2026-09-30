// Regenerates the store screenshots from the real app.
//
//   node --experimental-websocket native/shoot-store-assets.js play
//   node --experimental-websocket native/shoot-store-assets.js ios
//
// Serves the app with a month of plausible data injected into localStorage,
// then captures each screen through capture.js at a real phone viewport:
//
//   play  480x960 at 3x  -> 1440x2880, inside Play's 3840 limit
//   ios   440x956 at 3x  -> 1320x2868, the 6.9" iPhone size Apple requires
//
// Things here that are not optional, each learned the hard way:
//   - capture.js drives Chrome's DevTools protocol instead of --window-size,
//     because headless Chrome will not lay out narrower than 500px and
//     silently crops the result — both earlier sets lost their right edge;
//   - the seed runs inside an IIFE, because classic scripts share one global
//     scope and `const habits` collided with app.js's own binding;
//   - this process is also the web server, so nothing here may block the
//     event loop while Chrome is waiting on a response.
const http = require('http'), fs = require('fs'), path = require('path');
const { launch } = require('./capture');

const TARGETS = {
  play: { out: 'store-assets',     width: 480, height: 960 },
  ios:  { out: 'store-assets-ios', width: 440, height: 956 },
};
const target = TARGETS[process.argv[2]];
if (!target) {
  console.error('usage: node --experimental-websocket native/shoot-store-assets.js play|ios');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');            // the APP directory
const OUT = path.join(__dirname, target.out);
const PORT = 4180;

// [file, view, element to scroll into view first]
const SHOTS = [
  ['01-home', 'home'],
  ['02-habits', 'habits'],
  ['03-workout', 'workout'],
  ['04-diet', 'diet'],
  ['05-musclemap', 'workoutProgress', '[aria-label="Muscle map coloured by training"]'],
  ['06-character', 'character'],
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// Everything below is ordinary: numbers a committed person would actually log
// across a month. Nothing inflated — the store listing should not promise a
// version of the app that only exists with fake data.
// Wrapped in an IIFE, and this is not cosmetic: classic scripts share one
// global lexical scope, so `const habits` / `const log` / `const history` here
// collided with app.js's own top-level bindings. app.js died on a
// redeclaration SyntaxError before it could render, which is why the first six
// captures were an empty shell with a working nav bar.
const SEED = `(function () {
window.__errs = [];
addEventListener('error', function (e) {
  window.__errs.push(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno);
  document.title = 'SHOTERR ' + window.__errs.join(' || ');
});
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);
const pick = (arr, i) => arr[i % arr.length];

const habits = [
  { id: 'h01', name: 'Meditate / breathwork (10+ min)', category: 'mindset',  schedule: 'daily' },
  { id: 'h05', name: 'Morning workout / movement',      category: 'fitness',  schedule: 'daily' },
  { id: 'h09', name: 'Read 30 minutes',                 category: 'learning', schedule: 'daily' },
  { id: 'h04', name: 'Cold shower',                     category: 'discipline', schedule: 'daily' },
  { id: 'h07', name: 'Drink 3L water',                  category: 'health',   schedule: 'daily' },
];
// Roughly four days in five, with the honest gaps that implies.
const missPattern = { h01: [3, 11, 19], h05: [2, 9, 16, 23], h09: [1, 5, 12, 20, 27], h04: [4, 6, 13, 21, 25], h07: [8, 17] };
const history = {}, log = {};
for (const h of habits) {
  const missed = missPattern[h.id] || [];
  const days = [];
  for (let i = 0; i < 30; i++) if (!missed.includes(i)) days.push(dk(i));
  history[h.id] = days;
  let streak = 0;
  for (let i = 1; i < 30; i++) { if (missed.includes(i)) break; streak++; }
  log[h.id] = { streak, lastCompletedDate: days[0] === T ? T : dk(1), completedToday: days.includes(T) && h.id !== 'h04' };
}

// Sixteen sessions across the month on the PPL rotation.
const DAYS = [
  { n: 'Push A', ex: [['bench_press',80,8],['incline_db',30,10],['cable_fly',20,12],['ohp',45,8],['lateral_raise',12,14],['tricep_pushdown',30,12]] },
  { n: 'Pull A', ex: [['pullup',0,9],['lat_pulldown',60,10],['barbell_row',70,8],['face_pull',25,15],['barbell_curl',30,10],['incline_curl',12,12]] },
  { n: 'Legs A', ex: [['squat',100,6],['leg_press',180,10],['bulgarian',20,10],['box_jump',0,8],['leg_curl',45,12],['calf_raise',60,15]] },
];
const workoutLog = {};
let sessions = 0;
for (let i = 0; i < 30 && sessions < 16; i++) {
  if (i % 7 === 3 || i % 7 === 6) continue;               // two rest days a week
  const d = pick(DAYS, sessions);
  workoutLog[dk(i)] = {
    programId: 'ppl', dayIndex: sessions % 3, dayName: d.n, touched: true, duration: 58 + (sessions % 9),
    exercises: d.ex.map(([eid, w, r]) => ({
      exerciseId: eid,
      sets: [0,1,2].map(s => ({ weight: w ? w + (s === 2 ? 2.5 : 0) : 0, reps: r - s, completed: true })),
    })),
  };
  sessions++;
}
// Today's session part-finished, so the workout screen shows a real session.
workoutLog[T] = {
  programId: 'ppl', dayIndex: 0, dayName: 'Push A', touched: true,
  exercises: DAYS[0].ex.map(([eid, w, r], idx) => ({
    exerciseId: eid,
    sets: [0,1,2].map(s => ({ weight: w, reps: r, completed: idx < 3 })),
  })),
};

const weightLog = {}, sleepLog = {}, waterLog = {}, mealLog = {};
for (let i = 0; i < 30; i++) {
  weightLog[dk(i)] = Math.round((79.4 + i * 0.045 + ((i % 3) - 1) * 0.15) * 10) / 10;
  sleepLog[dk(i)] = { hours: [7.5, 6.75, 8, 7.25, 6.5, 7.75, 7][i % 7], quality: [4, 3, 5, 4, 3, 4, 4][i % 7] };
  waterLog[dk(i)] = 2250 + (i % 4) * 250;
}
// A meal holds items, and each item carries the macros — the shape the diet
// screen actually reduces over.
const meal = (name, items) => ({ id: 'm_' + name.replace(/\\W/g, '').slice(0, 6), name, items });
mealLog[T] = { meals: [
  meal('Breakfast', [
    { name: 'Oats, 80g',        calories: 300, protein: 11, carbs: 54, fat: 6 },
    { name: 'Whey, 1 scoop',    calories: 120, protein: 25, carbs: 3,  fat: 1 },
    { name: 'Banana',           calories: 105, protein: 1,  carbs: 27, fat: 0 },
  ]),
  meal('Lunch', [
    { name: 'Chicken breast, 200g', calories: 330, protein: 62, carbs: 0,  fat: 7 },
    { name: 'Rice, 150g cooked',    calories: 195, protein: 4,  carbs: 42, fat: 1 },
    { name: 'Broccoli, 150g',       calories: 51,  protein: 4,  carbs: 10, fat: 1 },
  ]),
  meal('Snack', [
    { name: 'Greek yoghurt, 200g', calories: 146, protein: 20, carbs: 8, fat: 4 },
    { name: 'Blueberries, 80g',    calories: 46,  protein: 1,  carbs: 11, fat: 0 },
  ]),
] };
// Two weeks of logging, so the calorie trend and the expenditure estimate
// have something real behind them instead of "log 7+ days to unlock".
for (let i = 1; i < 15; i++) {
  const v = (i % 5) - 2;                       // small day-to-day variation
  mealLog[dk(i)] = { meals: [
    meal('Breakfast', [
      { name: 'Oats, 80g',     calories: 300, protein: 11, carbs: 54, fat: 6 },
      { name: 'Whey, 1 scoop', calories: 120, protein: 25, carbs: 3,  fat: 1 },
      { name: 'Banana',        calories: 105, protein: 1,  carbs: 27, fat: 0 },
    ]),
    meal('Lunch', [
      { name: 'Chicken breast, 200g', calories: 330 + v * 12, protein: 62, carbs: 0,  fat: 7 },
      { name: 'Rice, 200g cooked',    calories: 260 + v * 15, protein: 5,  carbs: 56, fat: 1 },
      { name: 'Olive oil, 1 tbsp',    calories: 119,          protein: 0,  carbs: 0,  fat: 14 },
    ]),
    meal('Dinner', [
      { name: 'Salmon fillet, 180g', calories: 374, protein: 40, carbs: 0,  fat: 23 },
      { name: 'Potatoes, 300g',      calories: 232 + v * 10, protein: 6, carbs: 52, fat: 0 },
      { name: 'Mixed salad',         calories: 60,  protein: 2,  carbs: 8,  fat: 3 },
    ]),
    meal('Snack', [
      { name: 'Greek yoghurt, 200g', calories: 146, protein: 20, carbs: 8,  fat: 4 },
      { name: 'Almonds, 25g',        calories: 145, protein: 5,  carbs: 5,  fat: 13 },
    ]),
  ] };
}

const S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
localStorage.clear();
localStorage.setItem('hvi_user_name', 'Oskar');
localStorage.setItem('hvi_onboarded', 'true');
S('hvi_habits', habits); S('hvi_log', log); S('hvi_habit_history', history);
S('hvi_workout_log', workoutLog);
S('hvi_workout_meta', { activeProgram: 'ppl', currentDayIndex: 0, lastWorkoutDate: dk(1) });
S('hvi_weight_log', weightLog); S('hvi_sleep_log', sleepLog);
S('hvi_water_log', waterLog); S('hvi_meal_log', mealLog);
S('hvi_diet_meta', { dailyGoals: { calories: 2680, protein: 175, carbs: 300, fat: 78 }, goalType: 'maintain' });
S('hvi_tdee_profile', { sex: 'male', age: 21, height: 183, weight: 80.6, activity: 'high' });
S('hvi_gamification', { xp: 9400, level: 10, pillarXP: { body: 4100, mind: 2300, mastery: 1800, social: 700, wealth: 500 }, streakShields: 2 });
S('hvi_prs', {
  bench_press: { weight: 92.5, reps: 5, date: dk(6), name: 'Bench Press' },
  squat:       { weight: 125,  reps: 5, date: dk(11), name: 'Squat' },
  barbell_row: { weight: 80,   reps: 8, date: dk(4), name: 'Barbell Row' },
});
S('hvi_goals', [
  { id: 'g1', text: 'Bench 100 kg for 5', target: '100 kg', done: false },
  { id: 'g2', text: 'Read 12 books this year', done: false },
]);
S('hvi_why', 'I want to be the kind of person who does what he said he would.');
S('hvi_mood_log', { [T]: { mood: 4, at: new Date().toISOString() } });
S('hvi_settings', { units: 'metric', avatarSet: 'm', milestonePrompts: false, waterGoalMl: 3000 });
S('hvi_achievements', ['first_workout', 'streak_7', 'level_5', 'streak_30']);
S('hvi_journal3', { [dk(1)]: { win: 'Trained before class for the fifth day running.', struggle: 'Late to bed again.', focus: 'Lights out by eleven.' } });

// Suppress the interruptions: these are real features, but a modal over the
// screenshot is not what the listing is meant to show.
// Must match getWeekKey() exactly — a guessed format does not suppress
// anything, and the recap modal covered the first home capture.
S('hvi_last_recap_week', (function () {
  const d = new Date(), jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + String(wk).padStart(2, '0');
})());
localStorage.setItem('hvi_nudge_dismissed', T);
S('hvi_sleep_prompt_date', T);
S('hvi_from_landing', '1');
})();`;

// The app itself, with the seed injected ahead of everything that reads
// localStorage, and the lazily-loaded modules pulled in up front.
function shotPage(view) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inject = `<script>\n${SEED}\nlocation.hash = ${JSON.stringify(view)};\n</script>`;
  html = html.replace('<head>', '<head>\n' + inject);
  // The muscle map only draws once bodymap.js is present, and that normally
  // arrives on idle. Loading it early is not enough on its own: the idle
  // loader appends the same files a second time, and re-running a classic
  // script that declares top-level consts throws. So the idle loader is
  // replaced rather than raced.
  html = html.replace(
    /\(window\.requestIdleCallback\|\|function\(cb\)\{setTimeout\(cb,800\)\}\)\(function\(\)\{[\s\S]*?\}\);/,
    '/* lazy loader replaced for capture */');
  html = html.replace('</head>',
    '<script src="coach.js"></script><script src="social.js"></script>' +
    '<script src="bodymap.js"></script>\n</head>');
  return html;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__shot') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end(shotPage(u.searchParams.get('view') || 'home'));
  }
  let file = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                       'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await launch();
  try {
    for (const [name, view, scrollTo] of SHOTS) {
      // The app scrolls #view, not the window, so the element is scrolled
      // into view directly rather than by scrolling the page.
      const before = scrollTo
        ? `(() => { const el = document.querySelector(${JSON.stringify(scrollTo)}); if (el) el.scrollIntoView({ block: 'center' }); })()`
        : undefined;
      const r = await chrome.shoot({
        url: `http://localhost:${PORT}/__shot?view=${view}`,
        width: target.width, height: target.height, scale: 3,
        out: path.join(OUT, `${name}.png`), before,
      });
      // A layout wider than the viewport is exactly the cropping bug this
      // script exists to avoid, so treat it as a failure, not a warning.
      if (r.layoutWidth !== target.width) {
        throw new Error(`${name}: laid out at ${r.layoutWidth}px, expected ${target.width}px`);
      }
      console.log(`  ${name}.png  ${Math.round(r.bytes / 1024)} KB  (laid out at ${r.layoutWidth}px)`);
    }
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await chrome.close();
    server.close();
  }
});
