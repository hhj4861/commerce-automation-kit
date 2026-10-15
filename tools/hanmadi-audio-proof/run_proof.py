"""Retain known-signal and four owned-song measurements in a new directory."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sys

import numpy as np
from analyze import SR, analyze_samples, analyze_file


def tone(hz, seconds=1):
    t = np.arange(round(SR * seconds)) / SR
    fade = np.maximum(0, np.minimum(1, np.minimum(t / .02, (seconds - t) / .02)))
    return .25 * np.sin(2 * np.pi * hz * t) * fade


def save(out, name, y, extra=None):
    result = analyze_samples(y)
    result['source'] = {'kind': 'synthetic', 'float64Sha256': hashlib.sha256(y.tobytes()).hexdigest()}
    if extra:
        result.update(extra)
    (out / (name + '.json')).write_text(json.dumps(result, allow_nan=False))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--songs-dir', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    report = {'environment': {'python': sys.version, 'platform': platform.platform()},
              'synthetic': {}, 'songs': {}, 'limitations': [
                  'Only synthetic notes and clicks have numerical ground truth.',
                  'Four songs have no isolated vocal or independently annotated melody/beat reference.',
                  'This is offline execution evidence, not production E2E or singer-grading validation.',
              ]}
    notes = [220, 261.625565, 329.627557, 440]
    for shift in [0, 1]:
        expected = np.array(notes) * 2 ** (shift / 12)
        name = f'melody-shift-{shift}'
        result = save(args.out, name, np.concatenate([tone(hz) for hz in expected]),
                      {'expectedFrequenciesHz': expected.tolist()})
        metrics = []
        for i, hz in enumerate(expected):
            frames = [f['f0Hz'] for f in result['pitchFrames']
                      if i + .15 <= f['seconds'] <= i + .85 and f['usable']]
            errors = np.abs(1200 * np.log2(np.array(frames) / hz))
            metrics.append({'expectedHz': float(hz), 'usableFrames': len(frames),
                            'medianAbsoluteCents': float(np.median(errors)),
                            'p95AbsoluteCents': float(np.percentile(errors, 95))})
        report['synthetic'][name] = metrics
    targets = np.arange(.5, 15.6, .5)
    clicks = np.zeros(SR * 16)
    click = np.hanning(221) * np.cos(2 * np.pi * 1500 * np.arange(221) / SR) * .5
    for seconds in targets:
        start = round(seconds * SR)
        clicks[start:start + len(click)] += click
    result = save(args.out, 'clicks-120bpm', clicks, {'expectedOnsetSeconds': targets.tolist()})
    onsets = np.array(result['onsetSeconds'])
    report['synthetic']['clicks-120bpm'] = {
        **result['summary'], 'expectedOnsets': len(targets),
        'maxNearestOnsetErrorMs': float(max(min(abs(onsets - t)) for t in targets) * 1000),
    }
    result = save(args.out, 'silence', np.zeros(SR * 3))
    report['synthetic']['silence'] = result['summary']
    # Strong lower instrument + higher target tone: exposes source ambiguity.
    result = save(args.out, 'two-source-mixture', tone(110, 3) + .4 * tone(330, 3),
                  {'componentsHz': [110, 330], 'intendedTargetHz': 330,
                   'note': 'Synthetic source ambiguity, not a vocal-separation benchmark.'})
    report['synthetic']['two-source-mixture'] = result['summary']
    for language in ['en', 'ja', 'th', 'es']:
        result = analyze_file(args.songs_dir / f'hanmadi-{language}-morning.mp3')
        (args.out / (language + '.json')).write_text(json.dumps(result, allow_nan=False))
        report['songs'][language] = {'source': result['source'], 'normalization': result['normalization'], **result['summary']}
        print(language, json.dumps(result['summary']), flush=True)
    (args.out / 'summary.json').write_text(json.dumps(report, indent=2, allow_nan=False))
    print('Retained proof:', args.out / 'summary.json')


if __name__ == '__main__':
    main()
