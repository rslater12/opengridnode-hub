# GridNode Client

A client node that connects to the GridNode Hub, publishes masked local metrics, and optionally opens a public peer endpoint.

## Features

- Connects to a central hub using Socket.IO
- Publishes masked metrics plus an encrypted private payload
- Supports direct peer connections for fallback and distributed gossip
- Uses MQTT adapters for GivEnergy-style topic ingestion
- Exposes a local health endpoint at `/health`

## Quick start

1. Create `.env` in `gridnode-client`

```ini
HUB_URL=http://localhost:5000
NODE_PORT=5001
PUBLIC_NODE=true
PUBLIC_ADDRESS=""
LAT=52.4862
LON=-1.8904
REGION_ID=west-midlands
SUBSTATION_ID=wm-substation-01
MQTT_BROKER_URL=mqtt://localhost:1883
```

2. Install dependencies

```bash
cd gridnode-client
npm install
```

3. Run the client

```bash
npm start
```

## Notes

- Use `PUBLIC_NODE=true` only if your node is reachable from other peers.
- `PUBLIC_ADDRESS` should be the publicly routable address used by other nodes.
- When the hub is down, peer-to-peer messaging continues if nodes have connected directly.

## Dashboard and local APIs

- Open `http://localhost:5001/dashboard` to view the local client dashboard.
- The client exposes `/config`, `/api/status`, and `/api/network` for local inspection and integration.
- If the node is public, the Hub can discover it and route peer traffic through it.
