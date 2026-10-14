"""
AegisCore Python Models & Dataclasses
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class DispatchResult:
    """Represents the response of a tool dispatch through AegisCore Gateway."""
    status: str  # 'SUCCESS', 'BLOCKED', 'REQUIRES_HITL', 'SCHEMA_ERROR', 'EXECUTION_FAILED'
    intent_id: Optional[str] = None
    session_id: Optional[str] = None
    tool: Optional[str] = None
    reason: Optional[str] = None
    output: Optional[Any] = None
    violations: List[Dict[str, Any]] = field(default_factory=list)
    challenge: Optional[Dict[str, Any]] = None
    audit_entry: Optional[Dict[str, Any]] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_success(self) -> bool:
        return self.status == "SUCCESS"

    @property
    def is_blocked(self) -> bool:
        return self.status == "BLOCKED"

    @property
    def requires_hitl(self) -> bool:
        return self.status == "REQUIRES_HITL"

    @property
    def ticket_id(self) -> Optional[str]:
        if self.challenge and isinstance(self.challenge, dict):
            return self.challenge.get("ticketId")
        return None
