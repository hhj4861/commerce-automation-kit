typedef Json = Map<String, dynamic>;
Json object(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : {};
List<Json> objects(dynamic v) => v is List ? v.map(object).toList() : [];

class Phrase {
  final String text, reading, meaning;
  const Phrase(this.text, this.reading, this.meaning);
  factory Phrase.fromJson(Json j) => Phrase(
    j['text'] as String? ?? '',
    j['reading'] as String? ?? '',
    j['meaning'] as String? ?? '',
  );
  Json toJson() => {'text': text, 'reading': reading, 'meaning': meaning};
}

class StudyUnit {
  final String id, title, scene, source;
  final int level;
  final List<Phrase> phrases;
  StudyUnit.fromJson(Json j)
    : id = j['id'],
      title = j['title'],
      scene = j['scene'],
      source = j['source'],
      level = j['level'],
      phrases = objects(j['phrases']).map(Phrase.fromJson).toList();
}

const languageNames = {'ja': '일본어', 'en': '영어', 'th': '태국어', 'es': '스페인어'};
const levelNames = ['한마디 시작', '짧은 문답', '대화 이어가기', '자연스럽게'];
