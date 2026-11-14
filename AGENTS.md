# Working on The White Signal

Start with [the developer handoff](docs/HANDOFF.md), [the game design](docs/GAME_DESIGN.md), and [the asset guide](docs/ASSETS.md). The game design includes campaign spoilers and puzzle solutions.

- The game is a static Three.js and TypeScript project. Install with `npm ci`, run locally with `npm run dev`, and run `npm test` and `npm run build` before pushing.
- Keep progression and puzzle data in `src/world/story.ts`. Keep walkable bounds, arrival points, and obstacles consistent with the world geometry. Preserve compatibility with existing browser checkpoints when adding milestones.
- Keep puzzle clues readable without audio, and preserve keyboard and touch entry points for interactions.
- The current campaign targets about 30 minutes. Actual pacing needs timed playtests. Check the handoff for the verified scope and suggested next work.
- Pushing `main` triggers the existing GitHub Pages workflow.
