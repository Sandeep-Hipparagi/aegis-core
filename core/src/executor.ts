import { createHash, randomUUID } from 'node:crypto';
import type { IntentPayload, PolicyDecision, ExecutionResult } from './types.ts';

export type ToolHandler = (params: Record<string, unknown>, context: IntentPayload) => Promise<unknown> | unknown;

export class ExecutionBoundary {
  private toolRegistry: Map<string, ToolHandler> = new Map();

  /**
   * Register a safe execution handler for a specific tool in the isolated boundary
   */
  public registerToolHandler(toolName: string, handler: ToolHandler): void {
    this.toolRegistry.set(toolName, handler);
  }

  /**
   * Compute a cryptographic SHA-256 digest of intent, decision, and output
   */
  private computeAuditDigest(intent: IntentPayload, decision: PolicyDecision, output: unknown, status: string): string {
    const payload = JSON.stringify({
      intentId: intent.intentId,
      tool: intent.tool,
      parameters: intent.parameters,
      decisionId: decision.decisionId,
      decisionStatus: decision.status,
      executionStatus: status,
      output
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Execute an intent under strict enclave isolation
   */
  public async execute(intent: IntentPayload, decision: PolicyDecision): Promise<ExecutionResult> {
    const executionId = `exec-${randomUUID()}`;
    const startTime = Date.now();

    // Guard: Refuse execution if policy did not approve
    if (!decision.executionAllowed) {
      const digest = this.computeAuditDigest(intent, decision, null, 'BLOCKED');
      return {
        executionId,
        intentId: intent.intentId,
        decisionId: decision.decisionId,
        status: 'BLOCKED',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        error: {
          code: 'POLICY_EXECUTION_PROHIBITED',
          message: decision.reason,
          details: {
            violatedInvariants: decision.violatedInvariants,
            matchedRules: decision.matchedRules
          }
        },
        auditDigest: digest
      };
    }

    const handler = this.toolRegistry.get(intent.tool);
    if (!handler) {
      const digest = this.computeAuditDigest(intent, decision, null, 'FAILURE');
      return {
        executionId,
        intentId: intent.intentId,
        decisionId: decision.decisionId,
        status: 'FAILURE',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        error: {
          code: 'TOOL_HANDLER_NOT_FOUND',
          message: `No isolated execution handler registered for tool: ${intent.tool}`
        },
        auditDigest: digest
      };
    }

    try {
      const paramsToPass = decision.sanitizedParameters || intent.parameters;
      const output = await handler(paramsToPass, intent);
      const durationMs = Date.now() - startTime;
      const digest = this.computeAuditDigest(intent, decision, output, 'SUCCESS');

      return {
        executionId,
        intentId: intent.intentId,
        decisionId: decision.decisionId,
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
        durationMs,
        output,
        auditDigest: digest
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const digest = this.computeAuditDigest(intent, decision, null, 'FAILURE');

      return {
        executionId,
        intentId: intent.intentId,
        decisionId: decision.decisionId,
        status: 'FAILURE',
        timestamp: new Date().toISOString(),
        durationMs,
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: errorMessage
        },
        auditDigest: digest
      };
    }
  }
}
