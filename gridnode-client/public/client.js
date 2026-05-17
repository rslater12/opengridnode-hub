const socket = io();
const nodeIdEl = document.getElementById('node-id');
const regionIdEl = document.getElementById('region-id');
const nodeRoleEl = document.getElementById('node-role');
const publicNodeEl = document.getElementById('public-node');
const hubConnectedEl = document.getElementById('hub-connected');
const peerCountEl = document.getElementById('peer-count');
const webrtcStatusEl = document.getElementById('webrtc-status');
const houseLoadEl = document.getElementById('house-load');
const batteryPowerEl = document.getElementById('battery-power');
const batteryReserveEl = document.getElementById('battery-reserve');
const socEl = document.getElementById('soc');
const peersBody = document.getElementById('peers');
const webrtcPeersBody = document.getElementById('webrtc-peers');
const networkJson = document.getElementById('network-json');

function renderStatus(data) {
  nodeIdEl.textContent = data.nodeId;
  regionIdEl.textContent = data.regionId;
  nodeRoleEl.textContent = data.nodeRole || 'edge';
  publicNodeEl.textContent = data.publicNode ? 'Yes' : 'No';
  hubConnectedEl.textContent = data.hubConnected ? 'Yes' : 'No';
  peerCountEl.textContent = (data.connectedPeers || []).length;
  webrtcStatusEl.innerHTML = `<span class="status ${(data.webrtcPeers || []).length > 0 ? 'online' : 'offline'}">${(data.webrtcPeers || []).length} active</span>`;

  houseLoadEl.textContent = data.latestMetrics?.houseLoad ?? '-';
  batteryPowerEl.textContent = data.latestMetrics?.p_battery ?? '-';
  batteryReserveEl.textContent = data.latestMetrics?.reserve ?? '-';
  socEl.textContent = data.latestMetrics?.soc ?? '-';

  peersBody.innerHTML = '';
  (data.connectedPeers || []).forEach((peerId) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td><code>${peerId.slice(0, 16)}</code></td><td><span class="status online">connected</span></td><td>Socket.IO</td>`;
    peersBody.appendChild(row);
  });

  webrtcPeersBody.innerHTML = '';
  (data.webrtcPeers || []).forEach((peerId) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td><code>${peerId.slice(0, 16)}</code></td><td><span class="status online">connected</span></td>`;
    webrtcPeersBody.appendChild(row);
  });

  networkJson.textContent = JSON.stringify({ connected: data.hubConnected, peers: data.connectedPeers, webrtcPeers: data.webrtcPeers, metrics: data.latestMetrics }, null, 2);
}

function refresh() {
  fetch('/api/network').then((res) => res.json()).then((data) => {
    data.nodeRole = data.nodeRole || 'edge';
    renderStatus(data);
  }).catch(console.error);
}

fetch('/config').then((res) => res.json()).then((cfg) => {
  nodeRoleEl.textContent = cfg.nodeRole || 'edge';
}).catch(console.error);

socket.on('local-update', (payload) => renderStatus(payload));
setInterval(refresh, 5000);
refresh();
