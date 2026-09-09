const path = require('path');
const env = require('./env');

/**
 * Build a per-org connection block from env vars.
 * Crypto paths are resolved relative to the backend/ directory.
 */
function orgBlock(mspKey, peerKey, tlsKey, certKey, keyKey) {
  const peerEndpoint = env[peerKey];
  return {
    mspId: env[mspKey],
    peerEndpoint,
    peerHostAlias: peerEndpoint.split(':')[0],
    tlsCertPath: env[tlsKey]
      ? path.resolve(__dirname, '..', '..', env[tlsKey])
      : null,
    certPath: env[certKey]
      ? path.resolve(__dirname, '..', '..', env[certKey])
      : null,
    keyDir: env[keyKey]
      ? path.resolve(__dirname, '..', '..', env[keyKey])
      : null,
  };
}

const org1 = orgBlock(
  'FABRIC_ORG_MSP',
  'FABRIC_PEER_ENDPOINT',
  'FABRIC_TLS_CERT_PATH',
  'FABRIC_CERT_PATH',
  'FABRIC_KEY_DIR'
);

const org2 = orgBlock(
  'FABRIC_ORG2_MSP',
  'FABRIC_ORG2_PEER_ENDPOINT',
  'FABRIC_ORG2_TLS_CERT_PATH',
  'FABRIC_ORG2_CERT_PATH',
  'FABRIC_ORG2_KEY_DIR'
);

/**
 * Fabric connection configuration.
 * Top-level fields mirror the (Org1) defaults for backward compatibility;
 * `orgs` maps each MSP ID to its connection block for per-operation identities.
 */
module.exports = {
  channelName: env.FABRIC_CHANNEL_NAME,
  chaincodeName: env.FABRIC_CHAINCODE_NAME,
  mspId: org1.mspId,
  peerEndpoint: org1.peerEndpoint,
  ordererEndpoint: env.FABRIC_ORDERER_ENDPOINT,

  // Crypto paths (resolved from backend/ root)
  cryptoPath: path.resolve(__dirname, '..', '..', env.FABRIC_CRYPTO_PATH),

  tlsCertPath: org1.tlsCertPath,
  certPath: org1.certPath,
  keyDir: org1.keyDir,

  // Peer hostname for TLS override (extracted from endpoint)
  peerHostAlias: org1.peerHostAlias,

  orgs: { [org1.mspId]: org1, [org2.mspId]: org2 },
};