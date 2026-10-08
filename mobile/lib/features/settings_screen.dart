import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/sync_service.dart';
import 'login_screen.dart';

/// الإعدادات: حالة المزامنة، تغيير كلمة المرور، والخروج.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (_current.text.isEmpty || _next.text.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('أدخل كلمة المرور الحالية وجديدة من 4 أحرف على الأقل')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).changePassword(_current.text, _next.text);
      _current.clear();
      _next.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تغيير كلمة المرور')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تعذر تغيير كلمة المرور')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    await ref.read(apiClientProvider).clearToken();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(pendingCountProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('الإعدادات')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.cloud_sync),
              title: const Text('حالة المزامنة'),
              subtitle: Text(pending > 0 ? '$pending عملية بانتظار المزامنة' : 'كل شيء متزامن'),
              trailing: FilledButton.tonal(
                onPressed: () async {
                  final result = await ref.read(syncServiceProvider).syncNow();
                  final count = await ref.read(localStoreProvider).pendingCount();
                  ref.read(pendingCountProvider.notifier).state = count;
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(result.error == null
                          ? 'تمت المزامنة: ${result.applied} عملية'
                          : 'تعذرت المزامنة — سيعاد المحاولة تلقائياً'),
                    ),
                  );
                },
                child: const Text('مزامنة'),
              ),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _current,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'كلمة المرور الحالية',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _next,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'كلمة المرور الجديدة',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _changePassword,
            child: Text(_busy ? 'جارٍ الحفظ...' : 'تغيير كلمة المرور'),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: _logout,
            icon: const Icon(Icons.logout),
            label: const Text('تسجيل الخروج'),
          ),
        ],
      ),
    );
  }
}
