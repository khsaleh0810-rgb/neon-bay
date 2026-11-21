// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between screens — title,
// play, paused, mission complete, failed, busted/wasted and story complete —
// and saves to localStorage on every mission and every few seconds, so a
// visit can pick up where it left off.
//
// ?seed=N fixes the city. ?shot=start|play|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, MISSIONS, PLACES, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED,
  EVENT_CRIME,
  EVENT_FAILED,
  EVENT_HIT,
  EVENT_MISSION,
  EVENT_MISSION_DONE,
  EVENT_MONEY,
  EVENT_SHOT,
  EVENT_WANTED_DOWN,
  EVENT_WANTED_UP,
  EVENT_WASTED,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_ENTER,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_PUNCH,
  ACTION_SHOOT,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_FAILED, SCREEN_MISSION, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 15;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

// The renderer reads these off the world state every frame; main.js is the
// one place that derives them from the mission and the side job.
world.state.places = PLACES;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, world.serialize());
  } catch {
    // Saving is a courtesy, never a crash.
  }
}

// Any uncaught error is reported into the status line as well as the console,
// so a headless run can see that the game failed instead of failing silently.
window.addEventListener('error', (event) => {
  status.textContent = `Error: ${event.message}`;
});

function missionTarget() {
  const state = world.state;
  if (state.storyDone) {
    if (state.sideJob) {
      const job = state.sideJob;
      return job.phase === 'pickup'
        ? { at: job.pickup, label: 'Pick up the fare' }
        : { at: job.drop, label: 'Drop off the fare' };
    }
    return null;
  }
  const mission = world.currentMission();
  if (!mission) return null;
  const step = world.currentStep();
  if (!step) return null;
  if (step.kind === 'reach' || step.kind === 'hold') {
    const at = world.placeFor(step.at);
    return { at, label: at.label };
  }
  if (step.kind === 'collect') {
    const left = state.crates.find((c) => !c.taken);
    return left ? { at: left, label: 'Crate' } : null;
  }
  if (step.kind === 'enterCar') {
    let best = null;
    let bestD = Infinity;
    for (const car of state.cars) {
      if (car.health <= 0 || car.kind === 'police') continue;
      const d = (car.x - state.player.x) ** 2 + (car.y - state.player.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best ? { at: best, label: 'A car' } : null;
  }
  return null;
}

function missionInfo() {
  const state = world.state;
  const mission = world.currentMission();
  if (!mission) return null;
  return {
    title: `${mission.title} — ${state.missionStep + 1}/${mission.steps.length}`,
    stepText: world.missionStepText(),
    timer: state.missionTimer,
    payout: mission.payout,
  };
}

function sideJobInfo() {
  const job = world.state.sideJob;
  if (!job) return null;
  return {
    text: job.phase === 'pickup' ? 'Pick up the fare (drive to the marker)' : 'Drop the fare at the marker',
    payout: job.payout,
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  const state = world.state;
  const target = missionTarget();
  state.missionTarget = target ? target.at : null;
  state.missionTargetLabel = target ? target.label : null;
  state.missionInfo = missionInfo();
  state.sideJobInfo = sideJobInfo();
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, {
      time: 3.2, best: scene.best, hasSave: false, banner: null,
      prompt: null, showHelp: false, muted: false,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let hasSave = !!readSave();
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let banner = null;
  let bannerTimer = 0;
  let helpTimer = 14;
  let autosaveTimer = AUTOSAVE_SECONDS;
  let overTitle = 'BUSTED';
  let overText = '';
  let fine = 0;
  let missionTitle = '';
  let missionPayout = 0;
  let nextBrief = '';
  let newGameKey = false;
  let failedIndex = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && screen === SCREEN_TITLE && !event.repeat) newGameKey = true;
  });

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and the big events.
  function announce(message) {
    status.textContent = message;
  }

  function setBanner(message, seconds) {
    banner = message;
    bannerTimer = seconds || 3;
  }

  function startGame(fromSave) {
    if (fromSave) {
      const save = readSave();
      if (save) {
        try {
          world.loadSave(save);
        } catch {
          world.reset();
        }
      } else {
        world.reset();
      }
    } else {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // No save to clear.
      }
      world.reset();
    }
    accumulator = 0;
    helpTimer = 14;
    autosaveTimer = AUTOSAVE_SECONDS;
    screen = SCREEN_PLAY;
    announce('Playing Neon Bay. Follow the mission marker.');
  }

  function showMissionComplete() {
    const state = world.state;
    const done = MISSIONS[state.missionIndex - 1] || MISSIONS[MISSIONS.length - 1];
    missionTitle = done.title;
    missionPayout = done.payout;
    if (state.storyDone) {
      screen = SCREEN_STORY;
      saveGame();
      if (state.stats.earned > best) {
        best = state.stats.earned;
        saveBest(best);
      }
      announce('Story complete. Neon Bay is yours.');
      return;
    }
    const next = world.currentMission();
    nextBrief = next ? `Next: ${next.title} — ${next.brief}` : '';
    screen = SCREEN_MISSION;
    saveGame();
    announce(`Mission complete: ${done.title}. Earned $${done.payout}.`);
  }

  function showOver(title, text, amount) {
    overTitle = title;
    overText = text;
    fine = amount;
    screen = SCREEN_OVER;
    saveGame();
    announce(`${title}. ${text}`);
  }

  function handleEvents(events) {
    const state = world.state;
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_MONEY) audio.cash();
    if (events & EVENT_MISSION) setBanner('Objective complete', 2.5);
    if (events & EVENT_WANTED_UP) {
      setBanner(`Wanted level: ${state.wanted} star${state.wanted > 1 ? 's' : ''} — lose the cops`, 3);
      announce(`Wanted level ${state.wanted}.`);
    }
    if (events & EVENT_WANTED_DOWN) setBanner('The heat is off… for now', 2.5);
    if (events & EVENT_CRIME) audio.hit();
    if (events & EVENT_MISSION_DONE) {
      audio.missionDone();
      showMissionComplete();
    }
    if (events & EVENT_FAILED) {
      failedIndex = state.missionIndex;
      screen = SCREEN_FAILED;
      announce('Mission failed. Out of time.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      const amount = world.applyBusted();
      showOver('BUSTED', 'The Bay PD caught up with you. Your car is impounded.', amount);
    }
    if (events & EVENT_WASTED) {
      audio.busted();
      const amount = world.applyWasted();
      showOver('WASTED', 'You wake up at St. Marina Hospital, lighter by a fine.', amount);
    }
  }

  function prompt() {
    const state = world.state;
    const p = state.player;
    if (screen !== SCREEN_PLAY) return null;
    if (!p.inCar) {
      for (const car of state.cars) {
        if (car.health <= 0 || car.kind === 'police') continue;
        const d = (car.x - p.x) ** 2 + (car.y - p.y) ** 2;
        if (d < 78 * 78) return car.driver ? 'Press E to jack this car — the driver will call it in' : 'Press E to get in the car';
      }
      const gun = PLACES.gunShop;
      if (state.money >= 50 && p.ammo < 90 && (gun.x - p.x) ** 2 + (gun.y - p.y) ** 2 < 70 * 70) {
        return 'Ironworks Guns: walk in for 30 rounds — $50';
      }
    } else if (state.wanted > 0 && state.money >= 150) {
      const spray = PLACES.sprayShop;
      if ((spray.x - p.x) ** 2 + (spray.y - p.y) ** 2 < 200 * 200) {
        return 'Spray Shop ahead: drive in to lose the cops — $150';
      }
    }
    return null;
  }

  function camera() {
    const p = world.state.player;
    return {
      sx: Math.max(0, Math.min(2400 - 1280, p.x - 640)),
      sy: Math.max(0, Math.min(2400 - 720, p.y - 360)),
    };
  }

  function step() {
    const state = world.state;
    const p = state.player;
    // Aim: the mouse in world coordinates, from the camera.
    const mouse = input.mouse();
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    const cam = camera();
    const aimAngle = Math.atan2(
      (mouse.y * scaleY - 360) + cam.sy - p.y,
      (mouse.x * scaleX - 640) + cam.sx - p.x,
    );
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      setBanner(muted ? 'Sound muted (M to unmute)' : 'Sound on', 2);
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame();
      announce('Paused.');
      return 0;
    }
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return 0;
    }
    const simInput = {
      move: input.move(),
      drive: input.drive(),
      actions,
      mouseDown: mouse.down,
      aimAngle,
    };
    const events = world.step(STEP, simInput, 0);
    handleEvents(events);
    // Engine and siren follow the chase.
    if (p.inCar) audio.engine(Math.min(1, Math.abs(p.inCar.speed) / 560));
    else audio.stopEngine();
    const policeNear = state.cars.some((c) => c.kind === 'police' && c.health > 0);
    if (policeNear && state.wanted > 0) audio.siren(STEP);
    else audio.stopSiren();
    return events;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) banner = null;
    }
    if (helpTimer > 0) helpTimer -= dt;
    if (screen === SCREEN_TITLE) {
      const actions = input.takeActions();
      if (newGameKey) {
        newGameKey = false;
        audio.unlock();
        audio.click();
        startGame(false);
      } else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        audio.click();
        startGame(hasSave);
      }
      // The city idles behind the title.
      world.step(STEP, {
        move: { x: 0, y: 0, run: false },
        drive: { throttle: 0, steer: 0, brake: false, handbrake: false },
        actions: 0, mouseDown: false, aimAngle: 0,
      }, 0);
    } else if (screen === SCREEN_PLAY) {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= STEP && screen === SCREEN_PLAY && guard < 8) {
        step();
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 8) accumulator = 0;
      autosaveTimer -= dt;
      if (autosaveTimer <= 0) {
        autosaveTimer = AUTOSAVE_SECONDS;
        saveGame();
      }
    } else if (screen === SCREEN_PAUSED) {
      // Paused: the loop does not step the world, so the resume press is
      // taken here instead of in step().
      const actions = input.takeActions();
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_MISSION || screen === SCREEN_STORY || screen === SCREEN_OVER || screen === SCREEN_FAILED) {
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM) {
        audio.click();
        if (screen === SCREEN_FAILED) {
          world.startMission(failedIndex);
          screen = SCREEN_PLAY;
          announce('Mission restarted.');
        } else {
          screen = SCREEN_PLAY;
        }
      }
    }
    // Derive what the renderer needs from the world, every frame.
    const state = world.state;
    const target = missionTarget();
    state.missionTarget = target ? target.at : null;
    state.missionTargetLabel = target ? target.label : null;
    state.missionInfo = missionInfo();
    state.sideJobInfo = sideJobInfo();
    renderer.draw(state, screen, {
      time, best, hasSave, banner,
      prompt: prompt(),
      showHelp: helpTimer > 0 && screen === SCREEN_PLAY,
      muted: audio.isMuted(),
      overTitle, overText, fine,
      missionTitle, missionPayout, nextBrief,
    });
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame();
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Space or click to start.');
  // A tiny handle for automated checks (and the curious): the live state.
  window.__neonBay = { world, screen: () => screen };
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
