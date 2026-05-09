// ══════════════════════════════════════════════════════════════════════════
// HVI — Static Data
// ══════════════════════════════════════════════════════════════════════════

const PILLARS = [
  { id: 'mind', name: 'Mind', desc: 'The soul becomes dyed with the colour of its thoughts. Guard yours well.', cats: ['mindset','discipline'],
    icon: '<svg viewBox="0 0 24 24"><path d="M9.5 2A6.5 6.5 0 003 8.5c0 2.06.96 3.9 2.46 5.1L5 17h2v2h10v-2h2l-.46-3.4A6.5 6.5 0 0020.5 8.5 6.5 6.5 0 0014 2h-4.5z"/><line x1="9" y1="17" x2="9" y2="19"/><line x1="15" y1="17" x2="15" y2="19"/></svg>' },
  { id: 'body', name: 'Body', desc: 'No citizen has a right to be an amateur in the matter of physical training.', cats: ['fitness','health'],
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="4" r="2"/><path d="M15.89 8.11L13 9v4l2.95 5.9A1 1 0 0115 20.5h0a1 1 0 01-.9-.55L12 15l-2.1 4.95a1 1 0 01-.9.55h0a1 1 0 01-.95-1.31L10 13V9l-2.89-.89A2 2 0 015.5 6.3V6a1 1 0 011-1h11a1 1 0 011 1v.3a2 2 0 01-1.61 1.81z"/></svg>' },
  { id: 'mastery', name: 'Mastery', desc: 'The roots of education are bitter, but the fruit is sweet.', cats: ['learning'],
    icon: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>' },
  { id: 'social', name: 'Social', desc: 'We are, by nature, social creatures. To live for others is to live fully.', cats: ['social'],
    icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
  { id: 'wealth', name: 'Wealth', desc: 'Wealth consists not in having great possessions, but in having few wants.', cats: ['financial'],
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
  // Marcus Aurelius
  { text: 'You have power over your mind \u2014 not outside events. Realise this, and you will find strength.', author: 'Marcus Aurelius' },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', author: 'Marcus Aurelius' },
  { text: 'Waste no more time arguing about what a good man should be. Be one.', author: 'Marcus Aurelius' },
  { text: 'When you arise in the morning, think of what a privilege it is to be alive \u2014 to think, to enjoy, to love.', author: 'Marcus Aurelius' },
  { text: 'The soul becomes dyed with the colour of its thoughts.', author: 'Marcus Aurelius' },
  { text: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', author: 'Marcus Aurelius' },
  // Epictetus
  { text: 'No man is free who is not master of himself.', author: 'Epictetus' },
  { text: 'First say to yourself what you would be; and then do what you have to do.', author: 'Epictetus' },
  { text: 'It is not things that disturb us, but our judgements about those things.', author: 'Epictetus' },
  { text: 'Make the best use of what is in your power, and take the rest as it happens.', author: 'Epictetus' },
  { text: 'Difficulty shows what men are.', author: 'Epictetus' },
  // Seneca
  { text: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { text: 'Luck is what happens when preparation meets opportunity.', author: 'Seneca' },
  { text: 'It is not that we have a short time to live, but that we waste a great deal of it.', author: 'Seneca' },
  { text: 'Begin at once to live, and count each separate day as a separate life.', author: 'Seneca' },
  { text: 'He who is brave is free.', author: 'Seneca' },
  // Aristotle (the origin of Arete)
  { text: 'We are what we repeatedly do. Excellence, then, is not an act but a habit.', author: 'Aristotle' },
  { text: 'Knowing yourself is the beginning of all wisdom.', author: 'Aristotle' },
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

  // ── Chest (extra) ──────────────────────────────────────────────────────
  decline_bench:  { name: 'Decline Bench Press',   muscle: 'Lower Chest',   ds: 3, dr: 10 },
  db_flat_press:  { name: 'DB Flat Press',         muscle: 'Chest',         ds: 3, dr: 10 },
  db_fly:         { name: 'DB Chest Fly',          muscle: 'Chest',         ds: 3, dr: 12 },
  pushup:         { name: 'Push-Up',               muscle: 'Chest',         ds: 3, dr: 20 },
  diamond_pu:     { name: 'Diamond Push-Up',       muscle: 'Chest/Tri',     ds: 3, dr: 15 },
  cable_cross:    { name: 'Cable Crossover',       muscle: 'Chest',         ds: 3, dr: 15 },
  chest_press_m:  { name: 'Chest Press Machine',   muscle: 'Chest',         ds: 3, dr: 12 },
  svend_press:    { name: 'Svend Press',           muscle: 'Inner Chest',   ds: 3, dr: 15 },

  // ── Back (extra) ───────────────────────────────────────────────────────
  tbar_row:       { name: 'T-Bar Row',             muscle: 'Back',          ds: 4, dr: 8  },
  db_row:         { name: 'Single Arm DB Row',     muscle: 'Lats',          ds: 3, dr: 10 },
  straight_pull:  { name: 'Straight Arm Pulldown', muscle: 'Lats',          ds: 3, dr: 12 },
  good_morning:   { name: 'Good Morning',          muscle: 'Lower Back',    ds: 3, dr: 10 },
  hyperext:       { name: 'Back Extension',        muscle: 'Lower Back',    ds: 3, dr: 15 },
  chinup:         { name: 'Chin-Up',               muscle: 'Biceps/Lats',   ds: 3, dr: 8  },
  inverted_row:   { name: 'Inverted Row',          muscle: 'Upper Back',    ds: 3, dr: 12 },
  rack_pull:      { name: 'Rack Pull',             muscle: 'Upper Back',    ds: 3, dr: 6  },
  pendlay_row:    { name: 'Pendlay Row',           muscle: 'Back',          ds: 4, dr: 6  },

  // ── Shoulders (extra) ──────────────────────────────────────────────────
  db_ohp:         { name: 'DB Shoulder Press',     muscle: 'Shoulders',     ds: 4, dr: 10 },
  front_raise:    { name: 'Front Raise',           muscle: 'Front Delts',   ds: 3, dr: 12 },
  upright_row:    { name: 'Upright Row',           muscle: 'Traps/Delts',   ds: 3, dr: 12 },
  landmine_press: { name: 'Landmine Press',        muscle: 'Shoulders',     ds: 3, dr: 10 },
  shrug:          { name: 'Barbell Shrug',         muscle: 'Traps',         ds: 3, dr: 12 },
  db_shrug:       { name: 'DB Shrug',              muscle: 'Traps',         ds: 3, dr: 15 },
  machine_fly:    { name: 'Reverse Pec Deck',      muscle: 'Rear Delts',    ds: 3, dr: 15 },

  // ── Biceps (extra) ─────────────────────────────────────────────────────
  spider_curl:    { name: 'Spider Curl',           muscle: 'Biceps',        ds: 3, dr: 12 },
  conc_curl:      { name: 'Concentration Curl',    muscle: 'Biceps',        ds: 3, dr: 12 },
  reverse_curl:   { name: 'Reverse Curl',          muscle: 'Brachialis',    ds: 3, dr: 12 },
  zottman:        { name: 'Zottman Curl',          muscle: 'Biceps/Forearm',ds: 3, dr: 10 },
  db_curl:        { name: 'DB Curl',               muscle: 'Biceps',        ds: 3, dr: 10 },
  cross_curl:     { name: 'Cross-Body Curl',       muscle: 'Biceps',        ds: 3, dr: 12 },

  // ── Triceps (extra) ────────────────────────────────────────────────────
  skull_crusher:  { name: 'Skull Crusher',         muscle: 'Triceps',       ds: 3, dr: 10 },
  tricep_kick:    { name: 'Tricep Kickback',       muscle: 'Triceps',       ds: 3, dr: 12 },
  rope_pushdown:  { name: 'Rope Pushdown',         muscle: 'Triceps',       ds: 3, dr: 12 },
  jm_press:       { name: 'JM Press',              muscle: 'Triceps',       ds: 3, dr: 10 },
  db_tri_ext:     { name: 'DB Tricep Extension',   muscle: 'Triceps',       ds: 3, dr: 12 },

  // ── Legs (extra) ───────────────────────────────────────────────────────
  hack_squat:     { name: 'Hack Squat',            muscle: 'Quads',         ds: 4, dr: 10 },
  sumo_dl:        { name: 'Sumo Deadlift',         muscle: 'Glutes/Hams',   ds: 4, dr: 6  },
  goblet_squat:   { name: 'Goblet Squat',          muscle: 'Quads',         ds: 3, dr: 12 },
  smith_squat:    { name: 'Smith Machine Squat',   muscle: 'Quads',         ds: 3, dr: 10 },
  seated_calf:    { name: 'Seated Calf Raise',     muscle: 'Calves',        ds: 4, dr: 15 },
  leg_adduct:     { name: 'Hip Adduction Machine', muscle: 'Adductors',     ds: 3, dr: 15 },
  leg_abduct:     { name: 'Hip Abduction Machine', muscle: 'Abductors',     ds: 3, dr: 15 },
  cable_kickback: { name: 'Cable Glute Kickback',  muscle: 'Glutes',        ds: 3, dr: 15 },
  sissy_squat:    { name: 'Sissy Squat',           muscle: 'Quads',         ds: 3, dr: 12 },
  pistol_squat:   { name: 'Pistol Squat',          muscle: 'Quads/Balance', ds: 3, dr: 8  },
  sldl:           { name: 'Stiff-Leg Deadlift',    muscle: 'Hamstrings',    ds: 3, dr: 10 },
  db_lunge:       { name: 'DB Lunge',              muscle: 'Quads/Glutes',  ds: 3, dr: 10 },

  // ── Core (extra) ───────────────────────────────────────────────────────
  plank:          { name: 'Plank',                 muscle: 'Core',          ds: 3, dr: 60 },
  side_plank:     { name: 'Side Plank',            muscle: 'Obliques',      ds: 3, dr: 45 },
  russian_twist:  { name: 'Russian Twist',         muscle: 'Obliques',      ds: 3, dr: 20 },
  dragon_flag:    { name: 'Dragon Flag',           muscle: 'Abs',           ds: 3, dr: 8  },
  decline_crunch: { name: 'Decline Crunch',        muscle: 'Abs',           ds: 3, dr: 15 },
  v_up:           { name: 'V-Up',                  muscle: 'Abs',           ds: 3, dr: 15 },
  toe_touch:      { name: 'Toe Touch Crunch',      muscle: 'Abs',           ds: 3, dr: 15 },
  bicycle:        { name: 'Bicycle Crunch',        muscle: 'Abs/Obliques',  ds: 3, dr: 20 },
  lsit:           { name: 'L-Sit Hold',            muscle: 'Core',          ds: 3, dr: 20 },
  dead_bug:       { name: 'Dead Bug',              muscle: 'Core',          ds: 3, dr: 10 },

  // ── Full Body / Compound ───────────────────────────────────────────────
  power_clean:    { name: 'Power Clean',           muscle: 'Full Body',     ds: 4, dr: 3  },
  clean_press:    { name: 'Clean & Press',         muscle: 'Full Body',     ds: 3, dr: 5  },
  thruster:       { name: 'Thruster',              muscle: 'Full Body',     ds: 3, dr: 8  },
  kb_swing:       { name: 'Kettlebell Swing',      muscle: 'Posterior Chain',ds: 4, dr: 15},
  tgu:            { name: 'Turkish Get-Up',        muscle: 'Full Body',     ds: 3, dr: 5  },
  farmers_walk:   { name: 'Farmer\'s Carry',       muscle: 'Full Body',     ds: 3, dr: 40 },
  sandbag_squat:  { name: 'Sandbag Squat',         muscle: 'Quads/Glutes',  ds: 3, dr: 10 },
  kb_goblet:      { name: 'KB Goblet Squat',       muscle: 'Quads',         ds: 3, dr: 12 },
  suitcase_carry: { name: 'Suitcase Carry',        muscle: 'Core/Traps',    ds: 3, dr: 40 },
  hang_clean:     { name: 'Hang Clean',            muscle: 'Full Body',     ds: 4, dr: 4  },
  high_pull:      { name: 'High Pull',             muscle: 'Traps/Shoulders',ds: 4, dr: 5  },

  // ── Bodyweight ─────────────────────────────────────────────────────────
  muscle_up:      { name: 'Muscle-Up',             muscle: 'Back/Chest',    ds: 3, dr: 5  },
  ring_dip:       { name: 'Ring Dip',              muscle: 'Chest/Tri',     ds: 3, dr: 8  },
  hspu:           { name: 'Handstand Push-Up',     muscle: 'Shoulders',     ds: 3, dr: 8  },
  archer_pu:      { name: 'Archer Push-Up',        muscle: 'Chest',         ds: 3, dr: 8  },
  pike_pu:        { name: 'Pike Push-Up',          muscle: 'Shoulders',     ds: 3, dr: 12 },
  hollow_hold:    { name: 'Hollow Body Hold',      muscle: 'Core',          ds: 3, dr: 30 },

  // ── Cardio / Conditioning ──────────────────────────────────────────────
  treadmill:      { name: 'Treadmill Run',         muscle: 'Cardio',        ds: 1, dr: 20 },
  rowing:         { name: 'Rowing Machine',        muscle: 'Cardio/Back',   ds: 1, dr: 10 },
  cycling:        { name: 'Stationary Bike',       muscle: 'Cardio',        ds: 1, dr: 20 },
  jump_rope:      { name: 'Jump Rope',             muscle: 'Cardio',        ds: 5, dr: 60 },
  battle_ropes:   { name: 'Battle Ropes',          muscle: 'Cardio/Arms',   ds: 5, dr: 30 },
  sled_push:      { name: 'Sled Push',             muscle: 'Legs/Cardio',   ds: 4, dr: 20 },
  box_step:       { name: 'Step-Up Cardio',        muscle: 'Cardio/Legs',   ds: 3, dr: 20 },
  burpee:         { name: 'Burpee',                muscle: 'Full Body',     ds: 4, dr: 10 },
  mountain_climb: { name: 'Mountain Climbers',     muscle: 'Core/Cardio',   ds: 3, dr: 30 },
  sprint:         { name: 'Sprint Intervals',      muscle: 'Cardio',        ds: 6, dr: 15 },
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

// \u2500\u2500 FOOD DATABASE (for natural-language meal parser) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// All macros per 100 g.  `each` = grams for one countable unit (egg, banana\u2026)
const FOOD_DB = [
  // \u2500\u2500 Proteins \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  { names:['chicken breast','chicken breasts','grilled chicken','baked chicken','chicken fillet'], cal:165, pro:31, carb:0,   fat:3.6 },
  { names:['chicken thigh','chicken thighs'],                                                      cal:179, pro:25, carb:0,   fat:8   },
  { names:['chicken','cooked chicken'],                                                             cal:165, pro:31, carb:0,   fat:3.6 },
  { names:['salmon','grilled salmon','baked salmon'],                                               cal:208, pro:20, carb:0,   fat:13  },
  { names:['tuna','canned tuna','tuna fish'],                                                       cal:128, pro:30, carb:0,   fat:1   },
  { names:['beef','ground beef','minced beef','lean beef','beef mince'],                            cal:215, pro:26, carb:0,   fat:12  },
  { names:['steak','beef steak','sirloin','ribeye'],                                                cal:271, pro:26, carb:0,   fat:17  },
  { names:['turkey breast','turkey'],                                                               cal:135, pro:30, carb:0,   fat:1   },
  { names:['shrimp','prawns','cooked shrimp'],                                                      cal:85,  pro:18, carb:0,   fat:1   },
  { names:['tilapia','white fish','cod','haddock'],                                                 cal:128, pro:26, carb:0,   fat:2.7 },
  { names:['egg','eggs','whole egg','large egg'],                                                   cal:155, pro:13, carb:1.1, fat:11, each:50 },
  { names:['egg white','egg whites'],                                                               cal:52,  pro:11, carb:0.7, fat:0.2 },
  { names:['tofu','firm tofu'],                                                                     cal:76,  pro:8,  carb:2,   fat:4   },
  { names:['greek yogurt','plain greek yogurt'],                                                    cal:97,  pro:9,  carb:4,   fat:5   },
  { names:['cottage cheese','low fat cottage cheese'],                                              cal:98,  pro:11, carb:3.4, fat:4.3 },
  { names:['whey protein','protein powder','protein shake','protein scoop'],                        cal:375, pro:75, carb:13,  fat:7.5, each:30 },
  { names:['canned sardines','sardines'],                                                           cal:208, pro:25, carb:0,   fat:11  },
  // \u2500\u2500 Carbs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  { names:['white rice','rice','steamed rice','cooked rice'],                                       cal:130, pro:2.7,carb:28,  fat:0.3 },
  { names:['brown rice','cooked brown rice'],                                                       cal:123, pro:2.7,carb:26,  fat:1   },
  { names:['oats','oatmeal','rolled oats','porridge'],                                              cal:389, pro:17, carb:66,  fat:7   },
  { names:['pasta','cooked pasta','spaghetti','penne','fusilli'],                                   cal:158, pro:5.8,carb:31,  fat:0.9 },
  { names:['white bread','bread','toast','slice of bread','white toast'],                           cal:265, pro:9,  carb:49,  fat:3,  each:30 },
  { names:['whole wheat bread','wholegrain bread','brown bread'],                                   cal:247, pro:11, carb:44,  fat:3.4, each:30 },
  { names:['sweet potato','sweet potatoes','yam'],                                                  cal:86,  pro:1.6,carb:20,  fat:0.1 },
  { names:['potato','potatoes','boiled potato','baked potato','white potato'],                      cal:77,  pro:2,  carb:17,  fat:0.1 },
  { names:['quinoa','cooked quinoa'],                                                               cal:120, pro:4.4,carb:22,  fat:1.9 },
  { names:['banana','bananas'],                                                                     cal:89,  pro:1.1,carb:23,  fat:0.3, each:120 },
  { names:['apple','apples'],                                                                       cal:52,  pro:0.3,carb:14,  fat:0.2, each:182 },
  { names:['orange','oranges'],                                                                     cal:47,  pro:0.9,carb:12,  fat:0.1, each:130 },
  { names:['blueberries','blueberry'],                                                              cal:57,  pro:0.7,carb:14,  fat:0.3 },
  { names:['strawberries','strawberry'],                                                            cal:32,  pro:0.7,carb:8,   fat:0.3 },
  { names:['granola','granola bar'],                                                                cal:471, pro:10, carb:64,  fat:20  },
  { names:['wrap','tortilla','flour tortilla'],                                                     cal:307, pro:8,  carb:51,  fat:7,  each:40 },
  // \u2500\u2500 Fats & nuts \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  { names:['olive oil','extra virgin olive oil','evoo'],                                            cal:884, pro:0,  carb:0,   fat:100 },
  { names:['butter','unsalted butter'],                                                             cal:717, pro:0.9,carb:0.1, fat:81  },
  { names:['peanut butter','natural peanut butter','pb'],                                           cal:588, pro:25, carb:20,  fat:50  },
  { names:['almond butter'],                                                                        cal:614, pro:21, carb:19,  fat:56  },
  { names:['almonds','almond'],                                                                     cal:579, pro:21, carb:22,  fat:50  },
  { names:['cashews','cashew nuts'],                                                                cal:553, pro:18, carb:30,  fat:44  },
  { names:['walnuts','walnut'],                                                                     cal:654, pro:15, carb:14,  fat:65  },
  { names:['avocado'],                                                                              cal:160, pro:2,  carb:9,   fat:15, each:150 },
  { names:['cheddar cheese','cheddar','cheese'],                                                    cal:403, pro:25, carb:1.3, fat:33  },
  { names:['mozzarella','mozzarella cheese'],                                                       cal:280, pro:28, carb:2.2, fat:17  },
  // \u2500\u2500 Dairy & eggs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  { names:['whole milk','milk','full fat milk'],                                                    cal:61,  pro:3.2,carb:4.8, fat:3.3 },
  { names:['skim milk','skimmed milk','low fat milk'],                                              cal:35,  pro:3.4,carb:5,   fat:0.2 },
  { names:['protein bar'],                                                                          cal:350, pro:20, carb:40,  fat:12, each:60  },
  // \u2500\u2500 Vegetables \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  { names:['broccoli','steamed broccoli'],                                                          cal:34,  pro:2.8,carb:7,   fat:0.4 },
  { names:['spinach','baby spinach'],                                                               cal:23,  pro:2.9,carb:3.6, fat:0.4 },
  { names:['mixed vegetables','veggies','vegetables'],                                              cal:65,  pro:3,  carb:13,  fat:0.5 },
  { names:['salad','mixed salad','green salad'],                                                    cal:20,  pro:1.5,carb:3,   fat:0.3 },
  { names:['cucumber','cucumbers'],                                                                 cal:15,  pro:0.7,carb:3.6, fat:0.1 },
  { names:['tomato','tomatoes','cherry tomatoes'],                                                  cal:18,  pro:0.9,carb:3.9, fat:0.2 },
  { names:['onion','onions'],                                                                       cal:40,  pro:1.1,carb:9,   fat:0.1 },
  // \u2500\u2500 Misc \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  { names:['rice cakes','rice cake'],                                                               cal:387, pro:8,  carb:82,  fat:3,  each:9  },
  { names:['dark chocolate','dark choc'],                                                           cal:546, pro:5,  carb:60,  fat:31  },
  { names:['honey','pure honey'],                                                                   cal:304, pro:0.3,carb:82,  fat:0   },
  { names:['hummus'],                                                                               cal:166, pro:8,  carb:14,  fat:10  },
  { names:['olive oil spray','cooking spray'],                                                      cal:0,   pro:0,  carb:0,   fat:0   },
];
