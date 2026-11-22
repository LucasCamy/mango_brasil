import { open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const journalFields = {
  jobId: z.string().uuid(),
  claimToken: z.string().uuid(),
  error: z.string().max(500).optional(),
  uncertain: z.boolean().optional(),
};
const journalSchema = z.discriminatedUnion('phase', [
  z.object({ ...journalFields, phase: z.literal('sending') }).strict(),
  z.object({ ...journalFields, phase: z.literal('printed'), status: z.enum(['PRINTED', 'SIMULATED']) }).strict(),
  z.object({ ...journalFields, phase: z.literal('failed'), status: z.literal('FAILED') }).strict(),
]);
export type PrintJournal = z.infer<typeof journalSchema>;
export type SendAcknowledgement = (journal: PrintJournal) => Promise<void>;

export class PrintAgentHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'PrintAgentHttpError';
  }
}

/** A same-directory rename publishes only a complete, fsynced journal. */
async function writeAtomically(file: string, content: string): Promise<void> {
  const directory = dirname(file);
  const temporary = join(directory, `.${basename(file)}.${randomUUID()}.tmp`);
  let published = false;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    published = true;
    // Windows cannot open directories for fsync. The file itself is synced above.
    if (process.platform !== 'win32') {
      const handle = await open(directory, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    }
  } finally {
    if (!published) await unlink(temporary).catch(() => {});
  }
}

export function journalPath(directory: string, jobId: string): string {
  const id = z.string().uuid().parse(jobId);
  return join(directory, `${id}.journal.json`);
}

export async function persistJournal(directory: string, record: PrintJournal): Promise<void> {
  const journal = journalSchema.parse(record);
  await writeAtomically(journalPath(directory, journal.jobId), JSON.stringify(journal));
}

/** A crash while sending never authorizes resending physical receipt bytes. */
export function journalForAcknowledgement(record: PrintJournal): PrintJournal {
  return record.phase === 'sending'
    ? { ...record, phase: 'failed', status: 'FAILED', uncertain: true, error: 'Envio interrompido. Confira fisicamente antes de reimprimir.' }
    : record;
}

async function needsReview(directory: string, id: string, reason: string): Promise<void> {
  // id originates from a directory entry, never from untrusted JSON or an API path.
  if (basename(id) !== id) throw new TypeError('Identificador de journal inválido.');
  await writeAtomically(join(directory, `${id}.needs-review`), JSON.stringify({ jobId: id, reason, createdAt: new Date().toISOString() }));
}

export async function settleJournal(directory: string, record: PrintJournal, sendAcknowledgement: SendAcknowledgement): Promise<'acknowledged' | 'needs-review' | 'deferred'> {
  const journal = journalForAcknowledgement(journalSchema.parse(record));
  if (record.phase === 'sending') await persistJournal(directory, journal);
  try {
    await sendAcknowledgement(journal);
    await writeAtomically(join(directory, `${journal.jobId}.acked`), 'ack\n');
    return 'acknowledged';
  } catch (error) {
    if (error instanceof PrintAgentHttpError && [400, 404, 409, 410, 422].includes(error.status)) {
      await needsReview(directory, journal.jobId, `A Central recusou esta confirmação (HTTP ${error.status}). Confira a impressão e a reserva antes de intervir.`);
      return 'needs-review';
    }
    return 'deferred';
  }
}

export interface JournalRecoveryResult {
  acknowledged: string[];
  needsReview: string[];
  deferred: string[];
}

/** Recover acknowledgements independently. This routine never prints anything. */
export async function recoverPrintJournals(directory: string, sendAcknowledgement: SendAcknowledgement): Promise<JournalRecoveryResult> {
  const entries = await readdir(directory);
  const existing = new Set(entries);
  const result: JournalRecoveryResult = { acknowledged: [], needsReview: [], deferred: [] };
  for (const file of entries.filter((entry) => entry.endsWith('.journal.json'))) {
    const id = file.slice(0, -'.journal.json'.length);
    if (existing.has(`${id}.acked`) || existing.has(`${id}.needs-review`)) continue;
    let journal: PrintJournal;
    try {
      journal = journalSchema.parse(JSON.parse(await readFile(join(directory, file), 'utf8')));
      if (journal.jobId !== id) throw new TypeError('O identificador do journal difere do nome do arquivo.');
    } catch {
      try {
        // Publish the marker first: a crash before rename still skips the corrupt file.
        await needsReview(directory, id, 'Journal inválido ou ilegível. A impressão é incerta; não reenviar o comprovante automaticamente.');
        await rename(join(directory, file), join(directory, `${file}.${randomUUID()}.corrupt`)).catch(() => {});
        result.needsReview.push(id);
      } catch {
        result.deferred.push(id);
      }
      continue;
    }
    try {
      const outcome = await settleJournal(directory, journal, sendAcknowledgement);
      if (outcome === 'acknowledged') result.acknowledged.push(id);
      else if (outcome === 'needs-review') result.needsReview.push(id);
      else result.deferred.push(id);
    } catch {
      // An unreadable or unwritable journal must not hide healthy jobs in this pass.
      result.deferred.push(id);
    }
  }
  return result;
}
