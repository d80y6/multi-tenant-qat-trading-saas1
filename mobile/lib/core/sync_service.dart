import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'local_store.dart';

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(baseUrl: const String.fromEnvironment('API_BASE_URL',
      defaultValue: 'https://qati.example.com')),
);

final localStoreProvider = Provider<LocalStore>((ref) => LocalStore());

final syncServiceProvider = Provider<SyncService>(
  (ref) => SyncService(ref.read(apiClientProvider), ref.read(localStoreProvider))..start(),
);

final pendingCountProvider = StateProvider<int>((ref) => 0);

/// مزامنة خلفية:
/// 1) ترسل طابور العمليات (outbox) إلى /sync/batch — العمليات idempotent عبر clientUuid.
/// 2) تسحب التغييرات الجديدة من /sync/pull وتحدّث الكاش المحلي.
class SyncService {
  SyncService(this._api, this._store);

  final ApiClient _api;
  final LocalStore _store;
  StreamSubscription<ConnectivityResult>? _subscription;
  Timer? _timer;
  bool _running = false;

  void start() {
    _subscription = Connectivity().onConnectivityChanged.listen((result) {
      if (result != ConnectivityResult.none) {
        unawaited(syncNow());
      }
    });
    _timer = Timer.periodic(const Duration(minutes: 2), (_) => unawaited(syncNow()));
  }

  void dispose() {
    _subscription?.cancel();
    _timer?.cancel();
  }

  Future<SyncResult> syncNow() async {
    if (_running) return SyncResult.skipped();
    _running = true;
    try {
      final operations = await _store.pendingOperations();
      var applied = 0;
      var failed = 0;

      if (operations.isNotEmpty) {
        final response = await _api.syncBatch(
          deviceId: await _deviceId(),
          operations: operations.cast<Map<String, dynamic>>(),
        );
        final results = (response['results'] as List<dynamic>).cast<Map<String, dynamic>>();
        final syncedUuids = <String>[];
        for (final result in results) {
          if (result['status'] == 'applied' || result['status'] == 'duplicate') {
            syncedUuids.add(result['clientUuid'] as String);
            applied++;
          } else {
            failed++;
            await _store.markFailed(
              result['clientUuid'] as String,
              '${result['error']}',
            );
          }
        }
        await _store.markSynced(syncedUuids);
      }

      await pull();
      return SyncResult(applied: applied, failed: failed);
    } catch (error) {
      return SyncResult(applied: 0, failed: 0, error: '$error');
    } finally {
      _running = false;
    }
  }

  Future<void> pull() async {
    final prefs = await SharedPreferences.getInstance();
    final lastSync = prefs.getString('last_sync');
    final since = lastSync != null ? DateTime.parse(lastSync) : DateTime.fromMillisecondsSinceEpoch(0);

    final data = await _api.syncPull(since);
    await _store.cacheQatTypes(data['qatTypes'] as List<dynamic>);
    await _store.cacheParties('customer', data['customers'] as List<dynamic>);
    await _store.cacheParties('supplier', data['suppliers'] as List<dynamic>);
    await prefs.setString('last_sync', data['serverTime'] as String);
  }

  Future<String> _deviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString('device_id');
    if (id == null) {
      id = 'android-${DateTime.now().millisecondsSinceEpoch}';
      await prefs.setString('device_id', id);
    }
    return id;
  }
}

class SyncResult {
  SyncResult({required this.applied, required this.failed, this.error});
  factory SyncResult.skipped() => SyncResult(applied: 0, failed: 0);

  final int applied;
  final int failed;
  final String? error;
}
