import 'package:material_ui/material_ui.dart';

abstract final class KioskColors {
  static const background = Color(0xfff7f5ee);
  static const surface = Color(0xffffffff);
  static const subtle = Color(0xffedeae1);
  static const ink = Color(0xff242b25);
  static const muted = Color(0xff596357);
  static const line = Color(0xffd8dcd0);
  static const action = Color(0xff365b35);
  static const selected = Color(0xffe1eadb);
  static const warning = Color(0xff805000);
  static const destructive = Color(0xffa32b28);
  static const success = Color(0xff25613c);
}

const dataStyle = TextStyle(
  fontFamily: 'monospace',
  fontFeatures: [FontFeature.tabularFigures()],
  fontWeight: FontWeight.w600,
);

ThemeData kioskTheme() => ThemeData(
  useMaterial3: true,
  scaffoldBackgroundColor: KioskColors.background,
  colorScheme: const ColorScheme.light(
    primary: KioskColors.action,
    onPrimary: KioskColors.surface,
    primaryContainer: KioskColors.selected,
    onPrimaryContainer: KioskColors.action,
    secondary: KioskColors.action,
    onSecondary: KioskColors.surface,
    secondaryContainer: KioskColors.selected,
    onSecondaryContainer: KioskColors.action,
    surface: KioskColors.surface,
    onSurface: KioskColors.ink,
    onSurfaceVariant: KioskColors.muted,
    surfaceContainerHighest: KioskColors.subtle,
    surfaceContainerHigh: KioskColors.subtle,
    surfaceContainer: KioskColors.surface,
    surfaceContainerLow: KioskColors.surface,
    surfaceContainerLowest: KioskColors.surface,
    surfaceTint: Colors.transparent,
    error: KioskColors.destructive,
    onError: KioskColors.surface,
    outline: KioskColors.line,
  ),
  textTheme: ThemeData.light().textTheme.apply(
    bodyColor: KioskColors.ink,
    displayColor: KioskColors.ink,
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      minimumSize: const Size(56, 60),
      textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      minimumSize: const Size(56, 56),
      textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
  ),
  iconButtonTheme: IconButtonThemeData(
    style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: KioskColors.surface,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    contentPadding: const EdgeInsets.all(18),
  ),
  visualDensity: VisualDensity.standard,
);
