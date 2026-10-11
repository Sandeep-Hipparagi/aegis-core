import { randomUUID } from 'node:crypto';

export type PolicyEffect = 'ALLOW' | 'DENY' | 'ESCALATE';

export type ConditionType = 
  | 'rate_limit' 
  | 'param_boundary' 
  | 'disallowed_targets' 
  | 'role_invariant'
  | 'custom';

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

export type PolicyCondition = 
  | RateLimitCondition 
  | ParamBoundaryCondition 
  | DisallowedTargetsCondition 
  | RoleInvariantCondition
  | CustomCondition;

export interface InvariantRule {
  id: string;
  name: string;
  description: string;
  targetTools: string[] | '*';
  effect: PolicyEffect;
  priority: number; // Higher number = higher precedence
  conditions: PolicyCondition[];
}

export interface PolicyContract {
  version: string;
  namespace: string;
  defaultEffect: 'ALLOW' | 'DENY';
  rules: InvariantRule[];
}

export interface IntentContext {
  intentId?: string;
  sessionId: string;
  agentId: string;
  role: string;
  tool: string;
  parameters: Record<string, unknown>;
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
   * Register a policy document / contract into the engine
   */
  public registerPolicy(policy: PolicyContract): void {
    this.policies.set(policy.namespace, policy);
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
   * Resolve nested path from context
   */
  private resolveField(path: string, context: IntentContext): unknown {
    const segments = path.split('.');
    let current: unknown = context;

    for (const seg of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
    return current;
  }

  /**
   * Deterministically evaluate a single condition
   */
  private checkCondition(
    condition: PolicyCondition,
    intent: IntentContext,
    rule: InvariantRule
  ): { matched: boolean; violation?: ViolationTrace } {
    switch (condition.type) {
      case 'rate_limit': {
        const windowMs = condition.windowMs ?? 60_000;
        const currentCount = this.getSessionActionCount(intent.sessionId, windowMs);
        const limitExceeded = currentCount >= condition.maxActionsPerSession;

        if (limitExceeded) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'rate_limit',
              expected: `Max ${condition.maxActionsPerSession} actions per session (${windowMs}ms window)`,
              actual: `${currentCount + 1} actions attempted`,
              message: condition.message ?? `Rate limit invariant violated: exceeded ${condition.maxActionsPerSession} calls in session [${intent.sessionId}].`
            }
          };
        }
        return { matched: false };
      }

      case 'param_boundary': {
        const rawValue = this.resolveField(condition.field, intent);
        if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'param_boundary',
              expected: `Numeric value for '${condition.field}'`,
              actual: typeof rawValue,
              message: `Field '${condition.field}' must be a numeric value.`
            }
          };
        }

        let isOutOfBounds = false;
        let boundaryMsg = '';

        if (condition.max !== undefined && rawValue > condition.max) {
          isOutOfBounds = true;
          boundaryMsg = `Value ${rawValue} exceeds maximum boundary ceiling of ${condition.max}`;
        } else if (condition.min !== undefined && rawValue < condition.min) {
          isOutOfBounds = true;
          boundaryMsg = `Value ${rawValue} is below minimum boundary floor of ${condition.min}`;
        }

        if (isOutOfBounds) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'param_boundary',
              expected: `Boundary [${condition.min ?? '-∞'}, ${condition.max ?? '+∞'}]`,
              actual: rawValue,
              message: condition.message ?? boundaryMsg
            }
          };
        }

        return { matched: false };
      }

      case 'disallowed_targets': {
        const targetVal = this.resolveField(condition.targetField, intent);
        const targetStr = typeof targetVal === 'string' ? targetVal : String(targetVal ?? '');

        // Check exact match or substring / hierarchical prefix match (e.g. "users.credentials")
        const isDisallowed = condition.targets.some(disallowed => {
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
              expected: `Target not in blocked list: [${condition.targets.join(', ')}]`,
              actual: targetStr,
              message: condition.message ?? `Access to restricted target '${targetStr}' is blocked by security invariant.`
            }
          };
        }

        return { matched: false };
      }

      case 'role_invariant': {
        if (condition.deniedRoles && condition.deniedRoles.includes(intent.role)) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'role_invariant',
              expected: `Role not in denied list`,
              actual: intent.role,
              message: condition.message ?? `Role '${intent.role}' is explicitly denied from invoking this tool.`
            }
          };
        }

        if (condition.allowedRoles && !condition.allowedRoles.includes(intent.role)) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'role_invariant',
              expected: `Role in [${condition.allowedRoles.join(', ')}]`,
              actual: intent.role,
              message: condition.message ?? `Privilege escalation blocked: Role '${intent.role}' lacks required permissions.`
            }
          };
        }

        return { matched: false };
      }

      case 'custom': {
        const matches = condition.evaluate(intent);
        if (matches) {
          return {
            matched: true,
            violation: {
              ruleId: rule.id,
              ruleName: rule.name,
              conditionType: 'custom',
              expected: 'Custom invariant predicate satisfied',
              actual: 'Condition trigger fired',
              message: condition.message ?? 'Custom policy condition matched'
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

      // Check condition matches
      let ruleConditionMatched = false;
      const ruleViolations: ViolationTrace[] = [];

      if (rule.conditions.length === 0) {
        // Unconditional rule
        ruleConditionMatched = true;
      } else {
        // Invariant trigger checks
        for (const condition of rule.conditions) {
          const check = this.checkCondition(condition, intent, rule);
          if (check.matched) {
            ruleConditionMatched = true;
            if (check.violation) {
              ruleViolations.push(check.violation);
            }
          }
        }
      }

      if (ruleConditionMatched) {
        matchedRuleIds.push(rule.id);

        if (rule.effect === 'DENY') {
          isDenied = true;
          primaryDenialReason = rule.description || `Blocked by rule ${rule.id}`;
          violations.push(...ruleViolations);
          // Deny overrides: immediate termination
          break;
        } else if (rule.effect === 'ESCALATE') {
          requiresEscalation = true;
        } else if (rule.effect === 'ALLOW') {
          isAllowed = true;
        }
      }
    }

    if (isDenied) {
      return {
        allowed: false,
        verdict: 'BLOCKED',
        intentId,
        sessionId: intent.sessionId,
        matchedRules: matchedRuleIds,
        violations,
        reason: `[INVARIANT REJECTED] ${primaryDenialReason}: ${violations.map(v => v.message).join(' | ')}`,
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
        violations: [],
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
