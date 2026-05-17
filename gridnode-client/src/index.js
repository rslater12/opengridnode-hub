import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Server } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import dotenv from 'dotenv';
import axios from 'axios';
import Peer from 'simple-peer';
import { createNodeId, generateKeyPair, mapLocationToRegion, /* getDistance, */ encryptToPublicKey, signPayload } from '../../gridnode-crypto/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

// Helper utility to safely extract latitude and longitude from different JSON structures
function getSubstationCoords(sub) {
    const lat = sub.lat || (sub.center ? sub.center.lat : null);
    const lon = sub.lon || (sub.center ? sub.center.lon : null);
    return {
        lat: lat !== null ? Number(lat) : null,
        lon: lon !== null ? Number(lon) : null
    };
}

// Haversine formula to compute physical distance between two coordinate pairs
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Function to find nearest substation
function findNearestSubstation(lat, lon, subs) {
    if (!subs || subs.length === 0) return null;

    const nLat = Number(lat);
    const nLon = Number(lon);

    const validSubs = subs.filter(sub => {
        const coords = getSubstationCoords(sub);
        return coords.lat !== null && coords.lon !== null;
    });

    if (validSubs.length === 0) return null;

    const nearest = validSubs.reduce((prev, curr) => {
        const cPrev = getSubstationCoords(prev);
        const cCurr = getSubstationCoords(curr);

        const dPrev = getDistance(nLat, nLon, cPrev.lat, cPrev.lon);
        const dCurr = getDistance(nLat, nLon, cCurr.lat, cCurr.lon);
        return dCurr < dPrev ? curr : prev;
    });

    const finalCoords = getSubstationCoords(nearest);
    const subId = String(nearest.id);
    const finalId = subId.startsWith('sub-') ? subId : `sub-${subId}`;

    let resolvedRegion = nearest.regionId || mapLocationToRegion(finalCoords.lat, finalCoords.lon) || mapLocationToRegion(nLat, nLon);

    // Direct Shropshire override rule to force West Midlands DNO allocation
    if (nLat >= 52.6 && nLat <= 53.1 && nLon >= -3.1 && nLon <= -2.0) {
        resolvedRegion = 'west-midlands-dno';
    }

    if (!resolvedRegion || resolvedRegion === 'unknown-region') {
        resolvedRegion = 'west-midlands-dno';
    }

    return {
        id: finalId,
        name: nearest.name || (nearest.tags && nearest.tags.name) || `Substation #${nearest.id}`,
        lat: finalCoords.lat,
        lon: finalCoords.lon,
        regionId: resolvedRegion
    };
}

// Function to update .env file with discovered Substation ID
function updateEnvFile(updates) {
    const envPath = path.join(__dirname, '../.env');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    let lines = content.split('\n');

    for (const [key, value] of Object.entries(updates)) {
        const index = lines.findIndex(l => l.trim().startsWith(key + '=') || l.trim().startsWith(key + ' ='));
        if (index !== -1) {
            const parts = lines[index].split('=');
            lines[index] = `${parts[0].trimEnd()}=${value}`;
        } else {
            lines.unshift(`${key}=${value}`);
        }
    }
    fs.writeFileSync(envPath, lines.join('\n').trim() + '\n');
}

// Load Local Config and Database
const substationDataPath = path.join(__dirname, '../data/substationData.json');
let substationDb = [];

try {
    const raw = JSON.parse(fs.readFileSync(substationDataPath, 'utf8'));
    substationDb = Array.isArray(raw) ? raw : (raw.elements || raw.substations || []);
    console.log(`[client] database initialized with ${substationDb.length} substations`);
} catch (e) {
    console.warn('[config] substation db not found, using .env defaults.');
}

const config = {
    hubUrl: process.env.HUB_URL || 'http://localhost:4000',
    nodePort: Number(process.env.NODE_PORT || 5001),
    publicNode: process.env.PUBLIC_NODE === 'true',
    publicAddress: process.env.PUBLIC_ADDRESS || null,
    regionId: process.env.REGION_ID || null,
    substationId: process.env.SUBSTATION_ID || 'substation-default',
    lat: process.env.LAT ? Number(process.env.LAT) : null,
    lon: process.env.LON ? Number(process.env.LON) : null,
    heartbeatInterval: Number(process.env.HEARTBEAT_INTERVAL || 30000),
    hubPublicKey: process.env.HUB_PUBLIC_KEY || null,
    adapterType: process.env.ADAPTER_TYPE || 'givenergy-mqtt',
    mqttBrokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    nodeRole: process.env.NODE_ROLE || 'edge',
    stunServers: process.env.STUN_SERVERS?.split(',').map((url) => ({ urls: url.trim() })).filter(Boolean) || [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
    useWebrtc: process.env.USE_WEBRTC === 'true' || Boolean(process.env.STUN_SERVERS)
};

// Turn these into modifiable state references instead of constant locked variables
let nodeId = createNodeId({ lat: config.lat, lon: config.lon, regionId: config.regionId, substationId: config.substationId });
let regionId = config.regionId || mapLocationToRegion(config.lat, config.lon);
const nodeKeys = generateKeyPair();

const app = express();
const server = http.createServer(app);
const ioServer = new Server(server, { cors: { origin: '*' } });

const peerSockets = new Map();
const peerMetadata = new Map();
const webrtcPeers = new Map();
let hubSocket = null;
let hubPublicKey = config.hubPublicKey;
let latestMetrics = null;
let latestRegistry = null;

app.use(express.json());
app.use(express.static(publicDir));

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/config', (req, res) => {
    res.sendFile(path.resolve(publicDir, 'config.html'));
});

app.get('/api/config', (req, res) => {
    res.json({
        nodeId,
        regionId,
        substationId: config.substationId,
        publicNode: config.publicNode,
        publicAddress: config.publicAddress,
        hubUrl: config.hubUrl,
        localUrl: `http://localhost:${config.nodePort}`,
        nodeRole: config.nodeRole,
        useWebrtc: config.useWebrtc,
        stunServers: config.stunServers
    });
});

app.get('/api/substations', (req, res) => {
    res.json(substationDb);
});

app.post('/api/config-location', (req, res) => {
    let { lat, lon } = req.body;
    if (!lat || !lon) return res.status(400).json({ error: 'Latitude and Longitude are required' });

    let nLat = Number(lat);
    let nLon = Number(lon);

    // Strictly ensure only the longitude is modified if entered incorrectly
    if (nLon > 0) {
        nLon = -nLon;
        console.log(`[config] Corrected longitude to negative scale: ${nLon}`);
    }

    const nearest = findNearestSubstation(nLat, nLon, substationDb);
    if (!nearest) return res.status(500).json({ error: 'Substation database empty' });

    updateEnvFile({
        LAT: nLat,
        LON: nLon,
        SUBSTATION_ID: nearest.id,
        REGION_ID: nearest.regionId
    });

    process.env.LAT = String(nLat);
    process.env.LON = String(nLon);
    process.env.SUBSTATION_ID = nearest.id;
    process.env.REGION_ID = nearest.regionId;

    config.lat = nLat;
    config.lon = nLon;
    config.substationId = nearest.id;
    config.regionId = nearest.regionId;

    regionId = nearest.regionId;
    nodeId = createNodeId({ lat: config.lat, lon: config.lon, regionId: config.regionId, substationId: config.substationId });

    if (hubSocket) {
        console.log('[client] Re-registering with hub using updated coordinates...');
        hubSocket.disconnect();
        connectToHub();
    }

    res.json({ status: 'ok', substation: nearest });
});

app.get('/api/status', (req, res) => {
    res.json({
        nodeId,
        regionId,
        substationId: config.substationId,
        publicNode: config.publicNode,
        publicAddress: config.publicAddress,
        latestMetrics,
        peerCount: peerSockets.size,
        peerMetadata: Array.from(peerMetadata.values()),
        webrtcPeers: Array.from(webrtcPeers.keys())
    });
});

app.get('/api/network', (req, res) => {
    res.json({
        nodeId,
        regionId,
        publicNode: config.publicNode,
        publicAddress: config.publicAddress,
        connectedPeers: Array.from(peerSockets.keys()),
        latestMetrics,
        hubConnected: hubSocket?.connected || false,
        latestRegistry,
        webrtcPeers: Array.from(webrtcPeers.keys())
    });
});

function notifyLocalClients() {
    ioServer.emit('local-update', {
        latestMetrics,
        peerCount: peerSockets.size,
        connectedPeers: Array.from(peerSockets.keys()),
        hubConnected: hubSocket?.connected || false,
        latestRegistry,
        webrtcPeers: Array.from(webrtcPeers.keys())
    });
}

function createWebrtcPeer(peerId, initiator = false) {
    if (!config.useWebrtc) return null;
    if (webrtcPeers.has(peerId)) return webrtcPeers.get(peerId);

    const peer = new Peer({ initiator, trickle: true, config: { iceServers: config.stunServers } });

    peer.on('signal', (signal) => {
        const payload = { fromNodeId: nodeId, targetNodeId: peerId, signal };
        const directSocket = peerSockets.get(peerId);
        if (directSocket?.connected) {
            directSocket.emit('webrtc-signal', payload);
            return;
        }
        if (hubSocket?.connected) {
            hubSocket.emit('webrtc-signal', payload);
        }
    });

    peer.on('connect', () => {
        console.log(`[webrtc] connected to ${peerId}`);
        peerMetadata.set(peerId, { ...(peerMetadata.get(peerId) || {}), webrtcConnected: true, lastSeen: new Date().toISOString() });
        notifyLocalClients();
    });

    peer.on('data', (data) => {
        console.log(`[webrtc] data from ${peerId}:`, data.toString());
    });

    peer.on('close', () => {
        webrtcPeers.delete(peerId);
        const metadata = peerMetadata.get(peerId) || {};
        peerMetadata.set(peerId, { ...metadata, webrtcConnected: false, lastSeen: new Date().toISOString() });
        notifyLocalClients();
    });

    peer.on('error', (error) => {
        console.warn('[webrtc] error from', peerId, error.message);
    });

    webrtcPeers.set(peerId, peer);
    return peer;
}

function handleWebrtcSignal(payload) {
    if (!payload?.fromNodeId || !payload?.signal || payload.targetNodeId !== nodeId) return;
    const peer = createWebrtcPeer(payload.fromNodeId, false);
    if (peer) peer.signal(payload.signal);
}

function connectToPeer(address, peerId) {
    if (!address || peerId === nodeId) return;
    if (peerSockets.has(peerId) && peerMetadata.get(peerId)?.address === address) return;

    if (peerSockets.has(peerId)) {
        peerSockets.get(peerId).disconnect();
        peerSockets.delete(peerId);
    }

    const socket = ClientIO(address, { transports: ['websocket'], path: '/socket.io' });
    socket.on('connect', () => {
        console.log(`[peer] connected to ${peerId} at ${address}`);
        peerMetadata.set(peerId, { nodeId: peerId, address, connected: true, lastSeen: new Date().toISOString() });
        notifyLocalClients();
        if (config.useWebrtc) createWebrtcPeer(peerId, true);
    });
    socket.on('disconnect', () => {
        console.log(`[peer] disconnected from ${peerId}`);
        peerSockets.delete(peerId);
        peerMetadata.set(peerId, { nodeId: peerId, address, connected: false, lastSeen: new Date().toISOString() });
        notifyLocalClients();
    });
    socket.on('webrtc-signal', (payload) => handleWebrtcSignal(payload));
    socket.on('peer-relay', (payload) => {
        console.log('[peer-relay]', payload);
    });
    peerSockets.set(peerId, socket);
    peerMetadata.set(peerId, { nodeId: peerId, address, connected: false, lastSeen: new Date().toISOString() });
}

async function resolveHubPublicKey() {
    if (hubPublicKey) return hubPublicKey;
    try {
        const response = await axios.get(`${config.hubUrl}/hub-public-key`, { timeout: 5000 });
        hubPublicKey = response.data;
        return hubPublicKey;
    } catch (error) {
        console.warn('Could not fetch hub public key:', error.message);
        return null;
    }
}

function createPublicMetrics(sensors) {
    if (!sensors) return { visibleLoad: 0, batteryPower: 0, batteryReserve: 0 };

    return {
        visibleLoad: Number(sensors.houseLoad || 0).toFixed(0),
        batteryPower: Number(sensors.p_battery || 0).toFixed(0),
        batteryReserve: Number(sensors.reserve || 0).toFixed(0),
        batteryCapacity: parseFloat(sensors.batteryCapacityKwh || 0),
        energyRemaining: parseFloat(sensors.energyRemainingKwh || 0),
        solarToday: Number(sensors.solarTodayKwh || 0).toFixed(1),
        storageToday: Number(sensors.storageTodayKwh || 0).toFixed(1),
        dischargeRate: Number(sensors.dischargeRate || 0).toFixed(0),
        soc: Number(sensors.soc || 0).toFixed(0),
        regionStatus: sensors.regionStatus || 'stable',
        exportPower: Number(sensors.exportPower || 0).toFixed(0),
        exportToday: Number(sensors.exportTodayKwh || 0).toFixed(1),
        solarPower: Number(sensors.solarPower || 0).toFixed(0),
        batteryToGrid: Number(sensors.batteryToGrid || 0).toFixed(0),
        solarToGrid: Number(sensors.solarToGrid || 0).toFixed(0),
        solarToHouse: Number(sensors.solarToHouse || 0).toFixed(0),
        batteryToHouse: Number(sensors.batteryToHouse || 0).toFixed(0),
        gridToHouse: Number(sensors.gridToHouse || 0).toFixed(0),
        gridToBattery: Number(sensors.gridToBattery || 0).toFixed(0),
        solarToBattery: Number(sensors.solarToBattery || 0).toFixed(0)
    };
}

function createPrivatePayload(sensors) {
    return {
        exactLoad: sensors.houseLoad ?? null,
        exactSoc: sensors.soc ?? null,
        timestamp: new Date().toISOString()
    };
}

async function encryptPrivatePayload(payload) {
    const publicKey = await resolveHubPublicKey();
    if (!publicKey) return null;
    return encryptToPublicKey(payload, publicKey);
}

async function connectToHub() {
    if (hubSocket && hubSocket.connected) return;
    hubSocket = ClientIO(config.hubUrl, { path: '/socket.io', transports: ['websocket'] });

    hubSocket.on('connect', () => {
        console.log('Connected to hub at', config.hubUrl);
        hubSocket.emit('register', {
            nodeId,
            regionId,
            substationId: config.substationId,
            lat: config.lat,
            lon: config.lon,
            publicAddress: config.publicNode ? config.publicAddress || `http://localhost:${config.nodePort}` : null,
            publicKey: nodeKeys.publicKey,
            nodeRole: config.nodeRole
        }, (ack) => {
            if (ack?.status === 'ok') {
                console.log('Registration ack received from hub. Current peer nodes:', ack.nodes.length);
            }
        });
    });

    hubSocket.on('registry-update', (payload) => {
        console.log('Hub registry updated:', payload.nodes?.length, 'nodes,', Object.keys(payload.regions || {}).length, 'regions');
        latestRegistry = payload;
        if (payload.peers) {
            for (const peer of payload.peers) {
                if (peer.publicAddress && peer.nodeId !== nodeId) {
                    connectToPeer(peer.publicAddress, peer.nodeId);
                }
            }
        }
        notifyLocalClients();
    });

    hubSocket.on('webrtc-signal', (payload) => handleWebrtcSignal(payload));

    hubSocket.on('relay-message', (payload) => {
        console.log('[hub relay]', payload);
    });

    hubSocket.on('hub-broadcast', (payload) => {
        console.log('[hub broadcast]', payload);
    });

    hubSocket.on('disconnect', () => {
        console.warn('Disconnected from hub; peer network fallback will continue when available.');
        notifyLocalClients();
    });
}

async function startHeartbeat(adapter) {
    const interval = Number(config.heartbeatInterval);
    setInterval(async () => {
        const sensors = await adapter.readMetrics();
        latestMetrics = sensors;
        const publicMetrics = createPublicMetrics(sensors);

        const privatePayload = createPrivatePayload(sensors);
        const encrypted = await encryptPrivatePayload(privatePayload);

        if (hubSocket?.connected) {
            hubSocket.emit('node-heartbeat', { publicMetrics }, (ack) => {
                if (ack?.error) console.warn('Hub heartbeat error:', ack.error);
            });
            if (encrypted) {
                hubSocket.emit('encrypted-payload', { ciphertext: encrypted }, (ack) => {
                    if (ack?.error) console.warn('Hub encrypted payload error:', ack.error);
                });
            }
        }

        await broadcastToPeers(publicMetrics);
        notifyLocalClients();
    }, interval);
}

async function broadcastToPeers(message) {
    const payload = { from: nodeId, message, timestamp: new Date().toISOString() };
    for (const socket of peerSockets.values()) {
        if (socket.connected) {
            socket.emit('peer-status', payload);
        }
    }
}

function startLocalServer() {
    return new Promise((resolve) => {
        server.listen(config.nodePort, () => {
            console.log(`OpenGridNode client node listening on port ${config.nodePort}`);
            resolve();
        });
    });
}

ioServer.on('connection', (socket) => {
    socket.on('request-local-status', () => {
        socket.emit('local-update', {
            latestMetrics,
            peerCount: peerSockets.size,
            connectedPeers: Array.from(peerSockets.keys()),
            hubConnected: hubSocket?.connected || false,
            latestRegistry,
            webrtcPeers: Array.from(webrtcPeers.keys())
        });
    });
});

async function main() {
    let adapter;

    console.log(`[client] Initializing hardware abstraction: ${config.adapterType}`);
    console.log(`[client] Mesh Identity: ${nodeId} in ${regionId}`);

    switch (config.adapterType) {
        case 'givenergy-mqtt':
            const { MqttAdapter } = await import('./adapters/mqttAdapter.js');
            adapter = new MqttAdapter({ brokerUrl: config.mqttBrokerUrl });
            break;
        case 'generic':
            const { GenericAdapter } = await import('./adapters/genericAdapter.js');
            adapter = new GenericAdapter();
            break;
        case 'tesla':
            throw new Error('Tesla adapter not yet implemented. Create teslaAdapter.js in adapters folder.');
        case 'victron':
            throw new Error('Victron adapter not yet implemented.');
        default:
            throw new Error(`Unsupported adapter type: ${config.adapterType}`);
    }

    await adapter.connect();
    await startLocalServer();
    await connectToHub();

    latestMetrics = await adapter.readMetrics();

    await startHeartbeat(adapter);
}

main().catch((err) => {
    console.error('Client startup failed:', err);
    process.exit(1);
});