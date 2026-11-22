import 'dart:convert';
import 'dart:typed_data';

import 'package:sqflite/sqflite.dart';

import '../domain/models.dart';
import '../domain/ports.dart';

/// SQLite is the durable boundary for orders, payment recovery and the outbox.
/// Catalog refreshes never delete sales or pending transactions.
class LocalStore implements PaymentPersistence {
  LocalStore._(this.database);
  final Database database;

  static Future<LocalStore> open({
    required DatabaseFactory factory,
    required String path,
  }) async {
    final database = await factory.openDatabase(
      path,
      options: OpenDatabaseOptions(
        version: 1,
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
          await db.rawQuery('PRAGMA journal_mode = WAL');
          await db.execute('PRAGMA synchronous = FULL');
          await db.execute('PRAGMA busy_timeout = 3000');
        },
        onCreate: (db, version) async {
          final statements = [
            'CREATE TABLE catalog_metadata (id INTEGER PRIMARY KEY CHECK(id = 1), version TEXT NOT NULL, updated_at TEXT NOT NULL)',
            'CREATE TABLE terminal_state (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)',
            'CREATE TABLE categories (id TEXT PRIMARY KEY, payload TEXT NOT NULL)',
            'CREATE TABLE products (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, payload TEXT NOT NULL)',
            'CREATE TABLE product_sizes (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, payload TEXT NOT NULL)',
            'CREATE TABLE product_additions (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, payload TEXT NOT NULL)',
            'CREATE TABLE image_cache (url TEXT PRIMARY KEY, bytes BLOB NOT NULL, cached_at TEXT NOT NULL)',
            'CREATE TABLE daily_sequences (day TEXT PRIMARY KEY, sequence INTEGER NOT NULL)',
            'CREATE TABLE payment_transactions (id TEXT PRIMARY KEY, order_key TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)',
            '''CREATE TABLE local_orders (idempotency_key TEXT PRIMARY KEY, payment_key TEXT NOT NULL UNIQUE REFERENCES payment_transactions(id),
            payload TEXT NOT NULL, receipt TEXT NOT NULL, ticket TEXT NOT NULL, contingency INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL, printed_at TEXT, confirmed_at TEXT, synced_at TEXT, cancelled INTEGER NOT NULL DEFAULT 0)''',
            '''CREATE TABLE print_jobs (order_key TEXT PRIMARY KEY REFERENCES local_orders(idempotency_key),
            state TEXT NOT NULL CHECK(state IN ('QUEUED','PRINTING','PRINTED','FAILED','UNCERTAIN')), attempts INTEGER NOT NULL DEFAULT 0, printing_started_at TEXT, last_error TEXT)''',
            '''CREATE TABLE offline_orders_outbox (idempotency_key TEXT PRIMARY KEY REFERENCES local_orders(idempotency_key),
            kind TEXT NOT NULL DEFAULT 'SALE', state TEXT NOT NULL DEFAULT 'WAITING_PRINT', attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TEXT NOT NULL, last_error TEXT)''',
            'CREATE INDEX ix_outbox_due ON offline_orders_outbox(state, next_attempt_at)',
            'CREATE INDEX ix_payment_pending ON payment_transactions(state)',
          ];
          for (final statement in statements) {
            await db.execute(statement);
          }
        },
      ),
    );
    return LocalStore._(database);
  }

  Future<void> saveCatalog(Catalog catalog) async =>
      database.transaction((tx) async {
        await tx.delete('product_sizes');
        await tx.delete('product_additions');
        await tx.delete('products');
        await tx.delete('categories');
        final batch = tx.batch();
        for (final category in catalog.categories) {
          batch.insert('categories', {
            'id': category.id,
            'payload': jsonEncode(category.toJson()),
          });
        }
        for (final product in catalog.products) {
          final json = product.toJson()
            ..remove('sizes')
            ..remove('additions');
          batch.insert('products', {
            'id': product.id,
            'category_id': product.categoryId,
            'payload': jsonEncode(json),
          });
          for (final size in product.sizes) {
            batch.insert('product_sizes', {
              'id': size.id,
              'product_id': product.id,
              'payload': jsonEncode(size.toJson()),
            });
          }
          for (final addition in product.additions) {
            batch.insert('product_additions', {
              'id': addition.id,
              'product_id': product.id,
              'payload': jsonEncode(addition.toJson()),
            });
          }
        }
        batch.insert('catalog_metadata', {
          'id': 1,
          'version': catalog.version,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        }, conflictAlgorithm: ConflictAlgorithm.replace);
        await batch.commit(noResult: true);
      });

  Future<Catalog?> readCatalog() async {
    final metadata = await database.query('catalog_metadata');
    if (metadata.isEmpty) return null;
    final categories = await database.query('categories');
    final products = await database.query('products');
    final sizes = await database.query('product_sizes');
    final additions = await database.query('product_additions');
    final sizesByProduct = <String, List<Json>>{};
    final additionsByProduct = <String, List<Json>>{};
    for (final row in sizes) {
      (sizesByProduct[row['product_id']! as String] ??= []).add(
        _decode(row['payload']),
      );
    }
    for (final row in additions) {
      (additionsByProduct[row['product_id']! as String] ??= []).add(
        _decode(row['payload']),
      );
    }
    return Catalog.fromJson({
      'version': metadata.first['version'],
      'categories': categories.map((row) => _decode(row['payload'])).toList(),
      'products': products
          .map(
            (row) => {
              ..._decode(row['payload']),
              'sizes': sizesByProduct[row['id']] ?? <Json>[],
              'additions': additionsByProduct[row['id']] ?? <Json>[],
            },
          )
          .toList(),
    });
  }

  Future<void> cacheImage(String url, Uint8List bytes) async {
    if (bytes.length > 8 * 1024 * 1024) return;
    await database.insert('image_cache', {
      'url': url,
      'bytes': bytes,
      'cached_at': DateTime.now().toUtc().toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<TerminalState?> readTerminal() async {
    final rows = await database.query('terminal_state');
    return rows.isEmpty
        ? null
        : TerminalState.fromJson(_decode(rows.first['payload']));
  }

  Future<void> saveTerminal(TerminalState state) async => database.insert(
    'terminal_state',
    {'id': 1, 'payload': jsonEncode(state.toJson())},
    conflictAlgorithm: ConflictAlgorithm.replace,
  );

  Future<Uint8List?> readImage(String url) async {
    final rows = await database.query(
      'image_cache',
      columns: ['bytes'],
      where: 'url = ?',
      whereArgs: [url],
    );
    return rows.isEmpty ? null : rows.first['bytes']! as Uint8List;
  }

  @override
  Future<void> savePayment(PaymentTransaction payment) async {
    await database.rawInsert(
      '''INSERT INTO payment_transactions(id, order_key, state, payload, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state=excluded.state, payload=excluded.payload, updated_at=excluded.updated_at''',
      [
        payment.id,
        payment.orderKey,
        payment.state.name,
        jsonEncode(payment.toJson()),
        DateTime.now().toUtc().toIso8601String(),
      ],
    );
  }

  @override
  Future<PaymentTransaction?> payment(String id) async {
    final rows = await database.query(
      'payment_transactions',
      where: 'id = ?',
      whereArgs: [id],
    );
    return rows.isEmpty
        ? null
        : PaymentTransaction.fromJson(_decode(rows.first['payload']));
  }

  @override
  Future<List<PaymentTransaction>> pendingPayments() async =>
      (await database.query(
            'payment_transactions',
            where: "state NOT IN ('confirmed','reversed','failed')",
          ))
          .map((row) => PaymentTransaction.fromJson(_decode(row['payload'])))
          .toList();

  Future<SaleRecord> createSale({
    required String key,
    required String paymentKey,
    required Json payload,
    required List<Json> receipt,
    required String terminalId,
    required DateTime now,
  }) async {
    await database.transaction((tx) async {
      final existing = await tx.query(
        'local_orders',
        where: 'idempotency_key = ?',
        whereArgs: [key],
      );
      if (existing.isNotEmpty) return;
      final local = now.toLocal();
      final day =
          '${local.year}${local.month.toString().padLeft(2, '0')}${local.day.toString().padLeft(2, '0')}';
      await tx.rawInsert(
        'INSERT INTO daily_sequences(day, sequence) VALUES (?, 0) ON CONFLICT(day) DO NOTHING',
        [day],
      );
      await tx.rawUpdate(
        'UPDATE daily_sequences SET sequence = sequence + 1 WHERE day = ?',
        [day],
      );
      final sequence =
          (await tx.query(
                'daily_sequences',
                where: 'day = ?',
                whereArgs: [day],
              )).first['sequence']!
              as int;
      final safeTerminal = terminalId
          .replaceAll(RegExp('[^a-zA-Z0-9]'), '')
          .toUpperCase();
      final label = safeTerminal.length > 10
          ? safeTerminal.substring(safeTerminal.length - 10)
          : safeTerminal;
      final ticket =
          '$label-${day.substring(2)}-${sequence.toString().padLeft(4, '0')}';
      await tx.insert('local_orders', {
        'idempotency_key': key,
        'payment_key': paymentKey,
        'payload': jsonEncode(payload),
        'receipt': jsonEncode(receipt),
        'ticket': ticket,
        'created_at': now.toUtc().toIso8601String(),
      });
      await tx.insert('print_jobs', {'order_key': key, 'state': 'QUEUED'});
      await tx.insert('offline_orders_outbox', {
        'idempotency_key': key,
        'next_attempt_at': now.toUtc().toIso8601String(),
      });
    });
    return (await sale(key))!;
  }

  @override
  Future<SaleRecord?> sale(String key) async {
    final rows = await database.query(
      'local_orders',
      where: 'idempotency_key = ?',
      whereArgs: [key],
    );
    return rows.isEmpty ? null : _sale(rows.first);
  }

  Future<List<SaleRecord>> recoverySales() async => (await database.query(
    'local_orders',
    where: 'cancelled = 0 AND confirmed_at IS NULL',
    orderBy: 'created_at',
  )).map(_sale).toList();
  Future<void> assignCentralTicket(String key, String ticket) async =>
      database.update(
        'local_orders',
        {'ticket': ticket, 'contingency': 0},
        where: 'idempotency_key = ? AND printed_at IS NULL',
        whereArgs: [key],
      );
  Future<void> markPrinting(String key) async => database.rawUpdate(
    "UPDATE print_jobs SET state='PRINTING', attempts=attempts+1, printing_started_at=? WHERE order_key=?",
    [DateTime.now().toUtc().toIso8601String(), key],
  );
  Future<String?> printState(String key) async {
    final rows = await database.query(
      'print_jobs',
      columns: ['state'],
      where: 'order_key=?',
      whereArgs: [key],
    );
    return rows.isEmpty ? null : rows.first['state']! as String;
  }

  Future<void> markPrintUncertain(String key, String message) async =>
      database.update(
        'print_jobs',
        {'state': 'UNCERTAIN', 'last_error': message},
        where: 'order_key=?',
        whereArgs: [key],
      );
  Future<List<SaleRecord>> printReviews() async => (await database.rawQuery(
    "SELECT o.* FROM local_orders o JOIN print_jobs p ON p.order_key=o.idempotency_key WHERE p.state='UNCERTAIN' AND o.cancelled=0 AND o.confirmed_at IS NULL ORDER BY o.created_at",
  )).map(_sale).toList();
  Future<void> markPrinted(String key, DateTime now) async =>
      database.transaction((tx) async {
        await tx.update(
          'local_orders',
          {'printed_at': now.toUtc().toIso8601String()},
          where: 'idempotency_key = ?',
          whereArgs: [key],
        );
        await tx.update(
          'print_jobs',
          {'state': 'PRINTED', 'last_error': null},
          where: 'order_key = ?',
          whereArgs: [key],
        );
      });
  Future<void> markConfirmed(
    String key,
    DateTime now,
  ) async => database.transaction((tx) async {
    final rows = await tx.query(
      'local_orders',
      where: 'idempotency_key = ? AND printed_at IS NOT NULL AND cancelled = 0',
      whereArgs: [key],
    );
    if (rows.isEmpty) {
      throw StateError(
        'O comprovante precisa ser aceito pela impressora antes da confirmação.',
      );
    }
    await tx.update(
      'local_orders',
      {'confirmed_at': now.toUtc().toIso8601String()},
      where: 'idempotency_key = ?',
      whereArgs: [key],
    );
    await tx.update(
      'offline_orders_outbox',
      {'state': 'READY'},
      where: 'idempotency_key = ?',
      whereArgs: [key],
    );
  });
  Future<void> cancelSale(String key, String reason, DateTime now) async =>
      database.transaction((tx) async {
        await tx.update(
          'local_orders',
          {'cancelled': 1},
          where: 'idempotency_key = ? AND confirmed_at IS NULL',
          whereArgs: [key],
        );
        await tx.update(
          'print_jobs',
          {'state': 'FAILED', 'last_error': reason},
          where: 'order_key = ?',
          whereArgs: [key],
        );
        await tx.update(
          'offline_orders_outbox',
          {
            'kind': 'CANCELLATION',
            'state': 'READY',
            'last_error': reason,
            'next_attempt_at': now.toUtc().toIso8601String(),
          },
          where: 'idempotency_key = ?',
          whereArgs: [key],
        );
      });

  Future<List<Json>> dueOutbox(DateTime now) async => database.query(
    'offline_orders_outbox',
    where: "state = 'READY' AND next_attempt_at <= ?",
    whereArgs: [now.toUtc().toIso8601String()],
    orderBy: 'next_attempt_at',
    limit: 20,
  );
  Future<void> markSynced(String key, DateTime now) async =>
      database.transaction((tx) async {
        await tx.update(
          'local_orders',
          {'synced_at': now.toUtc().toIso8601String()},
          where: 'idempotency_key = ?',
          whereArgs: [key],
        );
        await tx.delete(
          'offline_orders_outbox',
          where: 'idempotency_key = ?',
          whereArgs: [key],
        );
      });
  Future<void> failOutbox(
    String key, {
    required int attempts,
    required String message,
    required DateTime nextAttempt,
    bool permanent = false,
  }) async => database.update(
    'offline_orders_outbox',
    {
      'attempts': attempts,
      'last_error': message,
      'state': permanent ? 'REVIEW' : 'READY',
      'next_attempt_at': nextAttempt.toUtc().toIso8601String(),
    },
    where: 'idempotency_key = ?',
    whereArgs: [key],
  );
  Future<int> pendingCount() async =>
      Sqflite.firstIntValue(
        await database.rawQuery('SELECT COUNT(*) FROM offline_orders_outbox'),
      ) ??
      0;
  Future<int> reviewCount() async =>
      Sqflite.firstIntValue(
        await database.rawQuery(
          "SELECT COUNT(*) FROM offline_orders_outbox WHERE state='REVIEW'",
        ),
      ) ??
      0;
  Future<void> retryReview(DateTime now) async => database.update(
    'offline_orders_outbox',
    {'state': 'READY', 'next_attempt_at': now.toUtc().toIso8601String()},
    where: "state='REVIEW'",
  );
  Future<void> close() => database.close();

  static Json _decode(Object? json) =>
      (jsonDecode(json! as String) as Map<String, Object?>);
  static SaleRecord _sale(Json row) => SaleRecord(
    key: row['idempotency_key']! as String,
    paymentKey: row['payment_key']! as String,
    payload: _decode(row['payload']),
    receipt: jsonObjects(jsonDecode(row['receipt']! as String)),
    ticket: row['ticket']! as String,
    createdAt: DateTime.parse(row['created_at']! as String),
    printedAt: _date(row['printed_at']),
    confirmedAt: _date(row['confirmed_at']),
    syncedAt: _date(row['synced_at']),
    cancelled: row['cancelled'] == 1,
    contingency: row['contingency'] == 1,
  );
  static DateTime? _date(Object? value) =>
      value == null ? null : DateTime.parse(value as String);
}
