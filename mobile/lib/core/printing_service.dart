import 'package:esc_pos_bluetooth/esc_pos_bluetooth.dart';
import 'package:esc_pos_utils/esc_pos_utils.dart';

/// طباعة إيصال الفاتورة على طابعة حرارية بلوتوث (عرض 58/80mm).
class PrintingService {
  final PrinterBluetoothManager _manager = PrinterBluetoothManager();

  Stream<List<PrinterBluetooth>> scan() {
    _manager.startScan(const Duration(seconds: 4));
    return _manager.scanResults;
  }

  void select(PrinterBluetooth printer) => _manager.selectPrinter(printer);

  Future<PosPrintResult> printReceipt({
    required String businessName,
    required String? businessPhone,
    required int invoiceNo,
    required String kind, // sale | purchase
    required String partyName,
    required String cashierName,
    required DateTime date,
    required List<Map<String, dynamic>> items,
    required double total,
    required double paid,
    required double remaining,
  }) async {
    final profile = await CapabilityProfile.load();
    final generator = Generator(PaperSize.mm80, profile);
    final bytes = <int>[];

    bytes.addAll(generator.text(
      businessName,
      styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2),
    ));
    if (businessPhone != null) {
      bytes.addAll(generator.text(businessPhone, styles: const PosStyles(align: PosAlign.center)));
    }
    bytes.addAll(generator.hr());
    bytes.addAll(generator.text(
      '${kind == 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'} #$invoiceNo',
      styles: const PosStyles(align: PosAlign.center, bold: true),
    ));
    bytes.addAll(generator.text('التاريخ: ${date.toString().substring(0, 16)}'));
    bytes.addAll(generator.text('${kind == 'sale' ? 'العميل' : 'المورد'}: $partyName'));
    bytes.addAll(generator.text('الكاشير: $cashierName'));
    bytes.addAll(generator.hr());

    for (final item in items) {
      final qty = (item['quantity'] as num).toStringAsFixed(0);
      final price = (item['unitPrice'] as num).toStringAsFixed(0);
      final sub = ((item['quantity'] as num) * (item['unitPrice'] as num)).toStringAsFixed(0);
      bytes.addAll(generator.row([
        PosColumn(text: '${item['qatTypeName']}', width: 5),
        PosColumn(text: qty, width: 2),
        PosColumn(text: price, width: 2),
        PosColumn(text: sub, width: 3),
      ]));
    }

    bytes.addAll(generator.hr());
    bytes.addAll(generator.row([
      PosColumn(text: 'الإجمالي', width: 6, styles: const PosStyles(bold: true)),
      PosColumn(text: total.toStringAsFixed(0), width: 6, styles: const PosStyles(bold: true)),
    ]));
    bytes.addAll(generator.row([
      PosColumn(text: 'المدفوع', width: 6),
      PosColumn(text: paid.toStringAsFixed(0), width: 6),
    ]));
    bytes.addAll(generator.row([
      PosColumn(text: 'المتبقي', width: 6, styles: const PosStyles(bold: true)),
      PosColumn(text: remaining.toStringAsFixed(0), width: 6, styles: const PosStyles(bold: true)),
    ]));
    bytes.addAll(generator.feed(1));
    bytes.addAll(generator.text('شكراً لتعاملكم معنا',
        styles: const PosStyles(align: PosAlign.center)));
    bytes.addAll(generator.cut());

    return _manager.printTicket(bytes);
  }
}
