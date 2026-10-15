import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'models.dart';

class ApiError implements Exception {
  final int status;
  final String message;
  ApiError(this.status, this.message);
  @override
  String toString() => message;
}

class StudyApi {
  final http.Client client;
  final Uri base;
  String? token;
  StudyApi({http.Client? client, Uri? base})
    : client = client ?? http.Client(),
      base =
          base ??
          (kIsWeb
              ? Uri.parse(Uri.base.origin)
              : Uri.parse(
                  const String.fromEnvironment(
                    'HANMADI_API_ORIGIN',
                    defaultValue: 'https://hanmadi-lake.vercel.app',
                  ),
                )) {
    if (this.base.scheme != 'https' &&
        !(this.base.scheme == 'http' &&
            ['localhost', '127.0.0.1', '10.0.2.2'].contains(this.base.host))) {
      throw ArgumentError('API 주소는 HTTPS여야 합니다.');
    }
  }
  Uri url(String path) => base.resolve(path);
  Map<String, String> get headers => {
    if (token != null) 'Authorization': 'Bearer $token',
  };
  Future<http.Response> request(String path, [Json? body]) async {
    try {
      final response =
          await (body == null
                  ? client.get(url(path), headers: headers)
                  : client.post(
                      url(path),
                      headers: {...headers, 'Content-Type': 'application/json'},
                      body: jsonEncode(body),
                    ))
              .timeout(const Duration(seconds: 100));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        String message = '연결을 확인하고 다시 시도해 주세요.';
        try {
          message =
              object(jsonDecode(utf8.decode(response.bodyBytes)))['error']
                  as String? ??
              message;
        } catch (_) {}
        throw ApiError(response.statusCode, message);
      }
      return response;
    } on TimeoutException {
      throw ApiError(0, '응답이 늦어지고 있어요. 결과를 새로 확인한 뒤 다시 시도해 주세요.');
    } on http.ClientException {
      throw ApiError(0, '인터넷 연결을 확인해 주세요. 입력한 내용은 유지돼요.');
    }
  }

  Future<Json> json(String path, [Json? body]) async {
    final r = await request(path, body);
    try {
      return object(jsonDecode(utf8.decode(r.bodyBytes)));
    } catch (_) {
      throw ApiError(502, '응답을 확인하지 못했어요. 다시 불러와 주세요.');
    }
  }

  Future<({Uint8List bytes, String mimeType})> speech(
    String text,
    String language,
  ) async {
    final response = await request('/api/study/audio', {
      'text': text,
      'language': language,
    });
    return (
      bytes: response.bodyBytes,
      mimeType:
          response.headers['content-type']?.split(';').first ?? 'audio/mpeg',
    );
  }

  Future<String> transcribe(Uint8List bytes, String language) async {
    final req = http.MultipartRequest('POST', url('/api/study/audio'))
      ..headers.addAll(headers)
      ..fields['language'] = language
      ..files.add(
        http.MultipartFile.fromBytes('file', bytes, filename: 'speech.wav'),
      );
    try {
      final r = await http.Response.fromStream(
        await client.send(req).timeout(const Duration(seconds: 90)),
      );
      final j = object(jsonDecode(utf8.decode(r.bodyBytes)));
      if (r.statusCode != 200) {
        throw ApiError(r.statusCode, j['error'] ?? '음성을 읽지 못했어요.');
      }
      return j['text'] as String? ?? '';
    } on TimeoutException {
      throw ApiError(0, '음성 연결이 지연돼요. 다시 녹음해 주세요.');
    }
  }

  void close() => client.close();
}
