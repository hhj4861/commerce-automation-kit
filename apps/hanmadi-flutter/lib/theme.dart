import 'package:flutter/material.dart';

const brand = Color(0xff3157d5),
    ink = Color(0xff182b49),
    muted = Color(0xff5a6980),
    paper = Color(0xfff7fbff),
    soft = Color(0xffeaf4ff),
    mint = Color(0xffe5f3ed),
    outline = Color(0xffdbe9f3);
const uiFallback = ['NotoSansKR', 'NotoSansThai', 'sans-serif'];
const sectionTitle = TextStyle(
  color: ink,
  fontFamily: 'Jua',
  fontFamilyFallback: uiFallback,
  fontSize: 20,
  fontWeight: FontWeight.w400,
  height: 1.3,
  letterSpacing: 0,
);
const uiLabel = TextStyle(
  fontFamily: 'GowunDodum',
  fontFamilyFallback: uiFallback,
  fontSize: 14,
  fontWeight: FontWeight.w600,
  height: 1.3,
  letterSpacing: 0,
);
ThemeData hanmadiTheme() {
  final base = ThemeData(useMaterial3: true);
  // Material has text roles with null tracking. Normalize each role before
  // applying font families, including titles, labels and selection menus.
  TextStyle flat(TextStyle? s) =>
      (s ?? const TextStyle()).copyWith(letterSpacing: 0);
  final raw = base.textTheme;
  final text =
      TextTheme(
            displayLarge: flat(raw.displayLarge),
            displayMedium: flat(raw.displayMedium),
            displaySmall: flat(raw.displaySmall),
            headlineLarge: flat(raw.headlineLarge),
            headlineMedium: flat(raw.headlineMedium),
            headlineSmall: flat(raw.headlineSmall),
            titleLarge: flat(raw.titleLarge),
            titleMedium: flat(raw.titleMedium),
            titleSmall: flat(raw.titleSmall),
            bodyLarge: flat(raw.bodyLarge),
            bodyMedium: flat(raw.bodyMedium),
            bodySmall: flat(raw.bodySmall),
            labelLarge: flat(raw.labelLarge),
            labelMedium: flat(raw.labelMedium),
            labelSmall: flat(raw.labelSmall),
          )
          .apply(
            fontFamily: 'GowunDodum',
            fontFamilyFallback: uiFallback,
            bodyColor: ink,
            displayColor: ink,
          )
          .copyWith(
            headlineSmall: sectionTitle.copyWith(fontSize: 25),
            titleLarge: sectionTitle,
            titleMedium: uiLabel.copyWith(fontSize: 17),
            bodyLarge: const TextStyle(
              fontFamily: 'GowunDodum',
              fontFamilyFallback: uiFallback,
              fontSize: 16,
              color: ink,
              height: 1.55,
              letterSpacing: 0,
            ),
            bodyMedium: const TextStyle(
              fontFamily: 'GowunDodum',
              fontFamilyFallback: uiFallback,
              fontSize: 15,
              color: ink,
              height: 1.55,
              letterSpacing: 0,
            ),
            bodySmall: const TextStyle(
              fontFamily: 'GowunDodum',
              fontFamilyFallback: uiFallback,
              fontSize: 13,
              color: muted,
              height: 1.5,
              letterSpacing: 0,
            ),
            labelLarge: uiLabel,
            labelMedium: uiLabel.copyWith(fontSize: 13),
            labelSmall: uiLabel.copyWith(fontSize: 12),
          );
  final rounded = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(18),
  );
  return base.copyWith(
    scaffoldBackgroundColor: paper,
    colorScheme: ColorScheme.fromSeed(seedColor: brand)
        .copyWith(primary: brand, surface: paper),
    textTheme: text,
    primaryTextTheme: text,
    appBarTheme: const AppBarTheme(
      backgroundColor: paper,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      foregroundColor: ink,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      hintStyle: text.bodyMedium?.copyWith(color: muted),
      labelStyle: text.bodySmall,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: brand, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: brand,
        foregroundColor: Colors.white,
        textStyle: uiLabel,
        minimumSize: const Size(48, 48),
        shape: rounded,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        textStyle: uiLabel,
        foregroundColor: brand,
        minimumSize: const Size(48, 48),
        shape: rounded,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        textStyle: uiLabel,
        foregroundColor: brand,
        shape: rounded,
        minimumSize: const Size(48, 48),
        side: const BorderSide(color: outline),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: soft,
      height: 74,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => uiLabel.copyWith(
          fontSize: 12,
          color: s.contains(WidgetState.selected) ? brand : muted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          size: 23,
          color: s.contains(WidgetState.selected) ? brand : muted,
        ),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        textStyle: const WidgetStatePropertyAll(uiLabel),
        side: const WidgetStatePropertyAll(BorderSide.none),
        backgroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? soft : Colors.white,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? brand : muted,
        ),
        minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
        shape: WidgetStatePropertyAll(rounded),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: paper,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: paper,
      surfaceTintColor: Colors.transparent,
      shape: rounded,
      titleTextStyle: text.titleLarge,
      contentTextStyle: text.bodyMedium,
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: soft,
      side: BorderSide.none,
      labelStyle: uiLabel.copyWith(fontSize: 13),
      shape: rounded,
    ),
    tooltipTheme: TooltipThemeData(
      textStyle: uiLabel.copyWith(color: Colors.white, fontSize: 12),
    ),
  );
}
