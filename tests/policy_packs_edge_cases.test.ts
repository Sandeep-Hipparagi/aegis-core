import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { PolicyEngine, type IntentContext } from '../src/policy/engine.ts';

describe('Policy Packs Edge-Case Violations & Invariant Verification', () => {

  describe('1. Data Governance Policy Pack (policies/data-governance.json)', () => {
    let engine: PolicyEngine;

    beforeEach(() => {
      const policyPath = path.resolve(process.cwd(), 'policies/data-governance.json');
      const contract = JSON.parse(readFileSync(policyPath, 'utf-8'));
      engine = new PolicyEngine();
      engine.registerPolicy(contract);
    });

    it('should block destructive DDL: DROP TABLE with various casing, whitespace, and multiline variations', () => {
      const dropVariations = [
        'DROP TABLE users;',
        'drop table users;',
        'DROP   TABLE   customers;',
        'DROP\nTABLE audit_log;',
        '/* comment */ DROP TABLE sessions;'
      ];

      for (const query of dropVariations) {
        const intent: IntentContext = {
          sessionId: 'sess-ddl-test',
          agentId: 'db-agent',
          role: 'analyst',
          tool: 'execute_sql_query',
          parameters: { query }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Query '${query}' should be BLOCKED`);
        assert.ok(
          res.matchedRules.includes('DATA-001-DENY-DESTRUCTIVE-SQL') ||
          res.violations.some(v => v.ruleId === 'DATA-001-DENY-DESTRUCTIVE-SQL'),
          `Query '${query}' must match DATA-001 rule`
        );
      }
    });

    it('should block TRUNCATE, DROP DATABASE, and ALTER TABLE DROP statements', () => {
      const queries = [
        'TRUNCATE TABLE transactions;',
        'TRUNCATE ledger;',
        'truncate accounts;',
        'DROP DATABASE production;',
        'ALTER TABLE users DROP COLUMN email;'
      ];

      for (const query of queries) {
        const intent: IntentContext = {
          sessionId: 'sess-ddl-test-2',
          agentId: 'db-agent',
          role: 'analyst',
          tool: 'execute_sql_query',
          parameters: { query }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Query '${query}' should be BLOCKED`);
      }
    });

    it('should block autonomous customer account deletion unless role is super-admin-human', () => {
      // Non-admin roles must be blocked
      const unauthorizedRoles = ['service_agent', 'support_rep', 'developer', 'guest', 'admin'];
      for (const role of unauthorizedRoles) {
        const intent: IntentContext = {
          sessionId: 'sess-del-user',
          agentId: 'agent-42',
          role,
          tool: 'delete_customer_account',
          parameters: { customerId: 'CUST-10992' },
          agent: { role }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Role '${role}' must be BLOCKED from deleting accounts`);
      }

      // Authorized super-admin-human role must bypass DATA-002
      const authorizedIntent: IntentContext = {
        sessionId: 'sess-del-admin',
        agentId: 'human-officer-01',
        role: 'super-admin-human',
        tool: 'delete_customer_account',
        parameters: { customerId: 'CUST-10992' },
        agent: { role: 'super-admin-human' }
      };
      const adminRes = engine.evaluate(authorizedIntent);
      assert.ok(
        !adminRes.matchedRules.includes('DATA-002-DENY-ACCOUNT-DELETION'),
        'super-admin-human must not be matched by DATA-002'
      );
      assert.ok(
        !adminRes.violations.some(v => v.ruleId === 'DATA-002-DENY-ACCOUNT-DELETION'),
        'super-admin-human must not violate DATA-002'
      );
    });

    it('should allow read-only SELECT queries and deny unapproved non-SELECT queries under zero-trust default', () => {
      const selectIntent: IntentContext = {
        sessionId: 'sess-select',
        agentId: 'reporting-agent',
        role: 'reporter',
        tool: 'execute_sql_query',
        parameters: { query: 'SELECT count(*) FROM daily_metrics WHERE date = CURRENT_DATE;' }
      };
      const selectRes = engine.evaluate(selectIntent);
      assert.equal(selectRes.verdict, 'APPROVED', 'Standard SELECT queries should be APPROVED');

      // Zero-trust default effect: INSERT / UPDATE is not explicitly ALLOWed, so it must be DENIED
      const insertIntent: IntentContext = {
        sessionId: 'sess-insert',
        agentId: 'reporting-agent',
        role: 'reporter',
        tool: 'execute_sql_query',
        parameters: { query: "INSERT INTO audit (msg) VALUES ('probe');" }
      };
      const insertRes = engine.evaluate(insertIntent);
      assert.equal(insertRes.verdict, 'BLOCKED', 'INSERT query should be BLOCKED by zero-trust default');
    });
  });

  describe('2. DPDP India Compliance Policy Pack (policies/dpdp-india.json)', () => {
    let engine: PolicyEngine;

    beforeEach(() => {
      const policyPath = path.resolve(process.cwd(), 'policies/dpdp-india.json');
      const contract = JSON.parse(readFileSync(policyPath, 'utf-8'));
      engine = new PolicyEngine();
      engine.registerPolicy(contract);
    });

    it('should block autonomous purge requests unless role is data-protection-officer-human', () => {
      const purgeTools = ['purge_user_data', 'delete_customer_profile', 'hard_delete_records'];
      for (const tool of purgeTools) {
        const intent: IntentContext = {
          sessionId: 'sess-purge-bot',
          agentId: 'retention-worker',
          role: 'retention-worker',
          tool,
          parameters: { userId: 'USR-IN-8812' },
          agent: { role: 'retention-worker' }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Tool '${tool}' must be BLOCKED for non-DPO`);
        assert.ok(
          res.matchedRules.includes('DPDP-001-BLOCK-UNAUTHORIZED-PURGE') ||
          res.violations.some(v => v.ruleId === 'DPDP-001-BLOCK-UNAUTHORIZED-PURGE')
        );
      }

      // Valid DPO human role bypasses DPDP-001
      const dpoIntent: IntentContext = {
        sessionId: 'sess-dpo-auth',
        agentId: 'dpo-officer',
        role: 'data-protection-officer-human',
        tool: 'purge_user_data',
        parameters: { userId: 'USR-IN-8812', reason: 'Statutory Right to Erasure request' },
        agent: { role: 'data-protection-officer-human' }
      };
      const dpoRes = engine.evaluate(dpoIntent);
      assert.ok(
        !dpoRes.matchedRules.includes('DPDP-001-BLOCK-UNAUTHORIZED-PURGE'),
        'DPO role must not be matched by DPDP-001'
      );
      assert.ok(
        !dpoRes.violations.some(v => v.ruleId === 'DPDP-001-BLOCK-UNAUTHORIZED-PURGE'),
        'DPO role must not violate DPDP-001'
      );
    });

    it('should block direct access to unmasked identity vault tables with case-insensitivity', () => {
      const sensitiveTables = [
        'aadhaar_vault',
        'pan_identity_registry',
        'raw_biometrics',
        'kyc_documents',
        'AADHAAR_VAULT',
        'Pan_Identity_Registry'
      ];

      for (const targetTable of sensitiveTables) {
        const intent: IntentContext = {
          sessionId: 'sess-vault-read',
          agentId: 'model-crawler',
          role: 'assistant',
          tool: 'query_database',
          parameters: { targetTable, query: 'SELECT * FROM vault;' }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Table '${targetTable}' must be BLOCKED by DPDP-002`);
        assert.ok(
          res.matchedRules.includes('DPDP-002-BLOCK-UNMASKED-IDENTITY-TARGETS') ||
          res.violations.some(v => v.ruleId === 'DPDP-002-BLOCK-UNMASKED-IDENTITY-TARGETS')
        );
      }
    });

    it('should escalate bulk exports exceeding 100 records for human sign-off', () => {
      // 100 records is within limit (not escalated by DPDP-003)
      const exportUnder: IntentContext = {
        sessionId: 'sess-export-1',
        agentId: 'crm-bot',
        role: 'exporter',
        tool: 'export_customer_dataset',
        parameters: { recordCount: 100 }
      };
      const resUnder = engine.evaluate(exportUnder);
      assert.notEqual(resUnder.verdict, 'REQUIRES_ESCALATION');

      // 101 records exceeds limit -> ESCALATE
      const exportOver: IntentContext = {
        sessionId: 'sess-export-2',
        agentId: 'crm-bot',
        role: 'exporter',
        tool: 'export_customer_dataset',
        parameters: { recordCount: 101 }
      };
      const resOver = engine.evaluate(exportOver);
      assert.equal(resOver.verdict, 'REQUIRES_ESCALATION');
      assert.ok(
        resOver.matchedRules.includes('DPDP-003-ESCALATE-BULK-DATA-EXPORT') ||
        resOver.violations.some(v => v.ruleId === 'DPDP-003-ESCALATE-BULK-DATA-EXPORT')
      );
    });

    it('should permit anonymized metrics and sanity check tools', () => {
      const metricsIntent: IntentContext = {
        sessionId: 'sess-metrics',
        agentId: 'metrics-agent',
        role: 'monitoring',
        tool: 'get_metrics',
        parameters: { window: '24h' }
      };
      const res = engine.evaluate(metricsIntent);
      assert.equal(res.verdict, 'APPROVED', 'get_metrics should be APPROVED by DPDP-004');
    });
  });

  describe('3. Fintech Guardrails Policy Pack (policies/fintech-guardrails.json)', () => {
    let engine: PolicyEngine;

    beforeEach(() => {
      const policyPath = path.resolve(process.cwd(), 'policies/fintech-guardrails.json');
      const contract = JSON.parse(readFileSync(policyPath, 'utf-8'));
      engine = new PolicyEngine();
      engine.registerPolicy(contract);
    });

    it('should enforce FIN-000 to reject zero and negative amounts', () => {
      const badAmounts = [0, -1, -500, -0.0001];
      for (const amount of badAmounts) {
        const intent: IntentContext = {
          sessionId: 'sess-fin-bad-amt',
          agentId: 'fin-agent',
          role: 'operator',
          tool: 'transfer_funds',
          parameters: { amount, currency: 'USD', recipient: 'ACC-001' }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Amount ${amount} must be BLOCKED`);
        assert.ok(
          res.matchedRules.includes('FIN-000-DENY-NON-POSITIVE-AMOUNT') ||
          res.violations.some(v => v.ruleId === 'FIN-000-DENY-NON-POSITIVE-AMOUNT')
        );
      }
    });

    it('should enforce currency whitelist (USD, EUR, GBP, INR, SGD) and reject all others', () => {
      const allowedCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'SGD'];
      for (const currency of allowedCurrencies) {
        const intent: IntentContext = {
          sessionId: 'sess-fin-curr-ok',
          agentId: 'fin-agent',
          role: 'operator',
          tool: 'transfer_funds',
          parameters: { amount: 500, currency, recipient: 'ACC-001' }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'APPROVED', `Currency ${currency} should be allowed`);
      }

      const disallowedCurrencies = ['BTC', 'ETH', 'USDT', 'JPY', 'CAD', 'AUD', 'XYZ'];
      for (const currency of disallowedCurrencies) {
        const intent: IntentContext = {
          sessionId: 'sess-fin-curr-bad',
          agentId: 'fin-agent',
          role: 'operator',
          tool: 'transfer_funds',
          parameters: { amount: 500, currency, recipient: 'ACC-001' }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Currency ${currency} must be BLOCKED by FIN-001`);
        assert.ok(
          res.matchedRules.includes('FIN-001-BLOCK-UNAUTHORIZED-CURRENCY') ||
          res.violations.some(v => v.ruleId === 'FIN-001-BLOCK-UNAUTHORIZED-CURRENCY')
        );
      }
    });

    it('should block autonomous credit adjustments unless role is credit-risk-committee-chair', () => {
      const creditTools = ['adjust_credit_limit', 'modify_overdraft', 'forgive_debt'];
      for (const tool of creditTools) {
        const intent: IntentContext = {
          sessionId: 'sess-credit-adj',
          agentId: 'agent-bot',
          role: 'support_agent',
          tool,
          parameters: { accountId: 'ACC-552', delta: 5000 },
          agent: { role: 'support_agent' }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'BLOCKED', `Tool '${tool}' must be BLOCKED for non-chair`);
      }

      // Chair role bypasses FIN-002
      const chairIntent: IntentContext = {
        sessionId: 'sess-credit-chair',
        agentId: 'exec-officer',
        role: 'credit-risk-committee-chair',
        tool: 'adjust_credit_limit',
        parameters: { accountId: 'ACC-552', delta: 5000 },
        agent: { role: 'credit-risk-committee-chair' }
      };
      const chairRes = engine.evaluate(chairIntent);
      assert.ok(
        !chairRes.matchedRules.includes('FIN-002-BLOCK-ADMIN-CREDIT-ALTERATION'),
        'Chair role must not be matched by FIN-002'
      );
      assert.ok(
        !chairRes.violations.some(v => v.ruleId === 'FIN-002-BLOCK-ADMIN-CREDIT-ALTERATION'),
        'Chair role must not violate FIN-002'
      );
    });

    it('should enforce Dual-Custody HITL escalation for transfers > $25,000 and allow standard transfers <= $25,000', () => {
      // <= $25,000 -> APPROVED by FIN-004
      const standardIntent: IntentContext = {
        sessionId: 'sess-std-transfer',
        agentId: 'fin-agent',
        role: 'operator',
        tool: 'transfer_funds',
        parameters: { amount: 25000, currency: 'USD', recipient: 'ACC-VENDOR' }
      };
      const stdRes = engine.evaluate(standardIntent);
      assert.equal(stdRes.verdict, 'APPROVED', '$25,000 transfer should be APPROVED');

      // > $25,000 -> ESCALATE by FIN-003
      const highIntent: IntentContext = {
        sessionId: 'sess-high-transfer',
        agentId: 'fin-agent',
        role: 'operator',
        tool: 'transfer_funds',
        parameters: { amount: 25000.01, currency: 'USD', recipient: 'ACC-VENDOR' }
      };
      const highRes = engine.evaluate(highIntent);
      assert.equal(highRes.verdict, 'REQUIRES_ESCALATION', '$25,000.01 transfer must require escalation');
      assert.ok(
        highRes.matchedRules.includes('FIN-003-ESCALATE-DUAL-CUSTODY-THRESHOLD') ||
        highRes.violations.some(v => v.ruleId === 'FIN-003-ESCALATE-DUAL-CUSTODY-THRESHOLD')
      );
    });

    it('should allow read-only account inquiries', () => {
      const readTools = ['check_balance', 'get_account_statement', 'list_transactions'];
      for (const tool of readTools) {
        const intent: IntentContext = {
          sessionId: 'sess-read',
          agentId: 'fin-agent',
          role: 'viewer',
          tool,
          parameters: { accountId: 'ACC-PRIMARY' }
        };
        const res = engine.evaluate(intent);
        assert.equal(res.verdict, 'APPROVED', `Tool '${tool}' should be APPROVED by FIN-005`);
      }
    });
  });
});
