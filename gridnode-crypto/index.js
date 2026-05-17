import { createHash, generateKeyPairSync, publicEncrypt, privateDecrypt, createSign, createVerify } from 'crypto';

const UK_DNO_POLYGONS = [
  { id: 'london-dno', coordinates: [[[-0.35, 51.35], [0.15, 51.35], [0.15, 51.65], [-0.35, 51.65], [-0.35, 51.35]]] },
  {
    id: 'south-east-dno',
    coordinates: [
      [[0.1, 50.75], [1.4, 51.15], [1.4, 51.45], [0.3, 51.5], [0.2, 51.9], [-0.2, 52.0], [-1.4, 51.9], [-1.4, 50.8], [0.1, 50.75]],
      [[-0.35, 51.35], [0.15, 51.35], [0.15, 51.65], [-0.35, 51.65], [-0.35, 51.35]]
    ]
  },
  { id: 'southern-england-dno', coordinates: [[[-2.6, 50.5], [-1.4, 50.8], [-1.4, 51.9], [-2.3, 52.0], [-2.6, 51.2], [-2.6, 50.5]]] },
  { id: 'south-west-dno', coordinates: [[[-5.8, 50.0], [-2.6, 50.5], [-2.6, 51.2], [-3.5, 51.2], [-4.5, 51.0], [-5.8, 50.0]]] },
  { id: 'east-england-dno', coordinates: [[[0.3, 51.5], [1.3, 51.8], [1.7, 52.5], [1.7, 53.0], [0.2, 53.0], [-0.2, 52.0], [0.2, 51.9], [0.3, 51.5]]] },
  { id: 'east-midlands-dno', coordinates: [[[-1.8, 52.0], [-0.2, 52.0], [0.2, 53.0], [0.2, 53.5], [-1.1, 53.5], [-2.0, 53.5], [-2.0, 53.0], [-1.8, 52.0]]] },
  { id: 'west-midlands-dno', coordinates: [[[-3.1, 51.8], [-1.8, 52.0], [-2.0, 53.0], [-2.8, 53.1], [-3.4, 52.8], [-3.1, 51.8]]] },
  { id: 'south-wales-dno', coordinates: [[[-5.3, 51.6], [-2.9, 51.5], [-3.1, 51.8], [-3.4, 52.5], [-4.9, 52.2], [-5.3, 51.6]]] },
  { id: 'merseyside-wales-dno', coordinates: [[[-4.9, 52.2], [-3.4, 52.5], [-3.4, 52.8], [-2.8, 53.1], [-2.0, 53.0], [-2.1, 53.5], [-3.5, 53.5], [-4.7, 53.4], [-4.9, 52.2]]] },
  { id: 'north-west-dno', coordinates: [[[-3.6, 53.5], [-2.1, 53.5], [-1.9, 54.5], [-3.5, 54.5], [-3.6, 53.5]]] },
  { id: 'yorkshire-dno', coordinates: [[[-2.1, 53.5], [0.2, 53.5], [0.2, 54.5], [-1.9, 54.5], [-2.1, 53.5]]] },
  { id: 'north-east-dno', coordinates: [[[-3.5, 54.5], [-1.9, 54.5], [0.2, 54.5], [-2.0, 55.7], [-3.3, 55.2], [-3.5, 54.5]]] },
  { id: 'south-scotland-dno', coordinates: [[[-5.0, 54.8], [-3.3, 55.2], [-2.0, 55.7], [-2.0, 56.1], [-4.8, 56.6], [-5.5, 56.1], [-5.0, 54.8]]] },
  { id: 'north-scotland-dno', coordinates: [[[-7.4, 56.2], [-4.8, 56.6], [-2.0, 56.1], [-1.8, 57.7], [-4.4, 59.0], [-7.0, 58.2], [-7.4, 56.2]]] },
  { id: 'northern-ireland-dno', coordinates: [[[-8.6, 54.1], [-6.0, 54.1], [-6.0, 55.2], [-7.9, 55.2], [-8.6, 54.1]]] }
];

/**
 * Calculates the great-circle distance between two points (Haversine formula)
 * Returns distance in kilometers.
 */
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function hashNodeId(input) {
  const hash = createHash('sha256').update(String(input)).digest('base64url');
  return `node-${hash.slice(0, 16)}`;
}

export function standardizeRegionId(regionId) {
  if (!regionId || typeof regionId !== 'string') return 'unknown-region';
  return regionId.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function isPointInPolygon(point, vs) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function mapLocationToRegion(lat, lon) {
  const nLat = Number(lat);
  const nLon = Number(lon);

  if (isNaN(nLat) || isNaN(nLon)) {
    return 'unknown-region';
  }

  const resolve = (x, y) => {
    const point = [x, y];
    // Check London first
    const london = UK_DNO_POLYGONS.find(p => p.id === 'london-dno');
    if (london && isPointInPolygon(point, london.coordinates[0])) {
      return 'london-dno';
    }

    for (const region of UK_DNO_POLYGONS) {
      if (region.id === 'london-dno') continue;
      const coords = region.coordinates;
      if (isPointInPolygon(point, coords[0])) {
        // Check for holes (like London in South East)
        if (coords.length > 1 && isPointInPolygon(point, coords[1])) {
          continue;
        }
        return region.id;
      }
    }
    return null;
  };

  // Try primary coordinate check, then fallback to flipping longitude sign (common UK entry error)
  let regionId = resolve(nLon, nLat);
  if (!regionId && nLon > 0) {
    regionId = resolve(-nLon, nLat);
  }

  // Shropshire / Market Drayton / Newport bounding box fallback if polygon check fails
  if (!regionId && nLat >= 52.2 && nLat <= 53.2 && (Math.abs(nLon) >= 1.8 && Math.abs(nLon) <= 3.2)) {
    return 'west-midlands-dno';
  }

  return regionId || 'unknown-region';
}

export function createNodeId({ lat, lon, regionId, substationId }) {
  const resolvedRegion = regionId ? standardizeRegionId(regionId) : mapLocationToRegion(lat, lon);
  const seed = `${lat ?? ''}|${lon ?? ''}|${resolvedRegion}|${substationId ?? ''}`;
  return hashNodeId(seed || `node-${Date.now()}`);
}

export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

export function encryptToPublicKey(payload, publicKey) {
  const message = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  return publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, message).toString('base64');
}

export function decryptWithPrivateKey(encrypted, privateKey) {
  const buffer = Buffer.from(encrypted, 'base64');
  return privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, buffer).toString('utf8');
}

export function signPayload(payload, privateKey) {
  const signer = createSign('sha256');
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  signer.update(message);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

export function verifySignature(payload, signature, publicKey) {
  const verifier = createVerify('sha256');
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  verifier.update(message);
  verifier.end();
  return verifier.verify(publicKey, signature, 'base64');
}

export function maskNumber(value, precision = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const rounded = Number(value) / Math.pow(10, precision);
  return Math.round(rounded) * Math.pow(10, precision);
}
