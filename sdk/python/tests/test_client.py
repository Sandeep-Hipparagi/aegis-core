"""
Unit tests for AegisCore Python SDK
"""

import json
import unittest
from unittest.mock import patch, MagicMock
import io
import urllib.error

from aegiscore import (
    AegisGateway,
    AegisClient,
    DispatchResult,
    AegisGatewayError,
    AegisPolicyBlockedError,
    AegisSchemaError,
)
from aegiscore.integrations import (
    AegisLangGraphWrapper,
    AegisOpenAIInterceptor,
)


class TestAegisPythonSDK(unittest.TestCase):

    def setUp(self):
        self.gateway = AegisGateway(base_url="http://127.0.0.1:8080", agent_id="test-agent", role="tester")

    def test_client_alias(self):
        self.assertIs(AegisClient, AegisGateway)
        client = AegisClient(base_url="http://localhost:9090")
        self.assertEqual(client.base_url, "http://localhost:9090")

    def test_dispatch_result_helpers(self):
        res_success = DispatchResult(
            status="SUCCESS",
            tool="check_balance",
            output={"balance": 5000}
        )
        self.assertTrue(res_success.is_success)
        self.assertFalse(res_success.is_blocked)
        self.assertFalse(res_success.requires_hitl)
        self.assertIsNone(res_success.ticket_id)

        res_hitl = DispatchResult(
            status="REQUIRES_HITL",
            tool="transfer_funds",
            challenge={"ticketId": "tick-999", "status": "PENDING"}
        )
        self.assertFalse(res_hitl.is_success)
        self.assertTrue(res_hitl.requires_hitl)
        self.assertEqual(res_hitl.ticket_id, "tick-999")

        res_blocked = DispatchResult(
            status="BLOCKED",
            tool="purge_data",
            reason="Unauthorized role"
        )
        self.assertTrue(res_blocked.is_blocked)

    @patch("urllib.request.urlopen")
    def test_dispatch_success(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "status": "SUCCESS",
            "intentId": "int-101",
            "execution": {
                "status": "SUCCESS",
                "output": {"txId": "tx-12345", "amount": 100}
            }
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.gateway.dispatch("transfer_funds", {"amount": 100, "recipient": "bob"})
        self.assertTrue(res.is_success)
        self.assertEqual(res.output, {"txId": "tx-12345", "amount": 100})
        self.assertEqual(res.intent_id, "int-101")

    @patch("urllib.request.urlopen")
    def test_dispatch_blocked_without_raise(self, mock_urlopen):
        err_body = json.dumps({
            "status": "BLOCKED",
            "reason": "Exceeds daily budget",
            "violations": [{"ruleId": "RULE-01", "message": "Limit exceeded"}]
        }).encode("utf-8")
        mock_fp = io.BytesIO(err_body)
        http_err = urllib.error.HTTPError("http://127.0.0.1:8080/v1/gateway/dispatch", 403, "Forbidden", {}, mock_fp)
        mock_urlopen.side_effect = http_err

        res = self.gateway.dispatch("transfer_funds", {"amount": 1000000}, raise_on_blocked=False)
        self.assertTrue(res.is_blocked)
        self.assertEqual(res.reason, "Exceeds daily budget")
        self.assertEqual(len(res.violations), 1)

    @patch("urllib.request.urlopen")
    def test_dispatch_blocked_with_raise(self, mock_urlopen):
        err_body = json.dumps({
            "status": "BLOCKED",
            "reason": "Target table blacklisted",
            "violations": [{"ruleId": "RULE-SENSITIVE"}]
        }).encode("utf-8")
        mock_fp = io.BytesIO(err_body)
        http_err = urllib.error.HTTPError("http://127.0.0.1:8080/v1/gateway/dispatch", 403, "Forbidden", {}, mock_fp)
        mock_urlopen.side_effect = http_err

        with self.assertRaises(AegisPolicyBlockedError) as ctx:
            self.gateway.dispatch("query_database", {"targetTable": "users.credentials"}, raise_on_blocked=True)

        self.assertIn("Target table blacklisted", str(ctx.exception))

    @patch("urllib.request.urlopen")
    def test_dispatch_schema_error_with_raise(self, mock_urlopen):
        err_body = json.dumps({
            "status": "SCHEMA_ERROR",
            "reason": "Missing required field 'accountId'",
            "violations": [{"code": "REJECTED_SCHEMA", "path": "accountId"}]
        }).encode("utf-8")
        mock_fp = io.BytesIO(err_body)
        http_err = urllib.error.HTTPError("http://127.0.0.1:8080/v1/gateway/dispatch", 400, "Bad Request", {}, mock_fp)
        mock_urlopen.side_effect = http_err

        with self.assertRaises(AegisSchemaError) as ctx:
            self.gateway.dispatch("check_balance", {}, raise_on_blocked=True)

        self.assertIn("Missing required field 'accountId'", str(ctx.exception))

    @patch("urllib.request.urlopen")
    def test_dispatch_schema_error_without_raise(self, mock_urlopen):
        err_body = json.dumps({
            "status": "SCHEMA_ERROR",
            "reason": "Invalid parameter type",
            "violations": [{"code": "REJECTED_SCHEMA"}]
        }).encode("utf-8")
        mock_fp = io.BytesIO(err_body)
        http_err = urllib.error.HTTPError("http://127.0.0.1:8080/v1/gateway/dispatch", 400, "Bad Request", {}, mock_fp)
        mock_urlopen.side_effect = http_err

        res = self.gateway.dispatch("check_balance", {}, raise_on_blocked=False)
        self.assertEqual(res.status, "SCHEMA_ERROR")
        self.assertFalse(res.is_success)

    @patch("urllib.request.urlopen")
    def test_gateway_connection_failure_recovery(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

        with self.assertRaises(AegisGatewayError) as ctx:
            self.gateway.dispatch("check_balance", {"accountId": "ACC-01"})

        self.assertIn("Connection to AegisCore Gateway failed", str(ctx.exception))

    @patch("urllib.request.urlopen")
    def test_gateway_http_500_recovery(self, mock_urlopen):
        err_body = b"Internal Server Error"
        mock_fp = io.BytesIO(err_body)
        http_err = urllib.error.HTTPError("http://127.0.0.1:8080/v1/gateway/dispatch", 500, "Internal Server Error", {}, mock_fp)
        mock_urlopen.side_effect = http_err

        with self.assertRaises(AegisGatewayError) as ctx:
            self.gateway.dispatch("check_balance", {"accountId": "ACC-01"})

        self.assertEqual(ctx.exception.status_code, 500)

    @patch("urllib.request.urlopen")
    def test_evaluate_intent(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "decision": {"status": "APPROVED", "executionAllowed": True}
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.gateway.evaluate_intent("check_balance", {"accountId": "ACC-01"})
        self.assertEqual(res["decision"]["status"], "APPROVED")

    @patch("urllib.request.urlopen")
    def test_execute_tool(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "tool_call_id": "call_123",
            "allowed": True,
            "verdict": "APPROVED"
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.gateway.execute_tool("call_123", "check_balance", {"accountId": "ACC-01"})
        self.assertTrue(res["allowed"])

    @patch("urllib.request.urlopen")
    def test_resolve_hitl(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "resolution": {"status": "APPROVED"},
            "execution": {"status": "SUCCESS"}
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.gateway.resolve_hitl("ticket-01", "APPROVED", "sig-123")
        self.assertEqual(res["resolution"]["status"], "APPROVED")

    @patch("urllib.request.urlopen")
    def test_audit_integrity(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "isValid": True,
            "totalEntries": 42
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.gateway.verify_audit_integrity()
        self.assertTrue(res["isValid"])
        self.assertEqual(res["totalEntries"], 42)

    def test_langgraph_wrapper_approved(self):
        wrapper = AegisLangGraphWrapper(gateway=self.gateway)
        with patch.object(self.gateway, "dispatch") as mock_dispatch:
            mock_dispatch.return_value = DispatchResult(
                status="SUCCESS",
                tool="calc",
                output=42
            )
            raw_fn = MagicMock(return_value=42)
            governed = wrapper.wrap_tool("calc", raw_fn)
            output = governed(x=20, y=22)
            self.assertEqual(output, 42)
            mock_dispatch.assert_called_once()

    def test_openai_interceptor_blocked(self):
        interceptor = AegisOpenAIInterceptor(gateway=self.gateway)
        with patch.object(self.gateway, "execute_tool") as mock_exec:
            mock_exec.return_value = {
                "tool_call_id": "tc_1",
                "allowed": False,
                "verdict": "BLOCKED",
                "reason": "High risk action"
            }
            msg = interceptor.intercept_tool_call({
                "id": "tc_1",
                "function": {
                    "name": "delete_all",
                    "arguments": "{}"
                }
            })
            self.assertEqual(msg["role"], "tool")
            parsed = json.loads(msg["content"])
            self.assertEqual(parsed["verdict"], "BLOCKED")


if __name__ == "__main__":
    unittest.main()
