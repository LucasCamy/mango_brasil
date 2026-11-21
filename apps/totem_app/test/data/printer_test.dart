import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:totem_app/data/printer.dart';
import 'package:totem_app/domain/models.dart';
import 'package:totem_app/domain/ports.dart';

import '../support/fakes.dart';

class VirtualPrinter {
  VirtualPrinter._(this.server, this.sensorByte) {
    _subscription = server.listen((socket) {
      sockets.add(socket);
      socket.listen(
        (bytes) {
          if (bytes.length == 3 && bytes[0] == 0x10 && bytes[1] == 0x04) {
            if (sensorByte != null) {
              socket.add([sensorByte!]);
              unawaited(socket.flush());
            }
          } else {
            received.addAll(bytes);
          }
        },
        onDone: socket.destroy,
        onError: (Object _) {
          socket.destroy();
        },
      );
    });
  }
  final ServerSocket server;
  final int? sensorByte;
  late final StreamSubscription<Socket> _subscription;
  final sockets = <Socket>[];
  final received = <int>[];
  static Future<VirtualPrinter> open(int? status) async => VirtualPrinter._(
    await ServerSocket.bind(InternetAddress.loopbackIPv4, 0),
    status,
  );
  TcpEscPosPrinter get gateway => TcpEscPosPrinter(
    host: '127.0.0.1',
    port: server.port,
    timeout: const Duration(milliseconds: 80),
  );
  Future<void> close() async {
    for (final socket in sockets) {
      socket.destroy();
    }
    await _subscription.cancel();
    await server.close();
  }
}

SaleRecord sale() => SaleRecord(
  key: '019a4bf0-cc90-7000-8000-000000000011',
  paymentKey: '019a4bf0-cc90-7000-8000-000000000012',
  payload: {'offline': <String, Object?>{}},
  receipt: [fixtureLine().toReceiptJson()],
  ticket: '042',
  createdAt: DateTime.utc(2026, 11, 21),
);
PaymentTransaction payment() => PaymentTransaction(
  id: sale().paymentKey,
  orderKey: sale().key,
  method: PaymentMethod.pix,
  amountCents: 3940,
  state: PaymentState.authorized,
  createdAt: sale().createdAt,
  nsu: '123456789',
  authorizationCode: '123456',
);

void main() {
  test(
    'TCP consulta sensor e envia comprovante ESC/POS somente com papel',
    () async {
      final printer = await VirtualPrinter.open(0x12);
      addTearDown(printer.close);
      expect(await printer.gateway.status(), PrinterState.ready);
      await printer.gateway.printReceipt(sale(), payment());
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(printer.received.take(2), [0x1b, 0x40]);
      expect(
        ascii.decode(printer.received, allowInvalid: true),
        contains('SENHA 042'),
      );
      expect(
        ascii.decode(printer.received, allowInvalid: true),
        contains('PAGAMENTO SIMULADO'),
      );
    },
  );
  test('sensor sem papel bloqueia transporte antes de enviar venda', () async {
    final printer = await VirtualPrinter.open(0x72);
    addTearDown(printer.close);
    expect(await printer.gateway.status(), PrinterState.outOfPaper);
    await expectLater(
      printer.gateway.printReceipt(sale(), payment()),
      throwsA(
        isA<PrinterFailure>().having(
          (e) => e.state,
          'state',
          PrinterState.outOfPaper,
        ),
      ),
    );
    expect(printer.received, isEmpty);
  });
  test(
    'timeout do sensor falha com prazo limitado sem confirmar impressão',
    () async {
      final printer = await VirtualPrinter.open(null);
      addTearDown(printer.close);
      expect(await printer.gateway.status(), PrinterState.error);
      await expectLater(
        printer.gateway.printReceipt(sale(), payment()),
        throwsA(isA<PrinterFailure>()),
      );
      expect(printer.received, isEmpty);
    },
  );
}
