import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { SchemaValidator, ValidationError, type SchemaDefinition } from '../src/validator/schemaValidator.ts';
import { PolicyEngine, type IntentContext } from '../src/policy/engine.ts';
import { tokenize, detokenize } from '../src/privacy/sanitizer.ts';

describe('Adversarial Penetration Testing Probes & Security Invariants (v0.1.2)', () => {
  describe('SEC-06: Lowercase & Case-Insensitive PII Tokenization', () => {
    it('should tokenize lowercase PAN cards and mixed-case identifiers cleanly', () => {
      const sessionSalt = 'adv-salt-2026';
      const payload = {
        lowercasePan: 'abcde1234f',
        mixedPan: 'AbCdE5678Z',
        uppercasePan: 'ABCDE1234F',
        aadhaar: '2345 6789 0123',
        email: 'attacker@evil-corp.com'
      };

      const { sanitizedPayload, vault } = tokenize(payload, sessionSalt);
      assert.equal(vault.size, 5, 'All 5 PII instances including lowercase PAN must be tokenized in vault');
      assert.ok((sanitizedPayload.lowercasePan as string).startsWith('tok_pan_'), 'Lowercase PAN must be tokenized with tok_pan_ prefix');
      assert.ok((sanitizedPayload.mixedPan as string).startsWith('tok_pan_'), 'Mixed-case PAN must be tokenized with tok_pan_ prefix');
      assert.ok((sanitizedPayload.uppercasePan as string).startsWith('tok_pan_'), 'Uppercase PAN must be tokenized with tok_pan_ prefix');

      // Verify detokenization restores original case
      const restored = detokenize(sanitizedPayload, vault);
      assert.equal(restored.lowercasePan, 'abcde1234f');
      assert.equal(restored.mixedPan, 'AbCdE5678Z');
      assert.equal(restored.uppercasePan, 'ABCDE1234F');
    });
  });

  describe('SEC-07: Deep Nesting & Circular Denial of Service (DoS) Defense', () => {
    const testSchema: SchemaDefinition = {
      name: 'NestingAndPollutionProbeSchema',
      strict: false,
      properties: {
        nested: { type: 'object', required: false },
        name: { type: 'string', required: false },
        data: { type: 'object', required: false },
        normal: { type: 'string', required: false }
      }
    };

    it('should reject objects nested deeper than MAX_NESTING_DEPTH (32) without stack overflow', () => {
      // Build a 40-level deep nested object
      let deepObj: any = { leaf: 'malicious payload' };
      for (let i = 0; i < 40; i++) {
        deepObj = { nested: deepObj };
      }

      assert.throws(
        () => SchemaValidator.validate(testSchema, deepObj),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          const hasNestingIssue = err.issues.some(i => i.message.includes('nesting depth exceeds safety threshold'));
          assert.ok(hasNestingIssue, 'Should produce nesting depth exceeded violation');
          return true;
        }
      );
    });

    it('should safely detect and reject circular object references without crashing the engine', () => {
      const cyclicObj: any = { name: 'cyclic_probe', data: { safe: true } };
      cyclicObj.data.self = cyclicObj;

      assert.throws(
        () => SchemaValidator.validate(testSchema, cyclicObj),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          const hasCyclicIssue = err.issues.some(i => i.message.includes('Circular reference detected'));
          assert.ok(hasCyclicIssue, 'Should produce circular reference violation');
          return true;
        }
      );
    });

    it('should block prototype pollution payloads at top level and nested paths', () => {
      const pollutedPayload = JSON.parse('{"__proto__": {"polluted": true}, "normal": "test"}');
      assert.throws(
        () => SchemaValidator.validate(testSchema, pollutedPayload),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          const hasPollutionIssue = err.issues.some(i => i.message.includes('Forbidden prototype pollution key'));
          assert.ok(hasPollutionIssue, 'Should produce prototype pollution violation');
          return true;
        }
      );
    });
  });

  describe('SEC-08: Case-Insensitive Blacklist & Sanctions Enforcement', () => {
    const policyPath = path.resolve(process.cwd(), 'policies/banking-policy.json');
    const policyContract = JSON.parse(readFileSync(policyPath, 'utf-8'));
    const engine = new PolicyEngine();
    engine.registerPolicy(policyContract);

    it('should block sanctions evasion attempts via case variation (e.g. SANCTIONED-ACCT-999 vs sanctioned-acct-999)', () => {
      const evasiveIntent: IntentContext = {
        sessionId: 'adv-session-01',
        agentId: 'adv-agent-01',
        role: 'service_agent',
        tool: 'transfer_funds',
        parameters: {
          sourceAccount: 'ACC-12345',
          destinationAccount: 'sanctioned-acct-999', // Lowercase bypass attempt against 'SANCTIONED-ACCT-999'
          amount: 500,
          currency: 'USD'
        }
      };

      const evaluation = engine.evaluate(evasiveIntent);
      assert.equal(evaluation.verdict, 'BLOCKED', 'Case-varying sanctioned account must be BLOCKED');
      assert.ok(
        evaluation.matchedRules.includes('BNK-002-DENY-SANCTIONED-RECIPIENTS') ||
        evaluation.violations.some(v => v.ruleId === 'BNK-002-DENY-SANCTIONED-RECIPIENTS'),
        'Expected BNK-002-DENY-SANCTIONED-RECIPIENTS violation trace'
      );
    });

    it('should block mixed-case sanctioned account attempts (e.g. SaNcTiOnEd-AcCt-999)', () => {
      const mixedCaseIntent: IntentContext = {
        sessionId: 'adv-session-02',
        agentId: 'adv-agent-02',
        role: 'service_agent',
        tool: 'transfer_funds',
        parameters: {
          sourceAccount: 'ACC-12345',
          destinationAccount: 'SaNcTiOnEd-AcCt-999',
          amount: 100,
          currency: 'USD'
        }
      };

      const evaluation = engine.evaluate(mixedCaseIntent);
      assert.equal(evaluation.verdict, 'BLOCKED', 'Mixed-case sanctioned account must be BLOCKED');
      assert.ok(
        evaluation.matchedRules.includes('BNK-002-DENY-SANCTIONED-RECIPIENTS') ||
        evaluation.violations.some(v => v.ruleId === 'BNK-002-DENY-SANCTIONED-RECIPIENTS'),
        'Expected BNK-002-DENY-SANCTIONED-RECIPIENTS violation trace'
      );
    });
  });

  describe('SEC-09: Non-Positive, NaN, and Infinity Boundary Defense', () => {
    const amountSchema: SchemaDefinition = {
      name: 'AmountBoundarySchema',
      strict: true,
      properties: {
        amount: { type: 'number', required: true }
      }
    };

    const policyPath = path.resolve(process.cwd(), 'policies/banking-policy.json');
    const policyContract = JSON.parse(readFileSync(policyPath, 'utf-8'));
    const engine = new PolicyEngine();
    engine.registerPolicy(policyContract);

    it('should reject NaN, Infinity, and -Infinity during schema validation', () => {
      assert.throws(
        () => SchemaValidator.validate(amountSchema, { amount: NaN }),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          return true;
        }
      );

      assert.throws(
        () => SchemaValidator.validate(amountSchema, { amount: Infinity }),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          return true;
        }
      );

      assert.throws(
        () => SchemaValidator.validate(amountSchema, { amount: -Infinity }),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          return true;
        }
      );
    });

    it('should enforce BNK-000 to reject zero and negative transfer amounts', () => {
      const zeroAmountIntent: IntentContext = {
        sessionId: 'adv-session-03',
        agentId: 'adv-agent-03',
        role: 'service_agent',
        tool: 'transfer_funds',
        parameters: {
          sourceAccount: 'ACC-12345',
          destinationAccount: 'ACC-67890',
          amount: 0,
          currency: 'USD'
        }
      };

      const zeroEval = engine.evaluate(zeroAmountIntent);
      assert.equal(zeroEval.verdict, 'BLOCKED', 'Zero amount transfer must be BLOCKED by BNK-000');
      assert.ok(
        zeroEval.matchedRules.includes('BNK-000-DENY-NON-POSITIVE-AMOUNT') ||
        zeroEval.violations.some(v => v.ruleId === 'BNK-000-DENY-NON-POSITIVE-AMOUNT'),
        'Expected BNK-000 violation trace'
      );

      const negativeAmountIntent: IntentContext = {
        sessionId: 'adv-session-04',
        agentId: 'adv-agent-04',
        role: 'service_agent',
        tool: 'transfer_funds',
        parameters: {
          sourceAccount: 'ACC-12345',
          destinationAccount: 'ACC-67890',
          amount: -500,
          currency: 'USD'
        }
      };

      const negEval = engine.evaluate(negativeAmountIntent);
      assert.equal(negEval.verdict, 'BLOCKED', 'Negative amount transfer must be BLOCKED by BNK-000');
      assert.ok(
        negEval.matchedRules.includes('BNK-000-DENY-NON-POSITIVE-AMOUNT') ||
        negEval.violations.some(v => v.ruleId === 'BNK-000-DENY-NON-POSITIVE-AMOUNT'),
        'Expected BNK-000 violation trace'
      );
    });
  });
});
