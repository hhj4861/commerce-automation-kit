import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hanmadi/audio_service.dart';
import 'package:hanmadi/models.dart';
import 'package:hanmadi/study_model.dart';
import 'package:hanmadi/study_screen.dart';
import 'package:hanmadi/study_widgets.dart';
import 'package:hanmadi/widgets.dart';

import 'widget_test.dart' show fixture;

class TestAudio extends AudioService {
  final List<double> rates = [];
  TestAudio(super.api);
  @override
  Future<void> speak(String text, String language, {double rate = 1}) async {
    rates.add(rate);
  }
}

Widget screen(StudyModel m, AudioService audio) => MaterialApp(
  theme: hanmadiTheme(),
  home: Scaffold(
    body: ListenableBuilder(
      listenable: m,
      builder: (_, _) => StudyScreen(m: m, audio: audio),
    ),
  ),
);

void addPacks(StudyModel m) {
  m.catalog['wordPacks'] = [
    {
      'id': 'cafe',
      'title': '카페에서 주문할 때',
      'words': [
        {
          'id': 'word:ja:cafe:0',
          'text': 'コーヒー',
          'reading': '코오히이',
          'meaning': '커피',
          'example': {
            'text': 'コーヒーをください。',
            'reading': '코오히이오 쿠다사이',
            'meaning': '커피 주세요.',
          },
        },
        {'id': 'word:ja:cafe:1', 'text': '水', 'reading': '미즈', 'meaning': '물'},
      ],
    },
    {
      'id': 'travel',
      'title': '낯선 길을 찾을 때',
      'words': [
        {
          'id': 'word:ja:travel:0',
          'text': '駅',
          'reading': '에키',
          'meaning': '역',
        },
      ],
    },
  ];
}

void main() {
  for (final width in [320.0, 390.0, 1440.0]) {
    testWidgets('study cards fit width $width with large text and no filler', (
      t,
    ) async {
      t.view.physicalSize = Size(width, 1000);
      t.view.devicePixelRatio = 1;
      t.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      final m = fixture();
      addPacks(m);
      final audio = TestAudio(m.api);
      await t.pumpWidget(screen(m, audio));
      await t.pumpAndSettle();
      expect(find.text('오늘도, 한마디 가까이'), findsNothing);
      expect(find.text('오늘의 회화'), findsNothing);
      expect(find.byType(StudyPhrase), findsOneWidget);
      expect(
        find.byType(Image),
        findsNothing,
        reason: 'No coffee for small talk',
      );
      expect(find.text('레벨 1'), findsOneWidget);
      expect(t.takeException(), isNull);
      await t.tap(find.text('단어').first);
      await t.pumpAndSettle();
      expect(find.text('コーヒー'), findsOneWidget);
      expect(find.text('커피 주세요.'), findsOneWidget);
      expect(find.text('2개 단어'), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
      expect(find.text('이렇게 말해요'), findsNothing);
      expect(t.takeException(), isNull);
      await t.pumpWidget(const SizedBox.shrink());
      audio.dispose();
      m.api.close();
    });
  }

  testWidgets('original text is readable once in semantics with its language', (
    t,
  ) async {
    final semantics = t.ensureSemantics();
    final m = fixture();
    final audio = TestAudio(m.api);
    await t.pumpWidget(screen(m, audio));
    await t.pumpAndSettle();
    final original = find.bySemanticsLabel('こんにちは。');
    expect(original, findsOneWidget);
    final data = t.getSemantics(original).getSemanticsData();
    expect(data.label, 'こんにちは。');
    expect(data.locale, const Locale('ja'));
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PhraseView(
            const Phrase('こんにちは。', '콘니치와', '숨긴 뜻'),
            reveal: false,
            language: 'ja',
          ),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.bySemanticsLabel('こんにちは。'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('숨긴 뜻')), findsNothing);
    expect(
      find.byType(SelectableText),
      findsOneWidget,
      reason: 'Selection and copy remain available',
    );
    await t.pumpWidget(const SizedBox.shrink());
    semantics.dispose();
    audio.dispose();
    m.api.close();
  });

  testWidgets('word pack choice changes preview and survives study tabs', (
    t,
  ) async {
    final m = fixture();
    addPacks(m);
    m.studyMode = 'words';
    final audio = TestAudio(m.api);
    await t.pumpWidget(screen(m, audio));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('select-단어 묶음')));
    await t.pumpAndSettle();
    await t.tap(find.text('낯선 길을 찾을 때').last);
    await t.pumpAndSettle();
    expect(find.text('駅'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    await t.tap(find.text('회화').first);
    await t.pumpAndSettle();
    await t.tap(find.text('단어').first);
    await t.pumpAndSettle();
    expect(find.text('駅'), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
    audio.dispose();
    m.api.close();
  });

  testWidgets('word practice still answers, advances and closes', (t) async {
    final m = fixture();
    addPacks(m);
    m.studyMode = 'words';
    final audio = TestAudio(m.api);
    await t.pumpWidget(screen(m, audio));
    await t.pumpAndSettle();
    final start = find.text('단어 연습하기');
    await t.ensureVisible(start);
    await t.tap(start);
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(OutlinedButton, '커피'));
    await t.pumpAndSettle();
    expect(find.text('맞아요! 문장에서도 만나 볼까요?'), findsOneWidget);
    await t.ensureVisible(find.text('다음 단어'));
    await t.tap(find.text('다음 단어'));
    await t.pumpAndSettle();
    expect(find.text('단어 연습 · 2/2'), findsOneWidget);
    await t.tap(find.widgetWithText(OutlinedButton, '물'));
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('연습 마치기'));
    await t.tap(find.text('연습 마치기'));
    await t.pumpAndSettle();
    expect(find.byType(WordPractice), findsNothing);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
    audio.dispose();
    m.api.close();
  });

  testWidgets('slow and regular listening use distinct playback rates', (
    t,
  ) async {
    final m = fixture();
    final audio = TestAudio(m.api);
    await t.pumpWidget(screen(m, audio));
    await t.pumpAndSettle();
    await t.tap(find.text('천천히 듣기'));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('듣기'));
    await t.pumpAndSettle();
    expect(audio.rates, [.8, 1]);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
    audio.dispose();
    m.api.close();
  });
}
