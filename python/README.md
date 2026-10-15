# Python discovery middleware

This is the **webmcp-sdk-discovery** Python distribution, separate from the npm
webmcp-sdk package. No PyPI publication is claimed. Install the checkout with
`python -m pip install ./python`. Python 3.10+ is supported; runtime dependencies
are empty.

```python
from webmcp_sdk.middleware import WebMCPAutoSetupMiddleware

# app is an existing FastAPI/Starlette application.
# Existing authentication middleware must populate the ASGI identity first.
def authorize_catalog(scope):
    principal = scope.get("user")
    return principal is not None and principal.is_authenticated is True

app.add_middleware(
    WebMCPAutoSetupMiddleware,
    server_name="My API",
    tools=[{"name": "search", "description": "Search catalog"}],
    authorize=authorize_catalog,
)
```

The authorizer receives the ASGI HTTP **scope**, not a Starlette Request. It can
be synchronous or asynchronous and must return literal True. If identity is
unavailable, deny. Provider exceptions produce generic 403 responses; supplied
authorizers always run, including public mode.

Without authorize or explicit public_manifest=True, /mcp, /mcp/tools and
/mcp/resources return 401. Deliberately public catalogs can opt in using
public_manifest=True. Every catalog response, denial and unsupported method uses
Cache-Control: private, no-store. GET and HEAD are supported; other methods get
405. Configuration requires canonical local absolute paths, printable ASCII header
values of at most 256 characters, and unique capability tokens drawn from tools,
resources, prompts, sampling, logging.

WebMCPDiscoveryMiddleware only appends discovery metadata headers to existing HTTP
responses. It serves no catalog and grants no authorization. Both classes are
pure ASGI middleware compatible with the
[Starlette middleware contract](https://www.starlette.io/middleware/).

These links/catalogs are discovery metadata, not an authentication system or MCP
tool execution transport. Execution needs a separately implemented authenticated
route/transport. Advertise only capabilities actually implemented by the app.

Run deterministic standard-library tests from the repository root:

```sh
PYTHONPATH=python python -m unittest discover -s python/tests -v
```

Before release, install ./python into an isolated environment and verify the
webmcp_sdk import from outside the checkout.
