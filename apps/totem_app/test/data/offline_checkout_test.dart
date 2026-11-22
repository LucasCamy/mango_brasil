import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:totem_app/data/repositories.dart';
import 'package:totem_app/data/simulated_pinpad.dart';
import 'package:totem_app/domain/models.dart';
import 'package:totem_app/domain/ports.dart';
import 'package:uuid/uuid.dart';

import '../support/fakes.dart';

void main() {
  late TestDatabase database;
  late FakeCentral central;
  late FakePrinter printer;
  late SimulatedPinpadAdapter pinpad;
  late CheckoutRepository checkout;
  var clock = DateTime.utc(2026, 11, 21, 12);
  setUp(() async {
    database = await TestDatabase.open();
    central = FakeCentral();
    printer = FakePrinter();
    pinpad = SimulatedPinpadAdapter(database.store, stepDelay: Duration.zero);
    clock = DateTime.utc(2026, 11, 21, 12);
    checkout = CheckoutRepository(
      store: database.store,
      api: central,
      paymentGateway: pinpad,
      printer: printer,
      terminalId: terminalId,
      now: () => clock,
    );
  });
  tearDown(() => database.close());

  test('catálogo, fiscais e imagens persistem após reiniciar SQLite', () async {
    await database.store.saveCatalog(fixtureCatalog());
    await database.store.cacheImage(
      '/image.webp',
      Uint8List.fromList([1, 2, 3]),
    );
    await database.store.saveTerminal(
      const TerminalState(maintenance: true, message: 'Manutenção programada'),
    );
    await database.reopen();
    final catalog = (await database.store.readCatalog())!;
    expect(catalog.products.first.sizes.first.id, sizeId);
    expect(catalog.products.first.fiscal.values['ibsRate'], .1);
    expect(await database.store.readImage('/image.webp'), [1, 2, 3]);
    expect((await database.store.readTerminal())!.maintenance, isTrue);
  });

  test(
    'impressão incerta mantém autorização e nunca reimprime ou cancela no boot',
    () async {
      central.offline = true;
      printer.fail = true;
      printer.uncertainFailure = true;
      await expectLater(
        checkout.checkout([fixtureLine()], PaymentMethod.pix),
        throwsA(
          isA<CheckoutRecoveryRequired>().having(
            (error) => error.printUncertain,
            'uncertain',
            isTrue,
          ),
        ),
      );
      final sale = (await database.store.printReviews()).single;
      expect(sale.cancelled, isFalse);
      expect(sale.confirmedAt, isNull);
      expect(
        (await database.store.payment(sale.paymentKey))!.state,
        PaymentState.authorized,
      );
      await checkout.recover();
      await checkout.recover();
      await checkout.syncPending();
      expect(printer.printed, hasLength(1));
      expect(central.createCalls, 0);
      expect(await database.store.printState(sale.key), 'UNCERTAIN');
      await checkout.resolvePrintReview(sale.key, receiptObserved: true);
      expect(printer.printed, hasLength(1));
      expect(
        (await database.store.payment(sale.paymentKey))!.state,
        PaymentState.confirmed,
      );
      central.offline = false;
      await checkout.syncPending();
      expect(await database.store.pendingCount(), 0);
    },
  );

  test(
    'checkpoint interrompido exige reimpressão explícita com a mesma chave',
    () async {
      final key = const Uuid().v7(), paymentKey = const Uuid().v7();
      final payment = await pinpad.authorize(
        paymentKey: paymentKey,
        orderKey: key,
        method: PaymentMethod.pix,
        amountCents: 3940,
      );
      await database.store.createSale(
        key: key,
        paymentKey: paymentKey,
        payload: {
          'offline': {'authorizedPayment': payment.toAuthorizationJson()},
        },
        receipt: [fixtureLine().toReceiptJson()],
        terminalId: terminalId,
        now: clock,
      );
      await database.store.markPrinting(key);
      await checkout.recover();
      expect(printer.printed, isEmpty);
      expect(await database.store.printState(key), 'UNCERTAIN');
      await checkout.resolvePrintReview(key, receiptObserved: false);
      expect(printer.printed.single.key, key);
      expect(
        (await database.store.payment(paymentKey))!.state,
        PaymentState.confirmed,
      );
    },
  );

  test(
    'autorizações concorrentes com a mesma chave não aceitam outro valor',
    () async {
      final key = const Uuid().v7();
      final orderKey = const Uuid().v7();
      final first = pinpad.authorize(
        paymentKey: key,
        orderKey: orderKey,
        method: PaymentMethod.pix,
        amountCents: 1000,
      );
      await expectLater(
        pinpad.authorize(
          paymentKey: key,
          orderKey: orderKey,
          method: PaymentMethod.pix,
          amountCents: 1001,
        ),
        throwsStateError,
      );
      expect((await first).amountCents, 1000);
    },
  );

  test(
    '2PC impede confirmar sem venda impressa e desfaz pendência órfã no boot',
    () async {
      final paymentKey = const Uuid().v7();
      final orderKey = const Uuid().v7();
      final states = <PaymentState>[];
      final payment = await pinpad.authorize(
        paymentKey: paymentKey,
        orderKey: orderKey,
        method: PaymentMethod.pix,
        amountCents: 1000,
        onProgress: states.add,
      );
      expect(states, [
        PaymentState.initializing,
        PaymentState.waitingCardOrQr,
        PaymentState.processing,
        PaymentState.authorized,
      ]);
      expect(
        (await pinpad.authorize(
          paymentKey: paymentKey,
          orderKey: orderKey,
          method: PaymentMethod.pix,
          amountCents: 1000,
        )).nsu,
        payment.nsu,
      );
      await expectLater(pinpad.confirm(paymentKey), throwsStateError);
      await database.reopen();
      final recovered = SimulatedPinpadAdapter(
        database.store,
        stepDelay: Duration.zero,
      );
      expect(await recovered.resolveOrphanPendencies(), 1);
      expect(
        (await database.store.payment(paymentKey))!.state,
        PaymentState.reversed,
      );
    },
  );

  test(
    'offline imprime, confirma local e sincroniza uma vez com mesma UUIDv7',
    () async {
      central.offline = true;
      final result = await checkout.checkout([
        fixtureLine(),
      ], PaymentMethod.creditCard);
      final sale = (await database.store.sale(result.orderKey))!;
      expect(result.offline, isTrue);
      expect(result.ticket, contains('-261121-0001'));
      expect(result.orderKey[14], '7');
      expect(sale.printedAt, isNotNull);
      expect(sale.confirmedAt, isNotNull);
      expect(
        (await database.store.payment(sale.paymentKey))!.state,
        PaymentState.confirmed,
      );
      expect(printer.printed, hasLength(1));
      expect(await database.store.pendingCount(), 1);
      expect(
        jsonObjects((sale.payload['offline']! as Json)['lines'])
            .first['totalCents'],
        3940,
      );
      central.offline = false;
      await checkout.syncPending();
      await checkout.syncPending();
      expect(central.orders, hasLength(1));
      expect(await database.store.pendingCount(), 0);
      expect(central.submitted.single['idempotencyKey'], result.orderKey);
    },
  );

  test(
    '202 do broker não remove outbox antes de confirmação persistida',
    () async {
      central.offline = true;
      final result = await checkout.checkout([
        fixtureLine(),
      ], PaymentMethod.pix);
      central.offline = false;
      central.queueOnly = true;
      await checkout.syncPending();
      expect(await database.store.pendingCount(), 1);
      expect((await database.store.sale(result.orderKey))!.syncedAt, isNull);
      central.queueOnly = false;
      clock = clock.add(const Duration(seconds: 10));
      await checkout.syncPending();
      expect(await database.store.pendingCount(), 0);
    },
  );

  test('venda online usa senha central e confirma após impressão', () async {
    final result = await checkout.checkout([
      fixtureLine(),
    ], PaymentMethod.debitCard);
    expect(result.ticket, '042');
    expect(result.offline, isFalse);
    final sale = (await database.store.sale(result.orderKey))!;
    expect(sale.contingency, isFalse);
    expect(
      jsonObjects(central.orders[result.orderKey]!['payments']).first['status'],
      'AUTHORIZED',
    );
    await checkout.syncPending();
    expect(
      jsonObjects(central.orders[result.orderKey]!['payments']).first['status'],
      'CONFIRMED',
    );
  });

  test(
    'falha de impressão desfaz pagamento e cancela pedido técnico na Central',
    () async {
      printer.fail = true;
      await expectLater(
        checkout.checkout([fixtureLine()], PaymentMethod.pix),
        throwsA(isA<PrinterFailure>()),
      );
      final orderKey = central.orders.keys.single;
      final sale = (await database.store.sale(orderKey))!;
      expect(sale.cancelled, isTrue);
      expect(sale.printedAt, isNull);
      expect(
        (await database.store.payment(sale.paymentKey))!.state,
        PaymentState.reversed,
      );
      await checkout.syncPending();
      expect(
        jsonObjects(central.orders[orderKey]!['payments']).first['status'],
        'REVERSED',
      );
      expect(await database.store.pendingCount(), 0);
    },
  );

  test(
    'boot recupera pedido salvo com mesma senha e não reverte venda impressa',
    () async {
      final orderKey = const Uuid().v7();
      final paymentKey = const Uuid().v7();
      final payment = await pinpad.authorize(
        paymentKey: paymentKey,
        orderKey: orderKey,
        method: PaymentMethod.pix,
        amountCents: 3940,
      );
      final sale = await database.store.createSale(
        key: orderKey,
        paymentKey: paymentKey,
        payload: {
          'idempotencyKey': orderKey,
          'payment': {'idempotencyKey': paymentKey},
          'offline': {'authorizedPayment': payment.toAuthorizationJson()},
        },
        receipt: [fixtureLine().toReceiptJson()],
        terminalId: terminalId,
        now: clock,
      );
      await checkout.syncPending();
      expect(central.createCalls, 0);
      await checkout.recover();
      expect(printer.printed.single.ticket, sale.ticket);
      expect(
        (await database.store.payment(paymentKey))!.state,
        PaymentState.confirmed,
      );
      expect((await database.store.sale(orderKey))!.confirmedAt, isNotNull);
      await checkout.recover();
      expect(printer.printed, hasLength(1));
      await expectLater(
        pinpad.reverse(paymentKey, reason: 'Sem autorização comercial'),
        throwsStateError,
      );
    },
  );
}
