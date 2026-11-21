// The story of Solmar Bay: six jobs from Carmen, the fixer who runs the town from
// a booth at the marina cafe, plus repeatable cab fares once the story is done.
// Each mission is a small state machine over the world; missions never import the
// world module, they only read and write the world object handed to them.

import { shopCenter, nearestShop, randomRoadPoint } from './city.js';

function marker(x, y, label, color = '#ffd23f') {
  return { x, y, label, color };
}

function completeMission(w) {
  const m = MISSIONS[w.missionIndex];
  w.player.money += m.reward;
  w.totalEarned += m.reward;
  w.events.push({ type: 'mission-ok', name: m.name, reward: m.reward });
  w.missionIndex++;
  if (w.missionIndex >= MISSIONS.length) {
    w.storyDone = true;
    w.mission = null;
    w.events.push({ type: 'story-complete' });
  } else {
    startMission(w, w.missionIndex);
  }
}

function failMission(w, reason) {
  w.events.push({ type: 'mission-failed', reason });
  startMission(w, w.missionIndex);
}

export function startMission(w, index) {
  const m = MISSIONS[index];
  w.mission = { index, stage: 0, data: {}, timer: 0, failed: false, failReason: '' };
  if (m.start) m.start(w);
}

export function updateMission(w, dt) {
  const m = w.mission;
  if (!m) return;
  if (m.failed) {
    failMission(w, m.failReason || 'Job blown');
    return;
  }
  m.timer += dt;
  MISSIONS[m.index].update(w, dt);
}

export function missionObjective(w) {
  if (!w.mission) return '';
  return MISSIONS[w.mission.index].objective(w);
}

export function missionMarkers(w) {
  if (!w.mission) return [];
  return MISSIONS[w.mission.index].marker(w);
}

const GARAGE = { x: 1980, y: 420 };

export const MISSIONS = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    giver: 'Carmen',
    brief: 'A customer wants a ride with no questions. Grab any car and bring it to the garage on the east side.',
    reward: 150,
    start(w) {
      w.mission.data = {};
    },
    update(w) {
      const m = w.mission;
      if (m.stage === 0) {
        if (!w.player.onFoot) m.stage = 1;
      } else if (distTo(w, GARAGE.x, GARAGE.y) < 60) {
        completeMission(w);
      }
    },
    objective(w) {
      return w.mission.stage === 0
        ? 'Get in a car — any car. (E near a car to take it)'
        : 'Deliver the car to the garage — follow the gold marker.';
    },
    marker(w) {
      return w.mission.stage === 0 ? [] : [marker(GARAGE.x, GARAGE.y, 'Garage')];
    },
  },
  {
    id: 'cab-fare',
    name: 'Cab Fare',
    giver: 'Carmen',
    brief: 'A regular needs a lift across town. Pick them up, then drop them where they point.',
    reward: 250,
    start(w) {
      const a = { x: 450, y: 1350 };
      const b = { x: 1950, y: 1650 };
      w.mission.data = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
    },
    update(w) {
      const m = w.mission;
      const d = m.data;
      if (m.stage === 0) {
        if (!w.player.onFoot && distTo(w, d.ax, d.ay) < 55) {
          m.stage = 1;
          w.events.push({ type: 'pickup', text: 'Fare aboard — get them across town.' });
        }
      } else if (distTo(w, d.bx, d.by) < 55) {
        completeMission(w);
      }
    },
    objective(w) {
      return w.mission.stage === 0
        ? 'Pick up the fare at the marker — you need a car.'
        : 'Drop the fare at the marker on the far side of town.';
    },
    marker(w) {
      const d = w.mission.data;
      return w.mission.stage === 0
        ? [marker(d.ax, d.ay, 'Pickup')]
        : [marker(d.bx, d.by, 'Dropoff')];
    },
  },
  {
    id: 'ninety-seconds',
    name: 'Ninety Seconds',
    giver: 'Carmen',
    brief: 'A package, a clock, and no excuses. Ninety seconds to the north pier — drive like it matters.',
    reward: 400,
    start(w) {
      w.mission.data = { timeLeft: 90, x: 2250, y: 150 };
    },
    update(w, dt) {
      const m = w.mission;
      const d = m.data;
      d.timeLeft -= dt;
      if (d.timeLeft <= 0) {
        failMission(w, 'Out of time — the package went cold.');
        return;
      }
      if (distTo(w, d.x, d.y) < 60) completeMission(w);
    },
    objective(w) {
      const left = Math.max(0, Math.ceil(w.mission.data.timeLeft));
      return `Deliver the package to the north pier — ${left}s left.`;
    },
    marker(w) {
      const d = w.mission.data;
      return [marker(d.x, d.y, 'Pier', '#ff5d5d')];
    },
  },
  {
    id: 'cool-down',
    name: 'Cool Down',
    giver: 'Carmen',
    brief: 'The PD is sniffing around. Get yourself a star of heat, then get the car repainted and vanish.',
    reward: 350,
    start(w) {
      w.mission.data = { stage1At: 0 };
    },
    update(w) {
      const m = w.mission;
      const d = m.data;
      if (m.stage === 0) {
        if (w.wanted >= 1) {
          m.stage = 1;
          d.stage1At = w.time;
          w.events.push({ type: 'pickup', text: 'One star. Now get to Lick of Paint.' });
        }
      } else if (w.wanted === 0) {
        // The heat is gone — by a respray, or by lying low until the PD lost
        // the trail. Either way, Carmen's happy.
        completeMission(w);
      }
    },
    objective(w) {
      return w.mission.stage === 0
        ? 'Raise your wanted level to 1 star — jack a car.'
        : 'Get the car repainted at Lick of Paint (Q at the shop, $150) — or lie low until the heat fades.';
    },
    marker(w) {
      if (w.mission.stage === 0) return [];
      const shop = nearestShop(w.city, 'spray', w.player.x, w.player.y);
      const c = shopCenter(shop);
      return [marker(c.x, c.y, 'Lick of Paint', '#7fd4ff')];
    },
  },
  {
    id: 'three-crates',
    name: 'Three Crates',
    giver: 'Carmen',
    brief: 'Three crates, three corners of Solmar. One at the old garage, one by the south road, one out on the pier. Bring them all back.',
    reward: 600,
    start(w) {
      w.crates = [
        { x: 1980, y: 420, taken: false },
        { x: 450, y: 1950, taken: false },
        { x: 1200, y: 2260, taken: false },
      ];
    },
    update(w) {
      let got = 0;
      for (const c of w.crates) {
        if (!c.taken && distTo(w, c.x, c.y) < 34) {
          c.taken = true;
          w.events.push({ type: 'pickup', text: 'Crate secured.' });
        }
        if (c.taken) got++;
      }
      if (got >= 3) completeMission(w);
    },
    objective(w) {
      const got = w.crates.filter((c) => c.taken).length;
      return `Collect the crates — ${got}/3. The pier one means a walk on the sand.`;
    },
    marker(w) {
      return w.crates.filter((c) => !c.taken).map((c) => marker(c.x, c.y, 'Crate', '#ffd23f'));
    },
  },
  {
    id: 'the-big-score',
    name: 'The Big Score',
    giver: 'Carmen',
    brief: 'Solmar First Bank, noon, no masks. Hold the vault for five seconds, then lose a three-star tail. This is the one we retire on.',
    reward: 1500,
    start(w) {
      w.mission.data = { hold: 0, escape: 0 };
    },
    update(w, dt) {
      const m = w.mission;
      const d = m.data;
      const bank = nearestShop(w.city, 'bank', w.player.x, w.player.y);
      const c = shopCenter(bank);
      if (m.stage === 0) {
        if (distTo(w, c.x, c.y) < 90) m.stage = 1;
      } else if (m.stage === 1) {
        if (distTo(w, c.x, c.y) < 95) {
          d.hold += dt;
          if (d.hold >= 5) {
            m.stage = 2;
            w.heat = 65;
            w.lastCrimeAt = w.time;
            w.events.push({ type: 'wanted-up', stars: 3 });
          }
        }
      } else {
        d.escape += dt;
        if (d.escape >= 20) completeMission(w);
      }
    },
    objective(w) {
      const m = w.mission;
      const d = m.data;
      if (m.stage === 0) return 'Get to Solmar First Bank — the vault job is on.';
      if (m.stage === 1) return `Hold the vault — ${Math.max(0, (5 - d.hold)).toFixed(1)}s. Don't leave the doors.`;
      return `Lose the tail — survive ${Math.max(0, Math.ceil(20 - d.escape))}s with three stars on you.`;
    },
    marker(w) {
      const m = w.mission;
      if (m.stage === 2) return [];
      const bank = nearestShop(w.city, 'bank', w.player.x, w.player.y);
      const c = shopCenter(bank);
      return [marker(c.x, c.y, 'Solmar First Bank', '#ff5d5d')];
    },
  },
];

export function fareActive(w) {
  return !!w.fare;
}

export function startFare(w) {
  const a = randomRoadPoint(w.city, w.rng);
  let b = randomRoadPoint(w.city, w.rng);
  let tries = 0;
  while (Math.hypot(b.x - a.x, b.y - a.y) < 650 && tries++ < 8) {
    b = randomRoadPoint(w.city, w.rng);
  }
  w.fare = {
    stage: 'pickup',
    ax: a.x, ay: a.y, bx: b.x, by: b.y,
    amount: 60 + w.rng.int(0, 6) * 10,
    timer: 0,
  };
}

export function updateFare(w, dt) {
  const f = w.fare;
  if (!f) return;
  f.timer += dt;
  if (f.stage === 'pickup') {
    if (!w.player.onFoot && distTo(w, f.ax, f.ay) < 55) {
      f.stage = 'dropoff';
      w.events.push({ type: 'pickup', text: 'Fare aboard.' });
    }
  } else if (distTo(w, f.bx, f.by) < 55) {
    const tip = f.timer < 75 ? 25 : 0;
    const total = f.amount + tip;
    w.player.money += total;
    w.totalEarned += total;
    w.faresDone++;
    w.fare = null;
    w.events.push({ type: 'cash', text: `Fare paid: $${total}${tip ? ' (fast, +$25 tip)' : ''}` });
  }
}


function distTo(w, x, y) {
  const dx = w.player.x - x;
  const dy = w.player.y - y;
  return Math.hypot(dx, dy);
}

