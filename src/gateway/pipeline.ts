import { randomUUID } from 'node:crypto';
import type { IntentPayload } from '../../core/src/types.ts';
import { SchemaValidator, type SchemaDefinition, ValidationError } from '../validator/schemaValidator.ts';
import { PolicyEngine, type PolicyContract, type ViolationTrace } from '../policy/engine.ts';
import { WormAuditLedger, type AuditEntry } from '../audit/ledger.ts';
import { SandboxRunner, type ExecutionResult, type ToolHandler } from '../executor/sandboxRunner.ts';
import { tokenize, detokenize, type TokenizeResult } from '../privacy/sanitizer.ts';
import { HitlInterceptor, type HitlChallenge } from '../hitl/interceptor.ts';

export interface RequestContext {
  sessionId?: string;
  agentId?: string;
  role?: string;
  tenantId?: string;
  sessionSalt?: string;
  scopedCredentials?: Record<string, string>;
  timeoutMs?: number;
}

export type PipelineStatus = 'SUCCESS' | 'BLOCKED' | 'REQUIRES_HITL' | 'SCHEMA_ERROR' | 'EXECUTION_FAILED';

export interface PipelineResult {
  status: PipelineStatus;
  intentId: string;
  sessionId: string;
  tool: string;
  reason?: string;
  violations?: ViolationTrace[];
  challenge?: HitlChallenge;
  execution?: ExecutionResult;
  auditEntry?: AuditEntry;
}

export interface GatewayPipelineOptions {
  policyEngine?: PolicyEngine;
  ledger?: WormAuditLedger;
  sandboxRunner?: SandboxRunner;
  hitlInterceptor?: HitlInterceptor;
}

/**
 * Unified Gateway Pipeline
 * Coordinates data sanitization, schema validation, policy invariants, WORM auditing, and sandboxed execution.
 */
export class GatewayPipeline {
  private toolSchemas: Map<string, SchemaDefinition> = new Map();
  private policyEngine: PolicyEngine;
  private ledger: WormAuditLedger;
  private sandboxRunner: SandboxRunner;
  private hitlInterceptor: HitlInterceptor;

  constructor(options: GatewayPipelineOptions = {}) {
    this.policyEngine = options.policyEngine ?? new PolicyEngine();
    this.ledger = options.ledger ?? new WormAuditLedger();
    this.sandboxRunner = options.sandboxRunner ?? new SandboxRunner();
    this.hitlInterceptor = options.hitlInterceptor ?? new HitlInterceptor();
  }

  public getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  public getLedger(): WormAuditLedger {
    return this.ledger;
  }

  public getSandboxRunner(): SandboxRunner {
    return this.sandboxRunner;
  }

  public getHitlInterceptor(): HitlInterceptor {
    return this.hitlInterceptor;
  }

  public registerToolSchema(toolName: string, schema: SchemaDefinition): void {
    this.toolSchemas.set(toolName, schema);
  }

  public registerToolHandler(toolName: string, handler: ToolHandler): void {
    this.sandboxRunner.registerTool(toolName, handler);
  }

  public registerPolicy(policy: PolicyContract): void {
    this.policyEngine.registerPolicy(policy);
  }

  /**
   * Primary entrypoint: Processes raw intent proposal through complete governance pipeline.
   */
  public async processIntent(
    rawIntent: Record<string, unknown>,
    context: RequestContext = {}
  ): Promise<PipelineResult> {
    const intentId = (rawIntent.intentId as string) || `int-${randomUUID()}`;
    const tool = (rawIntent.tool as string) || 'unspecified_tool';
    const sessionId = context.sessionId || (rawIntent.sessionId as string) || `sess-${randomUUID()}`;
    const agentId = context.agentId || (rawIntent.agentId as string) || 'anonymous-agent';
    const role = context.role || (rawIntent.role as string) || 'agent';
    const rawParams = (rawIntent.parameters as Record<string, unknown>) || {};
    const sessionSalt = context.sessionSalt || sessionId;

    // -------------------------------------------------------------
    // Step 1: DPDP PII Interception & Tokenization
    // -------------------------------------------------------------
    const { sanitizedPayload, vault } = tokenize(rawParams, sessionSalt);

    // -------------------------------------------------------------
    // Step 2: Strict Schema Validation (Fail-Closed)
    // -------------------------------------------------------------
    let effectiveParams: Record<string, unknown> = sanitizedPayload;
    const toolSchema = this.toolSchemas.get(tool);

    if (toolSchema) {
      try {
        effectiveParams = SchemaValidator.validate(toolSchema, sanitizedPayload);
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          const audit = this.ledger.append({
            sessionId,
            agentId,
            intentPayload: { tool, parameters: rawParams, intentId },
            policyVerdict: 'BLOCKED',
            violationTrace: err.issues
          });

          return {
            status: 'SCHEMA_ERROR',
            intentId,
            sessionId,
            tool,
            reason: err.message,
            auditEntry: audit
          };
        }
        throw err;
      }
    }

    // Build canonical IntentPayload
    const canonicalIntent: IntentPayload = {
      intentId,
      timestamp: new Date().toISOString(),
      agent: {
        agentId,
        role,
        sessionId,
        tenantId: context.tenantId
      },
      tool,
      parameters: effectiveParams,
      metadata: (rawIntent.metadata as Record<string, unknown>) || {}
    };

    // -------------------------------------------------------------
    // Step 3: Deterministic Invariant Policy Evaluation
    // -------------------------------------------------------------
    const policyResult = this.policyEngine.evaluate({
      intentId,
      sessionId,
      agentId,
      role,
      tool,
      parameters: effectiveParams
    });

    // -------------------------------------------------------------
    // Step 4: Branch on Policy Verdict
    // -------------------------------------------------------------

    // Verdict 4A: BLOCKED
    if (!policyResult.allowed && policyResult.verdict === 'BLOCKED') {
      const audit = this.ledger.append({
        sessionId,
        agentId,
        intentPayload: canonicalIntent,
        policyVerdict: 'BLOCKED',
        violationTrace: policyResult.violations
      });

      return {
        status: 'BLOCKED',
        intentId,
        sessionId,
        tool,
        reason: policyResult.reason,
        violations: policyResult.violations,
        auditEntry: audit
      };
    }

    // Verdict 4B: REQUIRES_HITL (Human-in-the-Loop Escalation)
    if (policyResult.verdict === 'REQUIRES_ESCALATION') {
      const audit = this.ledger.append({
        sessionId,
        agentId,
        intentPayload: canonicalIntent,
        policyVerdict: 'REQUIRES_HITL',
        violationTrace: policyResult.violations
      });

      const challenge = this.hitlInterceptor.createChallenge(
        canonicalIntent,
        policyResult.reason
      );

      return {
        status: 'REQUIRES_HITL',
        intentId,
        sessionId,
        tool,
        reason: policyResult.reason,
        challenge,
        auditEntry: audit
      };
    }

    // Verdict 4C: APPROVED -> Sandbox Boundary Execution
    const audit = this.ledger.append({
      sessionId,
      agentId,
      intentPayload: canonicalIntent,
      policyVerdict: 'APPROVED'
    });

    const execution = await this.sandboxRunner.run({
      tool,
      parameters: effectiveParams,
      policyVerdict: 'APPROVED',
      scopedCredentials: context.scopedCredentials,
      timeoutMs: context.timeoutMs
    });

    // Detokenize execution output if it produced structured results
    let detokenizedOutput = execution.output;
    if (execution.output !== null && typeof execution.output === 'object' && !Array.isArray(execution.output)) {
      detokenizedOutput = detokenize(execution.output as Record<string, unknown>, vault);
    }

    const finalExecution: ExecutionResult = {
      ...execution,
      output: detokenizedOutput
    };

    return {
      status: execution.status === 'SUCCESS' ? 'SUCCESS' : 'EXECUTION_FAILED',
      intentId,
      sessionId,
      tool,
      execution: finalExecution,
      auditEntry: audit
    };
  }
}
