# Purpose
Provide the separately installable Python discovery package for ASGI applications.

# Ownership
Python middleware, packaging and stdlib unit tests live here. The coordinator alone installs dependencies, stages, commits, or publishes.

# Contracts
- Distribution webmcp-sdk-discovery is distinct from the npm webmcp-sdk package. npm does not provide Python imports.
- Catalogs deny by default; only explicit public_manifest=True or a callable authorizer returning literal True grants metadata access. Supplied authorization always runs, including public mode.
- Every manifest/tool/resource response, denial and unsupported method uses private, no-store.
- Validate canonical local paths, bounded printable header values and known unique capabilities at construction.
- Discovery metadata does not implement authentication or tool execution transport.
- Keep one implementation in webmcp_sdk/middleware.py; src/middleware/fastapi.py is only a migration pointer.
- Runtime dependencies are empty; use standard-library tests and pure ASGI contracts. No live transactions or systems.

# Verification
PYTHONPATH=python python -m unittest discover -s python/tests -v

Coordinator additionally installs ./python in an isolated environment, verifies imports outside checkout, and owns release publication. No PyPI publication without explicit authorization.
