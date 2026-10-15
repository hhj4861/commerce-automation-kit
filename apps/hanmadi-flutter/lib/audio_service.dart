import 'dart:typed_data' show BytesBuilder;
import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:record/record.dart';

import 'api.dart';

Uint8List pcmToWav(Uint8List pcm) {
  final bytes = Uint8List(44 + pcm.length), d = ByteData.sublistView(bytes);
  void text(int at, String v) => bytes.setRange(at, at + v.length, v.codeUnits);
  text(0, 'RIFF');
  d.setUint32(4, 36 + pcm.length, Endian.little);
  text(8, 'WAVE');
  text(12, 'fmt ');
  d.setUint32(16, 16, Endian.little);
  d.setUint16(20, 1, Endian.little);
  d.setUint16(22, 1, Endian.little);
  d.setUint32(24, 16000, Endian.little);
  d.setUint32(28, 32000, Endian.little);
  d.setUint16(32, 2, Endian.little);
  d.setUint16(34, 16, Endian.little);
  text(36, 'data');
  d.setUint32(40, pcm.length, Endian.little);
  bytes.setRange(44, bytes.length, pcm);
  return bytes;
}

class AudioService extends ChangeNotifier {
  final StudyApi api;
  AudioPlayer? _audioPlayer;
  AudioPlayer get _player => _audioPlayer ??= AudioPlayer();
  AudioRecorder? _audioRecorder;
  AudioRecorder get _recorder => _audioRecorder ??= AudioRecorder();
  StreamSubscription<Uint8List>? _recording;
  StreamSubscription<Duration>? _position;
  Timer? _limit;
  BytesBuilder? _pcm;
  bool recording = false, playing = false, _disposed = false;
  int _generation = 0;
  void update() {
    if (!_disposed) notifyListeners();
  }

  AudioService(this.api);
  Future<void> stop() async {
    _generation++;
    if (_disposed) return;
    await _audioPlayer?.stop();
    await _position?.cancel();
    _position = null;
    playing = false;
    update();
  }

  Future<void> speak(String text, String language) async {
    await stop();
    final generation = _generation;
    final bytes = await api.speech(text, language);
    if (_disposed || generation != _generation) return;
    await _player.play(BytesSource(bytes.bytes, mimeType: bytes.mimeType));
    playing = true;
    update();
  }

  Future<void> segment(String path, num start, num end) async {
    await stop();
    await _player.play(
      UrlSource(api.url(path).toString()),
      position: Duration(milliseconds: (start * 1000).round()),
    );
    playing = true;
    update();
    _position = _player.onPositionChanged.listen((p) {
      if (p.inMilliseconds >= end * 1000) unawaited(stop());
    });
  }

  Future<void> startRecording(void Function() onLimit) async {
    await stop();
    if (!await _recorder.hasPermission()) {
      throw ApiError(0, '마이크 사용을 허용해 주세요. 텍스트로도 연습할 수 있어요.');
    }
    _pcm = BytesBuilder();
    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
      ),
    );
    _recording = stream.listen((data) {
      if ((_pcm?.length ?? 0) < 16000 * 2 * 55) _pcm?.add(data);
    });
    recording = true;
    update();
    _limit = Timer(const Duration(seconds: 50), onLimit);
  }

  Future<String> finishRecording(String language) async {
    _limit?.cancel();
    await _recorder.stop();
    await _recording?.cancel();
    recording = false;
    update();
    final pcm = _pcm?.takeBytes() ?? Uint8List(0);
    _pcm = null;
    if (pcm.length < 3200) throw ApiError(0, '조금 더 길게 말해 주세요.');
    return api.transcribe(pcmToWav(pcm), language);
  }

  Future<void> cancelRecording() async {
    if (_disposed) return;
    _limit?.cancel();
    await _recorder.cancel();
    await _recording?.cancel();
    _pcm = null;
    recording = false;
    update();
  }

  @override
  void dispose() {
    _disposed = true;
    _limit?.cancel();
    _position?.cancel();
    _recording?.cancel();
    _audioPlayer?.dispose();
    _audioRecorder?.dispose();
    super.dispose();
  }
}
