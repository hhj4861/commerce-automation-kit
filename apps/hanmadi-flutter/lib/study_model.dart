import 'package:flutter/foundation.dart';

import 'api.dart';
import 'models.dart';

class StudyModel extends ChangeNotifier {
  final StudyApi api;
  StudyModel(this.api);
  bool loading = true, loggedIn = false, busy = false;
  String? error, notice;
  String language = 'ja',
      studyMode = 'conversation',
      lastStudyMode = 'conversation',
      scene = 'smalltalk';
  String name = '', chatDraft = '', translationDraft = '', from = 'auto';
  Json state = {}, catalog = {}, music = {}, translation = {};
  final Map<String, int> musicSteps = {};
  void changed() => notifyListeners();
  final Map<String, List<Json>> _chats = {};
  int _generation = 0;
  List<Json> get chat => _chats.putIfAbsent('$language:$scene', () => []);
  List<StudyUnit> get units =>
      objects(catalog['units']).map(StudyUnit.fromJson).toList();
  List<Json> get expressions =>
      objects(state['expressions'])
          .where((e) => e['language'] == language)
          .toList();
  List<Json> get words => expressions
      .where((e) => e['source'] == 'vocabulary' || e['inVocabulary'] == true)
      .toList();
  Json get profile => object(object(state['profiles'])[language]);
  int get level => profile['level'] as int? ?? 1;
  int get due => expressions
      .where(
        (e) =>
            (e['dueAt'] as num? ?? 0) <= DateTime.now().millisecondsSinceEpoch,
      )
      .length;
  void clearChats() {
    _chats.clear();
  }

  void message(String value) {
    error = value;
    notifyListeners();
  }

  void clearMessage() {
    error = null;
    notice = null;
    notifyListeners();
  }

  void apply(Json result) {
    final next = object(result['state']);
    if (next.isNotEmpty &&
        (next['revision'] as num? ?? 0) >= (state['revision'] as num? ?? 0)) {
      state = next;
    }
  }

  Future<T?> run<T>(Future<T> Function() work) async {
    if (busy) return null;
    busy = true;
    error = null;
    notice = null;
    notifyListeners();
    try {
      return await work();
    } catch (e) {
      error = e is ApiError ? e.message : '연결을 완료하지 못했어요. 다시 시도해 주세요.';
      if (e is ApiError && e.status == 401) loggedIn = false;
      return null;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    final gen = ++_generation;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final result = await api.json('/api/study');
      if (gen != _generation) return;
      state = object(result['state']);
      name = object(result['identity'])['name'] ?? '';
      loggedIn = true;
      language = state['language'] as String? ?? language;
      await loadCatalog(gen);
    } catch (e) {
      if (gen == _generation) {
        error = e is ApiError ? e.message : '학습 자료를 불러오지 못했어요.';
        if (e is ApiError && e.status == 401) loggedIn = false;
      }
    } finally {
      if (gen == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> loadCatalog(int gen) async {
    final lang = language;
    final result = await Future.wait([
      api.json('/api/study/catalog?language=$lang'),
      api.json('/api/study/practice-music'),
    ]);
    if (gen != _generation || lang != language) return;
    catalog = result[0];
    music = result[1];
  }

  Future<void> changeLanguage(String value) async {
    if (value == language || busy) return;
    await run(() async {
      final r = await api.json('/api/study', {
        'action': 'settings',
        'language': value,
      });
      apply(r);
      language = value;
      catalog = {};
      translation = {};
      chatDraft = '';
      translationDraft = '';
      await loadCatalog(++_generation);
      return true;
    });
  }

  Future<Json?> action(String action, [Json extra = const {}]) => run(() async {
    final result = await api.json('/api/study', {
      'action': action,
      'language': language,
      ...extra,
    });
    apply(result);
    return result;
  });
  Future<bool> save(Phrase phrase, {bool word = false}) async {
    final r = await action(word ? 'save-word' : 'save-chat', {
      'phrase': phrase.toJson(),
    });
    if (r == null) return false;
    notice = r['saved'] == true
        ? (word ? '단어장에 저장했어요.' : '내 표현에 저장했어요.')
        : '이미 저장했거나 저장할 수 없는 표현이에요.';
    notifyListeners();
    return r['saved'] == true;
  }

  Future<void> sendChat() async {
    final text = chatDraft.trim();
    if (text.isEmpty || text.length > 2000 || busy) return;
    final history = chat,
        previous = history.length > 16
            ? history.sublist(history.length - 16)
            : List<Json>.from(history);
    final messages = [
      ...previous.map((e) => {'role': e['role'], 'content': e['content']}),
      {'role': 'user', 'content': text},
    ];
    final result = await run(() async {
      final r = await api.json('/api/study', {
        'action': 'chat',
        'language': language,
        'scene': scene,
        'messages': messages,
        'selection': 'default',
      });
      apply(r);
      return r;
    });
    if (result != null) {
      history.add({'role': 'user', 'content': text});
      final reply = object(result['reply']);
      history.add({
        'role': 'assistant',
        'content': reply['text'],
        'phrase': reply,
      });
      if (chatDraft.trim() == text) chatDraft = '';
      notifyListeners();
    }
  }

  Future<void> translate() async {
    final text = translationDraft.trim();
    if (text.isEmpty || text.length > 1000) return;
    final r = await action('translate', {
      'text': text,
      'from': from,
      'shareForLearning': false,
    });
    if (r != null) {
      translation = {...r, 'input': text};
      notifyListeners();
    }
  }

  List<Json> get songs =>
      objects(music['songs']).where((s) => s['language'] == language).toList();
  Json progress(Json song) => object(object(music['progress'])[song['id']]);
  Future<Json?> songAction(
    Json song,
    int index,
    String action, [
    Json extra = const {},
  ]) => run(() async {
    final r = await api.json('/api/study/practice-music', {
      'trackId': song['id'],
      'revision': song['revision'],
      'index': index,
      'action': action,
      ...extra,
    });
    if (r['progress'] != null) {
      music['progress'] = {
        ...object(music['progress']),
        song['id']: r['progress'],
      };
    }
    apply(r);
    if (r['saved'] != null) {
      notice = r['saved'] == true ? '보관함에 저장했어요.' : '이미 저장했거나 저장할 수 없는 표현이에요.';
    }
    return r;
  });
}
