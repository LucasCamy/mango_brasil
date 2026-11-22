// Opt-in REST integration against the local Docker stack.
// Outside test/ so `flutter test` never depends on external infrastructure.
// Run: E2E_REAL_API=1 flutter test tool/central_rest_test.dart
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:totem_app/data/central_api.dart';
import 'package:totem_app/data/local_store.dart';
import 'package:totem_app/data/printer.dart';
import 'package:totem_app/data/repositories.dart';
import 'package:totem_app/data/simulated_pinpad.dart';
import 'package:totem_app/domain/models.dart';
import 'package:uuid/uuid.dart';

const _reason =
    'Validação controlada Flutter REST: cancelamento auditado após o teste integrado';
const _note = 'Validação integrada Flutter REST controlada';

class _Credentials {
  const _Credentials(
    this.email,
    this.password,
    this.pin,
    this.terminalId,
    this.terminalToken,
  );
  final String email, password, pin, terminalId, terminalToken;
  static Future<_Credentials> load() async {
    const names = {
      'BOOTSTRAP_EMAIL',
      'BOOTSTRAP_PASSWORD',
      'BOOTSTRAP_PIN',
      'TERMINAL_ID',
      'TERMINAL_TOKEN',
      'PAYMENT_MODE',
    };
    final file = File(
      Platform.environment['E2E_ENV_FILE'] ??
          p.join(Directory.current.path, '..', '..', '.env'),
    );
    if (!await file.exists()) {
      throw StateError(
        'Arquivo de credenciais locais não encontrado. Execute a partir de apps/totem_app.',
      );
    }
    final values = <String, String>{};
    for (final line in await file.readAsLines()) {
      final value = line.trim();
      if (value.isEmpty || value.startsWith('#')) continue;
      final separator = value.indexOf('=');
      if (separator < 1) continue;
      final name = value.substring(0, separator).trim();
      if (!names.contains(name)) continue;
      var content = value.substring(separator + 1).trim();
      if (content.length >= 2 &&
          ((content.startsWith('"') && content.endsWith('"')) ||
              (content.startsWith("'") && content.endsWith("'")))) {
        content = content.substring(1, content.length - 1);
      }
      values[name] = content;
    }
    for (final name in names.difference({'PAYMENT_MODE'})) {
      if ((values[name] ?? '').isEmpty) {
        throw StateError(
          'Credencial obrigatória ausente: $name. Nenhum valor será registrado.',
        );
      }
    }
    if (values['PAYMENT_MODE'] != 'simulated') {
      throw StateError('Este teste é exclusivo de pagamentos simulados.');
    }
    return _Credentials(
      values['BOOTSTRAP_EMAIL']!,
      values['BOOTSTRAP_PASSWORD']!,
      values['BOOTSTRAP_PIN']!,
      values['TERMINAL_ID']!,
      values['TERMINAL_TOKEN']!,
    );
  }
}

class _WireResponse {
  const _WireResponse(this.method, this.path, this.status);
  final String method, path;
  final int status;
}

class _ObservedHttpClient extends http.BaseClient {
  _ObservedHttpClient(this.responses);
  final List<_WireResponse> responses;
  final http.Client _client = http.Client();
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final response = await _client.send(request);
    // Only method/path/status are retained. Never headers, cookies or credentials.
    responses.add(
      _WireResponse(request.method, request.url.path, response.statusCode),
    );
    return response;
  }

  @override
  void close() => _client.close();
}

class _ObservedApi extends CentralApi {
  _ObservedApi({
    required super.baseUri,
    required super.token,
    required this.keys,
    required List<_WireResponse> responses,
  }) : super(clientFactory: () => _ObservedHttpClient(responses));
  final Set<String> keys;
  @override
  Future<Json> createOrder(Json payload) {
    keys.add(payload['idempotencyKey']! as String);
    return super.createOrder(payload);
  }
}

/// A loopback TCP endpoint verifies ESC/POS bytes, not physical hardware.
class _TcpWirePrinter {
  _TcpWirePrinter._(this.server) {
    subscription = server.listen((socket) {
      sockets.add(socket);
      final bytes = <int>[];
      socket.listen(
        (chunk) {
          if (chunk.length == 3 && chunk[0] == 0x10 && chunk[1] == 0x04) {
            sensorQueries++;
            socket.add([0x12]);
            unawaited(socket.flush());
          } else {
            bytes.addAll(chunk);
          }
        },
        onDone: () {
          if (bytes.isNotEmpty) receipts.add(Uint8List.fromList(bytes));
          socket.destroy();
        },
        onError: (Object _) {
          socket.destroy();
        },
      );
    });
  }
  final ServerSocket server;
  late final StreamSubscription<Socket> subscription;
  final sockets = <Socket>[];
  final receipts = <Uint8List>[];
  int sensorQueries = 0;
  static Future<_TcpWirePrinter> open() async => _TcpWirePrinter._(
    await ServerSocket.bind(InternetAddress.loopbackIPv4, 0),
  );
  TcpEscPosPrinter get gateway =>
      TcpEscPosPrinter(host: '127.0.0.1', port: server.port);
  Future<void> close() async {
    for (final socket in sockets) {
      socket.destroy();
    }
    await subscription.cancel();
    await server.close();
  }
}

class _OwnerSession {
  _OwnerSession(this.baseUri, this.credentials);
  final Uri baseUri;
  final _Credentials credentials;
  String? _cookie;
  String? userId;
  Future<http.Response> _request(
    String method,
    String path, {
    Json? body,
    String? supervisor,
  }) async {
    final client = http.Client();
    try {
      final request = http.Request(method, baseUri.resolve(path));
      if (body != null) request.headers['Content-Type'] = 'application/json';
      if (_cookie != null) request.headers['Cookie'] = _cookie!;
      if (supervisor != null) {
        request.headers['x-supervisor-token'] = supervisor;
      }
      if (body != null) request.body = jsonEncode(body);
      final response = await (() async => http.Response.fromStream(
        await client.send(request),
      ))().timeout(const Duration(seconds: 5));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError(
          'REST $method $path retornou HTTP ${response.statusCode}. Credenciais e corpo não serão exibidos.',
        );
      }
      return response;
    } finally {
      client.close();
    }
  }

  Future<void> login() async {
    final response = await _request(
      'POST',
      '/api/auth/login',
      body: {'email': credentials.email, 'password': credentials.password},
    );
    final cookie = response.headers['set-cookie'];
    if (cookie == null) {
      throw StateError('A API não retornou a sessão HTTP esperada.');
    }
    _cookie = cookie.split(';').first;
    userId = (jsonDecode(response.body) as Json)['id']! as String;
  }

  Future<void> verifyTerminal() async {
    final response = await _request('GET', '/api/terminals');
    final terminals = jsonObjects(jsonDecode(response.body));
    final matches = terminals.where(
      (terminal) => terminal['id'] == credentials.terminalId,
    );
    if (matches.isEmpty) {
      throw StateError('O terminal configurado não existe na API local.');
    }
    final terminal = matches.single;
    if (terminal['status'] == 'MAINTENANCE' ||
        terminal['printerStatus'] != 'READY') {
      throw StateError(
        'O terminal precisa estar disponível e com impressora READY. O teste não altera seu cadastro nem heartbeat.',
      );
    }
  }

  Future<Json> cancelAudited(Json order) async {
    if (order['status'] == 'CANCELLED') return order;
    final id = order['id']! as String;
    final authorization = await _request(
      'POST',
      '/api/auth/supervisor',
      body: {
        'email': credentials.email,
        'pin': credentials.pin,
        'action': 'ORDER_CANCELLED',
        'resourceId': id,
      },
    );
    final token = (jsonDecode(authorization.body) as Json)['token']! as String;
    final response = await _request(
      'POST',
      '/api/orders/$id/cancel',
      body: {'reason': _reason},
      supervisor: token,
    );
    final cancelled = jsonDecode(response.body) as Json;
    expect(cancelled['status'], 'CANCELLED');
    expect(
      jsonObjects(cancelled['payments'])
          .every((payment) => payment['status'] == 'REVERSED'),
      isTrue,
    );
    final audit = await _request('GET', '/api/audit-logs?pageSize=100');
    expect(
      jsonObjects((jsonDecode(audit.body) as Json)['items']).any(
        (entry) =>
            entry['action'] == 'ORDER_CANCELLED' &&
            entry['resourceId'] == id &&
            entry['actorUserId'] == userId &&
            entry['authorizedByUserId'] == userId &&
            entry['reason'] == _reason,
      ),
      isTrue,
      reason: 'O cancelamento precisa preservar ator, supervisor, motivo e referência na auditoria.',
    );
    return cancelled;
  }

  Future<List<String>> recoverPreviousRuns() async {
    final response = await _request('GET', '/api/orders?pageSize=100');
    final orders = jsonObjects((jsonDecode(response.body) as Json)['items']);
    final cancelled = <String>[];
    for (final order in orders) {
      if (order['terminalId'] == credentials.terminalId &&
          order['origin'] == 'TOTEM' &&
          order['status'] != 'CANCELLED' &&
          jsonObjects(order['items']).any((item) => item['notes'] == _note)) {
        final result = await cancelAudited(order);
        cancelled.add(result['id']! as String);
      }
    }
    return cancelled;
  }

  Future<void> logout() async {
    if (_cookie != null) {
      await _request('POST', '/api/auth/logout');
      _cookie = null;
    }
  }
}

Future<T> _eventually<T>(
  Future<T?> Function() check, {
  String label = 'condição REST',
}) async {
  final deadline = DateTime.now().add(const Duration(seconds: 25));
  while (true) {
    final result = await check();
    if (result != null) return result;
    if (DateTime.now().isAfter(deadline)) {
      throw StateError('Prazo excedido aguardando $label.');
    }
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }
}

Future<Json> _confirmed(CentralApi api, String key) =>
    _eventually<Json>(() async {
      try {
        final order = await api.orderByKey(key);
        return jsonObjects(order['payments'])
                .any((payment) => payment['status'] == 'CONFIRMED')
            ? order
            : null;
      } on ApiProblem catch (problem) {
        if (problem.status == 404) return null;
        rethrow;
      }
    }, label: 'persistência do pagamento confirmado');

void _assertSale(
  Json order,
  SaleRecord local,
  CartLine line,
  PaymentTransaction payment,
) {
  expect(order['idempotencyKey'], local.key);
  expect(order['totalCents'], line.totalCents);
  expect(order['origin'], 'TOTEM');
  final item = jsonObjects(order['items']).single;
  expect(item['productId'], line.product.id);
  expect(item['sizeId'], line.size?.id);
  expect(item['quantity'], line.quantity);
  expect(item['unitPriceCents'], line.unitPriceCents);
  expect(item['totalCents'], line.totalCents);
  expect(item['fiscal'], line.product.fiscal.toJson());
  expect(
    jsonObjects(item['additions']),
    jsonObjects(line.toSnapshotJson()['additions']),
  );
  final paid = jsonObjects(order['payments']).single;
  expect(paid['idempotencyKey'], payment.id);
  expect(paid['method'], payment.method.apiValue);
  expect(paid['amountCents'], payment.amountCents);
  expect(paid['status'], 'CONFIRMED');
  expect(paid['nsu'], payment.nsu);
  expect(paid['authorizationCode'], payment.authorizationCode);
}

void main() {
  if (Platform.environment['E2E_REAL_API'] != '1') {
    test(
      'REST real exige ativação explícita',
      () {},
      skip: 'Ative E2E_REAL_API=1 e execute este arquivo explicitamente.',
    );
    return;
  }
  final baseUri = Uri.parse(
    Platform.environment['E2E_API_BASE_URL'] ?? 'http://127.0.0.1:4000',
  );
  if (!['127.0.0.1', 'localhost', '::1'].contains(baseUri.host)) {
    throw StateError('Este teste só pode acessar a API local por loopback.');
  }
  late _Credentials credentials;
  _OwnerSession? owner;
  late Catalog catalog;
  late Directory directory;
  late LocalStore store;
  late _TcpWirePrinter wirePrinter;
  late _ObservedApi api;
  late Set<String> keys;
  late List<_WireResponse> responses;
  final evidence = <Json>[];
  final retainedRecovery = <Json>[];
  var previousRunsCancelled = <String>[];
  var passedCases = 0;
  setUpAll(() async {
    credentials = await _Credentials.load();
    owner = _OwnerSession(baseUri, credentials);
    await owner!.login();
    await owner!.verifyTerminal();
    previousRunsCancelled = await owner!.recoverPreviousRuns();
    catalog = await CentralApi(
      baseUri: baseUri,
      token: credentials.terminalToken,
    ).catalog();
    expect(
      catalog.products.any(
        (product) => product.active && product.availableInKiosk,
      ),
      isTrue,
    );
  });
  setUp(() async {
    sqfliteFfiInit();
    directory = await Directory.systemTemp.createTemp('mango-rest-e2e-');
    store = await LocalStore.open(
      factory: databaseFactoryFfi,
      path: p.join(directory.path, 'kiosk.sqlite'),
    );
    await store.saveCatalog(catalog);
    wirePrinter = await _TcpWirePrinter.open();
    keys = <String>{};
    responses = <_WireResponse>[];
    api = _ObservedApi(
      baseUri: baseUri,
      token: credentials.terminalToken,
      keys: keys,
      responses: responses,
    );
  });
  tearDown(() async {
    var cleanupSucceeded = false;
    try {
      for (final key in keys) {
        Json? order;
        try {
          order = await api.orderByKey(key);
        } on ApiProblem catch (problem) {
          if (problem.status != 404) rethrow;
        }
        final local = await store.sale(key);
        if (order == null && local?.confirmedAt != null) {
          await api.syncOrder(local!.syncPayload());
          order = await _confirmed(api, key);
        }
        if (order != null) {
          final cancelled = await owner!.cancelAudited(order);
          for (final item in evidence.where(
            (item) => item['idempotencyKey'] == key,
          )) {
            item['cancelledOrderId'] = cancelled['id'];
            item['cancellationAudited'] = true;
          }
        } else {
          await api.acknowledgeReceipt(key, {
            'printed': false,
            'failureReason': _reason,
          });
        }
      }
      cleanupSucceeded = true;
    } finally {
      await store.close();
      await wirePrinter.close();
      final parent = p.normalize(Directory.systemTemp.absolute.path),
          target = p.normalize(directory.absolute.path);
      if (!p.isWithin(parent, target) ||
          !p.basename(target).startsWith('mango-rest-e2e-')) {
        throw StateError(
          'Limpeza recusada: diretório temporário fora do destino esperado.',
        );
      }
      if (cleanupSucceeded) {
        await directory.delete(recursive: true);
      } else {
        // A failing cleanup must retain the local outbox for recovery, never erase it.
        retainedRecovery.add({'directory': target, 'orderKeys': keys.toList()});
      }
    }
  });
  tearDownAll(() async {
    var sessionClosed = owner == null;
    try {
      await owner?.logout();
      sessionClosed = true;
    } finally {
      final output = File(
        p.join(
          Directory.current.path,
          'build',
          'evidence',
          'central-rest.json',
        ),
      );
      await output.parent.create(recursive: true);
      await output.writeAsString(
        const JsonEncoder.withIndent('  ').convert({
          'status':
              sessionClosed &&
                  retainedRecovery.isEmpty &&
                  passedCases == 2 &&
                  evidence.every((item) => item['cancellationAudited'] == true)
              ? 'passed'
              : 'incomplete',
          'executedAt': DateTime.now().toUtc().toIso8601String(),
          'transport': 'real HTTP + local TCP ESC/POS wire endpoint',
          'physicalPrinterVerified': false,
          'cases': evidence,
          'previousRunsCancelled': previousRunsCancelled,
          'retainedRecovery': retainedRecovery,
        }),
        flush: true,
      );
    }
  });
  CartLine line(int quantity) {
    final product = catalog.products.firstWhere(
      (product) => product.active && product.availableInKiosk,
    );
    return CartLine(
      id: const Uuid().v7(),
      product: product,
      size: product.sizes.isEmpty ? null : product.sizes.first,
      quantity: quantity,
      additions: {
        if (product.additions.isNotEmpty) product.additions.first.id: 1,
      },
      notes: _note,
    );
  }

  CheckoutRepository checkout(CentralApi gateway) => CheckoutRepository(
    store: store,
    api: gateway,
    paymentGateway: SimulatedPinpadAdapter(store, stepDelay: Duration.zero),
    printer: wirePrinter.gateway,
    terminalId: credentials.terminalId,
  );

  test(
    'checkout online Flutter confirma após TCP, ACK e persistência PostgreSQL',
    () async {
      final item = line(2), repository = checkout(api);
      final result = await repository.checkout([
        item,
      ], PaymentMethod.creditCard);
      expect(result.offline, isFalse);
      expect(result.ticket, matches(RegExp(r'^\d{3,}$')));
      final local = (await store.sale(result.orderKey))!,
          payment = (await store.payment(local.paymentKey))!;
      expect(local.printedAt, isNotNull);
      expect(local.confirmedAt, isNotNull);
      expect(payment.state, PaymentState.confirmed);
      await repository.syncPending();
      final order = await _confirmed(api, result.orderKey);
      _assertSale(order, local, item, payment);
      expect(order['publicTicketNumber'], result.ticket);
      expect(await store.pendingCount(), 0);
      final repeated = await api.createOrder(local.payload);
      expect(repeated['id'], order['id']);
      expect(
        jsonObjects(repeated['payments']).single['id'],
        jsonObjects(order['payments']).single['id'],
      );
      await _eventually<int>(
        () async => wirePrinter.receipts.length == 1 ? 1 : null,
        label: 'recebimento dos bytes ESC/POS',
      );
      expect(
        ascii.decode(wirePrinter.receipts.single, allowInvalid: true),
        contains('SENHA ${result.ticket}'),
      );
      expect(
        responses.any(
          (entry) =>
              entry.method == 'POST' &&
              entry.path == '/api/orders' &&
              entry.status == 201,
        ),
        isTrue,
      );
      expect(
        responses.any(
          (entry) => entry.path.endsWith('/receipt') && entry.status == 200,
        ),
        isTrue,
      );
      evidence.add({
        'flow': 'online',
        'idempotencyKey': result.orderKey,
        'orderId': order['id'],
        'ticket': result.ticket,
        'amountCents': item.totalCents,
        'paymentStatus': 'CONFIRMED',
        'tcpReceipts': wirePrinter.receipts.length,
        'outboxRemaining': await store.pendingCount(),
        'idempotentReplay': true,
      });
      passedCases++;
    },
    timeout: const Timeout(Duration(seconds: 60)),
  );

  test(
    'contingência SQLite reaparece após reinício e sincroniza via RabbitMQ 202',
    () async {
      final reserved = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0),
          closedPort = reserved.port;
      await reserved.close();
      final unavailable = _ObservedApi(
        baseUri: Uri.parse('http://127.0.0.1:$closedPort'),
        token: credentials.terminalToken,
        keys: keys,
        responses: responses,
      );
      expect(unavailable.timeout, const Duration(milliseconds: 3000));
      final item = line(3), watch = Stopwatch()..start();
      final result = await checkout(unavailable)
          .checkout([item], PaymentMethod.pix);
      watch.stop();
      expect(result.offline, isTrue);
      expect(watch.elapsedMilliseconds, lessThan(4000));
      final before = (await store.sale(result.orderKey))!;
      expect(before.contingency, isTrue);
      expect(await store.pendingCount(), 1);
      await store.close();
      store = await LocalStore.open(
        factory: databaseFactoryFfi,
        path: p.join(directory.path, 'kiosk.sqlite'),
      );
      final local = (await store.sale(result.orderKey))!,
          payment = (await store.payment(local.paymentKey))!;
      expect(local.ticket, result.ticket);
      expect(local.printedAt, isNotNull);
      expect(payment.state, PaymentState.confirmed);
      final recoveredApi = _ObservedApi(
            baseUri: baseUri,
            token: credentials.terminalToken,
            keys: keys,
            responses: responses,
          ),
          repository = checkout(recoveredApi);
      await repository.recover();
      await repository.syncPending();
      expect(
        responses.any(
          (entry) => entry.path == '/api/offline-sync' && entry.status == 202,
        ),
        isTrue,
      );
      final order = await _confirmed(recoveredApi, result.orderKey);
      await _eventually<int>(() async {
        await repository.syncPending();
        return await store.pendingCount() == 0 ? 0 : null;
      }, label: 'remoção da outbox após confirmação persistida');
      _assertSale(order, local, item, payment);
      expect(order['publicTicketNumber'], result.ticket);
      final repeated = await recoveredApi.createOrder(local.payload);
      expect(repeated['id'], order['id']);
      await repository.syncPending();
      await _eventually<int>(
        () async => wirePrinter.receipts.length == 1 ? 1 : null,
        label: 'comprovante único de contingência',
      );
      expect(wirePrinter.sensorQueries, greaterThanOrEqualTo(1));
      expect(
        ascii.decode(wirePrinter.receipts.single, allowInvalid: true),
        contains('VENDA EM CONTINGENCIA'),
      );
      evidence.add({
        'flow': 'offline-restart-rabbitmq',
        'idempotencyKey': result.orderKey,
        'orderId': order['id'],
        'ticket': result.ticket,
        'amountCents': item.totalCents,
        'paymentStatus': 'CONFIRMED',
        'offlineSyncHttpStatus': 202,
        'tcpReceipts': wirePrinter.receipts.length,
        'outboxRemaining': await store.pendingCount(),
        'idempotentReplay': true,
      });
      passedCases++;
    },
    timeout: const Timeout(Duration(seconds: 60)),
  );
}
