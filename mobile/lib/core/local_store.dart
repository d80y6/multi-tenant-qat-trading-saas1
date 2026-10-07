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
}
