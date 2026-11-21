import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'data/bootstrap.dart';
import 'ui/kiosk_controller.dart';
import 'ui/kiosk_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const TotemKioskApp());
}

class TotemKioskApp extends StatefulWidget {
  const TotemKioskApp({super.key, this.controller});
  final KioskController? controller;
  @override
  State<TotemKioskApp> createState() => _TotemKioskAppState();
}

class _TotemKioskAppState extends State<TotemKioskApp> {
  Future<KioskRuntime>? _runtime;
  @override
  void initState() {
    super.initState();
    if (widget.controller == null) _runtime = KioskRuntime.initialize();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Mango Brasil | Autoatendimento',
    debugShowCheckedModeBanner: false,
    theme: kioskTheme(),
    home: widget.controller != null
        ? KioskScreen(controller: widget.controller!)
        : FutureBuilder<KioskRuntime>(
            future: _runtime,
            builder: (context, snapshot) {
              if (snapshot.hasData) {
                return KioskScreen(controller: snapshot.data!.controller);
              }
              if (snapshot.hasError) {
                return Scaffold(
                  body: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 620),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.settings_suggest_outlined,
                              size: 64,
                            ),
                            const SizedBox(height: 24),
                            const Text(
                              'Ativação do totem',
                              style: TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              snapshot.error is FormatException
                                  ? (snapshot.error! as FormatException).message
                                  : 'Não foi possível abrir o armazenamento local. Chame o suporte.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 18),
                            ),
                            const SizedBox(height: 24),
                            FilledButton.icon(
                              onPressed: () => setState(
                                () => _runtime = KioskRuntime.initialize(),
                              ),
                              icon: const Icon(Icons.refresh),
                              label: const Text('Tentar novamente'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }
              return const Scaffold(
                body: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 24),
                      Text('Preparando autoatendimento...'),
                    ],
                  ),
                ),
              );
            },
          ),
  );
  @override
  void dispose() {
    if (widget.controller == null) {
      final runtime = _runtime;
      if (runtime != null) {
        unawaited(
          runtime
              .then((value) async {
                value.controller.dispose();
                await value.store.close();
              })
              .catchError((Object _) {}),
        );
      }
    }
    super.dispose();
  }
}
