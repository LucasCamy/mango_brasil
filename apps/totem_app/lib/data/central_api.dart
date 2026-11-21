import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../domain/models.dart';

abstract interface class CentralGateway {
  Future<Catalog> catalog();
  Future<Json> createOrder(Json payload);
  Future<Json> syncOrder(Json payload);
  Future<Json> orderByKey(String key);
  Future<Json> acknowledgeReceipt(String orderKey, Json receipt);
  Future<TerminalState> heartbeat(String terminalId, PrinterState printer);
}

/// A fresh request client is closed at the deadline: timeout cancels network I/O.
/// Mutations always use the same durable idempotency key on retries.
class CentralApi implements CentralGateway {
  CentralApi({
    required this.baseUri,
    required this.token,
    this.timeout = const Duration(milliseconds: 3000),
    http.Client Function()? clientFactory,
  }) : _clientFactory = clientFactory ?? http.Client.new;
  final Uri baseUri;
  final String token;
  final Duration timeout;
  final http.Client Function() _clientFactory;

  Future<Json> _request(String method, String path, {Json? body}) async {
    final client = _clientFactory();
    try {
      final request = http.Request(method, baseUri.resolve(path));
      request.headers.addAll({
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      });
      if (body != null) request.body = jsonEncode(body);
      final response = await (() async => http.Response.fromStream(
        await client.send(request),
      ))().timeout(timeout);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        String message =
            'Não foi possível concluir a operação (${response.statusCode}).';
        try {
          final json = jsonDecode(response.body) as Map<String, Object?>;
          message =
              json['detail'] as String? ?? json['title'] as String? ?? message;
        } on FormatException {
          /* Gateway may return an HTML error. */
        }
        throw ApiProblem(response.statusCode, message);
      }
      if (response.body.isEmpty) return {};
      return jsonDecode(response.body) as Map<String, Object?>;
    } on TimeoutException {
      throw const NetworkUnavailable();
    } on SocketException {
      throw const NetworkUnavailable();
    } on http.ClientException {
      throw const NetworkUnavailable();
    } finally {
      client.close();
    }
  }

  @override
  Future<Catalog> catalog() async =>
      Catalog.fromJson(await _request('GET', '/api/catalog'));
  @override
  Future<Json> createOrder(Json payload) =>
      _request('POST', '/api/orders', body: payload);
  @override
  Future<Json> syncOrder(Json payload) =>
      _request('POST', '/api/offline-sync', body: payload);
  @override
  Future<Json> orderByKey(String key) =>
      _request('GET', '/api/orders/by-key/$key');
  @override
  Future<Json> acknowledgeReceipt(String orderKey, Json receipt) async {
    return _request(
      'POST',
      '/api/orders/by-key/$orderKey/receipt',
      body: receipt,
    );
  }

  @override
  Future<TerminalState> heartbeat(
    String terminalId,
    PrinterState printer,
  ) async {
    final json = await _request(
      'POST',
      '/api/terminals/$terminalId/heartbeat',
      body: {
        'appVersion': '2.0.0',
        'pinpadStatus': 'CONNECTED',
        'printerStatus': switch (printer) {
          PrinterState.ready => 'READY',
          PrinterState.outOfPaper => 'OUT_OF_PAPER',
          PrinterState.error => 'ERROR',
        },
      },
    );
    return TerminalState.fromJson(
      (json['terminal'] as Map<String, Object?>?) ?? json,
    );
  }

  Future<Uint8List> downloadImage(String url) async {
    final client = _clientFactory();
    try {
      final uri = baseUri.resolve(url);
      if (uri.scheme != 'https' && uri.scheme != 'http') {
        throw const FormatException('URL de imagem inválida.');
      }
      final response = await client.get(uri).timeout(timeout);
      if (response.statusCode != 200 ||
          response.bodyBytes.length > 8 * 1024 * 1024) {
        throw const NetworkUnavailable();
      }
      return response.bodyBytes;
    } finally {
      client.close();
    }
  }
}
