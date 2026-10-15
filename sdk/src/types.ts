/**
 * AegisCore SDK Data Contracts & Types
 * Lightweight, zero-dependency client types for AegisCore governance gateway.
 */

export type ActionCategory = 'READ' | 'WRITE' | 'EXECUTE' | 'TRANSFER' | 'DELETE' | 'ADMIN';

export type GovernanceDecisionStatus = 'APPROVED' | 'BLOCKED' | 'REQUIRES_ESCALATION';

export type ExecutionStatus = 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'SIMULATED';

export interface AgentContext {
  agentId: string;
  role: string;
  tenantId?: string;
  sessionId?: string;
  callerPrincipal?: string;
  riskTier?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface IntentPayload {
  intentId: string;
  timestamp: string; // ISO 8601
  agent: AgentContext;
  tool: string;
  actionCategory?: ActionCategory;
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PolicyDecision {
  decisionId: string;
  intentId: string;
  timestamp: string;
  status: GovernanceDecisionStatus;
  reason: string;
  matchedRules: string[];
  violatedInvariants?: string[];
  sanitizedParameters?: Record<string, unknown>;
  executionAllowed: boolean;
}

export interface ExecutionResult {
  executionId: string;
  intentId: string;
  decisionId: string;
  status: ExecutionStatus;
  timestamp: string;
  durationMs: number;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  auditDigest: string;
}

export interface EvaluateIntentRequest {
  tool: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  agent?: Partial<AgentContext>;
}

export interface IntentEvaluationResponse {
  intent: IntentPayload;
  decision: PolicyDecision;
  execution?: ExecutionResult;
}

export type EvaluateIntentResponse = IntentEvaluationResponse;

export interface DispatchOptions {
  sessionId?: string;
  agentId?: string;
  role?: string;
  metadata?: Record<string, unknown>;
  raiseOnBlocked?: boolean;
}

export interface DispatchResult {
  status: 'SUCCESS' | 'BLOCKED' | 'REQUIRES_HITL' | 'SCHEMA_ERROR' | 'EXECUTION_FAILED' | string;
  intentId?: string;
  sessionId?: string;
  tool?: string;
  reason?: string;
  output?: unknown;
  violations?: Array<Record<string, unknown>>;
  challenge?: Record<string, unknown>;
  auditEntry?: Record<string, unknown>;
  raw: Record<string, unknown>;
  isSuccess: boolean;
  isBlocked: boolean;
  requiresHitl: boolean;
  ticketId?: string;
}

export interface AuditIntegrityResult {
  isValid: boolean;
  brokenAtIndex?: number;
  reason?: string;
}

export interface HealthCheckResponse {
  status: string;
  version: string;
}

