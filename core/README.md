# @aegiscore-ai/core

Deterministic Zero-Trust Policy Engine, Cryptographic WORM Audit Ledger, and Isolated Execution Boundary for AI Agents.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![NPM Version](https://img.shields.io/npm/v/@aegiscore-ai/core.svg)](https://www.npmjs.com/package/@aegiscore-ai/core)

## Overview

Frontier LLMs emit non-deterministic tool call payloads that cannot be trusted with direct execution privileges. `@aegiscore-ai/core` provides the embedded systems foundation for deterministic agent governance:

1. **Deterministic Schema Invariants**: Fail-closed strict validation enforcing typed contracts.
2. **Declarative Invariant Policy Engine**: High-precedence invariant rules (rate limits, transaction thresholds, blacklisted schemas).
3. **Cryptographic WORM Audit Ledger**: Append-only tamper-evident Merkle-linked audit log.
4. **DPDP-Compliant PII Sanitization**: Salted tokenization and cryptographic shredding of personal identifiers.
5. **Asynchronous Human-in-the-Loop (HITL) Interceptor**: Cryptographic ticket creation, TTL expiry, and signature verification.
6. **Isolated Sandbox Runner**: Decoupled execution boundary sanitized of host environment secrets.

## Installation

```bash
npm install @aegiscore-ai/core
```

## Programmatic Usage

```typescript
import {
  GatewayPipeline,
  PolicyEngine,
  SchemaValidator,
  WormAuditLedger,
  SandboxRunner,
  AegisHttpServer
} from '@aegiscore-ai/core';

// 1. Initialize Core Pipeline
const pipeline = new GatewayPipeline();

// 2. Register Tool Schemas
pipeline.registerToolSchema('transfer_funds', {
  name: 'TransferFundsSchema',
  strict: true,
  properties: {
    amount: { type: 'number', required: true, min: 1 },
    recipient: { type: 'string', required: true }
  }
});

// 3. Register Safe Execution Handler
pipeline.registerToolHandler('transfer_funds', async (params) => {
  return { status: 'SETTLED', txId: 'tx-12345', amount: params.amount };
});

// 4. Evaluate & Dispatch Intent
const result = await pipeline.processIntent(
  {
    tool: 'transfer_funds',
    parameters: { amount: 500, recipient: 'ACC-01' }
  },
  {
    sessionId: 'session-101',
    agentId: 'finance-agent',
    role: 'operator'
  }
);

console.log('Result Status:', result.status);
```

## Standalone Gateway Daemon

```typescript
import { launchAegisGateway } from '@aegiscore-ai/core';

// Launches HTTP gateway and registers policy packs from ./policies
const server = await launchAegisGateway(8080);
console.log('AegisCore Gateway running on port 8080');
```

## License

Apache-2.0
