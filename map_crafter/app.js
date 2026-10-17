/**
 * Biblical Map Crafter & Template Studio
 * Powered by MapLibre GL JS / GeoLibre & Google Cloud Storage
 * Dual JPG Template Exporter (Ancient & Modern)
 */

// Default Levant Hub: Jerusalem
const LEVANT_CENTER = [35.2345, 31.7767];
const DEFAULT_ZOOM = 8.5;

// Global State
let map = null;
let currentTemplate = 'ancient'; // 'ancient' | 'modern'
let currentBasemap = 'geolibre_ocean_topo'; // GeoLibre Topographic Terrain with Ocean Depth Bathymetry
let currentEra = 'roman_judea';
let is3DEnabled = false;

let templatesConfig = null;
let sitesGeoJSON = null;
let boundariesGeoJSON = null;

let markersList = [];
let capturedAncientJpg = null;
let capturedModernJpg = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  parseUrlParameters();
  initMap();
  setupUIEventListeners();
  setupSidebarResizer();
  setupGlobalPopupDismiss();
  renderSidebarList();
});

// 1. Load Data Files
async function loadData() {
  try {
    const ts = Date.now();
    const [tmpls, sites, bounds] = await Promise.all([
      fetch(`data/templates.json?t=${ts}`).then((r) => r.json()),
      fetch(`data/biblical_sites.geojson?t=${ts}`).then((r) => r.json()),
      fetch(`data/ancient_boundaries.geojson?t=${ts}`).then((r) => r.json()),
    ]);
    templatesConfig = tmpls;
    sitesGeoJSON = sites;
    boundariesGeoJSON = bounds;
  } catch (err) {
    console.error('Failed to load local data files:', err);
  }
}

// 2. Parse URL parameters (e.g. from BibleStudy-Crafter deep-link)
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('period')) {
    currentEra = params.get('period');
    const eraSelect = document.getElementById('select-era');
    if (eraSelect) eraSelect.value = currentEra;
  }
}

// 3. Initialize MapLibre GL Map
function initMap() {
  const basemapTiles = templatesConfig?.basemaps?.[currentBasemap]?.tiles || [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
  ];

  map = new maplibregl.Map({
    container: 'map',
    preserveDrawingBuffer: true, // Enables canvas capture for high-res JPG export!
    style: {
      version: 8,
      sources: {
        'base-tiles': {
          type: 'raster',
          tiles: basemapTiles,
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'base-tiles-layer',
          type: 'raster',
          source: 'base-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
    center: LEVANT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: 30,
    bearing: 0,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.on('load', () => {
    add3DTerrainSource();
    addBoundariesLayers();
    renderMarkers();
    applyTemplate(currentTemplate);
  });
}

// 4. Add 3D Terrain DEM, Shaded Relief Surface & Dynamic Hillshade
function add3DTerrainSource() {
  // A. AWS Terrarium DEM elevation mesh
  if (!map.getSource('terrain-dem-source')) {
    map.addSource('terrain-dem-source', {
      type: 'raster-dem',
      tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
    });
  }

  // B. Draped High-Contrast 3D Shaded Relief Surface
  if (!map.getSource('shaded-relief-source')) {
    map.addSource('shaded-relief-source', {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 13,
    });
  }

  if (!map.getLayer('shaded-relief-layer')) {
    map.addLayer({
      id: 'shaded-relief-layer',
      type: 'raster',
      source: 'shaded-relief-source',
      paint: {
        'raster-opacity': 0.42,
        'raster-contrast': 0.30,
      },
    });
  }

  // C. Dynamic Terrarium Hillshade Layer
  if (!map.getLayer('terrain-hillshade')) {
    map.addLayer({
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: 'terrain-dem-source',
      paint: {
        'hillshade-shadow-color': '#0f172a',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#0284c7',
        'hillshade-illumination-direction': 315,
        'hillshade-illumination-anchor': 'viewport',
        'hillshade-exaggeration': 0.95,
      },
    });
  }
}

// 5. Add Historical Boundaries, Water Bodies & Ancient Roads
function addBoundariesLayers() {
  if (!boundariesGeoJSON) return;

  // Source
  if (!map.getSource('ancient-boundaries-source')) {
    map.addSource('ancient-boundaries-source', {
      type: 'geojson',
      data: boundariesGeoJSON,
    });
  }

  // 1. Water Bodies (Seas and Lakes in Vibrant Blue with Depth Contours)
  if (!map.getLayer('ancient-water-shelf')) {
    map.addLayer({
      id: 'ancient-water-shelf',
      type: 'fill',
      source: 'ancient-boundaries-source',
      filter: ['==', 'category', 'water_body'],
      paint: {
        'fill-color': ['get', 'fill_color'],
        'fill-opacity': ['get', 'fill_opacity'],
      },
    });
  }

  // 2. Water Deep Basin / Abyss Bathymetry
  if (!map.getLayer('ancient-water-depth')) {
    map.addLayer({
      id: 'ancient-water-depth',
      type: 'fill',
      source: 'ancient-boundaries-source',
      filter: ['==', 'category', 'water_depth'],
      paint: {
        'fill-color': ['get', 'fill_color'],
        'fill-opacity': ['get', 'fill_opacity'],
      },
    });
  }

  // 3. Water Shorelines
  if (!map.getLayer('ancient-water-stroke')) {
    map.addLayer({
      id: 'ancient-water-stroke',
      type: 'line',
      source: 'ancient-boundaries-source',
      filter: ['==', 'category', 'water_body'],
      paint: {
        'line-color': ['get', 'stroke_color'],
        'line-width': ['get', 'stroke_width'],
      },
    });
  }

  // 4. Rivers (Jordan River & Tributaries)
  if (!map.getLayer('ancient-rivers-line')) {
    map.addLayer({
      id: 'ancient-rivers-line',
      type: 'line',
      source: 'ancient-boundaries-source',
      filter: ['==', 'category', 'river'],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3.5,
      },
    });
  }

  // 5. Province Polygons fill (Warm translucent tones, excluding waters)
  if (!map.getLayer('ancient-provinces-fill')) {
    map.addLayer({
      id: 'ancient-provinces-fill',
      type: 'fill',
      source: 'ancient-boundaries-source',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'category', 'water_body'], ['!=', 'category', 'water_depth']],
      paint: {
        'fill-color': ['get', 'fill_color'],
        'fill-opacity': 0.55,
      },
    });
  }

  // 6. Province borders stroke
  if (!map.getLayer('ancient-provinces-stroke')) {
    map.addLayer({
      id: 'ancient-provinces-stroke',
      type: 'line',
      source: 'ancient-boundaries-source',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'category', 'water_body'], ['!=', 'category', 'water_depth']],
      paint: {
        'line-color': ['get', 'stroke_color'],
        'line-width': 2,
        'line-dasharray': [2, 2],
      },
    });
  }

  // 7. Ancient Roads (Via Maris, King's Highway)
  if (!map.getLayer('ancient-roads-line')) {
    map.addLayer({
      id: 'ancient-roads-line',
      type: 'line',
      source: 'ancient-boundaries-source',
      filter: ['==', 'category', 'ancient_highway'],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-dasharray': [3, 2],
      },
    });
  }
}

// 6. Apply Active Template (Ancient vs Modern)
function applyTemplate(tmplKey) {
  currentTemplate = tmplKey;
  const tmpl = templatesConfig?.templates?.[tmplKey];
  if (!tmpl) return;

  const mapEl = document.getElementById('map');
  const badgeTemplate = document.getElementById('badge-active-template');
  const ancientLayers = [
    'shaded-relief-layer',
    'terrain-hillshade',
    'ancient-water-shelf',
    'ancient-water-depth',
    'ancient-water-stroke',
    'ancient-rivers-line',
    'ancient-provinces-fill',
    'ancient-provinces-stroke',
    'ancient-roads-line',
  ];

  if (tmplKey === 'ancient') {
    mapEl.classList.add('ancient-canvas-filter');
    badgeTemplate.className = 'status-badge ancient';
    badgeTemplate.textContent = '📜 Historical Biblical Atlas';
    // Switch to bathymetric ocean/topographic basemap
    switchBasemap(tmpl.basemap || 'geolibre_ocean_topo', false);
    // Show ancient boundaries, waters, and shaded relief
    ancientLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    });
  } else {
    mapEl.classList.remove('ancient-canvas-filter');
    badgeTemplate.className = 'status-badge modern';
    badgeTemplate.textContent = '🛰️ Contemporary Satellite Context';
    // Switch to satellite basemap
    switchBasemap('esri_satellite', false);
    // Hide ancient historical overlays
    ancientLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    });
  }

  // Update button active states
  document.getElementById('btn-tmpl-ancient')?.classList.toggle('active', tmplKey === 'ancient');
  document.getElementById('btn-tmpl-modern')?.classList.toggle('active', tmplKey === 'modern');

  renderMarkers();
}

// 7. Basemap Switching
function switchBasemap(basemapKey, updateSelect = true) {
  currentBasemap = basemapKey;
  if (updateSelect) {
    const sel = document.getElementById('select-basemap');
    if (sel) sel.value = basemapKey;
  }
  const tiles = templatesConfig?.basemaps?.[basemapKey]?.tiles;
  if (!tiles || !map) return;

  if (map.getSource('base-tiles')) {
    map.removeLayer('base-tiles-layer');
    map.removeSource('base-tiles');
  }

  map.addSource('base-tiles', {
    type: 'raster',
    tiles: tiles,
    tileSize: 256,
  });

  // Re-insert at bottom under shaded relief / water layers
  const firstOverlayId = map.getLayer('shaded-relief-layer')
    ? 'shaded-relief-layer'
    : (map.getLayer('ancient-water-shelf') ? 'ancient-water-shelf' : undefined);

  map.addLayer(
    {
      id: 'base-tiles-layer',
      type: 'raster',
      source: 'base-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
    firstOverlayId
  );
}

// 8. Render Markers (Simple Small Round Icon with Ancient/Modern Name)
function renderMarkers() {
  // Clear existing markers
  markersList.forEach((m) => (m.marker ? m.marker.remove() : m.remove()));
  markersList = [];

  if (!sitesGeoJSON?.features) return;

  const isAncient = currentTemplate === 'ancient';

  sitesGeoJSON.features.forEach((feature) => {
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;

    // Filter by Era if specified
    if (currentEra !== 'all' && props.period !== 'all' && !props.period.includes(currentEra)) {
      return;
    }

    // Determine label text: short version of ancient or modern name
    const rawName = isAncient ? (props.ancient_name || props.name) : (props.modern_name || props.name);
    const shortName = rawName.split('/')[0].trim();

    // Create Pin Element: Simple Small Round Icon + Name Label
    const el = document.createElement('div');
    el.className = `site-marker-node ${isAncient ? 'ancient' : 'modern'}`;
    el.setAttribute('title', `${props.name} — Click for full details`);

    el.innerHTML = `
      <span class="site-dot"></span>
      <span class="site-label-text">${shortName}</span>
    `;

    // Rich Interactive Popup with ALL available details (Draggable)
    const popupHtml = `
      <div class="site-popup-card ${isAncient ? 'ancient-popup' : 'modern-popup'}">
        <div class="site-popup-header" title="Click and drag to move popup">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="popup-drag-handle" title="Drag to move popup">⠿</span>
            <div>
              <h3 class="site-popup-title">${props.name}</h3>
              <span class="site-popup-badge">${props.category ? props.category.toUpperCase() : 'BIBLICAL SITE'}</span>
            </div>
          </div>
          <span class="site-popup-era" style="margin-right: 18px;">${isAncient ? '📜 Ancient' : '🛰️ Modern'}</span>
        </div>
        
        <div class="site-popup-body">
          <div class="site-popup-row">
            <span class="label">📜 Ancient Name:</span>
            <span class="val ancient-val">${props.ancient_name || 'N/A'}</span>
          </div>
          <div class="site-popup-row">
            <span class="label">📍 Modern Name:</span>
            <span class="val">${props.modern_name || props.name} (${props.modern_country || 'Levant'})</span>
          </div>
          ${props.biblical_region ? `
          <div class="site-popup-row">
            <span class="label">🏛️ Biblical Region:</span>
            <span class="val">${props.biblical_region}</span>
          </div>` : ''}
          <div class="site-popup-row">
            <span class="label">🏔️ Elevation:</span>
            <span class="val">${props.elevation_m} m (${Math.round(props.elevation_m * 3.28084)} ft)</span>
          </div>
          <div class="site-popup-row">
            <span class="label">🌐 Coordinates:</span>
            <span class="val" style="font-family: monospace;">${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</span>
          </div>
          ${props.description ? `
          <div class="site-popup-desc">
            <p>${props.description}</p>
          </div>` : ''}
        </div>

        <div class="site-popup-footer">
          <button class="popup-btn-center" onclick="map.flyTo({ center: [${lng}, ${lat}], zoom: 12, pitch: 45, duration: 1000 })">
            🔍 Zoom & Center
          </button>
        </div>
      </div>
    `;

    const popup = new maplibregl.Popup({
      offset: 10,
      maxWidth: '250px',
      className: 'biblical-maplibre-popup',
      closeOnClick: true,
      closeButton: true,
    }).setHTML(popupHtml);

    enableDraggablePopup(popup);

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(map);

    markersList.push({ marker, props, lng, lat });
  });
}

// 9. Sidebar List Rendering
function renderSidebarList() {
  const container = document.getElementById('sites-list');
  const countLabel = document.getElementById('sites-count-label');
  if (!container || !sitesGeoJSON) return;

  container.innerHTML = '';
  const features = sitesGeoJSON.features;
  countLabel.textContent = `${features.length} Sites In Gazetteer`;

  features.forEach((feature) => {
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;

    const card = document.createElement('div');
    card.className = 'site-card';
    card.innerHTML = `
      <div class="site-card-title">
        <span>${props.name}</span>
        <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.08);">${props.modern_country}</span>
      </div>
      <div class="site-card-ancient">${props.ancient_name}</div>
      <div class="site-card-modern">${props.modern_name} (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)</div>
      <div class="site-card-desc">${props.description || ''}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.site-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      map.flyTo({ center: [lng, lat], zoom: 12, pitch: 35, duration: 1000 });
      // Open the corresponding marker's popup
      const item = markersList.find((m) => Math.abs(m.lng - lng) < 0.001 && Math.abs(m.lat - lat) < 0.001);
      if (item) {
        item.marker.togglePopup();
      }
    });

    container.appendChild(card);
  });
}

// 10. DUAL JPG EXPORT ENGINE
// Renders Ancient view -> Captures JPG -> Renders Modern view -> Captures JPG -> Displays in Modal
async function exportDualJpgs() {
  const previousTemplate = currentTemplate;
  showToast('📸 Rendering Ancient and Modern high-res plates…', 4000);

  // Step 1: Capture Ancient Template JPG
  applyTemplate('ancient');
  await new Promise((resolve) => setTimeout(resolve, 800)); // allow tiles to load
  await waitForMapRender();
  capturedAncientJpg = map.getCanvas().toDataURL('image/jpeg', 0.95);

  // Step 2: Capture Modern Template JPG
  applyTemplate('modern');
  await new Promise((resolve) => setTimeout(resolve, 800)); // allow tiles to load
  await waitForMapRender();
  capturedModernJpg = map.getCanvas().toDataURL('image/jpeg', 0.95);

  // Restore User's current template
  applyTemplate(previousTemplate);

  // Open Modal with Previews & Download links
  const modal = document.getElementById('modal-export-jpg');
  const imgAncient = document.getElementById('img-preview-ancient');
  const imgModern = document.getElementById('img-preview-modern');
  const btnDlAncient = document.getElementById('btn-download-ancient');
  const btnDlModern = document.getElementById('btn-download-modern');

  imgAncient.src = capturedAncientJpg;
  imgModern.src = capturedModernJpg;
  btnDlAncient.href = capturedAncientJpg;
  btnDlModern.href = capturedModernJpg;

  modal.classList.add('open');
}

function waitForMapRender() {
  return new Promise((resolve) => {
    map.once('render', () => resolve());
    setTimeout(resolve, 500); // Fallback timeout
  });
}

function closeExportModal() {
  document.getElementById('modal-export-jpg')?.classList.remove('open');
}

function downloadBothJpgs() {
  if (capturedAncientJpg) {
    const a1 = document.createElement('a');
    a1.href = capturedAncientJpg;
    a1.download = `bible_map_ancient_${currentEra}.jpg`;
    a1.click();
  }
  setTimeout(() => {
    if (capturedModernJpg) {
      const a2 = document.createElement('a');
      a2.href = capturedModernJpg;
      a2.download = `bible_map_modern_satellite.jpg`;
      a2.click();
    }
  }, 400);
}

// 11. Event Listeners Setup
function setupUIEventListeners() {
  // Template Switcher Buttons
  document.getElementById('btn-tmpl-ancient')?.addEventListener('click', () => applyTemplate('ancient'));
  document.getElementById('btn-tmpl-modern')?.addEventListener('click', () => applyTemplate('modern'));

  // Era Selector
  document.getElementById('select-era')?.addEventListener('change', (e) => {
    currentEra = e.target.value;
    const badge = document.getElementById('badge-active-era');
    if (badge) badge.textContent = e.target.options[e.target.selectedIndex].text;
    renderMarkers();
  });

  // Basemap Selector
  document.getElementById('select-basemap')?.addEventListener('change', (e) => {
    switchBasemap(e.target.value, false);
  });

  // 3D Toggle
  document.getElementById('btn-toggle-3d')?.addEventListener('click', () => {
    is3DEnabled = !is3DEnabled;
    if (is3DEnabled) {
      map.setTerrain({ source: 'terrain-dem-source', exaggeration: 2.2 });
      map.easeTo({ pitch: 55 });
      showToast('🏔️ 3D Terrain Elevation enabled');
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0 });
      showToast('2D Flat map view');
    }
  });

  // Dual Export Button
  document.getElementById('btn-export-dual')?.addEventListener('click', exportDualJpgs);

  // Add Site Button
  document.getElementById('btn-add-site')?.addEventListener('click', () => {
    document.getElementById('modal-add-site')?.classList.add('open');
  });

  // Reset View
  document.getElementById('btn-reset-view')?.addEventListener('click', () => {
    map.flyTo({ center: LEVANT_CENTER, zoom: DEFAULT_ZOOM, pitch: 30, bearing: 0 });
  });

  // Search Box
  document.getElementById('site-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.site-card').forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? 'block' : 'none';
    });
  });

  // Add Site Form Submit
  document.getElementById('form-add-site')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-name').value;
    const ancientName = document.getElementById('input-ancient-name').value || name;
    const modernName = document.getElementById('input-modern-name').value || name;
    const lng = parseFloat(document.getElementById('input-lng').value);
    const lat = parseFloat(document.getElementById('input-lat').value);
    const elevation = parseInt(document.getElementById('input-elevation').value) || 0;
    const period = document.getElementById('input-period').value;
    const desc = document.getElementById('input-desc').value;

    const newFeature = {
      type: 'Feature',
      properties: {
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        ancient_name: ancientName,
        modern_name: modernName,
        modern_country: 'Levant',
        period,
        biblical_region: 'Holy Land',
        elevation_m: elevation,
        description: desc,
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    };

    sitesGeoJSON.features.push(newFeature);
    renderMarkers();
    renderSidebarList();
    closeAddSiteModal();
    showToast(`Saved ${name}!`);
    map.flyTo({ center: [lng, lat], zoom: 11 });
  });
}

function closeAddSiteModal() {
  document.getElementById('modal-add-site')?.classList.remove('open');
}

// Toast Helper
function showToast(msg, duration = 3000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = 'rgba(15, 20, 28, 0.95)';
    toast.style.border = '1px solid var(--border-accent)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '10px';
    toast.style.zIndex = '9999';
    toast.style.fontSize = '0.85rem';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

// 12. Draggable Popups Engine
function enableDraggablePopup(popup) {
  popup.on('open', () => {
    const popupEl = popup.getElement();
    if (!popupEl) return;

    const header = popupEl.querySelector('.site-popup-header');
    if (!header) return;

    let isDragging = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startPopupLeft = 0;
    let startPopupTop = 0;

    header.addEventListener('pointerdown', (e) => {
      // Ignore if clicking interactive controls inside header (e.g. close button)
      if (
        e.target.closest('button') ||
        e.target.closest('a') ||
        e.target.classList.contains('maplibregl-popup-close-button')
      ) {
        return;
      }

      isDragging = true;
      popupEl.classList.add('is-dragging');

      const mapContainer = document.getElementById('map');
      const mapRect = mapContainer.getBoundingClientRect();
      const rect = popupEl.getBoundingClientRect();

      // Convert current viewport position to map container relative
      startPopupLeft = rect.left - mapRect.left;
      startPopupTop = rect.top - mapRect.top;

      startMouseX = e.clientX;
      startMouseY = e.clientY;

      // Hide anchor tip once dragged into floating mode
      const tip = popupEl.querySelector('.maplibregl-popup-tip');
      if (tip) tip.style.display = 'none';

      // Switch popup container to absolute positioning inside map
      popupEl.style.position = 'absolute';
      popupEl.style.left = `${startPopupLeft}px`;
      popupEl.style.top = `${startPopupTop}px`;
      popupEl.style.transform = 'none';
      popupEl.style.margin = '0';

      try {
        header.setPointerCapture(e.pointerId);
      } catch (_) {}

      function onPointerMove(moveEvent) {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startMouseX;
        const dy = moveEvent.clientY - startMouseY;

        let newX = startPopupLeft + dx;
        let newY = startPopupTop + dy;

        // Clamp inside map bounds
        newX = Math.max(6, Math.min(mapRect.width - rect.width - 6, newX));
        newY = Math.max(6, Math.min(mapRect.height - rect.height - 6, newY));

        popupEl.style.left = `${newX}px`;
        popupEl.style.top = `${newY}px`;
      }

      function onPointerUp(upEvent) {
        if (isDragging) {
          isDragging = false;
          popupEl.classList.remove('is-dragging');
          try {
            header.releasePointerCapture(upEvent.pointerId);
          } catch (_) {}
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  });
}

// 13. Sidebar Resizer & Collapse (25% Initial Split)
function setupSidebarResizer() {
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('sidebar-resizer');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const collapseBtn = document.getElementById('btn-collapse-sidebar');
  const appBody = document.getElementById('app-body') || document.querySelector('.app-body');

  if (!sidebar || !resizer) return;

  let isResizing = false;
  let isCollapsed = false;
  let lastWidth = '25%';

  function toggleSidebar(forceState) {
    if (typeof forceState === 'boolean') {
      isCollapsed = forceState;
    } else {
      isCollapsed = !isCollapsed;
    }

    if (isCollapsed) {
      sidebar.classList.add('collapsed');
      if (toggleBtn) {
        toggleBtn.textContent = '▶';
        toggleBtn.setAttribute('title', 'Expand Sites Panel (25%)');
      }
    } else {
      sidebar.classList.remove('collapsed');
      sidebar.style.width = lastWidth || '25%';
      if (toggleBtn) {
        toggleBtn.textContent = '◀';
        toggleBtn.setAttribute('title', 'Minimize Sites Panel');
      }
    }

    setTimeout(() => {
      if (map) map.resize();
    }, 250);
  }

  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  collapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar(true);
  });

  // Drag to resize width
  resizer.addEventListener('mousedown', (e) => {
    if (e.target === toggleBtn || toggleBtn?.contains(e.target)) return;

    isResizing = true;
    sidebar.classList.add('resizing');
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(moveEvent) {
      if (!isResizing) return;
      const totalWidth = appBody.getBoundingClientRect().width;
      const newWidthPx = moveEvent.clientX;

      if (newWidthPx < 110) {
        if (!isCollapsed) toggleSidebar(true);
      } else {
        if (isCollapsed) toggleSidebar(false);
        const minPx = 160;
        const maxPx = totalWidth * 0.55;
        const clampedPx = Math.max(minPx, Math.min(maxPx, newWidthPx));
        const widthPct = (clampedPx / totalWidth) * 100;
        lastWidth = `${widthPct.toFixed(1)}%`;
        sidebar.style.width = lastWidth;
        if (map) map.resize();
      }
    }

    function onMouseUp() {
      if (isResizing) {
        isResizing = false;
        sidebar.classList.remove('resizing');
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (map) map.resize();
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// 14. Global Outside-Click & Escape Dismiss
function setupGlobalPopupDismiss() {
  document.addEventListener('pointerdown', (e) => {
    const activePopup = document.querySelector('.maplibregl-popup');
    if (!activePopup) return;

    // If clicking inside the popup, do not dismiss
    if (activePopup.contains(e.target)) return;

    // If clicking a site marker node or sidebar card, let marker handle it
    if (e.target.closest('.site-marker-node') || e.target.closest('.site-card')) return;

    // Click is outside -> dismiss all popups
    closeAllPopups();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllPopups();
    }
  });
}

function closeAllPopups() {
  document.querySelectorAll('.maplibregl-popup').forEach((p) => p.remove());
  markersList.forEach((m) => {
    if (m.marker?.getPopup()?.isOpen()) {
      m.marker.getPopup().remove();
    }
  });
}
window.closeAllPopups = closeAllPopups;
