# Changelog

## [0.6.0] - Unreleased

### Breaking security repairs

- Explicit fail-closed confirmation; bounded frozen JSON input and CSP-safe schema validation.
- Bounded unresolved admission/queue/deadlines, cancellation/revocation and leases retained until work actually settles.
- Required audit sink, prequeue rate admission and redacted complete terminal events.
- Current document-native registration, async readiness and AbortSignal cleanup; explicit legacy adapter.
- Scoped React providers, committed callbacks/metadata and revocation of stale pending approval authority.
- x402 V2 exact EVM flow with external-wallet authorization, exact route/amount policy and independent settlement verification. Unknown submissions remain pending.
- Private discovery defaults, separate pure-ASGI Python distribution and truthful exports/transport documentation.
- Practice-first noncustodial Base reference Studio: immutable proposals, exact approvals, simulation/review, allowlisted transfers/swaps and receipt reconciliation.
- Packed consumers/documents, native browser/CSP, deterministic wallet, accessibility/mobile, Python and dependency checks.

Scratch maintenance required reconstruction on 2026-10-15. Historical counts are not current verification; final gate evidence belongs in docs/release-verification.md. No registry publication or real-fund validation is implied.

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
