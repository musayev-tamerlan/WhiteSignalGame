// Loop mode progress: stars, daily streak, restored station rooms and suit colours.
export interface LoopProgress {
  stars: Record<string, number>;
  daily: { last: number; streak: number; best: Record<string, number> };
  rooms: string[];
  suit: string;
}

export const rooms = [
  { id: 'radio', cost: 3, title: 'Radio room', suit: 'amber', story: 'The radio room hums again. Taped under the desk: “If you hear yourself, answer politely.”' },
  { id: 'generator', cost: 8, title: 'Generators', suit: 'teal', story: 'The generators turn over. Their hum has the same rhythm as the signal: short, short, long.' },
  { id: 'quarters', cost: 14, title: 'Crew quarters', suit: 'crimson', story: 'Seven bunks, all made. Every pillow has the same dent.' },
  { id: 'mast', cost: 20, title: 'Relay mast', suit: 'white', story: 'The mast lights come on in order: red, white, green. Then, faintly, a fourth colour nobody installed.' },
  { id: 'lab', cost: 26, title: 'Borehole lab', suit: 'signal', story: 'The lab log ends mid-sentence: “It doesn’t copy us. We were copying it, the whole time—”' },
] as const;

export const suits: Record<string, string | null> = {
  default: null, amber: '#ffcf99', teal: '#a6f0e2', crimson: '#ffaaa0', white: '#ffffff', signal: '#b7ffd9',
};

const KEY = 'the-white-signal:loop';

export function loadLoopProgress(): LoopProgress {
  const empty: LoopProgress = { stars: {}, daily: { last: 0, streak: 0, best: {} }, rooms: [], suit: 'default' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved || typeof saved !== 'object') return empty;
    const numbers = (value: unknown) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {})
      .filter(([, n]) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 3)) as Record<string, number>;
    return {
      stars: numbers(saved.stars),
      daily: {
        last: Number.isInteger(saved.daily?.last) ? saved.daily.last : 0,
        streak: Number.isInteger(saved.daily?.streak) ? saved.daily.streak : 0,
        best: numbers(saved.daily?.best),
      },
      rooms: Array.isArray(saved.rooms) ? saved.rooms.filter((id: unknown) => rooms.some(room => room.id === id)) : [],
      suit: typeof saved.suit === 'string' && saved.suit in suits ? saved.suit : 'default',
    };
  } catch {
    return empty;
  }
}

export function saveLoopProgress(progress: LoopProgress) {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* Progress lasts the session. */ }
}

export const totalStars = (progress: LoopProgress) => Object.values(progress.stars).reduce((sum, n) => sum + n, 0);

/** Three stars for the intended loops within two steps of par; two for the intended loops; one otherwise. */
export function starsFor(loopsUsed: number, intended: number, steps: number, par: number, hinted: boolean) {
  if (loopsUsed <= intended && steps <= par + 2 && !hinted) return 3;
  if (loopsUsed <= intended) return 2;
  return 1;
}

/** Records today's daily result and returns the updated streak. */
export function recordDaily(progress: LoopProgress, day: number, stars: number) {
  if (progress.daily.last === day) {
    progress.daily.best[String(day)] = Math.max(progress.daily.best[String(day)] ?? 0, stars);
    return progress.daily.streak;
  }
  progress.daily.streak = progress.daily.last === day - 1 ? progress.daily.streak + 1 : 1;
  progress.daily.last = day;
  progress.daily.best[String(day)] = stars;
  return progress.daily.streak;
}
