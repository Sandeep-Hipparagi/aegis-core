"""
OpenAI Tool-Call Interceptor for AegisCore
"""

import json
from typing import Any, Dict, List, Optional
from ..client import AegisGateway


class AegisOpenAIInterceptor:
    """
    Intercepts and governs OpenAI-style function tool calls through AegisCore.
    """

    def __init__(self, gateway: Optional[AegisGateway] = None, gateway_url: str = "http://localhost:8080"):
        self.gateway = gateway or AegisGateway(base_url=gateway_url)

    def intercept_tool_call(self, tool_call: Any) -> Dict[str, Any]:
        """
        Intercepts a single OpenAI tool_call object and executes through AegisCore.
        Returns a dict suitable for appending to OpenAI conversation messages.
        """
        # Support dict or pydantic/object structure
        if isinstance(tool_call, dict):
            tool_id = tool_call.get("id", "")
            func = tool_call.get("function", {})
            name = func.get("name", "")
            arguments = func.get("arguments", "{}")
        else:
            tool_id = getattr(tool_call, "id", "")
            func = getattr(tool_call, "function", None)
            name = getattr(func, "name", "") if func else ""
            arguments = getattr(func, "arguments", "{}") if func else "{}"

        raw_resp = self.gateway.execute_tool(
            tool_call_id=tool_id,
            name=name,
            arguments=arguments
        )

        allowed = raw_resp.get("allowed", False)
        verdict = raw_resp.get("verdict", "BLOCKED")
        reason = raw_resp.get("reason", "Policy invariant violation")
        execution = raw_resp.get("execution")

        if not allowed:
            content = json.dumps({
                "error": "AEGIS_GOVERNANCE_BLOCKED",
                "verdict": verdict,
                "message": reason
            })
        else:
            output = execution.get("output") if isinstance(execution, dict) else {"status": "SUCCESS"}
            content = json.dumps(output)

        return {
            "tool_call_id": tool_id,
            "role": "tool",
            "name": name,
            "content": content
        }
