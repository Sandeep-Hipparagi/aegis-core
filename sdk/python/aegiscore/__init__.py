"""
AegisCore Python Client SDK
Zero-dependency client for deterministic agent governance.
"""

from .client import AegisGateway, AegisClient
from .models import DispatchResult
from .exceptions import (
    AegisError,
    AegisGatewayError,
    AegisPolicyBlockedError,
    AegisSchemaError,
    AegisHitlRequiredError,
)

__version__ = "0.1.0"
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
