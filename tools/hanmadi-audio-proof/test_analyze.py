"""Known-ground-truth checks; not evidence of mixed-song or singer accuracy."""
import unittest
from unittest.mock import patch
import tempfile
import json
from pathlib import Path
import numpy as np
from analyze import SR, analyze_samples, normalize_decoded_audio, main


def tone(hz, seconds=1):
    t = np.arange(round(SR * seconds)) / SR
    # Fade avoids hard boundaries being interpreted as extra onsets.
    envelope = np.minimum(1, np.minimum(t / .02, (seconds - t) / .02))
    return .25 * np.sin(2 * np.pi * hz * t) * np.maximum(0, envelope)


class AudioProbeTest(unittest.TestCase):
    def test_melody_pitch_and_semitone_shift_match_known_frequencies(self):
        notes = [220, 261.625565, 329.627557, 440]
        for shift in [0, 1]:
            frequencies = np.array(notes) * 2 ** (shift / 12)
            result = analyze_samples(np.concatenate([tone(hz) for hz in frequencies]))
            for i, expected in enumerate(frequencies):
                frames = [f['f0Hz'] for f in result['pitchFrames']
                          if i + .15 <= f['seconds'] <= i + .85 and f['usable']]
                self.assertGreater(len(frames), 35)
                error = 1200 * np.log2(np.array(frames) / expected)
                self.assertLess(float(np.median(np.abs(error))), 20)

    def test_silence_does_not_produce_pitch_or_beats(self):
        result = analyze_samples(np.zeros(SR * 3))
        self.assertEqual(result['summary']['voicedFrames'], 0)
        self.assertIsNone(result['summary']['medianF0Hz'])
        self.assertEqual(result['summary']['beats'], 0)
        self.assertEqual(result['summary']['onsets'], 0)

    def test_regular_clicks_have_expected_tempo_and_onset_timing(self):
        y = np.zeros(SR * 16)
        targets = np.arange(.5, 15.6, .5)
        click = np.hanning(221) * np.cos(2 * np.pi * 1500 * np.arange(221) / SR) * .5
        for seconds in targets:
            start = round(seconds * SR)
            y[start:start + len(click)] += click
        result = analyze_samples(y)
        self.assertLess(abs(result['summary']['tempoBpm'] - 120), 5)
        observed = np.array(result['onsetSeconds'])
        self.assertEqual(len(observed), len(targets))
        self.assertLess(max(min(abs(observed - t)) for t in targets), .05)

    def test_decoder_overshoot_is_rescaled_without_clipping(self):
        original = np.array([0., .6, 1.2, -1.2])
        actual, metadata = normalize_decoded_audio(original)
        np.testing.assert_allclose(actual, [0., .5, 1., -1.])
        self.assertEqual(metadata['decodedPeak'], 1.2)
        self.assertAlmostEqual(metadata['appliedGain'], 1 / 1.2)
        with self.assertRaises(ValueError):
            normalize_decoded_audio(np.array([np.nan]))

    def test_cli_preserves_failure_and_never_overwrites_previous_output(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'failed.json'
            with patch('sys.argv', ['analyze.py', 'owned.mp3', '--out', str(output)]), \
                 patch('analyze.analyze_file', side_effect=ValueError('Invalid audio')):
                with self.assertRaises(ValueError):
                    main()
            failure = output.read_text()
            self.assertEqual(json.loads(failure)['status'], 'failed')
            with patch('sys.argv', ['analyze.py', 'owned.mp3', '--out', str(output)]), \
                 patch('analyze.analyze_file') as analyzer:
                with self.assertRaises(FileExistsError):
                    main()
                analyzer.assert_not_called()
            self.assertEqual(output.read_text(), failure)

    def test_invalid_audio_is_rejected(self):
        for y, sr in [(np.array([]), SR), (np.array([np.nan]), SR),
                      (np.zeros((4, 2)), SR), (np.zeros(4), 16000),
                      (np.array([2.]), SR), (np.zeros(61 * SR), SR)]:
            with self.subTest(shape=y.shape, sr=sr), self.assertRaises(ValueError):
                analyze_samples(y, sr)


if __name__ == '__main__':
    unittest.main()
