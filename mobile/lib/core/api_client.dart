import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// عميل REST موحّد لمنصة "قاتي بزنس".
/// يحقن توكن JWT (الذي يحوي tenant_id / user_id / role) في كل طلب.
class ApiClient {
  ApiClient({required this.baseUrl}) {
    _dio = Dio(
      BaseOptions(
        baseUrl: '$baseUrl/api/v1',
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await readToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  final String baseUrl;
  late final Dio _dio;

  static const _tokenKey = 'auth_token';

  Future<String?> readToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }

  Future<Map<String, dynamic>> login(String phone, String password) async {
    final res = await _dio.post('/auth/login', data: {
      'phone': phone,
      'password': password,
    });
    final data = Map<String, dynamic>.from(res.data['data'] as Map);
    await saveToken(data['token'] as String);
    return data;
  }

  Future<List<dynamic>> qatTypes() async {
    final res = await _dio.get('/qat-types');
    return res.data['data'] as List<dynamic>;
  }

  Future<List<dynamic>> customers({String query = ''}) async {
    final res = await _dio.get('/customers', queryParameters: {'q': query});
    return res.data['data'] as List<dynamic>;
  }

  Future<List<dynamic>> suppliers({String query = ''}) async {
    final res = await _dio.get('/suppliers', queryParameters: {'q': query});
    return res.data['data'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> createSale(Map<String, dynamic> payload) async {
    final res = await _dio.post('/sales', data: payload);
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  Future<Map<String, dynamic>> createPurchase(Map<String, dynamic> payload) async {
    final res = await _dio.post('/purchases', data: payload);
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    await _dio.post('/auth/change-password', data: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  Future<Map<String, dynamic>> collection(Map<String, dynamic> payload) async {
    final res = await _dio.post('/vouchers/collections', data: payload);
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  Future<Map<String, dynamic>> payment(Map<String, dynamic> payload) async {
    final res = await _dio.post('/vouchers/payments', data: payload);
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  Future<Map<String, dynamic>> statement(String partyType, String partyId) async {
    final res = await _dio.get('/statements', queryParameters: {
      'partyType': partyType,
      'partyId': partyId,
    });
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  /// دفعة المزامنة: ترسل كل العمليات المخزنة محلياً دفعة واحدة.
  Future<Map<String, dynamic>> syncBatch({
    required String deviceId,
    required List<Map<String, dynamic>> operations,
  }) async {
    final res = await _dio.post('/sync/batch', data: {
      'deviceId': deviceId,
      'operations': operations,
    });
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  Future<Map<String, dynamic>> syncPull(DateTime since) async {
    final res = await _dio.get('/sync/pull', queryParameters: {
      'since': since.toUtc().toIso8601String(),
    });
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }
}
