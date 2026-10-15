"""ASGI discovery metadata; install the separate webmcp-sdk-discovery distribution."""
from .middleware import WebMCPAutoSetupMiddleware, WebMCPDiscoveryMiddleware

__all__ = ["WebMCPAutoSetupMiddleware", "WebMCPDiscoveryMiddleware"]
