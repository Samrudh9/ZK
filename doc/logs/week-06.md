# Weekly Project Log Report

## Week: 6

### Task Completed
- **Backend REST API** (Phase 4): developed a robust Express backend.
- Implemented **JWT-based authentication** (login/logout/refresh), role-based authorization (PATIENT / PROVIDER), and Zod request validation mapped to a clean 400.
- Integrated **PostgreSQL** (users, refresh tokens, proof metadata, audit enrichment) as the off-chain store.
- Wired the core routes that bridge the frontend client, the snarkjs proof service, and the Fabric network via gRPC (`auth`, `consent`, `proof`, `records`, `audit`).
- Fixed the **auth stack**: local Postgres container on `:5433`, seeded demo users (`alice`/PATIENT, `drbob`/PROVIDER via bcrypt), 400 on validation, contract-aligned login.

### Task in Progress
- Completing the backend route set and confirming DB + Fabric connectivity from the running service.

### Task to Begin Next Week
- Build a **live E2E demo script** that drives the full flow against a real Fabric network.
