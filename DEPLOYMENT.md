# GridNode Deployment Guide

## Overview

GridNode is a tor-like distributed peer-to-peer grid network where:
- **Edge nodes** (homes with batteries) publish metrics to hubs and relay peer-to-peer
- **Public nodes** advertise themselves and enable cross-hub visibility
- **Hubs** aggregate data by region and connect to other hubs (validator/historian roles)
- **National operators** monitor live energy data in real-time across the entire mesh

## Architecture

```
┌─────────────────────────────────────────┐
│    National Grid Operators              │
│    (View cluster-map.html)              │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴──────────┬──────────┐
        │                   │          │
    ┌───▼──┐           ┌────▼───┐  ┌─▼─────┐
    │ Hub1 │◄────────►│ Hub2   │  │ Hub3  │
    │Valdr │ (P2P)    │Valdr   │  │Histor │
    └───┬──┘          └────┬───┘  └─┬─────┘
        │                  │         │
    ┌───┴────┬──────┐  ┌────┴───┐  │
    │         │      │  │        │  │
  Node1      Hub1   PeerN Sub2  ...│
  (Edge)    Local              ...
                          (Regional
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd /Users/Slater/Desktop/GridNode
npm install --prefix gridbnode-crypto
npm install --prefix gridnode-hub
npm install --prefix gridnode-client
```

### 2. Hub Configuration (Validator/Historian)

Create `.env` in `gridnode-hub/`:

**Validator Hub** (Primary aggregator for a region):
```env
PORT=5000 # Default hub port
HUB_PUBLIC_URL=https://hub1.gridnode.io:5000
HUB_ID=hub-london-validator
HUB_ROLE=validator
HUB_PEER_HUBS=https://hub2.gridnode.io:5000,https://hub3.gridnode.io:5000
STUN_SERVERS=stun.l.google.com:19302,stun1.l.google.com:19302
HUB_PUBLIC_KEY=<rsa-public-key>
HUB_PRIVATE_KEY=<rsa-private-key>
```

**Historian Hub** (Archive/backup for a region):
```env
PORT=5010 # Peer hub port
HUB_PUBLIC_URL=https://hub2.gridnode.io:5010
HUB_ID=hub-london-historian
HUB_ROLE=historian
HUB_PEER_HUBS=https://hub1.gridnode.io:5000,https://hub3.gridnode.io:5000
STUN_SERVERS=stun.l.google.com:19302,stun1.l.google.com:19302
HUB_PUBLIC_KEY=<rsa-public-key>
HUB_PRIVATE_KEY=<rsa-private-key>
```

### 3. Client Node Configuration (Home/Battery)

Create `.env` in `gridnode-client/`:

**Edge Node** (Private, not advertised):
```env
HUB_URL=https://hub1.gridnode.io:5000 # Connects to Validator Hub
NODE_PORT=5101 # Unique port for this client
PUBLIC_NODE=false
REGION_ID=london-dno
SUBSTATION_ID=substation-001
LAT=51.5074
LON=-0.1278
NODE_ROLE=edge
USE_WEBRTC=true
STUN_SERVERS=stun.l.google.com:19302,stun1.l.google.com:19302
MQTT_BROKER_URL=mqtt://localhost:1883
```

**Public Node** (Advertised, enables peer-to-peer relay):
```env
HUB_URL=https://hub1.gridnode.io:5000 # Connects to Validator Hub
NODE_PORT=5102 # Unique port for this client
PUBLIC_NODE=true
PUBLIC_ADDRESS=node1.gridnode.io:5102 # Publicly routable address
REGION_ID=london-dno
SUBSTATION_ID=substation-002
LAT=51.5200
LON=-0.0900
NODE_ROLE=aggregator
USE_WEBRTC=true
STUN_SERVERS=stun.l.google.com:19302,stun1.l.google.com:19302
MQTT_BROKER_URL=mqtt://localhost:1883
```

## Running the Network

### Start a Hub

```bash
cd gridnode-hub
npm start
# Hub listens on http://localhost:5000
# Dashboard: http://localhost:5000/dashboard
# Cluster Map: http://localhost:5000/cluster-map
```

### Start a Client Node

```bash
cd gridnode-client
npm start
# Node listens on http://localhost:5001
# Dashboard: http://localhost:5001/dashboard
```

### APIs

**Hub APIs** (`http://hub-url:5000`):
- `GET /api/hub-status` — Current hub and peer status
- `GET /api/hub-network` — Full cluster graph (all hubs, public nodes, stats)
- `GET /api/hub-peers` — Connected hub peers
- `GET /dashboard` — Hub operator dashboard
- `GET /cluster-map` — National grid operator real-time mesh view

**Client APIs** (`http://client-url:5001`):
- `GET /config` — Node configuration (nodeId, regionId, role)
- `GET /api/status` — Node status summary
- `GET /api/network` — Full network state (metrics, peers, WebRTC status)
- `GET /dashboard` — Local node dashboard

## Region Mapping

The system maps UK locations to 12 DNO regions:
- **london-dno** (Latitude: 51.4-51.7°N, Longitude: -0.3-0.0°W)
- **south-east-dno** (East Sussex, West Sussex, Surrey, Kent)
- **south-west-dno** (Dorset, Devon, Cornwall)
- **east-england-dno** (Norfolk, Suffolk, Cambridgeshire)
- **east-midlands-dno** (Nottinghamshire, Lincolnshire, Leicestershire)
- **west-midlands-dno** (Staffordshire, Wolverhampton, Birmingham)
- **north-west-dno** (Cheshire, Lancashire, Merseyside)
- **north-east-dno** (Tyne and Wear, Durham, Northumberland)
- **yorkshire-dno** (West Yorkshire, North Yorkshire)
- **wales-dno** (Powys, Glamorgan, Gwent)
- **scotland-dno** (Central Belt, Highlands)
- **northern-ireland-dno** (All NI)

Coordinates outside the UK default to a **global** pseudo-region.

## Encryption & Privacy

- **RSA 2048-bit** keypairs for each hub
- **OAEP-SHA256** encryption for sensitive metrics (battery state-of-charge, reserve status)
- **SHA256 signing** for payload authentication
- **Public metrics** visible to all connected nodes (power flow, aggregate load)
- **Regional aggregation** — hubs mask individual addresses, show only region-level summaries

## WebRTC & NAT Traversal

- **STUN servers** enable direct peer connectivity across firewalls
- **Simple-peer** establishes bidirectional data channels
- **ICE candidates** exchanged via Socket.IO for signaling
- Direct node-to-node communication for low-latency metrics relay

## Monitoring

### Hub Dashboard (`http://hub:5000/dashboard`)
- Network stats (total nodes, public peers, hub peers)
- Region table with aggregated reserves and battery power
- Public node list with region/role/address
- Connected hub peers table

### Cluster Map (`http://hub:5000/cluster-map`)
- Real-time hub mesh topology
- All connected public nodes by region
- Live updates via Socket.IO
- JSON payload for external system integration

### Client Dashboard (`http://client:5001/dashboard`)
- Node config (ID, region, role, public flag)
- Hub connection status
- Live metrics (house load, battery power, reserve, SOC)
- Socket.IO peers table (relay nodes)
- WebRTC peers table (direct connections)

## Troubleshooting

### Hub not seeing nodes
- Check `HUB_PEER_HUBS` environment variable (comma-separated URLs)
- Verify `HUB_PUBLIC_KEY` / `HUB_PRIVATE_KEY` are set on hub
- Check client `HUB_URL` matches hub `HUB_PUBLIC_URL`

### Nodes not connecting to hub
- Verify hub is running and accessible at `HUB_URL`
- Check Socket.IO firewall rules (default port 4000)
- Verify node `.env` has correct `HUB_URL`

### WebRTC not working
- Test STUN server connectivity: `nc -u -v stun.l.google.com 19302`
- Check `USE_WEBRTC=true` on client
- Verify `STUN_SERVERS` are configured
- Check browser console for ICE candidate errors (client.js)

### Metrics not updating
- Verify MQTT broker running at `MQTT_BROKER_URL`
- Check GivEnergy battery topics (`GivEnergy/+/p_battery`, `GivEnergy/+/soc`)
- Falls back to random data if MQTT unavailable (for testing)

## Scaling to National Grid

For national operators to monitor all regions:

1. **Deploy regional hubs** (validator/historian pairs per DNO region)
2. **Configure hub peering** (each hub knows all other regional hubs)
3. **Access cluster-map** (`https://hub1.gridnode.io:5000/cluster-map`)
4. **Poll `/api/hub-network`** for programmatic integration

Example aggregation query:
```bash
curl https://hub1.gridnode.io:5000/api/hub-network | jq '.stats'
# Returns: { totalNodes: 1547, publicNodes: 342, hubPeers: 11, regionCount: 12 }
```

## License

MIT
