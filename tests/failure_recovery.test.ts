import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxRunner } from '../src/executor/sandboxRunner.ts';
import { WormAuditLedger } from '../src/audit/ledger.ts';
import { HitlInterceptor } from '../src/hitl/interceptor.ts';
import { AegisClient, AegisPolicyBlockedError, AegisSchemaError, type IntentPayload } from '../sdk/src/index.ts';
import { AegisHttpServer } from '../src/server.ts';

describe('Failure Recovery, Fault Isolation & Boundary Resilience', () => {

  describe('1. SandboxRunner Runtime Fault & Timeout Isolation', () => {
    it('should catch synchronous tool exceptions cleanly without crashing or exposing host stack traces', async () => {
      const runner = new SandboxRunner();
      runner.registerTool('failing_tool', () => {
        throw new Error('Database socket connection refused (ECONNREFUSED)');
      });

      const res = await runner.run({
        tool: 'failing_tool',
        parameters: {},
        policyVerdict: 'APPROVED'
      });

      assert.equal(res.status, 'FAILED');
      assert.equal(res.error?.code, 'TOOL_RUNTIME_ERROR');
      assert.equal(res.error?.message, 'Database socket connection refused (ECONNREFUSED)');
      assert.ok(res.durationMs >= 0);
    });

    it('should catch asynchronous Promise rejections from async tool handlers', async () => {
      const runner = new SandboxRunner();
      runner.registerTool('async_failing_tool', async () => {
        await new Promise(r => setTimeout(r, 10));
        throw new Error('Upstream API returned 503 Service Unavailable');
      });

      const res = await runner.run({
        tool: 'async_failing_tool',
        parameters: {},
        policyVerdict: 'APPROVED'
      });

      assert.equal(res.status, 'FAILED');
      assert.equal(res.error?.code, 'TOOL_RUNTIME_ERROR');
      assert.equal(res.error?.message, 'Upstream API returned 503 Service Unavailable');
    });

    it('should coerce non-Error thrown exceptions (strings, numbers, objects) safely', async () => {
      const runner = new SandboxRunner();
      runner.registerTool('string_throw_tool', () => {
        throw 'Raw primitive exception string';
      });

      const res = await runner.run({
        tool: 'string_throw_tool',
        parameters: {},
        policyVerdict: 'APPROVED'
      });

      assert.equal(res.status, 'FAILED');
      assert.equal(res.error?.code, 'TOOL_RUNTIME_ERROR');
      assert.equal(res.error?.message, 'Raw primitive exception string');
    });

    it('should return TOOL_NOT_FOUND when calling an unregistered tool', async () => {
      const runner = new SandboxRunner();
      const res = await runner.run({
        tool: 'unknown_ghost_tool',
        parameters: {},
        policyVerdict: 'APPROVED'
      });

      assert.equal(res.status, 'FAILED');
      assert.equal(res.error?.code, 'TOOL_NOT_FOUND');
    });

    it('should abort and return TIMEOUT when handler exceeds allotted timeout guard', async () => {
      const runner = new SandboxRunner({ defaultTimeoutMs: 50 });
      runner.registerTool('hanging_tool', async (_params, { signal }) => {
        return new Promise((resolve) => {
          const timer = setTimeout(() => resolve('finished'), 500);
          signal.addEventListener('abort', () => clearTimeout(timer));
        });
      });

      const res = await runner.run({
        tool: 'hanging_tool',
        parameters: {},
        policyVerdict: 'APPROVED',
        timeoutMs: 30
      });

      assert.equal(res.status, 'TIMEOUT');
      assert.equal(res.error?.code, 'EXECUTION_TIMEOUT');
    });

    it('should strictly refuse execution when policyVerdict is BLOCKED or REQUIRES_HITL with 0 tool calls', async () => {
      let callCount = 0;
      const runner = new SandboxRunner();
      runner.registerTool('dangerous_tool', () => {
        callCount++;
        return 'executed';
      });

      const resBlocked = await runner.run({
        tool: 'dangerous_tool',
        parameters: {},
        policyVerdict: 'BLOCKED'
      });
      assert.equal(resBlocked.status, 'POLICY_BLOCKED');
      assert.equal(callCount, 0, 'Tool must never be invoked when BLOCKED');

      const resHitl = await runner.run({
        tool: 'dangerous_tool',
        parameters: {},
        policyVerdict: 'REQUIRES_HITL'
      });
      assert.equal(resHitl.status, 'POLICY_BLOCKED');
      assert.equal(callCount, 0, 'Tool must never be invoked when REQUIRES_HITL');
    });
  });

  describe('2. WORM Audit Ledger Tamper Detection & Serialization Mutex', () => {
    it('should maintain chain integrity across sequential entries and detect single-bit corruption', () => {
      const ledger = new WormAuditLedger();
      ledger.append({
        sessionId: 'sess-1',
        agentId: 'agent-1',
        intentPayload: { tool: 'login', status: 'SUCCESS' },
        policyVerdict: 'APPROVED'
      });
      ledger.append({
        sessionId: 'sess-1',
        agentId: 'agent-1',
        intentPayload: { tool: 'query', status: 'SUCCESS' },
        policyVerdict: 'APPROVED'
      });
      ledger.append({
        sessionId: 'sess-1',
        agentId: 'agent-1',
        intentPayload: { tool: 'transfer', status: 'APPROVED' },
        policyVerdict: 'APPROVED'
      });
      ledger.append({
        sessionId: 'sess-1',
        agentId: 'agent-1',
        intentPayload: { tool: 'logout', status: 'SUCCESS' },
        policyVerdict: 'APPROVED'
      });

      // Clean check
      const cleanCheck = ledger.verifyChainIntegrity();
      assert.equal(cleanCheck.isValid, true);

      // Mutate entry index 2 using test tamper method
      ledger._tamperEntryForTest(2, 'policyVerdict', 'BLOCKED');

      const corruptCheck = ledger.verifyChainIntegrity();
      assert.equal(corruptCheck.isValid, false);
      assert.equal(corruptCheck.brokenAtIndex, 2);
    });

    it('should serialize concurrent async append operations without race conditions', async () => {
      const ledger = new WormAuditLedger();
      const operations = Array.from({ length: 25 }, (_, i) => 
        ledger.appendAsync({
          sessionId: `sess-concurrent-${i}`,
          agentId: 'worker-agent',
          intentPayload: { action: `concurrent_action_${i}`, index: i },
          policyVerdict: 'APPROVED'
        })
      );

      await Promise.all(operations);
      const integrity = ledger.verifyChainIntegrity();
      assert.equal(integrity.isValid, true, 'Serialized concurrent appends must maintain Merkle chain');
    });
  });

  describe('3. HITL Interceptor Replay & Expiry Recovery', () => {
    const testIntent: IntentPayload = {
      intentId: 'int-hitl-fail-test',
      timestamp: new Date().toISOString(),
      agent: {
        agentId: 'test-agent-fail',
        role: 'operator',
        sessionId: 'sess-hitl-fail'
      },
      tool: 'wire_transfer',
      parameters: { amount: 100000 }
    };

    it('should prevent replay attacks when attempting to resolve a finalized ticket twice', () => {
      const interceptor = new HitlInterceptor({ defaultTtlMs: 5000 });
      const challenge = interceptor.createChallenge(
        testIntent,
        'Large transfer threshold exceeded'
      );

      // First resolution: approve
      const firstRes = interceptor.resolveChallenge(
        challenge.ticketId,
        'APPROVED',
        'sig-supervisor-1'
      );
      assert.equal(firstRes.status, 'APPROVED');

      // Second resolution: attempt to reject already finalized ticket
      assert.throws(
        () => interceptor.resolveChallenge(
          challenge.ticketId,
          'REJECTED',
          'sig-adversary-replay'
        ),
        (err: unknown) => {
          assert.match(String(err), /already been resolved/i);
          return true;
        }
      );
    });

    it('should fail closed when attempting to resolve an expired challenge', async () => {
      const interceptor = new HitlInterceptor({ defaultTtlMs: 25 });
      const challenge = interceptor.createChallenge(
        testIntent,
        'Urgent grant',
        20
      );

      // Wait for expiration
      await new Promise(r => setTimeout(r, 40));

      assert.throws(
        () => interceptor.resolveChallenge(
          challenge.ticketId,
          'APPROVED',
          'sig-supervisor-1'
        ),
        (err: unknown) => {
          assert.match(String(err), /expired/i);
          return true;
        }
      );
    });

    it('should fail closed when resolving non-existent ticketId', () => {
      const interceptor = new HitlInterceptor();
      assert.throws(
        () => interceptor.resolveChallenge(
          'non-existent-ticket-uuid',
          'APPROVED',
          'sig-supervisor-1'
        ),
        (err: unknown) => {
          assert.match(String(err), /not found/i);
          return true;
        }
      );
    });
  });

  describe('4. SDK (AegisClient) Network & Governance Error Recovery', () => {
    let server: AegisHttpServer;
    let baseUrl: string;

    before(async () => {
      server = new AegisHttpServer({ port: 0 });
      const pipeline = server.getPipeline();

      pipeline.registerToolSchema('test_tool', {
        name: 'TestToolSchema',
        strict: true,
        properties: {
          val: { type: 'number', required: true }
        }
      });

      pipeline.registerToolHandler('test_tool', (params) => {
        return { result: Number(params.val) * 2 };
      });

      // Register a blocking rule for value 999
      server.loadPolicy({
        version: '1.0.0',
        namespace: 'sdk-recovery-test',
        defaultEffect: 'ALLOW',
        rules: [
          {
            id: 'BLOCK-VAL-999',
            name: 'Block value 999',
            targetTools: ['test_tool'],
            effect: 'DENY',
            priority: 1000,
            conditions: [
              {
                field: 'parameters.val',
                operator: 'EQUALS',
                value: 999,
                message: 'Value 999 is prohibited by safety envelope'
              }
            ]
          }
        ]
      });

      const port = await server.start(0);
      baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
      await server.stop();
    });

    it('should recover gracefully when attempting to reach an unreachable host', async () => {
      const client = new AegisClient({ gatewayUrl: 'http://127.0.0.1:59999' });
      await assert.rejects(
        () => client.submitIntent('test_tool', { val: 10 }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /fetch failed|ECONNREFUSED|connect/i);
          return true;
        }
      );
    });

    it('should return isBlocked: true without throwing when raiseOnBlocked is false on blocked tool call', async () => {
      const client = new AegisClient({ gatewayUrl: baseUrl });
      const res = await client.dispatch('test_tool', { val: 999 }, { raiseOnBlocked: false });
      assert.equal(res.isBlocked, true);
      assert.equal(res.status, 'BLOCKED');
      assert.ok(res.violations && res.violations.length > 0);
    });

    it('should throw AegisPolicyBlockedError when raiseOnBlocked is true on blocked tool call', async () => {
      const client = new AegisClient({ gatewayUrl: baseUrl });
      await assert.rejects(
        () => client.dispatch('test_tool', { val: 999 }, { raiseOnBlocked: true }),
        (err: unknown) => {
          assert.ok(err instanceof AegisPolicyBlockedError);
          assert.equal(err.name, 'AegisPolicyBlockedError');
          assert.match(err.message, /Value 999 is prohibited/i);
          return true;
        }
      );
    });

    it('should throw AegisSchemaError with issue traces when payload violates schema', async () => {
      const client = new AegisClient({ gatewayUrl: baseUrl });
      await assert.rejects(
        () => client.dispatch('test_tool', { val: 'not-a-number' }),
        (err: unknown) => {
          assert.ok(err instanceof AegisSchemaError);
          assert.equal(err.name, 'AegisSchemaError');
          return true;
        }
      );
    });
  });

});
