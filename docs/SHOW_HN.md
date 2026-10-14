# Show HN Launch Narrative & Technical Breakdown

### Post Title
```text
Show HN: AegisCore – Deterministic governance and WORM audit enclave for AI agents
```

---

### Body

Hey HN,

We built **AegisCore** ([GitHub](https://github.com/Sandeep-Hipparagi/aegis-core)): a sub-millisecond, deterministic zero-trust policy proxy and cryptographic WORM audit ledger for autonomous AI agents.

### The Problem: Prompt "Guardrails" Are An Architectural Anti-Pattern

Most current agent security relies on LLM-as-a-judge evaluators, prompt injection detection classifiers, or system prompt instructions ("Do not transfer more than $1,000"). 

Treating a non-deterministic transformer model as a trusted execution boundary is fundamentally flawed:
1. **Adversarial Drift & Jailbreaks**: Jailbreaks, indirect prompt injections, and token-smuggling bypass soft boundaries reliably.
2. **Probabilistic Non-Determinism**: If you ask an LLM 10,000 times whether an action violates policy, a non-zero percentage of calls will hallucinate or fail.
3. **Audit Repudiation**: When an agent deletes a database table or initiates an unauthorized transaction, standard logs can be tampered with or lack non-repudiable cryptographic proof of intent.
4. **Privacy vs. Immutability Conflict**: Under privacy regulations like India's DPDP Act and the EU GDPR, users have a Right to Erasure ("shred my data"). If you write raw PII to an immutable cryptographic log, you cannot delete it without breaking the cryptographic chain.

### The Solution: Treat AI Agents As Untrusted Insider Risks

AegisCore sits directly between your autonomous agent framework (OpenAI, LangGraph, CrewAI, AutoGen, or Model Context Protocol tools) and your database/APIs as a native systems-level gateway.

```
┌─────────────────┐       Unchecked Tool Call      ┌────────────────────────────────────────────────────────┐
│ Autonomous Agent│ ─────────────────────────────> │                       AegisCore                        │
│ (Untrusted LLM) │                                │  1. In-Flight Salted PII Tokenizer                     │
└─────────────────┘                                │  2. Fail-Closed Schema Invariant Validator             │
                                                   │  3. Deterministic Policy Invariant Engine (< 1ms)      │
                                                   │  4. Cryptographic WORM Merkle Audit Ledger             │
                                                   │  5. Asynchronous HMAC-Signed HITL Gate                 │
                                                   │  6. Ephemeral Sanitized Sandbox Runner                 │
                                                   └──────────────────────────┬─────────────────────────────┘
                                                                              │
                                                                   Approved & Sanitized
                                                                              │
                                                                              ▼
                                                                   ┌──────────────────────┐
                                                                   │ Real Database / APIs │
                                                                   └──────────────────────┘
```

### Core Architecture & Capabilities

1. **Fail-Closed Schema Invariants**:
   Strict type validation. Unrecognized fields or type coercions are dropped or immediately trigger `REJECTED_SCHEMA`. Parameter smuggling cannot reach the execution environment.

2. **Declarative Invariant Policy Engine (< 1ms)**:
   Evaluates boolean operator invariants (`EQUALS`, `LESS_THAN_OR_EQUAL`, `NOT_IN`, `MATCHES_REGEX`) and structural boundary limits (session rate limits, transaction monetary ceilings, blacklisted database tables). If no permissive rule exists, it fails closed (`DENY`).

3. **In-Flight DPDP Tokenization & Cryptographic Shredding**:
   Automatically detects and tokenizes Indian PAN cards, Aadhaar numbers, phone numbers, emails, and financial credentials into ephemeral salted tokens (`tok_pan_8f1a...`). The mapping is stored in an isolated, shreddable vault. When a user requests data erasure, the vault is shredded—the plaintext is gone forever, but the WORM audit Merkle chain remains intact and cryptographically verifiable.

4. **Cryptographic WORM (Write-Once-Read-Many) Audit Ledger**:
   Every proposed intent, policy verdict, violation trace, and execution digest is canonicalized and chained to a genesis block via SHA-256 Merkle hashes. Any tampering with past records breaks the hash pointer and can be verified via `aegis audit verify`.

5. **Asynchronous Human-in-the-Loop (HITL) Interceptor**:
   Actions exceeding autonomous blast radiuses (e.g., transfers > $10,000 or bulk record exports) are halted into a `REQUIRES_HITL` state. The gateway emits a time-locked challenge ticket (HMAC-SHA256 signed with TTL) that must be approved by an authorized human officer before execution is unlocked.

6. **Isolated Sandbox Runner**:
   Decouples tool invocation. The execution runner strips `process.env` credentials and host secrets, runs with hard timeout abort signals, and catches faults without exposing internal stack traces to the agent.

### Performance & Tooling

- **Evaluation Latency**: Evaluates schemas and policy invariants in **< 1.5 milliseconds**.
- **Zero Heavy Runtime Dependencies**: Pure native Node.js runtime and zero-dependency Python client.
- **Language & Framework Support**:
  - TypeScript/Node: `@aegiscore-ai/core` and `@aegiscore-ai/sdk`
  - Python: `aegiscore` (`pip install aegiscore`)
  - Protocol: Model Context Protocol (MCP) stdio and HTTP/JSON REST API (`POST /v1/gateway/dispatch`)
  - Framework Adapters: LangGraph, LangChain, OpenAI Tool Calling, Claude Desktop

### Quick Code Example (Python)

```python
from aegiscore import AegisGateway

gateway = AegisGateway("http://localhost:8080")

# Dispatches tool intent: intercepts PII, checks invariants, writes WORM log
result = gateway.dispatch(
    tool="transfer_funds",
    arguments={"amount": 250000, "recipient": "ACC-OFFSHORE-99"},
    session_id="sess_01"
)

if result.is_blocked:
    print("Action Blocked by Deterministic Invariant:", result.reason)
    # Prints: Invariant violation: Transfer amount exceeds autonomous limit ($10,000)
```

The repo is 100% open source under Apache 2.0:
https://github.com/Sandeep-Hipparagi/aegis-core

We'd love your feedback on the architecture, policy syntax, and ledger implementation!
