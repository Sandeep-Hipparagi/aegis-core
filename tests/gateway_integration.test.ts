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
        recipient: { type: 'string', required: true },
        currency: { type: 'string', required: false }
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
    assert.equal(data.version, '0.1.3');
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

  it('should evaluate intent via SDK route POST /v1/intent/evaluate', async () => {
    const res = await fetch(`${baseUrl}/v1/intent/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'check_balance',
        parameters: { accountId: 'ACC-EVAL-01' },
        context: {
          sessionId: 'sess-eval-1',
          agentId: 'agent-eval',
          role: 'analyst'
        }
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json() as {
      intent: { tool: string; parameters: { accountId: string } };
      decision: { status: string; executionAllowed: boolean };
      execution?: { status: string; output: { accountId: string } };
    };

    assert.equal(data.decision.status, 'APPROVED');
    assert.equal(data.decision.executionAllowed, true);
    assert.equal(data.execution?.status, 'SUCCESS');
    assert.equal(data.execution?.output.accountId, 'ACC-EVAL-01');
  });

  it('should proxy OpenAI tool calls via POST /v1/tools/execute', async () => {
    const res = await fetch(`${baseUrl}/v1/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': 'openai-agent-01'
      },
      body: JSON.stringify({
        tool_call_id: 'call_999abc',
        name: 'check_balance',
        arguments: JSON.stringify({ accountId: 'ACC-OPENAI-01' }),
        role: 'assistant'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json() as {
      tool_call_id: string;
      verdict: string;
      allowed: boolean;
      execution?: { status: string; output: { accountId: string } };
    };

    assert.equal(data.tool_call_id, 'call_999abc');
    assert.equal(data.verdict, 'APPROVED');
    assert.equal(data.allowed, true);
    assert.equal(data.execution?.output.accountId, 'ACC-OPENAI-01');
  });

  it('should enforce DPDP policy pack invariants loaded into the pipeline', async () => {
    // Load policies from policies directory
    server.loadPoliciesFromDir('./policies');
    const pipeline = server.getPipeline();

    // Register test schemas for DPDP actions
    pipeline.registerToolSchema('query_database', {
      name: 'QueryDbSchema',
      strict: false
    });
    pipeline.registerToolSchema('export_customer_dataset', {
      name: 'ExportDatasetSchema',
      strict: false
    });

    // Case 1: Agent attempts to query forbidden aadhaar_vault
    const blockedRes = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'query_database',
        parameters: { targetTable: 'aadhaar_vault' },
        context: {
          sessionId: 'sess-dpdp-block',
          agentId: 'rogue-agent',
          role: 'analyst'
        }
      })
    });
    assert.equal(blockedRes.status, 403);
    const blockedData = await blockedRes.json() as { status: string; violations: Array<{ ruleId: string }> };
    assert.equal(blockedData.status, 'BLOCKED');
    assert(blockedData.violations.some(v => v.ruleId === 'DPDP-002-BLOCK-UNMASKED-IDENTITY-TARGETS'));

    // Case 2: Agent attempts bulk export > 100 records -> requires HITL
    const exportRes = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'export_customer_dataset',
        parameters: { recordCount: 500, format: 'csv' },
        context: {
          sessionId: 'sess-dpdp-export',
          agentId: 'marketing-bot',
          role: 'marketing'
        }
      })
    });
    assert.equal(exportRes.status, 200);
    const exportData = await exportRes.json() as { status: string; challenge?: { ticketId: string } };
    assert.equal(exportData.status, 'REQUIRES_HITL');
    assert(exportData.challenge?.ticketId !== undefined);
  });

  // -------------------------------------------------------------
  // REGRESSION TEST SUITE (v0.1.1): SEC-01, SEC-02, SEC-03
  // -------------------------------------------------------------
  it('should enforce SEC-01: sanitize PII in metadata and quarantine forbidden control flags', async () => {
    // 1. PII in metadata should be tokenized
    const piiMetaRes = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'transfer_funds',
        parameters: { amount: 100, recipient: 'ACC-VALID', currency: 'USD' },
        metadata: {
          clientPhone: '+91 9876543210',
          clientPan: 'ABCDE1234F',
          orderRef: 'ORD-9912'
        },
        context: { sessionId: 'sess-meta-pii', agentId: 'test-agent', role: 'operator' }
      })
    });

    assert.equal(piiMetaRes.status, 200);
    const piiMetaData = await piiMetaRes.json() as { status: string; auditEntry?: { intentPayloadHash: string } };
    assert.equal(piiMetaData.status, 'SUCCESS');

    // 2. Control injection flag in metadata should be quarantined with SCHEMA_ERROR (400)
    const injectMetaRes = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'transfer_funds',
        parameters: { amount: 100, recipient: 'ACC-VALID', currency: 'USD' },
        metadata: {
          force_execution: true
        },
        context: { sessionId: 'sess-meta-inject', agentId: 'test-agent', role: 'operator' }
      })
    });

    assert.equal(injectMetaRes.status, 400);
    const injectData = await injectMetaRes.json() as { status: string; reason: string };
    assert.equal(injectData.status, 'SCHEMA_ERROR');
    assert(injectData.reason.includes('Metadata quarantine violation'));

    // 3. Prototype pollution attempt should be rejected with SCHEMA_ERROR (400)
    const protoRes = await fetch(`${baseUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'transfer_funds',
        parameters: {
          amount: 100,
          recipient: 'ACC-VALID',
          currency: 'USD',
          constructor: { prototype: { admin: true } }
        }
      })
    });

    assert.equal(protoRes.status, 400);
    const protoData = await protoRes.json() as { status: string; reason: string };
    assert.equal(protoData.status, 'SCHEMA_ERROR');
    assert(protoData.reason.includes('Prototype pollution') || protoData.reason.includes('constructor'));
  });

  it('should enforce SEC-02: maintain persistent sessionId in AegisClient and strictly enforce session rate limits', async () => {
    const { AegisClient } = await import('../sdk/src/index.ts');

    // Register a strict session rate limit rule: max 2 actions per session with priority 1100 to override defaults
    server.loadPolicy({
      version: '1.0.0',
      namespace: 'session-rate-limit-test',
      defaultEffect: 'ALLOW',
      rules: [
        {
          id: 'TEST-SESSION-CAP-2',
          name: 'Cap Session Actions to 2',
          targetTools: ['transfer_funds'],
          effect: 'DENY',
          priority: 1100,
          conditions: [
            {
              type: 'rate_limit',
              maxActionsPerSession: 2,
              windowMs: 60000,
              message: 'Session rate limit exceeded (cap: 2)'
            }
          ]
        }
      ]
    });

    const client = new AegisClient({
      gatewayUrl: baseUrl,
      agentId: 'rate-limit-agent',
      sessionId: 'sess-rate-limit-verified-1'
    });

    // Call 1: Approved
    const res1 = await client.submitIntent('transfer_funds', { amount: 50, recipient: 'ACC-BOB', currency: 'USD' });
    assert.equal(res1.decision.status, 'APPROVED');

    // Call 2: Approved
    const res2 = await client.submitIntent('transfer_funds', { amount: 60, recipient: 'ACC-BOB', currency: 'USD' });
    assert.equal(res2.decision.status, 'APPROVED');

    // Call 3: Blocked by session rate limit!
    const res3 = await client.submitIntent('transfer_funds', { amount: 70, recipient: 'ACC-BOB', currency: 'USD' });
    assert.equal(res3.decision.status, 'BLOCKED');
    assert(res3.decision.reason.includes('rate limit exceeded') || res3.decision.violatedInvariants?.some(v => v.includes('rate limit')));

    // Test client.dispatch() SDK parity method
    const dispatchRes = await client.dispatch('transfer_funds', { amount: 80, recipient: 'ACC-BOB', currency: 'USD' });
    assert.equal(dispatchRes.isBlocked, true);
    assert.equal(dispatchRes.status, 'BLOCKED');

    // Test client.health() SDK parity method
    const health = await client.health();
    assert.equal(health.status, 'healthy');

    // Test client.verifyAuditIntegrity() SDK parity method
    const integrity = await client.verifyAuditIntegrity();
    assert.equal(integrity.isValid, true);
  });

  it('should enforce SEC-03: fail-closed with exit code 1 when verifying a non-existent ledger file via CLI', async () => {
    const { execSync } = await import('node:child_process');
    const { resolve } = await import('node:path');

    const cliPath = resolve('./bin/aegis.ts');
    let threwError = false;

    try {
      execSync(`node --experimental-strip-types "${cliPath}" audit verify --file non-existent-dummy-audit.log`, {
        stdio: 'pipe'
      });
    } catch (err: unknown) {
      threwError = true;
      const status = (err as { status?: number }).status;
      assert.equal(status, 1, 'Expected exit code 1 on missing audit ledger');
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
      assert(stderr.includes('Ledger file not found'), `Expected error message, got: ${stderr}`);
    }

    assert.equal(threwError, true, 'CLI should fail closed on missing ledger file');
  });

});

