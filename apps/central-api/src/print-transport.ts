import net from 'node:net';

export class PrinterFailure extends Error {
  constructor(message: string, readonly uncertain = false) {
    super(message);
    this.name = 'PrinterFailure';
  }
}

export interface TcpPrinterOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

// Epson ESC/POS DLE EOT n=1..4; four consecutive queries are permitted.
// https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/dle_eot.html
const statusQuery = Buffer.from([0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x03, 0x10, 0x04, 0x04]);

export function validatePrinterStatus(status: Uint8Array): void {
  if (status.length !== 4 || [...status].some((byte) => (byte & 0x93) !== 0x12)) {
    throw new PrinterFailure('A impressora retornou um status ESC/POS inválido.');
  }
  if ((status[0]! & 0x28) !== 0) throw new PrinterFailure('Impressora offline ou aguardando recuperação.');
  if ((status[1]! & 0x64) !== 0) throw new PrinterFailure('Impressora com tampa aberta, sem papel ou em erro.');
  if ((status[2]! & 0x6c) !== 0) throw new PrinterFailure('Impressora com erro mecânico, de corte ou de recuperação.');
  if ((status[3]! & 0x60) !== 0) throw new PrinterFailure('Impressora sem papel.');
}

/** Socket acceptance is transport evidence; ambiguous outcomes require manual review. */
export async function tcpPrint(bytes: Buffer, options: TcpPrinterOptions): Promise<void> {
  const { host, port = 9100, timeoutMs = 5000, signal } = options;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new PrinterFailure('Impressora TCP não configurada.');
  }
  if (signal?.aborted) throw new PrinterFailure('Agente interrompido.');
  await new Promise<void>((resolvePrint, reject) => {
    const socket = net.createConnection({ host, port });
    let sent = false;
    let finished = false;
    let flushed = false;
    let peerEnded = false;
    let status = Buffer.alloc(0);
    const onAbort = (): void => done(new PrinterFailure('Agente interrompido.', sent));
    const deadline = setTimeout(() => done(new PrinterFailure('Tempo limite da impressora. Verifique o comprovante antes de reimprimir.', sent)), timeoutMs);
    const done = (error?: PrinterFailure): void => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      error ? reject(error) : resolvePrint();
    };
    socket.on('error', () => done(new PrinterFailure('Falha de conexão com a impressora.', sent)));
    socket.on('close', (hadError) => {
      if (finished) return;
      if (!hadError && sent && flushed && peerEnded) done();
      else done(new PrinterFailure('A impressora encerrou a conexão antes da conclusão.', sent));
    });
    socket.on('end', () => {
      peerEnded = true;
      if (!sent && !finished) done(new PrinterFailure('A impressora encerrou a resposta antes da conclusão.'));
    });
    socket.once('connect', () => {
      socket.write(statusQuery, (error) => { if (error) done(new PrinterFailure('Falha ao consultar o status da impressora.')); });
    });
    socket.on('data', (chunk: Buffer) => {
      if (finished || sent) return;
      status = Buffer.concat([status, chunk]);
      if (status.length < 4) return;
      try { validatePrinterStatus(status.subarray(0, 4)); } catch (error) {
        done(error instanceof PrinterFailure ? error : new PrinterFailure('Status da impressora inválido.'));
        return;
      }
      // Any failure after write begins is uncertain, including a partial kernel write.
      sent = true;
      socket.write(bytes, (error) => {
        if (finished) return;
        if (error) return done(new PrinterFailure('Falha durante envio do comprovante.', true));
        // A local write callback alone can precede a peer reset with unread bytes.
        // Wait for an orderly peer shutdown; absent evidence remains uncertain.
        socket.end(() => { flushed = true; });
      });
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
