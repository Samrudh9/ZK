# Weekly Project Log Report

## Week: 3

### Task Completed
- **Foundation & Fabric Network** (Phase 1): configured and deployed a Hyperledger Fabric 2.5 network locally using Docker Compose.
- Established the `healthchannel` with two organisations — **Org1 (Patients)** and **Org2 (Providers)**.
- Generated cryptographic material (cryptogen) and genesis blocks (configtxgen).
- Researched the Chaincode-as-a-Service (CCaaS) deployment path to work around Docker-in-Docker limitations.

### Task in Progress
- Bringing up the full Fabric network (peers, orderers, CouchDB) with TLS enabled and verifying cross-org connectivity.

### Task to Begin Next Week
- Begin the **ZK Circuit + Proof Service** phase: design and compile the access-control circuit.
