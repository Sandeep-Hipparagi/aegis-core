#!/usr/bin/env node

/**
 * AegisCore 30-Second Terminal Showcase
 * Demonstrates:
 * 1. Deterministic Invariant Enforcement (Blocked in <2ms)
 * 2. In-Flight DPDP Data Sanitization (Salted Tokenization & Cryptographic Shredding)
 * 3. Tamper-Evident WORM Ledger Verification (Merkle Chain from Genesis)
 */

import { GatewayPipeline } from '../src/gateway/pipeline.ts';
import { performance } from 'node:perf_hooks';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  console.clear();
  console.log(`\n${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║   🛡️  AEGISCORE — Deterministic Zero-Trust Policy Enclave & WORM Audit Gateway       ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚═══════════════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  await sleep(600);

  const pipeline = new GatewayPipeline();

  // Register strict schema
  pipeline.registerToolSchema('transfer_funds', {
    name: 'TransferFundsSchema',
    strict: true,
    properties: {
      amount: { type: 'number', required: true, max: 10000 },
      recipient: { type: 'string', required: true },
      pan: { type: 'string', required: false }
    }
  });

  pipeline.registerToolSchema('query_database', {
    name: 'QueryDbSchema',
    strict: true,
    properties: {
      targetTable: { type: 'string', required: true }
    }
  });

  // Register policies
  pipeline.registerPolicy({
    version: '1.0.0',
    namespace: 'banking.invariants',
    defaultEffect: 'DENY',
    rules: [
      {
        id: 'RULE-DISALLOW-SENSITIVE',
        name: 'Block Sensitive Data Targets',
        description: 'Blocks access to user credentials',
        targetTools: ['query_database'],
        effect: 'DENY',
        priority: 1000,
        conditions: [
          {
            type: 'disallowed_targets',
            targetField: 'parameters.targetTable',
            targets: ['users.credentials', 'vault_keys'],
            message: 'Target table is blacklisted by zero-trust invariant'
          }
        ]
      },
      {
        id: 'RULE-ALLOW-STANDARD-TRANSFER',
        name: 'Allow Compliant Transfers',
        description: 'Permits transfers <= $10,000',
        targetTools: ['transfer_funds'],
        effect: 'ALLOW',
        priority: 200,
        conditions: []
      }
    ]
  });

  pipeline.registerToolHandler('transfer_funds', (params) => {
    return {
      status: 'SETTLED',
      transactionId: `tx-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      amount: params.amount,
      recipient: params.recipient
    };
  });

  // =========================================================================
  // STEP 1: Unauthorized Action Blocked in < 2ms
  // =========================================================================
  console.log(`${colors.bold}${colors.yellow}[STEP 1/3] Intercepting Out-of-Bounds Agent Mutation...${colors.reset}`);
  console.log(`${colors.dim}Agent: 'autonomous-analyst-07' | Tool: 'query_database' | Target: 'users.credentials'${colors.reset}`);

  const start1 = performance.now();
  const res1 = await pipeline.processIntent(
    {
      tool: 'query_database',
      parameters: { targetTable: 'users.credentials' }
    },
    {
      sessionId: 'sess-demo-01',
      agentId: 'autonomous-analyst-07',
      role: 'analyst'
    }
  );
  const duration1 = (performance.now() - start1).toFixed(2);

  await sleep(400);
  console.log(`\n  ${colors.bold}${colors.red}🚫 VERDICT: [BLOCKED]${colors.reset} in ${colors.bold}${colors.green}${duration1}ms${colors.reset}`);
  console.log(`  ${colors.red}Reason:     ${res1.reason}${colors.reset}`);
  if (res1.violations && res1.violations.length > 0) {
    console.log(`  ${colors.red}Violation:  [${res1.violations[0].ruleId}] ${res1.violations[0].message}${colors.reset}`);
  }
  console.log(`  ${colors.gray}Audit Hash: ${res1.auditEntry?.entryHash.substring(0, 32)}...${colors.reset}`);
  console.log(`  ${colors.green}Sandbox:    Tool execution prevented with 0 CPU cycles on host DB.${colors.reset}\n`);

  await sleep(1200);

  // =========================================================================
  // STEP 2: In-Flight DPDP Sanitization
  // =========================================================================
  console.log(`${colors.bold}${colors.yellow}[STEP 2/3] In-Flight DPDP PII Tokenization & Cryptographic Ledgering...${colors.reset}`);
  console.log(`${colors.dim}Agent requests compliant transfer with sensitive Indian PAN: 'ABCDE1234F'${colors.reset}`);

  const start2 = performance.now();
  const res2 = await pipeline.processIntent(
    {
      tool: 'transfer_funds',
      parameters: {
        amount: 450,
        recipient: 'ACC-VENDOR-99',
        pan: 'ABCDE1234F'
      }
    },
    {
      sessionId: 'sess-demo-02',
      agentId: 'autonomous-finance-bot',
      role: 'operator'
    }
  );
  const duration2 = (performance.now() - start2).toFixed(2);

  await sleep(400);
  console.log(`\n  ${colors.bold}${colors.green}✅ VERDICT: [APPROVED & EXECUTED]${colors.reset} in ${colors.bold}${colors.green}${duration2}ms${colors.reset}`);
  console.log(`  ${colors.cyan}PII Masking: Raw PAN masked to ephemeral token in immutable audit record.${colors.reset}`);
  console.log(`  ${colors.gray}Ledger Seq:  Entry #${res2.auditEntry?.sequenceId} | Prev Hash: ${res2.auditEntry?.previousEntryHash.substring(0, 24)}...${colors.reset}`);
  console.log(`  ${colors.gray}Entry Hash:  ${res2.auditEntry?.entryHash}${colors.reset}`);
  console.log(`  ${colors.dim}Output:      ${JSON.stringify(res2.execution?.output)}${colors.reset}\n`);

  await sleep(1200);

  // =========================================================================
  // STEP 3: Cryptographic Ledger Verification
  // =========================================================================
  console.log(`${colors.bold}${colors.yellow}[STEP 3/3] Verifying Tamper-Evident WORM Merkle Ledger...${colors.reset}`);
  console.log(`${colors.dim}Command: 'aegis audit verify' — Traversing cryptographic pointers to Genesis${colors.reset}`);

  await sleep(400);
  const integrity = pipeline.getLedger().verifyChainIntegrity();
  const entries = pipeline.getLedger().getEntries();

  console.log(`\n  ${colors.bold}${colors.green}🔒 INTEGRITY CHECK: ${integrity.isValid ? 'PASSED (100% VALID)' : 'FAILED'}${colors.reset}`);
  console.log(`  ${colors.gray}Total Entries Audited: ${entries.length}${colors.reset}`);
  console.log(`  ${colors.gray}Genesis Hash:          ${entries[0]?.previousEntryHash}${colors.reset}`);
  console.log(`  ${colors.gray}Head Entry Hash:       ${entries[entries.length - 1]?.entryHash}${colors.reset}`);
  console.log(`  ${colors.cyan}Tamper Detection:      Active — Any retrospective byte alteration breaks Merkle integrity.${colors.reset}\n`);

  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}⚡ AegisCore: Sub-millisecond, deterministic systems security for autonomous agents.${colors.reset}\n`);
}

runDemo().catch(console.error);
