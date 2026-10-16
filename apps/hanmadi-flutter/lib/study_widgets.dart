import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'audio_service.dart';
import 'models.dart';
import 'study_model.dart';
import 'widgets.dart';

const learningBlue = Color(0xffe1efff);

class LearningSurface extends StatelessWidget {
  final List<Widget> children;
  const LearningSurface({super.key, required this.children});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: learningBlue,
      borderRadius: BorderRadius.circular(24),
      boxShadow: [
        BoxShadow(
          color: brand.withValues(alpha: .035),
          blurRadius: 18,
          offset: const Offset(0, 6),
        ),
      ],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    ),
  );
}

/// Decorative context only; never use a coffee image for an unrelated word.
class StudyArtwork extends StatelessWidget {
  final String? scene, meaning;
  final double size;
  const StudyArtwork({super.key, this.scene, this.meaning, this.size = 76});

  @override
  Widget build(BuildContext context) {
    final coffee = meaning == '커피' || (meaning == null && scene == 'cafe');
    final icon = switch (meaning) {
      '물' => Icons.water_drop_outlined,
      '이름' => Icons.badge_outlined,
      '역' || '표' || '출구' => Icons.train_outlined,
      _ => switch (scene) {
        'cafe' => Icons.local_cafe_outlined,
        'travel' || 'transport' => Icons.train_outlined,
        'restaurant' => Icons.restaurant_outlined,
        'hotel' => Icons.hotel_outlined,
        'shopping' => Icons.shopping_bag_outlined,
        'nightlife' => Icons.nightlife_outlined,
        'music' => Icons.music_note_outlined,
        _ => Icons.forum_outlined,
      },
    };
    return ExcludeSemantics(
      child: SizedBox(
        width: size,
        height: size,
        child: coffee
            ? Image.asset('assets/learning/coffee.png', fit: BoxFit.contain)
            : Center(
                child: Container(
                  width: size * .82,
                  height: size * .82,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: .65),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Icon(icon, color: brand, size: size * .43),
                ),
              ),
      ),
    );
  }
}

class StudyPhrase extends StatelessWidget {
  final Phrase phrase;
  final StudyModel model;
  final AudioService audio;
  const StudyPhrase({
    super.key,
    required this.phrase,
    required this.model,
    required this.audio,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SelectableText(
          phrase.text,
          style: const TextStyle(
            fontFamily: 'NotoSansKR',
            fontFamilyFallback: uiFallback,
            fontSize: 22,
            fontWeight: FontWeight.w500,
            height: 1.5,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(
                phrase.reading,
                style: const TextStyle(color: muted, fontSize: 14),
              ),
            ),
            const SizedBox(width: 4),
            ListenButton(
              phrase: phrase,
              model: model,
              audio: audio,
              iconOnly: true,
            ),
          ],
        ),
        if (phrase.meaning.isNotEmpty) ...[
          const Divider(height: 28, color: outline),
          Text(
            phrase.meaning,
            style: const TextStyle(color: ink, fontSize: 16),
          ),
        ],
      ],
    ),
  );
}

class StudyControlRow<T> extends StatelessWidget {
  final String label;
  final T value;
  final Map<T, String> choices;
  final ValueChanged<T>? onChanged;
  final String detail;
  const StudyControlRow({
    super.key,
    required this.label,
    required this.value,
    required this.choices,
    required this.onChanged,
    required this.detail,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Row(
      children: [
        Flexible(
          child: Align(
            alignment: Alignment.centerLeft,
            child: AppSelect<T>(
              label: label,
              value: value,
              choices: choices,
              onChanged: onChanged,
              compact: true,
              leadingIcon: null,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Text(detail, style: const TextStyle(color: muted, fontSize: 13)),
      ],
    ),
  );
}

class SavedStudyLink extends StatelessWidget {
  final bool words;
  final int due;
  const SavedStudyLink({super.key, this.words = false, this.due = 0});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 4),
    child: Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.go('/library'),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: soft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.bookmark_border_rounded,
                  color: brand,
                  size: 23,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(child: Text(words ? '내 단어장' : '나의 표현', style: uiLabel)),
              if (due > 0) ...[
                Text(
                  '$due',
                  style: const TextStyle(color: brand, fontSize: 13),
                ),
                const SizedBox(width: 8),
              ],
              const Icon(Icons.chevron_right_rounded, color: muted, size: 22),
            ],
          ),
        ),
      ),
    ),
  );
}
