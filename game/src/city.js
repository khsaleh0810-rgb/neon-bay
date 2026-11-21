// Solmar Bay: the city itself. A seeded grid town on a bay — roads, blocks full of
// sun-bleached buildings, a sand beach and water along the south edge, and the four
// shops the story needs. Pure data and geometry: no DOM, no canvas, so the headless
// simulation can import it too.

import { Rng } from './rng.js';

export const WORLD_SIZE = 2400;
export const ROAD_WIDTH = 72;
export const ROAD_LINES = [150, 450, 750, 1050, 1350, 1650, 1950, 2250];
export const BEACH_Y = 2140;
export const WATER_Y = 2330;

const PALETTE = [
  '#e8a87c', '#d8b48f', '#c97b5a', '#e5c07b',
  '#7fb3a3', '#d9c9a3', '#b5654d', '#8fae8b',
  '#d98e73', '#cbb27a',
];

export function buildCity(seed) {
  const rng = new Rng(seed);
  const buildings = [];
  const shops = [
    { kind: 'gun', name: "Big Al's Ammo", x: 500, y: 500, w: 120, h: 84 },
    { kind: 'spray', name: 'Lick of Paint', x: 1700, y: 800, w: 130, h: 84 },
    { kind: 'bank', name: 'Solmar First Bank', x: 1100, y: 1100, w: 150, h: 100 },
    { kind: 'police', name: 'Solmar PD HQ', x: 800, y: 1700, w: 150, h: 100 },
  ];
  const shopCells = new Set(shops.map((s) => `${Math.round(s.x / 300)},${Math.round(s.y / 300)}`));

  // One or two buildings per block, inset from the roads, never on a shop cell.
  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 6; by++) {
      const x0 = ROAD_LINES[bx] + ROAD_WIDTH / 2 + 14;
      const y0 = ROAD_LINES[by] + ROAD_WIDTH / 2 + 14;
      const cellW = 300 - ROAD_WIDTH - 28;
      const cellH = 300 - ROAD_WIDTH - 28;
      if (shopCells.has(`${bx},${by}`)) continue;
      if (rng.chance(0.12)) continue; // an empty lot, sometimes a little park
      const count = rng.chance(0.45) ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const w = rng.range(70, count === 1 ? cellW : cellW / 2 - 8);
        const h = rng.range(60, cellH);
        const x = x0 + (count === 1 ? (cellW - w) / 2 : k * (cellW / 2 + 4));
        const y = y0 + (cellH - h) / 2;
        buildings.push({
          x, y, w, h,
          color: rng.pick(PALETTE),
          height: rng.range(18, 64),
          windows: rng.int(2, 5),
        });
      }
    }
  }

  // Palm-lined pier on the beach, a landmark for the last crate.
  const pier = { x: 1200, y: 2220, w: 60, h: 120 };

  return {
    size: WORLD_SIZE,
    roadLines: ROAD_LINES,
    roadWidth: ROAD_WIDTH,
    beachY: BEACH_Y,
    waterY: WATER_Y,
    buildings,
    shops,
    pier,
    spawn: { x: 1050, y: 1260, angle: -Math.PI / 2 },
    station: { x: 800, y: 1700 },
  };
}

export function isRoad(city, x, y) {
  const half = city.roadWidth / 2;
  for (const lx of city.roadLines) {
    if (Math.abs(x - lx) <= half) return true;
  }
  for (const ly of city.roadLines) {
    if (ly > 2100) continue;
    if (Math.abs(y - ly) <= half) return true;
  }
  return false;
}

function circleHitsRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

// True when a circle of radius r at (x, y) overlaps a building, a shop,
// the water, or the edge of the world.
export function collides(city, x, y, r) {
  if (x < r || y < r || x > city.size - r || y > city.size - r) return true;
  if (y + r > city.waterY) return true;
  for (const b of city.buildings) {
    if (circleHitsRect(x, y, r, b)) return true;
  }
  for (const s of city.shops) {
    if (circleHitsRect(x, y, r, s)) return true;
  }
  return false;
}

// Move with axis-separated sliding: try x, then y, so a car slides along a wall
// instead of sticking to it. Returns the new position and what it hit.
export function moveWithCollision(city, x, y, dx, dy, r) {
  let hitX = false;
  let hitY = false;
  const nx = x + dx;
  if (!collides(city, nx, y, r)) {
    x = nx;
  } else {
    hitX = true;
  }
  const ny = y + dy;
  if (!collides(city, x, ny, r)) {
    y = ny;
  } else {
    hitY = true;
  }
  return { x, y, hitX, hitY };
}

export function nearestShop(city, kind, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const s of city.shops) {
    if (s.kind !== kind) continue;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// A random point on a road, for spawning traffic and pedestrians.
export function randomRoadPoint(city, rng) {
  const vertical = rng.chance(0.5);
  const line = rng.pick(city.roadLines);
  if (vertical) {
    return { x: line + rng.range(-20, 20), y: rng.range(120, 2050) };
  }
  const hLines = city.roadLines.filter((v) => v < 2100);
  return { x: rng.range(120, 2280), y: rng.pick(hLines) + rng.range(-20, 20) };
}

// A parked car sits half on the road's edge, nose along the road.
export function randomParkSpot(city, rng) {
  const vertical = rng.chance(0.5);
  const line = rng.pick(city.roadLines);
  const along = rng.range(200, 2000);
  if (vertical) {
    return { x: line + rng.sign() * (city.roadWidth / 2 - 8), y: along, angle: rng.chance(0.5) ? 0 : Math.PI };
  }
  const hLines = city.roadLines.filter((v) => v < 2100);
  const ly = rng.pick(hLines);
  return { x: along, y: ly + rng.sign() * (city.roadWidth / 2 - 8), angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
}

export function shopCenter(shop) {
  return { x: shop.x + shop.w / 2, y: shop.y + shop.h / 2 };
}

