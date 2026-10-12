// Nothing goes to an AI provider until the person has said yes.
//
// The coach, the daily focus on home and the meal scanner send what was typed
// or photographed, and for the coach a summary of recent logs, to Google Gemini
// and Groq through the Worker. The daily focus used to do that by itself on
// the first open of home each day, for everyone, without asking.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'connect.js', 'diet.js', 'coach.js'];
const wait = ms => new Promise(r => setTimeout(r, ms));
const aiCalls = s => s._fetches.filter(f => /arete-ai\.oskarsteinicke\.workers\.dev/.test(f.url));

function sb(store) {
  const reply = { choices: [{ message: { content: 'ok' } }], candidates: [{ content: { parts: [{ text: 'Train as planned.' }] } }] };
  const s = createSandbox({
    files: FILES, store: Object.assign({ hvi_onboarded: 'true' }, store || {}),
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reply), text: () => Promise.resolve('') }),
  });
  run(s, `settings={}; curView='home'; habits=[]; log={}; journal={}; workoutLog={}; workoutMeta={}; mealLog={}; sleepLog={};
          weightLog={}; prs={}; gamification={xp:0,level:1}; achievements=[]; goals=[]; tdeeProfile=null;
          meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
          dietMeta={dailyGoals:{calories:2200,protein:160,carbs:220,fat:70}};
          track=function(){}; go=function(){}; isPremium=function(){ return true; };
          AbortController=function(){ this.signal = {}; this.abort = function(){}; };`);
  return s;
}

module.exports = async function () {
  const r = createReporter('aiconsent');

  r.section('without a yes, nothing is sent');
  {
    const s = sb();
    run(s, `_err = []; _aiFetch([{ role: 'user', content: 'hi' }]).catch(function (e) { _err.push('chat:' + e.message); });
            fetchCoachInsight(false).catch(function (e) { _err.push('focus:' + e.message); });`);
    await wait(30);
    r.check('a chat or meal request is refused', /chat:ai-consent/.test(run(s, '_err.join()')), run(s, '_err.join()'));
    r.check('so is the daily focus', /focus:ai-consent/.test(run(s, '_err.join()')), run(s, '_err.join()'));
    r.check('and no request left the device', aiCalls(s).length === 0, `(${aiCalls(s).length} sent)`);

    const card = run(s, 'coachInsightCardHTML()') || '';
    await wait(500);   // the card used to fetch 400ms after being drawn
    r.check('home offers the daily focus instead of fetching it', /Turn on/.test(card) && !/Reading your day/.test(card), '(card fetches unasked)');
    r.check('and still sends nothing', aiCalls(s).length === 0, `(${aiCalls(s).length} sent)`);
  }

  r.section('the things you tap ask first');
  {
    const s = sb();
    run(s, 'openCoach()');
    r.check('opening the coach asks before the chat opens', run(s, '_aiConsentThen === openCoach') === true);
    run(s, `_aiConsentThen = null; document.getElementById('describe-textarea').value = 'two eggs on toast'; calculateMealDescription();`);
    r.check('describing a meal asks', run(s, 'typeof _aiConsentThen') === 'function');
    run(s, `_aiConsentThen = null; handleFoodPhoto({ files: [{ name: 'meal.jpg', type: 'image/jpeg' }] });`);
    r.check('a chosen photo waits for the answer', run(s, 'typeof _aiConsentThen') === 'function');
    await wait(30);
    r.check('none of them sent anything yet', aiCalls(s).length === 0, `(${aiCalls(s).length} sent)`);
  }

  r.section('the answer is theirs, and it is spelled out');
  {
    const s = sb();
    run(s, `_made = []; var _ce = document.createElement; document.createElement = function (t) { var e = _ce.call(document, t); _made.push(e); return e; };
            _ran = 0; withAIConsent(function () { _ran++; });`);
    const html = run(s, `_made.length ? _made[0].innerHTML : ''`) || '';
    r.check('it names who receives the data', /Gemini/.test(html) && /Groq/.test(html), '(provider not named)');
    r.check('and what is sent', /meal photo/.test(html) && /summary of your recent/.test(html), '(contents not listed)');
    r.check('with a way to say no and a link to the policy', /Not now/.test(html) && /privacy\.html/.test(html));
    r.check('nothing runs while the question is open', run(s, '_ran') === 0);

    run(s, 'answerAIConsent(false)');
    r.check('"Not now" runs nothing', run(s, '_ran') === 0);
    r.check('and is not recorded as a refusal, so they can be asked again', run(s, 'aiConsent()') === '', run(s, 'aiConsent()'));

    run(s, `withAIConsent(function () { _ran++; }); answerAIConsent(true);`);
    r.check('"Allow" is recorded', run(s, 'aiAllowed()') === true);
    r.check('and what they were doing carries on', run(s, '_ran') === 1, `(${run(s, '_ran')})`);
    run(s, `withAIConsent(function () { _ran++; });`);
    r.check('after that there is no second question', run(s, '_ran') === 2 && run(s, '_aiConsentThen') === null);
    r.check('the answer stays on this device', run(s, `SYNC_KEYS.indexOf('hvi_ai_consent')`) === -1, '(consent would sync to other devices)');
  }

  r.section('with a yes, it works as before');
  {
    const s = sb({ hvi_ai_consent: 'yes' });
    run(s, `_out = ''; _aiFetch([{ role: 'user', content: 'hi' }]).then(function (t) { _out = 'answered'; }).catch(function (e) { _out = 'failed:' + e.message; });`);
    await wait(60);
    r.check('a request goes out', aiCalls(s).length >= 1, `(${aiCalls(s).length} sent, ${run(s, '_out')})`);
    const card = run(s, 'coachInsightCardHTML()') || '';
    r.check('home shows the daily focus loading', /Reading your day/.test(card), '(card missing)');
  }

  r.section('turning it off stops everything again');
  {
    const s = sb({ hvi_ai_consent: 'yes', hvi_coach_insight: JSON.stringify({ date: '2026-01-01', text: 'Old advice.' }) });
    run(s, 'setAIConsent(false)');
    r.check('it is recorded as off', run(s, 'aiConsent()') === 'no');
    r.check('the last answer is dropped', run(s, `localStorage.getItem('hvi_coach_insight')`) === null);
    r.check('home no longer shows the card at all', run(s, 'coachInsightCardHTML()') === '');
    run(s, `_e = ''; _aiFetch([{ role: 'user', content: 'hi' }]).catch(function (e) { _e = e.message; });`);
    await wait(30);
    r.check('and requests are refused', run(s, '_e') === 'ai-consent' && aiCalls(s).length === 0, `(${run(s, '_e')}, ${aiCalls(s).length} sent)`);
  }


  // The permission sheet names two companies. A "last resort" used to send the
  // same messages straight from the phone to a third, text.pollinations.ai.
  r.section('AI requests go to Arete\'s server and nowhere else');
  {
    const down = createSandbox({
      files: FILES, store: { hvi_onboarded: 'true', hvi_ai_consent: 'yes' },
      fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    });
    run(down, `settings={}; track=function(){}; AbortController=function(){ this.signal = {}; this.abort = function(){}; };
               _e = ''; _aiFetch([{ role: 'user', content: 'hi' }]).catch(function (e) { _e = e.message || 'failed'; });`);
    await wait(900);   // one retry after 500ms, then the fallback
    const hosts = [...new Set(down._fetches.map(f => { try { return new URL(f.url).host; } catch { return f.url; } }))];
    r.check('with both providers down it fails rather than trying someone else', run(down, '_e') !== '', '(no error surfaced)');
    r.check('every request went to the one server', hosts.length === 1 && hosts[0] === 'arete-ai.oskarsteinicke.workers.dev', `(${hosts.join(', ')})`);
    const fs = require('fs'), path = require('path'), APP = require('./harness').APP;
    const shipped = fs.readdirSync(APP).filter(f => /\.js$/.test(f) && f !== 'service-worker.js');
    const strays = shipped.filter(f => /pollinations|api\.openai\.com|api\.groq\.com|generativelanguage\.googleapis/i.test(
      fs.readFileSync(path.join(APP, f), 'utf8').replace(/\/\/.*$/gm, '')));
    r.check('no app script calls an AI company directly', strays.length === 0, `(${strays.join(', ')})`);
  }

  return r.finish();
};
