import 'dart:async';

import 'package:hanmadi/api.dart';

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hanmadi/audio_service.dart';

class DelayedApi extends StudyApi {
  final started = Completer<void>();
  final result = Completer<({Uint8List bytes, String mimeType})>();
  DelayedApi() : super(base: Uri.parse('https://test.example'));
  @override
  Future<({Uint8List bytes, String mimeType})> speech(
    String text,
    String language,
  ) {
    started.complete();
    return result.future;
  }
}

void main() {
  test(
    'leaving a screen cancels delayed speech before playback begins',
    () async {
      final api = DelayedApi(), audio = AudioService(api);
      final pending = audio.speak('こんにちは', 'ja');
      await api.started.future;
      await audio.stop();
      api.result.complete((bytes: Uint8List(10), mimeType: 'audio/wav'));
      await pending;
      expect(audio.playing, false);
      audio.dispose();
      api.close();
    },
  );

  test('PCM upload has mono 16k WAV header', () {
    final pcm = Uint8List.fromList([1, 2, 3, 4]);
    final wav = pcmToWav(pcm), header = ByteData.sublistView(wav);
    expect(String.fromCharCodes(wav.sublist(0, 4)), 'RIFF');
    expect(String.fromCharCodes(wav.sublist(8, 12)), 'WAVE');
    expect(header.getUint32(24, Endian.little), 16000);
    expect(header.getUint32(40, Endian.little), 4);
    expect(wav.sublist(44), pcm);
  });
}
