# Upstream Pull Request Payload: Model Context Protocol (MCP) Registry

This document contains the exact pull request title, description, and metadata ready for submission to:
1. **Official MCP Servers Directory**: `https://github.com/modelcontextprotocol/servers`
2. **Official MCP Registry Catalog**: `https://github.com/modelcontextprotocol/registry` (and `registry.modelcontextprotocol.io`)
3. **Awesome MCP Servers Directory**: `https://github.com/punkpeye/awesome-mcp-servers`

---

## 1. Pull Request Title
```text
feat(servers): add AegisCore - Deterministic Zero-Trust Policy & WORM Audit Gateway
```

---

## 2. Pull Request Body / Description

```markdown
### Summary
This PR adds **AegisCore** to the Model Context Protocol directory. AegisCore functions as a universal, drop-in zero-trust governance sidecar for MCP tools.

### What is AegisCore?
AegisCore sits between MCP clients (e.g., Claude Desktop, Cursor, Cline, LibreChat) and downstream tool implementations. It treats frontier LLMs as unprivileged actors:

- **Deterministic Schema Invariants**: Fail-closed parameter validation prevents parameter smuggling and jailbreak payload injection.
- **Sub-Millisecond Policy Invariants (< 2ms)**: Declarative rules enforce transaction caps, session rate limits, and blacklisted database targets before execution.
- **In-Flight DPDP/PII Tokenization**: Intercepts and masks sensitive personal identifiers (PAN, Aadhaar, phone numbers, emails, credit cards) into ephemeral salted tokens.
- **Cryptographic WORM Audit Ledger**: Appends every tool proposal, policy verdict, and execution digest to a tamper-evident SHA-256 Merkle chain chained to Genesis.
- **Asynchronous HITL Control Plane**: Holds high-blast-radius actions in a time-locked challenge state until cryptographically approved by an authorized human officer.
- **Zero Prompt-Leakage Stdio Framing**: Automatically redirects all internal diagnostic logging to `process.stderr`, preserving clean JSON-RPC protocol transport over `stdout`.

### Package Links & Repositories
- **Source Repository**: https://github.com/Sandeep-Hipparagi/aegis-core
- **NPM Package**: `@aegiscore-ai/core` (https://www.npmjs.com/package/@aegiscore-ai/core)
- **NPM SDK**: `@aegiscore-ai/sdk` (https://www.npmjs.com/package/@aegiscore-ai/sdk)
- **PyPI Package**: `aegiscore-ai` (https://pypi.org/project/aegiscore-ai/)
- **License**: Apache-2.0

### Client Configuration (Claude Desktop)
```json
{
  "mcpServers": {
    "aegiscore": {
      "command": "npx",
      "args": ["-y", "@aegiscore-ai/core", "mcp"]
    }
  }
}
```

### Verification
- Tested with standard MCP JSON-RPC 2.0 stdio communication.
- Verified zero stdout stream corruption during policy enforcement and ledger hashing.
- 45 automated unit and integration tests passing across TypeScript and Python runtimes.
```

---

## 3. Directory Table Row Entry (for Markdown Registries)

```markdown
| [AegisCore](https://github.com/Sandeep-Hipparagi/aegis-core) | Deterministic zero-trust policy enclave, DPDP PII sanitizer, and cryptographic WORM audit ledger for MCP tools. | `npx -y @aegiscore-ai/core mcp` | Node.js / TypeScript |
```

---

## 4. MCP Registry `server.json` Entry

The canonical `server.json` manifest is published in the root of the AegisCore repository:
- Path: [`server.json`](../server.json)
- Namespace: `io.github.sandeep-hipparagi/aegiscore`
- Schema: `https://static.modelcontextprotocol.io/schemas/2024-11-05/server.schema.json`
