/**
 * Marine Weather Realtime Dashboard Application
 * Multi-Provider Realtime Integration (NMPNT 항로표지, KMA 기상청 해양부이, KHOA 국립해양조사원)
 */

// State
let allStations = [];
let filteredStations = [];
let selectedStation = null;
let currentNowData = null;
let currentDateRecords = [];
let leafletMap = null;
let markersMap = {}; // mmsi -> Leaflet Marker
let weatherChart = null;
let autoRefreshTimer = null;
let currentProvider = "ALL";
let currentChartMode = "wind"; // 'wind', 'wave', 'temp', 'pressure'

// DOM Elements
const sidebarEl = document.getElementById("sidebar");
const stationListEl = document.getElementById("stationList");
const stationCountEl = document.getElementById("stationCount");
const searchInputEl = document.getElementById("searchInput");
const btnClearSearchEl = document.getElementById("btnClearSearch");
const regionChipsEl = document.getElementById("regionChips");
const lastUpdateTextEl = document.getElementById("lastUpdateText");
const autoRefreshSelectEl = document.getElementById("autoRefreshSelect");
const btnRefreshEl = document.getElementById("btnRefresh");
const btnResetViewEl = document.getElementById("btnResetView");
const btnDownloadCsvEl = document.getElementById("btnDownloadCsv");

// Provider Tabs & Badges
const providerTabsEl = document.getElementById("providerTabs");
const badgeAllEl = document.getElementById("badgeAll");
const badgeKmaEl = document.getElementById("badgeKma");
const badgeKhoaEl = document.getElementById("badgeKhoa");
const badgeNmpntEl = document.getElementById("badgeNmpnt");

// KPI Elements
const kpiTotalStationsEl = document.getElementById("kpiTotalStations");
const kpiWaterTempEl = document.getElementById("kpiWaterTemp");
const kpiWindSpeedEl = document.getElementById("kpiWindSpeed");
const kpiWaveHeightEl = document.getElementById("kpiWaveHeight");
const kpiWaveBuoysEl = document.getElementById("kpiWaveBuoys");

// Detail Panel Elements
const detailProviderEl = document.getElementById("detailProvider");
const detailMmafNmEl = document.getElementById("detailMmafNm");
const detailStationNmEl = document.getElementById("detailStationNm");
const detailMmsiEl = document.getElementById("detailMmsi");
const detailCoordsEl = document.getElementById("detailCoords");
const obsTimeEl = document.getElementById("obsTime");

// Wave Elements
const waveCardEl = document.getElementById("waveCard");
const valWaveHeightEl = document.getElementById("valWaveHeight");
const valWaveMaxEl = document.getElementById("valWaveMax");
const valWavePeriodEl = document.getElementById("valWavePeriod");
const valWaveDrcEl = document.getElementById("valWaveDrc");
const waveLevelBadgeEl = document.getElementById("waveLevelBadge");
const waveNoteEl = document.getElementById("waveNote");

// Compass & Metrics Elements
const compassNeedleEl = document.getElementById("compassNeedle");
const compassDegEl = document.getElementById("compassDeg");
const compassDirTextEl = document.getElementById("compassDirText");
const valWindSpeedEl = document.getElementById("valWindSpeed");
const valBeaufortEl = document.getElementById("valBeaufort");
const valCurrDrcEl = document.getElementById("valCurrDrc");
const valCurrSpeedEl = document.getElementById("valCurrSpeed");

const valWaterTempEl = document.getElementById("valWaterTemp");
const valAirTempEl = document.getElementById("valAirTemp");
const valPressureEl = document.getElementById("valPressure");
const valHumidityEl = document.getElementById("valHumidity");
const valVisibilityEl = document.getElementById("valVisibility");
const valSalinityEl = document.getElementById("valSalinity");
const valSalinityUnitEl = document.getElementById("valSalinityUnit");

// Chart Tabs
const chartTabsEl = document.getElementById("chartTabs");

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  initChart();
  initEventListeners();
  await loadStations();

  // Setup initial refresh timer
  setupAutoRefresh();
});

// ==========================================================================
// Map Initialization (Leaflet)
// ==========================================================================
function initMap() {
  leafletMap = L.map("map", {
    center: [35.6, 127.8],
    zoom: 7,
    zoomControl: false,
    attributionControl: false
  });

  L.control.zoom({ position: "topright" }).addTo(leafletMap);

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16,
    attribution: "Esri, USGS, NOAA"
  }).addTo(leafletMap);
}

function resetMapView() {
  if (leafletMap) {
    leafletMap.flyTo([35.6, 127.8], 7, { duration: 1.2 });
  }
}

// ==========================================================================
// Load Stations Data
// ==========================================================================
async function loadStations() {
  try {
    const res = await fetch("/api/stations");
    const data = await res.json();
    if (data.status === "OK") {
      allStations = data.stations;
      filteredStations = [...allStations];

      // Update Badges & KPIs
      const kmaCount = allStations.filter(s => s.provider === "KMA").length;
      const khoaCount = allStations.filter(s => s.provider === "KHOA").length;
      const nmpntCount = allStations.filter(s => s.provider === "NMPNT").length;
      const waveCount = allStations.filter(s => s.sensors && s.sensors.wave).length;

      if (kpiTotalStationsEl) kpiTotalStationsEl.textContent = allStations.length;
      if (kpiWaveBuoysEl) kpiWaveBuoysEl.textContent = waveCount;
      if (stationCountEl) stationCountEl.textContent = allStations.length;

      if (badgeAllEl) badgeAllEl.textContent = allStations.length;
      if (badgeKmaEl) badgeKmaEl.textContent = kmaCount;
      if (badgeKhoaEl) badgeKhoaEl.textContent = khoaCount;
      if (badgeNmpntEl) badgeNmpntEl.textContent = nmpntCount;

      renderStationMarkers();
      renderStationList();

      // Default selection: 기상청 덕적도부이 (22101) or first station with wave sensor
      const defaultStation = allStations.find(s => s.mmsi === "22101") || allStations.find(s => s.sensors && s.sensors.wave) || allStations[0];
      if (defaultStation) {
        selectStation(defaultStation);
      }
    }
  } catch (err) {
    console.error("Failed to load stations:", err);
    stationListEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i> 관측소 목록 로드 실패</div>`;
  }
}

// ==========================================================================
// Map Markers
// ==========================================================================
function renderStationMarkers() {
  // Clear existing markers
  Object.values(markersMap).forEach(m => leafletMap.removeLayer(m));
  markersMap = {};

  filteredStations.forEach(st => {
    let markerClass = "custom-marker";
    if (st.provider === "KMA") markerClass += " marker-kma";
    else if (st.provider === "KHOA") markerClass += " marker-khoa";

    const icon = L.divIcon({
      className: markerClass,
      html: `
        <div class="marker-pulse"></div>
        <div class="marker-inner"></div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([st.latitude, st.longitude], { icon: icon }).addTo(leafletMap);

    const providerLabel = st.provider === "KMA" ? "기상청 해양기상부이" : (st.provider === "KHOA" ? "국립해양조사원" : "항로표지");
    const waveBadge = st.sensors && st.sensors.wave ? `<span style="color:#00d2ff;font-weight:700;"><i class="fa-solid fa-water"></i> 파고 실시간 관측</span>` : `<span style="color:#94a3b8;">파고 미지원</span>`;

    // Popup content
    const popupContent = `
      <div class="popup-title">${st.stationNm}</div>
      <div class="popup-meta"><strong>${providerLabel}</strong> (${st.mmafNm}) | 코드: ${st.mmsi}</div>
      <div class="popup-meta">${waveBadge}</div>
      <div class="popup-meta">위치: ${st.latitude.toFixed(4)}, ${st.longitude.toFixed(4)}</div>
      <button class="popup-btn" onclick="window.selectStationByMmsi('${st.mmsi}')">
        <i class="fa-solid fa-chart-simple"></i> 실시간 관측 상세
      </button>
    `;
    marker.bindPopup(popupContent);

    marker.on("click", () => {
      selectStation(st);
    });

    markersMap[st.mmsi] = marker;
  });
}

// Exposed globally for popup button
window.selectStationByMmsi = function(mmsi) {
  const target = allStations.find(s => s.mmsi === mmsi);
  if (target) {
    selectStation(target);
    leafletMap.closePopup();
  }
};

// ==========================================================================
// Station List Rendering
// ==========================================================================
function renderStationList() {
  if (filteredStations.length === 0) {
    stationListEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-question"></i> 검색 결과가 없습니다.</div>`;
    return;
  }

  let html = "";
  filteredStations.forEach(st => {
    const isSel = selectedStation && selectedStation.mmsi === st.mmsi;
    const sensors = st.sensors || {};
    const badgeClass = st.provider ? `badge-${st.provider.toLowerCase()}` : "";
    const providerTag = st.provider === "KMA" ? "기상청" : (st.provider === "KHOA" ? "조사원" : st.mmafNm);

    html += `
      <div class="station-item ${isSel ? 'selected' : ''}" data-mmsi="${st.mmsi}">
        <div class="station-item-top">
          <span class="station-item-name">${st.stationNm}</span>
          <span class="station-badge ${badgeClass}">${providerTag}</span>
        </div>
        <div class="station-item-sub">
          <span>코드: ${st.mmsi}</span>
          <div class="sensor-icons">
            <i class="fa-solid fa-water ${sensors.wave ? 'active' : ''}" title="${sensors.wave ? '유의파고/최대파고 지원' : '파고 미지원'}"></i>
            <i class="fa-solid fa-wind ${sensors.wind ? 'active' : ''}" title="풍향/풍속"></i>
            <i class="fa-solid fa-temperature-half ${sensors.waterTemp ? 'active' : ''}" title="수온"></i>
            <i class="fa-solid fa-gauge ${sensors.pressure ? 'active' : ''}" title="기압"></i>
          </div>
        </div>
      </div>
    `;
  });

  stationListEl.innerHTML = html;

  // Add click events
  stationListEl.querySelectorAll(".station-item").forEach(item => {
    item.addEventListener("click", () => {
      const mmsi = item.getAttribute("data-mmsi");
      const target = allStations.find(s => s.mmsi === mmsi);
      if (target) {
        selectStation(target);
      }
    });
  });
}

// ==========================================================================
// Select Station and Fetch Weather
// ==========================================================================
async function selectStation(st) {
  selectedStation = st;

  // Update selection UI in list
  document.querySelectorAll(".station-item").forEach(el => {
    el.classList.toggle("selected", el.getAttribute("data-mmsi") === st.mmsi);
  });

  // Update marker styles on map
  Object.entries(markersMap).forEach(([mmsi, marker]) => {
    const el = marker.getElement();
    if (el) {
      el.classList.toggle("selected", mmsi === st.mmsi);
    }
  });

  // Pan map to station smoothly
  leafletMap.flyTo([st.latitude, st.longitude], 11, { duration: 0.8 });

  // Update Header details
  if (detailProviderEl) {
    const pLabel = st.provider === "KMA" ? "기상청 해양부이" : (st.provider === "KHOA" ? "국립해양조사원" : "항로표지");
    detailProviderEl.textContent = pLabel;
    detailProviderEl.className = `detail-badge badge-provider badge-${(st.provider || '').toLowerCase()}`;
  }
  detailMmafNmEl.textContent = st.mmafNm;
  detailStationNmEl.textContent = st.stationNm;
  detailMmsiEl.textContent = st.mmsi;
  detailCoordsEl.textContent = `${st.latitude.toFixed(4)}°N, ${st.longitude.toFixed(4)}°E`;

  // Auto-switch to wave chart tab if this station supports wave
  if (st.sensors && st.sensors.wave && currentChartMode === "wind") {
    setChartMode("wave");
  }

  // Fetch real-time now data
  await fetchRealtimeWeather(st.mmafCode, st.mmsi);

  // Fetch date series data for chart
  const todayStr = getTodayDateStr();
  await fetchDateWeather(st.mmafCode, st.mmsi, todayStr);
}

// ==========================================================================
// API: Real-time Weather Now
// ==========================================================================
async function fetchRealtimeWeather(mmaf, mmsi) {
  setLoadingState(true);
  try {
    const url = `/api/weather/now?mmaf=${mmaf}&mmsi=${mmsi}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" || (data.result && data.result.status === "OK")) {
      const records = data.result ? data.result.recordset : (data.recordset || []);
      if (records && records.length > 0) {
        currentNowData = records[0];
        updateWeatherUI(currentNowData);
      } else {
        clearWeatherUI("최근 관측 자료 없음");
      }
    } else {
      clearWeatherUI(data.message || data.raw || "관측 오류");
    }
  } catch (err) {
    console.error("fetchRealtimeWeather error:", err);
    clearWeatherUI("데이터 수신 오류");
  } finally {
    setLoadingState(false);
    updateLastTime();
  }
}

// ==========================================================================
// API: Date Weather (Time Series)
// ==========================================================================
async function fetchDateWeather(mmaf, mmsi, dateStr) {
  try {
    const url = `/api/weather/date?mmaf=${mmaf}&mmsi=${mmsi}&date=${dateStr}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" || (data.result && data.result.status === "OK")) {
      const records = data.result ? data.result.recordset : (data.recordset || []);
      currentDateRecords = records || [];
      updateChart(currentDateRecords);
    } else {
      currentDateRecords = [];
      updateChart([]);
    }
  } catch (err) {
    console.error("fetchDateWeather error:", err);
    currentDateRecords = [];
    updateChart([]);
  }
}

// ==========================================================================
// UI Updates
// ==========================================================================
function updateWeatherUI(row) {
  // Format observation time
  const dtStr = row.DATETIME || "";
  obsTimeEl.textContent = formatDateTime(dtStr);

  // 1. Wave Height (유의파고, 최대파고, 파주기, 파향)
  const waveHeight = parseFloat(row.WAVE_HEIGTH);
  const waveMax = parseFloat(row.WAVE_MAX);
  const wavePeriod = parseFloat(row.WAVE_PERIOD);
  const waveDrc = parseFloat(row.WAVE_DRC);

  if (!isNaN(waveHeight)) {
    valWaveHeightEl.textContent = waveHeight.toFixed(1);
    kpiWaveHeightEl.textContent = waveHeight.toFixed(1);

    valWaveMaxEl.textContent = !isNaN(waveMax) ? waveMax.toFixed(1) : (waveHeight * 1.5).toFixed(1);
    valWavePeriodEl.textContent = !isNaN(wavePeriod) ? wavePeriod.toFixed(1) : "--";
    valWaveDrcEl.textContent = !isNaN(waveDrc) ? `${Math.round(waveDrc)}° (${get16CompassDirection(waveDrc)})` : "--";

    // Wave severity badge
    if (waveHeight < 1.0) {
      waveLevelBadgeEl.textContent = "안전 (잔잔함)";
      waveLevelBadgeEl.className = "wave-level-badge level-calm";
    } else if (waveHeight < 2.0) {
      waveLevelBadgeEl.textContent = "보통 (약간높음)";
      waveLevelBadgeEl.className = "wave-level-badge level-mod";
    } else if (waveHeight < 3.0) {
      waveLevelBadgeEl.textContent = "주의 (높은파도)";
      waveLevelBadgeEl.className = "wave-level-badge level-rough";
    } else {
      waveLevelBadgeEl.textContent = "경보 (위험파도)";
      waveLevelBadgeEl.className = "wave-level-badge level-high";
    }

    if (waveNoteEl) waveNoteEl.style.display = "none";
  } else {
    valWaveHeightEl.textContent = "--";
    kpiWaveHeightEl.textContent = "--";
    valWaveMaxEl.textContent = "--";
    valWavePeriodEl.textContent = "--";
    valWaveDrcEl.textContent = "--";
    waveLevelBadgeEl.textContent = "센서 미제공";
    waveLevelBadgeEl.className = "wave-level-badge";
    if (waveNoteEl) waveNoteEl.style.display = "flex";
  }

  // 2. Wind & Compass
  const windDir = parseFloat(row.WIND_DIRECT);
  const windSpeed = parseFloat(row.WIND_SPEED);

  if (!isNaN(windDir)) {
    compassNeedleEl.style.transform = `rotate(${windDir}deg)`;
    compassDegEl.textContent = `${Math.round(windDir)}°`;
    compassDirTextEl.textContent = get16CompassDirection(windDir);
  } else {
    compassNeedleEl.style.transform = `rotate(0deg)`;
    compassDegEl.textContent = "--°";
    compassDirTextEl.textContent = "--";
  }

  if (!isNaN(windSpeed)) {
    valWindSpeedEl.textContent = windSpeed.toFixed(1);
    kpiWindSpeedEl.textContent = windSpeed.toFixed(1);
    valBeaufortEl.textContent = getBeaufortDescription(windSpeed);
  } else {
    valWindSpeedEl.textContent = "--";
    kpiWindSpeedEl.textContent = "--";
    valBeaufortEl.textContent = "풍속 자료 미제공";
  }

  // 3. Current Speed & Direction
  const currDrc = row.SURFACE_CURR_DRC || "--";
  const currSpeed = row.SURFACE_CURR_SPEED || "--";
  valCurrDrcEl.textContent = currDrc;
  valCurrSpeedEl.textContent = currSpeed;

  // 4. Water Temp & Air Temp
  const waterTemp = parseFloat(row.WATER_TEMPER);
  if (!isNaN(waterTemp)) {
    valWaterTempEl.textContent = waterTemp.toFixed(1);
    kpiWaterTempEl.textContent = waterTemp.toFixed(1);
  } else {
    valWaterTempEl.textContent = "--";
    kpiWaterTempEl.textContent = "--";
  }

  const airTemp = parseFloat(row.AIR_TEMPERATURE);
  valAirTempEl.textContent = !isNaN(airTemp) ? airTemp.toFixed(1) : "--";

  // 5. Pressure & Humidity
  const pressure = parseFloat(row.AIR_PRESSURE);
  valPressureEl.textContent = !isNaN(pressure) ? Math.round(pressure) : "--";

  const humidity = parseFloat(row.HUMIDITY);
  valHumidityEl.textContent = !isNaN(humidity) ? Math.round(humidity) : "--";

  // 6. Visibility & Salinity / Tide
  const vis = parseFloat(row.HORIZON_VISIBL);
  valVisibilityEl.textContent = !isNaN(vis) ? vis.toFixed(1) : "--";

  if (row.TIDE_LEVEL) {
    valSalinityEl.textContent = row.TIDE_LEVEL;
    if (valSalinityUnitEl) valSalinityUnitEl.textContent = "cm (조위)";
  } else {
    const salinity = parseFloat(row.SALINITY);
    valSalinityEl.textContent = !isNaN(salinity) ? salinity.toFixed(1) : "--";
    if (valSalinityUnitEl) valSalinityUnitEl.textContent = "psu";
  }
}

function clearWeatherUI(message) {
  obsTimeEl.textContent = message || "--";
  compassDegEl.textContent = "--°";
  compassDirTextEl.textContent = "--";
  compassNeedleEl.style.transform = `rotate(0deg)`;
  valWindSpeedEl.textContent = "--";
  valBeaufortEl.textContent = message;
  valCurrDrcEl.textContent = "--";
  valCurrSpeedEl.textContent = "--";
  valWaterTempEl.textContent = "--";
  valAirTempEl.textContent = "--";
  valPressureEl.textContent = "--";
  valHumidityEl.textContent = "--";
  valVisibilityEl.textContent = "--";
  valSalinityEl.textContent = "--";
  valWaveHeightEl.textContent = "--";
  valWaveMaxEl.textContent = "--";
  valWavePeriodEl.textContent = "--";
  valWaveDrcEl.textContent = "--";
  waveLevelBadgeEl.textContent = "--";
  kpiWaterTempEl.textContent = "--";
  kpiWindSpeedEl.textContent = "--";
  kpiWaveHeightEl.textContent = "--";
}

function setLoadingState(isLoading) {
  if (isLoading) {
    btnRefreshEl.querySelector("i").classList.add("fa-spin");
  } else {
    btnRefreshEl.querySelector("i").classList.remove("fa-spin");
  }
}

function updateLastTime() {
  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];
  lastUpdateTextEl.textContent = `${timeStr} 갱신`;
}

// ==========================================================================
// Chart Initialization & Update (Chart.js)
// ==========================================================================
function initChart() {
  const ctx = document.getElementById("weatherChart").getContext("2d");

  weatherChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#94a3b8",
            boxWidth: 12,
            font: { size: 10, family: "Pretendard" }
          }
        },
        tooltip: {
          backgroundColor: "rgba(14, 23, 46, 0.95)",
          titleColor: "#f8fafc",
          bodyColor: "#cbd5e1",
          borderColor: "rgba(0, 210, 255, 0.3)",
          borderWidth: 1,
          padding: 8,
          boxPadding: 4
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: {
            color: "#64748b",
            font: { size: 10 },
            maxTicksLimit: 8
          }
        },
        yPrimary: {
          type: "linear",
          display: true,
          position: "left",
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#00d2ff", font: { size: 10 } }
        },
        ySecondary: {
          type: "linear",
          display: false,
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: "#ffb703", font: { size: 10 } }
        }
      }
    }
  });
}

function setChartMode(mode) {
  currentChartMode = mode;
  if (chartTabsEl) {
    chartTabsEl.querySelectorAll(".chart-tab").forEach(tab => {
      tab.classList.toggle("active", tab.getAttribute("data-chart") === mode);
    });
  }
  updateChart(currentDateRecords);
}

function updateChart(records) {
  if (!weatherChart) return;

  if (!records || records.length === 0) {
    weatherChart.data.labels = [];
    weatherChart.data.datasets = [];
    weatherChart.update();
    return;
  }

  // Ensure ascending order
  const sorted = [...records].reverse();
  const labels = sorted.map(r => formatTimeHHMM(r.DATETIME));

  if (currentChartMode === "wave") {
    // Wave Mode
    const sigWaves = sorted.map(r => {
      const v = parseFloat(r.WAVE_HEIGTH);
      return isNaN(v) ? null : v;
    });
    const maxWaves = sorted.map(r => {
      const v = parseFloat(r.WAVE_MAX);
      return isNaN(v) ? null : v;
    });
    const periods = sorted.map(r => {
      const v = parseFloat(r.WAVE_PERIOD);
      return isNaN(v) ? null : v;
    });

    weatherChart.data.labels = labels;
    weatherChart.data.datasets = [
      {
        label: "유의파고 (m)",
        data: sigWaves,
        borderColor: "#00d2ff",
        backgroundColor: "rgba(0, 210, 255, 0.15)",
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        yAxisID: "yPrimary"
      },
      {
        label: "최대파고 (m)",
        data: maxWaves,
        borderColor: "#ff5e7e",
        backgroundColor: "transparent",
        borderWidth: 1.8,
        borderDash: [4, 4],
        tension: 0.35,
        pointRadius: 2,
        yAxisID: "yPrimary"
      },
      {
        label: "파주기 (sec)",
        data: periods,
        borderColor: "#9d4edd",
        backgroundColor: "transparent",
        borderWidth: 1.5,
        tension: 0.35,
        pointRadius: 1,
        yAxisID: "ySecondary"
      }
    ];

    weatherChart.options.scales.yPrimary.display = true;
    weatherChart.options.scales.yPrimary.title = { display: true, text: "파고 (m)", color: "#00d2ff", font: { size: 10 } };
    weatherChart.options.scales.ySecondary.display = true;
    weatherChart.options.scales.ySecondary.title = { display: true, text: "파주기 (s)", color: "#9d4edd", font: { size: 10 } };

  } else if (currentChartMode === "temp") {
    // Temp Mode
    const waterTemps = sorted.map(r => {
      const v = parseFloat(r.WATER_TEMPER);
      return isNaN(v) ? null : v;
    });
    const airTemps = sorted.map(r => {
      const v = parseFloat(r.AIR_TEMPERATURE);
      return isNaN(v) ? null : v;
    });

    weatherChart.data.labels = labels;
    weatherChart.data.datasets = [
      {
        label: "수온 (℃)",
        data: waterTemps,
        borderColor: "#00f2c3",
        backgroundColor: "rgba(0, 242, 195, 0.1)",
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 1,
        yAxisID: "yPrimary"
      },
      {
        label: "기온 (℃)",
        data: airTemps,
        borderColor: "#00d2ff",
        backgroundColor: "rgba(0, 210, 255, 0.1)",
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 1,
        yAxisID: "yPrimary"
      }
    ];

    weatherChart.options.scales.yPrimary.display = true;
    weatherChart.options.scales.yPrimary.title = { display: true, text: "온도 (℃)", color: "#00f2c3", font: { size: 10 } };
    weatherChart.options.scales.ySecondary.display = false;

  } else if (currentChartMode === "pressure") {
    // Pressure Mode
    const pressures = sorted.map(r => {
      const v = parseFloat(r.AIR_PRESSURE);
      return isNaN(v) ? null : v;
    });

    weatherChart.data.labels = labels;
    weatherChart.data.datasets = [
      {
        label: "기압 (hPa)",
        data: pressures,
        borderColor: "#9d4edd",
        backgroundColor: "rgba(157, 78, 221, 0.15)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 1,
        yAxisID: "yPrimary"
      }
    ];

    weatherChart.options.scales.yPrimary.display = true;
    weatherChart.options.scales.yPrimary.title = { display: true, text: "기압 (hPa)", color: "#9d4edd", font: { size: 10 } };
    weatherChart.options.scales.ySecondary.display = false;

  } else {
    // Wind Mode (default)
    const windSpeeds = sorted.map(r => {
      const v = parseFloat(r.WIND_SPEED);
      return isNaN(v) ? null : v;
    });

    weatherChart.data.labels = labels;
    weatherChart.data.datasets = [
      {
        label: "풍속 (m/s)",
        data: windSpeeds,
        borderColor: "#ffb703",
        backgroundColor: "rgba(255, 183, 3, 0.15)",
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        yAxisID: "yPrimary"
      }
    ];

    weatherChart.options.scales.yPrimary.display = true;
    weatherChart.options.scales.yPrimary.title = { display: true, text: "풍속 (m/s)", color: "#ffb703", font: { size: 10 } };
    weatherChart.options.scales.ySecondary.display = false;
  }

  weatherChart.update();
}

// ==========================================================================
// CSV Download Functionality
// ==========================================================================
function downloadCsv() {
  if (!currentDateRecords || currentDateRecords.length === 0) {
    alert("다운로드할 오늘 관측 데이터가 없습니다.");
    return;
  }

  const stationName = selectedStation ? selectedStation.stationNm : "관측소";
  const mmsi = selectedStation ? selectedStation.mmsi : "0000";
  const today = getTodayDateStr();

  const headers = [
    "관측일시", "제공처", "지방청명", "지점코드", "지점명", 
    "유의파고(m)", "최대파고(m)", "파주기(sec)", "파향(deg)",
    "풍향(deg)", "풍속(m/s)", "표면유향(deg)", "표면유속(kn)", 
    "기온(C)", "수온(C)", "기압(hPa)", "습도(%)", "시정(km)", "염분/조위"
  ];

  const rows = currentDateRecords.map(r => [
    r.DATETIME || "",
    r.PROVIDER || (selectedStation ? selectedStation.provider : ""),
    r.MMAF_NM || "",
    r.MMSI_CODE || "",
    r.MMSI_NM || "",
    r.WAVE_HEIGTH || "",
    r.WAVE_MAX || "",
    r.WAVE_PERIOD || "",
    r.WAVE_DRC || "",
    r.WIND_DIRECT || "",
    r.WIND_SPEED || "",
    r.SURFACE_CURR_DRC || "",
    r.SURFACE_CURR_SPEED || "",
    r.AIR_TEMPERATURE || "",
    r.WATER_TEMPER || "",
    r.AIR_PRESSURE || "",
    r.HUMIDITY || "",
    r.HORIZON_VISIBL || "",
    r.TIDE_LEVEL || r.SALINITY || ""
  ]);

  // UTF-8 BOM + CSV Content
  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(row => row.join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `해양기상_${stationName}_${mmsi}_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================================================
// Event Listeners & Filtering
// ==========================================================================
function initEventListeners() {
  // Provider Tabs
  if (providerTabsEl) {
    providerTabsEl.querySelectorAll(".provider-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        providerTabsEl.querySelectorAll(".provider-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentProvider = tab.getAttribute("data-provider");
        filterStations();
      });
    });
  }

  // Chart Tabs
  if (chartTabsEl) {
    chartTabsEl.querySelectorAll(".chart-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const mode = tab.getAttribute("data-chart");
        setChartMode(mode);
      });
    });
  }

  // Search input
  searchInputEl.addEventListener("input", () => {
    const val = searchInputEl.value.trim();
    btnClearSearchEl.style.display = val ? "block" : "none";
    filterStations();
  });

  btnClearSearchEl.addEventListener("click", () => {
    searchInputEl.value = "";
    btnClearSearchEl.style.display = "none";
    filterStations();
  });

  // Region chips
  regionChipsEl.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      regionChipsEl.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      filterStations();
    });
  });

  // Reset view button
  btnResetViewEl.addEventListener("click", resetMapView);

  // Manual refresh button
  btnRefreshEl.addEventListener("click", () => {
    if (selectedStation) {
      selectStation(selectedStation);
    }
  });

  // Auto refresh change
  autoRefreshSelectEl.addEventListener("change", setupAutoRefresh);

  // CSV Export button
  btnDownloadCsvEl.addEventListener("click", downloadCsv);
}

function filterStations() {
  const query = searchInputEl.value.toLowerCase().trim();
  const activeChip = regionChipsEl.querySelector(".chip.active");
  const mmafCode = activeChip ? activeChip.getAttribute("data-mmaf") : "ALL";

  filteredStations = allStations.filter(st => {
    // 1. Provider Filter
    if (currentProvider !== "ALL" && st.provider !== currentProvider) {
      return false;
    }

    // 2. Region / MMAF Filter
    let matchMmaf = true;
    if (mmafCode !== "ALL") {
      if (mmafCode === "KMA") matchMmaf = st.provider === "KMA";
      else if (mmafCode === "KHOA") matchMmaf = st.provider === "KHOA";
      else matchMmaf = st.mmafCode === mmafCode;
    }

    // 3. Search Query Filter
    const matchQuery = !query || 
      st.stationNm.toLowerCase().includes(query) || 
      st.mmsi.toLowerCase().includes(query) ||
      st.mmafNm.toLowerCase().includes(query) ||
      (st.provider && st.provider.toLowerCase().includes(query));

    return matchMmaf && matchQuery;
  });

  stationCountEl.textContent = filteredStations.length;
  renderStationMarkers();
  renderStationList();
}

function setupAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  const intervalSec = parseInt(autoRefreshSelectEl.value, 10);
  if (intervalSec > 0) {
    autoRefreshTimer = setInterval(() => {
      if (selectedStation) {
        fetchRealtimeWeather(selectedStation.mmafCode, selectedStation.mmsi);
      }
    }, intervalSec * 1000);
  }
}

// ==========================================================================
// Helper Utilities
// ==========================================================================
function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatDateTime(str) {
  if (!str || str.length < 12) return "--";
  const y = str.substring(0, 4);
  const m = str.substring(4, 6);
  const d = str.substring(6, 8);
  const hh = str.substring(8, 10);
  const mm = str.substring(10, 12);
  return `${y}.${m}.${d} ${hh}:${mm}`;
}

function formatTimeHHMM(str) {
  if (!str || str.length < 12) return "--:--";
  const hh = str.substring(8, 10);
  const mm = str.substring(10, 12);
  return `${hh}:${mm}`;
}

function get16CompassDirection(deg) {
  const dirs = [
    "북 (N)", "북북동 (NNE)", "북동 (NE)", "동북동 (ENE)",
    "동 (E)", "동남동 (ESE)", "남동 (SE)", "남남동 (SSE)",
    "남 (S)", "남남서 (SSW)", "남서 (SW)", "서남서 (WSW)",
    "서 (W)", "서북서 (WNW)", "북서 (NW)", "북북서 (NNW)"
  ];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return dirs[idx];
}

function getBeaufortDescription(speed) {
  if (speed < 0.3) return "0계급 (고요)";
  if (speed < 1.6) return "1계급 (실바람)";
  if (speed < 3.4) return "2계급 (남실바람)";
  if (speed < 5.5) return "3계급 (산들바람)";
  if (speed < 8.0) return "4계급 (된바람)";
  if (speed < 10.8) return "5계급 (흔들바람)";
  if (speed < 13.9) return "6계급 (된바람)";
  if (speed < 17.2) return "7계급 (센바람)";
  if (speed < 20.8) return "8계급 (큰바람)";
  if (speed < 24.5) return "9계급 (큰센바람)";
  return "10계급 이상 (폭풍/태풍)";
}
