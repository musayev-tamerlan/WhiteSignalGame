# Loop mode

A second way to play The White Signal, built for phones and short sessions. Every attempt lasts until 03:14. When it ends, that attempt is replayed by a past Voss while you try again, so puzzles are solved by cooperating with yourself: one Voss holds a door, another lures a figure away, a third carries the fuse.

Open it from the title menu (**◈ LOOP**). A link with `#loop=<code>` opens a shared level directly, and inside Telegram the game starts in Loop.

## Rules

- The board is a grid; every move (or wait) is one step. Steps count down to 03:14.
- **Close the loop** to record your attempt. All earlier loops replay alongside you from step one. If time runs out, the loop closes on its own.
- Each level allows its intended number of loops plus one spare. **Undo** removes the last recording; **restart** retries the current loop.
- Plates (`a b c`) hold the matching doors (`A B C`) open while anyone stands on them; a door won't close on someone.
- Figures (`< > ^ v`) patrol, turn at obstacles and never enter lamplight (`L`). They chase the nearest Voss they can see in a straight line (4 tiles) and catch anyone they reach or end up next to. A caught echo is gone for the rest of that run — which is how decoys work.
- Fuses (`F`) must all be picked up, by anyone, before the receiver (`R`) works.
- Thin ice (`I`) breaks once someone steps off it.
- Stars: three for the intended loops within two steps of par and no hint; two for the intended loops; one otherwise. Hints show a green path and cap a level at two stars.

## Content

- 10 campaign levels in `src/loop/levels.ts`, each with a designer `plan` for its earlier loops.
- **Signal of the day**: one campaign level in one of eight orientations (rotations and mirrors keep puzzles solvable), the same for everyone, with a streak and a spoiler-free share card.
- **Restore Kestrel**: stars repair five station rooms; each unlocks a story note and a suit colour.
- **Level editor**: paint a grid, set loops and steps, check it, test it, share it as a link.

## Code

| File | What it does |
|---|---|
| `src/loop/engine.ts` | Deterministic simulation (`step`, `replay`) and a breadth-first `solve` used by tests, hints and the editor. |
| `src/loop/levels.ts` | Levels and their designer plans. |
| `src/loop/share.ts` | Daily level, rotations, share links (`#loop=` base64url JSON) and share cards. |
| `src/loop/progress.ts` | Stars, daily streak, restored rooms, suit colours (local storage `the-white-signal:loop`). |
| `src/loop/mode.ts` | Rendering, input (keys, swipe, on-screen pad, gamepad), HUD, panels, hints. |
| `src/loop/editor.ts` | The level editor. |
| `src/loop/telegram.ts` | Telegram Mini App setup and sharing. |

## Adding a level

1. Add a `LevelDef` to `levels.ts`: grid, `loops`, `steps`, and `plan` with `loops - 1` action strings (`U D L R W`) for the earlier loops.
2. Add its name and intro to `src/i18n/ru.ts`.
3. Run `npm test`: it proves the last loop is solvable with your plan and **impossible with fewer loops**, so every level really needs its past selves.
4. In the dev console, `await import('/WhiteSignalGame/scripts/loop-check.js'); await loopCheck()` plays every level with real key events.

Controls: arrows/WASD move along the isometric axes (↗ ↘ ↙ ↖), Space waits, Enter closes the loop, Backspace undoes it, R restarts, H hints. On touch: swipe on the board or use the pad. Gamepad: stick or D-pad to move, A wait, B close loop, Start for the level list.
