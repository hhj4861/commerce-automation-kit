import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'study_model.dart';
import 'audio_service.dart';
import 'models.dart';
import 'widgets.dart';
import 'study_widgets.dart';

class StudyTabs extends StatelessWidget {
  final StudyModel m;
  final bool inMusic;
  const StudyTabs({super.key, required this.m, this.inMusic = false});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: outline, width: .7)),
      ),
      child: Row(
        children: [
          for (final entry in {
            'conversation': '회화',
            'words': '단어',
            'music': '음악',
          }.entries)
            Expanded(
              child: Semantics(
                selected: inMusic
                    ? entry.key == 'music'
                    : m.studyMode == entry.key,
                child: TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor:
                        (inMusic
                            ? entry.key == 'music'
                            : m.studyMode == entry.key)
                        ? brand
                        : muted,
                    minimumSize: const Size(0, 52),
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
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
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        child: Text(
                          entry.value,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      Container(
                        height: 3,
                        margin: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color:
                              (inMusic
                                  ? entry.key == 'music'
                                  : m.studyMode == entry.key)
                              ? brand
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

class StudyScreen extends StatefulWidget {
  final StudyModel m;
  final AudioService audio;
  const StudyScreen({super.key, required this.m, required this.audio});
  @override
  State<StudyScreen> createState() => _StudyScreenState();
}

class _StudyScreenState extends State<StudyScreen> {
  StudyModel get m => widget.m;
  AudioService get audio => widget.audio;
  String? wordPackId;

  @override
  Widget build(BuildContext context) {
    final lessons = m.units
        .where((u) => u.level == m.level && u.scene == m.scene)
        .toList();
    final allLessons = m.units.where((u) => u.level == m.level).toList();
    final selected = lessons.isNotEmpty ? lessons : allLessons;
    return PageBody(
      children: [
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
          StudyControlRow<String>(
            label: '어떤 상황을 연습할까요?',
            value: m.scene,
            choices: {
              for (final scene in objects(m.catalog['scenes']))
                scene['id'] as String: scene['title'] as String,
            },
            detail: '레벨 ${m.level}',
            onChanged: m.busy
                ? null
                : (v) {
                    m.scene = v;
                    m.changed();
                  },
          ),
          if (selected.isEmpty)
            const Sheet(child: Text('자료를 불러오지 못했어요. 다시 불러와 주세요.')),
          for (final unit in selected.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  LearningSurface(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Semantics(
                              header: true,
                              child: Text(unit.title, style: sectionTitle),
                            ),
                          ),
                          const SizedBox(width: 8),
                          StudyArtwork(scene: unit.scene),
                        ],
                      ),
                      const SizedBox(height: 14),
                      if (unit.phrases.isNotEmpty) ...[
                        StudyPhrase(
                          phrase: unit.phrases.first,
                          model: m,
                          audio: audio,
                        ),
                        const SizedBox(height: 8),
                        Center(
                          child: ListenButton(
                            phrase: unit.phrases.first,
                            model: m,
                            audio: audio,
                            rate: .8,
                          ),
                        ),
                      ] else
                        const Text('이 자료에는 연습할 문장이 없어요.'),
                      if (object(m.profile['completedLessons'])[unit.id] !=
                          null)
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: Text(
                            '✓ 학습 완료',
                            style: TextStyle(color: brand, fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Primary(
                    '회화 연습하기',
                    icon: Icons.chat_bubble_outline_rounded,
                    onPressed: unit.phrases.isEmpty
                        ? null
                        : () => context.go(
                            '/study/lesson/${Uri.encodeComponent(unit.id)}',
                          ),
                  ),
                ],
              ),
            ),
          SavedStudyLink(due: m.due),
        ],
        if (m.studyMode == 'words')
          _WordStudy(
            m: m,
            audio: audio,
            selectedId: wordPackId,
            onSelected: (v) => setState(() => wordPackId = v),
          ),
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

class _WordStudy extends StatelessWidget {
  final StudyModel m;
  final AudioService audio;
  final String? selectedId;
  final ValueChanged<String> onSelected;
  const _WordStudy({
    required this.m,
    required this.audio,
    required this.selectedId,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final packs = [
      ...objects(m.catalog['wordPacks']),
      if (m.words.isNotEmpty)
        {'id': 'saved', 'title': '내 단어장', 'words': m.words},
    ];
    if (packs.isEmpty) {
      return const Sheet(child: Text('연습할 단어가 아직 없어요. 번역이나 대화에서 단어를 저장해 보세요.'));
    }
    final pack = packs.firstWhere(
      (p) => p['id'] == selectedId,
      orElse: () => packs.first,
    );
    final words = objects(pack['words']);
    final word = words.isEmpty ? const <String, dynamic>{} : words.first;
    final phrase = Phrase.fromJson(word);
    final example = object(word['example']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StudyControlRow<String>(
          label: '단어 묶음',
          value: pack['id'] as String,
          choices: {
            for (final p in packs) p['id'] as String: p['title'] as String,
          },
          detail: '${words.length}개 단어',
          onChanged: m.busy ? null : onSelected,
        ),
        if (words.isNotEmpty) ...[
          LearningSurface(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          LearningText(
                            phrase.text,
                            language: m.language,
                            style: const TextStyle(
                              fontFamily: 'NotoSansKR',
                              fontFamilyFallback: uiFallback,
                              letterSpacing: 0,
                              fontSize: 32,
                              height: 1.4,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          if (phrase.reading.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              phrase.reading,
                              style: const TextStyle(
                                color: muted,
                                fontSize: 14,
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          Text(
                            phrase.meaning,
                            style: const TextStyle(fontSize: 19),
                          ),
                          ListenButton(
                            phrase: phrase,
                            model: m,
                            audio: audio,
                            iconOnly: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    StudyArtwork(
                      scene: pack['id'] as String?,
                      meaning: phrase.meaning,
                      size: 88,
                    ),
                  ],
                ),
              ),
              if (example.isNotEmpty)
                StudyPhrase(
                  phrase: Phrase.fromJson(example),
                  model: m,
                  audio: audio,
                ),
            ],
          ),
          const SizedBox(height: 12),
          Primary(
            '단어 연습하기',
            icon: Icons.style_outlined,
            onPressed: m.busy
                ? null
                : () => showModalBottomSheet(
                    context: context,
                    useSafeArea: true,
                    isScrollControlled: true,
                    builder: (_) =>
                        WordPractice(m: m, audio: audio, words: words),
                  ),
          ),
        ] else
          const Sheet(child: Text('이 묶음에는 연습할 단어가 없어요. 다른 묶음을 골라 주세요.')),
        const SizedBox(height: 12),
        const SavedStudyLink(words: true),
      ],
    );
  }
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
              PhraseView(phrase, reveal: correct, language: widget.m.language),
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
                  language: widget.m.language,
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
              PhraseView(phrase, reveal: reveal, language: widget.m.language),
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
