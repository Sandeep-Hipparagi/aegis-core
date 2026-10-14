# 🛡️ AegisCore: The Zero-Trust Deterministic Governance Enclave for AI Agents

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](sdk/python)
[![CI](https://img.shields.io/badge/CI-Passing-brightgreen.svg)](.github/workflows/ci.yml)
[![Zero-Trust](https://img.shields.io/badge/Security-Zero--Trust_Enclave-red.svg)](#zero-trust-architecture)
[![DPDP Ready](https://img.shields.io/badge/Compliance-DPDP_Ready-orange.svg)](docs/DPDP_COMPLIANCE.md)

> **AegisCore** is an open-source reverse-proxy, deterministic invariant policy enclave, and cryptographic WORM audit ledger for autonomous AI agents. It intercepts model tool calls, validates them against strict schemas and deterministic invariants, and only executes approved actions within an isolated boundary.

---

### 📺 30-Second Terminal Showcase

```text
╔═══════════════════════════════════════════════════════════════════════════════════════╗
║   🛡️  AEGISCORE — Deterministic Zero-Trust Policy Enclave & WORM Audit Gateway       ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝

[STEP 1/3] Intercepting Out-of-Bounds Agent Mutation...
Agent: 'autonomous-analyst-07' | Tool: 'query_database' | Target: 'users.credentials'
  🚫 VERDICT: [BLOCKED] in 1.42ms
  Reason:     [INVARIANT REJECTED] Target table is blacklisted by zero-trust invariant
  Sandbox:    Tool execution prevented with 0 CPU cycles on host database.

[STEP 2/3] In-Flight DPDP PII Tokenization & Cryptographic Ledgering...
Agent requests compliant transfer with sensitive Indian PAN: 'ABCDE1234F'
  ✅ VERDICT: [APPROVED & EXECUTED] in 0.93ms
  PII Masking: Raw PAN masked to ephemeral token in immutable audit record.
  Ledger Seq:  Entry #2 | Prev Hash: f38ebf8cc2ffc3215ca31e8d...
  Entry Hash:  f2480954b7569dcda891cb2e61ecf2b5a09b8cba758a7177f2d3b49afd921daf

[STEP 3/3] Verifying Tamper-Evident WORM Merkle Ledger...
Command: 'aegis audit verify' — Traversing cryptographic pointers to Genesis
  🔒 INTEGRITY CHECK: PASSED (100% VALID)
  Total Entries: 2 | Genesis Hash: 0000000000000000000000000000000000000000000000000000000000000000
  Head Entry:    f2480954b7569dcda891cb2e61ecf2b5a09b8cba758a7177f2d3b49afd921daf
```

*Run this live:* `node --experimental-strip-types scripts/terminal-demo.js`

---

## 📦 Developer Packages & Distribution

| Package | Language / Protocol | Status | Description |
|---|---|---|---|
| [`@aegiscore/core`](core) | Node.js / TypeScript | Available | Core deterministic engine, WORM ledger, and HTTP gateway daemon |
| [`@aegiscore/sdk`](sdk) | TypeScript | Available | Zero-dependency client for OpenAI tool calls, LangGraph, and MCP |
| [`aegiscore`](sdk/python) | Python (>=3.8) | Available | Zero-dependency Python client for LangGraph, CrewAI, AutoGen |
| [MCP Adapter](docs/MCP_INTEGRATION.md) | JSON-RPC Stdio | Available | Native sidecar for Claude Desktop, Cursor, and LibreChat |
| [DPDP Guide](docs/DPDP_COMPLIANCE.md) | Documentation | Complete | India DPDP Act 2023 compliance architecture & cryptographic shredding |
| [Show HN](docs/SHOW_HN.md) | Community | Ready | Hacker News launch narrative & technical breakdown |

---

## ⚡ The Core Problem: Why Prompt Guardrails Fail

Modern AI agent architectures couple model intent directly to tool execution. Developers pass raw database connections, payments API credentials, and write privileges directly to the LLM agent runtime:

```
[User / Jailbreak Prompt] ──> [LLM Model Weights] ──> [Direct Tool Execution] ──> 🔥 Disaster
```

**Why prompt guardrails cannot guarantee security:**
1. **Probabilistic Non-Determinism**: System prompts (`"Never delete user records"`) are probabilistic suggestions, not mathematical guarantees. Adversarial jailbreaks, indirect prompt injections, and context drift routinely bypass prompt instructions.
2. **Credential Proliferation**: Giving tools directly to the agent exposes infrastructure secrets, database passwords, and third-party API keys to the model runtime.
3. **Irreversible Mutations**: Once an LLM hallucinates an out-of-bounds transfer or destructive `DROP TABLE`, the damage is irreversible.

### The AegisCore Solution: Strict Intent-Execution Decoupling

AegisCore strips all execution power from the agent. The agent produces only an **Intent Proposal**. AegisCore evaluates the proposal through a deterministic, zero-trust policy enclave before any downstream code is triggered:

```
                                  AEGIS-CORE GATEWAY ENCLAVE
                             ┌────────────────────────────────────────┐
                             │ 1. DPDP PII Tokenizer & Vault          │
                             │ 2. Strict Schema Quarantine            │
[Agent Intent] ──(Proposal)──>│ 3. Invariant Engine (Rate / Bounds)   │──(Only if APPROVED)──> [Isolated Execution Boundary]
                             │ 4. WORM Cryptographic Merkle Chain    │                          │ (Sanitized Env / Timeout)
                             │ 5. Asynchronous HITL Escalation Gating │                          ▼
                             └────────────────────────────────────────┘                 [Real Backend / DB / API]
```

---

## 📊 Core Architecture

```text
               +-------------------------------------------------------------+
               |                       AI AGENT LOOP                         |
               |             (LangGraph / MCP / Raw OpenAI)                  |
               +-------------------------------------------------------------+
                                              |
                                     (POST /v1/gateway/dispatch)
                                              v
+-------------------------------------------------------------------------------------------+
|                                 AEGIS-CORE GATEWAY PIPELINE                               |
|                                                                                           |
|  [Step 1: PII Sanitizer]   ──> Detects PAN, Aadhaar, Phone, Email & tokenizes via salt     |
|  [Step 2: Schema Validate] ──> Enforces strict types; extra fields fail closed            |
|  [Step 3: Policy Engine]   ──> Invariants: param_boundary, rate_limit, disallowed_targets  |
|                                                                                           |
|       |                              |                                       |            |
|       | (BLOCKED)                    | (REQUIRES_HITL)                       | (APPROVED) |
|       v                              v                                       v            |
|  [WORM Ledger Entry]        [HITL Challenge Created]                   [WORM Ledger Entry]|
|  Return 403 Forbidden       Wait for Supervisor Signoff               Dispatch to Sandbox |
+------------------------------------------------------------------------------|------------+
                                                                               v
                                                          +---------------------------------+
                                                          |    ISOLATED SANDBOX RUNNER      |
                                                          |  - process.env secrets scrubbed |
                                                          |  - Hard safety timeout abort    |
                                                          |  - Stack trace leak isolation   |
                                                          +---------------------------------+
                                                                               |
                                                                               v
                                                                  [Protected Real System]
```

---

## 🚀 60-Second Quickstart

### Option A: Local CLI
```bash
# Clone and verify
git clone https://github.com/Sandeep-Hipparagi/aegis-core.git
cd aegis-core

# Run full test suite (31 tests across 10 suites)
npm test

# Start HTTP Gateway daemon on port 8080
node --experimental-strip-types bin/aegis.ts start --port 8080
```

### Option B: Docker Compose
```bash
# Spin up AegisCore gateway with persistent audit volume
docker compose up -d

# Check health
curl http://localhost:8080/health
# {"status":"healthy","version":"0.1.0"}
```

### Option C: Run Banking Invariant Demonstration
```bash
npm run demo:banking
```

---

## 🧩 Model Context Protocol (MCP) Integration

AegisCore provides a native stdio Model Context Protocol (MCP) server.

### Claude Desktop Setup
Add AegisCore to your Claude Desktop configuration (`claude_desktop_config.json`):

**macOS / Linux:**
```json
{
  "mcpServers": {
    "aegiscore": {
      "command": "node",
      "args": ["--experimental-strip-types", "/path/to/AegisCore/bin/aegis.ts", "mcp"]
    }
  }
}
```

**Windows:**
```json
{
  "mcpServers": {
    "aegiscore": {
      "command": "node",
      "args": ["--experimental-strip-types", "C:\\Users\\username\\Downloads\\AegisCore\\bin\\aegis.ts", "mcp"]
    }
  }
}
```

### Cursor IDE Setup
In Cursor Settings ➔ Features ➔ MCP Servers ➔ Add New MCP Server:
- **Name**: `AegisCore`
- **Type**: `command`
- **Command**: `node --experimental-strip-types <PATH_TO_AEGISCORE>/bin/aegis.ts mcp`

---

## 💎 Feature Matrix

| Feature | AegisCore Guarantee | Traditional Prompt Guardrails |
| :--- | :--- | :--- |
| **Schema Quarantine** | **Fail-closed.** Extra or injected fields throw `REJECTED_SCHEMA` immediately. | Vulnerable to prompt injection parameter smuggling. |
| **Invariant Policy Engine** | **Deterministic.** Mathematical rules (e.g., `amount <= 10000`, max 5 calls/min). | Probabilistic instructions that degrade with conversation length. |
| **DPDP Compliance** | **Automated.** Aadhaar, PAN, phone numbers & emails tokenized; vault shredding. | Raw PII permanently leaked into model context & logs. |
| **WORM Audit Ledger** | **Cryptographic Merkle Chain.** SHA-256 hash chaining detects any tampering. | Mutable, unchained plain text log files. |
| **Ephemeral Sandbox** | **Scrubbed Environment.** `process.env` stripped of keys; timeout guards. | Full environment and network socket access given to LLM. |
| **Async HITL Gating** | **Cryptographic Gating.** High-risk actions held in PENDING state until signed. | "Please ask user" prompts easily bypassed by prompt injection. |

---

## 🛡️ Pre-Configured Policy Packs

AegisCore ships with enterprise policy packs in `/policies`:

- [`policies/dpdp-india.json`](file:///c:/Users/sudh3/Downloads/AegisCore/policies/dpdp-india.json): Enforces India's Digital Personal Data Protection Act. Restricts bulk customer data exports, blocks unmasked identity table access, and requires Data Protection Officer authorization for customer profile purges.
- [`policies/fintech-guardrails.json`](file:///c:/Users/sudh3/Downloads/AegisCore/policies/fintech-guardrails.json): Enforces transaction ceilings, whitelists operating currencies (`USD`, `EUR`, `INR`, `GBP`), and requires dual-custody supervisor approval for transactions over $25,000.
- [`policies/banking-policy.json`](file:///c:/Users/sudh3/Downloads/AegisCore/policies/banking-policy.json): Limits autonomous transfers to $10,000, blocks sanctioned/blacklisted destinations, and escalates mid-value transfers.
- [`policies/data-governance.json`](file:///c:/Users/sudh3/Downloads/AegisCore/policies/data-governance.json): Prohibits destructive DDL statements (`DROP TABLE`, `TRUNCATE`) and unauthorized account deletions.

---

## 📜 HTTP Gateway API Reference

### `POST /v1/gateway/dispatch`
Submit an intent proposal for evaluation and execution.
```bash
curl -X POST http://localhost:8080/v1/gateway/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "transfer_funds",
    "parameters": {
      "amount": 250,
      "recipient": "ACC-SUPPLIER-01"
    },
    "context": {
      "sessionId": "sess-prod-001",
      "agentId": "copilot-agent",
      "role": "finance-operator"
    }
  }'
```

### `POST /v1/hitl/challenges/:ticketId/resolve`
Resolve a pending Human-in-the-Loop approval challenge.
```bash
curl -X POST http://localhost:8080/v1/hitl/challenges/hitl-uuid-1234/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "APPROVED",
    "approverSignature": "sig-compliance-officer-99"
  }'
```

### `GET /v1/audit/integrity`
Cryptographically verify ledger Merkle chain integrity.
```bash
curl http://localhost:8080/v1/audit/integrity
# {"isValid":true}
```

---

## 🤝 Contributing

We welcome community contributions! Please review [`CONTRIBUTING.md`](CONTRIBUTING.md) for local environment setup, zero-trust invariants, and pull request guidelines.

---

## 📄 License

Licensed under the **Apache License 2.0**. See [`LICENSE`](LICENSE) for details.
