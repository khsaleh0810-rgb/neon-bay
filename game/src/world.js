// Neon Bay's rules and state, with no drawing and no browser in it: the
// player on foot and in a car, traffic, pedestrians, police, the wanted
// system, six story missions, side jobs, combat, money and the save. step()
// advances one fixed step and returns what happened as bit flags, so the
// caller can react (sound, announcements) without the world knowing about
// screens or audio. The city is built once from the seed; cars and people
// are pooled and reused, nothing allocates in the hot loop.
import {
  CAR,
  CITY,
  DAY_LENGTH,
  MISSIONS,
  PEDS,
  PISTOL,
  PLACES,
  PLAYER,
  POLICE,
  SAVE_KEY,
  TRAFFIC,
  WANTED,
} from './config.js';
import { buildCity, buildingAt, clampToWorld, isRoad, nearestRoadPoint, pedSpawn, resolveBuildings, snapToRoad, trafficSpawn } from './city.js';

export const EVENT_HIT = 1;
export const EVENT_MONEY = 2;
export const EVENT_MISSION = 4;
export const EVENT_MISSION_DONE = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_WANTED_UP = 64;
export const EVENT_WANTED_DOWN = 128;
export const EVENT_CRIME = 256;
export const EVENT_FAILED = 512;
export const EVENT_SHOT = 1024;

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
function pick(array, random) {
  return array[Math.floor(random() * array.length)];
}

export function createWorld(random) {
  const city = buildCity(random);

  const state = {
    city,
    player: {
      x: 150, y: 150, angle: 0, aimAngle: 0, health: PLAYER.health,
      inCar: null, speed: 0, ammo: PISTOL.startAmmo,
      punchCooldown: 0, fireCooldown: 0, hurtTimer: 0, invuln: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    tracers: [],
    crates: [],
    wanted: 0,
    heatTimer: 0,
    money: 60,
    missionIndex: 0,
    missionStep: 0,
    missionTimer: 0,
    missionHold: 0,
    missionFailed: false,
    passenger: null,
    sideJob: null,
    sideJobTimer: 0,
    storyDone: false,
    elapsed: 0,
    dayTime: 60,
    bustProgress: 0,
    stats: { missionsDone: 0, carsStolen: 0, pedsDown: 0, shotsFired: 0, earned: 0 },
    saveTimer: 0,
  };

  function addCar(kind, x, y, angle, colour, withDriver) {
    const car = {
      id: state.cars.length + Math.floor(random() * 100000),
      kind, x, y, angle, speed: 0, colour,
      health: CAR.health, driver: withDriver, stuck: 0,
      turnAt: 0, targetAngle: angle, brakeLight: false,
    };
    state.cars.push(car);
    return car;
  }

  function addPed(x, y) {
    const ped = {
      x, y, angle: random() * TAU, speed: PEDS.speed + random() * PEDS.speedJitter,
      colour: pick(['#e8e8e8', '#f2c94c', '#7fc3f7', '#f78fb0', '#9df2a8'], random),
      state: 'walk', tx: x, ty: y, wait: 0, down: 0, flee: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnTrafficCar() {
    const s = trafficSpawn(random);
    const colour = pick(['#7fb069', '#5a8fd6', '#d6a45a', '#9b7fd6', '#d6d6d6', '#5ad6c8'], random);
    addCar('traffic', s.x, s.y, s.angle, colour, true);
  }

  function spawnParkedCar() {
    const s = trafficSpawn(random);
    const colour = pick(['#7fb069', '#5a8fd6', '#d6a45a', '#9b7fd6', '#d6d6d6', '#5ad6c8'], random);
    const car = addCar('parked', s.x, s.y, s.angle, colour, false);
    car.speed = 0;
    return car;
  }

  function spawnPedNear(cx, cy) {
    const s = pedSpawn(random, cx, cy);
    return addPed(s.x, s.y);
  }

  function reset() {
    state.cars.length = 0;
    state.peds.length = 0;
    state.cops.length = 0;
    state.tracers.length = 0;
    state.crates.length = 0;
    const p = state.player;
    p.x = 150;
    p.y = 150;
    p.angle = 0;
    p.aimAngle = 0;
    p.health = PLAYER.health;
    p.inCar = null;
    p.speed = 0;
    p.ammo = PISTOL.startAmmo;
    p.punchCooldown = 0;
    p.fireCooldown = 0;
    p.hurtTimer = 0;
    p.invuln = 0;
    state.wanted = 0;
    state.heatTimer = 0;
    state.money = 60;
    state.missionIndex = 0;
    state.missionStep = 0;
    state.missionTimer = 0;
    state.missionHold = 0;
    state.missionFailed = false;
    state.passenger = null;
    state.sideJob = null;
    state.sideJobTimer = 0;
    state.storyDone = false;
    state.elapsed = 0;
    state.dayTime = 60;
    state.bustProgress = 0;
    state.stats = { missionsDone: 0, carsStolen: 0, pedsDown: 0, shotsFired: 0, earned: 0 };
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
    for (let i = 0; i < 6; i += 1) spawnParkedCar();
    // A few parked cars right by the spawn corner, on the road centrelines,
    // so the first job starts with a car in sight instead of a long walk.
    for (const spot of [{ x: 300, y: 150 }, { x: 150, y: 300 }, { x: 600, y: 150 }]) {
      const colour = pick(['#7fb069', '#5a8fd6', '#d6a45a', '#9b7fd6', '#d6d6d6', '#5ad6c8'], random);
      addCar('parked', spot.x, spot.y, random() < 0.5 ? 0 : Math.PI / 2, colour, false);
    }
    for (let i = 0; i < PEDS.count; i += 1) spawnPedNear(1200, 1200);
    startMission(0);
  }

  function currentMission() {
    return state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
  }

  function currentStep() {
    const m = currentMission();
    return m ? m.steps[state.missionStep] : null;
  }

  function placeFor(key) {
    return PLACES[key];
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionStep = 0;
    state.missionHold = 0;
    state.missionFailed = false;
    state.passenger = null;
    const m = MISSIONS[index];
    state.missionTimer = m && m.timer ? m.timer : 0;
    // Mission 5's crates appear when the mission starts.
    state.crates.length = 0;
    if (m && m.id === 'crates') {
      for (const key of ['crateA', 'crateB', 'crateC']) {
        const at = PLACES[key];
        state.crates.push({ x: at.x, y: at.y, taken: false });
      }
    }
    // Mission 2's client waits at the docks.
    if (m && m.id === 'cab') {
      const at = PLACES.dockPickup;
      state.passenger = { x: at.x, y: at.y, boarded: false };
    }
  }

  function crime(stars, events) {
    if (stars <= 0) return events;
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + stars);
    state.heatTimer = 0;
    if (state.wanted > before) events |= EVENT_WANTED_UP;
    return events | EVENT_CRIME;
  }

  function nearestCopDistance(x, y) {
    let best = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      best = Math.min(best, Math.sqrt(dist2(x, y, car.x, car.y)));
    }
    for (const cop of state.cops) best = Math.min(best, Math.sqrt(dist2(x, y, cop.x, cop.y)));
    return best;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      const d = dist2(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(events) {
    const p = state.player;
    const car = nearestCar(p.x, p.y, 78);
    if (!car) return events;
    if (car.kind === 'traffic' && car.driver) {
      // Jack it: the driver bails out and runs, and the law notices.
      car.driver = false;
      car.kind = 'player';
      const driver = addPed(car.x + 40, car.y + 40);
      driver.state = 'flee';
      driver.flee = 6;
      state.stats.carsStolen += 1;
      events = crime(WANTED.jackCar, events);
    } else {
      car.kind = 'player';
    }
    p.inCar = car;
    p.speed = 0;
    return events;
  }

  function exitCar() {
    const p = state.player;
    const car = p.inCar;
    if (!car) return;
    p.inCar = null;
    car.kind = 'parked';
    car.speed = 0;
    // Step out to the side of the car.
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 46;
    p.y = car.y + Math.sin(side) * 46;
    const clamped = clampToWorld(p.x, p.y, PLAYER.radius + 2);
    p.x = clamped.x;
    p.y = clamped.y;
    if (buildingAt(city, p.x, p.y, PLAYER.radius)) {
      p.x = car.x - Math.cos(side) * 46;
      p.y = car.y - Math.sin(side) * 46;
    }
  }

  function stepPlayerOnFoot(dt, move, events) {
    const p = state.player;
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.hurtTimer > 0) p.hurtTimer -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    const speed = move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = move.x;
    let my = move.y;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      p.angle = Math.atan2(my, mx);
    }
    const clamped = clampToWorld(p.x, p.y, PLAYER.radius + 2);
    p.x = clamped.x;
    p.y = clamped.y;
    const body = { x: p.x, y: p.y, radius: PLAYER.radius };
    if (resolveBuildings(city, body)) {
      p.x = body.x;
      p.y = body.y;
    }
    // Slow health regen when out of trouble.
    if (p.hurtTimer <= 0 && p.health > 0 && p.health < PLAYER.health) {
      p.health = Math.min(PLAYER.health, p.health + 2 * dt);
    }
    return events;
  }

  function stepPlayerDriving(dt, drive, events) {
    const p = state.player;
    const car = p.inCar;
    if (!car) return events;
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    // Safety net: a car that somehow ends up inside a building is pushed
    // back out, so it can never wedge itself permanently. The push-out can
    // land in a pocket too narrow for a car (between the world edge and a
    // building), so if it is still inside a building after the push, the car
    // is moved to the nearest road intersection, which is always clear.
    const body = { x: car.x, y: car.y, radius: 30 };
    if (buildingAt(city, car.x, car.y, 30)) {
      resolveBuildings(city, body);
      if (buildingAt(city, body.x, body.y, 30)) {
        const road = snapToRoad(car.x, car.y);
        body.x = road.x;
        body.y = road.y;
      }
      car.x = body.x;
      car.y = body.y;
    }
    const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    // Steering bites harder the faster the car goes, up to a point.
    const steerAuthority = clamp(Math.abs(car.speed) / 240, 0.25, 1);
    car.angle += drive.steer * CAR.grip * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
    if (drive.throttle > 0) {
      car.speed += CAR.accel * dt;
      if (car.speed > CAR.maxSpeed) car.speed = CAR.maxSpeed;
    } else if (drive.throttle < 0) {
      if (car.speed > 20) car.speed -= CAR.brake * dt;
      else car.speed = Math.max(-CAR.reverseMax, car.speed - CAR.accel * 0.6 * dt);
    } else {
      car.speed -= car.speed * 0.6 * dt;
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    // The brake pedal (S, or the driver's brake flag) slows the car hard
    // even without reversing — without it a fast car cannot make a corner.
    if (drive.brake && car.speed > 0) {
      car.speed = Math.max(0, car.speed - CAR.brake * dt);
    }
    if (drive.handbrake) {
      car.speed -= car.speed * 3.2 * dt;
      car.angle += drive.steer * 1.4 * dt * (car.speed >= 0 ? 1 : -1);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Buildings stop cars hard; a glancing hit slides along the wall instead
    // of wedging the car, so a bad line costs speed, not the whole drive.
    if (!buildingAt(city, nx, ny, 30)) {
      car.x = nx;
      car.y = ny;
    } else if (!buildingAt(city, nx, car.y, 30)) {
      car.x = nx;
      car.speed *= Math.pow(0.7, dt);
    } else if (!buildingAt(city, car.x, ny, 30)) {
      car.y = ny;
      car.speed *= Math.pow(0.7, dt);
    } else {
      if (Math.abs(car.speed) > 200) {
        car.health -= 4;
        events |= EVENT_HIT;
      }
      car.speed *= -0.25;
    }
    const clamped = clampToWorld(car.x, car.y, 40);
    car.x = clamped.x;
    car.y = clamped.y;
    // Running over pedestrians.
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.abs(car.speed) > 60 && dist2(car.x, car.y, ped.x, ped.y) < 42 * 42) {
        ped.state = 'down';
        ped.down = 999;
        state.stats.pedsDown += 1;
        events |= EVENT_HIT;
        if (nearestCopDistance(ped.x, ped.y) < PEDS.witnessRadius) {
          events = crime(WANTED.hitPed, events);
        }
      }
    }
    // Bumping other cars: they are shoved away from the player's car.
    for (const other of state.cars) {
      if (other === car || other.health <= 0) continue;
      if (dist2(car.x, car.y, other.x, other.y) < 52 * 52) {
        const push = angleTo(car.x, car.y, other.x, other.y);
        other.x += Math.cos(push) * 26 * dt * 10;
        other.y += Math.sin(push) * 26 * dt * 10;
        if (Math.abs(car.speed) > 200) {
          other.health -= 6;
          car.health -= 4;
          events |= EVENT_HIT;
        }
        car.speed *= 0.92;
      }
    }
    if (car.health <= 0) {
      // The car is a wreck: the player is thrown out on foot.
      exitCar();
      events |= EVENT_HIT;
    }
    p.x = car.x;
    p.y = car.y;
    p.speed = car.speed;
    void forward;
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.health <= 0) continue;
      // Follow the road: at an intersection, sometimes turn.
      const onIntersection = isRoad(car.x, car.y) && Math.abs(((car.x % CITY.block) + CITY.block) % CITY.block) < 40
        && Math.abs(((car.y % CITY.block) + CITY.block) % CITY.block) < 40;
      if (onIntersection && car.turnAt <= 0 && random() < TRAFFIC.turnChance * dt * 8) {
        const turn = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        car.targetAngle = car.angle + turn;
        car.turnAt = 1.2;
      }
      if (car.turnAt > 0) car.turnAt -= dt;
      const diff = angleDiff(car.targetAngle, car.angle);
      car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      // Slow down for the car ahead.
      let ahead = Infinity;
      for (const other of state.cars) {
        if (other === car || other.health <= 0) continue;
        const d = Math.sqrt(dist2(car.x, car.y, other.x, other.y));
        if (d < 110) {
          const a = angleDiff(angleTo(car.x, car.y, other.x, other.y), car.angle);
          if (Math.abs(a) < 0.5 && d < ahead) ahead = d;
        }
      }
      const want = ahead < 90 ? 0 : TRAFFIC.speed + (car.id % 60);
      car.speed += clamp(want - car.speed, -260 * dt, 160 * dt);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!buildingAt(city, nx, ny, 28)) {
        car.x = nx;
        car.y = ny;
      } else {
        car.angle += Math.PI / 2;
        car.targetAngle = car.angle;
      }
      const clamped = clampToWorld(car.x, car.y, 40);
      car.x = clamped.x;
      car.y = clamped.y;
    }
    // Top the traffic back up when cars are wrecked or stolen.
    let trafficCount = 0;
    for (const car of state.cars) if (car.kind === 'traffic') trafficCount += 1;
    if (trafficCount < TRAFFIC.count) spawnTrafficCar();
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      const px = state.player.x;
      const py = state.player.y;
      const pInCar = state.player.inCar;
      // Flee a speeding car or a gunshot nearby.
      let fleeing = ped.flee > 0;
      if (pInCar && Math.abs(pInCar.speed) > 150 && dist2(ped.x, ped.y, px, py) < 260 * 260) fleeing = true;
      if (fleeing) {
        ped.flee = Math.max(0, ped.flee - dt);
        const away = angleTo(px, py, ped.x, ped.y);
        ped.angle = away;
        ped.x += Math.cos(away) * ped.speed * 1.7 * dt;
        ped.y += Math.sin(away) * ped.speed * 1.7 * dt;
      } else {
        if (ped.wait > 0) {
          ped.wait -= dt;
          continue;
        }
        const d = Math.sqrt(dist2(ped.x, ped.y, ped.tx, ped.ty));
        if (d < 14) {
          const s = pedSpawn(random, px, py);
          ped.tx = s.x;
          ped.ty = s.y;
          ped.wait = random() * 2;
          continue;
        }
        ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      const clamped = clampToWorld(ped.x, ped.y, 10);
      ped.x = clamped.x;
      ped.y = clamped.y;
      const body = { x: ped.x, y: ped.y, radius: 10 };
      if (resolveBuildings(city, body)) {
        ped.x = body.x;
        ped.y = body.y;
        ped.tx = ped.x + (random() - 0.5) * 300;
        ped.ty = ped.y + (random() - 0.5) * 300;
      }
    }
  }

  function spawnPoliceCar() {
    const p = state.player;
    for (let tries = 0; tries < 8; tries += 1) {
      const s = trafficSpawn(random);
      const d = Math.sqrt(dist2(s.x, s.y, p.x, p.y));
      if (d > 420 && d < 900) {
        const car = addCar('police', s.x, s.y, s.angle, '#2b4acb', true);
        car.speed = 200;
        return car;
      }
    }
    return null;
  }

  function stepPolice(dt, events) {
    const p = state.player;
    const want = POLICE.carsForStars[state.wanted] || 0;
    // All clear: the units leave and the foot cops stand down.
    if (state.wanted === 0) {
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        if (state.cars[i].kind === 'police') state.cars.splice(i, 1);
      }
      state.cops.length = 0;
      state.bustProgress = 0;
      return events;
    }
    let have = 0;
    for (const car of state.cars) if (car.kind === 'police') have += 1;
    if (have < want) spawnPoliceCar();
    // Busted: a cop car sits on a slow player, or a foot cop grabs them.
    let touching = false;
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.kind !== 'police' || car.health <= 0) continue;
      const target = p.inCar ? p.inCar : p;
      const d = Math.sqrt(dist2(car.x, car.y, target.x, target.y));
      // A unit that has lost the trail for a while gives up and leaves.
      car.lostTimer = d > POLICE.lostDistance ? (car.lostTimer || 0) + dt : 0;
      if (car.lostTimer > POLICE.lostSeconds) {
        state.cars.splice(i, 1);
        continue;
      }
      const predicted = angleTo(car.x, car.y, p.x + Math.cos(p.angle) * 60, p.y + Math.sin(p.angle) * 60);
      const diff = angleDiff(predicted, car.angle);
      car.angle += clamp(diff, -3.4 * dt, 3.4 * dt);
      car.speed = clamp(car.speed + (POLICE.carSpeed - car.speed) * 0.7 * dt, 0, POLICE.carSpeed);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!buildingAt(city, nx, ny, 28)) {
        car.x = nx;
        car.y = ny;
      } else {
        car.angle += Math.PI / 2;
      }
      const clamped = clampToWorld(car.x, car.y, 40);
      car.x = clamped.x;
      car.y = clamped.y;
      if (d < 64) {
        touching = true;
        if (p.inCar && Math.abs(p.inCar.speed) < 40) state.bustProgress += dt;
        else if (!p.inCar) state.bustProgress += dt;
        // A ram damages the player's car and slows it.
        if (p.inCar && Math.abs(car.speed) > 200) {
          p.inCar.health -= 0.4 * dt * 10;
          p.inCar.speed *= Math.pow(0.5, dt);
        }
      }
    }
    // Foot cops chase on foot when the player is on foot, and shoot at 2+ stars.
    if (!p.inCar && state.wanted > 0) {
      while (state.cops.length < Math.min(3, state.wanted)) {
        const s = pedSpawn(random, p.x, p.y);
        state.cops.push({ x: s.x, y: s.y, angle: 0, health: 50, shootCooldown: 1 });
      }
    }
    for (const cop of state.cops) {
      if (cop.health <= 0) continue;
      const d = Math.sqrt(dist2(cop.x, cop.y, p.x, p.y));
      cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
      if (d > POLICE.bustRadius) {
        cop.x += Math.cos(cop.angle) * POLICE.footSpeed * dt;
        cop.y += Math.sin(cop.angle) * POLICE.footSpeed * dt;
      } else {
        touching = true;
        state.bustProgress += dt;
      }
      if (state.wanted >= POLICE.shootAboveStars && d < 380 && d > 60) {
        cop.shootCooldown -= dt;
        if (cop.shootCooldown <= 0) {
          cop.shootCooldown = POLICE.shotCooldown;
          p.health -= POLICE.shotDamage;
          p.hurtTimer = 2;
          state.tracers.push({ x1: cop.x, y1: cop.y, x2: p.x, y2: p.y, ttl: 0.12 });
          events |= EVENT_HIT;
          if (p.health <= 0) {
            p.health = 0;
            events |= EVENT_WASTED;
          }
        }
      }
      const clamped = clampToWorld(cop.x, cop.y, 10);
      cop.x = clamped.x;
      cop.y = clamped.y;
    }
    if (!touching) state.bustProgress = Math.max(0, state.bustProgress - dt * 2);
    if (state.bustProgress > 2.5) {
      events |= EVENT_BUSTED;
    }
    return events;
  }

  function punch(events) {
    const p = state.player;
    if (p.punchCooldown > 0 || p.inCar) return events;
    p.punchCooldown = PLAYER.punchCooldown;
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    // The nearest person in front of the player, in punching range.
    let best = null;
    let bestD = PLAYER.punchRange * PLAYER.punchRange;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      const d = dist2(p.x, p.y, ped.x, ped.y);
      if (d < bestD) {
        const dot = ((ped.x - p.x) * fx + (ped.y - p.y) * fy) / Math.sqrt(d || 1);
        if (dot > 0.2) {
          bestD = d;
          best = { kind: 'ped', who: ped };
        }
      }
    }
    for (const cop of state.cops) {
      if (cop.health <= 0) continue;
      const d = dist2(p.x, p.y, cop.x, cop.y);
      if (d < bestD) {
        const dot = ((cop.x - p.x) * fx + (cop.y - p.y) * fy) / Math.sqrt(d || 1);
        if (dot > 0.2) {
          bestD = d;
          best = { kind: 'cop', who: cop };
        }
      }
    }
    if (!best) return events;
    if (best.kind === 'ped') {
      best.who.state = 'down';
      best.who.down = 999;
      state.stats.pedsDown += 1;
      if (nearestCopDistance(p.x, p.y) < PEDS.witnessRadius) events = crime(WANTED.hitPed, events);
    } else {
      best.who.health -= PLAYER.punchDamage;
      if (best.who.health <= 0) {
        events = crime(WANTED.killCop, events);
      } else {
        events = crime(1, events);
      }
    }
    return events;
  }

  function shoot(events) {
    const p = state.player;
    if (p.fireCooldown > 0 || p.ammo <= 0) return events;
    p.fireCooldown = PISTOL.fireCooldown;
    p.ammo -= 1;
    p.aimAngle = p.aimAngle;
    state.stats.shotsFired += 1;
    const dx = Math.cos(p.aimAngle);
    const dy = Math.sin(p.aimAngle);
    let bestT = PISTOL.range;
    let best = null;
    function consider(x, y, radius, target) {
      const rx = x - p.x;
      const ry = y - p.y;
      const t = rx * dx + ry * dy;
      if (t < 0 || t > bestT) return;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < radius) {
        bestT = t;
        best = target;
      }
    }
    for (const ped of state.peds) {
      if (ped.state !== 'down') consider(ped.x, ped.y, 24, { kind: 'ped', who: ped });
    }
    for (const cop of state.cops) {
      if (cop.health > 0) consider(cop.x, cop.y, 24, { kind: 'cop', who: cop });
    }
    for (const car of state.cars) {
      if (car.health > 0) consider(car.x, car.y, 42, { kind: 'car', who: car });
    }
    const ex = p.x + dx * bestT;
    const ey = p.y + dy * bestT;
    state.tracers.push({ x1: p.x, y1: p.y, x2: ex, y2: ey, ttl: 0.09 });
    events |= EVENT_SHOT;
    if (!best) {
      // A shot in the street is heard: one star.
      events = crime(WANTED.shoot, events);
      return events;
    }
    if (best.kind === 'ped') {
      best.who.state = 'down';
      best.who.down = 999;
      state.stats.pedsDown += 1;
      events = crime(WANTED.shoot, events);
    } else if (best.kind === 'cop') {
      best.who.health -= PISTOL.damage;
      if (best.who.health <= 0) events = crime(WANTED.killCop, events);
      else events = crime(WANTED.shoot, events);
    } else {
      best.who.health -= PISTOL.damage;
      if (best.who.health <= 0) {
        best.who.health = 0;
        best.who.speed = 0;
      }
      events = crime(WANTED.shoot, events);
    }
    return events;
  }

  function missionStepText() {
    const step = currentStep();
    if (!step) return '';
    if (step.kind === 'collect') {
      const left = state.crates.filter((c) => !c.taken).length;
      return `Collect the crates (${left} left)`;
    }
    return step.text;
  }

  function checkMission(dt, events) {
    const m = currentMission();
    if (!m) return events;
    const step = currentStep();
    if (!step) return events;
    const p = state.player;
    if (m.timer) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        state.missionFailed = true;
        return events | EVENT_FAILED;
      }
    }
    let done = false;
    if (step.kind === 'enterCar') {
      done = !!p.inCar;
    } else if (step.kind === 'reach') {
      const at = placeFor(step.at);
      const inCar = m.id === 'cab' ? !!p.inCar : true;
      if (inCar && dist2(p.x, p.y, at.x, at.y) < step.radius * step.radius) {
        if (m.id === 'cab' && state.missionStep === 0) {
          state.passenger = { x: at.x, y: at.y, boarded: true };
        }
        done = true;
      }
    } else if (step.kind === 'wanted') {
      done = state.wanted >= step.stars;
    } else if (step.kind === 'loseWanted') {
      done = state.wanted === 0;
    } else if (step.kind === 'collect') {
      for (const crate of state.crates) {
        if (!crate.taken && dist2(p.x, p.y, crate.x, crate.y) < 46 * 46) {
          crate.taken = true;
          events |= EVENT_MONEY;
        }
      }
      done = state.crates.every((c) => c.taken);
    } else if (step.kind === 'hold') {
      const at = placeFor(step.at);
      if (dist2(p.x, p.y, at.x, at.y) < step.radius * step.radius) {
        state.missionHold += dt;
        if (state.missionHold >= step.seconds) {
          // The alarm trips: three stars for the getaway.
          state.wanted = Math.max(state.wanted, 3);
          state.heatTimer = 0;
          done = true;
        }
      }
    }
    if (!done) return events;
    state.missionStep += 1;
    state.missionHold = 0;
    events |= EVENT_MISSION;
    if (state.missionStep >= m.steps.length) {
      state.money += m.payout;
      state.stats.earned += m.payout;
      state.stats.missionsDone += 1;
      events |= EVENT_MISSION_DONE | EVENT_MONEY;
      if (state.missionIndex >= MISSIONS.length - 1) {
        state.storyDone = true;
        state.missionIndex = MISSIONS.length;
      } else {
        startMission(state.missionIndex + 1);
      }
    }
    return events;
  }

  function checkSideJob(dt, events) {
    if (!state.storyDone) return events;
    const p = state.player;
    if (!state.sideJob) {
      state.sideJobTimer -= dt;
      if (state.sideJobTimer <= 0) {
        const a = nearestRoadPoint(p.x + (random() - 0.5) * 1200, p.y + (random() - 0.5) * 1200, random);
        const b = nearestRoadPoint(p.x + (random() - 0.5) * 1600, p.y + (random() - 0.5) * 1600, random);
        state.sideJob = {
          kind: 'fare',
          pickup: a,
          drop: b,
          phase: 'pickup',
          payout: 60 + Math.floor(random() * 7) * 10,
        };
      }
      return events;
    }
    const job = state.sideJob;
    const target = job.phase === 'pickup' ? job.pickup : job.drop;
    const radius = job.phase === 'pickup' ? 70 : 90;
    if (p.inCar && dist2(p.x, p.y, target.x, target.y) < radius * radius) {
      if (job.phase === 'pickup') {
        job.phase = 'drop';
        events |= EVENT_MISSION;
      } else {
        state.money += job.payout;
        state.stats.earned += job.payout;
        state.sideJob = null;
        state.sideJobTimer = 10;
        events |= EVENT_MONEY;
      }
    }
    return events;
  }

  function checkShops(dt, events) {
    const p = state.player;
    state.shopCooldown = Math.max(0, (state.shopCooldown || 0) - dt);
    // Spray Shop: drive in with a wanted level and $150, and the heat is gone.
    // The respray also repairs the car to full, so it is the place to go
    // after a hard chase.
    const spray = PLACES.sprayShop;
    if (p.inCar && state.wanted > 0 && state.money >= 150
      && dist2(p.x, p.y, spray.x, spray.y) < 90 * 90) {
      state.money -= 150;
      state.wanted = 0;
      state.heatTimer = 0;
      state.bustProgress = 0;
      p.inCar.health = CAR.health;
      for (const car of state.cars) if (car.kind === 'police') car.health = 0;
      state.cops.length = 0;
      events |= EVENT_MONEY | EVENT_WANTED_DOWN;
    }
    // Ironworks Guns: walk in for 30 rounds at $50.
    const gun = PLACES.gunShop;
    if (!p.inCar && state.money >= PISTOL.ammoPrice && p.ammo < 90 && state.shopCooldown <= 0
      && dist2(p.x, p.y, gun.x, gun.y) < 70 * 70) {
      state.money -= PISTOL.ammoPrice;
      p.ammo += PISTOL.ammoPack;
      state.shopCooldown = 3;
      events |= EVENT_MONEY;
    }
    return events;
  }

  function applyBusted() {
    const fine = Math.max(WANTED.minFine, Math.floor(state.money * WANTED.fineShare));
    state.money -= fine;
    state.wanted = 0;
    state.heatTimer = 0;
    state.bustProgress = 0;
    state.cops.length = 0;
    for (const car of state.cars) if (car.kind === 'police') car.health = 0;
    const p = state.player;
    if (p.inCar) {
      p.inCar.kind = 'parked';
      p.inCar.speed = 0;
      p.inCar = null;
    }
    p.x = PLACES.policeHQ.x;
    p.y = PLACES.policeHQ.y;
    p.health = PLAYER.health;
    p.speed = 0;
    return fine;
  }

  function applyWasted() {
    const fine = Math.max(WANTED.minFine, Math.floor(state.money * WANTED.fineShare));
    state.money -= fine;
    state.wanted = 0;
    state.heatTimer = 0;
    state.bustProgress = 0;
    state.cops.length = 0;
    for (const car of state.cars) if (car.kind === 'police') car.health = 0;
    const p = state.player;
    if (p.inCar) {
      p.inCar.kind = 'parked';
      p.inCar.speed = 0;
      p.inCar = null;
    }
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y;
    p.health = PLAYER.health;
    p.speed = 0;
    return fine;
  }

  function serialize() {
    const p = state.player;
    return JSON.stringify({
      money: state.money,
      missionIndex: state.missionIndex,
      missionStep: state.missionStep,
      storyDone: state.storyDone,
      x: Math.round(p.x),
      y: Math.round(p.y),
      health: Math.round(p.health),
      ammo: p.ammo,
      dayTime: state.dayTime,
      stats: state.stats,
    });
  }

  function loadSave(data) {
    reset();
    state.money = data.money ?? 60;
    state.storyDone = !!data.storyDone;
    state.stats = { ...state.stats, ...(data.stats || {}) };
    state.dayTime = data.dayTime ?? 60;
    const p = state.player;
    p.x = data.x ?? 150;
    p.y = data.y ?? 150;
    p.health = data.health ?? PLAYER.health;
    p.ammo = data.ammo ?? PISTOL.startAmmo;
    if (state.storyDone) {
      state.missionIndex = MISSIONS.length;
    } else {
      startMission(Math.min(data.missionIndex ?? 0, MISSIONS.length - 1));
      state.missionStep = data.missionStep ?? 0;
    }
  }

  /**
   * One fixed step. `input` carries the held movement/driving keys, the
   * one-shot action flags, the mouse state and the aim angle in world space.
   * Returns the EVENT_* flags for what happened this step.
   */
  function step(dt, input, events) {
    state.elapsed += dt;
    state.dayTime = (state.dayTime + dt) % DAY_LENGTH;
    const p = state.player;
    p.aimAngle = input.aimAngle ?? p.aimAngle;
    if (input.actions & 4) { // ACTION_ENTER
      if (p.inCar) exitCar();
      else events = enterCar(events);
    }
    if (input.actions & 8) { // ACTION_PUNCH
      events = punch(events);
    }
    if (input.mouseDown) {
      events = shoot(events);
    }
    if (p.inCar) events = stepPlayerDriving(dt, input.drive, events);
    else events = stepPlayerOnFoot(dt, input.move, events);
    stepTraffic(dt);
    stepPeds(dt);
    events = stepPolice(dt, events);
    // Wanted decay: quiet for a while and out of sight, one star fades.
    state.heatTimer += dt;
    if (state.wanted > 0 && state.heatTimer > POLICE.decaySeconds && nearestCopDistance(p.x, p.y) > 500) {
      state.wanted -= 1;
      state.heatTimer = 0;
      events |= EVENT_WANTED_DOWN;
    }
    events = checkMission(dt, events);
    events = checkSideJob(dt, events);
    events = checkShops(dt, events);
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      state.tracers[i].ttl -= dt;
      if (state.tracers[i].ttl <= 0) state.tracers.splice(i, 1);
    }
    // Dead cops and wrecked police cars are cleared once the heat is off.
    if (state.wanted === 0) {
      for (let i = state.cops.length - 1; i >= 0; i -= 1) {
        if (state.cops[i].health <= 0) state.cops.splice(i, 1);
      }
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        if (state.cars[i].kind === 'police' && state.cars[i].health <= 0) state.cars.splice(i, 1);
      }
    }
    return events;
  }

  reset();

  return {
    state,
    reset,
    step,
    currentMission,
    currentStep,
    missionStepText,
    placeFor,
    startMission,
    applyBusted,
    applyWasted,
    serialize,
    loadSave,
  };
}
