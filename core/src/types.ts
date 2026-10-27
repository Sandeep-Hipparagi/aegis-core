/**
 * AegisCore Data Contracts & Governance Types
 * Defines the strict, deterministic boundaries for agent intent evaluation and execution.
 */

export type ActionCategory = 'READ' | 'WRITE' | 'EXECUTE' | 'TRANSFER' | 'DELETE' | 'ADMIN';

export type GovernanceDecisionStatus = 'APPROVED' | 'BLOCKED' | 'REQUIRES_ESCALATION';

export type ExecutionStatus = 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'SIMULATED';

export interface AgentContext {
  agentId: string;
  role: string;
  tenantId?: string;
  sessionId: string;
  callerPrincipal?: string;
  riskTier?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Data Contract: IntentPayload
 * Represents the agent's raw desire/proposal to execute an external tool or action.
 */
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

/**
 * Condition evaluation operators
 */
export type Operator = 
  | 'EQUALS' 
  | 'NOT_EQUALS' 
  | 'GREATER_THAN' 
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL' 
  | 'LESS_THAN' 
  | 'IN' 
  | 'NOT_IN' 
  | 'MATCHES_REGEX' 
  | 'CONTAINS';

export interface InvariantCondition {
  field: string;
  operator: Operator;
  value: unknown;
  description?: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  targetTools: string[] | '*';
  effect: 'ALLOW' | 'DENY' | 'ESCALATE';
  conditions: InvariantCondition[];
  priority: number; // Higher number = higher precedence
}

export type InvariantRule = PolicyRule;

export interface PolicyDocument {
  version: string;
  policyNamespace: string;
  description: string;
  defaultEffect: 'ALLOW' | 'DENY';
  rules: PolicyRule[];
}

/**
 * Data Contract: PolicyDecision
 * The deterministic evaluation verdict reached by the Policy Enclave.
 */
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

/**
 * Data Contract: ExecutionResult
 * The outcome emitted by the isolated execution boundary.
 */
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
  auditDigest: string; // Cryptographic SHA256 digest of Intent + Decision + Output
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
