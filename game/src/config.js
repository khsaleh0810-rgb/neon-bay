// Neon Bay — every tuning number, colour and mission in one place.
// The camera shows a 1280x720 window onto a 2400x2400 city; nothing in the
// rules depends on the screen size, only on the world coordinates.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { size: 2400 };

// The city is a grid: roads run every BLOCK px, ROAD wide, with building
// blocks between them. A beach strip runs along the south edge.
export const CITY = {
  block: 300,
  road: 64,
  margin: 26, // building inset inside a block
  beachY: 2160, // everything below this line is sand and sea
  safehouse: { x: 900, y: 210 }, // Dahlia's garage, on the north road, a real drive from the spawn corner
  bank: { x: 1230, y: 930 }, // Bay Bank, centre of the city
  hospital: { x: 1950, y: 450 },
  policeHQ: { x: 450, y: 1650 },
  gunShop: { x: 1650, y: 1950 },
  sprayShop: { x: 930, y: 1950 },
  hotel: { x: 1950, y: 1230 },
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 340,
  health: 100,
  punchDamage: 25,
  punchRange: 34,
  punchCooldown: 0.35,
};

export const PISTOL = {
  damage: 34,
  range: 420,
  fireCooldown: 0.28,
  startAmmo: 24,
  ammoPrice: 50,
  ammoPack: 30,
};

export const CAR = {
  width: 46,
  length: 84,
  accel: 420,
  brake: 700,
  reverseMax: 160,
  maxSpeed: 560,
  grip: 2.6,
  health: 150,
  // A stolen car's owner may be inside: jacking a driven car is a crime.
  jackWanted: 1,
};

export const TRAFFIC = {
  count: 14,
  speed: 190,
  speedJitter: 60,
  // How often a traffic car turns at an intersection instead of going straight.
  turnChance: 0.3,
};

export const PEDS = {
  count: 26,
  speed: 55,
  speedJitter: 30,
  // A pedestrian hit by a car is a crime when a cop is near enough to see it.
  witnessRadius: 520,
};

export const POLICE = {
  maxCars: 6,
  carSpeed: 540,
  footSpeed: 300,
  // Wanted stars and how many units answer: 1 star = 1 car, up to 6.
  carsForStars: [0, 1, 2, 3, 4, 6],
  bustRadius: 46,
  shootAboveStars: 2,
  shotDamage: 6,
  shotCooldown: 0.9,
  // Seconds without a fresh crime before one star fades, while no cop is close.
  decaySeconds: 18,
  // A police car that has not been within this distance for this long gives
  // up the chase and leaves, so escaping is possible.
  lostDistance: 700,
  lostSeconds: 12,
};

// Wanted stars 0..5; each crime adds heat, heat decays one star at a time.
export const WANTED = {
  max: 5,
  jackCar: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
  // Busted or wasted: the fine is a share of the cash on hand.
  fineShare: 0.1,
  minFine: 25,
};

// Six story missions from Dahlia, the fixer. Each has an id, a title, the
// briefing text, a list of steps and a payout. Steps are checked by the
// world: reach a point, pick up a passenger, collect crates, hold a point,
// reach a wanted level and then lose it, or wait out a timer.
export const MISSIONS = [
  {
    id: 'wheels',
    title: 'Wheels',
    brief: 'Dahlia needs a driver. Jack any car and bring it to her garage.',
    payout: 150,
    steps: [
      { kind: 'enterCar', text: 'Get in a car (walk up to one and press E)' },
      { kind: 'reach', at: 'safehouse', radius: 90, text: 'Drive to Dahlia\u2019s garage' },
    ],
  },
  {
    id: 'cab',
    title: 'Cab Fare',
    brief: 'A client is waiting at the docks. Pick them up, drop them at the hotel.',
    payout: 200,
    steps: [
      { kind: 'reach', at: 'dockPickup', radius: 80, text: 'Pick up the client at the docks' },
      { kind: 'reach', at: 'hotel', radius: 90, text: 'Drop the client at the Bay Hotel' },
    ],
  },
  {
    id: 'delivery',
    title: 'Hot Delivery',
    brief: 'A package for the north pier. Ninety seconds. No questions.',
    payout: 300,
    timer: 90,
    steps: [
      { kind: 'reach', at: 'northPier', radius: 80, text: 'Deliver the package to the north pier' },
    ],
  },
  {
    id: 'heat',
    title: 'Heat',
    brief: 'The crew wants to know you can shake a tail. Get to two stars, then lose them.',
    payout: 400,
    steps: [
      { kind: 'wanted', stars: 2, text: 'Raise your wanted level to 2 stars' },
      { kind: 'loseWanted', text: 'Lose the cops — get back to 0 stars' },
    ],
  },
  {
    id: 'crates',
    title: 'Three Crates',
    brief: 'Three crates stashed around the bay. Collect them all, on foot or by car.',
    payout: 500,
    steps: [
      { kind: 'collect', count: 3, text: 'Collect the crates (3 left)' },
    ],
  },
  {
    id: 'score',
    title: 'The Big Score',
    brief: 'Bay Bank. Hold the vault door for five seconds, then lose a 3-star tail at the safehouse.',
    payout: 1500,
    steps: [
      { kind: 'hold', at: 'bank', radius: 90, seconds: 5, text: 'Hold the bank vault door' },
      { kind: 'reach', at: 'safehouse', radius: 90, text: 'Escape to Dahlia\u2019s garage' },
    ],
  },
];

// Named points on the map that missions refer to by key.
export const PLACES = {
  safehouse: { x: 900, y: 210, label: 'Dahlia\u2019s Garage' },
  bank: { x: 1230, y: 930, label: 'Bay Bank' },
  hospital: { x: 1950, y: 450, label: 'St. Marina Hospital' },
  policeHQ: { x: 450, y: 1650, label: 'Bay PD' },
  gunShop: { x: 1650, y: 1950, label: 'Ironworks Guns' },
  sprayShop: { x: 930, y: 1950, label: 'Spray Shop' },
  hotel: { x: 1950, y: 1230, label: 'Bay Hotel' },
  dockPickup: { x: 300, y: 2010, label: 'Docks' },
  northPier: { x: 1800, y: 210, label: 'North Pier' },
  crateA: { x: 690, y: 690, label: 'Crate' },
  crateB: { x: 1650, y: 1650, label: 'Crate' },
  crateC: { x: 450, y: 1230, label: 'Crate' },
};

// The day lasts this long; the sky tint and window lights follow it.
export const DAY_LENGTH = 240;

export const PALETTE = {
  backdrop: '#0b0b18',
  grass: '#1d3a24',
  sand: '#c9a86a',
  sea: '#123a5c',
  road: '#2b2b33',
  roadLine: '#d8c95a',
  sidewalk: '#3a3a44',
  building: ['#4a3b63', '#5c4a72', '#3d5a6e', '#6e4a5a', '#44517a', '#715a3d'],
  buildingRoof: ['#2e2440', '#3a2f4d', '#27404f', '#4d323e', '#2f3a58', '#4d3d28'],
  windowLit: '#ffd76a',
  windowDark: '#1c2030',
  park: '#1e4d2a',
  player: '#ffcf3d',
  playerCar: '#e5484d',
  trafficCar: ['#7fb069', '#5a8fd6', '#d6a45a', '#9b7fd6', '#d6d6d6', '#5ad6c8'],
  policeCar: '#2b4acb',
  policeLightRed: '#ff2e2e',
  policeLightBlue: '#2e7bff',
  ped: ['#e8e8e8', '#f2c94c', '#7fc3f7', '#f78fb0', '#9df2a8'],
  cop: '#2b4acb',
  marker: '#ffcf3d',
  markerPulse: '#ff9f1c',
  hud: '#eef1f5',
  hudDim: '#9aa3b2',
  panel: 'rgba(12, 12, 26, 0.88)',
  panelEdge: '#ff9f1c',
  star: '#ffcf3d',
  starEmpty: '#3a3f4d',
  health: '#4ade80',
  healthLow: '#ef4444',
  money: '#4ade80',
  danger: '#ef4444',
  spray: '#c084fc',
  gun: '#f97316',
  hospitalCross: '#ef4444',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';
export const BEST_KEY = 'neon-bay.best.v1';
