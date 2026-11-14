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
    this.attempt = [];
    const gauge = () => this.attempt.reduce((value, index) =>
      value + Number(puzzle.choices[index].replace('−', '-')), 3);
    this.show(puzzle.title, puzzle.hint, puzzle.choices, choice => {
      sound(choice);
      const index = this.attempt.length;
      this.attempt.push(choice);
      if (puzzle.feedback === 'prefix' && choice !== puzzle.answer[index]) {
        this.attempt = [];
        this.feedback('The lock rejected that step. Sequence reset.');
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
