#!/usr/bin/env node
import { AegisHttpServer } from '../src/server.ts';
import { McpServerAdapter } from '../src/mcp/server.ts';
import { WormAuditLedger } from '../src/audit/ledger.ts';
import { existsSync } from 'node:fs';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
🛡️  AegisCore CLI - Deterministic Agent Governance Gateway

Usage:
  aegis start [--port <number>]    Start HTTP Governance Gateway
  aegis mcp                        Start MCP Protocol Stdio Daemon
  aegis audit verify [--file <path>] Verify WORM Audit Ledger Merkle Integrity

Options:
  --port <number>   Gateway port (default: 8080)
  --file <path>     Audit ledger log file path (default: aegis-audit.log)
  --help, -h        Show help message
`);
    process.exit(0);
  }

  switch (command) {
    case 'start': {
      let port = 8080;
      const portIdx = args.indexOf('--port');
      if (portIdx !== -1 && args[portIdx + 1]) {
        port = parseInt(args[portIdx + 1], 10);
      }

      const server = new AegisHttpServer({ port });
      await server.start();
      break;
    }

    case 'mcp': {
      const mcp = new McpServerAdapter();
      mcp.startStdio();
      break;
    }

    case 'audit': {
      const subCommand = args[1];
      if (subCommand === 'verify') {
        let filePath = 'aegis-audit.log';
        const fileIdx = args.indexOf('--file');
        if (fileIdx !== -1 && args[fileIdx + 1]) {
          filePath = args[fileIdx + 1];
        }

        if (!existsSync(filePath)) {
          console.log(`[AegisCore Audit] No ledger file found at '${filePath}'. New ledger has 0 entries (valid).`);
          process.exit(0);
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
