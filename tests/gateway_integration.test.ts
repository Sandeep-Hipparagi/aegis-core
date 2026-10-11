import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AegisHttpServer } from '../src/server.ts';
import type { PolicyContract } from '../src/policy/engine.ts';

describe('Gateway Integration - HTTP Server, Pipeline & MCP Protocol', () => {
  let server: AegisHttpServer;
  let port: number;
  let baseUrl: string;
  let executedTransfers: Array<Record<string, unknown>> = [];

  const testContract: PolicyContract = {
    version: '1.0.0',
    namespace: 'test.gateway.integration',
    defaultEffect: 'DENY',
    rules: [
      // 1. Disallow sensitive database targets
      {
        id: 'RULE-DISALLOW-SENSITIVE',
        name: 'Block Sensitive Data Targets',
        description: 'Blocks access to user credentials',
        targetTools: ['query_database'],
        effect: 'DENY',
        priority: 1000,
        conditions: [
          {
            type: 'disallowed_targets',
            targetField: 'parameters.targetTable',
            targets: ['users.credentials', 'vault_keys'],
            message: 'Target table is blacklisted'
          }
        ]
      },
      // 2. High-value transfer requires HITL approval (> $50,000)
      {
        id: 'RULE-ESCALATE-HIGH-TRANSFER',
        name: 'Escalate High Value Transfers',
        description: 'Transfers > $50,000 require human officer signoff',
        targetTools: ['transfer_funds'],
        effect: 'ESCALATE',
        priority: 800,
        conditions: [
          {
            type: 'param_boundary',
            field: 'parameters.amount',
            max: 50000,
            message: 'Transfer amount exceeds autonomous ceiling'
          }
        ]
      },
      // 3. Allow standard transfers (<= $50,000)
      {
        id: 'RULE-ALLOW-STANDARD-TRANSFER',
        name: 'Allow Standard Transfer',
        description: 'Permits standard transfers within bounds',
        targetTools: ['transfer_funds'],
        effect: 'ALLOW',
        priority: 200,
        conditions: []
      },
      // 4. Allow account inquiry
      {
        id: 'RULE-ALLOW-BALANCE',
        name: 'Allow Balance Check',
        description: 'Permits read-only balance lookups',
        targetTools: ['check_balance'],
        effect: 'ALLOW',
        priority: 100,
        conditions: []
      }
    ]
  };

  before(async () => {
    server = new AegisHttpServer({ port: 0 }); // OS ephemeral port
    const pipeline = server.getPipeline();

    // Register test policies
    pipeline.registerPolicy(testContract);

    // Register tool schemas
    pipeline.registerToolSchema('check_balance', {
      name: 'CheckBalanceSchema',
      strict: true,
      properties: {
        accountId: { type: 'string', required: true }
      }
    });

    pipeline.registerToolSchema('transfer_funds', {
      name: 'TransferFundsSchema',
      strict: true,
      properties: {
        amount: { type: 'number', required: true, min: 1 },
        recipient: { type: 'string', required: true }
      }
    });

    // Register tool execution handlers
    pipeline.registerToolHandler('check_balance', (params) => {
      return {
        accountId: params.accountId,
        available: 154000.50,
        currency: 'USD'
      };
    });

    pipeline.registerToolHandler('transfer_funds', (params) => {
      executedTransfers.push(params);
      return {
        txId: `tx-${Date.now()}`,
        status: 'SETTLED',
        amount: params.amount,
        recipient: params.recipient
      };
    });

    pipeline.registerToolHandler('query_database', (params) => {
      return { rows: [] };
    });

    port = await server.start(0);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await server.stop();
  });

  it('should verify health probe returns healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json() as { status: string; version: string };
    assert.equal(data.status, 'healthy');
    assert.equal(data.version, '0.1.0');
  });

  it('should successfully dispatch a valid tool action and return SUCCESS with output', async () => {
    const res = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'check_balance',
        parameters: { accountId: 'ACC-SAVINGS-01' },
        context: {
          sessionId: 'sess-http-1',
          agentId: 'agent-alice',
          role: 'operator'
        }
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json() as {
      status: string;
      execution?: { status: string; output: { accountId: string; available: number } };
    };

    assert.equal(data.status, 'SUCCESS');
    assert.equal(data.execution?.status, 'SUCCESS');
    assert.equal(data.execution?.output.accountId, 'ACC-SAVINGS-01');
    assert.equal(data.execution?.output.available, 154000.50);
  });

  it('should block dispatch of a disallowed target returning 403 with zero tool execution', async () => {
    const res = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'query_database',
        parameters: { targetTable: 'users.credentials' },
        context: {
          sessionId: 'sess-http-2',
          agentId: 'agent-bob',
          role: 'analyst'
        }
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json() as { status: string; reason: string; violations: Array<{ ruleId: string }> };
    assert.equal(data.status, 'BLOCKED');
    assert(data.violations.some(v => v.ruleId === 'RULE-DISALLOW-SENSITIVE'));
  });

  it('should return REQUIRES_HITL on high-value transfer, and execute after human approval resolution', async () => {
    executedTransfers = [];

    // Step 1: Submit high-value transfer intent ($75,000 exceeds $50,000 threshold)
    const dispatchRes = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'transfer_funds',
        parameters: {
          amount: 75000,
          recipient: 'ACC-CORPORATE-99'
        },
        context: {
          sessionId: 'sess-http-3',
          agentId: 'agent-treasury',
          role: 'treasury-bot'
        }
      })
    });

    assert.equal(dispatchRes.status, 200);
    const dispatchData = await dispatchRes.json() as {
      status: string;
      challenge: { ticketId: string; status: string; intentHash: string };
    };

    assert.equal(dispatchData.status, 'REQUIRES_HITL');
    assert(dispatchData.challenge !== undefined);
    assert.equal(dispatchData.challenge.status, 'PENDING');
    assert.equal(executedTransfers.length, 0); // Must NOT execute yet

    const ticketId = dispatchData.challenge.ticketId;

    // Step 2: Resolve HITL ticket via API
    const resolveRes = await fetch(`${baseUrl}/v1/hitl/challenges/${ticketId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        approverSignature: 'sig-officer-rsa-verified'
      })
    });

    assert.equal(resolveRes.status, 200);
    const resolveData = await resolveRes.json() as {
      resolution: { status: string; decision: string };
      execution: { status: string; output: { status: string; amount: number } };
    };

    assert.equal(resolveData.resolution.status, 'APPROVED');
    assert.equal(resolveData.execution.status, 'SUCCESS');
    assert.equal(resolveData.execution.output.amount, 75000);

    // Verify sandbox runner actually executed upon approval
    assert.equal(executedTransfers.length, 1);
    assert.equal(executedTransfers[0].amount, 75000);
  });

  it('should verify audit chain integrity via GET /v1/audit/integrity', async () => {
    const res = await fetch(`${baseUrl}/v1/audit/integrity`);
    assert.equal(res.status, 200);

    const integrity = await res.json() as { isValid: boolean; brokenAtIndex?: number };
    assert.equal(integrity.isValid, true);
    assert.equal(integrity.brokenAtIndex, undefined);
  });

});
