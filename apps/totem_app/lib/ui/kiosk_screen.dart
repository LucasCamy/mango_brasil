import 'dart:async';
import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';
import 'package:uuid/uuid.dart';

import '../domain/models.dart';
import 'kiosk_controller.dart';
import 'print_review.dart';
import 'theme.dart';

String money(int cents) =>
    'R\$ ${(cents / 100).toStringAsFixed(2).replaceAll('.', ',')}';

class KioskScreen extends StatefulWidget {
  const KioskScreen({super.key, required this.controller});
  final KioskController controller;
  @override
  State<KioskScreen> createState() => _KioskScreenState();
}

class _KioskScreenState extends State<KioskScreen> {
  KioskController get controller => widget.controller;
  bool _idleDialogOpen = false;
  bool _lastBlocked = false;
  KioskPage? _lastPage;
  @override
  void initState() {
    super.initState();
    _lastPage = controller.page;
    controller.addListener(_onState);
  }

  @override
  void didUpdateWidget(KioskScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != controller) {
      oldWidget.controller.removeListener(_onState);
      controller.addListener(_onState);
    }
  }

  void _onState() {
    final blocked =
        controller.terminal.blocksSales || controller.recoveryRequired;
    if ((controller.page == KioskPage.attract &&
            _lastPage != KioskPage.attract) ||
        (blocked && !_lastBlocked)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          Navigator.of(
            context,
            rootNavigator: true,
          ).popUntil((route) => route.isFirst);
        }
      });
    }
    _lastPage = controller.page;
    _lastBlocked = blocked;
    if (controller.idleSeconds != null && !_idleDialogOpen && !blocked) {
      _idleDialogOpen = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || controller.idleSeconds == null) {
          _idleDialogOpen = false;
          return;
        }
        unawaited(
          showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (dialogContext) => PopScope(
              canPop: false,
              child: ListenableBuilder(
                listenable: controller,
                builder: (context, _) => AlertDialog(
                  icon: const Icon(Icons.timer_outlined, size: 44),
                  title: const Text('Você ainda está comprando?'),
                  content: Semantics(
                    liveRegion: true,
                    child: Text(
                      'Seu pedido será limpo em ${controller.idleSeconds ?? 0} segundos.',
                      style: const TextStyle(fontSize: 18),
                    ),
                  ),
                  actions: [
                    FilledButton(
                      autofocus: true,
                      onPressed: () {
                        controller.continueShopping();
                        Navigator.pop(dialogContext);
                      },
                      child: const Text('Continuar comprando'),
                    ),
                  ],
                ),
              ),
            ),
          ).whenComplete(() => _idleDialogOpen = false),
        );
      });
    }
  }

  @override
  void dispose() {
    controller.removeListener(_onState);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) => Listener(
      onPointerDown: (_) => controller.activity(),
      onPointerMove: (_) => controller.activity(),
      onPointerSignal: (_) => controller.activity(),
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              _Header(controller: controller),
              if (!controller.online ||
                  controller.pendingSync > 0 ||
                  controller.printReviewCount > 0)
                _SyncBanner(controller: controller),
              if (controller.error != null)
                _ErrorBanner(message: controller.error!),
              Expanded(
                child: controller.loading
                    ? const _CatalogSkeleton()
                    : controller.page == KioskPage.review
                    ? PendingPrintView(controller: controller)
                    : controller.terminal.blocksSales ||
                          controller.recoveryRequired
                    ? _Blocked(controller: controller)
                    : switch (controller.page) {
                        KioskPage.attract => _Attract(controller: controller),
                        KioskPage.catalog => _CatalogView(
                          controller: controller,
                        ),
                        KioskPage.payment => _PaymentView(
                          controller: controller,
                        ),
                        KioskPage.success => _SuccessView(
                          controller: controller,
                        ),
                        KioskPage.review => PendingPrintView(
                          controller: controller,
                        ),
                      },
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
    decoration: const BoxDecoration(
      color: KioskColors.surface,
      border: Border(bottom: BorderSide(color: KioskColors.line)),
    ),
    child: Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      runSpacing: 12,
      spacing: 20,
      children: [
        const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.restaurant_menu, size: 32, color: KioskColors.action),
            SizedBox(width: 12),
            Text(
              'MANGO BRASIL',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: .6,
              ),
            ),
          ],
        ),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            const _StateLabel(
              icon: Icons.science_outlined,
              label: 'Pagamento sandbox',
              pending: true,
            ),
            if (controller.printer.simulated)
              const _StateLabel(
                icon: Icons.description_outlined,
                label: 'Impressão em arquivo',
                pending: true,
              ),
            if (controller.page != KioskPage.attract && !controller.busy)
              TextButton.icon(
                onPressed: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Recomeçar seu pedido?'),
                      content: const Text(
                        'Os itens desta compra serão removidos.',
                      ),
                      actions: [
                        OutlinedButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Continuar'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Recomeçar'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed ?? false) controller.reset();
                },
                icon: const Icon(Icons.restart_alt),
                label: const Text('Recomeçar'),
              ),
          ],
        ),
      ],
    ),
  );
}

class _SyncBanner extends StatelessWidget {
  const _SyncBanner({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: KioskColors.warning)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StateLabel(
          icon: controller.printReviewCount > 0
              ? Icons.pending_outlined
              : Icons.cloud_off_outlined,
          pending: true,
          label: controller.printReviewCount > 0
              ? '${controller.printReviewCount} comprovante(s) aguardando conferência presencial.'
              : controller.reviewSync > 0
              ? '${controller.reviewSync} venda(s) aguardando revisão da Central. Chame um atendente.'
              : !controller.online
              ? 'Conexão indisponível. Seu pedido será salvo neste totem.'
              : '${controller.pendingSync} venda(s) com sincronização pendente.',
          color: KioskColors.warning,
        ),
        if (controller.printReviewCount > 0)
          TextButton.icon(
            onPressed: controller.busy
                ? null
                : () => showPrintReviewDialog(context, controller),
            icon: const Icon(Icons.fact_check_outlined),
            label: const Text('Conferir impressão'),
          ),
      ],
    ),
  );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: KioskColors.surface,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: KioskColors.destructive),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: KioskColors.destructive,
                fontSize: 17,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _StateLabel extends StatelessWidget {
  const _StateLabel({
    required this.icon,
    required this.label,
    this.pending = false,
    this.color = KioskColors.muted,
  });
  final IconData icon;
  final String label;
  final bool pending;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, color: color, size: 20),
      const SizedBox(width: 8),
      Flexible(
        child: Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 15,
            decoration: pending ? TextDecoration.underline : null,
            decorationStyle: pending ? TextDecorationStyle.dashed : null,
          ),
        ),
      ),
    ],
  );
}

class _Attract extends StatelessWidget {
  const _Attract({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 600;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: EdgeInsets.all(compact ? 20 : 32),
                decoration: const BoxDecoration(
                  color: KioskColors.selected,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.restaurant_outlined,
                  size: compact ? 52 : 84,
                  color: KioskColors.action,
                ),
              ),
              SizedBox(height: compact ? 20 : 36),
              Text(
                'Seu próximo\nfavorito começa aqui.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: compact ? 30 : 44,
                  height: 1.12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.2,
                ),
              ),
              SizedBox(height: compact ? 16 : 24),
              Text(
                'Escolha, personalize e acompanhe seu pedido pela senha.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: compact ? 18 : 22,
                  height: 1.5,
                  color: KioskColors.muted,
                ),
              ),
              SizedBox(height: compact ? 20 : 40),
              if (controller.catalog == null ||
                  !controller.catalog!.products.any(
                    (product) => product.active && product.availableInKiosk,
                  )) ...[
                const Icon(Icons.menu_book_outlined, size: 36),
                const SizedBox(height: 12),
                const Text(
                  'O cardápio ainda não está disponível.',
                  style: TextStyle(fontSize: 18),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: controller.refreshCatalog,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Atualizar cardápio'),
                ),
              ] else
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: controller.startShopping,
                    icon: const Icon(Icons.touch_app_outlined),
                    label: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text(
                        'Toque para começar',
                        style: TextStyle(fontSize: compact ? 18 : 24),
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 32),
              const Text(
                'Comprovante não fiscal. Pagamentos simulados nesta versão.',
                textAlign: TextAlign.center,
                style: TextStyle(color: KioskColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Blocked extends StatelessWidget {
  const _Blocked({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              controller.terminal.maintenance
                  ? Icons.construction_outlined
                  : Icons.print_disabled_outlined,
              size: 80,
              color: KioskColors.warning,
            ),
            const SizedBox(height: 28),
            Text(
              controller.recoveryRequired
                  ? 'Recuperando seu atendimento'
                  : 'Atendimento em pausa',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            Text(
              controller.terminal.maintenance
                  ? (controller.terminal.message.isEmpty
                        ? 'Este totem está em manutenção. Procure o balcão.'
                        : controller.terminal.message)
                  : controller.recoveryRequired
                  ? 'Sua venda está protegida neste totem. Chame um atendente para recuperar a mesma senha.'
                  : controller.terminal.printer == PrinterState.outOfPaper
                  ? 'A impressora está sem papel. Um atendente pode ajudar.'
                  : 'A impressora precisa de atenção. Procure um atendente.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 21, height: 1.5),
            ),
            const SizedBox(height: 28),
            OutlinedButton.icon(
              onPressed: controller.busy ? null : controller.recoverAndRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Verificar novamente'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _CatalogView extends StatelessWidget {
  const _CatalogView({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final wide = constraints.maxWidth >= 1200;
      return Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'O que vai ser hoje?',
                    style: TextStyle(
                      fontSize: constraints.maxWidth < 600 ? 28 : 36,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (constraints.maxWidth >= 600)
                  const Text(
                    'Feito do seu jeito.',
                    style: TextStyle(fontSize: 18, color: KioskColors.muted),
                  ),
              ],
            ),
          ),
          SizedBox(
            height: 72,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 24),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: ChoiceChip(
                    label: const Text('Todos'),
                    selected: controller.categoryId == null,
                    onSelected: (_) => controller.selectCategory(null),
                    labelPadding: const EdgeInsets.all(12),
                  ),
                ),
                for (final category in controller.catalog!.categories)
                  Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: ChoiceChip(
                      label: Text(category.name),
                      selected: controller.categoryId == category.id,
                      labelPadding: const EdgeInsets.all(12),
                      onSelected: (_) => controller.selectCategory(category.id),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: controller.visibleProducts.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.search_off_outlined, size: 48),
                              const SizedBox(height: 12),
                              const Text('Nenhum produto nesta categoria.'),
                              const SizedBox(height: 16),
                              OutlinedButton(
                                onPressed: () =>
                                    controller.selectCategory(null),
                                child: const Text('Ver todos'),
                              ),
                            ],
                          ),
                        )
                      : GridView.builder(
                          padding: const EdgeInsets.all(24),
                          gridDelegate:
                              SliverGridDelegateWithMaxCrossAxisExtent(
                                maxCrossAxisExtent: 360,
                                mainAxisExtent: constraints.maxWidth < 600
                                    ? 360
                                    : 385,
                                crossAxisSpacing: 20,
                                mainAxisSpacing: 20,
                              ),
                          itemCount: controller.visibleProducts.length,
                          itemBuilder: (context, index) => _ProductCard(
                            product: controller.visibleProducts[index],
                            image: controller.productImage(
                              controller.visibleProducts[index].imageUrl,
                            ),
                            onTap: () => _configure(
                              context,
                              controller.visibleProducts[index],
                            ),
                          ),
                        ),
                ),
                if (wide)
                  SizedBox(
                    width: 360,
                    child: _CartPanel(controller: controller),
                  ),
              ],
            ),
          ),
          if (!wide) _CartFooter(controller: controller),
        ],
      );
    },
  );
  Future<void> _configure(BuildContext context, Product product) async {
    final line = await showDialog<CartLine>(
      context: context,
      builder: (context) => Listener(
        onPointerDown: (_) => controller.activity(),
        onPointerMove: (_) => controller.activity(),
        onPointerSignal: (_) => controller.activity(),
        child: ProductConfigurationDialog(
          product: product,
          onActivity: controller.activity,
        ),
      ),
    );
    if (line != null && controller.page == KioskPage.catalog) {
      controller.addLine(line);
    }
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.image,
    required this.onTap,
  });
  final Product product;
  final Future<Uint8List?> image;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    color: KioskColors.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: KioskColors.line),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(height: 170, child: _ProductImage(image: image)),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: Text(
                      product.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.4,
                        color: KioskColors.muted,
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          money(product.basePriceCents),
                          style: dataStyle.copyWith(fontSize: 21),
                        ),
                      ),
                      const Icon(
                        Icons.add_circle_outline,
                        size: 32,
                        color: KioskColors.action,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _ProductImage extends StatelessWidget {
  const _ProductImage({required this.image});
  final Future<Uint8List?> image;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: KioskColors.subtle,
    child: FutureBuilder<Uint8List?>(
      future: image,
      builder: (context, snapshot) => snapshot.hasData
          ? Image.memory(
              snapshot.data!,
              fit: BoxFit.cover,
              errorBuilder: (_, error, stack) => const Icon(
                Icons.restaurant_outlined,
                size: 58,
                color: KioskColors.muted,
              ),
            )
          : const Icon(
              Icons.restaurant_outlined,
              size: 58,
              color: KioskColors.muted,
            ),
    ),
  );
}

class ProductConfigurationDialog extends StatefulWidget {
  const ProductConfigurationDialog({
    super.key,
    required this.product,
    this.onActivity,
  });
  final Product product;
  final VoidCallback? onActivity;
  @override
  State<ProductConfigurationDialog> createState() =>
      _ProductConfigurationDialogState();
}

class _ProductConfigurationDialogState
    extends State<ProductConfigurationDialog> {
  ProductSize? _size;
  final _additions = <String, int>{};
  final _notes = TextEditingController();
  String? _error;
  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  int get _price =>
      (_size?.priceCents ??
          (widget.product.basePriceCents + (_size?.priceModifierCents ?? 0))) +
      widget.product.additions.fold(
        0,
        (sum, addition) =>
            sum + addition.priceCents * (_additions[addition.id] ?? 0),
      );
  @override
  Widget build(BuildContext context) => Dialog(
    insetPadding: const EdgeInsets.all(16),
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: 640,
        maxHeight: MediaQuery.sizeOf(context).height * .9,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.product.name,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Fechar personalização',
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.product.description,
                    style: const TextStyle(
                      fontSize: 17,
                      height: 1.5,
                      color: KioskColors.muted,
                    ),
                  ),
                  if (widget.product.sizes.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const Text(
                      'Escolha o tamanho',
                      style: TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Text(
                      'Obrigatório',
                      style: TextStyle(color: KioskColors.muted),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        for (final size in widget.product.sizes)
                          ChoiceChip(
                            label: Text(
                              '${size.name} · ${money(size.priceCents ?? widget.product.basePriceCents + size.priceModifierCents)}',
                            ),
                            labelPadding: const EdgeInsets.all(12),
                            selected: _size?.id == size.id,
                            onSelected: (_) => setState(() {
                              _size = size;
                              _error = null;
                            }),
                          ),
                      ],
                    ),
                  ],
                  if (widget.product.additions.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const Text(
                      'Quer complementar?',
                      style: TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final addition in widget.product.additions)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    addition.name,
                                    style: const TextStyle(fontSize: 18),
                                  ),
                                  Text(
                                    '${money(addition.priceCents)} · até ${addition.maxQuantity}',
                                    style: dataStyle.copyWith(
                                      fontSize: 14,
                                      color: KioskColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            _Quantity(
                              value: _additions[addition.id] ?? 0,
                              label: addition.name,
                              onMinus: (_additions[addition.id] ?? 0) == 0
                                  ? null
                                  : () => setState(
                                      () => _additions[addition.id] =
                                          (_additions[addition.id] ?? 0) - 1,
                                    ),
                              onPlus:
                                  (_additions[addition.id] ?? 0) >=
                                      addition.maxQuantity
                                  ? null
                                  : () => setState(
                                      () => _additions[addition.id] =
                                          (_additions[addition.id] ?? 0) + 1,
                                    ),
                            ),
                          ],
                        ),
                      ),
                  ],
                  const SizedBox(height: 24),
                  const Text(
                    'Alguma observação?',
                    style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notes,
                    onChanged: (_) => widget.onActivity?.call(),
                    maxLength: 280,
                    maxLines: 2,
                    style: const TextStyle(fontSize: 18),
                    decoration: const InputDecoration(
                      labelText: 'Observações do pedido',
                      hintText: 'Ex.: sem cebola',
                    ),
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final note in [
                        'Sem cebola',
                        'Sem molho',
                        'Bem passado',
                      ])
                        ActionChip(
                          label: Text(note),
                          onPressed: () {
                            final next = _notes.text.isEmpty
                                ? note
                                : '${_notes.text}; $note';
                            if (next.length <= 280) _notes.text = next;
                          },
                        ),
                    ],
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          _error!,
                          style: const TextStyle(
                            fontSize: 17,
                            color: KioskColors.destructive,
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  if (widget.product.sizes.isNotEmpty && _size == null) {
                    setState(
                      () => _error = 'Escolha um tamanho para continuar.',
                    );
                    return;
                  }
                  Navigator.pop(
                    context,
                    CartLine(
                      id: const Uuid().v7(),
                      product: widget.product,
                      size: _size,
                      additions: _additions,
                      notes: _notes.text.trim(),
                    ),
                  );
                },
                icon: const Icon(Icons.add_shopping_cart_outlined),
                label: Text('Adicionar · ${money(_price)}'),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _Quantity extends StatelessWidget {
  const _Quantity({
    required this.value,
    required this.label,
    required this.onMinus,
    required this.onPlus,
  });
  final int value;
  final String label;
  final VoidCallback? onMinus;
  final VoidCallback? onPlus;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButton(
        tooltip: 'Diminuir $label',
        onPressed: onMinus,
        icon: const Icon(Icons.remove_circle_outline),
      ),
      SizedBox(
        width: 26,
        child: Text(
          '$value',
          textAlign: TextAlign.center,
          style: dataStyle.copyWith(fontSize: 20),
        ),
      ),
      IconButton(
        tooltip: 'Aumentar $label',
        onPressed: onPlus,
        icon: const Icon(Icons.add_circle_outline),
      ),
    ],
  );
}

class _CartFooter extends StatelessWidget {
  const _CartFooter({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: const BoxDecoration(
      color: KioskColors.surface,
      border: Border(top: BorderSide(color: KioskColors.line)),
    ),
    child: FilledButton.icon(
      onPressed: controller.cart.isEmpty
          ? null
          : () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              useSafeArea: true,
              builder: (context) => SizedBox(
                height: MediaQuery.sizeOf(context).height * .8,
                child: Listener(
                  onPointerDown: (_) => controller.activity(),
                  onPointerMove: (_) => controller.activity(),
                  onPointerSignal: (_) => controller.activity(),
                  child: ListenableBuilder(
                    listenable: controller,
                    builder: (context, _) => _CartPanel(
                      controller: controller,
                      onCheckout: () {
                        Navigator.pop(context);
                        controller.showPayment();
                      },
                    ),
                  ),
                ),
              ),
            ),
      icon: const Icon(Icons.shopping_bag_outlined),
      label: SizedBox(
        width: double.infinity,
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 8,
          runSpacing: 4,
          children: [
            Text(
              'Ver pedido (${controller.cart.fold<int>(0, (sum, line) => sum + line.quantity)} itens)',
            ),
            Text(money(controller.totalCents), style: dataStyle),
          ],
        ),
      ),
    ),
  );
}

class _CartPanel extends StatelessWidget {
  const _CartPanel({required this.controller, this.onCheckout});
  final KioskController controller;
  final VoidCallback? onCheckout;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: KioskColors.surface,
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Seu pedido',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: controller.cart.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.shopping_bag_outlined,
                          size: 44,
                          color: KioskColors.muted,
                        ),
                        SizedBox(height: 16),
                        Text('Escolha seu primeiro item.'),
                      ],
                    ),
                  )
                : ListView.separated(
                    itemCount: controller.cart.length,
                    separatorBuilder: (_, index) => const Divider(height: 32),
                    itemBuilder: (context, index) {
                      final line = controller.cart[index];
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            line.product.name,
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (line.size != null)
                            Text(
                              line.size!.name,
                              style: const TextStyle(
                                fontSize: 16,
                                color: KioskColors.muted,
                              ),
                            ),
                          for (final addition in line.product.additions.where(
                            (a) => (line.additions[a.id] ?? 0) > 0,
                          ))
                            Text(
                              '+ ${line.additions[addition.id]}x ${addition.name}',
                              style: const TextStyle(fontSize: 15),
                            ),
                          if (line.notes.isNotEmpty)
                            Text(
                              line.notes,
                              style: const TextStyle(
                                fontSize: 15,
                                color: KioskColors.muted,
                              ),
                            ),
                          Wrap(
                            alignment: WrapAlignment.spaceBetween,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            spacing: 12,
                            children: [
                              Text(
                                money(line.totalCents),
                                style: dataStyle.copyWith(fontSize: 19),
                              ),
                              _Quantity(
                                value: line.quantity,
                                label: line.product.name,
                                onMinus: () => controller.changeQuantity(
                                  line.id,
                                  line.quantity - 1,
                                ),
                                onPlus: line.quantity >= 99
                                    ? null
                                    : () => controller.changeQuantity(
                                        line.id,
                                        line.quantity + 1,
                                      ),
                              ),
                            ],
                          ),
                        ],
                      );
                    },
                  ),
          ),
          const Divider(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Total', style: TextStyle(fontSize: 22)),
              Text(
                money(controller.totalCents),
                style: dataStyle.copyWith(fontSize: 25),
              ),
            ],
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: controller.cart.isEmpty
                ? null
                : onCheckout ?? controller.showPayment,
            icon: const Icon(Icons.arrow_forward),
            label: const Text('Escolher pagamento'),
          ),
        ],
      ),
    ),
  );
}

class _PaymentView extends StatelessWidget {
  const _PaymentView({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Como você prefere pagar?',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 20),
            Text(
              money(controller.totalCents),
              textAlign: TextAlign.center,
              style: dataStyle.copyWith(fontSize: 42),
            ),
            const SizedBox(height: 12),
            const Text(
              'Ambiente sandbox: nenhum valor será cobrado. Não insira um cartão real.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, color: KioskColors.muted),
            ),
            const SizedBox(height: 32),
            if (controller.busy)
              Semantics(
                liveRegion: true,
                child: Column(
                  children: [
                    Icon(
                      controller.paymentState == PaymentState.confirmed
                          ? Icons.check_circle_outline
                          : Icons.pending_outlined,
                      size: 64,
                      color: controller.paymentState == PaymentState.confirmed
                          ? KioskColors.success
                          : KioskColors.action,
                    ),
                    const SizedBox(height: 24),
                    Text(
                      _stateMessage(controller.paymentState),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 24),
                    const LinearProgressIndicator(minHeight: 6),
                    const SizedBox(height: 20),
                    const Text('Aguarde seu comprovante e sua senha.'),
                  ],
                ),
              )
            else ...[
              LayoutBuilder(
                builder: (context, constraints) => Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    for (final method in PaymentMethod.values)
                      SizedBox(
                        width: constraints.maxWidth < 600
                            ? constraints.maxWidth
                            : (constraints.maxWidth - 32) / 3,
                        child: OutlinedButton(
                          onPressed: () => controller.pay(method),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 24),
                            child: Column(
                              children: [
                                Icon(
                                  method == PaymentMethod.pix
                                      ? Icons.qr_code_2_outlined
                                      : Icons.credit_card_outlined,
                                  size: 40,
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  method.label,
                                  style: const TextStyle(fontSize: 23),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              OutlinedButton.icon(
                onPressed: controller.backToCatalog,
                icon: const Icon(Icons.arrow_back),
                label: const Text('Voltar ao pedido'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
  static String _stateMessage(PaymentState? state) => switch (state) {
    PaymentState.initializing => 'Iniciando pagamento simulado',
    PaymentState.waitingCardOrQr =>
      'Aguardando cartão ou leitura do Pix simulado',
    PaymentState.processing => 'Processando autorização',
    PaymentState.authorized => 'Autorizado. Salvando e imprimindo seu pedido',
    PaymentState.confirmed => 'Pagamento confirmado',
    PaymentState.reversed => 'Pagamento desfeito',
    PaymentState.failed => 'Pagamento não autorizado',
    null => 'Preparando pagamento',
  };
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.check_circle_outline,
              size: 84,
              color: KioskColors.success,
            ),
            const SizedBox(height: 28),
            const Text(
              'Pedido confirmado!',
              style: TextStyle(fontSize: 36, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            const Text(
              'Sua senha para retirada',
              style: TextStyle(fontSize: 21, color: KioskColors.muted),
            ),
            const SizedBox(height: 20),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                '#${controller.result!.ticket}',
                style: dataStyle.copyWith(
                  fontSize: 70,
                  color: KioskColors.action,
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Guarde seu comprovante e acompanhe o preparo.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 22, height: 1.5),
            ),
            if (controller.result!.offline)
              const Padding(
                padding: EdgeInsets.only(top: 20),
                child: _StateLabel(
                  icon: Icons.cloud_off_outlined,
                  label: 'Senha de contingência. Sincronização automática.',
                  pending: true,
                  color: KioskColors.warning,
                ),
              ),
            if (controller.printer.simulated)
              const Padding(
                padding: EdgeInsets.only(top: 20),
                child: Text(
                  'O comprovante simulado foi salvo no terminal. Nenhuma impressão física foi realizada.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 17, color: KioskColors.warning),
                ),
              ),
            const SizedBox(height: 36),
            FilledButton.icon(
              onPressed: controller.reset,
              icon: const Icon(Icons.home_outlined),
              label: const Text('Concluir atendimento'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _CatalogSkeleton extends StatelessWidget {
  const _CatalogSkeleton();
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(height: 40, width: 280, color: KioskColors.subtle),
        const SizedBox(height: 24),
        const Text('Carregando o cardápio...', style: TextStyle(fontSize: 18)),
        const SizedBox(height: 24),
        Expanded(
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 360,
              mainAxisExtent: 350,
              mainAxisSpacing: 20,
              crossAxisSpacing: 20,
            ),
            itemCount: 6,
            itemBuilder: (_, index) => Container(
              decoration: BoxDecoration(
                color: KioskColors.subtle,
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
