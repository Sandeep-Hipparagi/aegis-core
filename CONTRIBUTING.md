# Contributing to AegisCore

Thank you for your interest in contributing to **AegisCore**! We are building the open-source, deterministic agent governance gateway and zero-trust policy enclave for autonomous AI agents.

---

## 1. Zero-Trust Design Philosophy

When contributing to AegisCore, all code and architectural decisions must strictly adhere to our core security invariants:

1. **Fail-Closed by Default**:
   - If a schema field is unrecognized, reject with `REJECTED_SCHEMA`.
   - If no explicit policy allows an intent, the decision is strictly `BLOCKED` (`[ZERO-TRUST DEFAULT]`).
   - If an approval ticket expires, it cannot be signed off.

2. **Deterministic Evaluation (No Stochastic Code in Security Boundaries)**:
   - Security policies and invariants are evaluated strictly by deterministic rule algorithms.
   - LLMs or probabilistic models must **never** be used to judge whether an action is safe inside the policy engine.

3. **Strict Intent-Execution Decoupling**:
   - AI agents and clients never receive raw database credentials, bank connection tokens, or production private keys.
   - Agents emit an `IntentPayload`. AegisCore verifies the intent and executes it inside an isolated `SandboxRunner` only if approved.

4. **Cryptographic WORM Provenance**:
   - Every proposal, verdict, and execution is recorded into an append-only SHA-256 Merkle chain.
   - PII must be tokenized before ledger append to preserve DPDP/GDPR compliance without breaking Merkle chains.

---

## 2. Local Environment Setup

### Prerequisites
- **Node.js**: v22.0.0 or higher (supports native TypeScript via `--experimental-strip-types`)
- **Docker** (optional, for containerized workflows)

### Repository Setup
```bash
# Clone the repository
git clone https://github.com/Sandeep-Hipparagi/aegis-core.git
cd aegis-core

# Verify Node version
node -v  # Expected: v22.x+
```

---

## 3. Running & Testing

### Running Tests
AegisCore uses the built-in Node.js test runner (`node:test` and `node:assert/strict`):

```bash
# Run all unit and integration test suites
npm test

# Run tests plus live banking invariant demo
npm run test:all
```

### Running the Live Banking Demo
```bash
npm run demo:banking
```

### Running the HTTP Gateway
```bash
node --experimental-strip-types bin/aegis.ts start --port 8080
```

### Verifying WORM Audit Ledger
```bash
node --experimental-strip-types bin/aegis.ts audit verify
```

---

## 4. Code Structure & Conventions

- `src/validator/`: Strict typing and fail-closed schema validators.
- `src/policy/`: Deterministic invariant policy engine.
- `src/audit/`: Write-Once-Read-Many (WORM) cryptographic audit ledger.
- `src/executor/`: Sandboxed tool execution boundary with timeout and environment scrubbing.
- `src/privacy/`: DPDP-compliant PII detection, tokenization, and vault shredding.
- `src/hitl/`: Asynchronous Human-in-the-Loop challenge/resolution engine.
- `src/gateway/`: Unified pipeline coordinator.
- `src/server.ts`: Native HTTP gateway proxy.
- `src/mcp/`: Model Context Protocol stdio adapter.
- `policies/`: Declarative JSON policy packs.
- `tests/`: End-to-end integration and unit test suites.

---

## 5. Submitting Pull Requests

1. Create a feature branch: `git checkout -b feature/my-new-invariant`
2. Write unit tests in `tests/` covering positive and negative cases.
3. Ensure all tests pass: `npm test`
4. Commit with descriptive conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
5. Open a Pull Request against `main`. All PRs must pass the GitHub Actions CI pipeline.
