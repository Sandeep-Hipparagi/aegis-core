import { randomUUID } from 'node:crypto';

export type PolicyEffect = 'ALLOW' | 'DENY' | 'ESCALATE';

export type ConditionType = 
  | 'rate_limit' 
  | 'param_boundary' 
  | 'disallowed_targets' 
  | 'role_invariant'
  | 'declarative_operator'
  | 'custom';

export type Operator = 
  | 'EQUALS' 
  | 'NOT_EQUALS' 
  | 'GREATER_THAN' 
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN' 
  | 'LESS_THAN_OR_EQUAL' 
  | 'IN' 
  | 'NOT_IN' 
  | 'MATCHES_REGEX' 
  | 'CONTAINS';

export interface RateLimitCondition {
  type: 'rate_limit';
  maxActionsPerSession: number;
  windowMs?: number;
  message?: string;
}

export interface ParamBoundaryCondition {
  type: 'param_boundary';
  field: string;
  min?: number;
  max?: number;
  message?: string;
}

export interface DisallowedTargetsCondition {
  type: 'disallowed_targets';
  targetField: string; // e.g. "parameters.table", "parameters.endpoint", "parameters.target"
  targets: string[];   // e.g. ["users.credentials", "auth_tokens", "financial.pii"]
  message?: string;
}

export interface RoleInvariantCondition {
  type: 'role_invariant';
  allowedRoles?: string[];
  deniedRoles?: string[];
  message?: string;
}

export interface CustomCondition {
  type: 'custom';
  evaluate: (intent: IntentContext) => boolean;
  message?: string;
}

export interface DeclarativeOperatorCondition {
  type?: 'declarative_operator';
  field: string;
  operator: Operator;
  value: unknown;
  description?: string;
  message?: string;
}

export type PolicyCondition = 
  | RateLimitCondition 
  | ParamBoundaryCondition 
  | DisallowedTargetsCondition 
  | RoleInvariantCondition
  | CustomCondition
  | DeclarativeOperatorCondition;

export interface InvariantRule {
  id: string;
  name: string;
  description?: string;
  targetTools: string[] | '*';
  effect: PolicyEffect;
  priority: number; // Higher number = higher precedence
  conditions: PolicyCondition[];
}

export interface PolicyContract {
  version: string;
  namespace?: string;
  policyNamespace?: string;
  description?: string;
  defaultEffect?: 'ALLOW' | 'DENY';
  rules: InvariantRule[];
}

export interface IntentContext {
  intentId?: string;
  sessionId: string;
  agentId: string;
  role: string;
  tool: string;
  parameters: Record<string, unknown>;
  agent?: {
    agentId?: string;
    role?: string;
    sessionId?: string;
    tenantId?: string;
  };
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export interface ViolationTrace {
  ruleId: string;
  ruleName: string;
  conditionType: ConditionType;
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface EvaluationResult {
  allowed: boolean;
  verdict: 'APPROVED' | 'BLOCKED' | 'REQUIRES_ESCALATION';
  intentId: string;
  sessionId: string;
  matchedRules: string[];
  violations: ViolationTrace[];
  reason: string;
  timestamp: string;
}

export class PolicyEngine {
  private policies: Map<string, PolicyContract> = new Map();
  // Session tracking for rate limiting: Map<sessionId, timestamp[]>
  private sessionActionHistory: Map<string, number[]> = new Map();

  constructor() {}

  /**
   * Register a policy document / contract into the engine.
   * Seamlessly resolves namespace across both `namespace` and `policyNamespace`.
   */
  public registerPolicy(policy: PolicyContract | Record<string, unknown>): void {
    const raw = policy as Record<string, unknown>;
    const ns = (policy as PolicyContract).namespace ?? 
               raw.policyNamespace ?? 
               raw.namespace ?? 
               `policy-${randomUUID()}`;

    const normalized: PolicyContract = {
      version: (raw.version as string) || '1.0.0',
      namespace: String(ns),
      policyNamespace: String(ns),
      description: (raw.description as string) || '',
      defaultEffect: (raw.defaultEffect as 'ALLOW' | 'DENY') || 'DENY',
      rules: (raw.rules as InvariantRule[]) || []
    };

    this.policies.set(String(ns), normalized);
  }

  public getPolicies(): ReadonlyMap<string, PolicyContract> {
    return this.policies;
  }

  /**
   * Clear session history (useful for tests or window expiration)
   */
  public resetSessionHistory(sessionId?: string): void {
    if (sessionId) {
      this.sessionActionHistory.delete(sessionId);
    } else {
      this.sessionActionHistory.clear();
    }
  }

  /**
   * Get action count for a session within a time window
   */
  public getSessionActionCount(sessionId: string, windowMs = 60000): number {
    const history = this.sessionActionHistory.get(sessionId) || [];
    const now = Date.now();
    const validTimestamps = history.filter(ts => (now - ts) <= windowMs);
    this.sessionActionHistory.set(sessionId, validTimestamps);
    return validTimestamps.length;
  }

  private recordSessionAction(sessionId: string, timestamp: number): void {
    const history = this.sessionActionHistory.get(sessionId) || [];
    history.push(timestamp);
    this.sessionActionHistory.set(sessionId, history);
  }

  /**
   * Resolve nested dot-notation path from context (e.g. "parameters.amount", "agent.role")
   */
  private resolveField(path: string, context: IntentContext): unknown {
    // Convenience aliases for common paths
    if (path === 'agent.role') {
      return context.agent?.role ?? context.role;
    }
    if (path === 'agent.agentId') {
      return context.agent?.agentId ?? context.agentId;
    }

    const segments = path.split('.');
    let current: unknown = context;

    for (const seg of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        // Fallback: If segment is not found directly on context root, check parameters
        if (current === context && context.parameters && seg in context.parameters) {
          current = context.parameters[seg];
          continue;
        }
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
    return current;
  }

  /**
   * Evaluate a declarative operator condition
   */
  private evaluateOperator(
    operator: Operator,
    actual: unknown,
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'EQUALS':
        return actual === expected;

      case 'NOT_EQUALS':
        return actual !== expected;

      case 'GREATER_THAN':
        return typeof actual === 'number' && Number.isFinite(actual) && typeof expected === 'number' && actual > expected;

      case 'GREATER_THAN_OR_EQUAL':
        return typeof actual === 'number' && Number.isFinite(actual) && typeof expected === 'number' && actual >= expected;

      case 'LESS_THAN':
        return typeof actual === 'number' && Number.isFinite(actual) && typeof expected === 'number' && actual < expected;

      case 'LESS_THAN_OR_EQUAL':
        return typeof actual === 'number' && Number.isFinite(actual) && typeof expected === 'number' && actual <= expected;

      case 'IN': {
        if (!Array.isArray(expected)) return false;
        if (typeof actual === 'string') {
          const normActual = actual.trim().toLowerCase();
          return expected.some(item => {
            if (typeof item === 'string') {
              return item.trim().toLowerCase() === normActual;
            }
            return item === actual;
          });
        }
        return expected.includes(actual);
      }

      case 'NOT_IN': {
        if (!Array.isArray(expected)) return false;
        if (typeof actual === 'string') {
          const normActual = actual.trim().toLowerCase();
          return !expected.some(item => {
            if (typeof item === 'string') {
              return item.trim().toLowerCase() === normActual;
            }
            return item === actual;
          });
        }
        return !expected.includes(actual);
      }

      case 'MATCHES_REGEX':
        if (typeof actual !== 'string' || typeof expected !== 'string') return false;
        try {
          let pattern = expected;
          let flags = '';
          if (pattern.startsWith('(?i)')) {
            flags = 'i';
            pattern = pattern.slice(4);
          }
          const regex = new RegExp(pattern, flags);
          return regex.test(actual);
        } catch {
          return false;
        }

      case 'CONTAINS':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual.includes(expected);
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Deterministically evaluate a single condition against an intent context
   */
  private checkCondition(
    condition: PolicyCondition,
    intent: IntentContext,
    rule: InvariantRule
  ): { matched: boolean; violation?: ViolationTrace } {
    // 1. Declarative Operator Condition: contains 'field' and 'operator'
    const declCond = condition as DeclarativeOperatorCondition;
    if (declCond.operator && declCond.field) {
      const actual = this.resolveField(declCond.field, intent);
      const isMatch = this.evaluateOperator(declCond.operator, actual, declCond.value);

      if (isMatch) {
        return {
          matched: true,
          violation: {
            ruleId: rule.id,
            ruleName: rule.name,
            conditionType: 'declarative_operator',
            expected: `Invariant: NOT (${declCond.field} ${declCond.operator} ${JSON.stringify(declCond.value)})`,
            actual,
            message: declCond.message ?? declCond.description ?? `Condition matched: ${declCond.field} ${declCond.operator} ${JSON.stringify(declCond.value)}`
          }
        };
      }
      return { matched: false };
    }

    // 2. Named Condition Types
    const typedCond = condition as { type?: string };
    switch (typedCond.type) {
      case 'rate_limit': {
        const cond = condition as RateLimitCondition;
        const windowMs = cond.windowMs ?? 60_000;
        const currentCount = this.getSessionActionCount(intent.sessionId, windowMs);
        const limitExceeded = currentCount >= cond.maxActionsPerSession;

        if (limitExceeded) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'rate_limit',
              expected: `Max ${cond.maxActionsPerSession} actions per session (${windowMs}ms window)`,
              actual: `${currentCount + 1} actions attempted`,
              message: cond.message ?? `Rate limit invariant violated: exceeded ${cond.maxActionsPerSession} calls in session [${intent.sessionId}].`
            }
          };
        }
        return { matched: false };
      }

      case 'param_boundary': {
        const cond = condition as ParamBoundaryCondition;
        const rawValue = this.resolveField(cond.field, intent);
        if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'param_boundary',
              expected: `Numeric value for '${cond.field}'`,
              actual: typeof rawValue,
              message: `Field '${cond.field}' must be a numeric value.`
            }
          };
        }

        let isOutOfBounds = false;
        let boundaryMsg = '';

        if (cond.max !== undefined && rawValue > cond.max) {
          isOutOfBounds = true;
          boundaryMsg = `Value ${rawValue} exceeds maximum boundary ceiling of ${cond.max}`;
        } else if (cond.min !== undefined && rawValue < cond.min) {
          isOutOfBounds = true;
          boundaryMsg = `Value ${rawValue} is below minimum boundary floor of ${cond.min}`;
        }

        if (isOutOfBounds) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'param_boundary',
              expected: `Boundary [${cond.min ?? '-∞'}, ${cond.max ?? '+∞'}]`,
              actual: rawValue,
              message: cond.message ?? boundaryMsg
            }
          };
        }

        return { matched: false };
      }

      case 'disallowed_targets': {
        const cond = condition as DisallowedTargetsCondition;
        const targetVal = this.resolveField(cond.targetField, intent);
        const targetStr = typeof targetVal === 'string' ? targetVal : String(targetVal ?? '');

        // Check exact match or hierarchical prefix match (e.g. "users.credentials")
        const isDisallowed = cond.targets.some(disallowed => {
          const normTarget = targetStr.toLowerCase();
          const normDisallowed = disallowed.toLowerCase();
          return normTarget === normDisallowed || 
                 normTarget.startsWith(`${normDisallowed}.`) || 
                 normTarget.includes(normDisallowed);
        });

        if (isDisallowed) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'disallowed_targets',
              expected: `Target not in blocked list: [${cond.targets.join(', ')}]`,
              actual: targetStr,
              message: cond.message ?? `Access to restricted target '${targetStr}' is blocked by security invariant.`
            }
          };
        }

        return { matched: false };
      }

      case 'role_invariant': {
        const cond = condition as RoleInvariantCondition;
        const effectiveRole = intent.agent?.role ?? intent.role;

        if (cond.deniedRoles && cond.deniedRoles.includes(effectiveRole)) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'role_invariant',
              expected: `Role not in denied list`,
              actual: effectiveRole,
              message: cond.message ?? `Role '${effectiveRole}' is explicitly denied from invoking this tool.`
            }
          };
        }

        if (cond.allowedRoles && !cond.allowedRoles.includes(effectiveRole)) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'role_invariant',
              expected: `Role in [${cond.allowedRoles.join(', ')}]`,
              actual: effectiveRole,
              message: cond.message ?? `Privilege escalation blocked: Role '${effectiveRole}' lacks required permissions.`
            }
          };
        }

        return { matched: false };
      }

      case 'custom': {
        const cond = condition as CustomCondition;
        const matches = cond.evaluate(intent);
        if (matches) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'custom',
              expected: 'Custom invariant predicate satisfied',
              actual: 'Condition trigger fired',
              message: cond.message ?? 'Custom policy condition matched'
            }
          };
        }
        return { matched: false };
      }

      default:
        return { matched: false };
    }
  }

  /**
   * Deterministically evaluates an intent context against all loaded policies.
   */
  public evaluate(intent: IntentContext): EvaluationResult {
    const intentId = intent.intentId || `int-${randomUUID()}`;
    const timestamp = new Date().toISOString();
    const actionTimestamp = intent.timestamp ?? Date.now();

    // Flatten rules from all loaded policies
    const allRules: InvariantRule[] = [];
    for (const policy of this.policies.values()) {
      for (const rule of policy.rules) {
        allRules.push(rule);
      }
    }

    // Sort deterministically by priority descending
    allRules.sort((a, b) => b.priority - a.priority);

    const matchedRuleIds: string[] = [];
    const violations: ViolationTrace[] = [];
    let isDenied = false;
    let isAllowed = false;
    let requiresEscalation = false;
    let primaryDenialReason = '';

    for (const rule of allRules) {
      // Check tool target
      const appliesToTool = rule.targetTools === '*' || rule.targetTools.includes(intent.tool);
      if (!appliesToTool) {
        continue;
      }

      // Check all conditions in this rule
      let ruleConditionsMatch = true;
      const ruleViolations: ViolationTrace[] = [];

      if (rule.conditions.length > 0) {
        for (const condition of rule.conditions) {
          const check = this.checkCondition(condition, intent, rule);
          if (!check.matched) {
            ruleConditionsMatch = false;
            break;
          }
          if (check.violation) {
            ruleViolations.push(check.violation);
          }
        }
      }

      if (ruleConditionsMatch) {
        matchedRuleIds.push(rule.id);

        if (rule.effect === 'DENY') {
          isDenied = true;
          primaryDenialReason = rule.description || `Blocked by rule [${rule.id}]`;
          violations.push(...ruleViolations);
          // Deny overrides: immediate termination
          break;
        } else if (rule.effect === 'ESCALATE') {
          requiresEscalation = true;
          if (ruleViolations.length > 0) {
            violations.push(...ruleViolations);
          }
        } else if (rule.effect === 'ALLOW') {
          isAllowed = true;
        }
      }
    }

    if (isDenied) {
      const details = violations.length > 0 ? `: ${violations.map(v => v.message).join(' | ')}` : '';
      return {
        allowed: false,
        verdict: 'BLOCKED',
        intentId,
        sessionId: intent.sessionId,
        matchedRules: matchedRuleIds,
        violations,
        reason: `[INVARIANT REJECTED] ${primaryDenialReason}${details}`,
        timestamp
      };
    }

    if (requiresEscalation) {
      return {
        allowed: false,
        verdict: 'REQUIRES_ESCALATION',
        intentId,
        sessionId: intent.sessionId,
        matchedRules: matchedRuleIds,
        violations,
        reason: 'Action requires human supervisor signoff before execution.',
        timestamp
      };
    }

    if (isAllowed) {
      // Record action count for rate-limiting upon success
      this.recordSessionAction(intent.sessionId, actionTimestamp);

      return {
        allowed: true,
        verdict: 'APPROVED',
        intentId,
        sessionId: intent.sessionId,
        matchedRules: matchedRuleIds,
        violations: [],
        reason: 'All deterministic policy invariants passed.',
        timestamp
      };
    }

    // Default fail-closed Zero Trust
    return {
      allowed: false,
      verdict: 'BLOCKED',
      intentId,
      sessionId: intent.sessionId,
      matchedRules: [],
      violations: [
        {
          ruleId: 'ZERO_TRUST_DEFAULT',
          ruleName: 'Zero-Trust Default Deny',
          conditionType: 'custom',
          expected: 'Explicit permit rule',
          actual: 'No matching permit rule',
          message: 'No permissive policy rule matched this intent proposal.'
        }
      ],
      reason: '[ZERO-TRUST DEFAULT] Intent blocked: no permissive policy authorized this action.',
      timestamp
    };
  }
}
