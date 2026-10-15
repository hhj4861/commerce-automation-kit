"""Offline feasibility probe. Does not score learners or extract YouTube audio."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import time

import librosa
import numpy as np

SR = 22050
HOP = 256
FRAME = 1024
MAX_SECONDS = 60
MAX_BYTES = 20 * 1024 * 1024


def analyze_samples(samples, sr=SR):
    """Return raw estimates, not calibrated correctness or pronunciation scores."""
    y = np.asarray(samples, dtype=np.float64)
    if sr != SR or y.ndim != 1 or not len(y) or not np.all(np.isfinite(y)):
        raise ValueError('Expected finite, nonempty mono audio at 22050 Hz')
    if len(y) > SR * MAX_SECONDS or np.max(np.abs(y)) > 1.001:
        raise ValueError('Audio exceeds the duration or normalized PCM bounds')
    started = time.perf_counter()
    f0, voiced, probability = librosa.pyin(
        y, sr=SR, fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C6'), frame_length=FRAME,
        hop_length=HOP, center=True, fill_na=np.nan,
    )
    # pYIN can assign a frequency to near-silence. Suppress it explicitly.
    rms = librosa.feature.rms(y=y, frame_length=FRAME, hop_length=HOP)[0]
    valid = voiced & np.isfinite(f0) & (rms > 1e-4)
    f0[~valid] = np.nan
    onset_envelope = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    onset_times = librosa.onset.onset_detect(
        onset_envelope=onset_envelope, sr=SR, hop_length=HOP, units='time',
    )
    tempo, beat_times = librosa.beat.beat_track(
        onset_envelope=onset_envelope, sr=SR, hop_length=HOP, units='time', trim=True,
    )
    pitch = f0[valid]
    return {
        'schema': 'hanmadi-audio-feasibility-v1',
        'durationSeconds': len(y) / SR,
        'elapsedSeconds': time.perf_counter() - started,
        'engine': {
            'pitch': 'librosa.pyin', 'rhythm': 'librosa onset + beat_track',
            'versions': {name: importlib.metadata.version(name)
                         for name in ['librosa', 'numpy', 'scipy', 'numba']},
            'sampleRateHz': SR, 'frameSamples': FRAME, 'hopSamples': HOP,
            'fminHz': float(librosa.note_to_hz('C2')),
            'fmaxHz': float(librosa.note_to_hz('C6')),
            'rmsGate': 1e-4,
        },
        'summary': {
            'frames': len(f0), 'voicedFrames': int(valid.sum()),
            'voicedRatio': float(valid.mean()),
            'medianF0Hz': float(np.median(pitch)) if len(pitch) else None,
            'f0P05Hz': float(np.percentile(pitch, 5)) if len(pitch) else None,
            'f0P95Hz': float(np.percentile(pitch, 95)) if len(pitch) else None,
            'tempoBpm': float(np.asarray(tempo).reshape(-1)[0]),
            'onsets': len(onset_times), 'beats': len(beat_times),
        },
        'pitchFrames': [
            {'seconds': i * HOP / SR,
             'f0Hz': float(f0[i]) if valid[i] else None,
             'voicedProbability': float(probability[i]),
             'usable': bool(valid[i])}
            for i in range(len(f0))
        ],
        'onsetSeconds': onset_times.tolist(),
        'beatSeconds': beat_times.tolist(),
        'limitations': [
            'Voiced probability is not a calibrated correctness score.',
            'A mixed recording does not identify the lead vocal.',
            'Beat/onset times are not lyric or syllable alignment.',
            'No lyric, pronunciation, Thai speech-tone or learner grade is inferred.',
            'No source separation, YouTube audio download or production integration.',
        ],
    }


def normalize_decoded_audio(samples):
    """Float MP3 decoders may overshoot unity; retain gain instead of clipping."""
    y = np.asarray(samples, dtype=np.float64)
    if y.ndim != 1 or not len(y) or not np.all(np.isfinite(y)):
        raise ValueError('Decoded audio must be finite nonempty mono PCM')
    peak = float(np.max(np.abs(y)))
    gain = 1 / max(1.0, peak)
    return y * gain, {'decodedPeak': peak, 'appliedGain': gain}


def analyze_file(path):
    source = Path(path)
    if not source.is_file() or source.stat().st_size > MAX_BYTES:
        raise ValueError('Expected an existing local audio file of at most 20 MiB')
    payload = source.read_bytes()
    # Bound decoded output; detect and reject overlong input rather than truncate.
    decoded = subprocess.run([
        'ffmpeg', '-v', 'error', '-nostdin', '-i', str(source.resolve()),
        '-map', '0:a:0', '-t', str(MAX_SECONDS + 1), '-ac', '1', '-ar', str(SR),
        '-f', 'f32le', 'pipe:1',
    ], check=True, capture_output=True, timeout=30)
    y, normalization = normalize_decoded_audio(np.frombuffer(decoded.stdout, dtype='<f4'))
    result = analyze_samples(y)
    result['normalization'] = normalization
    result['source'] = {'filename': source.name, 'bytes': len(payload),
                        'sha256': hashlib.sha256(payload).hexdigest()}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audio', type=Path)
    parser.add_argument('--out', required=True, type=Path,
                        help='New JSON file under the task artifact directory')
    args = parser.parse_args()
    # Reserve output first: never overwrite a prior measurement.
    with args.out.open('x') as target:
        try:
            result = analyze_file(args.audio)
        except Exception as error:
            json.dump({'status': 'failed', 'error': type(error).__name__,
                       'reason': str(error)}, target, ensure_ascii=False)
            target.write('\n')
            raise
        json.dump(result, target, ensure_ascii=False, allow_nan=False)
        target.write('\n')
    print(json.dumps(result['summary'], allow_nan=False))


if __name__ == '__main__':
    main()
