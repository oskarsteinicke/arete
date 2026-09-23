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

## Subtitle (30 max, using 29)

```
Your day, in one calm place
```

## Promotional text (170 max — editable without a new review)

```
New: a Today screen that shows the one to three things that matter, and consistency over the last seven days instead of a streak that one missed day destroys.
```

## Keywords (100 max, comma separated, no spaces after commas)

```
habit,tracker,workout,gym,log,nutrition,macros,sleep,routine,discipline,journal,self,improvement,coach
```

Do not repeat the app name or subtitle here — Apple already indexes those, so
a repeat wastes characters.

## Description (4000 max, using ~2100)

```
Most self-improvement apps do one thing and charge you every month for it. Arete does the whole picture instead.

Habits, training, nutrition, sleep and an AI coach in one place. The parts talk to each other. Log a workout and your recovery updates. Sleep badly and today's training advice changes with it.

TODAY
Open the app and see the one to three things that actually matter today, drawn from your habits and your goals. One tap each. Underneath, how consistent you have been over the last seven days — not a streak that one missed day sets to zero.

HABITS
Build across five areas: body, mind, spirit, craft and connection. Daily, weekly, or specific days of the week. Weekly habits are judged on the week, not on whether you opened the app.

TRAINING
Push/Pull/Legs, Upper/Lower and Full Body programs are built in. Or build your own. Every set is logged, personal records are tracked, and estimated 1RM comes from the weight and reps you actually did.

A body map shows which muscles you have trained recently and where you are strongest. Strength is scored against what an average lifter your bodyweight and sex can do, so your arms are not compared to your legs.

NUTRITION
Photograph a meal and Arete estimates the calories and macros. Or just describe it. Edit anything it gets wrong and the numbers recalculate. Targets come from your own height, weight, age and activity level.

SLEEP
Set when you went to bed and when you woke up. Arete works out the rest. It asks once a day, because sleep is the easiest thing to forget and the hardest to reconstruct later.

AI COACH
It can see your real data. Ask why you are tired, what to train today, or why progress stalled. It answers from your logs, not from generic advice.

NO ACCOUNT REQUIRED
Open it and start. Everything works offline and stays on your device. Create an account only if you want it synced across devices.

Arete is Greek for excellence. Living up to your potential, daily, in the things that matter.
```

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

`store-assets-ios/`, 1320x2868 — the 6.9" iPhone size, which is the only
iPhone size App Store Connect requires. No alpha channel, which Apple rejects.

| File | Shows |
|---|---|
| `01-home.png` | Today: priorities, consistency, character |
| `02-habits.png` | Habits and the activity map |
| `03-workout.png` | Training and today's session |
| `04-diet.png` | Nutrition, macros, water |
| `05-musclemap.png` | Muscle map. The most distinctive screen. |
| `06-character.png` | Levels and progression |

The app icon comes from the build (1024x1024 in Assets.xcassets), so there is
nothing to upload separately.

## App Privacy (Apple's questionnaire)

Answer per data type. This mirrors what the app actually sends.

| Data | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes, accounts only | Yes | No | App functionality |
| Name | Yes, accounts only | Yes | No | App functionality |
| Health & Fitness | Yes | Yes, with an account | No | App functionality |
| Photos | Yes, meal and progress photos | Yes, with an account | No | App functionality |
| Product interaction | Yes | No | No | Analytics |
| Crash data | Yes | No | No | Analytics |

- **Third party:** meal photos are sent to Google Gemini, through the app's own
  Cloudflare Worker, to estimate calories and macros.
- **Tracking:** No. Arete does not track across apps or websites, so there is
  no App Tracking Transparency prompt and no need for one.
- **Deletion:** in the app, Profile then Delete account.

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
Arete requires no account. Open the app and everything is available immediately — habits, training, nutrition, sleep and the AI coach all work without signing in. An account is optional and only enables sync across devices.

The camera is used for the meal scanner (photograph a meal to estimate its calories and macros) and for progress photos. Both are user-initiated from within the app.

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
