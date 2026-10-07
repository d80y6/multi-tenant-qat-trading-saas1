import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/sync_service.dart';
import 'features/home_shell.dart';
import 'features/login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: QatiApp()));
}

class QatiApp extends ConsumerWidget {
  const QatiApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.read(syncServiceProvider); // تشغيل المزامنة الخلفية

    return MaterialApp(
      title: 'قاتي بزنس',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF16A34A),
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
      home: FutureBuilder<String?>(
        future: ref.read(apiClientProvider).readToken(),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return snapshot.data == null ? const LoginScreen() : const HomeShell();
        },
      ),
    );
  }
}
