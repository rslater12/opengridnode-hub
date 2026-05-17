# GridNode Quick Start (Local Test Network)

This guide gets you running a complete multi-node network on localhost for testing and development.

## Prerequisites

- Node.js 18+ (`node --version`)
- npm 8+ (`npm --version`)
- Terminal (4 concurrent windows/tabs recommended)

## 1. Install All Packages

```bash
cd /Users/Slater/Desktop/GridNode
npm install --prefix gridbnode-crypto
npm install --prefix gridnode-hub
npm install --prefix gridnode-client
```

## 2. Generate Hub RSA Keys

```bash
node -e "
const crypto = require('crypto');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

console.log('HUB_PUBLIC_KEY=' + publicKey.replace(/\n/g, '\\n'));
console.log('HUB_PRIVATE_KEY=' + privateKey.replace(/\n/g, '\\n'));
" > /tmp/hub-keys.txt

cat /tmp/hub-keys.txt
```

## 3. Configure Hub (Validator)

Create `gridnode-hub/.env`:
```
PORT=5000
HUB_PUBLIC_URL=http://localhost:5000
HUB_ID=hub-validator-001
HUB_ROLE=validator
HUB_PEER_HUBS=http://localhost:5010 # Peer to Hub 2
STUN_SERVERS=stun.l.google.com:19302
HUB_PUBLIC_KEY=[PASTE_FROM_ABOVE]
HUB_PRIVATE_KEY=[PASTE_FROM_ABOVE]
```

## 4. Configure Hub 2 (Historian)

Create `gridnode-hub/.env.2`:
```
PORT=5001
HUB_PUBLIC_URL=http://localhost:5001
HUB_ID=hub-historian-001
HUB_ROLE=historian
HUB_PEER_HUBS=http://localhost:5000
STUN_SERVERS=stun.l.google.com:19302
HUB_PUBLIC_KEY=[SAME_KEYS]
HUB_PRIVATE_KEY=[SAME_KEYS]
```

## 5. Configure Client Nodes

**Client 1 (Edge Node)** — `gridnode-client/.env`:
```
HUB_URL=http://localhost:5000
NODE_PORT=5001
PUBLIC_NODE=false
REGION_ID=london-dno
SUBSTATION_ID=sub-001
LAT=51.5074
LON=-0.1278
NODE_ROLE=edge
USE_WEBRTC=false
MQTT_BROKER_URL=mqtt://localhost:1883
```

**Client 2 (Public Node)** — `gridnode-client/.env.2`:
```
HUB_URL=http://localhost:5000
NODE_PORT=5002
PUBLIC_NODE=true
PUBLIC_ADDRESS=localhost:5002
REGION_ID=london-dno
SUBSTATION_ID=sub-002
LAT=51.5200
LON=-0.0900
NODE_ROLE=aggregator
USE_WEBRTC=false
MQTT_BROKER_URL=mqtt://localhost:1883
```

**Client 3** — `gridnode-client/.env.3`:
```
HUB_URL=http://localhost:5001
NODE_PORT=5003
PUBLIC_NODE=true
PUBLIC_ADDRESS=localhost:5003
REGION_ID=south-east-dno
SUBSTATION_ID=sub-003
LAT=50.8500
LON=0.0500
NODE_ROLE=aggregator
USE_WEBRTC=false
MQTT_BROKER_URL=mqtt://localhost:1883
```

## 6. Start the Network (4 Terminals)

**Terminal 1** — Hub 1 (Validator):
```bash
cd gridnode-hub
npm start
# Output: Server running on http://localhost:5000
```

**Terminal 2** — Hub 2 (Historian):
```bash
cd gridnode-hub
NODE_ENV=development node --env-file .env.2 src/index.js
# Output: Server running on http://localhost:5001
```

**Terminal 3** — Client 1:
```bash
cd gridnode-client
npm start
# Output: Client listening on http://localhost:5001
```

**Terminal 4a** — Client 2:
```bash
cd gridnode-client
NODE_ENV=development node --env-file .env.2 src/index.js
# Output: Client listening on http://localhost:5002
```

**Terminal 4b** (or new window) — Client 3:
```bash
cd gridnode-client
NODE_ENV=development node --env-file .env.3 src/index.js
# Output: Client listening on http://localhost:5003
```

## 7. Access Dashboards

- **Hub 1 Dashboard**: http://localhost:5000/dashboard
- **Hub 1 Cluster Map**: http://localhost:5000/cluster-map
- **Hub 2 Dashboard**: http://localhost:5001/dashboard
- **Client 1 Dashboard**: http://localhost:5001/dashboard
- **Client 2 Dashboard**: http://localhost:5002/dashboard
- **Client 3 Dashboard**: http://localhost:5003/dashboard

## 8. Test API Calls

```bash
# Check hub status
curl http://localhost:5000/api/hub-status | jq

# Get full cluster graph
curl http://localhost:5000/api/hub-network | jq '.publicNodes'

# Check client status
curl http://localhost:5001/api/status | jq

# Get client network state
curl http://localhost:5001/api/network | jq
```

## 9. Monitor Live Updates

Each dashboard auto-refreshes and listens to Socket.IO events:
- Hubs emit `registry-update` when nodes join/leave
- Hubs emit `cluster-map-update` when hub peers change
- Clients emit `local-update` with latest metrics

Watch the console in each terminal for event logs and connection updates.

## Troubleshooting

### "Cannot find module 'simple-peer'"
```bash
npm install --prefix gridnode-hub
npm install --prefix gridnode-client
```

### Hub not seeing nodes
- Verify client `HUB_URL` matches hub's PORT
- Check Socket.IO port (default 4000/4001) is not blocked
- Look at hub console for `register` event

### Nodes not showing in dashboard
- Refresh browser (F5)
- Check browser console for Socket.IO errors
- Verify node `.env` has correct `HUB_URL`

### WebRTC not connecting
- For local testing, can set `USE_WEBRTC=false` (use Socket.IO relay instead)
- With WebRTC on, check browser console in client dashboard for ICE candidates

## Next Steps

1. Modify `.env` files to test different regions (e.g., change LAT/LON)
2. Run 10+ client nodes to see aggregation effects
3. Inspect `/api/hub-network` JSON to understand data structure
4. Add real MQTT topics from local battery simulator
5. Deploy to VPS with real domains for multi-site testing

## Stopping Everything

```bash
# Kill all node processes
pkill -f "node.*gridnode"

# Or in each terminal: Ctrl+C
```


