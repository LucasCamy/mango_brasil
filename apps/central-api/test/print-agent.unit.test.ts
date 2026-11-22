import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { getEventListeners, once } from 'node:events';
import net from 'node:net';
import { uuidV7 } from '@totem-pdv/shared-types';
import { journalPath, persistJournal, PrintAgentHttpError, recoverPrintJournals, type PrintJournal } from '../src/print-journal.js';
import { PrinterFailure, tcpPrint, validatePrinterStatus } from '../src/print-transport.js';

const directories: string[] = [];
const servers: { server: net.Server; sockets: Set<net.Socket> }[] = [];
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'totem-print-test-'));
  directories.push(path);
  return path;
}
const printedJournal = (): PrintJournal => ({ jobId: uuidV7(), claimToken: uuidV7(), phase: 'printed', status: 'PRINTED' });

afterEach(async () => {
  for (const { server, sockets } of servers.splice(0)) {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
  for (const path of directories.splice(0)) {
    const absolute = resolve(path);
    // Cleanup is restricted to directories that this suite created in the OS temp root.
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('totem-print-test-')) throw Error('Unsafe test cleanup path.');
    await rm(absolute, { recursive: true, force: true });
  }
});

describe('durable print journal', () => {
  it('publishes complete JSON atomically and replaces the previous phase without leftover temporary files', async () => {
    const path = await directory();
    const completed = printedJournal();
    const sending: PrintJournal = { jobId: completed.jobId, claimToken: completed.claimToken, phase: 'sending' };
    await persistJournal(path, sending);
    expect(JSON.parse(await readFile(journalPath(path, completed.jobId), 'utf8'))).toEqual(sending);
    await persistJournal(path, completed);
    expect(JSON.parse(await readFile(journalPath(path, completed.jobId), 'utf8'))).toEqual(completed);
    expect(await readdir(path)).toEqual([`${completed.jobId}.journal.json`]);
  });

  it('quarantines corruption individually, recovers healthy jobs and never resends receipt bytes', async () => {
    const path = await directory();
    const corruptId = uuidV7();
    await writeFile(journalPath(path, corruptId), '{"jobId":');
    const healthy = printedJournal();
    const interrupted: PrintJournal = { jobId: uuidV7(), claimToken: uuidV7(), phase: 'sending' };
    await persistJournal(path, healthy);
    await persistJournal(path, interrupted);
    const acknowledged: PrintJournal[] = [];
    const send = vi.fn(async (journal: PrintJournal) => { acknowledged.push(journal); });
    const result = await recoverPrintJournals(path, send);
    expect(result.acknowledged.sort()).toEqual([healthy.jobId, interrupted.jobId].sort());
    expect(result.needsReview).toEqual([corruptId]);
    expect(result.deferred).toEqual([]);
    expect(acknowledged.find((journal) => journal.jobId === interrupted.jobId)).toMatchObject({ phase: 'failed', status: 'FAILED', uncertain: true });
    const files = await readdir(path);
    expect(files.some((file) => file.startsWith(`${corruptId}.journal.json.`) && file.endsWith('.corrupt'))).toBe(true);
    expect(files).toContain(`${corruptId}.needs-review`);
    expect(files.some((file) => file.endsWith('.escpos'))).toBe(false);
    expect(await recoverPrintJournals(path, send)).toEqual({ acknowledged: [], needsReview: [], deferred: [] });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('quarantines valid JSON whose job id does not match its filename', async () => {
    const path = await directory();
    const id = uuidV7();
    await writeFile(journalPath(path, id), JSON.stringify(printedJournal()));
    const send = vi.fn(async () => {});
    expect((await recoverPrintJournals(path, send)).needsReview).toEqual([id]);
    expect(send).not.toHaveBeenCalled();
  });

  it('marks permanent ACK conflicts once while allowing unrelated jobs to settle', async () => {
    const path = await directory();
    const expired = printedJournal();
    const healthy = printedJournal();
    await persistJournal(path, expired);
    await persistJournal(path, healthy);
    const send = vi.fn(async (journal: PrintJournal) => { if (journal.jobId === expired.jobId) throw new PrintAgentHttpError(409); });
    const first = await recoverPrintJournals(path, send);
    expect(first.needsReview).toEqual([expired.jobId]);
    expect(first.acknowledged).toEqual([healthy.jobId]);
    const marker = await readFile(join(path, `${expired.jobId}.needs-review`), 'utf8');
    await recoverPrintJournals(path, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await readFile(join(path, `${expired.jobId}.needs-review`), 'utf8')).toBe(marker);
  });

  it('retries only the ACK after transient failure and preserves the completed journal', async () => {
    const path = await directory();
    const healthy = printedJournal();
    await persistJournal(path, healthy);
    const send = vi.fn<(_: PrintJournal) => Promise<void>>().mockRejectedValueOnce(new PrintAgentHttpError(503)).mockResolvedValue(undefined);
    expect((await recoverPrintJournals(path, send)).deferred).toEqual([healthy.jobId]);
    expect(JSON.parse(await readFile(journalPath(path, healthy.jobId), 'utf8'))).toEqual(healthy);
    expect((await recoverPrintJournals(path, send)).acknowledged).toEqual([healthy.jobId]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

async function fakePrinter(onConnection: (socket: net.Socket) => void): Promise<{ host: string; port: number }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    onConnection(socket);
  });
  servers.push({ server, sockets });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing local test port.');
  return { host: '127.0.0.1', port: address.port };
}

describe('bounded ESC/POS transport', () => {
  it('waits for four valid status responses, handles fragmented packets and removes stop listeners', async () => {
    let observedReceipt!: (bytes: Buffer) => void;
    const receipt = new Promise<Buffer>((done) => { observedReceipt = done; });
    const queries: Buffer[] = [];
    const target = await fakePrinter((socket) => {
      let incoming = Buffer.alloc(0);
      let responded = false;
      socket.on('data', (chunk) => {
        if (responded) { observedReceipt(chunk); return; }
        incoming = Buffer.concat([incoming, chunk]);
        if (incoming.length < 12) return;
        queries.push(incoming);
        responded = true;
        socket.write(Buffer.from([0x12, 0x12]));
        setTimeout(() => socket.write(Buffer.from([0x12, 0x12])), 5);
      });
    });
    const stop = new AbortController();
    await tcpPrint(Buffer.from('receipt bytes'), { ...target, signal: stop.signal, timeoutMs: 1000 });
    expect(await receipt).toEqual(Buffer.from('receipt bytes'));
    expect(queries).toEqual([Buffer.from([0x10, 0x04, 1, 0x10, 0x04, 2, 0x10, 0x04, 3, 0x10, 0x04, 4])]);
    expect(getEventListeners(stop.signal, 'abort')).toHaveLength(0);
  });

  it('fails promptly when the printer closes before responding', async () => {
    const target = await fakePrinter((socket) => socket.end());
    const stop = new AbortController();
    await expect(tcpPrint(Buffer.from('receipt'), { ...target, signal: stop.signal, timeoutMs: 1000 })).rejects.toMatchObject({ uncertain: false });
    expect(getEventListeners(stop.signal, 'abort')).toHaveLength(0);
  });

  it('marks a connection failure during receipt transmission as uncertain', async () => {
    const target = await fakePrinter((socket) => {
      let queried = false;
      socket.on('data', () => {
        if (!queried) { queried = true; socket.write(Buffer.from([0x12, 0x12, 0x12, 0x12])); }
        else socket.destroy();
      });
    });
    const stop = new AbortController();
    // A large local fixture keeps write pending while the peer closes mid-transmission.
    await expect(tcpPrint(Buffer.alloc(16 * 1024 * 1024, 65), { ...target, signal: stop.signal, timeoutMs: 1000 })).rejects.toMatchObject({ uncertain: true });
    expect(getEventListeners(stop.signal, 'abort')).toHaveLength(0);
  });

  it('enforces a deadline even when the printer remains silent', async () => {
    const target = await fakePrinter(() => {});
    const stop = new AbortController();
    await expect(tcpPrint(Buffer.from('receipt'), { ...target, signal: stop.signal, timeoutMs: 30 })).rejects.toMatchObject({ uncertain: false });
    expect(getEventListeners(stop.signal, 'abort')).toHaveLength(0);
  });

  it('honors an already-aborted signal without opening a printer connection', async () => {
    const target = await fakePrinter(() => {});
    const stop = new AbortController();
    stop.abort();
    await expect(tcpPrint(Buffer.from('receipt'), { ...target, signal: stop.signal })).rejects.toBeInstanceOf(PrinterFailure);
    expect(getEventListeners(stop.signal, 'abort')).toHaveLength(0);
    expect([...servers[0]!.sockets]).toHaveLength(0);
  });

  it('removes the cancellation listener when an active operation is interrupted', async () => {
    let connected!: () => void;
    const connection = new Promise<void>((done) => { connected = done; });
    const target = await fakePrinter(() => connected());
    const stop = new AbortController();
    const pending = tcpPrint(Buffer.from('receipt'), { ...target, signal: stop.signal, timeoutMs: 1000 });
    const rejection = expect(pending).rejects.toMatchObject({ uncertain: false });
    await connection;
    stop.abort();
    await rejection;
    expect(getEventListeners(stop.signal, 'abort')).toHaveLength(0);
  });

  it.each([
    [0x00, 0x12, 0x12, 0x12], // invalid reserved bits
    [0x1a, 0x12, 0x12, 0x12], // printer offline
    [0x12, 0x16, 0x12, 0x12], // cover open
    [0x12, 0x12, 0x1a, 0x12], // cutter error
    [0x12, 0x12, 0x12, 0x72], // no paper
  ])('rejects unsafe printer status %j before sending receipt bytes', (...status) => {
    expect(() => validatePrinterStatus(Uint8Array.from(status))).toThrow(PrinterFailure);
  });
});
