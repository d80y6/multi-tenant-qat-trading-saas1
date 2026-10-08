import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/sync_service.dart';
import 'debts_screen.dart';
import 'invoices_screen.dart';
import 'pos_screen.dart';
import 'settings_screen.dart';

/// الهيكل الرئيسي للتطبيق مع شريط تنقل سفلي ومؤشر حالة المزامنة.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final pending = await ref.read(localStoreProvider).pendingCount();
      if (mounted) ref.read(pendingCountProvider.notifier).state = pending;
    });
  }

  @override
  Widget build(BuildContext context) {
    final pages = const [PosScreen(), InvoicesScreen(), DebtsScreen(), SettingsScreen()];
    return Scaffold(
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.bolt), label: 'بيع سريع'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'الفواتير'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet), label: 'الديون'),
          NavigationDestination(icon: Icon(Icons.settings), label: 'الإعدادات'),
        ],
      ),
      floatingActionButton: FloatingActionButton.small(
        onPressed: () async {
          final result = await ref.read(syncServiceProvider).syncNow();
          final pending = await ref.read(localStoreProvider).pendingCount();
          ref.read(pendingCountProvider.notifier).state = pending;
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.error == null
                  ? 'تمت المزامنة: ${result.applied} عملية'
                  : 'تعذرت المزامنة — سيعاد المحاولة تلقائياً'),
            ),
          );
        },
        child: const Icon(Icons.sync),
      ),
    );
  }
}
