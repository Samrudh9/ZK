const fs = require('fs');
const path = require('path');
const { connect, signers, hash } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fabricConfig = require('../config/fabric.config');
const logger = require('../config/logger');

let gateway = null;
let client = null;

/**
 * Initialise the Fabric gateway connection.
 * Called once at app startup. Reuse gateway/contract references.
 */
async function connectGateway() {
  if (gateway) return gateway;

  try {
    // Read TLS cert
    const tlsCert = fs.readFileSync(fabricConfig.tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsCert);

    // Create gRPC client
    client = new grpc.Client(fabricConfig.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': fabricConfig.peerHostAlias,
    });

    // Read user identity
    const certPath = fabricConfig.certPath;
    const certificate = fs.readFileSync(certPath).toString();

    // Read private key (first file in keystore directory)
    const keyDir = fabricConfig.keyDir;
    const keyFiles = fs.readdirSync(keyDir);
    const privateKeyPem = fs.readFileSync(path.join(keyDir, keyFiles[0])).toString();
    const privateKey = crypto.createPrivateKey(privateKeyPem);

    const identity = { mspId: fabricConfig.mspId, credentials: Buffer.from(certificate) };
    const signer = signers.newPrivateKeySigner(privateKey);

    gateway = connect({
      client,
      identity,
      signer,
      hash: hash.sha256,
      evaluateOptions: () => ({ deadline: Date.now() + 30000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30000 }),
      submitOptions: () => ({ deadline: Date.now() + 30000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });

    logger.info('Fabric gateway connected', {
      msp: fabricConfig.mspId,
      peer: fabricConfig.peerEndpoint,
      channel: fabricConfig.channelName,
    });

    return gateway;
  } catch (err) {
    logger.error('Failed to connect Fabric gateway', { error: err.message });
    throw err;
  }
}

/**
 * Get a contract reference for the accessControl chaincode.
 */
async function getContract() {
  const gw = await connectGateway();
  const network = gw.getNetwork(fabricConfig.channelName);
  return network.getContract(fabricConfig.chaincodeName);
}

/**
 * Submit a transaction (write to ledger).
 */
async function submitTransaction(functionName, ...args) {
  const contract = await getContract();
  const result = await contract.submitTransaction(functionName, ...args);
  return result.length > 0 ? JSON.parse(Buffer.from(result).toString()) : null;
}

/**
 * Evaluate a transaction (read-only query).
 */
async function evaluateTransaction(functionName, ...args) {
  const contract = await getContract();
  const result = await contract.evaluateTransaction(functionName, ...args);
  return result.length > 0 ? JSON.parse(Buffer.from(result).toString()) : null;
}

/**
 * Gracefully close the gateway.
 */
function disconnect() {
  if (gateway) {
    gateway.close();
    gateway = null;
  }
  if (client) {
    client.close();
    client = null;
  }
  logger.info('Fabric gateway disconnected');
}

module.exports = {
  connectGateway,
  getContract,
  submitTransaction,
  evaluateTransaction,
  disconnect,
};
