import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SchemaValidator, ValidationError, type SchemaDefinition } from '../src/validator/schemaValidator.ts';
import { PolicyEngine, type PolicyContract } from '../src/policy/engine.ts';

describe('Deterministic Invariant Enforcement & Policy Checker', () => {

  describe('1. SchemaValidator - Strict Typing & Fail-Closed Validation', () => {
    const transferSchema: SchemaDefinition = {
      name: 'TransferFundsSchema',
      strict: true,
      properties: {
        amount: { type: 'number', min: 1, max: 100000, required: true },
        recipient: { type: 'string', min: 3, max: 50, required: true },
        currency: { type: 'enum', allowedValues: ['USD', 'EUR', 'GBP'], required: true },
        memo: { type: 'string', max: 100, required: false }
      }
    };

    it('should successfully validate a strictly conforming payload', () => {
      const validPayload = {
        amount: 250.50,
        recipient: 'ACC-VEND-402',
        currency: 'USD',
        memo: 'Invoice 2026-X'
      };

      const result = SchemaValidator.validate(transferSchema, validPayload);
      assert.deepEqual(result, validPayload);
    });

    it('should fail closed with REJECTED_SCHEMA when an unexpected field is injected', () => {
      const maliciousPayload = {
        amount: 250.50,
        recipient: 'ACC-VEND-402',
        currency: 'USD',
        // Injected unauthorized property
        __proto_bypass__: true,
        overrideAuth: true
      };

      assert.throws(
        () => SchemaValidator.validate(transferSchema, maliciousPayload),
        (err: unknown) => {
          assert(err instanceof ValidationError);
          assert.equal(err.code, 'REJECTED_SCHEMA');
          assert(err.message.includes('REJECTED_SCHEMA'));
          assert(err.issues.some(i => i.path === '__proto_bypass__'));
          assert(err.issues.some(i => i.path === 'overrideAuth'));
          return true;
        }
      );
    });

    it('should fail closed with REJECTED_SCHEMA when a field has a malformed type', () => {
      const malformedPayload = {
        amount: 'two hundred dollars', // String instead of number
        recipient: 'ACC-VEND-402',
        currency: 'USD'
      };

      assert.throws(
        () => SchemaValidator.validate(transferSchema, malformedPayload),
        (err: unknown) => {
          assert(err instanceof ValidationError);
          assert.equal(err.code, 'REJECTED_SCHEMA');
          const issue = err.issues.find(i => i.path === 'amount');
          assert(issue !== undefined);
          assert.equal(issue.expected, 'number');
          assert.equal(issue.received, 'string');
          return true;
        }
      );
    });

    it('should fail closed with REJECTED_SCHEMA when an enum value is invalid', () => {
      const invalidEnumPayload = {
        amount: 500,
        recipient: 'ACC-VEND-402',
        currency: 'DOGECOIN' // Not in ['USD', 'EUR', 'GBP']
      };

      assert.throws(
        () => SchemaValidator.validate(transferSchema, invalidEnumPayload),
        (err: unknown) => {
          assert(err instanceof ValidationError);
          assert.equal(err.code, 'REJECTED_SCHEMA');
          assert(err.issues.some(i => i.path === 'currency'));
          return true;
        }
      );
    });

    it('should strip unrecognized parameters when stripUnrecognized is explicitly enabled without strict error', () => {
      const nonStrictSchema: SchemaDefinition = {
        name: 'FlexibleSchema',
        strict: false,
        properties: {
          query: { type: 'string', required: true }
        }
      };

      const payloadWithExtras = {
        query: 'SELECT * FROM metrics',
        extraIgnoredField: 'discard-me',
        nestedExtra: { a: 1 }
      };

      const sanitized = SchemaValidator.validate<{ query: string }>(
        nonStrictSchema,
        payloadWithExtras,
        { strict: false, stripUnrecognized: true }
      );

      assert.equal(sanitized.query, 'SELECT * FROM metrics');
      assert.equal((sanitized as Record<string, unknown>).extraIgnoredField, undefined);
    });
  });

  describe('2. PolicyEngine - Invariant Enforcement & Violation Traces', () => {
    let engine: PolicyEngine;

    const sampleContract: PolicyContract = {
      version: '1.0.0',
      namespace: 'fintech.governance',
      defaultEffect: 'DENY',
      rules: [
        // 1. Block access to sensitive database tables
        {
          id: 'RULE-DISALLOW-TARGETS',
          name: 'Block Sensitive Data Targets',
          description: 'Restricts reading or mutating sensitive security tables',
          targetTools: ['execute_sql', 'query_database'],
          effect: 'DENY',
          priority: 1000,
          conditions: [
            {
              type: 'disallowed_targets',
              targetField: 'parameters.targetTable',
              targets: ['users.credentials', 'auth_tokens', 'financial.pii'],
              message: 'Target table is blacklisted due to critical credential exposure risk'
            }
          ]
        },
        // 2. Numeric ceiling threshold on transaction amount
        {
          id: 'RULE-PARAM-BOUNDARY-CAP',
          name: 'Enforce Autonomous Transfer Limit ($10,000)',
          description: 'Autonomous agents cannot transfer more than $10,000 in a single action',
          targetTools: ['transfer_funds'],
          effect: 'DENY',
          priority: 900,
          conditions: [
            {
              type: 'param_boundary',
              field: 'parameters.amount',
              max: 10000,
              message: 'Amount exceeds autonomous ceiling limit of $10,000.00'
            }
          ]
        },
        // 3. Rate limit: Max 3 transfers per session window
        {
          id: 'RULE-SESSION-RATE-LIMIT',
          name: 'Session Frequency Limit',
          description: 'Prevent runaway automation by capping actions at 3 per session',
          targetTools: ['transfer_funds'],
          effect: 'DENY',
          priority: 850,
          conditions: [
            {
              type: 'rate_limit',
              maxActionsPerSession: 3,
              windowMs: 60000,
              message: 'Agent exceeded session frequency threshold (max 3 actions per window)'
            }
          ]
        },
        // 4. Role invariant check for privileged administrative operations
        {
          id: 'RULE-ADMIN-PRIVILEGE',
          name: 'Enforce Administrative Authorization',
          description: 'Only human super-admins can execute user account purge',
          targetTools: ['purge_account'],
          effect: 'DENY',
          priority: 800,
          conditions: [
            {
              type: 'role_invariant',
              allowedRoles: ['super-admin-human'],
              message: 'Privilege escalation blocked: agent lacks super-admin-human role'
            }
          ]
        },
        // 5. Permit compliant transfer_funds
        {
          id: 'RULE-ALLOW-TRANSFER',
          name: 'Permit Legitimate Transfer',
          description: 'Allows compliant transfers within limits',
          targetTools: ['transfer_funds'],
          effect: 'ALLOW',
          priority: 100,
          conditions: []
        },
        // 6. Permit compliant queries
        {
          id: 'RULE-ALLOW-QUERY',
          name: 'Permit Analytics Queries',
          description: 'Allows safe queries',
          targetTools: ['execute_sql', 'query_database'],
          effect: 'ALLOW',
          priority: 100,
          conditions: []
        }
      ]
    };

    beforeEach(() => {
      engine = new PolicyEngine();
      engine.registerPolicy(sampleContract);
    });

    it('should APPROVE an agent requesting an action strictly within bounds', () => {
      const compliantIntent = {
        sessionId: 'sess-alpha-001',
        agentId: 'agent-finance-01',
        role: 'operator',
        tool: 'transfer_funds',
        parameters: {
          amount: 2500,
          recipient: 'ACC-VENDOR-99'
        }
      };

      const result = engine.evaluate(compliantIntent);

      assert.equal(result.allowed, true);
      assert.equal(result.verdict, 'APPROVED');
      assert.equal(result.violations.length, 0);
      assert(result.matchedRules.includes('RULE-ALLOW-TRANSFER'));
    });

    it('should REJECT an agent attempting out-of-bounds mutation with an explicit violation trace (param_boundary)', () => {
      const outOfBoundsIntent = {
        sessionId: 'sess-alpha-002',
        agentId: 'agent-finance-01',
        role: 'operator',
        tool: 'transfer_funds',
        parameters: {
          amount: 25000, // Violates max 10000 cap
          recipient: 'ACC-VENDOR-99'
        }
      };

      const result = engine.evaluate(outOfBoundsIntent);

      assert.equal(result.allowed, false);
      assert.equal(result.verdict, 'BLOCKED');
      assert.equal(result.violations.length, 1);

      const violation = result.violations[0];
      assert.equal(violation.ruleId, 'RULE-PARAM-BOUNDARY-CAP');
      assert.equal(violation.conditionType, 'param_boundary');
      assert.equal(violation.actual, 25000);
      assert(violation.message.includes('ceiling limit of $10,000.00'));
    });

    it('should REJECT an agent attempting to access disallowed sensitive targets (disallowed_targets)', () => {
      const sensitiveTargetIntent = {
        sessionId: 'sess-alpha-003',
        agentId: 'agent-analyst-02',
        role: 'analyst',
        tool: 'execute_sql',
        parameters: {
          targetTable: 'users.credentials',
          query: 'SELECT * FROM users.credentials'
        }
      };

      const result = engine.evaluate(sensitiveTargetIntent);

      assert.equal(result.allowed, false);
      assert.equal(result.verdict, 'BLOCKED');
      assert.equal(result.violations.length, 1);

      const violation = result.violations[0];
      assert.equal(violation.ruleId, 'RULE-DISALLOW-TARGETS');
      assert.equal(violation.conditionType, 'disallowed_targets');
      assert.equal(violation.actual, 'users.credentials');
      assert(violation.message.includes('blacklisted due to critical credential exposure risk'));
    });

    it('should REJECT an agent attempting privilege escalation (role_invariant)', () => {
      const privilegeEscalationIntent = {
        sessionId: 'sess-alpha-004',
        agentId: 'agent-rogue-03',
        role: 'junior-operator', // Lacks 'super-admin-human'
        tool: 'purge_account',
        parameters: {
          targetUserId: 'USR-8889'
        }
      };

      const result = engine.evaluate(privilegeEscalationIntent);

      assert.equal(result.allowed, false);
      assert.equal(result.verdict, 'BLOCKED');
      assert.equal(result.violations.length, 1);

      const violation = result.violations[0];
      assert.equal(violation.ruleId, 'RULE-ADMIN-PRIVILEGE');
      assert.equal(violation.conditionType, 'role_invariant');
      assert.equal(violation.actual, 'junior-operator');
      assert(violation.message.includes('Privilege escalation blocked'));
    });

    it('should REJECT an agent once the session rate limit budget is exhausted (rate_limit)', () => {
      const sessionId = 'sess-burst-999';

      const makeIntent = (amount = 100) => ({
        sessionId,
        agentId: 'agent-bot',
        role: 'operator',
        tool: 'transfer_funds',
        parameters: { amount }
      });

      // Actions 1, 2, 3 should succeed (limit is max 3)
      const res1 = engine.evaluate(makeIntent(100));
      assert.equal(res1.allowed, true);

      const res2 = engine.evaluate(makeIntent(200));
      assert.equal(res2.allowed, true);

      const res3 = engine.evaluate(makeIntent(300));
      assert.equal(res3.allowed, true);

      // Action 4 should be BLOCKED due to session rate limit
      const res4 = engine.evaluate(makeIntent(400));
      assert.equal(res4.allowed, false);
      assert.equal(res4.verdict, 'BLOCKED');
      assert.equal(res4.violations.length, 1);

      const violation = res4.violations[0];
      assert.equal(violation.ruleId, 'RULE-SESSION-RATE-LIMIT');
      assert.equal(violation.conditionType, 'rate_limit');
      assert(violation.message.includes('exceeded session frequency threshold'));
    });
  });

});
