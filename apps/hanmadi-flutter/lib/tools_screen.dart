import 'package:flutter/material.dart';

import 'study_model.dart';
import 'audio_service.dart';
import 'models.dart';
import 'widgets.dart';

class ChatScreen extends StatefulWidget {
  final StudyModel m;
  final AudioService audio;
  const ChatScreen({super.key, required this.m, required this.audio});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final input = TextEditingController(), scroll = ScrollController();
  late String _contextKey;
  @override
  void initState() {
    super.initState();
    _contextKey = '${widget.m.language}:${widget.m.scene}';
    input.text = widget.m.chatDraft;
    input.addListener(() {
      widget.m.chatDraft = input.text;
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(covariant ChatScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = '${widget.m.language}:${widget.m.scene}';
    if (next != _contextKey) {
      _contextKey = next;
      input.text = widget.m.chatDraft;
    }
  }

  @override
  void dispose() {
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> send() async {
    await widget.m.sendChat();
    if (!mounted) return;
    input.text = widget.m.chatDraft;
    setState(() {});
    // The reply changes the list extent; use the new layout, not the previous frame.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    if (scroll.hasClients) {
      await scroll.animateTo(
        scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 860),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppSelect<String>(
                    label: '대화할 상황',
                    value: m.scene,
                    choices: {
                      for (final scene in objects(m.catalog['scenes']))
                        scene['id'] as String: scene['title'] as String,
                    },
                    onChanged: m.busy
                        ? null
                        : (v) => setState(() {
                            m.scene = v;
                            m.chatDraft = '';
                            input.clear();
                          }),
                  ),
                  if (m.profile.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text(
                        '스터디에서 시작 레벨을 먼저 선택해 주세요.',
                        style: TextStyle(color: brand),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(20, 15, 20, 16),
                itemCount: m.chat.length + (m.chat.isEmpty ? 1 : 0),
                itemBuilder: (context, i) {
                  if (m.chat.isEmpty) {
                    return Sheet(
                      color: soft,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: 8,
                            children: [
                              for (final suggestion in [
                                '인사부터 연습할래요',
                                '오늘의 기분 말하기',
                              ])
                                ActionChip(
                                  label: Text(suggestion),
                                  onPressed: () {
                                    m.chatDraft = suggestion;
                                    input.text = suggestion;
                                    setState(() {});
                                  },
                                ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }
                  final msg = m.chat[i], user = msg['role'] == 'user';
                  return Align(
                    alignment: user
                        ? Alignment.centerRight
                        : Alignment.centerLeft,
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 620),
                      margin: const EdgeInsets.only(bottom: 18, top: 5),
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: user ? soft : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: user
                          ? SelectableText(msg['content'] ?? '')
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  '한마디',
                                  style: TextStyle(color: muted, fontSize: 12),
                                ),
                                const SizedBox(height: 10),
                                PhraseView(
                                  Phrase.fromJson(object(msg['phrase'])),
                                  compact: true,
                                  language: m.language,
                                ),
                                Wrap(
                                  spacing: 10,
                                  children: [
                                    ListenButton(
                                      phrase: Phrase.fromJson(
                                        object(msg['phrase']),
                                      ),
                                      model: m,
                                      audio: widget.audio,
                                    ),
                                    TextButton.icon(
                                      onPressed: m.busy
                                          ? null
                                          : () => m.save(
                                              Phrase.fromJson(
                                                object(msg['phrase']),
                                              ),
                                            ),
                                      icon: const Icon(
                                        Icons.bookmark_add_outlined,
                                        size: 18,
                                      ),
                                      label: const Text('표현 저장'),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                    ),
                  );
                },
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: Color(0xffe9eaf0))),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (m.busy)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 10),
                      child: Text(
                        '답변을 준비하고 있어요…',
                        style: TextStyle(color: muted, fontSize: 12),
                      ),
                    ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      MicButton(
                        audio: widget.audio,
                        model: m,
                        onText: (v) {
                          m.chatDraft = v;
                          input.text = v;
                          setState(() {});
                        },
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          key: const Key('chat-input'),
                          controller: input,
                          minLines: 1,
                          maxLines: 4,
                          maxLength: 2000,
                          decoration: const InputDecoration(
                            hintText: '한마디 입력',
                            counterText: '',
                          ),
                          onChanged: (v) => setState(() => m.chatDraft = v),
                          onSubmitted: (_) => send(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        key: const Key('chat-send'),
                        tooltip: '메시지 보내기',
                        onPressed:
                            m.busy ||
                                m.chatDraft.trim().isEmpty ||
                                m.profile.isEmpty
                            ? null
                            : send,
                        style: IconButton.styleFrom(
                          backgroundColor: brand,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: soft,
                          minimumSize: const Size(48, 48),
                        ),
                        icon: const Icon(Icons.arrow_upward_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'AI 답변은 틀릴 수 있어요.',
                    style: TextStyle(color: muted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TranslateScreen extends StatefulWidget {
  final StudyModel m;
  final AudioService audio;
  const TranslateScreen({super.key, required this.m, required this.audio});
  @override
  State<TranslateScreen> createState() => _TranslateScreenState();
}

class _TranslateScreenState extends State<TranslateScreen> {
  final input = TextEditingController();
  late String _language;
  @override
  void initState() {
    super.initState();
    _language = widget.m.language;
    input.text = widget.m.translationDraft;
    input.addListener(() {
      widget.m.translationDraft = input.text;
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(covariant TranslateScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_language != widget.m.language) {
      _language = widget.m.language;
      input.text = widget.m.translationDraft;
    }
  }

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final result = m.translation;
    return PageBody(
      children: [
        Row(
          children: [
            Expanded(
              flex: 2,
              child: AppSelect<String>(
                label: '입력 언어',
                value: m.from,
                choices: {
                  'auto': '자동 감지',
                  'ko': '한국어',
                  m.language: languageNames[m.language]!,
                },
                onChanged: m.busy ? null : (v) => setState(() => m.from = v),
              ),
            ),
            const SizedBox(width: 12),
            const Icon(Icons.swap_horiz_rounded, color: muted),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                '한국어 ↔ ${languageNames[m.language]}',
                style: const TextStyle(color: brand, fontSize: 14),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        TextField(
          key: const Key('translation-input'),
          controller: input,
          minLines: 4,
          maxLines: 8,
          maxLength: 1000,
          decoration: const InputDecoration(hintText: '어떤 말을 전하고 싶으세요?'),
          onChanged: (v) => setState(() => m.translationDraft = v),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            MicButton(
              audio: widget.audio,
              model: m,
              language: m.from,
              onText: (v) {
                m.translationDraft = v;
                input.text = v;
                setState(() {});
              },
            ),
            const SizedBox(width: 10),
            const Text('말해서 입력', style: TextStyle(color: muted, fontSize: 13)),
            const Spacer(),
            Primary(
              m.busy ? '번역 중…' : '번역하기',
              onPressed: m.busy || m.translationDraft.trim().isEmpty
                  ? null
                  : m.translate,
            ),
          ],
        ),
        if (result['needsConfirmation'] == true)
          const Padding(
            padding: EdgeInsets.only(top: 22),
            child: Sheet(
              color: soft,
              child: Text('입력 언어를 직접 선택한 뒤 다시 번역해 주세요.'),
            ),
          ),
        if (result['translated'] != null) ...[
          const SizedBox(height: 30),
          Sheet(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '이렇게 전해 보세요',
                  style: TextStyle(color: brand, fontSize: 12),
                ),
                const SizedBox(height: 15),
                LearningText(
                  result['translated'],
                  language: result['from'] == 'ko' ? m.language : 'ko',
                  style: const TextStyle(
                    fontFamily: 'NotoSansKR',
                    fontFamilyFallback: uiFallback,
                    letterSpacing: 0,
                    fontSize: 25,
                    height: 1.55,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  result['reading'] ?? '',
                  style: const TextStyle(color: muted, height: 1.55),
                ),
                const SizedBox(height: 16),
                ListenButton(
                  phrase: Phrase(
                    result['from'] == 'ko'
                        ? result['translated']
                        : result['input'],
                    '',
                    '',
                  ),
                  model: m,
                  audio: widget.audio,
                ),
                if (result['practice'] != null)
                  TextButton.icon(
                    onPressed: m.busy
                        ? null
                        : () => m.save(
                            Phrase.fromJson(object(result['practice'])),
                          ),
                    icon: const Icon(Icons.bookmark_add_outlined),
                    label: const Text('연습할 표현 저장'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 15),
          const Text(
            '번역 원문은 학습 데이터로 제공하지 않아요. 저장 설정은 학습 설정에서 바꿀 수 있어요.',
            style: TextStyle(color: muted, fontSize: 12),
          ),
        ],
      ],
    );
  }
}
