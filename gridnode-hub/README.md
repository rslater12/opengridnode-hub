# GridNode Hub

A central hub for a tor-like, peer-aware distributed grid node network.

## What it does

- Accepts node registration from distributed clients
- Keeps a registry of public peer addresses and region metadata
- Provides a `/status` API for aggregated region and node health
- Publishes a hub public key at `/hub-public-key`
- Supports encrypted private metrics and a masked public registry

## Quick start

1. Create `.env` in `gridnode-hub`

```ini
PORT=5000
HUB_PUBLIC_URL=http://localhost:5000
HUB_PUBLIC_KEY="<your-public-key>"
HUB_PRIVATE_KEY="<your-private-key>"
```

2. Install dependencies

```bash
cd gridnode-hub
npm install
```

3. Run the hub

```bash
npm start
```

## Design notes

- Nodes send only masked metrics for public visibility.
- The hub aggregates by `regionId` and `substationId` only.
- Public node addresses are shared only when configured, enabling peer discovery.
- If the hub goes offline, nodes may continue exchanging status via direct peer links.

## Dashboard

- Open `http://localhost:5000/dashboard` to view the Hub dashboard.
- The dashboard shows total nodes, public peers, region aggregates, and live updates.
- The hub exposes `/api/hub-status` and `/hub-public-key` for external integration.
