# DPDP Act Compliance & Enterprise Data Protection Guide

India's **Digital Personal Data Protection (DPDP) Act, 2023** imposes stringent statutory obligations on organizations processing digital personal data. When enterprises deploy autonomous AI agents capable of querying databases, analyzing user records, or executing transactions, those agents act as automated extensions of the **Data Fiduciary**.

AegisCore provides the systems architecture required to deploy AI agents in strict compliance with the DPDP Act.

---

## 1. Key DPDP Challenges for Autonomous AI Agents

| DPDP Requirement | The Risk with Autonomous Agents | How AegisCore Solves It |
|---|---|---|
| **Section 6: Purpose Limitation & Minimization** | Frontier LLMs request broader database reads or full table exports than necessary for their task. | **Declarative Invariant Policy Engine** blocks unneeded tables and limits export volumes (`DPDP-002`, `DPDP-003`). |
| **Section 8(5): Reasonable Security Safeguards** | Agents log raw PII into stdout, vector embeddings, third-party log providers, or LLM contexts. | **In-Flight DPDP Sanitizer** intercepts and tokenizes Aadhaar, PAN, phone numbers, and emails before logging or transmission. |
| **Section 12: Right to Erasure / Forgotten** | Audit logs or Merkle ledgers containing raw PII cannot be modified without corrupting cryptographic hashes. | **Cryptographic Shredding**: PII is stored as salted tokens in audit logs; destroying the private salt vault shreds the data permanently while preserving Merkle chain integrity. |
| **Section 8(6): Irreversible Data Erasure Control** | An agent could be jailbroken into executing hard record deletions across production databases. | **Supervisor Escalation (`DPDP-001`)**: Permanent record purges are blocked unless authenticated by a human Data Protection Officer (DPO). |

---

## 2. Supported Indian Personal Identifiers

AegisCore's sanitizer automatically detects and tokenizes:
- **Aadhaar Numbers**: 12-digit Indian national identity numbers with optional spaces/hyphens (`\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b`).
- **Permanent Account Number (PAN)**: 10-character alphanumeric tax identifiers (`\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b`).
- **Indian Mobile Numbers**: 10-digit mobile numbers prefixed with optional `+91` (`(?:\+91[\s-]?)?[6-9]\d{9}\b`).
- **Email Addresses**: RFC-compliant email detection.
- **Payment Card Numbers**: Credit/debit card numbers validated with the Luhn checksum algorithm.

---

## 3. Cryptographic Shredding Architecture

```
[Agent Emits Payload]
       │  { "customer": "Rajesh Kumar", "pan": "ABCDE1234F", "aadhaar": "5432 1234 5678" }
       ▼
[DPDP Sanitizer] ─── Salted SHA-256 Tokenization ───> [Private Vault (In-Memory / KMS)]
       │                                                      │
       ▼                                                      │
[Sanitized Payload]                                           │
  { "customer": "Rajesh Kumar",                               │
    "pan": "tok_pan_8f1a23e9...",                             │
    "aadhaar": "tok_aadhaar_c4b9..." }                        │
       │                                                      │
       ▼                                                      │
[WORM Merkle Audit Ledger]                                    │
  - Append-only hash chain                                    │
  - Never stores raw PII                                      │
                                                              ▼
                                                   [Right to Erasure Request]
                                                              │
                                                              ▼
                                                   [shredVault(sessionVault)]
                                                              │
                                                              ▼
                                                    Plaintext unrecoverable;
                                                    Merkle chain remains intact!
```

---

## 4. Activating the DPDP Policy Pack

AegisCore includes a pre-configured DPDP policy pack located in [`policies/dpdp-india.json`](../policies/dpdp-india.json):

```bash
# Launch AegisCore with DPDP governance active
aegis start --policies ./policies/dpdp-india.json --port 8080
```

### Invariant Rules Defined in `dpdp-india.json`:
1. **`DPDP-001-BLOCK-UNAUTHORIZED-PURGE`**: Blocks any agent from invoking irreversible purge operations (`purge_user_data`, `delete_customer_profile`) unless the caller role is explicitly `data-protection-officer-human`.
2. **`DPDP-002-BLOCK-UNMASKED-IDENTITY-TARGETS`**: Strict zero-trust block on queries targeting unmasked identity repositories (`aadhaar_vault`, `pan_identity_registry`, `raw_biometrics`, `kyc_documents`).
3. **`DPDP-003-ESCALATE-BULK-DATA-EXPORT`**: Intercepts any export query proposing to export $> 100$ customer records, forcing an asynchronous Human-in-the-Loop challenge before data can leave the enclave.
4. **`DPDP-004-ALLOW-SANITY-CHECK`**: Grants autonomous permissions only to aggregated and anonymized read metrics.

---

## 5. Community & Developer Adoption Channels in India

To engage the Indian developer and enterprise ecosystem:
- **IndiaAI Mission & Developer Groups**: Present AegisCore as an open-source DPDP compliance reference architecture for enterprise agent adoption.
- **HasGeek / Rootconf / The Fifth Elephant**: Technical workshops demonstrating cryptographic shredding in production LLM pipelines.
- **Bangalore & Hyderabad AI Meetups**: Live coding sessions routing LangGraph and CrewAI agents through AegisCore.
