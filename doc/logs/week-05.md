# Weekly Project Log Report

## Week: 5

### Task Completed
- **Chaincode (Smart Contracts)** (Phase 3): implemented the Node.js `accessControl` chaincode.
- Enforced strictly **on-chain access control**, including **per-org MSP enforcement** per operation:
  - `CreateConsentPolicy` / `UpdateConsentPolicy` / `RevokeConsentPolicy` → `Org1MSP`
  - `VerifyAndGrantAccess` / `LogAuditEvent` → `Org2MSP`
- Added **replay protection** (proofs marked `CONSUMED`), policy active/expiry/exhaustion checks, and an **immutable audit trail** via CouchDB rich queries.
- Circumvented Docker Engine 29.x API compatibility issues by deploying the chaincode as a **Chaincode-as-a-Service (CCaaS)** container.
- Added **chaincode unit tests** and a **CI workflow** (backend, chaincode, frontend build).

### Task in Progress
- Hardening the chaincode and validating rich-query (CouchDB index) behaviour across both organisations.

### Task to Begin Next Week
- Begin the **Backend REST API** phase: Express backend bridging the frontend, snarkjs proof service, and Fabric via gRPC.
