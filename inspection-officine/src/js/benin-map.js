// ═══════════════════ CARTE SVG DU BENIN ═══════════════════
// Carte simplifiee des 12 departements avec contours approximatifs
// Les paths sont des polygones simplifies bases sur les frontieres reelles

// Coordonnees SVG viewport: 0,0 en haut-gauche, echelle relative
// Le Benin s'etend ~entre 0.8°E-3.8°E et 6.2°N-12.4°N
// On mappe sur un viewport SVG de 300x600

function lonLatToSVG(lon, lat) {
  // Mapping: lon 0.7-3.9 -> x 10-290, lat 6.1-12.5 -> y 590-10
  const x = 10 + (lon - 0.7) * (280 / 3.2);
  const y = 590 - (lat - 6.1) * (580 / 6.4);
  return [x.toFixed(1), y.toFixed(1)];
}

function pointsToPath(points) {
  return points.map((p, i) => {
    const [x, y] = lonLatToSVG(p[0], p[1]);
    return (i === 0 ? 'M' : 'L') + x + ',' + y;
  }).join(' ') + ' Z';
}

// Contours simplifies des 12 departements (lon, lat)
const DEPT_PATHS = {
  'Alibori': pointsToPath([
    [2.0,11.4],[2.8,11.5],[3.4,11.8],[3.8,11.9],[3.8,12.4],[3.4,12.4],
    [2.8,12.2],[2.2,12.0],[1.8,11.8],[1.6,11.5],[2.0,11.4]
  ]),
  'Atacora': pointsToPath([
    [0.8,10.2],[1.2,10.0],[1.6,10.2],[2.0,10.5],[2.0,11.4],[1.6,11.5],
    [1.2,11.2],[0.8,11.0],[0.8,10.8],[0.8,10.2]
  ]),
  'Borgou': pointsToPath([
    [2.0,9.0],[2.8,9.2],[3.4,9.5],[3.8,10.0],[3.8,11.9],[3.4,11.8],
    [2.8,11.5],[2.0,11.4],[2.0,10.5],[2.0,9.0]
  ]),
  'Donga': pointsToPath([
    [1.2,9.2],[1.6,9.0],[2.0,9.0],[2.0,10.5],[1.6,10.2],[1.2,10.0],
    [0.8,10.2],[0.8,9.6],[1.2,9.2]
  ]),
  'Collines': pointsToPath([
    [1.6,7.6],[2.0,7.5],[2.6,7.8],[2.8,8.2],[2.8,9.2],[2.0,9.0],
    [1.6,9.0],[1.4,8.5],[1.6,7.6]
  ]),
  'Borgou': pointsToPath([
    [2.0,9.0],[2.8,9.2],[3.4,9.5],[3.8,10.0],[3.8,11.9],[3.4,11.8],
    [2.8,11.5],[2.0,11.4],[2.0,10.5],[2.0,9.0]
  ]),
  'Zou': pointsToPath([
    [1.6,7.0],[2.0,7.0],[2.4,7.2],[2.6,7.8],[2.0,7.5],[1.6,7.6],
    [1.4,7.4],[1.6,7.0]
  ]),
  'Plateau': pointsToPath([
    [2.4,7.0],[2.8,7.0],[2.8,7.8],[2.6,7.8],[2.4,7.2],[2.4,7.0]
  ]),
  'Oueme': pointsToPath([
    [2.4,6.4],[2.8,6.4],[2.8,7.0],[2.4,7.0],[2.3,6.7],[2.4,6.4]
  ]),
  'Atlantique': pointsToPath([
    [2.0,6.4],[2.4,6.4],[2.3,6.7],[2.4,7.0],[2.0,7.0],[1.9,6.7],[2.0,6.4]
  ]),
  'Littoral': pointsToPath([
    [2.3,6.3],[2.5,6.3],[2.5,6.45],[2.3,6.45],[2.3,6.3]
  ]),
  'Mono': pointsToPath([
    [1.5,6.3],[1.9,6.3],[1.9,6.7],[2.0,7.0],[1.6,7.0],[1.4,6.8],
    [1.4,6.5],[1.5,6.3]
  ]),
  'Couffo': pointsToPath([
    [1.4,6.8],[1.6,7.0],[1.6,7.6],[1.4,7.4],[1.2,7.2],[1.2,6.9],[1.4,6.8]
  ])
};

// Centres approximatifs pour les labels (lon, lat)
const DEPT_CENTERS = {
  'Alibori': [2.8, 11.9],
  'Atacora': [1.2, 10.7],
  'Borgou': [2.8, 10.3],
  'Donga': [1.4, 9.6],
  'Collines': [2.1, 8.3],
  'Zou': [2.0, 7.3],
  'Plateau': [2.6, 7.4],
  'Oueme': [2.6, 6.7],
  'Atlantique': [2.15, 6.7],
  'Littoral': [2.4, 6.37],
  'Mono': [1.7, 6.6],
  'Couffo': [1.4, 7.1]
};

/**
 * Genere le SVG de la carte du Benin avec coloration par donnees
 * @param {Object} deptData - { "Alibori": { count: 5, risk: "high", color: "#dc2626" }, ... }
 * @param {Function} onClick - callback(deptName) quand on clique sur un departement
 * @returns {string} HTML du SVG
 */
export function renderBeninMap(deptData = {}, onClick = null) {
  const depts = Object.keys(DEPT_PATHS);

  let paths = '';
  let labels = '';

  depts.forEach(dept => {
    const data = deptData[dept] || {};
    const fillColor = data.color || '#e5e7eb';
    const count = data.count || 0;
    const tooltip = data.tooltip || `${dept}: ${count} inspection(s)`;
    const clickAttr = onClick ? `onclick="window._mapClick && window._mapClick('${dept}')"` : '';
    const cursor = onClick ? 'cursor:pointer;' : '';

    paths += `<path d="${DEPT_PATHS[dept]}"
      fill="${fillColor}" stroke="#fff" stroke-width="1.5"
      style="${cursor}transition:fill 0.2s,opacity 0.2s;opacity:0.85"
      onmouseover="this.style.opacity='1';this.style.strokeWidth='2.5';document.getElementById('map-tooltip').textContent='${tooltip.replace(/'/g, "\\'")}';document.getElementById('map-tooltip').style.display='block'"
      onmouseout="this.style.opacity='0.85';this.style.strokeWidth='1.5';document.getElementById('map-tooltip').style.display='none'"
      ${clickAttr}>
      <title>${tooltip}</title>
    </path>`;

    const center = DEPT_CENTERS[dept];
    if (center) {
      const [cx, cy] = lonLatToSVG(center[0], center[1]);
      const fontSize = dept === 'Littoral' ? '7' : '9';
      labels += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="${fontSize}"
        font-family="DM Sans,sans-serif" font-weight="600" fill="#1e293b" pointer-events="none">
        ${dept === 'Littoral' ? 'Lit.' : dept.substring(0, 6)}
      </text>`;
      if (count > 0) {
        labels += `<text x="${cx}" y="${parseFloat(cy) + 12}" text-anchor="middle" font-size="8"
          font-family="JetBrains Mono,monospace" fill="#6b7280" pointer-events="none">${count}</text>`;
      }
    }
  });

  return `
    <div style="position:relative">
      <svg viewBox="0 0 300 600" width="100%" style="max-width:320px;height:auto;display:block;margin:0 auto">
        <!-- Fond -->
        <rect x="0" y="0" width="300" height="600" fill="none"/>
        <!-- Departements -->
        ${paths}
        <!-- Labels -->
        ${labels}
        <!-- Titre -->
        <text x="150" y="16" text-anchor="middle" font-size="11" font-family="DM Sans,sans-serif" font-weight="700" fill="#1e293b">BENIN</text>
      </svg>
      <div id="map-tooltip" style="display:none;position:absolute;bottom:8px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--white);padding:6px 12px;font-size:12px;font-family:var(--font);white-space:nowrap;pointer-events:none;z-index:10"></div>
    </div>
  `;
}

/**
 * Palette de couleurs selon le nombre d'inspections
 */
export function getHeatColor(count, maxCount) {
  if (count === 0) return '#f3f4f6';
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio >= 0.75) return '#dc2626'; // Rouge
  if (ratio >= 0.5) return '#d97706';  // Orange
  if (ratio >= 0.25) return '#2563eb'; // Bleu
  return '#93c5fd';                     // Bleu clair
}

/**
 * Palette de couleurs selon le niveau de risque
 */
export function getRiskColor(riskLevel) {
  if (riskLevel >= 4) return '#7f1d1d';
  if (riskLevel >= 3) return '#dc2626';
  if (riskLevel >= 2) return '#d97706';
  return '#16a34a';
}
