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
let currentEra = 'all';
let currentBookKml = null;
let bookKmlGeoJSON = null;
let is3DEnabled = false;

let templatesConfig = null;
let sitesGeoJSON = null;
let boundariesGeoJSON = null;

let markersList = [];
let capturedAncientJpg = null;
let capturedModernJpg = null;

// Photo Carousel & Lightbox State
let siteActivePhotoIndices = {};
let currentLightboxSite = null;
let currentLightboxIndex = 0;

// Sidebar & Pinned Site Filtering State
let activeSidebarTab = 'top10'; // 'top10' | 'pinned' | 'all'
let selectedAlphaLetter = 'all';
let searchQuery = '';
let pinnedSiteIds = new Set();
try {
  const saved = localStorage.getItem('biblestudy_map_crafter_pinned');
  if (saved) {
    JSON.parse(saved).forEach((id) => pinnedSiteIds.add(id));
  }
} catch (e) {
  console.warn('Could not read pinned sites from localStorage', e);
}

let renderMarkersDebounceTimer = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  parseUrlParameters();
  initMap();
  setupUIEventListeners();
  setupSidebarResizer();
  setupGlobalPopupDismiss();
  buildAlphabetJumper();
  updatePinnedCounter();
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
  if (params.get('book')) {
    currentBookKml = params.get('book').toLowerCase();
    const bookSelect = document.getElementById('select-book-kml');
    if (bookSelect) bookSelect.value = currentBookKml;
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
    setupVectorClickEngine();
    if (currentBookKml) {
      loadBookKML(currentBookKml);
    }
    map.on('zoomend', () => scheduleRenderMarkers());
    map.on('moveend', () => {
      if (map && map.getZoom() >= 9.5) scheduleRenderMarkers();
    });
  });
}

function scheduleRenderMarkers() {
  if (renderMarkersDebounceTimer) clearTimeout(renderMarkersDebounceTimer);
  renderMarkersDebounceTimer = setTimeout(() => {
    renderMarkers();
  }, 75);
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

// 8. Render Markers (Tiered Priority: Major, Moderate, Minor + Pinned)
function renderMarkers() {
  // Clear existing markers
  markersList.forEach((m) => (m.marker ? m.marker.remove() : m.remove()));
  markersList = [];

  if (!sitesGeoJSON?.features || !map) return;

  const isAncient = currentTemplate === 'ancient';
  const currentZoom = map.getZoom();

  // If zoomed in close (zoom >= 9.5), calculate viewport bounding box with 25% margin
  let bounds = null;
  if (currentZoom >= 9.5) {
    const b = map.getBounds();
    const spanLng = b.getEast() - b.getWest();
    const spanLat = b.getNorth() - b.getSouth();
    bounds = {
      west: b.getWest() - spanLng * 0.25,
      east: b.getEast() + spanLng * 0.25,
      south: b.getSouth() - spanLat * 0.25,
      north: b.getNorth() + spanLat * 0.25,
    };
  }

  sitesGeoJSON.features.forEach((feature) => {
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const isPinned = pinnedSiteIds.has(props.id);

    // 1. Filter by Era if specified (Pinned sites can be shown or adhere to era)
    if (currentEra !== 'all' && props.period !== 'all' && !props.period.includes(currentEra)) {
      if (!isPinned) return;
    }

    // 2. Zoom & Priority Tier Filtering
    // Pinned sites are ALWAYS visible at all zoom levels!
    if (!isPinned) {
      const tier = props.tier || 3;
      if (tier === 2 && currentZoom < 6.8) {
        return;
      }
      if (tier === 3 && currentZoom < 9.5) {
        return;
      }
      // At high zoom, cull minor markers outside current viewport bounds
      if (bounds && (lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north)) {
        return;
      }
    }

    // Determine label text: short version of ancient or modern name
    const rawName = isAncient ? (props.ancient_name || props.name) : (props.modern_name || props.name);
    const shortName = rawName.split('/')[0].trim();

    // Create Pin Element
    const el = document.createElement('div');
    el.className = `site-marker-node ${isAncient ? 'ancient' : 'modern'} tier-${props.tier || 3} ${isPinned ? 'is-pinned' : ''}`;
    el.setAttribute('title', `${props.name} (${(props.tier_name || 'site').toUpperCase()}) — Click for details`);

    el.innerHTML = `
      <span class="site-dot"></span>
      ${isPinned ? '<span class="pin-badge-icon" title="Pinned by you">📌</span>' : ''}
      <span class="site-label-text">${escapeHtml(shortName)}</span>
    `;

    const photos = Array.isArray(props.photos) && props.photos.length > 0 ? props.photos : (props.photo_url ? [{
      thumb_url: props.photo_url,
      full_url: props.photo_url,
      credit: props.photo_credit,
      credit_url: props.photo_credit_url,
      license: props.photo_license,
      caption: props.photo_caption
    }] : []);

    const activePhotoIdx = siteActivePhotoIndices[props.id] || 0;
    const primary = photos[activePhotoIdx] || photos[0];
    const hasMultiple = photos.length > 1;

    // Rich Interactive Popup with Pin Button
    const popupHtml = `
      <div class="site-popup-card ${isAncient ? 'ancient-popup' : 'modern-popup'}">
        ${primary ? `
        <div class="site-popup-photo-card" id="popup-photo-card-${props.id}">
          <img src="${primary.thumb_url}" 
               alt="${escapeHtml(props.name)}" 
               class="site-popup-photo-img" 
               id="popup-photo-img-${props.id}"
               onclick="openLightbox('${props.id}', event)"
               title="Click to view full image"
               loading="lazy" />

          ${hasMultiple ? `
            <button type="button" class="carousel-nav-btn prev" onclick="navigatePopupPhoto('${props.id}', -1, event)" title="Previous photo" aria-label="Previous photo">‹</button>
            <button type="button" class="carousel-nav-btn next" onclick="navigatePopupPhoto('${props.id}', 1, event)" title="Next photo" aria-label="Next photo">›</button>
            <div class="carousel-counter-badge" id="popup-counter-${props.id}">${activePhotoIdx + 1} / ${photos.length}</div>
          ` : ''}

          <div class="site-popup-photo-meta" onclick="openLightbox('${props.id}', event)" title="Click to view full image">
            <span class="site-popup-photo-caption" id="popup-caption-${props.id}">${escapeHtml(primary.caption || props.name)}</span>
            <div class="site-popup-photo-credit" onclick="event.stopPropagation()">
              <span id="popup-credit-container-${props.id}">
                ${primary.credit_url ? `<a href="${primary.credit_url}" target="_blank" rel="noopener noreferrer">© ${escapeHtml(primary.credit || 'Wikimedia Commons')}</a>` : `<span>© ${escapeHtml(primary.credit || 'Wikimedia Commons')}</span>`}
              </span>
              <span class="site-popup-license-badge" id="popup-license-${props.id}">${primary.license || 'CC'}</span>
            </div>
          </div>
        </div>` : ''}

        <div class="site-popup-header" title="Click and drag to move popup">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="popup-drag-handle" title="Drag to move popup">⠿</span>
            <div>
              <h3 class="site-popup-title">${props.name}</h3>
              <span class="site-popup-badge">${props.tier_name ? props.tier_name.toUpperCase() : (props.category ? props.category.toUpperCase() : 'BIBLICAL SITE')}</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; margin-right: 18px;">
            <button type="button" class="btn-pin-site ${isPinned ? 'is-pinned' : ''}" onclick="togglePinSite('${props.id}', event)" title="Pin or unpin from your active map view">
              ${isPinned ? '📌 Pinned' : '➕ Pin'}
            </button>
            <span class="site-popup-era">${isAncient ? '📜 Ancient' : '🛰️ Modern'}</span>
          </div>
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
          ${props.verses_summary ? `
          <div class="site-popup-row">
            <span class="label">📖 Verses (${props.verse_count || 1}):</span>
            <span class="val" style="font-size: 0.72rem; color: var(--ancient-gold);">${props.verses_summary}</span>
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
          ${props.openbible_url ? `
          <a href="${props.openbible_url}" target="_blank" rel="noopener noreferrer" class="popup-btn-openbible" title="View authoritative scholarly dossier on OpenBible.info">
            📖 OpenBible ↗
          </a>` : ''}
          <button class="popup-btn-center" onclick="map.flyTo({ center: [${lng}, ${lat}], zoom: 12, pitch: 45, duration: 1000 })">
            🔍 Zoom & Center
          </button>
        </div>
      </div>
    `;

    const popup = new maplibregl.Popup({
      offset: 10,
      maxWidth: '280px',
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

// Global Toggle Pin Function
window.togglePinSite = function(siteId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const isPinned = pinnedSiteIds.has(siteId);
  const feature = sitesGeoJSON?.features?.find((f) => f.properties.id === siteId);
  const name = feature?.properties?.name || 'Site';

  if (isPinned) {
    pinnedSiteIds.delete(siteId);
    showToast(`Removed ${name} from pinned map sites.`);
  } else {
    pinnedSiteIds.add(siteId);
    showToast(`📌 Pinned ${name} to your active map!`);
    if (feature && map) {
      const [lng, lat] = feature.geometry.coordinates;
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 10), duration: 1000 });
    }
  }

  try {
    localStorage.setItem('biblestudy_map_crafter_pinned', JSON.stringify([...pinnedSiteIds]));
  } catch (e) {}

  updatePinnedCounter();
  renderMarkers();
  renderSidebarList();
};

function updatePinnedCounter() {
  const el = document.getElementById('pinned-count');
  if (el) el.textContent = pinnedSiteIds.size;
}

// Alphabet Quick Jump Bar Builder
function buildAlphabetJumper() {
  const container = document.getElementById('alphabet-jumper');
  if (!container || !sitesGeoJSON?.features) return;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const counts = {};
  sitesGeoJSON.features.forEach((f) => {
    const first = (f.properties.name || '').trim()[0]?.toUpperCase();
    if (first) counts[first] = (counts[first] || 0) + 1;
  });

  let html = `<button class="alpha-chip ${selectedAlphaLetter === 'all' ? 'active' : ''}" data-letter="all">All (${sitesGeoJSON.features.length})</button>`;
  alphabet.forEach((letter) => {
    const c = counts[letter] || 0;
    if (c > 0) {
      html += `<button class="alpha-chip ${selectedAlphaLetter === letter ? 'active' : ''}" data-letter="${letter}">${letter} <span style="opacity: 0.65; font-size: 0.6rem;">${c}</span></button>`;
    }
  });

  container.innerHTML = html;

  container.querySelectorAll('.alpha-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedAlphaLetter = btn.getAttribute('data-letter');
      container.querySelectorAll('.alpha-chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      renderSidebarList();
    });
  });
}

// 9. Sidebar List Rendering (Top 10 Major, Pinned, All A-Z & Real-Time Search)
function renderSidebarList() {
  const container = document.getElementById('sites-list');
  const countLabel = document.getElementById('sites-count-label');
  const alphabetJumper = document.getElementById('alphabet-jumper');
  if (!container || !sitesGeoJSON) return;

  container.innerHTML = '';
  const features = sitesGeoJSON.features;
  let displayList = [];

  // A. Search Query Mode: searches across all 1,342 sites
  if (searchQuery.trim().length > 0) {
    if (alphabetJumper) alphabetJumper.style.display = 'none';
    const q = searchQuery.toLowerCase();
    displayList = features.filter((f) => {
      const p = f.properties;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.ancient_name && p.ancient_name.toLowerCase().includes(q)) ||
        (p.modern_name && p.modern_name.toLowerCase().includes(q)) ||
        (p.modern_country && p.modern_country.toLowerCase().includes(q)) ||
        (p.biblical_region && p.biblical_region.toLowerCase().includes(q)) ||
        (p.verses_summary && p.verses_summary.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
    countLabel.textContent = `${displayList.length} Sites Matching "${searchQuery}"`;
  }
  // B. Top 10 Major Entries Mode (Default Initial View)
  else if (activeSidebarTab === 'top10') {
    if (alphabetJumper) alphabetJumper.style.display = 'none';
    displayList = features.filter((f) => f.properties.is_top_10 || f.properties.tier === 1).slice(0, 10);
    countLabel.textContent = `Top 10 Major Biblical Centers`;
  }
  // C. Pinned Sites Mode
  else if (activeSidebarTab === 'pinned') {
    if (alphabetJumper) alphabetJumper.style.display = 'none';
    displayList = features.filter((f) => pinnedSiteIds.has(f.properties.id));
    countLabel.textContent = `${displayList.length} Pinned Sites on Map`;

    if (displayList.length === 0) {
      container.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          <div style="font-size: 2rem; margin-bottom: 8px;">📌</div>
          <p style="font-weight: 600; color: #fff;">No sites pinned yet</p>
          <p style="margin-top: 6px; font-size: 0.75rem; line-height: 1.4;">
            Search or browse any biblical site and click <strong>➕ Pin to Map</strong> to keep it permanently highlighted on your study map.
          </p>
        </div>
      `;
      return;
    }
  }
  // D. Full A-to-Z Directory Mode
  else if (activeSidebarTab === 'all') {
    if (alphabetJumper) alphabetJumper.style.display = 'flex';
    if (selectedAlphaLetter !== 'all') {
      displayList = features.filter((f) => f.properties.name.toUpperCase().startsWith(selectedAlphaLetter));
      countLabel.textContent = `${displayList.length} Sites Starting with '${selectedAlphaLetter}'`;
    } else {
      // Show first 60 for instant DOM rendering, with count
      displayList = features.slice(0, 60);
      countLabel.textContent = `Showing 60 of ${features.length} Sites (Select Letter Above)`;
    }
  }

  // Render cards
  displayList.forEach((feature) => {
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const isPinned = pinnedSiteIds.has(props.id);
    const tierNum = props.tier || 3;
    const tierLabel = tierNum === 1 ? 'MAJOR' : (tierNum === 2 ? 'MODERATE' : 'MINOR');

    const card = document.createElement('div');
    card.className = `site-card ${isPinned ? 'is-pinned-card' : ''}`;
    card.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: flex-start;">
        ${props.photo_url ? `<img src="${props.photo_url}" alt="${escapeHtml(props.name)}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.12);" loading="lazy" />` : ''}
        <div style="flex: 1; min-width: 0;">
          <div class="site-card-title">
            <span style="font-weight: 700;">${escapeHtml(props.name)}</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="tier-badge tier-badge-${tierNum}">${tierLabel}</span>
              <span style="font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,0.08);">${escapeHtml(props.modern_country || 'Levant')}</span>
            </div>
          </div>
          <div class="site-card-ancient">${escapeHtml(props.ancient_name || props.name)}</div>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
        <span class="site-card-modern">${escapeHtml(props.modern_name || props.name)} (${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E)</span>
        <button type="button" class="btn-pin-site ${isPinned ? 'is-pinned' : ''}" onclick="togglePinSite('${props.id}', event)" title="Pin or unpin from active map">
          ${isPinned ? '📌 Pinned' : '➕ Pin to Map'}
        </button>
      </div>
      ${props.verses_summary ? `<div style="font-size: 0.68rem; color: var(--ancient-gold); margin-top: 4px;">📖 ${escapeHtml(props.verses_summary)}</div>` : ''}
      <div class="site-card-desc">${escapeHtml(props.description || '')}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.site-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 11), pitch: 35, duration: 1000 });
      
      // Open the corresponding marker popup or create one
      const item = markersList.find((m) => m.props && m.props.id === props.id);
      if (item && item.marker) {
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

  // Book KML Overlay Selector
  document.getElementById('select-book-kml')?.addEventListener('change', (e) => {
    loadBookKML(e.target.value);
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

  // Search Box (Real-time search across all 1,342 sites)
  document.getElementById('site-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderSidebarList();
  });

  // Sidebar Filter Tabs: Top 10 Major, Pinned, All A-Z
  document.getElementById('tab-top-10')?.addEventListener('click', () => {
    activeSidebarTab = 'top10';
    searchQuery = '';
    const searchInput = document.getElementById('site-search');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
    document.getElementById('tab-top-10')?.classList.add('active');
    renderSidebarList();
  });

  document.getElementById('tab-pinned')?.addEventListener('click', () => {
    activeSidebarTab = 'pinned';
    searchQuery = '';
    const searchInput = document.getElementById('site-search');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
    document.getElementById('tab-pinned')?.classList.add('active');
    renderSidebarList();
  });

  document.getElementById('tab-all-az')?.addEventListener('click', () => {
    activeSidebarTab = 'all';
    searchQuery = '';
    const searchInput = document.getElementById('site-search');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
    document.getElementById('tab-all-az')?.classList.add('active');
    renderSidebarList();
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

// HTML & Text Sanitation Helpers
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanDescriptionHtml(html) {
  if (!html) return '';
  return String(html).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

// 14. Global Outside-Click & Keyboard Listeners
function setupGlobalPopupDismiss() {
  document.addEventListener('pointerdown', (e) => {
    // If clicking inside the lightbox modal, handle backdrop dismiss
    const lightboxModal = document.getElementById('modal-lightbox');
    if (lightboxModal && lightboxModal.classList.contains('open')) {
      if (e.target === lightboxModal) {
        closeLightbox();
      }
      return;
    }

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
    const lightboxModal = document.getElementById('modal-lightbox');
    const isLightboxOpen = lightboxModal && lightboxModal.classList.contains('open');

    if (e.key === 'Escape') {
      if (isLightboxOpen) {
        closeLightbox();
      } else {
        closeAllPopups();
        closeExportModal();
        closeAddSiteModal();
      }
    } else if (e.key === 'ArrowLeft' && isLightboxOpen) {
      navigateLightbox(-1);
    } else if (e.key === 'ArrowRight' && isLightboxOpen) {
      navigateLightbox(1);
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

// 15. Photo Carousel Navigation in Popups
function navigatePopupPhoto(siteId, delta, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const feat = sitesGeoJSON?.features?.find((f) => f.properties.id === siteId);
  if (!feat) return;
  const props = feat.properties;
  const photos = Array.isArray(props.photos) && props.photos.length > 0 ? props.photos : [];
  if (photos.length <= 1) return;

  let curIdx = siteActivePhotoIndices[siteId] || 0;
  curIdx = (curIdx + delta + photos.length) % photos.length;
  siteActivePhotoIndices[siteId] = curIdx;

  const photo = photos[curIdx];
  const imgEl = document.getElementById(`popup-photo-img-${siteId}`);
  const counterEl = document.getElementById(`popup-counter-${siteId}`);
  const captionEl = document.getElementById(`popup-caption-${siteId}`);
  const creditContainer = document.getElementById(`popup-credit-container-${siteId}`);
  const licenseEl = document.getElementById(`popup-license-${siteId}`);

  if (imgEl && photo) {
    imgEl.src = photo.thumb_url;
  }
  if (counterEl) {
    counterEl.textContent = `${curIdx + 1} / ${photos.length}`;
  }
  if (captionEl) {
    captionEl.textContent = photo.caption || props.name;
  }
  if (creditContainer) {
    creditContainer.innerHTML = photo.credit_url
      ? `<a href="${photo.credit_url}" target="_blank" rel="noopener noreferrer">© ${escapeHtml(photo.credit || 'Wikimedia Commons')}</a>`
      : `<span>© ${escapeHtml(photo.credit || 'Wikimedia Commons')}</span>`;
  }
  if (licenseEl && photo.license) {
    licenseEl.textContent = photo.license;
  }
}
window.navigatePopupPhoto = navigatePopupPhoto;

// 16. Fullscreen Biblical Photo Lightbox Modal
function openLightbox(siteId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const feat = sitesGeoJSON?.features?.find((f) => f.properties.id === siteId);
  if (!feat) return;
  const props = feat.properties;
  const photos = Array.isArray(props.photos) && props.photos.length > 0 ? props.photos : (props.photo_url ? [{
    thumb_url: props.photo_url,
    full_url: props.photo_url,
    credit: props.photo_credit,
    credit_url: props.photo_credit_url,
    license: props.photo_license,
    caption: props.photo_caption
  }] : []);

  if (photos.length === 0) return;

  currentLightboxSite = { ...props, photos };
  currentLightboxIndex = siteActivePhotoIndices[siteId] || 0;

  renderLightbox();
  const modal = document.getElementById('modal-lightbox');
  if (modal) {
    modal.classList.add('open');
  }
}
window.openLightbox = openLightbox;

function renderLightbox() {
  if (!currentLightboxSite) return;
  const photos = currentLightboxSite.photos || [];
  const photo = photos[currentLightboxIndex] || photos[0];
  if (!photo) return;

  const imgEl = document.getElementById('lightbox-img');
  const siteNameEl = document.getElementById('lightbox-site-name');
  const captionEl = document.getElementById('lightbox-caption');
  const counterEl = document.getElementById('lightbox-counter');
  const creditLinkEl = document.getElementById('lightbox-credit-link');
  const licenseBadgeEl = document.getElementById('lightbox-license-badge');
  const commonsLinkEl = document.getElementById('lightbox-commons-link');
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');

  if (imgEl) {
    imgEl.src = photo.full_url || photo.thumb_url;
    imgEl.alt = `${currentLightboxSite.name} — ${photo.caption || ''}`;
  }
  if (siteNameEl) siteNameEl.textContent = currentLightboxSite.name;
  if (captionEl) captionEl.textContent = photo.caption || currentLightboxSite.name;
  if (counterEl) {
    counterEl.textContent = `${currentLightboxIndex + 1} / ${photos.length}`;
    counterEl.style.display = photos.length > 1 ? 'inline-block' : 'none';
  }
  if (creditLinkEl) {
    creditLinkEl.textContent = `© ${photo.credit || 'Wikimedia Commons'}`;
    creditLinkEl.href = photo.credit_url || photo.full_url || '#';
  }
  if (licenseBadgeEl) {
    licenseBadgeEl.textContent = photo.license || 'CC';
  }
  if (commonsLinkEl) {
    commonsLinkEl.href = photo.credit_url || photo.full_url || '#';
    commonsLinkEl.style.display = (photo.credit_url || photo.full_url) ? 'inline-flex' : 'none';
  }
  if (prevBtn) prevBtn.style.display = photos.length > 1 ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = photos.length > 1 ? 'flex' : 'none';
}

function navigateLightbox(delta) {
  if (!currentLightboxSite) return;
  const photos = currentLightboxSite.photos || [];
  if (photos.length <= 1) return;
  currentLightboxIndex = (currentLightboxIndex + delta + photos.length) % photos.length;
  // Synchronize state with marker popup
  if (currentLightboxSite.id) {
    siteActivePhotoIndices[currentLightboxSite.id] = currentLightboxIndex;
    navigatePopupPhoto(currentLightboxSite.id, 0);
  }
  renderLightbox();
}
window.navigateLightbox = navigateLightbox;

function closeLightbox() {
  const modal = document.getElementById('modal-lightbox');
  if (modal) {
    modal.classList.remove('open');
  }
}
window.closeLightbox = closeLightbox;

// 17. Authoritative Vector Interaction Engine: Points, Lines & Polygons (Main Map & KML)
const MAIN_MAP_DESCRIPTIONS = {
  prov_galilee: "Northern region of ancient Israel; heartland of Jesus' earthly ministry, including Nazareth, Capernaum, Cana, and Mount of Beatitudes.",
  prov_samaria: "Central hill country inhabited by the Samaritans; location of Shechem, Mount Gerizim, Mount Ebal, and Jacob's Well.",
  prov_judea: "Southern biblical kingdom and Roman province containing Jerusalem, Bethlehem, Bethany, and the rugged Judean Wilderness.",
  prov_decapolis: "Confederation of ten Hellenistic cities east of the Jordan and south of Galilee; visited by Jesus during His ministry.",
  prov_peraea: "Region 'beyond the Jordan' east of Judea and Samaria; where John the Baptist preached, baptized, and was imprisoned by Herod Antipas.",
  prov_nabatea: "Arabian kingdom governed from the rose-red rock city of Petra, spanning the Negev and eastern desert frontiers.",
  prov_phoenicia: "Ancient coastal maritime civilization; home to the historic seafaring ports of Tyre and Sidon.",
  prov_syria: "Roman imperial province to the north with seat at Antioch on the Orontes and historical oasis hub at Damascus.",
  road_via_maris: "The historic coastal highway connecting Egypt, the Plain of Sharon, Jezreel Valley, Galilee, and Damascus with Mesopotamia.",
  road_kings_highway: "Ancient trade highway through the Transjordan plateau connecting the Gulf of Aqaba and Petra with Damascus; traveled during Israel's Wilderness journey.",
  road_ridge_route: "The Way of the Patriarchs traversing the central hill country ridge connecting Hebron, Bethlehem, Jerusalem, Bethel, and Shechem.",
  road_jericho_jerusalem: "Steep historic road descending 3,300 feet from Jerusalem down through the Judean wilderness to Jericho; setting of the Parable of the Good Samaritan.",
  river_jordan: "Sacred river flowing from Mount Hermon through Lake Hula and the Sea of Galilee down to the Dead Sea; site of Israel's crossing and Jesus' baptism.",
  river_jabbok: "Eastern mountain tributary where Jacob wrestled with the Angel of the Lord through the night and was blessed with the name Israel (Peniel).",
  river_arnon: "Formidable canyon river and gorge forming the ancient boundary between Moab and the Amorites (Numbers 21).",
  river_kishon: "Winding valley river where Deborah and Barak defeated Sisera's chariots (Judges 4-5) and Elijah confronted the false prophets of Baal (1 Kings 18).",
  river_yarmouk: "Major eastern tributary marking the northern boundary of the Decapolis and Golan.",
  water_sea_of_galilee: "Freshwater lake 680 feet below sea level; center of Christ's Galilean ministry, calling disciples, walking on water, and calming the tempest.",
  water_dead_sea: "Biblical Salt Sea sitting 1,410 feet below sea level; Earth's lowest land elevation, bordered by En-gedi, Masada, and Qumran.",
  water_mediterranean: "The Great Sea forming the western boundary of the Holy Land; sailed by Jonah fleeing to Tarshish and Paul during his missionary journeys.",
};

function getAvailableInteractiveLayers() {
  const allLayers = [
    // 1. KML layers (top priority when loaded)
    'book-kml-points',
    'book-kml-lines',
    'book-kml-fills',
    // 2. Main map roads & rivers (lines on top of polygons)
    'ancient-roads-line',
    'ancient-rivers-line',
    'ancient-provinces-stroke',
    'ancient-water-stroke',
    // 3. Main map waters & provinces (polygons)
    'ancient-water-shelf',
    'ancient-water-depth',
    'ancient-provinces-fill',
  ];

  return allLayers.filter((id) => {
    if (!map.getLayer(id)) return false;
    const vis = map.getLayoutProperty(id, 'visibility');
    return vis !== 'none';
  });
}

function setupVectorClickEngine() {
  // 1. Mousemove: Pointer cursor when hovering any point, line, or polygon
  map.on('mousemove', (e) => {
    if (e.originalEvent && e.originalEvent.target.closest('.site-marker-node')) {
      return;
    }

    const availableLayers = getAvailableInteractiveLayers();
    if (availableLayers.length === 0) {
      map.getCanvas().style.cursor = '';
      return;
    }

    // 8px tolerance bbox for lines and points
    const bbox = [
      [e.point.x - 8, e.point.y - 8],
      [e.point.x + 8, e.point.y + 8],
    ];
    const feats = map.queryRenderedFeatures(bbox, { layers: availableLayers });
    map.getCanvas().style.cursor = feats && feats.length > 0 ? 'pointer' : '';
  });

  // 2. Click: Show rich popup for any clicked feature (Point, Line, Polygon)
  map.on('click', (e) => {
    // If click was on a site marker pin, let marker handle it
    if (e.originalEvent && e.originalEvent.target.closest('.site-marker-node')) {
      return;
    }

    // If click was inside an already open popup, do not recreate
    if (e.originalEvent && e.originalEvent.target.closest('.maplibregl-popup')) {
      return;
    }

    const availableLayers = getAvailableInteractiveLayers();
    if (availableLayers.length === 0) return;

    const bbox = [
      [e.point.x - 8, e.point.y - 8],
      [e.point.x + 8, e.point.y + 8],
    ];

    // Priority 1: KML Points
    let candidates = map.queryRenderedFeatures(bbox, {
      layers: availableLayers.filter((l) => l === 'book-kml-points'),
    });

    // Priority 2: Lines (KML Lines, Main Map Roads, Main Map Rivers, Province Borders)
    if (!candidates || candidates.length === 0) {
      candidates = map.queryRenderedFeatures(bbox, {
        layers: availableLayers.filter((l) => l.includes('line') || l.includes('road') || l.includes('river')),
      });
    }

    // Priority 3: Polygons (KML Fills, Main Map Provinces, Main Map Waters)
    if (!candidates || candidates.length === 0) {
      candidates = map.queryRenderedFeatures(e.point, {
        layers: availableLayers.filter((l) => l.includes('fill') || l.includes('shelf') || l.includes('depth')),
      });
    }

    if (!candidates || candidates.length === 0) return;

    const feat = candidates[0];
    const layerId = feat.layer.id;

    if (layerId.startsWith('book-kml-')) {
      showKMLFeaturePopup(feat, e.lngLat);
    } else {
      showMainMapFeaturePopup(feat, e.lngLat);
    }
  });
}

// Popup Renderer for KML Features (Points, Lines, Polygons)
function showKMLFeaturePopup(feat, lngLat) {
  const props = feat.properties || {};
  const geomType = feat.geometry ? feat.geometry.type : 'Feature';

  let badgeLabel = '📍 KML Location';
  let badgeColor = '#d97706';
  if (geomType === 'LineString' || geomType === 'MultiLineString') {
    badgeLabel = '🛣️ KML Journey Route / Path';
    badgeColor = '#b71c1c';
  } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
    badgeLabel = '🗺️ KML Territory / Area';
    badgeColor = '#0284c7';
  }

  const title = props.name || 'Biblical KML Feature';
  const desc = props.description || '';

  const skipKeys = new Set(['name', 'description']);
  const attrRows = [];

  // Geometry statistics
  if (geomType === 'Point' && feat.geometry.coordinates) {
    const [pLon, pLat] = feat.geometry.coordinates;
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">Coordinates:</td>
        <td class="kml-attr-val" style="font-family: monospace;">${pLat.toFixed(4)}°N, ${pLon.toFixed(4)}°E</td>
      </tr>
    `);
  } else if (geomType === 'LineString' && feat.geometry.coordinates) {
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">Route Geometry:</td>
        <td class="kml-attr-val">${feat.geometry.coordinates.length} waypoints</td>
      </tr>
    `);
  } else if (geomType === 'Polygon' && feat.geometry.coordinates) {
    const ring = feat.geometry.coordinates[0] || [];
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">Boundary:</td>
        <td class="kml-attr-val">${ring.length} vertices</td>
      </tr>
    `);
  }

  // Click position
  attrRows.push(`
    <tr>
      <td class="kml-attr-key">Clicked Position:</td>
      <td class="kml-attr-val" style="font-family: monospace;">${lngLat.lat.toFixed(4)}°N, ${lngLat.lng.toFixed(4)}°E</td>
    </tr>
  `);

  for (const [k, v] of Object.entries(props)) {
    if (skipKeys.has(k) || v === null || v === undefined || v === '') continue;
    const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
    const cleanKey = k.replace(/[_-]/g, ' ');
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">${cleanKey}:</td>
        <td class="kml-attr-val">${escapeHtml(valStr)}</td>
      </tr>
    `);
  }

  const popupHtml = `
    <div class="kml-feature-popup-card">
      <div class="kml-popup-header">
        <span class="kml-popup-badge" style="background: ${badgeColor};">${badgeLabel}</span>
        <h4 class="kml-popup-title">${escapeHtml(title)}</h4>
      </div>
      ${desc ? `
        <div class="kml-popup-desc">
          ${cleanDescriptionHtml(desc)}
        </div>
      ` : ''}
      <div class="kml-attrs-section">
        <span class="kml-attrs-header">KML Attributes & Metadata</span>
        <table class="kml-attrs-table">
          <tbody>
            ${attrRows.join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  new maplibregl.Popup({
    offset: 10,
    maxWidth: '310px',
    className: 'biblical-maplibre-popup kml-popup',
    closeOnClick: true,
    closeButton: true,
  })
    .setLngLat(lngLat)
    .setHTML(popupHtml)
    .addTo(map);
}

// Popup Renderer for Main Map Features (Points, Lines, Polygons)
function showMainMapFeaturePopup(feat, lngLat) {
  const props = feat.properties || {};
  const featId = props.id || '';
  const geomType = feat.geometry ? feat.geometry.type : 'Feature';

  let badgeLabel = '🏛️ Historical Territory';
  let badgeColor = '#b85d43';

  if (props.category === 'ancient_highway') {
    badgeLabel = '🛣️ Ancient Trade Highway';
    badgeColor = '#8c4f2b';
  } else if (props.category === 'river') {
    badgeLabel = '🌊 Biblical River';
    badgeColor = '#0284c7';
  } else if (props.category === 'water_body' || props.category === 'water_depth') {
    badgeLabel = '⚓ Biblical Waterway';
    badgeColor = '#0369a1';
  } else if (props.category === 'confederation') {
    badgeLabel = '🏛️ Biblical League / Confederation';
    badgeColor = '#607d8b';
  }

  const title = props.name || 'Biblical Feature';
  const desc = MAIN_MAP_DESCRIPTIONS[featId] || props.description || '';

  const attrRows = [];

  // Category
  if (props.category) {
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">Category:</td>
        <td class="kml-attr-val" style="text-transform: capitalize;">${escapeHtml(props.category.replace(/[_-]/g, ' '))}</td>
      </tr>
    `);
  }

  // Era / Period
  if (props.period) {
    const eraText = props.period === 'all' ? 'All Biblical Eras' : props.period.replace(/[_-]/g, ' ');
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">Biblical Era:</td>
        <td class="kml-attr-val" style="text-transform: capitalize;">${escapeHtml(eraText)}</td>
      </tr>
    `);
  }

  // Geometry details
  if (geomType === 'LineString' && feat.geometry.coordinates) {
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">Route Geometry:</td>
        <td class="kml-attr-val">${feat.geometry.coordinates.length} waypoints</td>
      </tr>
    `);
  } else if (geomType === 'Polygon' && feat.geometry.coordinates) {
    const ring = feat.geometry.coordinates[0] || [];
    attrRows.push(`
      <tr>
        <td class="kml-attr-key">Boundary:</td>
        <td class="kml-attr-val">${ring.length} vertices</td>
      </tr>
    `);
  }

  // Click Coordinates
  attrRows.push(`
    <tr>
      <td class="kml-attr-key">Clicked Position:</td>
      <td class="kml-attr-val" style="font-family: monospace;">${lngLat.lat.toFixed(4)}°N, ${lngLat.lng.toFixed(4)}°E</td>
    </tr>
  `);

  const popupHtml = `
    <div class="kml-feature-popup-card">
      <div class="kml-popup-header">
        <span class="kml-popup-badge" style="background: ${badgeColor};">${badgeLabel}</span>
        <h4 class="kml-popup-title">${escapeHtml(title)}</h4>
      </div>
      ${desc ? `
        <div class="kml-popup-desc">
          ${cleanDescriptionHtml(desc)}
        </div>
      ` : ''}
      <div class="kml-attrs-section">
        <span class="kml-attrs-header">Cartographic Details</span>
        <table class="kml-attrs-table">
          <tbody>
            ${attrRows.join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  new maplibregl.Popup({
    offset: 10,
    maxWidth: '310px',
    className: 'biblical-maplibre-popup main-map-popup',
    closeOnClick: true,
    closeButton: true,
  })
    .setLngLat(lngLat)
    .setHTML(popupHtml)
    .addTo(map);
}

// 18. Authoritative OpenBible Book KML Vector Overlay Loader
async function loadBookKML(bookCode) {
  currentBookKml = bookCode;

  // If cleared, remove book layers
  if (!bookCode) {
    if (map.getLayer('book-kml-fills')) map.removeLayer('book-kml-fills');
    if (map.getLayer('book-kml-lines')) map.removeLayer('book-kml-lines');
    if (map.getLayer('book-kml-points')) map.removeLayer('book-kml-points');
    if (map.getSource('book-kml-source')) map.removeSource('book-kml-source');
    showToast('Cleared book vector overlay');
    return;
  }

  showToast(`📖 Loading OpenBible vector KML for ${bookCode.toUpperCase()}…`, 3000);

  try {
    let kmlText = null;
    // 1. Try local cached file first
    try {
      const resp = await fetch(`data/kml/${bookCode}.kml`);
      if (resp.ok) kmlText = await resp.text();
    } catch (_) {}

    // 2. Fallback to openbible.info or raw github
    if (!kmlText) {
      const resp = await fetch(`https://a.openbible.info/geo/kmls/${bookCode}.kml`);
      if (resp.ok) kmlText = await resp.text();
    }

    if (!kmlText) {
      showToast(`⚠️ Could not load KML for ${bookCode}`, 4000);
      return;
    }

    // Parse XML & convert using toGeoJSON
    const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
    if (!window.toGeoJSON || !window.toGeoJSON.kml) {
      console.warn('toGeoJSON library not available');
      return;
    }
    const geojson = window.toGeoJSON.kml(dom);
    bookKmlGeoJSON = geojson;

    // Remove existing layers and source if present
    if (map.getLayer('book-kml-fills')) map.removeLayer('book-kml-fills');
    if (map.getLayer('book-kml-lines')) map.removeLayer('book-kml-lines');
    if (map.getLayer('book-kml-points')) map.removeLayer('book-kml-points');
    if (map.getSource('book-kml-source')) map.removeSource('book-kml-source');

    // Add source
    map.addSource('book-kml-source', {
      type: 'geojson',
      data: geojson,
    });

    // 1. Polygon Fills (translucent territory/confidence areas)
    map.addLayer({
      id: 'book-kml-fills',
      type: 'fill',
      source: 'book-kml-source',
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': currentTemplate === 'ancient' ? '#8d6e63' : '#0284c7',
        'fill-opacity': 0.22,
      },
    });

    // 2. Lines (routes, journeys, rivers) with solid 3.5px click hit-box
    map.addLayer({
      id: 'book-kml-lines',
      type: 'line',
      source: 'book-kml-source',
      filter: ['==', '$type', 'LineString'],
      paint: {
        'line-color': currentTemplate === 'ancient' ? '#b71c1c' : '#00e5ff',
        'line-width': 3.5,
        'line-dasharray': [3, 2],
      },
    });

    // 3. Points (book places) with 5.5px clickable radius
    map.addLayer({
      id: 'book-kml-points',
      type: 'circle',
      source: 'book-kml-source',
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 5.5,
        'circle-color': currentTemplate === 'ancient' ? '#d97706' : '#38bdf8',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
    });

    // Fit bounds to the book's features
    const coords = [];
    geojson.features.forEach((f) => {
      if (f.geometry && f.geometry.type === 'Point') {
        coords.push(f.geometry.coordinates);
      } else if (f.geometry && f.geometry.type === 'LineString') {
        f.geometry.coordinates.forEach((c) => coords.push(c));
      } else if (f.geometry && f.geometry.type === 'Polygon') {
        f.geometry.coordinates[0].forEach((c) => coords.push(c));
      }
    });

    if (coords.length > 0) {
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      map.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        { padding: 40, duration: 1200 }
      );
    }

    showToast(`✅ Overlaid ${geojson.features.length} vector features from ${bookCode.toUpperCase()} (OpenBible KML)`, 4000);
  } catch (err) {
    console.error('Failed to load book KML:', err);
    showToast(`⚠️ Error loading KML: ${err.message}`, 4000);
  }
}

