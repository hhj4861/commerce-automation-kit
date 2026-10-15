import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:app_links/app_links.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';

class ClientSession {
  final StudyApi api;
  final FlutterSecureStorage storage;
  StreamSubscription<Uri>? _links;
  bool _exchanging = false;
  ClientSession(this.api, {this.storage = const FlutterSecureStorage()});
  String random() =>
      base64UrlEncode(List.generate(32, (_) => Random.secure().nextInt(256)))
          .replaceAll('=', '');
  Future<void> initialize(
    Future<void> Function() onLogin,
    void Function(String) onError,
  ) async {
    if (kIsWeb) return;
    api.token = await storage.read(key: 'hanmadi.session');
    _links = AppLinks().uriLinkStream.listen((uri) async {
      if (uri.scheme != 'hanmadi' || uri.host != 'auth' || _exchanging) return;
      _exchanging = true;
      try {
        final raw = await storage.read(key: 'hanmadi.pending');
        if (raw == null) throw ApiError(401, '앱에서 로그인을 다시 시작해 주세요.');
        final pending = jsonDecode(raw) as Map<String, dynamic>;
        if (pending['state'] != uri.queryParameters['state'] ||
            (pending['expires'] as int) <
                DateTime.now().millisecondsSinceEpoch) {
          throw ApiError(401, '로그인 요청이 만료됐어요. 다시 시작해 주세요.');
        }
        final result = await api.json('/api/study/client-auth', {
          'action': 'exchange',
          'code': uri.queryParameters['code'],
          'verifier': pending['verifier'],
          'state': pending['state'],
        });
        api.token = result['token'];
        await storage.write(key: 'hanmadi.session', value: api.token);
        await storage.delete(key: 'hanmadi.pending');
        await onLogin();
      } catch (e) {
        onError(e is ApiError ? e.message : '앱 로그인 연결을 확인해 주세요.');
      } finally {
        _exchanging = false;
      }
    }, onError: (_) => onError('앱 연결을 다시 열어 주세요.'));
  }

  Future<void> login() async {
    var uri = api.url('/study/app-login');
    if (!kIsWeb) {
      final verifier = random(), state = random();
      await storage.write(
        key: 'hanmadi.pending',
        value: jsonEncode({
          'verifier': verifier,
          'state': state,
          'expires': DateTime.now()
              .add(const Duration(minutes: 10))
              .millisecondsSinceEpoch,
        }),
      );
      final challenge = base64UrlEncode(
        sha256.convert(utf8.encode(verifier)).bytes,
      ).replaceAll('=', '');
      uri = uri.replace(
        queryParameters: {'challenge': challenge, 'state': state},
      );
    }
    if (!await launchUrl(
      uri,
      mode: kIsWeb
          ? LaunchMode.platformDefault
          : LaunchMode.externalApplication,
      webOnlyWindowName: '_self',
    )) {
      throw ApiError(0, '로그인 브라우저를 열지 못했어요.');
    }
  }

  Future<void> logout() async {
    await api.json(kIsWeb ? '/api/study/account' : '/api/study/client-auth', {
      'action': 'logout',
    });
    if (!kIsWeb) {
      await storage.delete(key: 'hanmadi.session');
      await storage.delete(key: 'hanmadi.pending');
    }
    api.token = null;
  }

  void dispose() => _links?.cancel();
}
