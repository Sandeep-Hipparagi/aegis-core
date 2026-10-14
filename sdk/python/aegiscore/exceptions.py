"""
AegisCore Python Exceptions
"""

from typing import Any, Dict, List, Optional


class AegisError(Exception):
    """Base exception for all AegisCore errors."""
    pass


class AegisGatewayError(AegisError):
    """Raised when the AegisCore gateway returns an HTTP or network error."""
    def __init__(self, message: str, status_code: Optional[int] = None, response_body: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class AegisPolicyBlockedError(AegisError):
    """Raised when an action is blocked by a deterministic policy invariant."""
    def __init__(self, message: str, violations: Optional[List[Dict[str, Any]]] = None, raw_result: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.violations = violations or []
        self.raw_result = raw_result or {}


class AegisSchemaError(AegisError):
    """Raised when a tool argument payload fails fail-closed schema validation."""
    def __init__(self, message: str, raw_result: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.raw_result = raw_result or {}


class AegisHitlRequiredError(AegisError):
    """Raised when an action requires human-in-the-loop escalation before execution."""
    def __init__(self, message: str, ticket_id: str, challenge: Dict[str, Any]):
        super().__init__(message)
        self.ticket_id = ticket_id
        self.challenge = challenge
