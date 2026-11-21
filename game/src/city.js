// The city of Neon Bay: a seeded grid of roads and blocks, built once from the
// seed and never changed during play. Buildings, parks, parking lots and the
// named shops are placed inside the blocks; the world asks this module where
// the roads are, whether a point is inside a building, and where the named
// places sit. Nothing here touches the canvas or the browser.
import { CITY, PALETTE, PLACES, WORLD } from './config.js';

const { block, road, margin, beachY } = CITY;
const HALF_ROAD = road / 2;

/** Is (x, y) on a road (including the intersections)? */
export function isRoad(x, y) {
  if (x < 0 || y < 0 || x >= WORLD.size || y >= WORLD.size) return false;
  const rx = ((x % block) + block) % block;
  const ry = ((y % block) + block) % block;
  return rx < HALF_ROAD || rx > block - HALF_ROAD || ry < HALF_ROAD || ry > block - HALF_ROAD;
}

/** The centre of the road running through (x, y) on the given axis. */
export function roadCentre(value) {
  return Math.round(value / block) * block;
}

/** Snap a point to the nearest road centre on both axes. */
export function snapToRoad(x, y) {
  return { x: roadCentre(x), y: roadCentre(y) };
}

/** A point on the road nearest to (x, y): used to drop cars and peds onto streets. */
export function nearestRoadPoint(x, y, random) {
  const cx = roadCentre(x);
  const cy = roadCentre(y);
  // Pick the closer of the vertical road through cx and the horizontal through cy.
  if (Math.abs(x - cx) < Math.abs(y - cy)) return { x: cx, y: y + (random() - 0.5) * 40 };
  return { x: x + (random() - 0.5) * 40, y: cy };
}

function blockIndex(value) {
  return Math.floor(value / block);
}

/**
 * Build the city from the seed. Returns the buildings (rects with a colour
 * and a roof colour), the parks, the parking lots and the shop markers.
 * Named places from PLACES keep their blocks clear of buildings.
 */
export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const lots = [];
  const reserved = new Set();
  for (const place of Object.values(PLACES)) {
    reserved.add(`${blockIndex(place.x)},${blockIndex(place.y)}`);
  }
  // The spawn corner and the safehouse block stay open too.
  reserved.add('0,0');
  const blocksPerSide = Math.floor(WORLD.size / block);
  for (let bx = 0; bx < blocksPerSide; bx += 1) {
    for (let by = 0; by < blocksPerSide; by += 1) {
      const key = `${bx},${by}`;
      if (reserved.has(key)) continue;
      const x0 = bx * block + HALF_ROAD + margin;
      const y0 = by * block + HALF_ROAD + margin;
      const w = block - road - margin * 2;
      const h = block - road - margin * 2;
      if (y0 > beachY) continue; // the beach strip has no buildings
      const roll = random();
      if (roll < 0.16) {
        parks.push({ x: x0, y: y0, width: w, height: h });
        continue;
      }
      if (roll < 0.26) {
        lots.push({ x: x0, y: y0, width: w, height: h });
        continue;
      }
      // One or two buildings per block, with a gap between them.
      const two = random() < 0.45;
      const colour = PALETTE.building[Math.floor(random() * PALETTE.building.length)];
      const roof = PALETTE.buildingRoof[Math.floor(random() * PALETTE.buildingRoof.length)];
      const height = 14 + Math.floor(random() * 46); // storeys, for the skyline
      if (two) {
        const split = w * (0.4 + random() * 0.2);
        buildings.push({ x: x0, y: y0, width: split, height: h, colour, roof, storeys: height });
        buildings.push({ x: x0 + split + 12, y: y0, width: w - split - 12, height: h, colour, roof, storeys: Math.max(8, height - 8) });
      } else {
        buildings.push({ x: x0, y: y0, width: w, height: h, colour, roof, storeys: height });
      }
    }
  }
  return { buildings, parks, lots };
}

/** The building (if any) whose rect contains the circle at (x, y) with radius r. */
export function buildingAt(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.width && y + r > b.y && y - r < b.y + b.height) return b;
  }
  return null;
}

/** Push a circle out of any building it overlaps; returns true when it moved. */
export function resolveBuildings(city, body) {
  let moved = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.width));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.height));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.radius * body.radius) continue;
    if (d2 === 0) {
      body.y = b.y - body.radius;
      moved = true;
      continue;
    }
    const d = Math.sqrt(d2);
    body.x = cx + (dx / d) * body.radius;
    body.y = cy + (dy / d) * body.radius;
    moved = true;
  }
  return moved;
}

/** Keep a point inside the world, with the sea as a soft southern edge. */
export function clampToWorld(x, y, radius) {
  return {
    x: Math.max(radius, Math.min(WORLD.size - radius, x)),
    y: Math.max(radius, Math.min(WORLD.size - radius, y)),
  };
}

/** A seeded traffic-car spawn: a random road point with a road direction. */
export function trafficSpawn(random) {
  const horizontal = random() < 0.5;
  const line = (1 + Math.floor(random() * 7)) * block;
  const along = 60 + random() * (WORLD.size - 120);
  const angle = horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  return horizontal ? { x: along, y: line, angle } : { x: line, y: along, angle };
}

/** A seeded pedestrian spawn: a sidewalk point near the given centre. */
export function pedSpawn(random, cx, cy) {
  const p = nearestRoadPoint(cx + (random() - 0.5) * 900, cy + (random() - 0.5) * 900, random);
  // Step off the road onto the sidewalk.
  const off = (random() < 0.5 ? -1 : 1) * (HALF_ROAD + 8);
  return { x: p.x + off, y: p.y + off };
}
