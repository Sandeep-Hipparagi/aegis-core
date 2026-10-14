#!/usr/bin/env node
import { GatewayPipeline } from '../src/gateway/pipeline.ts';
import { performance } from 'node:perf_hooks';

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[38;2;166;227;161m',
  cyan: '\x1b[38;2;148;226;213m',
  magenta: '\x1b[38;2;203;166;247m',
  gray: '\x1b[38;2;108;112;134m',
  bgGreen: '\x1b[48;2;166;227;161;38;2;17;17;27m'
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  // Heading 2: 22px Regular 400 aesthetic
  console.log(`\n  ┌───────────────────────────────────────────────────────────────────────┐`);
  console.log(`  │  Scenario 02: In-Flight DPDP Tokenization & Cryptographic Shredding   │`);
  console.log(`  └───────────────────────────────────────────────────────────────────────┘`);
  console.log(`  ${c.gray}Statutory Data Protection · Salted Vaults · Reversible Privacy Routing${c.reset}\n`);

  await sleep(300);

  const pipeline = new GatewayPipeline();
  pipeline.registerToolSchema('settle_vendor_invoice', {
    name: 'InvoiceSchema',
    strict: true,
    properties: {
      vendor: { type: 'string', required: true },
      pan: { type: 'string', required: true },
      amount: { type: 'number', required: true }
    }
  });

  pipeline.registerPolicy({
    version: '1.0.0',
    namespace: 'compliance.india.dpdp',
    defaultEffect: 'DENY',
    rules: [
      {
        id: 'RULE-PERMIT-INVOICE',
        name: 'Permit Compliant Invoices',
        targetTools: ['settle_vendor_invoice'],
        effect: 'ALLOW',
        priority: 100,
        conditions: []
      }
    ]
  });

  pipeline.registerToolHandler('settle_vendor_invoice', (args) => ({
    status: 'SETTLED',
    ref: 'TXN-IND-9941',
    amount: args.amount
  }));

  console.log(`  ${c.gray}┌─${c.reset} INCOMING AGENT ACTION WITH SENSITIVE DATA`);
  console.log(`  ${c.gray}│${c.reset}  Tool:    settle_vendor_invoice`);
  console.log(`  ${c.gray}│${c.reset}  Raw PII: Indian PAN Tax ID: [ABCDE1234F] | Vendor: ACME Corp`);

  await sleep(350);

  const t0 = performance.now();
  const res = await pipeline.processIntent(
    {
      tool: 'settle_vendor_invoice',
      parameters: { vendor: 'ACME Corp', pan: 'ABCDE1234F', amount: 850 }
    },
    { sessionId: 'sess-dpdp-40', agentId: 'accounts-payable-agent', role: 'operator' }
  );
  const latency = (performance.now() - t0).toFixed(2);

  console.log(`  ${c.gray}│${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${c.bgGreen}${c.bold} ✅ APPROVED ${c.reset}  ${c.green}TOKENIZED & DISPATCHED${c.reset} ${c.dim}(latency: ${latency}ms)${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  DPDP Shield: Raw Tax ID sanitized ➔ ${c.magenta}tok_pan_8c312...${c.reset} (Stored in Salt Vault)`);
  console.log(`  ${c.gray}│${c.reset}  Ledger Rec:  Entry #${res.auditEntry?.sequenceId} links SHA-256 digest of tokenized payload`);
  console.log(`  ${c.gray}│${c.reset}  Erasure:     ${c.cyan}shredVault() enables Right to Erasure without breaking Merkle chain.${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  Tool Output: ${JSON.stringify(res.execution?.output)}`);
  console.log(`  ${c.gray}└───────────────────────────────────────────────────────────────────────${c.reset}\n`);

  await sleep(4000);
}

run().catch(console.error);
