import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, detokenize, shredVault } from '../src/privacy/sanitizer.ts';
import { HitlInterceptor } from '../src/hitl/interceptor.ts';
import { SandboxRunner } from '../src/executor/sandboxRunner.ts';
import type { IntentPayload } from '../core/src/types.ts';

describe('DPDP-Compliant Data Sanitizer & Asynchronous HITL Interceptor', () => {

  describe('1. DPDP PII Sanitizer - Tokenization, Detokenization & Cryptographic Shredding', () => {
    const sessionSalt = 'sess-salt-mumbai-2026';

    const testCustomerPayload = {
      customerId: 'CUST-IND-991',
      panCard: 'ABCDE1234F',
      aadhaarNumber: '5432 1234 5678',
      mobilePhone: '+91 9876543210',
      alternatePhone: '9123456789',
      contactEmail: 'aditi.sharma@enterprise.in',
      notes: 'Customer submitted PAN ABCDE1234F and phone +91 9876543210 for verification.'
    };

    it('should detect and tokenize Indian PAN, Aadhaar, Phone numbers, and Emails', () => {
      const { sanitizedPayload, vault } = tokenize(testCustomerPayload, sessionSalt);

      // Verify PAN is replaced with token
      assert.notEqual(sanitizedPayload.panCard, 'ABCDE1234F');
      assert((sanitizedPayload.panCard as string).startsWith('tok_pan_'));

      // Verify Aadhaar is replaced with token
      assert.notEqual(sanitizedPayload.aadhaarNumber, '5432 1234 5678');
      assert((sanitizedPayload.aadhaarNumber as string).startsWith('tok_aadhaar_'));

      // Verify Indian phone numbers are replaced with tokens
      assert.notEqual(sanitizedPayload.mobilePhone, '+91 9876543210');
      assert((sanitizedPayload.mobilePhone as string).startsWith('tok_phone_'));
      assert((sanitizedPayload.alternatePhone as string).startsWith('tok_phone_'));

      // Verify Email is replaced with token
      assert.notEqual(sanitizedPayload.contactEmail, 'aditi.sharma@enterprise.in');
      assert((sanitizedPayload.contactEmail as string).startsWith('tok_email_'));

      // Verify free-text notes also have PII tokenized
      const sanitizedNotes = sanitizedPayload.notes as string;
      assert(!sanitizedNotes.includes('ABCDE1234F'));
      assert(!sanitizedNotes.includes('+91 9876543210'));
      assert(sanitizedNotes.includes('tok_pan_'));
      assert(sanitizedNotes.includes('tok_phone_'));

      // Verify vault holds mapping
      assert(vault.size >= 4);
      assert.equal(vault.get(sanitizedPayload.panCard as string), 'ABCDE1234F');
      assert.equal(vault.get(sanitizedPayload.aadhaarNumber as string), '5432 1234 5678');
    });

    it('should accurately detokenize and restore original payload using the private vault', () => {
      const { sanitizedPayload, vault } = tokenize(testCustomerPayload, sessionSalt);

      const restoredPayload = detokenize(sanitizedPayload, vault);

      assert.deepEqual(restoredPayload, testCustomerPayload);
      assert.equal(restoredPayload.panCard, 'ABCDE1234F');
      assert.equal(restoredPayload.aadhaarNumber, '5432 1234 5678');
      assert.equal(restoredPayload.contactEmail, 'aditi.sharma@enterprise.in');
    });

    it('should permanently disable recovery of personal data upon cryptographic vault shredding', () => {
      const { sanitizedPayload, vault } = tokenize(testCustomerPayload, sessionSalt);

      // Verify vault is populated
      assert(vault.size > 0);

      // Perform DPDP cryptographic shredding (Right to be Forgotten)
      shredVault(vault);

      assert.equal(vault.size, 0);

      // Attempting to detokenize now leaves tokens unresolvable
      const failedRestoration = detokenize(sanitizedPayload, vault);

      // Personal data is permanently gone from payload representation
      assert((failedRestoration.panCard as string).startsWith('tok_pan_'));
      assert((failedRestoration.aadhaarNumber as string).startsWith('tok_aadhaar_'));
      assert.notEqual(failedRestoration.panCard, 'ABCDE1234F');
      assert.notEqual(failedRestoration.aadhaarNumber, '5432 1234 5678');
    });
  });

  describe('2. Asynchronous Human-in-the-Loop (HITL) Interceptor', () => {
    let hitl: HitlInterceptor;
    let runner: SandboxRunner;

    const sampleHighRiskIntent: IntentPayload = {
      intentId: 'int-risk-900',
      timestamp: new Date().toISOString(),
      agent: {
        agentId: 'autonomous-agent-07',
        role: 'junior-operator',
        sessionId: 'sess-hitl-001'
      },
      tool: 'wire_high_value_settlement',
      parameters: {
        beneficiaryAccount: 'ACC-OVERSEAS-99',
        amount: 750000,
        currency: 'USD'
      }
    };

    beforeEach(() => {
      hitl = new HitlInterceptor();
      runner = new SandboxRunner();

      runner.registerTool('wire_high_value_settlement', (params) => {
        return {
          settled: true,
          amount: params.amount,
          reference: 'WIRE-OK-2026'
        };
      });
    });

    it('should create a pending challenge ticket with intent hash and active status', () => {
      const challenge = hitl.createChallenge(
        sampleHighRiskIntent,
        'Amount ($750,000) exceeds autonomous approval ceiling; requires Dual-Officer signoff.'
      );

      assert(challenge.ticketId.startsWith('hitl-'));
      assert.equal(challenge.status, 'PENDING');
      assert.equal(typeof challenge.intentHash, 'string');
      assert.equal(challenge.intentHash.length, 64);
      assert.equal(challenge.intent.intentId, sampleHighRiskIntent.intentId);
    });

    it('should transition challenge status correctly on supervisor approval and rejection', () => {
      // 1. Approval flow
      const challenge1 = hitl.createChallenge(sampleHighRiskIntent, 'High-risk wire transfer');
      const approval = hitl.resolveChallenge(
        challenge1.ticketId,
        'APPROVED',
        'sig-officer-rsa-key-8891'
      );

      assert.equal(approval.status, 'APPROVED');
      assert.equal(approval.decision, 'APPROVED');
      assert.equal(approval.approverSignature, 'sig-officer-rsa-key-8891');
      assert(approval.signedApprovalToken.length > 0);
      assert.equal(hitl.getChallenge(challenge1.ticketId)?.status, 'APPROVED');

      // 2. Rejection flow
      const challenge2 = hitl.createChallenge(sampleHighRiskIntent, 'Suspicious recipient country');
      const rejection = hitl.resolveChallenge(
        challenge2.ticketId,
        'REJECTED',
        'sig-risk-officer-992'
      );

      assert.equal(rejection.status, 'REJECTED');
      assert.equal(rejection.decision, 'REJECTED');
      assert.equal(hitl.getChallenge(challenge2.ticketId)?.status, 'REJECTED');
    });

    it('should prevent replay attacks when attempting to re-resolve an already finalized ticket', () => {
      const challenge = hitl.createChallenge(sampleHighRiskIntent, 'Dual control requirement');
      hitl.resolveChallenge(challenge.ticketId, 'APPROVED', 'sig-officer-1');

      // Second attempt to resolve must throw replay error
      assert.throws(
        () => hitl.resolveChallenge(challenge.ticketId, 'REJECTED', 'sig-officer-2'),
        (err: unknown) => {
          assert(err instanceof Error);
          assert(err.message.includes('HITL_REPLAY_ERROR'));
          return true;
        }
      );
    });

    it('should fail closed when resolving an expired ticket', async () => {
      // Create ticket with 20ms TTL
      const challenge = hitl.createChallenge(sampleHighRiskIntent, 'Urgent action', 20);

      // Wait 35ms for ticket to expire
      await new Promise(resolve => setTimeout(resolve, 35));

      // Attempt to approve expired ticket must throw
      assert.throws(
        () => hitl.resolveChallenge(challenge.ticketId, 'APPROVED', 'sig-late-officer'),
        (err: unknown) => {
          assert(err instanceof Error);
          assert(err.message.includes('HITL_EXPIRED_ERROR'));
          return true;
        }
      );

      const fetched = hitl.getChallenge(challenge.ticketId);
      assert.equal(fetched?.status, 'EXPIRED');
    });

    it('should safely execute an APPROVED HITL challenge through the SandboxRunner', async () => {
      const challenge = hitl.createChallenge(sampleHighRiskIntent, 'Exceeds autonomous cap');
      const resolution = hitl.resolveChallenge(
        challenge.ticketId,
        'APPROVED',
        'sig-compliance-director-verified'
      );

      const execResult = await hitl.executeApproved(resolution, runner);

      assert.equal(execResult.status, 'SUCCESS');
      assert.deepEqual(execResult.output, {
        settled: true,
        amount: 750000,
        reference: 'WIRE-OK-2026'
      });
    });
  });

});
