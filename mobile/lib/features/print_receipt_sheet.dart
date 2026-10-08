import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/printing_service.dart';
import '../core/sync_service.dart';

/// ورقة الطباعة: مسح الطابعات القريبة، اختيار واحدة، ثم طباعة الإيصال الحراري.
Future<void> showPrintSheet(
  BuildContext context,
  WidgetRef ref,
  Map<String, dynamic> receipt,
) async {
  final printing = PrintingService();

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('🖨️ طباعة الإيصال',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            StreamBuilder<List<PrinterBluetooth>>(
              stream: printing.scan(),
              builder: (context, snapshot) {
                final printers = snapshot.data ?? const <PrinterBluetooth>[];
                if (!snapshot.hasData) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (printers.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('لا توجد طابعات قريبة — تأكد من تشغيل الطابعة'),
                  );
                }
                return Column(
                  children: [
                    for (final printer in printers)
                      ListTile(
                        leading: const Icon(Icons.print),
                        title: Text(printer.name),
                        subtitle: Text(printer.address),
                        onTap: () async {
                          printing.select(printer);
                          final result = await printing.printReceipt(
                            businessName: receipt['businessName'] as String,
                            businessPhone: receipt['businessPhone'] as String?,
                            invoiceNo: receipt['invoiceNo'] as int,
                            kind: receipt['kind'] as String,
                            partyName: receipt['partyName'] as String? ?? 'نقدي',
                            cashierName: receipt['cashierName'] as String? ?? '',
                            date: receipt['date'] as DateTime,
                            items: (receipt['items'] as List<dynamic>)
                                .cast<Map<String, dynamic>>(),
                            total: receipt['total'] as double,
                            paid: receipt['paid'] as double,
                            remaining: receipt['remaining'] as double,
                          );
                          if (!sheetContext.mounted) return;
                          Navigator.pop(sheetContext);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(result.msg ?? 'تمت الطباعة'),
                            ),
                          );
                        },
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    ),
  );
}
