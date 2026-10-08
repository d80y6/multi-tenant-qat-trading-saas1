import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// قاعدة بيانات محلية (Offline-First).
/// جدول outbox يحتفظ بالعمليات غير المتزامنة، وجداول الكاش تخزن البيانات المرجعية
/// حتى يعمل التطبيق بالكامل بدون إنترنت داخل السوق.
class LocalStore {
  Database? _db;

  Future<Database> get db async => _db ??= await _open();

  Future<Database> _open() async {
    final dir = await getDatabasesPath();
    return openDatabase(
      p.join(dir, 'qati_business.db'),
      version: 1,
      onCreate: (database, _) async {
        await database.execute('''
          CREATE TABLE outbox (
            client_uuid TEXT PRIMARY KEY,
            entity TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT
          );
        ''');
        await database.execute('''
          CREATE TABLE cache_parties (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            balance REAL NOT NULL DEFAULT 0
          );
        ''');
        await database.execute('''
          CREATE TABLE cache_qat_types (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            default_price REAL NOT NULL DEFAULT 0
          );
        ''');
        await database.execute('''
          CREATE TABLE cache_invoices (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            invoice_no INTEGER NOT NULL,
            party_name TEXT,
            total REAL NOT NULL DEFAULT 0,
            paid REAL NOT NULL DEFAULT 0,
            remaining REAL NOT NULL DEFAULT 0,
            payment_status TEXT,
            date TEXT
          );
        ''');
        await database.execute('''
          CREATE TABLE cache_invoice_items (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            name TEXT NOT NULL,
            quantity REAL NOT NULL DEFAULT 0,
            unit_price REAL NOT NULL DEFAULT 0,
            subtotal REAL NOT NULL DEFAULT 0
          );
        ''');
      },
    );
  }

  Future<void> enqueue({
    required String clientUuid,
    required String entity,
    required Map<String, dynamic> payload,
  }) async {
    final database = await db;
    await database.insert(
      'outbox',
      {
        'client_uuid': clientUuid,
        'entity': entity,
        'payload': jsonEncode(payload),
        'created_at': DateTime.now().toIso8601String(),
        'status': 'pending',
      },
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
  }

  Future<List<Map<String, dynamic>>> pendingOperations({int limit = 200}) async {
    final database = await db;
    final rows = await database.query(
      'outbox',
      where: 'status = ?',
      whereArgs: ['pending'],
      orderBy: 'created_at ASC',
      limit: limit,
    );
    return rows
        .map((row) => {
              'clientUuid': row['client_uuid'],
              'entity': row['entity'],
              'createdAt': row['created_at'],
              'payload': jsonDecode(row['payload'] as String),
            })
        .toList();
  }

  Future<void> markSynced(List<String> clientUuids) async {
    if (clientUuids.isEmpty) return;
    final database = await db;
    final placeholders = List.filled(clientUuids.length, '?').join(',');
    await database.rawUpdate(
      'UPDATE outbox SET status = "synced" WHERE client_uuid IN ($placeholders)',
      clientUuids,
    );
  }

  Future<void> markFailed(String clientUuid, String error) async {
    final database = await db;
    await database.update(
      'outbox',
      {'status': 'failed', 'error': error},
      where: 'client_uuid = ?',
      whereArgs: [clientUuid],
    );
  }

  Future<int> pendingCount() async {
    final database = await db;
    final res = await database
        .rawQuery('SELECT COUNT(*) AS c FROM outbox WHERE status = "pending"');
    return Sqflite.firstIntValue(res) ?? 0;
  }

  Future<void> cacheParties(String type, List<dynamic> rows) async {
    final database = await db;
    final batch = database.batch();
    for (final row in rows) {
      batch.insert(
        'cache_parties',
        {
          'id': row['id'],
          'type': type,
          'name': row['name'],
          'phone': row['phone'],
          'balance': double.tryParse('${row['balance']}') ?? 0,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, Object?>>> parties(String type, String query) async {
    final database = await db;
    return database.query(
      'cache_parties',
      where: 'type = ? AND name LIKE ?',
      whereArgs: [type, '%$query%'],
      orderBy: 'balance DESC',
      limit: 50,
    );
  }

  Future<void> cacheQatTypes(List<dynamic> rows) async {
    final database = await db;
    final batch = database.batch();
    for (final row in rows) {
      batch.insert(
        'cache_qat_types',
        {
          'id': row['id'],
          'name': row['name'],
          'default_price': double.tryParse('${row['defaultPrice']}') ?? 0,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, Object?>>> qatTypes() async {
    final database = await db;
    return database.query('cache_qat_types', orderBy: 'name ASC');
  }

  /// تخزين الفواتير وأصنافها لعرضها بدون إنترنت.
  Future<void> cacheInvoices({
    required List<dynamic> sales,
    required List<dynamic> purchases,
    required List<dynamic> saleItems,
    required List<dynamic> purchaseItems,
  }) async {
    final database = await db;
    final batch = database.batch();

    for (final row in sales) {
      batch.insert(
        'cache_invoices',
        {
          'id': row['id'],
          'kind': 'sale',
          'invoice_no': row['invoiceNo'],
          'party_name': row['customerName'] ?? 'نقدي',
          'total': double.tryParse('${row['totalAmount']}') ?? 0,
          'paid': double.tryParse('${row['paidAmount']}') ?? 0,
          'remaining': double.tryParse('${row['remainingAmount']}') ?? 0,
          'payment_status': row['paymentStatus'],
          'date': row['saleDate'].toString(),
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }

    for (final row in purchases) {
      batch.insert(
        'cache_invoices',
        {
          'id': row['id'],
          'kind': 'purchase',
          'invoice_no': row['invoiceNo'],
          'party_name': row['supplierName'] ?? 'غير محدد',
          'total': double.tryParse('${row['totalAmount']}') ?? 0,
          'paid': double.tryParse('${row['paidAmount']}') ?? 0,
          'remaining': double.tryParse('${row['remainingAmount']}') ?? 0,
          'payment_status': row['paymentStatus'],
          'date': row['purchaseDate'].toString(),
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }

    for (final row in [...saleItems, ...purchaseItems]) {
      batch.insert(
        'cache_invoice_items',
        {
          'id': row['id'],
          'invoice_id': row['saleId'] ?? row['purchaseId'],
          'name': row['qatTypeName'],
          'quantity': double.tryParse('${row['quantity']}') ?? 0,
          'unit_price': double.tryParse('${row['unitPrice']}') ?? 0,
          'subtotal': double.tryParse('${row['subtotal']}') ?? 0,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }

    await batch.commit(noResult: true);
  }

  Future<List<Map<String, Object?>>> invoices({String? kind}) async {
    final database = await db;
    return database.query(
      'cache_invoices',
      where: kind == null ? null : 'kind = ?',
      whereArgs: kind == null ? null : [kind],
      orderBy: 'date DESC',
      limit: 200,
    );
  }

  Future<List<Map<String, Object?>>> invoiceItems(String invoiceId) async {
    final database = await db;
    return database.query(
      'cache_invoice_items',
      where: 'invoice_id = ?',
      whereArgs: [invoiceId],
    );
  }
}
