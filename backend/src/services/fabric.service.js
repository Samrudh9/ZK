const fs = require('fs');
const path = require('path');
const { connect, signers, hash } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fabricConfig = require('../config/fabric.config');
const logger = require('../config/logger');

// The chaincode enforces MSP per operation: consent writes belong to the
// patient org (Org1MSP), proof redemption / audit events to the provider org
// (Org2MSP). Route each chaincode function to the org that may invoke it.
const FUNCTION_MSP = {
  CreateConsentPolicy: 'Org1MSP',
  UpdateConsentPolicy: 'Org1MSP',
  RevokeConsentPolicy: 'Org1MSP',
  LogAuditEvent: 'Org2MSP',
  VerifyAndGrantAccess: 'Org2MSP',
};

const gateways = new Map(); // mspId -> gateway
const clients = new Map();  // mspId -> grpc.Client

function orgFor(functionName) {
  return FUNCTION_MSP[functionName] || fabricConfig.mspId;
}

function resolveOrg(mspId) {
  return fabricConfig.orgs[mspId] || fabricConfig.orgs[fabricConfig.mspId];
}

/**
 * Connect a gateway for a given MSP ID (Org1MSP by default).
 * Gateways are cached per org and reused.
 */
async function connectGateway(mspId = fabricConfig.mspId) {
  if (gateways.has(mspId)) return gateways.get(mspId);

  const cfg = resolveOrg(mspId);
  try {
    // Read TLS cert
    const tlsCert = fs.readFileSync(cfg.tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsCert);

    // Create gRPC client
    const client = new grpc.Client(cfg.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': cfg.peerHostAlias,
    });

    // Read user identity
    const certificate = fs.readFileSync(cfg.certPath).toString();

    // Read private key (first file in keystore directory)
    const keyFiles = fs.readdirSync(cfg.keyDir);
    const privateKeyPem = fs.readFileSync(path.join(cfg.keyDir, keyFiles[0])).toString();
    const privateKey = crypto.createPrivateKey(privateKeyPem);

    const identity = { mspId: cfg.mspId, credentials: Buffer.from(certificate) };
    const signer = signers.newPrivateKeySigner(privateKey);

    const gateway = connect({
      client,
      identity,
      signer,
      hash: hash.sha256,
      evaluateOptions: () => ({ deadline: Date.now() + 30000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30000 }),
      submitOptions: () => ({ deadline: Date.now() + 30000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });

    gateways.set(mspId, gateway);
    clients.set(mspId, client);

    logger.info('Fabric gateway connected', {
      msp: cfg.mspId,
      peer: cfg.peerEndpoint,
      channel: fabricConfig.channelName,
    });

    return gateway;
  } catch (err) {
    logger.error('Failed to connect Fabric gateway', { msp: mspId, error: err.message });
    throw err;
  }
}

/**
 * Get a contract reference for the accessControl chaincode under the given org.
 */
async function getContract(mspId) {
  const gw = await connectGateway(mspId);
  const network = gw.getNetwork(fabricConfig.channelName);
  return network.getContract(fabricConfig.chaincodeName);
}

/**
 * Submit a transaction (write to ledger), using the identity the chaincode
 * requires for that function.
 */
async function submitTransaction(functionName, ...args) {
  const contract = await getContract(orgFor(functionName));
  const result = await contract.submitTransaction(functionName, ...args);
  return result.length > 0 ? JSON.parse(Buffer.from(result).toString()) : null;
}

/**
 * Evaluate a transaction (read-only query).
 */
async function evaluateTransaction(functionName, ...args) {
  const contract = await getContract(orgFor(functionName));
  const result = await contract.evaluateTransaction(functionName, ...args);
  return result.length > 0 ? JSON.parse(Buffer.from(result).toString()) : null;
}

/**
 * Gracefully close all gateway connections.
 */
function disconnect() {
  for (const gateway of gateways.values()) {
    try { gateway.close(); } catch { /* noop */ }
  }
  for (const client of clients.values()) {
    try { client.close(); } catch { /* noop */ }
  }
  gateways.clear();
  clients.clear();
  logger.info('Fabric gateways disconnected');
}

module.exports = {
  connectGateway,
  getContract,
  submitTransaction,
  evaluateTransaction,
  disconnect,
};