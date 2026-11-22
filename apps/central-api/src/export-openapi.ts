import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from './openapi.js';

const destination = fileURLToPath(new URL('../../../packages/shared-types/openapi.json', import.meta.url));
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(buildOpenApi(), null, 2)}\n`, 'utf8');
console.log('Contrato gerado em packages/shared-types/openapi.json');
