// ══════════════════════════════════════════════════════════════════════════
// Northstar — Diet Module
// ══════════════════════════════════════════════════════════════════════════

// ── ADAPTIVE NUTRITION HELPERS ────────────────────────────────────────────
function computeTrend(wl) {
  const entries = Object.entries(wl).sort((a,b) => a[0].localeCompare(b[0]));
  if (!entries.length) return [];
  let ema = entries[0][1];
  return entries.map(([date, raw]) => {
    ema = 0.1 * raw + 0.9 * ema;
    return { date, raw, ema };
  });
}

function computeWeeklyAvgCalories(ml) {
  const dates = Object.keys(ml).filter(d => {
    const meals = (ml[d] || {}).meals || [];
    return meals.length > 0;
  }).sort().reverse().slice(0, 7);
  if (dates.length < 3) return null;
  const total = dates.reduce((sum, d) => {
    const meals = (ml[d] || {}).meals || [];
    return sum + meals.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.calories || 0), 0), 0);
  }, 0);
  return Math.round(total / dates.length);
}

function computeTDEE(wl, ml) {
  const trend = computeTrend(wl);
  if (trend.length < 7) return null;
  const avgCal = computeWeeklyAvgCalories(ml);
  if (avgCal === null) return null;
  const last7 = trend.slice(-7);
  const weightChange = last7[last7.length - 1].ema - last7[0].ema;
  const weightChangeCalsPerDay = (weightChange * 7700) / 7;
  return Math.round(Math.min(6000, Math.max(1200, avgCal - weightChangeCalsPerDay)));
}

function computeAdaptiveTarget(tdee, goalType, wl) {
  if (tdee === null) return null;
  const offsets = { cut: -400, maintain: 0, bulk: 300 };
  const calories = Math.round(tdee + (offsets[goalType] || 0));
  const entries = Object.entries(wl).sort((a,b) => b[0].localeCompare(a[0]));
  const bw = entries.length ? entries[0][1] : 80;
  return { calories, protein: Math.round(bw * 2.2) };
}

function injectAdaptiveStyles() {
  if (document.getElementById('diet-adaptive-styles')) return;
  const s = document.createElement('style');
  s.id = 'diet-adaptive-styles';
  s.textContent = `
    .da-section{background:var(--surface2);border-radius:14px;padding:16px;margin:16px 24px}
    .da-stat{text-align:center}
    .da-stat-val{font-size:20px;font-weight:700;color:var(--accent-b);font-family:var(--serif)}
    .da-stat-lbl{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
    .da-goal-btns{display:flex;gap:6px;margin:12px 0 8px}
    .da-goal-btn{flex:1;padding:10px 0;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:transparent;color:var(--text-dim);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s}
    .da-goal-btn.active{background:rgba(154,130,86,0.15);border-color:var(--accent);color:var(--accent-b)}
    .da-apply{display:inline-block;margin-top:8px;padding:8px 20px;border:1px solid var(--accent);border-radius:10px;background:rgba(154,130,86,0.1);color:var(--accent-b);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s}
    .da-apply:active{transform:scale(0.97)}
    .da-rec{display:flex;gap:16px;justify-content:center;margin-top:10px}
    .da-rec-item{text-align:center}
    .da-rec-val{font-size:16px;font-weight:700;font-family:var(--serif)}
    .da-rec-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px}
    .dw-section{background:var(--surface2);border-radius:14px;padding:16px;margin:16px 24px}
    .dw-logged{font-size:14px;color:var(--text);margin-bottom:10px}
    .dw-input-row{display:flex;gap:8px;align-items:center}
    .dw-input{flex:1;padding:10px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:var(--surface);color:var(--text);font-size:14px}
    .dw-log-btn{padding:10px 18px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
    .dw-log-btn:active{transform:scale(0.97)}
    .dw-history{margin-top:10px;font-size:12px;color:var(--text-dim)}
    .dw-history-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
    .dw-trend-link{display:block;margin-top:10px;font-size:12px;color:var(--accent-b);cursor:pointer;text-align:right}
    .dt-chart{margin:16px 24px;background:var(--surface2);border-radius:14px;padding:16px;overflow:hidden}
    .dt-placeholder{padding:32px 24px;text-align:center;font-size:13px;color:var(--text-dim)}
    .fs-row{background:var(--surface2);border-radius:8px;padding:10px 14px;margin-bottom:4px;cursor:pointer;border:1px solid transparent;transition:all .2s}
    .fs-row:hover{background:var(--surface);border-color:rgba(255,255,255,0.08)}
    .fs-row.selected{border-color:var(--accent)}
    .fs-row-name{font-size:13px;color:var(--text);margin-bottom:2px}
    .fs-row-macros{font-size:11px;color:var(--text-dim)}
    .fs-status{color:var(--text-dim);font-size:13px;padding:12px 0}
    .fs-input-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
    .fs-search-btn{padding:10px 18px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;white-space:nowrap}
    .fs-search-btn:active{transform:scale(0.97)}
    .fs-grams-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
    .fs-grams-label{font-size:12px;color:var(--text-dim);white-space:nowrap}
  `;
  document.head.appendChild(s);
}

// ── USDA FOOD SEARCH ─────────────────────────────────────────────────────
async function searchFoods(query) {
  if (!query || query.length < 2) return [];
  const key = query.toLowerCase();
  if (foodSearchCache[key]) return foodSearchCache[key];
  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=8&dataType=Foundation,SR%20Legacy&api_key=${USDA_KEY}`);
    if (res.status === 429) {
      return { rateLimited: true };
    }
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) {
      console.warn("USDA API error:", data.error);
      return [];
    }
    const nutr = (f, id) => { const n = (f.foodNutrients || []).find(x => x.nutrientId === id); return n ? n.value : 0; };
    const results = (data.foods || []).map(f => ({
      fdcId: f.fdcId,
      name: f.description,
      cal100g: nutr(f, 1008),
      protein100g: nutr(f, 1003),
      carbs100g: nutr(f, 1005),
      fat100g: nutr(f, 1004),
    })).filter(r => r.cal100g > 0).slice(0, 8);
    foodSearchCache[key] = results;
    return results;
  } catch { return []; }
}

function getDayMacros() {
  const freshLog = LS.get('hvi_meal_log', {});
  const t = today(), meals = (freshLog[t] || {}).meals || [];
  return meals.reduce((acc, m) => {
    m.items.forEach(it => { acc.cal += it.calories||0; acc.p += it.protein||0; acc.c += it.carbs||0; acc.f += it.fat||0; });
    return acc;
  }, { cal:0, p:0, c:0, f:0 });
}

function renderDiet() {
  mealLog = LS.get('hvi_meal_log', {});
  weightLog = LS.get('hvi_weight_log', {});
  const goals = dietMeta.dailyGoals;
  const m = getDayMacros();
  const meals = (mealLog[today()] || {}).meals || [];

  const rings = [
    { label:'Calories', val:m.cal, goal:goals.calories, color:'var(--cal)', unit:'' },
    { label:'Protein', val:m.p, goal:goals.protein, color:'var(--pro)', unit:'g' },
    { label:'Carbs', val:m.c, goal:goals.carbs, color:'var(--carb)', unit:'g' },
    { label:'Fat', val:m.f, goal:goals.fat, color:'var(--fat)', unit:'g' },
  ].map(r => `<div class="d-ring-item"><div class="d-ring-wrap">${ring(26,r.goal?r.val/r.goal:0,3,r.color)}<div class="d-ring-val">${r.val}</div></div><div class="d-ring-label">${r.label}</div></div>`).join('');

  // Expenditure section
  const tdee = computeTDEE(weightLog, mealLog);
  const avgCal = computeWeeklyAvgCalories(mealLog);
  const goalType = dietMeta.goalType || 'maintain';
  const adaptive = computeAdaptiveTarget(tdee, goalType, weightLog);

  const goalBtns = ['cut','maintain','bulk'].map(g =>
    `<button class="da-goal-btn${g===goalType?' active':''}" onclick="setGoalType('${g}')">${g.toUpperCase()}</button>`
  ).join('');

  let adaptiveRec = '';
  if (adaptive) {
    adaptiveRec = `<div class="da-rec">
      <div class="da-rec-item"><div class="da-rec-val" style="color:var(--cal)">${adaptive.calories}</div><div class="da-rec-lbl">Cal Target</div></div>
      <div class="da-rec-item"><div class="da-rec-val" style="color:var(--pro)">${adaptive.protein}g</div><div class="da-rec-lbl">Protein</div></div>
    </div>
    <div style="text-align:center"><button class="da-apply" onclick="applyAdaptiveTarget()">APPLY</button></div>`;
  }

  const expenditureHTML = `<div class="da-section ani">
    <div class="sec-lbl" style="padding:0 0 10px">Expenditure</div>
    <div class="s-grid" style="margin:0">
      <div class="s-card da-stat"><div class="da-stat-val">${tdee !== null ? tdee.toLocaleString() : '—'}</div><div class="da-stat-lbl">${tdee !== null ? 'Est. TDEE' : 'Log 7+ days to unlock'}</div></div>
      <div class="s-card da-stat"><div class="da-stat-val">${avgCal !== null ? avgCal.toLocaleString() : '—'}</div><div class="da-stat-lbl">Avg Cal (7d)</div></div>
    </div>
    <div class="da-goal-btns">${goalBtns}</div>
    ${adaptiveRec}
  </div>`;

  // Weight section
  const t = today();
  const todayWeight = weightLog[t];
  const recentWeights = Object.entries(weightLog).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 7);
  const recentHTML = recentWeights.length ? recentWeights.map(([d, w]) =>
    `<div class="dw-history-item"><span>${fmtDate(d)}</span><span>${w} ${wtUnit()}</span></div>`
  ).join('') : '<div style="font-size:12px;color:var(--text-dim)">No weights logged yet.</div>';

  const weightHTML = `<div class="dw-section ani">
    <div class="sec-lbl" style="padding:0 0 10px">Weight</div>
    ${todayWeight ? `<div class="dw-logged">Today: <strong>${todayWeight} ${wtUnit()}</strong></div>` : ''}
    <div class="dw-input-row">
      <input class="dw-input" type="number" step="0.1" min="20" max="600" id="wt-input" placeholder="Weight (${wtUnit()})" ${todayWeight ? `value="${todayWeight}"` : ''}>
      <button class="dw-log-btn" onclick="logWeight()">LOG WEIGHT</button>
    </div>
    <div class="dw-history">${recentHTML}</div>
    ${Object.keys(weightLog).length >= 3 ? `<div class="dw-trend-link" onclick="go('dietTrend')">VIEW TREND \u2192</div>` : ''}
  </div>`;

  const mealsHTML = meals.length ? meals.map((ml, mi) => {
    const mCal = ml.items.reduce((s,i) => s + (i.calories||0), 0);
    const mP = ml.items.reduce((s,i) => s + (i.protein||0), 0);
    const itemsHTML = ml.items.map(it => `<div class="d-meal-item">${esc(it.name)} \u2014 ${it.calories}cal, ${it.protein}P, ${it.carbs}C, ${it.fat}F</div>`).join('');
    return `<div class="d-meal"><div class="d-meal-head"><div class="d-meal-name">${esc(ml.name)}</div><div style="display:flex;align-items:center;gap:8px"><div class="d-meal-cal">${mCal} cal</div><button class="d-del-btn" onclick="deleteMeal(${mi})">\u00D7</button></div></div>
      <div class="d-meal-macros">${mP}P</div>${itemsHTML}</div>`;
  }).join('') : '<p style="padding:0 24px;font-size:13px;color:var(--text-muted)">No meals logged today.</p>';

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Nutrition</div><div class="page-sub">Fuel your body with intention.</div></div>
    <div class="d-rings ani">${rings}</div>
    ${expenditureHTML}
    <div class="sec-lbl">Today's Meals</div>
    <div class="ani">${mealsHTML}</div>
    <div style="display:flex;gap:8px;padding:16px 24px 8px">
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('dietAddMeal')">+ Add Meal</button>
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('dietRecipes')">Recipes</button>
    </div>
    <button class="w-action-btn" onclick="go('dietGoals')">Edit Daily Goals</button>
    ${weightHTML}`;
}

function deleteMeal(mi) {
  const t = today();
  if (!mealLog[t]) return;
  mealLog[t].meals.splice(mi, 1);
  LS.set('hvi_meal_log', mealLog);
  go('diet');
}

// ── NATURAL-LANGUAGE MEAL PARSER ──────────────────────────────────────────
const WORD_NUMS = { a:1, an:1, one:1, half:0.5, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
const UNIT_G = { g:1, gr:1, gram:1, grams:1, ml:1, mls:1, milliliter:1, millilitre:1 };
const UNIT_CUP = { cup:240, cups:240 };
const UNIT_TBSP = { tbsp:15, tablespoon:15, tablespoons:15 };
const UNIT_TSP = { tsp:5, teaspoon:5, teaspoons:5 };
const UNIT_OZ = { oz:28.35, ounce:28.35, ounces:28.35 };
const UNIT_LB = { lb:453.6, lbs:453.6, pound:453.6, pounds:453.6 };
const UNIT_EACH = { piece:1, pieces:1, slice:1, slices:1, scoop:1, scoops:1, whole:1, each:1, x:1 };

function _toGrams(qty, unitRaw, food) {
  const u = (unitRaw || '').toLowerCase().replace(/[^a-z]/g,'');
  if (UNIT_G[u])    return qty * UNIT_G[u];
  if (UNIT_CUP[u])  return qty * UNIT_CUP[u];
  if (UNIT_TBSP[u]) return qty * UNIT_TBSP[u];
  if (UNIT_TSP[u])  return qty * UNIT_TSP[u];
  if (UNIT_OZ[u])   return qty * UNIT_OZ[u];
  if (UNIT_LB[u])   return qty * UNIT_LB[u];
  if (UNIT_EACH[u]) return qty * (food.each || 100);
  // no unit → treat as count if food has "each", else grams
  return qty * (food.each ? food.each : 100);
}

function _findFood(text) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  let best = null, bestScore = 0;
  for (const f of FOOD_DB) {
    for (const n of f.names) {
      if (t === n) return f;
      const tHasN = t.includes(n), nHasT = n.includes(t);
      if (tHasN || nHasT) {
        const score = n.length / Math.max(t.length, n.length);
        if (score > bestScore) { bestScore = score; best = f; }
      }
    }
  }
  return bestScore >= 0.35 ? best : null;
}

function _parseChunk(chunk) {
  let s = chunk.toLowerCase().trim();
  // Remove leading "a", "an", filler words
  s = s.replace(/^(some|about|approx\.?|approximately)\s+/i, '');

  // Match: <qty> <unit> <food> OR <qty> <food>
  const re = /^([0-9]+(?:[.,][0-9]+)?|[a-z]+)\s+([a-z]+)?\s*(?:of\s+)?(.+)$/;
  const m = s.match(re);
  let qty = 1, unit = '', foodText = s;

  if (m) {
    const rawQty = m[1];
    const tok2   = (m[2] || '').toLowerCase();
    const rest   = (m[3] || '').toLowerCase().trim();

    // Is rawQty a number or word-number?
    const numVal = parseFloat(rawQty.replace(',','.'));
    const wordVal = WORD_NUMS[rawQty.toLowerCase()];
    if (!isNaN(numVal)) {
      qty = numVal;
      // Is tok2 a unit?
      const unitCheck = tok2.replace(/[^a-z]/g,'');
      const allUnits = {...UNIT_G,...UNIT_CUP,...UNIT_TBSP,...UNIT_TSP,...UNIT_OZ,...UNIT_LB,...UNIT_EACH};
      if (allUnits[unitCheck]) { unit = unitCheck; foodText = rest; }
      else { foodText = (tok2 + ' ' + rest).trim(); }
    } else if (wordVal !== undefined) {
      qty = wordVal;
      const unitCheck = tok2.replace(/[^a-z]/g,'');
      const allUnits = {...UNIT_G,...UNIT_CUP,...UNIT_TBSP,...UNIT_TSP,...UNIT_OZ,...UNIT_LB,...UNIT_EACH};
      if (allUnits[unitCheck]) { unit = unitCheck; foodText = rest; }
      else { foodText = (tok2 + ' ' + rest).trim(); }
    }
  }

  const food = _findFood(foodText);
  if (!food) return null;

  const grams = _toGrams(qty, unit, food);
  const scale = grams / 100;
  const label = chunk.trim().replace(/\s+/g,' ');
  return {
    name: label.charAt(0).toUpperCase() + label.slice(1),
    calories: Math.round(food.cal * scale),
    protein:  Math.round(food.pro * scale * 10) / 10,
    carbs:    Math.round(food.carb * scale * 10) / 10,
    fat:      Math.round(food.fat * scale * 10) / 10,
  };
}

// Robustly extract the first complete JSON array using bracket depth matching
function _extractJsonArray(str) {
  const start = str.indexOf('[');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc2 = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (esc2)          { esc2 = false; continue; }
    if (c === '\\' && inStr) { esc2 = true; continue; }
    if (c === '"')     { inStr = !inStr; continue; }
    if (inStr)         continue;
    if (c === '[')     depth++;
    if (c === ']') { depth--; if (depth === 0) return str.slice(start, i + 1); }
  }
  return null;
}

async function calculateMealDescription() {
  const ta = document.getElementById('describe-textarea');
  const out = document.getElementById('describe-output');
  const btn = document.getElementById('calc-macros-btn');
  if (!ta || !out) return;
  const text = ta.value.trim();
  if (!text) { out.innerHTML = '<p class="dm-hint">Describe what you ate above.</p>'; return; }

  out.innerHTML = '<p class="dm-hint" style="text-align:center">✦ Calculating macros…</p>';
  if (btn) { btn.disabled = true; btn.textContent = 'Calculating…'; }

  try {
    const sysPrompt =
      'You are a precise nutrition calculator. ' +
      'The user will describe any food or meal in any format — vague, detailed, slang, restaurant items, branded foods, anything. ' +
      'Your job: estimate the macros for everything described and return ONLY a JSON array. No prose, no markdown, no explanations. ' +
      'Format: [{"name":"<food>","calories":<kcal>,"protein":<g>,"carbs":<g>,"fat":<g>},...] ' +
      'Rules: calories and all macros must be integers. Use typical serving sizes if not specified. ' +
      'If the user mentions a quantity (e.g. "2 eggs", "large pizza"), scale accordingly — list it as one item with total macros. ' +
      'If something is truly unidentifiable, make your best estimate. Never refuse or add text outside the JSON array. ' +
      'Example input: "bowl of oats with banana and honey" ' +
      'Example output: [{"name":"Oats (80g)","calories":300,"protein":10,"carbs":54,"fat":6},{"name":"Banana","calories":89,"protein":1,"carbs":23,"fat":0},{"name":"Honey (1 tbsp)","calories":64,"protein":0,"carbs":17,"fat":0}]';

    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 30000);
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: _ac.signal,
      body: JSON.stringify({
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: text }
        ],
        model: 'openai',
        seed: 42,
        private: true
      })
    });
    clearTimeout(_to);

    const raw = await res.text();
    // Strip any markdown fences, then use bracket-depth extraction
    const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonStr = _extractJsonArray(clean);
    if (!jsonStr) {
      out.innerHTML = `<p class="dm-hint dm-warn">Could not find JSON in response. Raw: ${esc(raw.slice(0,300))}</p>`;
      return;
    }
    let items;
    try { items = JSON.parse(jsonStr); } catch(pe) {
      out.innerHTML = `<p class="dm-hint dm-warn">Parse error: ${esc(String(pe))}. Raw: ${esc(raw.slice(0,300))}</p>`;
      return;
    }
    if (!Array.isArray(items) || !items.length) throw new Error('Empty result');

    _parsedMealItems = items.map(it => ({
      name:     String(it.name || 'Food'),
      calories: Math.round(Number(it.calories) || 0),
      protein:  Math.round(Number(it.protein)  || 0),
      carbs:    Math.round(Number(it.carbs)     || 0),
      fat:      Math.round(Number(it.fat)       || 0),
    }));
    _renderParsedItems(out);
  } catch(e) {
    if (e.name === 'AbortError') {
      out.innerHTML = `<p class="dm-hint dm-warn">AI service timed out. Please try again later.</p>`;
    } else {
      out.innerHTML = `<p class="dm-hint dm-warn">AI service unavailable, please try again later.</p>`;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'CALCULATE MACROS'; }
  }
}

function _renderParsedItems(out) {
  if (!out) out = document.getElementById('describe-output');
  if (!out) return;
  if (!_parsedMealItems.length) { out.innerHTML = ''; return; }
  const rows = _parsedMealItems.map((it, i) => `
    <div class="dm-row">
      <div class="dm-row-name">${esc(it.name)}</div>
      <div class="dm-row-macros">${it.calories} cal · ${it.protein}P · ${it.carbs}C · ${it.fat}F</div>
      <button class="dm-remove" onclick="_parsedMealItems.splice(${i},1);_renderParsedItems()">×</button>
    </div>`).join('');
  const total = _parsedMealItems.reduce((s,i) => s + i.calories, 0);
  out.innerHTML = `${rows}
    <div class="dm-total">${total} cal total</div>
    <button class="w-action-btn" style="width:100%;margin-top:10px" onclick="addAllDescribed()">ADD ALL TO MEAL</button>`;
}

function addAllDescribed() {
  if (!_parsedMealItems.length) return;
  curMealItems.push(..._parsedMealItems);
  _parsedMealItems = [];
  go('dietAddMeal');
}

// ── PHOTO MACRO SCANNER ──────────────────────────────────────────────────
function triggerFoodPhoto() {
  const inp = document.getElementById('food-photo-input');
  if (inp) inp.click();
}

async function handleFoodPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;

  const out = document.getElementById('photo-output');
  if (out) out.innerHTML = '<p class="dm-hint" style="text-align:center">✦ Analyzing photo…</p>';

  // Show preview
  const preview = document.getElementById('photo-preview');
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" class="food-photo-img">`;
  }

  try {
    // Convert to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Resize if too large (max ~800px) to reduce payload
    const resized = await _resizeImage(base64, 800);

    const sysPrompt =
      'You are a precise food nutrition analyzer. ' +
      'The user will send a photo of food. Identify every food item visible and estimate macros. ' +
      'Return ONLY a JSON array. No prose, no markdown, no explanations. ' +
      'Format: [{"name":"<food>","calories":<kcal>,"protein":<g>,"carbs":<g>,"fat":<g>},...] ' +
      'Rules: calories and all macros must be integers. Estimate portion sizes from visual cues. ' +
      'If unsure about exact amounts, give your best estimate based on typical portions. ' +
      'Never refuse or add text outside the JSON array.';

    const _ac2 = new AbortController();
    const _to2 = setTimeout(() => _ac2.abort(), 30000);
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: _ac2.signal,
      body: JSON.stringify({
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: resized } },
            { type: 'text', text: 'Analyze this food photo and return the macro breakdown as a JSON array.' }
          ]}
        ],
        model: 'openai',
        seed: 42,
        private: true
      })
    });
    clearTimeout(_to2);

    const raw = await res.text();
    const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonStr = _extractJsonArray(clean);

    if (!jsonStr) {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">Could not identify food. Try a clearer photo or describe it instead.</p>`;
      return;
    }

    let items;
    try { items = JSON.parse(jsonStr); } catch(pe) {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">Parse error. Try again or describe your meal instead.</p>`;
      return;
    }
    if (!Array.isArray(items) || !items.length) throw new Error('No food detected');

    _parsedMealItems = items.map(it => ({
      name:     String(it.name || 'Food'),
      calories: Math.round(Number(it.calories) || 0),
      protein:  Math.round(Number(it.protein)  || 0),
      carbs:    Math.round(Number(it.carbs)     || 0),
      fat:      Math.round(Number(it.fat)       || 0),
    }));
    _renderParsedItems(out);

  } catch(e) {
    if (e.name === 'AbortError') {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">AI service timed out. Please try again later.</p>`;
    } else {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">AI service unavailable, please try again later.</p>`;
    }
  }

  // Reset file input so same file can be re-selected
  input.value = '';
}

function _resizeImage(base64, maxDim) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) { resolve(base64); return; }
      const scale = Math.min(maxDim / width, maxDim / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

function renderDietAddMeal() {
  const types = ['Breakfast','Lunch','Dinner','Snack'];
  const typeBtns = types.map(t => `<button class="d-type-btn${t===curMealType?' active':''}" onclick="setMealType('${t}')">${t}</button>`).join('');

  const itemsList = curMealItems.length ? curMealItems.map((it, i) =>
    `<div class="d-fi"><span>${esc(it.name)}</span><div style="display:flex;align-items:center;gap:8px"><span class="d-fi-macros">${it.calories}cal ${it.protein}P ${it.carbs}C ${it.fat}F</span><button class="d-del-btn" onclick="removeFoodItem(${i})">\u00D7</button></div></div>`
  ).join('') : '<p style="font-size:12px;color:var(--text-muted);padding:8px 0">No items added yet.</p>';

  const totalCal = curMealItems.reduce((s,i) => s + i.calories, 0);

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="curMealItems=[];selectedFood100g=null;go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Add Meal</div><div class="page-sub">Log what you ate.</div></div>
    <div class="d-type-btns">${typeBtns}</div>
    <div style="padding:0 24px">
      <div class="sec-lbl" style="padding:0 0 8px">Items${curMealItems.length ? ` \u00B7 ${totalCal} cal total` : ''}</div>
      <div class="d-items-list">${itemsList}</div>

      <div class="dm-section">
        <div class="dm-header">
          <span class="dm-icon">📸</span>
          <span class="dm-header-text">Scan Food Photo</span>
          <span class="dm-header-sub">AI identifies & calculates</span>
        </div>
        <input type="file" accept="image/*" capture="environment" id="food-photo-input" style="display:none" onchange="handleFoodPhoto(this)">
        <button class="w-action-btn photo-scan-btn" style="width:100%;margin:0" onclick="triggerFoodPhoto()">
          <span style="font-size:18px">📷</span> TAKE PHOTO OR CHOOSE IMAGE
        </button>
        <div id="photo-preview" class="photo-preview"></div>
        <div id="photo-output" class="dm-output"></div>
      </div>

      <div class="dm-section">
        <div class="dm-header">
          <span class="dm-icon">✦</span>
          <span class="dm-header-text">Describe your meal</span>
          <span class="dm-header-sub">Instant macro calc</span>
        </div>
        <textarea class="dm-textarea" id="describe-textarea" rows="3" placeholder="e.g. Big Mac and large fries, a bowl of pasta with chicken, 2 eggs and toast with butter…"></textarea>
        <button class="w-action-btn" id="calc-macros-btn" style="width:100%;margin:8px 0 0" onclick="calculateMealDescription()">CALCULATE MACROS</button>
        <div id="describe-output" class="dm-output"></div>
      </div>

      <div class="sec-lbl" style="padding:12px 0 8px">Or Search Foods</div>
      <div class="fs-input-row">
        <input class="d-input" type="text" id="food-search-input" placeholder="Search foods... e.g. chicken breast" style="flex:1;margin:0" onkeydown="if(event.key==='Enter')doFoodSearch()">
        <button class="fs-search-btn" id="food-search-btn" onclick="doFoodSearch()">SEARCH</button>
      </div>
      <div class="ani" id="food-search-results"></div>

      <div class="j-lbl">Add Item</div>
      <div id="food-grams-wrap" style="display:${selectedFood100g ? 'flex' : 'none'}" class="fs-grams-row">
        <span class="fs-grams-label">Amount (g)</span>
        <input class="d-input" type="number" id="food-grams" value="100" min="1" max="2000" step="1" style="flex:1;margin:0" oninput="scaleFoodMacros()">
      </div>
      <input class="d-input" type="text" id="fi-name" placeholder="Food name (e.g. Chicken breast 200g)">
      <div class="d-input-row">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-cal" placeholder="Cal">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-p" placeholder="Protein">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-c" placeholder="Carbs">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-f" placeholder="Fat">
      </div>
      <button class="w-action-btn" style="width:100%;margin:12px 0" onclick="addFoodItem()">ADD ITEM</button>
      <button class="w-action-btn" style="width:100%;margin:0 0 12px;background:rgba(110,159,212,0.1);border-color:var(--pro);color:var(--pro)" onclick="go('dietRecipes')">QUICK ADD FROM RECIPES \u2192</button>
    </div>
    <button class="w-finish" onclick="saveMeal()"${curMealItems.length?'':' style="opacity:0.4;pointer-events:none"'}>SAVE MEAL</button>`;
}

function setMealType(t) { curMealType = t; go('dietAddMeal'); }

async function doFoodSearch() {
  const input = document.getElementById('food-search-input');
  const container = document.getElementById('food-search-results');
  if (!input || !container) return;
  const q = input.value.trim();
  if (q.length < 2) { container.innerHTML = '<div class="fs-status">Type at least 2 characters.</div>'; return; }
  container.innerHTML = '<div class="fs-status">Searching\u2026</div>';
  const results = await searchFoods(q);
  if (results && results.rateLimited) {
    container.innerHTML = '<div class="fs-status" style="color:var(--fat)">Food database rate limit reached. Try again in a minute, or use "Describe a meal" above.</div>';
    return;
  }
  if (!results || !results.length) {
    container.innerHTML = '<div class="fs-status">No results found. Enter manually below.</div>';
    return;
  }
  container.innerHTML = results.map((r, i) =>
    `<div class="fs-row" id="fs-row-${i}" onclick="selectFoodResult(${i})">
      <div class="fs-row-name">${esc(r.name)}</div>
      <div class="fs-row-macros">${Math.round(r.cal100g)} kcal \u00B7 ${Math.round(r.protein100g)}g P \u00B7 ${Math.round(r.carbs100g)}g C \u00B7 ${Math.round(r.fat100g)}g F  (per 100g)</div>
    </div>`
  ).join('');
  container._results = results;
}

function selectFoodResult(idx) {
  const container = document.getElementById('food-search-results');
  if (!container || !container._results) return;
  const r = container._results[idx];
  if (!r) return;
  selectedFood100g = { cal: r.cal100g, protein: r.protein100g, carbs: r.carbs100g, fat: r.fat100g };
  container.querySelectorAll('.fs-row').forEach((el, i) => el.classList.toggle('selected', i === idx));
  const nameEl = document.getElementById('fi-name');
  if (nameEl) nameEl.value = r.name;
  const gramsWrap = document.getElementById('food-grams-wrap');
  if (gramsWrap) gramsWrap.style.display = 'flex';
  const gramsEl = document.getElementById('food-grams');
  if (gramsEl) gramsEl.value = '100';
  scaleFoodMacros();
  const nameField = document.getElementById('fi-name');
  if (nameField) nameField.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function scaleFoodMacros() {
  if (!selectedFood100g) return;
  const grams = parseFloat(document.getElementById('food-grams')?.value) || 100;
  const scale = grams / 100;
  const calEl = document.getElementById('fi-cal'), pEl = document.getElementById('fi-p'), cEl = document.getElementById('fi-c'), fEl = document.getElementById('fi-f');
  if (calEl) calEl.value = Math.round(selectedFood100g.cal * scale * 10) / 10;
  if (pEl) pEl.value = Math.round(selectedFood100g.protein * scale * 10) / 10;
  if (cEl) cEl.value = Math.round(selectedFood100g.carbs * scale * 10) / 10;
  if (fEl) fEl.value = Math.round(selectedFood100g.fat * scale * 10) / 10;
}

function addFoodItem() {
  const name = document.getElementById('fi-name')?.value?.trim();
  if (!name) return;
  curMealItems.push({
    name,
    calories: parseFloat(document.getElementById('fi-cal')?.value) || 0,
    protein: parseFloat(document.getElementById('fi-p')?.value) || 0,
    carbs: parseFloat(document.getElementById('fi-c')?.value) || 0,
    fat: parseFloat(document.getElementById('fi-f')?.value) || 0,
  });
  selectedFood100g = null;
  go('dietAddMeal');
}

function removeFoodItem(i) { curMealItems.splice(i, 1); go('dietAddMeal'); }

function saveMeal() {
  if (!curMealItems.length) return;
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({ id: 'm_' + Date.now(), name: curMealType, items: [...curMealItems] });
  LS.set('hvi_meal_log', mealLog);
  awardXP(15, 'body');
  const _dm = getDayMacros();
  if (dietMeta.dailyGoals.protein > 0 && _dm.p >= dietMeta.dailyGoals.protein * 0.9) trackWeeklyProtein();
  checkDailyQuests();
  curMealItems = [];
  selectedFood100g = null;
  go('diet');
}

function renderDietRecipes() {
  const cats = ['Breakfast','Lunch','Dinner','Snack'];
  const groups = cats.map(cat => {
    const recs = RECIPES.filter(r => r.cat === cat);
    if (!recs.length) return '';
    return `<div class="sec-lbl" style="padding-top:16px">${cat}</div>` + recs.map(r => `
      <div class="d-recipe-card" onclick="go('dietRecipeDetail',{recipeId:'${r.id}'})">
        <div class="d-recipe-name">${r.name}</div>
        <div class="d-recipe-macros-row">${r.cal} cal \u00B7 ${r.p}P \u00B7 ${r.c}C \u00B7 ${r.f}F</div>
      </div>`).join('');
  }).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Recipes</div><div class="page-sub">Quick meal ideas with macros.</div></div>
    <div class="d-recipe-grid ani">${groups}</div>`;
}

function renderDietRecipeDetail() {
  const r = RECIPES.find(x => x.id === curRecipeId);
  if (!r) { go('dietRecipes'); return; }
  const ingHTML = r.ing.map(i => `\u2022 ${esc(i)}`).join('<br>');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('dietRecipes')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">${esc(r.name)}</div>
      <div class="page-sub">${r.cal} cal \u00B7 ${r.p}g protein \u00B7 ${r.c}g carbs \u00B7 ${r.f}g fat</div></div>
    <div class="d-recipe-detail ani">
      <div class="sec-lbl" style="padding:0 0 8px">Ingredients</div>
      <div class="d-recipe-ing">${ingHTML}</div>
      <div class="sec-lbl" style="padding:16px 0 8px">Instructions</div>
      <div class="d-recipe-steps">${esc(r.steps)}</div>
    </div>
    <button class="w-finish" onclick="logRecipe('${r.id}')">Add to Today's Meals</button>`;
}

function logRecipe(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({
    id: 'm_' + Date.now(),
    name: r.cat,
    items: [{ name: r.name, calories: r.cal, protein: r.p, carbs: r.c, fat: r.f }]
  });
  LS.set('hvi_meal_log', mealLog);
  go('diet');
}

function renderDietGoals() {
  const g = dietMeta.dailyGoals;
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Daily Goals</div><div class="page-sub">Set your daily macro targets.</div></div>
    <div class="d-goals-form ani">
      <div class="d-goals-row"><div class="d-goals-label">Calories</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-cal" value="${g.calories}"></div>
      <div class="d-goals-row"><div class="d-goals-label">Protein</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-p" value="${g.protein}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
      <div class="d-goals-row"><div class="d-goals-label">Carbs</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-c" value="${g.carbs}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
      <div class="d-goals-row"><div class="d-goals-label">Fat</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-f" value="${g.fat}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
    </div>
    <button class="w-action-btn" style="margin-bottom:0" onclick="go('dietTDEE')">TDEE CALCULATOR</button>
    <button class="w-finish" onclick="saveDietGoals()">SAVE GOALS</button>`;
}

function saveDietGoals() {
  dietMeta.dailyGoals = {
    calories: parseInt(document.getElementById('dg-cal')?.value) || 2500,
    protein: parseInt(document.getElementById('dg-p')?.value) || 180,
    carbs: parseInt(document.getElementById('dg-c')?.value) || 280,
    fat: parseInt(document.getElementById('dg-f')?.value) || 80,
  };
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

// ── TDEE CALCULATOR ──────────────────────────────────────────────────────
function injectTDEEStyles() {
  if (document.getElementById('tdee-styles')) return;
  const s = document.createElement('style');
  s.id = 'tdee-styles';
  s.textContent = `
    .tp-pill{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:var(--surface);color:var(--text);cursor:pointer;width:100%;text-align:left;margin-bottom:6px;font-size:13px;letter-spacing:0.05em;transition:all .2s}
    .tp-pill.active{background:var(--surface2);border-color:var(--accent-b)}
    .tp-pill-sub{font-size:11px;color:var(--text-dim);text-align:right;max-width:55%}
    .tp-sex-row{display:flex;gap:8px;margin-bottom:8px}
    .tp-sex-btn{flex:1;padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:var(--surface);color:var(--text);cursor:pointer;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:center;transition:all .2s}
    .tp-sex-btn.active{border-color:var(--accent);color:var(--accent-b)}
    .tp-input-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .tp-input-card{background:var(--surface2);border-radius:10px;padding:12px}
    .tp-input-label{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .tp-input{width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:var(--surface);color:var(--text);font-size:15px;box-sizing:border-box}
    .tp-result-box{background:var(--surface2);border-radius:14px;padding:20px;margin-top:16px;text-align:center}
    .tp-tdee-label{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px}
    .tp-tdee-num{font-family:var(--serif);font-size:48px;color:var(--accent-b);margin:8px 0}
    .tp-tdee-unit{font-size:12px;color:var(--text-dim)}
    .tp-macro-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .tp-macro-card{background:var(--surface);border-radius:10px;padding:12px;text-align:center}
    .tp-macro-val{font-size:20px;font-weight:700;font-family:var(--serif)}
    .tp-macro-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
    .tp-error{color:var(--fat);font-size:13px;padding:8px 0;text-align:center}
    .tp-confirm{color:var(--carb);font-size:13px;padding:8px 0;text-align:center}
  `;
  document.head.appendChild(s);
}

let _tdeeSex = 'male', _tdeeActivity = 'moderate', _tdeeGoal = 'maintain';

function renderDietTDEE() {
  injectTDEEStyles();
  if (tdeeProfile) {
    _tdeeSex = tdeeProfile.sex || 'male';
    _tdeeActivity = tdeeProfile.activity || 'moderate';
    _tdeeGoal = tdeeProfile.goal || 'maintain';
  }

  const activities = [
    ['sedentary', 'SEDENTARY', 'Desk job, little or no exercise'],
    ['light', 'LIGHTLY ACTIVE', 'Light exercise 1\u20133 days/week'],
    ['moderate', 'MODERATELY ACTIVE', 'Moderate exercise 3\u20135 days/week'],
    ['active', 'VERY ACTIVE', 'Hard exercise 6\u20137 days/week'],
    ['very_active', 'EXTREMELY ACTIVE', 'Physical job + hard training'],
  ];
  const goals = [
    ['cut', 'AGGRESSIVE CUT', '\u2212500 cal deficit'],
    ['cut_mild', 'MILD CUT', '\u2212250 cal deficit'],
    ['maintain', 'MAINTAIN', 'Eat at TDEE'],
    ['bulk_lean', 'LEAN BULK', '+250 cal surplus'],
    ['bulk', 'BULK', '+500 cal surplus'],
  ];

  const actHTML = activities.map(([k, lbl, sub]) =>
    `<button class="tp-pill tp-act${_tdeeActivity===k?' active':''}" onclick="_tdeeActivity='${k}';document.querySelectorAll('.tp-act').forEach(e=>e.classList.remove('active'));this.classList.add('active')">
      <span>${lbl}</span><span class="tp-pill-sub">${sub}</span></button>`
  ).join('');

  const goalHTML = goals.map(([k, lbl, sub]) =>
    `<button class="tp-pill tp-goal${_tdeeGoal===k?' active':''}" onclick="_tdeeGoal='${k}';document.querySelectorAll('.tp-goal').forEach(e=>e.classList.remove('active'));this.classList.add('active')">
      <span>${lbl}</span><span class="tp-pill-sub">${sub}</span></button>`
  ).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('dietGoals')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">TDEE Calculator</div><div class="page-sub">Find your daily energy target.</div></div>

    <div style="padding:0 24px">
      <div class="sec-lbl ani" style="padding-top:8px">Your Stats</div>
      <div class="tp-sex-row ani">
        <button class="tp-sex-btn${_tdeeSex==='male'?' active':''}" id="tdee-male" onclick="_tdeeSex='male';document.getElementById('tdee-male').classList.add('active');document.getElementById('tdee-female').classList.remove('active')">MALE</button>
        <button class="tp-sex-btn${_tdeeSex==='female'?' active':''}" id="tdee-female" onclick="_tdeeSex='female';document.getElementById('tdee-female').classList.add('active');document.getElementById('tdee-male').classList.remove('active')">FEMALE</button>
      </div>
      <div class="tp-input-grid ani">
        <div class="tp-input-card"><div class="tp-input-label">Age (years)</div><input class="tp-input" type="number" id="tdee-age" min="10" max="100" value="${tdeeProfile?.age||''}"></div>
        <div class="tp-input-card"><div class="tp-input-label">Weight (kg)</div><input class="tp-input" type="number" id="tdee-weight" min="20" max="300" step="0.1" value="${tdeeProfile?.weight_kg||''}"></div>
        <div class="tp-input-card"><div class="tp-input-label">Height (cm)</div><input class="tp-input" type="number" id="tdee-height" min="100" max="250" value="${tdeeProfile?.height_cm||''}"></div>
      </div>

      <div class="sec-lbl ani" style="padding-top:20px">Activity Level</div>
      <div class="ani">${actHTML}</div>

      <div class="sec-lbl ani" style="padding-top:20px">Your Goal</div>
      <div class="ani">${goalHTML}</div>
    </div>

    <button class="w-finish" onclick="calculateTDEE()">CALCULATE</button>
    <div id="tdee-error"></div>
    <div id="tdee-results"></div>`;
}

function calculateTDEE() {
  const age = parseFloat(document.getElementById('tdee-age')?.value);
  const weight = parseFloat(document.getElementById('tdee-weight')?.value);
  const height = parseFloat(document.getElementById('tdee-height')?.value);
  const errEl = document.getElementById('tdee-error');
  const resEl = document.getElementById('tdee-results');

  if (!age || !weight || !height || age < 10 || weight < 20 || height < 100) {
    if (errEl) errEl.innerHTML = '<div class="tp-error">Please fill in all fields before calculating.</div>';
    if (resEl) resEl.innerHTML = '';
    return;
  }
  if (errEl) errEl.innerHTML = '';

  // Mifflin-St Jeor
  const bmr = (10 * weight) + (6.25 * height) - (5 * age) + (_tdeeSex === 'male' ? 5 : -161);
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee = Math.round(bmr * (multipliers[_tdeeActivity] || 1.55));
  const offsets = { cut: -500, cut_mild: -250, maintain: 0, bulk_lean: 250, bulk: 500 };
  const target = tdee + (offsets[_tdeeGoal] || 0);
  const splits = {
    cut:       { p: 0.35, c: 0.35, f: 0.30 },
    cut_mild:  { p: 0.35, c: 0.35, f: 0.30 },
    maintain:  { p: 0.30, c: 0.40, f: 0.30 },
    bulk_lean: { p: 0.30, c: 0.45, f: 0.25 },
    bulk:      { p: 0.25, c: 0.50, f: 0.25 },
  };
  const sp = splits[_tdeeGoal] || splits.maintain;
  const protein_g = Math.round((target * sp.p) / 4);
  const carbs_g = Math.round((target * sp.c) / 4);
  const fat_g = Math.round((target * sp.f) / 9);

  // Save profile
  tdeeProfile = { age, sex: _tdeeSex, weight_kg: weight, height_cm: height, activity: _tdeeActivity, goal: _tdeeGoal };
  LS.set('hvi_tdee_profile', tdeeProfile);

  resEl.innerHTML = `
    <div class="tp-result-box ani">
      <div class="tp-tdee-label">YOUR TDEE</div>
      <div class="tp-tdee-num">${tdee.toLocaleString()}</div>
      <div class="tp-tdee-unit">calories / day</div>

      <div class="s-grid" style="margin:16px 0 0">
        <div class="s-card"><div class="s-val">${Math.round(bmr).toLocaleString()}</div><div class="s-lbl">BMR</div></div>
        <div class="s-card"><div class="s-val">${tdee.toLocaleString()}</div><div class="s-lbl">TDEE</div></div>
        <div class="s-card"><div class="s-val">${target.toLocaleString()}</div><div class="s-lbl">Target</div></div>
      </div>

      <div class="sec-lbl" style="padding:20px 0 8px;text-align:left">Recommended Macros</div>
      <div class="tp-macro-grid">
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--cal)">${target.toLocaleString()}</div><div class="tp-macro-lbl">Calories</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--pro)">${protein_g}g</div><div class="tp-macro-lbl">Protein</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--carb)">${carbs_g}g</div><div class="tp-macro-lbl">Carbs</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--fat)">${fat_g}g</div><div class="tp-macro-lbl">Fat</div></div>
      </div>
    </div>
    <button class="w-finish" onclick="applyTDEEGoals(${target},${protein_g},${carbs_g},${fat_g})">APPLY TO GOALS</button>
    <div id="tdee-confirm"></div>`;

  resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyTDEEGoals(cal, p, c, f) {
  dietMeta.dailyGoals = { calories: cal, protein: p, carbs: c, fat: f };
  LS.set('hvi_diet_meta', dietMeta);
  const el = document.getElementById('tdee-confirm');
  if (el) {
    el.innerHTML = '<div class="tp-confirm">\u2713 Goals updated</div>';
    setTimeout(() => { if (el) el.innerHTML = ''; }, 2000);
  }
}

// ── ADAPTIVE NUTRITION ACTIONS ────────────────────────────────────────────
function logWeight() {
  const val = parseFloat(document.getElementById('wt-input')?.value);
  if (!val || val < 20 || val > 300) return;
  weightLog[today()] = val;
  LS.set('hvi_weight_log', weightLog);
  go('diet');
}

function setGoalType(type) {
  dietMeta.goalType = type;
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

function applyAdaptiveTarget() {
  const tdee = computeTDEE(weightLog, mealLog);
  const adaptive = computeAdaptiveTarget(tdee, dietMeta.goalType || 'maintain', weightLog);
  if (!adaptive) return;
  dietMeta.dailyGoals.calories = adaptive.calories;
  dietMeta.dailyGoals.protein = adaptive.protein;
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

function renderDietTrend() {
  weightLog = LS.get('hvi_weight_log', {});
  const trend = computeTrend(weightLog);

  let chartHTML = '';
  if (trend.length < 3) {
    chartHTML = '<div class="dt-placeholder">Log your weight daily to see your trend.</div>';
  } else {
    const W = 320, H = 160, ML = 30, MB = 20;
    const cW = W - ML, cH = H - MB;
    const rawVals = trend.map(t => t.raw);
    const minW = Math.min(...rawVals) - 2, maxW = Math.max(...rawVals) + 2;
    const range = maxW - minW || 1;

    const x = i => ML + (i / (trend.length - 1)) * cW;
    const y = v => cH - ((v - minW) / range) * cH;

    const dots = trend.map((t, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(t.raw).toFixed(1)}" r="3" fill="var(--text-dim)" opacity="0.4"/>`).join('');
    const linePts = trend.map((t, i) => `${x(i).toFixed(1)},${y(t.ema).toFixed(1)}`).join(' ');
    const firstDate = trend[0].date.slice(5);
    const lastDate = trend[trend.length - 1].date.slice(5);

    chartHTML = `<div class="dt-chart ani">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
        <line x1="${ML}" y1="${cH}" x2="${W}" y2="${cH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <line x1="${ML}" y1="0" x2="${ML}" y2="${cH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <text x="${ML}" y="${H - 4}" fill="var(--text-dim)" font-size="9">${firstDate}</text>
        <text x="${W}" y="${H - 4}" fill="var(--text-dim)" font-size="9" text-anchor="end">${lastDate}</text>
        <text x="${ML - 4}" y="12" fill="var(--text-dim)" font-size="9" text-anchor="end">${maxW.toFixed(1)}</text>
        <text x="${ML - 4}" y="${cH}" fill="var(--text-dim)" font-size="9" text-anchor="end">${minW.toFixed(1)}</text>
        ${dots}
        <polyline points="${linePts}" fill="none" stroke="var(--accent-b)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    </div>`;
  }

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Weight Trend</div><div class="page-sub">Raw weights &amp; smoothed EMA trend.</div></div>
    ${chartHTML}`;
}
