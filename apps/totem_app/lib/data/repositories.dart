import 'dart:math';
import 'dart:typed_data';

import 'package:uuid/uuid.dart';

import '../domain/models.dart';
import '../domain/ports.dart';
import 'central_api.dart';
import 'local_store.dart';

class CatalogRepository {
  CatalogRepository(this.store, this.api);
  final LocalStore store;
  final CentralGateway api;
  Future<Catalog?> cached() => store.readCatalog();
  Future<Catalog> refresh() async {
    final catalog = await api.catalog();
    await store.saveCatalog(catalog);
    return catalog;
  }

  Future<Uint8List?> image(String url) async {
    final bytes = await store.readImage(url);
    if (bytes != null) return bytes;
    final client = api;
    if (client is! CentralApi) return null;
    try {
      final downloaded = await client.downloadImage(url);
      await store.cacheImage(url, downloaded);
      return downloaded;
    } on Exception {
      return null;
    }
  }
}

class CheckoutRepository {
  CheckoutRepository({
    required this.store,
    required this.api,
    required this.paymentGateway,
    required this.printer,
    required this.terminalId,
    DateTime Function()? now,
  }) : now = now ?? DateTime.now;
  final LocalStore store;
  final CentralGateway api;
  final IPaymentTerminalGateway paymentGateway;
  final PrinterGateway printer;
  final String terminalId;
  final DateTime Function() now;
  bool _checkingOut = false;
  bool _syncing = false;

  Future<CheckoutResult> checkout(
    List<CartLine> items,
    PaymentMethod method, {
    void Function(PaymentState)? onProgress,
  }) async {
    if (_checkingOut) throw StateError('Um pagamento já está em andamento.');
    if (items.isEmpty) throw ArgumentError('Adicione um item ao pedido.');
    _checkingOut = true;
    final orderKey = const Uuid().v7();
    final paymentKey = const Uuid().v7();
    var printed = false;
    var saved = false;
    String? currentTicket;
    try {
      final payment = await paymentGateway.authorize(
        paymentKey: paymentKey,
        orderKey: orderKey,
        method: method,
        amountCents: items.fold(0, (sum, line) => sum + line.totalCents),
        onProgress: onProgress,
      );
      final createdAt = now();
      final payload = <String, Object?>{
        'idempotencyKey': orderKey,
        'terminalId': terminalId,
        'origin': 'TOTEM',
        'items': items.map((item) => item.toOrderJson()).toList(),
        'payment': {'idempotencyKey': paymentKey, 'method': method.apiValue},
        'offline': {
          'authorizedPayment': payment.toAuthorizationJson(),
          'createdAt': createdAt.toUtc().toIso8601String(),
          'lines': items.map((item) => item.toSnapshotJson()).toList(),
        },
      };
      var sale = await store.createSale(
        key: orderKey,
        paymentKey: paymentKey,
        payload: payload,
        receipt: items.map((item) => item.toReceiptJson()).toList(),
        terminalId: terminalId,
        now: createdAt,
      );
      saved = true;
      currentTicket = sale.ticket;
      var centralAvailable = true;
      try {
        final order = await api.createOrder(payload);
        final ticket = order['publicTicketNumber']?.toString();
        if (ticket == null || ticket.isEmpty) {
          throw const FormatException(
            'A Central não retornou a senha do pedido.',
          );
        }
        await store.assignCentralTicket(orderKey, ticket);
        sale = (await store.sale(orderKey))!;
        currentTicket = sale.ticket;
      } on NetworkUnavailable {
        centralAvailable = false;
      } on ApiProblem catch (problem) {
        if (problem.retryable) {
          centralAvailable = false;
        } else {
          rethrow;
        }
      }
      await store.markPrinting(orderKey);
      await printer.printReceipt(sale, payment);
      printed = true;
      await store.markPrinted(orderKey, now());
      await paymentGateway.confirm(paymentKey);
      onProgress?.call(PaymentState.confirmed);
      await store.markConfirmed(orderKey, now());
      sale = (await store.sale(orderKey))!;
      // The customer already has a durable receipt; acknowledgment never holds the UI.
      return CheckoutResult(
        ticket: sale.ticket,
        orderKey: orderKey,
        offline: !centralAvailable,
      );
    } catch (error) {
      if (error is PrinterFailure && error.uncertain && saved) {
        try {
          await store.markPrintUncertain(orderKey, error.message);
        } finally {
          throw CheckoutRecoveryRequired(
            orderKey,
            ticket: currentTicket,
            printUncertain: true,
          );
        }
      }
      if (!printed) {
        final transaction = await store.payment(paymentKey);
        if (transaction != null &&
            transaction.state != PaymentState.confirmed) {
          await paymentGateway.reverse(
            paymentKey,
            reason: 'Venda não entregue: falha antes da impressão.',
          );
          onProgress?.call(PaymentState.reversed);
        }
        if (saved) {
          await store.cancelSale(orderKey, _safeMessage(error), now());
        }
      }
      // A receipt accepted before a disk failure stays recoverable with the same keys.
      if (printed) {
        throw CheckoutRecoveryRequired(orderKey, ticket: currentTicket);
      }
      rethrow;
    } finally {
      _checkingOut = false;
    }
  }

  Future<void> recover() async {
    await paymentGateway.resolveOrphanPendencies();
    for (var sale in await store.recoverySales()) {
      final payment = await store.payment(sale.paymentKey);
      if (payment == null) {
        throw StateError('Venda local sem pagamento. Chame um atendente.');
      }
      if (payment.state == PaymentState.reversed ||
          payment.state == PaymentState.failed) {
        await store.cancelSale(
          sale.key,
          'Recuperação de venda com autorização desfeita.',
          now(),
        );
        continue;
      }
      if (sale.printedAt == null) {
        final state = await store.printState(sale.key);
        if (state == 'PRINTING' || state == 'UNCERTAIN') {
          await store.markPrintUncertain(
            sale.key,
            'Impressão sem confirmação após interrupção. Conferência presencial obrigatória.',
          );
          continue;
        }
        await store.markPrinting(sale.key);
        try {
          await printer.printReceipt(sale, payment, reprint: true);
        } on PrinterFailure catch (failure) {
          if (failure.uncertain) {
            await store.markPrintUncertain(sale.key, failure.message);
            continue;
          }
          rethrow;
        }
        await store.markPrinted(sale.key, now());
        sale = (await store.sale(sale.key))!;
      }
      if (payment.state != PaymentState.confirmed) {
        await paymentGateway.confirm(payment.id);
      }
      await store.markConfirmed(sale.key, now());
    }
  }

  /// Explicit operator decision: a transport-uncertain print is never retried on boot.
  Future<SaleRecord> resolvePrintReview(
    String key, {
    required bool receiptObserved,
  }) async {
    final sale = await store.sale(key);
    if (sale == null ||
        sale.cancelled ||
        await store.printState(key) != 'UNCERTAIN') {
      throw StateError('O comprovante não está aguardando conferência.');
    }
    final payment = await store.payment(sale.paymentKey);
    if (payment == null || payment.state != PaymentState.authorized) {
      throw StateError('Autorização não está disponível para conferência.');
    }
    if (!receiptObserved) {
      await store.markPrinting(key);
      try {
        await printer.printReceipt(sale, payment, reprint: true);
      } catch (error) {
        // Even a known preflight failure cannot disprove the earlier physical print.
        await store.markPrintUncertain(key, _safeMessage(error));
        rethrow;
      }
    }
    await store.markPrinted(key, now());
    await paymentGateway.confirm(payment.id);
    await store.markConfirmed(key, now());
    return (await store.sale(key))!;
  }

  Future<void> syncPending() async {
    if (_syncing) return;
    _syncing = true;
    try {
      for (final row in await store.dueOutbox(now())) {
        final key = row['idempotency_key']! as String;
        final sale = await store.sale(key);
        if (sale == null) continue;
        try {
          if (row['kind'] == 'CANCELLATION') {
            final acknowledged = await api.acknowledgeReceipt(key, {
              'printed': false,
              'failureReason':
                  row['last_error'] ?? 'Falha local antes da impressão.',
            });
            if (acknowledged['status'] != 'CANCELLED') {
              throw const NetworkUnavailable();
            }
            await store.markSynced(key, now());
            continue;
          }
          if (sale.confirmedAt == null || sale.printedAt == null) continue;
          // Try a direct receipt ACK first when the online order already exists.
          try {
            final acknowledged = await api.acknowledgeReceipt(key, {
              'printed': true,
              'printedAt': sale.printedAt!.toUtc().toIso8601String(),
              if (sale.contingency) 'contingencyTicket': sale.ticket,
            });
            if (jsonObjects(acknowledged['payments']).any(
              (payment) =>
                  payment['idempotencyKey'] == sale.paymentKey &&
                  payment['status'] == 'CONFIRMED',
            )) {
              await store.markSynced(key, now());
              continue;
            }
          } on ApiProblem catch (problem) {
            if (problem.status != 404) rethrow;
          }
          final accepted = await api.syncOrder(sale.syncPayload());
          if (accepted['status'] == 'REJECTED') {
            throw ApiProblem(
              422,
              accepted['errorDetail'] as String? ??
                  'Venda exige conciliação na Central.',
            );
          }
          final order = await api.orderByKey(key);
          final payments = jsonObjects(order['payments']);
          if (!payments.any(
            (payment) =>
                payment['idempotencyKey'] == sale.paymentKey &&
                payment['status'] == 'CONFIRMED',
          )) {
            throw const NetworkUnavailable();
          }
          await store.markSynced(key, now());
        } catch (error) {
          final attempts = integer(row['attempts']) + 1;
          final permanent =
              error is ApiProblem && !error.retryable && error.status != 404;
          final seconds = min(300, pow(2, min(attempts, 8)).toInt());
          await store.failOutbox(
            key,
            attempts: attempts,
            message: _safeMessage(error),
            nextAttempt: now().add(Duration(seconds: seconds)),
            permanent: permanent,
          );
          if (error is NetworkUnavailable) break;
        }
      }
    } finally {
      _syncing = false;
    }
  }

  static String _safeMessage(Object error) => switch (error) {
    ApiProblem(:final message) => message,
    PrinterFailure(:final message) => message,
    NetworkUnavailable() => 'Central indisponível; nova tentativa automática.',
    _ => 'Falha local. Preserve os dados do terminal e chame o suporte.',
  };
}
