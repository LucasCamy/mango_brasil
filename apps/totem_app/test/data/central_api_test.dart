import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:totem_app/data/central_api.dart';
import 'package:totem_app/domain/models.dart';

class NeverRespondingClient extends http.BaseClient {
  bool closed = false;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      Completer<http.StreamedResponse>().future;
  @override
  void close() {
    closed = true;
  }
}

void main() {
  test('timeout fecha cliente e limita rede sem bloquear o totem', () async {
    final client = NeverRespondingClient();
    final api = CentralApi(
      baseUri: Uri.parse('https://central.test'),
      token: 'test-token',
      timeout: const Duration(milliseconds: 40),
      clientFactory: () => client,
    );
    final watch = Stopwatch()..start();
    await expectLater(api.catalog(), throwsA(isA<NetworkUnavailable>()));
    expect(watch.elapsedMilliseconds, lessThan(500));
    expect(client.closed, isTrue);
  });
  test(
    'ProblemDetails preserva erro de negócio sem confundir com queda de rede',
    () async {
      final api = CentralApi(
        baseUri: Uri.parse('https://central.test'),
        token: 'test-token',
        clientFactory: () => MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer test-token');
          return http.Response(
            jsonEncode({'title': 'Conflito', 'detail': 'Turno encerrado.'}),
            409,
          );
        }),
      );
      await expectLater(
        api.createOrder({}),
        throwsA(
          isA<ApiProblem>()
              .having((e) => e.status, 'status', 409)
              .having((e) => e.retryable, 'retryable', isFalse),
        ),
      );
    },
  );
}
