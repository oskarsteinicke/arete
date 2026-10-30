// What the coach is told about the person.
//
// Checked against twelve real questions with a month of logs. Whatever the
// coach was not given, it made up: it judged eating by breakfast alone at
// 21:00, called every gym session "Unknown", planned a week from "Monday
// (today)" on a Sunday, and took a lighter session's set and reps off a second
// time. Each section here holds one of those fixed.
const fs = require('fs'), path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

const ALL = ['data.js', 'app.js', 'connect.js', 'premium.js', 'workout.js', 'diet.js',
             'integrations.js', 'profile.js', 'social.js', 'coach.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);

const PROG = { id: 'cp_t', name: 'Test Power', days: [
  { name: 'Upper Push', focus: 'Chest', ex: ['bench_press', 'ohp'], rx: { bench_press: [4, 6], ohp: [3, 6] } },
  { name: 'Lower Power', focus: 'Legs', ex: ['squat', 'rdl'], rx: { squat: [4, 5], rdl: [3, 8] } },
] };
const sets = (n, w, r) => Array.from({ length: n }, () => ({ weight: w, reps: r, completed: true }));

function sb({ sleepToday, units = 'metric', goal = 'cut', target = 2300 } = {}) {
  const workoutLog = {
    [dk(14)]: { programId: 'cp_t', dayIndex: 0, touched: true, duration: 3300, exercises: [{ exerciseId: 'bench_press', sets: sets(4, 75, 6) }, { exerciseId: 'ohp', sets: sets(3, 45, 6) }] },
    [dk(7)]: { programId: 'cp_t', dayIndex: 0, touched: true, duration: 3360, exercises: [{ exerciseId: 'bench_press', sets: sets(4, 77.5, 6) }, { exerciseId: 'ohp', sets: sets(3, 47.5, 6) }] },
    [dk(3)]: { programId: 'cp_t', dayIndex: 0, touched: true, duration: 3420, exercises: [{ exerciseId: 'bench_press', sets: sets(4, 80, 6) }, { exerciseId: 'ohp', sets: sets(3, 47.5, 5) }] },
    [dk(2)]: { programId: 'cp_t', dayIndex: 1, touched: true, duration: 3660, exercises: [{ exerciseId: 'squat', sets: sets(4, 100, 5) }, { exerciseId: 'rdl', sets: sets(3, 85, 8) }] },
  };
  // 2,000 kcal every day for three weeks, weight flat: maintenance is 2,000.
  const mealLog = {}, weightLog = {};
  for (let i = 1; i <= 21; i++) mealLog[dk(i)] = { meals: [{ id: 'm' + i, name: 'Lunch', items: [{ name: 'Chicken breast, 200g', calories: 1200, protein: 100, carbs: 50, fat: 30 }, { name: 'Rice, 200g cooked', calories: 800, protein: 20, carbs: 150, fat: 5 }] }] };
  mealLog[T] = { meals: [{ id: 'm0', name: 'Breakfast', items: [{ name: 'Oats, 80g', calories: 300, protein: 11, carbs: 54, fat: 6 }] }] };
  for (let i = 0; i < 21; i++) weightLog[dk(i)] = 80;
  const sleepLog = {};
  for (let i = 1; i < 7; i++) sleepLog[dk(i)] = { hours: 7, quality: 4 };
  if (sleepToday) sleepLog[T] = sleepToday;
  const s = createSandbox({ files: ALL, store: { hvi_onboarded: 'true', hvi_user_name: 'Oskar', hvi_custom_programs: JSON.stringify([PROG]),
    hvi_habit_history: JSON.stringify({ h1: [dk(1), dk(2), dk(4)], h2: [] }) } });
  run(s, `
    settings = { units: '${units}' }; curView = 'home'; track = function () {}; history = { pushState: function () {} };
    habits = [{ id: 'h1', name: 'Read 30 minutes', category: 'learning' }, { id: 'h2', name: 'Cold shower', category: 'discipline' }];
    log = { h1: { streak: 2, completedToday: true }, h2: { streak: 0, completedToday: false } };
    journal = {}; meta = {}; prs = {}; achievements = []; challenges = []; goals = []; gamification = { xp: 0, level: 1, pillarXP: {} };
    workoutLog = ${JSON.stringify(workoutLog)}; workoutMeta = { activeProgram: 'cp_t', currentDayIndex: 0 };
    mealLog = ${JSON.stringify(mealLog)}; weightLog = ${JSON.stringify(weightLog)}; sleepLog = ${JSON.stringify(sleepLog)};
    dietMeta = { dailyGoals: { calories: ${target}, protein: 175, carbs: 240, fat: 70 }, goalType: '${goal}' };
    LS.set('hvi_meal_log', mealLog);
  `);
  return s;
}
const prompt = s => String(run(s, 'buildCoachSystemPrompt()') || '');

module.exports = async function () {
  const r = createReporter('coachcontext');

  r.section('it knows what day and time it is');
  {
    const p = prompt(sb());
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
    r.check('the weekday is named', new RegExp(`TODAY: ${day}`).test(p), (p.match(/TODAY:.*/) || [''])[0]);
    r.check('and the time', /TODAY: .*, \d\d:\d\d/.test(p));
  }

  r.section('sessions are named and show what was lifted');
  {
    const p = prompt(sb());
    r.check('a logged session is called by its program day, not "Unknown"', /Upper Push · 57 min/.test(p) && !/Unknown/.test(p), (p.match(/.*57 min.*/) || [''])[0]);
    r.check('with each lift, sets and weight', /Bench Press 4×6 @80; Overhead Press 3×5 @47\.5/.test(p));
    r.check('and its volume', /1,920 kg volume|2,632\.5 kg volume|2,633 kg volume/.test(p), (p.match(/.*57 min.*/) || [''])[0]);
    r.check('the bench is traced session by session', /Bench Press: 75×6 \([^)]*\) → 77\.5×6 \([^)]*\) → 80×6/.test(p), (p.match(/Bench Press: .*/) || [''])[0]);
  }

  r.section('the session today is given with final numbers');
  {
    let p = prompt(sb());
    r.check('a normal day: the planned sets as the app will build them', /Next session \(planned, not started\): Upper Push/.test(p) && /Bench Press 4×6 @/.test(p));
    p = prompt(sb({ sleepToday: { hours: 5.5 } }));
    r.check('a lighter day: today\'s numbers, with the full plan beside them', /Bench Press 3×4 @\S+ kg \(full plan would be 4×6/.test(p), (p.match(/.*full plan would be.*/) || [''])[0]);
    r.check('and nothing worded as an operation to apply again', !/one set and two reps fewer/.test(p));
    r.check('it is told not to push past it', /Do not tell them to push harder than this/.test(p));
  }

  r.section('eating is judged by the week, not by breakfast');
  {
    const s0 = sb();
    const p = prompt(s0);
    r.check('today is marked as unfinished', /Today so far, at \d\d:\d\d \(the day is not over/.test(p));
    r.check('with what is still left to eat', /Left today to reach today's target: [\d,]+ kcal/.test(p));
    r.check('the last 7 days are averaged', /Last 7 days, 7 with meals logged: average 2,000 kcal/.test(p), (p.match(/Last 7 days.*/) || [''])[0]);
    // Found here: today's breakfast-only total was averaged in, so maintenance
    // read 1,757 for someone eating 2,000 a day at a flat weight.
    r.check('the week\'s average leaves out today, which is not over', run(s0, 'computeWeeklyAvgCalories(mealLog)') === 2000, `(${run(s0, 'computeWeeklyAvgCalories(mealLog)')})`);
    r.check('the comparison with maintenance is made for it', /eating about \d+ kcal a day (ABOVE|BELOW) maintenance/.test(p) && /roughly at maintenance/.test(p), (p.match(/So they are eating.*/) || [''])[0]);
    r.check('and a cut target above maintenance is called what it is', /base target of 2,300 kcal is \d+ kcal above that maintenance\. For a cut, that target is too high/.test(p));
    r.check('the app\'s own suggestion is the one to recommend', /the app suggests changing their target to [\d,]+ kcal .*"Use these targets"/.test(p));
    r.check('and it is marked as not counting until it is applied', /Not yet applied: .*Until they apply it, today's target above is the one that counts/.test(p));
    r.check('the weight trend is given', /Weight: 80 kg .*Trend since .*: [+-]?0\.0 kg \(flat\)/.test(p), (p.match(/Weight:.*/) || [''])[0]);
    r.check('and the foods they actually eat', /Foods they eat most: Chicken breast, 200g/.test(p));
  }

  r.section('each habit has its own week');
  {
    const p = prompt(sb());
    r.check('read: 4 of the last 7 days, counting today', /"Read 30 minutes" \(learning\) · 4 of the last 7 days · streak 2d · done today/.test(p), (p.match(/.*Read 30 minutes.*/) || [''])[0]);
    r.check('cold shower: none', /"Cold shower" \(discipline\) · 0 of the last 7 days/.test(p));
  }

  r.section('sleep comes with an average');
  {
    const p = prompt(sb({ sleepToday: { hours: 6 } }));
    r.check('nights and the average', /SLEEP \(last 7 nights\):/.test(p) && /Average 6h 45m a night|Average 7h a night|Average 6h 50m/.test(p) || /Average \dh/.test(p), (p.match(/Average.*/) || [''])[0]);
  }

  r.section('units follow the person');
  {
    const p = prompt(sb({ units: 'imperial' }));
    r.check('volume and weights in pounds', /lbs volume/.test(p) && !/ kg volume/.test(p));
  }

  r.section('how it is told to answer');
  {
    const p = prompt(sb());
    r.check('short', /Under 120 words/.test(p));
    r.check('plain: no headings, bold labels, tables or emoji', /No headings, no bold labels, no tables, no emoji/.test(p));
    r.check('no judging the day before it is over', /Judge eating by the 7-day average/.test(p));
    r.check('a settings change is just confirmed', /unless they asked you to change something in the app; then just confirm it/.test(p));
    const src = fs.readFileSync(path.join(APP, 'coach.js'), 'utf8');
    r.check('and a reply cannot run on and on', /buildCoachSystemPrompt\(\) \},\s*\.\.\._coachHistory,\s*\], \{ maxTokens: 800 \}\)/.test(src));
  }

  // Asked why weight was not moving, the coach wrote "Do you want me to apply
  // the new targets?" and set them in the same reply. A change it proposes now
  // waits for a tap.
  r.section('a change the coach proposes waits for Apply');
  {
    const reply = (tag) => `Your intake sits at maintenance. Tap Apply to lower your target.\n\n${tag}`;
    const send = async (s, text, tag) => {
      run(s, `aiAllowed = function () { return true; }; _coachHistory = []; _saveCoachHistory = function () {};
        _aiFetch = function () { return Promise.resolve(${JSON.stringify(reply(tag))}); };
        document.getElementById('coach-input').value = ${JSON.stringify(text)};`);
      await run(s, 'sendCoachMsg()');
      await new Promise(res => setTimeout(res, 20));
    };
    let s = sb();
    await send(s, 'Why am I not losing weight?', '[[ACTION:set_macros:{"calories":1775,"protein":177}]]');
    r.check('the reply arrives with nothing changed', run(s, 'dietMeta.dailyGoals.calories') === 2300 && run(s, 'dietMeta.dailyGoals.protein') === 175);
    const hist = JSON.parse(run(s, 'JSON.stringify(_coachHistory)'));
    const at = hist.findIndex(m => m.role === 'system' && m.content.startsWith('[[PROPOSED]]'));
    r.check('the change is kept as a proposal', at > -1, JSON.stringify(hist.map(m => m.content.slice(0, 20))));
    run(s, '_renderCoachMsgs()');
    const html = run(s, `document.getElementById('coach-msgs').innerHTML`) || '';
    r.check('shown in words, with Apply and Not now', /Set daily targets: calories 1,775, protein 177(\s|\u00a0|&nbsp;)g/.test(html) && new RegExp(`applyCoachProposal\\(${at}\\)[^>]*>Apply`).test(html) && /Not now/.test(html));
    r.check('the action tag itself is not shown', !/\[\[ACTION/.test(html));
    run(s, `go = function () {}; applyCoachProposal(${at})`);
    r.check('Apply makes the change', run(s, 'dietMeta.dailyGoals.calories') === 1775 && run(s, 'dietMeta.dailyGoals.protein') === 177);
    r.check('and the card becomes the record of it', JSON.parse(run(s, 'JSON.stringify(_coachHistory)'))[at].content.startsWith('[[ACTIONS]]'));
    run(s, `applyCoachProposal(${at})`);
    r.check('a second tap changes nothing more', run(s, 'dietMeta.dailyGoals.calories') === 1775);

    s = sb();
    await send(s, 'Add a stretching habit', '[[ACTION:add_habit:{"name":"Evening stretch","category":"fitness"}]]');
    const i2 = JSON.parse(run(s, 'JSON.stringify(_coachHistory)')).findIndex(m => m.content.startsWith('[[PROPOSED]]'));
    run(s, `dismissCoachProposal(${i2})`);
    r.check('Not now leaves everything as it was', run(s, 'habits.length') === 2 && !run(s, 'habits.some(h => h.name === "Evening stretch")'));
    run(s, '_renderCoachMsgs()');
    r.check('and says it was not applied', /Not applied: Add habit &quot;Evening stretch&quot;|Not applied: Add habit "Evening stretch"/.test(run(s, `document.getElementById('coach-msgs').innerHTML`) || ''));

    s = sb();
    await send(s, 'Do something', '[[ACTION:delete_everything:{}]]');
    r.check('an action the app does not know is never offered', !JSON.parse(run(s, 'JSON.stringify(_coachHistory)')).some(m => m.content.startsWith('[[PROPOSED]]')));
    const src = fs.readFileSync(path.join(APP, 'coach.js'), 'utf8');
    r.check('the coach is told the card is the question', /NEVER ask "do you want me to…" in a reply that also carries the action/.test(src));
  }

  // A logged session stores seconds; one brought in from a device, minutes.
  // The coach read both as minutes, so a 55-minute lift came out as 3,300.
  r.section('session length and what Whoop measured');
  {
    const s = sb();
    r.check('a logged session is told in minutes', /Upper Push · 57 min/.test(prompt(s)) && !/3420 min/.test(prompt(s)));
    run(s, `LS.set('hvi_whoop_body', { maxHr: 195 })`);
    const own = run(s, `_coachSessionLine({ dayName: 'Soccer', source: 'whoop', duration: 70, strain: 14.3, avgHr: 151, exercises: [] }, 'Sat')`);
    r.check('a Whoop activity keeps its own minutes, strain and heart rate', /70 min/.test(own) && /Strain 14\.3/.test(own) && /avg 151 bpm, 77% of max/.test(own), own);
    const lifted = run(s, `_coachSessionLine({ programId: 'cp_t', dayIndex: 0, duration: 3000, exercises: [], whoop: { strain: 9.8, avgHr: 122 } }, 'Fri')`);
    r.check('a session logged here carries Whoop\'s reading of it', /50 min/.test(lifted) && /Whoop: Strain 9\.8 · avg 122 bpm, 63% of max/.test(lifted), lifted);
  }

  return r.finish();
};
