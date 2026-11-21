// Solmar Bay simulation core: the player, the cars, the pedestrians, the police and
// the wanted level. Pure logic — no DOM, no canvas, no audio — so a headless Node
// test can import it and play the whole story. Rendering and sound read this state
// and never write it.

import { Rng } from './rng.js';
import {
  buildCity, collides, moveWithCollision, randomRoadPoint, randomParkSpot,
  nearestShop, shopCenter,
} from './city.js';
import {
  startMission, updateMission, missionObjective, missionMarkers,
  startFare, updateFare, fareActive, MISSIONS,
} from './missions.js';

export const FOOT_SPEED = 178;
export const CAR_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#ecf0f1', '#2c3e50', '#e67e22', '#16a085', '#d35400'];
export const PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'];

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(seed = 'solmar') {
  const rng = new Rng(seed);
  const city = buildCity(seed);
  const world = {
    seed,
    city,
    rng,
    time: 0,
    player: {
      x: city.spawn.x,
      y: city.spawn.y,
      angle: city.spawn.angle,
      speed: 0,
      onFoot: true,
      health: 100,
      money: 250,
      ammo: 12,
      carId: null,
      punchCooldown: 0,
      shootCooldown: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    heat: 0,
    wanted: 0,
    lastCrimeAt: -100,
    missionIndex: 0,
    mission: null,
    storyDone: false,
    fare: null,
    faresDone: 0,
    totalEarned: 0,
    crates: [],
    events: [],
    stats: { shots: 0, hits: 0, carsStolen: 0, busted: 0, punches: 0 },
    sirenOn: false,
  };
  spawnParkedCars(world, 16);
  spawnTraffic(world, 10);
  spawnPeds(world, 16);
  startMission(world, 0);
  return world;
}

function nextCarId(world) {
  world._carSeq = (world._carSeq || 0) + 1;
  return world._carSeq;
}

export function spawnParkedCars(world, n) {
  for (let i = 0; i < n; i++) {
    const spot = randomParkSpot(world.city, world.rng);
    world.cars.push({
      id: nextCarId(world),
      x: spot.x,
      y: spot.y,
      angle: spot.angle,
      speed: 0,
      color: world.rng.pick(CAR_COLORS),
      kind: 'parked',
      hp: 100,
      maxSpeed: world.rng.range(300, 380),
      driver: 'none',
    });
  }
}

export function spawnTraffic(world, n) {
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(world.city, world.rng);
    const vertical = world.rng.chance(0.5);
    world.cars.push({
      id: nextCarId(world),
      x: p.x,
      y: p.y,
      angle: vertical ? (world.rng.chance(0.5) ? 0 : Math.PI) : (world.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
      speed: world.rng.range(120, 190),
      color: world.rng.pick(CAR_COLORS),
      kind: 'traffic',
      hp: 100,
      maxSpeed: world.rng.range(150, 210),
      driver: 'traffic',
      cruise: world.rng.range(130, 195),
    });
  }
}

export function spawnPeds(world, n) {
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(world.city, world.rng);
    world.peds.push({
      x: p.x,
      y: p.y,
      angle: world.rng.range(0, Math.PI * 2),
      speed: world.rng.range(38, 68),
      state: 'walk',
      tx: p.x,
      ty: p.y,
      color: world.rng.pick(PED_COLORS),
      downTimer: 0,
      fleeTimer: 0,
    });
  }
}

export function addHeat(world, amount) {
  world.heat = clamp(world.heat + amount, 0, 100);
  world.lastCrimeAt = world.time;
  const stars = Math.min(5, Math.floor(world.heat / 20));
  if (stars > world.wanted) {
    world.wanted = stars;
    world.events.push({ type: 'wanted-up', stars });
  }
}

export function nearestCar(world, x, y, maxDist, kinds) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const car of world.cars) {
    if (kinds && !kinds.includes(car.kind)) continue;
    const d = dist2(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function stepOnFoot(world, dt, input) {
  const p = world.player;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
    p.angle = Math.atan2(my, mx);
    const moved = moveWithCollision(world.city, p.x, p.y, mx * FOOT_SPEED * dt, my * FOOT_SPEED * dt, 12);
    p.x = moved.x;
    p.y = moved.y;
    p.speed = FOOT_SPEED;
  } else {
    p.speed = 0;
  }
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
}

function stepDriving(world, dt, input) {
  const p = world.player;
  const car = world.cars.find((c) => c.id === p.carId);
  if (!car) {
    p.onFoot = true;
    p.carId = null;
    return;
  }
  const forward = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  // Steering is flipped when reversing, like a real car.
  const dir = car.speed >= 0 ? 1 : -1;
  const accel = 300;
  const brake = 520;
  if (forward > 0) {
    car.speed += accel * dt;
  } else if (forward < 0) {
    if (car.speed > 8) car.speed -= brake * dt;
    else car.speed -= accel * 0.45 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 190 * dt);
  }
  if (input.handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 620 * dt);
  }
  car.speed = clamp(car.speed, -135, car.maxSpeed);
  const steerAuthority = clamp(Math.abs(car.speed) / 140, 0, 1);
  car.angle += steer * dir * steerAuthority * (input.handbrake ? 6.5 : 4.5) * dt;
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const moved = moveWithCollision(world.city, car.x, car.y, dx, dy, 15);
  if ((moved.hitX || moved.hitY) && Math.abs(car.speed) > 90) {
    car.hp -= Math.abs(car.speed) * 0.09;
    world.events.push({ type: 'crash', x: car.x, y: car.y, hard: Math.abs(car.speed) > 220 });
    car.speed *= 0.35;
    if (car.hp <= 0) wreckCar(world, car);
  }
  car.x = moved.x;
  car.y = moved.y;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = car.speed;
}

function safeExitSpot(world, x, y) {
  // Find a spot next to the car that is not inside a building or the water,
  // so the player never spawns wedged in a collision zone.
  const offsets = [[26, 26], [-26, 26], [26, -26], [-26, -26], [0, 32], [0, -32], [32, 0], [-32, 0]];
  for (const [dx, dy] of offsets) {
    if (!collides(world.city, x + dx, y + dy, 12)) return { x: x + dx, y: y + dy };
  }
  return { x, y };
}

function wreckCar(world, car) {
  car.hp = 0;
  car.speed = 0;
  car.kind = 'wreck';
  car.driver = 'none';
  world.events.push({ type: 'wreck', x: car.x, y: car.y });
  const p = world.player;
  if (p.carId === car.id) {
    p.onFoot = true;
    p.carId = null;
    const spot = safeExitSpot(world, car.x, car.y);
    p.x = spot.x;
    p.y = spot.y;
    p.health = Math.max(1, p.health - 25);
  }
}

export function tryEnterCar(world) {
  const p = world.player;
  if (!p.onFoot) return false;
  const car = nearestCar(world, p.x, p.y, 46, ['parked', 'traffic']);
  if (!car) return false;
  if (car.kind === 'traffic') {
    addHeat(world, 25);
    world.stats.carsStolen++;
    world.events.push({ type: 'carjack', x: car.x, y: car.y });
    // The driver bails and runs.
    world.peds.push({
      x: car.x + 20, y: car.y + 20, angle: world.rng.range(0, Math.PI * 2),
      speed: 120, state: 'flee', tx: car.x + 300, ty: car.y + 300,
      color: world.rng.pick(PED_COLORS), downTimer: 0, fleeTimer: 2.5,
    });
  } else {
    world.events.push({ type: 'enter-car', x: car.x, y: car.y });
  }
  car.kind = 'player';
  car.driver = 'player';
  p.onFoot = false;
  p.carId = car.id;
  p.x = car.x;
  p.y = car.y;
  return true;
}

export function tryExitCar(world) {
  const p = world.player;
  if (p.onFoot) return false;
  const car = world.cars.find((c) => c.id === p.carId);
  if (!car || Math.abs(car.speed) > 60) return false;
  car.driver = 'none';
  car.kind = 'parked';
  p.onFoot = true;
  p.carId = null;
  const spot = safeExitSpot(world, car.x, car.y);
  p.x = spot.x;
  p.y = spot.y;
  world.events.push({ type: 'exit-car', x: p.x, y: p.y });
  return true;
}

export function tryPunch(world) {
  const p = world.player;
  if (!p.onFoot || p.punchCooldown > 0) return false;
  p.punchCooldown = 0.45;
  world.stats.punches++;
  world.events.push({ type: 'punch', x: p.x + Math.cos(p.angle) * 26, y: p.y + Math.sin(p.angle) * 26 });
  const reach = 36;
  const fx = p.x + Math.cos(p.angle) * reach;
  const fy = p.y + Math.sin(p.angle) * reach;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (dist2(fx, fy, ped.x, ped.y) < 30 * 30) {
      ped.state = 'down';
      ped.downTimer = 5;
      addHeat(world, 12);
      world.events.push({ type: 'knockdown', x: ped.x, y: ped.y });
      return true;
    }
  }
  for (const cop of world.cops) {
    if (dist2(fx, fy, cop.x, cop.y) < 30 * 30) {
      cop.hp -= 34;
      addHeat(world, 20);
      if (cop.hp <= 0) {
        cop.down = true;
        cop.downTimer = 8;
        addHeat(world, 25);
      }
      return true;
    }
  }
  return true;
}

export function tryShoot(world) {
  const p = world.player;
  if (!p.onFoot || p.shootCooldown > 0 || p.ammo <= 0) return false;
  p.shootCooldown = 0.28;
  p.ammo--;
  world.stats.shots++;
  addHeat(world, 15);
  const range = 460;
  const mx = p.x + Math.cos(p.angle) * range;
  const my = p.y + Math.sin(p.angle) * range;
  world.events.push({ type: 'shot', x: mx, y: my, fromX: p.x, fromY: p.y });
  let best = null;
  let bestD = range * range;
  const consider = (x, y, kind, ref) => {
    // Distance from the target to the shot line, plus along-line distance.
    const dx = x - p.x;
    const dy = y - p.y;
    const along = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
    if (along < 0 || along > range) return;
    const perp = Math.abs(-dx * Math.sin(p.angle) + dy * Math.cos(p.angle));
    if (perp > 26) return;
    const d = along * along + perp * perp;
    if (d < bestD) {
      bestD = d;
      best = { kind, ref };
    }
  };
  for (const ped of world.peds) {
    if (ped.state !== 'down') consider(ped.x, ped.y, 'ped', ped);
  }
  for (const cop of world.cops) {
    if (!cop.down) consider(cop.x, cop.y, 'cop', cop);
  }
  for (const car of world.cars) {
    if (car.kind === 'player') continue;
    consider(car.x, car.y, 'car', car);
  }
  if (!best) return true;
  world.stats.hits++;
  if (best.kind === 'ped') {
    best.ref.state = 'down';
    best.ref.downTimer = 7;
    addHeat(world, 30);
    world.events.push({ type: 'knockdown', x: best.ref.x, y: best.ref.y });
  } else if (best.kind === 'cop') {
    best.ref.hp -= 34;
    addHeat(world, 25);
    if (best.ref.hp <= 0) {
      best.ref.down = true;
      best.ref.downTimer = 8;
      addHeat(world, 25);
    }
  } else {
    best.ref.hp -= 34;
    if (best.ref.hp <= 0 && best.ref.kind !== 'wreck') wreckCar(world, best.ref);
    else world.events.push({ type: 'hit-car', x: best.ref.x, y: best.ref.y });
  }
  return true;
}

function spawnPolice(world) {
  const p = world.player;
  const wantCars = Math.min(world.wanted, 4);
  const wantCops = Math.min(world.wanted, 4);
  const liveCars = world.cars.filter((c) => c.kind === 'police').length;
  const liveCops = world.cops.filter((c) => !c.down).length;
  for (let i = liveCars; i < wantCars; i++) {
    let spot = randomRoadPoint(world.city, world.rng);
    let tries = 0;
    while (dist2(spot.x, spot.y, p.x, p.y) < 420 * 420 && tries++ < 8) {
      spot = randomRoadPoint(world.city, world.rng);
    }
    world.cars.push({
      id: nextCarId(world),
      x: spot.x, y: spot.y, angle: angleTo(spot.x, spot.y, p.x, p.y),
      speed: 200, color: '#1c2733', kind: 'police', hp: 120,
      maxSpeed: 330, driver: 'police', cruise: 300,
    });
    world.events.push({ type: 'siren', x: spot.x, y: spot.y });
  }
  for (let i = liveCops; i < wantCops; i++) {
    const a = world.rng.range(0, Math.PI * 2);
    const d = world.rng.range(260, 420);
    world.cops.push({
      x: clamp(p.x + Math.cos(a) * d, 40, world.city.size - 40),
      y: clamp(p.y + Math.sin(a) * d, 40, world.city.size - 40),
      angle: 0, speed: 0, hp: 68, down: false, downTimer: 0,
    });
  }
}

function stepPolice(world, dt) {
  const p = world.player;
  for (const car of world.cars) {
    if (car.kind !== 'police') continue;
    const target = angleTo(car.x, car.y, p.x, p.y);
    const diff = angleDiff(target, car.angle);
    car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    car.speed = clamp(car.speed + 260 * dt, 0, car.maxSpeed);
    const dx = Math.cos(car.angle) * car.speed * dt;
    const dy = Math.sin(car.angle) * car.speed * dt;
    const moved = moveWithCollision(world.city, car.x, car.y, dx, dy, 15);
    if (moved.hitX || moved.hitY) car.speed *= 0.5;
    car.x = moved.x;
    car.y = moved.y;
    // Ramming the player's car hurts it; ramming the player on foot hurts them.
    if (!p.onFoot && p.carId) {
      const pc = world.cars.find((c) => c.id === p.carId);
      if (pc && dist2(car.x, car.y, pc.x, pc.y) < 34 * 34) {
        pc.hp -= 8 * dt;
        car.speed *= 0.6;
        if (pc.hp <= 0) wreckCar(world, pc);
      }
    } else if (dist2(car.x, car.y, p.x, p.y) < 30 * 30) {
      p.health -= 18 * dt;
      car.speed *= 0.5;
      if (p.health <= 0) bustPlayer(world, 'run over by the Solmar PD');
    }
  }
  for (const cop of world.cops) {
    if (cop.down) {
      cop.downTimer -= dt;
      if (cop.downTimer <= 0) {
        cop.down = false;
        cop.hp = 68;
      }
      continue;
    }
    const target = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = target;
    const chaseSpeed = p.onFoot ? 115 : 118;
    const moved = moveWithCollision(world.city, cop.x, cop.y, Math.cos(target) * chaseSpeed * dt, Math.sin(target) * chaseSpeed * dt, 11);
    cop.x = moved.x;
    cop.y = moved.y;
    if (p.onFoot && dist2(cop.x, cop.y, p.x, p.y) < 24 * 24) {
      bustPlayer(world, 'caught by the Solmar PD');
      return;
    }
  }
  // When the heat is gone the PD stands down: patrol cars go back to traffic,
  // foot cops walk off.
  if (world.wanted === 0) {
    for (const car of world.cars) {
      if (car.kind === 'police') {
        car.kind = 'traffic';
        car.driver = 'traffic';
        car.cruise = 160;
      }
    }
    world.cops = [];
  }
}

export function bustPlayer(world, reason) {
  const p = world.player;
  const fine = Math.min(p.money, 120 + 60 * world.wanted);
  p.money -= fine;
  p.health = 100;
  world.heat = 0;
  world.wanted = 0;
  world.stats.busted++;
  if (p.carId) {
    const car = world.cars.find((c) => c.id === p.carId);
    if (car) {
      car.kind = 'parked';
      car.driver = 'none';
      car.speed = 0;
    }
    p.carId = null;
  }
  p.onFoot = true;
  p.x = world.city.station.x;
  p.y = world.city.station.y + 120;
  p.angle = -Math.PI / 2;
  world.cops = [];
  for (const car of world.cars) {
    if (car.kind === 'police') {
      car.kind = 'traffic';
      car.driver = 'traffic';
    }
  }
  world.events.push({ type: 'busted', reason, fine });
  if (world.mission) {
    world.mission.failed = true;
    world.mission.failReason = reason;
  }
}

export function useShop(world) {
  const p = world.player;
  const gun = nearestShop(world.city, 'gun', p.x, p.y);
  const spray = nearestShop(world.city, 'spray', p.x, p.y);
  const check = (shop, radius) => {
    if (!shop) return false;
    const c = shopCenter(shop);
    return dist2(p.x, p.y, c.x, c.y) < radius * radius;
  };
  if (check(gun, 130)) {
    if (p.money >= 80) {
      p.money -= 80;
      p.ammo += 24;
      world.events.push({ type: 'cash', text: 'Ammo +24  ($80)' });
      return 'ammo';
    }
    world.events.push({ type: 'denied', text: 'Need $80 for ammo' });
    return 'denied';
  }
  if (check(spray, 150)) {
    if (p.money >= 150) {
      p.money -= 150;
      world.heat = 0;
      world.wanted = 0;
      world.lastSprayAt = world.time;
      const car = world.cars.find((c) => c.id === p.carId);
      if (car) car.hp = 100;
      world.events.push({ type: 'cash', text: 'Fresh paint  ($150) — heat gone' });
      return 'spray';
    }
    world.events.push({ type: 'denied', text: 'Need $150 for a respray' });
    return 'denied';
  }
  return null;
}

function stepTraffic(world, dt) {
  const p = world.player;
  for (const car of world.cars) {
    if (car.kind !== 'traffic') continue;
    // Stay on the road: at an intersection, sometimes turn onto the crossing road.
    const onV = world.city.roadLines.some((lx) => Math.abs(car.x - lx) < 26);
    const onH = world.city.roadLines.some((ly) => ly < 2100 && Math.abs(car.y - ly) < 26);
    if (onV && onH && world.rng.chance(dt * 0.5)) {
      const vertical = world.rng.chance(0.5);
      car.angle = vertical
        ? (world.rng.chance(0.5) ? 0 : Math.PI)
        : (world.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    }
    // Slow down for the car ahead.
    let blocked = false;
    for (const other of world.cars) {
      if (other === car || other.kind === 'wreck') continue;
      const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
      const side = Math.abs(-(other.x - car.x) * Math.sin(car.angle) + (other.y - car.y) * Math.cos(car.angle));
      if (ahead > 0 && ahead < 58 && side < 20) {
        blocked = true;
        break;
      }
    }
    const target = blocked ? 0 : car.cruise;
    car.speed += clamp(target - car.speed, -320 * dt, 200 * dt);
    const dx = Math.cos(car.angle) * car.speed * dt;
    const dy = Math.sin(car.angle) * car.speed * dt;
    const moved = moveWithCollision(world.city, car.x, car.y, dx, dy, 14);
    if (moved.hitX || moved.hitY) {
      // Nudged off the road by a shove: snap back onto the nearest road line.
      const lx = world.city.roadLines.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
      const ly = world.city.roadLines.filter((v) => v < 2100).reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
      if (Math.abs(car.x - lx) < Math.abs(car.y - ly)) {
        car.x = lx;
        car.angle = car.speed >= 0 ? 0 : Math.PI;
      } else {
        car.y = ly;
        car.angle = car.speed >= 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      car.speed *= 0.5;
    } else {
      car.x = moved.x;
      car.y = moved.y;
    }
    // Recycle far-away traffic onto a road near the player so the streets stay alive.
    if (dist2(car.x, car.y, p.x, p.y) > 1000 * 1000) {
      const vertical = world.rng.chance(0.5);
      if (vertical) {
        const line = world.rng.pick(world.city.roadLines);
        car.x = line + world.rng.range(-20, 20);
        car.y = clamp(p.y + world.rng.range(-450, 450), 120, 2050);
      } else {
        const hLines = world.city.roadLines.filter((v) => v < 2100);
        const ly = world.rng.pick(hLines);
        car.x = clamp(p.x + world.rng.range(-450, 450), 120, 2280);
        car.y = ly + world.rng.range(-20, 20);
      }
    }
  }
  // Gentle push-apart so cars never overlap.
  for (let i = 0; i < world.cars.length; i++) {
    for (let j = i + 1; j < world.cars.length; j++) {
      const a = world.cars[i];
      const b = world.cars[j];
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < 30 * 30 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (30 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        if (a.kind !== 'player' && a.kind !== 'police') {
          a.x -= nx * push;
          a.y -= ny * push;
        }
        if (b.kind !== 'player' && b.kind !== 'police') {
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }
}

function stepPeds(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 2.5;
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = angleTo(p.x, p.y, ped.x, ped.y);
      ped.angle = away;
      const moved = moveWithCollision(world.city, ped.x, ped.y, Math.cos(away) * 130 * dt, Math.sin(away) * 130 * dt, 10);
      ped.x = moved.x;
      ped.y = moved.y;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      continue;
    }
    // Flee a nearby speeding car or a gunshot.
    const playerCar = p.onFoot ? null : world.cars.find((c) => c.id === p.carId);
    const threat = playerCar && Math.abs(playerCar.speed) > 60 && dist2(ped.x, ped.y, playerCar.x, playerCar.y) < 70 * 70;
    if (threat) {
      ped.state = 'flee';
      ped.fleeTimer = 1.6;
      continue;
    }
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      const spot = randomRoadPoint(world.city, world.rng);
      ped.tx = spot.x;
      ped.ty = spot.y;
      continue;
    }
    ped.angle = Math.atan2(dy, dx);
    const moved = moveWithCollision(world.city, ped.x, ped.y, (dx / d) * ped.speed * dt, (dy / d) * ped.speed * dt, 10);
    ped.x = moved.x;
    ped.y = moved.y;
  }
}

function stepWanted(world, dt) {
  if (world.heat <= 0) {
    world.wanted = 0;
    return;
  }
  const nearPolice = world.cops.some((c) => !c.down && dist2(c.x, c.y, world.player.x, world.player.y) < 520 * 520)
    || world.cars.some((c) => c.kind === 'police' && dist2(c.x, c.y, world.player.x, world.player.y) < 520 * 520);
  const quiet = world.time - world.lastCrimeAt > 5;
  if (quiet) {
    world.heat = Math.max(0, world.heat - (nearPolice ? 1.6 : 4.5) * dt);
  }
  world.wanted = Math.min(5, Math.floor(world.heat / 20));
  const sirenShouldBe = world.wanted > 0;
  if (sirenShouldBe !== world.sirenOn) {
    world.sirenOn = sirenShouldBe;
    world.events.push({ type: sirenShouldBe ? 'siren-on' : 'siren-off' });
  }
  if (world.wanted > 0) spawnPolice(world);
}

// One simulation step. Input is a plain object:
// { up, down, left, right, handbrake, enter, punch, shoot, use }.
export function stepWorld(world, dt, input) {
  world.time += dt;
  const p = world.player;
  if (input.enter) {
    if (p.onFoot) tryEnterCar(world);
    else tryExitCar(world);
  }
  if (input.use) useShop(world);
  if (input.punch) tryPunch(world);
  if (input.shoot) tryShoot(world);
  if (p.onFoot) stepOnFoot(world, dt, input);
  else stepDriving(world, dt, input);
  stepTraffic(world, dt);
  stepPeds(world, dt);
  stepPolice(world, dt);
  stepWanted(world, dt);
  if (world.mission) updateMission(world, dt);
  if (world.fare) updateFare(world, dt);
  // Keep the streets populated.
  if (world.cars.filter((c) => c.kind === 'traffic').length < 8) {
    spawnTraffic(world, 1);
  }
  if (world.cars.filter((c) => c.kind === 'parked').length < 10) {
    spawnParkedCars(world, 1);
  }
  if (world.peds.length < 14) spawnPeds(world, 1);
  if (p.health <= 0 && world.wanted >= 0) {
    bustPlayer(world, 'patched up after a bad crash');
  }
}

export function currentObjective(world) {
  if (world.mission) return missionObjective(world);
  if (world.fare) return 'Drop the fare at the marker — tip included for fast delivery.';
  if (world.storyDone) return 'Story complete. Free roam — grab a cab fare (E near a fare marker).';
  return 'Talk to Carmen — follow the gold marker.';
}

export function currentMarkers(world) {
  const markers = [];
  if (world.mission) markers.push(...missionMarkers(world));
  if (world.fare && world.fare.marker) markers.push(world.fare.marker);
  return markers;
}

export function snapshotForSave(world) {
  return {
    money: Math.round(world.player.money),
    ammo: world.player.ammo,
    health: Math.round(world.player.health),
    missionIndex: world.missionIndex,
    storyDone: world.storyDone,
    totalEarned: Math.round(world.totalEarned),
    faresDone: world.faresDone,
  };
}

export function applySave(world, save) {
  if (!save) return;
  world.player.money = save.money ?? 250;
  world.player.ammo = save.ammo ?? 12;
  world.player.health = save.health ?? 100;
  world.missionIndex = save.missionIndex ?? 0;
  world.storyDone = !!save.storyDone;
  world.totalEarned = save.totalEarned ?? 0;
  world.faresDone = save.faresDone ?? 0;
  world.mission = null;
  if (world.storyDone) {
    world.mission = null;
  } else {
    startMission(world, world.missionIndex);
  }
}

export { MISSIONS };




