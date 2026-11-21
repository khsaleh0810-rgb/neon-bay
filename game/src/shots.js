// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world, so the frame is what the game really
// looks like and the same seed always gives the same frame. The start scene
// lets the city run on its own behind the title; the play scene drives a
// car through town with a two-star tail; the end scene is the story-complete
// screen after the Big Score, staged through the world's own state.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 16;

function neutralInput() {
  return {
    move: { x: 0, y: 0, run: false },
    drive: { throttle: 0, steer: 0, brake: false, handbrake: false },
    actions: 0,
    mouseDown: false,
    aimAngle: 0,
  };
}

/** Steer a car toward a waypoint: returns { throttle, steer }. */
function driveToward(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const throttle = Math.abs(diff) > 1.1 ? 0 : 0.8;
  return { throttle, steer, brake: false, handbrake: false };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, neutralInput(), 0);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'end') {
    // The morning after the Big Score: six jobs done, the city free-roamed.
    state.money = 3100;
    state.stats.earned = 2950;
    state.stats.missionsDone = 6;
    state.stats.carsStolen = 4;
    state.storyDone = true;
    state.missionIndex = 6;
    state.player.x = 1230;
    state.player.y = 1010;
    for (let i = 0; i < 2 / STEP; i += 1) world.step(STEP, neutralInput(), 0);
    return { screen: SCREEN_STORY, best: 3100 };
  }
  // Play: jack the nearest parked car, then drive across town with the law
  // already on the tail, so the frame shows the chase, the minimap and the
  // wanted stars all at once.
  const input = neutralInput();
  input.actions = 4; // ACTION_ENTER
  world.step(STEP, input, 0);
  input.actions = 0;
  if (!state.player.inCar) {
    // No car in reach: walk to the NEAREST one first.
    for (let i = 0; i < 8 / STEP && !state.player.inCar; i += 1) {
      let car = null;
      let bestD = Infinity;
      for (const c of state.cars) {
        if (c.health <= 0 || c.kind === 'police') continue;
        const d = (c.x - state.player.x) ** 2 + (c.y - state.player.y) ** 2;
        if (d < bestD) {
          bestD = d;
          car = c;
        }
      }
      if (!car) break;
      const dx = car.x - state.player.x;
      const dy = car.y - state.player.y;
      const len = Math.hypot(dx, dy) || 1;
      input.move = { x: dx / len, y: dy / len, run: true };
      if (len < 60) input.actions = 4;
      else input.actions = 0;
      world.step(STEP, input, 0);
      input.actions = 0;
    }
    input.move = { x: 0, y: 0, run: false };
  }
  state.wanted = 2;
  state.heatTimer = 0;
  const waypoints = [
    { x: 1950, y: 930 },
    { x: 1950, y: 1650 },
    { x: 1230, y: 1650 },
  ];
  let wp = 0;
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    const car = state.player.inCar;
    if (!car) break;
    const target = waypoints[wp];
    if (Math.hypot(target.x - car.x, target.y - car.y) < 90 && wp < waypoints.length - 1) wp += 1;
    input.drive = driveToward(car, waypoints[wp].x, waypoints[wp].y);
    world.step(STEP, input, 0);
  }
  // The drive across town can run over pedestrians and push the heat past
  // the two-star tail this frame is meant to show, so pin it back.
  state.wanted = 2;
  state.heatTimer = 0;
  return { screen: SCREEN_PLAY, best: state.money };
}
