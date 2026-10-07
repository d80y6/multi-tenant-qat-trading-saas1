import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import '../core/sync_service.dart';

/// شاشة الديون: قائمة المدينين، سند قبض/صرف، كشف حساب، ومشاركة عبر واتساب.
class DebtsScreen extends ConsumerStatefulWidget {
  const DebtsScreen({super.key});

  @override
  ConsumerState<DebtsScreen> createState() => _DebtsScreenState();
}

class _DebtsScreenState extends ConsumerState<DebtsScreen> {
  String _type = 'customer';
  String _query = '';
  List<Map<String, Object?>> _rows = const [];
  final _uuid = const Uuid();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await ref.read(localStoreProvider).parties(_type, _query);
    if (mounted) setState(() => _rows = rows);
  }

  Future<void> _voucher(Map<String, Object?> party) async {
    final controller = TextEditingController();
    final amount = await showDialog<double>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(_type == 'customer' ? 'سند قبض من ${party['name']}' : 'سند صرف إلى ${party['name']}'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'المبلغ'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () => Navigator.pop(context, double.tryParse(controller.text)),
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
    if (amount == null || amount <= 0) return;

    await ref.read(localStoreProvider).enqueue(
          clientUuid: _uuid.v4(),
          entity: _type == 'customer' ? 'collection' : 'payment',
          payload: {
            'partyId': party['id'],
            'amount': amount,
            'transactionDate': DateTime.now().toIso8601String(),
          },
        );

    final result = await ref.read(syncServiceProvider).syncNow();
    final pending = await ref.read(localStoreProvider).pendingCount();
    ref.read(pendingCountProvider.notifier).state = pending;
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result.error == null ? 'تم حفظ السند ومزامنته' : 'تم الحفظ محلياً — بانتظار الشبكة'),
      ),
    );
  }

  Future<void> _statement(Map<String, Object?> party) async {
    try {
      final data = await ref.read(apiClientProvider).statement(_type, '${party['id']}');
      final lines = (data['lines'] as List<dynamic>).take(10).map((l) {
        final row = l as Map<String, dynamic>;
        return '${row['date'].toString().substring(0, 10)} | ${row['label']} | ${row['debit']} / ${row['credit']}';
      }).join('\n');
      final balance = (data['party'] as Map<String, dynamic>)['balance'];
      final text = 'كشف حساب - ${party['name']}\n$lines\n\nالرصيد: $balance ريال';
      final phone = '${party['phone'] ?? ''}'.replaceAll(RegExp(r'\D'), '');
      final uri = Uri.parse('https://wa.me/967$phone?text=${Uri.encodeComponent(text)}');
      if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('كشف الحساب يتطلب اتصالاً بالإنترنت')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الديون والسندات'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(96),
          child: Column(
            children: [
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'customer', label: Text('العملاء')),
                  ButtonSegment(value: 'supplier', label: Text('الموردون')),
                ],
                selected: {_type},
                onSelectionChanged: (s) {
                  setState(() => _type = s.first);
                  _load();
                },
              ),
              Padding(
                padding: const EdgeInsets.all(8),
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: 'بحث...',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) {
                    _query = value;
                    _load();
                  },
                ),
              ),
            ],
          ),
        ),
      ),
      body: ListView.separated(
        itemCount: _rows.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final party = _rows[index];
          return ListTile(
            title: Text('${party['name']}'),
            subtitle: Text('${party['phone'] ?? 'بدون رقم'}'),
            trailing: Text(
              '${(party['balance'] as num).toStringAsFixed(0)}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            onTap: () => _voucher(party),
            onLongPress: () => _statement(party),
          );
        },
      ),
    );
  }
}
