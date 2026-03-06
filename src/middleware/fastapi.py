"""
WebMCP Auto-Discovery Middleware for FastAPI / Starlette

Automatically injects HTTP response headers so AI agents can discover
a server's MCP capabilities without any manual configuration.

Requirements: starlette (already a FastAPI dependency) — no extra installs.

Usage (zero config):
    from webmcp_sdk.middleware import WebMCPDiscoveryMiddleware
    app.add_middleware(WebMCPDiscoveryMiddleware)

Usage (with options):
    app.add_middleware(
        WebMCPDiscoveryMiddleware,
        manifest_path='/mcp',
        capabilities=['tools', 'resources'],
        version='1.0',
        server_name='My API',
        only_on_success=True,
    )
"""

from __future__ import annotations

import json
from typing import Callable, List, Optional, Sequence

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

# ─── Types ───

MCPCapability = str  # 'tools' | 'resources' | 'prompts' | 'sampling' | 'logging'

VALID_CAPABILITIES: frozenset[str] = frozenset(
    ["tools", "resources", "prompts", "sampling", "logging"]
)


def _build_link_header(manifest_path: str, capabilities: List[str]) -> str:
    parts = [f'<{manifest_path}>; rel="mcp-manifest"']
    if "tools" in capabilities:
        parts.append(f'<{manifest_path}/tools>; rel="mcp-tools"')
    if "resources" in capabilities:
        parts.append(f'<{manifest_path}/resources>; rel="mcp-resources"')
    if "prompts" in capabilities:
        parts.append(f'<{manifest_path}/prompts>; rel="mcp-prompts"')
    return ", ".join(parts)


# ─── Core Middleware ───


class WebMCPDiscoveryMiddleware(BaseHTTPMiddleware):
    """
    Starlette / FastAPI middleware that injects WebMCP auto-discovery headers.

    Works with ANY Starlette-compatible framework (FastAPI, Starlette, etc.).
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        manifest_path: str = "/mcp",
        capabilities: Optional[List[MCPCapability]] = None,
        version: str = "1.0",
        server_name: Optional[str] = None,
        only_on_success: bool = True,
    ) -> None:
        super().__init__(app)
        self.manifest_path = manifest_path
        self.capabilities: List[str] = capabilities if capabilities is not None else ["tools"]
        self.version = version
        self.server_name = server_name
        self.only_on_success = only_on_success

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        should_inject = (
            not self.only_on_success or 200 <= response.status_code < 300
        )

        if should_inject:
            response.headers["Link"] = _build_link_header(
                self.manifest_path, self.capabilities
            )
            response.headers["MCP-Version"] = self.version
            response.headers["MCP-Capabilities"] = ",".join(self.capabilities)
            if self.server_name:
                response.headers["MCP-Server"] = self.server_name

        return response


# ─── Auto-Setup Middleware ───


class WebMCPAutoSetupMiddleware(BaseHTTPMiddleware):
    """
    All-in-one middleware that:
    1. Injects WebMCP discovery headers on every 2xx response
    2. Serves a GET /mcp manifest endpoint automatically
    3. Serves GET /mcp/tools and GET /mcp/resources sub-endpoints

    Usage:
        app.add_middleware(
            WebMCPAutoSetupMiddleware,
            server_name='My API',
            tools=[{'name': 'search', 'description': 'Search the catalog'}],
        )
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        manifest_path: str = "/mcp",
        capabilities: Optional[List[MCPCapability]] = None,
        version: str = "1.0",
        server_name: Optional[str] = None,
        only_on_success: bool = True,
        tools: Optional[List[dict]] = None,
        resources: Optional[List[dict]] = None,
    ) -> None:
        super().__init__(app)
        self.manifest_path = manifest_path
        self.version = version
        self.server_name = server_name
        self.only_on_success = only_on_success

        _tools = tools or []
        _resources = resources or []

        # Infer capabilities
        if capabilities is not None:
            self.capabilities = capabilities
        else:
            inferred: List[str] = []
            if _tools:
                inferred.append("tools")
            if _resources:
                inferred.append("resources")
            self.capabilities = inferred or ["tools"]

        # Build manifest payload
        self._manifest = {
            "schema_version": version,
            **({"server": {"name": server_name}} if server_name else {}),
            "capabilities": self.capabilities,
            "tools": [
                {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "inputSchema": t.get("inputSchema", {"type": "object", "properties": {}}),
                    **({"annotations": t["annotations"]} if "annotations" in t else {}),
                }
                for t in _tools
            ],
            "resources": [
                {
                    "uri": r["uri"],
                    "name": r["name"],
                    **({"description": r["description"]} if "description" in r else {}),
                    **({"mimeType": r["mimeType"]} if "mimeType" in r else {}),
                }
                for r in _resources
            ],
            "endpoints": {
                "manifest": manifest_path,
                "tools": f"{manifest_path}/tools",
                "resources": f"{manifest_path}/resources",
            },
        }

        self._tools_payload = {"tools": self._manifest["tools"]}
        self._resources_payload = {"resources": self._manifest["resources"]}

    def _discovery_headers(self) -> dict:
        headers = {
            "Link": _build_link_header(self.manifest_path, self.capabilities),
            "MCP-Version": self.version,
            "MCP-Capabilities": ",".join(self.capabilities),
        }
        if self.server_name:
            headers["MCP-Server"] = self.server_name
        return headers

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        method = request.method

        # Serve manifest endpoint
        if method == "GET" and path == self.manifest_path:
            return JSONResponse(
                content=self._manifest,
                headers=self._discovery_headers(),
            )

        # Serve tools sub-endpoint
        if method == "GET" and path == f"{self.manifest_path}/tools":
            return JSONResponse(content=self._tools_payload)

        # Serve resources sub-endpoint
        if method == "GET" and path == f"{self.manifest_path}/resources":
            return JSONResponse(content=self._resources_payload)

        # Pass through + inject headers on success
        response = await call_next(request)

        should_inject = (
            not self.only_on_success or 200 <= response.status_code < 300
        )
        if should_inject:
            for k, v in self._discovery_headers().items():
                response.headers[k] = v

        return response
