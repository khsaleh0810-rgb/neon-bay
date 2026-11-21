# Solmar Bay

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/khsaleh0810-rgb/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/khsaleh0810-rgb/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

A top-down 2D open-world crime game set in the original seaside city of Solmar Bay. You are Rook, a driver fresh out of luck, doing jobs for Carmen — the fixer who runs the town from a booth at the marina cafe. Steal cars, run fares, outrun the Solmar PD, and pull off the Big Score.

[Play on make.fun — bounty gta6-01](https://make.fun/bounty/gta6-01)

## How to play

Open `game/index.html` in a desktop browser. No network, no install, no accounts — the whole game is static files and runs offline.

| Key | Action |
| --- | --- |
| WASD / arrows | Walk or drive |
| E | Enter a car, jack a traffic car |
| Q | Use a shop (ammo / respray) |
| F | Punch |
| G | Shoot (uses ammo) |
| Space | Handbrake |
| P | Pause |
| M | Mute |
| Enter | Start / continue |

## The story

Six jobs from Carmen, in order:

1. **Hot Wheels** ($150) — steal any car and deliver it to the garage.
2. **Cab Fare** ($250) — pick up a fare and drop them across town.
3. **Ninety Seconds** ($400) — a package to the north pier in 90 seconds.
4. **Cool Down** ($350) — get a star of heat, then get the car repainted (or lie low until it fades).
5. **Three Crates** ($600) — collect three crates from three corners of the city.
6. **The Big Score** ($1,500) — hold the bank vault for five seconds, then lose a three-star tail.

Finish the story and Solmar Bay stays open: free roam with repeatable cab fares ($60–$120, plus a $25 tip for fast delivery).

## The city

- A seeded 2400×2400 city: roads, blocks, buildings, a beach and a pier.
- Traffic cars and pedestrians with their own routines; jack any car you can reach.
- Wanted level 0–5: police cars chase and ram, foot cops run you down. Get busted and you pay a fine and wake up at the police station.
- Gun shop (ammo $80) and Lick of Paint spray shop (clears heat and repairs your car, $150).
- Money, health and ammo on the HUD, a mission tracker with a GPS arrow and distance, and a live minimap with police dots.
- Progress autosaves every 15 seconds to localStorage; continue from the title screen with C.

## Tech

Vanilla JavaScript ES modules, Canvas 2D, and synthesized WebAudio — zero dependencies, zero network requests. The simulation (`game/src/world.js`, `game/src/missions.js`) is pure logic with no DOM access, so it can be driven headless from Node for testing; the renderer (`game/src/render.js`) only reads state.

Build the entry dossier:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Credits

Built for the make.fun "Make GTA 6" bounty (gta6-01) by [khsaleh0810-rgb](https://github.com/khsaleh0810-rgb). Solmar Bay, Carmen, Rook and the Solmar PD are original creations — nothing here is taken from any commercial game.

---

Play more games and earn on make.fun — my referral code: **nnqh4m6a**

