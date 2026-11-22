import { describe,it,expect } from 'vitest';
import { totalLine,businessDate } from '../src/orders.js';
import { buildEscPos,printerText } from '../src/printing.js';
import { encryptSecret,decryptSecret,intentHash } from '../src/security.js';
import { buildOpenApi } from '../src/openapi.js';
describe('invariantes operacionais',()=>{
 it('calcula adicionais por unidade em centavos e rejeita overflow',()=>{
  expect(totalLine({unitPriceCents:1500,quantity:2,additions:[{priceCents:200,quantity:2}]})).toBe(3800);
  expect(()=>totalLine({unitPriceCents:999999999,quantity:99,additions:[]})).toThrow();
 });
 it('mantém data de negócio em Cuiabá perto da meia-noite UTC',()=>{
  expect(businessDate(new Date('2026-11-22T02:00:00Z'),'America/Cuiaba')).toBe('2026-11-21');
 });
 it('remove injeção de comandos ESC/POS do texto livre',()=>{
  expect(printerText('observação\x1b\x40\x00\x1d\x56')).not.toContain('\x1b');
  const data=buildEscPos({},true);expect(data.subarray(0,2)).toEqual(Buffer.from([27,64]));expect(data.toString('ascii')).toContain('IMPRESSAO SIMULADA');
 });
 it('criptografa CSC com autenticação e usa nonce único',()=>{
  const key='ab'.repeat(32),value='CSC_TEST_ONLY';const encrypted=encryptSecret(value,key);
  expect(encrypted).not.toContain(value);expect(decryptSecret(encrypted,key)).toBe(value);expect(encryptSecret(value,key)).not.toBe(encrypted);expect(()=>decryptSecret(encrypted,'cd'.repeat(32))).toThrow();
 });
 it('canonicaliza hashes sem depender da ordem das propriedades',()=>{expect(intentHash({a:1,b:{c:2}})).toBe(intentHash({b:{c:2},a:1}));});
 it('documenta DTOs validados, segurança e fechamento cego',()=>{const api=buildOpenApi();expect(api.openapi).toBe('3.0.3');expect(api.paths['/api/offline-sync']).toBeDefined();expect(api.components.schemas.OrderInput).toBeDefined();expect(JSON.stringify(api.components.schemas.ShiftReport)).toContain('CLOSED');});
});
