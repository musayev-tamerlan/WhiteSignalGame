import { el } from '../ui';
import type { Puzzle } from '../world/story';

export class Encounter {
  private select?: (choice: number) => void;
  private keys: HTMLButtonElement[] = [];
  private attempt: number[] = [];

  get open() { return !el('puzzle').hidden; }

  show(title: string, hint: string, choices: string[], select: (choice: number) => void) {
    this.select = select;
    el('encounterTitle').textContent = title;
    el('encounterHint').textContent = hint;
    el('sequence').replaceChildren();
    el('puzzleFeedback').textContent = '';
    this.keys = choices.map((choice, index) => {
      const button = document.createElement('button');
      const key = document.createElement('kbd');
      key.textContent = String(index + 1);
      button.append(key, choice);
      button.addEventListener('click', () => this.press(index));
      return button;
    });
    el('choices').replaceChildren(...this.keys);
    el('puzzle').hidden = false;
    this.keys[0]?.focus();
  }

  puzzle(puzzle: Puzzle, sound: (choice: number) => void, solved: () => void) {
    if (puzzle.dial) { this.tune(puzzle, sound, solved); return; }
    this.attempt = [];
    const gauge = () => this.attempt.reduce((value, index) =>
      value + Number(puzzle.choices[index].replace('−', '-')), 3);
    this.show(puzzle.title, puzzle.hint, puzzle.choices, choice => {
      sound(choice);
      const index = this.attempt.length;
      this.attempt.push(choice);
      if (puzzle.feedback === 'prefix' && choice !== puzzle.answer[index]) {
        this.attempt = [];
        this.feedback(puzzle.reject ?? 'The lock rejected that step. Sequence reset.');
      } else if (this.attempt.length === puzzle.answer.length) {
        const correct = puzzle.answer.filter((entry, i) => entry === this.attempt[i]).length;
        if (correct === puzzle.answer.length) {
          this.close();
          solved();
          return;
        }
        const result = puzzle.feedback === 'gauge'
          ? `Final vibration: ${gauge()}. The gauge reset to +3. Check the required sequence.`
          : `${correct} of ${puzzle.answer.length} dials were in the right position. Try again.`;
        this.attempt = [];
        this.feedback(result);
      } else if (puzzle.feedback === 'gauge') this.feedback(`Vibration: ${gauge()}. Enter the next adjustment.`);
      else this.feedback('Enter the next step.');
      const slots = puzzle.answer.map((_, i) => {
        const slot = document.createElement('span');
        slot.textContent = puzzle.choices[this.attempt[i]] ?? '—';
        return slot;
      });
      el('sequence').replaceChildren(...slots);
    });
  }

  /** A dial the player sweeps; static in the feedback line fades near the target. */
  private tune(puzzle: Puzzle, sound: (choice: number) => void, solved: () => void) {
    const dial = puzzle.dial!;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(dial.min);
    slider.max = String(dial.max);
    slider.step = String(dial.step);
    slider.value = String(dial.min);
    slider.className = 'dial';
    slider.setAttribute('aria-label', `Frequency in ${dial.unit}`);
    const readout = document.createElement('span');
    const value = () => Number(slider.value);
    const update = () => {
      readout.textContent = `${value().toFixed(1)} ${dial.unit}`;
      const off = Math.abs(value() - dial.target);
      this.feedback(off < dial.step / 2 ? 'A voice, clear through the static.'
        : off < .5 ? 'Faint words under the static.' : off < 1.5 ? 'Static, with a rhythm in it.' : 'Heavy static.');
    };
    this.show(puzzle.title, puzzle.hint, puzzle.choices, () => {
      sound(0);
      if (Math.abs(value() - dial.target) < dial.step / 2) {
        this.close();
        solved();
      } else this.feedback(`Nothing but static on ${value().toFixed(1)} ${dial.unit}. Keep sweeping.`);
    });
    slider.addEventListener('input', update);
    el('sequence').replaceChildren(slider, readout);
    update();
    slider.focus();
  }

  press(choice: number) {
    if (this.open && this.keys[choice]) this.select?.(choice);
  }

  private feedback(message: string) { el('puzzleFeedback').textContent = message; }

  close() {
    this.select = undefined;
    el('puzzle').hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
  }
}
