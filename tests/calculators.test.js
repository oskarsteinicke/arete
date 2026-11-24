// The free calculator pages, for search.
//
// Their maths lives in calc.js. The calorie and one rep max numbers have to be
// the app's own, so each is checked against the app's function over a spread
// of inputs: a page that promised one number while the app gave another would
// be the first thing a new user noticed.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { APP, createSandbox, run, createReporter } = require('./harness');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const PAGES = ['calorie-calculator.html', 'one-rep-max-calculator.html', 'sleep-calculator.html'];

module.exports = function () {
  const r = createReporter('calculators');

  const ctx = vm.createContext({});
  vm.runInContext(read('calc.js') + '\nthis.AreteCalc = AreteCalc;', ctx, { filename: 'calc.js' });
  const C = ctx.AreteCalc;

  r.section('the calorie calculator gives the app\'s numbers');
  {
    const s = createSandbox({ files: ['data.js', 'app.js', 'diet.js'] });
    const sexes = ['male', 'female'];
    const acts = Object.keys(C.MULTIPLIERS), goals = Object.keys(C.OFFSETS);
    let same = 0, total = 0, first = '';
    for (const sex of sexes) for (const activity of acts) for (const goal of goals)
      for (const [weightKg, heightCm, age] of [[54.5, 158, 19], [78, 178, 30], [96.3, 191.5, 47], [120, 170, 68]]) {
        const o = { weightKg, heightCm, age, sex, activity, goal };
        const app = JSON.parse(run(s, `JSON.stringify(computeTDEETargets(${JSON.stringify(o)}))`));
        const page = C.calories(o);
        const keys = ['bmr', 'tdee', 'target', 'protein', 'carbs', 'fat'];
        total++;
        if (keys.every(k => app[k] === page[k])) same++;
        else if (!first) first = JSON.stringify({ o, app, page });
      }
    r.check(`all ${total} combinations match computeTDEETargets`, same === total, first);
    r.check('the activity and goal lists are the app\'s',
      JSON.stringify(Object.keys(C.MULTIPLIERS)) === run(s, 'JSON.stringify(Object.keys(_TDEE_MULTIPLIERS))') &&
      JSON.stringify(Object.keys(C.OFFSETS)) === run(s, 'JSON.stringify(Object.keys(_TDEE_OFFSETS))'));
    r.check('missing or silly input gives nothing', C.calories({ weightKg: 0, heightCm: 178, age: 30 }) === null && C.calories({}) === null);
    const ex = C.calories({ weightKg: 78, heightCm: 178, age: 30, sex: 'male', activity: 'moderate', goal: 'maintain' });
    // 10 × 78 + 6.25 × 178 − 5 × 30 + 5 = 1,747.5; × 1.55 = 2,708.6
    r.check('78 kg, 178 cm, 30, male, moderate: 1,748 resting and 2,709 to maintain', ex.bmr === 1748 && ex.tdee === 2709, JSON.stringify(ex));
  }

  r.section('the page says what the maths does');
  {
    const html = read('calorie-calculator.html');
    for (const [k, m] of Object.entries(C.MULTIPLIERS)) r.check(`the table shows ${m} for ${k}`, html.includes(`<td>${m}</td>`));
    const pct = x => Math.round(x * 100) + '%';
    const rows = [...html.matchAll(/<tr><td>[^<]+<\/td><td>([−+]?\d+)<\/td><td>(\d+%)<\/td><td>(\d+%)<\/td><td>(\d+%)<\/td><\/tr>/g)];
    const want = Object.keys(C.OFFSETS).map(g => [C.OFFSETS[g], pct(C.SPLITS[g].p), pct(C.SPLITS[g].c), pct(C.SPLITS[g].f)]);
    const got = rows.map(m => [Number(m[1].replace('−', '-')), m[2], m[3], m[4]]);
    r.check('the goal table matches the offsets and splits', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
    r.check('every activity and goal on the form exists in the maths',
      [...html.matchAll(/name="activity" value="([a-z_]+)"/g)].every(m => m[1] in C.MULTIPLIERS) &&
      [...html.matchAll(/name="goal" value="([a-z_]+)"/g)].every(m => m[1] in C.OFFSETS));
    r.check('under 18 gets sent to a doctor, not a number', /made for adults/.test(html) && /age >= 18/.test(html));
  }

  r.section('the one rep max calculator gives the app\'s numbers');
  {
    const s = createSandbox({ files: ['data.js', 'app.js', 'workout.js', 'diet.js', 'connect.js', 'bodymap.js'] });
    let ok = true, first = '';
    for (const w of [20, 60, 100, 142.5, 227]) for (let reps = 1; reps <= 15; reps++) {
      // What the app's own 1RM calculator shows: a single as typed, the rest rounded
      const app = reps === 1 ? run(s, `_e1rm(${w}, 1)`) : Math.round(run(s, `_e1rm(${w}, ${reps})`));
      const page = C.oneRepMax(w, reps).orm;
      if (app !== page) { ok = false; first = first || `${w} x ${reps}: app ${app}, page ${page}`; }
    }
    r.check('matches the app\'s Epley estimate for every weight and rep count', ok, first);
    r.check('100 kg for 5 is 117, as the page says', C.oneRepMax(100, 5).orm === 117 && /about 117 kg/.test(read('one-rep-max-calculator.html')));
    r.check('80 kg for 10 is 107, as the page says', C.oneRepMax(80, 10).orm === 107 && /about 107 kg/.test(read('one-rep-max-calculator.html')));
    // The app's table of percentages and reps, written out the same way
    const src = read('workout.js');
    const appReps = (src.match(/const approxReps = (p === 100 \? 1 : [^;]+);/) || [])[1];
    const pageReps = (read('calc.js').match(/return (p === 100 \? 1 : [^;]+);/) || [])[1];
    r.check('the percentage table uses the app\'s rep guide', !!appReps && appReps === pageReps, `(${appReps} | ${pageReps})`);
    r.check('nothing for an empty set', C.oneRepMax(0, 5) === null && C.oneRepMax(100, 0) === null);
  }

  r.section('the sleep calculator counts whole cycles');
  {
    const t = list => list.map(x => `${Math.floor(x.time / 60)}:${String(x.time % 60).padStart(2, '0')}`).join(' ');
    r.check('waking at 7:00, fall asleep at 21:45, 23:15 or 0:45', t(C.bedtimesFor(420)) === '21:45 23:15 0:45', t(C.bedtimesFor(420)));
    r.check('in bed at 23:00, wake at 5:15, 6:45 or 8:15', t(C.wakeTimesFor(1380)) === '5:15 6:45 8:15', t(C.wakeTimesFor(1380)));
    r.check('9, 7.5 and 6 hours', C.bedtimesFor(420).map(x => x.hours).join() === '9,7.5,6');
    r.check('an early alarm wraps past midnight', t(C.bedtimesFor(60)) === '15:45 17:15 18:45', t(C.bedtimesFor(60)));
  }

  r.section('units');
  {
    r.check('220.46 lb is 100 kg', Math.abs(C.lbToKg(220.46) - 100) < 0.01);
    r.check('70 inches is 177.8 cm', Math.abs(C.inToCm(70) - 177.8) < 1e-9);
  }

  r.section('the pages');
  {
    const sitemap = read('sitemap.xml');
    for (const p of PAGES) {
      const html = read(p);
      const slug = p.replace('.html', '');
      const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      r.check(`${slug} is in the sitemap`, sitemap.includes(`<loc>https://get-arete.com/${slug}</loc>`));
      r.check(`${slug} loads the shared maths and styles`, /<script src="\/calc\.js\?v=\d+"><\/script>/.test(html) && /href="\/calc\.css\?v=\d+"/.test(html) && /href="\/tokens\.css/.test(html));
      r.check(`${slug} carries the visitor's source into the app`, /<script src="\/source\.js"><\/script>/.test(html));
      const starts = html.match(/<a [^>]*href="\/"[^>]*>/g) || [];
      r.check(`${slug}: every link into the app marks the visitor for it`, starts.length >= 2 && starts.every(a => /localStorage\.setItem\('hvi_from_landing','1'\)/.test(a)), `(${starts.length})`);
      r.check(`${slug} links to the other calculators`, PAGES.every(q => html.includes(`href="/${q.replace('.html', '')}"`)));
      r.check(`${slug} is faceless`, !/Oskar|Steinicke|Saint Joseph|\bSJU\b|soccer|football|Philadelphia|Philly|Denmark|Danish|\bD1\b|college athlete/i.test(html));
      r.check(`${slug} has no em dashes`, !/—/.test(text) && !/–/.test(text));
      r.check(`${slug} loads no analytics of its own`, !/googletagmanager|gtag\(|posthog/i.test(html), '(no consent prompt on these pages)');
      r.check(`${slug} has one h1`, (html.match(/<h1/g) || []).length === 1);
    }
  }

  r.section('the landing page links to them');
  {
    const landing = read('landing.html');
    r.check('all three, from the footer', PAGES.every(q => landing.includes(`href="/${q.replace('.html', '')}"`)));
  }

  r.section('the brand\'s Instagram is linked, and nobody personal');
  {
    for (const p of ['landing.html', ...PAGES]) {
      const html = read(p);
      r.check(`${p} links to @arete_habits`, /href="https:\/\/www\.instagram\.com\/arete_habits\/"/.test(html));
      r.check(`${p} links to no other Instagram account`, (html.match(/instagram\.com\/[a-z0-9_.]+/gi) || []).every(u => /arete_habits/.test(u)));
    }
  }

  return r.finish();
};
