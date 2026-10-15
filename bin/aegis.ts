#!/usr/bin/env node
import { AegisHttpServer } from '../src/server.ts';
import { McpServerAdapter } from '../src/mcp/server.ts';
import { WormAuditLedger } from '../src/audit/ledger.ts';
import { GatewayPipeline } from '../src/gateway/pipeline.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
🛡️  AegisCore CLI - Deterministic Agent Governance Gateway

Usage:
  aegis start [--port <number>] [--policies <dir>] [--ledger <path>]
  aegis mcp [--policies <dir>] [--ledger <path>]
  aegis audit verify [--file <path>]

Options:
  --port <number>     Gateway HTTP port (default: 8080)
  --policies <dir>    Policy directory to auto-load (default: ./policies)
  --ledger <path>     WORM audit ledger storage file (default: ./aegis-audit.log)
  --file <path>       Ledger file for audit verification (default: ./aegis-audit.log)
  --help, -h          Show help message
`);
    process.exit(0);
  }

  // Common CLI flag resolution
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  };

  const defaultLedgerPath = resolve('./aegis-audit.log');
  const defaultPoliciesDir = resolve('./policies');

  switch (command) {
    case 'start': {
      const port = parseInt(getArg('--port') || process.env.PORT || '8080', 10);
      const ledgerPath = getArg('--ledger') || process.env.AEGIS_AUDIT_LOG || defaultLedgerPath;
      const policiesDir = getArg('--policies') || process.env.AEGIS_POLICIES_DIR || defaultPoliciesDir;

      // Initialize pipeline with persistent WORM ledger
      const ledger = new WormAuditLedger({ storagePath: ledgerPath });
      const pipeline = new GatewayPipeline({ ledger });

      const server = new AegisHttpServer({
        port,
        pipeline,
        policiesDir
      });

      const loadedPoliciesCount = server.loadPoliciesFromDir(policiesDir);

      console.log(`\n🛡️  [AegisCore] Initializing Gateway Daemon...`);
      console.log(`🛡️  [AegisCore] Audit Ledger:   ${ledgerPath}`);
      console.log(`🛡️  [AegisCore] Policies Loaded: ${loadedPoliciesCount} files from ${policiesDir}`);

      await server.start();
      break;
    }

    case 'mcp': {
      const ledgerPath = getArg('--ledger') || process.env.AEGIS_AUDIT_LOG || defaultLedgerPath;
      const policiesDir = getArg('--policies') || process.env.AEGIS_POLICIES_DIR || defaultPoliciesDir;

      const ledger = new WormAuditLedger({ storagePath: ledgerPath });
      const pipeline = new GatewayPipeline({ ledger });

      // Auto-load policies into MCP pipeline
      if (existsSync(policiesDir)) {
        const serverHelper = new AegisHttpServer({ pipeline, policiesDir });
        serverHelper.loadPoliciesFromDir(policiesDir);
      }

      const mcp = new McpServerAdapter(pipeline);
      mcp.startStdio();
      break;
    }

    case 'audit': {
      const subCommand = args[1];
      if (subCommand === 'verify') {
        const filePath = getArg('--file') || defaultLedgerPath;

        if (!existsSync(filePath)) {
          console.error(`[AegisCore Audit] ❌ Error: Ledger file not found at '${filePath}'.`);
          process.exit(1);
        }

        const ledger = new WormAuditLedger({ storagePath: filePath });
        const result = ledger.verifyChainIntegrity();

        if (result.isValid) {
          console.log(`[AegisCore Audit] ✅ Chain integrity verified. Total entries: ${ledger.length}. Genesis links valid.`);
          process.exit(0);
        } else {
          console.error(`[AegisCore Audit] ❌ Chain integrity VIOLATION detected at index ${result.brokenAtIndex}: ${result.reason}`);
          process.exit(1);
        }
      } else {
        console.error(`Unknown audit subcommand '${subCommand}'. Use 'aegis audit verify'.`);
        process.exit(1);
      }
      break;
    }

    default: {
      console.error(`Unknown command '${command}'. Run 'aegis --help' for usage.`);
      process.exit(1);
    }
  }
}

void main();
