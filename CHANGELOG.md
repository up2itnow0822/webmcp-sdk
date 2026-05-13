# Changelog

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
