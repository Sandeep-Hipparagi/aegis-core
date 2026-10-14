import type { IntentPayload, PolicyDecision, ExecutionResult } from './types.ts';

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface OpenAIToolCallResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string; // JSON string response or error
  aegisGovernance: {
    verdict: string;
    allowed: boolean;
    reason: string;
    auditDigest?: string;
  };
}

export class AegisOpenAIInterceptor {
  private gatewayUrl: string;
  private agentId: string;
  private role: string;

  constructor(options: { gatewayUrl?: string; agentId?: string; role?: string } = {}) {
    this.gatewayUrl = options.gatewayUrl ?? 'http://127.0.0.1:8080';
    this.agentId = options.agentId ?? 'openai-agent';
    this.role = options.role ?? 'autonomous-assistant';
  }

  /**
   * Intercept and govern an OpenAI tool call through AegisCore
   */
  public async interceptToolCall(toolCall: OpenAIToolCall): Promise<OpenAIToolCallResult> {
    const res = await fetch(`${this.gatewayUrl}/v1/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': this.agentId
      },
      body: JSON.stringify({
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        agent_id: this.agentId,
        role: this.role
      })
    });

    const data = await res.json() as {
      tool_call_id: string;
      verdict: string;
      allowed: boolean;
      reason: string;
      execution?: ExecutionResult;
    };

    if (!data.allowed) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: JSON.stringify({
          error: 'AEGIS_GOVERNANCE_BLOCKED',
          verdict: data.verdict,
          message: data.reason
        }),
        aegisGovernance: {
          verdict: data.verdict,
          allowed: false,
          reason: data.reason,
          auditDigest: data.execution?.auditDigest
        }
      };
    }

    return {
      tool_call_id: toolCall.id,
      role: 'tool',
      name: toolCall.function.name,
      content: JSON.stringify(data.execution?.output ?? { status: 'OK' }),
      aegisGovernance: {
        verdict: data.verdict,
        allowed: true,
        reason: data.reason,
        auditDigest: data.execution?.auditDigest
      }
    };
  }
}
