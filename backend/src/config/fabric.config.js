const path = require('path');
const env = require('./env');

/**
 * Fabric connection configuration.
 * Paths are resolved relative to the backend/ directory.
 */
module.exports = {
  channelName: env.FABRIC_CHANNEL_NAME,
  chaincodeName: env.FABRIC_CHAINCODE_NAME,
  mspId: env.FABRIC_ORG_MSP,
  peerEndpoint: env.FABRIC_PEER_ENDPOINT,
  ordererEndpoint: env.FABRIC_ORDERER_ENDPOINT,

  // Crypto paths (resolved from backend/ root)
  cryptoPath: path.resolve(__dirname, '..', '..', env.FABRIC_CRYPTO_PATH),

  tlsCertPath: env.FABRIC_TLS_CERT_PATH
    ? path.resolve(__dirname, '..', '..', env.FABRIC_TLS_CERT_PATH)
    : null,

  certPath: env.FABRIC_CERT_PATH
    ? path.resolve(__dirname, '..', '..', env.FABRIC_CERT_PATH)
    : null,

  keyDir: env.FABRIC_KEY_DIR
    ? path.resolve(__dirname, '..', '..', env.FABRIC_KEY_DIR)
    : null,

  // Peer hostname for TLS override (extracted from endpoint)
  peerHostAlias: env.FABRIC_PEER_ENDPOINT.split(':')[0],
};
