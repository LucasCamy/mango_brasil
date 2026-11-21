import 'package:flutter_test/flutter_test.dart';
import 'package:totem_app/domain/models.dart';

import '../support/fakes.dart';

void main() {
  test('tamanho é obrigatório e limites de adicional são invariantes', () {
    final product = fixtureProduct();
    expect(() => CartLine(id: 'x', product: product), throwsArgumentError);
    expect(
      () => CartLine(
        id: 'x',
        product: product,
        size: product.sizes.first,
        additions: {additionId: 3},
      ),
      throwsArgumentError,
    );
    final line = fixtureLine();
    expect(line.unitPriceCents, 3590);
    expect(line.withQuantity(2).totalCents, 7880);
    expect(line.toSnapshotJson()['fiscal'], product.fiscal.toJson());
  });
  test('JSON preserva centavos, tamanhos e todos os metadados fiscais', () {
    final product = fixtureProduct();
    final restored = Product.fromJson(product.toJson());
    expect(restored.basePriceCents, 2590);
    expect(restored.sizes.first.priceModifierCents, 1000);
    expect(restored.additions.first.maxQuantity, 2);
    expect(restored.fiscal.toJson(), product.fiscal.toJson());
  });
}
