import 'models.dart';

abstract interface class PaymentPersistence {
  Future<PaymentTransaction?> payment(String id);
  Future<void> savePayment(PaymentTransaction payment);
  Future<List<PaymentTransaction>> pendingPayments();
  Future<SaleRecord?> sale(String key);
}

abstract interface class IPaymentTerminalGateway {
  Future<PaymentTransaction> authorize({
    required String paymentKey,
    required String orderKey,
    required PaymentMethod method,
    required int amountCents,
    void Function(PaymentState)? onProgress,
  });
  Future<PaymentTransaction> confirm(String paymentKey);
  Future<PaymentTransaction> reverse(
    String paymentKey, {
    required String reason,
    String? auditReference,
  });
  Future<int> resolveOrphanPendencies();
}

abstract interface class PrinterGateway {
  bool get simulated;
  Future<PrinterState> status();
  Future<void> printReceipt(
    SaleRecord sale,
    PaymentTransaction payment, {
    bool reprint = false,
  });
}

class PrinterFailure implements Exception {
  const PrinterFailure(
    this.message, {
    this.state = PrinterState.error,
    this.uncertain = false,
  });
  final String message;
  final PrinterState state;
  final bool uncertain;
  @override
  String toString() => message;
}
