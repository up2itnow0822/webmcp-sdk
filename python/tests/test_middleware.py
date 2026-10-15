"""Run with PYTHONPATH=python python -m unittest discover -s python/tests -v."""
import asyncio
import json
import unittest
from webmcp_sdk.middleware import WebMCPAutoSetupMiddleware, WebMCPDiscoveryMiddleware

async def downstream(scope, receive, send):
    await send({"type": "http.response.start", "status": 200, "headers": [(b"link", b'</existing>; rel="next"')]})
    await send({"type": "http.response.body", "body": b'{"ok":true}'})

async def request(app, path="/mcp", method="GET", **extra):
    messages = []
    scope = {"type": "http", "method": method, "path": path, "headers": [], **extra}
    async def receive(): return {"type": "http.request", "body": b"", "more_body": False}
    async def send(message): messages.append(message)
    await app(scope, receive, send)
    start = next(item for item in messages if item["type"] == "http.response.start")
    headers = {key.decode("latin-1").lower(): value.decode("latin-1") for key, value in start["headers"]}
    body = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
    return start["status"], headers, json.loads(body) if body else None

class PrivateCatalogTests(unittest.IsolatedAsyncioTestCase):
    async def test_private_by_default_for_every_catalog(self):
        app = WebMCPAutoSetupMiddleware(downstream, tools=[{"name": "private", "description": "private catalog"}])
        for path in ["/mcp", "/mcp/tools", "/mcp/resources"]:
            with self.subTest(path=path):
                status, headers, body = await request(app, path)
                self.assertEqual(status, 401)
                self.assertEqual(headers["cache-control"], "private, no-store")
                self.assertEqual(body, {"error": "Discovery authorization required"})
                self.assertNotIn("private catalog", json.dumps(body))
    async def test_explicit_public_manifest(self):
        app = WebMCPAutoSetupMiddleware(downstream, public_manifest=True, tools=[{"name": "search", "description": "Catalog"}])
        for path in ["/mcp", "/mcp/tools", "/mcp/resources"]:
            status, headers, body = await request(app, path)
            self.assertEqual(status, 200)
            self.assertEqual(headers["cache-control"], "private, no-store")
        self.assertEqual((await request(app))[2]["tools"][0]["name"], "search")
    async def test_sync_authorization_receives_scope(self):
        seen = []
        def authorize(scope):
            seen.append(scope["principal"])
            return scope["principal"] == "allowed"
        app = WebMCPAutoSetupMiddleware(downstream, authorize=authorize)
        self.assertEqual((await request(app, principal="allowed"))[0], 200)
        self.assertEqual((await request(app, principal="denied"))[0], 403)
        self.assertEqual(seen, ["allowed", "denied"])
    async def test_async_authorization_and_literal_true(self):
        for answer in [False, None, 1, "true", {}]:
            async def authorize(scope, result=answer):
                await asyncio.sleep(0)
                return result
            app = WebMCPAutoSetupMiddleware(downstream, authorize=authorize)
            status, headers, body = await request(app)
            self.assertEqual(status, 403)
            self.assertEqual(headers["cache-control"], "private, no-store")
            self.assertEqual(body, {"error": "Discovery access denied"})
        async def approve(scope):
            await asyncio.sleep(0)
            return True
        self.assertEqual((await request(WebMCPAutoSetupMiddleware(downstream, authorize=approve)))[0], 200)
    async def test_authorization_exceptions_deny_without_disclosure(self):
        def fail(scope): raise RuntimeError("private credential")
        app = WebMCPAutoSetupMiddleware(downstream, authorize=fail)
        status, headers, body = await request(app)
        self.assertEqual(status, 403)
        self.assertNotIn("private credential", json.dumps(body))
        self.assertEqual(headers["cache-control"], "private, no-store")
    async def test_authorization_still_runs_when_public(self):
        app = WebMCPAutoSetupMiddleware(downstream, public_manifest=True, authorize=lambda scope: False)
        self.assertEqual((await request(app))[0], 403)
    async def test_head_is_authorized_and_has_no_catalog_body(self):
        app = WebMCPAutoSetupMiddleware(downstream)
        status, headers, body = await request(app, method="HEAD")
        self.assertEqual(status, 401)
        self.assertIsNone(body)
        public = WebMCPAutoSetupMiddleware(downstream, public_manifest=True)
        self.assertEqual((await request(public, method="HEAD"))[0], 200)
        self.assertIsNone((await request(public, method="HEAD"))[2])
    async def test_metadata_endpoint_is_not_a_tool_transport(self):
        app = WebMCPAutoSetupMiddleware(downstream, public_manifest=True)
        status, headers, body = await request(app, method="POST")
        self.assertEqual(status, 405)
        self.assertEqual(headers["allow"], "GET, HEAD")
        self.assertEqual(headers["cache-control"], "private, no-store")
    async def test_configuration_catalog_is_copied(self):
        tools = [{"name": "safe", "description": "original", "inputSchema": {"type": "object"}}]
        app = WebMCPAutoSetupMiddleware(downstream, tools=tools, public_manifest=True)
        tools[0]["description"] = "mutated"
        self.assertEqual((await request(app))[2]["tools"][0]["description"], "original")

class ConfigurationTests(unittest.TestCase):
    def test_rejects_unsafe_manifest_paths(self):
        for path in ["https://evil.test/mcp", "//evil.test", "/a/../mcp", "/mcp?token=x", "/mcp#fragment", "/mcp\r\nX:evil", "/mcp/", "/"]:
            with self.subTest(path=path), self.assertRaises(ValueError): WebMCPDiscoveryMiddleware(downstream, manifest_path=path)
    def test_rejects_unsafe_header_values(self):
        for options in [{"server_name": "private\r\nInjected: true"}, {"version": "1\x00"}, {"server_name": "x" * 257}, {"version": 1}, {"version": ""}, {"server_name": "\u2603"}]:
            with self.subTest(options=options), self.assertRaises(ValueError): WebMCPDiscoveryMiddleware(downstream, **options)
    def test_rejects_invalid_capabilities(self):
        for capabilities in [["unknown"], ["tools\r\n"], "tools", [1], ["tools", "tools"]]:
            with self.subTest(capabilities=capabilities), self.assertRaises(ValueError): WebMCPDiscoveryMiddleware(downstream, capabilities=capabilities)
    def test_rejects_nonboolean_public_option(self):
        for value in [1, "true", [], None]:
            with self.subTest(value=value), self.assertRaises(ValueError): WebMCPAutoSetupMiddleware(downstream, public_manifest=value)
    def test_rejects_noncallable_authorizer(self):
        with self.assertRaises(ValueError): WebMCPAutoSetupMiddleware(downstream, authorize=True)

class DiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_metadata_headers_preserve_existing_links(self):
        app = WebMCPDiscoveryMiddleware(downstream, capabilities=["tools", "resources"], server_name="API")
        status, headers, body = await request(app, "/ordinary")
        self.assertEqual(status, 200)
        self.assertIn('</existing>; rel="next"', headers["link"])
        self.assertIn('</mcp>; rel="mcp-manifest"', headers["link"])
        self.assertEqual(headers["mcp-capabilities"], "tools,resources")
        self.assertEqual(headers["mcp-server"], "API")
    async def test_only_success_default_and_explicit_override(self):
        async def failed(scope, receive, send):
            await send({"type": "http.response.start", "status": 500, "headers": []})
            await send({"type": "http.response.body", "body": b""})
        headers = (await request(WebMCPDiscoveryMiddleware(failed)))[1]
        self.assertNotIn("mcp-version", headers)
        headers = (await request(WebMCPDiscoveryMiddleware(failed, only_on_success=False)))[1]
        self.assertIn("mcp-version", headers)
    async def test_non_http_scopes_pass_through(self):
        called = []
        async def other(scope, receive, send): called.append(scope["type"])
        async def noop(*args): return None
        await WebMCPAutoSetupMiddleware(other)({"type": "lifespan"}, noop, noop)
        self.assertEqual(called, ["lifespan"])

if __name__ == "__main__": unittest.main()
