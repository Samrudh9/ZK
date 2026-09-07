'use strict';

/**
 * Minimal in-memory mock of the Fabric chaincode context (stub + clientIdentity)
 * used to exercise the AccessControlContract without a running network.
 */
class MockContext {
  constructor({ mspId = 'Org1MSP', txId = 'tx_abcd1234' } = {}) {
    this.state = new Map();
    this.events = [];
    this.mspId = mspId;
    this._txId = txId;

    this.clientIdentity = {
      getMSPID: () => this.mspId,
    };

    this.stub = {
      getTxID: () => this._txId,
      getState: async (key) => {
        const v = this.state.get(key);
        return v ? Buffer.from(v) : undefined;
      },
      putState: async (key, value) => {
        this.state.set(key, value.toString());
      },
      deleteState: async (key) => {
        this.state.delete(key);
      },
      setEvent: (name, payload) => {
        this.events.push({ name, payload: payload.toString() });
      },
      getQueryResult: async () => {
        // No rich-query support in mock; single-pass iterator seeded from
        // the state entries matching the requested keys.
        const iterator = this._queryResults.values();
        const state = { txResponse: 'mock' };
        return {
          next: async () => {
            const { value, done } = iterator.next();
            if (value === undefined) return { value: undefined, done: true };
            return { value: { value: Buffer.from(value) }, done: false };
          },
          close: async () => {},
          state,
        };
      },
    };

    this._queryResults = new Map();
  }

  /** Seed `getQueryResult` with prebuilt results (audit events, policies). */
  seedQuery(entries) {
    this._queryResults = new Map(Object.entries(entries));
  }
}

module.exports = { MockContext };