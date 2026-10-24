/// <reference types="node" />
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { GatewayPipeline, type RequestContext, type PipelineResult } from './gateway/pipeline.ts';
import { WormAuditLedger } from './audit/ledger.ts';
import type { ToolHandler, ExecutionResult } from './executor/sandboxRunner.ts';
import type { SchemaDefinition } from './validator/schemaValidator.ts';
import type { PolicyContract } from './policy/engine.ts';
import type { IntentPayload, PolicyDecision } from '../core/src/types.ts';

export interface HttpServerOptions {
  port?: number;
  host?: string;
  pipeline?: GatewayPipeline;
  policiesDir?: string;
  ledgerPath?: string;
}

export class AegisHttpServer {
  private server?: ReturnType<typeof createServer>;
  private pipeline: GatewayPipeline;
  private port: number;
  private host: string;

  constructor(options: HttpServerOptions = {}) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? '0.0.0.0';
    const ledger = options.ledgerPath ? new WormAuditLedger({ storagePath: options.ledgerPath }) : undefined;
    this.pipeline = options.pipeline ?? new GatewayPipeline(ledger ? { ledger } : {});

    if (options.policiesDir) {
      this.loadPoliciesFromDir(options.policiesDir);
    }
  }

  public getPipeline(): GatewayPipeline {
    return this.pipeline;
  }

  public loadPolicy(policy: PolicyContract | Record<string, unknown>): void {
    this.pipeline.registerPolicy(policy as PolicyContract);
  }

  public registerToolHandler(toolName: string, handler: ToolHandler): void {
    this.pipeline.registerToolHandler(toolName, handler);
  }

  public registerToolSchema(toolName: string, schema: SchemaDefinition): void {
    this.pipeline.registerToolSchema(toolName, schema);
  }

  /**
   * Auto-discover and register all JSON policy files from a directory
   */
  public loadPoliciesFromDir(dirPath: string): number {
    const fullPath = resolve(dirPath);
    if (!existsSync(fullPath)) return 0;

    let count = 0;
    const files = readdirSync(fullPath);
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'schema.json') {
        try {
          const content = JSON.parse(readFileSync(join(fullPath, file), 'utf-8'));
          if (content.rules && Array.isArray(content.rules)) {
            this.pipeline.registerPolicy(content);
            count++;
          }
        } catch (err) {
          console.warn(`[AegisHttpServer] Skipping malformed policy file '${file}':`, err);
        }
      }
    }
    return count;
  }

  private async parseJson<T>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(new Error('Malformed JSON request body'));
        }
      });
      req.on('error', reject);
    });
  }

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, {
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

    // Health check
    if (url === '/health' && method === 'GET') {
      this.sendJson(res, 200, { status: 'healthy', version: '0.1.2' });
      return;
    }

    // Audit Chain Integrity Verification
    if (url === '/v1/audit/integrity' && method === 'GET') {
      const integrity = this.pipeline.getLedger().verifyChainIntegrity();
      this.sendJson(res, 200, integrity);
      return;
    }

    // Canonical Gateway Dispatch
    if (url === '/v1/gateway/dispatch' && method === 'POST') {
      try {
        const body = await this.parseJson<{
          tool: string;
          parameters?: Record<string, unknown>;
          intentId?: string;
          context?: RequestContext;
          sessionId?: string;
          agentId?: string;
          role?: string;
        }>(req);

        const context: RequestContext = {
          ...body.context,
          sessionId: body.context?.sessionId || body.sessionId,
          agentId: body.context?.agentId || body.agentId,
          role: body.context?.role || body.role
        };

        const result = await this.pipeline.processIntent(body, context);

        let httpStatus = 200;
        if (result.status === 'BLOCKED') httpStatus = 403;
        else if (result.status === 'SCHEMA_ERROR') httpStatus = 400;
        else if (result.status === 'EXECUTION_FAILED') httpStatus = 500;

        this.sendJson(res, httpStatus, result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.sendJson(res, 400, { error: 'BAD_REQUEST', message });
      }
      return;
    }

    // SDK Route Bridge: POST /v1/intent/evaluate
    // Evaluates policy and executes if approved, returning canonical IntentEvaluationResponse
    if (url === '/v1/intent/evaluate' && method === 'POST') {
      try {
        const body = await this.parseJson<Record<string, unknown>>(req);

        const agentObj = (body.agent as Record<string, unknown>) || {};
        const agentId = (agentObj.agentId as string) || (req.headers['x-agent-id'] as string) || 'anonymous-agent';
        const role = (agentObj.role as string) || 'operator';
        const sessionId = (agentObj.sessionId as string) || `sess-${randomUUID()}`;
        const intentId = (body.intentId as string) || `int-${randomUUID()}`;
        const tool = (body.tool as string) || 'unspecified_tool';
        const rawParams = (body.parameters as Record<string, unknown>) || {};
        const metadata = (body.metadata as Record<string, unknown>) || {};

        const context: RequestContext = {
          sessionId,
          agentId,
          role,
          tenantId: agentObj.tenantId as string | undefined
        };

        // Run through GatewayPipeline
        const pipelineResult = await this.pipeline.processIntent(
          {
            intentId,
            tool,
            parameters: rawParams,
            metadata
          },
          context
        );

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
          parameters: rawParams,
          metadata
        };

        const decision: PolicyDecision = {
          decisionId: `dec-${randomUUID()}`,
          intentId,
          timestamp: new Date().toISOString(),
          status: pipelineResult.status === 'SUCCESS' ? 'APPROVED' : 
                  pipelineResult.status === 'REQUIRES_HITL' ? 'REQUIRES_ESCALATION' : 'BLOCKED',
          reason: pipelineResult.reason || (pipelineResult.status === 'SUCCESS' ? 'Action validated and approved' : 'Action blocked'),
          matchedRules: pipelineResult.violations?.map(v => v.ruleId) || [],
          violatedInvariants: pipelineResult.violations?.map(v => v.message) || [],
          executionAllowed: pipelineResult.status === 'SUCCESS'
        };

        const responsePayload = {
          intent: canonicalIntent,
          decision,
          execution: pipelineResult.execution
        };

        const httpStatus = decision.executionAllowed ? 200 : 403;
        this.sendJson(res, httpStatus, responsePayload);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.sendJson(res, 400, { error: 'BAD_REQUEST', message });
      }
      return;
    }

    // SDK Route Bridge: POST /v1/tools/execute
    // OpenAI tool-call interceptor endpoint
    if (url === '/v1/tools/execute' && method === 'POST') {
      try {
        const body = await this.parseJson<{
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

        const agentId = body.agent_id || (req.headers['x-agent-id'] as string) || 'openai-agent';
        const role = body.role || 'assistant';
        const toolCallId = body.tool_call_id || `tc-${randomUUID()}`;

        const pipelineResult = await this.pipeline.processIntent(
          {
            intentId: toolCallId,
            tool: toolName,
            parameters: parsedArgs
          },
          {
            agentId,
            role,
            sessionId: `sess-${randomUUID()}`
          }
        );

        const isAllowed = pipelineResult.status === 'SUCCESS';
        const httpStatus = isAllowed ? 200 : 403;

        this.sendJson(res, httpStatus, {
          tool_call_id: toolCallId,
          verdict: isAllowed ? 'APPROVED' : pipelineResult.status,
          allowed: isAllowed,
          reason: pipelineResult.reason || (isAllowed ? 'Permitted by deterministic policy' : 'Policy invariant violation'),
          execution: pipelineResult.execution
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.sendJson(res, 400, { error: 'TOOL_PROXY_ERROR', message });
      }
      return;
    }

    // Resolve HITL Challenge: POST /v1/hitl/challenges/:ticketId/resolve
    const hitlMatch = url.match(/^\/v1\/hitl\/challenges\/([^/]+)\/resolve$/);
    if (hitlMatch && method === 'POST') {
      const ticketId = hitlMatch[1];
      try {
        const body = await this.parseJson<{
          decision: 'APPROVED' | 'REJECTED';
          approverSignature: string;
          scopedCredentials?: Record<string, string>;
        }>(req);

        const hitl = this.pipeline.getHitlInterceptor();
        const resolution = hitl.resolveChallenge(
          ticketId,
          body.decision,
          body.approverSignature
        );

        let executionResult: unknown = null;
        if (resolution.status === 'APPROVED') {
          executionResult = await hitl.executeApproved(
            resolution,
            this.pipeline.getSandboxRunner(),
            body.scopedCredentials
          );

          // Record approved execution to ledger
          this.pipeline.getLedger().append({
            sessionId: resolution.intent.agent.sessionId,
            agentId: resolution.intent.agent.agentId,
            intentPayload: resolution.intent,
            policyVerdict: 'APPROVED'
          });
        }

        this.sendJson(res, 200, {
          resolution,
          execution: executionResult
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const statusCode = message.includes('not found') ? 404 : 400;
        this.sendJson(res, statusCode, { error: 'HITL_RESOLUTION_ERROR', message });
      }
      return;
    }

    // 404 Not Found
    this.sendJson(res, 404, { error: 'NOT_FOUND', message: `Route ${method} ${url} not recognized by AegisCore Gateway` });
  }

  public async start(port?: number): Promise<number> {
    const targetPort = port ?? this.port;

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.listen(targetPort, this.host, () => {
        const addr = this.server?.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : targetPort;
        this.port = actualPort;
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
