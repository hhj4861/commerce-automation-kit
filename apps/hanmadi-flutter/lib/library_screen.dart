import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'models.dart';
import 'study_model.dart';
import 'audio_service.dart';
import 'widgets.dart';
import 'study_screen.dart';

class LibraryScreen extends StatefulWidget {
  final StudyModel m;
  final AudioService audio;
  final bool vocabulary;
  const LibraryScreen({
    super.key,
    required this.m,
    required this.audio,
    this.vocabulary = false,
  });
  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  String query = '';
  @override
  Widget build(BuildContext context) {
    final m = widget.m, vocabulary = widget.vocabulary;
    final all = vocabulary ? m.words : m.expressions;
    final entries = all
        .where(
          (e) => '${e['text']} ${e['meaning']}'.toLowerCase().contains(
            query.toLowerCase(),
          ),
        )
        .toList();
    return PageBody(
      children: [
        SegmentedButton<bool>(
          segments: [
            ButtonSegment(
              value: false,
              label: Text('내 표현 ${m.expressions.length}'),
            ),
            ButtonSegment(value: true, label: Text('단어장 ${m.words.length}')),
          ],
          selected: {vocabulary},
          onSelectionChanged: (s) =>
              context.go(s.first ? '/library?tab=words' : '/library'),
          showSelectedIcon: false,
        ),
        const SizedBox(height: 22),
        TextField(
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search_rounded),
            hintText: '표현이나 뜻으로 찾아보기',
          ),
          onChanged: (v) => setState(() => query = v),
        ),
        const SizedBox(height: 20),
        if (vocabulary && entries.isNotEmpty) ...[
          Primary(
            '단어장 복습하기',
            onPressed: () => showModalBottomSheet(
              context: context,
              useSafeArea: true,
              isScrollControlled: true,
              builder: (_) =>
                  WordPractice(m: m, audio: widget.audio, words: entries),
            ),
          ),
          const SizedBox(height: 20),
        ],
        if (entries.isEmpty)
          Sheet(
            color: soft,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: Column(
                children: [
                  const Icon(
                    Icons.bookmark_border_rounded,
                    size: 34,
                    color: brand,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    query.isEmpty
                        ? '아직 저장한 ${vocabulary ? '단어가' : '표현이'} 없어요.'
                        : '찾는 표현이 없어요.',
                    style: const TextStyle(fontSize: 18),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    '마음에 남는 한마디를 저장해 보세요.',
                    style: TextStyle(color: muted),
                  ),
                ],
              ),
            ),
          ),
        for (final e in entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Sheet(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        (e['dueAt'] as num? ?? 0) <=
                                DateTime.now().millisecondsSinceEpoch
                            ? '복습할 때예요'
                            : '다음 복습을 기다리는 중',
                        style: const TextStyle(color: brand, fontSize: 12),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: vocabulary ? '단어장에서 빼기' : '표현 삭제',
                        onPressed: m.busy
                            ? null
                            : () async {
                                final yes = await showDialog<bool>(
                                  context: context,
                                  builder: (c) => AlertDialog(
                                    title: Text(
                                      vocabulary ? '단어장에서 뺄까요?' : '이 표현을 지울까요?',
                                    ),
                                    content: Text(e['text']),
                                    actions: [
                                      TextButton(
                                        onPressed: () =>
                                            Navigator.pop(c, false),
                                        child: const Text('취소'),
                                      ),
                                      TextButton(
                                        onPressed: () => Navigator.pop(c, true),
                                        child: const Text('삭제'),
                                      ),
                                    ],
                                  ),
                                );
                                if (yes == true) {
                                  await m.action(
                                    vocabulary ? 'remove-word' : 'delete',
                                    {'id': e['id']},
                                  );
                                }
                              },
                        icon: const Icon(Icons.more_horiz_rounded),
                      ),
                    ],
                  ),
                  PhraseView(
                    Phrase.fromJson(e),
                    compact: true,
                    language: m.language,
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    children: [
                      ListenButton(
                        phrase: Phrase.fromJson(e),
                        model: m,
                        audio: widget.audio,
                      ),
                      TextButton(
                        onPressed: m.busy
                            ? null
                            : () => m.action('practice', {
                                'id': e['id'],
                                'confidence': 'help',
                              }),
                        child: const Text('더 연습할래요'),
                      ),
                      TextButton(
                        onPressed: m.busy
                            ? null
                            : () => m.action('practice', {
                                'id': e['id'],
                                'confidence': 'alone',
                              }),
                        child: const Text('혼자 말했어요'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
