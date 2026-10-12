// Imported data: date attribution, units, and the sync paths actually running.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','integrations.js'];

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
        night('s0', '2026-10-10T04:00:00.000Z', '2026-10-10T11:00:00.000Z', 7.0, 0.5, 71),
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
    r.check('a recovery score is not written into the rating', sl['2026-10-10'].quality === 2, `(quality ${sl['2026-10-10'].quality})`);
    r.check('hours you typed yourself are kept', sl['2026-10-10'].hours === 6.5 && sl['2026-10-10'].bedtime === '00:00', JSON.stringify(sl['2026-10-10']));
    r.check('and still gain Whoop\'s own readings', sl['2026-10-10'].whoopRecovery === 41 && sl['2026-10-10'].hrv === 60);
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

  r.section('the Whoop connection asks for what it needs and no more');
  {
    const s = sb({});
    const scopes = run(s, 'INTEGRATIONS.whoop.scopes').split(' ');
    r.check('it can refresh itself', scopes.includes('offline'), '(connection dies after an hour)');
    r.check('it reads recovery, sleep and workouts', ['read:recovery', 'read:sleep', 'read:workout'].every(x => scopes.includes(x)));
    r.check('and nothing it does not use', scopes.length === 4, `(${scopes.join(' ')})`);
    r.check('it talks to the current API', /\/developer\/v2$/.test(run(s, 'WHOOP_API')));
    const src = require('fs').readFileSync(require('path').join(require('./harness').APP, 'integrations.js'), 'utf8');
    r.check('nothing still calls the retired one', !/developer\/v1\//.test(src), '(v1 endpoint left in)');
    r.check('the return address is the site root, whatever page it was opened on',
      run(s, `location.origin = 'https://get-arete.com'; location.pathname = '/index.html'; _oauthRedirectUri()`) === 'https://get-arete.com/');
    r.check('a connected Whoop is why the sleep question is not asked',
      /_getIntegrations\(\)\.whoop\) return;/.test(require('fs').readFileSync(require('path').join(require('./harness').APP, 'app.js'), 'utf8')));
  }

  return r.finish();
};
