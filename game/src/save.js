// Saving for Solmar Bay: one slot in localStorage, autosaved while you play.
// Everything is guarded — in a headless test (no localStorage) it falls back to
// an in-memory slot so the save/load round trip can still be tested.

const KEY = 'solmar-bay-save-v1';

let memorySlot = null;

function storeAvailable() {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage;
  } catch {
    return false;
  }
}

export function saveGame(snapshot) {
  const text = JSON.stringify(snapshot);
  if (storeAvailable()) {
    try {
      localStorage.setItem(KEY, text);
      return true;
    } catch {
      return false;
    }
  }
  memorySlot = text;
  return true;
}

export function loadGame() {
  let text = null;
  if (storeAvailable()) {
    try {
      text = localStorage.getItem(KEY);
    } catch {
      text = null;
    }
  } else {
    text = memorySlot;
  }
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  if (storeAvailable()) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  memorySlot = null;
}

export function hasSave() {
  return loadGame() !== null;
}

