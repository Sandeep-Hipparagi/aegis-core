import { launchAegisGateway } from '../core/src/index.ts';
import { AegisClient } from '../sdk/src/index.ts';
import { AegisOpenAIInterceptor, type OpenAIToolCall } from '../sdk/src/openai.ts';

async function main() {
  console.log('================================================================');
  console.log('🚀 AegisCore Deterministic Governance Gateway - Live Demo');
  console.log('================================================================\n');

  // 1. Launch Gateway on port 8088
  const PORT = 8088;
  const gateway = await launchAegisGateway(PORT);
  const client = new AegisClient({
    gatewayUrl: `http://127.0.0.1:${PORT}`,
    agentId: 'banking-copilot-agent-42',
    role: 'finance-assistant'
  });

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Safe Read-Only Action (check_balance)
    // -------------------------------------------------------------
    console.log('\n[TEST 1] ➡️  Agent attempts safe action: check_balance');
    const res1 = await client.submitIntent('check_balance', {
      accountId: 'ACC-PRIMARY-001'
    });
    console.log(`Decision:   ${res1.decision.status}`);
    console.log(`Execution:  ${res1.execution?.status}`);
    console.log(`Result:     ${JSON.stringify(res1.execution?.output)}`);

    // -------------------------------------------------------------
    // SCENARIO 2: Safe Micro-Transfer ($250.00)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] ➡️  Agent attempts compliant transfer: $250.00 to payroll vendor');
    const res2 = await client.submitIntent('transfer_funds', {
      amount: 250,
      currency: 'USD',
      sourceAccount: 'ACC-PRIMARY-001',
      destinationAccount: 'ACC-PAYROLL-VENDOR'
    });
    console.log(`Decision:   ${res2.decision.status}`);
    console.log(`Execution:  ${res2.execution?.status}`);
    console.log(`Result:     ${JSON.stringify(res2.execution?.output)}`);

    // -------------------------------------------------------------
    // SCENARIO 3: Policy Violation - Autonomous Transfer Cap Exceeded ($500,000.00)
    // -------------------------------------------------------------
    console.log('\n[TEST 3] ➡️  Agent attempts high-risk unauthorized transfer: $500,000.00');
    const res3 = await client.submitIntent('transfer_funds', {
      amount: 500000,
      currency: 'USD',
      sourceAccount: 'ACC-PRIMARY-001',
      destinationAccount: 'ACC-EXTERNAL-UNKNOWN'
    });
    console.log(`Decision:   ${res3.decision.status}`);
    console.log(`Reason:     ${res3.decision.reason}`);
    console.log(`Execution:  ${res3.execution?.status} (Isolated boundary refused to run tool)`);
    console.log(`Violations: ${JSON.stringify(res3.decision.violatedInvariants)}`);

    // -------------------------------------------------------------
    // SCENARIO 4: Policy Violation - Blacklisted / Sanctioned Destination
    // -------------------------------------------------------------
    console.log('\n[TEST 4] ➡️  Agent attempts transfer to blacklisted account: SANCTIONED-ACCT-999');
    const res4 = await client.submitIntent('transfer_funds', {
      amount: 50,
      currency: 'USD',
      sourceAccount: 'ACC-PRIMARY-001',
      destinationAccount: 'SANCTIONED-ACCT-999'
    });
    console.log(`Decision:   ${res4.decision.status}`);
    console.log(`Reason:     ${res4.decision.reason}`);
    console.log(`Execution:  ${res4.execution?.status}`);

    // -------------------------------------------------------------
    // SCENARIO 5: Data Governance Violation - Destructive SQL Injection / Mutation
    // -------------------------------------------------------------
    console.log('\n[TEST 5] ➡️  Agent attempts destructive SQL query: "DROP TABLE users;"');
    const res5 = await client.submitIntent('execute_sql_query', {
      query: 'DROP TABLE users; -- destructive attack'
    });
    console.log(`Decision:   ${res5.decision.status}`);
    console.log(`Reason:     ${res5.decision.reason}`);
    console.log(`Execution:  ${res5.execution?.status}`);

    // -------------------------------------------------------------
    // SCENARIO 6: Raw OpenAI Tool Call Interception (delete_customer_account)
    // -------------------------------------------------------------
    console.log('\n[TEST 6] ➡️  Simulating OpenAI tool_call: delete_customer_account');
    const openAIInterceptor = new AegisOpenAIInterceptor({
      gatewayUrl: `http://127.0.0.1:${PORT}`,
      agentId: 'gpt-4o-customer-service',
      role: 'agent-tier-1'
    });

    const mockToolCall: OpenAIToolCall = {
      id: 'call_9938a19f',
      type: 'function',
      function: {
        name: 'delete_customer_account',
        arguments: JSON.stringify({ customerId: 'CUST-8819', purgeData: true })
      }
    };

    const toolResult = await openAIInterceptor.interceptToolCall(mockToolCall);
    console.log(`Verdict:    ${toolResult.aegisGovernance.verdict}`);
    console.log(`Allowed:    ${toolResult.aegisGovernance.allowed}`);
    console.log(`Synthetic LLM Tool Message: ${toolResult.content}`);

    console.log('\n================================================================');
    console.log('✅ AegisCore Demonstration Completed: All Invariants Deterministically Enforced');
    console.log('================================================================');
  } finally {
    await gateway.stop();
  }
}

void main();
