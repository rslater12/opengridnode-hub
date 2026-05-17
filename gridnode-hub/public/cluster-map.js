// Initialize Socket.io and Leaflet Map
const socket = io({
  transports: ['websocket', 'polling']
});

let map;
let dnoRegionsLayer;
let hoveredRegion = null;
let currentRegionsData = {};

document.addEventListener('DOMContentLoaded', () => {
  // Initialize the map
  map = L.map('map').setView([54.89, -3.66], 6);

  // Add standard OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Simplified DNO region polygons for demonstration purposes
  // In a real application, these would be loaded from a more precise GeoJSON file
  const dnoRegionData = {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": { "name": "london-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-0.5, 51.2], [0.3, 51.2], [0.3, 51.8], [-0.5, 51.8], [-0.5, 51.2]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "south-east-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-1.5, 50.5], [1.5, 50.5], [1.5, 51.2], [-1.5, 51.2], [-1.5, 50.5]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "south-west-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-6.0, 49.8], [-2.0, 49.8], [-2.0, 51.0], [-6.0, 51.0], [-6.0, 49.8]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "east-england-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[0.5, 51.8], [2.0, 51.8], [2.0, 53.0], [0.5, 53.0], [0.5, 51.8]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "east-midlands-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-2.0, 52.0], [0.5, 52.0], [0.5, 53.5], [-2.0, 53.5], [-2.0, 52.0]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "west-midlands-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-3.0, 52.0], [-1.5, 52.0], [-1.5, 53.0], [-3.0, 53.0], [-3.0, 52.0]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "north-west-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-3.5, 53.0], [-2.0, 53.0], [-2.0, 54.5], [-3.5, 54.5], [-3.5, 53.0]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "north-east-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-2.0, 54.5], [-0.5, 54.5], [-0.5, 55.5], [-2.0, 55.5], [-2.0, 54.5]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "yorkshire-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-2.5, 53.5], [-0.5, 53.5], [-0.5, 54.5], [-2.5, 54.5], [-2.5, 53.5]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "wales-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-5.5, 51.5], [-2.5, 51.5], [-2.5, 53.5], [-5.5, 53.5], [-5.5, 51.5]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "scotland-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-8.0, 54.5], [-0.5, 54.5], [-0.5, 59.0], [-8.0, 59.0], [-8.0, 54.5]]]
        }
      },
      {
        "type": "Feature",
        "properties": { "name": "northern-ireland-dno" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-8.5, 54.0], [-5.0, 54.0], [-5.0, 55.5], [-8.5, 55.5], [-8.5, 54.0]]]
        }
      }
    ]
  };

  const regionColors = {
    empty: '#10b981',  // Green (0-25% utilized)
    half: '#f59e0b',   // Orange (25-75%)
    high: '#f97316',   // Deep Orange (75-95%)
    full: '#ef4444',   // Red (95-100%)
    unknown: '#475569' // Grey (No data)
  };

  function getColor(utilization) {
    if (utilization === undefined || isNaN(utilization)) return regionColors.unknown;
    if (utilization < 25) return regionColors.empty;
    if (utilization < 75) return regionColors.half;
    if (utilization < 95) return regionColors.high;
    return regionColors.full;
  }

  function style(feature) {
    const regionName = feature.properties.name;
    const regionData = currentRegionsData[regionName];
    const utilization = regionData ? regionData.utilization : undefined;

    return {
      fillColor: getColor(utilization),
      weight: 2,
      opacity: 1,
      color: '#475569',
      dashArray: '3',
      fillOpacity: 0.6
    };
  }

  function onEachFeature(feature, layer) {
    const regionName = feature.properties.name;
    layer.on({
      mouseover: (e) => {
        const layer = e.target;
        layer.setStyle({
          weight: 3,
          color: '#f8fafc',
          dashArray: '',
          fillOpacity: 0.7
        });
        layer.bringToFront();
        hoveredRegion = regionName;
        info.update(regionName);
      },
      mouseout: (e) => {
        e.target.setStyle(style(feature));
        hoveredRegion = null;
        info.update();
      },
      click: (e) => {
        map.fitBounds(e.target.getBounds());
      }
    });
  }

  // Info control for displaying region details
  const info = L.control();
  info.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
    this.update();
    return this._div;
  };
  info.update = function (regionName) {
    const data = regionName ? currentRegionsData[regionName] : null;
    this._div.innerHTML = '<h4>Strategic Energy Reserve</h4>' + (regionName ?
      `<b style="text-transform: uppercase; color: #38bdf8;">${regionName.replace(/-/g, ' ')}</b><br/>` +
      `Load: <b>${((data?.houseLoadW || 0) / 1000).toFixed(2)} kW</b><br/>` +
      `Capacity: <b>${(data?.batteryCapacityKwh || 0).toFixed(1)} kWh</b><br/>` +
      `Stored: <b>${(data?.energyRemainingKwh || 0).toFixed(1)} kWh</b><br/>` +
      `Free Space: <b style="color: ${(data?.freeSpaceKwh || 0) > 0 ? '#10b981' : '#f43f5e'}">${(data?.freeSpaceKwh || 0).toFixed(1)} kWh</b><br/>` +
      `Solar Yield: <b>${(data?.solarTodayKWh || 0).toFixed(1)} kWh</b><br/>` +
      `Storage Available: <b>${(data?.storageTodayKWh || 0).toFixed(2)} kWh</b><br/>` +
      `Live Export: <b style="color: #38bdf8;">${((data?.totalExportKW || 0) * 1000).toFixed(0)} W</b><br/>` +
      `Daily Export: <b>${(data?.totalExportTodayKWh || 0).toFixed(2)} kWh</b><br/>` +
      `Utilization: <b>${(data?.utilization || 0).toFixed(1)}%</b><br/>` +
      `Nodes Online: <b>${data?.nodeCount || 0}</b>`
      : 'Hover over a region');
  };
  info.addTo(map);

  // Legend control
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = [0, 25, 75, 95];
    const labels = ['0-25% (Empty)', '25-75% (Half Full)', '75-95% (Near Capacity)', '95-100% (Full)'];
    const colors = [regionColors.empty, regionColors.half, regionColors.high, regionColors.full];

    // loop through our density intervals and generate a label with a colored square for each interval
    for (let i = 0; i < grades.length; i++) {
      div.innerHTML +=
        '<i style="background:' + colors[i] + '"></i> ' +
        labels[i] + '<br>';
    }
    div.innerHTML += '<i style="background:' + regionColors.unknown + '"></i> No Data<br>';
    return div;
  };
  legend.addTo(map);

  dnoRegionsLayer = L.geoJson(dnoRegionData, {
    style: style,
    onEachFeature: onEachFeature
  }).addTo(map);

  // Start carbon engine loop
  enrichClusterMetricsWithCarbon();
  setInterval(enrichClusterMetricsWithCarbon, 300000); // 5 mins
});

/**
 * Core processor to harvest real-time carbon data from the NESO API engine
 */
async function enrichClusterMetricsWithCarbon() {
  try {
    console.log('[Carbon Engine] Pulling fresh regional carbon data...');
    const response = await fetch('https://api.carbonintensity.org.uk/regional');
    const data = await response.json();

    // Safety check to ensure data structures exist
    if (!data || !data.data || !data.data[0] || !data.data[0].regions) {
      console.error('[Carbon Engine] Malformed API response structure received.');
      return;
    }

    const apiRegions = data.data[0].regions;

    const regionMapping = {
      'North Scotland': 'north-scotland-dno',
      'South Scotland': 'south-scotland-dno',
      'North West England': 'north-west-dno',
      'North East England': 'north-east-dno',
      'Yorkshire': 'yorkshire-dno',
      'North Wales & Merseyside': 'merseyside-wales-dno',
      'South Wales': 'south-wales-dno',
      'West Midlands': 'west-midlands-dno',
      'East Midlands': 'east-midlands-dno',
      'East England': 'east-england-dno',
      'South West England': 'south-west-dno',
      'South England': 'southern-england-dno',
      'London': 'london-dno',
      'South East England': 'south-east-dno'
    };

    apiRegions.forEach(apiReg => {
      const systemKey = regionMapping[apiReg.shortname];
      if (!systemKey) return;

      if (!currentRegionsData[systemKey]) {
        currentRegionsData[systemKey] = { substations: {}, nodeCount: 0 };
      }

      currentRegionsData[systemKey].carbonIntensity = apiReg.intensity.forecast;
      currentRegionsData[systemKey].carbonIndex = apiReg.intensity.index;
      currentRegionsData[systemKey].generationMix = apiReg.generationmix;
    });

    console.log('[Carbon Engine] Successfully synchronized with intensity data.');
    if (hoveredRegion) info.update(hoveredRegion);

  } catch (err) {
    console.error('[Carbon Engine] Failed to handle carbon execution routine:', err.message);
  }
}

// --- BOOTSTRAP CONTROL LOOP ---

// 1. Fire an immediate query execution loop on startup
enrichClusterMetricsWithCarbon();
socket.on('cluster-map-update', updateUI);
socket.on('registry-update', updateUI);

fetch('/api/hub-status').then(res => res.json()).then(updateUI);