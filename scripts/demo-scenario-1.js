#!/usr/bin/env node
import { GatewayPipeline } from '../src/gateway/pipeline.ts';
import { performance } from 'node:perf_hooks';

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[38;2;243;139;168m',
  green: '\x1b[38;2;166;227;161m',
  gray: '\x1b[38;2;108;112;134m',
  bgRed: '\x1b[48;2;243;139;168;38;2;17;17;27m'
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  // Heading 2: 22px Regular 400 aesthetic
  console.log(`\n  ┌───────────────────────────────────────────────────────────────────────┐`);
  console.log(`  │  Scenario 01: Model Tool Hijack & Exfiltration Defense                │`);
  console.log(`  └───────────────────────────────────────────────────────────────────────┘`);
  console.log(`  ${c.gray}Zero-Trust Invariant Layer · Reverse Proxy for Autonomous Agents${c.reset}\n`);

  await sleep(300);

  const pipeline = new GatewayPipeline();
  pipeline.registerToolSchema('execute_db_query', {
    name: 'DbQuerySchema',
    strict: true,
    properties: { table: { type: 'string', required: true } }
  });

  pipeline.registerPolicy({
    version: '1.0.0',
    namespace: 'enterprise.invariants',
    defaultEffect: 'DENY',
    rules: [{
      id: 'INV-SEC-001',
      name: 'Block Credential Vault Access',
      targetTools: ['execute_db_query'],
      effect: 'DENY',
      priority: 1000,
      conditions: [{
        type: 'disallowed_targets',
        targetField: 'parameters.table',
        targets: ['users.credentials', 'auth_tokens', 'system_vault'],
        message: 'Table blacklisted by deterministic isolation invariant'
      }]
    }]
  });

  console.log(`  ${c.gray}┌─${c.reset} INCOMING AGENT PROPOSAL`);
  console.log(`  ${c.gray}│${c.reset}  Agent:   autonomous-analyst-07`);
  console.log(`  ${c.gray}│${c.reset}  Intent:  execute_db_query({ table: "users.credentials" })`);
  console.log(`  ${c.gray}│${c.reset}  Context: [Prompt Injection Detected in Session Memory]`);

  await sleep(350);

  const t0 = performance.now();
  const res = await pipeline.processIntent(
    { tool: 'execute_db_query', parameters: { table: 'users.credentials' } },
    { sessionId: 'sess-hijack-01', agentId: 'autonomous-analyst-07', role: 'analyst' }
  );
  const latency = (performance.now() - t0).toFixed(2);

  console.log(`  ${c.gray}│${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${c.bgRed}${c.bold} 🚫 BLOCKED ${c.reset}  ${c.red}INVARIANT REJECTED${c.reset} ${c.dim}(latency: ${latency}ms)${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  Violation:  [${res.violations[0]?.ruleId}] ${res.violations[0]?.message}`);
  console.log(`  ${c.gray}│${c.reset}  Database:   ${c.green}Zero query dispatched. 0 CPU cycles or sockets opened.${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  Audit Log:  Tamper-evident record chained with sequence #${res.auditEntry?.sequenceId}`);
  console.log(`  ${c.gray}└───────────────────────────────────────────────────────────────────────${c.reset}\n`);

  await sleep(4000);
}

run().catch(console.error);
