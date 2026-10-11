import { randomUUID } from 'node:crypto';
import type { 
  IntentPayload, 
  PolicyDecision, 
  PolicyDocument, 
  PolicyRule, 
  InvariantCondition,
  Operator 
} from './types.ts';

export class PolicyEngine {
  private policies: Map<string, PolicyDocument> = new Map();

  /**
   * Register a policy document in the engine
   */
  public registerPolicy(policy: PolicyDocument): void {
    this.policies.set(policy.policyNamespace, policy);
  }

  /**
   * Resolve a nested field from the intent (e.g. "parameters.amount" or "agent.role")
   */
  private resolveField(path: string, intent: IntentPayload): unknown {
    const segments = path.split('.');
    let current: unknown = intent;

    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  /**
   * Evaluate a single condition against the intent payload
   */
  private evaluateCondition(cond: InvariantCondition, intent: IntentPayload): boolean {
    const actual = this.resolveField(cond.field, intent);

    switch (cond.operator) {
      case 'EQUALS':
        return actual === cond.value;

      case 'NOT_EQUALS':
        return actual !== cond.value;

      case 'GREATER_THAN':
        return typeof actual === 'number' && typeof cond.value === 'number' && actual > cond.value;

      case 'LESS_THAN':
        return typeof actual === 'number' && typeof cond.value === 'number' && actual < cond.value;

      case 'LESS_THAN_OR_EQUAL':
        return typeof actual === 'number' && typeof cond.value === 'number' && actual <= cond.value;

      case 'IN':
        return Array.isArray(cond.value) && cond.value.includes(actual);

      case 'NOT_IN':
        return Array.isArray(cond.value) && !cond.value.includes(actual);

      case 'MATCHES_REGEX':
        if (typeof actual !== 'string' || typeof cond.value !== 'string') return false;
        try {
          const regex = new RegExp(cond.value);
          return regex.test(actual);
        } catch {
          return false;
        }

      case 'CONTAINS':
        if (typeof actual === 'string' && typeof cond.value === 'string') {
          return actual.includes(cond.value);
        }
        if (Array.isArray(actual)) {
          return actual.includes(cond.value);
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Deterministically evaluates an IntentPayload against all active policy rules.
   */
  public evaluate(intent: IntentPayload): PolicyDecision {
    const decisionId = `dec-${randomUUID()}`;
    const timestamp = new Date().toISOString();

    const matchedRuleIds: string[] = [];
    const violatedInvariants: string[] = [];
    let isExplicitlyDenied = false;
    let isExplicitlyAllowed = false;
    let escalationRequired = false;
    let denialReason = '';

    // Collect all rules from registered policies
    const allRules: { policyNamespace: string; rule: PolicyRule }[] = [];
    for (const [namespace, doc] of this.policies.entries()) {
      for (const rule of doc.rules) {
        allRules.push({ policyNamespace: namespace, rule });
      }
    }

    // Sort deterministically by priority descending
    allRules.sort((a, b) => b.rule.priority - a.rule.priority);

    for (const { rule } of allRules) {
      // Check tool applicability
      const appliesToTool = rule.targetTools === '*' || rule.targetTools.includes(intent.tool);
      if (!appliesToTool) {
        continue;
      }

      // Check all conditions in this rule
      const conditionsMatch = rule.conditions.every(cond => this.evaluateCondition(cond, intent));

      if (conditionsMatch) {
        matchedRuleIds.push(rule.id);

        if (rule.effect === 'DENY') {
          isExplicitlyDenied = true;
          denialReason = rule.description || `Blocked by rule [${rule.id}]`;
          for (const cond of rule.conditions) {
            violatedInvariants.push(`${cond.field} ${cond.operator} ${JSON.stringify(cond.value)}: ${cond.description || 'Violation'}`);
          }
          // Immediate stop on explicit deny (deny-overrides pattern)
          break;
        } else if (rule.effect === 'ESCALATE') {
          escalationRequired = true;
        } else if (rule.effect === 'ALLOW') {
          isExplicitlyAllowed = true;
        }
      }
    }

    if (isExplicitlyDenied) {
      return {
        decisionId,
        intentId: intent.intentId,
        timestamp,
        status: 'BLOCKED',
        reason: `[SECURITY INVARIANT VIOLATION] ${denialReason}`,
        matchedRules: matchedRuleIds,
        violatedInvariants,
        executionAllowed: false
      };
    }

    if (escalationRequired) {
      return {
        decisionId,
        intentId: intent.intentId,
        timestamp,
        status: 'REQUIRES_ESCALATION',
        reason: 'Action exceeds autonomous threshold; requires human-in-the-loop escalation approval.',
        matchedRules: matchedRuleIds,
        executionAllowed: false
      };
    }

    if (isExplicitlyAllowed) {
      return {
        decisionId,
        intentId: intent.intentId,
        timestamp,
        status: 'APPROVED',
        reason: 'Action validated against deterministic invariants and explicitly permitted.',
        matchedRules: matchedRuleIds,
        executionAllowed: true
      };
    }

    // Fallback default: Zero-Trust Deny
    return {
      decisionId,
      intentId: intent.intentId,
      timestamp,
      status: 'BLOCKED',
      reason: '[ZERO-TRUST DEFAULT] No permissive policy explicitly authorized this intent.',
      matchedRules: [],
      executionAllowed: false
    };
  }
}
