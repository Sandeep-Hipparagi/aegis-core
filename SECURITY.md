# Security Policy & Vulnerability Disclosure

## 🛡️ Commitment to Security

**AegisCore** is designed as a zero-trust, deterministic security gateway for autonomous AI agents. Security, isolation, and fail-closed determinism are our core design principles. We take vulnerabilities and potential bypasses extremely seriously and welcome responsible disclosure from security researchers, contributors, and enterprise adopters.

---

## 📋 Supported Versions

We provide security updates and patches for the following versions:

| Version | Supported | Security Maintenance Status |
| :--- | :---: | :--- |
| `0.1.x` | ✅ | **Active Support & Security Maintenance** |
| `< 0.1.0` | ❌ | Deprecated |

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability, policy bypass, sandbox escape, or information disclosure in AegisCore, **please do NOT open a public GitHub issue.** Public disclosure exposes production agent deployments before a patch can be deployed.

### Private Disclosure Channels

Please report security issues via one of the following methods:

1. **Email**: Send a detailed report to **`hipparagi95@gmail.com`** with the subject line `[SECURITY] AegisCore Vulnerability Report`.
2. **GitHub Security Advisories**: If available on the repository, submit a private advisory via [GitHub Security Advisories](https://github.com/Sandeep-Hipparagi/aegis-core/security/advisories/new).

### Information to Include in Your Report

To help us triage and remediate the issue rapidly, please provide:
- **Description**: Clear description of the vulnerability (e.g., policy evasion, prototype pollution, schema bypass, WORM ledger tampering).
- **Component Affected**: Core pipeline (`src/gateway/pipeline.ts`), policy engine (`src/policy/engine.ts`), sandbox runner (`src/executor/sandboxRunner.ts`), WORM ledger (`src/audit/ledger.ts`), or SDK client (`sdk/src/` or `sdk/python/`).
- **Proof of Concept (PoC)**: Minimal reproducible test case, script, or payload demonstrating the issue.
- **Impact Assessment**: The severity of the exploit (e.g., unauthorized tool execution, PII leakage, denial of service).
- **Suggested Remediation**: (Optional) Recommended patches or configuration adjustments.

---

## ⏱️ Response & Remediation SLA

Our maintainers commit to the following response timeline:

- **Initial Triage & Acknowledgment**: Within **24 hours** of receipt.
- **Vulnerability Assessment & Severity Classification**: Within **48 hours**.
- **Patch Release & Security Advisory (CVE)**: Within **72 to 120 hours** depending on severity.
- **Public Disclosure**: Coordinated disclosure after the patch has been published to npm (`@aegiscore-ai/core`, `@aegiscore-ai/sdk`), PyPI (`aegiscore-ai`), and the Model Context Protocol Registry.

---

## 🔒 Security Invariants & Threat Model

AegisCore enforces five immutable runtime security invariants:

1. **Deterministic Fail-Closed Policy Engine**:
   - If an agent intent lacks explicit permissive authorization, the engine defaults to `BLOCKED`.
   - Invariant thresholds (parameter limits, rate counters, regex matching) are mathematically deterministic and cannot be bypassed via prompt jailbreaks.
2. **Strict Schema & Property Quarantine**:
   - Tool arguments are validated against strict JSON schema definitions.
   - Extra properties, prototype pollution payloads (`__proto__`, `constructor`), and deep recursive structures (`depth > 32`) fail closed immediately.
3. **Decoupled Execution & Environment Sanitization**:
   - Autonomous models never hold direct execution credentials or database connections.
   - The Ephemeral Sandbox Runner purges host `process.env` credentials before tool execution and enforces strict timeout boundaries.
4. **Cryptographic WORM Audit Merkle Chaining**:
   - Every evaluated intent is cryptographically chained with SHA-256 genesis hashing.
   - Any retrospective tampering of audit entries is deterministically detected with index-level localization.
5. **In-Flight DPDP PII Tokenization & Cryptographic Erasure**:
   - Sensitive personal identifiers (PAN, Aadhaar, email, phone numbers) are masked in-flight before entering audit trails.
   - Cryptographic key vault shredding enables statutory Right-to-Erasure compliance without breaking audit chain integrity.

---

## 🏅 Security Verification & External Audit

AegisCore has undergone static analysis and adversarial penetration probing:
- **SkillSpector Static Analysis**: Clean static security audit (0 security risk findings).
- **PentAGI Adversarial Probing**: Evaluated against adversarial evasion, case manipulation, prototype pollution, and boundary condition attacks (SEC-01 through SEC-09 verified with 100% test pass rate).
- **Model Context Protocol Registry Certified**: Published and certified on the official MCP Registry (`io.github.Sandeep-Hipparagi/aegiscore`).
