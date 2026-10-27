# Changelog

All notable changes to the **AegisCore** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.3] - 2026-10-27

### Added
- **Official Model Context Protocol Registry Publication**: Published `io.github.Sandeep-Hipparagi/aegiscore@0.1.3` to the official MCP Registry (`https://registry.modelcontextprotocol.io/v0.1/servers?search=aegiscore`).
- **Policy Pack Edge-Case Test Suite (`tests/policy_packs_edge_cases.test.ts`)**: Added 13 exhaustive unit tests covering:
  - Destructive DDL evasion patterns (`DROP TABLE`, `TRUNCATE`, `ALTER TABLE DROP`) under `policies/data-governance.json`.
  - Case-insensitive identity vault targets and DPO role authorization guards under `policies/dpdp-india.json`.
  - Bulk customer export escalation thresholds (>100 records).
  - Fintech boundary defenses, non-positive amounts, supported currency whitelists (`USD`, `EUR`, `GBP`, `INR`, `SGD`), and dual-custody approval thresholds (> $25,000) under `policies/fintech-guardrails.json`.
- **Fault Recovery & Resilience Test Suite (`tests/failure_recovery.test.ts`)**: Added 15 unit tests covering:
  - Synchronous and asynchronous sandbox tool exceptions with zero host stack trace leakage.
  - Safe coercion of non-Error thrown objects (strings, numbers, objects).
  - Sandbox timeout guard enforcement.
  - Zero-trust default behavior blocking execution when no permissive rule authorizes the intent.
  - Single-bit WORM audit ledger corruption detection with index localization.
  - Mutex-serialized concurrent asynchronous ledger writes.
  - HITL replay attack prevention and TTL expiry fail-closed enforcement.
  - SDK network failure, HTTP 500 error, and schema validation error recovery.
- **Python SDK Parity & Failure Recovery Tests (`sdk/python/tests/test_client.py`)**:
  - Expanded Python SDK test suite from 11 to 15 tests, achieving 91% code coverage (99% client coverage).
  - Added test cases for `test_dispatch_schema_error_with_raise`, `test_dispatch_schema_error_without_raise`, `test_gateway_connection_failure_recovery`, and `test_gateway_http_500_recovery`.
- **Dual-Language Native Coverage Gates in CI**:
  - Added `npm run test:coverage` using Node.js 22 native test runner (`--experimental-test-coverage`) with 0 external dependencies.
  - Added `npm run test:python:coverage` with an automated CI gate enforcing `--fail-under=85` for the Python SDK.
- **TypeScript & Python Exception Parity**:
  - Added typed exception classes in TypeScript (`AegisError`, `AegisGatewayError`, `AegisPolicyBlockedError`, `AegisSchemaError`, `AegisHitlRequiredError`) in `@aegiscore-ai/sdk` and `@aegiscore-ai/core` matching the Python `aegiscore.exceptions` module.
- **Security & Governance Documentation**:
  - Added `SECURITY.md` covering vulnerability disclosure policy, response SLAs, and immutable runtime security invariants.
  - Added architecture execution flow diagram and verified empirical micro-benchmark latency metrics to `README.md`.

### Changed
- **Regex Policy Engine Hardening**: Enhanced `MATCHES_REGEX` operator in `src/policy/engine.ts` to automatically extract Python/cross-platform inline regex case-insensitive flags (`(?i)`) into standard JavaScript `RegExp(pattern, 'i')`, preventing syntax errors during cross-platform policy evaluation.
- Preserved strict **2-build-dependency constraint** (`@types/node`, `typescript`) with **0 runtime dependencies**.

---

## [0.1.2] - 2026-10-25

### Added
- **Adversarial Penetration Testing Probes & Security Invariants (`tests/security_penetration.test.ts`)**:
  - `SEC-01`: Metadata PII sanitization and forbidden control flag quarantine.
  - `SEC-02`: Persistent session identifier tracking in `AegisClient` and session-based rate limiting.
  - `SEC-03`: Fail-closed CLI audit verification exiting with code 1 on non-existent or corrupted ledger files.
  - `SEC-06`: Case-insensitive and lowercase PII tokenization for PAN cards and mixed-case identifiers.
  - `SEC-07`: Deep object nesting protection (depth ceiling = 32) and circular reference defense preventing Denial-of-Service (DoS) and stack overflow.
  - `SEC-07`: Prototype pollution defense blocking `__proto__`, `constructor`, and `prototype` manipulation at all nesting levels.
  - `SEC-08`: Case-insensitive blacklist and sanctions enforcement preventing casing evasion (`SaNcTiOnEd-AcCt-999`).
  - `SEC-09`: Strict boundary rejection of non-positive numbers, `NaN`, `Infinity`, and `-Infinity`.
- **External Security Audit Report (`AUDIT_REPORT.md`)**:
  - Published comprehensive production readiness assessment, DevSecOps report, and empirical latency micro-benchmarks.

### Changed
- Refactored `AegisClient` in TypeScript and Python to auto-assign and persist unique session IDs across multi-turn agent interactions.

---

## [0.1.1] - 2026-10-22

### Added
- **DPDP Act Compliance Engine**:
  - In-flight salted PII tokenizer (`src/privacy/sanitizer.ts`) masking Indian PAN, Aadhaar numbers, phone numbers, and email addresses.
  - Cryptographic key vault with `shredVault()` functionality enabling statutory Right-to-Erasure compliance while preserving Merkle chain continuity.
- **Interactive Terminal Demos & Video Previews**:
  - Added automated demonstration scripts and scenario GIFs (`scripts/demo-scenario-1.js`, `scripts/demo-scenario-2.js`, `scripts/demo-scenario-3.js`).
  - Added live banking invariant demonstration (`examples/banking-agent.ts`).

---

## [0.1.0] - 2026-10-18

### Added
- **Core Architecture**:
  - Deterministic Zero-Trust Policy Engine (`src/policy/engine.ts`) with mathematical invariant validation (`LTE`, `GTE`, `ONE_OF`, `MATCHES_REGEX`, `RATE_LIMIT`).
  - Strict JSON Schema Quarantine (`src/validator/schemaValidator.ts`) rejecting extra injected fields.
  - Cryptographic WORM Audit Ledger (`src/audit/ledger.ts`) with SHA-256 genesis block chaining.
  - Ephemeral Sandbox Runner (`src/executor/sandboxRunner.ts`) with environment scrubbing and timeout guards.
  - Asynchronous Human-in-the-Loop (HITL) Interceptor (`src/hitl/interceptor.ts`) with cryptographic ticket signing.
- **Interfaces & Distribution**:
  - High-performance HTTP Gateway daemon (`src/server.ts`) with endpoints for dispatch, evaluation, HITL resolution, and audit integrity verification.
  - Stdio Model Context Protocol (MCP) server adapter (`src/mcp/server.ts`).
  - CLI binary (`bin/aegis.ts`) supporting `start`, `verify`, and `mcp` subcommands.
  - Dual SDK libraries for TypeScript (`@aegiscore-ai/sdk`) and Python (`aegiscore-ai`).
