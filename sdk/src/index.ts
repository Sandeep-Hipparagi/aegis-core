import { randomUUID } from 'node:crypto';
export * from './types.ts';
export * from './openai.ts';
export * from './mcp.ts';
export * from './langgraph.ts';
import type { 
  IntentEvaluationResponse, 
  DispatchOptions, 
  DispatchResult, 
  AuditIntegrityResult, 
  HealthCheckResponse 
} from './types.ts';

export interface AegisClientOptions {
  gatewayUrl?: string;
  baseUrl?: string;
  agentId?: string;
  role?: string;
  tenantId?: string;
  sessionId?: string;
}

export class AegisClient {
  private gatewayUrl: string;
  private agentId: string;
  private role: string;
  private tenantId?: string;
  private sessionId: string;

  constructor(options: AegisClientOptions = {}) {
    this.gatewayUrl = (options.gatewayUrl ?? options.baseUrl ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
    this.agentId = options.agentId ?? 'autonomous-agent-01';
    this.role = options.role ?? 'financial-operator';
    this.tenantId = options.tenantId;
    this.sessionId = options.sessionId ?? `sess-${randomUUID()}`;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Submit an intent to the AegisCore gateway for deterministic policy verification and execution.
   */
  public async submitIntent(
    tool: string,
    parameters: Record<string, unknown> = {},
    metadata?: Record<string, unknown>
  ): Promise<IntentEvaluationResponse> {
    const res = await fetch(`${this.gatewayUrl}/v1/intent/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': this.agentId
      },
      body: JSON.stringify({
        tool,
        parameters,
        metadata,
        agent: {
          agentId: this.agentId,
          role: this.role,
          tenantId: this.tenantId,
          sessionId: this.sessionId
        }
      })
    });

    if (res.status !== 200 && res.status !== 403) {
      const errText = await res.text();
      throw new Error(`AegisCore Gateway error (${res.status}): ${errText}`);
    }

    return await res.json() as IntentEvaluationResponse;
  }

  /**
   * Canonical gateway dispatch method (parity with Python SDK dispatch)
   */
  public async dispatch(
    tool: string,
    parameters: Record<string, unknown> = {},
    options: DispatchOptions = {}
  ): Promise<DispatchResult> {
    const sid = options.sessionId ?? this.sessionId;
    const aid = options.agentId ?? this.agentId;
    const r = options.role ?? this.role;

    const res = await fetch(`${this.gatewayUrl}/v1/gateway/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': aid
      },
      body: JSON.stringify({
        tool,
        parameters,
        metadata: options.metadata ?? {},
        context: {
          sessionId: sid,
          agentId: aid,
          role: r,
          tenantId: this.tenantId
        }
      })
    });

    const raw = await res.json() as Record<string, unknown>;
    const status = (raw.status as string) || 'UNKNOWN';

    const result: DispatchResult = {
      status,
      intentId: raw.intentId as string | undefined,
      sessionId: sid,
      tool,
      reason: raw.reason as string | undefined,
      output: (raw.execution as Record<string, unknown> | undefined)?.output,
      violations: raw.violations as Array<Record<string, unknown>> | undefined,
      challenge: raw.challenge as Record<string, unknown> | undefined,
      auditEntry: raw.auditEntry as Record<string, unknown> | undefined,
      raw,
      isSuccess: status === 'SUCCESS',
      isBlocked: status === 'BLOCKED',
      requiresHitl: status === 'REQUIRES_HITL',
      ticketId: (raw.challenge as Record<string, unknown> | undefined)?.ticketId as string | undefined
    };

    if (options.raiseOnBlocked && status === 'BLOCKED') {
      throw new Error(`Tool invocation '${tool}' was BLOCKED: ${raw.reason}`);
    }

    return result;
  }

  /**
   * Resolve an asynchronous Human-in-the-Loop challenge ticket
   */
  public async resolveHitl(
    ticketId: string,
    decision: 'APPROVED' | 'REJECTED' = 'APPROVED',
    approverSignature = 'sig-supervisor-approval',
    scopedCredentials?: Record<string, string>
  ): Promise<unknown> {
    const res = await fetch(`${this.gatewayUrl}/v1/hitl/challenges/${ticketId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision,
        approverSignature,
        scopedCredentials: scopedCredentials ?? {}
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to resolve HITL challenge ${ticketId} (${res.status}): ${errText}`);
    }

    return await res.json();
  }

  /**
   * Verify cryptographic WORM ledger Merkle chain integrity
   */
  public async verifyAuditIntegrity(): Promise<AuditIntegrityResult> {
    const res = await fetch(`${this.gatewayUrl}/v1/audit/integrity`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to verify audit integrity (${res.status}): ${errText}`);
    }
    return await res.json() as AuditIntegrityResult;
  }

  /**
   * Check gateway daemon health status
   */
  public async health(): Promise<HealthCheckResponse> {
    const res = await fetch(`${this.gatewayUrl}/health`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Health check failed (${res.status}): ${errText}`);
    }
    return await res.json() as HealthCheckResponse;
  }
}
