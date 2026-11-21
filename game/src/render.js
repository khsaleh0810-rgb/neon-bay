// Drawing for Solmar Bay: the city, the cars, the people, the police lights, and
// every screen. The renderer only reads world state; the simulation never depends
// on it. Camera is a simple follow cam clamped to the world.

const particles = [];

export function spawnParticles(x, y, color, n, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, x, y, angle, color, isPolice, flash) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, -21, -9, 44, 22, 6);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#161616';
  ctx.fillRect(-16, -13, 10, 5);
  ctx.fillRect(8, -13, 10, 5);
  ctx.fillRect(-16, 9, 10, 5);
  ctx.fillRect(8, 9, 10, 5);
  // Body.
  ctx.fillStyle = color;
  roundRect(ctx, -22, -11, 44, 22, 7);
  ctx.fill();
  // Hood + roof + windshield.
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(10, -8, 9, 16);
  ctx.fillStyle = 'rgba(20,30,44,0.85)';
  ctx.fillRect(-4, -8, 12, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-16, -8, 8, 16);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(20, -9, 3, 5);
  ctx.fillRect(20, 4, 3, 5);
  if (isPolice) {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-4, -11, 10, 22);
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e7dff';
    ctx.fillRect(-2, -12, 5, 5);
    ctx.fillRect(-2, 7, 5, 5);
  }
  ctx.restore();
}

export function drawWorld(ctx, world, cam, width, height) {
  const city = world.city;
  const ox = width / 2 - cam.x;
  const oy = height / 2 - cam.y;
  ctx.save();
  ctx.translate(ox, oy);
  // Ground.
  ctx.fillStyle = '#8aa864';
  ctx.fillRect(cam.x - width / 2 - 40, cam.y - height / 2 - 40, width + 80, height + 80);
  // Beach sand and water along the south edge.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, city.beachY, city.size, city.size - city.beachY);
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(0, city.waterY, city.size, city.size - city.waterY);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x < city.size; x += 90) {
    ctx.moveTo(x, city.waterY + 8);
    ctx.quadraticCurveTo(x + 45, city.waterY + 2, x + 90, city.waterY + 8);
  }
  ctx.stroke();
  // Roads.
  ctx.fillStyle = '#3d3d3d';
  for (const lx of city.roadLines) {
    ctx.fillRect(lx - city.roadWidth / 2, 0, city.roadWidth, city.beachY);
  }
  for (const ly of city.roadLines) {
    if (ly > 2100) continue;
    ctx.fillRect(0, ly - city.roadWidth / 2, city.size, city.roadWidth);
  }
  // Road centre dashes.
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const lx of city.roadLines) {
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, city.beachY);
  }
  for (const ly of city.roadLines) {
    if (ly > 2100) continue;
    ctx.moveTo(0, ly);
    ctx.lineTo(city.size, ly);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Pier.
  ctx.fillStyle = '#8a6b4a';
  ctx.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
  ctx.fillStyle = '#a8875f';
  for (let y = city.pier.y; y < city.pier.y + city.pier.h; y += 18) {
    ctx.fillRect(city.pier.x, y, city.pier.w, 3);
  }
  // Buildings with a sun shadow and windows.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + b.height / 3, b.y + b.height / 3, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i + j) % 2 === 0) continue;
        ctx.fillRect(b.x + 8 + i * 24, b.y + 8 + j * 24, 12, 12);
      }
    }
  }
  // Shops.
  const shopColors = { gun: '#7a4a21', spray: '#2e6f8e', bank: '#8e6f2e', police: '#22303e' };
  for (const s of city.shops) {
    ctx.fillStyle = shopColors[s.kind] || '#555';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.name, s.x + s.w / 2, s.y + s.h / 2 + 5);
  }
  // Crates.
  for (const c of world.crates) {
    if (c.taken) continue;
    const pulse = 1 + Math.sin(world.time * 5) * 0.12;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#b07a2a';
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeStyle = '#5f3d0e';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.beginPath();
    ctx.moveTo(-11, -11);
    ctx.lineTo(11, 11);
    ctx.moveTo(11, -11);
    ctx.lineTo(-11, 11);
    ctx.stroke();
    ctx.restore();
  }
  // Objective markers: a beam and a bobbing diamond.
  for (const m of world._markers || []) {
    const bob = Math.sin(world.time * 4) * 6;
    ctx.fillStyle = 'rgba(255,210,63,0.16)';
    ctx.fillRect(m.x - 3, m.y - 130, 6, 130);
    ctx.save();
    ctx.translate(m.x, m.y - 44 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = m.color || '#ffd23f';
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label || '', m.x, m.y - 62 + bob);
  }
  // Peds.
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Foot cops.
  for (const cop of world.cops) {
    if (cop.down) {
      ctx.fillStyle = '#22303e';
      ctx.beginPath();
      ctx.ellipse(cop.x, cop.y, 12, 7, cop.angle, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = '#22303e';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dfe9f2';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e7dff';
    ctx.beginPath();
    ctx.arc(cop.x + Math.cos(cop.angle) * 8, cop.y + Math.sin(cop.angle) * 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars.
  const flash = Math.floor(world.time * 4) % 2 === 0;
  for (const car of world.cars) {
    if (car.kind === 'wreck') {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = '#3a3a3a';
      roundRect(ctx, -22, -11, 44, 22, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, -8);
      ctx.lineTo(18, 8);
      ctx.moveTo(18, -8);
      ctx.lineTo(-18, 8);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    drawCarShape(ctx, car.x, car.y, car.angle, car.color, car.kind === 'police', flash);
    if (car.kind === 'player') {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (car.hp < 55 && car.hp > 0) {
      ctx.fillStyle = 'rgba(255,80,40,0.75)';
      ctx.beginPath();
      ctx.arc(car.x - 14, car.y - 6, 4 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Player on foot.
  const pl = world.player;
  if (pl.onFoot) {
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(pl.x + Math.cos(pl.angle) * 5, pl.y + Math.sin(pl.angle) * 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const pt of particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(12,18,26,0.72)';
  ctx.beginPath();
  ctx.moveTo(x + 10, y);
  ctx.lineTo(x + w - 10, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 10);
  ctx.lineTo(x + w, y + h - 10);
  ctx.quadraticCurveTo(x + w, y + h, x + w - 10, y + h);
  ctx.lineTo(x + 10, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - 10);
  ctx.lineTo(x, y + 10);
  ctx.quadraticCurveTo(x, y, x + 10, y);
  ctx.fill();
}

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd23f' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = '#7a5b00';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHUD(ctx, world, width, height, toasts, objective) {
  // Money / health / ammo panel, top left.
  panel(ctx, 12, 12, 218, 92);
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${Math.floor(world.player.money)}`, 26, 42);
  ctx.fillStyle = '#fff';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Ammo ${world.player.ammo}   Fares ${world.faresDone}`, 26, 64);
  ctx.fillStyle = '#333';
  ctx.fillRect(26, 74, 190, 12);
  ctx.fillStyle = world.player.health > 40 ? '#4caf50' : '#e63946';
  ctx.fillRect(26, 74, 190 * (world.player.health / 100), 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`HP ${Math.round(world.player.health)}`, 30, 84);
  // Wanted stars, top right.
  panel(ctx, width - 190, 12, 178, 44);
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, width - 168 + i * 32, 34, 11, i < world.wanted);
  }
  // Objective bar, top centre.
  const obj = objective || '';
  if (obj) {
    ctx.font = 'bold 15px sans-serif';
    const w = Math.min(width - 480, ctx.measureText(obj).width + 36);
    panel(ctx, (width - w) / 2, 12, w, 40);
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(obj, width / 2, 37);
  }
  // Toasts under the objective.
  ctx.textAlign = 'center';
  let ty = 66;
  for (const t of toasts) {
    ctx.font = 'bold 15px sans-serif';
    const w = ctx.measureText(t.text).width + 30;
    panel(ctx, (width - w) / 2, ty, w, 32);
    ctx.fillStyle = t.color || '#fff';
    ctx.fillText(t.text, width / 2, ty + 21);
    ty += 38;
  }
  // Controls hint, bottom left.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px sans-serif';
  ctx.fillText('WASD drive/walk · E enter/exit car · Q use shop · F punch · G shoot · Space handbrake · P pause · M mute', 14, height - 14);
  drawMinimap(ctx, world, width, height);
}

export function drawMinimap(ctx, world, width, height) {
  const size = 190;
  const x0 = width - size - 12;
  const y0 = height - size - 12;
  const scale = size / world.city.size;
  panel(ctx, x0 - 6, y0 - 6, size + 12, size + 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  ctx.fillStyle = '#2b3a2b';
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x0, y0 + world.city.beachY * scale, size, size - world.city.beachY * scale);
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(x0, y0 + world.city.waterY * scale, size, size - world.city.waterY * scale);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 3;
  for (const lx of world.city.roadLines) {
    ctx.beginPath();
    ctx.moveTo(x0 + lx * scale, y0);
    ctx.lineTo(x0 + lx * scale, y0 + world.city.beachY * scale);
    ctx.stroke();
  }
  for (const ly of world.city.roadLines) {
    if (ly > 2100) continue;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + ly * scale);
    ctx.lineTo(x0 + size, y0 + ly * scale);
    ctx.stroke();
  }
  // Markers.
  for (const m of world._markers || []) {
    const pulse = 3 + Math.sin(world.time * 5) * 1.5;
    ctx.fillStyle = m.color || '#ffd23f';
    ctx.beginPath();
    ctx.arc(x0 + m.x * scale, y0 + m.y * scale, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police dots.
  ctx.fillStyle = '#ff2e2e';
  for (const car of world.cars) {
    if (car.kind === 'police') {
      ctx.beginPath();
      ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Player arrow.
  const px = x0 + world.player.x * scale;
  const py = y0 + world.player.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(world.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function centerText(ctx, text, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, ctx.canvas.width / 2, y);
}

export function drawTitle(ctx, width, height, best) {
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, width, height);
  // Sun over the bay.
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#ff9e5e');
  g.addColorStop(0.55, '#1b3a5c');
  g.addColorStop(1, '#0d1b2a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.3, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(46,134,171,0.8)';
  ctx.fillRect(0, height * 0.72, width, height * 0.28);
  ctx.fillStyle = 'rgba(232,210,154,0.9)';
  ctx.fillRect(0, height * 0.68, width, height * 0.04);
  centerText(ctx, 'SOLMAR BAY', height * 0.3, 'bold 84px sans-serif', '#fff');
  centerText(ctx, 'A top-down open-world story in one small city', height * 0.3 + 44, '20px sans-serif', '#ffd23f');
  centerText(ctx, 'Carmen has six jobs for you. The last one pays $1,500 — if you live to spend it.', height * 0.44, '17px sans-serif', '#e8e8e8');
  centerText(ctx, 'ENTER — start a new game        C — continue saved game', height * 0.56, 'bold 20px sans-serif', '#fff');
  centerText(ctx, 'WASD move/drive · E enter or jack a car · F punch · G shoot · Space handbrake · P pause · M mute', height * 0.63, '15px sans-serif', '#cfe3ef');
  if (best && best.totalEarned > 0) {
    centerText(ctx, `Last run: $${best.totalEarned} earned · ${best.faresDone} fares · mission ${Math.min(best.missionIndex + 1, 6)}/6`, height * 0.72, '15px sans-serif', '#ffd23f');
  }
  centerText(ctx, '100% offline — no network, no accounts, no downloads', height * 0.9, '13px sans-serif', 'rgba(255,255,255,0.6)');
}

export function drawPaused(ctx, width, height) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, width, height);
  centerText(ctx, 'PAUSED', height * 0.42, 'bold 56px sans-serif', '#fff');
  centerText(ctx, 'P — resume        R — restart the story', height * 0.5, '18px sans-serif', '#ffd23f');
}

export function drawBusted(ctx, width, height, reason, fine) {
  ctx.fillStyle = 'rgba(20,0,0,0.6)';
  ctx.fillRect(0, 0, width, height);
  centerText(ctx, 'BUSTED', height * 0.4, 'bold 64px sans-serif', '#ff5d5d');
  centerText(ctx, reason, height * 0.48, '20px sans-serif', '#fff');
  centerText(ctx, `Fine paid: $${fine} — the mission starts over.`, height * 0.54, '18px sans-serif', '#ffd23f');
  centerText(ctx, 'Press ENTER to get back on the street', height * 0.62, '16px sans-serif', '#e8e8e8');
}

export function drawComplete(ctx, width, height, world) {
  ctx.fillStyle = 'rgba(0,20,8,0.55)';
  ctx.fillRect(0, 0, width, height);
  centerText(ctx, 'STORY COMPLETE', height * 0.36, 'bold 56px sans-serif', '#7ee787');
  centerText(ctx, 'The Big Score is done. Solmar Bay is yours — free roam, cab fares, and the sunset.', height * 0.44, '19px sans-serif', '#fff');
  centerText(ctx, `Total earned: $${Math.round(world.totalEarned)}   ·   Fares done: ${world.faresDone}   ·   Cars jacked: ${world.stats.carsStolen}`, height * 0.52, '18px sans-serif', '#ffd23f');
  centerText(ctx, 'ENTER — keep playing free roam', height * 0.6, '16px sans-serif', '#e8e8e8');
}


