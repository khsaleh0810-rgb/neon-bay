// Solmar Bay — entry builder. Copies the game and its screenshots into the output
// directory and writes dossier.json there with make.fun's buildDossier, so the
// dossier the scorer sees is exactly the one built from what is handed in.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The output directory defaults to ./out when the variable is not set.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? 'out');

const gameDir = join(repoDir, 'game');
const shotsDir = join(repoDir, 'screenshots');

if (!existsSync(gameDir)) {
  console.error('main.ts: no game/ directory in the repo');
  process.exit(1);
}
if (!existsSync(shotsDir)) {
  console.error('main.ts: no screenshots/ directory in the repo');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);
console.log(`game/ and screenshots/ copied to ${outDir}`);

