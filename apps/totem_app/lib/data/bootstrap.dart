import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart' as mobile;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../domain/ports.dart';
import '../ui/kiosk_controller.dart';
import 'central_api.dart';
import 'local_store.dart';
import 'printer.dart';
import 'repositories.dart';
import 'simulated_pinpad.dart';

class KioskRuntime {
  const KioskRuntime(this.controller, this.store);
  final KioskController controller;
  final LocalStore store;
  static Future<KioskRuntime> initialize() async {
    if (kIsWeb) {
      throw UnsupportedError(
        'O totem offline usa SQLite nativo. Execute no Android, Windows ou Linux.',
      );
    }
    const token = String.fromEnvironment('TERMINAL_TOKEN');
    const terminalId = String.fromEnvironment('TERMINAL_ID');
    const apiBase = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://127.0.0.1:4000',
    );
    const printerMode = String.fromEnvironment(
      'PRINTER_MODE',
      defaultValue: 'tcp',
    );
    const printerHost = String.fromEnvironment('PRINTER_HOST');
    const printerPort = int.fromEnvironment('PRINTER_PORT', defaultValue: 9100);
    const idleSeconds = int.fromEnvironment('IDLE_SECONDS', defaultValue: 45);
    if (token.isEmpty || terminalId.isEmpty) {
      throw const FormatException(
        'Configure TERMINAL_ID e TERMINAL_TOKEN para ativar este totem.',
      );
    }
    if (printerMode != 'tcp' && printerMode != 'spool') {
      throw const FormatException('PRINTER_MODE deve ser tcp ou spool.');
    }
    if (printerMode == 'tcp' && printerHost.isEmpty) {
      throw const FormatException(
        'Configure PRINTER_HOST ou escolha explicitamente PRINTER_MODE=spool para simulação.',
      );
    }
    final baseUri = Uri.parse(apiBase);
    if (!baseUri.hasAuthority || !['http', 'https'].contains(baseUri.scheme)) {
      throw const FormatException('API_BASE_URL inválida.');
    }
    final directory = await getApplicationSupportDirectory();
    await directory.create(recursive: true);
    final factory = Platform.isWindows || Platform.isLinux
        ? databaseFactoryFfi
        : mobile.databaseFactory;
    if (Platform.isWindows || Platform.isLinux) sqfliteFfiInit();
    final store = await LocalStore.open(
      factory: factory,
      path: p.join(directory.path, 'mango-kiosk.sqlite'),
    );
    final api = CentralApi(baseUri: baseUri, token: token);
    final PrinterGateway printer = printerMode == 'spool'
        ? SpoolSimulationPrinter(
            Directory(p.join(directory.path, 'simulated-receipts')),
          )
        : TcpEscPosPrinter(host: printerHost, port: printerPort);
    final checkout = CheckoutRepository(
      store: store,
      api: api,
      paymentGateway: SimulatedPinpadAdapter(store),
      printer: printer,
      terminalId: terminalId,
    );
    final controller = KioskController(
      catalogRepository: CatalogRepository(store, api),
      checkoutRepository: checkout,
      api: api,
      store: store,
      printer: printer,
      terminalId: terminalId,
      idleTimeout: Duration(seconds: idleSeconds.clamp(15, 600)),
    );
    unawaited(controller.initialize());
    return KioskRuntime(controller, store);
  }
}
