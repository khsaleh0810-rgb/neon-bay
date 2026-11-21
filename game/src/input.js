// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter a car, punch, pause, mute) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted
// twice. The mouse position is kept in screen pixels and turned into a world
// aim angle by the caller, which knows the camera.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_SHOOT = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (RUN.has(event.code)) held.run = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (RUN.has(event.code)) held.run = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur, and clear one-shot presses too.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = false;
    mouse.down = false;
    actions = 0;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    actions |= ACTION_CONFIRM;
    if (event.button === 0) actions |= ACTION_SHOOT;
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    /** The held movement keys as a unit-ish vector (x right, y down). */
    move() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      return { x, y, run: held.run };
    },
    /** W/S (or up/down) as -1..1 throttle for driving; A/D as steering. */
    drive() {
      const throttle = (held.up ? 1 : 0) - (held.down ? 1 : 0);
      const steer = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      return { throttle, steer, brake: held.down, handbrake: held.run };
    },
    /** The mouse position in canvas pixels, and whether the button is held. */
    mouse() {
      return mouse;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
