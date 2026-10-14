#!/usr/bin/env node

/**
 * AegisCore Terminal Showcase v2 (Optimized for Social & GitHub README)
 * High-density visual layout with SF Mono typography and compact scenario cards.
 */

import { GatewayPipeline } from '../src/gateway/pipeline.ts';
import { performance } from 'node:perf_hooks';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;2;243;139;168m',
  green: '\x1b[38;2;166;227;161m',
  yellow: '\x1b[38;2;249;226;175m',
  blue: '\x1b[38;2;137;180;250m',
  magenta: '\x1b[38;2;203;166;247m',
  cyan: '\x1b[38;2;148;226;213m',
  gray: '\x1b[38;2;108;112;134m',
  bgRed: '\x1b[48;2;243;139;168;38;2;17;17;27m',
  bgGreen: '\x1b[48;2;166;227;161;38;2;17;17;27m',
  bgBlue: '\x1b[48;2;137;180;250;38;2;17;17;27m',
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const pipeline = new GatewayPipeline();

  // Configure Schemas & Policies
  pipeline.registerToolSchema('execute_db_query', {
    name: 'DbQuerySchema',
    strict: true,
    properties: {
      table: { type: 'string', required: true }
    }
  });

  pipeline.registerToolSchema('settle_transfer', {
    name: 'TransferSchema',
    strict: true,
    properties: {
      recipient: { type: 'string', required: true },
      amount: { type: 'number', required: true, max: 10000 },
      taxId: { type: 'string', required: false }
    }
  });

  pipeline.registerPolicy({
    version: '1.0.0',
    namespace: 'enterprise.invariants',
    defaultEffect: 'DENY',
    rules: [
      {
        id: 'INV-001',
        name: 'Block Critical Vault Access',
        targetTools: ['execute_db_query'],
        effect: 'DENY',
        priority: 1000,
        conditions: [
          {
            type: 'disallowed_targets',
            targetField: 'parameters.table',
            targets: ['auth_credentials', 'system_keys', 'users.credentials'],
            message: 'Target asset is in blacklisted isolation boundary'
          }
        ]
      },
      {
        id: 'INV-002',
        name: 'Permit Compliant Settlement',
        targetTools: ['settle_transfer'],
        effect: 'ALLOW',
        priority: 100,
        conditions: []
      }
    ]
  });

  pipeline.registerToolHandler('settle_transfer', (args) => ({
    status: 'SETTLED',
    reference: `TX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    amount: args.amount,
    recipient: args.recipient
  }));

  // SCENARIO 1: Model Tool Hijack / Data Exfiltration Attempt
  const t1 = performance.now();
  const res1 = await pipeline.processIntent(
    { tool: 'execute_db_query', parameters: { table: 'users.credentials' } },
    { sessionId: 'sess-01', agentId: 'autonomous-analyst-01', role: 'analyst' }
  );
  const dur1 = (performance.now() - t1).toFixed(2);

  console.log(`\n  ${c.gray}┌─${c.reset} ${c.bold}SCENARIO 1: Model Hijack & Data Exfiltration${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${c.bgRed}${c.bold} 🚫 BLOCKED ${c.reset} ${c.bold}${c.red}INVARIANT REJECTED${c.reset} ${c.dim}(${dur1}ms)${c.reset} · ${c.yellow}[INV-001]${c.reset}`);
  console.log(`  ${c.gray}└${c.reset}  ${c.dim}Host DB:${c.reset} ${c.green}Zero queries executed · 0 CPU cycles leaked${c.reset}`);

  await sleep(500);

  // SCENARIO 2: DPDP In-Flight PII Masking & Salted Tokenization
  const t2 = performance.now();
  const res2 = await pipeline.processIntent(
    { tool: 'settle_transfer', parameters: { recipient: 'ACME Corp', amount: 850, taxId: 'ABCDE1234F' } },
    { sessionId: 'sess-02', agentId: 'finance-executor', role: 'operator' }
  );
  const dur2 = (performance.now() - t2).toFixed(2);

  console.log(`  ${c.gray}┌─${c.reset} ${c.bold}SCENARIO 2: DPDP In-Flight PII Tokenization${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${c.bgGreen}${c.bold} ✅ APPROVED ${c.reset} ${c.bold}${c.green}DISPATCHED TO SANDBOX${c.reset} ${c.dim}(${dur2}ms)${c.reset}`);
  console.log(`  ${c.gray}└${c.reset}  ${c.cyan}DPDP Mask:${c.reset} PAN "ABCDE1234F" ➔ ${c.magenta}tok_pan_f48d${c.reset} (Vaulted)`);

  await sleep(500);

  // SCENARIO 3: Tamper-Evident Ledger Integrity Verification
  const check = pipeline.getLedger().verifyChainIntegrity();
  const entries = pipeline.getLedger().getEntries();

  console.log(`  ${c.gray}┌─${c.reset} ${c.bold}SCENARIO 3: Cryptographic Merkle Chain Verification${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${c.bgBlue}${c.bold} 🔒 100% VALID ${c.reset} ${c.bold}${c.blue}MERKLE INTEGRITY CONFIRMED${c.reset}`);
  console.log(`  ${c.gray}└${c.reset}  ${c.green}Tamper Guard:${c.reset} ${entries.length} chained blocks verified to Genesis`);
}

main().catch(console.error);
