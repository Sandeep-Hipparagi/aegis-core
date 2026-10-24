# aegiscore-py

Official, zero-dependency Python client for **AegisCore** — the Deterministic Zero-Trust Policy & Cryptographic WORM Audit Gateway for AI Agents.

<!-- mcp-name: io.github.Sandeep-Hipparagi/aegiscore -->

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Python Version](https://img.shields.io/badge/python-3.8+-blue.svg)](https://pypi.org/project/aegiscore-ai/)

## Installation

```bash
pip install aegiscore-ai
```

*Note: `aegiscore-ai` is 100% zero-dependency, implemented purely using Python's standard library (`urllib.request`, `json`, `dataclasses`).*

## Quick Start

### 1. Direct Tool Proposal Dispatch

```python
from aegiscore import AegisGateway

gateway = AegisGateway("http://localhost:8080")

# Dispatch tool intent: evaluates schema, invariants, tokenizes PII, logs WORM audit
result = gateway.dispatch(
    tool="transfer_funds",
    arguments={"amount": 2500, "recipient": "ACC-PAYROLL"},
    session_id="sess_01"
)

if result.is_success:
    print("Action Approved & Executed:", result.output)
elif result.requires_hitl:
    print(f"Action escalated to human approval. Ticket ID: {result.ticket_id}")
else:
    print(f"Action BLOCKED: {result.reason}")
    for violation in result.violations:
        print(f" - {violation}")
```

### 2. LangGraph & LangChain Integration

```python
from aegiscore import AegisGateway
from aegiscore.integrations import AegisLangGraphWrapper

gateway = AegisGateway("http://localhost:8080")
wrapper = AegisLangGraphWrapper(gateway=gateway)

# Wrap any native function or tool
@wrapper.wrap_tool("query_database", raw_query_func)
def safe_query_database(query: str):
    return raw_query_func(query)

# Calls are intercepted and verified against policy invariants before invocation
safe_query_database(query="SELECT * FROM users")
```

### 3. OpenAI Function Call Interception

```python
from aegiscore import AegisGateway
from aegiscore.integrations import AegisOpenAIInterceptor

gateway = AegisGateway("http://localhost:8080")
interceptor = AegisOpenAIInterceptor(gateway=gateway)

# In your chat completion loop:
for tool_call in response.choices[0].message.tool_calls:
    # Evaluates policy and returns tool response dict formatted for OpenAI
    tool_message = interceptor.intercept_tool_call(tool_call)
    messages.append(tool_message)
```

### 4. Human-in-the-Loop (HITL) Resolution

```python
# Check pending ticket and resolve with cryptographic signature
gateway.resolve_hitl(
    ticket_id="ticket-12345",
    decision="APPROVED",
    signature="sig-supervisor-ed25519"
)
```

### 5. Forensic Cryptographic Ledger Verification

```python
# Verifies the tamper-evident WORM Merkle chain
audit = gateway.verify_audit_integrity()
print(f"Ledger Valid: {audit['isValid']}")
```

## License

Apache-2.0
