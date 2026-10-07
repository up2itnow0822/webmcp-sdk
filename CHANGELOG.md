# Changelog

## [0.5.9] - 2026-10-07

Docs and metadata only. The shipped code (`dist/`) is byte-identical to 0.5.8.

### Changed
- README: accurate WebMCP status (no Chrome 146 / W3C validation claims), payment example imports `agentwallet-sdk` (not the unclaimed `agent-wallet-sdk`), and removed the Proxy Relay (`ProxyRelay`, `proxyEndpoint`, `kit.proxy`) and Tamper-Evident Audit Logging (`AuditLog`, `getAuditLog`, `verifyAuditLog`) sections, which are not in the package.
- package.json: description and keywords updated; repository, homepage and bugs now point to github.com/up2itnow0822/webmcp-sdk.

## [0.5.8] - 2026-05-13

### Fixed
- Prepared patch release for the public `webmcp-sdk/x402` subpath by ensuring the package build emits `dist/x402.*` and the export map points to those files.
- Hardened the publish gate so `npm publish` runs the packed-consumer subpath smoke before release.

## [0.4.1] - 2026-03-22

### Added
- Initial public release
- WebMCP SDK for browser-native agent commerce
- Service discovery via navigator.modelContext
- x402 payment integration
- Audit logging
