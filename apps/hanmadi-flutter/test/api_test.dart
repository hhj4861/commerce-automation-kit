import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hanmadi/api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test(
    'server error remains readable and mutations are never retried',
    () async {
      int calls = 0;
      final api = StudyApi(
        base: Uri.parse('https://test.example'),
        client: MockClient((r) async {
          calls++;
          expect(r.headers['authorization'], 'Bearer hm1.test');
          return http.Response(
            jsonEncode({'error': '하루 사용량을 다 썼어요.'}),
            429,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      )..token = 'hm1.test';
      await expectLater(
        api.json('/api/study', {'action': 'chat'}),
        throwsA(
          isA<ApiError>().having((e) => e.message, 'message', '하루 사용량을 다 썼어요.'),
        ),
      );
      expect(calls, 1);
    },
  );
  test('remote cleartext API is rejected', () {
    expect(
      () => StudyApi(base: Uri.parse('http://evil.example')),
      throwsArgumentError,
    );
  });
}
