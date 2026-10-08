import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/sync_service.dart';

/// سجل الفواتير — يعمل بالكامل بدون إنترنت من الكاش المحلي.
class InvoicesScreen extends ConsumerStatefulWidget {
  const InvoicesScreen({super.key});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  List<Map<String, Object?>> _rows = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await ref.read(localStoreProvider).invoices();
    if (mounted) setState(() => _rows = rows);
  }

  Future<void> _details(Map<String, Object?> invoice) async {
    final items =
        await ref.read(localStoreProvider).invoiceItems('${invoice['id']}');
    if (!mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${invoice['kind'] == 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'} #${invoice['invoice_no']}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              for (final item in items)
                ListTile(
                  dense: true,
                  title: Text('${item['name']}'),
                  subtitle: Text(
                    '${(item['quantity'] as num).toStringAsFixed(0)} × ${(item['unit_price'] as num).toStringAsFixed(0)}',
                  ),
                  trailing: Text(
                    (item['subtotal'] as num).toStringAsFixed(0),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              const Divider(),
              Text('الإجمالي: ${(invoice['total'] as num).toStringAsFixed(0)}'),
              Text('المدفوع: ${(invoice['paid'] as num).toStringAsFixed(0)}'),
              Text('المتبقي: ${(invoice['remaining'] as num).toStringAsFixed(0)}'),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الفواتير')),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(syncServiceProvider).pull();
          await _load();
        },
        child: ListView.separated(
          itemCount: _rows.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final invoice = _rows[index];
            final isSale = invoice['kind'] == 'sale';
            return ListTile(
              leading: Icon(isSale ? Icons.receipt_long : Icons.inventory_2),
              title: Text(
                '${isSale ? 'بيع' : 'شراء'} #${invoice['invoice_no']} — ${invoice['party_name']}',
              ),
              subtitle: Text('${invoice['date'] ?? ''}'),
              trailing: Text(
                (invoice['total'] as num).toStringAsFixed(0),
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              onTap: () => _details(invoice),
            );
          },
        ),
      ),
    );
  }
}
