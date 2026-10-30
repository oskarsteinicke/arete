// Log anything: one sentence about the day, sorted into meals, water, sleep,
// habits, weight and mood, checked, and logged only on a tap.
//
// The traps: ticking a habit the person said they skipped, ticking "Read" for
// the word "already", treating a glass of water as the water habit, trusting
// whatever the AI returns (unknown habits, 99,999 calories), mixing up pounds
// and kilos, and an Undo that leaves half of it behind.
const fs = require('fs'), path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'connect.js', 'today.js', 'diet.js', 'profile.js', 'logany.js'];
const T = new Date().toLocaleDateString('en-CA');

function sb({ imperial = false } = {}) {
  const s = createSandbox({ files: FILES, store: { hvi_onboarded: 'true' } });
  run(s, `
    settings = { units: '${imperial ? 'imperial' : 'metric'}' }; curView = 'home'; track = function () {}; go = function () {};
    history = { pushState: function () {} };
    habits = [{ id: 'h01', name: 'Meditate / breathwork (10+ min)', category: 'mindset' },
              { id: 'h09', name: 'Read 30 minutes', category: 'learning' },
              { id: 'h07', name: 'Drink 3L water', category: 'health' },
              { id: 'h05', name: 'Morning workout / movement', category: 'fitness' }];
    log = { h01: { streak: 2, completedToday: false }, h09: { streak: 0, completedToday: false }, h07: { streak: 0, completedToday: false }, h05: { streak: 1, completedToday: true } };
    journal = {}; meta = {}; prs = {}; achievements = []; challenges = []; goals = []; gamification = { xp: 0, level: 1, pillarXP: {} };
    mealLog = {}; weightLog = {}; sleepLog = { '${T}': { hours: 7, quality: 4 } }; workoutLog = {}; workoutMeta = { activeProgram: 'ppl', currentDayIndex: 0 };
    dietMeta = { dailyGoals: { calories: 2600, protein: 175, carbs: 300, fat: 75 }, goalType: 'maintain' };
    LS.set('hvi_meal_log', mealLog); LS.set('hvi_sleep_log', sleepLog);
  `);
  return s;
}
const local = (s, text) => JSON.parse(run(s, `JSON.stringify(_laLocal(${JSON.stringify(text)}))`));
const clean = (s, raw) => JSON.parse(run(s, `JSON.stringify(_laSanitize(${JSON.stringify(raw)}))`));
const of = (list, type) => list.filter(e => e.type === type);

module.exports = async function () {
  const r = createReporter('logany');

  r.section('the plain reader catches the obvious');
  {
    const s = sb();
    r.check('half a litre of water', of(local(s, 'had half a litre of water'), 'water')[0]?.ml === 500);
    r.check('glasses and millilitres add up', of(local(s, '2 glasses of water and 500 ml water'), 'water')[0]?.ml === 1000);
    r.check('"slept about 6 hours"', of(local(s, 'slept about 6 hours'), 'sleep')[0]?.hours === 6);
    r.check('"slept 7h 30m"', of(local(s, 'slept 7h 30m'), 'sleep')[0]?.hours === 7.5);
    r.check('"weighed 80.4 kg"', of(local(s, 'weighed 80.4 kg this morning'), 'weight')[0]?.value === 80.4);
    r.check('"did my meditation" ticks Meditate', of(local(s, 'did my meditation'), 'habit').map(e => e.id).join() === 'h01');
    const eggs = of(local(s, 'two eggs and toast'), 'meal')[0];
    r.check('common foods become a meal', !!eggs && eggs.items.length >= 1 && eggs.items.every(it => it.calories > 0), JSON.stringify(eggs));
  }

  r.section('and does not tick habits that were not done');
  {
    const s = sb();
    r.check('"didn\'t meditate" ticks nothing', of(local(s, "didn't meditate today"), 'habit').length === 0);
    r.check('"skipped my workout" ticks nothing', of(local(s, 'skipped my workout'), 'habit').length === 0);
    r.check('"already" is not "read"', of(local(s, 'already had lunch'), 'habit').length === 0);
    r.check('a litre of water is water, not the water habit', of(local(s, 'a litre of water'), 'habit').length === 0 && of(local(s, 'a litre of water'), 'water')[0]?.ml === 1000);
  }

  r.section('what the AI sends back is checked, not trusted');
  {
    const s = sb();
    const out = clean(s, { entries: [
      { type: 'habit', id: 'h01' }, { type: 'habit', id: 'made_up' }, { type: 'habit', id: 'h01' },
      { type: 'meal', meal: 'Brunch', items: [{ name: 'Eggs (2 large)', calories: 156, protein: 13, carbs: 1, fat: 11 }, { name: 'Glitch', calories: 99999 }] },
      { type: 'sleep', bedtime: '23:30', wake: '07:00' },
      { type: 'mood', mood: 9 }, { type: 'mood', mood: 4 },
      { type: 'weight', value: 176, unit: 'lb' },
      { type: 'water', ml: 500000 },
      { type: 'launch_rockets' },
    ] });
    r.check('an unknown habit is dropped, a repeat is folded', of(out, 'habit').map(e => e.id).join() === 'h01');
    const meal = of(out, 'meal')[0];
    r.check('99,999 calories is dropped, the real item kept', meal && meal.items.length === 1 && meal.items[0].name === 'Eggs (2 large)', JSON.stringify(meal));
    r.check('an unknown meal name becomes the meal for this hour', meal && ['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(meal.meal));
    r.check('bedtime and wake give the hours', of(out, 'sleep')[0]?.hours === 7.5);
    r.check('a mood of 9 is dropped, 4 kept', of(out, 'mood').map(e => e.mood).join() === '4');
    r.check('176 lb is stored as 79.8 kg for a metric user', of(out, 'weight')[0]?.value === 79.8);
    r.check('500 litres of water is dropped', of(out, 'water').length === 0);
    r.check('unknown types are dropped', out.every(e => ['habit', 'meal', 'sleep', 'mood', 'weight', 'water'].includes(e.type)));
    const imp = clean(sb({ imperial: true }), [{ type: 'weight', value: 80, unit: 'kg' }]);
    r.check('80 kg is stored as 176.4 lbs for an imperial user', imp[0]?.value === 176.4);
  }

  r.section('the AI is asked for exactly this');
  {
    const s = sb();
    const p = String(run(s, '_laPrompt()'));
    r.check('JSON only', /Output ONLY a JSON object/.test(p));
    r.check('with the habit list, ids and names', /\[h01\] Meditate \/ breathwork \(10\+ min\)/.test(p) && /\[h09\] Read 30 minutes/.test(p));
    r.check('never plans, never invention', /never plans/.test(p) && /Never invent/.test(p));
  }

  r.section('read through the AI, or on the phone when it fails');
  {
    const s = sb();
    run(s, `aiConsent = function () { return 'yes'; };
      _aiFetch = function () { return Promise.resolve('\`\`\`json\\n{"entries":[{"type":"water","ml":750},{"type":"habit","id":"h09"}]}\\n\`\`\`'); };`);
    const viaAI = JSON.parse(await run(s, `_laRead('had 750 ml water and read').then(x => JSON.stringify(x))`));
    r.check('the AI answer is used, code fences and all', of(viaAI, 'water')[0]?.ml === 750 && of(viaAI, 'habit')[0]?.id === 'h09', JSON.stringify(viaAI));
    run(s, `_aiFetch = function () { return Promise.reject(new Error('offline')); };`);
    const viaPhone = JSON.parse(await run(s, `_laRead('half a litre of water').then(x => JSON.stringify(x))`));
    r.check('offline, the phone reads it', of(viaPhone, 'water')[0]?.ml === 500);
    r.check('and says it only read the basics', /only the basics/.test(String(run(s, '_laNote'))));
  }

  r.section('logging it, and one Undo for all of it');
  {
    const s = sb();
    run(s, `_undo = _laApply([
      { type: 'meal', meal: 'Breakfast', items: [{ name: 'Eggs (2 large)', calories: 156, protein: 13, carbs: 1, fat: 11 }, { name: 'Toast (2 slices)', calories: 160, protein: 6, carbs: 30, fat: 2 }] },
      { type: 'water', ml: 500 }, { type: 'sleep', hours: 6.5 }, { type: 'habit', id: 'h01' },
      { type: 'weight', value: 80.4 }, { type: 'mood', mood: 4 }]);`);
    const meals = JSON.parse(run(s, `JSON.stringify((LS.get('hvi_meal_log', {})['${T}'] || {}).meals || [])`));
    r.check('the meal is logged with both items', meals.length === 1 && meals[0].name === 'Breakfast' && meals[0].items.length === 2);
    r.check('the water', run(s, `(LS.get('hvi_water_log', {}) || {})['${T}']`) === 500);
    r.check('last night\'s sleep', run(s, `LS.get('hvi_sleep_log', {})['${T}'].hours`) === 6.5);
    r.check('the habit is ticked through the app\'s own tap', run(s, `log.h01.completedToday`) === true && run(s, `(LS.get('hvi_habit_history', {}).h01 || []).includes('${T}')`) === true);
    r.check('the weight', run(s, `LS.get('hvi_weight_log', {})['${T}']`) === 80.4);
    r.check('the mood', run(s, `(LS.get('hvi_mood_log', {})['${T}'] || {}).mood`) === 4);
    run(s, '_undo()');
    r.check('Undo: the meal is gone', JSON.parse(run(s, `JSON.stringify((LS.get('hvi_meal_log', {})['${T}'] || {}).meals || [])`)).length === 0);
    r.check('the water is gone', !run(s, `(LS.get('hvi_water_log', {}) || {})['${T}']`));
    r.check('the sleep is back to what it was', run(s, `LS.get('hvi_sleep_log', {})['${T}'].hours`) === 7);
    r.check('the habit is unticked', run(s, `log.h01.completedToday`) === false);
    r.check('the weight is gone', run(s, `LS.get('hvi_weight_log', {})['${T}']`) == null);
    r.check('the mood is gone', !run(s, `(LS.get('hvi_mood_log', {})['${T}'] || null)`));
  }

  r.section('a habit already done today is shown as done, not ticked again');
  {
    const s = sb();
    r.check('marked as already done', run(s, `_laDescribe({ type: 'habit', id: 'h05' }).already`) === true);
    run(s, `_laApply([{ type: 'habit', id: 'h05' }])`);
    r.check('and left done (a second tap would untick it)', run(s, 'log.h05.completedToday') === true);
  }

  r.section('no mic button inside the native apps');
  {
    const s = sb();
    run(s, `window.webkitSpeechRecognition = function () {};`);
    r.check('on the web, where the browser can listen, there is one', !!run(s, '_laSR()'));
    run(s, `window.Capacitor = { isNativePlatform: function () { return true; } };`);
    r.check('in the app, where it would need microphone permission, there is not', !run(s, '_laSR()'));
  }

  r.section('the words follow the brand');
  {
    const code = fs.readFileSync(path.join(APP, 'logany.js'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    r.check('no em dashes', !/—/.test(code));
  }

  return r.finish();
};
