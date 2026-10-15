import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hanmadi/widgets.dart';

void main() {
  test('every text role uses the same tracking and UI font system', () {
    final t = hanmadiTheme().textTheme;
    for (final s in [
      t.displayLarge,
      t.displayMedium,
      t.displaySmall,
      t.headlineLarge,
      t.headlineMedium,
      t.headlineSmall,
      t.titleLarge,
      t.titleMedium,
      t.titleSmall,
      t.bodyLarge,
      t.bodyMedium,
      t.bodySmall,
      t.labelLarge,
      t.labelMedium,
      t.labelSmall,
    ]) {
      expect(s!.letterSpacing, 0);
      expect(['GowunDodum', 'Jua'], contains(s.fontFamily));
    }
    expect(t.headlineSmall!.height, 1.3);
    expect(t.bodyMedium!.height, 1.55);
  });
  for (final width in [320.0, 1440.0]) {
    testWidgets('picker stays small, scrolls and selects at width $width', (
      t,
    ) async {
      t.view.physicalSize = Size(width, 700);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      var value = 0;
      await t.pumpWidget(
        MaterialApp(
          theme: hanmadiTheme(),
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.fromLTRB(20, 90, 20, 20),
              child: MediaQuery(
                data: MediaQueryData(
                  size: Size(width, 700),
                  textScaler: const TextScaler.linear(1.4),
                ),
                child: AppSelect<int>(
                  label: '상황',
                  value: value,
                  choices: {
                    for (int i = 0; i < 16; i++) i: '상황 $i — 여행에서 마음을 전하는 연습',
                  },
                  onChanged: (v) => value = v,
                ),
              ),
            ),
          ),
        ),
      );
      await t.tap(find.byKey(const ValueKey('select-상황')));
      await t.pumpAndSettle();
      final view = find.byType(SingleChildScrollView);
      expect(view, findsOneWidget);
      final rect = t.getRect(view);
      expect(rect.height, lessThanOrEqualTo(266));
      expect(rect.width, lessThanOrEqualTo(320));
      expect(rect.left, greaterThanOrEqualTo(8));
      expect(rect.right, lessThanOrEqualTo(width - 8));
      await t.ensureVisible(find.text('상황 15 — 여행에서 마음을 전하는 연습'));
      await t.pumpAndSettle();
      await t.tap(find.text('상황 15 — 여행에서 마음을 전하는 연습'));
      await t.pumpAndSettle();
      expect(value, 15);
      expect(find.byType(PopupMenuItem<int>), findsNothing);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('outside tap and Escape close without changing the choice', (
    t,
  ) async {
    var changes = 0;
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(80),
            child: AppSelect<String>(
              label: '언어',
              value: 'ja',
              choices: const {'ja': '일본어', 'en': '영어'},
              onChanged: (_) => changes++,
            ),
          ),
        ),
      ),
    );
    for (final keyboard in [false, true]) {
      await t.tap(find.byKey(const ValueKey('select-언어')));
      await t.pumpAndSettle();
      expect(find.byType(PopupMenuItem<String>), findsNWidgets(2));
      if (keyboard) {
        await t.sendKeyEvent(LogicalKeyboardKey.escape);
      } else {
        await t.tapAt(const Offset(5, 5));
      }
      await t.pumpAndSettle();
      expect(find.byType(PopupMenuItem<String>), findsNothing);
    }
    expect(changes, 0);
  });
}
