import { CatalogItem } from '../../core/api/api.types';
import { Check } from '../answer';
import { SessionEngine, shuffled } from './session-engine';

const RIGHT: Check = { verdict: 'correct' };
const WRONG: Check = { verdict: 'wrong' };
const INVALID: Check = { verdict: 'invalid', kind: 'meaningEmpty' };

function items(n: number): CatalogItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `k:${i}`,
    type: 'kanji',
    chars: String(i),
    lesson: 3,
    courseLesson: 3,
    order: i,
    meanings: [`meaning ${i}`],
    readings: ['いち'],
    audio: null,
  }));
}

/** Answers the card shown, and moves on: what the learner does with Enter, twice. */
function answer(e: SessionEngine, res: Check) {
  e.show();
  const card = { id: e.cur?.it.id, part: e.part };
  e.submit('x', res);
  return { ...card, done: e.advance() };
}

describe('SessionEngine', () => {
  it('asks the meaning, then the reading, of the same item', () => {
    const e = new SessionEngine(items(2), 'both', false);
    expect(answer(e, RIGHT)).toEqual({ id: 'k:0', part: 'meaning', done: null });
    const second = answer(e, RIGHT);
    expect(second.id).toBe('k:0');
    expect(second.part).toBe('reading');
    expect(second.done).toEqual({ it: e.done[0].it, wrongM: 0, wrongR: 0 });
    expect(e.show()).toBe(true);
    expect(e.cur?.it.id).toBe('k:1');
  });

  it('brings a missed half back a few cards later, and counts the miss', () => {
    // the lowest random: back in 2 cards
    const e = new SessionEngine(items(4), 'both', false, () => 0);
    expect(answer(e, WRONG)).toMatchObject({ id: 'k:0', part: 'meaning', done: null });
    expect(e.queue.map((q) => q.it.id)).toEqual(['k:1', 'k:2', 'k:0', 'k:3']);
    answer(e, RIGHT); // k:1 meaning
    answer(e, RIGHT); // k:1 reading: done
    expect(e.done.map((d) => d.it.id)).toEqual(['k:1']);
    expect(answer(e, RIGHT)).toMatchObject({ id: 'k:2', part: 'meaning' });
  });

  it('finishes an item only once both halves are right, with its misses', () => {
    const e = new SessionEngine(items(1), 'both', false);
    answer(e, WRONG); // meaning, missed
    answer(e, RIGHT); // meaning again (the only item: straight back)
    answer(e, WRONG); // reading, missed
    const last = answer(e, RIGHT);
    expect(last.done).toMatchObject({ wrongM: 1, wrongR: 1 });
    expect(e.show()).toBe(false);
    expect([e.answered, e.right]).toEqual([4, 2]);
  });

  it('asks one half only when told so', () => {
    const e = new SessionEngine(items(1), 'reading', false);
    const only = answer(e, RIGHT);
    expect(only.part).toBe('reading');
    expect(only.done).not.toBeNull();
  });

  it('changes nothing for an invalid answer', () => {
    const e = new SessionEngine(items(1), 'both', false);
    e.show();
    expect(e.submit('', INVALID)).toBe('invalid');
    expect([e.phase, e.answered, e.cur?.started]).toEqual(['ask', 0, false]);
  });

  it('"My answer was right" takes the miss back', () => {
    const e = new SessionEngine(items(1), 'meaning', false);
    e.show();
    e.submit('numero uno', WRONG);
    e.accept();
    expect([e.verdict, e.right]).toEqual(['correct', 1]);
    expect(e.advance()).toMatchObject({ wrongM: 0 });
  });

  it('wrap-up finishes what was started and takes nothing new', () => {
    const e = new SessionEngine(items(3), 'both', false);
    answer(e, RIGHT); // k:0 meaning: started
    e.show(); // k:0 reading, not answered yet
    expect(e.wrapUp()).toBe('later');
    e.submit('x', RIGHT);
    expect(e.advance()).toMatchObject({ it: { id: 'k:0' } });
    expect(e.queue).toEqual([]);

    const fresh = new SessionEngine(items(2), 'both', false);
    fresh.show();
    expect(fresh.wrapUp(), 'on a card not started: over at once').toBe('finish');
  });

  it('counts the half-answered items, which ending now would not save', () => {
    const e = new SessionEngine(items(2), 'both', false);
    answer(e, RIGHT);
    expect(e.halfAnswered()).toBe(1);
  });

  it('shuffles without losing or doubling anything', () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffled(list);
    expect([...out].sort((a, b) => a - b)).toEqual(list);
  });
});
