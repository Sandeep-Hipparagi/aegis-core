import { randomUUID } from 'node:crypto';

export type ToolExecutionStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'POLICY_BLOCKED';

export interface ExecutionResult {
  executionId: string;
  status: ToolExecutionStatus;
  output?: unknown;
  error?: {
    code: string;
    message: string;
  };
  durationMs: number;
  timestamp: string;
}

export interface SandboxContext {
  executionId: string;
  tool: string;
  sanitizedEnv: Readonly<Record<string, string>>;
  signal: AbortSignal;
}

export type ToolHandler = (
  parameters: Record<string, unknown>,
  context: SandboxContext
) => Promise<unknown> | unknown;

export interface ToolExecutionRequest {
  tool: string;
  parameters: Record<string, unknown>;
  policyVerdict: 'APPROVED' | 'BLOCKED' | 'REQUIRES_HITL';
  scopedCredentials?: Record<string, string>;
  timeoutMs?: number;
}

export interface SandboxRunnerOptions {
  defaultTimeoutMs?: number;
  allowedEnvKeys?: string[];
}

/**
 * Isolated Ephemeral Tool Runner & Sandbox Boundary
 * Enforces zero-trust execution decoupling: only policy-approved actions run.
 */
export class SandboxRunner {
  private toolRegistry: Map<string, ToolHandler> = new Map();
  private defaultTimeoutMs: number;
  private allowedEnvKeys: Set<string>;

  constructor(options: SandboxRunnerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    // Default safe environment whitelist (explicitly excludes secrets/keys)
    this.allowedEnvKeys = new Set(options.allowedEnvKeys ?? [
      'NODE_ENV',
      'TZ',
      'LANG',
      'LC_ALL'
    ]);
  }

  /**
   * Register a tool handler within the execution boundary
   */
  public registerTool(name: string, handler: ToolHandler): void {
    this.toolRegistry.set(name, handler);
  }

  /**
   * Produce a strictly sanitized environment map:
   * Strips all host process.env secrets and only includes allowed non-sensitive keys
   * merged with explicit scoped credentials passed for this specific action.
   */
  public createSanitizedEnvironment(scopedCredentials: Record<string, string> = {}): Record<string, string> {
    const sanitized: Record<string, string> = {};

    // 1. Only copy explicitly whitelisted keys from host environment
    for (const key of this.allowedEnvKeys) {
      if (process.env[key] !== undefined) {
        sanitized[key] = process.env[key]!;
      }
    }

    // 2. Inject scoped caller credentials
    for (const [key, val] of Object.entries(scopedCredentials)) {
      sanitized[key] = val;
    }

    return sanitized;
  }

  /**
   * Decoupled execution entrypoint:
   * Rejects unapproved actions, runs in an isolated timeout sandbox, catches all faults.
   */
  public async run(request: ToolExecutionRequest): Promise<ExecutionResult> {
    const executionId = `exec-${randomUUID()}`;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // 1. Zero-Trust Guard: ONLY policy-approved requests are executed
    if (request.policyVerdict !== 'APPROVED') {
      return {
        executionId,
        status: 'POLICY_BLOCKED',
        error: {
          code: 'EXECUTION_DENIED_BY_POLICY',
          message: `Tool execution prohibited: policy verdict is '${request.policyVerdict}'. Action was not executed.`
        },
        durationMs: 0,
        timestamp
      };
    }

    // 2. Lookup registered tool
    const handler = this.toolRegistry.get(request.tool);
    if (!handler) {
      return {
        executionId,
        status: 'FAILED',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `No handler registered for tool '${request.tool}' in sandbox boundary.`
        },
        durationMs: Date.now() - startTime,
        timestamp
      };
    }

    // 3. Prepare sanitized sandbox context & timeout abort controller
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const abortController = new AbortController();
    const sanitizedEnv = Object.freeze(this.createSanitizedEnvironment(request.scopedCredentials));

    const context: SandboxContext = {
      executionId,
      tool: request.tool,
      sanitizedEnv,
      signal: abortController.signal
    };

    let timer: NodeJS.Timeout | undefined;

    try {
      // Race handler execution against timeout guard
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abortController.abort();
          const err = new Error(`Execution timed out after ${timeoutMs}ms`);
          err.name = 'TimeoutError';
          reject(err);
        }, timeoutMs);
      });

      const executionPromise = Promise.resolve().then(() => handler(request.parameters, context));

      const output = await Promise.race([executionPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      return {
        executionId,
        status: 'SUCCESS',
        output,
        durationMs,
        timestamp
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;

      if (err instanceof Error && (err.name === 'TimeoutError' || abortController.signal.aborted)) {
        return {
          executionId,
          status: 'TIMEOUT',
          error: {
            code: 'EXECUTION_TIMEOUT',
            message: `Tool execution exceeded safety threshold of ${timeoutMs}ms.`
          },
          durationMs,
          timestamp
        };
      }

      // Safe error mapping: do not leak raw internal call stack traces
      const sanitizedMessage = err instanceof Error ? err.message : String(err);

      return {
        executionId,
        status: 'FAILED',
        error: {
          code: 'TOOL_RUNTIME_ERROR',
          message: sanitizedMessage
        },
        durationMs,
        timestamp
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
