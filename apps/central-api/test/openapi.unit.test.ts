import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../src/openapi.js';

type Json = Record<string, any>;
const specification = buildOpenApi() as Json;
const operations = Object.entries(specification.paths as Json).flatMap(([path, methods]) => Object.entries(methods as Json).map(([method, operation]) => ({ path, method, operation: operation as Json })));
const schemas = specification.components.schemas as Json;

function walk(value: unknown, visit: (node: Json) => void): void {
  if (Array.isArray(value)) { for (const item of value) walk(item, visit); return; }
  if (value && typeof value === 'object') { visit(value as Json); for (const child of Object.values(value)) walk(child, visit); }
}
function dereference(reference: string): unknown {
  return reference.slice(2).split('/').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Json)[key.replaceAll('~1', '/').replaceAll('~0', '~')] : undefined, specification);
}

describe('published OpenAPI contract', () => {
  it('covers every actual HTTP route with a stable unique method-and-path operation id', async () => {
    const directory = new URL('../src/', import.meta.url);
    const routes = new Set<string>();
    for (const file of await readdir(directory)) {
      if (!file.endsWith('.ts')) continue;
      const content = await readFile(new URL(file, directory), 'utf8');
      for (const match of content.matchAll(/(?:this\.)?app\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g)) {
        routes.add(`${match[1]} ${match[2]!.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}')}`);
      }
    }
    expect(new Set(operations.map(({ method, path }) => `${method} ${path}`))).toEqual(routes);
    const ids = operations.map(({ operation }) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { method, path, operation } of operations) expect(operation.operationId).toBe(`${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`);
  });

  it('has no unresolved component references or required fields missing from their objects', () => {
    let references = 0;
    walk(specification, (node) => {
      if (typeof node.$ref === 'string') {
        references += 1;
        expect(node.$ref).toMatch(/^#\//);
        expect(dereference(node.$ref), node.$ref).toBeDefined();
      }
      if (Array.isArray(node.required)) {
        expect(node.required.length).toBeGreaterThan(0);
        for (const name of node.required) expect(node.properties?.[name], `required property ${name}`).toBeDefined();
      }
    });
    expect(references).toBeGreaterThan(100);
  });

  it('publishes only the success code each route actually returns', () => {
    const created = new Set(['/api/categories', '/api/products', '/api/orders', '/api/shifts/open', '/api/terminals', '/api/users']);
    for (const { path, method, operation } of operations) {
      const codes = Object.keys(operation.responses).filter((status) => /^2\d\d$/.test(status));
      expect(codes).toHaveLength(1);
      expect(codes[0]).toBe(path === '/api/offline-sync' ? '202' : method === 'post' && created.has(path) ? '201' : '200');
    }
  });

  it('documents request bodies, partial user edits, quote guards and required product versions', () => {
    const bodyless = new Set(['/api/auth/logout', '/api/orders/{id}/print', '/api/shifts/{id}/print']);
    for (const { method, path, operation } of operations) {
      if (method === 'get' || bodyless.has(path)) continue;
      expect(operation.requestBody?.required, `${method} ${path}`).toBe(true);
      const input = dereference(operation.requestBody.content['application/json'].schema.$ref) as Json;
      expect(Object.keys(input.properties ?? {}).length).toBeGreaterThan(0);
    }
    expect(schemas.UserUpdateInput.required).toBeUndefined();
    expect(schemas.UserUpdateInput.properties.active.default).toBeUndefined();
    expect(schemas.ProductUpdateInput.required).toContain('expectedVersion');
    expect(schemas.ProductUpdateInput.properties.changeReason.minLength).toBe(3);
    expect(schemas.OrderInput.properties.expectedTotalCents.minimum).toBe(1);
    expect(schemas.OfflineSyncInput.required).toContain('offline');
    expect(schemas.OfflineSyncInput.properties.offline.required).toContain('printedAt');
    expect(schemas.PrintAckInput.properties.status.enum).toContain('SIMULATED');
  });

  it('restricts terminal, print-agent and supervisor credentials to their actual routes', () => {
    const terminalRoutes = new Set(['get /api/catalog', 'post /api/payments/authorize', 'get /api/payments/by-key/{key}', 'get /api/payments/{id}', 'post /api/payments/{id}/reverse', 'post /api/orders', 'get /api/orders/by-key/{key}', 'post /api/orders/by-key/{key}/receipt', 'post /api/offline-sync', 'get /api/settings', 'post /api/terminals/{id}/heartbeat']);
    const supervisorRoutes = new Set(['post /api/orders/{id}/cancel', 'post /api/shifts/{id}/movements', 'post /api/shifts/{id}/close']);
    for (const { path, method, operation } of operations) {
      const key = `${method} ${path}`;
      expect(operation.security.some((requirement: Json) => 'terminalToken' in requirement), key).toBe(terminalRoutes.has(key));
      expect(operation.security.some((requirement: Json) => 'printAgentToken' in requirement), key).toBe(path.startsWith('/api/print-agent/'));
      expect((operation.parameters ?? []).some((parameter: Json) => parameter.in === 'header' && parameter.name === 'x-supervisor-token'), key).toBe(supervisorRoutes.has(key));
    }
    expect(specification.paths['/api/auth/login'].post.security).toEqual([]);
    expect(specification.paths['/api/users'].post['x-roles']).toEqual(['OWNER']);
    const lookup = specification.paths['/api/payments/by-key/{key}'].get;
    expect(lookup.requestBody).toBeUndefined();
    expect(lookup.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/PaymentTransaction');
    expect(lookup.parameters[0].schema.pattern).toContain('-7[');
  });

  it('exposes a complete production projection with no financial or fiscal data at any depth', () => {
    const names = new Set<string>();
    const visited = new Set<string>();
    const collect = (schema: Json): void => {
      if (schema.$ref) {
        if (visited.has(schema.$ref)) return;
        visited.add(schema.$ref);
        collect(dereference(schema.$ref) as Json);
      }
      for (const [name, child] of Object.entries(schema.properties ?? {})) { names.add(name); collect(child as Json); }
      if (schema.items) collect(schema.items);
    };
    collect(schemas.ProductionOrder);
    expect(names).toContain('additions');
    expect(names).toContain('productName');
    for (const name of ['totalCents', 'subtotalCents', 'unitPriceCents', 'priceCents', 'fiscal', 'payments', 'nsu', 'authorizationCode', 'idempotencyKey', 'shiftId']) expect(names.has(name), name).toBe(false);
    expect(schemas.OrderItem.properties.additions.items.$ref).toBe('#/components/schemas/SelectedAddition');
    expect(schemas.OrderPayment.properties.nsu.type).toBe('string');
    expect(schemas.ProductionOrderItem.additionalProperties).toBe(false);
    expect(specification.paths['/api/orders/{id}/status'].patch.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/ProductionOrder');
  });

  it('describes initial settings, nullable responses, signed declarations and write-only secrets accurately', () => {
    expect(schemas.CompanyAddress.required).toBeUndefined();
    expect(schemas.CompanySettings.properties).not.toHaveProperty('cscToken');
    expect(schemas.TerminalSettings.properties).not.toHaveProperty('cnpj');
    expect(schemas.CompanySettingsInput.properties.cscToken.writeOnly).toBe(true);
    expect(schemas.UserInput.properties.password.writeOnly).toBe(true);
    expect(schemas.Order.properties.shiftId.nullable).toBe(true);
    expect(schemas.ProductSize.properties.priceCents.nullable).toBe(true);
    expect(schemas.PrintClaimResponse.properties.job.nullable).toBe(true);
    expect(schemas.ShiftCloseInput.properties.declared.properties.CREDIT_CARD.minimum).toBe(-999999999999);
    expect(schemas.ShiftCloseInput.properties.declared.properties.CASH.minimum).toBe(0);
    expect(schemas.ShiftCloseInput.properties.declared.properties.CASH.maximum).toBe(999999999999);
    expect(schemas.Reconciliation.properties.differenceCents.maximum).toBe(1999999999998);
    expect(schemas.ShiftSummary.properties).not.toHaveProperty('reconciliations');
  });

  it('uses SSE media types and RFC 9457 errors, with JSON readiness degradation', () => {
    const events = specification.paths['/api/events'].get;
    expect(events.responses['200'].content).toHaveProperty('text/event-stream');
    expect(events.responses['200'].content).not.toHaveProperty('application/json');
    expect(events.responses['401'].content['application/problem+json'].schema.$ref).toBe('#/components/schemas/ProblemDetails');
    expect(specification.paths['/health/ready'].get.responses['503'].content['application/json'].schema.$ref).toBe('#/components/schemas/ReadinessUnavailable');
    expect(schemas.ProblemDetails.properties).toHaveProperty('requestId');
  });

  it('reproduces the checked-in JSON artifact deterministically', async () => {
    const path = fileURLToPath(new URL('../../../packages/shared-types/openapi.json', import.meta.url));
    const actual = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
    expect(actual).toBe(`${JSON.stringify(buildOpenApi(), null, 2)}\n`);
    expect(JSON.stringify(buildOpenApi())).toBe(JSON.stringify(buildOpenApi()));
  });
});
