// A training program built from a described goal.
//
// The AI's reply is the least trustworthy thing in the app: it is text from a
// model, steered by text the person typed. So the tests are mostly about what
// is refused, and about what leaves the device in the first place.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'connect.js', 'workout.js', 'diet.js'];
const wait = ms => new Promise(r => setTimeout(r, ms));
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const aiCalls = s => s._fetches.filter(f => /arete-ai\.oskarsteinicke\.workers\.dev/.test(f.url));

function sb(store, reply) {
  const body = typeof reply === 'string' ? reply : JSON.stringify(reply || {});
  const s = createSandbox({
    files: FILES, store: Object.assign({ hvi_onboarded: 'true' }, store || {}),
    // Groq's shape; the Worker passes it straight through.
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: body } }] }), text: () => Promise.resolve(body) }),
  });
  run(s, `settings={units:'metric'}; curView='workoutAI'; habits=[]; log={}; journal={}; mealLog={}; sleepLog={}; weightLog={}; prs={};
          gamification={xp:0,level:1}; achievements=[];
          workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
          workoutMeta=JSON.parse(localStorage.getItem('hvi_workout_meta')||'{"activeProgram":"ppl","currentDayIndex":0}');
          track=function(){}; go=function(v){ _nav.push(v); curView=v; }; showToast=function(){}; reportError=function(){};
          startWorkoutTimer=function(){}; playSound=function(){}; haptic=function(){};
          AbortController=function(){ this.signal = {}; this.abort = function(){}; };`);
  return s;
}

const GOOD = { name: 'Soccer Strength', desc: 'Three days of strength and power for a field athlete.', days: [
  { name: 'Lower Power', focus: 'Legs and jumps', ex: [['squat', 5, 5], ['box_jump', 4, 5], ['leg_curl', 3, 10], ['calf_raise', 3, 15]] },
  { name: 'Upper', focus: 'Push and pull', ex: [['bench_press', 4, 6], ['barbell_row', 4, 6], ['ohp', 3, 8], ['pullup', 3, 8]] },
  { name: 'Full Body', focus: 'Speed', ex: [['leg_press', 3, 8], ['incline_db', 3, 10], ['lat_pulldown', 3, 10]] },
] };

module.exports = async function () {
  const r = createReporter('aiprogram');

  r.section('only what this app can run is kept');
  {
    const s = sb();
    const norm = v => JSON.parse(run(s, `JSON.stringify(normalizeAIProgram(${JSON.stringify(v)}, 'get strong for soccer'))`));
    const p = norm(JSON.stringify(GOOD));
    r.check('a good reply becomes a program', p && p.days.length === 3 && p.name === 'Soccer Strength', JSON.stringify(p && p.name));
    r.check('each day lists its exercises', p.days[0].ex.join() === 'squat,box_jump,leg_curl,calf_raise', p.days[0].ex.join());
    r.check('with the sets and reps it prescribed', p.days[0].rx.squat.join('x') === '5x5' && p.days[1].rx.ohp.join('x') === '3x8');
    r.check('it is marked as built from a goal, and remembers the goal', p.ai === true && p.goal === 'get strong for soccer');

    const messy = norm('Here is your program:\n```json\n' + JSON.stringify({ name: 'X', days: [
      { name: 'A', ex: [['squat', 5, 5], ['dragon_flag_9000', 3, 10], ['bench_press', 4, 6], ['squat', 3, 3], ['__proto__', 3, 3], ['constructor', 3, 3]] },
      { name: 'B', ex: [['made_up', 3, 10]] },
      { name: 'C', ex: [{ id: 'ohp', sets: 99, reps: -4 }, { exercise_id: 'pullup', sets: 'many', reps: null }] },
    ] }) + '\n```');
    r.check('JSON wrapped in prose or a code fence is still read', !!messy);
    r.check('an exercise it invented is dropped', messy.days[0].ex.join() === 'squat,bench_press', messy.days[0].ex.join());
    r.check('so is a repeat, and anything that is not really an exercise', !messy.days[0].ex.includes('__proto__') && !messy.days[0].ex.includes('constructor'));
    r.check('a day left with nothing real is dropped', messy.days.length === 2 && messy.days[1].name === 'C', messy.days.map(d => d.name).join());
    r.check('absurd numbers are pulled into range', messy.days[1].rx.ohp.join('x') === '6x1', messy.days[1].rx.ohp.join('x'));
    r.check('missing numbers fall back to the exercise\'s own', messy.days[1].rx.pullup.join('x') === run(s, `EXERCISES.pullup.ds + 'x' + EXERCISES.pullup.dr`));

    const big = norm({ name: 'N'.repeat(300), desc: '<img src=x onerror=alert(1)>' + 'd'.repeat(400),
      days: Array.from({ length: 12 }, (_, i) => ({ name: 'Day <b>' + i + '</b>' + 'x'.repeat(80), focus: 'f'.repeat(200),
        ex: Object.keys(GOOD.days[0].ex).map(() => 0) && [['squat', 3, 5], ['bench_press', 3, 5], ['ohp', 3, 5], ['pullup', 3, 5], ['barbell_row', 3, 5], ['leg_press', 3, 5], ['leg_curl', 3, 5], ['calf_raise', 3, 5], ['lat_pulldown', 3, 5], ['incline_db', 3, 5], ['box_jump', 3, 5], ['cable_fly', 3, 5]] })) });
    r.check('a week has at most seven days', big.days.length === 7, `(${big.days.length})`);
    r.check('a day has at most ten exercises', big.days[0].ex.length === 10, `(${big.days[0].ex.length})`);
    r.check('names and descriptions are cut to length', big.name.length <= 40 && big.desc.length <= 160 && big.days[0].name.length <= 24 && big.days[0].focus.length <= 44);
    r.check('and carry no markup', !/[<>]/.test(big.name + big.desc + big.days[0].name));

    for (const [label, bad] of [['not JSON at all', 'I cannot help with that.'], ['no days', '{"name":"x"}'], ['days that are not days', '{"days":[1,2,"x"]}'],
      ['only invented exercises', JSON.stringify({ days: [{ name: 'A', ex: [['nope', 3, 3], ['also_nope', 3, 3]] }] })], ['an array', '[]'], ['nothing', '']]) {
      r.check(`refused: ${label}`, run(s, `normalizeAIProgram(${JSON.stringify(bad)}, 'x')`) === null);
    }
  }

  r.section('the equipment you chose is a hard limit');
  {
    const s = sb({});
    const reply = JSON.stringify({ name: 'Home Plan', desc: 'x', days: [
      { name: 'A', focus: 'Push', ex: [['pushup', 3, 12], ['bench_press', 4, 6], ['db_curl', 3, 10], ['plank', 3, 30]] },
      { name: 'B', focus: 'Bar only', ex: [['squat', 5, 5], ['deadlift', 3, 5], ['pullup', 3, 6]] },
    ] });
    const at = eq => JSON.parse(run(s, `JSON.stringify(normalizeAIProgram(${JSON.stringify(reply)}, 'train at home', exercisesFor('${eq}')))`));
    const home = at('bodyweight'), db = at('dumbbells'), gym = at('gym');
    r.check('with no equipment, a reply that slips in weights loses them', home.days[0].ex.join() === 'pushup,plank', home.days[0].ex.join());
    r.check('and a day left with one exercise is dropped', home.days.length === 1, `(${home.days.length} days)`);
    r.check('with dumbbells the curl stays and the barbell goes', db.days[0].ex.join() === 'pushup,db_curl,plank', db.days[0].ex.join());
    r.check('with a full gym all of it stays', gym.days[0].ex.length === 4 && gym.days[1].ex.length === 3);
  }

  r.section('what is sent is the goal and the four choices');
  {
    const s = sb({
      hvi_user_name: 'Oskar', hvi_weight_log: JSON.stringify({ [dk(1)]: 79.4 }),
      hvi_workout_log: JSON.stringify({ [dk(2)]: { programId: 'ppl', dayIndex: 0, exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 92.5, reps: 5, completed: true }] }] } }),
    });
    const msgs = JSON.parse(run(s, `JSON.stringify(aiProgramMessages('Stronger for soccer. Bad left knee.', { days: 3, minutes: 45, equipment: 'dumbbells', level: 'new' }))`));
    const all = msgs.map(m => m.content).join('\n');
    r.check('the goal is in it', /Stronger for soccer\. Bad left knee\./.test(all));
    r.check('so are the choices', /Exactly 3 training days/.test(all) && /45 minutes/.test(all) && /Dumbbells and a bench only/.test(all) && /New to training/.test(all));
    const ids = JSON.parse(run(s, 'JSON.stringify(Object.keys(EXERCISES))'));
    const listed = eq => JSON.parse(run(s, `JSON.stringify(aiProgramMessages('Get stronger all over', { days: 3, minutes: 45, equipment: '${eq}', level: 'some' }))`))[0].content;
    const gym = listed('gym'), home = listed('bodyweight');
    r.check('with a full gym it is given every exercise the app has, by id', ids.every(id => gym.includes('\n' + id + '|')), `(${ids.filter(id => !gym.includes('\n' + id + '|')).slice(0, 3).join()})`);
    r.check('with dumbbells, nothing that needs a barbell, cable or machine', !/\n(bench_press|squat|deadlift|lat_pulldown|leg_press|cable_fly)\|/.test(all) && /\ndb_row\|/.test(all) && /\npushup\|/.test(all));
    r.check('with no equipment, nothing that needs a weight', !/\n(db_curl|goblet_squat|bench_press|squat)\|/.test(home) && /\npushup\|/.test(home) && /\nplank\|/.test(home));
    const tagged = JSON.parse(run(s, 'JSON.stringify(EX_BODYWEIGHT.concat(EX_DUMBBELL))'));
    r.check('every exercise tagged for home training is a real one', tagged.every(id => ids.includes(id)), `(${tagged.filter(id => !ids.includes(id)).join()})`);
    r.check('and none is tagged twice', new Set(tagged).size === tagged.length, `(${tagged.filter((id, i) => tagged.indexOf(id) !== i).join()})`);
    r.check('there is enough to build a week from either list', run(s, `exercisesFor('bodyweight').length`) >= 20 && run(s, `exercisesFor('dumbbells').length`) >= 40);
    r.check('it is told to use only those', /Use only exercise ids from the list/.test(all) && /Never invent an id/.test(all));
    r.check('nothing from the logs goes with it', !/Oskar|79\.4|92\.5/.test(all), '(name, bodyweight or a lift leaked into the prompt)');
    const long = JSON.parse(run(s, `JSON.stringify(aiProgramMessages(${JSON.stringify('x'.repeat(5000))}, { days: 3, minutes: 45, equipment: 'gym', level: 'some' }))`));
    r.check('a very long goal is cut before it is sent', long[1].content.length <= 420, `(${long[1].content.length})`);
  }

  r.section('it asks before it sends');
  {
    const s = sb({}, GOOD);
    // The goal is read from the text box, as it is on the page.
    run(s, `document.getElementById('aip-goal').value = 'Stronger and faster for soccer'; generateAIProgram();`);
    await wait(40);
    r.check('without permission nothing is sent', aiCalls(s).length === 0, `(${aiCalls(s).length} sent)`);
    r.check('and the person is asked', run(s, 'typeof _aiConsentThen') === 'function');
    run(s, `document.getElementById('aip-goal').value = 'legs'; _aiConsentThen = null; generateAIProgram();`);
    r.check('a goal of one word is asked for more, not sent', /a little more/.test(run(s, '_aiProgState().error')) && aiCalls(s).length === 0);
  }

  r.section('from a goal to a program you can train');
  {
    const s = sb({ hvi_ai_consent: 'yes',
      // Squat was last done for 8s; the new program says fives.
      hvi_workout_log: JSON.stringify({ [dk(3)]: { programId: 'ppl', dayIndex: 2, exercises: [{ exerciseId: 'squat', sets: [{ weight: 90, reps: 8, completed: true }] }] } }) }, GOOD);
    run(s, `document.getElementById('aip-goal').value = 'Stronger and faster for soccer'; setAIProgramChoice('days', 3); generateAIProgram();`);
    await wait(80);
    r.check('one request went out', aiCalls(s).length === 1, `(${aiCalls(s).length})`);
    const sent = JSON.parse(aiCalls(s)[0].opts.body);
    r.check('to a model the AI service still runs', sent.model === run(s, 'GROQ_MODEL') && !/llama-3\.3-70b/.test(sent.model), `(${sent.model})`);
    r.check('asking for JSON, with room for a whole program', sent.response_format && sent.response_format.type === 'json_object' && sent.max_tokens >= 2000, JSON.stringify({ rf: sent.response_format, mt: sent.max_tokens }));
    r.check('a draft comes back for review, not saved yet', run(s, '_aiProgState().draft.name') === 'Soccer Strength' && run(s, `(LS.get('hvi_custom_programs', []) || []).length`) === 0);
    const preview = run(s, `renderWorkoutAI(); document.getElementById('view').innerHTML`) || '';
    r.check('the preview shows every day and its prescription', /Lower Power/.test(preview) && /Full Body/.test(preview) && /5 × 5/.test(preview) && /Use this program/.test(preview));
    r.check('and says what it was built for', /Built for: Stronger and faster for soccer/.test(preview));

    run(s, 'useAIProgram()');
    const saved = JSON.parse(run(s, `JSON.stringify(LS.get('hvi_custom_programs', []))`));
    r.check('using it saves it with your programs', saved.length === 1 && saved[0].name === 'Soccer Strength' && saved[0].days.length === 3);
    r.check('and makes it the active one, at day 1', run(s, 'workoutMeta.activeProgram') === saved[0].id && run(s, 'workoutMeta.currentDayIndex') === 0);
    r.check('the choices are remembered for next time', JSON.parse(run(s, `JSON.stringify(LS.get('hvi_ai_program_last', {}))`)).days === 3);

    run(s, `curView = 'workoutActive'; renderWorkoutActive()`);
    const today = JSON.parse(run(s, `JSON.stringify(workoutLog[today()])`));
    const sq = today.exercises.find(e => e.exerciseId === 'squat');
    r.check('the first session has the prescribed sets', sq && sq.sets.length === 5, `(${sq && sq.sets.length} sets)`);
    r.check('at the prescribed reps, not last month\'s', sq.sets.every(x => x.reps === 5), `(${sq.sets.map(x => x.reps).join()})`);
    r.check('starting from the weight last used', sq.sets[0].weight === 90, `(${sq.sets[0].weight})`);
    const html = run(s, `curView='workout'; renderWorkout(); document.getElementById('view').innerHTML`) || '';
    r.check('the workout tab shows the prescription', /Squat[\s\S]{0,120}5 × 5/.test(html), '(no sets x reps on the card)');
  }

  r.section('changing a draft by hand');
  {
    const s = sb({ hvi_ai_consent: 'yes' }, GOOD);
    run(s, `document.getElementById('aip-goal').value = 'Stronger and faster for soccer'; generateAIProgram();`);
    await wait(80);
    run(s, `editAIProgram()`);
    r.check('it opens in the hand builder', run(s, 'curView') === 'workoutBuilder' && run(s, 'builderProg.name') === 'Soccer Strength');
    r.check('still a draft until it is saved', run(s, `(LS.get('hvi_custom_programs', []) || []).length`) === 0 && run(s, '!!_aiProgState().draft'));
    // Drop the last exercise of day 1, then save.
    run(s, `builderProg.days[0].ex.pop(); saveCustomProgram();`);
    const saved = JSON.parse(run(s, `JSON.stringify(LS.get('hvi_custom_programs', []))`));
    r.check('saving keeps the change', saved.length === 1 && saved[0].days[0].ex.join() === 'squat,box_jump,leg_curl', saved[0] && saved[0].days[0].ex.join());
    r.check('and the sets and reps of what is left', saved[0].days[0].rx.squat.join('x') === '5x5');
    r.check('the draft is finished with, so it cannot be saved a second time', run(s, '_aiProgState().draft') === null);
    // Belt and braces: the same program handed in again replaces, never duplicates.
    run(s, `_aiProgState().draft = JSON.parse(JSON.stringify(LS.get('hvi_custom_programs', [])[0])); useAIProgram();`);
    r.check('using a program that is already saved does not add a copy', run(s, `(LS.get('hvi_custom_programs', []) || []).length`) === 1, `(${run(s, `(LS.get('hvi_custom_programs', []) || []).length`)})`);
  }

  r.section('when the reply is no good');
  {
    const s = sb({ hvi_ai_consent: 'yes' }, 'Sorry, I can only help with questions about cooking.');
    run(s, `document.getElementById('aip-goal').value = 'Stronger and faster for soccer'; generateAIProgram();`);
    await wait(80);
    r.check('nothing is saved or shown as a program', run(s, '_aiProgState().draft') === null && run(s, `(LS.get('hvi_custom_programs', []) || []).length`) === 0);
    r.check('and it says so plainly', /did not come back as a usable program/.test(run(s, '_aiProgState().error')), run(s, '_aiProgState().error'));
    r.check('ready to try again', run(s, '_aiProgState().busy') === false);
    const form = run(s, `renderWorkoutAI(); document.getElementById('view').innerHTML`) || '';
    r.check('with what they wrote still in the box', /Stronger and faster for soccer<\/textarea>/.test(form));
  }

  r.section('built-in programs are untouched');
  {
    const s = sb({});
    run(s, `curView = 'workoutActive'; renderWorkoutActive()`);
    const bench = JSON.parse(run(s, `JSON.stringify(workoutLog[today()].exercises[0])`));
    r.check('no prescription means the exercise\'s own sets and reps', bench.exerciseId === 'bench_press' &&
      bench.sets.length === run(s, 'EXERCISES.bench_press.ds') && bench.sets[0].reps === run(s, 'EXERCISES.bench_press.dr'), JSON.stringify(bench.sets.length));
    const tab = run(s, `curView = 'workout'; renderWorkout(); document.getElementById('view').innerHTML`) || '';
    r.check('Create on the Workout tab opens the goal builder', /onclick="go\('workoutAI'\)">\+ Create/.test(tab), '(Create still opens the hand builder)');
    const form = run(s, `_aiProgState().draft = null; renderWorkoutAI(); document.getElementById('view').innerHTML`) || '';
    r.check('which still leaves a way to build by hand, without AI', /initBuilder\(\);go\('workoutBuilder'\)[^>]*>Build it by hand instead/.test(form));
    r.check('the picker offers the new way in first', /Build one from your goal[\s\S]*Push \/ Pull \/ Legs/.test(run(s, `renderWorkoutPicker(); document.getElementById('view').innerHTML`) || ''));
  }

  // Found by loading the real app on this screen: it fell back to Home.
  r.section('the builder is a screen like any other');
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
    const valid = (src.match(/const validViews = \[([^\]]*)\]/) || [])[1] || '';
    r.check('reopening the app on it brings it back', /'workoutAI'/.test(valid), '(not in the list of screens a reload restores, so it reopens on Home)');
    r.check('it has a renderer', /workoutAI:\s*renderWorkoutAI/.test(src));
    r.check('and sits under the Workout tab', /workoutAI:\s*'workout'/.test(src));
  }

  return r.finish();
};
