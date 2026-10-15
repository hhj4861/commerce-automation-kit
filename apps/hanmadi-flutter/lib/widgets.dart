import 'package:flutter/material.dart';

import 'audio_service.dart';
import 'models.dart';
import 'study_model.dart';

export 'theme.dart';
import 'theme.dart';

class Sheet extends StatelessWidget {
  final Widget child;
  final Color? color;
  final EdgeInsets padding;
  const Sheet({
    super.key,
    required this.child,
    this.color,
    this.padding = const EdgeInsets.all(20),
  });
  @override
  Widget build(BuildContext context) => Material(
    color: color ?? Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(24),
      side: const BorderSide(color: outline, width: 0.7),
    ),
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
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
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
    padding: const EdgeInsets.only(bottom: 22),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
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
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
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
          fontFamily: 'NotoSansKR',
          fontFamilyFallback: uiFallback,
          letterSpacing: 0,
          fontSize: compact ? 20 : 25,
          height: 1.55,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 10),
      Text(
        phrase.reading,
        style: const TextStyle(color: brand, fontSize: 14, height: 1.55),
      ),
      if (reveal) ...[
        const SizedBox(height: 12),
        Text(
          phrase.meaning,
          style: const TextStyle(color: muted, height: 1.55),
        ),
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

/// A small, anchored picker. Long lists scroll inside the menu, never the page.
class AppSelect<T> extends StatelessWidget {
  final String label;
  final T value;
  final Map<T, String> choices;
  final ValueChanged<T>? onChanged;
  final bool compact;
  const AppSelect({
    super.key,
    required this.label,
    required this.value,
    required this.choices,
    required this.onChanged,
    this.compact = false,
  });
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final view = MediaQuery.sizeOf(context);
      final available = (view.width - 32).clamp(0.0, 320.0);
      final width = compact
          ? available.clamp(0.0, 236.0)
          : box.maxWidth.clamp(0.0, available);
      final menuHeight = (view.height * .38).clamp(0.0, 280.0);
      final selected = choices[value] ?? '';
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!compact) ...[
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 7),
          ],
          PopupMenuButton<T>(
            key: ValueKey('select-$label'),
            tooltip: '$label 선택',
            requestFocus: true,
            useRootNavigator: true,
            clipBehavior: Clip.antiAlias,
            onOpened: Tooltip.dismissAllToolTips,
            enabled: onChanged != null && choices.isNotEmpty,
            position: PopupMenuPosition.under,
            offset: const Offset(0, 6),
            constraints: BoxConstraints(
              minWidth: width,
              maxWidth: width,
              maxHeight: menuHeight,
            ),
            color: Colors.white,
            surfaceTintColor: Colors.transparent,
            elevation: 8,
            shadowColor: brand.withValues(alpha: .14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: outline),
            ),
            menuPadding: const EdgeInsets.all(6),
            popUpAnimationStyle: AnimationStyle(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 160),
            ),
            onSelected: onChanged,
            itemBuilder: (_) => choices.entries
                .map(
                  (e) => PopupMenuItem<T>(
                    value: e.key,
                    height: 52,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: e.key == value ? soft : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              e.value,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: uiLabel.copyWith(
                                color: e.key == value ? brand : ink,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          if (e.key == value)
                            const Icon(
                              Icons.check_rounded,
                              size: 18,
                              color: brand,
                            )
                          else
                            const SizedBox(width: 18),
                        ],
                      ),
                    ),
                  ),
                )
                .toList(),
            child: Opacity(
              opacity: onChanged == null ? .55 : 1,
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: EdgeInsets.symmetric(
                  horizontal: compact ? 12 : 15,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  color: compact ? soft : Colors.white,
                  borderRadius: BorderRadius.circular(compact ? 20 : 17),
                  border: Border.all(
                    color: compact ? Colors.transparent : outline,
                  ),
                ),
                child: Row(
                  mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
                  children: [
                    if (compact) ...[
                      const Icon(
                        Icons.language_rounded,
                        size: 17,
                        color: brand,
                      ),
                      const SizedBox(width: 6),
                    ],
                    if (compact)
                      Text(selected, style: uiLabel.copyWith(color: brand))
                    else
                      Expanded(
                        child: Text(
                          selected,
                          overflow: TextOverflow.ellipsis,
                          style: uiLabel.copyWith(color: ink),
                        ),
                      ),
                    const SizedBox(width: 6),
                    const Icon(
                      Icons.expand_more_rounded,
                      size: 18,
                      color: brand,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      );
    },
  );
}

class BrandMark extends StatelessWidget {
  const BrandMark({super.key});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Container(
      width: 33,
      height: 33,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: soft,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(13),
          topRight: Radius.circular(13),
          bottomRight: Radius.circular(13),
          bottomLeft: Radius.circular(4),
        ),
      ),
      child: const Text(
        '한',
        style: TextStyle(
          fontFamily: 'Jua',
          fontSize: 21,
          color: brand,
          height: 1,
        ),
      ),
    ),
  );
}
