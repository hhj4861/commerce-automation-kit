import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ModelError, parseEpisode, parseSeries, parseTopicSet } from '../src/core/model.js';
import { fingerprintOf, topicFingerprint } from '../src/core/fingerprint.js';

export const fx = (name: string): any =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('model', () => {
  it('parses fixtures and defaults line verification to unverified', () => {
    const s = parseSeries(fx('series.json'));
    const e = parseEpisode(fx('episode.json'));
    expect(s.characters).toHaveLength(3);
    expect(e.cuts[1]!.lines[0]!.verification.status).toBe('unverified');
  });
  it('rejects ids that are not lowercase-hyphen', () => {
    const s = fx('series.json');
    s.id = 'Bad Id';
    expect(() => parseSeries(s)).toThrow(ModelError);
  });
  it('requires safety.nonGraphic to be literally true', () => {
    const s = fx('series.json');
    s.safety.nonGraphic = false;
    expect(() => parseSeries(s)).toThrow(/safety/);
  });
});

describe('fingerprint', () => {
  it('ignores verification status but changes when text changes', () => {
    const s = parseSeries(fx('series.json'));
    const e = parseEpisode(fx('episode.json'));
    const base = fingerprintOf(s, e);
    const verified = structuredClone(e);
    verified.cuts[1]!.lines[0]!.verification = { status: 'verified', judgeRef: 'r1.json' };
    expect(fingerprintOf(s, verified)).toBe(base);
    const edited = structuredClone(e);
    edited.cuts[1]!.lines[0]!.text = '야, 막내. 돈 내놔.';
    expect(fingerprintOf(s, edited)).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{16}$/);
  });
  it('topic fingerprint ignores verifiedElements and matches the topic set entry', () => {
    const s = parseSeries(fx('series.json'));
    const set = parseTopicSet(fx('topics.json'));
    expect(topicFingerprint(s.topic)).toBe(topicFingerprint(set.topics[0]!));
    const changed = structuredClone(s.topic);
    changed.logline = '다른 로그라인입니다.';
    expect(topicFingerprint(changed)).not.toBe(topicFingerprint(s.topic));
  });
});
