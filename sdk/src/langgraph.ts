export interface LangGraphToolLike {
  name: string;
  description: string;
  invoke: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export class AegisLangGraphWrapper {
  private gatewayUrl: string;
  private agentId: string;

  constructor(options: { gatewayUrl?: string; agentId?: string } = {}) {
    this.gatewayUrl = options.gatewayUrl ?? 'http://127.0.0.1:8080';
    this.agentId = options.agentId ?? 'langgraph-agent';
  }

  /**
   * Wrap any standard LangGraph / LangChain tool into a zero-trust governed tool
   */
  public wrapTool<T extends LangGraphToolLike>(tool: T): T {
    const originalInvoke = tool.invoke.bind(tool);
    const gatewayUrl = this.gatewayUrl;
    const agentId = this.agentId;

    const wrappedInvoke = async (args: Record<string, unknown>): Promise<unknown> => {
      // Step 1: Pre-flight governance check with AegisCore Gateway
      const res = await fetch(`${gatewayUrl}/v1/intent/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: tool.name,
          parameters: args,
          agent: {
            agentId,
            role: 'langgraph-workflow-node'
          }
        })
      });

      const result = await res.json() as {
        decision: { executionAllowed: boolean; status: string; reason: string; sanitizedParameters?: Record<string, unknown> };
      };

      if (!result.decision.executionAllowed) {
        throw new Error(`[AegisCore Policy Rejection]: ${result.decision.reason} (Status: ${result.decision.status})`);
      }

      // Step 2: Safe execution with sanitized parameters if policy approved
      const effectiveArgs = result.decision.sanitizedParameters || args;
      return await originalInvoke(effectiveArgs);
    };

    return {
      ...tool,
      invoke: wrappedInvoke
    };
  }
}
