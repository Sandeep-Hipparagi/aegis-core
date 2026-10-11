import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WormAuditLedger, GENESIS_HASH, hashPayload } from '../src/audit/ledger.ts';
import { SandboxRunner, type ExecutionResult } from '../src/executor/sandboxRunner.ts';

describe('Cryptographic WORM Audit Ledger & Ephemeral Sandbox Runner', () => {

  describe('1. WORM Audit Ledger - Cryptographic Chaining & Tamper Detection', () => {
    let ledger: WormAuditLedger;

    beforeEach(() => {
      ledger = new WormAuditLedger();
    });

    it('should correctly chain entries from genesis hash and verify chain integrity', () => {
      // Append entry 1
      const e1 = ledger.append({
        sessionId: 'sess-001',
        agentId: 'agent-alice',
        intentPayload: { action: 'check_balance', accountId: 'ACC-1' },
        policyVerdict: 'APPROVED'
      });

      assert.equal(e1.sequenceId, 1);
      assert.equal(e1.previousEntryHash, GENESIS_HASH);
      assert.equal(typeof e1.entryHash, 'string');
      assert.equal(e1.entryHash.length, 64);

      // Append entry 2
      const e2 = ledger.append({
        sessionId: 'sess-001',
        agentId: 'agent-alice',
        intentPayload: { action: 'transfer_funds', amount: 500, to: 'ACC-2' },
        policyVerdict: 'APPROVED'
      });

      assert.equal(e2.sequenceId, 2);
      assert.equal(e2.previousEntryHash, e1.entryHash);

      // Append entry 3 (blocked)
      const e3 = ledger.append({
        sessionId: 'sess-001',
        agentId: 'agent-alice',
        intentPayload: { action: 'transfer_funds', amount: 1000000, to: 'ACC-OFFSHORE' },
        policyVerdict: 'BLOCKED',
        violationTrace: { rule: 'TRANSFER_CAP_EXCEEDED', max: 10000 }
      });

      assert.equal(e3.sequenceId, 3);
      assert.equal(e3.previousEntryHash, e2.entryHash);

      // Verify chain integrity
      const verification = ledger.verifyChainIntegrity();
      assert.equal(verification.isValid, true);
      assert.equal(verification.brokenAtIndex, undefined);
    });

    it('should produce identical payload hashes regardless of JSON key ordering (canonicalization)', () => {
      const payload1 = { z: 1, a: 2, m: { b: 3, a: 4 } };
      const payload2 = { a: 2, m: { a: 4, b: 3 }, z: 1 };

      const hash1 = hashPayload(payload1);
      const hash2 = hashPayload(payload2);

      assert.equal(hash1, hash2);
    });

    it('should detect tampering when past entry fields are modified and pinpoint the corrupted index', () => {
      ledger.append({
        sessionId: 'sess-sec-1',
        agentId: 'agent-bob',
        intentPayload: { step: 1 },
        policyVerdict: 'APPROVED'
      });

      ledger.append({
        sessionId: 'sess-sec-1',
        agentId: 'agent-bob',
        intentPayload: { step: 2 },
        policyVerdict: 'APPROVED'
      });

      ledger.append({
        sessionId: 'sess-sec-1',
        agentId: 'agent-bob',
        intentPayload: { step: 3 },
        policyVerdict: 'APPROVED'
      });

      // Chain should initially be valid
      assert.equal(ledger.verifyChainIntegrity().isValid, true);

      // Adversary tampers with entry at index 1 (change policyVerdict from APPROVED to BLOCKED)
      ledger._tamperEntryForTest(1, 'policyVerdict', 'BLOCKED');

      const corruptedVerification = ledger.verifyChainIntegrity();
      assert.equal(corruptedVerification.isValid, false);
      assert.equal(corruptedVerification.brokenAtIndex, 1);
      assert(corruptedVerification.reason?.includes('Cryptographic digest mismatch'));
    });

    it('should detect tampering when an adversary breaks the previousEntryHash pointer', () => {
      ledger.append({
        sessionId: 'sess-chain-1',
        agentId: 'agent-carol',
        intentPayload: { query: 'SELECT 1' },
        policyVerdict: 'APPROVED'
      });

      ledger.append({
        sessionId: 'sess-chain-1',
        agentId: 'agent-carol',
        intentPayload: { query: 'SELECT 2' },
        policyVerdict: 'APPROVED'
      });

      // Tamper previousEntryHash at index 1 to forged hash
      ledger._tamperEntryForTest(1, 'previousEntryHash', 'f'.repeat(64));

      const verification = ledger.verifyChainIntegrity();
      assert.equal(verification.isValid, false);
      assert.equal(verification.brokenAtIndex, 1);
    });
  });

  describe('2. Ephemeral Sandbox Runner - Decoupled Execution & Security Sandboxing', () => {
    let runner: SandboxRunner;

    beforeEach(() => {
      runner = new SandboxRunner({ defaultTimeoutMs: 100 });
    });

    it('should strictly refuse to execute BLOCKED or REQUIRES_HITL actions without calling the tool', async () => {
      let toolCalled = false;

      runner.registerTool('delete_database', () => {
        toolCalled = true;
        return { deleted: true };
      });

      // Attempt 1: BLOCKED
      const blockedResult = await runner.run({
        tool: 'delete_database',
        parameters: { force: true },
        policyVerdict: 'BLOCKED'
      });

      assert.equal(blockedResult.status, 'POLICY_BLOCKED');
      assert.equal(blockedResult.error?.code, 'EXECUTION_DENIED_BY_POLICY');
      assert.equal(toolCalled, false);

      // Attempt 2: REQUIRES_HITL
      const hitlResult = await runner.run({
        tool: 'delete_database',
        parameters: { force: true },
        policyVerdict: 'REQUIRES_HITL'
      });

      assert.equal(hitlResult.status, 'POLICY_BLOCKED');
      assert.equal(toolCalled, false);
    });

    it('should execute APPROVED actions in an environment sanitized of process.env host secrets', async () => {
      // Simulate host process having sensitive API keys
      process.env.INTERNAL_CORP_API_KEY = 'super-secret-host-key-999';
      process.env.DATABASE_PASSWORD = 'host-db-password-root';

      let receivedEnv: Record<string, string> = {};

      runner.registerTool('fetch_customer_data', (_params, context) => {
        receivedEnv = { ...context.sanitizedEnv };
        return { customerId: 'CUST-100', name: 'John Doe' };
      });

      const result = await runner.run({
        tool: 'fetch_customer_data',
        parameters: { id: 'CUST-100' },
        policyVerdict: 'APPROVED',
        scopedCredentials: {
          SCOPED_API_TOKEN: 'scoped-temporary-token-xyz'
        }
      });

      assert.equal(result.status, 'SUCCESS');
      assert.deepEqual(result.output, { customerId: 'CUST-100', name: 'John Doe' });

      // Invariant: Host secrets are stripped and inaccessible to sandbox
      assert.equal(receivedEnv.INTERNAL_CORP_API_KEY, undefined);
      assert.equal(receivedEnv.DATABASE_PASSWORD, undefined);

      // Invariant: Explicit scoped credentials are provided
      assert.equal(receivedEnv.SCOPED_API_TOKEN, 'scoped-temporary-token-xyz');
    });

    it('should abort and return TIMEOUT when execution exceeds safety timeout guard', async () => {
      runner.registerTool('slow_computation', async (_params, context) => {
        return new Promise((resolve) => {
          const timer = setTimeout(() => resolve('finished'), 250);
          context.signal.addEventListener('abort', () => clearTimeout(timer));
        });
      });

      const result = await runner.run({
        tool: 'slow_computation',
        parameters: {},
        policyVerdict: 'APPROVED',
        timeoutMs: 50 // 50ms timeout limit
      });

      assert.equal(result.status, 'TIMEOUT');
      assert.equal(result.error?.code, 'EXECUTION_TIMEOUT');
      assert(result.error?.message.includes('safety threshold of 50ms'));
    });

    it('should catch runtime faults cleanly without exposing internal stack traces', async () => {
      runner.registerTool('failing_tool', () => {
        throw new Error('Downstream microservice connection timeout (HTTP 503)');
      });

      const result = await runner.run({
        tool: 'failing_tool',
        parameters: {},
        policyVerdict: 'APPROVED'
      });

      assert.equal(result.status, 'FAILED');
      assert.equal(result.error?.code, 'TOOL_RUNTIME_ERROR');
      assert.equal(result.error?.message, 'Downstream microservice connection timeout (HTTP 503)');
      // Stack trace not attached to public error payload
      assert.equal((result.error as Record<string, unknown>).stack, undefined);
    });
  });

});
