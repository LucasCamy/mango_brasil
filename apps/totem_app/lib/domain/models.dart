import 'dart:collection';

typedef Json = Map<String, Object?>;

List<Json> jsonObjects(Object? value) => (value as List<Object?>? ?? const [])
    .map((e) => (e as Map).cast<String, Object?>())
    .toList();

int integer(Object? value, [int fallback = 0]) =>
    value is num ? value.toInt() : fallback;

class Category {
  const Category({required this.id, required this.name, this.sortOrder = 0});
  final String id;
  final String name;
  final int sortOrder;
  factory Category.fromJson(Json json) => Category(
    id: json['id']! as String,
    name: json['name']! as String,
    sortOrder: integer(json['order'] ?? json['sortOrder']),
  );
  Json toJson() => {
    'id': id,
    'name': name,
    'sortOrder': sortOrder,
    'active': true,
  };
}

class ProductSize {
  const ProductSize({
    required this.id,
    required this.name,
    this.priceModifierCents = 0,
    this.priceCents,
  });
  final String id;
  final String name;
  final int priceModifierCents;
  final int? priceCents;
  factory ProductSize.fromJson(Json json) => ProductSize(
    id: json['id']! as String,
    name: json['name']! as String,
    priceModifierCents: integer(json['priceModifierCents']),
    priceCents: (json['priceCents'] as num?)?.toInt(),
  );
  Json toJson() => {
    'id': id,
    'name': name,
    'priceModifierCents': priceModifierCents,
    'priceCents': priceCents,
  };
}

class ProductAddition {
  const ProductAddition({
    required this.id,
    required this.name,
    required this.priceCents,
    required this.maxQuantity,
  });
  final String id;
  final String name;
  final int priceCents;
  final int maxQuantity;
  factory ProductAddition.fromJson(Json json) => ProductAddition(
    id: json['id']! as String,
    name: json['name']! as String,
    priceCents: integer(json['priceCents']),
    maxQuantity: integer(json['maxQuantity']),
  );
  Json toJson() => {
    'id': id,
    'name': name,
    'priceCents': priceCents,
    'maxQuantity': maxQuantity,
  };
}

class FiscalMetadata {
  FiscalMetadata(Json values) : values = UnmodifiableMapView(values);
  final Map<String, Object?> values;
  Json toJson() => Map.of(values);
}

class Product {
  Product({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.description,
    required this.basePriceCents,
    this.imageUrl,
    this.active = true,
    this.availableInKiosk = true,
    List<ProductSize> sizes = const [],
    List<ProductAddition> additions = const [],
    FiscalMetadata? fiscal,
  }) : sizes = List.unmodifiable(sizes),
       additions = List.unmodifiable(additions),
       fiscal = fiscal ?? FiscalMetadata({});
  final String id;
  final String categoryId;
  final String name;
  final String description;
  final int basePriceCents;
  final String? imageUrl;
  final bool active;
  final bool availableInKiosk;
  final List<ProductSize> sizes;
  final List<ProductAddition> additions;
  final FiscalMetadata fiscal;
  factory Product.fromJson(Json json) => Product(
    id: json['id']! as String,
    categoryId: json['categoryId']! as String,
    name: json['name']! as String,
    description: json['description'] as String? ?? '',
    basePriceCents: integer(json['basePriceCents']),
    imageUrl: json['imageUrl'] as String?,
    active: json['active'] as bool? ?? true,
    availableInKiosk: json['availableInKiosk'] as bool? ?? true,
    sizes: jsonObjects(json['sizes']).map(ProductSize.fromJson).toList(),
    additions: jsonObjects(json['additions'])
        .map(ProductAddition.fromJson)
        .toList(),
    fiscal: FiscalMetadata(
      (json['fiscal'] as Map?)?.cast<String, Object?>() ?? {},
    ),
  );
  Json toJson() => {
    'id': id,
    'categoryId': categoryId,
    'name': name,
    'description': description,
    'basePriceCents': basePriceCents,
    'imageUrl': imageUrl,
    'active': active,
    'availableInKiosk': availableInKiosk,
    'sizes': sizes.map((s) => s.toJson()).toList(),
    'additions': additions.map((a) => a.toJson()).toList(),
    'fiscal': fiscal.toJson(),
  };
}

class Catalog {
  Catalog({
    required List<Category> categories,
    required List<Product> products,
    required this.version,
  }) : categories = List.unmodifiable(categories),
       products = List.unmodifiable(products);
  final List<Category> categories;
  final List<Product> products;
  final String version;
  factory Catalog.fromJson(Json json) => Catalog(
    categories: jsonObjects(json['categories']).map(Category.fromJson).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
    products: jsonObjects(json['products']).map(Product.fromJson).toList(),
    version: json['version'].toString(),
  );
}

class CartLine {
  CartLine({
    required this.id,
    required this.product,
    this.size,
    this.quantity = 1,
    Map<String, int> additions = const {},
    this.notes = '',
  }) : additions = UnmodifiableMapView(Map.of(additions)) {
    if (quantity < 1 || quantity > 99) {
      throw ArgumentError('Quantidade inválida.');
    }
    if (product.sizes.isNotEmpty &&
        (size == null || !product.sizes.any((s) => s.id == size!.id))) {
      throw ArgumentError('Escolha um tamanho.');
    }
    if (notes.length > 280) {
      throw ArgumentError('Use até 280 caracteres nas observações.');
    }
    for (final entry in additions.entries) {
      final options = product.additions.where((a) => a.id == entry.key);
      if (options.isEmpty ||
          entry.value < 0 ||
          entry.value > options.first.maxQuantity) {
        throw ArgumentError('Quantidade de adicional inválida.');
      }
    }
  }
  final String id;
  final Product product;
  final ProductSize? size;
  final int quantity;
  final Map<String, int> additions;
  final String notes;
  int get unitPriceCents =>
      size?.priceCents ??
      (product.basePriceCents + (size?.priceModifierCents ?? 0));
  int get totalCents =>
      (unitPriceCents +
          product.additions.fold<int>(
            0,
            (sum, a) => sum + a.priceCents * (additions[a.id] ?? 0),
          )) *
      quantity;
  CartLine withQuantity(int value) => CartLine(
    id: id,
    product: product,
    size: size,
    quantity: value,
    additions: additions,
    notes: notes,
  );
  Json toOrderJson() => {
    'productId': product.id,
    if (size != null) 'sizeId': size!.id,
    'quantity': quantity,
    'additions': additions.entries
        .where((e) => e.value > 0)
        .map((e) => {'additionId': e.key, 'quantity': e.value})
        .toList(),
    if (notes.isNotEmpty) 'notes': notes,
  };
  Json toReceiptJson() => {
    'name': product.name,
    'sizeName': size?.name,
    'quantity': quantity,
    'totalCents': totalCents,
    'notes': notes,
    'additions': product.additions
        .where((a) => (additions[a.id] ?? 0) > 0)
        .map((a) => {'name': a.name, 'quantity': additions[a.id]})
        .toList(),
  };
  Json toSnapshotJson() => {
    'productId': product.id,
    'productName': product.name,
    if (size != null) 'sizeId': size!.id,
    if (size != null) 'sizeName': size!.name,
    'unitPriceCents': unitPriceCents,
    'quantity': quantity,
    'totalCents': totalCents,
    'additions': product.additions
        .where((a) => (additions[a.id] ?? 0) > 0)
        .map(
          (a) => {
            'additionId': a.id,
            'name': a.name,
            'priceCents': a.priceCents,
            'quantity': additions[a.id],
          },
        )
        .toList(),
    if (notes.isNotEmpty) 'notes': notes,
    'fiscal': product.fiscal.toJson(),
  };
}

enum PaymentMethod {
  creditCard('CREDIT_CARD', 'Crédito'),
  debitCard('DEBIT_CARD', 'Débito'),
  pix('PIX', 'Pix');

  const PaymentMethod(this.apiValue, this.label);
  final String apiValue;
  final String label;
  static PaymentMethod fromApi(String value) =>
      values.firstWhere((m) => m.apiValue == value);
}

enum PaymentState {
  initializing,
  waitingCardOrQr,
  processing,
  authorized,
  confirmed,
  reversed,
  failed,
}

class PaymentTransaction {
  const PaymentTransaction({
    required this.id,
    required this.orderKey,
    required this.method,
    required this.amountCents,
    required this.state,
    required this.createdAt,
    this.nsu,
    this.authorizationCode,
  });
  final String id;
  final String orderKey;
  final PaymentMethod method;
  final int amountCents;
  final PaymentState state;
  final DateTime createdAt;
  final String? nsu;
  final String? authorizationCode;
  PaymentTransaction withState(
    PaymentState next, {
    String? nsu,
    String? authorizationCode,
  }) => PaymentTransaction(
    id: id,
    orderKey: orderKey,
    method: method,
    amountCents: amountCents,
    state: next,
    createdAt: createdAt,
    nsu: nsu ?? this.nsu,
    authorizationCode: authorizationCode ?? this.authorizationCode,
  );
  factory PaymentTransaction.fromJson(Json json) => PaymentTransaction(
    id: json['id']! as String,
    orderKey: json['orderKey']! as String,
    method: PaymentMethod.fromApi(json['method']! as String),
    amountCents: integer(json['amountCents']),
    state: PaymentState.values.byName(json['state']! as String),
    createdAt: DateTime.parse(json['createdAt']! as String),
    nsu: json['nsu'] as String?,
    authorizationCode: json['authorizationCode'] as String?,
  );
  Json toJson() => {
    'id': id,
    'orderKey': orderKey,
    'method': method.apiValue,
    'amountCents': amountCents,
    'state': state.name,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'nsu': nsu,
    'authorizationCode': authorizationCode,
  };
  Json toAuthorizationJson() => {
    'idempotencyKey': id,
    'method': method.apiValue,
    'amountCents': amountCents,
    'nsu': nsu,
    'authorizationCode': authorizationCode,
    'authorizedAt': createdAt.toUtc().toIso8601String(),
  };
}

enum PrinterState { ready, outOfPaper, error }

class TerminalState {
  const TerminalState({
    this.maintenance = false,
    this.message = '',
    this.printer = PrinterState.ready,
  });
  final bool maintenance;
  final String message;
  final PrinterState printer;
  bool get blocksSales => maintenance || printer != PrinterState.ready;
  Json toJson() => {
    'status': maintenance ? 'MAINTENANCE' : 'ONLINE',
    'maintenanceMessage': message,
    'printerStatus': switch (printer) {
      PrinterState.ready => 'READY',
      PrinterState.outOfPaper => 'OUT_OF_PAPER',
      PrinterState.error => 'ERROR',
    },
  };
  factory TerminalState.fromJson(Json json) => TerminalState(
    maintenance: json['status'] == 'MAINTENANCE',
    message: json['maintenanceMessage'] as String? ?? '',
    printer: switch (json['printerStatus']) {
      'OUT_OF_PAPER' => PrinterState.outOfPaper,
      'ERROR' => PrinterState.error,
      _ => PrinterState.ready,
    },
  );
}

class SaleRecord {
  const SaleRecord({
    required this.key,
    required this.paymentKey,
    required this.payload,
    required this.receipt,
    required this.ticket,
    required this.createdAt,
    this.printedAt,
    this.confirmedAt,
    this.syncedAt,
    this.cancelled = false,
    this.contingency = true,
  });
  final String key;
  final String paymentKey;
  final Json payload;
  final List<Json> receipt;
  final String ticket;
  final DateTime createdAt;
  final DateTime? printedAt;
  final DateTime? confirmedAt;
  final DateTime? syncedAt;
  final bool cancelled;
  final bool contingency;
  Json syncPayload() => {
    ...payload,
    'offline': {
      ...(payload['offline']! as Map).cast<String, Object?>(),
      if (contingency) 'contingencyTicket': ticket,
      if (printedAt != null) 'printedAt': printedAt!.toUtc().toIso8601String(),
      if (confirmedAt != null)
        'confirmedAt': confirmedAt!.toUtc().toIso8601String(),
    },
  };
}

class CheckoutResult {
  const CheckoutResult({
    required this.ticket,
    required this.orderKey,
    required this.offline,
  });
  final String ticket;
  final String orderKey;
  final bool offline;
}

class CheckoutRecoveryRequired implements Exception {
  const CheckoutRecoveryRequired(
    this.orderKey, {
    this.ticket,
    this.printUncertain = false,
  });
  final String orderKey;
  final String? ticket;
  final bool printUncertain;
  @override
  String toString() =>
      'O comprovante foi recebido. A confirmação será recuperada com a mesma senha; chame um atendente.';
}

class ApiProblem implements Exception {
  const ApiProblem(this.status, this.message);
  final int status;
  final String message;
  bool get retryable => status == 408 || status == 429 || status >= 500;
  @override
  String toString() => message;
}

class NetworkUnavailable implements Exception {
  const NetworkUnavailable();
  @override
  String toString() =>
      'Central indisponível. A venda continua em contingência.';
}
