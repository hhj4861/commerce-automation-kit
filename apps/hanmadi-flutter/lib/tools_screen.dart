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
    if (scroll.hasClients) {
      scroll.animateTo(
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
              padding: const EdgeInsets.fromLTRB(22, 20, 22, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Heading('틀려도 괜찮은 대화', '조금 천천히, 오늘 배운 말부터 꺼내 봐요.'),
                  DropdownButtonFormField<String>(
                    initialValue: m.scene,
                    decoration: const InputDecoration(labelText: '대화할 상황'),
                    items: objects(m.catalog['scenes'])
                        .map(
                          (s) => DropdownMenuItem<String>(
                            value: s['id'],
                            child: Text(s['title']),
                          ),
                        )
                        .toList(),
                    onChanged: m.busy
                        ? null
                        : (v) => setState(() {
                            m.scene = v!;
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
                padding: const EdgeInsets.fromLTRB(22, 15, 22, 16),
                itemCount: m.chat.length + (m.chat.isEmpty ? 1 : 0),
                itemBuilder: (context, i) {
                  if (m.chat.isEmpty) {
                    return Sheet(
                      color: soft,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '어떤 말부터 해 볼까요?',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            '인사를 건네거나 궁금한 것을 물어보세요.\n한마디가 자연스럽게 답해 줄 거예요.',
                            style: TextStyle(color: muted),
                          ),
                          const SizedBox(height: 16),
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
                            hintText: '편하게 한마디 해 보세요',
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
                    'AI 답변에 오류가 있을 수 있어요. 대화 내용은 이 화면을 벗어나도 유지돼요.',
                    style: TextStyle(color: muted, fontSize: 11),
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
        const Heading('전하고 싶은 마음 그대로', '말하거나 입력하면, 자연스러운 한마디로.'),
        Row(
          children: [
            Expanded(
              flex: 2,
              child: DropdownButtonFormField<String>(
                initialValue: m.from,
                decoration: const InputDecoration(labelText: '입력 언어'),
                items: [
                  const DropdownMenuItem(value: 'auto', child: Text('자동 감지')),
                  const DropdownMenuItem(value: 'ko', child: Text('한국어')),
                  DropdownMenuItem(
                    value: m.language,
                    child: Text(languageNames[m.language]!),
                  ),
                ],
                onChanged: m.busy ? null : (v) => setState(() => m.from = v!),
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
                SelectableText(
                  result['translated'],
                  style: const TextStyle(
                    fontSize: 26,
                    height: 1.6,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  result['reading'] ?? '',
                  style: const TextStyle(color: muted, height: 1.6),
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
