// Drawing only: the world's state and the current screen in, pixels out.
// The camera follows the player across the 2400x2400 city and the 1280x720
// view is scaled to fit the window, so no rule depends on the screen size.
// Flat shapes, canvas text for the HUD and panels. Text that holds a number
// is rebuilt only when the number changes, so a frame allocates nothing.
import { CITY, FONT, PALETTE, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSION = 'mission';
export const SCREEN_FAILED = 'failed';
export const SCREEN_STORY = 'story';

const TAU = Math.PI * 2;

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, width: 0, height: 0 };
  const moneyLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('');
  const speedLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.width = width;
    view.height = height;
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    const key = `${size}`;
    if (!fonts.has(key)) fonts.set(key, `bold ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }
  function plainText(value, x, y, size, color, align) {
    const key = `p${size}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  /** 0 = deep night, 1 = full day, from the world's day clock. */
  function daylight(dayTime) {
    if (dayTime < 120) return 1;
    if (dayTime < 150) return 1 - (dayTime - 120) / 30;
    if (dayTime < 210) return 0;
    return (dayTime - 210) / 30;
  }

  function drawCity(state, cam) {
    const city = state.city;
    const day = daylight(state.dayTime);
    // Ground: grass everywhere, then the beach and sea along the south edge.
    context.fillStyle = PALETTE.grass;
    context.fillRect(-40, -40, VIEW.width + 80, VIEW.height + 80);
    context.fillStyle = PALETTE.sand;
    context.fillRect(-40, Math.max(-40, CITY.beachY - cam.sy), VIEW.width + 80, VIEW.height + 80);
    context.fillStyle = PALETTE.sea;
    context.fillRect(-40, Math.max(-40, CITY.beachY + 90 - cam.sy), VIEW.width + 80, VIEW.height + 80);
    // Parks.
    context.fillStyle = PALETTE.park;
    for (const park of city.parks) {
      if (!onScreen(park, cam)) continue;
      context.fillRect(park.x - cam.sx, park.y - cam.sy, park.width, park.height);
      context.fillStyle = '#2a6b3a';
      context.beginPath();
      context.arc(park.x + park.width * 0.3 - cam.sx, park.y + park.height * 0.4 - cam.sy, 14, 0, TAU);
      context.arc(park.x + park.width * 0.7 - cam.sx, park.y + park.height * 0.6 - cam.sy, 18, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.park;
    }
    // Roads: dark strips with a dashed centre line.
    context.fillStyle = PALETTE.road;
    const startX = Math.max(0, Math.floor(cam.sx / CITY.block) * CITY.block - CITY.block);
    const endX = cam.sx + VIEW.width + CITY.block;
    const startY = Math.max(0, Math.floor(cam.sy / CITY.block) * CITY.block - CITY.block);
    const endY = cam.sy + VIEW.height + CITY.block;
    for (let x = startX; x <= endX; x += CITY.block) {
      context.fillRect(x - CITY.road / 2 - cam.sx, -40, CITY.road, VIEW.height + 80);
    }
    for (let y = startY; y <= endY; y += CITY.block) {
      context.fillRect(-40, y - CITY.road / 2 - cam.sy, VIEW.width + 80, CITY.road);
    }
    context.strokeStyle = PALETTE.roadLine;
    context.lineWidth = 2;
    context.setLineDash([18, 22]);
    context.beginPath();
    for (let x = startX; x <= endX; x += CITY.block) {
      context.moveTo(x - cam.sx, -40);
      context.lineTo(x - cam.sx, VIEW.height + 40);
    }
    for (let y = startY; y <= endY; y += CITY.block) {
      context.moveTo(-40, y - cam.sy);
      context.lineTo(VIEW.width + 40, y - cam.sy);
    }
    context.stroke();
    context.setLineDash([]);
    // Parking lots.
    context.fillStyle = '#33333d';
    for (const lot of city.lots) {
      if (!onScreen(lot, cam)) continue;
      context.fillRect(lot.x - cam.sx, lot.y - cam.sy, lot.width, lot.height);
    }
    // Buildings: coloured blocks with lit windows at night.
    for (const b of city.buildings) {
      if (!onScreen(b, cam)) continue;
      const bx = b.x - cam.sx;
      const by = b.y - cam.sy;
      context.fillStyle = b.colour;
      context.fillRect(bx, by, b.width, b.height);
      context.fillStyle = b.roof;
      context.fillRect(bx + 6, by + 6, b.width - 12, b.height - 12);
      const cols = Math.max(2, Math.floor(b.width / 34));
      const rows = Math.max(2, Math.floor(b.height / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const lit = ((cx * 7 + cy * 13 + b.storeys) % 5) < (day < 0.5 ? 3 : 1);
          context.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDark;
          context.fillRect(bx + 12 + cx * 34, by + 12 + cy * 34, 16, 12);
        }
      }
    }
    // Night tint over everything below.
    if (day < 1) {
      context.fillStyle = `rgba(8, 8, 32, ${(1 - day) * 0.42})`;
      context.fillRect(-40, -40, VIEW.width + 80, VIEW.height + 80);
    }
  }

  function onScreen(rect, cam) {
    return rect.x + (rect.width || 0) > cam.sx - 40 && rect.x < cam.sx + VIEW.width + 40
      && rect.y + (rect.height || 0) > cam.sy - 40 && rect.y < cam.sy + VIEW.height + 40;
  }

  function drawCar(car, cam, time) {
    const x = car.x - cam.sx;
    const y = car.y - cam.sy;
    context.save();
    context.translate(x, y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(-40, -20, 84, 46, 10);
    context.fill();
    context.fillStyle = car.colour;
    roundRect(-42, -23, 84, 46, 10);
    context.fill();
    // Cabin and windshield.
    context.fillStyle = 'rgba(20, 24, 38, 0.9)';
    roundRect(-12, -19, 30, 38, 6);
    context.fill();
    context.fillStyle = 'rgba(140, 200, 240, 0.55)';
    context.fillRect(8, -17, 8, 34);
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(38, -19, 5, 8);
    context.fillRect(38, 11, 5, 8);
    context.fillStyle = '#ff5a5a';
    context.fillRect(-43, -19, 4, 8);
    context.fillRect(-43, 11, 4, 8);
    if (car.kind === 'police') {
      context.fillStyle = '#f2f2f2';
      context.fillRect(-8, -23, 34, 46);
      context.fillStyle = '#111';
      plainText('PD', 2, 6, 13, '#111', 'center');
      const flash = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = flash ? PALETTE.policeLightRed : PALETTE.policeLightBlue;
      context.fillRect(-4, -24, 10, 6);
      context.fillStyle = flash ? PALETTE.policeLightBlue : PALETTE.policeLightRed;
      context.fillRect(6, -24, 10, 6);
    }
    if (car.health > 0 && car.health < 45) {
      // Smoke from a dying car.
      context.fillStyle = 'rgba(120,120,120,0.5)';
      context.beginPath();
      context.arc(-20 + Math.sin(time * 6) * 4, -8, 8 + Math.sin(time * 9) * 2, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  function drawPed(ped, cam, time) {
    if (ped.state === 'down') {
      context.fillStyle = ped.colour;
      context.save();
      context.translate(ped.x - cam.sx, ped.y - cam.sy);
      context.rotate(1.2);
      roundRect(-13, -6, 26, 12, 6);
      context.fill();
      context.restore();
      return;
    }
    const x = ped.x - cam.sx;
    const y = ped.y - cam.sy;
    const bob = Math.sin(time * 10 + ped.x) * 2;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(x, y + 10, 9, 4, 0, 0, TAU);
    context.fill();
    context.fillStyle = ped.colour;
    context.beginPath();
    context.arc(x, y + bob, 10, 0, TAU);
    context.fill();
    context.fillStyle = '#222';
    context.beginPath();
    context.arc(x + Math.cos(ped.angle) * 4, y + bob - 3, 5, 0, TAU);
    context.fill();
  }

  function drawPlayer(state, cam, time) {
    const p = state.player;
    if (p.inCar) {
      drawCar(p.inCar, cam, time);
      return;
    }
    const x = p.x - cam.sx;
    const y = p.y - cam.sy;
    const blink = p.invuln > 0 && Math.floor(time * 12) % 2 === 0;
    if (blink) return;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.ellipse(x, y + 12, 11, 5, 0, 0, TAU);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x, y, 13, 0, TAU);
    context.fill();
    context.fillStyle = '#1d4ed8';
    context.beginPath();
    context.arc(x, y - 2, 6, 0, TAU);
    context.fill();
    // Aim direction.
    context.strokeStyle = 'rgba(255, 207, 61, 0.9)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x + Math.cos(p.angle) * 14, y + Math.sin(p.angle) * 14);
    context.lineTo(x + Math.cos(p.angle) * 22, y + Math.sin(p.angle) * 22);
    context.stroke();
  }

  function drawMarker(target, cam, time, label) {
    if (!target) return;
    const x = target.x - cam.sx;
    const y = target.y - cam.sy;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    if (x > -40 && x < VIEW.width + 40 && y > -40 && y < VIEW.height + 40) {
      context.save();
      context.translate(x, y);
      context.scale(pulse, pulse);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(0, -22);
      context.lineTo(16, 0);
      context.lineTo(0, 22);
      context.lineTo(-16, 0);
      context.closePath();
      context.fill();
      context.fillStyle = '#111';
      context.beginPath();
      context.arc(0, 0, 6, 0, TAU);
      context.fill();
      context.restore();
      // A light beam so the target is visible from a distance.
      context.fillStyle = 'rgba(255, 207, 61, 0.18)';
      context.fillRect(x - 3, y - 260, 6, 260);
      if (label) plainText(label, x, y - 34, 14, PALETTE.marker, 'center');
    } else {
      // Off-screen: an arrow on the view edge points the way.
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      const ang = Math.atan2(y - cy, x - cx);
      const ex = cx + Math.cos(ang) * (VIEW.width / 2 - 46);
      const ey = cy + Math.sin(ang) * (VIEW.height / 2 - 46);
      context.save();
      context.translate(ex, ey);
      context.rotate(ang);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-10, -12);
      context.lineTo(-10, 12);
      context.closePath();
      context.fill();
      context.restore();
      const dist = Math.round(Math.hypot(target.x - (cam.sx + cx), target.y - (cam.sy + cy)));
      plainText(`${dist}m`, ex, ey + 30, 13, PALETTE.marker, 'center');
    }
  }

  function drawMinimap(state, cam) {
    const size = 196;
    const x0 = VIEW.width - size - 16;
    const y0 = 16;
    const scale = size / WORLD.size;
    context.save();
    context.fillStyle = 'rgba(10, 10, 22, 0.85)';
    roundRect(x0 - 6, y0 - 6, size + 12, size + 12, 10);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    context.stroke();
    context.beginPath();
    context.rect(x0, y0, size, size);
    context.clip();
    // Sea and beach.
    context.fillStyle = PALETTE.sea;
    context.fillRect(x0, y0 + CITY.beachY * scale, size, size);
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, y0 + (CITY.beachY - 90) * scale, size, 90 * scale);
    // Roads.
    context.strokeStyle = '#565664';
    context.lineWidth = 2;
    for (let x = 0; x <= WORLD.size; x += CITY.block) {
      context.beginPath();
      context.moveTo(x0 + x * scale, y0);
      context.lineTo(x0 + x * scale, y0 + size);
      context.stroke();
      context.beginPath();
      context.moveTo(x0, y0 + x * scale);
      context.lineTo(x0 + size, y0 + x * scale);
      context.stroke();
    }
    // Mission target.
    const target = state.missionTarget;
    if (target) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(x0 + target.x * scale, y0 + target.y * scale, 5, 0, TAU);
      context.fill();
    }
    // Police.
    context.fillStyle = '#4d7dff';
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      context.beginPath();
      context.arc(x0 + car.x * scale, y0 + car.y * scale, 3.5, 0, TAU);
      context.fill();
    }
    // The player, as an arrow.
    const p = state.player;
    context.save();
    context.translate(x0 + p.x * scale, y0 + p.y * scale);
    context.rotate(p.inCar ? p.inCar.angle : p.angle);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-6, -5);
    context.lineTo(-6, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    plainText('NEON BAY', x0 + size / 2, y0 + size + 20, 11, PALETTE.hudDim, 'center');
  }

  function drawStars(wanted) {
    if (wanted <= 0) return;
    const x0 = VIEW.width - 220;
    const y0 = 244;
    for (let i = 0; i < 5; i += 1) {
      const x = x0 + i * 26;
      context.fillStyle = i < wanted ? PALETTE.star : PALETTE.starEmpty;
      context.beginPath();
      for (let k = 0; k < 5; k += 1) {
        const a = -Math.PI / 2 + (k * TAU) / 5;
        const px = x + Math.cos(a) * 11;
        const py = y0 + Math.sin(a) * 11;
        if (k === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
        const a2 = a + TAU / 10;
        context.lineTo(x + Math.cos(a2) * 5, y0 + Math.sin(a2) * 5);
      }
      context.closePath();
      context.fill();
    }
  }

  function drawHUD(state, ui) {
    const p = state.player;
    // Money, top-left.
    context.fillStyle = PALETTE.panel;
    roundRect(12, 12, 190, 44, 10);
    context.fill();
    text(moneyLabel(state.money), 26, 44, 26, PALETTE.money);
    // Mission panel under the money.
    const mission = state.missionInfo;
    if (mission) {
      context.fillStyle = PALETTE.panel;
      roundRect(12, 64, 330, 78, 10);
      context.fill();
      context.fillStyle = PALETTE.panelEdge;
      context.fillRect(12, 64, 4, 78);
      text(mission.title, 28, 92, 17, PALETTE.hud);
      plainText(mission.stepText, 28, 116, 14, PALETTE.hudDim);
      if (mission.timer > 0) {
        const urgent = mission.timer < 15;
        text(`${Math.ceil(mission.timer)}s`, 326, 92, 17, urgent ? PALETTE.danger : PALETTE.hud, 'right');
      }
      plainText(`Reward $${mission.payout}`, 28, 134, 12, PALETTE.money);
    } else if (state.sideJobInfo) {
      const job = state.sideJobInfo;
      context.fillStyle = PALETTE.panel;
      roundRect(12, 64, 330, 78, 10);
      context.fill();
      context.fillStyle = PALETTE.panelEdge;
      context.fillRect(12, 64, 4, 78);
      text('Side Job: Cab Fare', 28, 92, 17, PALETTE.hud);
      plainText(job.text, 28, 116, 14, PALETTE.hudDim);
      plainText(`Fare $${job.payout}`, 28, 134, 12, PALETTE.money);
    } else if (state.storyDone) {
      context.fillStyle = PALETTE.panel;
      roundRect(12, 64, 330, 56, 10);
      context.fill();
      text('Story complete — free roam', 28, 92, 16, PALETTE.hud);
      plainText('Cab fares keep paying. Enjoy Neon Bay.', 28, 112, 13, PALETTE.hudDim);
    }
    // Health and ammo, bottom-left.
    context.fillStyle = PALETTE.panel;
    roundRect(12, VIEW.height - 64, 250, 52, 10);
    context.fill();
    plainText('HEALTH', 26, VIEW.height - 40, 12, PALETTE.hudDim);
    const hw = 150 * Math.max(0, p.health / 100);
    context.fillStyle = p.health < 30 ? PALETTE.healthLow : PALETTE.health;
    context.fillRect(96, VIEW.height - 50, hw, 12);
    context.strokeStyle = PALETTE.hudDim;
    context.lineWidth = 1;
    context.strokeRect(96, VIEW.height - 50, 150, 12);
    plainText(`AMMO ${p.ammo}`, 26, VIEW.height - 20, 13, PALETTE.hud);
    // Speed, bottom-right, while driving.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.36);
      text(speedLabel(kmh), VIEW.width - 26, VIEW.height - 24, 34, PALETTE.hud, 'right');
      plainText('km/h', VIEW.width - 26, VIEW.height - 52, 12, PALETTE.hudDim, 'right');
      const carHealth = Math.max(0, p.inCar.health);
      context.fillStyle = 'rgba(10, 10, 22, 0.85)';
      roundRect(VIEW.width - 226, VIEW.height - 92, 200, 16, 6);
      context.fill();
      context.fillStyle = carHealth < 30 ? PALETTE.healthLow : '#f2c94c';
      context.fillRect(VIEW.width - 222, VIEW.height - 89, 192 * (carHealth / 100), 10);
    }
    // Wanted stars, above the minimap.
    drawStars(state.wanted);
    drawMinimap(state);
    // Context prompts.
    if (ui.prompt) {
      context.fillStyle = PALETTE.panel;
      const w = 460;
      roundRect((VIEW.width - w) / 2, VIEW.height - 118, w, 34, 8);
      context.fill();
      plainText(ui.prompt, VIEW.width / 2, VIEW.height - 95, 14, PALETTE.hud, 'center');
    }
    // Controls hint, early on.
    if (ui.showHelp) {
      plainText('WASD move / drive  •  E enter car  •  F punch  •  Click shoot  •  Shift run / handbrake  •  P pause  •  M mute',
        VIEW.width / 2, 34, 13, PALETTE.hudDim, 'center');
    }
    // Event banner.
    if (ui.banner) {
      context.fillStyle = PALETTE.panel;
      const w = 520;
      roundRect((VIEW.width - w) / 2, 56, w, 40, 10);
      context.fill();
      context.fillStyle = PALETTE.panelEdge;
      context.fillRect((VIEW.width - w) / 2, 56, 4, 40);
      text(ui.banner, VIEW.width / 2, 83, 18, PALETTE.hud, 'center');
    }
    if (ui.muted) plainText('MUTED (M)', VIEW.width - 16, VIEW.height - 100, 12, PALETTE.hudDim, 'right');
  }

  function drawPanel(lines, prompt) {
    const width = 640;
    const height = 120 + lines.length * 30 + (prompt ? 56 : 0);
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    let cy = y + 52;
    for (const line of lines) {
      if (line.big) text(line.text, VIEW.width / 2, cy, 34, line.color || PALETTE.hud, 'center');
      else if (line.mid) text(line.text, VIEW.width / 2, cy, 20, line.color || PALETTE.hud, 'center');
      else plainText(line.text, VIEW.width / 2, cy, 15, line.color || PALETTE.hudDim, 'center');
      cy += line.big ? 48 : line.mid ? 34 : 28;
    }
    if (prompt) text(prompt, VIEW.width / 2, y + height - 26, 16, PALETTE.marker, 'center');
  }

  function draw(state, screen, ui) {
    const p = state.player;
    const cam = {
      sx: Math.max(0, Math.min(WORLD.size - VIEW.width, p.x - VIEW.width / 2)),
      sy: Math.max(0, Math.min(WORLD.size - VIEW.height, p.y - VIEW.height / 2)),
    };
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Backdrop outside the view.
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(-view.x / view.scale - 2, -view.y / view.scale - 2,
      view.width / view.scale + 4, view.height / view.scale + 4);
    drawCity(state, cam);
    // Shops and landmarks.
    for (const [key, place] of Object.entries(state.places)) {
      const x = place.x - cam.sx;
      const y = place.y - cam.sy;
      if (x < -60 || x > VIEW.width + 60 || y < -60 || y > VIEW.height + 60) continue;
      context.fillStyle = key === 'sprayShop' ? PALETTE.spray : key === 'gunShop' ? PALETTE.gun : '#3a3f4d';
      context.beginPath();
      context.arc(x, y, 16, 0, TAU);
      context.fill();
      context.fillStyle = '#fff';
      plainText(key === 'hospital' ? '+' : key === 'sprayShop' ? 'S' : key === 'gunShop' ? 'G' : '◆',
        x, y + 5, 14, '#fff', 'center');
      plainText(place.label, x, y + 32, 11, PALETTE.hudDim, 'center');
    }
    // Crates.
    for (const crate of state.crates) {
      if (crate.taken) continue;
      const x = crate.x - cam.sx;
      const y = crate.y - cam.sy;
      context.fillStyle = '#b45309';
      context.fillRect(x - 13, y - 13, 26, 26);
      context.strokeStyle = '#fbbf24';
      context.lineWidth = 2;
      context.strokeRect(x - 13, y - 13, 26, 26);
      context.beginPath();
      context.moveTo(x - 13, y - 13);
      context.lineTo(x + 13, y + 13);
      context.moveTo(x + 13, y - 13);
      context.lineTo(x - 13, y + 13);
      context.stroke();
    }
    // Passenger waiting at the docks.
    if (state.passenger && !state.passenger.boarded) {
      const x = state.passenger.x - cam.sx;
      const y = state.passenger.y - cam.sy;
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(x, y, 11, 0, TAU);
      context.fill();
      plainText('CLIENT', x, y - 20, 12, PALETTE.marker, 'center');
    }
    // Mission target marker.
    drawMarker(state.missionTarget, cam, ui.time, state.missionTargetLabel);
    // Tracers (gunfire).
    context.strokeStyle = 'rgba(255, 240, 160, 0.9)';
    context.lineWidth = 2;
    for (const t of state.tracers) {
      context.beginPath();
      context.moveTo(t.x1 - cam.sx, t.y1 - cam.sy);
      context.lineTo(t.x2 - cam.sx, t.y2 - cam.sy);
      context.stroke();
    }
    // Cars, peds, cops, player — y-sorted so nearer things draw on top.
    const drawables = [];
    for (const car of state.cars) {
      if (car.health <= 0 && car.kind !== 'player') continue;
      drawables.push({ y: car.y, draw: () => drawCar(car, cam, ui.time) });
    }
    for (const ped of state.peds) drawables.push({ y: ped.y, draw: () => drawPed(ped, cam, ui.time) });
    for (const cop of state.cops) {
      if (cop.health <= 0) continue;
      drawables.push({
        y: cop.y,
        draw: () => {
          const x = cop.x - cam.sx;
          const y = cop.y - cam.sy;
          context.fillStyle = PALETTE.cop;
          context.beginPath();
          context.arc(x, y, 11, 0, TAU);
          context.fill();
          context.fillStyle = '#fff';
          plainText('P', x, y + 4, 11, '#fff', 'center');
        },
      });
    }
    drawables.push({ y: p.y, draw: () => drawPlayer(state, cam, ui.time) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHUD(state, ui);
    }
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(6, 6, 18, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel([
        { text: 'NEON BAY', big: true, color: '#ff9f1c' },
        { text: 'An open-world crime game in the spirit of GTA 6', mid: true },
        { text: 'Drive, steal, run from the cops and finish Dahlia\u2019s six jobs.', color: PALETTE.hudDim },
        { text: ui.hasSave ? 'A saved game is waiting — Continue, or start over.' : 'Six story missions, cab fares after that, and a city that never sleeps.', color: PALETTE.hudDim },
        { text: `Best: ${ui.best}`, color: PALETTE.money },
      ], ui.hasSave ? 'SPACE — Continue    •    N — New game' : 'SPACE or CLICK — Start');
    } else if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(6, 6, 18, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel([
        { text: 'PAUSED', big: true },
        { text: 'WASD move / drive  •  E enter a car  •  F punch  •  Click to shoot', color: PALETTE.hudDim },
        { text: 'Shift runs on foot and handbrakes in a car  •  M mutes the sound', color: PALETTE.hudDim },
        { text: 'Your progress saves automatically.', color: PALETTE.hudDim },
      ], 'P or SPACE — Resume');
    } else if (screen === SCREEN_OVER) {
      context.fillStyle = 'rgba(6, 6, 18, 0.6)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel([
        { text: ui.overTitle || 'BUSTED', big: true, color: PALETTE.danger },
        { text: ui.overText || 'The Bay PD caught up with you.', mid: true },
        { text: `Fine paid: $${ui.fine || 0}  •  Cash left: $${state.money}`, color: PALETTE.hudDim },
      ], 'SPACE — Back on the streets');
    } else if (screen === SCREEN_MISSION) {
      drawHUD(state, ui);
      drawPanel([
        { text: 'MISSION COMPLETE', big: true, color: PALETTE.money },
        { text: ui.missionTitle || '', mid: true },
        { text: `+$${ui.missionPayout || 0}  •  Cash: $${state.money}`, color: PALETTE.hudDim },
        { text: ui.nextBrief || '', color: PALETTE.hudDim },
      ], 'SPACE — Next job');
    } else if (screen === SCREEN_FAILED) {
      context.fillStyle = 'rgba(6, 6, 18, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel([
        { text: 'MISSION FAILED', big: true, color: PALETTE.danger },
        { text: 'Out of time. Dahlia is not angry — she is just disappointed.', mid: true },
      ], 'SPACE — Try it again');
    } else if (screen === SCREEN_STORY) {
      drawHUD(state, ui);
      drawPanel([
        { text: 'THE BIG SCORE — DONE', big: true, color: PALETTE.money },
        { text: 'All six jobs finished. Neon Bay is yours now.', mid: true },
        { text: `Total earned: $${state.stats.earned}  •  Cars stolen: ${state.stats.carsStolen}`, color: PALETTE.hudDim },
        { text: 'Free roam: cab fares keep paying around the city.', color: PALETTE.hudDim },
      ], 'SPACE — Keep playing');
    }
  }

  return { draw, resize };
}
