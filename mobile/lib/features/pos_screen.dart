import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../core/sync_service.dart';

/// شاشة البيع السريع: شرائح أنواع القات + لوحة أرقام + اختيار عميل.
/// الحفظ يتم محلياً أولاً (Offline-First) ثم يُزامن في الخلفية.
class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key});

  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  final _items = <Map<String, dynamic>>[];
  final _uuid = const Uuid();
  String _qty = '1';
  String _price = '0';
  String _paid = '0';
  String _target = 'price';
  Map<String, Object?>? _activeType;
  Map<String, Object?>? _customer;
  List<Map<String, Object?>> _types = const [];
  List<Map<String, Object?>> _customers = const [];

  double get _total => _items.fold(
      0, (sum, item) => sum + (item['quantity'] as double) * (item['unitPrice'] as double));

  @override
  void initState() {
    super.initState();
    _loadCache();
  }

  Future<void> _loadCache() async {
    final store = ref.read(localStoreProvider);
    final types = await store.qatTypes();
    final customers = await store.parties('customer', '');
    setState(() {
      _types = types;
      _customers = customers;
    });
  }

  void _tap(String key) {
    setState(() {
      final current = switch (_target) { 'qty' => _qty, 'price' => _price, _ => _paid };
      final next = switch (key) {
        'C' => '0',
        '<' => current.length <= 1 ? '0' : current.substring(0, current.length - 1),
        _ => current == '0' ? key : current + key,
      };
      if (_target == 'qty') {
        _qty = next;
      } else if (_target == 'price') {
        _price = next;
      } else {
        _paid = next;
      }
    });
  }

  void _addItem() {
    if (_activeType == null) return;
    setState(() {
      _items.add({
        'qatTypeId': _activeType!['id'],
        'qatTypeName': _activeType!['name'],
        'quantity': double.tryParse(_qty) ?? 1,
        'unitPrice': double.tryParse(_price) ?? 0,
      });
      _qty = '1';
      _price = '0';
    });
  }

  Future<void> _save() async {
    if (_items.isEmpty) return;
    final store = ref.read(localStoreProvider);
    final clientUuid = _uuid.v4();
    await store.enqueue(
      clientUuid: clientUuid,
      entity: 'sale',
      payload: {
        'customerId': _customer?['id'],
        'items': _items,
        'paidAmount': double.tryParse(_paid) ?? 0,
        'saleDate': DateTime.now().toIso8601String(),
      },
    );
    unawaitedSync();
    setState(() {
      _items.clear();
      _paid = '0';
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم حفظ الفاتورة — ستتم المزامنة تلقائياً')),
      );
    }
  }

  void unawaitedSync() {
    ref.read(syncServiceProvider).syncNow().then((_) async {
      final pending = await ref.read(localStoreProvider).pendingCount();
      if (mounted) ref.read(pendingCountProvider.notifier).state = pending;
      await _loadCache();
    });
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(pendingCountProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('بيع سريع'),
        actions: [
          if (pending > 0)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Chip(label: Text('$pending بانتظار المزامنة')),
            ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: _types
                  .map((type) => Padding(
                        padding: const EdgeInsets.all(4),
                        child: ChoiceChip(
                          label: Text('${type['name']}'),
                          selected: _activeType?['id'] == type['id'],
                          onSelected: (_) => setState(() {
                            _activeType = type;
                            _price = '${(type['default_price'] as num).round()}';
                            _target = 'qty';
                          }),
                        ),
                      ))
                  .toList(),
            ),
          ),
          Row(
            children: [
              _amountBox('الكمية', _qty, 'qty'),
              _amountBox('السعر', _price, 'price'),
              _amountBox('المدفوع', _paid, 'paid'),
            ],
          ),
          Expanded(
            child: GridView.count(
              crossAxisCount: 3,
              padding: const EdgeInsets.all(8),
              children: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '<']
                  .map((key) => Padding(
                        padding: const EdgeInsets.all(4),
                        child: ElevatedButton(
                          onPressed: () => _tap(key),
                          child: Text(key, style: const TextStyle(fontSize: 22)),
                        ),
                      ))
                  .toList(),
            ),
          ),
          DropdownButton<Map<String, Object?>>(
            value: _customer,
            hint: const Text('عميل نقدي'),
            items: _customers
                .map((c) => DropdownMenuItem(value: c, child: Text('${c['name']}')))
                .toList(),
            onChanged: (value) => setState(() => _customer = value),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: _addItem, child: const Text('إضافة صنف'))),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: _save,
                    child: Text('حفظ (${_total.toStringAsFixed(0)})'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _amountBox(String label, String value, String key) => Expanded(
        child: GestureDetector(
          onTap: () => setState(() => _target = key),
          child: Container(
            margin: const EdgeInsets.all(6),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              border: Border.all(
                color: _target == key ? Colors.green : Colors.grey.shade300,
                width: 2,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Text(label, style: const TextStyle(fontSize: 11)),
                Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ),
      );
}
