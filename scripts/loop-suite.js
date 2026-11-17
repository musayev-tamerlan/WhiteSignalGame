// Interaction checks for Loop mode beyond solving levels. In the dev console:
//   await import('/WhiteSignalGame/scripts/loop-suite.js'); await loopSuite()
window.loopSuite = async () => {
  const { levels } = await import('/WhiteSignalGame/src/loop/levels.ts');
  const { dayNumber } = await import('/WhiteSignalGame/src/loop/share.ts');
  const ws = window.whiteSignal, L = ws.loop, $ = id => document.getElementById(id);
  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
  const keys = { U: 'ArrowUp', R: 'ArrowRight', D: 'ArrowDown', L: 'ArrowLeft', W: 'Space' };
  const press = code => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    L.frame(.25);
  };
  const walk = path => { for (const dir of path) press(keys[dir]); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const level = id => levels.find(item => item.id === id);
  if (!L.active) ws.enterLoop();

  // Level list: locked until the previous level has a star.
  L.progress.stars = {};
  L.show('select');
  const buttons = [...document.querySelectorAll('.loop-levels button')];
  check('only the first level starts unlocked', !buttons[0].disabled && buttons.slice(1).every(button => button.disabled));

  // Restart and undo.
  L.start(level('hold'), 'select'); L.frame(.2);
  walk('RRR'); press('KeyR');
  check('R restarts the current loop', L.state.current === '' && L.state.sim.t === 0);
  walk('RRR'); press('Enter');
  check('Enter closes the loop into an echo', L.state.echoes.length === 1 && L.state.echoes[0] === 'RRR');
  press('Backspace');
  check('Backspace undoes the last loop', L.state.echoes.length === 0);
  press('Enter');
  check('closing without moving is refused', L.state.echoes.length === 0, $('loopMessage').textContent);

  // Running out of time closes the loop on its own; the last loop cannot close.
  // Contact allows one spare loop: the first time-out closes the loop, the second ends it.
  L.start(level('contact'), 'select'); L.frame(.2);
  walk('W'.repeat(10)); await wait(1100); L.frame(.2);
  walk('W'.repeat(10)); await wait(200); L.frame(.2);
  check('time running out on the last loop asks to undo or restart', /no more loops|петель больше нет/i.test($('loopMessage').textContent), $('loopMessage').textContent);
  L.start(level('hold'), 'select'); L.frame(.2);
  walk('LUL' + 'W'.repeat(11)); await wait(1100); L.frame(.2);
  check('time running out closes the loop automatically', L.state.echoes.length === 1);

  // Hints show a path and cap the stars.
  L.start(level('hold'), 'select'); L.frame(.2);
  press('KeyH');
  check('a hint shows a green path', /Hint|Подсказка/.test($('loopMessage').textContent));
  walk('RRR'); press('Enter'); walk('DDDRRRRRR'); await wait(700);
  check('a hinted win gets at most two stars', document.querySelector('.loop-stars')?.textContent === '★★☆');

  // Getting caught restarts the loop and keeps echoes.
  L.start(level('decoy'), 'select'); L.frame(.2);
  walk('URRRRR'); await wait(1100); L.frame(.2);
  check('being caught restarts the current loop', L.state.sim.t === 0 && L.state.echoes.length === 0);

  // An echo used as a decoy gets caught and the message says so.
  L.start(level('decoy'), 'select'); L.frame(.2);
  walk('URRDDDDD'); press('Enter'); walk('WWWWWWWWW');
  check('a caught echo is reported', /echo|эхо/.test($('loopMessage').textContent), $('loopMessage').textContent);

  // Daily signal streak and share.
  L.progress.daily = { last: dayNumber() - 1, streak: 4, best: {} };
  const { dailyLevel } = await import('/WhiteSignalGame/src/loop/share.ts');
  const { parse, solve } = await import('/WhiteSignalGame/src/loop/engine.ts');
  const daily = dailyLevel();
  L.start(daily, 'select'); L.frame(.2);
  for (const loop of daily.plan) { walk(loop); press('Enter'); }
  walk(solve(parse(daily.grid), daily.plan, daily.steps)); await wait(700);
  check('finishing today extends the streak', L.progress.daily.streak === 5 && /5/.test($('loopPanelContent').textContent));
  let shared = '';
  const realWrite = navigator.clipboard?.writeText?.bind(navigator.clipboard);
  const realShare = navigator.share;
  navigator.share = undefined;
  if (navigator.clipboard) navigator.clipboard.writeText = async text => { shared = text; };
  [...$('loopPanelActions').querySelectorAll('button')].find(button => /SHARE|ПОДЕЛИТЬСЯ/.test(button.textContent)).click();
  await wait(100);
  if (navigator.clipboard && realWrite) navigator.clipboard.writeText = realWrite;
  navigator.share = realShare;
  check('the share card names the signal and hides the solution', /THE WHITE SIGNAL/.test(shared) && /🔁/.test(shared) && !/[UDLR]{4}/.test(shared), shared.split('\n')[0]);

  // Station and suits.
  L.progress.stars = Object.fromEntries(levels.map(item => [item.id, 3]));
  L.progress.rooms = [];
  L.show('station');
  const restores = [...document.querySelectorAll('.loop-room button')];
  check('all five rooms can be restored with 30 stars', restores.length === 5 && restores.every(button => !button.disabled));
  restores[0].click();
  check('restoring a room unlocks its suit colour', L.progress.rooms.includes('radio') && [...document.querySelectorAll('.loop-suits button')].length === 2);

  // Shared links reject junk; the editor's share works.
  const { decodeLevel, encodeLevel } = await import('/WhiteSignalGame/src/loop/share.ts');
  check('broken share codes are rejected', decodeLevel('%%%') === undefined && decodeLevel(btoa('{"g":["#"]}')) === undefined);
  check('share codes round-trip', decodeLevel(encodeLevel(level('relay')))?.grid.join() === level('relay').grid.join());

  // Swipes on the board move along the right axes.
  L.start(level('contact'), 'select'); L.frame(.2);
  const viewport = $('viewport');
  const swipe = (dx, dy) => {
    viewport.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 300, bubbles: true }));
    viewport.dispatchEvent(new PointerEvent('pointerup', { clientX: 300 + dx, clientY: 300 + dy, bubbles: true }));
    L.frame(.25);
  };
  swipe(80, 70);
  check('a down-right swipe moves along +x (↘)', L.state.sim.vosses[0].x === 2 && L.state.sim.vosses[0].y === 1);

  // On-screen pad buttons.
  document.querySelector('[data-loop="R"]').click(); L.frame(.25);
  check('the on-screen ↘ button moves', L.state.sim.vosses[0].x === 3);

  // Gamepad: stick moves, A waits.
  const pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
  const realPads = navigator.getGamepads;
  navigator.getGamepads = () => [pad];
  L.start(level('contact'), 'select'); L.frame(.2);
  pad.axes[0] = 1; pad.axes[1] = .9;
  // main polls the pad each frame; mirror that for the manual frames.
  for (let i = 0; i < 2; i++) { ws.pad(); L.frame(.25); }
  pad.axes = [0, 0, 0, 0];
  const moved = L.state.sim.vosses[0].x;
  pad.buttons[0].pressed = true; ws.pad(); L.frame(.25); pad.buttons[0].pressed = false; ws.pad(); L.frame(.25);
  navigator.getGamepads = realPads;
  check('the gamepad stick moves', moved > 1, `x=${moved}`);
  check('gamepad A waits a step', /W$/.test(L.state.current), L.state.current);

  L.progress.stars = {}; L.progress.rooms = []; L.progress.daily = { last: 0, streak: 0, best: {} };
  return results;
};
