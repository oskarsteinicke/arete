# App Store listing

Copy each block straight into App Store Connect. Character limits noted; all
are inside them.

Apple's fields are not Play's. The name is shorter, there is a subtitle Play
has no equivalent for, and keywords are a separate hidden field rather than
something to stuff into the description.

---

## App name (30 max, using 24)

```
Arete: Habits & Training
```

## Subtitle (30 max, using 28)

```
Your whole day, one sentence
```

## Promotional text (170 max, using 161; editable without a new review)

```
New: Log anything. Type or say your day in one sentence and Arete sorts it into meals, water, sleep, habits and mood. And Your patterns: what your own days show.
```

## Keywords (100 max, comma separated, no spaces after commas)

```
habit,tracker,workout,gym,log,macros,calorie,nutrition,sleep,routine,journal,coach,discipline,goals
```

Do not repeat the app name or subtitle here: Apple already indexes those, so
a repeat wastes characters.

## Description (4000 max, using 2406)

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
| Primary category | Health & Fitness |
| Secondary category | Productivity |
| Age rating | 4+ (no objectionable content; answer No to every questionnaire item) |
| Price | Free |
| Support URL | https://get-arete.com |
| Marketing URL | https://get-arete.com |
| Privacy policy URL | https://get-arete.com/privacy |
| Copyright | 2026 Oskar Steinicke |

## Screenshots

`store-assets-ios/`, 1320x2868: the 6.9" iPhone size, which is the only
iPhone size App Store Connect requires. No alpha channel, which Apple rejects.
Made by `native/store-shots/store.js ios` from the real app (demo user "Alex",
no character art while it is being redrawn).

| File | Headline and screen |
|---|---|
| `01-sleep-sets-the-session.png` | YOUR SLEEP SETS THE SESSION. Workout, with today's lighter session after a short night |
| `02-coach.png` | A COACH THAT KNOWS YOUR DAY. The coach answering from last night's sleep |
| `03-habits.png` | BUILD HABITS THAT STICK. Habits ticked, activity map |
| `04-nutrition.png` | TYPE A MEAL. IT'S LOGGED. A typed meal turned into macros |
| `05-every-set.png` | EVERY SET. EVERY PR. A session mid-workout, new PR, rest timer |
| `06-muscle-map.png` | SEE WHAT YOU TRAINED. The muscle map |
| `07-journal.png` | THREE QUESTIONS. EVERY NIGHT. The evening journal |

The app icon comes from the build (1024x1024 in Assets.xcassets), so there is
nothing to upload separately.

## App Privacy (Apple's questionnaire)

Answer per data type. This mirrors what the app actually sends.

| Data | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes, accounts only | Yes | No | App functionality |
| Name | Yes, accounts only | Yes | No | App functionality |
| User ID | Yes, accounts only | Yes | No | App functionality, Analytics |
| Health & Fitness | Yes | Yes, with an account | No | App functionality |
| Photos | Yes, meal and progress photos | Yes, with an account | No | App functionality |
| Other user content | Yes, journal entries and coach messages | Yes, with an account | No | App functionality |
| Product interaction | Yes | Yes, with an account | No | Analytics |
| Crash data / other diagnostics | Yes | Yes, with an account | No | Analytics |

Why "linked" on the analytics rows: for someone signed in, the app sends
Google Analytics a pseudonymous account identifier (the privacy policy says
so). Without an account none of it is linked. Answer for the linked case.

- **Third-party AI:** the coach, the daily focus, meal descriptions, meal
  photos and the program builder's goal text are sent through the app's own Cloudflare Worker to **Google Gemini**
  and **Groq**. Nothing is sent until the person allows it: the app shows what
  is sent and to whom the first time, and there is an on/off switch in Profile
  (guideline 5.1.2(i)).
- **Tracking:** No. Arete does not track across apps or websites, so there is
  no App Tracking Transparency prompt and no need for one.
- **Deletion:** in the app, Profile then Delete account.
- **Privacy manifest:** `ios/App/App/PrivacyInfo.xcprivacy` declares the same
  data types and no tracking. Keep the two in step.

## Three Apple rules this app already satisfies

1. **Account deletion in the app.** Apple requires it wherever accounts can be
   created. It is in Profile, and it calls the Worker's deletion endpoint.
2. **Sign in with Apple.** Only required when an app offers third-party social
   login. Arete uses email and password only, so it does not apply. If Google
   or Facebook sign-in is ever added, Sign in with Apple becomes mandatory
   alongside it.
3. **A demo account for review.** Only needed when reviewers cannot use the app
   without logging in. Arete is fully usable with no account, so leave the demo
   fields empty and say so in the review notes.

## Review notes

```
Arete requires no account. Open the app and everything is available immediately: habits, training, nutrition, sleep and the AI coach all work without signing in. An account is optional and only enables sync across devices.

The camera is used for the meal scanner (photograph a meal to estimate its calories and macros) and for progress photos. Both are user-initiated from within the app.

The AI features (coach, daily focus, Log anything, meal description, meal photo scan and the program builder) send data to Google Gemini and Groq through our own server. The app asks for permission the first time any of them is used, explaining what is sent and to whom, and nothing is sent before that. They can be turned off in Profile > Settings > "AI coach and meal scan".

Log anything takes typed text. To speak instead, people use the microphone on the iOS keyboard; the app itself does not use the microphone.

Connected Devices (Whoop, Strava, Google Fit) in Profile are optional and need an account with that service. Connect opens the service's own sign-in page in a browser sheet; nothing is connected until the person signs in there.

There are no in-app purchases and nothing is for sale.
```

## Build settings that matter

- `TARGETED_DEVICE_FAMILY = 1` — iPhone only. iPad users can still install it;
  it runs in a phone-sized window. Supporting iPad properly would mean an iPad
  screenshot and a reviewer testing an iPad layout the app does not have yet.
- `ITSAppUsesNonExemptEncryption = false` in Info.plist — the app uses nothing
  beyond HTTPS. Without this key App Store Connect asks the export compliance
  question on every single upload.
- Bundle identifier `com.getarete.app`, version 1.0, build 1. **The build
  number has to increase on every upload**, even for a build that is rejected
  or never released.
