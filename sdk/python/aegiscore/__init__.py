"""
AegisCore Python Client SDK
Zero-dependency client for deterministic agent governance.
"""

import sys

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from .client import AegisGateway, AegisClient
from .models import DispatchResult
from .exceptions import (
    AegisError,
    AegisGatewayError,
    AegisPolicyBlockedError,
    AegisSchemaError,
    AegisHitlRequiredError,
)

__version__ = "0.1.2"
__all__ = [
    "AegisGateway",
    "AegisClient",
    "DispatchResult",
    "AegisError",
    "AegisGatewayError",
    "AegisPolicyBlockedError",
    "AegisSchemaError",
    "AegisHitlRequiredError",
]
