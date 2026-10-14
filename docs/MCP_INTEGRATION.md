# Model Context Protocol (MCP) Registry & Integration Guide

AegisCore functions as a drop-in **zero-trust security and audit sidecar** for MCP tools. It inspects and verifies tool invocations passing between frontier AI clients (such as Claude Desktop, Cursor, or LibreChat) and local or remote MCP servers.

---

## 1. Official MCP Server Directory Submission

To register AegisCore in the official [`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers) repository:

### PR Title
`Add AegisCore - Deterministic Zero-Trust Policy & Audit Gateway`

### Entry Description (`README.md` / Directory Card)
```markdown
### AegisCore
* **Repository**: [Sandeep-Hipparagi/aegis-core](https://github.com/Sandeep-Hipparagi/aegis-core)
* **Description**: Deterministic zero-trust policy enclave, fail-closed schema validator, DPDP PII sanitizer, and cryptographic WORM audit ledger for MCP tools.
* **Protocol**: stdio and HTTP/SSE
* **License**: Apache-2.0
```

---

## 2. Claude Desktop Integration

To route all tool calls in Claude Desktop through AegisCore:

### Edit Configuration:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Configuration Snippet:
```json
{
  "mcpServers": {
    "aegiscore": {
      "command": "node",
      "args": [
        "c:/Users/sudh3/Downloads/AegisCore/dist/bin/aegis.js",
        "mcp",
        "--policies",
        "c:/Users/sudh3/Downloads/AegisCore/policies",
        "--log",
        "c:/Users/sudh3/Downloads/AegisCore/aegis-audit.log"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

*When installed globally via npm (`npm install -g @aegiscore/core`):*
```json
{
  "mcpServers": {
    "aegiscore": {
      "command": "aegis",
      "args": ["mcp", "--policies", "./policies", "--log", "./aegis-audit.log"]
    }
  }
}
```

---

## 3. Cursor & VSCode Cline Configuration

For Cursor or VSCode Cline extension settings:

```json
{
  "mcp.servers": {
    "aegis-gateway": {
      "type": "stdio",
      "command": "npx",
      "args": ["@aegiscore/core", "mcp"]
    }
  }
}
```

---

## 4. How AegisCore Protects MCP Tool Calls

```
┌─────────────────┐       JSON-RPC Stdio       ┌─────────────────┐       Sanitized       ┌─────────────────┐
│  Claude Desktop │ ─────────────────────────> │    AegisCore    │ ────────────────────> │ Actual Tool / DB│
│  (Untrusted LLM)│ <───────────────────────── │ MCP Interceptor │ <──────────────────── │ Execution       │
└─────────────────┘      Blocked or Allowed    └────────┬────────┘       Safe Output     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │ Cryptographic   │
                                               │ WORM Audit Log  │
                                               └─────────────────┘
```

1. **Stdio Safety**: All diagnostic logs are redirected to `process.stderr`, preserving clean JSON-RPC protocol framing over `stdout`.
2. **Deterministic Schema Invariants**: Tool calls with unexpected arguments or parameter smuggling are rejected before touching downstream systems.
3. **In-Flight DPDP/PII Tokenization**: Sensitive IDs (Aadhaar, PAN, emails, phone numbers) are tokenized before reaching the immutable audit ledger.
4. **Forensic Non-Repudiation**: Every tool invocation and policy decision is appended to a tamper-evident SHA-256 Merkle chain.
