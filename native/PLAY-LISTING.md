# Play Store listing

Copy each block straight into Play Console. Character limits noted; all are
inside them.

> The Play Billing blocker described at the bottom is **fixed**: the native build
> now ships with everything unlocked, so nothing routes an Android user to
> Stripe. The copy below matches that. Leave "In-app purchases" unticked.

---

## App name (30 max, using 25)

```
Arete: Habits, Gym & Diet
```

## Short description (80 max, using 77)

```
Log your whole day in one sentence. Habits, gym, food, sleep and an AI coach.
```

## Full description (4000 max, using 2487)

```
Log your whole day in one sentence. "Two eggs and toast, half a litre of water, did my meditation, slept about 6 hours." Arete sorts it into the right places and logs it with one tap.

Habits, training, nutrition, sleep, a journal and an AI coach in one app. The parts talk to each other. Sleep badly and today's session gets lighter. Train hard and your carbs go up. Then Arete shows you what your own days have in common.

LOG ANYTHING
Type it, or tap the microphone on your keyboard and say it. Meals come back with calories and macros, plus water, last night's sleep, habits, weight and mood. You see the list before anything is saved, and one Undo takes it all back.

YOUR PATTERNS
Arete compares your own last 60 days. "After 7+ hours of sleep you finish 92% of your habits. After under 6 hours, 29%." A pattern only shows once there are enough days behind it, and it never claims one thing causes another.

TODAY
Your day in four numbers: training, calories, habits and sleep, with a readiness score built from all of them. Tap one to log it.

HABITS
Five areas: Mind, Body, Mastery, Social and Wealth. Daily, weekly or on set days. Habits show how consistent you have been over the last seven days, not a streak that one missed day sets to zero.

TRAINING
Push/Pull/Legs, Upper/Lower and Full Body programs are built in, or build your own. Every set is logged, personal records are tracked, and the weight goes up when you hit every rep. A short night trims today's session automatically.

A muscle map shows what you trained this week and where you are strongest, scored against an average lifter of your bodyweight.

NUTRITION
Photograph a meal, describe it, or pick something you eat often. Targets come from your height, weight, age and activity, and move with your training day.

SLEEP
Set when you went to bed and when you woke up. Arete works out the rest and asks once a day.

AI COACH
It sees your real data: sleep, sessions, meals, habits, journal and patterns. Ask why you are tired, what to train today or why progress stalled. It answers from your logs and never changes anything without your tap.

NO ACCOUNT NEEDED
Open it and start. Tracking works offline and stays on your device. The AI features need a connection and ask before they are used. Create an account only to sync across devices or join a leaderboard.

Arete is Greek for excellence. Living up to your potential, daily.

COMPETE
Create a group, share the code and see where you stand against friends.
```

No CONNECT section yet. The store builds now have Connected Devices (Whoop,
Strava and Google Fit; Apple Health stays on the website, since it is a
Shortcut there). Once Whoop has been connected on a real phone, put this
back above NO ACCOUNT NEEDED:

    CONNECT
    Whoop, Strava and Google Fit.

---

## Store settings

| Field | Value |
|---|---|
| Category | Health & Fitness |
| Tags | habit tracker, fitness, nutrition, workout log, self improvement |
| Contact email | oskarsteinicke@gmail.com |
| Website | https://get-arete.com |
| Privacy policy | https://get-arete.com/privacy |
| Content rating | Everyone (complete the questionnaire) |
| Ads | No |
| In-app purchases | **No** — see the blocker below |

## Graphics

All in `store-assets/`, checked against Play's rules: screenshots are min 320px
on the short side, max 3840 on the long, and no more than 2x the short side.

| File | Size | Headline and screen |
|---|---|---|
| `00-feature-graphic.png` | 1024x500 | Feature graphic: mark, name, "Become your best self, daily" |
| `01-sleep-sets-the-session.png` | 1440x2880 | YOUR SLEEP SETS THE SESSION. Workout, with today's lighter session after a short night |
| `02-coach.png` | 1440x2880 | A COACH THAT KNOWS YOUR DAY. The coach answering from last night's sleep |
| `03-habits.png` | 1440x2880 | BUILD HABITS THAT STICK. Habits ticked, activity map |
| `04-nutrition.png` | 1440x2880 | TYPE A MEAL. IT'S LOGGED. A typed meal turned into macros |
| `05-every-set.png` | 1440x2880 | EVERY SET. EVERY PR. A session mid-workout, new PR, rest timer |
| `06-muscle-map.png` | 1440x2880 | SEE WHAT YOU TRAINED. The muscle map |
| `07-journal.png` | 1440x2880 | THREE QUESTIONS. EVERY NIGHT. The evening journal |
| `app-icon-512.png` | 512x512 | Store icon |

Made by `native/store-shots/store.js play` (and `graphic` for the feature
graphic) from the real app with a month of plausible data seeded: ordinary
numbers a committed person would actually log, nothing exaggerated. The demo
user is "Alex"; the founder's name never appears. No screenshot shows the
character art, which is being redrawn.

## Data safety questionnaire

Play asks separately from the privacy policy. Based on what the app does:

- Collects: email and name (accounts only), health and fitness data, photos
  (meal and progress photos), app activity
- Meal photos are sent to a third party for analysis (Gemini, via the Worker)
- Data is encrypted in transit
- Users can request deletion in app: Profile, then Delete account
- No data is sold

---

## Blocker: the Stripe paywall

`premium.js` gates Workout and Diet behind a $7.99/month subscription after a
7 day trial, taken through Stripe Checkout.

Google Play's Payments policy requires Google Play Billing for digital purchases
inside apps distributed on Play. Sending users to Stripe for a subscription is
grounds for rejection, and for removal if it is noticed later.

Three ways out:

1. **Ship Android with everything unlocked.** `window.Capacitor` is already
   truthy in the native build, so the gates can be skipped there. No billing
   code, no policy exposure. This also matches reality: every existing account
   was given free access, Stripe is not live, and taking money is on hold
   pending the DSO conversation anyway.
2. Implement Google Play Billing. Real work, and it cannot be used yet.
3. Submit as is. Expect rejection.

Option 1 is the only one that makes sense today. The listing above assumes it.
Do not tick "In-app purchases" in Play Console until billing actually exists.
