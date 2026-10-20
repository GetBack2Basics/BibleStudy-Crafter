/**
 * Biblical Map Crafter & Template Studio
 * Powered by MapLibre GL JS / GeoLibre & Google Cloud Storage
 * Dual JPG Template Exporter (Ancient & Modern)
 */

// Default Levant Hub: Jerusalem
const LEVANT_CENTER = [35.2345, 31.7767];
const DEFAULT_ZOOM = 8.5;

// Canonical Biblical Books Directory (61 Books with OpenBible KML data)
const BIBLICAL_BOOKS = [
  // Pentateuch & OT History
  { code: 'gen', name: 'Genesis', testament: 'OT', category: 'Pentateuch', desc: 'Creation, Patriarchs (Abraham, Isaac, Jacob, Joseph)' },
  { code: 'exod', name: 'Exodus', testament: 'OT', category: 'Pentateuch', desc: 'Deliverance from Egypt, Red Sea, Mount Sinai' },
  { code: 'lev', name: 'Leviticus', testament: 'OT', category: 'Pentateuch', desc: 'Tabernacle laws, priesthood, holiness codes' },
  { code: 'num', name: 'Numbers', testament: 'OT', category: 'Pentateuch', desc: 'Wilderness wanderings from Sinai to Jordan' },
  { code: 'deut', name: 'Deuteronomy', testament: 'OT', category: 'Pentateuch', desc: 'Moses farewell sermons in Plains of Moab' },
  { code: 'josh', name: 'Joshua', testament: 'OT', category: 'History', desc: 'Conquest of Canaan, Jericho, tribal allotments' },
  { code: 'judg', name: 'Judges', testament: 'OT', category: 'History', desc: 'Cycles of deliverance (Gideon, Samson, Deborah)' },
  { code: 'ruth', name: 'Ruth', testament: 'OT', category: 'History', desc: 'Moab to Bethlehem, David ancestry' },
  { code: '1sam', name: '1 Samuel', testament: 'OT', category: 'History', desc: 'Samuel, Saul, David rise in Judah' },
  { code: '2sam', name: '2 Samuel', testament: 'OT', category: 'History', desc: 'Reign of King David in Jerusalem' },
  { code: '1kgs', name: '1 Kings', testament: 'OT', category: 'History', desc: 'Solomon Temple, divided kingdom, Elijah' },
  { code: '2kgs', name: '2 Kings', testament: 'OT', category: 'History', desc: 'Elisha, fall of Samaria and Jerusalem exile' },
  { code: '1chr', name: '1 Chronicles', testament: 'OT', category: 'History', desc: 'Genealogies, Davidic reign and worship' },
  { code: '2chr', name: '2 Chronicles', testament: 'OT', category: 'History', desc: 'Solomon Temple to Cyrus decree of return' },
  { code: 'ezra', name: 'Ezra', testament: 'OT', category: 'History', desc: 'Return from Babylon, rebuilding the Temple' },
  { code: 'neh', name: 'Nehemiah', testament: 'OT', category: 'History', desc: 'Rebuilding the walls of Jerusalem' },
  { code: 'esth', name: 'Esther', testament: 'OT', category: 'History', desc: 'Jewish deliverance in Persian capital of Susa' },
  // Wisdom & Poetry
  { code: 'job', name: 'Job', testament: 'OT', category: 'Wisdom', desc: 'Land of Uz, trials and sovereignty of God' },
  { code: 'ps', name: 'Psalms', testament: 'OT', category: 'Poetry', desc: 'Songs of Zion, prayers and praises' },
  { code: 'prov', name: 'Proverbs', testament: 'OT', category: 'Wisdom', desc: 'Solomonic wisdom and guidance' },
  { code: 'eccl', name: 'Ecclesiastes', testament: 'OT', category: 'Wisdom', desc: 'The Teacher search for meaning in Jerusalem' },
  { code: 'song', name: 'Song of Songs', testament: 'OT', category: 'Poetry', desc: 'Bridal love across Lebanon and Sharon' },
  // Major & Minor Prophets
  { code: 'isa', name: 'Isaiah', testament: 'OT', category: 'Prophets', desc: 'Prophecy to Judah, Jerusalem, and nations' },
  { code: 'jer', name: 'Jeremiah', testament: 'OT', category: 'Prophets', desc: 'Weeping prophet in Jerusalem and Egypt' },
  { code: 'lam', name: 'Lamentations', testament: 'OT', category: 'Prophets', desc: 'Mourning the destruction of Jerusalem' },
  { code: 'ezek', name: 'Ezekiel', testament: 'OT', category: 'Prophets', desc: 'Visions by River Chebar in Babylon' },
  { code: 'dan', name: 'Daniel', testament: 'OT', category: 'Prophets', desc: 'Babylon and Persia, visions of kingdoms' },
  { code: 'hos', name: 'Hosea', testament: 'OT', category: 'Minor Prophets', desc: 'Prophecy to northern kingdom of Israel' },
  { code: 'joel', name: 'Joel', testament: 'OT', category: 'Minor Prophets', desc: 'Locust plague, Day of the Lord in Zion' },
  { code: 'amos', name: 'Amos', testament: 'OT', category: 'Minor Prophets', desc: 'Shepherd of Tekoa prophesying at Bethel' },
  { code: 'obad', name: 'Obadiah', testament: 'OT', category: 'Minor Prophets', desc: 'Judgment on Edom' },
  { code: 'jonah', name: 'Jonah', testament: 'OT', category: 'Minor Prophets', desc: 'Joppa to Tarshish, mission to Nineveh' },
  { code: 'mic', name: 'Micah', testament: 'OT', category: 'Minor Prophets', desc: 'Moresheth prophet, Bethlehem ruler prophecy' },
  { code: 'nah', name: 'Nahum', testament: 'OT', category: 'Minor Prophets', desc: 'Oracle concerning the fall of Nineveh' },
  { code: 'hab', name: 'Habakkuk', testament: 'OT', category: 'Minor Prophets', desc: 'Dialogue with God on Chaldean invasion' },
  { code: 'zeph', name: 'Zephaniah', testament: 'OT', category: 'Minor Prophets', desc: 'Judgment on Judah and Philistia' },
  { code: 'hag', name: 'Haggai', testament: 'OT', category: 'Minor Prophets', desc: 'Call to rebuild second Temple in Jerusalem' },
  { code: 'zech', name: 'Zechariah', testament: 'OT', category: 'Minor Prophets', desc: 'Messianic visions in post-exilic Jerusalem' },
  { code: 'mal', name: 'Malachi', testament: 'OT', category: 'Minor Prophets', desc: 'Final OT messenger to Jerusalem' },
  // Gospels & Acts
  { code: 'matt', name: 'Matthew', testament: 'NT', category: 'Gospel', desc: 'Ministry of Jesus in Galilee and Jerusalem' },
  { code: 'mark', name: 'Mark', testament: 'NT', category: 'Gospel', desc: 'Servant Jesus through Capernaum and Judea' },
  { code: 'luke', name: 'Luke', testament: 'NT', category: 'Gospel', desc: 'Historical account from Galilee to the cross' },
  { code: 'john', name: 'John', testament: 'NT', category: 'Gospel', desc: 'Signs in Cana, Samaria, Jerusalem, and Galilee' },
  { code: 'acts', name: 'Acts', testament: 'NT', category: 'History', desc: 'Early Church, Paul missionary journeys to Rome' },
  // Epistles & Revelation
  { code: 'rom', name: 'Romans', testament: 'NT', category: 'Epistles', desc: 'Paul epistle to the saints in Rome' },
  { code: '1cor', name: '1 Corinthians', testament: 'NT', category: 'Epistles', desc: 'Epistle to Church at Corinth, Achaia' },
  { code: '2cor', name: '2 Corinthians', testament: 'NT', category: 'Epistles', desc: 'Paul ministry defense through Macedonia' },
  { code: 'gal', name: 'Galatians', testament: 'NT', category: 'Epistles', desc: 'Churches of Galatia (Pisidian Antioch, Lystra)' },
  { code: 'eph', name: 'Ephesians', testament: 'NT', category: 'Epistles', desc: 'Church of Ephesus, Asia Minor' },
  { code: 'phil', name: 'Philippians', testament: 'NT', category: 'Epistles', desc: 'Church at Philippi in Macedonia' },
  { code: 'col', name: 'Colossians', testament: 'NT', category: 'Epistles', desc: 'Church in Colossae, Lycus Valley' },
  { code: '1thess', name: '1 Thessalonians', testament: 'NT', category: 'Epistles', desc: 'Church of Thessalonica in Macedonia' },
  { code: '2thess', name: '2 Thessalonians', testament: 'NT', category: 'Epistles', desc: 'Comfort concerning the Lord return' },
  { code: '1tim', name: '1 Timothy', testament: 'NT', category: 'Epistles', desc: 'Pastoral guidance for Ephesus ministry' },
  { code: '2tim', name: '2 Timothy', testament: 'NT', category: 'Epistles', desc: 'Paul final letter from Roman imprisonment' },
  { code: 'titus', name: 'Titus', testament: 'NT', category: 'Epistles', desc: 'Establishing elders in the cities of Crete' },
  { code: 'heb', name: 'Hebrews', testament: 'NT', category: 'Epistles', desc: 'Christ superior covenant and sanctuary' },
  { code: '1pet', name: '1 Peter', testament: 'NT', category: 'Epistles', desc: 'To exiles in Pontus, Galatia, Cappadocia, Asia' },
  { code: '2pet', name: '2 Peter', testament: 'NT', category: 'Epistles', desc: 'Warning against false teachers in the churches' },
  { code: 'jude', name: 'Jude', testament: 'NT', category: 'Epistles', desc: 'Contending for the faith once delivered' },
  { code: 'rev', name: 'Revelation', testament: 'NT', category: 'Prophecy', desc: 'Visions on Patmos to the 7 Churches of Asia' },
];

// 36 Historical Biblical Regions & Kingdoms
const BIBLICAL_REGIONS_META = {
  'Abilene': { category: 'Syrian Tetrarchy', desc: 'Region northwest of Damascus governed by Lysanias (Luke 3:1)' },
  'Achaia': { category: 'Roman Province', desc: 'Southern Greece including Corinth and Athens (Acts 18:12)' },
  'Amalek': { category: 'Desert Realm', desc: 'Negev and Sinai territory of the Amalekites (1 Sam 15:7)' },
  'Ammon': { category: 'Transjordan Kingdom', desc: 'Territory east of Jordan and Gilead; capital Rabbah (Deut 2:19)' },
  'Arabah': { category: 'Rift Valley', desc: 'Deep rift depression south from Dead Sea to Gulf of Aqaba' },
  'Aram': { category: 'Syrian Realm', desc: 'Aramean kingdoms centered on Damascus, Hamath, and Zobah' },
  'Asia': { category: 'Roman Province', desc: 'Western Asia Minor containing the Seven Churches of Revelation' },
  'Assyria': { category: 'Mesopotamian Empire', desc: 'Ancient northern empire centered on Nineveh along the Tigris' },
  'Babylonia': { category: 'Mesopotamian Empire', desc: 'Southern Mesopotamia; land of exile, Shinar, Euphrates' },
  'Bashan': { category: 'Northern Realm', desc: 'Fertile volcanic plateau east of Galilee, realm of King Og' },
  'Bithynia': { category: 'Roman Province', desc: 'Northern Asia Minor bordering Black Sea (Acts 16:7)' },
  'Canaan': { category: 'Promised Land', desc: 'Historical land west of Jordan promised to Abraham seed' },
  'Cappadocia': { category: 'Anatolian Plateau', desc: 'Eastern Asia Minor plateau region (Acts 2:9, 1 Pet 1:1)' },
  'Cilicia': { category: 'Roman Province', desc: 'Southeastern Asia Minor; homeland of apostle Paul at Tarsus' },
  'Crete': { category: 'Mediterranean Island', desc: 'Large island with Fair Havens where Titus was left (Titus 1:5)' },
  'Cyprus': { category: 'Mediterranean Island', desc: 'Homeland of Barnabas, first stop on Paul journey (Acts 13:4)' },
  'Decapolis': { category: 'Hellenistic League', desc: 'Ten Hellenistic cities east of Galilee and Jordan (Matt 4:25)' },
  'Edom': { category: 'Southern Kingdom', desc: 'Mountainous realm of Esau descendants south of Dead Sea (Mount Seir)' },
  'Galatia': { category: 'Roman Province', desc: 'Central Asia Minor territory visited by Paul (Acts 16:6)' },
  'Gilead': { category: 'Transjordan Region', desc: 'Hilly forested region east of Jordan between Yarmuk and Arnon' },
  'Goshen': { category: 'Egyptian Land', desc: 'Fertile Nile delta region inhabited by Israelites (Gen 45:10)' },
  'Lycaonia': { category: 'Anatolian District', desc: 'Region of Iconium, Lystra, and Derbe in southern Asia Minor' },
  'Lydia': { category: 'Asia Minor Realm', desc: 'Western Anatolia including Sardis and Thyatira' },
  'Macedonia': { category: 'Greek Province', desc: 'Northern Greek kingdom with Philippi, Thessalonica, and Berea' },
  'Media': { category: 'Persian Empire', desc: 'Ancient Iranian realm east of Zagros Mountains (Dan 5:28)' },
  'Midian': { category: 'Arabian Realm', desc: 'Desert territory east of Gulf of Aqaba where Moses fled' },
  'Moab': { category: 'Transjordan Kingdom', desc: 'High plateau kingdom east of Dead Sea; land of Ruth' },
  'Mysia': { category: 'Anatolian District', desc: 'Northwestern Asia Minor containing Troas and Pergamum' },
  'Pamphylia': { category: 'Coastal District', desc: 'Southern coastal plain of Asia Minor; Perga and Attalia' },
  'Persia': { category: 'Eastern Empire', desc: 'Great empire of Cyrus, Darius, and Xerxes from Susa and Persepolis' },
  'Philistia': { category: 'Coastal Plain', desc: 'Pentapolis of the Philistines: Gaza, Ashdod, Ashkelon, Gath, Ekron' },
  'Phoenicia': { category: 'Maritime Realm', desc: 'Coastal seafaring cities of Tyre, Sidon, and Byblos' },
  'Phrygia': { category: 'Central Anatolia', desc: 'Interior region traversed by Paul during mission journeys' },
  'Pisidia': { category: 'Taurus Mountain Realm', desc: 'Rugged highlands of Pisidian Antioch' },
  'Pontus': { category: 'Black Sea Province', desc: 'Northeastern Asia Minor coast; homeland of Aquila' },
  'Trachonitis': { category: 'Syrian Tetrarchy', desc: 'Lava-field territory east of Golan ruled by Philip (Luke 3:1)' },
};

// Global State
let map = null;
let currentTemplate = 'ancient'; // 'ancient' | 'modern'
let currentBasemap = 'geolibre_ocean_topo'; // GeoLibre Topographic Terrain with Ocean Depth Bathymetry
let currentEra = 'all';
let currentLabelDensity = 'balanced'; // 'balanced' | 'clean' | 'dense' | 'all'
let currentSitesDisplayMode = 'major_only'; // 'major_only' (Default: only major points at all zoom levels) | 'auto_zoom'
let currentBookKml = null;
let bookKmlGeoJSON = null;
let is3DEnabled = false;

let templatesConfig = null;
let sitesGeoJSON = null;
let boundariesGeoJSON = null;
let regionsGeoJSON = null;
let currentRegionsOverlay = 'none'; // 'none' (Default: OFF!) | 'selected' | 'all'
let selectedRegions = new Set(); // Set of active region names on map
let activeBooks = new Set(); // Set of active book codes on map
let activeBookGeoJSONs = {}; // Map of bookCode -> parsed GeoJSON

let markersList = [];
let capturedAncientJpg = null;
let capturedModernJpg = null;

// Photo Carousel & Lightbox State
let siteActivePhotoIndices = {};
let currentLightboxSite = null;
let currentLightboxIndex = 0;

// LHS Biblical Library & Active Layer Control State
let activeLibraryScope = 'all'; // 'all' | 'locations' | 'books' | 'regions'
let librarySearchQuery = '';
let libraryContextSelection = 'default';
let pinnedSiteIds = new Set();
let activeLayers = [];
let currentAttributesLayer = null;
let draggedLayerId = null;

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
  populateLibraryContextDropdown();
  initActiveLayers();
  renderActiveLayersControl();
});

// 1. Load Data Files
async function loadData() {
  try {
    const ts = Date.now();
    const [tmpls, sites, bounds, regions] = await Promise.all([
      fetch(`data/templates.json?t=${ts}`).then((r) => r.json()),
      fetch(`data/biblical_sites.geojson?t=${ts}`).then((r) => r.json()),
      fetch(`data/ancient_boundaries.geojson?t=${ts}`).then((r) => r.json()),
      fetch(`data/biblical_regions.geojson?t=${ts}`).then((r) => r.json()).catch(() => null),
    ]);
    templatesConfig = tmpls;
    sitesGeoJSON = sites;
    boundariesGeoJSON = bounds;
    regionsGeoJSON = regions;
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
  if (params.get('density')) {
    currentLabelDensity = params.get('density');
    const densitySelect = document.getElementById('select-label-density');
    if (densitySelect) densitySelect.value = currentLabelDensity;
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
    map.on('moveend', () => scheduleRenderMarkers());
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

  // 8. OpenBible Historical Regions & Kingdoms (Ammon, Moab, Edom, Philistia, Aram, Bashan, etc.)
  if (regionsGeoJSON && !map.getSource('ancient-regions-source')) {
    map.addSource('ancient-regions-source', {
      type: 'geojson',
      data: regionsGeoJSON,
    });

    if (!map.getLayer('ancient-regions-fill')) {
      map.addLayer(
        {
          id: 'ancient-regions-fill',
          type: 'fill',
          source: 'ancient-regions-source',
          filter: ['in', 'name', ''], // Off by default!
          layout: { visibility: 'none' }, // Off by default!
          paint: {
            'fill-color': ['get', 'fill_color'],
            'fill-opacity': 0.16,
          },
        },
        'ancient-water-shelf'
      );
    }

    if (!map.getLayer('ancient-regions-stroke')) {
      map.addLayer(
        {
          id: 'ancient-regions-stroke',
          type: 'line',
          source: 'ancient-regions-source',
          filter: ['in', 'name', ''], // Off by default!
          layout: { visibility: 'none' }, // Off by default!
          paint: {
            'line-color': ['get', 'stroke_color'],
            'line-width': 1.6,
            'line-dasharray': [3, 2],
            'line-opacity': 0.7,
          },
        },
        'ancient-water-shelf'
      );
    }
  }

  updateRegionsFilter();
}

// Controls visibility and filter of historical regions (Off by default; user selects regions)
function updateRegionsFilter() {
  if (!map || !map.getLayer('ancient-regions-fill') || !map.getLayer('ancient-regions-stroke')) return;
  const isAncient = currentTemplate === 'ancient';
  if (!isAncient) {
    map.setLayoutProperty('ancient-regions-fill', 'visibility', 'none');
    map.setLayoutProperty('ancient-regions-stroke', 'visibility', 'none');
    return;
  }

  if (currentRegionsOverlay === 'all') {
    map.setFilter('ancient-regions-fill', null);
    map.setFilter('ancient-regions-stroke', null);
    map.setLayoutProperty('ancient-regions-fill', 'visibility', 'visible');
    map.setLayoutProperty('ancient-regions-stroke', 'visibility', 'visible');
  } else if (currentRegionsOverlay === 'none' && selectedRegions.size === 0) {
    // Off by default
    map.setLayoutProperty('ancient-regions-fill', 'visibility', 'none');
    map.setLayoutProperty('ancient-regions-stroke', 'visibility', 'none');
  } else {
    // Show only the selected regions that are marked visible in Layer Control
    const regionNames = Array.from(selectedRegions).filter((rName) => {
      const l = activeLayers.find((layer) => layer.id === `region:${rName}`);
      return l ? l.visible : true;
    });
    if (regionNames.length === 0) {
      map.setLayoutProperty('ancient-regions-fill', 'visibility', 'none');
      map.setLayoutProperty('ancient-regions-stroke', 'visibility', 'none');
    } else {
      const filterExpr = ['in', 'name', ...regionNames];
      map.setFilter('ancient-regions-fill', filterExpr);
      map.setFilter('ancient-regions-stroke', filterExpr);
      map.setLayoutProperty('ancient-regions-fill', 'visibility', 'visible');
      map.setLayoutProperty('ancient-regions-stroke', 'visibility', 'visible');
    }
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
    'ancient-regions-fill',
    'ancient-regions-stroke',
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
      if (map.getLayer(id)) {
        if (id === 'ancient-regions-fill' || id === 'ancient-regions-stroke') {
          // Handled by updateRegionsFilter below
        } else {
          map.setLayoutProperty(id, 'visibility', 'visible');
        }
      }
    });
    updateRegionsFilter();
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

// Global active floating popup (for sidebar search/clicks on any site)
let activeFloatingPopup = null;

function buildSitePopupHtml(props, lng, lat) {
  const isAncient = currentTemplate === 'ancient';
  const isPinned = pinnedSiteIds.has(props.id);
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

  const transVariants = Array.isArray(props.translation_variants) ? props.translation_variants : [];
  const translationVariantsHtml = transVariants.length > 0 ? `
    <div class="site-popup-row">
      <span class="label">🔤 Translations:</span>
      <span class="val ancient-val" style="font-size: 0.70rem;" title="Alternative names in English Bible translations">${escapeHtml(transVariants.slice(0, 3).join(', '))}${transVariants.length > 3 ? ` (+${transVariants.length - 3})` : ''}</span>
    </div>
  ` : '';

  const sourcesList = Array.isArray(props.scholarly_sources) ? props.scholarly_sources : [];
  const totalSources = props.scholarly_sources_count || sourcesList.length;
  const scholarlySourcesHtml = sourcesList.length > 0 ? `
    <details class="site-popup-sources-accordion" onclick="event.stopPropagation()">
      <summary class="sources-summary" title="Click to view scholarly citations and archaeological references">
        <span>📚 Archaeological Sources (${totalSources})</span>
        <span class="sources-expand-icon">▾</span>
      </summary>
      <div class="sources-content-list">
        ${sourcesList.map((s) => `
          <div class="source-item">
            <div class="source-title-row">
              ${s.url ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="source-title-link">📖 ${escapeHtml(s.title)}</a>` : `<span class="source-title">📖 ${escapeHtml(s.title)}</span>`}
              ${s.year ? `<span class="source-year">${s.year}</span>` : ''}
            </div>
            ${s.page ? `<span class="source-page">Entry / Page: ${escapeHtml(String(s.page))}</span>` : ''}
          </div>
        `).join('')}
      </div>
    </details>
  ` : '';

  const auth = props.authorities || {};
  const authoritiesHtml = Object.keys(auth).length > 0 ? `
    <div class="site-popup-authorities-row">
      ${auth.pleiades ? `<a href="${auth.pleiades}" target="_blank" rel="noopener noreferrer" class="authority-badge pleiades" title="Pleiades Gazetteer of Ancient Mediterranean Geography">🏛️ Pleiades</a>` : ''}
      ${auth.dare ? `<a href="${auth.dare}" target="_blank" rel="noopener noreferrer" class="authority-badge dare" title="Digital Atlas of the Roman Empire">🏛️ Roman Atlas</a>` : ''}
      ${auth.wikidata ? `<a href="${auth.wikidata}" target="_blank" rel="noopener noreferrer" class="authority-badge wikidata" title="Wikidata Knowledge Graph">🌐 Wikidata</a>` : ''}
      ${auth.biblia ? `<a href="${auth.biblia}" target="_blank" rel="noopener noreferrer" class="authority-badge biblia" title="Biblia / Logos Factbook">📖 Factbook</a>` : ''}
      ${auth.wikipedia ? `<a href="${auth.wikipedia}" target="_blank" rel="noopener noreferrer" class="authority-badge wikipedia" title="Wikipedia Reference">📖 Wikipedia</a>` : ''}
    </div>
  ` : '';

  return `
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
        ${translationVariantsHtml}
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
        ${scholarlySourcesHtml}
      </div>

      <div class="site-popup-footer">
        ${authoritiesHtml}
        <div style="display: flex; align-items: center; gap: 6px; width: 100%;">
          ${props.openbible_url ? `
          <a href="${props.openbible_url}" target="_blank" rel="noopener noreferrer" class="popup-btn-openbible" title="View authoritative scholarly dossier on OpenBible.info">
            📖 OpenBible ↗
          </a>` : ''}
          <button class="popup-btn-center" onclick="map.flyTo({ center: [${lng}, ${lat}], zoom: 12, pitch: 45, duration: 1000 })">
            🔍 Zoom & Center
          </button>
        </div>
      </div>
    </div>
  `;
}

function openPopupForFeature(feature) {
  if (activeFloatingPopup) {
    try { activeFloatingPopup.remove(); } catch (_) {}
    activeFloatingPopup = null;
  }
  const props = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;

  // Check if marker exists on map and toggle its popup
  const item = markersList.find((m) => m.props && m.props.id === props.id);
  if (item && item.marker) {
    item.marker.togglePopup();
    return;
  }

  // Otherwise, create an immediate popup at the exact coordinates
  const popupHtml = buildSitePopupHtml(props, lng, lat);
  activeFloatingPopup = new maplibregl.Popup({
    offset: 10,
    maxWidth: '280px',
    className: 'biblical-maplibre-popup',
    closeOnClick: true,
    closeButton: true,
  })
    .setLngLat([lng, lat])
    .setHTML(popupHtml)
    .addTo(map);

  enableDraggablePopup(activeFloatingPopup);
}

// 8. Render Markers (5-Tier Priority + Screen-Space Label Collision Avoidance)
function renderMarkers() {
  // Clear existing markers
  markersList.forEach((m) => (m.marker ? m.marker.remove() : m.remove()));
  markersList = [];

  if (!sitesGeoJSON?.features || !map) return;

  const isAncient = currentTemplate === 'ancient';
  const currentZoom = map.getZoom();

  // Viewport culling bounds with 20% margin for snappy DOM performance
  let viewportBounds = null;
  if (currentZoom >= 5.5) {
    const b = map.getBounds();
    const spanLng = b.getEast() - b.getWest();
    const spanLat = b.getNorth() - b.getSouth();
    const margin = 0.20;
    viewportBounds = {
      west: b.getWest() - spanLng * margin,
      east: b.getEast() + spanLng * margin,
      south: b.getSouth() - spanLat * margin,
      north: b.getNorth() + spanLat * margin,
    };
  }

  // 1. Filter candidates by Era, Tier Zoom Thresholds & Viewport Bounds
  const candidates = [];
  sitesGeoJSON.features.forEach((feature) => {
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const isPinned = pinnedSiteIds.has(props.id);

    // Layer Control Visibility Check: Hidden pinned site
    const siteLayer = activeLayers.find((l) => l.id === `site:${props.id}`);
    if (siteLayer && !siteLayer.visible) {
      return;
    }

    // Filter by Era if specified (Pinned sites always bypass era filtering)
    if (!isPinned && currentEra !== 'all' && props.period !== 'all' && !props.period.includes(currentEra)) {
      return;
    }

    // Zoom & Priority Tier Filtering
    // Pinned sites are ALWAYS visible at all zoom levels!
    if (!isPinned) {
      const tier = props.tier || 3;
      const isMajor = tier === 1 || props.is_top_10;

      // Layer Control Check: If Major Sites layer is toggled off, skip major sites
      const majorLayer = activeLayers.find((l) => l.id === 'layer_major_sites');
      const showMajor = majorLayer ? majorLayer.visible : true;
      if (!showMajor) return;

      // User requirement: By default at ANY zoom level only the major points should be shown!
      if (currentSitesDisplayMode === 'major_only') {
        if (!isMajor) return;
      } else {
        const minZoom = props.min_zoom !== undefined ? props.min_zoom : (
          tier === 1 ? 2.0 :
          tier === 2 ? 6.5 :
          tier === 3 ? 8.5 :
          tier === 4 ? 10.2 : 11.8
        );
        if (currentZoom < minZoom) return;
      }

      // Viewport culling to keep DOM markers snappy
      if (viewportBounds && (lng < viewportBounds.west || lng > viewportBounds.east || lat < viewportBounds.south || lat > viewportBounds.north)) {
        return;
      }
    }

    candidates.push(feature);
  });

  // 2. Sort Candidates by Priority:
  // - Pinned sites FIRST
  // - Then Tier ascending (Tier 1 Major -> Tier 2 Regional -> Tier 3 Prominent -> ...)
  // - Then Verse count descending
  candidates.sort((a, b) => {
    const aPinned = pinnedSiteIds.has(a.properties.id);
    const bPinned = pinnedSiteIds.has(b.properties.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    const aTier = a.properties.tier || 3;
    const bTier = b.properties.tier || 3;
    if (aTier !== bTier) return aTier - bTier;
    return (b.properties.verse_count || 1) - (a.properties.verse_count || 1);
  });

  // 3. Screen-Space Label Collision Detection
  let padX = 76;
  let padY = 22;
  if (currentLabelDensity === 'clean') {
    padX = 98;
    padY = 28;
  } else if (currentLabelDensity === 'dense') {
    padX = 46;
    padY = 16;
  }

  const placedBoxes = [];
  let visibleLabelsCount = 0;

  candidates.forEach((feature) => {
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const isPinned = pinnedSiteIds.has(props.id);

    // Project coordinates to 2D screen pixels
    const pt = map.project([lng, lat]);
    const sx = pt.x;
    const sy = pt.y;

    // Label bounding box estimation in screen space
    const box = {
      x1: sx - 8,
      y1: sy - padY / 2,
      x2: sx + padX,
      y2: sy + padY / 2,
    };

    let showFullLabel = true;

    // Pinned sites always show full label!
    if (isPinned) {
      showFullLabel = true;
      placedBoxes.push(box);
      visibleLabelsCount++;
    } else if (currentLabelDensity === 'all') {
      showFullLabel = true;
      visibleLabelsCount++;
    } else {
      // Check collision against already placed higher-priority boxes
      for (let i = 0; i < placedBoxes.length; i++) {
        const pb = placedBoxes[i];
        if (!(box.x2 < pb.x1 || box.x1 > pb.x2 || box.y2 < pb.y1 || box.y1 > pb.y2)) {
          showFullLabel = false;
          break;
        }
      }

      if (showFullLabel) {
        placedBoxes.push(box);
        visibleLabelsCount++;
      }
    }

    // Determine label text: short version of ancient or modern name
    const rawName = isAncient ? (props.ancient_name || props.name) : (props.modern_name || props.name);
    const shortName = rawName.split('/')[0].trim();

    // Create Pin Element
    const el = document.createElement('div');
    el.className = `site-marker-node ${isAncient ? 'ancient' : 'modern'} tier-${props.tier || 3} ${isPinned ? 'is-pinned' : ''} ${!showFullLabel ? 'label-collapsed' : ''}`;
    el.setAttribute('title', `${props.name} (${(props.tier_name || 'site').toUpperCase()}) — Click for details`);

    el.innerHTML = `
      <span class="site-dot"></span>
      ${isPinned ? '<span class="pin-badge-icon" title="Pinned by you">📌</span>' : ''}
      <span class="site-label-text">${escapeHtml(shortName)}</span>
    `;

    const popupHtml = buildSitePopupHtml(props, lng, lat);

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

  // Update Status Indicator
  const badgeSites = document.getElementById('badge-active-sites');
  if (badgeSites) {
    badgeSites.textContent = `• 🏷️ ${visibleLabelsCount} labels (${candidates.length} sites)`;
  }
}

// Global Toggle Pin Function
// ==============================================================================
// 9. UNIFIED BIBLICAL LIBRARY & ADD-TO-MAP ENGINE
// Supports: Locations (1,342 sites), Regions (36 kingdoms), Books (61 with KML)
// ==============================================================================

// Populate Contextual Dropdown based on active scope
function populateLibraryContextDropdown() {
  const sel = document.getElementById('select-library-context');
  if (!sel) return;

  sel.innerHTML = '';
  if (activeLibraryScope === 'all') {
    sel.innerHTML = `
      <option value="default" selected>⭐ Top 10 Major Biblical Centers</option>
      <option value="all_major_sites">📍 All Major Sites (Tier 1)</option>
      <option value="all_regions">🗺️ Historical Kingdoms & Regions (36)</option>
      <option value="gospels_acts">📖 Gospels & Acts (Matthew – Acts)</option>
      <option value="ot_history">📖 Pentateuch & History Books</option>
      <option value="all_books">📖 All 61 Biblical Books</option>
      <option value="all_sites_az">📍 All 1,342 Sites (A-Z Directory)</option>
    `;
    libraryContextSelection = 'default';
  } else if (activeLibraryScope === 'locations') {
    sel.innerHTML = `
      <option value="major_only" selected>⭐ Top 10 Major Centers</option>
      <option value="galilee">🌊 Galilee & North (Capernaum, Nazareth, Cana...)</option>
      <option value="judea">🏛️ Judea & Dead Sea (Jerusalem, Bethlehem, Jericho...)</option>
      <option value="coastal">⚓ Coastal Plain & Sharon (Joppa, Caesarea, Gaza...)</option>
      <option value="transjordan">🧭 Transjordan & Decapolis (Gadara, Pella, Heshbon...)</option>
      <option value="all_az">🔤 All 1,342 Sites (A-Z Alphabetical)</option>
    `;
    libraryContextSelection = 'major_only';
  } else if (activeLibraryScope === 'books') {
    let opts = '<option value="all_books" selected>📖 All 61 Biblical Books (Browse Below)</option>';
    opts += '<optgroup label="Gospels & Acts">';
    BIBLICAL_BOOKS.filter((b) => b.category === 'Gospel' || b.code === 'acts').forEach((b) => {
      opts += `<option value="book:${b.code}">📖 ${b.name} (${b.category})</option>`;
    });
    opts += '</optgroup><optgroup label="Pentateuch & History">';
    BIBLICAL_BOOKS.filter((b) => b.category === 'Pentateuch' || b.category === 'History').forEach((b) => {
      opts += `<option value="book:${b.code}">📖 ${b.name}</option>`;
    });
    opts += '</optgroup><optgroup label="Wisdom & Prophets">';
    BIBLICAL_BOOKS.filter((b) => b.category.includes('Prophet') || b.category === 'Wisdom' || b.category === 'Poetry').forEach((b) => {
      opts += `<option value="book:${b.code}">📖 ${b.name}</option>`;
    });
    opts += '</optgroup><optgroup label="Epistles & Prophecy">';
    BIBLICAL_BOOKS.filter((b) => b.category === 'Epistles' || b.category === 'Prophecy').forEach((b) => {
      opts += `<option value="book:${b.code}">📖 ${b.name}</option>`;
    });
    opts += '</optgroup>';
    sel.innerHTML = opts;
    libraryContextSelection = 'all_books';
  } else if (activeLibraryScope === 'regions') {
    let opts = '<option value="all_regions" selected>🗺️ All 36 Historical Kingdoms & Regions</option>';
    const regionNames = Object.keys(BIBLICAL_REGIONS_META).sort();
    opts += '<optgroup label="Holy Land & Transjordan">';
    ['Canaan', 'Decapolis', 'Gilead', 'Bashan', 'Ammon', 'Moab', 'Edom', 'Philistia', 'Phoenicia'].forEach((r) => {
      if (BIBLICAL_REGIONS_META[r]) opts += `<option value="region:${r}">🗺️ ${r} (${BIBLICAL_REGIONS_META[r].category})</option>`;
    });
    opts += '</optgroup><optgroup label="Egypt, Sinai & Arabia">';
    ['Goshen', 'Amalek', 'Midian', 'Arabah'].forEach((r) => {
      if (BIBLICAL_REGIONS_META[r]) opts += `<option value="region:${r}">🗺️ ${r} (${BIBLICAL_REGIONS_META[r].category})</option>`;
    });
    opts += '</optgroup><optgroup label="Syria & Mesopotamia">';
    ['Aram', 'Abilene', 'Trachonitis', 'Assyria', 'Babylonia', 'Persia', 'Media'].forEach((r) => {
      if (BIBLICAL_REGIONS_META[r]) opts += `<option value="region:${r}">🗺️ ${r} (${BIBLICAL_REGIONS_META[r].category})</option>`;
    });
    opts += '</optgroup><optgroup label="Asia Minor & Roman Provinces">';
    regionNames.filter((r) => !['Canaan', 'Decapolis', 'Gilead', 'Bashan', 'Ammon', 'Moab', 'Edom', 'Philistia', 'Phoenicia', 'Goshen', 'Amalek', 'Midian', 'Arabah', 'Aram', 'Abilene', 'Trachonitis', 'Assyria', 'Babylonia', 'Persia', 'Media'].includes(r)).forEach((r) => {
      opts += `<option value="region:${r}">🗺️ ${r} (${BIBLICAL_REGIONS_META[r].category})</option>`;
    });
    opts += '</optgroup>';
    sel.innerHTML = opts;
    libraryContextSelection = 'all_regions';
  }
}

// ==============================================================================
// 9. ACTIVE MAP LAYERS ENGINE & REORDERABLE CONTROL
// ==============================================================================

function initActiveLayers() {
  syncActiveLayersFromState();
  renderActiveLayersControl();
}

// Synchronize activeLayers array with current state (preserving order and user visibility)
function syncActiveLayersFromState() {
  const currentLayersMap = new Map();
  activeLayers.forEach((l) => currentLayersMap.set(l.id, l));

  const updated = [];

  // 1. Active Books (KML paths)
  activeBooks.forEach((code) => {
    const id = `book:${code}`;
    const book = BIBLICAL_BOOKS.find((b) => b.code === code);
    const name = book ? `Book of ${book.name}` : `Book of ${code.toUpperCase()}`;
    const existing = currentLayersMap.get(id);
    updated.push(
      existing || {
        id,
        refId: code,
        type: 'book',
        name,
        badgeText: 'BOOK',
        badgeClass: 'badge-book',
        icon: '📖',
        sub: `${book?.testament || 'Biblical'} ${book?.category || 'Text'} • OpenBible KML`,
        visible: true,
        isBase: false,
      }
    );
  });

  // 2. Active Regions (Selected Kingdoms / Territories)
  selectedRegions.forEach((regName) => {
    const id = `region:${regName}`;
    const meta = BIBLICAL_REGIONS_META[regName] || { category: 'Historical Realm', desc: '' };
    const existing = currentLayersMap.get(id);
    updated.push(
      existing || {
        id,
        refId: regName,
        type: 'region',
        name: regName,
        badgeText: 'REGION',
        badgeClass: 'badge-region',
        icon: '🗺️',
        sub: `${meta.category} • Regional Boundary`,
        visible: true,
        isBase: false,
      }
    );
  });

  // 3. Custom Pinned Sites
  pinnedSiteIds.forEach((siteId) => {
    const id = `site:${siteId}`;
    const feat = sitesGeoJSON?.features?.find((f) => f.properties.id === siteId);
    const name = feat?.properties?.name || siteId;
    const tier = feat?.properties?.tier || 3;
    const existing = currentLayersMap.get(id);
    let badgeText = 'SITE';
    let badgeClass = 'badge-site';
    if (feat?.properties?.is_top_10 || tier === 1) {
      badgeText = 'MAJOR';
      badgeClass = 'badge-major';
    } else if (tier === 2) {
      badgeText = 'REGIONAL';
      badgeClass = 'badge-site';
    }
    updated.push(
      existing || {
        id,
        refId: siteId,
        type: 'location',
        name,
        badgeText,
        badgeClass,
        icon: '📍',
        sub: `${feat?.properties?.biblical_region || feat?.properties?.modern_country || 'Levant'} • ${feat?.properties?.verse_count || 1} verses`,
        visible: true,
        isBase: false,
        feature: feat,
      }
    );
  });

  // 4. Base Historical Regions Master (if currentRegionsOverlay === 'all')
  if (currentRegionsOverlay === 'all') {
    const id = 'base_regions_all';
    const existing = currentLayersMap.get(id);
    updated.push(
      existing || {
        id,
        refId: 'all',
        type: 'base_regions',
        name: 'All 36 Biblical Regions',
        badgeText: 'OVERLAY',
        badgeClass: 'badge-region',
        icon: '🗺️',
        sub: 'Master Regional Kingdoms & Territories',
        visible: true,
        isBase: true,
      }
    );
  }

  // 5. Base Sites Layer (Always present at base of stack)
  const baseSitesId = 'base_sites_layer';
  const existingBase = currentLayersMap.get(baseSitesId);
  updated.push(
    existingBase || {
      id: baseSitesId,
      refId: 'base_sites',
      type: 'base_sites',
      name: 'Biblical Sites & Gazetteers',
      badgeText: 'GAZETTEER',
      badgeClass: 'badge-major',
      icon: '🏛️',
      sub: `${sitesGeoJSON?.features?.length || 1342} Geocoded Sites • 5-Tier Zoom Culling`,
      visible: true,
      isBase: true,
    }
  );

  activeLayers = updated;
}

// Render the Active Layers Control list in LHS Sidebar
function renderActiveLayersControl() {
  const listEl = document.getElementById('active-layers-list');
  const countBadge = document.getElementById('active-layers-count');
  if (!listEl) return;

  if (countBadge) {
    countBadge.textContent = activeLayers.length;
  }

  if (activeLayers.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 16px 10px; text-align: center; color: var(--text-muted); font-size: 0.74rem;">
        No active map layers.<br/>Use the library above to search and add sites, regions, or books.
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';

  activeLayers.forEach((layer, idx) => {
    const itemEl = document.createElement('div');
    itemEl.className = `active-layer-item ${!layer.visible ? 'is-hidden' : ''}`;
    itemEl.setAttribute('data-layer-id', layer.id);
    itemEl.setAttribute('draggable', 'true');

    itemEl.innerHTML = `
      <span class="layer-drag-handle" title="Drag to reorder layer stack">⠿</span>
      <button class="layer-toggle-vis ${!layer.visible ? 'muted' : ''}" title="${layer.visible ? 'Hide layer' : 'Show layer'}" onclick="toggleActiveLayerVisibility('${escapeHtml(layer.id)}', event)">
        ${layer.visible ? '👁️' : '🕶️'}
      </button>
      <div class="layer-main-info" onclick="flyToLayer('${escapeHtml(layer.id)}')">
        <div class="layer-title-row">
          <span class="layer-name-text">${escapeHtml(layer.name)}</span>
          <span class="item-badge ${layer.badgeClass || 'badge-site'}">${layer.badgeText || 'LAYER'}</span>
        </div>
        <div class="layer-sub-desc">${escapeHtml(layer.sub || '')}</div>
      </div>
      <div class="layer-tools-col">
        <button class="layer-tool-btn" title="Move Up in layer stack" ${idx === 0 ? 'disabled' : ''} onclick="moveActiveLayer('${escapeHtml(layer.id)}', -1, event)">▲</button>
        <button class="layer-tool-btn" title="Move Down in layer stack" ${idx === activeLayers.length - 1 ? 'disabled' : ''} onclick="moveActiveLayer('${escapeHtml(layer.id)}', 1, event)">▼</button>
        <button class="layer-tool-btn btn-attr" title="View GIS Attributes Table (Spreadsheet Inspector)" onclick="openAttributesModal('${escapeHtml(layer.id)}', event)">⊞</button>
        <button class="layer-tool-btn btn-meta" title="View Scholarly Metadata & Academic Dossier" onclick="openMetadataModal('${escapeHtml(layer.id)}', event)">ℹ</button>
        ${!layer.isBase ? `<button class="layer-tool-btn btn-del" title="Remove Layer" onclick="removeActiveLayer('${escapeHtml(layer.id)}', event)">✕</button>` : ''}
      </div>
    `;

    setupLayerDragEvents(itemEl, layer.id);
    listEl.appendChild(itemEl);
  });
}

// Drag & Drop event wiring for active layer cards
function setupLayerDragEvents(el, layerId) {
  el.addEventListener('dragstart', (e) => {
    draggedLayerId = layerId;
    el.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layerId);
  });

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (!draggedLayerId || draggedLayerId === layerId) return;

    const fromIdx = activeLayers.findIndex((l) => l.id === draggedLayerId);
    const toIdx = activeLayers.findIndex((l) => l.id === layerId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = activeLayers.splice(fromIdx, 1);
      activeLayers.splice(toIdx, 0, moved);
      renderActiveLayersControl();
      showToast(`Reordered layer: ${moved.name}`);
    }
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('is-dragging');
    document.querySelectorAll('.active-layer-item').forEach((item) => item.classList.remove('drag-over'));
    draggedLayerId = null;
  });
}

// Move active layer up or down
window.moveActiveLayer = function(layerId, delta, event) {
  if (event) event.stopPropagation();
  const idx = activeLayers.findIndex((l) => l.id === layerId);
  if (idx === -1) return;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= activeLayers.length) return;

  const [moved] = activeLayers.splice(idx, 1);
  activeLayers.splice(targetIdx, 0, moved);
  renderActiveLayersControl();
};

// Toggle visibility of a specific active layer
window.toggleActiveLayerVisibility = function(layerId, event) {
  if (event) event.stopPropagation();
  const layer = activeLayers.find((l) => l.id === layerId);
  if (!layer) return;

  layer.visible = !layer.visible;

  if (layer.type === 'location') {
    renderMarkers();
  } else if (layer.type === 'region') {
    updateRegionsFilter();
  } else if (layer.type === 'book') {
    refreshBookLayers();
  } else if (layer.type === 'base_sites') {
    renderMarkers();
  } else if (layer.type === 'base_regions') {
    updateRegionsFilter();
  }

  renderActiveLayersControl();
  showToast(`${layer.visible ? '👁️ Shown' : '🕶️ Hidden'}: ${layer.name}`);
};

// Remove layer from active list
window.removeActiveLayer = function(layerId, event) {
  if (event) event.stopPropagation();
  const layer = activeLayers.find((l) => l.id === layerId);
  if (!layer || layer.isBase) return;

  if (layer.type === 'location') {
    pinnedSiteIds.delete(layer.refId);
    try {
      localStorage.setItem('biblestudy_map_crafter_pinned', JSON.stringify([...pinnedSiteIds]));
    } catch (_) {}
    renderMarkers();
  } else if (layer.type === 'region') {
    selectedRegions.delete(layer.refId);
    updateRegionsFilter();
  } else if (layer.type === 'book') {
    activeBooks.delete(layer.refId);
    removeBookKmlFromMap(layer.refId);
  }

  syncActiveLayersFromState();
  renderActiveLayersControl();
  refreshSearchMatchesIfOpen();
  showToast(`Removed layer: ${layer.name}`);
};

// Fly camera to the geographic extent of a layer
window.flyToLayer = function(layerId) {
  const layer = activeLayers.find((l) => l.id === layerId);
  if (!layer) return;

  if (layer.type === 'location') {
    const feat = sitesGeoJSON?.features?.find((f) => f.properties.id === layer.refId);
    if (feat && map) {
      const [lng, lat] = feat.geometry.coordinates;
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 11), pitch: 35, duration: 1000 });
      openPopupForFeature(feat);
    }
  } else if (layer.type === 'region') {
    flyToRegion(layer.refId);
  } else if (layer.type === 'book') {
    flyToBook(layer.refId);
  } else if (layer.type === 'base_sites' || layer.type === 'base_regions') {
    map.flyTo({ center: LEVANT_CENTER, zoom: DEFAULT_ZOOM, pitch: 30, duration: 1000 });
  }
};

// Fit view to bounds of all currently active layers
function fitActiveLayersView() {
  if (!map) return;
  const coords = [];

  // Pinned Sites
  pinnedSiteIds.forEach((id) => {
    const f = sitesGeoJSON?.features?.find((site) => site.properties.id === id);
    if (f && f.geometry && f.geometry.coordinates) {
      coords.push(f.geometry.coordinates);
    }
  });

  // Selected Regions
  if (regionsGeoJSON) {
    regionsGeoJSON.features.forEach((f) => {
      if (selectedRegions.has(f.properties.name)) {
        if (f.geometry.type === 'Polygon') {
          f.geometry.coordinates[0]?.forEach((c) => coords.push(c));
        } else if (f.geometry.type === 'MultiPolygon') {
          f.geometry.coordinates.forEach((poly) => poly[0]?.forEach((c) => coords.push(c)));
        }
      }
    });
  }

  // Active Books
  Object.values(activeBookGeoJSONs).forEach((gj) => {
    gj?.features?.forEach((f) => {
      if (f.geometry.type === 'Point') coords.push(f.geometry.coordinates);
      else if (f.geometry.type === 'LineString') f.geometry.coordinates?.forEach((c) => coords.push(c));
      else if (f.geometry.type === 'Polygon') f.geometry.coordinates[0]?.forEach((c) => coords.push(c));
    });
  });

  if (coords.length > 0) {
    const bounds = coords.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: 50, maxZoom: 11, duration: 1100 });
    showToast('📍 Fitted view to all active layers');
  } else {
    map.flyTo({ center: LEVANT_CENTER, zoom: DEFAULT_ZOOM, pitch: 30, duration: 1000 });
    showToast('📍 Centered on Holy Land view');
  }
}

// Clear all custom added layers
function clearAllActiveLayers() {
  pinnedSiteIds.clear();
  selectedRegions.clear();
  activeBooks.clear();
  activeBookGeoJSONs = {};
  refreshBookLayers();
  currentRegionsOverlay = 'none';
  const regSelect = document.getElementById('select-regions-overlay');
  if (regSelect) regSelect.value = 'none';
  updateRegionsFilter();

  try {
    localStorage.removeItem('biblestudy_map_crafter_pinned');
  } catch (_) {}

  renderMarkers();
  syncActiveLayersFromState();
  renderActiveLayersControl();
  refreshSearchMatchesIfOpen();
  showToast('Reset active map to default major sites view');
}

// Universal Toggle Item on Map: Location, Region, or Book
window.toggleMapItem = function(type, id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (type === 'location') {
    const isPinned = pinnedSiteIds.has(id);
    const feature = sitesGeoJSON?.features?.find((f) => f.properties.id === id);
    const name = feature?.properties?.name || 'Site';
    if (isPinned) {
      pinnedSiteIds.delete(id);
      showToast(`Removed ${name} from active map`);
    } else {
      pinnedSiteIds.add(id);
      showToast(`📌 Added ${name} to active map!`);
      if (feature && map) {
        const [lng, lat] = feature.geometry.coordinates;
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 11), duration: 1000 });
        openPopupForFeature(feature);
      }
    }
    try {
      localStorage.setItem('biblestudy_map_crafter_pinned', JSON.stringify([...pinnedSiteIds]));
    } catch (_) {}
    renderMarkers();
  } else if (type === 'region') {
    const isOn = selectedRegions.has(id);
    if (isOn) {
      selectedRegions.delete(id);
      showToast(`Removed ${id} boundary from active map`);
    } else {
      selectedRegions.add(id);
      showToast(`🗺️ Added ${id} regional territory to active map!`);
      flyToRegion(id);
    }
    updateRegionsFilter();
  } else if (type === 'book') {
    const isOn = activeBooks.has(id);
    const book = BIBLICAL_BOOKS.find((b) => b.code === id);
    const bookName = book?.name || id.toUpperCase();
    if (isOn) {
      activeBooks.delete(id);
      removeBookKmlFromMap(id);
      showToast(`Removed Book of ${bookName} overlay`);
    } else {
      activeBooks.add(id);
      loadAndOverlayBookKml(id);
      showToast(`📖 Added Book of ${bookName} (KML) to active map!`);
    }
  }

  syncActiveLayersFromState();
  renderActiveLayersControl();
  refreshSearchMatchesIfOpen();
};

// Book KML Overlay Loader & Layer Manager
async function loadAndOverlayBookKml(bookCode) {
  try {
    const resp = await fetch(`data/kml/${bookCode}.kml`);
    if (!resp.ok) return;
    const text = await resp.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    if (!window.toGeoJSON) return;
    const geojson = window.toGeoJSON.kml(dom);

    activeBookGeoJSONs[bookCode] = geojson;
    refreshBookLayers();

    // Fit map bounds to book
    const coords = [];
    geojson.features.forEach((f) => {
      if (f.geometry.type === 'Point') {
        coords.push(f.geometry.coordinates);
      } else if (f.geometry.type === 'LineString') {
        f.geometry.coordinates.forEach((c) => coords.push(c));
      } else if (f.geometry.type === 'Polygon') {
        if (f.geometry.coordinates[0]) f.geometry.coordinates[0].forEach((c) => coords.push(c));
      }
    });

    if (coords.length > 0 && map) {
      const bounds = coords.reduce(
        (b, coord) => b.extend(coord),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 45, maxZoom: 10, duration: 1200 });
    }
  } catch (err) {
    console.warn('Error loading book KML:', err);
  }
}

function removeBookKmlFromMap(bookCode) {
  delete activeBookGeoJSONs[bookCode];
  refreshBookLayers();
}

function refreshBookLayers() {
  if (!map) return;
  const allFeatures = [];
  Object.entries(activeBookGeoJSONs).forEach(([code, gj]) => {
    const layer = activeLayers.find((l) => l.id === `book:${code}`);
    if (layer && !layer.visible) return;
    if (gj && gj.features) allFeatures.push(...gj.features);
  });
  const combined = { type: 'FeatureCollection', features: allFeatures };

  if (map.getSource('active-books-source')) {
    map.getSource('active-books-source').setData(combined);
  } else {
    map.addSource('active-books-source', {
      type: 'geojson',
      data: combined,
    });

    if (!map.getLayer('active-books-lines')) {
      map.addLayer({
        id: 'active-books-lines',
        type: 'line',
        source: 'active-books-source',
        filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'MultiLineString']],
        paint: {
          'line-color': '#dc2626',
          'line-width': 2.6,
          'line-dasharray': [3, 2],
          'line-opacity': 0.88,
        },
      });
    }

    if (!map.getLayer('active-books-fill')) {
      map.addLayer(
        {
          id: 'active-books-fill',
          type: 'fill',
          source: 'active-books-source',
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': '#d97706',
            'fill-opacity': 0.12,
          },
        },
        'ancient-water-shelf'
      );
    }
  }
}

// Camera Helper: Fit view to Region boundary
function flyToRegion(regionName) {
  if (!regionsGeoJSON || !map) return;
  const feature = regionsGeoJSON.features.find((f) => f.properties.name === regionName);
  if (!feature) return;

  const coords = [];
  if (feature.geometry.type === 'Polygon') {
    feature.geometry.coordinates[0].forEach((c) => coords.push(c));
  } else if (feature.geometry.type === 'MultiPolygon') {
    feature.geometry.coordinates.forEach((poly) => poly[0].forEach((c) => coords.push(c)));
  }

  if (coords.length > 0) {
    const bounds = coords.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: 45, maxZoom: 8.5, duration: 1100 });
  }
}

// Camera Helper: Fit view to Book
function flyToBook(bookCode) {
  if (activeBookGeoJSONs[bookCode]) {
    const geojson = activeBookGeoJSONs[bookCode];
    const coords = [];
    geojson.features.forEach((f) => {
      if (f.geometry.type === 'Point') coords.push(f.geometry.coordinates);
      else if (f.geometry.type === 'LineString') f.geometry.coordinates.forEach((c) => coords.push(c));
    });
    if (coords.length > 0 && map) {
      const bounds = coords.reduce(
        (b, coord) => b.extend(coord),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 45, maxZoom: 10, duration: 1100 });
    }
  } else {
    loadAndOverlayBookKml(bookCode);
  }
}

// ==============================================================================
// REAL-TIME SEARCH & DISCOVERY ENGINE (Popdown Search Matches Panel)
// ==============================================================================

function handleLibrarySearchInput(query) {
  librarySearchQuery = (query || '').trim();
  const clearBtn = document.getElementById('btn-clear-search');
  if (clearBtn) {
    clearBtn.style.display = librarySearchQuery.length > 0 ? 'block' : 'none';
  }

  if (librarySearchQuery.length === 0) {
    closeLibrarySearchResults();
    return;
  }

  const matches = searchLibrary(librarySearchQuery);
  renderLibrarySearchResults(matches, librarySearchQuery);
}

function searchLibrary(q) {
  const query = q.toLowerCase();
  const results = [];

  // 1. Search Sites
  if ((activeLibraryScope === 'all' || activeLibraryScope === 'locations') && sitesGeoJSON) {
    sitesGeoJSON.features.forEach((f) => {
      const p = f.properties;
      if (
        p.name.toLowerCase().includes(query) ||
        (p.ancient_name && p.ancient_name.toLowerCase().includes(query)) ||
        (p.modern_name && p.modern_name.toLowerCase().includes(query)) ||
        (p.modern_country && p.modern_country.toLowerCase().includes(query)) ||
        (p.biblical_region && p.biblical_region.toLowerCase().includes(query)) ||
        (p.verses_summary && p.verses_summary.toLowerCase().includes(query))
      ) {
        results.push({
          type: 'location',
          id: p.id,
          name: p.name,
          tier: p.tier || 3,
          is_top_10: p.is_top_10,
          sub: `${p.biblical_region || p.modern_country || 'Levant'} • ${p.verse_count || 1} verses`,
          feature: f,
        });
      }
    });
  }

  // 2. Search Regions
  if (activeLibraryScope === 'all' || activeLibraryScope === 'regions') {
    Object.entries(BIBLICAL_REGIONS_META).forEach(([name, meta]) => {
      if (name.toLowerCase().includes(query) || meta.category.toLowerCase().includes(query) || meta.desc.toLowerCase().includes(query)) {
        results.push({
          type: 'region',
          id: name,
          name,
          sub: `${meta.category} • ${meta.desc}`,
        });
      }
    });
  }

  // 3. Search Books
  if (activeLibraryScope === 'all' || activeLibraryScope === 'books') {
    BIBLICAL_BOOKS.forEach((b) => {
      if (b.name.toLowerCase().includes(query) || b.category.toLowerCase().includes(query) || b.desc.toLowerCase().includes(query)) {
        results.push({
          type: 'book',
          id: b.code,
          name: `Book of ${b.name}`,
          sub: `${b.testament} ${b.category} • ${b.desc}`,
        });
      }
    });
  }

  return results;
}

function renderLibrarySearchResults(matches, query) {
  const box = document.getElementById('library-search-results-box');
  const list = document.getElementById('library-search-results-list');
  const countText = document.getElementById('search-results-count-text');
  if (!box || !list) return;

  box.style.display = 'flex';
  if (countText) {
    countText.textContent = `${matches.length} matches for "${query}"`;
  }

  list.innerHTML = '';

  if (matches.length === 0) {
    list.innerHTML = `
      <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.75rem;">
        No biblical sites, regions, or books found matching "${escapeHtml(query)}".
      </div>
    `;
    return;
  }

  // Render top 40 matching cards
  matches.slice(0, 40).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'library-item-row';
    row.setAttribute('data-id', item.id);
    row.setAttribute('data-type', item.type);

    let isOnMap = false;
    let icon = '📍';
    let iconClass = 'site';
    let badgeText = 'SITE';
    let badgeClass = 'badge-site';

    if (item.type === 'location') {
      isOnMap = pinnedSiteIds.has(item.id);
      icon = '📍';
      iconClass = 'site';
      if (item.is_top_10 || item.tier === 1) {
        badgeText = 'MAJOR';
        badgeClass = 'badge-major';
      } else if (item.tier === 2) {
        badgeText = 'REGIONAL';
        badgeClass = 'badge-site';
      } else {
        badgeText = 'SITE';
        badgeClass = 'badge-site';
      }
    } else if (item.type === 'region') {
      isOnMap = selectedRegions.has(item.id);
      icon = '🗺️';
      iconClass = 'region';
      badgeText = 'REGION';
      badgeClass = 'badge-region';
    } else if (item.type === 'book') {
      isOnMap = activeBooks.has(item.id);
      icon = '📖';
      iconClass = 'book';
      badgeText = 'BOOK';
      badgeClass = 'badge-book';
    }

    if (isOnMap) row.classList.add('is-on-map');

    row.innerHTML = `
      <div class="item-icon-col ${iconClass}">
        <span>${icon}</span>
      </div>
      <div class="item-info-col">
        <div class="item-name-row">
          <span class="item-primary-name">${escapeHtml(item.name)}</span>
          <span class="item-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="item-sub-desc">${escapeHtml(item.sub)}</div>
      </div>
      <div class="item-action-col">
        <button type="button" class="btn-item-action ${isOnMap ? 'is-on-map' : ''}" onclick="toggleMapItem('${item.type}', '${escapeHtml(item.id)}', event)" title="${isOnMap ? 'Remove from active map' : 'Add to active map'}">
          ${isOnMap ? '✓ Added' : '➕ Add'}
        </button>
      </div>
    `;

    row.addEventListener('click', () => {
      document.querySelectorAll('.library-item-row').forEach((r) => r.classList.remove('active'));
      row.classList.add('active');

      if (item.type === 'location' && item.feature) {
        const [lng, lat] = item.feature.geometry.coordinates;
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 11), pitch: 35, duration: 1000 });
        openPopupForFeature(item.feature);
      } else if (item.type === 'region') {
        flyToRegion(item.id);
      } else if (item.type === 'book') {
        flyToBook(item.id);
      }
    });

    list.appendChild(row);
  });
}

function refreshSearchMatchesIfOpen() {
  const box = document.getElementById('library-search-results-box');
  if (box && box.style.display !== 'none' && librarySearchQuery.length > 0) {
    const matches = searchLibrary(librarySearchQuery);
    renderLibrarySearchResults(matches, librarySearchQuery);
  }
}

function closeLibrarySearchResults() {
  const box = document.getElementById('library-search-results-box');
  if (box) box.style.display = 'none';
}

function clearLibrarySearch() {
  librarySearchQuery = '';
  const input = document.getElementById('library-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('btn-clear-search');
  if (clearBtn) clearBtn.style.display = 'none';
  closeLibrarySearchResults();
}

// Instant Add selected group or item from Contextual Dropdown
function addFromContextSelection() {
  const sel = document.getElementById('select-library-context');
  if (!sel) return;
  const val = sel.value;

  if (val.startsWith('book:')) {
    const code = val.replace('book:', '');
    toggleMapItem('book', code);
  } else if (val.startsWith('region:')) {
    const rName = val.replace('region:', '');
    toggleMapItem('region', rName);
  } else if (val === 'all_regions') {
    currentRegionsOverlay = 'all';
    const regSelect = document.getElementById('select-regions-overlay');
    if (regSelect) regSelect.value = 'all';
    updateRegionsFilter();
    syncActiveLayersFromState();
    renderActiveLayersControl();
    showToast('🗺️ Added all 36 Historical Biblical Regions to map!');
  } else if (val === 'default' || val === 'all_major_sites' || val === 'major_only') {
    const majorFeatures = sitesGeoJSON?.features?.filter((f) => f.properties.is_top_10 || f.properties.tier === 1) || [];
    majorFeatures.slice(0, 10).forEach((f) => pinnedSiteIds.add(f.properties.id));
    try {
      localStorage.setItem('biblestudy_map_crafter_pinned', JSON.stringify([...pinnedSiteIds]));
    } catch (_) {}
    renderMarkers();
    syncActiveLayersFromState();
    renderActiveLayersControl();
    showToast('⭐ Pinned Top 10 Major Biblical Centers to map!');
  } else if (val === 'galilee') {
    ['capernaum', 'nazareth', 'cana', 'tiberias', 'bethsaida', 'chorazin', 'magdala'].forEach((slug) => {
      const f = sitesGeoJSON?.features?.find((site) => site.properties.id.includes(slug));
      if (f) pinnedSiteIds.add(f.properties.id);
    });
    renderMarkers();
    syncActiveLayersFromState();
    renderActiveLayersControl();
    showToast('🌊 Added Galilee & Northern Ministry Sites to map!');
  } else if (val === 'judea') {
    ['jerusalem', 'bethlehem', 'jericho', 'bethany', 'hebron', 'emmaus'].forEach((slug) => {
      const f = sitesGeoJSON?.features?.find((site) => site.properties.id.includes(slug));
      if (f) pinnedSiteIds.add(f.properties.id);
    });
    renderMarkers();
    syncActiveLayersFromState();
    renderActiveLayersControl();
    showToast('🏛️ Added Judea & Jerusalem Sites to map!');
  } else if (val === 'gospels_acts') {
    ['matt', 'mark', 'luke', 'john', 'acts'].forEach((code) => {
      activeBooks.add(code);
      loadAndOverlayBookKml(code);
    });
    syncActiveLayersFromState();
    renderActiveLayersControl();
    showToast('📖 Added Gospels & Acts (5 Books) to map!');
  } else {
    showToast(`Added: ${sel.options[sel.selectedIndex]?.text || val}`);
  }
}

// ==============================================================================
// 9b. GIS ATTRIBUTE TABLE INSPECTOR & SCHOLARLY METADATA DOSSIER MODALS
// ==============================================================================

let currentAttributesData = null;
let currentAttributesLayerName = 'attributes';

// Open GIS Attributes Table Modal (Spreadsheet Data Inspector)
window.openAttributesModal = function(layerId, event) {
  if (event) event.stopPropagation();

  const layer = activeLayers.find((l) => l.id === layerId) || { id: layerId, name: layerId, type: 'unknown' };
  currentAttributesLayer = layer;
  currentAttributesLayerName = (layer.name || 'layer').toLowerCase().replace(/\s+/g, '_');

  const modal = document.getElementById('modal-attributes-table');
  const title = document.getElementById('attr-modal-title');
  const subtitle = document.getElementById('attr-modal-subtitle');
  const tbody = document.getElementById('attributes-table-body');

  if (title) title.textContent = `Attributes: ${layer.name}`;
  if (subtitle) subtitle.textContent = `GIS Coordinates, Biblical References & Scholarly Attributes (${layer.badgeText || 'LAYER'})`;

  const attrRows = [];
  const attrDict = {};

  function addAttr(key, val) {
    if (val === null || val === undefined || val === '') return;
    attrDict[key] = val;
    attrRows.push(`
      <tr>
        <td class="attr-key-cell">${escapeHtml(key.replace(/[_-]/g, ' '))}</td>
        <td>${escapeHtml(String(val))}</td>
      </tr>
    `);
  }

  // 1. Site Feature Attributes
  if (layer.type === 'location') {
    const feat = sitesGeoJSON?.features?.find((f) => f.properties.id === layer.refId) || layer.feature;
    if (feat) {
      const p = feat.properties;
      addAttr('Site Identifier', p.id);
      addAttr('Primary Name', p.name);
      addAttr('Ancient Name', p.ancient_name);
      addAttr('Modern Name', p.modern_name);
      addAttr('Modern Country', p.modern_country);
      addAttr('Biblical Region', p.biblical_region);
      addAttr('Historical Era', p.period);
      if (feat.geometry && feat.geometry.coordinates) {
        addAttr('Latitude', `${feat.geometry.coordinates[1].toFixed(5)}° N`);
        addAttr('Longitude', `${feat.geometry.coordinates[0].toFixed(5)}° E`);
        addAttr('Geometry Type', feat.geometry.type);
      }
      if (p.elevation_m !== undefined && p.elevation_m !== null) {
        addAttr('Elevation', `${p.elevation_m} m (${Math.round(p.elevation_m * 3.28084)} ft)`);
      }
      addAttr('Priority Tier', `Tier ${p.tier || 3} (${p.tier_name || 'Standard'})`);
      addAttr('Min Visibility Zoom', p.min_zoom !== undefined ? p.min_zoom : 'Default');
      addAttr('Total Verse Citations', p.verse_count || 1);
      addAttr('Scripture Verses', p.verses_summary);
      addAttr('Scholarly Sources Cited', p.scholarly_sources_count || (p.scholarly_sources ? p.scholarly_sources.length : 0));
      if (p.translation_variants && p.translation_variants.length > 0) {
        addAttr('Translation Variants', p.translation_variants.join(', '));
      }
      if (p.authorities && Object.keys(p.authorities).length > 0) {
        addAttr('Academic Authorities', Object.keys(p.authorities).join(', '));
      }
      addAttr('Photo Credit', p.photo_credit);
      addAttr('Photo License', p.photo_license);
      addAttr('Historical Description', p.description);
    }
  }
  // 2. Regional Boundary Attributes
  else if (layer.type === 'region') {
    const meta = BIBLICAL_REGIONS_META[layer.refId] || {};
    const feat = regionsGeoJSON?.features?.find((f) => f.properties.name === layer.refId);
    addAttr('Region Name', layer.refId);
    addAttr('Classification', meta.category || 'Biblical Realm');
    addAttr('Historical Scope', meta.desc);
    if (feat) {
      addAttr('Geometry Type', feat.geometry?.type || 'Polygon');
      if (feat.properties?.fill_color) addAttr('Cartographic Fill', feat.properties.fill_color);
      if (feat.geometry?.coordinates) {
        const count = feat.geometry.type === 'MultiPolygon' ? feat.geometry.coordinates.length : 1;
        addAttr('Boundary Polygons', count);
      }
    }
  }
  // 3. Biblical Book Overlay Attributes
  else if (layer.type === 'book') {
    const book = BIBLICAL_BOOKS.find((b) => b.code === layer.refId);
    const gj = activeBookGeoJSONs[layer.refId];
    addAttr('Book Name', book?.name || layer.refId);
    addAttr('Testament', book?.testament || 'Biblical');
    addAttr('Category', book?.category || 'Scripture');
    addAttr('Summary', book?.desc);
    if (gj && gj.features) {
      addAttr('OpenBible KML Features', gj.features.length);
      const points = gj.features.filter((f) => f.geometry.type === 'Point').length;
      const lines = gj.features.filter((f) => f.geometry.type.includes('Line')).length;
      const polys = gj.features.filter((f) => f.geometry.type.includes('Polygon')).length;
      addAttr('KML Breakdown', `${points} sites, ${lines} route paths, ${polys} territories`);
    }
  }
  // 4. Base Sites Gazetteer
  else if (layer.type === 'base_sites') {
    addAttr('Layer Title', 'Master Biblical Sites Gazetteer');
    addAttr('Total Ingested Sites', sitesGeoJSON?.features?.length || 1342);
    addAttr('Authority Source', 'OpenBible.info Comprehensive Geocoding Dataset');
    addAttr('Zoom Culling Architecture', '5-Tier Priority Matrix (World Hubs to Villages)');
    addAttr('Coordinate Reference', 'WGS 84 (EPSG:4326)');
  }
  // 5. Base Regions Layer
  else if (layer.type === 'base_regions') {
    addAttr('Layer Title', 'Master Biblical Historical Regions');
    addAttr('Total Regions & Kingdoms', 36);
    addAttr('Coverage', 'Levant, Sinai, Mesopotamia, Anatolia, Greece, Rome');
    addAttr('Authority Source', 'OpenBible.info Regional Boundaries & Polygons');
  }

  currentAttributesData = attrDict;

  if (tbody) {
    tbody.innerHTML = attrRows.length > 0 ? attrRows.join('') : '<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">No attributes available for this layer.</td></tr>';
  }

  if (modal) modal.classList.add('open');
};

window.closeAttributesModal = function() {
  document.getElementById('modal-attributes-table')?.classList.remove('open');
};

// Copy layer attributes as formatted JSON
function copyAttributesJson() {
  if (!currentAttributesData) return;
  const jsonStr = JSON.stringify(currentAttributesData, null, 2);
  navigator.clipboard.writeText(jsonStr).then(() => {
    showToast('📋 Copied layer attributes JSON to clipboard!');
  }).catch(() => {
    showToast('⚠️ Could not access clipboard');
  });
}

// Export layer attributes as CSV spreadsheet
function exportAttributesCsv() {
  if (!currentAttributesData) return;
  const rows = [['Attribute', 'Value']];
  for (const [k, v] of Object.entries(currentAttributesData)) {
    const cleanKey = `"${String(k).replace(/"/g, '""')}"`;
    const cleanVal = `"${String(v).replace(/"/g, '""')}"`;
    rows.push([cleanKey, cleanVal]);
  }
  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${currentAttributesLayerName}_attributes.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`📥 Exported ${currentAttributesLayerName}_attributes.csv`);
}

// Open Scholarly Metadata & Academic Dossier Modal
window.openMetadataModal = function(layerId, event) {
  if (event) event.stopPropagation();

  const layer = activeLayers.find((l) => l.id === layerId) || { id: layerId, name: layerId, type: 'unknown' };
  const modal = document.getElementById('modal-layer-metadata');
  const title = document.getElementById('meta-modal-title');
  const body = document.getElementById('meta-modal-body');

  if (title) title.textContent = `Dossier: ${layer.name}`;
  if (!body) return;

  // 1. Site Metadata Dossier
  if (layer.type === 'location') {
    const feat = sitesGeoJSON?.features?.find((f) => f.properties.id === layer.refId) || layer.feature;
    if (!feat) {
      body.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">No dossier data found.</div>`;
      if (modal) modal.classList.add('open');
      return;
    }

    const p = feat.properties;
    const sources = Array.isArray(p.scholarly_sources) ? p.scholarly_sources : [];
    const authorities = p.authorities || {};
    const trans = Array.isArray(p.translation_variants) ? p.translation_variants : [];
    const photos = Array.isArray(p.photos) && p.photos.length > 0 ? p.photos : (p.photo_url ? [{
      thumb_url: p.photo_url,
      full_url: p.photo_url,
      credit: p.photo_credit,
      credit_url: p.photo_credit_url,
      license: p.photo_license,
      caption: p.photo_caption
    }] : []);

    let html = `
      <!-- Hero Header -->
      <div class="meta-hero-header">
        <div class="meta-hero-icon">📍</div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 style="margin: 0; font-size: 1.15rem; font-family: var(--font-serif);">${escapeHtml(p.name)}</h3>
            <span class="item-badge ${p.is_top_10 || p.tier === 1 ? 'badge-major' : 'badge-site'}">${p.is_top_10 || p.tier === 1 ? 'MAJOR CENTER' : 'BIBLICAL SITE'}</span>
          </div>
          <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 3px;">
            ${p.ancient_name && p.ancient_name !== p.name ? `Ancient: <em>${escapeHtml(p.ancient_name)}</em> &bull; ` : ''}
            Modern: <strong>${escapeHtml(p.modern_name || p.name)}</strong> (${escapeHtml(p.modern_country || 'Levant')})
            ${p.elevation_m !== undefined && p.elevation_m !== null ? ` &bull; ⛰️ ${p.elevation_m}m` : ''}
          </div>
        </div>
      </div>
    `;

    // Section: Historical Overview & Description
    if (p.description) {
      html += `
        <div class="meta-section-box">
          <div class="meta-section-title">🏛️ Historical & Archaeological Overview</div>
          <div style="font-size: 0.82rem; line-height: 1.5; color: #cbd5e1;">${escapeHtml(p.description)}</div>
        </div>
      `;
    }

    // Section: Scripture References
    if (p.verses_summary) {
      html += `
        <div class="meta-section-box">
          <div class="meta-section-title">📖 Biblical Scriptures (${p.verse_count || 1} Occurrences)</div>
          <div style="font-size: 0.80rem; line-height: 1.5; color: #f1f5f9; font-style: italic;">
            "${escapeHtml(p.verses_summary)}"
          </div>
        </div>
      `;
    }

    // Section: Scholarly Bibliographic Sources
    html += `
      <div class="meta-section-box">
        <div class="meta-section-title">📚 Scholarly Archaeological Identifications (${sources.length} Cited Sources)</div>
        ${sources.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
            ${sources.map((s) => `
              <div style="padding: 6px 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; font-size: 0.76rem;">
                <div style="font-weight: 600; color: #fff;">
                  ${s.url ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" style="color: var(--ancient-gold); text-decoration: none;">📖 ${escapeHtml(s.title || 'Scholarly Reference')} ↗</a>` : `📖 ${escapeHtml(s.title || 'Scholarly Reference')}`}
                </div>
                <div style="font-size: 0.70rem; color: var(--text-muted); margin-top: 2px;">
                  ${s.year ? `Published ${s.year}` : ''} ${s.page ? `&bull; Page ${s.page}` : ''} ${s.type ? `&bull; Type: ${s.type}` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size: 0.76rem; color: var(--text-muted); font-style: italic;">Standard biblical identification verified by OpenBible Geocoding Project.</div>
        `}
      </div>
    `;

    // Section: Academic Authorities & Linked Data
    const authKeys = Object.keys(authorities);
    if (authKeys.length > 0) {
      html += `
        <div class="meta-section-box">
          <div class="meta-section-title">🏛️ Academic Authorities & Linked Data</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
            ${authorities.pleiades ? `<a href="${authorities.pleiades}" target="_blank" rel="noopener noreferrer" class="btn-pill" style="font-size: 0.72rem; text-decoration: none;">🏛️ Pleiades Gazetteer ↗</a>` : ''}
            ${authorities.dare ? `<a href="${authorities.dare}" target="_blank" rel="noopener noreferrer" class="btn-pill" style="font-size: 0.72rem; text-decoration: none;">🏛️ DARE Roman Atlas ↗</a>` : ''}
            ${authorities.wikidata ? `<a href="${authorities.wikidata}" target="_blank" rel="noopener noreferrer" class="btn-pill" style="font-size: 0.72rem; text-decoration: none;">🌐 Wikidata ↗</a>` : ''}
            ${authorities.wikipedia ? `<a href="${authorities.wikipedia}" target="_blank" rel="noopener noreferrer" class="btn-pill" style="font-size: 0.72rem; text-decoration: none;">📖 Wikipedia ↗</a>` : ''}
            ${authorities.biblia ? `<a href="${authorities.biblia}" target="_blank" rel="noopener noreferrer" class="btn-pill" style="font-size: 0.72rem; text-decoration: none;">📜 Biblia.com ↗</a>` : ''}
          </div>
        </div>
      `;
    }

    // Section: Translation Variants
    if (trans.length > 0) {
      html += `
        <div class="meta-section-box">
          <div class="meta-section-title">🔤 Translation Name Variants (Across 10 English Translations)</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
            ${trans.map((v) => `<span class="badge-pill" style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px; font-size: 0.74rem;">${escapeHtml(v)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    // Section: Photography Dossier
    if (photos.length > 0) {
      const p1 = photos[0];
      html += `
        <div class="meta-section-box">
          <div class="meta-section-title">📷 Archaeological Photography & Rights Dossier</div>
          <div class="meta-dossier-photo-card" style="margin-top: 4px;">
            <img src="${p1.full_url || p1.thumb_url}" class="meta-dossier-img" alt="${escapeHtml(p.name)}" />
            <div class="meta-dossier-photo-caption">
              <div>${escapeHtml(p1.caption || p.name)}</div>
              <div style="margin-top: 2px;">
                ${p1.credit_url ? `<a href="${p1.credit_url}" target="_blank" rel="noopener noreferrer" style="color: var(--ancient-gold); text-decoration: none;">© ${escapeHtml(p1.credit || 'Wikimedia Commons')}</a>` : `© ${escapeHtml(p1.credit || 'Wikimedia Commons')}`}
                ${p1.license ? `&bull; License: ${p1.license}` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    body.innerHTML = html;
  }
  // 2. Region Metadata Dossier
  else if (layer.type === 'region') {
    const meta = BIBLICAL_REGIONS_META[layer.refId] || {};
    body.innerHTML = `
      <div class="meta-hero-header">
        <div class="meta-hero-icon">🗺️</div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; font-family: var(--font-serif);">${escapeHtml(layer.refId)}</h3>
          <div style="font-size: 0.76rem; color: var(--ancient-gold); font-weight: 600; margin-top: 2px;">${escapeHtml(meta.category || 'Historical Biblical Realm')}</div>
        </div>
      </div>
      <div class="meta-section-box">
        <div class="meta-section-title">📜 Historical Scope & Territorial Description</div>
        <div style="font-size: 0.84rem; line-height: 1.5; color: #cbd5e1;">${escapeHtml(meta.desc || 'Historical biblical region.')}</div>
      </div>
      <div class="meta-section-box">
        <div class="meta-section-title">🗺️ Vector Spatial Geometry</div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">
          Authoritative vector polygon boundary digitized from OpenBible.info historical regional boundary dataset.
        </div>
      </div>
    `;
  }
  // 3. Book Metadata Dossier
  else if (layer.type === 'book') {
    const book = BIBLICAL_BOOKS.find((b) => b.code === layer.refId);
    body.innerHTML = `
      <div class="meta-hero-header">
        <div class="meta-hero-icon">📖</div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; font-family: var(--font-serif);">${escapeHtml(book?.name || layer.refId)}</h3>
          <div style="font-size: 0.76rem; color: var(--ancient-gold); font-weight: 600; margin-top: 2px;">${escapeHtml(book?.testament || '')} ${escapeHtml(book?.category || '')}</div>
        </div>
      </div>
      <div class="meta-section-box">
        <div class="meta-section-title">📜 Biblical Book Summary</div>
        <div style="font-size: 0.84rem; line-height: 1.5; color: #cbd5e1;">${escapeHtml(book?.desc || '')}</div>
      </div>
      <div class="meta-section-box">
        <div class="meta-section-title">🗺️ OpenBible Spatial KML Data</div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">
          Vector routes, locations, and territorial polygon confidence areas compiled from OpenBible Geocoding Project.
        </div>
      </div>
    `;
  }
  // 4. Base Layers Dossier
  else {
    body.innerHTML = `
      <div class="meta-hero-header">
        <div class="meta-hero-icon">🏛️</div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; font-family: var(--font-serif);">${escapeHtml(layer.name)}</h3>
          <div style="font-size: 0.76rem; color: var(--ancient-gold); font-weight: 600; margin-top: 2px;">Master Cartographic Gazetteer</div>
        </div>
      </div>
      <div class="meta-section-box">
        <div class="meta-section-title">📊 Dataset Architecture</div>
        <div style="font-size: 0.80rem; line-height: 1.5; color: #cbd5e1;">
          1,342 authoritative geocoded biblical places and historical territories spanning Israel, Jordan, Egypt, Syria, Lebanon, Turkey, Greece, and Italy.
        </div>
      </div>
    `;
  }

  if (modal) modal.classList.add('open');
};

window.closeMetadataModal = function() {
  document.getElementById('modal-layer-metadata')?.classList.remove('open');
};



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

  // Map Sites Display Mode Selector (Major Only vs Auto-expand at Zoom)
  document.getElementById('select-sites-mode')?.addEventListener('change', (e) => {
    currentSitesDisplayMode = e.target.value;
    renderMarkers();
    showToast(currentSitesDisplayMode === 'major_only' ? '⭐ Map Sites: Major Only' : '🌐 Map Sites: Auto-expand at zoom');
  });

  // Label Density Selector
  document.getElementById('select-label-density')?.addEventListener('change', (e) => {
    currentLabelDensity = e.target.value;
    renderMarkers();
  });

  // Historical Regions & Territories Overlay Selector (Off by default)
  document.getElementById('select-regions-overlay')?.addEventListener('change', (e) => {
    currentRegionsOverlay = e.target.value;
    updateRegionsFilter();
    syncActiveLayersFromState();
    renderActiveLayersControl();
    refreshSearchMatchesIfOpen();
  });

  // Book KML Overlay Selector
  document.getElementById('select-book-kml')?.addEventListener('change', (e) => {
    if (e.target.value) {
      toggleMapItem('book', e.target.value);
    }
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

  // Library Scope Selector Buttons (All, Sites, Books, Regions)
  document.querySelectorAll('#library-scope-bar .scope-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#library-scope-bar .scope-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeLibraryScope = btn.getAttribute('data-scope') || 'all';
      populateLibraryContextDropdown();
      const input = document.getElementById('library-search');
      if (input && input.value.trim().length > 0) {
        handleLibrarySearchInput(input.value);
      }
    });
  });

  // Library Real-time Search Box
  const librarySearchInput = document.getElementById('library-search');
  const libraryClearBtn = document.getElementById('btn-clear-search');

  librarySearchInput?.addEventListener('input', (e) => {
    handleLibrarySearchInput(e.target.value);
  });

  libraryClearBtn?.addEventListener('click', () => {
    clearLibrarySearch();
  });

  // Close Search Results Dropdown Button
  document.getElementById('btn-close-search-results')?.addEventListener('click', () => {
    closeLibrarySearchResults();
  });

  // Contextual Dropdown Change
  document.getElementById('select-library-context')?.addEventListener('change', (e) => {
    libraryContextSelection = e.target.value;
  });

  // Instant Add from Contextual Dropdown
  document.getElementById('btn-add-from-context')?.addEventListener('click', () => {
    addFromContextSelection();
  });

  // Active Layers Control Header Actions
  document.getElementById('btn-fit-active-layers')?.addEventListener('click', () => {
    fitActiveLayersView();
  });

  document.getElementById('btn-clear-all-layers')?.addEventListener('click', () => {
    clearAllActiveLayers();
  });

  // Attributes Modal Toolbar Actions
  document.getElementById('btn-copy-attributes-json')?.addEventListener('click', () => {
    copyAttributesJson();
  });

  document.getElementById('btn-export-attributes-csv')?.addEventListener('click', () => {
    exportAttributesCsv();
  });

  // Add Custom Site Form Submit
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
        tier: 1, // Custom added sites are treated as priority
        is_top_10: true,
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    };

    sitesGeoJSON.features.push(newFeature);
    pinnedSiteIds.add(newFeature.properties.id);
    renderMarkers();
    syncActiveLayersFromState();
    renderActiveLayersControl();
    refreshSearchMatchesIfOpen();
    closeAddSiteModal();
    showToast(`Saved & Added ${name} to map!`);
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
        closeAttributesModal();
        closeMetadataModal();
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

