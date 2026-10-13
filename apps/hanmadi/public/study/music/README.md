# Hanmadi original practice songs

Original lyrics: authored for this Hanmadi task; no commercial song lyrics or artist imitation.
Audio: ElevenLabs official Music API, music_v2, 2026-10-13. Four 32-second vocal songs using the existing Starter plan credits. MP3 44.1 kHz, 128 kbps.

Each line playback window is based on returned word alignment, checked against all four authored lines. An independent transcription check found an extra greeting in the first Thai take; the replacement single-verse take matches all four authored lines exactly. English/Spanish match after removing transcription sound-event annotations; Japanese matches after the phonetic となり / orthographic 隣 normalization. This is not an independent native-speaker pronunciation review. The UI separates singing from pronunciation practice, and warns that Thai melody is not a speech-tone guide.

| Language | File | Duration | SHA-256 |
|---|---|---|---|
| en | hanmadi-en-morning.mp3 | 32.026초 | `26ba9f6b3f056498cc004fe417e1e1f6abbf72fd4d6aa9b4c1d63930cfa83150` |
| ja | hanmadi-ja-morning.mp3 | 32.026초 | `e908d909f9b9af9251ba892c9194e4b188879359b83ec4cc077316be87df296f` |
| th | hanmadi-th-morning.mp3 | 32.026초 | `0d9f90ffa785e1622632f4fbf86e9db2dd4c40a7f7fb6aa7dd930f9102d99a32` |
| es | hanmadi-es-morning.mp3 | 32.026초 | `5e1f19e86768c231b6ef4d23926babba0312b00eea2468c556098f1d91a31575` |

Generation: `scripts/generate-practice-music.py` with a JSON export of `practiceSongs`, an artifact directory, one `--language`, and `--confirm-paid`. No automatic paid retries or overwrites. `--shared-ai` runs the provider request in memory on the existing VM without copying its API key or changing services. See [official composition plan schema](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans).

Thai regeneration uses `--single-verse` to avoid an extra greeting between chunks. Five successful 32-second generations were made; only the four selected final files ship. No native-speaker listening or browser playback review is claimed.
