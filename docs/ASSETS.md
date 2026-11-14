# Asset guide

The runtime art and audio are generated from source. A fresh clone requires only the Node dependencies in the lockfile.

| Asset | Source |
| --- | --- |
| Isometric buildings, furniture, ice, lighting, prop labels, and snowfall | [levels.ts](../src/world/levels.ts) and [expedition-layout.ts](../src/world/expedition-layout.ts) |
| Scientist sprite frames and shadow | [character.ts](../src/systems/character.ts) |
| Camera composition | [camera.ts](../src/systems/camera.ts) |
| HUD, flashlight, and figure | [ui.ts](../src/ui.ts), [style.css](../src/style.css), and [main.ts](../src/main.ts) |
| Snow crunch, indoor footfalls, wind, and radio tones | [audio.ts](../src/systems/audio.ts) |

The images below are captured from this game. They are visual references for development and are stored outside the runtime asset tree.

- [Expanded station yard](images/expedition-preview.jpg)
- [Station exterior composition](images/station-exterior.jpg)
- [Isometric radio room composition](images/radio-room.jpg)
- [Original side-scrolling prototype](../preview.jpg)

Future production art should include its source files and usage rights. Public runtime assets belong in `public/`; remember the GitHub Pages base path when referencing them.
