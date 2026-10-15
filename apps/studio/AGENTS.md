# Purpose

Own the non-custodial Base reference Studio. Practice is the default and always clearly simulated.

# Contracts

Agents may read and propose only. Human review and external wallet authorization are mandatory for every exact approval and transaction. No keys, seeds, arbitrary agent calldata or arbitrary contracts. Bind frozen intent to account, Base8453, policy revision and 120-second expiry. Slippage cannot exceed1%. Pending/unknown outcomes never masquerade as failed or confirmed settlement. Signer leases survive UI timeouts and span gateway instances per provider. Resolve proposal IDs before acquiring the busy lease. Preserve saved policy across modes and reset editable fields to those saved values; selected-mode clicks are no-ops. Fresh simulation changes review generation and resets human acknowledgement.

# Ownership

This folder and docs/task-5-studio.md. Coordinator owns installs, root workspace/lockfiles, staging and commits. No real funds in tests.

# Verification

npm run test --workspace @webmcp/studio; npm run build --workspace @webmcp/studio. Browser fixtures exist only with dev:test (Vite test mode). src/domain.ts owns immutable lifecycle; wallet.ts owns fixed Base codecs and receipt verification; practice.ts isolated simulation; fixture.ts deterministic EIP1193; sdk.ts only state/proposal tools; App.tsx human boundary. Regression tests cover asynchronous authority and mounted policy consistency.
