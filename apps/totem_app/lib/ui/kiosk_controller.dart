import 'dart:async';
import 'dart:collection';

import 'package:flutter/foundation.dart';

import '../data/central_api.dart';
import '../data/local_store.dart';
import '../data/repositories.dart';
import '../domain/models.dart';
import '../domain/ports.dart';

enum KioskPage { attract, catalog, payment, success, review }

class KioskController extends ChangeNotifier {
  KioskController({
    required this.catalogRepository,
    required this.checkoutRepository,
    required this.api,
    required this.store,
    required this.printer,
    required this.terminalId,
    this.idleTimeout = const Duration(seconds: 45),
    this.idleWarning = const Duration(seconds: 15),
    this.backgroundInterval = const Duration(seconds: 15),
    DateTime Function()? now,
  }) : now = now ?? DateTime.now;
  final CatalogRepository catalogRepository;
  final CheckoutRepository checkoutRepository;
  final CentralGateway api;
  final LocalStore store;
  final PrinterGateway printer;
  final String terminalId;
  final Duration idleTimeout;
  final Duration idleWarning;
  final Duration backgroundInterval;
  final DateTime Function() now;
  Timer? _idleTimer;
  Timer? _backgroundTimer;
  bool _disposed = false;
  bool _backgroundRunning = false;
  DateTime? _lastActivity;
  final _cart = <CartLine>[];
  List<CartLine> get cart => UnmodifiableListView(_cart);
  Catalog? catalog;
  KioskPage page = KioskPage.attract;
  TerminalState terminal = const TerminalState();
  bool loading = true;
  bool online = true;
  bool busy = false;
  bool recoveryRequired = false;
  String? error;
  String? categoryId;
  int pendingSync = 0;
  int reviewSync = 0;
  int printReviewCount = 0;
  final _imageFutures = <String, Future<Uint8List?>>{};
  int? idleSeconds;
  PaymentState? paymentState;
  CheckoutResult? result;
  int get totalCents => _cart.fold(0, (sum, line) => sum + line.totalCents);
  List<Product> get visibleProducts =>
      catalog?.products
          .where(
            (p) =>
                p.active &&
                p.availableInKiosk &&
                (categoryId == null || p.categoryId == categoryId),
          )
          .toList() ??
      [];

  Future<void> initialize({bool startTimers = true}) async {
    loading = true;
    error = null;
    _notify();
    try {
      catalog = await catalogRepository.cached();
      terminal = await store.readTerminal() ?? const TerminalState();
      await checkoutRepository.recover();
      recoveryRequired = false;
      pendingSync = await store.pendingCount();
      printReviewCount = (await store.printReviews()).length;
      loading = catalog == null;
      _notify();
      await refreshCatalog();
      await refreshTerminal();
    } catch (exception) {
      error = _message(exception);
      recoveryRequired =
          exception is PrinterFailure || exception is CheckoutRecoveryRequired;
    } finally {
      loading = false;
      _notify();
    }
    if (startTimers && !_disposed) {
      _idleTimer ??= Timer.periodic(const Duration(seconds: 1), (_) => tick());
      _backgroundTimer ??= Timer.periodic(
        backgroundInterval,
        (_) => unawaited(background()),
      );
      unawaited(background());
    }
  }

  Future<void> refreshCatalog() async {
    try {
      catalog = await catalogRepository.refresh();
      _imageFutures.clear();
      online = true;
      if (error == 'Aguardando a primeira sincronização do cardápio.') {
        error = null;
      }
    } on Exception {
      online = false;
      if (catalog == null) {
        error = 'Aguardando a primeira sincronização do cardápio.';
      }
    }
    _notify();
  }

  Future<void> refreshTerminal() async {
    final printerState = await printer.status();
    try {
      final state = await api.heartbeat(terminalId, printerState);
      terminal = TerminalState(
        maintenance: state.maintenance,
        message: state.message,
        printer: printerState,
      );
      await store.saveTerminal(terminal);
      online = true;
    } on Exception {
      online = false;
      // Preserve a maintenance instruction until a successful heartbeat removes it.
      terminal = TerminalState(
        maintenance: terminal.maintenance,
        message: terminal.message,
        printer: printerState,
      );
    }
    _notify();
  }

  Future<void> background() async {
    if (_backgroundRunning || busy || _disposed) return;
    _backgroundRunning = true;
    try {
      await checkoutRepository.syncPending();
      pendingSync = await store.pendingCount();
      reviewSync = await store.reviewCount();
      printReviewCount = (await store.printReviews()).length;
      await refreshTerminal();
      if (online) await refreshCatalog();
    } on Exception {
      online = false;
    } finally {
      _backgroundRunning = false;
      _notify();
    }
  }

  void startShopping() {
    if (busy ||
        terminal.blocksSales ||
        recoveryRequired ||
        catalog == null ||
        loading) {
      return;
    }
    _cart.clear();
    result = null;
    error = null;
    categoryId = null;
    page = KioskPage.catalog;
    activity();
    _notify();
  }

  void selectCategory(String? id) {
    categoryId = id;
    activity();
    _notify();
  }

  void addLine(CartLine line) {
    if (busy || terminal.blocksSales) return;
    _cart.add(line);
    activity();
    _notify();
  }

  void changeQuantity(String id, int quantity) {
    if (busy) return;
    final index = _cart.indexWhere((line) => line.id == id);
    if (index < 0) return;
    if (quantity <= 0) {
      _cart.removeAt(index);
    } else if (quantity <= 99) {
      _cart[index] = _cart[index].withQuantity(quantity);
    }
    activity();
    _notify();
  }

  void showPayment() {
    if (_cart.isEmpty || terminal.blocksSales || busy) return;
    error = null;
    page = KioskPage.payment;
    activity();
    _notify();
  }

  void backToCatalog() {
    if (!busy) {
      page = KioskPage.catalog;
      error = null;
      activity();
      _notify();
    }
  }

  void reset() {
    if (busy) return;
    _cart.clear();
    page = KioskPage.attract;
    result = null;
    paymentState = null;
    error = null;
    _lastActivity = null;
    idleSeconds = null;
    _notify();
  }

  void activity() {
    if (busy || idleSeconds != null) return;
    _lastActivity = now();
    idleSeconds = null;
  }

  void continueShopping() {
    _lastActivity = now();
    idleSeconds = null;
    _notify();
  }

  void tick() {
    if (busy || page == KioskPage.attract || _lastActivity == null) return;
    final elapsed = now().difference(_lastActivity!);
    if (page == KioskPage.success || page == KioskPage.review) {
      if (elapsed >= const Duration(seconds: 20)) reset();
      return;
    }
    if (elapsed >= idleTimeout + idleWarning) {
      reset();
    } else if (elapsed >= idleTimeout) {
      idleSeconds = (idleTimeout + idleWarning - elapsed).inSeconds.clamp(
        0,
        idleWarning.inSeconds,
      );
      _notify();
    }
  }

  Future<void> pay(PaymentMethod method) async {
    if (busy || _cart.isEmpty || terminal.blocksSales || recoveryRequired) {
      return;
    }
    busy = true;
    error = null;
    idleSeconds = null;
    _notify();
    try {
      result = await checkoutRepository.checkout(
        List.of(_cart),
        method,
        onProgress: (state) {
          paymentState = state;
          _notify();
        },
      );
      _cart.clear();
      page = KioskPage.success;
      _lastActivity = now();
      pendingSync = await store.pendingCount();
    } on CheckoutRecoveryRequired catch (exception) {
      _cart.clear();
      if (exception.printUncertain) {
        result = CheckoutResult(
          ticket: exception.ticket ?? exception.orderKey,
          orderKey: exception.orderKey,
          offline: !online,
        );
        page = KioskPage.review;
        _lastActivity = now();
        printReviewCount++;
      } else {
        recoveryRequired = true;
        error = exception.toString();
      }
    } on PrinterFailure catch (exception) {
      terminal = TerminalState(
        maintenance: terminal.maintenance,
        message: terminal.message,
        printer: exception.state,
      );
      error = exception.message;
    } catch (exception) {
      error = _message(exception);
    } finally {
      busy = false;
      _notify();
    }
    unawaited(background());
  }

  Future<void> recoverAndRetry() async {
    if (busy) return;
    busy = true;
    error = null;
    _notify();
    try {
      await checkoutRepository.recover();
      printReviewCount = (await store.printReviews()).length;
      recoveryRequired = false;
      _cart.clear();
      page = KioskPage.attract;
      await refreshTerminal();
    } catch (exception) {
      recoveryRequired = true;
      error = _message(exception);
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<Uint8List?> productImage(String? url) {
    if (url == null || url.isEmpty) return Future<Uint8List?>.value();
    if (!_imageFutures.containsKey(url) && _imageFutures.length >= 32) {
      _imageFutures.remove(_imageFutures.keys.first);
    }
    return _imageFutures.putIfAbsent(url, () => catalogRepository.image(url));
  }

  Future<List<SaleRecord>> printReviewSales() => store.printReviews();
  Future<void> resolvePrintReview(
    String key, {
    required bool receiptObserved,
  }) async {
    if (busy) throw StateError('Aguarde o atendimento em andamento.');
    busy = true;
    error = null;
    _notify();
    try {
      final sale = await checkoutRepository.resolvePrintReview(
        key,
        receiptObserved: receiptObserved,
      );
      printReviewCount = (await store.printReviews()).length;
      if (page == KioskPage.review && result?.orderKey == key) {
        result = CheckoutResult(
          ticket: sale.ticket,
          orderKey: key,
          offline: !online,
        );
        page = KioskPage.success;
      }
    } finally {
      busy = false;
      _notify();
      unawaited(background());
    }
  }

  static String _message(Object exception) => switch (exception) {
    ApiProblem(:final message) => message,
    PrinterFailure(:final message) => message,
    CheckoutRecoveryRequired() => exception.toString(),
    _ => 'Não foi possível concluir. Chame um atendente ou tente novamente.',
  };
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _idleTimer?.cancel();
    _backgroundTimer?.cancel();
    super.dispose();
  }
}
