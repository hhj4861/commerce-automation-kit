# Hanmadi audio feasibility probe

Offline research tool for local, owned or permitted audio. This is not wired to Hanmadi and does not assign learning scores. It cannot fetch YouTube media, acquire lyrics, separate vocals or determine pronunciation correctness.

## Reproduce

Use Python 3.14 and FFmpeg. Create a local virtual environment and install `requirements.lock.txt` (the exact dependency closure observed on macOS arm64). The shorter requirements file pins the three main research libraries; it is not a full lock. A clean environment/other OS has not been verified.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r tools/hanmadi-audio-proof/requirements.lock.txt
```

Set artifact/cache directories under the user-designated iCloud task folder. Do not place credentials in that folder. Select a new output directory for each run; the runner refuses to replace existing results.

```sh
export PYTHONDONTWRITEBYTECODE=1
export AUDIO_PROOF_OUT='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261015-hanmadi-audio-proof'
export NUMBA_CACHE_DIR="$AUDIO_PROOF_OUT/numba-cache"
.venv/bin/python -m unittest discover -s tools/hanmadi-audio-proof -p 'test_*.py' -v
.venv/bin/python tools/hanmadi-audio-proof/run_proof.py \
  --songs-dir /absolute/path/to/apps/hanmadi/public/study/music \
  --out "$AUDIO_PROOF_OUT/new-run"
```

The runner expects the four `hanmadi-{en,ja,th,es}-morning.mp3` original practice songs. It retains all frame estimates and a summary. Synthetic note/click inputs have known ground truth; the real songs do not have independently annotated vocal pitch/beat ground truth. Their successful analysis proves execution and output generation only.

Single-file analysis:

```sh
.venv/bin/python tools/hanmadi-audio-proof/analyze.py /absolute/path/to/owned.mp3 \
  --out "$AUDIO_PROOF_OUT/new-measurement.json"
```

Local file limit: 20 MiB / 60 seconds; mono 22,050 Hz PCM decoding. The original byte hash and float decoder peak/gain are recorded. Decoder overshoot is uniformly rescaled rather than clipped. A failed invocation is nonzero; the single-file CLI records `status: failed` with an error and exits nonzero on an analysis failure. A failed multi-file run can retain completed partial cases and has no completed summary; use a new directory after correcting the cause.

## Interpretation

- pYIN: frame F0 plus voiced probability, C2–C6 range, 1,024-sample window / 256-sample hop. Voiced probability and the `usable` signal/RMS gate are not correctness or calibrated quality.
- Onset/beat: estimated events and global BPM. They are not word/syllable timings or a rhythmic performance score.
- Mixed tracks may follow instruments, octaves, or low-frequency energy. A pitch track hitting the configured floor is a warning sign, not a validated low vocal.
- Keep raw estimates and unknown states. A useful singing comparison needs an approved melody reference or isolated vocal, input-quality checks, microphone latency/time alignment, octave policy, and singer evaluation. Thai speech tones require a separate task.
- Basic Pitch 1.0.1 was inspected with REA separately. It was not used for this runner and its model inference was not exercised. See the QA report for exact package/evidence hashes and boundaries.

[Measured results and remaining gates](../../docs/qa/20261015-hanmadi-audio-proof.md)
