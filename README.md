# OpenGridNode Virtual Power Plant (VPP)

A live network map and telemetry manager for balancing local renewable energy across regional electricity grids (DNOs).

OpenGridNode is a decentralised mesh network for monitoring and aggregating DIY battery storage and solar export data across local DNO regions.

## Getting Started

1. **Install Dependencies**: Run `npm install` in the root, `gridnode-hub`, `gridnode-client`, and `gridnode-crypto`.
2. **Configure Hub**: Set up `gridnode-hub/.env` with your desired ports and keys.
3. **Start Hub**: `cd gridnode-hub && npm start`.
4. **Start Client**: `cd gridnode-client && npm start`.

## Critical Setup: Substation Linking

To participate in the VPP and appear correctly on the cluster map, every node must be linked to a physical grid asset:

1. Open your browser to `http://localhost:5101/config` (or your configured `NODE_PORT`).
2. Enter your **Latitude** and **Longitude**.
3. Click **Find & Link Substation**.
4. **Final Step**: Restart your client node process.

### Why do I need to restart?
Your `nodeId` is a cryptographic fingerprint generated from your location metadata. Finalising the configuration and restarting ensures your node identifies itself correctly to the Hub, allowing for accurate regional aggregation and real-time export tracking at the substation level.

## Hardware Support
OpenGridNode uses an adapter pattern to support different hardware types. Set the `ADAPTER_TYPE` in your `.env` to one of the following:

* `givenergy-mqtt`: Native support for GivEnergy systems via MQTT.
* `generic`: Connect any system using custom local MQTT topics or Modbus TCP registers.
* `tesla`: (In Development - Untested) Support for Tesla Powerwall.
* `victron`: (In Development - Untested) Support for Victron GX devices.

*Note: Only the GivEnergy and Generic adapters are currently tested and verified. If you have access to Tesla or Victron hardware and want to help test, please see ADAPTERS.md for details on creating and testing new adapters.*
