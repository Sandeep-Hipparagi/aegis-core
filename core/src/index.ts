/// <reference types="node" />
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AegisHttpServer } from '../../src/server.ts';

// Data contracts
export * from './types.ts';

// Canonical production classes & components (Zero conflicting star exports)
export { GatewayPipeline } from '../../src/gateway/pipeline.ts';
export { AegisHttpServer, AegisHttpServer as AegisGatewayServer } from '../../src/server.ts';
export { PolicyEngine, type InvariantRule, type PolicyContract, type ViolationTrace } from '../../src/policy/engine.ts';
export { SchemaValidator, ValidationError } from '../../src/validator/schemaValidator.ts';
export { WormAuditLedger, WormAuditLedger as WormLedger, GENESIS_HASH, hashPayload } from '../../src/audit/ledger.ts';
export { SandboxRunner, SandboxRunner as ExecutionBoundary } from '../../src/executor/sandboxRunner.ts';
export { tokenize, detokenize, shredVault } from '../../src/privacy/sanitizer.ts';
export { HitlInterceptor } from '../../src/hitl/interceptor.ts';
export { McpServerAdapter } from '../../src/mcp/server.ts';

/**
 * Bootstrap function to launch the gateway with sample policies and mock handlers
 */
export async function launchAegisGateway(
  port = 8080,
  ledgerPath = resolve(process.cwd(), 'aegis-audit.log')
): Promise<AegisHttpServer> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidateDirs = [
    resolve(currentDir, '../../policies'),
    resolve(currentDir, '../policies'),
    resolve(currentDir, '../../../policies'),
    resolve(process.cwd(), 'policies')
  ];

  let policiesDir = resolve(currentDir, '../../policies');
  for (const candidate of candidateDirs) {
    if (existsSync(candidate)) {
      policiesDir = candidate;
      break;
    }
  }

  const server = new AegisHttpServer({ port, policiesDir, ledgerPath });

  // Register mock safe tool handlers
  server.registerToolHandler('check_balance', (params) => {
    const account = (params.accountId as string) || 'ACC-DEFAULT';
    return {
      accountId: account,
      availableBalance: 42500.75,
      currency: 'USD',
      status: 'ACTIVE'
    };
  });

  server.registerToolHandler('transfer_funds', (params) => {
    return {
      transactionId: `tx-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      status: 'SETTLED',
      amount: params.amount,
      recipient: params.destinationAccount,
      timestamp: new Date().toISOString()
    };
  });

  server.registerToolHandler('execute_sql_query', () => {
    return {
      rowsAffected: 0,
      data: [
        { id: 1, name: 'Sample Account 1', balance: 5000 },
        { id: 2, name: 'Sample Account 2', balance: 12000 }
      ]
    };
  });

  await server.start();
  return server;
}

// Auto-run if executed directly as entrypoint
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('core/src/index.ts') || 
  process.argv[1].endsWith('core\\src\\index.ts') ||
  process.argv[1].endsWith('index.ts')
);

if (isDirectRun) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  void launchAegisGateway(port);
}
