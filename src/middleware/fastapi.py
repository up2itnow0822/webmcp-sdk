"""Migration pointer: the npm source tree does not provide a Python distribution.

The single maintained ASGI implementation is python/webmcp_sdk/middleware.py.
Install the separate Python package with: python -m pip install ./python
Then import from webmcp_sdk.middleware. See python/README.md for private-by-default
catalog authorization. Discovery metadata is not authentication or tool transport.
"""
