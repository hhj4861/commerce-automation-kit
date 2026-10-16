import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hanmadi/tools_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hanmadi/api.dart';
import 'package:hanmadi/app.dart';
import 'package:hanmadi/study_model.dart';
import 'package:hanmadi/widgets.dart';

StudyModel fixture([StudyApi? api]) =>
    StudyModel(api ?? StudyApi(base: Uri.parse('https://test.example')))
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
  testWidgets('all four menus share friendly typography at large text size', (
    t,
  ) async {
    t.view.physicalSize = const Size(320, 800);
    t.view.devicePixelRatio = 1;
    t.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    await t.pumpWidget(HanmadiApp(model: fixture(), initialize: false));
    await t.pumpAndSettle();
    for (final label in ['스터디', 'AI 대화', '번역', '보관함']) {
      await t.tap(find.text(label).last);
      await t.pumpAndSettle();
      if (label == '스터디') {
        expect(find.byType(Heading), findsNothing);
        expect(find.text('처음 만난 사람에게'), findsOneWidget);
        expect(t.takeException(), isNull);
        continue;
      }
      final heading = t.widget<Text>(
        find
            .descendant(
              of: find.byType(Heading).first,
              matching: find.byType(Text),
            )
            .first,
      );
      expect(heading.style!.fontFamily, 'Jua');
      expect(heading.style!.letterSpacing, 0);
      expect(heading.style!.fontSize, 25);
      expect(t.takeException(), isNull, reason: label);
    }
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a new AI reply is brought into view after layout', (t) async {
    t.view.physicalSize = const Size(390, 700);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final api = StudyApi(
      base: Uri.parse('https://test.example'),
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'reply': {
              'text': List.filled(24, 'こんにちは。').join(),
              'reading': '콘니치와',
              'meaning': '안녕하세요.',
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      ),
    );
    final m = fixture(api);
    await t.pumpWidget(HanmadiApp(model: m, initialize: false));
    await t.pumpAndSettle();
    await t.tap(find.text('AI 대화').last);
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const Key('chat-input')), 'こんにちは');
    await t.pump();
    await t.tap(find.byKey(const Key('chat-send')));
    await t.pumpAndSettle();
    await t.pump(const Duration(milliseconds: 300));
    await t.pumpAndSettle();
    final list = find
        .descendant(
          of: find.byType(ChatScreen),
          matching: find.byType(Scrollable),
        )
        .first;
    expect(m.chat.length, 2);
    final position = t.state<ScrollableState>(list).position;
    expect(position.maxScrollExtent, greaterThan(0));
    expect(position.pixels, closeTo(position.maxScrollExtent, 1));
    await t.pumpWidget(const SizedBox.shrink());
    api.close();
  });

  for (final width in [320.0, 390.0, 1440.0]) {
    testWidgets('navigation fits width $width and preserves drafts', (t) async {
      t.view.physicalSize = Size(width, 900);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final m = fixture();
      await t.pumpWidget(HanmadiApp(model: m, initialize: false));
      await t.pumpAndSettle();
      expect(find.text('처음 만난 사람에게'), findsOneWidget);
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
    expect(find.text('연습할 단어가 아직 없어요. 번역이나 대화에서 단어를 저장해 보세요.'), findsOneWidget);

    await t.pumpWidget(const SizedBox.shrink());
    m.api.close();
  });
}
