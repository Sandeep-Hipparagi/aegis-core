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

export class AegisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AegisError';
    Object.setPrototypeOf(this, AegisError.prototype);
  }
}

export class AegisGatewayError extends AegisError {
  public readonly statusCode?: number;
  public readonly responseBody?: string;
  constructor(message: string, statusCode?: number, responseBody?: string) {
    super(message);
    this.name = 'AegisGatewayError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    Object.setPrototypeOf(this, AegisGatewayError.prototype);
  }
}

export class AegisPolicyBlockedError extends AegisError {
  public readonly violations: Array<Record<string, unknown>>;
  public readonly rawResult: Record<string, unknown>;
  constructor(message: string, violations: Array<Record<string, unknown>> = [], rawResult: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AegisPolicyBlockedError';
    this.violations = violations;
    this.rawResult = rawResult;
    Object.setPrototypeOf(this, AegisPolicyBlockedError.prototype);
  }
}

export class AegisSchemaError extends AegisError {
  public readonly issues: Array<Record<string, unknown>>;
  public readonly rawResult: Record<string, unknown>;
  constructor(message: string, issues: Array<Record<string, unknown>> = [], rawResult: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AegisSchemaError';
    this.issues = issues;
    this.rawResult = rawResult;
    Object.setPrototypeOf(this, AegisSchemaError.prototype);
  }
}

export class AegisHitlRequiredError extends AegisError {
  public readonly ticketId: string;
  public readonly challenge: Record<string, unknown>;
  constructor(message: string, ticketId: string, challenge: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AegisHitlRequiredError';
    this.ticketId = ticketId;
    this.challenge = challenge;
    Object.setPrototypeOf(this, AegisHitlRequiredError.prototype);
  }
}

