"""
AegisCore Python Client - Zero-dependency gateway wrapper
"""

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional, Union
import uuid

from .exceptions import (
    AegisGatewayError,
    AegisPolicyBlockedError,
    AegisSchemaError,
    AegisHitlRequiredError,
)
from .models import DispatchResult


class AegisGateway:
    """
    Zero-dependency Python client for the AegisCore Deterministic Governance Gateway.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8080",
        agent_id: str = "python-agent",
        role: str = "operator",
        default_headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.role = role
        self.default_headers = default_headers or {}
        self.timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Internal helper for standard HTTP requests using urllib."""
        url = f"{self.base_url}{path}"
        req_headers = {
            "Content-Type": "application/json",
            "User-Agent": "aegiscore-python/0.1.0",
            **self.default_headers,
        }
        if headers:
            req_headers.update(headers)

        body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body_bytes, headers=req_headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                resp_text = response.read().decode("utf-8")
                return json.loads(resp_text) if resp_text else {}
        except urllib.error.HTTPError as err:
            err_text = err.read().decode("utf-8") if err.fp else ""
            try:
                parsed = json.loads(err_text)
            except Exception:
                parsed = None

            # 403 Forbidden is used for BLOCKED actions
            if err.code == 403 and parsed and isinstance(parsed, dict):
                return parsed

            # 400 Bad Request is used for SCHEMA_ERROR
            if err.code == 400 and parsed and isinstance(parsed, dict) and parsed.get("status") == "SCHEMA_ERROR":
                return parsed

            raise AegisGatewayError(
                f"AegisCore Gateway HTTP {err.code}: {err.reason} - {err_text}",
                status_code=err.code,
                response_body=err_text,
            ) from err
        except urllib.error.URLError as err:
            raise AegisGatewayError(f"Connection to AegisCore Gateway failed ({url}): {err.reason}") from err

    def dispatch(
        self,
        tool: str,
        arguments: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        role: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        raise_on_blocked: bool = False,
    ) -> DispatchResult:
        """
        Dispatches a proposed tool invocation to AegisCore for invariant checking,
        DPDP PII tokenization, policy evaluation, WORM audit logging, and sandbox execution.
        """
        sid = session_id or f"sess-{uuid.uuid4().hex[:12]}"
        aid = agent_id or self.agent_id
        r = role or self.role
        params = arguments if arguments is not None else {}

        payload = {
            "tool": tool,
            "parameters": params,
            "metadata": metadata or {},
            "context": {
                "sessionId": sid,
                "agentId": aid,
                "role": r,
            },
        }

        raw = self._request("POST", "/v1/gateway/dispatch", data=payload)
        status = raw.get("status", "UNKNOWN")
        reason = raw.get("reason")
        violations = raw.get("violations", [])
        challenge = raw.get("challenge")
        audit_entry = raw.get("auditEntry")

        output = None
        if "execution" in raw and isinstance(raw["execution"], dict):
            output = raw["execution"].get("output")

        result = DispatchResult(
            status=status,
            intent_id=raw.get("intentId"),
            session_id=sid,
            tool=tool,
            reason=reason,
            output=output,
            violations=violations,
            challenge=challenge,
            audit_entry=audit_entry,
            raw=raw,
        )

        if raise_on_blocked and status == "BLOCKED":
            raise AegisPolicyBlockedError(
                f"Tool invocation '{tool}' was BLOCKED: {reason}",
                violations=violations,
                raw_result=raw,
            )

        if raise_on_blocked and status == "SCHEMA_ERROR":
            raise AegisSchemaError(
                f"Tool invocation '{tool}' failed schema validation: {reason}",
                raw_result=raw,
            )

        return result

    def evaluate_intent(
        self,
        tool: str,
        parameters: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        role: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Submits an intent to /v1/intent/evaluate returning canonical IntentEvaluationResponse."""
        aid = agent_id or self.agent_id
        payload = {
            "tool": tool,
            "parameters": parameters or {},
            "metadata": metadata or {},
            "agent": {
                "agentId": aid,
                "role": role or self.role,
                "sessionId": session_id or f"sess-{uuid.uuid4().hex[:12]}",
            },
        }
        return self._request("POST", "/v1/intent/evaluate", data=payload, headers={"X-Agent-Id": aid})

    def execute_tool(
        self,
        tool_call_id: str,
        name: str,
        arguments: Union[str, Dict[str, Any]],
        agent_id: Optional[str] = None,
        role: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Proxies an OpenAI tool call to /v1/tools/execute."""
        aid = agent_id or self.agent_id
        payload = {
            "tool_call_id": tool_call_id,
            "name": name,
            "arguments": arguments,
            "agent_id": aid,
            "role": role or self.role,
        }
        return self._request("POST", "/v1/tools/execute", data=payload, headers={"x-agent-id": aid})

    def resolve_hitl(
        self,
        ticket_id: str,
        decision: str = "APPROVED",
        signature: str = "sig-officer-signature",
        scoped_credentials: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Resolves an asynchronous Human-in-the-Loop challenge ticket."""
        payload = {
            "decision": decision,
            "approverSignature": signature,
            "scopedCredentials": scoped_credentials or {},
        }
        return self._request("POST", f"/v1/hitl/challenges/{ticket_id}/resolve", data=payload)

    def verify_audit_integrity(self) -> Dict[str, Any]:
        """Queries the cryptographic WORM ledger to verify Merkle chain integrity."""
        return self._request("GET", "/v1/audit/integrity")

    def health(self) -> Dict[str, Any]:
        """Checks gateway daemon health."""
        return self._request("GET", "/health")


# Alias for developer ergonomics
AegisClient = AegisGateway
