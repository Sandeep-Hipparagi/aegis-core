import { createInterface } from 'node:readline';
import { GatewayPipeline, type PipelineResult } from '../gateway/pipeline.ts';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface JsonRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Model Context Protocol (MCP) Stdio Server Adapter
 * Exposes AegisCore-governed tools via standard JSON-RPC 2.0 over stdio.
 */
export class McpServerAdapter {
  private pipeline: GatewayPipeline;
  private tools: Map<string, McpToolDefinition> = new Map();

  constructor(pipeline?: GatewayPipeline) {
    this.pipeline = pipeline ?? new GatewayPipeline();
  }

  public getPipeline(): GatewayPipeline {
    return this.pipeline;
  }

  public registerTool(toolDef: McpToolDefinition): void {
    this.tools.set(toolDef.name, toolDef);
  }

  /**
   * Handle an MCP JSON-RPC message directly
   */
  public async handleMessage(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: true }
            },
            serverInfo: {
              name: 'aegiscore-mcp-gateway',
              version: '0.1.0'
            }
          }
        };
      }

      case 'tools/list': {
        const toolsList = Array.from(this.tools.values());
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: toolsList
          }
        };
      }

      case 'tools/call': {
        const toolName = (params?.name as string) || '';
        const args = (params?.arguments as Record<string, unknown>) || {};

        const pipelineResult: PipelineResult = await this.pipeline.processIntent(
          {
            tool: toolName,
            parameters: args
          },
          {
            agentId: 'mcp-client',
            role: 'mcp-caller',
            sessionId: (params?._meta as Record<string, unknown>)?.sessionId as string || 'mcp-session'
          }
        );

        if (pipelineResult.status === 'BLOCKED') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `[AEGIS-CORE POLICY BLOCKED]: ${pipelineResult.reason}`
                }
              ],
              violations: pipelineResult.violations
            }
          };
        }

        if (pipelineResult.status === 'REQUIRES_HITL') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `[AEGIS-CORE REQUIRES_HITL]: Action requires human signoff. Ticket: ${pipelineResult.challenge?.ticketId}`
                }
              ],
              challenge: pipelineResult.challenge
            }
          };
        }

        if (pipelineResult.status === 'SCHEMA_ERROR') {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `[REJECTED_SCHEMA]: ${pipelineResult.reason}`
            }
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: false,
            content: [
              {
                type: 'text',
                text: JSON.stringify(pipelineResult.execution?.output ?? { status: 'SUCCESS' })
              }
            ],
            executionId: pipelineResult.execution?.executionId
          }
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method '${method}' not found`
          }
        };
    }
  }

  /**
   * Start listening on stdio streams
   */
  public startStdio(): void {
    // Redirect stdout logging to stderr to prevent JSON-RPC protocol framing corruption
    console.log = (...args: unknown[]) => {
      process.stderr.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
    };
    console.info = (...args: unknown[]) => {
      process.stderr.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
    };

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const req = JSON.parse(trimmed) as JsonRpcRequest;
        const res = await this.handleMessage(req);
        process.stdout.write(JSON.stringify(res) + '\n');
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errRes: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 0,
          error: {
            code: -32700,
            message: `Parse error: ${errMsg}`
          }
        };
        process.stdout.write(JSON.stringify(errRes) + '\n');
      }
    });
  }
}
