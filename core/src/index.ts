import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AegisGatewayServer } from './server.ts';
import type { PolicyDocument } from './types.ts';

export * from './types.ts';
export * from './engine.ts';
export * from './executor.ts';
export * from './server.ts';
export * from '../../src/validator/schemaValidator.ts';
export * from '../../src/policy/engine.ts';
export * from '../../src/audit/ledger.ts';
export * from '../../src/executor/sandboxRunner.ts';
export * from '../../src/privacy/sanitizer.ts';
export * from '../../src/hitl/interceptor.ts';

/**
 * Bootstrap function to launch the gateway with sample policies and mock handlers
 */
export async function launchAegisGateway(port = 8080): Promise<AegisGatewayServer> {
  const gateway = new AegisGatewayServer({ port });
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const rootDir = resolve(currentDir, '../../');

  // Load sample policies if they exist
  const bankingPolicyPath = resolve(rootDir, 'policies/banking-policy.json');
  const dataPolicyPath = resolve(rootDir, 'policies/data-governance.json');

  if (existsSync(bankingPolicyPath)) {
    const policy = JSON.parse(readFileSync(bankingPolicyPath, 'utf-8')) as PolicyDocument;
    gateway.loadPolicy(policy);
  }

  if (existsSync(dataPolicyPath)) {
    const policy = JSON.parse(readFileSync(dataPolicyPath, 'utf-8')) as PolicyDocument;
    gateway.loadPolicy(policy);
  }

  // Register mock safe tool handlers inside the isolated execution boundary
  const boundary = gateway.getExecutionBoundary();

  boundary.registerToolHandler('check_balance', (params) => {
    const account = (params.accountId as string) || 'ACC-DEFAULT';
    return {
      accountId: account,
      availableBalance: 42500.75,
      currency: 'USD',
      status: 'ACTIVE'
    };
  });

  boundary.registerToolHandler('transfer_funds', (params) => {
    return {
      transactionId: `tx-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      status: 'SETTLED',
      amount: params.amount,
      recipient: params.destinationAccount,
      timestamp: new Date().toISOString()
    };
  });

  boundary.registerToolHandler('execute_sql_query', (params) => {
    return {
      rowsAffected: 0,
      data: [
        { id: 1, name: 'Sample Account 1', balance: 5000 },
        { id: 2, name: 'Sample Account 2', balance: 12000 }
      ]
    };
  });

  await gateway.start();
  return gateway;
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
