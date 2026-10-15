import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import 'audio_service.dart';
import 'models.dart';
import 'study_model.dart';
import 'study_screen.dart';
import 'widgets.dart';

class MusicScreen extends StatefulWidget {
  final StudyModel m;
  final AudioService audio;
  final String id;
  const MusicScreen({
    super.key,
    required this.m,
    required this.audio,
    required this.id,
  });
  @override
  State<MusicScreen> createState() => _MusicScreenState();
}

class _MusicScreenState extends State<MusicScreen> {
  String? selected;
  bool showAnswer = false;
  String spoken = '';
  int get step =>
      widget.m.musicSteps[widget.id] ??
      (object(object(widget.m.music['progress'])[widget.id])['phase'] ==
              'review'
          ? 4
          : 0);
  void setStep(int n) {
    setState(() {
      widget.m.musicSteps[widget.id] = n;
      selected = null;
      showAnswer = false;
      spoken = '';
    });
  }

  @override
  void dispose() {
    widget.audio.stop();
    if (widget.audio.recording) widget.audio.cancelRecording();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m, songs = m.songs.where((s) => s['id'] == widget.id);
    if (songs.isEmpty) {
      return const PageBody(
        children: [Text('곡이 없거나 바뀌었어요. 스터디로 돌아가 다시 선택해 주세요.')],
      );
    }
    final song = songs.first,
        progress = m.progress(song),
        lines = objects(song['lines']);
    final index = (progress['index'] as int? ?? 0).clamp(0, lines.length - 1),
        line = lines[index],
        phrase = Phrase.fromJson(line);
    final lessons = objects(song['lessons'] ?? m.catalog['musicLessons']),
        lesson = lessons[index],
        word = Phrase.fromJson(object(lesson['word']));
    final practiced = (progress['practiced'] as List? ?? []).length,
        reviewed = (progress['reviewed'] as List? ?? []).length;
    final review = step == 4;
    return PageBody(
      children: [
        StudyTabs(m: m, inMusic: true),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                color: soft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(
                Icons.graphic_eq_rounded,
                color: brand,
                size: 28,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(song['title'], style: sectionTitle),
                  Text(
                    song['subtitle'],
                    style: const TextStyle(color: muted, fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            for (int i = 0; i < 4; i++)
              Expanded(
                child: Column(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: (review ? i == 3 : step == i) ? brand : soft,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '${i + 1}',
                        style: TextStyle(
                          color: (review ? i == 3 : step == i)
                              ? Colors.white
                              : brand,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      ['듣기', '따라 말하기', '단어', '대화'][i],
                      style: const TextStyle(fontSize: 12, color: muted),
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 26),
        Text(
          review
              ? '뜻 복습 · ${index + 1}/${lines.length}'
              : '지금 연습하는 한 줄 · ${index + 1}/${lines.length}',
          style: const TextStyle(color: brand, fontSize: 13),
        ),
        const SizedBox(height: 13),
        Sheet(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PhraseView(phrase, reveal: !review),
              const SizedBox(height: 20),
              Wrap(
                spacing: 10,
                children: [
                  Primary(
                    '이 구간 듣기',
                    icon: Icons.play_arrow_rounded,
                    onPressed: () => sound(m, () async {
                      if ((song['audio'] as String).isNotEmpty) {
                        await widget.audio.segment(
                          song['audio'],
                          line['startSeconds'],
                          line['endSeconds'],
                        );
                      } else if (song['videoId'] != null) {
                        await launchUrl(
                          Uri.https('www.youtube.com', '/watch', {
                            'v': song['videoId'],
                            't': '${(line['startSeconds'] as num).floor()}',
                          }),
                          mode: LaunchMode.externalApplication,
                        );
                      } else {
                        throw Exception('이 곡의 오디오를 아직 준비하지 못했어요.');
                      }
                    }),
                  ),
                  TextButton(
                    onPressed: () => sound(m, widget.audio.stop),
                    child: const Text('재생 멈추기'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        if (step == 0) ...[
          const Text('먼저 소리와 리듬을 느껴 보세요.', style: TextStyle(color: muted)),
          const SizedBox(height: 20),
          Primary('들었어요 · 따라 말하기', onPressed: () => setStep(1)),
        ],
        if (step == 1)
          Sheet(
            color: soft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('내 목소리로 한 번 더', style: sectionTitle),
                const SizedBox(height: 10),
                const Text(
                  '소리를 들은 뒤 따라 말해 보세요. 녹음은 선택이에요.',
                  style: TextStyle(color: muted),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    MicButton(
                      audio: widget.audio,
                      model: m,
                      onText: (v) => setState(() => spoken = v),
                    ),
                    const SizedBox(width: 15),
                    Expanded(
                      child: Text(
                        spoken.isEmpty ? '누르면 녹음 시작 · 다시 누르면 마침' : spoken,
                        style: const TextStyle(fontSize: 13, color: muted),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Primary(
                  '따라 말했어요 · 단어 익히기',
                  onPressed: m.busy || widget.audio.recording
                      ? null
                      : () async {
                          final r = await m.songAction(song, index, 'practice');
                          if (r != null && mounted) setStep(2);
                        },
                ),
              ],
            ),
          ),
        if (step == 2)
          Sheet(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '노래 속 단어 하나',
                  style: TextStyle(color: brand, fontSize: 12),
                ),
                const SizedBox(height: 14),
                PhraseView(word, reveal: selected == line['id']),
                const SizedBox(height: 15),
                const Text('어떤 뜻일까요?'),
                const SizedBox(height: 8),
                for (final choice in lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(double.infinity, 48),
                      ),
                      onPressed: m.busy || selected == line['id']
                          ? null
                          : () async {
                              final r = await m.songAction(
                                song,
                                index,
                                'word-answer',
                                {'answer': choice['id']},
                              );
                              if (r != null && mounted) {
                                setState(() => selected = choice['id']);
                              }
                            },
                      child: Text(
                        object(
                          lessons[lines.indexOf(choice)]['word'],
                        )['meaning'],
                      ),
                    ),
                  ),
                if (selected != null)
                  Text(
                    selected == line['id']
                        ? '맞아요! ${lesson['note']}'
                        : '한 번 더 골라 볼까요?',
                    style: const TextStyle(color: brand),
                  ),
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: m.busy
                      ? null
                      : () => m.songAction(song, index, 'save-word'),
                  icon: const Icon(Icons.bookmark_add_outlined),
                  label: const Text('단어장에 저장'),
                ),
                if (selected == line['id'])
                  Primary('대화에 써 보기', onPressed: () => setStep(3)),
              ],
            ),
          ),
        if (step == 3)
          Sheet(
            color: soft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  lesson['situation'],
                  style: const TextStyle(color: brand, fontSize: 13),
                ),
                const SizedBox(height: 15),
                PhraseView(
                  Phrase.fromJson(object(lesson['question'])),
                  compact: true,
                ),
                ListenButton(
                  phrase: Phrase.fromJson(object(lesson['question'])),
                  model: m,
                  audio: widget.audio,
                ),
                const SizedBox(height: 10),
                if (showAnswer)
                  PhraseView(
                    Phrase.fromJson(object(lesson['answer'])),
                    compact: true,
                  )
                else
                  TextButton(
                    onPressed: () => setState(() => showAnswer = true),
                    child: const Text('답변 도움 보기'),
                  ),
                const SizedBox(height: 16),
                MicButton(
                  audio: widget.audio,
                  model: m,
                  onText: (v) => setState(() => spoken = v),
                ),
                if (spoken.isNotEmpty)
                  Text(spoken, style: const TextStyle(color: muted)),
                const SizedBox(height: 18),
                TextButton.icon(
                  onPressed: m.busy
                      ? null
                      : () => m.songAction(song, index, 'save-expression'),
                  icon: const Icon(Icons.bookmark_add_outlined),
                  label: const Text('회화 표현 저장'),
                ),
                Primary(
                  index + 1 == lines.length ? '모든 구간 연습 완료' : '말했어요 · 다음 한 줄',
                  onPressed: m.busy || widget.audio.recording
                      ? null
                      : () async {
                          var r = await m.songAction(
                            song,
                            index,
                            'conversation',
                            {'confidence': showAnswer ? 'help' : 'alone'},
                          );
                          if (r == null) return;
                          if (index + 1 < lines.length) {
                            r = await m.songAction(song, index + 1, 'move');
                            if (r != null && mounted) setStep(0);
                          } else if (practiced == lines.length) {
                            r = await m.songAction(song, 0, 'review');
                            if (r != null && mounted) setStep(4);
                          } else if (mounted) {
                            m.message('아직 따라 말하지 않은 구간이 있어요. 아래 목록에서 이어가 주세요.');
                          }
                        },
                ),
              ],
            ),
          ),
        if (review)
          Sheet(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '이 한 줄의 뜻을 골라 주세요.',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 16),
                for (final choice in lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: OutlinedButton(
                      onPressed: m.busy
                          ? null
                          : () async {
                              final r = await m.songAction(
                                song,
                                index,
                                'answer',
                                {'answer': choice['id']},
                              );
                              if (r != null && mounted) {
                                setState(() => selected = choice['id']);
                              }
                            },
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Text(choice['meaning']),
                      ),
                    ),
                  ),
                if (selected != null)
                  Text(
                    selected == line['id'] ? '잘 기억했어요!' : '다시 떠올려 볼까요?',
                    style: const TextStyle(color: brand),
                  ),
                if (selected == line['id'])
                  Primary(
                    reviewed == lines.length ? '스터디로 돌아가기' : '다음 구간 복습',
                    onPressed: m.busy
                        ? null
                        : () async {
                            if (reviewed == lines.length) {
                              m.studyMode = m.lastStudyMode;
                              context.go('/study');
                              return;
                            }
                            final target = (index + 1) % lines.length;
                            final r = await m.songAction(song, target, 'move');
                            if (r != null && mounted) {
                              setState(() => selected = null);
                            }
                          },
                  ),
              ],
            ),
          ),
        const SizedBox(height: 28),
        Row(
          children: [
            const Text(
              '구간 둘러보기',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const Spacer(),
            Text(
              '연습 $practiced/${lines.length} · 복습 $reviewed/${lines.length}',
              style: const TextStyle(color: muted, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 12),
        for (int i = 0; i < lines.length; i++)
          ListTile(
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 4,
            ),
            selected: i == index,
            selectedTileColor: soft,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            leading: Text('${i + 1}', style: const TextStyle(color: muted)),
            title: Text(lines[i]['text'], style: const TextStyle(fontSize: 14)),
            trailing:
                (progress['practiced'] as List? ?? []).contains(lines[i]['id'])
                ? const Icon(
                    Icons.check_circle_outline_rounded,
                    color: brand,
                    size: 19,
                  )
                : null,
            onTap: m.busy || widget.audio.recording
                ? null
                : () async {
                    await sound(m, widget.audio.stop);
                    final r = await m.songAction(song, i, 'move');
                    if (r != null && mounted) setStep(review ? 4 : 0);
                  },
          ),
      ],
    );
  }
}
