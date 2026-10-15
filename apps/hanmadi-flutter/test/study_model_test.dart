import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hanmadi/api.dart';
import 'package:hanmadi/study_model.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('failed chat preserves draft and history without retry', () async {
    int calls = 0;
    final m = StudyModel(
      StudyApi(
        base: Uri.parse('https://test.example'),
        client: MockClient((_) async {
          calls++;
          return http.Response(
            jsonEncode({'error': '다시 시도해 주세요.'}),
            503,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      ),
    )..chatDraft = 'こんにちは';
    await m.sendChat();
    expect(m.chatDraft, 'こんにちは');
    expect(m.chat, isEmpty);
    expect(m.error, '다시 시도해 주세요.');
    expect(calls, 1);
    expect(m.busy, false);
  });
  test('successful chat commits a pair and ignores stale revisions', () async {
    final m = StudyModel(
      StudyApi(
        base: Uri.parse('https://test.example'),
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'reply': {'text': 'こんにちは', 'meaning': '안녕하세요', 'reading': '콘니치와'},
              'state': {'revision': 2, 'expressions': []},
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      ),
    )..chatDraft = 'こんにちは';
    await m.sendChat();
    expect(m.chatDraft, isEmpty);
    expect(m.chat.length, 2);
    expect(m.state['revision'], 2);
    m.apply({
      'state': {'revision': 1},
    });
    expect(m.state['revision'], 2);
  });
}
