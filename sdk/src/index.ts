import type { IntentPayload, PolicyDecision, ExecutionResult } from '../../core/src/types.ts';
export * from './openai.ts';
export * from './mcp.ts';
export * from './langgraph.ts';

export interface AegisClientOptions {
  gatewayUrl?: string;
  agentId?: string;
  role?: string;
  tenantId?: string;
}

export interface IntentEvaluationResponse {
  intent: IntentPayload;
  decision: PolicyDecision;
  execution?: ExecutionResult;
}

export class AegisClient {
  private gatewayUrl: string;
  private agentId: string;
  private role: string;
  private tenantId?: string;

  constructor(options: AegisClientOptions = {}) {
    this.gatewayUrl = options.gatewayUrl ?? 'http://127.0.0.1:8080';
    this.agentId = options.agentId ?? 'autonomous-agent-01';
    this.role = options.role ?? 'financial-operator';
    this.tenantId = options.tenantId;
  }

  /**
   * Submit an intent to the AegisCore gateway for deterministic policy verification and execution.
   */
  public async submitIntent(
    tool: string,
    parameters: Record<string, unknown>,
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
          tenantId: this.tenantId
        }
      })
    });

    if (res.status !== 200 && res.status !== 403) {
      const errText = await res.text();
      throw new Error(`AegisCore Gateway error (${res.status}): ${errText}`);
    }

    return await res.json() as IntentEvaluationResponse;
  }
}
