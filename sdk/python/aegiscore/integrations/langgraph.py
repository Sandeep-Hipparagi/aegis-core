"""
LangGraph and LangChain Integration for AegisCore
"""

from typing import Any, Callable, Dict, Optional
from ..client import AegisGateway
from ..exceptions import AegisPolicyBlockedError


class AegisLangGraphWrapper:
    """
    Wraps standard LangChain/LangGraph tools with AegisCore deterministic governance.
    """

    def __init__(self, gateway: Optional[AegisGateway] = None, gateway_url: str = "http://localhost:8080"):
        self.gateway = gateway or AegisGateway(base_url=gateway_url)

    def wrap_tool(self, tool_name: str, tool_func: Callable[..., Any]) -> Callable[..., Any]:
        """
        Wraps a Python function/tool so that all calls are evaluated by AegisCore before execution.
        """
        gateway = self.gateway

        def governed_tool(**kwargs: Any) -> Any:
            # 1. Pre-flight evaluation
            result = gateway.dispatch(tool=tool_name, arguments=kwargs, raise_on_blocked=False)
            if not result.is_success:
                raise AegisPolicyBlockedError(
                    f"Action '{tool_name}' was rejected by AegisCore: {result.reason}",
                    violations=result.violations,
                    raw_result=result.raw
                )
            
            # 2. If the gateway executed in sandbox, return that output; otherwise run the wrapped func
            if result.output is not None:
                return result.output

            return tool_func(**kwargs)

        governed_tool.__name__ = getattr(tool_func, "__name__", tool_name)
        governed_tool.__doc__ = getattr(tool_func, "__doc__", "")
        return governed_tool
