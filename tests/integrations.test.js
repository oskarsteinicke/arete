// Imported data: date attribution, units, and the sync paths actually running.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','social.js','integrations.js'];

function sb(store, opts) {
  const s = createSandbox({ files: FILES, store, fetch: (opts||{}).fetch });
  run(s, `
    settings=${JSON.stringify((opts||{}).settings || { units: 'metric' })};
    curView='home'; track=function(){}; go=function(){};
    weightLog=JSON.parse(localStorage.getItem('hvi_weight_log')||'{}');
    sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
  `);
  return s;
}

module.exports = async function () {
  const r = createReporter('integrations');

  r.section('imported weights land in the user\'s unit');
  {
    const metric = sb({}, { settings: { units: 'metric' } });
    r.check('metric keeps kilograms', run(metric, '_kgToDisplayWeight(80)') === 80,
      `(${run(metric, '_kgToDisplayWeight(80)')})`);

    const imperial = sb({}, { settings: { units: 'imperial' } });
    const lbs = run(imperial, '_kgToDisplayWeight(80)');
    r.check('imperial converts to pounds', Math.abs(lbs - 176.4) < 0.2, `(${lbs})`);
    r.check('80 kg is no longer shown as 80 lbs', lbs !== 80);

    r.check('rubbish input is rejected', run(imperial, '_kgToDisplayWeight(undefined)') === null);
    r.check('non-numeric rejected', run(imperial, '_kgToDisplayWeight("abc")') === null);
  }

  // A bulk rename once produced `const dateKey = dateKey(...)`, which throws a
  // temporal-dead-zone ReferenceError the moment a sync runs.
  r.section('sync paths run without a scope collision');
  {
    const now = Date.now();
    const gfit = (url) => {
      if (url.includes('sessions')) return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ session: [{
          activityType: 8, name: 'Evening Run',
          startTimeMillis: String(now - 3600000), endTimeMillis: String(now),
        }] }) });
      if (url.includes('dataset') || url.includes('dataSources')) return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ point: [{
          startTimeNanos: String((now - 86400000) * 1e6), value: [{ fpVal: 80 }],
        }] }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    const s = sb({ hvi_integrations: JSON.stringify({ googlefit: { access_token: 't', expires_at: now + 1e7 } }) },
      { settings: { units: 'imperial' }, fetch: gfit });
    run(s, `_authedFetch=function(svc,url){ return fetch(url); };`);
    let threw = null;
    try { await run(s, '_syncGoogleFit()'); } catch (e) { threw = e.message; }
    r.check('google fit sync does not throw', !threw, `(${threw})`);

    const wl = JSON.parse(s.localStorage._d['hvi_weight_log'] || '{}');
    const vals = Object.values(wl);
    r.check('weight imported', vals.length > 0, '(nothing imported)');
    r.check('imported weight converted for imperial',
      vals.length > 0 && Math.abs(vals[0] - 176.4) < 0.2, `(${vals[0]})`);
  }

  r.section('imported days use local dates, not UTC');
  {
    const s = sb({});
    // 23:30 local must file under today, not tomorrow
    const key = run(s, `(function(){ var d=new Date(); d.setHours(23,30,0,0); return dateKey(d); })()`);
    const expect = run(s, `(function(){ var d=new Date(); d.setHours(23,30,0,0); return d.toLocaleDateString('en-CA'); })()`);
    r.check('late-evening activity keeps the local day', key === expect, `(${key} vs ${expect})`);
    r.check('dateKey accepts a timestamp too',
      run(s, `dateKey(new Date(Date.now())) === today()`) === true);
  }

  r.section('the global date helper is not shadowed anywhere it is called');
  {
    const s = sb({});
    r.check('dateKey is the shared helper', run(s, 'typeof dateKey') === 'function');
    r.check('still correct after integrations loads', run(s, 'dateKey(new Date()) === today()') === true);
  }


  // Whoop, against API v2. The first version was written for v1 (retired), had
  // never connected to anything, and filed nights under the day they began.
  r.section('Whoop data lands on the right day, and does not trample what you entered');
  {
    // The shapes are Whoop's documented v2 payloads.
    const night = (id, start, end, inBedH, awakeH, perf, extra) => Object.assign({
      id, start, end, timezone_offset: '-04:00', nap: false, score_state: 'SCORED',
      score: { stage_summary: { total_in_bed_time_milli: inBedH * 3600000, total_awake_time_milli: awakeH * 3600000 },
               sleep_performance_percentage: perf } }, extra || {});
    const data = {
      sleeps: [
        night('s1', '2026-10-11T03:10:00.000Z', '2026-10-11T11:05:00.000Z', 7.9, 0.5, 86),   // 23:10 to 07:05 in Philadelphia
        night('nap', '2026-10-11T18:00:00.000Z', '2026-10-11T18:40:00.000Z', 0.6, 0, 50, { nap: true }),
        night('s2', '2026-10-12T03:00:00.000Z', '2026-10-12T10:30:00.000Z', 7.5, 0.4, 92, { score_state: 'PENDING_SCORE' }),
        night('s0', '2026-10-10T04:00:00.000Z', '2026-10-10T11:00:00.000Z', 7.0, 0.3, 71),
      ],
      recoveries: [
        { cycle_id: 1, sleep_id: 's1', created_at: '2026-10-11T11:06:00.000Z', score_state: 'SCORED',
          score: { recovery_score: 67, resting_heart_rate: 52, hrv_rmssd_milli: 78.6 } },
        { cycle_id: 0, sleep_id: 's0', created_at: '2026-10-10T11:01:00.000Z', score_state: 'SCORED',
          score: { recovery_score: 41, resting_heart_rate: 55, hrv_rmssd_milli: 60.2 } },
      ],
      workouts: [
        { id: 'w1', start: '2026-10-11T21:00:00.000Z', end: '2026-10-11T22:10:00.000Z', timezone_offset: '-04:00', sport_name: 'soccer',
          score_state: 'SCORED', score: { strain: 14.26, average_heart_rate: 151, max_heart_rate: 188, kilojoule: 3347, distance_meter: 8300 } },
        { id: 'w2', start: '2026-10-10T13:00:00.000Z', end: '2026-10-10T13:25:00.000Z', timezone_offset: '-04:00', sport_name: 'walking',
          score_state: 'SCORED', score: { strain: 2.1, average_heart_rate: 98, max_heart_rate: 110, kilojoule: 400 } },
        { id: 'w3', start: '2026-10-09T20:00:00.000Z', end: '2026-10-09T21:05:00.000Z', timezone_offset: '-04:00', sport_name: 'weightlifting',
          score_state: 'SCORED', score: { strain: 9.8, average_heart_rate: 122, max_heart_rate: 160, kilojoule: 1800 } },
      ],
    };
    const s = sb({
      // The 10th was typed in by hand, with a rating. The 9th has a session logged in Arete.
      hvi_sleep_log: JSON.stringify({ '2026-10-10': { hours: 6.5, quality: 2, bedtime: '00:00', wake: '06:30' } }),
      hvi_workout_log: JSON.stringify({ '2026-10-09': { programId: 'ppl', dayName: 'Push A',
        exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8, completed: true }] }] } }),
    });
    const took = JSON.parse(run(s, `JSON.stringify(applyWhoopData(${JSON.stringify(data)}, sleepLog, workoutLog))`));
    const sl = JSON.parse(run(s, 'JSON.stringify(sleepLog)')), wl = JSON.parse(run(s, 'JSON.stringify(workoutLog)'));

    r.check('a night belongs to the day you woke up on', !!sl['2026-10-11'] && sl['2026-10-11'].hours === 7.4, JSON.stringify(sl['2026-10-11']));
    r.check('hours are time asleep, not time in bed', sl['2026-10-11'].hours === 7.4);
    r.check('recovery, resting heart rate and HRV attach to that night',
      sl['2026-10-11'].whoopRecovery === 67 && sl['2026-10-11'].restingHR === 52 && sl['2026-10-11'].hrv === 79, JSON.stringify(sl['2026-10-11']));
    r.check('sleep performance becomes a rating where there was none', sl['2026-10-11'].quality === 4 && sl['2026-10-11'].sleepPerf === 86);
    r.check('bed and wake times come from Whoop, in local time', sl['2026-10-11'].bedtime === '23:10' && sl['2026-10-11'].wake === '07:05', JSON.stringify(sl['2026-10-11']));
    // With Whoop connected, its night is the one Arete uses.
    r.check('Whoop\'s night replaces one typed in by hand', sl['2026-10-10'].hours === 6.7 && sl['2026-10-10'].wake === '07:00' && sl['2026-10-10'].source === 'whoop', JSON.stringify(sl['2026-10-10']));
    r.check('the rating comes from sleep performance, not recovery', sl['2026-10-10'].quality === 3 && sl['2026-10-10'].qualityFrom === 'whoop', `(quality ${sl['2026-10-10'].quality})`);
    r.check('and the night carries Whoop\'s own readings', sl['2026-10-10'].whoopRecovery === 41 && sl['2026-10-10'].hrv === 60);
    r.check('a nap is not a night', took.nights === 2, `(${took.nights})`);
    r.check('a night Whoop is still scoring is left for next time', !sl['2026-10-12']);

    r.check('a Whoop activity becomes a session on its local day', wl['2026-10-11'] && wl['2026-10-11'].source === 'whoop' && wl['2026-10-11'].dayName === 'Soccer',
      JSON.stringify(wl['2026-10-11']));
    r.check('with its strain, time, heart rate, energy and distance',
      wl['2026-10-11'].strain === 14.3 && wl['2026-10-11'].duration === 70 && wl['2026-10-11'].avgHr === 151 && wl['2026-10-11'].calories === 800 && wl['2026-10-11'].distance === '8.3 km',
      JSON.stringify(wl['2026-10-11']));
    r.check('a walk does not count as a training day', !wl['2026-10-10'], JSON.stringify(wl['2026-10-10']));
    r.check('a session logged in Arete keeps its sets', wl['2026-10-09'].exercises.length === 1 && wl['2026-10-09'].dayName === 'Push A' && !wl['2026-10-09'].source);
    r.check('and gains what Whoop measured', wl['2026-10-09'].whoop && wl['2026-10-09'].whoop.strain === 9.8 && wl['2026-10-09'].whoop.sport === 'Weightlifting',
      JSON.stringify(wl['2026-10-09'].whoop));

    // Running it again must not double anything or flip-flop.
    const before = run(s, 'JSON.stringify([sleepLog, workoutLog])');
    run(s, `applyWhoopData(${JSON.stringify(data)}, sleepLog, workoutLog)`);
    r.check('syncing twice changes nothing', run(s, 'JSON.stringify([sleepLog, workoutLog])') === before);
    // A rescored night updates Whoop-owned hours.
    data.sleeps[0].score.stage_summary.total_awake_time_milli = 1.0 * 3600000;
    run(s, `applyWhoopData(${JSON.stringify(data)}, sleepLog, workoutLog)`);
    r.check('a rescored night updates', run(s, `sleepLog['2026-10-11'].hours`) === 6.9, `(${run(s, `sleepLog['2026-10-11'].hours`)})`);
  }

  r.section('with Whoop connected, its sleep is the one Arete uses');
  {
    const night = (id, start, end, inBedH, awakeH, perf) => ({ id, start, end, timezone_offset: '-04:00', nap: false, score_state: 'SCORED',
      score: { stage_summary: { total_in_bed_time_milli: inBedH * 3600000, total_awake_time_milli: awakeH * 3600000 }, sleep_performance_percentage: perf } });
    // Asleep 23:00 to 03:00, awake an hour, asleep again 04:00 to 07:00.
    const split = { sleeps: [
      night('b', '2026-10-15T08:00:00.000Z', '2026-10-15T11:00:00.000Z', 3, 0, 60),
      night('a', '2026-10-15T03:00:00.000Z', '2026-10-15T07:00:00.000Z', 4, 0, 80),
    ] };
    const s = sb({ hvi_sleep_log: JSON.stringify({ '2026-10-15': { hours: 5, bedtime: '01:00', wake: '06:00', quality: 1 } }) });
    run(s, `applyWhoopData(${JSON.stringify(split)}, sleepLog, workoutLog)`);
    const n = JSON.parse(run(s, `JSON.stringify(sleepLog['2026-10-15'])`));
    r.check('a night split in two counts as one night', n.hours === 7 && n.bedtime === '23:00' && n.wake === '07:00', JSON.stringify(n));
    r.check('rated on its main sleep', n.sleepPerf === 80 && n.quality === 4, JSON.stringify(n));

    // Today's night came from Whoop: the screens that take sleep by hand step aside.
    const T = new Date().toLocaleDateString('en-CA');
    const w = sb({ hvi_integrations: JSON.stringify({ whoop: { access_token: 't' } }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 7.4, bedtime: '23:10', wake: '07:05', source: 'whoop', quality: 4, qualityFrom: 'whoop', sleepPerf: 86, whoopRecovery: 67 } }) });
    run(w, `saveSleepField('wake', '09:00'); setSleepQuality(1)`);
    r.check('the Sleep screen cannot overwrite it', run(w, `sleepLog['${T}'].wake`) === '07:05' && run(w, `sleepLog['${T}'].quality`) === 4);
    run(w, `document.getElementById = function(){ return this._v || (this._v = { innerHTML: '' }); }.bind({});`);
    const html = run(w, `renderSleep(); document.getElementById('view').innerHTML`);
    r.check('which shows Whoop\'s night instead of inputs', /FROM WHOOP/.test(html) && !/type="time"/.test(html) && /86%/.test(html) && /67%/.test(html));

    const waiting = sb({ hvi_integrations: JSON.stringify({ whoop: { access_token: 't' } }) });
    run(waiting, `document.getElementById = function(){ return this._v || (this._v = { innerHTML: '' }); }.bind({});`);
    const wh = run(waiting, `renderSleep(); document.getElementById('view').innerHTML`);
    r.check('before Whoop sends the night, it can be typed, and says it will be replaced', /type="time"/.test(wh) && /hasn't sent last night yet/.test(wh));

    // Cloud: a Whoop night from another device beats one typed here.
    const m = JSON.parse(run(w, `JSON.stringify(mergeWhoopNights({ '2026-10-20': { hours: 5, source: undefined }, '2026-10-21': { hours: 6 } }, { '2026-10-20': { hours: 7.2, source: 'whoop' }, '2026-10-21': { hours: 8, source: 'applehealth' } }))`));
    r.check('a Whoop night synced from another device wins', m['2026-10-20'].hours === 7.2 && m['2026-10-20'].source === 'whoop');
    r.check('other synced nights still lose to this device', m['2026-10-21'].hours === 6);
  }

  r.section('the Whoop connection asks for what it needs and no more');
  {
    const s = sb({});
    const scopes = run(s, 'INTEGRATIONS.whoop.scopes').split(' ');
    r.check('it can refresh itself', scopes.includes('offline'), '(connection dies after an hour)');
    r.check('it reads recovery, sleep, workouts and body measurements', ['read:recovery', 'read:sleep', 'read:workout', 'read:body_measurement'].every(x => scopes.includes(x)));
    r.check('and nothing it does not use', scopes.length === 5, `(${scopes.join(' ')})`);
    r.check('the sync reads body measurements', /\/user\/measurement\/body/.test(require('fs').readFileSync(require('path').join(require('./harness').APP, 'integrations.js'), 'utf8')));
    r.check('it talks to the current API', /\/developer\/v2$/.test(run(s, 'WHOOP_API')));
    const src = require('fs').readFileSync(require('path').join(require('./harness').APP, 'integrations.js'), 'utf8');
    r.check('nothing still calls the retired one', !/developer\/v1\//.test(src), '(v1 endpoint left in)');
    r.check('the return address is the site root, whatever page it was opened on',
      run(s, `location.origin = 'https://get-arete.com'; location.pathname = '/index.html'; _oauthRedirectUri()`) === 'https://get-arete.com/');
    r.check('a connected Whoop is why the sleep question is not asked',
      /_getIntegrations\(\)\.whoop\) return;/.test(require('fs').readFileSync(require('path').join(require('./harness').APP, 'app.js'), 'utf8')));
  }

  // Weight and height follow Whoop, but only when Whoop's own value changes:
  // an unchanged Whoop number must never overwrite a weigh-in typed in Arete.
  r.section('weight and height follow Whoop when they change there');
  {
    const T = new Date().toLocaleDateString('en-CA');
    const body = (kg, m) => JSON.stringify({ weight_kilogram: kg, height_meter: m, max_heart_rate: 195 });
    const s = sb({ hvi_tdee_profile: JSON.stringify({ age: 21, sex: 'male', weight_kg: 80, height_cm: 180, activity: 'high' }) });
    run(s, `applyWhoopBody(${body(80.4, 1.83)})`);
    r.check('the first sync fills today\'s weight', run(s, `weightLog['${T}']`) === 80.4);
    r.check('and the height in the profile', run(s, `LS.get('hvi_tdee_profile').height_cm`) === 183);
    run(s, `weightLog['${T}'] = 79.9; LS.set('hvi_weight_log', weightLog); applyWhoopBody(${body(80.4, 1.83)})`);
    r.check('an unchanged Whoop weight leaves a typed-in weigh-in alone', run(s, `weightLog['${T}']`) === 79.9);
    run(s, `applyWhoopBody(${body(81.2, 1.83)})`);
    r.check('a changed Whoop weight comes across', run(s, `weightLog['${T}']`) === 81.2);
    run(s, `applyWhoopBody(${body(-5, 0.2)})`);
    r.check('nonsense values are ignored', run(s, `weightLog['${T}']`) === 81.2 && run(s, `LS.get('hvi_tdee_profile').height_cm`) === 183);
    r.check('the max heart rate is kept for later', run(s, `LS.get('hvi_whoop_body').maxHr`) === 195);

    const first = sb({ hvi_weight_log: JSON.stringify({ [T]: 78.5 }) });
    run(first, `applyWhoopBody(${body(80.4, 1.83)})`);
    r.check('a first sync does not overwrite a weight already logged today', run(first, `weightLog['${T}']`) === 78.5);

    const imp = sb({}, { settings: { units: 'imperial' } });
    run(imp, `applyWhoopBody(${body(80, 1.8)})`);
    r.check('in pounds for an imperial user', run(imp, `weightLog['${T}']`) === 176.4, run(imp, `weightLog['${T}']`));
  }

  // Whoop's API sends no CORS headers, so a browser call to it fails before it
  // starts. That is why the first connection read "synced never" forever.
  r.section('Whoop is reached through the Worker, and a failed sync says so');
  {
    const now = Date.now();
    const calls = [];
    const page = (records, next) => ({ ok: true, status: 200, json: () => Promise.resolve({ records, next_token: next }) });
    const whoop = (url, opts) => {
      calls.push({ url, auth: opts && opts.headers && opts.headers.Authorization });
      const u = new URL(url);
      const p = u.searchParams.get('path');
      if (p === '/activity/workout' && !u.searchParams.get('nextToken')) return Promise.resolve(page([], 'more'));
      if (p === '/user/measurement/body') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ weight_kilogram: 80, height_meter: 1.8 }) });
      return Promise.resolve(page([]));
    };
    const s = sb({ hvi_integrations: JSON.stringify({ whoop: { access_token: 'tok', expires_at: now + 1e7 } }) }, { fetch: whoop });
    await run(s, `syncIntegration('whoop')`);
    r.check('no call goes to Whoop directly', calls.length > 0 && calls.every(c => !c.url.startsWith('https://api.prod.whoop.com')), calls.map(c => c.url).join(' '));
    r.check('every call goes to the Worker relay', calls.every(c => c.url.startsWith('https://arete-ai.oskarsteinicke.workers.dev/whoop/api?path=')));
    r.check('with the person\'s own token', calls.every(c => c.auth === 'Bearer tok'));
    r.check('sleep, recovery, workouts and body are all read', ['/activity/sleep', '/recovery', '/activity/workout', '/user/measurement/body'].every(p => calls.some(c => new URL(c.url).searchParams.get('path') === p)));
    r.check('a second page of workouts is followed', calls.some(c => new URL(c.url).searchParams.get('nextToken') === 'more'));
    r.check('a good sync records the time', run(s, `typeof _getIntegrations().whoop.lastSync`) === 'number' && run(s, `_getIntegrations().whoop.lastError`) === undefined);

    const failing = sb({ hvi_integrations: JSON.stringify({ whoop: { access_token: 'tok', expires_at: now + 1e7 } }) },
      { fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    await run(failing, `syncIntegration('whoop')`);
    r.check('a failed sync is recorded', run(failing, `typeof _getIntegrations().whoop.lastError`) === 'number');
    const html = run(failing, `renderIntegrationsSection()`);
    r.check('and the row says it failed instead of "synced never"', /Sync failed/.test(html) && !/synced never/.test(html.split('Whoop')[1] || ''), html.slice(html.indexOf('Whoop'), html.indexOf('Whoop') + 160));

    const wsrc = require('fs').readFileSync(require('path').join(require('./harness').APP, 'worker', 'worker.js'), 'utf8');
    r.check('the Worker forwards to the v2 API', /api\.prod\.whoop\.com\/developer\/v2'/.test(wsrc));
    r.check('and only the reads Arete uses', /WHOOP_READS = \['\/activity\/sleep', '\/recovery', '\/activity\/workout', '\/user\/measurement\/body'\]/.test(wsrc));
    r.check('the Worker allows the DELETE that revokes access', /Allow-Methods': '[^']*DELETE/.test(wsrc));
  }

  r.section('a Whoop session in the history shows its length, strain and heart rate');
  {
    const s = sb({ hvi_whoop_body: JSON.stringify({ maxHr: 190 }) });
    run(s, `workoutLog = { '2026-10-11': { dayName: 'Soccer', duration: 70, exercises: [], source: 'whoop', strain: 14.3, avgHr: 152 } };
      document.getElementById = function(){ return this._v || (this._v = { innerHTML: '' }); }.bind({});`);
    const html = run(s, `renderWorkoutHistory(); document.getElementById('view').innerHTML`);
    r.check('70 minutes, not "1m"', /70m/.test(html) && !/>1m/.test(html));
    r.check('no "0 sets" for an activity with no sets', !/0 sets/.test(html));
    r.check('strain and heart rate as a share of max', /Strain 14\.3 · avg 152 bpm, 80% of max/.test(html), (html.match(/Strain[^<]*/) || [''])[0]);
    r.check('a session logged here still counts its sets', run(s, `sessionMinutes({ duration: 3600, exercises: [] })`) === 60);
    r.check('no max from Whoop, no percentage', run(s, `LS.set('hvi_whoop_body', null); whoopLine({ source: 'whoop', strain: 5, avgHr: 120 })`) === 'Strain 5 · avg 120 bpm');
  }

  r.section('Whoop syncs when the app comes back, and checks again until last night arrives');
  {
    const T = new Date().toLocaleDateString('en-CA');
    const at = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const s = sb({ hvi_integrations: JSON.stringify({ whoop: { access_token: 't', lastSync: at(9) - 15 * 60000 } }) });
    r.check('at 9:00 with no night yet, a sync 15 minutes ago is not enough', run(s, `_syncDue('whoop', ${at(9)})`) === true);
    run(s, `sleepLog['${T}'] = { hours: 7, source: 'whoop' }`);
    r.check('once the night is in, it waits 20 minutes', run(s, `_syncDue('whoop', ${at(9)})`) === false);
    r.check('then looks again, so a session just finished moves today\'s target', run(s, `_syncDue('whoop', ${at(9)} + 10 * 60000)`) === true);
    run(s, `var i2 = _getIntegrations(); i2.strava = { access_token: 't', lastSync: ${at(9)} - 25 * 60000 }; _saveIntegrations(i2);`);
    r.check('other services keep their 2 hours', run(s, `_syncDue('strava', ${at(9)})`) === false);
    run(s, `delete sleepLog['${T}']; var i = _getIntegrations(); i.whoop.lastSync = ${at(15)} - 15 * 60000; _saveIntegrations(i);`);
    r.check('in the afternoon it stops checking every 10 minutes', run(s, `_syncDue('whoop', ${at(15)})`) === false && run(s, `_syncDue('whoop', ${at(15)} + 10 * 60000)`) === true);
    const src = require('fs').readFileSync(require('path').join(require('./harness').APP, 'integrations.js'), 'utf8');
    r.check('it runs when the app comes back on screen, not only on a reload', /visibilitychange[\s\S]{0,300}_autoSync/.test(src));

    // Two syncs at once used to mean two refreshes of a token that works once.
    let calls = 0;
    const slow = () => { calls++; return new Promise(res => setTimeout(() => res({ ok: true, status: 200, json: () => Promise.resolve({ records: [] }) }), 5)); };
    const two = sb({ hvi_integrations: JSON.stringify({ whoop: { access_token: 't', expires_at: Date.now() + 1e7 } }) }, { fetch: slow });
    await run(two, `Promise.all([syncIntegration('whoop'), syncIntegration('whoop')])`);
    r.check('a second sync while one runs joins it instead of starting another', calls === 4, `(${calls} requests, one sync is 4)`);
  }

  r.section('a failed token refresh only disconnects when Whoop refuses it');
  {
    const expired = () => JSON.stringify({ whoop: { access_token: 'old', refresh_token: 'r1', expires_at: Date.now() - 1000 } });
    const offline = sb({ hvi_integrations: expired() }, { fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    await run(offline, `_refreshToken('whoop')`);
    r.check('offline, Whoop stays connected', run(offline, `!!_getIntegrations().whoop`) === true);

    const down = sb({ hvi_integrations: expired() }, { fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }) });
    await run(down, `_refreshToken('whoop')`);
    r.check('a server hiccup keeps it too', run(down, `!!_getIntegrations().whoop`) === true);

    const refused = sb({ hvi_integrations: expired() }, { fetch: () => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'invalid_grant' }) }) });
    await run(refused, `_refreshToken('whoop')`);
    r.check('refused by Whoop, it disconnects', run(refused, `!!_getIntegrations().whoop`) === false);

    // Another tab refreshed between this one reading the token and asking.
    let raced;
    raced = sb({ hvi_integrations: expired() }, { fetch: () => {
      run(raced, `_saveToken('whoop', { access_token: 'fresh', refresh_token: 'r2', expires_at: Date.now() + 3600000 })`);
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'invalid_grant' }) });
    } });
    const got = await run(raced, `_refreshToken('whoop')`);
    r.check('when another tab refreshed first, its new token is used', got === 'fresh' && run(raced, `_getIntegrations().whoop.refresh_token`) === 'r2', `(${got})`);
  }

  // Providers only send people back to https://get-arete.com/, never into the
  // app, so the app signs in through a browser sheet and collects the login
  // from the Worker afterwards.
  r.section('connecting from inside the iPhone or Android app');
  {
    const nodeCrypto = require('crypto');
    const opened = [], closed = [], listeners = {};
    const cap = { platform: 'ios', isNativePlatform: () => true, Plugins: {
      Browser: { open: async o => { opened.push(o.url); }, close: async () => { closed.push(1); }, addListener: (ev, fn) => { listeners['b:' + ev] = fn; } },
      App: { addListener: (ev, fn) => { listeners['a:' + ev] = fn; } },
    } };
    let claimBody = null, answer = 'ok';
    const s = sb({}, { fetch: (url, opts) => {
      if (/native-claim/.test(url)) {
        claimBody = JSON.parse(opts.body);
        if (answer === 'later') { answer = 'ok'; return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }); }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ service: 'whoop', token: { access_token: 'AT', refresh_token: 'RT', expires_at: Date.now() + 3600000 } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ records: [] }) });
    } });
    s.crypto = nodeCrypto.webcrypto; s.window.Capacitor = cap; s.Capacitor = cap;
    run(s, `showToast = function (m) { _toasts = (typeof _toasts === 'undefined' ? [] : _toasts).concat(m); };`);

    await run(s, `connectIntegration('whoop')`);
    const u = new URL(opened[0] || 'https://x/');
    r.check('Connect opens Whoop in a browser sheet, not the app\'s own page', opened.length === 1 && u.host === 'api.prod.whoop.com');
    r.check('with the site as the return address', u.searchParams.get('redirect_uri') === 'https://get-arete.com/');
    const pend = JSON.parse(s.localStorage._d['hvi_oauth_native'] || '{}');
    const state = u.searchParams.get('state') || '';
    r.check('the state carries only a fingerprint of a secret kept on the phone',
      /^n_whoop_[a-f0-9]{64}$/.test(state) && state === 'n_whoop_' + nodeCrypto.createHash('sha256').update(pend.verifier || '').digest('hex') && !opened[0].includes(pend.verifier));

    run(s, `_listenForNativeSignIn()`);
    await new Promise(res => setTimeout(res, 20));
    r.check('coming back to the app collects the login', run(s, `_getIntegrations().whoop && _getIntegrations().whoop.access_token`) === 'AT', JSON.stringify(claimBody));
    r.check('with the secret, which only now leaves the phone', claimBody && claimBody.verifier === pend.verifier && claimBody.state === state);
    r.check('then it is forgotten, and Whoop syncs', !s.localStorage._d['hvi_oauth_native'] && run(s, `_toasts.join()`) === 'Whoop is connected');

    // The Worker may not have it yet when the app comes back.
    run(s, `disconnectIntegration = null; _removeToken('whoop'); localStorage.setItem('hvi_oauth_native', JSON.stringify({ service: 'whoop', state: '${state}', verifier: '${pend.verifier}', at: Date.now() }))`);
    answer = 'later';
    listeners['a:appUrlOpen']({ url: 'com.getarete.app://oauth-done' });
    await new Promise(res => setTimeout(res, 1700));
    r.check('a "not yet" is asked again, and the sheet is closed', run(s, `_getIntegrations().whoop && _getIntegrations().whoop.access_token`) === 'AT' && closed.length === 1);

    const web = sb({});
    run(web, `location.search = '?code=abc&state=n_whoop_${'a'.repeat(64)}'; _touched = false; _recallOAuth = function () { _touched = true; return {}; };`);
    run(web, `_handleOAuthCallback()`);
    r.check('the website leaves the app\'s sign-ins to oauth-return.html', run(web, '_touched') === false, '(it treated it as its own, and would say it could not be finished)');
    const idx = require('fs').readFileSync(require('path').join(require('./harness').APP, 'index.html'), 'utf8');
    r.check('which index.html sends them to before the landing page could', /_nativeSignIn\) location\.replace\('\/oauth-return\.html' \+ location\.search\);\s*\/\/[^\n]*\n[^\n]*\n\s*else if \(!window\.Capacitor/.test(idx));
  }

  // Whoop's refresh token works once. Synced to a second device, one device's
  // refresh broke the other's connection, and the disconnect then synced back.
  r.section('connection logins stay on the device');
  {
    const s = sb({});
    r.check('they are not in the cloud backup', run(s, `SYNC_KEYS.indexOf('hvi_integrations')`) === -1);
    r.check('nor is Whoop\'s body reading', run(s, `SYNC_KEYS.indexOf('hvi_whoop_body')`) === -1);
    r.check('what the sync brings in still syncs', ['hvi_sleep_log', 'hvi_workout_log', 'hvi_weight_log'].every(k => run(s, `SYNC_KEYS.indexOf('${k}')`) !== -1));
    const src = require('fs').readFileSync(require('path').join(require('./harness').APP, 'app.js'), 'utf8');
    const signOut = src.slice(src.indexOf('async function authSignOut'), src.indexOf('// ── ACCOUNT DELETION'));
    r.check('and sign-out clears them, so the next person on this device is not connected', /SYNC_KEYS\.concat\(DEVICE_KEYS\)/.test(signOut) && run(s, `DEVICE_KEYS.indexOf('hvi_integrations')`) !== -1);
  }

  return r.finish();
};
