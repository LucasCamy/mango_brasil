import 'dart:io';

import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:totem_app/data/central_api.dart';
import 'package:totem_app/data/local_store.dart';
import 'package:totem_app/domain/models.dart';
import 'package:totem_app/domain/ports.dart';

const terminalId = '019a4bf0-cc90-7000-8000-000000000001';
const categoryId = '019a4bf0-cc90-7000-8000-000000000002';
const productId = '019a4bf0-cc90-7000-8000-000000000003';
const sizeId = '019a4bf0-cc90-7000-8000-000000000004';
const additionId = '019a4bf0-cc90-7000-8000-000000000005';

Product fixtureProduct({bool withSize = true}) => Product(
  id: productId,
  categoryId: categoryId,
  name: 'Burger da casa',
  description: 'Pão artesanal e queijo.',
  basePriceCents: 2590,
  sizes: withSize
      ? [const ProductSize(id: sizeId, name: 'Duplo', priceModifierCents: 1000)]
      : [],
  additions: [
    const ProductAddition(
      id: additionId,
      name: 'Queijo extra',
      priceCents: 350,
      maxQuantity: 2,
    ),
  ],
  fiscal: FiscalMetadata({
    'ncm': '21069090',
    'cest': '1704900',
    'cfop': '5102',
    'origem': 0,
    'cstCsosn': '102',
    'aliquotaIcms': 0,
    'ibsRate': 0.1,
    'cbsRate': 0.9,
    'aliquotaIbpt': 18.45,
  }),
);
Catalog fixtureCatalog() => Catalog(
  categories: [const Category(id: categoryId, name: 'Burgers')],
  products: [fixtureProduct()],
  version: '1',
);
CartLine fixtureLine() {
  final product = fixtureProduct();
  return CartLine(
    id: 'line-1',
    product: product,
    size: product.sizes.first,
    additions: {additionId: 1},
  );
}

class TestDatabase {
  TestDatabase._(this.directory, this.store);
  final Directory directory;
  LocalStore store;
  static Future<TestDatabase> open() async {
    sqfliteFfiInit();
    final directory = await Directory.systemTemp.createTemp(
      'mango-kiosk-test-',
    );
    final store = await LocalStore.open(
      factory: databaseFactoryFfi,
      path: '${directory.path}/kiosk.sqlite',
    );
    return TestDatabase._(directory, store);
  }

  Future<void> reopen() async {
    await store.close();
    store = await LocalStore.open(
      factory: databaseFactoryFfi,
      path: '${directory.path}/kiosk.sqlite',
    );
  }

  Future<void> close() async {
    await store.close();
    await directory.delete(recursive: true);
  }
}

class FakeCentral implements CentralGateway {
  bool offline = false;
  bool queueOnly = false;
  bool reject = false;
  int createCalls = 0;
  int receiptCalls = 0;
  final Map<String, Json> orders = {};
  final List<Json> submitted = [];
  TerminalState terminal = const TerminalState();
  void _check() {
    if (offline) throw const NetworkUnavailable();
  }

  @override
  Future<Catalog> catalog() async {
    _check();
    return fixtureCatalog();
  }

  @override
  Future<Json> createOrder(Json payload) async {
    _check();
    createCalls++;
    if (reject) throw const ApiProblem(422, 'Produto indisponível.');
    return orders.putIfAbsent(payload['idempotencyKey']! as String, () {
      final payment = payload['payment']! as Json;
      return {
        'id': payload['idempotencyKey'],
        'publicTicketNumber': '042',
        'payments': [
          <String, Object?>{
            'idempotencyKey': payment['idempotencyKey'],
            'status': 'AUTHORIZED',
          },
        ],
      };
    });
  }

  @override
  Future<Json> acknowledgeReceipt(String orderKey, Json receipt) async {
    _check();
    receiptCalls++;
    final order = orders[orderKey];
    if (order == null) {
      return {
        'acknowledged': true,
        'status': receipt['printed'] == true ? 'AWAITING_ORDER' : 'CANCELLED',
      };
    }
    final payment = jsonObjects(order['payments']).first;
    order['payments'] = [
      {
        ...payment,
        'status': receipt['printed'] == true ? 'CONFIRMED' : 'REVERSED',
      },
    ];
    if (receipt['printed'] == false) order['status'] = 'CANCELLED';
    return order;
  }

  @override
  Future<Json> syncOrder(Json payload) async {
    _check();
    submitted.add(payload);
    if (queueOnly) return {'accepted': true, 'status': 'QUEUED'};
    final order = await createOrder(payload);
    final payment = jsonObjects(order['payments']).first;
    order['payments'] = [
      {...payment, 'status': 'CONFIRMED'},
    ];
    return {'accepted': true, 'status': 'PROCESSED', 'orderId': order['id']};
  }

  @override
  Future<Json> orderByKey(String key) async {
    _check();
    final order = orders[key];
    if (order == null) throw const ApiProblem(404, 'Ainda na fila.');
    return order;
  }

  @override
  Future<TerminalState> heartbeat(
    String terminalId,
    PrinterState printer,
  ) async {
    _check();
    return terminal;
  }
}

class FakePrinter implements PrinterGateway {
  bool fail = false;
  bool uncertainFailure = false;
  PrinterState printerState = PrinterState.ready;
  final List<SaleRecord> printed = [];
  @override
  bool get simulated => true;
  @override
  Future<PrinterState> status() async => printerState;
  @override
  Future<void> printReceipt(
    SaleRecord sale,
    PaymentTransaction payment, {
    bool reprint = false,
  }) async {
    if (fail) {
      if (uncertainFailure) printed.add(sale);
      throw PrinterFailure(
        'Impressora sem papel.',
        state: PrinterState.outOfPaper,
        uncertain: uncertainFailure,
      );
    }
    printed.add(sale);
  }
}
