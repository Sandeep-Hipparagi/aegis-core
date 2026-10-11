import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PolicyEngine } from './engine.ts';
import { ExecutionBoundary } from './executor.ts';
import type { IntentPayload, PolicyDecision, ExecutionResult, PolicyDocument } from './types.ts';

export interface GatewayConfig {
  port: number;
  host?: string;
  enableExecutionBoundary?: boolean;
}

export class AegisGatewayServer {
  private engine: PolicyEngine;
  private executor: ExecutionBoundary;
  private config: GatewayConfig;
  private server?: ReturnType<typeof createServer>;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = {
      port: config.port ?? 8080,
      host: config.host ?? '0.0.0.0',
      enableExecutionBoundary: config.enableExecutionBoundary ?? true
    };
    this.engine = new PolicyEngine();
    this.executor = new ExecutionBoundary();
  }

  public getPolicyEngine(): PolicyEngine {
    return this.engine;
  }

  public getExecutionBoundary(): ExecutionBoundary {
    return this.executor;
  }

  public loadPolicy(policyDoc: PolicyDocument): void {
    this.engine.registerPolicy(policyDoc);
  }

  /**
   * Pretty prints an inspection audit banner for intercepted tool intents
   */
  private printInspectionPayload(intent: IntentPayload, decision: PolicyDecision, execution?: ExecutionResult): void {
    const isApproved = decision.executionAllowed;
    const symbol = isApproved ? '🟢 [PASSED]' : '🔴 [BLOCKED]';

    console.log('\n================================================================');
    console.log(`🛡️  AEGIS-CORE GATEWAY INSPECTION REPORT ${symbol}`);
    console.log('================================================================');
    console.log(`Intent ID:       ${intent.intentId}`);
    console.log(`Timestamp:       ${intent.timestamp}`);
    console.log(`Agent ID:        ${intent.agent.agentId} (Role: ${intent.agent.role})`);
    console.log(`Target Tool:     ${intent.tool}`);
    console.log(`Parameters:      ${JSON.stringify(intent.parameters, null, 2)}`);
    console.log('----------------------------------------------------------------');
    console.log(`Decision Status: ${decision.status}`);
    console.log(`Decision Reason: ${decision.reason}`);
    console.log(`Matched Rules:   ${decision.matchedRules.join(', ') || 'none'}`);
    if (decision.violatedInvariants && decision.violatedInvariants.length > 0) {
      console.log('Violated Invariants:');
      for (const inv of decision.violatedInvariants) {
        console.log(`  - ⚠️  ${inv}`);
      }
    }
    if (execution) {
      console.log('----------------------------------------------------------------');
      console.log(`Execution State: ${execution.status} (${execution.durationMs}ms)`);
      console.log(`Audit Digest:    ${execution.auditDigest}`);
      if (execution.output) {
        console.log(`Output:          ${JSON.stringify(execution.output)}`);
      }
      if (execution.error) {
        console.log(`Error:           ${execution.error.code} - ${execution.error.message}`);
      }
    }
    console.log('================================================================\n');
  }

  private async parseJsonBody<T>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON payload in request body'));
        }
      });
      req.on('error', reject);
    });
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'X-AegisCore-Gateway': 'active',
      'X-AegisCore-Version': '0.1.0'
    });
    res.end(JSON.stringify(data, null, 2));
  }

  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Id'
      });
      res.end();
      return;
    }

    // Health probe
    if (url === '/health' && method === 'GET') {
      this.sendJson(res, 200, { status: 'healthy', version: '0.1.0', timestamp: new Date().toISOString() });
      return;
    }

    // Direct Intent Evaluation & Execution Gateway Endpoint
    if (url === '/v1/intent/evaluate' && method === 'POST') {
      try {
        const body = await this.parseJsonBody<Record<string, unknown>>(req);

        // Map request to standardized IntentPayload
        const intent: IntentPayload = {
          intentId: (body.intentId as string) || `int-${randomUUID()}`,
          timestamp: (body.timestamp as string) || new Date().toISOString(),
          agent: {
            agentId: ((body.agent as Record<string, unknown>)?.agentId as string) || (req.headers['x-agent-id'] as string) || 'anonymous-agent',
            role: ((body.agent as Record<string, unknown>)?.role as string) || 'autonomous-worker',
            sessionId: ((body.agent as Record<string, unknown>)?.sessionId as string) || `sess-${randomUUID()}`
          },
          tool: (body.tool as string) || 'unknown-tool',
          parameters: (body.parameters as Record<string, unknown>) || {},
          metadata: (body.metadata as Record<string, unknown>) || {}
        };

        // Step 1: Policy Engine Interception & Evaluation
        const decision = this.engine.evaluate(intent);

        // Step 2: Isolated Execution Boundary
        let execution: ExecutionResult | undefined;
        if (this.config.enableExecutionBoundary) {
          execution = await this.executor.execute(intent, decision);
        }

        // Print inspection log
        this.printInspectionPayload(intent, decision, execution);

        const responsePayload = {
          intent,
          decision,
          execution
        };

        const httpStatus = decision.executionAllowed ? 200 : 403;
        this.sendJson(res, httpStatus, responsePayload);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown gateway error';
        this.sendJson(res, 400, { error: 'BAD_REQUEST', message });
      }
      return;
    }

    // Intercept OpenAI-compatible Tool Call payload format
    if (url === '/v1/tools/execute' && method === 'POST') {
      try {
        const body = await this.parseJsonBody<{
          tool_call_id?: string;
          tool?: string;
          name?: string;
          arguments?: string | Record<string, unknown>;
          agent_id?: string;
          role?: string;
        }>(req);

        const toolName = body.tool || body.name || 'unspecified_tool';
        let parsedArgs: Record<string, unknown> = {};
        if (typeof body.arguments === 'string') {
          try {
            parsedArgs = JSON.parse(body.arguments);
          } catch {
            parsedArgs = { raw: body.arguments };
          }
        } else if (body.arguments && typeof body.arguments === 'object') {
          parsedArgs = body.arguments;
        }

        const intent: IntentPayload = {
          intentId: body.tool_call_id || `tc-${randomUUID()}`,
          timestamp: new Date().toISOString(),
          agent: {
            agentId: body.agent_id || 'openai-agent',
            role: body.role || 'assistant',
            sessionId: `sess-${randomUUID()}`
          },
          tool: toolName,
          parameters: parsedArgs
        };

        const decision = this.engine.evaluate(intent);
        const execution = await this.executor.execute(intent, decision);

        this.printInspectionPayload(intent, decision, execution);

        const httpStatus = decision.executionAllowed ? 200 : 403;
        this.sendJson(res, httpStatus, {
          tool_call_id: intent.intentId,
          verdict: decision.status,
          allowed: decision.executionAllowed,
          reason: decision.reason,
          execution: execution
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Tool proxy error';
        this.sendJson(res, 400, { error: 'TOOL_PROXY_ERROR', message });
      }
      return;
    }

    // Unmatched route
    this.sendJson(res, 404, { error: 'NOT_FOUND', message: `Route ${method} ${url} not handled by AegisCore Gateway` });
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : this.config.port;
        console.log(`[AegisCore Gateway] 🛡️  Listening on http://${this.config.host}:${actualPort}`);
        console.log(`[AegisCore Gateway] Endpoints:`);
        console.log(`  - POST /v1/intent/evaluate  (AegisCore Canonical Intent Contract)`);
        console.log(`  - POST /v1/tools/execute    (OpenAI / MCP Tool Call Interceptor)`);
        console.log(`  - GET  /health              (Liveness and Policy Status)\n`);
        resolve(actualPort);
      });

      this.server.on('error', reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
