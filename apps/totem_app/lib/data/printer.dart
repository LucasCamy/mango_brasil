import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;

import '../domain/models.dart';
import '../domain/ports.dart';

String receiptMoney(int cents) =>
    'R\$ ${(cents / 100).toStringAsFixed(2).replaceAll('.', ',')}';

Uint8List escPosReceipt(
  SaleRecord sale,
  PaymentTransaction payment, {
  required bool simulated,
  bool reprint = false,
}) {
  final text = StringBuffer()
    ..writeln('MANGO BRASIL')
    ..writeln('COMPROVANTE NAO FISCAL')
    ..writeln('PAGAMENTO SIMULADO - SEM COBRANCA REAL')
    ..writeln(simulated ? 'IMPRESSAO SIMULADA EM ARQUIVO' : 'AUTOATENDIMENTO')
    ..writeln('SENHA ${sale.ticket}')
    ..writeln(sale.contingency ? 'VENDA EM CONTINGENCIA' : 'PEDIDO CENTRAL')
    ..writeln(reprint ? 'REIMPRESSAO: MESMO PEDIDO E SENHA' : '')
    ..writeln('--------------------------------');
  for (final line in sale.receipt) {
    text.writeln('${line['quantity']}x ${line['name']}');
    if (line['sizeName'] != null) text.writeln('Tamanho: ${line['sizeName']}');
    for (final addition in jsonObjects(line['additions'])) {
      text.writeln('+ ${addition['quantity']}x ${addition['name']}');
    }
    if ((line['notes'] as String?)?.isNotEmpty ?? false) {
      text.writeln('Obs: ${line['notes']}');
    }
    text.writeln(receiptMoney(integer(line['totalCents'])));
  }
  text
    ..writeln('--------------------------------')
    ..writeln('TOTAL ${receiptMoney(payment.amountCents)}')
    ..writeln('${payment.method.label} | NSU ${payment.nsu}')
    ..writeln('Autorizacao ${payment.authorizationCode}')
    ..writeln(sale.createdAt.toLocal().toIso8601String())
    ..writeln('Pedido ${sale.key}')
    ..writeln('\n\n');
  // ASCII avoids broken multibyte glyphs on legacy ESC/POS code pages.
  final normalized = text
      .toString()
      .replaceAll(RegExp('[áàâãä]'), 'a')
      .replaceAll(RegExp('[éèêë]'), 'e')
      .replaceAll(RegExp('[íìîï]'), 'i')
      .replaceAll(RegExp('[óòôõö]'), 'o')
      .replaceAll(RegExp('[úùûü]'), 'u')
      .replaceAll('ç', 'c')
      .replaceAll('Crédito', 'Credito')
      .replaceAll('Débito', 'Debito')
      .replaceAll(RegExp(r'[^\x20-\x7E\n]'), '?');
  return Uint8List.fromList([
    0x1b,
    0x40,
    0x1b,
    0x61,
    0,
    ...ascii.encode(normalized),
    0x1d,
    0x56,
    0x41,
    0,
  ]);
}

class TcpEscPosPrinter implements PrinterGateway {
  const TcpEscPosPrinter({
    required this.host,
    this.port = 9100,
    this.timeout = const Duration(milliseconds: 1800),
  });
  final String host;
  final int port;
  final Duration timeout;
  @override
  bool get simulated => false;

  Future<(Socket, Stream<Uint8List>)> _connect() async {
    final socket = await Socket.connect(host, port, timeout: timeout);
    return (socket, socket.asBroadcastStream());
  }

  Future<PrinterState> _paperState(
    Socket socket,
    Stream<Uint8List> responses,
  ) async {
    final response = responses.first.timeout(timeout);
    socket.add([0x10, 0x04, 0x04]); // ESC/POS DLE EOT 4: paper sensor status.
    await socket.flush();
    final bytes = await response;
    if (bytes.isEmpty) return PrinterState.error;
    return (bytes.first & 0x60) != 0
        ? PrinterState.outOfPaper
        : PrinterState.ready;
  }

  @override
  Future<PrinterState> status() async {
    Socket? socket;
    try {
      final connection = await _connect();
      socket = connection.$1;
      return await _paperState(socket, connection.$2);
    } on Exception {
      return PrinterState.error;
    } finally {
      socket?.destroy();
    }
  }

  @override
  Future<void> printReceipt(
    SaleRecord sale,
    PaymentTransaction payment, {
    bool reprint = false,
  }) async {
    Socket? socket;
    var saleBytesStarted = false;
    try {
      final connection = await _connect();
      socket = connection.$1;
      final paper = await _paperState(socket, connection.$2);
      if (paper != PrinterState.ready) {
        throw PrinterFailure(
          'A impressora está sem papel. Chame um atendente.',
          state: paper,
        );
      }
      saleBytesStarted = true;
      socket.add(
        escPosReceipt(sale, payment, simulated: false, reprint: reprint),
      );
      await socket.flush().timeout(timeout);
      await socket.close().timeout(timeout);
    } on PrinterFailure {
      rethrow;
    } on Exception {
      throw PrinterFailure(
        'A impressora não confirmou o recebimento. Chame um atendente.',
        uncertain: saleBytesStarted,
      );
    } finally {
      socket?.destroy();
    }
  }
}

/// Explicit development adapter. Saving a file is never presented as a physical print.
class SpoolSimulationPrinter implements PrinterGateway {
  const SpoolSimulationPrinter(this.directory);
  final Directory directory;
  @override
  bool get simulated => true;
  @override
  Future<PrinterState> status() async {
    try {
      await directory.create(recursive: true);
      return PrinterState.ready;
    } on FileSystemException {
      return PrinterState.error;
    }
  }

  @override
  Future<void> printReceipt(
    SaleRecord sale,
    PaymentTransaction payment, {
    bool reprint = false,
  }) async {
    try {
      await directory.create(recursive: true);
      final file = File(
        p.join(
          directory.path,
          '${sale.key}${reprint ? '-reprint' : ''}.escpos',
        ),
      );
      await file.writeAsBytes(
        escPosReceipt(sale, payment, simulated: true, reprint: reprint),
        flush: true,
      );
    } on FileSystemException {
      throw const PrinterFailure(
        'Não foi possível salvar o comprovante simulado.',
      );
    }
  }
}
