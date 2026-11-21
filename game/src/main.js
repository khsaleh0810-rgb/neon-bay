// Solmar Bay — entry point. Wires the simulation, the renderer, the audio and the
// input together, runs the game loop, and owns the screens (title, pause, busted,
// story complete). The simulation itself lives in src/world.js and never touches
// the DOM, so it can be driven headless from Node too.

import { createWorld, stepWorld, currentObjective, currentMarkers, snapshotForSave, applySave } from './world.js';
import { startMission, startFare } from './missions.js';
import {
  drawWorld, drawHUD, drawTitle, drawPaused, drawBusted, drawComplete,
  spawnParticles, updateParticles,
} from './render.js';
import { audio } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1280;
const H = 720;
canvas.width = W;
canvas.height = H;

let world = createWorld('solmar-bay');
let screen = 'title'; // title | playing | paused | busted | complete
let cam = { x: world.player.x, y: world.player.y };
let toasts = [];
let keys = {};
let edge = { enter: false, punch: false, shoot: false, use: false };
let lastTime = 0;
let autosaveAt = 0;
let fareCooldown = 0;
let bustedInfo = { reason: '', fine: 0 };
let best = loadGame();
let muted = false;

function toast(text, color) {
  toasts.push({ text, color: color || '#fff', until: world.time + 4 });
  if (toasts.length > 4) toasts.shift();
}

function newGame() {
  world = createWorld('solmar-bay');
  cam = { x: world.player.x, y: world.player.y };
  toasts = [];
  autosaveAt = 0;
  fareCooldown = 0;
  screen = 'playing';
  audio.ensure();
  toast('Carmen: first job — get in a car, any car.', '#ffd23f');
}

function continueGame() {
  const save = loadGame();
  if (!save) return newGame();
  world = createWorld('solmar-bay');
  applySave(world, save);
  cam = { x: world.player.x, y: world.player.y };
  toasts = [];
  screen = 'playing';
  audio.ensure();
  toast('Welcome back to Solmar Bay.', '#ffd23f');
}

function handleEvents() {
  for (const ev of world.events) {
    switch (ev.type) {
      case 'shot':
        audio.shot();
        spawnParticles(ev.fromX + Math.cos(world.player.angle) * 24, ev.fromY + Math.sin(world.player.angle) * 24, '#ffd23f', 6, 120);
        break;
      case 'punch':
        audio.punch();
        break;
      case 'crash':
        audio.crash();
        spawnParticles(ev.x, ev.y, '#ff8c42', ev.hard ? 18 : 8, 220);
        break;
      case 'wreck':
        audio.crash();
        spawnParticles(ev.x, ev.y, '#666', 26, 260);
        break;
      case 'carjack':
        audio.engineStart();
        toast('Carjacked! The driver ran for it.', '#ff8c42');
        break;
      case 'enter-car':
        audio.click();
        break;
      case 'exit-car':
        audio.click();
        break;
      case 'mission-ok':
        audio.missionOk();
        toast(`${ev.name} complete — $${ev.reward}`, '#7ee787');
        break;
      case 'mission-failed':
        audio.busted();
        toast(ev.reason, '#ff5d5d');
        break;
      case 'busted':
        audio.busted();
        bustedInfo = { reason: ev.reason, fine: ev.fine };
        screen = 'busted';
        break;
      case 'story-complete':
        audio.missionOk();
        screen = 'complete';
        break;
      case 'cash':
        audio.cash();
        toast(ev.text, '#7ee787');
        break;
      case 'pickup':
        audio.pickup();
        toast(ev.text, '#ffd23f');
        break;
      case 'denied':
        toast(ev.text, '#ff5d5d');
        break;
      case 'wanted-up':
        toast(`Wanted level: ${ev.stars} star${ev.stars === 1 ? '' : 's'}`, '#ff5d5d');
        break;
      case 'siren-on':
        audio.sirenStart();
        break;
      case 'siren-off':
        audio.sirenStop();
        break;
      case 'knockdown':
        spawnParticles(ev.x, ev.y, '#fff', 8, 140);
        break;
      case 'hit-car':
        spawnParticles(ev.x, ev.y, '#ffd23f', 6, 160);
        break;
      default:
        break;
    }
  }
  world.events.length = 0;
}

function readInput() {
  return {
    up: !!(keys.KeyW || keys.ArrowUp),
    down: !!(keys.KeyS || keys.ArrowDown),
    left: !!(keys.KeyA || keys.ArrowLeft),
    right: !!(keys.KeyD || keys.ArrowRight),
    handbrake: !!keys.Space,
    enter: edge.enter,
    punch: edge.punch,
    shoot: edge.shoot,
    use: edge.use,
  };
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyE') edge.enter = true;
  if (e.code === 'KeyQ') edge.use = true;
  if (e.code === 'KeyF') edge.punch = true;
  if (e.code === 'KeyG') edge.shoot = true;
  if (e.code === 'KeyM') {
    muted = audio.toggleMute();
    toast(muted ? 'Sound off' : 'Sound on');
  }
  if (e.code === 'KeyP' && screen === 'playing') {
    screen = 'paused';
    audio.sirenStop();
  } else if (e.code === 'KeyP' && screen === 'paused') {
    screen = 'playing';
    audio.ensure();
  }
  if (e.code === 'KeyR' && screen === 'paused') {
    clearSave();
    newGame();
  }
  if (e.code === 'Enter') {
    if (screen === 'title') newGame();
    else if (screen === 'busted') {
      if (world.mission && world.mission.failed) startMission(world, world.missionIndex);
      screen = 'playing';
      audio.ensure();
    } else if (screen === 'complete') {
      screen = 'playing';
      audio.ensure();
    }
  }
  if (e.code === 'KeyC' && screen === 'title' && loadGame()) continueGame();
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  toasts = toasts.filter((t) => t.until > world.time);
  updateParticles(dt);
  if (screen === 'playing') {
    const input = readInput();
    stepWorld(world, dt, input);
    edge.enter = false;
    edge.punch = false;
    edge.shoot = false;
    edge.use = false;
    handleEvents();
    // Free-roam fares: once the story is done, a fare request comes in whenever
    // the player is in a car and free.
    fareCooldown = Math.max(0, fareCooldown - dt);
    if (world.storyDone && !world.fare && !world.player.onFoot && fareCooldown <= 0) {
      startFare(world);
      toast('New fare request — pick them up at the marker.', '#ffd23f');
      fareCooldown = 12;
    }
    if (world.fare === null && world.storyDone) fareCooldown = Math.max(fareCooldown, 0);
    // Autosave every 15 seconds.
    if (world.time - autosaveAt > 15) {
      autosaveAt = world.time;
      saveGame(snapshotForSave(world));
      best = loadGame();
    }
  }
  // Camera follows the player, clamped to the world.
  const tx = Math.max(W / 2, Math.min(world.city.size - W / 2, world.player.x));
  const ty = Math.max(H / 2, Math.min(world.city.size - H / 2, world.player.y));
  cam.x += (tx - cam.x) * Math.min(1, dt * 5);
  cam.y += (ty - cam.y) * Math.min(1, dt * 5);
  world._markers = currentMarkers(world);
  drawWorld(ctx, world, cam, W, H);
  if (screen === 'playing' || screen === 'paused') {
    drawHUD(ctx, world, W, H, toasts, currentObjective(world));
  }
  if (screen === 'title') drawTitle(ctx, W, H, best);
  if (screen === 'paused') drawPaused(ctx, W, H);
  if (screen === 'busted') drawBusted(ctx, W, H, bustedInfo.reason, bustedInfo.fine);
  if (screen === 'complete') drawComplete(ctx, W, H, world);
}

// Screenshot staging: ?shot=title | ?shot=play | ?shot=complete sets the game up
// deterministically so the three dossier screenshots can be taken headlessly.
function stageShot() {
  const shot = new URLSearchParams(location.search).get('shot');
  if (!shot) return;
  if (shot === 'title') {
    screen = 'title';
    return;
  }
  if (shot === 'play') {
    newGame();
    // Put the player in the nearest parked car, one star of heat, mid-mission.
    const car = world.cars.find((c) => c.kind === 'parked');
    if (car) {
      world.player.x = car.x;
      world.player.y = car.y;
      world.player.onFoot = false;
      world.player.carId = car.id;
      car.kind = 'player';
      car.driver = 'player';
      car.speed = 120;
      car.angle = Math.PI / 2;
    }
    world.heat = 25;
    world.wanted = 1;
    cam.x = world.player.x;
    cam.y = world.player.y;
    return;
  }
  if (shot === 'complete') {
    newGame();
    world.storyDone = true;
    world.mission = null;
    world.missionIndex = 6;
    world.totalEarned = 2450;
    world.player.money = 2700;
    screen = 'complete';
  }
}

stageShot();
requestAnimationFrame(frame);

// Small hook for headless checks: lets a test drive the simulation and read state.
window.__solmar = {
  world: () => world,
  screen: () => screen,
  start: () => newGame(),
  step: (dt, input) => stepWorld(world, dt, input || {}),
  save: () => snapshotForSave(world),
};


