// ═══════════════════ CARTE SVG DU BENIN ═══════════════════
// Carte des 12 departements avec contours affines (simplifies depuis GeoJSON)
// Viewport SVG : coordonnees projetees lon 0.7-3.9 -> x, lat 6.1-12.5 -> y

function lonLatToSVG(lon, lat) {
  const x = 10 + (lon - 0.7) * (280 / 3.2);
  const y = 590 - (lat - 6.1) * (580 / 6.4);
  return [x.toFixed(1), y.toFixed(1)];
}

function coordsToPath(coords) {
  return coords.map((p, i) => {
    const [x, y] = lonLatToSVG(p[0], p[1]);
    return (i === 0 ? 'M' : 'L') + x + ',' + y;
  }).join(' ') + ' Z';
}

// Contours affines des 12 departements (lon, lat) — traces depuis frontières officielles
const DEPT_PATHS = {
  'Alibori': coordsToPath([
    [1.63,11.40],[1.78,11.20],[2.00,11.15],[2.20,11.05],[2.38,10.95],
    [2.60,11.00],[2.80,11.05],[3.10,11.10],[3.30,11.20],[3.40,11.45],
    [3.42,11.70],[3.40,11.88],[3.30,12.00],[3.20,12.18],[3.05,12.30],
    [2.80,12.40],[2.55,12.35],[2.35,12.25],[2.10,12.10],[1.95,11.95],
    [1.80,11.80],[1.65,11.65],[1.63,11.40]
  ]),
  'Atacora': coordsToPath([
    [0.78,10.00],[0.90,9.95],[1.05,9.90],[1.20,9.85],[1.38,9.90],
    [1.55,10.00],[1.70,10.15],[1.78,10.30],[1.80,10.50],[1.78,10.70],
    [1.78,10.90],[1.78,11.10],[1.78,11.20],[1.63,11.40],[1.50,11.30],
    [1.35,11.15],[1.18,11.05],[1.00,10.95],[0.85,10.85],[0.78,10.70],
    [0.76,10.50],[0.76,10.30],[0.78,10.00]
  ]),
  'Borgou': coordsToPath([
    [2.00,11.15],[1.78,11.20],[1.78,11.10],[1.78,10.90],[1.78,10.70],
    [1.78,10.50],[1.78,10.30],[1.80,10.10],[1.85,9.90],[1.90,9.70],
    [1.95,9.50],[2.00,9.30],[2.05,9.10],[2.15,8.95],[2.30,8.85],
    [2.50,8.80],[2.70,8.82],[2.90,8.90],[3.10,9.00],[3.25,9.15],
    [3.35,9.30],[3.40,9.50],[3.42,9.75],[3.42,10.00],[3.42,10.25],
    [3.40,10.50],[3.38,10.75],[3.35,10.95],[3.30,11.20],[3.10,11.10],
    [2.80,11.05],[2.60,11.00],[2.38,10.95],[2.20,11.05],[2.00,11.15]
  ]),
  'Donga': coordsToPath([
    [1.20,9.85],[1.05,9.90],[0.90,9.95],[0.78,10.00],[0.76,9.80],
    [0.80,9.60],[0.85,9.40],[0.92,9.22],[1.00,9.10],[1.12,9.00],
    [1.25,8.92],[1.40,8.85],[1.55,8.82],[1.70,8.82],[1.85,8.85],
    [1.95,8.92],[2.05,9.05],[2.05,9.10],[2.00,9.30],[1.95,9.50],
    [1.90,9.70],[1.85,9.90],[1.78,10.05],[1.70,10.15],[1.55,10.00],
    [1.38,9.90],[1.20,9.85]
  ]),
  'Collines': coordsToPath([
    [1.55,8.82],[1.40,8.85],[1.25,8.80],[1.15,8.70],[1.10,8.55],
    [1.12,8.40],[1.18,8.22],[1.25,8.05],[1.35,7.90],[1.45,7.78],
    [1.55,7.68],[1.68,7.60],[1.80,7.55],[1.95,7.50],[2.10,7.48],
    [2.25,7.50],[2.40,7.55],[2.55,7.65],[2.65,7.75],[2.72,7.90],
    [2.75,8.05],[2.75,8.25],[2.72,8.45],[2.70,8.60],[2.65,8.72],
    [2.50,8.80],[2.30,8.85],[2.15,8.95],[2.05,9.05],[1.95,8.92],
    [1.85,8.85],[1.70,8.82],[1.55,8.82]
  ]),
  'Zou': coordsToPath([
    [1.68,7.60],[1.55,7.68],[1.45,7.60],[1.38,7.48],[1.35,7.35],
    [1.38,7.20],[1.42,7.08],[1.50,6.95],[1.60,6.88],[1.72,6.82],
    [1.85,6.82],[1.98,6.85],[2.10,6.90],[2.22,6.98],[2.30,7.08],
    [2.35,7.20],[2.38,7.32],[2.40,7.45],[2.40,7.55],[2.25,7.50],
    [2.10,7.48],[1.95,7.50],[1.80,7.55],[1.68,7.60]
  ]),
  'Plateau': coordsToPath([
    [2.40,7.55],[2.40,7.45],[2.38,7.32],[2.35,7.20],[2.38,7.08],
    [2.42,6.98],[2.50,6.88],[2.58,6.82],[2.68,6.78],[2.78,6.78],
    [2.85,6.82],[2.82,7.00],[2.78,7.18],[2.75,7.35],[2.75,7.55],
    [2.75,7.75],[2.72,7.90],[2.65,7.75],[2.55,7.65],[2.40,7.55]
  ]),
  'Oueme': coordsToPath([
    [2.42,6.98],[2.38,6.85],[2.40,6.72],[2.42,6.60],[2.45,6.48],
    [2.50,6.38],[2.58,6.35],[2.68,6.35],[2.78,6.38],[2.85,6.45],
    [2.85,6.58],[2.85,6.70],[2.85,6.82],[2.78,6.78],[2.68,6.78],
    [2.58,6.82],[2.50,6.88],[2.42,6.98]
  ]),
  'Littoral': coordsToPath([
    [2.30,6.38],[2.38,6.33],[2.48,6.30],[2.50,6.38],[2.45,6.48],
    [2.42,6.55],[2.38,6.48],[2.32,6.42],[2.30,6.38]
  ]),
  'Atlantique': coordsToPath([
    [1.98,6.85],[1.85,6.82],[1.82,6.72],[1.85,6.60],[1.90,6.48],
    [1.98,6.40],[2.08,6.35],[2.18,6.33],[2.30,6.38],[2.32,6.42],
    [2.38,6.48],[2.42,6.55],[2.42,6.60],[2.40,6.72],[2.38,6.85],
    [2.30,7.08],[2.22,6.98],[2.10,6.90],[1.98,6.85]
  ]),
  'Mono': coordsToPath([
    [1.60,6.88],[1.50,6.82],[1.42,6.72],[1.40,6.60],[1.42,6.48],
    [1.50,6.38],[1.60,6.30],[1.72,6.25],[1.85,6.25],[1.92,6.30],
    [1.98,6.40],[1.90,6.48],[1.85,6.60],[1.82,6.72],[1.85,6.82],
    [1.72,6.82],[1.60,6.88]
  ]),
  'Couffo': coordsToPath([
    [1.50,6.95],[1.42,7.08],[1.38,7.20],[1.35,7.35],[1.38,7.48],
    [1.25,7.42],[1.15,7.32],[1.08,7.20],[1.05,7.05],[1.08,6.92],
    [1.15,6.82],[1.25,6.75],[1.35,6.72],[1.42,6.72],[1.50,6.82],
    [1.50,6.95]
  ])
};

// Centres pour les labels (lon, lat)
const DEPT_CENTERS = {
  'Alibori': [2.55, 11.70],
  'Atacora': [1.20, 10.55],
  'Borgou': [2.70, 10.05],
  'Donga': [1.35, 9.40],
  'Collines': [2.00, 8.20],
  'Zou': [1.90, 7.20],
  'Plateau': [2.62, 7.30],
  'Oueme': [2.65, 6.65],
  'Atlantique': [2.15, 6.60],
  'Littoral': [2.40, 6.38],
  'Mono': [1.68, 6.55],
  'Couffo': [1.22, 7.05]
};

/**
 * Genere le SVG de la carte du Benin avec coloration par donnees
 * @param {Object} deptData - { "Alibori": { count: 5, color: "#dc2626", tooltip: "..." }, ... }
 * @returns {string} HTML du SVG
 */
export function renderBeninMap(deptData = {}) {
  const depts = Object.keys(DEPT_PATHS);
  let paths = '';
  let labels = '';

  depts.forEach(dept => {
    const data = deptData[dept] || {};
    const fillColor = data.color || '#e5e7eb';
    const count = data.count || 0;
    const tooltip = data.tooltip || `${dept}: ${count} inspection(s)`;
    const escapedTooltip = tooltip.replace(/'/g, "\\'");

    paths += `<path d="${DEPT_PATHS[dept]}"
      fill="${fillColor}" stroke="#374151" stroke-width="0.8"
      style="cursor:pointer;transition:all 0.2s;opacity:0.9"
      onmouseover="this.style.opacity='1';this.style.strokeWidth='2';this.style.stroke='#111827';document.getElementById('map-tooltip').textContent='${escapedTooltip}';document.getElementById('map-tooltip').style.display='block'"
      onmouseout="this.style.opacity='0.9';this.style.strokeWidth='0.8';this.style.stroke='#374151';document.getElementById('map-tooltip').style.display='none'">
      <title>${tooltip}</title>
    </path>`;

    const center = DEPT_CENTERS[dept];
    if (center) {
      const [cx, cy] = lonLatToSVG(center[0], center[1]);
      const isSmall = dept === 'Littoral';
      const fontSize = isSmall ? '6.5' : dept.length > 7 ? '8' : '9';
      const label = isSmall ? 'Lit.' : dept;
      labels += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
        font-size="${fontSize}" font-family="'DM Sans',system-ui,sans-serif" font-weight="600"
        fill="#1e293b" pointer-events="none" style="text-shadow:0 0 3px rgba(255,255,255,0.8)">${label}</text>`;
      if (count > 0) {
        labels += `<circle cx="${cx}" cy="${parseFloat(cy) + 13}" r="8" fill="${fillColor}" stroke="#374151" stroke-width="0.5" opacity="0.9"/>`;
        labels += `<text x="${cx}" y="${parseFloat(cy) + 13}" text-anchor="middle" dominant-baseline="central"
          font-size="7.5" font-family="'JetBrains Mono',monospace" font-weight="700"
          fill="#1e293b" pointer-events="none">${count}</text>`;
      }
    }
  });

  return `
    <div style="position:relative">
      <svg viewBox="0 0 300 600" width="100%" style="max-width:300px;height:auto;display:block;margin:0 auto">
        <!-- Contour national -->
        <rect x="0" y="0" width="300" height="600" fill="none"/>
        <!-- Ocean / fond -->
        <rect x="0" y="560" width="300" height="40" fill="#dbeafe" opacity="0.3"/>
        <text x="150" y="585" text-anchor="middle" font-size="8" fill="#93c5fd" font-style="italic"
          font-family="'DM Sans',system-ui,sans-serif">Ocean Atlantique</text>
        <!-- Pays voisins -->
        <text x="15" y="300" font-size="7" fill="#d1d5db" font-family="'DM Sans',system-ui,sans-serif"
          transform="rotate(-90, 15, 300)">TOGO</text>
        <text x="285" y="300" font-size="7" fill="#d1d5db" font-family="'DM Sans',system-ui,sans-serif"
          transform="rotate(90, 285, 300)">NIGERIA</text>
        <text x="150" y="22" text-anchor="middle" font-size="7" fill="#d1d5db"
          font-family="'DM Sans',system-ui,sans-serif">BURKINA FASO / NIGER</text>
        <!-- Departements -->
        ${paths}
        <!-- Labels -->
        ${labels}
        <!-- Titre -->
        <text x="150" y="10" text-anchor="middle" font-size="11" font-family="'DM Sans',system-ui,sans-serif"
          font-weight="700" fill="#0f172a" letter-spacing="0.1em">BENIN</text>
      </svg>
      <div id="map-tooltip" style="display:none;position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
        background:#1e293b;color:#f8fafc;padding:6px 14px;font-size:12px;border-radius:4px;
        font-family:'DM Sans',system-ui,sans-serif;white-space:nowrap;pointer-events:none;z-index:10;
        box-shadow:0 2px 8px rgba(0,0,0,0.15)"></div>
    </div>
  `;
}

/**
 * Palette de couleurs selon le nombre d'inspections (heat map)
 */
export function getHeatColor(count, maxCount) {
  if (count === 0) return '#f3f4f6';
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio >= 0.75) return '#dc2626';
  if (ratio >= 0.5) return '#f97316';
  if (ratio >= 0.25) return '#3b82f6';
  return '#93c5fd';
}

/**
 * Palette selon le niveau de risque
 */
export function getRiskColor(riskLevel) {
  if (riskLevel >= 4) return '#7f1d1d';
  if (riskLevel >= 3) return '#dc2626';
  if (riskLevel >= 2) return '#d97706';
  return '#16a34a';
}
