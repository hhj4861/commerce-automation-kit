import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hanmadi/api.dart';
import 'package:hanmadi/app.dart';
import 'package:hanmadi/study_model.dart';

StudyModel fixture() =>
    StudyModel(StudyApi(base: Uri.parse('https://test.example')))
      ..loading = false
      ..loggedIn = true
      ..name = '학습자'
      ..state = {
        'revision': 1,
        'profiles': {
          'ja': {'level': 1},
        },
        'expressions': [],
      }
      ..catalog = {
        'scenes': [
          {'id': 'smalltalk', 'title': '스몰토크'},
        ],
        'units': [
          {
            'id': 'starter:ja:smalltalk:1',
            'title': '처음 만난 사람에게',
            'scene': 'smalltalk',
            'level': 1,
            'source': 'starter',
            'phrases': [
              {'text': 'こんにちは。', 'reading': '콘니치와', 'meaning': '안녕하세요.'},
            ],
          },
        ],
        'wordPacks': [],
        'musicLessons': [
          {
            'word': {'text': 'おはよう', 'meaning': '좋은 아침', 'reading': '오하요오'},
            'note': '아침 인사',
            'situation': '친구 만나기',
            'question': {'text': '元気？', 'meaning': '잘 지내?', 'reading': '겐키'},
            'answer': {'text': '元気です', 'meaning': '잘 지내요', 'reading': '겐키데스'},
          },
        ],
      }
      ..music = {
        'songs': [
          {
            'id': 'morning',
            'language': 'ja',
            'title': '작은 오늘',
            'subtitle': '입문',
            'revision': 'r1',
            'audio': '/test.mp3',
            'lines': [
              {
                'id': 'line-1',
                'text': 'おはよう',
                'meaning': '좋은 아침',
                'reading': '오하요오',
                'startSeconds': 0,
                'endSeconds': 5,
              },
            ],
          },
        ],
        'progress': {
          'morning': {'index': 0, 'practiced': [], 'reviewed': []},
        },
      };
void main() {
  for (final width in [320.0, 390.0, 1440.0]) {
    testWidgets('navigation fits width $width and preserves drafts', (t) async {
      t.view.physicalSize = Size(width, 900);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final m = fixture();
      await t.pumpWidget(HanmadiApp(model: m, initialize: false));
      await t.pumpAndSettle();
      expect(find.text('오늘도, 한마디 가까이'), findsOneWidget);
      await t.tap(find.text('AI 대화').last);
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const Key('chat-input')), 'こんにちは');
      await t.tap(find.text('번역').last);
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const Key('translation-input')), '안녕하세요');
      await t.tap(find.text('보관함').last);
      await t.pumpAndSettle();
      await t.tap(find.text('AI 대화').last);
      await t.pumpAndSettle();
      expect(find.text('こんにちは'), findsOneWidget);
      await t.tap(find.text('번역').last);
      await t.pumpAndSettle();
      expect(find.text('안녕하세요'), findsOneWidget);

      await t.pumpWidget(const SizedBox.shrink());
      m.api.close();
    });
  }
  testWidgets('music returns to previous study mode and retains stage', (
    t,
  ) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final m = fixture();
    await t.pumpWidget(HanmadiApp(model: m, initialize: false));
    await t.pumpAndSettle();
    await t.tap(find.text('단어').first);
    await t.pumpAndSettle();
    await t.tap(find.text('음악').first);
    await t.pumpAndSettle();
    await t.tap(find.text('이어서 연습하기'));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('study-back')), findsOneWidget);
    m.musicSteps['morning'] = 2;
    m.changed();
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('study-back')));
    await t.pumpAndSettle();
    expect(m.studyMode, 'words');
    expect(m.musicSteps['morning'], 2);
    expect(find.text('아는 단어가, 쓰는 단어로'), findsOneWidget);

    await t.pumpWidget(const SizedBox.shrink());
    m.api.close();
  });
}
