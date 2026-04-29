// ══════════════════════════════════════════════════════════════════════════
// HVI — Static Data
// ══════════════════════════════════════════════════════════════════════════

const PILLARS = [
  { id: 'mind', name: 'Mind', desc: 'Cultivate mental clarity, emotional resilience, and intentional thought.', cats: ['mindset','discipline'],
    icon: '<svg viewBox="0 0 24 24"><path d="M9.5 2A6.5 6.5 0 003 8.5c0 2.06.96 3.9 2.46 5.1L5 17h2v2h10v-2h2l-.46-3.4A6.5 6.5 0 0020.5 8.5 6.5 6.5 0 0014 2h-4.5z"/><line x1="9" y1="17" x2="9" y2="19"/><line x1="15" y1="17" x2="15" y2="19"/></svg>' },
  { id: 'body', name: 'Body', desc: 'Build physical strength, vitality, and discipline through daily practice.', cats: ['fitness','health'],
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="4" r="2"/><path d="M15.89 8.11L13 9v4l2.95 5.9A1 1 0 0115 20.5h0a1 1 0 01-.9-.55L12 15l-2.1 4.95a1 1 0 01-.9.55h0a1 1 0 01-.95-1.31L10 13V9l-2.89-.89A2 2 0 015.5 6.3V6a1 1 0 011-1h11a1 1 0 011 1v.3a2 2 0 01-1.61 1.81z"/></svg>' },
  { id: 'mastery', name: 'Mastery', desc: 'Pursue deep knowledge and continuous skill development every day.', cats: ['learning'],
    icon: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>' },
  { id: 'social', name: 'Social', desc: 'Build meaningful connections and create genuine value for others.', cats: ['social'],
    icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
  { id: 'wealth', name: 'Wealth', desc: 'Build financial discipline, awareness, and long-term abundance.', cats: ['financial'],
    icon: '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
];

const DEFAULT_HABITS = [
  { id: 'h01', name: 'Meditate / breathwork (10+ min)', category: 'mindset' },
  { id: 'h02', name: 'Review daily goals & intentions', category: 'mindset' },
  { id: 'h03', name: 'No social media before noon', category: 'discipline' },
  { id: 'h04', name: 'Cold shower', category: 'discipline' },
  { id: 'h05', name: 'Morning workout / movement (30+ min)', category: 'fitness' },
  { id: 'h06', name: 'Eat whole foods only', category: 'health' },
  { id: 'h07', name: 'Drink 2L+ water', category: 'health' },
  { id: 'h08', name: 'Sleep 7\u20139 hours (log prior night)', category: 'health' },
  { id: 'h09', name: 'Read 30 minutes (books, not feeds)', category: 'learning' },
  { id: 'h10', name: 'Deep work on primary skill / craft', category: 'learning' },
  { id: 'h11', name: 'Network or add value to someone', category: 'social' },
  { id: 'h12', name: 'Track finances / no impulse spending', category: 'financial' },
];

const QUOTES = [
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act but a habit.', author: 'Aristotle' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
  { text: 'Hard choices, easy life. Easy choices, hard life.', author: 'Jerzy Gregorek' },
  { text: 'The secret of your success is determined by your daily agenda.', author: 'John C. Maxwell' },
  { text: 'The successful warrior is the average man with laser-like focus.', author: 'Bruce Lee' },
  { text: 'Success is nothing more than a few simple disciplines, practiced every day.', author: 'Jim Rohn' },
  { text: 'The pain of discipline is far less than the pain of regret.', author: 'Sarah Bombell' },
  { text: 'A man who conquers himself is greater than one who conquers a thousand.', author: 'Buddha' },
  { text: 'Iron rusts from disuse \u2014 even so does inaction sap the vigor of the mind.', author: 'Leonardo da Vinci' },
  { text: "Don't count the days, make the days count.", author: 'Muhammad Ali' },
  { text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' },
  { text: 'Standards, not goals. A goal is temporary. A standard is who you are.', author: 'Unknown' },
];

// ── EXERCISES ─────────────────────────────────────────────────────────────

const EXERCISES = {
  bench_press:    { name: 'Bench Press',          muscle: 'Chest',      ds: 4, dr: 8 },
  incline_db:     { name: 'Incline DB Press',     muscle: 'Chest',      ds: 3, dr: 10 },
  incline_bench:  { name: 'Incline Barbell Press',muscle: 'Upper Chest',ds: 3, dr: 8 },
  ohp:            { name: 'Overhead Press',        muscle: 'Shoulders',  ds: 4, dr: 8 },
  lateral_raise:  { name: 'Lateral Raises',        muscle: 'Side Delts', ds: 3, dr: 15 },
  tricep_pushdown:{ name: 'Tricep Pushdowns',      muscle: 'Triceps',    ds: 3, dr: 12 },
  overhead_ext:   { name: 'Overhead Tricep Ext.',  muscle: 'Triceps',    ds: 3, dr: 12 },
  dips:           { name: 'Dips',                  muscle: 'Chest/Tri',  ds: 3, dr: 10 },
  cg_bench:       { name: 'Close-Grip Bench',     muscle: 'Triceps',    ds: 3, dr: 10 },
  barbell_row:    { name: 'Barbell Row',           muscle: 'Back',       ds: 4, dr: 8 },
  pullup:         { name: 'Pull-ups',              muscle: 'Lats',       ds: 3, dr: 8 },
  cable_row:      { name: 'Cable Row',             muscle: 'Back',       ds: 3, dr: 10 },
  face_pull:      { name: 'Face Pulls',            muscle: 'Rear Delts', ds: 3, dr: 15 },
  rear_delt_fly:  { name: 'Rear Delt Fly',        muscle: 'Rear Delts', ds: 3, dr: 15 },
  barbell_curl:   { name: 'Barbell Curl',          muscle: 'Biceps',     ds: 3, dr: 10 },
  hammer_curl:    { name: 'Hammer Curls',          muscle: 'Biceps',     ds: 3, dr: 10 },
  squat:          { name: 'Barbell Squat',         muscle: 'Quads',      ds: 4, dr: 8 },
  front_squat:    { name: 'Front Squat',           muscle: 'Quads',      ds: 3, dr: 8 },
  rdl:            { name: 'Romanian Deadlift',     muscle: 'Hamstrings', ds: 3, dr: 10 },
  deadlift:       { name: 'Deadlift',             muscle: 'Back/Legs',  ds: 4, dr: 5 },
  leg_press:      { name: 'Leg Press',             muscle: 'Quads',      ds: 3, dr: 10 },
  leg_curl:       { name: 'Leg Curl',              muscle: 'Hamstrings', ds: 3, dr: 12 },
  calf_raise:     { name: 'Calf Raises',           muscle: 'Calves',     ds: 4, dr: 15 },
  lunge:          { name: 'Walking Lunges',        muscle: 'Quads',      ds: 3, dr: 12 },
  hip_thrust:     { name: 'Hip Thrust',            muscle: 'Glutes',     ds: 3, dr: 10 },

  // Chest / Lats
  lat_pulldown:   { name: 'Lat Pulldown',          muscle: 'Lats',          ds: 4, dr: 10 },
  cable_fly:      { name: 'Cable Chest Fly',       muscle: 'Chest',         ds: 3, dr: 12 },
  pec_deck:       { name: 'Pec Deck',              muscle: 'Chest',         ds: 3, dr: 12 },
  chest_dip:      { name: 'Weighted Dips',         muscle: 'Chest/Tri',     ds: 3, dr: 8 },

  // Back / Pulls
  chest_row:      { name: 'Chest-Supported Row',   muscle: 'Upper Back',    ds: 4, dr: 10 },
  pulldown_wide:  { name: 'Wide Grip Pulldown',    muscle: 'Lats',          ds: 3, dr: 10 },
  meadows_row:    { name: 'Meadows Row',           muscle: 'Lats',          ds: 3, dr: 10 },

  // Biceps
  incline_curl:   { name: 'Incline DB Curl',       muscle: 'Biceps',        ds: 3, dr: 10 },
  preacher_curl:  { name: 'Preacher Curl',         muscle: 'Biceps',        ds: 3, dr: 10 },
  cable_curl:     { name: 'Cable Curl',            muscle: 'Biceps',        ds: 3, dr: 12 },

  // Shoulders
  cable_lateral:  { name: 'Cable Lateral Raise',   muscle: 'Side Delts',    ds: 3, dr: 15 },
  arnold_press:   { name: 'Arnold Press',          muscle: 'Shoulders',     ds: 3, dr: 10 },
  rear_delt_row:  { name: 'Rear Delt Row',         muscle: 'Rear Delts',    ds: 3, dr: 15 },

  // Legs — performance & injury prevention
  bulgarian:      { name: 'Bulgarian Split Squat', muscle: 'Quads/Glutes',  ds: 3, dr: 8 },
  nordic_curl:    { name: 'Nordic Curl',           muscle: 'Hamstrings',    ds: 3, dr: 6 },
  leg_ext:        { name: 'Leg Extension',         muscle: 'Quads',         ds: 3, dr: 12 },
  glute_bridge:   { name: 'Barbell Glute Bridge',  muscle: 'Glutes',        ds: 3, dr: 10 },
  box_jump:       { name: 'Box Jumps',             muscle: 'Explosive',     ds: 4, dr: 5 },
  trap_dl:        { name: 'Trap Bar Deadlift',     muscle: 'Full Body',     ds: 4, dr: 5 },
  copenhagen:     { name: 'Copenhagen Plank',      muscle: 'Adductors',     ds: 3, dr: 20 },
  step_up:        { name: 'Weighted Step-Up',      muscle: 'Quads/Glutes',  ds: 3, dr: 10 },

  // Core
  cable_crunch:   { name: 'Cable Crunch',          muscle: 'Abs',           ds: 3, dr: 12 },
  hanging_raise:  { name: 'Hanging Leg Raise',     muscle: 'Abs',           ds: 3, dr: 12 },
  ab_wheel:       { name: 'Ab Wheel Rollout',      muscle: 'Abs',           ds: 3, dr: 10 },
  pallof_press:   { name: 'Pallof Press',          muscle: 'Core',          ds: 3, dr: 12 },
};

// ── WORKOUT PROGRAMS ──────────────────────────────────────────────────────

const WORKOUT_PROGRAMS = [
  {
    id: 'ppl', name: 'Push / Pull / Legs',
    desc: '6-day rotation. High volume. Each muscle hit twice per week.',
    days: [
      { name: 'Push A', focus: 'Chest focus',
        ex: ['bench_press','incline_db','cable_fly','ohp','lateral_raise','tricep_pushdown'] },
      { name: 'Pull A', focus: 'Back width focus',
        ex: ['pullup','lat_pulldown','barbell_row','face_pull','barbell_curl','incline_curl'] },
      { name: 'Legs A', focus: 'Quad / explosive focus',
        ex: ['squat','leg_press','bulgarian','box_jump','leg_curl','calf_raise'] },
      { name: 'Push B', focus: 'Shoulder / upper chest focus',
        ex: ['ohp','arnold_press','incline_bench','cable_fly','cg_bench','cable_lateral'] },
      { name: 'Pull B', focus: 'Back thickness + rear delt focus',
        ex: ['deadlift','chest_row','cable_row','rear_delt_row','hammer_curl','cable_curl'] },
      { name: 'Legs B', focus: 'Posterior chain + injury prevention focus',
        ex: ['trap_dl','rdl','hip_thrust','nordic_curl','copenhagen','calf_raise'] },
    ]
  },
  {
    id: 'ul', name: 'Upper / Lower',
    desc: '4-day rotation. Strength focus with athletic carry-over.',
    days: [
      { name: 'Upper A', focus: 'Horizontal push/pull',
        ex: ['bench_press','barbell_row','incline_db','cable_row','lateral_raise','tricep_pushdown','barbell_curl'] },
      { name: 'Lower A', focus: 'Squat pattern + explosive',
        ex: ['squat','bulgarian','leg_press','leg_curl','nordic_curl','calf_raise'] },
      { name: 'Upper B', focus: 'Vertical push/pull + isolation',
        ex: ['ohp','lat_pulldown','pullup','chest_row','cable_lateral','hammer_curl','cable_fly'] },
      { name: 'Lower B', focus: 'Hinge pattern + posterior chain',
        ex: ['trap_dl','rdl','hip_thrust','leg_ext','copenhagen','calf_raise'] },
    ]
  },
  {
    id: 'fb', name: 'Full Body',
    desc: '3-day rotation. Efficient full body stimulus. Good for in-season.',
    days: [
      { name: 'Day A', focus: 'Squat + horizontal',
        ex: ['squat','bench_press','barbell_row','cable_lateral','barbell_curl','cable_crunch'] },
      { name: 'Day B', focus: 'Hinge + vertical + explosive',
        ex: ['trap_dl','ohp','lat_pulldown','rdl','box_jump','hanging_raise'] },
      { name: 'Day C', focus: 'Unilateral + injury prevention',
        ex: ['bulgarian','incline_db','chest_row','nordic_curl','copenhagen','pallof_press'] },
    ]
  },
  {
    id: 'athlete', name: 'Soccer Athlete',
    desc: '4-day split designed around soccer performance. Power, speed, and injury prevention.',
    days: [
      { name: 'Lower Power', focus: 'Explosive leg strength',
        ex: ['squat','trap_dl','box_jump','bulgarian','nordic_curl','copenhagen'] },
      { name: 'Upper Strength', focus: 'Upper body pushing and pulling',
        ex: ['bench_press','barbell_row','ohp','lat_pulldown','cable_lateral','cable_crunch'] },
      { name: 'Lower Hypertrophy', focus: 'Volume and injury prevention',
        ex: ['leg_press','rdl','hip_thrust','leg_ext','leg_curl','calf_raise'] },
      { name: 'Upper Hypertrophy + Core', focus: 'Muscle building and stability',
        ex: ['incline_db','chest_row','cable_fly','preacher_curl','tricep_pushdown','pallof_press'] },
    ]
  },
  {
    id: 'strength', name: 'Powerbuilding',
    desc: '4-day strength-focused split. Heavy compound movements, accessory volume.',
    days: [
      { name: 'Bench Day', focus: 'Horizontal push strength',
        ex: ['bench_press','cg_bench','incline_db','cable_fly','tricep_pushdown','cable_lateral'] },
      { name: 'Squat Day', focus: 'Quad and leg strength',
        ex: ['squat','front_squat','leg_press','leg_curl','nordic_curl','calf_raise'] },
      { name: 'OHP Day', focus: 'Vertical push and back',
        ex: ['ohp','arnold_press','lat_pulldown','face_pull','hammer_curl','ab_wheel'] },
      { name: 'Deadlift Day', focus: 'Posterior chain strength',
        ex: ['deadlift','trap_dl','barbell_row','rdl','hip_thrust','cable_crunch'] },
    ]
  },
];

// ── RECIPES ───────────────────────────────────────────────────────────────

const RECIPES = [
  // Breakfast
  { id:'r01', name:'Protein Oatmeal', cat:'Breakfast', cal:450, p:35, c:55, f:10,
    ing:['1 cup oats','1 scoop whey protein','1 tbsp peanut butter','1/2 banana','Cinnamon'],
    steps:'Cook oats with water or milk. Stir in protein powder off heat. Top with sliced banana, peanut butter, and cinnamon.' },
  { id:'r02', name:'Egg & Avocado Toast', cat:'Breakfast', cal:420, p:22, c:35, f:24,
    ing:['2 eggs','1/2 avocado','2 slices whole grain bread','Salt, pepper, chili flakes'],
    steps:'Toast bread. Mash avocado on top. Fry or poach eggs and place on avocado. Season to taste.' },
  { id:'r03', name:'Greek Yogurt Parfait', cat:'Breakfast', cal:380, p:30, c:45, f:8,
    ing:['200g Greek yogurt','1/2 cup granola','1/2 cup mixed berries','1 tbsp honey'],
    steps:'Layer yogurt, granola, and berries in a bowl. Drizzle with honey.' },
  { id:'r04', name:'Protein Smoothie Bowl', cat:'Breakfast', cal:500, p:40, c:55, f:12,
    ing:['1 scoop protein powder','1 frozen banana','1/2 cup frozen berries','1/2 cup almond milk','Toppings: granola, seeds, coconut'],
    steps:'Blend protein, banana, berries, and milk until thick. Pour into bowl. Add toppings.' },
  // Lunch
  { id:'r05', name:'Chicken & Rice Bowl', cat:'Lunch', cal:550, p:45, c:55, f:12,
    ing:['200g chicken breast','1 cup cooked rice','1/2 cup black beans','Salsa, lime, cilantro'],
    steps:'Season and grill chicken. Serve over rice with beans, salsa, lime juice, and cilantro.' },
  { id:'r06', name:'Turkey Lettuce Wraps', cat:'Lunch', cal:380, p:38, c:20, f:16,
    ing:['200g ground turkey','Butter lettuce leaves','1/2 cup diced vegetables','Soy sauce, garlic, ginger'],
    steps:'Brown turkey with garlic, ginger, and soy sauce. Add diced veggies. Spoon into lettuce cups.' },
  { id:'r07', name:'Salmon Quinoa Bowl', cat:'Lunch', cal:520, p:40, c:42, f:18,
    ing:['150g salmon fillet','1 cup cooked quinoa','Mixed greens','Lemon, olive oil dressing'],
    steps:'Bake or pan-sear salmon. Serve over quinoa and greens with lemon-olive oil dressing.' },
  { id:'r08', name:'Steak Burrito Bowl', cat:'Lunch', cal:600, p:42, c:50, f:20,
    ing:['200g flank steak','1 cup rice','Black beans','Peppers, onions, salsa, lime'],
    steps:'Grill steak with seasoning. Slice thin. Serve over rice with beans, peppers, salsa.' },
  // Dinner
  { id:'r09', name:'Grilled Chicken & Sweet Potato', cat:'Dinner', cal:500, p:42, c:48, f:10,
    ing:['200g chicken breast','1 large sweet potato','Steamed broccoli','Olive oil, garlic, herbs'],
    steps:'Grill seasoned chicken. Bake sweet potato. Steam broccoli. Plate together with herbs.' },
  { id:'r10', name:'Salmon & Asparagus', cat:'Dinner', cal:480, p:40, c:25, f:22,
    ing:['150g salmon fillet','1 bunch asparagus','Lemon, garlic, olive oil','1/2 cup rice'],
    steps:'Bake salmon and asparagus on sheet pan with lemon, garlic, and olive oil. Serve with rice.' },
  { id:'r11', name:'Ground Turkey Stir Fry', cat:'Dinner', cal:460, p:38, c:40, f:14,
    ing:['200g ground turkey','Mixed stir fry vegetables','Soy sauce, sesame oil','1 cup rice'],
    steps:'Brown turkey. Add vegetables and stir fry sauce. Cook until veggies are tender. Serve over rice.' },
  { id:'r12', name:'Lean Beef & Broccoli', cat:'Dinner', cal:550, p:40, c:52, f:14,
    ing:['200g lean beef strips','Broccoli florets','Soy sauce, garlic, ginger','1 cup rice'],
    steps:'Stir fry beef strips until browned. Add broccoli and sauce. Serve over steamed rice.' },
  // Snacks
  { id:'r13', name:'Protein Shake', cat:'Snack', cal:250, p:30, c:10, f:8,
    ing:['1 scoop whey protein','250ml milk or water','1 tbsp peanut butter (optional)'],
    steps:'Blend protein powder with liquid. Add peanut butter for extra calories if desired.' },
  { id:'r14', name:'Cottage Cheese & Berries', cat:'Snack', cal:200, p:24, c:18, f:4,
    ing:['200g cottage cheese','1/2 cup mixed berries','Honey drizzle (optional)'],
    steps:'Top cottage cheese with berries and a drizzle of honey.' },
  { id:'r15', name:'Almonds & Apple', cat:'Snack', cal:280, p:8, c:30, f:16,
    ing:['1 medium apple','30g almonds'],
    steps:'Slice apple. Enjoy with a handful of almonds.' },
  { id:'r16', name:'Rice Cakes & PB', cat:'Snack', cal:260, p:10, c:32, f:12,
    ing:['2 rice cakes','2 tbsp peanut butter','1 banana, sliced'],
    steps:'Spread peanut butter on rice cakes. Top with banana slices.' },
];

// ── BOOKS ─────────────────────────────────────────────────────────────────

const BOOKS = [
  // Mind
  { title: 'Meditations', author: 'Marcus Aurelius', pillar: 'mind', desc: 'Timeless stoic wisdom on self-mastery and resilience from a Roman emperor.', url: 'https://www.goodreads.com/search?q=Meditations+Marcus+Aurelius' },
  { title: "Man's Search for Meaning", author: 'Viktor Frankl', pillar: 'mind', desc: 'How finding purpose sustains you through even the worst suffering.', url: 'https://www.goodreads.com/search?q=Man%27s+Search+for+Meaning+Viktor+Frankl' },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', pillar: 'mind', desc: 'Understand the two systems that drive how you think and decide.', url: 'https://www.goodreads.com/search?q=Thinking+Fast+and+Slow+Daniel+Kahneman' },
  { title: 'The Power of Now', author: 'Eckhart Tolle', pillar: 'mind', desc: 'A guide to spiritual enlightenment through present-moment awareness.', url: 'https://www.goodreads.com/search?q=The+Power+of+Now+Eckhart+Tolle' },
  { title: 'Atomic Habits', author: 'James Clear', pillar: 'mind', desc: 'Tiny changes, remarkable results \u2014 the definitive guide to building better habits.', url: 'https://www.goodreads.com/search?q=Atomic+Habits+James+Clear' },
  // Body
  { title: 'Starting Strength', author: 'Mark Rippetoe', pillar: 'body', desc: 'The bible of barbell training \u2014 learn the five fundamental lifts.', url: 'https://www.goodreads.com/search?q=Starting+Strength+Mark+Rippetoe' },
  { title: 'Why We Sleep', author: 'Matthew Walker', pillar: 'body', desc: 'The science of sleep and why it is the most important thing you can do for health.', url: 'https://www.goodreads.com/search?q=Why+We+Sleep+Matthew+Walker' },
  { title: 'The Body Keeps the Score', author: 'Bessel van der Kolk', pillar: 'body', desc: 'How trauma reshapes the body and brain, and how to heal.', url: 'https://www.goodreads.com/search?q=The+Body+Keeps+the+Score+Bessel+van+der+Kolk' },
  { title: 'Bigger Leaner Stronger', author: 'Michael Matthews', pillar: 'body', desc: 'Evidence-based approach to building muscle and losing fat.', url: 'https://www.goodreads.com/search?q=Bigger+Leaner+Stronger+Michael+Matthews' },
  // Mastery
  { title: 'Deep Work', author: 'Cal Newport', pillar: 'mastery', desc: 'Rules for focused success in a distracted world.', url: 'https://www.goodreads.com/search?q=Deep+Work+Cal+Newport' },
  { title: 'Mastery', author: 'Robert Greene', pillar: 'mastery', desc: 'The path to mastery through apprenticeship, practice, and creative insight.', url: 'https://www.goodreads.com/search?q=Mastery+Robert+Greene' },
  { title: 'Peak', author: 'Anders Ericsson', pillar: 'mastery', desc: 'The new science of expertise \u2014 deliberate practice explained.', url: 'https://www.goodreads.com/search?q=Peak+Anders+Ericsson' },
  { title: 'The Art of Learning', author: 'Josh Waitzkin', pillar: 'mastery', desc: 'A chess prodigy and martial artist shares his approach to mastering any skill.', url: 'https://www.goodreads.com/search?q=The+Art+of+Learning+Josh+Waitzkin' },
  { title: "So Good They Can't Ignore You", author: 'Cal Newport', pillar: 'mastery', desc: 'Why skills trump passion in the quest for work you love.', url: 'https://www.goodreads.com/search?q=So+Good+They+Can%27t+Ignore+You+Cal+Newport' },
  // Social
  { title: 'How to Win Friends and Influence People', author: 'Dale Carnegie', pillar: 'social', desc: 'The original guide to building genuine relationships and influence.', url: 'https://www.goodreads.com/search?q=How+to+Win+Friends+and+Influence+People+Dale+Carnegie' },
  { title: 'Never Split the Difference', author: 'Chris Voss', pillar: 'social', desc: 'Negotiation tactics from a former FBI hostage negotiator.', url: 'https://www.goodreads.com/search?q=Never+Split+the+Difference+Chris+Voss' },
  { title: 'The Charisma Myth', author: 'Olivia Fox Cabane', pillar: 'social', desc: 'Charisma is a learnable skill \u2014 here is the science behind it.', url: 'https://www.goodreads.com/search?q=The+Charisma+Myth+Olivia+Fox+Cabane' },
  { title: 'Influence', author: 'Robert Cialdini', pillar: 'social', desc: 'The psychology of persuasion \u2014 six principles that drive human behavior.', url: 'https://www.goodreads.com/search?q=Influence+Robert+Cialdini' },
  // Wealth
  { title: 'The Psychology of Money', author: 'Morgan Housel', pillar: 'wealth', desc: 'Timeless lessons on wealth, greed, and happiness.', url: 'https://www.goodreads.com/search?q=The+Psychology+of+Money+Morgan+Housel' },
  { title: 'Rich Dad Poor Dad', author: 'Robert Kiyosaki', pillar: 'wealth', desc: 'What the rich teach their kids about money that others do not.', url: 'https://www.goodreads.com/search?q=Rich+Dad+Poor+Dad+Robert+Kiyosaki' },
  { title: 'The Millionaire Fastlane', author: 'MJ DeMarco', pillar: 'wealth', desc: 'Crack the code to wealth \u2014 escape the slow lane of saving for 40 years.', url: 'https://www.goodreads.com/search?q=The+Millionaire+Fastlane+MJ+DeMarco' },
  { title: 'The Almanack of Naval Ravikant', author: 'Eric Jorgenson', pillar: 'wealth', desc: 'A guide to wealth and happiness from Silicon Valley\u2019s philosopher.', url: 'https://www.goodreads.com/search?q=The+Almanack+of+Naval+Ravikant+Eric+Jorgenson' },
];
