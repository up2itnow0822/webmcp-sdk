"""Private-by-default ASGI discovery metadata, not authentication or tool transport.

Compatible with Starlette/FastAPI app.add_middleware without framework dependencies.
The authorize callback receives the ASGI HTTP scope and returns literal True;
awaitable results are awaited. Authentication is supplied by the application.
"""
from __future__ import annotations
import inspect
import json
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

Scope = dict[str, Any]
Message = dict[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]
Authorize = Callable[[Scope], bool | Awaitable[bool]]
VALID_CAPABILITIES = frozenset({"tools", "resources", "prompts", "sampling", "logging"})

def _header(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 256 or any(ord(c) < 32 or ord(c) > 126 for c in value):
        raise ValueError(f"{name} must be a nonempty printable ASCII header of at most 256 characters")
    return value

def _path(value: Any) -> str:
    if not isinstance(value, str) or len(value) > 256 or not re.fullmatch(r"/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*", value):
        raise ValueError("manifest_path must be a canonical local absolute path")
    if any(part in {".", ".."} for part in value.split("/")):
        raise ValueError("manifest_path must not contain traversal segments")
    return value

def _capabilities(values: Sequence[str] | None) -> tuple[str, ...]:
    if values is None: return ("tools",)
    if not isinstance(values, (list, tuple)) or len(values) > len(VALID_CAPABILITIES):
        raise ValueError("capabilities must be a bounded list of known tokens")
    if any(not isinstance(value, str) or value not in VALID_CAPABILITIES for value in values):
        raise ValueError("Unknown discovery capability")
    if len(set(values)) != len(values): raise ValueError("Duplicate discovery capability")
    return tuple(values)

class WebMCPDiscoveryMiddleware:
    """Advertise HTTP discovery metadata; this grants no authorization."""
    def __init__(self, app: ASGIApp, *, manifest_path: str = "/mcp", capabilities: Sequence[str] | None = None,
                 version: str = "1.0", server_name: str | None = None, only_on_success: bool = True) -> None:
        if not callable(app): raise ValueError("app must be an ASGI callable")
        if type(only_on_success) is not bool: raise ValueError("only_on_success must be a boolean")
        self.app = app
        self.manifest_path = _path(manifest_path)
        self.capabilities = _capabilities(capabilities)
        self.version = _header(version, "version")
        self.server_name = _header(server_name, "server_name") if server_name is not None else None
        self.only_on_success = only_on_success
        links = [f'<{self.manifest_path}>; rel="mcp-manifest"']
        for token in ["tools", "resources", "prompts"]:
            if token in self.capabilities: links.append(f'<{self.manifest_path}/{token}>; rel="mcp-{token}"')
        self._headers = [(b"link", ", ".join(links).encode("ascii")), (b"mcp-version", self.version.encode("ascii")),
                         (b"mcp-capabilities", ",".join(self.capabilities).encode("ascii"))]
        if self.server_name is not None: self._headers.append((b"mcp-server", self.server_name.encode("ascii")))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        async def discovery_send(message: Message) -> None:
            if message["type"] == "http.response.start" and (not self.only_on_success or 200 <= message["status"] < 300):
                original = list(message.get("headers", []))
                previous_links = [value for key, value in original if key.lower() == b"link"]
                names = {key for key, _ in self._headers}
                headers = [(key, value) for key, value in original if key.lower() not in names]
                for key, value in self._headers:
                    if key == b"link" and previous_links: value = b", ".join([*previous_links, value])
                    headers.append((key, value))
                message = {**message, "headers": headers}
            await send(message)
        await self.app(scope, receive, discovery_send)

class WebMCPAutoSetupMiddleware(WebMCPDiscoveryMiddleware):
    """Serve private discovery routes; no credential parsing or tool execution.

    Supply authorize(scope) using the application's existing identity/session policy.
    Configuration is copied into immutable serialized bytes during construction.
    """
    def __init__(self, app: ASGIApp, *, manifest_path: str = "/mcp", capabilities: Sequence[str] | None = None,
                 version: str = "1.0", server_name: str | None = None, only_on_success: bool = True,
                 tools: Sequence[Mapping[str, Any]] | None = None, resources: Sequence[Mapping[str, Any]] | None = None,
                 public_manifest: bool = False, authorize: Authorize | None = None) -> None:
        if type(public_manifest) is not bool: raise ValueError("public_manifest must be a boolean")
        if authorize is not None and not callable(authorize): raise ValueError("authorize must be a callable")
        tool_list = list(tools) if tools is not None else []
        resource_list = list(resources) if resources is not None else []
        inferred = (["tools"] if tool_list else []) + (["resources"] if resource_list else [])
        super().__init__(app, manifest_path=manifest_path, capabilities=capabilities if capabilities is not None else inferred or ["tools"],
                         version=version, server_name=server_name, only_on_success=only_on_success)
        self.public_manifest = public_manifest
        self.authorize = authorize
        manifest: dict[str, Any] = {
            "schema_version": self.version, "capabilities": list(self.capabilities),
            "tools": [{"name": t["name"], "description": t.get("description", ""),
                       "inputSchema": t.get("inputSchema", {"type": "object", "properties": {}}),
                       **({"annotations": t["annotations"]} if "annotations" in t else {})} for t in tool_list],
            "resources": [{"uri": r["uri"], "name": r["name"], **({"description": r["description"]} if "description" in r else {}),
                           **({"mimeType": r["mimeType"]} if "mimeType" in r else {})} for r in resource_list],
            "endpoints": {"manifest": self.manifest_path, "tools": f"{self.manifest_path}/tools", "resources": f"{self.manifest_path}/resources"},
        }
        if self.server_name is not None: manifest["server"] = {"name": self.server_name}
        self._routes = {self.manifest_path: self._encode(manifest), f"{self.manifest_path}/tools": self._encode({"tools": manifest["tools"]}),
                        f"{self.manifest_path}/resources": self._encode({"resources": manifest["resources"]})}

    @staticmethod
    def _encode(value: Any) -> bytes:
        return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode("utf-8")

    async def _respond(self, scope: Scope, send: Send, status: int, body: bytes, *, allow: bool = False) -> None:
        headers = [(b"content-type", b"application/json"), (b"cache-control", b"private, no-store"),
                   (b"content-length", str(len(body)).encode("ascii"))]
        if allow: headers.append((b"allow", b"GET, HEAD"))
        if status == 200: headers.extend(self._headers)
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": b"" if scope["method"] == "HEAD" else body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") not in self._routes:
            await super().__call__(scope, receive, send)
            return
        if scope["method"] not in {"GET", "HEAD"}:
            await self._respond(scope, send, 405, self._encode({"error": "Discovery supports GET and HEAD only"}), allow=True)
            return
        if not self.public_manifest and self.authorize is None:
            await self._respond(scope, send, 401, self._encode({"error": "Discovery authorization required"}))
            return
        if self.authorize is not None:
            try:
                answer = self.authorize(scope)
                if inspect.isawaitable(answer): answer = await answer
                allowed = answer is True
            except Exception: allowed = False
            if not allowed:
                await self._respond(scope, send, 403, self._encode({"error": "Discovery access denied"}))
                return
        await self._respond(scope, send, 200, self._routes[scope["path"]])
