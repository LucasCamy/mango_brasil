import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:totem_app/data/repositories.dart';
import 'package:totem_app/data/simulated_pinpad.dart';
import 'package:totem_app/main.dart';
import 'package:totem_app/domain/models.dart';
import 'package:totem_app/ui/kiosk_controller.dart';
import 'package:totem_app/ui/kiosk_screen.dart';

import 'support/fakes.dart';

void main() {
  late TestDatabase database;
  late FakeCentral central;
  late FakePrinter printer;
  late KioskController controller;
  var clock = DateTime.utc(2026, 11, 21, 12);
  setUp(() async {
    database = await TestDatabase.open();
    central = FakeCentral();
    printer = FakePrinter();
    clock = DateTime.utc(2026, 11, 21, 12);
    final checkout = CheckoutRepository(
      store: database.store,
      api: central,
      paymentGateway: SimulatedPinpadAdapter(
        database.store,
        stepDelay: Duration.zero,
      ),
      printer: printer,
      terminalId: terminalId,
      now: () => clock,
    );
    controller = KioskController(
      catalogRepository: CatalogRepository(database.store, central),
      checkoutRepository: checkout,
      api: central,
      store: database.store,
      printer: printer,
      terminalId: terminalId,
      now: () => clock,
    );
    await controller.initialize(startTimers: false);
  });
  tearDown(() async {
    controller.dispose();
    await database.close();
  });

  for (final size in [
    const Size(360, 800),
    const Size(768, 1024),
    const Size(1080, 1920),
  ]) {
    testWidgets('catálogo e montagem sem overflow em ${size.width.toInt()}px', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(TotemKioskApp(controller: controller));
      await tester.tap(find.text('Toque para começar'));
      await tester.pumpAndSettle();
      expect(find.text('O que vai ser hoje?'), findsOneWidget);
      await tester.tap(find.text('Burger da casa'));
      await tester.pumpAndSettle();
      expect(find.byType(ProductConfigurationDialog), findsOneWidget);
      await tester.ensureVisible(find.text('Adicionar · R\$ 25,90'));
      await tester.tap(find.text('Adicionar · R\$ 25,90'));
      await tester.pump();
      expect(find.text('Escolha um tamanho para continuar.'), findsOneWidget);
      await tester.ensureVisible(find.text('Duplo · R\$ 35,90'));
      await tester.tap(find.text('Duplo · R\$ 35,90'));
      await tester.pump();
      await tester.ensureVisible(find.text('Adicionar · R\$ 35,90'));
      await tester.tap(find.text('Adicionar · R\$ 35,90'));
      await tester.pumpAndSettle();
      expect(controller.cart, hasLength(1));
      expect(find.text('Ver pedido (1 itens)'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Ver pedido (1 itens)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Escolher pagamento'));
      await tester.pumpAndSettle();
      expect(find.text('Como você prefere pagar?'), findsOneWidget);
      expect(find.text('Crédito'), findsOneWidget);
      expect(find.text('Débito'), findsOneWidget);
      expect(find.text('Pix'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('inatividade alerta por 15s antes de limpar a sessão', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1080, 1920);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(TotemKioskApp(controller: controller));
    controller.startShopping();
    controller.addLine(fixtureLine());
    clock = clock.add(const Duration(seconds: 45));
    controller.tick();
    await tester.pumpAndSettle();
    expect(find.text('Você ainda está comprando?'), findsOneWidget);
    expect(controller.cart, hasLength(1));
    clock = clock.add(const Duration(seconds: 15));
    controller.tick();
    await tester.pumpAndSettle();
    expect(find.text('Toque para começar'), findsOneWidget);
    expect(controller.cart, isEmpty);
  });

  testWidgets(
    'impressão incerta mostra conferência e libera próximo atendimento sem duplicar venda',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(1080, 1920);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(TotemKioskApp(controller: controller));
      controller.startShopping();
      controller.addLine(fixtureLine());
      controller.showPayment();
      central.offline = true;
      printer.fail = true;
      printer.uncertainFailure = true;
      await tester.runAsync(() => controller.pay(PaymentMethod.pix));
      await tester.pumpAndSettle();
      expect(find.text('Comprovante em conferência'), findsOneWidget);
      expect(controller.cart, isEmpty);
      await tester.tap(find.text('Próximo atendimento'));
      await tester.pumpAndSettle();
      expect(find.text('Toque para começar'), findsOneWidget);
      expect(controller.printReviewCount, 1);
      expect(printer.printed, hasLength(1));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'atividade no modal renova sessão e expiração fecha todas as rotas',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(1080, 1920);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(TotemKioskApp(controller: controller));
      controller.startShopping();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Burger da casa'));
      await tester.pumpAndSettle();
      clock = clock.add(const Duration(seconds: 40));
      await tester.tap(find.text('Duplo · R\$ 35,90'));
      await tester.pump();
      clock = clock.add(const Duration(seconds: 10));
      controller.tick();
      expect(controller.idleSeconds, isNull);
      clock = clock.add(const Duration(seconds: 35));
      controller.tick();
      await tester.pumpAndSettle();
      expect(find.text('Você ainda está comprando?'), findsOneWidget);
      await tester.tap(find.text('Continuar comprando'));
      await tester.pumpAndSettle();
      expect(find.byType(ProductConfigurationDialog), findsOneWidget);
      clock = clock.add(const Duration(seconds: 45));
      controller.tick();
      await tester.pumpAndSettle();
      clock = clock.add(const Duration(seconds: 15));
      controller.tick();
      await tester.pumpAndSettle();
      expect(find.byType(ProductConfigurationDialog), findsNothing);
      expect(find.text('Toque para começar'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('manutenção remota e falta de papel bloqueiam novas vendas', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1080, 1920);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(TotemKioskApp(controller: controller));
    controller.startShopping();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Burger da casa'));
    await tester.pumpAndSettle();
    expect(find.byType(ProductConfigurationDialog), findsOneWidget);
    central.terminal = const TerminalState(
      maintenance: true,
      message: 'Limpeza programada. Procure o balcão.',
    );
    await tester.runAsync(controller.refreshTerminal);
    await tester.pumpAndSettle();
    expect(find.byType(ProductConfigurationDialog), findsNothing);
    expect(find.text('Atendimento em pausa'), findsOneWidget);
    expect(find.text('Limpeza programada. Procure o balcão.'), findsOneWidget);
    controller.startShopping();
    expect(controller.page, KioskPage.catalog);
    central.terminal = const TerminalState();
    printer.printerState = PrinterState.outOfPaper;
    await tester.runAsync(controller.refreshTerminal);
    await tester.pump();
    expect(
      find.text('A impressora está sem papel. Um atendente pode ajudar.'),
      findsOneWidget,
    );
    expect(find.text('Toque para começar'), findsNothing);
  });
}
