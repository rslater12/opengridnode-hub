import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
import { Server } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import Peer from 'simple-peer';
import { decryptWithPrivateKey, mapLocationToRegion, getDistance } from '../../gridnode-crypto/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4000);
const HUB_PUBLIC_URL = process.env.HUB_PUBLIC_URL || `http://localhost:${PORT}`;
const HUB_ID = process.env.HUB_ID || `hub-${randomUUID()}`;
const HUB_ROLE = process.env.HUB_ROLE || 'validator';
const HUB_PEER_HUBS = process.env.HUB_PEER_HUBS?.split(',').map((url) => url.trim()).filter(Boolean) || [];
const STUN_SERVERS = process.env.STUN_SERVERS?.split(',').map((url) => ({ urls: url.trim() })).filter(Boolean) || [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const HUB_KEY_PAIR = {
    publicKey: process.env.HUB_PUBLIC_KEY || null,
    privateKey: process.env.HUB_PRIVATE_KEY || null
};

function ensureHubKeys() {
    if (HUB_KEY_PAIR.publicKey && HUB_KEY_PAIR.privateKey) {
        return HUB_KEY_PAIR;
    }
    throw new Error('HUB_PUBLIC_KEY and HUB_PRIVATE_KEY must be configured in .env for encryption.');
}

// Load Substation Data
const substationDataPath = path.join(__dirname, '/../data/substationData.json');
let substations = [];
try {
    const raw = JSON.parse(fs.readFileSync(substationDataPath, 'utf8'));
    // Normalize: Handle raw array or Overpass "elements" wrapper
    substations = Array.isArray(raw) ? raw : (raw.elements || raw.substations || []);

    console.log(`[hub] loaded ${substations.length} substations from ${substationDataPath}`);
} catch (e) {
    console.error('[hub] failed to load substation.json:', e.message);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const nodes = new Map();
const nodeSockets = new Map();
const hubPeers = new Map();
const hubPeerSockets = new Map();
const webrtcPeers = new Map();

function maskNodeForRegistry(node, ownerHubId = HUB_ID) {
    return {
        nodeId: node.nodeId,
        regionId: node.regionId,
        substationId: node.substationId,
        nodeRole: node.nodeRole || 'edge',
        publicAddress: node.publicAddress || null,
        lastSeen: node.lastSeen,
        connectedToHub: node.connectedToHub || ownerHubId,
        metrics: node.metrics ? {
            batteryPower: node.metrics.batteryPower,
            batteryReserve: node.metrics.batteryReserve,
            batteryCapacity: node.metrics.batteryCapacity,
            energyRemaining: node.metrics.energyRemaining,
            visibleLoad: node.metrics.visibleLoad,
            regionStatus: node.metrics.regionStatus,
            soc: node.metrics.soc,
            dischargeRate: node.metrics.dischargeRate,
            solarToday: node.metrics.solarToday,
            storageToday: node.metrics.storageToday,
            exportPower: node.metrics.exportPower,
            exportToday: node.metrics.exportToday,
            solarPower: node.metrics.solarPower,
            batteryToGrid: node.metrics.batteryToGrid,
            solarToGrid: node.metrics.solarToGrid,
            solarToHouse: node.metrics.solarToHouse,
            batteryToHouse: node.metrics.batteryToHouse,
            gridToHouse: node.metrics.gridToHouse,
            gridToBattery: node.metrics.gridToBattery,
            solarToBattery: node.metrics.solarToBattery
        } : null
    };
}

function maskHubPeer(peer) {
    return {
        hubId: peer.hubId,
        role: peer.role,
        publicUrl: peer.publicUrl,
        connected: peer.connected,
        lastSeen: peer.lastSeen,
        publicKey: peer.publicKey
    };
}

function getAllNodes() {
    const local = Array.from(nodes.values()).map(maskNodeForRegistry);
    const remote = [];
    hubPeers.forEach(peer => {
        if (peer.registry?.nodes) {
            remote.push(...peer.registry.nodes);
        }
    });
    const all = [...local, ...remote];
    const uniqueMap = new Map(all.map(n => [n.nodeId, n]));
    return Array.from(uniqueMap.values());
}

function aggregateRegions() {
    const regions = {};

    const allNodes = getAllNodes();
    allNodes.forEach(node => {
        if (!node.metrics) return;
        const region = node.regionId || 'unknown-region';
        const entry = regions[region] ?? { reserveKW: 0, batteryPowerKW: 0, batteryCapacityKwh: 0, energyRemainingKwh: 0, nodeCount: 0, utilization: 0, houseLoadW: 0, solarTodayKWh: 0, storageTodayKWh: 0, totalExportKW: 0, totalExportTodayKWh: 0, totalSolarW: 0, totalSolarToGridW: 0, totalBatteryToGridW: 0, netImpactW: 0, substations: {} };

        // Convert Watts to kW for regional display
        entry.reserveKW += Number(node.metrics.batteryReserve || 0) / 1000;
        entry.batteryPowerKW += Number(node.metrics.batteryPower || 0) / 1000;
        entry.batteryCapacityKwh += Number(node.metrics.batteryCapacity || 0);
        entry.energyRemainingKwh += Number(node.metrics.energyRemaining || 0);
        entry.houseLoadW += Number(node.metrics.visibleLoad || 0);
        entry.solarTodayKWh += Number(node.metrics.solarToday || 0);
        entry.storageTodayKWh += Number(node.metrics.storageToday || 0);
        entry.nodeCount += 1;
        entry.totalExportTodayKWh += Number(node.metrics.exportToday || 0);
        entry.totalSolarW += Number(node.metrics.solarPower || 0);
        entry.totalSolarToGridW += Number(node.metrics.solarToGrid || 0);
        entry.totalBatteryToGridW += Number(node.metrics.batteryToGrid || 0);

        // Net Grid Impact = (Load + Charging) - (Solar + Discharge)
        // Note: batteryPower is + for charging, - for discharge in your adapter
        entry.netImpactW += (Number(node.metrics.visibleLoad || 0) + Number(node.metrics.batteryPower || 0) - Number(node.metrics.solarPower || 0));

        const exportPower = Number(node.metrics.exportPower || 0);
        const bPower = Number(node.metrics.batteryPower || 0);

        // Use meter-reported export if available, otherwise fall back to battery discharge proxy
        if (exportPower > 0) {
            entry.totalExportKW += exportPower / 1000;
        } else if (bPower < 0) {
            entry.totalExportKW += Math.abs(bPower) / 1000;
        }

        // Substation Breakdown
        const subId = node.substationId || 'unlinked';
        const subData = substations.find(s => s.id === subId);
        const subName = subData ? subData.name : 'Unknown Substation';

        const subEntry = entry.substations[subId] ?? { name: subName, reserveKW: 0, batteryPowerKW: 0, nodeCount: 0, exportKW: 0, exportTodayKWh: 0, solarToGridW: 0, batteryToGridW: 0, solarPowerW: 0, netImpactW: 0 };
        subEntry.reserveKW += Number(node.metrics.batteryReserve || 0) / 1000;
        subEntry.batteryPowerKW += bPower / 1000;

        if (exportPower > 0) subEntry.exportKW += exportPower / 1000;
        else if (bPower < 0) subEntry.exportKW += Math.abs(bPower) / 1000;
        subEntry.exportTodayKWh += Number(node.metrics.exportToday || 0);
        subEntry.solarPowerW += Number(node.metrics.solarPower || 0);
        subEntry.solarToGridW += Number(node.metrics.solarToGrid || 0);
        subEntry.batteryToGridW += Number(node.metrics.batteryToGrid || 0);
        subEntry.netImpactW += (Number(node.metrics.visibleLoad || 0) + bPower - Number(node.metrics.solarPower || 0));

        subEntry.nodeCount += 1;
        entry.substations[subId] = subEntry;

        regions[region] = entry;
    });

    // Calculate utilization for each region
    for (const regionId in regions) {
        const region = regions[regionId];
        region.freeSpaceKwh = Math.max(0, region.batteryCapacityKwh - region.energyRemainingKwh);
        if (region.batteryCapacityKwh > 0) {
            region.utilization = (region.energyRemainingKwh / region.batteryCapacityKwh) * 100;
        } else {
            region.utilization = 0; // No capacity, so 0% utilization
        }
    }

    return regions;
}

function getPublicPeers() {
    // Start with local public nodes
    const localPublic = Array.from(nodes.values())
        .filter((node) => node.publicAddress)
        .map(maskNodeForRegistry);

    // Add public nodes discovered from peer hubs
    const remotePublic = [];
    hubPeers.forEach(peer => {
        if (peer.registry?.nodes) {
            const peerPublicNodes = peer.registry.nodes.filter(n => n.publicAddress);
            remotePublic.push(...peerPublicNodes);
        }
    });

    // Combine and deduplicate by nodeId to prevent overlaps in the UI
    const allPublic = [...localPublic, ...remotePublic];
    const uniqueMap = new Map(allPublic.map(node => [node.nodeId, node]));
    return Array.from(uniqueMap.values());
}

function createHubRegistryPayload() {
    const cluster = getClusterGraph();
    return {
        hubId: HUB_ID,
        hubRole: HUB_ROLE,
        publicUrl: HUB_PUBLIC_URL,
        hub: HUB_PUBLIC_URL, // Matches dashboard 'hub' field
        totalNodes: cluster.stats.totalNodes, // Matches dashboard 'totalNodes' field
        peerGraph: cluster.stats, // Matches dashboard 'peerGraph' stats logic
        peers: cluster.publicNodes, // Matches dashboard 'peers' table logic
        hubPeers: cluster.peerHubs, // Matches dashboard 'hubPeers' table logic
        nodes: Array.from(nodes.values()).map(node => maskNodeForRegistry(node, HUB_ID)),
        regions: cluster.regions,
        timestamp: new Date().toISOString()
    };
}

function getHubPeerList() {
    return Array.from(hubPeers.values()).map(maskHubPeer);
}

function getClusterGraph() {
    const allNodes = getAllNodes();
    const regions = aggregateRegions();
    return {
        hub: { hubId: HUB_ID, role: HUB_ROLE, publicUrl: HUB_PUBLIC_URL, connected: true },
        peerHubs: getHubPeerList(),
        publicNodes: getPublicPeers(),
        stats: {
            totalNodes: allNodes.length,
            totalPublicNodes: allNodes.filter(n => n.publicAddress).length,
            totalHubPeers: getHubPeerList().length,
            totalRegions: Object.keys(regions).length,
            totalReserve: Object.values(regions).reduce((sum, r) => sum + r.reserveKW, 0),
            totalCapacity: Object.values(regions).reduce((sum, r) => sum + r.batteryCapacityKwh, 0),
            totalStored: Object.values(regions).reduce((sum, r) => sum + r.energyRemainingKwh, 0),
            totalFreeSpace: Object.values(regions).reduce((sum, r) => sum + r.freeSpaceKwh, 0),
            totalExport: Object.values(regions).reduce((sum, r) => sum + (r.totalExportKW || 0), 0),
            totalExportToday: Object.values(regions).reduce((sum, r) => sum + (r.totalExportTodayKWh || 0), 0),
            totalSolar: Object.values(regions).reduce((sum, r) => sum + (r.totalSolarW || 0), 0)
        },
        regions
    };
}

function broadcastNodeRegistry() {
    const globalNodes = getAllNodes();
    const payload = createHubRegistryPayload();
    io.emit('registry-update', payload);
    io.emit('cluster-map-update', getClusterGraph());
    hubPeerSockets.forEach((socket) => {
        if (socket.connected) {
            socket.emit('peer-hub-registry', payload);
        }
    });
}

function sendToNode(targetNodeId, event, payload) {
    const socket = nodeSockets.get(targetNodeId);
    if (socket && socket.connected) {
        socket.emit(event, payload);
        return true;
    }
    return false;
}

function sendToHubPeer(targetHubId, event, payload) {
    for (const socket of hubPeerSockets.values()) {
        if (socket.connected && socket.hubId === targetHubId) {
            socket.emit(event, payload);
            return true;
        }
    }
    return false;
}

function createWebrtcPeer(peerId, initiator = false) {
    if (webrtcPeers.has(peerId)) return webrtcPeers.get(peerId);
    const peer = new Peer({ initiator, trickle: true, config: { iceServers: STUN_SERVERS } });

    peer.on('signal', (signal) => {
        const payload = { fromHubId: HUB_ID, targetNodeId: peerId, signal };
        if (!sendToNode(peerId, 'webrtc-signal', payload)) {
            io.emit('webrtc-signal', payload);
        }
    });

    peer.on('connect', () => {
        console.log(`[webrtc] connected to ${peerId}`);
    });
    peer.on('data', (data) => {
        console.log(`[webrtc] data from ${peerId}:`, data.toString());
    });
    peer.on('close', () => {
        webrtcPeers.delete(peerId);
    });
    peer.on('error', (error) => {
        console.warn('[webrtc] error from', peerId, error.message);
    });

    webrtcPeers.set(peerId, peer);
    return peer;
}

function handleWebrtcSignal(payload) {
    if (!payload?.fromNodeId || !payload?.signal) return;
    const peer = createWebrtcPeer(payload.fromNodeId, false);
    peer.signal(payload.signal);
}

function setupHubPeer(url) {
    if (hubPeerSockets.has(url)) return;
    const socket = ClientIO(url, { path: '/socket.io', transports: ['websocket'] });
    const peerState = { hubId: null, role: 'unknown', publicUrl: url, connected: false, lastSeen: new Date().toISOString() };

    socket.on('connect', () => {
        peerState.connected = true;
        peerState.lastSeen = new Date().toISOString();
        console.log(`[hub peer] connected to ${url}`);
        const keys = ensureHubKeys();
        socket.emit('peer-hub-register', { hubId: HUB_ID, role: HUB_ROLE, publicUrl: HUB_PUBLIC_URL, publicKey: keys.publicKey });
        broadcastNodeRegistry();
    });

    socket.on('peer-hub-registry', (payload) => {
        if (!payload?.hubId) return;
        console.log(`[hub peer] received registry from ${payload.hubId} (${url})`);
        peerState.hubId = payload.hubId;
        peerState.role = payload.role || peerState.role;
        peerState.publicUrl = payload.publicUrl || peerState.publicUrl;
        peerState.publicKey = payload.publicKey || peerState.publicKey;
        peerState.lastSeen = new Date().toISOString();
        peerState.registry = payload; // Store the full registry from the peer
        peerState.connected = true;
        hubPeers.set(url, { ...peerState });
        broadcastNodeRegistry();
    });

    socket.on('webrtc-signal', (payload) => {
        if (payload?.targetHubId === HUB_ID) {
            if (payload.targetNodeId) {
                sendToNode(payload.targetNodeId, 'webrtc-signal', payload);
            }
        }
    });

    socket.on('disconnect', () => {
        peerState.connected = false;
        peerState.lastSeen = new Date().toISOString();
        hubPeers.set(url, { ...peerState });
        console.log(`[hub peer] disconnected from ${url}`);
        broadcastNodeRegistry();
    });

    hubPeerSockets.set(url, socket);
    hubPeers.set(url, peerState);
}

function connectToHubPeers() {
    HUB_PEER_HUBS.forEach((url) => setupHubPeer(url));
}

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/cluster-map', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/cluster-map.html'));
});

app.get('/api/hub-status', (req, res) => {
    const mesh = getClusterGraph();
    res.json({
        hub: HUB_PUBLIC_URL,
        hubId: HUB_ID,
        hubRole: HUB_ROLE,
        totalNodes: mesh.stats.totalNodes,
        regions: mesh.regions,
        peers: mesh.publicNodes,
        hubPeers: mesh.peerHubs,
        peerGraph: mesh.stats
    });
});

app.get('/api/hub-network', (req, res) => {
    res.json(getClusterGraph());
});

app.get('/api/cluster-map', (req, res) => {
    res.json(getClusterGraph());
});

app.get('/api/hub-peers', (req, res) => {
    res.json(getHubPeerList());
});

app.get('/api/substations', (req, res) => {
    res.json(substations);
});

app.get('/hub-public-key', (req, res) => {
    try {
        const { publicKey } = ensureHubKeys();
        res.type('text/plain').send(publicKey);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

io.on('connection', (socket) => {
    let registeredNodeId = null;
    let registeredHubUrl = null;

    // Handle incoming peering requests from other Hubs
    socket.on('peer-hub-register', (payload) => {
        if (!payload?.hubId || !payload?.publicUrl) return;

        const url = payload.publicUrl;
        const peerState = {
            incoming: true,
            hubId: payload.hubId,
            role: payload.role || 'unknown',
            publicUrl: url,
            publicKey: payload.publicKey || null,
            connected: true,
            lastSeen: new Date().toISOString(),
            registry: payload
        };

        hubPeers.set(url, peerState);
        hubPeerSockets.set(url, socket);
        registeredHubUrl = url;

        console.log(`[hub peer] incoming registration from ${payload.hubId} (${url})`);

        // Immediate bi-directional response so the caller knows our ID and registry
        socket.emit('peer-hub-registry', createHubRegistryPayload());

        broadcastNodeRegistry();
    });

    socket.on('peer-hub-registry', (payload) => {
        if (!payload?.publicUrl || !hubPeers.has(payload.publicUrl)) return;
        const peer = hubPeers.get(payload.publicUrl);
        peer.registry = payload;
        if (payload.publicKey) {
            peer.publicKey = payload.publicKey;
        }
        broadcastNodeRegistry();
    });

    socket.on('register', (payload, ack) => {
        const incoming = payload || {};
        const nodeId = incoming.nodeId || randomUUID();
        registeredNodeId = nodeId;

        const node = {
            socketId: socket.id,
            nodeId,
            regionId: incoming.regionId || 'unknown-region',
            substationId: incoming.substationId || 'unknown-substation',
            lat: incoming.lat || null,
            lon: incoming.lon || null,
            publicAddress: incoming.publicAddress || null,
            publicKey: incoming.publicKey || null,
            nodeRole: incoming.nodeRole || 'edge',
            lastSeen: new Date().toISOString(),
            metrics: null
        };

        nodes.set(nodeId, node);
        nodeSockets.set(nodeId, socket);
        broadcastNodeRegistry();

        ack?.({ status: 'ok', hubPublicUrl: HUB_PUBLIC_URL, nodes: Array.from(nodes.values()).map(maskNodeForRegistry) });
    });

    socket.on('node-heartbeat', (payload) => {
        if (!registeredNodeId || !nodes.has(registeredNodeId)) return;
        const node = nodes.get(registeredNodeId);
        node.lastSeen = new Date().toISOString();
        node.metrics = payload?.publicMetrics || node.metrics;
        nodes.set(registeredNodeId, node);
        broadcastNodeRegistry();
    });

    socket.on('encrypted-payload', (payload, ack) => {
        if (!payload?.ciphertext || !registeredNodeId) {
            return ack?.({ error: 'invalid payload' });
        }
        try {
            const { privateKey } = ensureHubKeys();
            const decrypted = decryptWithPrivateKey(payload.ciphertext, privateKey);
            const parsed = JSON.parse(decrypted);
            const node = nodes.get(registeredNodeId);
            if (node) {
                node.privateMetrics = parsed;
                nodes.set(registeredNodeId, node);
                broadcastNodeRegistry();
            }
            ack?.({ status: 'decrypted' });
        } catch (error) {
            ack?.({ error: error.message });
        }
    });

    socket.on('request-peers', (callback) => {
        callback?.({ peers: getPublicPeers(), hubPublicUrl: HUB_PUBLIC_URL, hubPeers: getHubPeerList() });
    });

    socket.on('relay-to-peer', (payload, ack) => {
        if (!payload?.targetNodeId || !payload?.message) {
            return ack?.({ error: 'targetNodeId and message are required' });
        }
        const sent = sendToNode(payload.targetNodeId, 'relay-message', {
            from: registeredNodeId,
            message: payload.message,
            viaHub: true
        });
        if (!sent) {
            return ack?.({ error: `Target ${payload.targetNodeId} not available` });
        }
        ack?.({ status: 'forwarded' });
    });

    socket.on('webrtc-signal', (payload) => {
        if (!payload?.fromNodeId || !payload?.signal) return;
        if (payload.targetNodeId === registeredNodeId) {
            socket.emit('webrtc-signal', payload);
            return;
        }
        if (payload.targetNodeId) {
            sendToNode(payload.targetNodeId, 'webrtc-signal', payload);
        }
    });

    socket.on('hub-broadcast', (payload) => {
        io.emit('hub-broadcast', { from: registeredNodeId, payload });
    });

    socket.on('disconnect', () => {
        if (registeredNodeId) {
            nodes.delete(registeredNodeId);
            nodeSockets.delete(registeredNodeId);
            broadcastNodeRegistry();
        }

        if (registeredHubUrl) {
            const peer = hubPeers.get(registeredHubUrl);
            if (peer && peer.incoming) {
                peer.connected = false;
                peer.lastSeen = new Date().toISOString();
                hubPeers.set(registeredHubUrl, peer);
                console.log(`[hub peer] incoming connection lost: ${registeredHubUrl}`);
                broadcastNodeRegistry();
            }
        }
    });
});

connectToHubPeers();

server.listen(PORT, () => {
    console.log(`OpenGridNode Hub running on ${HUB_PUBLIC_URL}`);
    console.log(`Hub public key available at ${HUB_PUBLIC_URL}/hub-public-key`);
    if (HUB_PEER_HUBS.length) {
        console.log('Connecting to peer hubs:', HUB_PEER_HUBS.join(', '));
    }
});
