# SDK contracts

Core owns core.ts/types.ts/input.ts/validation.ts/browser.ts/testing.ts and core/browser/validation tests. Security owns security.ts/tests. React owns react.ts/tests. Payments owns x402.ts/tests. Root owns index.ts, declarative.ts and discovery middleware/integration.

ToolExecutionContext carries signal; tool admit(input,context) and onExecutionRejected(context,error) preserve context identity. Frozen finite JSON input and conservative safe schemas; no getters/prototype keys/cycles. Default maxConcurrent10/maxQueued100/timeout30000/inputBytes65536/nodes1000/depth10. Admission leases include unresolved hooks, remain held until actual quiescence. Revoked registrations abort captured/running/queued authority. ready observes native registration; subscribe observes completions. Explicit confirmation provider strict true. React current committed callbacks/config/metadata and ownership cleanup. x402 V2 exact external signer+independent verifier; uncertain signed submission pending.

Write failing regressions first and update task-domain docs. No cross-domain/source package edits without coordinator.
