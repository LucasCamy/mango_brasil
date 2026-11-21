import 'package:material_ui/material_ui.dart';

import '../domain/models.dart';
import '../domain/ports.dart';
import 'kiosk_controller.dart';
import 'theme.dart';

Future<void> showPrintReviewDialog(
  BuildContext context,
  KioskController controller,
) => showDialog<void>(
  context: context,
  builder: (_) => _PrintReviewDialog(controller: controller),
);

class PendingPrintView extends StatelessWidget {
  const PendingPrintView({super.key, required this.controller});
  final KioskController controller;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.pending_outlined,
              color: KioskColors.warning,
              size: 80,
            ),
            const SizedBox(height: 24),
            const Text(
              'Comprovante em conferência',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 32, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            const Text(
              'A impressora pode ter emitido seu comprovante. Chame um atendente antes de refazer a compra.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 21, height: 1.5),
            ),
            const SizedBox(height: 24),
            const Text(
              'Referência deste atendimento',
              style: TextStyle(fontSize: 17, color: KioskColors.muted),
            ),
            const SizedBox(height: 12),
            FittedBox(
              child: Text(
                '#${controller.result?.ticket ?? ''}',
                style: dataStyle.copyWith(fontSize: 42),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Seu pedido está salvo e o pagamento aguarda conferência. Nenhuma nova cobrança será criada ao recuperar este atendimento.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                height: 1.4,
                color: KioskColors.muted,
              ),
            ),
            const SizedBox(height: 28),
            OutlinedButton.icon(
              onPressed: () => showPrintReviewDialog(context, controller),
              icon: const Icon(Icons.fact_check_outlined),
              label: const Text('Conferir com atendente'),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: controller.reset,
              icon: const Icon(Icons.arrow_forward),
              label: const Text('Próximo atendimento'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _PrintReviewDialog extends StatefulWidget {
  const _PrintReviewDialog({required this.controller});
  final KioskController controller;
  @override
  State<_PrintReviewDialog> createState() => _PrintReviewDialogState();
}

class _PrintReviewDialogState extends State<_PrintReviewDialog> {
  late final Future<List<SaleRecord>> _sales = widget.controller
      .printReviewSales();
  String? _error;
  Future<void> _resolve(SaleRecord sale, bool observed) async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          observed
              ? 'O comprovante saiu completo?'
              : 'Reimprimir a mesma senha?',
        ),
        content: Text(
          observed
              ? 'Confira presencialmente a senha #${sale.ticket} e todos os itens no papel antes de confirmar.'
              : 'Será emitida uma via identificada como reimpressão para a senha #${sale.ticket}. O pedido e o pagamento serão os mesmos.',
        ),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              observed ? 'Sim, conferi o papel' : 'Reimprimir mesma senha',
            ),
          ),
        ],
      ),
    );
    if (approved != true || !mounted) return;
    setState(() => _error = null);
    try {
      await widget.controller.resolvePrintReview(
        sale.key,
        receiptObserved: observed,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is PrinterFailure ? error.message : 'Não foi possível concluir a conferência. Preserve a referência e chame o suporte.',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.controller,
    builder: (context, _) => PopScope(
      canPop: !widget.controller.busy,
      child: Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 680,
            maxHeight: MediaQuery.sizeOf(context).height * .85,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Conferência de impressão',
                        style: TextStyle(
                          fontSize: 25,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Fechar conferência',
                      onPressed: widget.controller.busy
                          ? null
                          : () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: FutureBuilder<List<SaleRecord>>(
                  future: _sales,
                  builder: (context, snapshot) {
                    if (snapshot.hasError) {
                      return const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'Não foi possível ler as pendências. Preserve os dados deste terminal.',
                        ),
                      );
                    }
                    if (!snapshot.hasData) {
                      return const Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    if (snapshot.data!.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'Nenhum comprovante aguardando conferência.',
                        ),
                      );
                    }
                    return ListView.separated(
                      shrinkWrap: true,
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                      itemCount: snapshot.data!.length,
                      separatorBuilder: (_, index) => const Divider(height: 32),
                      itemBuilder: (context, index) {
                        final sale = snapshot.data![index];
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Senha #${sale.ticket}',
                              style: dataStyle.copyWith(fontSize: 24),
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'A saída do papel não foi confirmada. Verifique a impressora e escolha uma ação. Não refaça a compra.',
                              style: TextStyle(fontSize: 18, height: 1.4),
                            ),
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              onPressed: widget.controller.busy
                                  ? null
                                  : () => _resolve(sale, true),
                              icon: const Icon(Icons.fact_check_outlined),
                              label: const Text('Confirmar via já impressa'),
                            ),
                            const SizedBox(height: 12),
                            OutlinedButton.icon(
                              onPressed: widget.controller.busy
                                  ? null
                                  : () => _resolve(sale, false),
                              icon: const Icon(Icons.print_outlined),
                              label: const Text('Reimprimir mesma senha'),
                            ),
                          ],
                        );
                      },
                    );
                  },
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(24),
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
            ],
          ),
        ),
      ),
    ),
  );
}
