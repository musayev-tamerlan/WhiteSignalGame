// Plays every Loop level with real key events: the designer loops, then the
// solver's final loop. Run in the dev console:
//   await import('/WhiteSignalGame/scripts/loop-check.js'); await loopCheck()
window.loopCheck = async () => {
  const { levels } = await import('/WhiteSignalGame/src/loop/levels.ts');
  const { parse, solve } = await import('/WhiteSignalGame/src/loop/engine.ts');
  const { dailyLevel } = await import('/WhiteSignalGame/src/loop/share.ts');
  const ws = window.whiteSignal, L = ws.loop, $ = id => document.getElementById(id);
  const keys = { U: 'ArrowUp', R: 'ArrowRight', D: 'ArrowDown', L: 'ArrowLeft', W: 'Space' };
  const press = code => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    L.frame(.25);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (!L.active) ws.enterLoop();
  const results = [];
  for (const level of [...levels, dailyLevel()]) {
    L.start(level, 'select');
    L.frame(.2);
    for (const loop of level.plan) {
      for (const dir of loop) press(keys[dir]);
      press('Enter');
    }
    const final = solve(parse(level.grid), level.plan, level.steps);
    for (const dir of final) press(keys[dir]);
    await wait(650);
    const won = !$('loopOverlay').hidden && $('loopPanelTitle').dataset.screen === 'win';
    results.push(`${won ? 'PASS' : 'FAIL'} ${level.id} ${won ? document.querySelector('.loop-stars')?.textContent : JSON.stringify(L.state.sim?.vosses)}`);
  }
  return results;
};
