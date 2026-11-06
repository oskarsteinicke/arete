// A new user's first five minutes, as walked through on a fresh install:
// onboarding, the tour, the first log and the first look at home. Each section
// is something that walk turned up.
const fs = require('fs');
const path = require('path');
const { createSandbox, run, createReporter, APP } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

// Every z-index a rule in style.css sets, with the selector it belongs to.
function cssLayers(css) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const z = /z-index\s*:\s*(\d+)/.exec(m[2]);
    if (z) out.push({ sel: m[1].trim(), z: +z[1] });
  }
  return out;
}

module.exports = async function () {
  const r = createReporter('welcome');

  // Log anything asks for AI permission from inside its own sheet. The
  // question opened at 9000, under the sheet at 9998, so it could be neither
  // seen nor answered, and "Read it" only opened it underneath again.
  r.section('the AI question opens above the sheet that asked it');
  {
    const app = read('app.js');
    const fn = app.slice(app.indexOf('function showAIConsent()'), app.indexOf('function answerAIConsent('));
    const zc = +((/z-index:\s*(\d+)/.exec(fn) || [])[1] || 0);
    const layers = cssLayers(read('style.css'));
    const sheet = layers.find(l => /(^|,)\s*\.rd-overlay\s*$/.test(l.sel));
    r.check('the Log anything sheet has a layer to compare with', !!sheet, '(no .rd-overlay rule)');
    r.check('the question sits above that sheet', sheet && zc > sheet.z, `(question ${zc}, sheet ${sheet && sheet.z})`);
    const above = layers.filter(l => l.z >= zc && !/#boot\b/.test(l.sel));
    r.check('and above every other layer except the loading screen', zc > 0 && above.length === 0,
      `(${above.map(l => l.sel + ' ' + l.z).join('; ')})`);
    const scripts = fs.readdirSync(APP).filter(f => /\.js$/.test(f) && f !== 'service-worker.js');
    const inline = [];
    for (const f of scripts) {
      const src = f === 'app.js' ? app.replace(fn, '') : read(f);
      for (const m of src.matchAll(/z-index:\s*(\d+)/g)) if (+m[1] >= zc) inline.push(f + ' ' + m[1]);
    }
    r.check('including layers the scripts draw themselves', inline.length === 0, `(${inline.join(', ')})`);
  }

  // Gemini 2.5 spends tokens thinking before it answers, out of the same
  // allowance. At 120 tokens the daily focus came back as "Your habits are",
  // was cached, and stayed on home for the rest of the day.
  r.section("the coach's focus is a whole answer");
  {
    const mk = (reply, store) => {
      const s = createSandbox({
        files: ['data.js', 'app.js', 'connect.js', 'diet.js'],
        store: Object.assign({ hvi_onboarded: 'true', hvi_ai_consent: 'yes' }, store || {}),
        fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reply), text: () => Promise.resolve('') }),
      });
      run(s, `settings={}; curView='home'; habits=[]; log={}; journal={}; workoutLog={}; workoutMeta={}; mealLog={}; sleepLog={};
              weightLog={}; prs={}; gamification={xp:0,level:1}; achievements=[]; goals=[]; tdeeProfile=null;
              meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
              dietMeta={dailyGoals:{calories:2200,protein:160,carbs:220,fat:70}};
              track=function(){}; go=function(){}; isPremium=function(){ return true; };`);
      return s;
    };
    const ask = async (s, force) => {
      run(s, `_r = null; _e = null; fetchCoachInsight(${!!force}).then(function (t) { _r = t; }).catch(function (e) { _e = e.message; });`);
      await wait(30);
      return { text: run(s, '_r'), err: run(s, '_e') };
    };
    const reply = (text, finish) => ({ candidates: [{ finishReason: finish, content: { parts: [{ text }] } }] });
    const calls = s => s._fetches.filter(f => /arete-ai\.oskarsteinicke\.workers\.dev/.test(f.url));

    const ok = mk(reply('Your readiness is 66. Eat a protein-rich lunch and train as planned.', 'STOP'));
    const a = await ask(ok, true);
    r.check('a finished answer is shown', /train as planned\.$/.test(a.text || ''), `(${a.text} ${a.err})`);
    const body = JSON.parse((calls(ok)[0] || {}).opts?.body || calls(ok)[0]?.body || '{}');
    const gc = body.generationConfig || {};
    r.check('the model is told not to think first', gc.thinkingConfig && gc.thinkingConfig.thinkingBudget === 0, JSON.stringify(gc));
    r.check('and has room for two or three sentences', gc.maxOutputTokens >= 200, `(${gc.maxOutputTokens})`);

    const cut = mk(reply('Your habits are', 'MAX_TOKENS'));
    const b = await ask(cut, true);
    r.check('a reply cut off mid-sentence is not shown', !b.text && !!b.err, `(${b.text})`);
    r.check('and not kept for the day', run(cut, `localStorage.getItem('hvi_coach_insight')`) === null);

    const half = mk(reply('Eat 40 g of protein at lunch. Then walk for', 'MAX_TOKENS'));
    const c = await ask(half, true);
    r.check('a reply cut off after a full sentence keeps that sentence', c.text === 'Eat 40 g of protein at lunch.', `(${c.text})`);

    const T = run(ok, 'today()');
    const stale = mk(reply('Sleep is at 7h. Keep tonight the same.', 'STOP'),
      { hvi_coach_insight: JSON.stringify({ date: T, text: 'Your readiness is' }) });
    const card = run(stale, 'coachInsightCardHTML()') || '';
    r.check('a fragment already saved today is not shown again', !/Your readiness is/.test(card) && /Reading your day/.test(card), card.slice(0, 200));
    const d = await ask(stale, false);
    r.check('it is fetched afresh', calls(stale).length >= 1 && /Keep tonight the same\.$/.test(d.text || ''), `(${calls(stale).length} calls, ${d.text})`);

    const kept = mk(reply('Something new.', 'STOP'),
      { hvi_coach_insight: JSON.stringify({ date: T, text: 'Walk after dinner tonight.' }) });
    const e = await ask(kept, false);
    r.check("a whole answer from today is reused without asking again", e.text === 'Walk after dinner tonight.' && calls(kept).length === 0,
      `(${e.text}, ${calls(kept).length} calls)`);
  }

  // The tour read its step from a local that never moved, so every card said
  // "1 of 4: Track your habits" while Next changed the screen behind it.
  r.section('the tour moves through its cards');
  {
    const s = createSandbox({ files: ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'profile.js'], store: { hvi_onboarded: 'true' } });
    run(s, `settings={notifications:true}; curView='home'; track=function(){}; go=function(v){ _nav.push(v); curView=v; };`);
    const card = () => s._els['tour-overlay'].innerHTML;
    run(s, 'showFeatureTour()');
    r.check('it opens on the first card', /1 of 4/.test(card()), card().slice(0, 120));
    r.check('which leads with the + button', /Log anything/.test(card()) && /Tap \+/.test(card()));
    run(s, 'nextTourStep()');
    r.check('Next shows the second card', /2 of 4/.test(card()) && /Your habits/.test(card()), card().slice(0, 160));
    r.check('and opens the screen it talks about', s._nav[s._nav.length - 1] === 'habits', `(${s._nav.join(' ')})`);
    run(s, 'nextTourStep()');
    r.check('then the third', /3 of 4/.test(card()) && s._nav[s._nav.length - 1] === 'workout', `(${s._nav.join(' ')})`);
    run(s, 'nextTourStep()');
    r.check('the last card says Done', /4 of 4/.test(card()) && /Done/.test(card()));
    r.check('no card tells them to add habits they already have', !/to add daily habits/.test(read('profile.js')));
    run(s, 'nextTourStep()');
    r.check('Done ends it for good', s.localStorage._d.hvi_tour_done === 'true');
  }

  r.section('a guest has no sync dot');
  {
    const s = createSandbox({ files: ['data.js', 'app.js'], store: {} });
    run(s, 'setSyncStatus("ok")');
    r.check('nothing says "Synced" without an account', (s._els['sync-dot'] || {}).className !== 'sync-ok',
      `(${(s._els['sync-dot'] || {}).className})`);
    s.localStorage.setItem('hvi_session', JSON.stringify({ access_token: 'x.e30.y', user: { id: 'u1' } }));
    run(s, 'setSyncStatus("ok")');
    r.check('a signed-in user still sees it', s._els['sync-dot'].className === 'sync-ok');
  }

  r.section('the + menu is solid');
  {
    const rule = cssLayers(read('style.css')).length && /\.quick-log-item\s*\{([^}]*)\}/.exec(read('style.css'));
    r.check('its buttons use the solid raised colour', rule && /background:\s*var\(--raised\)/.test(rule[1]), rule && rule[1].trim().slice(0, 120));
    const tokens = read('tokens.css');
    const raised = [...tokens.matchAll(/--raised:\s*([^;]+);/g)].map(m => m[1].trim());
    r.check('which is opaque in every theme', raised.length >= 3 && raised.every(v => !/rgba|transparent/.test(v)), `(${raised.join(' | ')})`);
  }

  // The starter habits include "Sleep 7-9 hours" and a workout habit. Linking
  // existed, but only by hand in the habit editor, so a new user ticked by
  // hand what the app had just been told.
  r.section('a fresh install links the habits the app can see happen');
  {
    const mk = store => {
      const s = createSandbox({ files: ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'profile.js'], store });
      run(s, `settings={}; curView='home'; track=function(){}; go=function(v){ _nav.push(v); curView=v; };
              launchConfetti=function(){}; showFeatureTour=function(){};`);
      return s;
    };
    const s = mk({});
    await run(s, 'init()');
    const links = JSON.parse(s.localStorage._d.hvi_habit_links || 'null') || {};
    const names = JSON.parse(run(s, 'JSON.stringify(DEFAULT_HABITS)'));
    const name = id => (names.find(h => h.id === id) || {}).name || '';
    r.check('the sleep habit ticks from a logged night', links.h08 === 'sleep' && /^Sleep 7/.test(name('h08')), JSON.stringify(links));
    r.check('the workout habit ticks from a finished session', links.h05 === 'workout' && /workout/i.test(name('h05')), JSON.stringify(links));
    r.check('the water habit ticks from reaching the water goal', links.h07 === 'water' && /water/i.test(name('h07')), JSON.stringify(links));

    run(s, `playSound=function(){}; haptic=function(){}; awardXP=function(){}; checkDailyQuests=function(){}; checkAchievements=function(){};
            renderHabits=function(){}; updateHabitUI=function(){}; _connectToast=function(){};
            sleepLog[today()] = { hours: 7.5 }; window.Arete.emit('sleep:logged', { hours: 7.5 });`);
    r.check('so logging 7.5 hours ticks it', run(s, 'log.h08.completedToday') === true);

    const old = mk({ hvi_onboarded: 'true', hvi_habits: JSON.stringify([{ id: 'h08', name: 'Sleep 7–9 hours (log prior night)' }]) });
    await run(old, 'init()');
    r.check('someone who already has habits is left as they were', old.localStorage._d.hvi_habit_links === undefined,
      `(${old.localStorage._d.hvi_habit_links})`);
  }

  r.section('onboarding: an even path grid and numbers that look editable');
  {
    const s = createSandbox({ files: ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'profile.js'], store: {} });
    run(s, `settings={}; track=function(){}; go=function(){};`);
    run(s, 'renderOnboarding(3)');
    const grid = s._els['ob-overlay'].innerHTML;
    const cards = grid.match(/class="ob-goal-card/g) || [];
    r.check('four cards, none spanning a row alone', cards.length === 4 && !/ob-goal-card[^"]*\bfull\b/.test(grid), `(${cards.length})`);
    r.check('the complete path, chosen by default, comes first', grid.indexOf('Pursue arete') < grid.indexOf('Forge discipline') && /ob-goal-card active/.test(grid));
    run(s, 'renderOnboarding(5)');
    const m = s._els['ob-overlay'].innerHTML;
    r.check('the targets screen says the numbers can be changed', /Tap a number to change it/.test(m));
    r.check('and opens a number keypad', (m.match(/inputmode="numeric"/g) || []).length === 2);
  }

  return r.finish();
};
