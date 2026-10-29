// Sleep: hours are derived from bedtime and wake, and the daily prompt.
const { createSandbox, makeEl, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js'];

// The shim's getElementById invents an element for any id and querySelector
// invents one for any selector, so "is a modal on screen?" cannot be asked
// without a real presence model. Give the overlay ids one: only what was
// actually appended to body counts as open. Everything else still auto-vivifies,
// which is what the inputs inside the modal need.
const PRESENCE = `
  _open = {};
  const _get = document.getElementById.bind(document);
  const _overlay = id => /^(sleep-prompt|weekly-recap-modal|premium-modal|ob-overlay)$/.test(id);
  document.getElementById = function (id) { return _overlay(id) ? (_open[id] || null) : _get(id); };
  document.querySelector = function () { return null; };
  document.body.appendChild = function (el) {
    if (el && el.id) { _open[el.id] = el; el.remove = function () { delete _open[el.id]; }; }
  };
  _emits = [];
  window.Arete = { emit: function (n, d) { _emits.push(n); }, on: function () {} };
`;

function sb(store) {
  const s = createSandbox({ files: FILES, store: Object.assign({ hvi_onboarded: 'true' }, store || {}) });
  run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
          habits=[]; sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
          reportError=function(){};`);
  run(s, PRESENCE);
  return s;
}
const t = s => run(s, 'today()');
const isOpen = s => run(s, `!!document.getElementById('sleep-prompt')`);
const emits = s => run(s, `_emits.join(',')`);

module.exports = function () {
  const r = createReporter('sleep');

  r.section('duration is computed from the two times');
  {
    const s = sb();
    const d = (b, w) => run(s, `sleepDuration('${b}','${w}')`);
    r.check('a night inside one day', d('01:00', '08:00') === 7);
    // The normal case: bedtime is yesterday, wake is today. Subtracting gives
    // a negative number unless midnight is handled.
    r.check('23:00 to 07:00 is 8h', d('23:00', '07:00') === 8, `(got ${d('23:00','07:00')})`);
    r.check('22:30 to 06:15 is 7.75h', d('22:30', '06:15') === 7.8, `(got ${d('22:30','06:15')})`);
    r.check('half hours survive', d('23:30', '07:00') === 7.5);
    r.check('an afternoon nap', d('13:00', '15:30') === 2.5);
    r.check('identical times are zero, not a full day', d('23:00', '23:00') === 0);
  }

  r.section('bad input is refused, not guessed');
  {
    const s = sb();
    const d = (b, w) => run(s, `sleepDuration(${JSON.stringify(b)},${JSON.stringify(w)})`);
    r.check('missing wake', d('23:00', '') === null);
    r.check('missing bedtime', d('', '07:00') === null);
    r.check('both missing', d(null, null) === null);
    r.check('not a time', d('bed', '07:00') === null);
    r.check('impossible hour', d('25:00', '07:00') === null);
    r.check('impossible minute', d('23:70', '07:00') === null);
  }

  r.section('the sleep screen writes hours from the times');
  {
    const s = sb();
    const key = t(s);
    run(s, `sleepLog['${key}']={bedtime:'23:00',wake:'06:30'};`);
    r.check('hours are derived', run(s, `recalcSleepHours('${key}')`) === 7.5);
    r.check('and stored on the entry', run(s, `sleepLog['${key}'].hours`) === 7.5);
  }

  // Apple Health and Google Fit write hours with no bedtime or wake. Deriving
  // unconditionally would overwrite a real synced night with zero.
  r.section('a synced night is not overwritten');
  {
    const s = sb();
    const key = t(s);
    run(s, `sleepLog['${key}']={hours:6.9};`);
    r.check('nothing to derive from', run(s, `recalcSleepHours('${key}')`) === null);
    r.check('the synced hours survive', run(s, `sleepLog['${key}'].hours`) === 6.9,
      '(a synced night was zeroed)');

    run(s, `sleepLog['${key}']={hours:6.9,bedtime:'23:00'};`);
    r.check('one time is still not enough', run(s, `recalcSleepHours('${key}')`) === null);
    r.check('hours still intact', run(s, `sleepLog['${key}'].hours`) === 6.9);
  }

  r.section('the prompt asks once a day');
  {
    const s = sb();
    run(s, 'showSleepPrompt()');
    r.check('it opens', isOpen(s) === true);
    r.check('today is marked asked',
      run(s, `localStorage.getItem('hvi_sleep_prompt_day')`) === t(s));

    run(s, 'dismissSleepPrompt()');
    r.check('skipping closes it', isOpen(s) === false);
    run(s, 'checkSleepPrompt()');
    r.check('and it does not come back the same day',
      isOpen(s) === false, '(asked twice in one day)');
  }

  r.section('the prompt stays away when it should');
  {
    const already = sb();
    const key = t(already);
    run(already, `sleepLog['${key}']={hours:7.5}; checkSleepPrompt();`);
    r.check('silent when already logged', isOpen(already) === false);

    const off = sb();
    run(off, 'settings.sleepPrompt=false; checkSleepPrompt();');
    r.check('silent when switched off', isOpen(off) === false, '(no way to turn it off)');

    const fresh = createSandbox({ files: FILES, store: {} });
    run(fresh, `settings={}; curView='home'; track=function(){}; go=function(){};
                habits=[]; sleepLog={}; reportError=function(){};`);
    run(fresh, PRESENCE);
    run(fresh, 'checkSleepPrompt()');
    r.check('silent before onboarding is done', isOpen(fresh) === false,
      '(prompt over the onboarding flow)');

    // Mondays fire the weekly recap on the same launch. Stacking a second
    // modal on top of it would cover a screen the user has not read yet.
    const busy = sb();
    run(busy, `const m=document.createElement('div'); m.id='weekly-recap-modal';
               document.body.appendChild(m); checkSleepPrompt();`);
    r.check('waits behind the weekly recap', isOpen(busy) === false, '(stacked on the recap)');
    r.check('and has not burned the day',
      run(busy, `localStorage.getItem('hvi_sleep_prompt_day')`) !== t(busy),
      '(day marked asked while it never showed)');
  }

  r.section('saving from the prompt');
  {
    const s = sb();
    const key = t(s);
    run(s, 'showSleepPrompt()');
    run(s, `document.getElementById('sp-bed').value='22:45';
            document.getElementById('sp-wake').value='06:45';
            saveSleepPrompt();`);
    r.check('hours are stored', run(s, `sleepLog['${key}'].hours`) === 8);
    r.check('both times are kept', run(s, `sleepLog['${key}'].bedtime`) === '22:45');
    r.check('it persists', JSON.parse(run(s, `localStorage.getItem('hvi_sleep_log')`))[key].hours === 8);
    r.check('the modal closes', isOpen(s) === false);
  }

  // connect.js listens for this to auto-complete a linked sleep habit at 7h+.
  r.section('logging sleep announces itself');
  {
    const s = sb();
    run(s, 'showSleepPrompt()');
    run(s, `document.getElementById('sp-bed').value='23:00';
            document.getElementById('sp-wake').value='07:00';
            saveSleepPrompt();`);
    r.check('sleep:logged is emitted', emits(s).includes('sleep:logged'),
      '(linked habits would never auto-complete)');
  }

  r.section('the prompt asks about quality');
  {
    const s = sb();
    const key = t(s);
    run(s, 'showSleepPrompt()');
    const html = run(s, `document.getElementById('sleep-prompt').innerHTML`) || '';
    r.check('a 1-5 rating is offered', /setSleepPromptQuality\(5\)/.test(html),
      '(quality never asked)');
    run(s, `document.getElementById('sp-bed').value='23:00';
            document.getElementById('sp-wake').value='07:00';
            setSleepPromptQuality(4); saveSleepPrompt();`);
    r.check('the rating is stored', run(s, `sleepLog['${key}'].quality`) === 4);
    r.check('alongside the hours', run(s, `sleepLog['${key}'].hours`) === 8);
  }

  // Storing 0 would read as a recorded answer of "worst possible" rather than
  // "not asked", and quality is 40% of the readiness sleep score.
  r.section('skipping the rating records no rating');
  {
    const s = sb();
    const key = t(s);
    run(s, 'showSleepPrompt()');
    run(s, `document.getElementById('sp-bed').value='23:00';
            document.getElementById('sp-wake').value='07:00';
            saveSleepPrompt();`);
    r.check('no quality key is written', run(s, `sleepLog['${key}'].quality === undefined`) === true,
      '(an unanswered rating saved as zero)');
  }

  r.section('the rating does not leak between nights');
  {
    const s = sb();
    run(s, 'showSleepPrompt(); setSleepPromptQuality(2); dismissSleepPrompt();');
    run(s, `localStorage.removeItem('hvi_sleep_prompt_day'); showSleepPrompt();`);
    r.check('it reopens unset', run(s, '_sleepPromptQuality') === 0,
      '(yesterday\'s rating carried over)');
  }

  r.section('the total reads as time, not a decimal');
  {
    const s = sb();
    r.check('whole hours', run(s, 'formatSleep(8)') === '8h');
    r.check('and parts', run(s, 'formatSleep(7.5)') === '7h 30m');
    r.check('nothing logged', run(s, 'formatSleep(0)') === '—');
    r.check('undefined is not NaN', run(s, 'formatSleep(undefined)') === '—');
  }

  // Whoop, Google Fit and Apple Health write hours as raw floats. Printed
  // as-is, 5.666666h ran out of the Today tile.
  r.section('synced hours print with one decimal');
  {
    const s = sb();
    const f = v => run(s, `formatSleepShort(${JSON.stringify(v)})`);
    r.check('5.666666 reads 5.7h', f(5.666666) === '5.7h', `(got ${f(5.666666)})`);
    r.check('a whole night drops the .0', f(8) === '8h', `(got ${f(8)})`);
    r.check('rounding up to a whole night drops it too', f(7.96) === '8h', `(got ${f(7.96)})`);
    r.check('a string from a sync still formats', f('6.94') === '6.9h', `(got ${f('6.94')})`);
    r.check('nothing logged', f(0) === '—' && f(undefined) === '—');
    r.check('chart labels round the same way', run(s, 'roundSleep(5.666666)') === 5.7);
  }

  r.section('a synced 5.666666h night shows as 5.7h on screen');
  {
    const key = new Date().toLocaleDateString('en-CA');
    const s = createSandbox({
      files: ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'social.js'],
      store: { hvi_onboarded: 'true' },
    });
    run(s, `settings={units:'metric'}; curView='home'; track=function(){}; go=function(){};
            playSound=function(){}; haptic=function(){}; reportError=function(){};
            habits=[]; log={}; journal={}; workoutLog={}; mealLog={}; weightLog={}; prs={};
            gamification={xp:0}; meta={}; workoutMeta={activeProgram:'ppl',currentDayIndex:0};
            dietMeta={dailyGoals:{calories:2500,protein:180,carbs:280,fat:80},goalType:'maintain'};
            sleepLog={'${key}':{hours:5.666666,source:'whoop'}};`);
    // The breakdown sheet builds its markup in a detached div; keep hold of it.
    s._made = [];
    s.document.createElement = () => {
      const el = makeEl('created'); el.firstElementChild = makeEl('node'); s._made.push(el); return el;
    };

    const card = run(s, 'todayBriefingHTML()') || '';
    r.check('the Today tile reads 5.7h', /tb-cell-val">5\.7h</.test(card),
      `(tile: ${(card.match(/tb-cell-val">([^<]*)<\/div><div class="tb-cell-lbl">Sleep/) || [])[1]})`);
    r.check('and nowhere prints the raw float', card.length > 0 && !/5\.66/.test(card));

    run(s, 'showReadinessBreakdown()');
    const sheet = s._made.map(el => el.innerHTML).join('');
    r.check('the readiness sheet reads 5.7h', /rd-vital-val">5\.7h</.test(sheet), '(raw hours in the vitals)');

    run(s, 'renderSleep()');
    const view = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('the sleep chart labels the bar 5.7', /sl-bar-val">5\.7</.test(view), '(raw hours over the bar)');

    r.check('the coach is told 5.7h', /Last sleep: 5\.7h/.test(run(s, '_coachInsightContext()') || ''));
  }

  return r.finish();
};
