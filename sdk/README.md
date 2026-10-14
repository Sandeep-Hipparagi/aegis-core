# @aegiscore-ai/sdk

Lightweight, zero-dependency client SDK for **AegisCore** — the Deterministic Zero-Trust Policy & Cryptographic WORM Audit Gateway for AI Agents.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![NPM Version](https://img.shields.io/npm/v/@aegiscore-ai/sdk.svg)](https://www.npmjs.com/package/@aegiscore-ai/sdk)

## Features

- **Zero External Dependencies**: Uses native runtime `fetch` and ES2022 primitives.
- **Drop-in Framework Integrations**:
  - **OpenAI Tool Calls**: Intercept and validate LLM tool calls (`AegisOpenAIInterceptor`).
  - **Model Context Protocol (MCP)**: Wrap and inspect tool invocations (`AegisMCPInterceptor`).
  - **LangChain / LangGraph**: Wrap agent node tools into zero-trust governed tools (`AegisLangGraphWrapper`).
- **Comprehensive TypeScript Types**: Native typings and source maps included.

## Installation

```bash
npm install @aegiscore-ai/sdk
```

## Quick Start

### 1. General Intent Evaluation (`AegisClient`)

```typescript
import { AegisClient } from '@aegiscore-ai/sdk';

const aegis = new AegisClient({
  gatewayUrl: 'http://localhost:8080',
  agentId: 'autonomous-finance-bot',
  role: 'operator'
});

// Submit tool proposal for deterministic policy evaluation
const response = await aegis.submitIntent('transfer_funds', {
  amount: 2500,
  destinationAccount: 'ACC-VEND-104'
});

if (response.decision.executionAllowed) {
  console.log('Action Approved & Executed:', response.execution?.output);
} else {
  console.error('Action Blocked:', response.decision.reason);
}
```

### 2. OpenAI Function / Tool Call Interception

```typescript
import { AegisOpenAIInterceptor } from '@aegiscore-ai/sdk';

const interceptor = new AegisOpenAIInterceptor({
  gatewayUrl: 'http://localhost:8080',
  agentId: 'gpt-4o-customer-service',
  role: 'support-agent'
});

// Inside your OpenAI completion loop:
for (const toolCall of message.tool_calls) {
  // Evaluates invariants, tokenizes PII, and executes safely if allowed
  const toolResult = await interceptor.interceptToolCall(toolCall);
  
  // Directly append to conversation messages for OpenAI
  messages.push(toolResult);
}
```

### 3. Model Context Protocol (MCP) Interceptor

```typescript
import { AegisMCPInterceptor } from '@aegiscore-ai/sdk';

const mcpInterceptor = new AegisMCPInterceptor({
  gatewayUrl: 'http://localhost:8080',
  agentId: 'claude-desktop-client'
});

// Intercept tools/call request
const toolResponse = await mcpInterceptor.interceptCallTool({
  method: 'tools/call',
  params: {
    name: 'query_database',
    arguments: { query: 'SELECT * FROM users' }
  }
});
```

### 4. LangGraph / LangChain Tool Wrapper

```typescript
import { AegisLangGraphWrapper } from '@aegiscore-ai/sdk';

const wrapper = new AegisLangGraphWrapper({
  gatewayUrl: 'http://localhost:8080',
  agentId: 'langgraph-agent'
});

// Wrap any tool with pre-flight invariant gating
const secureTransferTool = wrapper.wrapTool(rawTransferTool);
```

## License

Apache-2.0
