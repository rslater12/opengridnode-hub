# gridbnode-crypto

Shared crypto utilities for GridNode

## Exports

- `createNodeId({ lat, lon, regionId, substationId })`
- `mapLocationToRegion(lat, lon)`
- `generateKeyPair()`
- `encryptToPublicKey(payload, publicKey)`
- `decryptWithPrivateKey(encrypted, privateKey)`
- `signPayload(payload, privateKey)`
- `verifySignature(payload, signature, publicKey)`

This package is intended to be used by both the Hub and client workloads for identity, privacy, and secure telemetry.
