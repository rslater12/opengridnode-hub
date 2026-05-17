const socket = io();
const hubUrlEl = document.getElementById('hub-url');
const totalNodesEl = document.getElementById('total-nodes');
const publicPeersEl = document.getElementById('public-peers');
const hubPeersEl = document.getElementById('hub-peers');
const regionCountEl = document.getElementById('region-count');
const updatedAtEl = document.getElementById('updated-at');
const regionsBody = document.getElementById('regions');
const peersBody = document.getElementById('peers');
const hubPeersTable = document.getElementById('hub-peers-table');
const networkGraph = document.getElementById('network-graph');

function render(data) {
  hubUrlEl.textContent = data.hub || 'unknown';
  totalNodesEl.textContent = data.totalNodes ?? 0;
  publicPeersEl.textContent = data.peerGraph?.totalPublicNodes ?? 0;
  hubPeersEl.textContent = data.peerGraph?.totalHubPeers ?? 0;
  regionCountEl.textContent = data.peerGraph?.totalRegions ?? 0;

  const totalExportEl = document.getElementById('total-export');
  if (totalExportEl) totalExportEl.textContent = `${(data.peerGraph?.totalExport || 0).toFixed(2)} kW`;

  const totalExportTodayEl = document.getElementById('total-export-today');
  if (totalExportTodayEl) totalExportTodayEl.textContent = `${(data.peerGraph?.totalExportToday || 0).toFixed(2)} kWh`;

  updatedAtEl.textContent = new Date().toLocaleTimeString();

  regionsBody.innerHTML = '';
  Object.entries(data.regions || {}).forEach(([region, stats]) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${region}</td>
      <td>${(stats.houseLoadW / 1000).toFixed(2)} kW</td>
      <td>${stats.batteryCapacityKwh?.toFixed(2) ?? 0} kWh</td>
      <td>${stats.energyRemainingKwh?.toFixed(2) ?? 0} kWh</td>
      <td style="color: ${stats.freeSpaceKwh > 0 ? '#2e7d32' : '#c62828'}"><strong>${stats.freeSpaceKwh?.toFixed(2) ?? 0} kWh</strong></td>
      <td>${stats.solarTodayKWh?.toFixed(2) ?? 0} kWh</td>
      <td style="color: ${stats.netImpactW > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">
        ${(stats.netImpactW || 0).toFixed(0)} W
      </td>
      <td style="color: var(--primary); font-weight: 600;">${(Number(stats.totalExportKW) || 0).toFixed(2)} kW<br/>
      <small style="color: #94a3b8; font-weight: 400;">S: ${(Number(stats.totalSolarToGridW || 0) / 1000).toFixed(2)} / B: ${(Number(stats.totalBatteryToGridW || 0) / 1000).toFixed(2)}</small></td>
      <td>${(stats.totalExportTodayKWh || 0).toFixed(2)} kWh</td>
      <td>${stats.nodeCount}</td>
    `;
    regionsBody.appendChild(row);
  });

  peersBody.innerHTML = '';
  (data.peers || []).forEach((peer) => {
    const row = document.createElement('tr');
    const m = peer.metrics || {};
    row.innerHTML = `
      <td><code>${peer.nodeId.slice(0, 8)}</code></td>
      <td>${peer.regionId}</td>
      <td>${peer.nodeRole || 'edge'}</td>
      <td> ${m.batteryPower || 0}W</td>
      <td style="color: #38bdf8; font-weight: 600;">${m.exportPower || 0}W (${m.exportToday || 0}kWh)</td>
      <td>${m.soc || 0}% (${m.energyRemaining || 0}/${m.batteryCapacity || 0}kWh)</td>
    
    `;
    peersBody.appendChild(row);
  });

  hubPeersTable.innerHTML = '';
  (data.hubPeers || []).forEach((peer) => {
    const row = document.createElement('tr');
    const statusClass = peer.connected ? 'badge' : 'badge-danger';
    const statusText = peer.connected ? 'connected' : 'offline';
    row.innerHTML = `<td><code>${peer.hubId || 'unknown'}</code></td><td>${peer.role}</td><td><a href="${peer.publicUrl}" target="_blank">${peer.publicUrl}</a></td>
    <td><span class="${statusClass}">${statusText}</span></td>`;
    hubPeersTable.appendChild(row);
  });
}

function createGraphItem(id, label, x, y, classes = '') {
  const item = document.createElement('div');
  item.className = `graph-node ${classes}`;
  item.style.left = `${x}px`;
  item.style.top = `${y}px`;
  item.style.width = '160px';
  item.style.height = 'auto';
  item.textContent = label;
  return item;
}

function clearGraph() {
  networkGraph.innerHTML = '';
}

function renderClusterGraph(cluster) {
  clearGraph();
  const hub = cluster.hub;
  const peers = cluster.peerHubs || [];
  const nodes = cluster.publicNodes || [];

  const hubPositions = new Map();

  const centerX = networkGraph.clientWidth / 2 - 80;
  const centerY = 40;
  const hubEl = createGraphItem(hub.hubId, `Hub\n${hub.publicUrl}`, centerX, centerY, 'graph-hub');
  networkGraph.appendChild(hubEl);
  hubPositions.set(hub.hubId, { x: centerX + 80, y: centerY + 30 });

  peers.forEach((peer, index) => {
    const x = 40 + (index * 180);
    const y = 180;
    const statusClass = peer.connected ? '' : 'graph-disconnected';
    const peerEl = createGraphItem(peer.hubId, `Hub Peer\n${peer.hubId || peer.publicUrl}`, x, y, `graph-node ${statusClass}`);
    networkGraph.appendChild(peerEl);
    hubPositions.set(peer.hubId, { x: x + 80, y: y + 30 });
    drawEdge(centerX + 80, centerY + 30, x + 80, y);
  });

  
  // Show all nodes and improve spacing
  nodes.forEach((peer, index) => {
    const x = 40 + (index % 12 * 140);
    const y = 340 + (Math.floor(index / 12) * 80);
    const nodeEl = createGraphItem(peer.nodeId.slice(0, 8), `${peer.regionId}\n${peer.nodeRole}`, x, y, 'graph-node');
    nodeEl.style.width = '120px';
    networkGraph.appendChild(nodeEl);

    const ownerPos = hubPositions.get(peer.connectedToHub) || hubPositions.get(hub.hubId);
    drawEdge(ownerPos.x, ownerPos.y, x + 80, y);
  });
}

function drawEdge(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const edge = document.createElement('div');
  edge.className = 'graph-edge';
  edge.style.width = `${length}px`;
  edge.style.height = '2px';
  edge.style.left = `${x1}px`;
  edge.style.top = `${y1}px`;
  edge.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  networkGraph.appendChild(edge);
}

function refresh() {
  fetch('/api/hub-status').then((res) => res.json()).then(render).catch(console.error);
  fetch('/api/hub-network').then((res) => res.json()).then(renderClusterGraph).catch(console.error);
}

fetch('/api/hub-status').then((res) => res.json()).then(render).catch(console.error);
fetch('/api/hub-network').then((res) => res.json()).then(renderClusterGraph).catch(console.error);

socket.on('registry-update', render);
socket.on('cluster-map-update', renderClusterGraph);
setInterval(refresh, 8000);
