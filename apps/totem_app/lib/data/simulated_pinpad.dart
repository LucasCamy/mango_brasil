import 'dart:math';

import '../domain/models.dart';
import '../domain/ports.dart';

/// This adapter never talks to an acquirer and never collects card/PIN data.
/// All states survive process termination through PaymentPersistence.
class SimulatedPinpadAdapter implements IPaymentTerminalGateway {
  SimulatedPinpadAdapter(
    this.store, {
    this.stepDelay = const Duration(milliseconds: 450),
  });
  final PaymentPersistence store;
  final Duration stepDelay;
  final _random = Random.secure();
  final _authorizations = <String, Future<PaymentTransaction>>{};
  final _authorizationIntents = <String, String>{};

  @override
  Future<PaymentTransaction> authorize({
    required String paymentKey,
    required String orderKey,
    required PaymentMethod method,
    required int amountCents,
    void Function(PaymentState)? onProgress,
  }) {
    final intent = '$orderKey|${method.apiValue}|$amountCents';
    final pendingIntent = _authorizationIntents[paymentKey];
    if (pendingIntent != null && pendingIntent != intent) {
      return Future<PaymentTransaction>.error(
        StateError('A chave de pagamento já pertence a outra operação.'),
      );
    }
    _authorizationIntents[paymentKey] = intent;
    return _authorizations
        .putIfAbsent(
          paymentKey,
          () =>
              _authorize(paymentKey, orderKey, method, amountCents, onProgress),
        )
        .whenComplete(() {
          _authorizations.remove(paymentKey);
          _authorizationIntents.remove(paymentKey);
        });
  }

  Future<PaymentTransaction> _authorize(
    String key,
    String orderKey,
    PaymentMethod method,
    int amount,
    void Function(PaymentState)? onProgress,
  ) async {
    if (amount <= 0) throw ArgumentError('Valor de pagamento inválido.');
    var transaction = await store.payment(key);
    if (transaction != null) {
      if (transaction.orderKey != orderKey ||
          transaction.method != method ||
          transaction.amountCents != amount) {
        throw StateError('A chave de pagamento já pertence a outra operação.');
      }
      if ([
        PaymentState.authorized,
        PaymentState.confirmed,
      ].contains(transaction.state)) {
        return transaction;
      }
      if ([
        PaymentState.reversed,
        PaymentState.failed,
      ].contains(transaction.state)) {
        throw StateError('Pagamento já encerrado.');
      }
    }
    var current =
        transaction ??
        PaymentTransaction(
          id: key,
          orderKey: orderKey,
          method: method,
          amountCents: amount,
          state: PaymentState.initializing,
          createdAt: DateTime.now().toUtc(),
        );
    for (final state in [
      PaymentState.initializing,
      PaymentState.waitingCardOrQr,
      PaymentState.processing,
    ]) {
      current = current.withState(state);
      await store.savePayment(current);
      onProgress?.call(state);
      await Future<void>.delayed(stepDelay);
    }
    current = current.withState(
      PaymentState.authorized,
      nsu: _random.nextInt(1000000000).toString().padLeft(9, '0'),
      authorizationCode: _random.nextInt(1000000).toString().padLeft(6, '0'),
    );
    await store.savePayment(current);
    onProgress?.call(PaymentState.authorized);
    return current;
  }

  @override
  Future<PaymentTransaction> confirm(String paymentKey) async {
    final transaction = await _require(paymentKey);
    if (transaction.state == PaymentState.confirmed) return transaction;
    if (transaction.state != PaymentState.authorized) {
      throw StateError('O pagamento precisa estar autorizado.');
    }
    final sale = await store.sale(transaction.orderKey);
    if (sale == null || sale.cancelled || sale.printedAt == null) {
      throw StateError(
        'Persistência e impressão são obrigatórias antes da confirmação.',
      );
    }
    final confirmed = transaction.withState(PaymentState.confirmed);
    await store.savePayment(confirmed);
    return confirmed;
  }

  @override
  Future<PaymentTransaction> reverse(
    String paymentKey, {
    required String reason,
    String? auditReference,
  }) async {
    if (reason.trim().isEmpty) {
      throw ArgumentError('Informe o motivo do desfazimento.');
    }
    final transaction = await _require(paymentKey);
    if (transaction.state == PaymentState.reversed) return transaction;
    if (transaction.state == PaymentState.confirmed &&
        (auditReference == null || auditReference.isEmpty)) {
      throw StateError(
        'Pagamento confirmado exige cancelamento auditado na Central.',
      );
    }
    final reversed = transaction.withState(PaymentState.reversed);
    await store.savePayment(reversed);
    return reversed;
  }

  @override
  Future<int> resolveOrphanPendencies() async {
    var resolved = 0;
    for (final transaction in await store.pendingPayments()) {
      final sale = await store.sale(transaction.orderKey);
      if (sale == null || sale.cancelled) {
        await reverse(
          transaction.id,
          reason: 'Recuperação de autorização sem venda válida após reinicialização.',
        );
        resolved++;
      } else if (sale.printedAt != null &&
          transaction.state == PaymentState.authorized) {
        await confirm(transaction.id);
        resolved++;
      }
      // A persisted sale without print acknowledgment is recovered by CheckoutRepository,
      // using the same payment and ticket. It must never be blindly reversed.
    }
    return resolved;
  }

  Future<PaymentTransaction> _require(String id) async {
    final transaction = await store.payment(id);
    if (transaction == null) throw StateError('Pagamento não encontrado.');
    return transaction;
  }
}
