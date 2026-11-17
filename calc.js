// The maths behind the free calculator pages (calorie-calculator.html,
// one-rep-max-calculator.html, sleep-calculator.html).
//
// The calorie and one-rep max numbers are the app's own: the same constants
// and rounding as computeTDEETargets() in diet.js and calc1RM() in workout.js.
// tests/calculators.test.js holds the two side by side, so a page can never
// promise a number the app would not give.
var AreteCalc = (function () {
  // ── Calories and macros (Mifflin-St Jeor) ──
  var MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  var OFFSETS = { cut: -500, cut_mild: -250, maintain: 0, bulk_lean: 250, bulk: 500 };
  var SPLITS = {
    cut:       { p: 0.35, c: 0.35, f: 0.30 },
    cut_mild:  { p: 0.35, c: 0.35, f: 0.30 },
    maintain:  { p: 0.30, c: 0.40, f: 0.30 },
    bulk_lean: { p: 0.30, c: 0.45, f: 0.25 },
    bulk:      { p: 0.25, c: 0.50, f: 0.25 },
  };

  function calories(o) {
    var kg = +o.weightKg, cm = +o.heightCm, age = +o.age;
    if (!(kg > 0) || !(cm > 0) || !(age > 0)) return null;
    var bmr = (10 * kg) + (6.25 * cm) - (5 * age) + (o.sex === 'male' ? 5 : -161);
    var tdee = Math.round(bmr * (MULTIPLIERS[o.activity] || 1.55));
    var target = tdee + (OFFSETS[o.goal] || 0);
    var sp = SPLITS[o.goal] || SPLITS.maintain;
    return {
      bmr: Math.round(bmr), tdee: tdee, target: target,
      protein: Math.round((target * sp.p) / 4),
      carbs: Math.round((target * sp.c) / 4),
      fat: Math.round((target * sp.f) / 9),
      split: sp,
    };
  }

  // ── One-rep max (Epley) ──
  var PERCENTS = [100, 95, 90, 85, 80, 75, 70, 65];
  function repsAt(p) {
    return p === 100 ? 1 : p >= 95 ? 2 : p >= 90 ? 4 : p >= 85 ? 6 : p >= 80 ? 8 : p >= 75 ? 10 : p >= 70 ? 12 : 15;
  }
  function oneRepMax(weight, reps) {
    var w = +weight, r = Math.floor(+reps);
    if (!(w > 0) || !(r > 0)) return null;
    var orm = r === 1 ? w : Math.round(w * (1 + r / 30));
    return {
      orm: orm,
      table: PERCENTS.map(function (p) { return { pct: p, weight: Math.round(orm * p / 100), reps: repsAt(p) }; }),
    };
  }

  // ── Sleep, in 90-minute cycles ──
  // Times are minutes after midnight. Falling asleep is assumed to take 15
  // minutes. Six to four cycles: 9, 7.5 and 6 hours asleep.
  var CYCLE = 90, FALL = 15, CYCLES = [6, 5, 4];
  var wrap = function (m) { return ((m % 1440) + 1440) % 1440; };
  function bedtimesFor(wakeMin) {
    return CYCLES.map(function (n) { return { cycles: n, hours: n * CYCLE / 60, time: wrap(wakeMin - n * CYCLE - FALL) }; });
  }
  function wakeTimesFor(bedMin) {
    return CYCLES.slice().reverse().map(function (n) { return { cycles: n, hours: n * CYCLE / 60, time: wrap(bedMin + FALL + n * CYCLE) }; });
  }

  // ── Units ──
  var lbToKg = function (lb) { return lb / 2.2046226218; };
  var inToCm = function (inches) { return inches * 2.54; };

  // Number fields as wide as what is typed (or the example in them), so the
  // unit sits right after the number. The pages call this on every change.
  function fitInputs(root) {
    [].forEach.call(root.querySelectorAll('.num input[type="number"]'), function (el) {
      var n = String(el.value || el.placeholder || '').length;
      el.style.width = (Math.max(1, n) + 0.4) + 'ch';
    });
  }

  return {
    fitInputs: fitInputs,
    MULTIPLIERS: MULTIPLIERS, OFFSETS: OFFSETS, SPLITS: SPLITS,
    calories: calories, oneRepMax: oneRepMax,
    bedtimesFor: bedtimesFor, wakeTimesFor: wakeTimesFor, CYCLE: CYCLE, FALL: FALL,
    lbToKg: lbToKg, inToCm: inToCm,
  };
})();
