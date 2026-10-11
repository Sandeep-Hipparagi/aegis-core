import { randomUUID, createHmac, createHash } from 'node:crypto';
import type { IntentPayload } from '../../core/src/types.ts';
import { hashPayload } from '../audit/ledger.ts';
import { SandboxRunner, type ExecutionResult } from '../executor/sandboxRunner.ts';

export type ChallengeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface HitlChallenge {
  ticketId: string;
  intentHash: string;
  intent: IntentPayload;
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: ChallengeStatus;
}

export interface HitlResolution {
  ticketId: string;
  decision: 'APPROVED' | 'REJECTED';
  approverSignature: string;
  resolvedAt: string;
  status: 'APPROVED' | 'REJECTED';
  intent: IntentPayload;
  signedApprovalToken: string;
}

export interface HitlInterceptorOptions {
  defaultTtlMs?: number;
  signingSecret?: string;
}

/**
 * Asynchronous Human-in-the-Loop (HITL) Interceptor
 * Governs high-risk, escalated agent actions with cryptographic ticket validation and TTL enforcement.
 */
export class HitlInterceptor {
  private challenges: Map<string, HitlChallenge> = new Map();
  private resolutions: Map<string, HitlResolution> = new Map();
  private defaultTtlMs: number;
  private signingSecret: string;

  constructor(options: HitlInterceptorOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 300_000; // 5 minutes default TTL
    this.signingSecret = options.signingSecret ?? 'aegis-core-hitl-enclave-secret-key';
  }

  /**
   * Create an asynchronous approval challenge for an action requiring human sign-off
   */
  public createChallenge(
    intent: IntentPayload,
    reason: string,
    ttlMs?: number
  ): HitlChallenge {
    const ticketId = `hitl-${randomUUID()}`;
    const intentHash = hashPayload(intent);
    const now = Date.now();
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;

    const challenge: HitlChallenge = {
      ticketId,
      intentHash,
      intent,
      reason,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + effectiveTtl).toISOString(),
      status: 'PENDING'
    };

    this.challenges.set(ticketId, challenge);
    return challenge;
  }

  /**
   * Retrieve a challenge by its ticket ID, evaluating real-time expiration
   */
  public getChallenge(ticketId: string): HitlChallenge | undefined {
    const challenge = this.challenges.get(ticketId);
    if (!challenge) return undefined;

    // Evaluate dynamic expiration if still pending
    if (challenge.status === 'PENDING') {
      const now = Date.now();
      const expiresAtMs = new Date(challenge.expiresAt).getTime();
      if (now > expiresAtMs) {
        challenge.status = 'EXPIRED';
      }
    }

    return challenge;
  }

  /**
   * Resolve a pending challenge with a human supervisor signature.
   * Enforces TTL expiration guards and replay prevention.
   */
  public resolveChallenge(
    ticketId: string,
    decision: 'APPROVED' | 'REJECTED',
    approverSignature: string
  ): HitlResolution {
    const challenge = this.getChallenge(ticketId);
    if (!challenge) {
      throw new Error(`[HITL_ERROR] Challenge ticket '${ticketId}' not found.`);
    }

    // 1. Replay prevention: Cannot re-resolve an already finalized ticket
    if (this.resolutions.has(ticketId) || challenge.status === 'APPROVED' || challenge.status === 'REJECTED') {
      throw new Error(`[HITL_REPLAY_ERROR] Ticket '${ticketId}' has already been resolved and cannot be re-evaluated.`);
    }

    // 2. TTL Expiration Check: Expired tickets fail closed
    const now = Date.now();
    const expiresAtMs = new Date(challenge.expiresAt).getTime();
    if (now > expiresAtMs || challenge.status === 'EXPIRED') {
      challenge.status = 'EXPIRED';
      throw new Error(`[HITL_EXPIRED_ERROR] Ticket '${ticketId}' expired at ${challenge.expiresAt}. Cannot be approved.`);
    }

    // 3. Signature verification check
    if (!approverSignature || approverSignature.trim().length === 0) {
      throw new Error(`[HITL_AUTH_ERROR] Approver signature is required to authorize ticket '${ticketId}'.`);
    }

    const resolvedAt = new Date().toISOString();

    // 4. Generate cryptographic approval authorization token
    const signedApprovalToken = createHmac('sha256', this.signingSecret)
      .update(`${ticketId}:${challenge.intentHash}:${decision}:${approverSignature}:${resolvedAt}`)
      .digest('hex');

    challenge.status = decision;

    const resolution: HitlResolution = {
      ticketId,
      decision,
      approverSignature,
      resolvedAt,
      status: decision,
      intent: challenge.intent,
      signedApprovalToken
    };

    this.resolutions.set(ticketId, resolution);
    return resolution;
  }

  /**
   * Verify cryptographic validity of an approval resolution token
   */
  public verifyResolution(resolution: HitlResolution): boolean {
    const expectedToken = createHmac('sha256', this.signingSecret)
      .update(`${resolution.ticketId}:${hashPayload(resolution.intent)}:${resolution.decision}:${resolution.approverSignature}:${resolution.resolvedAt}`)
      .digest('hex');
    return expectedToken === resolution.signedApprovalToken;
  }

  /**
   * Dispatch an approved HITL resolution to the sandbox runner
   */
  public async executeApproved(
    resolution: HitlResolution,
    runner: SandboxRunner,
    scopedCredentials?: Record<string, string>
  ): Promise<ExecutionResult> {
    if (resolution.status !== 'APPROVED' || resolution.decision !== 'APPROVED') {
      throw new Error(`[HITL_DISPATCH_DENIED] Cannot execute ticket '${resolution.ticketId}' with status '${resolution.status}'.`);
    }

    if (!this.verifyResolution(resolution)) {
      throw new Error(`[HITL_TAMPER_DETECTED] Cryptographic signature verification failed for ticket '${resolution.ticketId}'.`);
    }

    return await runner.run({
      tool: resolution.intent.tool,
      parameters: resolution.intent.parameters,
      policyVerdict: 'APPROVED',
      scopedCredentials
    });
  }
}
