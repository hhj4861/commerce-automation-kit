import { describe, expect, it } from 'vitest';
import { GenreError, genreSchema, listGenres, loadGenre } from '../src/core/genre.js';

describe('genre packs', () => {
  it('lists both shipped packs and hides the shared file', () => {
    const ids = listGenres();
    expect(ids).toEqual(expect.arrayContaining(['hidden-master-revenge', 'regression-apocalypse']));
    expect(ids.some((id) => id.startsWith('_'))).toBe(false);
  });
  it('loads regression-apocalypse with five scenario checks', () => {
    const g = loadGenre('regression-apocalypse');
    expect(Object.keys(g.scenarioChecks).sort()).toEqual(['cliffhanger', 'conflict', 'genre', 'hook', 'payoff']);
    expect(g.actionRules.join(' ')).toMatch(/유혈/);
  });
  it('merges shared view-driving elements, fun scores and safety checks', () => {
    const g = loadGenre('hidden-master-revenge');
    expect(Object.keys(g.hookElements)).toEqual(expect.arrayContaining(['strong-conflict', 'hidden-identity', 'sensual-decadence']));
    expect(g.minHookElements).toBe(2);
    expect(g.funChecks.surprise!.levels).toHaveLength(5);
    expect(Object.keys(g.safetyChecks)).toEqual(['sexual-boundary', 'violence-boundary']);
    expect(g.safetyChecks['sexual-boundary']!.fail).toMatch(/minor/);
  });
  it('rejects path-like ids and unknown ids', () => {
    expect(() => loadGenre('../secret')).toThrow(GenreError);
    expect(() => loadGenre('no-such-genre')).toThrow(GenreError);
  });
  it('schema requires three scenario checks and a reachable element minimum', () => {
    const g = structuredClone(loadGenre('hidden-master-revenge'));
    expect(genreSchema.safeParse({ ...g, scenarioChecks: { hook: g.scenarioChecks.hook! } }).success).toBe(false);
    expect(genreSchema.safeParse({ ...g, minHookElements: 99 }).success).toBe(false);
  });
});
