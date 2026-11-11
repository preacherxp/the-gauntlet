# The Gauntlet

A chess roguelite in three.js. You lead a small army of named pieces across three acts of short fights on small boards, with a deck of spells and a run map to choose your road on.

It ships no asset files. Every mesh, texture, card picture, portrait, sky and sound is made by code when the page loads, and so is the pixel font the interface is written in.

**Play it in a browser:** https://preacherxp.github.io/the-gauntlet/ (desktop or phone).

## Run it

```
npm install
npm start
```

Then open http://127.0.0.1:5173/. The page has to come from a server, because browsers won't load JavaScript modules from a file on disk.

## How a run goes

- **Three acts of five steps.** Each act is its own world and ends in a boss. Each act is a map of linked nodes; you choose your road one step at a time, and only along the links.
- **Small boards.** Fights are on 5×6, 6×6 and, once, 6×7 squares. Later boards have rocks that block the way and aether wells that pay you for standing on them.
- **Take the king to win.** There is no check, castling or en passant. Pawns move one square and become queens on the far row.
- **Your own setup.** Before each fight you arrange your army in your two home rows.
- **Cards.** You open a fight with three cards and draw one more each turn, up to a hand of five. Each turn you get aether, play as many cards as you can pay for, then make one move. There are twenty-two cards: step, shield, freeze, bolt, leap, swap, summon, blink, raise a rock, move twice, borrow a queen's move, turn an enemy pawn, and more.
- **The road.** Plain fights pay gold and a choice of two cards, or 15 more gold if you pass, so keeping the deck lean is a real choice. Elites and bosses offer three cards and a relic, and bosses bring a recruit. There are merchants, camps and strangers on the way.
- **Stakes.** A piece that falls in a fight you win is wounded and sits out the next one. Lose a fight and you lose one of three crowns; lose them all and the run is over.
- **Enemies with habits.** Some bring reinforcements, some move twice every third turn, some start shielded, and the last king does all three.
- **Unlocks.** Beating the first boss unlocks a second warband, and winning a run unlocks a third.

## An army of somebodies

Every piece in your army has a name and one of twelve tempers, and the king has a thirteenth. A temper:

- **bends a rule.** The Bold captures straight ahead, the Cautious can step back, the Restless opens with two squares, the Sly sidesteps, the Ambitious promotes a row early. The Stubborn starts shielded, the Magpie finds gold, the Bookish draws a card, the Furious gains aether, the Lucky is never wounded, the Gentle patches up a fallen comrade, and the Loud brings an extra card.
- **shows on the piece.** Each pawn wears its temper: a crested helm, a saucepan and shield, a streaming headband, a hood, a crown and cape, a horned bucket helm, a beret and a sack of loot, a mortarboard and a book, hair made of fire, a green top hat, a halo, a megaphone. No two are built quite alike, and each stands on a ring of its temper's colour.
- **moves, fights and dies its own way.** The Bold marches and charges head first, then falls like a tree. The Sly sinks into the board and bursts up beneath its victim, and dies in a puff of smoke. The Lucky cartwheels, trips into its enemy, and is knocked clean off the board. The Magpie skips, swoops, and dies in a shower of coins. The Loud jumps big, shouts, and is squashed flat. And so on, for all thirteen.
- **talks.** Pieces speak when the fight starts, when they move, capture, fall and win. Bosses answer back.

Keys: `1` to `5` play a card, `Esc` cancels, `Enter` starts the fight, `M` mutes. Drag to turn the camera, scroll to zoom.

## On a phone

- **Tap** a piece to select it and see what it is, then tap where it should go.
- **Press and hold** any piece to read it without doing anything.
- **Cards** become wide rows with a small icon and the whole description, in a hand you swipe sideways (on its side, a column you swipe up and down). Tap one to play it.
- **Drag** to turn the camera, **pinch** to zoom.
- **Menu** in the top corner holds the map, army, deck, settings and sound.
- It works upright and on its side; the board is framed in the space the interface leaves, and re-framed when the phone turns.

## How the assets are made

| What | How | Where |
|---|---|---|
| Pieces | Five are lathe-turned from hand-written profiles. The knight is an extruded, tapered silhouette | `src/gfx/pieces.js` |
| What each temper wears | Built from primitives on the pawn's head and body | `src/rogue/looks.js` |
| How each temper moves, attacks and dies | Tweened by hand, with particles and sounds at the right moments | `src/rogue/motion.js` |
| Marble, wood, basalt, lava, ice, neon tiles | Painted pixel by pixel from seeded, tiling noise | `src/gfx/textures.js` |
| Sky, stars, floating island, rocks, dust | Shaders and displaced geometry | `src/gfx/environment.js` |
| Reflections | A cube map baked from the sky shader itself | `src/gfx/environment.js` |
| Portraits of pieces | Rendered from the 3D pieces in the current world | `src/gfx/stage.js`, `src/rogue/looks.js` |
| The pixel font | Hand-drawn 5×7 glyphs, assembled into a TrueType file in memory and loaded like a web font | `src/gfx/pixelfont.js` |
| Frames, buttons, crowns, coins, aether, checkboxes, the vignette | Nine-slice frames and small sprites drawn pixel by pixel, published as CSS variables | `src/gfx/pixelui.js` |
| Card pictures, relic badges, map parchment, piece portraits | Drawn at full size, then shrunk, cut to a few shades and dithered into pixel art | `src/rogue/glyphs.js`, `src/gfx/pixelui.js` |
| Shields, ice, rocks, aether wells | Shaders and displaced geometry | `src/rogue/arena.js` |
| Sound effects and music | Web Audio oscillators, filtered noise and a generated reverb. The music is composed as it plays | `src/audio.js` |

## Layout

| Path | What |
|---|---|
| `src/main.js`, `src/ui.js` | Start-up, the frame loop, settings, title and dialogs |
| `src/gfx/` | The renderer, worlds, textures, pieces and effects |
| `src/rogue/rules.js`, `battle.js`, `cards.js` | Board rules and the enemy's search, one fight, and the cards. No graphics |
| `src/rogue/content.js`, `run.js` | Acts, enemy formations, relics, warbands, tempers and events, and the run and its maps |
| `src/rogue/looks.js`, `motion.js` | What each temper looks like, and how it moves, attacks and dies |
| `src/rogue/arena.js`, `screens.js`, `game.js` | The 3D board, the HTML screens (map included), and the controller |
| `tests/` | Rule, run and animation checks that run in Node |
| `tools/shoot.mjs` | Plays the game in headless Chrome by mouse and saves screenshots |

## Checks

```
npm test            # rules, runs, maps and every animation, about a minute
npm run shots       # plays through the game in Chrome, writes screenshots to ./shots
npm run test:e2e    # every screen on eight phones and tablets, with Playwright
```

`npm run test:e2e` uses Playwright (`@playwright/test`, Apache-2.0). It needs Chrome installed, plus WebKit, Safari's engine, which Playwright downloads once: `npx playwright install webkit`. On iPhone SE, 13 and 15 Pro Max, an iPhone 13 on its side, an iPad Mini, a Pixel 7 upright and on its side, and a Galaxy S8, it opens every screen: title, help, settings, warbands, the map, a fight with a full hand of the wordiest cards, a card being cast, two pieces talking at once, a tooltip at the screen's edge, the menu, rewards, the shop, the army, the deck, camp, an event, a boss fight, the retreat dialog and the end of a run. On each it saves a screenshot to `shots/devices/<device>/` (or the folder in `SHOTS`) and fails if text spills out of its frame, runs off the screen or is under 20px; if a box cuts off what it holds; if parts of the interface overlap; if anything to tap is smaller than a finger; or if the board is too small to play on or more than 12% covered. A second test plays a fight by touch on each device.

`npm test` runs two files. `tests/rogue.test.mjs` checks movement on small boards, every card, relic, temper and enemy habit, the maps, and the shop, camp and events. It ends with a bot playing whole runs and prints how often it beat each fight (`--runs=60` for more). `tests/motion.test.mjs` runs every temper's move, attack and death on the real piece meshes and checks that each finishes in the right place, that each looks and moves differently from the others, and how long each takes.

`npm run shots` needs Chrome or Edge; set `CHROME` to its path if it isn't found. Besides screenshots of each screen, it films every temper moving, attacking and dying and lays the frames out on three sheets (`40_move_sheet.png`, `40_attack_sheet.png`, `40_die_sheet.png`), and plays a fight on an emulated touch phone, upright and on its side. `--only=title,run,bosses,motion,mobile,misc` runs part of it. `node tests/font.check.mjs` loads the generated font in Chrome and prints a proof sheet.

## Publishing

`npm run build` writes the playable site to `dist/`: the page, its code, and the parts of three.js it imports. On GitHub, `.github/workflows/pages.yml` does the same on every push to `main` and publishes the result to GitHub Pages.

How hard the game is has only been measured with that bot, which plays its cards at random. It finishes runs and nothing crashes; that says nothing about whether the difficulty is right for a person.

## Licences

The game's code uses [three.js](https://threejs.org) 0.187.0 (MIT), and `puppeteer-core` and `@playwright/test` (both Apache-2.0) only for the screenshot tool and the device checks.
