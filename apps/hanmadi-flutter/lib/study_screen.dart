import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'study_model.dart';
import 'audio_service.dart';
import 'models.dart';
import 'widgets.dart';

class StudyTabs extends StatelessWidget {
  final StudyModel m;
  final bool inMusic;
  const StudyTabs({super.key, required this.m, this.inMusic = false});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 22),
    child: Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: soft,
        borderRadius: BorderRadius.circular(19),
      ),
      child: Row(
        children: [
          for (final entry in {
            'conversation': '회화',
            'words': '단어',
            'music': '음악',
          }.entries)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: TextButton(
                  style: TextButton.styleFrom(
                    backgroundColor:
                        (inMusic
                            ? entry.key == 'music'
                            : m.studyMode == entry.key)
                        ? Colors.white
                        : Colors.transparent,
                    foregroundColor:
                        (inMusic
                            ? entry.key == 'music'
                            : m.studyMode == entry.key)
                        ? brand
                        : muted,
                    minimumSize: const Size(0, 46),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(13),
                    ),
                  ),
                  onPressed: m.busy
                      ? null
                      : () {
                          if (entry.key != 'music') m.lastStudyMode = entry.key;
                          m.studyMode = entry.key;
                          m.changed();
                          if (inMusic) context.go('/study');
                        },
                  child: Text(
                    entry.value,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

class StudyScreen extends StatelessWidget {
  final StudyModel m;
  final AudioService audio;
  const StudyScreen({super.key, required this.m, required this.audio});
  @override
  Widget build(BuildContext context) {
    final lessons = m.units
        .where((u) => u.level == m.level && u.scene == m.scene)
        .toList();
    final allLessons = m.units.where((u) => u.level == m.level).toList();
    final selected = lessons.isNotEmpty ? lessons : allLessons;
    return PageBody(
      children: [
        Heading(
          m.studyMode == 'words'
              ? '아는 단어가, 쓰는 단어로'
              : m.studyMode == 'music'
              ? '좋아하는 리듬으로 배우기'
              : '오늘도, 한마디 가까이',
          m.studyMode == 'words'
              ? '뜻을 떠올리고 문장 속에서 익혀요.'
              : m.studyMode == 'music'
              ? '한 줄을 듣고, 단어를 익히고, 대화로 이어가요.'
              : '외운 말이 나의 말이 되는 작은 연습.',
        ),
        StudyTabs(m: m),
        if (m.profile.isEmpty)
          Sheet(
            color: soft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('어디서 시작할까요?', style: sectionTitle),
                const SizedBox(height: 8),
                const Text('먼저 가볍게 시작하고, 설정에서 레벨을 바꿀 수 있어요.'),
                const SizedBox(height: 18),
                Primary(
                  '레벨 1로 시작하기',
                  onPressed: m.busy
                      ? null
                      : () => m.action('assess', {
                          'answers': [0, 0, 0],
                          'confidence': 1,
                          'minutes': 5,
                        }),
                ),
              ],
            ),
          ),
        if (m.profile.isNotEmpty && m.studyMode == 'conversation') ...[
          Row(
            children: [
              const Text('오늘의 회화', style: sectionTitle),
              const Spacer(),
              Text(
                '레벨 ${m.level}',
                style: const TextStyle(color: muted, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 16),
          AppSelect<String>(
            label: '어떤 상황을 연습할까요?',
            value: m.scene,
            choices: {
              for (final scene in objects(m.catalog['scenes']))
                scene['id'] as String: scene['title'] as String,
            },
            onChanged: m.busy
                ? null
                : (v) {
                    m.scene = v;
                    m.changed();
                  },
          ),
          const SizedBox(height: 18),
          if (selected.isEmpty)
            const Sheet(child: Text('자료를 불러오지 못했어요. 다시 불러와 주세요.')),
          for (final unit in selected.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Sheet(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      unit.source == 'admin'
                          ? '검수된 학습 자료'
                          : unit.source == 'music'
                          ? '노래에서 대화로'
                          : '나의 일상 회화',
                      style: const TextStyle(color: brand, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    Text(unit.title, style: sectionTitle),
                    const SizedBox(height: 18),
                    PhraseView(unit.phrases.first, compact: true),
                    const SizedBox(height: 22),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        Primary(
                          '회화 연습하기',
                          onPressed: () => context.go(
                            '/study/lesson/${Uri.encodeComponent(unit.id)}',
                          ),
                        ),
                        ListenButton(
                          phrase: unit.phrases.first,
                          model: m,
                          audio: audio,
                        ),
                      ],
                    ),
                    if (object(m.profile['completedLessons'])[unit.id] != null)
                      const Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: Text(
                          '✓ 학습 완료 · 다시 연습할 수 있어요',
                          style: TextStyle(color: brand, fontSize: 12),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 12),
          Sheet(
            color: soft,
            child: Row(
              children: [
                const Icon(Icons.auto_awesome_outlined, color: brand),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '복습할 표현 ${m.due}개',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const Text(
                        '나의 표현을 다시 꺼내 볼까요?',
                        style: TextStyle(color: muted, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: '보관함에서 복습',
                  onPressed: () => context.go('/library'),
                  icon: const Icon(Icons.arrow_forward_rounded),
                ),
              ],
            ),
          ),
        ],
        if (m.studyMode == 'words') ...[
          if (m.words.isNotEmpty)
            _Pack(
              m: m,
              audio: audio,
              title: '내 단어장 복습',
              description: '직접 저장한 단어 ${m.words.length}개',
              words: m.words,
            ),
          for (final pack in objects(m.catalog['wordPacks']))
            _Pack(
              m: m,
              audio: audio,
              title: pack['title'],
              description: pack['description'],
              words: objects(pack['words']),
            ),
        ],
        if (m.studyMode == 'music') ...[
          for (final song in m.songs)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Sheet(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: soft,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: const Icon(
                            Icons.graphic_eq_rounded,
                            color: brand,
                            size: 30,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(song['title'], style: sectionTitle),
                              const SizedBox(height: 5),
                              Text(
                                song['subtitle'],
                                style: const TextStyle(
                                  color: muted,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Primary(
                      m.progress(song)['index'] != null
                          ? '이어서 연습하기'
                          : '음악으로 시작하기',
                      onPressed: () => context.go(
                        '/study/music/${Uri.encodeComponent(song['id'])}',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (m.songs.isEmpty) const Text('이 언어의 음악을 아직 불러오지 못했어요.'),
          ...m.units
              .where((u) => u.source == 'music' && u.level == m.level)
              .map(
                (u) => Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Sheet(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(
                        Icons.music_note_outlined,
                        color: brand,
                      ),
                      title: Text('Pretender · ${u.title}'),
                      subtitle: const Text('감상을 나누는 오리지널 회화 연습'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go(
                        '/study/lesson/${Uri.encodeComponent(u.id)}',
                      ),
                    ),
                  ),
                ),
              ),
        ],
      ],
    );
  }
}

class _Pack extends StatelessWidget {
  final StudyModel m;
  final AudioService audio;
  final String title, description;
  final List<Json> words;
  const _Pack({
    required this.m,
    required this.audio,
    required this.title,
    required this.description,
    required this.words,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Sheet(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: sectionTitle),
          const SizedBox(height: 8),
          Text(description, style: const TextStyle(color: muted)),
          const SizedBox(height: 18),
          Primary(
            '${words.length}개 단어 연습',
            onPressed: words.isEmpty
                ? null
                : () => showModalBottomSheet(
                    context: context,
                    useSafeArea: true,
                    isScrollControlled: true,
                    builder: (_) =>
                        WordPractice(m: m, audio: audio, words: words),
                  ),
          ),
        ],
      ),
    ),
  );
}

class WordPractice extends StatefulWidget {
  final StudyModel m;
  final AudioService audio;
  final List<Json> words;
  const WordPractice({
    super.key,
    required this.m,
    required this.audio,
    required this.words,
  });
  @override
  State<WordPractice> createState() => _WordPracticeState();
}

class _WordPracticeState extends State<WordPractice> {
  int index = 0;
  String? answer;
  @override
  Widget build(BuildContext context) {
    final word = widget.words[index],
        phrase = Phrase.fromJson(word),
        meanings = widget.words
            .map((e) => e['meaning'] as String)
            .toSet()
            .toList();
    final choices = [
      phrase.meaning,
      ...meanings.where((s) => s != phrase.meaning).take(3),
    ]..sort();
    final correct = answer == phrase.meaning;
    return ListenableBuilder(
      listenable: widget.m,
      builder: (context, _) => Padding(
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    '단어 연습 · ${index + 1}/${widget.words.length}',
                    style: const TextStyle(color: muted),
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: '연습 닫기',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              PhraseView(phrase, reveal: correct),
              ListenButton(
                phrase: phrase,
                model: widget.m,
                audio: widget.audio,
              ),
              const SizedBox(height: 16),
              const Text(
                '어떤 뜻일까요?',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              for (final choice in choices)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                      backgroundColor: answer == choice ? soft : null,
                    ),
                    onPressed: correct
                        ? null
                        : () => setState(() => answer = choice),
                    child: Text(choice),
                  ),
                ),
              if (answer != null)
                Text(
                  correct ? '맞아요! 문장에서도 만나 볼까요?' : '괜찮아요. 다시 골라 보세요.',
                  style: const TextStyle(color: brand),
                ),
              if (correct && word['example'] != null) ...[
                const SizedBox(height: 18),
                PhraseView(
                  Phrase.fromJson(object(word['example'])),
                  compact: true,
                ),
              ],
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                children: [
                  TextButton.icon(
                    onPressed: widget.m.busy
                        ? null
                        : () => widget.m.save(phrase, word: true),
                    icon: const Icon(Icons.bookmark_add_outlined),
                    label: const Text('단어장에 저장'),
                  ),
                  if (correct)
                    Primary(
                      index + 1 == widget.words.length ? '연습 마치기' : '다음 단어',
                      onPressed: widget.m.busy
                          ? null
                          : () async {
                              if (!word['id'].toString().startsWith('word:')) {
                                final r = await widget.m.action('practice', {
                                  'id': word['id'],
                                  'confidence': 'alone',
                                });
                                if (r == null) return;
                              }
                              if (!context.mounted) return;
                              if (index + 1 == widget.words.length) {
                                Navigator.pop(context);
                              } else {
                                setState(() {
                                  index++;
                                  answer = null;
                                });
                              }
                            },
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LessonScreen extends StatefulWidget {
  final StudyModel m;
  final AudioService audio;
  final String id;
  const LessonScreen({
    super.key,
    required this.m,
    required this.audio,
    required this.id,
  });
  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  int index = 0;
  bool reveal = false, done = false;
  String transcript = '';
  @override
  void dispose() {
    widget.audio.stop();
    if (widget.audio.recording) widget.audio.cancelRecording();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final matches = widget.m.units.where((u) => u.id == widget.id);
    if (matches.isEmpty) {
      return const PageBody(children: [Text('자료가 없거나 바뀌었어요. 스터디로 돌아가 주세요.')]);
    }
    final unit = matches.first, phrase = unit.phrases[index];
    return PageBody(
      children: [
        Heading(
          unit.title,
          '레벨 ${unit.level} · ${index + 1}/${unit.phrases.length} 문장',
        ),
        LinearProgressIndicator(
          value: (index + 1) / unit.phrases.length,
          backgroundColor: soft,
        ),
        const SizedBox(height: 28),
        Sheet(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PhraseView(phrase, reveal: reveal),
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                children: [
                  ListenButton(
                    phrase: phrase,
                    model: widget.m,
                    audio: widget.audio,
                  ),
                  TextButton(
                    onPressed: () => setState(() => reveal = !reveal),
                    child: Text(reveal ? '뜻 가리기' : '뜻 확인하기'),
                  ),
                ],
              ),
              const Divider(height: 35),
              const Text(
                '한 번 소리 내어 말해 볼까요?',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  MicButton(
                    audio: widget.audio,
                    model: widget.m,
                    onText: (v) => setState(() => transcript = v),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      transcript.isEmpty
                          ? '마이크를 누르고 말한 뒤, 다시 눌러 마쳐요.'
                          : transcript,
                      style: const TextStyle(color: muted, fontSize: 14),
                    ),
                  ),
                ],
              ),
              if (transcript.isNotEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 10),
                  child: Text(
                    '인식된 문장이에요. 원문과 비교해 보세요.',
                    style: TextStyle(color: muted, fontSize: 12),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 28),
        if (done) ...[
          const Sheet(
            color: soft,
            child: Text('✓ 연습 기록을 저장했어요. 내일 한 번 더 만나 봐요.'),
          ),
          const SizedBox(height: 20),
          Primary('스터디로 돌아가기', onPressed: () => context.go('/study')),
        ] else
          Row(
            children: [
              if (index > 0)
                TextButton(
                  onPressed: () => setState(() {
                    index--;
                    reveal = false;
                    transcript = '';
                  }),
                  child: const Text('이전 문장'),
                ),
              const Spacer(),
              Primary(
                index + 1 < unit.phrases.length ? '다음 문장' : '학습 완료하기',
                onPressed: widget.m.busy
                    ? null
                    : () async {
                        await sound(widget.m, widget.audio.stop);
                        if (index + 1 < unit.phrases.length) {
                          setState(() {
                            index++;
                            reveal = false;
                            transcript = '';
                          });
                        } else {
                          final r = await widget.m.action('completeLesson', {
                            'id': unit.id,
                          });
                          if (r != null && mounted) setState(() => done = true);
                        }
                      },
              ),
            ],
          ),
      ],
    );
  }
}
