# Distribution

The game is a static web app. The same build can ship in four places.

## Web and PWA
`npm run build` and host `dist/` (GitHub Pages already does this from `main`). Browsers can install it as an app and play offline after the first visit.

## Telegram Mini App
The code already supports it (`src/loop/telegram.ts`): when opened from Telegram it loads Telegram's script, expands to full height, starts in Loop, and shares results through Telegram's share sheet.

1. Message **@BotFather** → `/newbot`, pick a name and username.
2. `/newapp` (or *Bot Settings → Configure Mini App*), choose the bot, and set the URL to the deployed game, for example `https://paladium.github.io/WhiteSignalGame/`.
3. Optionally `/setmenubutton` so the bot's menu button opens the game.
4. Share `https://t.me/<bot>/<app>`; the daily signal's share card works from any chat.

The bot token is not needed by the game itself; keep it private.

## App Store and Google Play
Wrap the web build with [Capacitor](https://capacitorjs.com/):

```sh
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "The White Signal" com.example.whitesignal --web-dir dist
npm run build && npx cap add android && npx cap add ios
npx cap sync && npx cap open android   # or ios
```

Android needs Android Studio; iOS needs a Mac with Xcode and an Apple developer account. Use your own bundle id and store accounts.

## What needs a server

Not built yet, because the game has no backend:

- Other players' echoes appearing in your levels, and short radio messages left for others.
- Global leaderboards for the daily signal.
- A community level browser for editor creations (today they travel as links).

A small API with a key-value store would be enough for all three: a few kilobytes per recording, keyed by level and day.
