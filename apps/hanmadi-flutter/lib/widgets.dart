import 'package:flutter/material.dart';

import 'audio_service.dart';
import 'models.dart';
import 'study_model.dart';

const brand = Color(0xff5261ce),
    ink = Color(0xff272b38),
    muted = Color(0xff686d7c),
    paper = Color(0xfffafaf9),
    soft = Color(0xfff0f1fc);

class Sheet extends StatelessWidget {
  final Widget child;
  final Color? color;
  final EdgeInsets padding;
  const Sheet({
    super.key,
    required this.child,
    this.color,
    this.padding = const EdgeInsets.all(22),
  });
  @override
  Widget build(BuildContext context) => Material(
    color: color ?? Colors.white,
    borderRadius: BorderRadius.circular(22),
    child: Padding(padding: padding, child: child),
  );
}

class PageBody extends StatelessWidget {
  final List<Widget> children;
  const PageBody({super.key, required this.children});
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 860),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 30),
        children: children,
      ),
    ),
  );
}

class Heading extends StatelessWidget {
  final String title, subtitle;
  const Heading(this.title, this.subtitle, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 26),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 27,
            fontWeight: FontWeight.w600,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 10),
        Text(subtitle, style: const TextStyle(color: muted, height: 1.6)),
      ],
    ),
  );
}

class Primary extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  const Primary(this.label, {super.key, this.onPressed, this.icon});
  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: onPressed,
    style: FilledButton.styleFrom(
      minimumSize: const Size(0, 50),
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[Icon(icon, size: 19), const SizedBox(width: 8)],
        Flexible(child: Text(label, textAlign: TextAlign.center)),
      ],
    ),
  );
}

class PhraseView extends StatelessWidget {
  final Phrase phrase;
  final bool reveal;
  final bool compact;
  const PhraseView(
    this.phrase, {
    super.key,
    this.reveal = true,
    this.compact = false,
  });
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SelectableText(
        phrase.text,
        style: TextStyle(
          fontSize: compact ? 21 : 27,
          height: 1.6,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 10),
      Text(
        phrase.reading,
        style: const TextStyle(color: brand, fontSize: 14, height: 1.6),
      ),
      if (reveal) ...[
        const SizedBox(height: 12),
        Text(phrase.meaning, style: const TextStyle(color: muted, height: 1.7)),
      ],
    ],
  );
}

Future<void> sound(StudyModel m, Future<void> Function() work) async {
  try {
    await work();
  } catch (e) {
    m.message(e.toString());
  }
}

class ListenButton extends StatefulWidget {
  final Phrase phrase;
  final StudyModel model;
  final AudioService audio;
  const ListenButton({
    super.key,
    required this.phrase,
    required this.model,
    required this.audio,
  });
  @override
  State<ListenButton> createState() => _ListenButtonState();
}

class _ListenButtonState extends State<ListenButton> {
  bool loading = false;
  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: loading
        ? null
        : () async {
            setState(() => loading = true);
            await sound(
              widget.model,
              () =>
                  widget.audio.speak(widget.phrase.text, widget.model.language),
            );
            if (mounted) setState(() => loading = false);
          },
    icon: Icon(
      loading ? Icons.hourglass_empty_rounded : Icons.volume_up_outlined,
      size: 20,
    ),
    label: Text(loading ? '소리 준비 중' : '듣기'),
  );
}

class MicButton extends StatelessWidget {
  final AudioService audio;
  final StudyModel model;
  final ValueChanged<String> onText;
  final String? language;
  const MicButton({
    super.key,
    required this.audio,
    required this.model,
    required this.onText,
    this.language,
  });
  Future<void> finish() async {
    await model.run(() async {
      final text = await audio.finishRecording(language ?? model.language);
      onText(text);
      return true;
    });
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: audio,
    builder: (context, _) => IconButton(
      tooltip: audio.recording ? '녹음 마치기' : '말해서 입력',
      onPressed: model.busy
          ? null
          : () => sound(model, () async {
              if (audio.recording) {
                await finish();
              } else {
                await audio.startRecording(() => finish());
              }
            }),
      style: IconButton.styleFrom(
        backgroundColor: audio.recording ? const Color(0xffffecec) : soft,
        minimumSize: const Size(48, 48),
      ),
      icon: Icon(
        audio.recording ? Icons.stop_rounded : Icons.mic_none_rounded,
        color: audio.recording ? Colors.red : brand,
      ),
    ),
  );
}
