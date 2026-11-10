// The starter habits. Onboarding asks which path someone came for, and for a
// long time the answer only chose which setup screens appeared: everyone then
// started on the same twelve habits. The path picks a short set now, and the
// rest are one tap to add.
const fs = require('fs');
const path = require('path');
const { createSandbox, run, runCatching, createReporter, APP } = require('./harness');

const FILES = ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'profile.js', 'premium.js'];
const PATHS = ['all', 'habits', 'fitness', 'nutrition'];

// A device as init() leaves it, with the loud side effects of a tick stubbed
// and a go() that redraws the pillar page the way the real one does.
async function fresh(store) {
  const s = createSandbox({ files: FILES, store: store || {} });
  run(s, `settings={}; curView='home';
          track=function(n,p){ _tracked.push([n,p||{}]); };
          go=function(v,p){ _nav.push(v); curView=v; curPillar=(p&&p.pillar)||null; if(v==='pillar') renderPillar(); };
          launchConfetti=function(){}; showFeatureTour=function(){};
          playSound=function(){}; haptic=function(){}; awardXP=function(){};
          checkDailyQuests=function(){}; checkAchievements=function(){}; updateHabitUI=function(){};
          showToast=function(m){ _tracked.push(['toast', m]); };
          showUpgradeModal=function(k){ _tracked.push(['upgrade', k]); };`);
  await run(s, 'init()');
  return s;
}
// A new person who finished onboarding on the given path.
async function onPath(p) {
  const s = await fresh();
  run(s, `_obPath='${p}'; obFinish()`);
  return s;
}
const ids = s => JSON.parse(run(s, 'JSON.stringify(habits.map(function(h){return h.id}))'));
const stored = (s, k) => JSON.parse(s.localStorage._d[k] || 'null');
const view = s => s._els.view.innerHTML;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = async function () {
  const r = createReporter('starter');
  const base = await fresh();
  const SETS = JSON.parse(run(base, 'JSON.stringify(STARTER_SETS)'));
  const LIB = JSON.parse(run(base, 'JSON.stringify(HABIT_LIBRARY)'));
  const LINKS = JSON.parse(run(base, 'JSON.stringify(HABIT_LIBRARY_LINKS)'));
  const linksFor = list => Object.fromEntries(list.filter(id => LINKS[id]).map(id => [id, LINKS[id]]));

  r.section('every path has a short set of ready-made habits');
  {
    run(base, 'renderOnboarding(3)');
    const offered = [...base._els['ob-overlay'].innerHTML.matchAll(/_obPath='(\w+)'/g)].map(m => m[1]);
    r.check('each path onboarding offers has a set', offered.length === 4 && offered.every(k => Array.isArray(SETS[k])), `(${offered})`);
    r.check('five habits each', PATHS.every(k => SETS[k].length === 5), JSON.stringify(SETS));
    r.check('and no more than the free plan holds', PATHS.every(k => SETS[k].length <= run(base, 'FREE_HABIT_LIMIT')));
    r.check('no habit twice in a set', PATHS.every(k => new Set(SETS[k]).size === SETS[k].length));
    r.check('every one is in the library', PATHS.every(k => SETS[k].every(id => LIB.some(h => h.id === id))));
    r.check('library ids are unique', new Set(LIB.map(h => h.id)).size === LIB.length);
    r.check('every link belongs to a library habit', Object.keys(LINKS).every(id => LIB.some(h => h.id === id)));
    const pillarsOf = k => new Set(SETS[k].map(id => run(base, `PILLARS.find(function(p){return p.cats.includes('${LIB.find(h => h.id === id).category}')}).id`)));
    r.check('the complete path has one from each pillar', pillarsOf('all').size === 5, `(${[...pillarsOf('all')]})`);
    r.check('the screen says the path picks the habits', /Your path picks your first five habits/.test(base._els['ob-overlay'].innerHTML));
  }

  r.section('a new device starts on the all-round set');
  {
    const s = await fresh();
    r.check('five habits, not twelve', same(ids(s), SETS.all), `(${ids(s)})`);
    r.check('saved', same((stored(s, 'hvi_habits') || []).map(h => h.id), SETS.all));
    r.check('with only the links that belong to them', same(stored(s, 'hvi_habit_links'), linksFor(SETS.all)), JSON.stringify(stored(s, 'hvi_habit_links')));
    r.check('each one ready to tick', SETS.all.every(id => run(s, `log['${id}'] && log['${id}'].completedToday === false`)));
    run(s, `habits[0].name = 'Mine now'`);
    r.check('the library is not what was handed out', run(s, `HABIT_LIBRARY.find(function(h){return h.id==='${SETS.all[0]}'}).name`) !== 'Mine now');
    const swapped = await onPath('fitness');
    run(swapped, `habits[0].name = 'Mine now'`);
    r.check('nor what the path hands out', run(swapped, `HABIT_LIBRARY.find(function(h){return h.id==='${SETS.fitness[0]}'}).name`) !== 'Mine now');
    const skip = await fresh();
    run(skip, 'obSkip()');
    r.check('skipping onboarding keeps it', same(ids(skip), SETS.all));
  }

  r.section('the path picks the habits');
  for (const p of PATHS) {
    const s = await onPath(p);
    r.check(`${p}: starts on its own five`, same(ids(s), SETS[p]), `(${ids(s)})`);
    r.check(`${p}: saved`, same((stored(s, 'hvi_habits') || []).map(h => h.id), SETS[p]));
    r.check(`${p}: links match the habits`, same(stored(s, 'hvi_habit_links'), linksFor(SETS[p])), JSON.stringify(stored(s, 'hvi_habit_links')));
    const logged = Object.keys(JSON.parse(run(s, 'JSON.stringify(log)'))).sort();
    r.check(`${p}: nothing left behind from the seed`, same(logged, [...SETS[p]].sort()), `(${logged})`);
  }
  {
    // The nutrition path's own two habits are wired to the food log.
    const s = await onPath('nutrition');
    run(s, `renderDiet=function(){}; dietMeta.goalType='cut';`);
    const target = run(s, 'getTodaysMacroTargets()');
    const meal = { id: 'm0', name: 'Meal', xp: 0, items: [{ name: 'Food', calories: Math.round(target.calories * 0.97), protein: target.protein + 5 }] };
    run(s, `LS.set('hvi_meal_log', { [today()]: { meals: ${JSON.stringify([meal])} } }); window.Arete.emit('meal:logged', {});`);
    r.check('a day on target ticks the calorie habit', run(s, 'log.h14.completedToday') === true);
    r.check('and reaching protein ticks the protein habit', run(s, 'log.h13.completedToday') === true);
  }

  r.section("a list that is someone's own is never trimmed");
  {
    const twelve = LIB.slice(0, 12);
    const legacy = await fresh({ hvi_habits: JSON.stringify(twelve), hvi_habit_links: JSON.stringify({ h05: 'workout', h07: 'water', h08: 'sleep' }) });
    run(legacy, `_obPath='nutrition'; obFinish()`);
    r.check('twelve from an older version stay twelve', ids(legacy).length === 12, `(${ids(legacy).length})`);
    r.check('with their links', same(stored(legacy, 'hvi_habit_links'), { h05: 'workout', h07: 'water', h08: 'sleep' }));

    const touched = async (label, change) => {
      const s = await fresh();
      run(s, change);
      const before = ids(s);
      const swapped = run(s, `applyStarterPath('fitness')`);
      r.check(label, swapped === false && same(ids(s), before), `(${ids(s)})`);
    };
    await touched('a renamed habit keeps the list', `habits[2].name = 'Read a chapter'`);
    await touched('so does a moved category', `habits[2].category = 'mindset'`);
    await touched('a changed schedule', `habits[1].schedule = 'weekly'`);
    await touched('a habit ticked today', `log[habits[0].id].completedToday = true`);
    await touched('one ticked on an earlier day', `log[habits[3].id].lastCompletedDate = '2026-01-02'`);
    await touched('a running streak', `log[habits[4].id].streak = 3`);
    await touched('a different order', `habits.reverse()`);
    await touched('one removed', `habits.pop()`);
    await touched('one added', `habits.push({ id: 'cu_1', name: 'Stretch', category: 'fitness' })`);

    const s = await fresh();
    r.check('the complete path has nothing to swap', run(s, `applyStarterPath('all')`) === false && same(ids(s), SETS.all));
    r.check('an unknown path is ignored', run(s, `applyStarterPath('nope')`) === false && same(ids(s), SETS.all));
    r.check('an untouched seed does swap', run(s, `applyStarterPath('fitness')`) === true && same(ids(s), SETS.fitness));
  }

  r.section('the rest are one tap to add');
  {
    const s = await onPath('fitness');
    const ready = () => JSON.parse(run(s, 'JSON.stringify(readyHabits().map(function(h){return h.id}))'));
    r.check('everything not in the list is on offer', ready().length === LIB.length - 5 && !ready().some(id => SETS.fitness.includes(id)), `(${ready()})`);
    const mind = JSON.parse(run(s, `JSON.stringify(readyHabits('mind').map(function(h){return h.category}))`));
    r.check("a pillar's own only, when asked", mind.length > 0 && mind.every(c => c === 'mindset' || c === 'discipline'), `(${mind})`);

    r.check('one tap adds it', run(s, `addReadyHabit('h13')`) === true && ids(s)[5] === 'h13', `(${ids(s)})`);
    const added = JSON.parse(run(s, 'JSON.stringify(habits[5])'));
    r.check('as the library has it', added.name === 'Hit your protein goal' && added.category === 'health', JSON.stringify(added));
    r.check('ready to tick', run(s, 'log.h13.completedToday === false && log.h13.streak === 0'));
    r.check('with its link', (stored(s, 'hvi_habit_links') || {}).h13 === 'protein');
    r.check('saved', (stored(s, 'hvi_habits') || []).some(h => h.id === 'h13') && !!(stored(s, 'hvi_log') || {}).h13);
    r.check('and it says so', run(s, '_tracked.some(function(t){return t[0]==="toast" && /Added: Hit your protein goal/.test(t[1])})'));
    r.check('it is no longer on offer', !ready().includes('h13'));
    r.check('a second tap adds nothing', run(s, `addReadyHabit('h13')`) === false && ids(s).filter(id => id === 'h13').length === 1);
    r.check('nor does an id that is not in the library', run(s, `addReadyHabit('zz')`) === false && ids(s).length === 6);
    run(s, `habits[5].name = 'Protein, daily'`);
    r.check('the copy is theirs to edit', LIB.find(h => h.id === 'h13').name === run(s, `HABIT_LIBRARY.find(function(h){return h.id==='h13'}).name`));
    r.check('and renaming it does not put the original back on offer', !ready().includes('h13'), `(${ready()})`);

    // A link left behind under the same id must not attach itself to a habit
    // that was never meant to have one.
    run(s, `LS.set('hvi_habit_links', Object.assign(LS.get('hvi_habit_links', {}), { h02: 'journal' })); addReadyHabit('h02');`);
    r.check('a habit with no link gets none', (stored(s, 'hvi_habit_links') || {}).h02 === undefined, JSON.stringify(stored(s, 'hvi_habit_links')));

    run(s, `habits.push({ id: 'cu_9', name: '  cold SHOWER ', category: 'discipline' })`);
    r.check('a habit they already built by that name is not offered again', !ready().includes('h04'), `(${ready()})`);
  }
  {
    // A link that arrives after its condition was met ticks at once.
    const s = await onPath('nutrition');
    run(s, `sleepLog[today()] = { hours: 6 }; addReadyHabit('h01');`);
    r.check('an unlinked habit starts unticked', run(s, 'log.h01.completedToday') === false);
    run(s, `workoutMeta.lastWorkoutDate = ''; addReadyHabit('h05');`);
    r.check('so does a workout habit on a day with no session', run(s, 'log.h05.completedToday') === false);
    const t = await onPath('habits');
    run(t, `workoutMeta.lastWorkoutDate = today(); addReadyHabit('h05');`);
    r.check('added after the session, it is already ticked', run(t, 'log.h05.completedToday') === true);
    const u = await onPath('all');
    run(u, `sleepLog[today()] = { hours: 7.5 }; addReadyHabit('h08');`);
    r.check('added after a full night was logged, the sleep habit is too', run(u, 'log.h08.completedToday') === true);
    const w = await onPath('all');
    run(w, `sleepLog[today()] = { hours: 6 }; addReadyHabit('h08');`);
    r.check('but not after a short one', run(w, 'log.h08.completedToday') === false);
  }
  {
    const s = await onPath('fitness');
    run(s, `isPremium=function(){ return false; }`);
    const before = ids(s);
    r.check('at the free limit a tap asks about upgrading instead',
      run(s, `addReadyHabit('h13')`) === false && same(ids(s), before)
      && run(s, '_tracked.some(function(t){return t[0]==="upgrade" && t[1]==="habits"})'), `(${ids(s)})`);
    run(s, `habits.pop(); addReadyHabit('h13');`);
    r.check('under it, the habit is added', ids(s).includes('h13'), `(${ids(s)})`);
  }

  r.section('New Habit leads with the ready-made ones');
  {
    const s = await onPath('nutrition');
    run(s, 'renderHabitCreate()');
    const html = view(s);
    const rows = [...html.matchAll(/addReadyHabit\('(h\d+)'\)" role="button"/g)].map(m => m[1]);
    r.check('every habit on offer has a row', rows.length === LIB.length - 5 && !rows.some(id => SETS.nutrition.includes(id)), `(${rows})`);
    r.check('grouped by pillar', /Mind<\/div>/.test(html) && /Mastery<\/div>/.test(html));
    r.check('a linked one says what will tick it', /Ticks itself when you finish a workout/.test(html));
    r.check('before the form for building your own', html.indexOf("addReadyHabit('h01')") < html.indexOf('Build your own') && html.indexOf('Build your own') < html.indexOf('id="hc-name"'));
    r.check('and the heading says both are there, with a way down to the form', /Tap a ready-made habit to add it, or <button class="hc-jump" onclick="jumpToOwnHabit\(\)">build your own<\/button>\./.test(html));
    r.check('picking a category no longer redraws the screen and empties the name', !/curHabitCat='\w+';go\('habitCreate'\)/.test(html));

    run(s, `curView='habitCreate'; _nav.length = 0; addReadyHabit('h09');`);
    const list = s._els['hc-ready'].innerHTML;
    r.check('adding from here takes the row out of the list', !/addReadyHabit\('h09'\)/.test(list) && /addReadyHabit\('h10'\)/.test(list), `(${list.length} chars)`);
    r.check('without leaving the screen', run(s, '_nav.length') === 0 && run(s, 'curView') === 'habitCreate');

    run(s, `habits = HABIT_LIBRARY.map(function(h){ return Object.assign({}, h); }); renderHabitCreate();`);
    const full = view(s);
    r.check('with nothing left to offer it is the plain form', !/addReadyHabit\(/.test(full) && /Build your own daily practice\./.test(full) && /id="hc-name"/.test(full));
  }

  r.section('an empty pillar offers its habits');
  {
    const s = await onPath('nutrition');
    run(s, `go('pillar', { pillar: 'mind' })`);
    let html = view(s);
    const rows = h => [...h.matchAll(/addReadyHabit\('(h\d+)'\)" role="button"/g)].map(m => m[1]);
    r.check('it says the pillar is empty', /No habits in Mind yet\. Add one to start it\./.test(html));
    r.check("and lists that pillar's ready-made habits only", same(rows(html), ['h01', 'h02', 'h03', 'h04']), `(${rows(html)})`);
    r.check('with a way to build one for it', /curHabitCat='mindset';tryAddHabit\(\)/.test(html));

    run(s, `addReadyHabit('h03')`);
    html = view(s);
    r.check('adding one shows it as a habit', /id="hip-h03"/.test(html) && !/No habits in Mind yet/.test(html));
    r.check('and the others stay on offer for a second tap', same(rows(html), ['h01', 'h02', 'h04']), `(${rows(html)})`);
    run(s, `addReadyHabit('h01')`);
    r.check('and a third', same(rows(view(s)), ['h02', 'h04']) && /id="hip-h01"/.test(view(s)), `(${rows(view(s))})`);

    run(s, `go('home'); go('pillar', { pillar: 'mind' })`);
    r.check('on the next visit the pillar is just its habits', rows(view(s)).length === 0 && /id="hip-h03"/.test(view(s)));

    run(s, `go('pillar', { pillar: 'body' })`);
    r.check('a pillar that has habits offers nothing', rows(view(s)).length === 0 && !/No habits in/.test(view(s)));
  }

  r.section('home sets an empty pillar back');
  {
    const s = await onPath('nutrition');
    run(s, 'renderHome()');
    const chip = id => (new RegExp(`<div class="([^"]*)" id="hm-pc-${id}"`).exec(view(s)) || [])[1] || '';
    r.check('pillars with nothing in them are marked', ['mind', 'mastery', 'social', 'wealth'].every(id => /\bhm-pc-empty\b/.test(chip(id))), `(${chip('mind')})`);
    r.check('the one with habits is not', chip('body') !== '' && !/hm-pc-empty/.test(chip('body')), `(${chip('body')})`);
    const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
    r.check('and the mark dims them', /\.hm-pc-empty[^{]*\{[^}]*opacity:\s*0?\.\d+/.test(css));
    const all = await onPath('all');
    run(all, 'renderHome()');
    r.check('the complete path has none set back', !/hm-pc-empty/.test(view(all)));
  }

  r.section('a quest that cannot be finished is not offered');
  {
    const few = await onPath('nutrition');
    const full = await onPath('all');
    const days = Array.from({ length: 90 }, (_, i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
    const picks = (s, d) => JSON.parse(run(s, `JSON.stringify(getDailyQuests('${d}').map(function(q){return q.id}))`));
    const withIt = days.filter(d => picks(full, d).includes('q_all_pillars'));
    r.check('with a habit in every pillar it still comes up', withIt.length > 0, `(${withIt.length} of ${days.length} days)`);
    r.check('with empty pillars it never does', days.every(d => !picks(few, d).includes('q_all_pillars')));
    r.check('and there are still three quests', days.every(d => picks(few, d).length === 3 && new Set(picks(few, d)).size === 3));
    r.check('the other two that day are the same', withIt.every(d => picks(full, d).filter(q => q !== 'q_all_pillars').every(q => picks(few, d).includes(q))));
    r.check('every other day is untouched', days.filter(d => !withIt.includes(d)).every(d => same(picks(few, d), picks(full, d))));
  }

  r.section('a routine step whose habit is not in the list is a plain step');
  {
    const s = await onPath('fitness');   // has Meditate (h01), not Cold shower (h04)
    run(s, `renderHabits=function(){};`);
    const steps = JSON.parse(run(s, 'JSON.stringify(routines.morning)'));
    const cold = steps.findIndex(x => x.habitId === 'h04'), med = steps.findIndex(x => x.habitId === 'h01');
    r.check('the default routine still points at both', cold >= 0 && med >= 0, JSON.stringify(steps));
    const tap = runCatching(s, `toggleRoutineItem('morning', ${cold})`);
    r.check('tapping it does not throw', tap.ok, `(${tap.error})`);
    r.check('it ticks as a step', run(s, `isRoutineItemDone('morning', ${cold})`) === true);
    r.check('without inventing the habit', run(s, 'log.h04') === undefined && !ids(s).includes('h04'));
    run(s, `toggleRoutineItem('morning', ${cold})`);
    r.check('and unticks', run(s, `isRoutineItemDone('morning', ${cold})`) === false);

    run(s, `toggleRoutineItem('morning', ${med})`);
    r.check('a step whose habit is there still ticks the habit', run(s, 'log.h01.completedToday') === true && run(s, `isRoutineItemDone('morning', ${med})`) === true);

    const shown = () => { run(s, `_routineEditMode=false; renderRoutines('')`); return (view(s).match(/ · habit/g) || []).length; };
    const linkedNow = steps.concat(JSON.parse(run(s, 'JSON.stringify(routines.night)'))).filter(x => x.habitId && ids(s).includes(x.habitId)).length;
    r.check('only steps with a habit behind them are marked as one', shown() === linkedNow && linkedNow > 0, `(${shown()} marked, ${linkedNow} real)`);

    run(s, `toggleRoutineItem('morning', ${cold}); addReadyHabit('h04');`);
    r.check('once the habit is added the step follows it', run(s, `isRoutineItemDone('morning', ${cold})`) === false);
    run(s, `toggleRoutineItem('morning', ${cold})`);
    r.check('and ticks it', run(s, 'log.h04.completedToday') === true);
  }

  return r.finish();
};
