// The coach can change the user's data, so what it changes has to be what
// they asked for.
//
// It was told to remove a habit "using the habit id from the list above", but
// that list carried no ids. The only id it had ever seen was the example, h07,
// which is a real default habit — "Drink 2L+ water". A guess there deleted a
// habit nobody mentioned, streak and all, with no undo.
const { createSandbox, run, createReporter } = require('./harness');

const ALL = ['data.js', 'app.js', 'connect.js', 'premium.js', 'workout.js', 'diet.js',
             'integrations.js', 'profile.js', 'social.js', 'coach.js'];

const FRESH = `
  settings={}; curView='home'; track=function(){}; history={pushState:function(){}};
  setTimeout=function(){};
  habits=DEFAULT_HABITS.slice(); log={};
  habits.forEach(h => log[h.id] = {streak:12,lastCompletedDate:'',completedToday:false});
  journal={}; meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
  workoutLog={}; workoutMeta={activeProgram:'ppl',currentDayIndex:0,lastWorkoutDate:''};
  mealLog={}; dietMeta={dailyGoals:{calories:2000,protein:150,carbs:200,fat:60}};
  weightLog={}; sleepLog={}; prs={}; achievements=[]; challenges=[]; goals=[];
  gamification={xp:0,level:1,pillarXP:{}}; routines={}; routineLog={};
  habitLinks={}; tdeeProfile=null; customPrograms={}; integrations={};
`;

function fresh(extra) {
  const s = createSandbox({ files: ALL, store: { hvi_onboarded: 'true' } });
  run(s, FRESH);
  if (extra) run(s, extra);
  return s;
}

const act = (s, payload) =>
  run(s, `_executeCoachAction({ type: 'remove_habit', payload: ${JSON.stringify(payload)} })`);
const names = s => run(s, `habits.map(h => h.name)`);
const has = (s, id) => run(s, `habits.some(h => h.id === ${JSON.stringify(id)})`);
const streak = (s, id) => run(s, `log[${JSON.stringify(id)}] ? log[${JSON.stringify(id)}].streak : null`);

module.exports = function () {
  const r = createReporter('coach');

  r.section('the coach is given what it is told to use');
  {
    const s = fresh();
    const prompt = run(s, 'buildCoachSystemPrompt()');
    const ids = run(s, 'habits.map(h => h.id)');
    r.check('every habit id is in the prompt', ids.every(id => prompt.includes(id)),
      `(missing ${JSON.stringify(ids.filter(id => !prompt.includes(id)))})`);

    const progIds = run(s, 'allPrograms().map(p => p.id)');
    r.check('every program id is in the prompt', progIds.every(id => prompt.includes(`id: ${id}`)),
      `(missing ${JSON.stringify(progIds.filter(id => !prompt.includes(`id: ${id}`)))})`);

    // An example the model can copy verbatim must not also be a valid target.
    const examples = [...prompt.matchAll(/\[\[ACTION:(remove_habit|switch_program):(\{.*?\})\]\]/g)]
      .map(m => m[2]);
    const realIds = new Set([...ids, ...progIds]);
    const live = examples.filter(e => [...e.matchAll(/"id":"([^"]*)"/g)].some(m => realIds.has(m[1])));
    r.check('no example action names a real habit or program', live.length === 0,
      `(copyable: ${live.join(' ')})`);
  }

  // The failure as it happened: the example id, with nothing to check it against.
  r.section('an id on its own deletes nothing');
  {
    const s = fresh();
    const before = names(s).length;
    const res = act(s, { id: 'h07' });
    r.check('the water habit survives', has(s, 'h07'), `(removed; reply was ${JSON.stringify(res)})`);
    r.check('and keeps its streak', streak(s, 'h07') === 12, `(streak ${streak(s, 'h07')})`);
    r.check('nothing else was removed either', names(s).length === before);
    r.check('and the user is told', typeof res === 'string' && res.length > 0, `(${res})`);
  }

  r.section('an id that disagrees with the name deletes nothing');
  {
    // Right habit named, wrong id copied: the model's two claims conflict, so
    // neither is trusted.
    const s = fresh();
    const res = act(s, { id: 'h07', name: 'Cold shower' });
    r.check('water survives', has(s, 'h07'));
    r.check('cold shower survives', has(s, 'h04'), `(${res})`);
  }

  r.section('a matching id and name removes exactly that habit');
  {
    const s = fresh();
    const before = names(s).length;
    const res = act(s, { id: 'h04', name: 'Cold shower' });
    r.check('it is gone', !has(s, 'h04'), `(${res})`);
    r.check('its log entry is gone', streak(s, 'h04') === null);
    r.check('one habit removed, no more', names(s).length === before - 1);
    r.check('water untouched', has(s, 'h07') && streak(s, 'h07') === 12);
    r.check('the reply names it', /Cold shower/.test(res || ''), `(${res})`);
    r.check('it persisted', !JSON.parse(s.localStorage._d.hvi_habits).some(h => h.id === 'h04'));
  }

  r.section('a name alone works when it is unambiguous');
  {
    const s = fresh();
    const before = names(s).length;
    // What the model sees and what the user says is the name; small typographic
    // drift (case, an en dash typed as a hyphen) must not defeat it.
    const res = act(s, { name: 'sleep 7-9 hours (log prior night)' });
    r.check('matched despite case and dash', !has(s, 'h08'), `(${res})`);
    r.check('nothing else removed', names(s).length === before - 1);
  }

  r.section('a partial name never matches');
  {
    const s = fresh();
    const before = names(s).length;
    const res = act(s, { name: 'water' });
    r.check('nothing removed', names(s).length === before, `(${res})`);
  }

  r.section('duplicate names need the id to choose');
  {
    const s = fresh(`
      habits.push({ id: 'cu_1', name: 'Stretch', category: 'fitness' });
      habits.push({ id: 'cu_2', name: 'Stretch', category: 'health' });
      log.cu_1 = { streak: 3 }; log.cu_2 = { streak: 40 };
    `);
    const before = names(s).length;
    const res = act(s, { name: 'Stretch' });
    r.check('name alone removes neither', names(s).length === before, `(${res})`);
    act(s, { id: 'cu_1', name: 'Stretch' });
    r.check('with the id, only that one goes', !has(s, 'cu_1') && has(s, 'cu_2'));
    r.check('the other keeps its 40-day streak', streak(s, 'cu_2') === 40);
  }

  r.section('replies never show an internal id');
  {
    const s = fresh();
    const replies = [
      act(s, { id: 'zz_unknown' }),
      act(s, { id: 'h07', name: 'Cold shower' }),
      act(s, { name: 'Not a habit' }),
    ];
    const leaked = replies.filter(t => /\b(h\d\d|cu_\w+|zz_\w+)\b/.test(t || ''));
    r.check('no ids in user-facing text', leaked.length === 0, `(${JSON.stringify(leaked)})`);
  }

  return r.finish();
};
