// Logging a meal you have had before, the foods you eat most, and changing
// how much of a food there was.
//
// Most meals are repeats. They used to be rebuilt from scratch or found in a
// list below three other sections that showed every meal twice, and a wrong
// amount meant deleting the food and adding it again.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'diet.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);

const OATS = [{ name: 'Oats, 80g', calories: 300, protein: 11, carbs: 54, fat: 6 },
              { name: 'Whey, 1 scoop', calories: 120, protein: 25, carbs: 3, fat: 1 },
              { name: 'Banana', calories: 105, protein: 1, carbs: 27, fat: 0 }];
const CHICKEN = [{ name: 'Chicken breast, 200g', calories: 330, protein: 62, carbs: 0, fat: 7 },
                 { name: 'Rice, 150g cooked', calories: 195, protein: 4, carbs: 42, fat: 1 }];
const meal = (name, items, id) => ({ id: id || ('m_' + name + Math.random().toString(36).slice(2, 7)), name, items });

function sb(log, extra) {
  const s = createSandbox({ files: FILES, store: Object.assign({
    hvi_meal_log: JSON.stringify(log || {}), hvi_settings: JSON.stringify({ units: 'metric' }) }, extra || {}) });
  run(s, `
    settings = { units: 'metric' }; curView = 'diet';
    mealLog = JSON.parse(localStorage.getItem('hvi_meal_log'));
    dietMeta = { dailyGoals: { calories: 2500, protein: 180, carbs: 280, fat: 80 }, goalType: 'maintain' };
    weightLog = {}; waterLog = {}; curMealItems = []; curMealType = 'Breakfast';
    _nav = []; go = function (v) { _nav.push(v); curView = v; };
    _tracked = []; track = function (n, p) { _tracked.push([n, p]); };
    _xp = 0; awardXP = function (n) { _xp += n; };
    _quests = 0; checkDailyQuests = function () { _quests++; };
    _emitted = []; window.Arete = { emit: function (e, p) { _emitted.push(e); }, on: function () {} };
    _toast = null; showActionToast = function (m, l, fn) { _toast = { m: m, l: l, fn: fn }; };
    haptic = function () {};
  `);
  return s;
}
const J = (s, expr) => JSON.parse(run(s, `JSON.stringify(${expr})`));
const todays = s => J(s, `(LS.get('hvi_meal_log', {})['${T}'] || { meals: [] }).meals`);
const at = (s, type) => run(s, `mealTypeNow = function () { return '${type}'; }`);

module.exports = function () {
  const r = createReporter('meallog');

  r.section('the meal people mean at this hour');
  {
    const s = sb();
    const h = (hh, mm) => run(s, `mealTypeNow(new Date(2026, 9, 14, ${hh}, ${mm || 0}))`);
    r.check('7:30 is breakfast', h(7, 30) === 'Breakfast');
    r.check('12:30 is lunch', h(12, 30) === 'Lunch');
    r.check('16:00 is a snack', h(16) === 'Snack');
    r.check('19:00 is dinner', h(19) === 'Dinner');
    r.check('23:00 is a snack', h(23) === 'Snack');
    run(s, `curMealType = 'Dinner'; mealTypeNow = function () { return 'Lunch'; }; openAddMeal();`);
    r.check('Add Meal opens on the meal for this hour', run(s, 'curMealType') === 'Lunch' && J(s, '_nav').pop() === 'dietAddMeal');
    run(s, `curMealType = 'Dinner'; curMealItems = [{ name: 'Egg', calories: 70, protein: 6, carbs: 0, fat: 5 }]; openAddMeal();`);
    r.check('unless one is half built', run(s, 'curMealType') === 'Dinner');
  }

  r.section('meals had before, best first');
  {
    const s = sb({
      [dk(1)]: { meals: [meal('Breakfast', OATS), meal('Lunch', CHICKEN)] },
      [dk(2)]: { meals: [meal('Breakfast', OATS), meal('Lunch', CHICKEN)] },
      [dk(3)]: { meals: [meal('Breakfast', OATS)] },
      [dk(5)]: { meals: [meal('Lunch', [{ name: 'Chicken breast, 200g', calories: 330, protein: 62, carbs: 0, fat: 7 }, { name: 'Rice, 150g cooked', calories: 195, protein: 4, carbs: 42, fat: 1 }])] },
      [dk(40)]: { meals: [meal('Dinner', [{ name: 'Old stew', calories: 600, protein: 30, carbs: 50, fat: 20 }])] },
    }, { hvi_meal_favorites: JSON.stringify([
      { name: 'Dinner', items: [{ name: 'Lasagne', calories: 700, protein: 35, carbs: 60, fat: 30 }], savedAt: Date.now() - 50 * 86400000 },
      { name: 'Dinner', items: [{ name: 'Ancient soup', calories: 200, protein: 5, carbs: 20, fat: 5 }], savedAt: Date.now() - 200 * 86400000 },
    ]) });
    const lunch = J(s, `usualMeals('Lunch')`);
    r.check('the same foods twice are one meal', lunch.filter(m => /chicken/.test(m.key)).length === 1, lunch.map(m => m.key).join(' / '));
    r.check('counted each time', lunch.find(m => /chicken/.test(m.key)).count === 3);
    r.check('meals usually had at this time come first', lunch[0].type === 'Lunch', lunch.map(m => m.type).join());
    const bf = J(s, `usualMeals('Breakfast')`);
    r.check('at breakfast, breakfast first', bf[0].type === 'Breakfast' && bf[0].cal === 525, JSON.stringify(bf[0]));
    r.check('older than a month is not read from the log', !bf.some(m => /old stew/.test(m.key)));
    r.check('a saved meal from before that still counts', bf.some(m => /lasagne/.test(m.key)));
    r.check('but not one from half a year ago', !bf.some(m => /ancient soup/.test(m.key)));
  }

  r.section('the meal for this hour, one tap from the Nutrition page');
  {
    let s = sb({ [dk(1)]: { meals: [meal('Breakfast', OATS)] } });
    at(s, 'Breakfast');
    let sug = J(s, 'nextMealSuggestion()');
    r.check('yesterday\'s breakfast is offered', sug && sug.headline === 'Same breakfast as yesterday?' && sug.cal === 525, JSON.stringify(sug && sug.headline));
    const html = run(s, 'nextMealHTML()');
    r.check('with what is in it and what it adds up to', /Oats, 80g, Whey, 1 scoop, Banana/.test(html) && /525 cal, 37g protein/.test(html) && /logSuggestedMeal\(\)/.test(html));
    run(s, 'logSuggestedMeal()');
    const logged = todays(s);
    r.check('one tap logs it as today\'s breakfast', logged.length === 1 && logged[0].name === 'Breakfast' && logged[0].items.length === 3);
    r.check('and the suggestion goes away', J(s, 'nextMealSuggestion()') === null);
    r.check('it counts like any logged meal: XP, the meal signal, quests', run(s, '_xp') === 15 && J(s, '_emitted').includes('meal:logged') && run(s, '_quests') === 1);
    r.check('and says what it did, with a way back', /Logged breakfast, 525 cal/.test(J(s, '_toast').m) && J(s, '_toast').l === 'Undo');
    run(s, '_toast.fn()');
    r.check('Undo takes it out again', todays(s).length === 0);
    r.check('the copy is its own: editing today does not change yesterday', (() => {
      run(s, `logSuggestedMeal(); const m = mealLog['${T}'].meals[0]; m.items[0].calories = 1;`);
      return J(s, `mealLog['${dk(1)}'].meals[0].items[0].calories`) === 300;
    })());

    // Found at 21:30: the card said dinner, the clock moved on, the tap logged a snack.
    s = sb({ [dk(1)]: { meals: [meal('Dinner', [{ name: 'Salmon', calories: 374, protein: 40, carbs: 0, fat: 23 }]), meal('Snack', [{ name: 'Yoghurt', calories: 146, protein: 20, carbs: 8, fat: 4 }])] } });
    at(s, 'Dinner');
    run(s, 'nextMealHTML()');
    at(s, 'Snack');
    run(s, 'logSuggestedMeal()');
    r.check('a tap logs the meal the card showed, even if the hour has turned', todays(s).length === 1 && todays(s)[0].name === 'Dinner' && todays(s)[0].items[0].name === 'Salmon', JSON.stringify(todays(s).map(m => m.name)));
    run(s, 'logSuggestedMeal()');
    r.check('and a second tap does not log it twice', todays(s).filter(m => m.name === 'Dinner').length === 1);

    s = sb({ [dk(1)]: { meals: [meal('Breakfast', OATS)] }, [T]: { meals: [meal('Breakfast', [{ name: 'Toast', calories: 80, protein: 3, carbs: 15, fat: 1 }])] } });
    at(s, 'Breakfast');
    r.check('not once breakfast is logged today', J(s, 'nextMealSuggestion()') === null);
    s = sb({ [dk(9)]: { meals: [meal('Breakfast', OATS)] } });
    at(s, 'Breakfast');
    r.check('not for a meal last had over a week ago', J(s, 'nextMealSuggestion()') === null);
    s = sb({ [dk(2)]: { meals: [meal('Breakfast', OATS)] }, [dk(3)]: { meals: [meal('Breakfast', OATS)] }, [dk(4)]: { meals: [meal('Breakfast', OATS)] } });
    at(s, 'Breakfast');
    r.check('a regular one is "your usual"', J(s, 'nextMealSuggestion()').headline === 'Your usual breakfast?');
    s = sb({ [dk(1)]: { meals: [meal('Lunch', CHICKEN)] } });
    at(s, 'Breakfast');
    r.check('lunch is not offered at breakfast time', J(s, 'nextMealSuggestion()') === null);
  }

  r.section('log again from Add Meal');
  {
    const s = sb({ [dk(1)]: { meals: [meal('Breakfast', OATS), meal('Lunch', CHICKEN)] } });
    run(s, `curView = 'dietAddMeal'; curMealType = 'Dinner'; renderDietAddMeal();`);
    const page = run(s, `document.getElementById('view').innerHTML`);
    r.check('meals had before are at the top', page.indexOf('Log again') > -1 && page.indexOf('Log again') < page.indexOf('Scan Food Photo'));
    r.check('the old list that showed each meal twice is gone', !/FAVORITES|RECENT MEALS|Quick Re-log/.test(page));
    const lunchIdx = J(s, '_againList').findIndex(m => m.type === 'Lunch');
    run(s, `relogMeal(${lunchIdx})`);
    const logged = todays(s);
    r.check('one tap logs it as the meal chosen at the top', logged.length === 1 && logged[0].name === 'Dinner' && logged[0].items.length === 2, JSON.stringify(logged.map(m => m.name)));
    r.check('marked as logged again', J(s, '_tracked').some(t => t[0] === 'meal_logged' && t[1].via === 'again'));

    run(s, `curView = 'dietAddMeal'; curMealItems = [{ name: 'Egg', calories: 70, protein: 6, carbs: 0, fat: 5 }]; renderDietAddMeal();`);
    r.check('while a meal is being built it says Add', /Add a meal you’ve had/.test(run(s, `document.getElementById('view').innerHTML`)));
    run(s, `relogMeal(0)`);
    r.check('and adds its foods to it instead of logging', todays(s).length === 1 && run(s, 'curMealItems.length') > 1, `(${run(s, 'curMealItems.length')} items)`);
  }

  r.section('the foods eaten most, one tap to add');
  {
    const s = sb({
      [dk(1)]: { meals: [meal('Breakfast', OATS), meal('Lunch', CHICKEN)] },
      [dk(2)]: { meals: [meal('Breakfast', OATS), meal('Snack', [{ name: 'Banana', calories: 110, protein: 1, carbs: 28, fat: 0 }])] },
      [dk(3)]: { meals: [meal('Snack', [{ name: 'Apple', calories: 95, protein: 0, carbs: 25, fat: 0 }])] },
    });
    const foods = J(s, 'usualFoods()');
    r.check('foods had at least twice', foods.length === 3 && !foods.some(f => f.name === 'Apple') && !foods.some(f => /Chicken/.test(f.name)), foods.map(f => f.name).join());
    r.check('the most eaten first', foods[0].name === 'Banana', foods.map(f => f.name).join());
    r.check('with the most recent amount', foods[0].calories === 105);
    run(s, `curView = 'dietAddMeal'; renderDietAddMeal();`);
    r.check('shown on Add Meal', /Your usual foods/.test(run(s, `document.getElementById('view').innerHTML`)));
    run(s, 'addUsualFood(0)');
    r.check('a tap adds it to the meal being built', J(s, 'curMealItems').length === 1 && J(s, 'curMealItems')[0].name === 'Banana');
    run(s, `curView = 'dietAddMeal'; renderDietAddMeal();`);
    const page = run(s, `document.getElementById('view').innerHTML`);
    r.check('which appears at the top, with a way to save it', /Your breakfast/.test(page) && /saveMeal\(\)[^>]*>Save breakfast/.test(page) && page.indexOf('Your breakfast') < page.indexOf('Your usual foods'));
    run(s, 'saveMeal()');
    r.check('saving logs it and goes back', todays(s).length === 1 && J(s, '_nav').pop() === 'diet' && run(s, '_xp') === 15);
  }

  r.section('recipes count like any other meal');
  {
    const s = sb();
    const id = run(s, 'RECIPES[0].id');
    run(s, `logRecipe('${id}')`);
    r.check('XP, the meal signal and quests, which a recipe used to skip', run(s, '_xp') === 15 && J(s, '_emitted').includes('meal:logged') && run(s, '_quests') === 1);
  }

  r.section('changing how much of a food there was');
  {
    const s = sb();
    let it = J(s, `scaleFoodItem({ name: 'Rice, 150g cooked', calories: 195, protein: 4, carbs: 42, fat: 1 }, 200 / 150)`);
    r.check('150 g to 200 g: the name says 200g', it.name === 'Rice, 200g cooked', it.name);
    r.check('and the numbers follow', it.calories === 260 && it.carbs === 56 && it.protein === 5.3, JSON.stringify(it));
    it = J(s, `(function () { const x = { name: 'Rice, 150g cooked', calories: 195, protein: 4, carbs: 42, fat: 1 }; scaleFoodItem(x, 2); scaleFoodItem(x, 0.5); return x; })()`);
    r.check('each change scales from what was logged, not from the last change', it.calories === 98 && it.name === 'Rice, 75g cooked', JSON.stringify(it));
    it = J(s, `(function () { const x = { name: 'Rice, 150g cooked', calories: 195, protein: 4, carbs: 42, fat: 1 }; scaleFoodItem(x, 2); scaleFoodItem(x, 1); return x; })()`);
    r.check('back to 1 is exactly what was logged', it.calories === 195 && it.name === 'Rice, 150g cooked' && it.portion === undefined, JSON.stringify(it));
    it = J(s, `scaleFoodItem({ name: 'Banana', calories: 105, protein: 1, carbs: 27, fat: 0 }, 1.5)`);
    r.check('a food with no amount in its name keeps its name', it.name === 'Banana' && it.calories === 158 && it.portion === 1.5);
    r.check('and shows the portion beside it', /1½×/.test(run(s, `_portionBadge(${JSON.stringify(it)})`)), run(s, `_portionBadge(${JSON.stringify(it)})`));
    r.check('a millilitre amount works too', J(s, `scaleFoodItem({ name: 'Milk 250 ml', calories: 160, protein: 8, carbs: 12, fat: 9 }, 2)`).name === 'Milk 500 ml');
  }

  r.section('on a logged meal');
  {
    const s = sb({ [T]: { meals: [meal('Lunch', CHICKEN, 'm_lunch'), { name: 'Snack', items: [{ name: 'Apple', calories: 95, protein: 0, carbs: 25, fat: 0 }] }] } });
    run(s, `curView = 'diet'; toggleFoodEditor('l:m_lunch:1')`);
    let page = run(s, `document.getElementById('view').innerHTML`);
    r.check('tapping a food opens its amounts', /setFoodAmount\('l:m_lunch:1', 1\.3333/.test(page) && />200 g</.test(page) && /d-fe-chip on[^>]*>150 g</.test(page), (page.match(/d-fe-chips[^]*?<\/div>/) || [''])[0].slice(0, 300));
    run(s, `setFoodAmount('l:m_lunch:1', 200 / 150)`);
    let saved = todays(s)[0].items[1];
    r.check('a new amount is saved', saved.name === 'Rice, 200g cooked' && saved.calories === 260, JSON.stringify(saved));
    r.check('and today\'s totals follow', J(s, 'getDayMacros()').cal === 330 + 260 + 95, JSON.stringify(J(s, 'getDayMacros()')));
    run(s, `document.getElementById('fe-amt').value = '120'; setFoodExact('l:m_lunch:1')`);
    saved = todays(s)[0].items[1];
    r.check('an exact amount can be typed', saved.name === 'Rice, 120g cooked' && saved.calories === 156, JSON.stringify(saved));
    run(s, `setFoodAmount('l:#1:0', 2)`);
    r.check('a meal logged before meals had ids can be changed too', todays(s)[1].items[0].calories === 190);

    run(s, `removeFood('l:m_lunch:0')`);
    r.check('one food can be removed from a meal', todays(s)[0].items.length === 1 && todays(s)[0].items[0].name === 'Rice, 120g cooked');
    run(s, '_toast.fn()');
    r.check('and put back where it was', todays(s)[0].items.length === 2 && todays(s)[0].items[0].name === 'Chicken breast, 200g');
    run(s, `confirm = function () { return true; }; removeFood('l:#1:0')`);
    r.check('removing the last food removes the meal, as deleting it would', todays(s).length === 1);
  }

  r.section('on the meal being built');
  {
    const s = sb();
    run(s, `curView = 'dietAddMeal'; curMealItems = [{ name: 'Oats, 80g', calories: 300, protein: 11, carbs: 54, fat: 6 }]; setFoodAmount('b:0', 1.25);`);
    r.check('the same change works before it is saved', run(s, 'curMealItems[0].name') === 'Oats, 100g' && run(s, 'curMealItems[0].calories') === 375);
  }

  r.section('nothing on these screens is small print');
  {
    const css = require('fs').readFileSync(require('path').join(require('./harness').APP, 'style.css'), 'utf8');
    const block = css.slice(css.indexOf('/* ── Logging again, usual foods and amounts'), css.indexOf('.d-fe-remove'));
    const sizes = [...block.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => +m[1]);
    r.check('every size in the new styles is 13px or more', sizes.length > 5 && sizes.every(x => x >= 13), sizes.join());
    const s = sb({ [dk(1)]: { meals: [meal('Breakfast', OATS)] } });
    run(s, `curView = 'dietAddMeal'; renderDietAddMeal();`);
    r.check('and Add Meal has no 9px labels left', !/font-size:9px/.test(run(s, `document.getElementById('view').innerHTML`)));
  }

  return r.finish();
};
