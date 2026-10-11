export interface MCPCallToolRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface MCPCallToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  _aegisMeta?: {
    intentId: string;
    status: string;
    allowed: boolean;
    reason: string;
  };
}

export class AegisMCPInterceptor {
  private gatewayUrl: string;
  private agentId: string;

  constructor(options: { gatewayUrl?: string; agentId?: string } = {}) {
    this.gatewayUrl = options.gatewayUrl ?? 'http://127.0.0.1:8080';
    this.agentId = options.agentId ?? 'mcp-client';
  }

  /**
   * Evaluates an MCP tool invocation against AegisCore invariants
   */
  public async interceptCallTool(request: MCPCallToolRequest): Promise<MCPCallToolResponse> {
    const res = await fetch(`${this.gatewayUrl}/v1/intent/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': this.agentId
      },
      body: JSON.stringify({
        tool: request.params.name,
        parameters: request.params.arguments ?? {},
        agent: {
          agentId: this.agentId,
          role: 'mcp-agent'
        }
      })
    });

    const data = await res.json() as {
      intent: { intentId: string };
      decision: { status: string; executionAllowed: boolean; reason: string };
      execution?: { status: string; output?: unknown; error?: { message: string } };
    };

    if (!data.decision.executionAllowed) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `[AEGIS-CORE GATEWAY REJECTION]: Tool call '${request.params.name}' was BLOCKED by governance enclave. Reason: ${data.decision.reason}`
          }
        ],
        _aegisMeta: {
          intentId: data.intent.intentId,
          status: data.decision.status,
          allowed: false,
          reason: data.decision.reason
        }
      };
    }

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(data.execution?.output ?? { status: 'SUCCESS' })
        }
      ],
      _aegisMeta: {
        intentId: data.intent.intentId,
        status: data.decision.status,
        allowed: true,
        reason: data.decision.reason
      }
    };
  }
}
