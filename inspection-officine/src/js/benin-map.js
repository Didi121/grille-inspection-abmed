// ═══════════════════ CARTE SVG DU BENIN ═══════════════════
// 12 departements — contours partageant les points de frontiere communs
// Projection: lon [0.72, 3.86] -> x [8, 292], lat [6.18, 12.50] -> y [588, 8]

// Points de frontiere partages — definis une seule fois pour eviter les trous
// Nommage: P_XX = point partage entre departements
const P = {
  // Cote sud (Ocean Atlantique, ouest -> est)
  SW:  [0.78, 6.22],  // frontiere Togo-ocean
  MC1: [1.62, 6.22],  // jonction Mono-Couffo cote
  MA1: [1.78, 6.22],  // jonction Mono-Atlantique cote
  AL1: [2.12, 6.22],  // jonction Atlantique-Littoral cote
  LO1: [2.30, 6.33],  // Littoral ouest
  LO2: [2.48, 6.33],  // Littoral est
  OC1: [2.68, 6.22],  // jonction Oueme cote est
  SE:  [2.80, 6.22],  // frontiere Nigeria-ocean

  // Frontiere Mono-Couffo interne
  MC2: [1.62, 6.95],
  // Frontiere Couffo-Zou
  CZ1: [1.38, 7.08],
  CZ2: [1.50, 7.55],
  // Frontiere Mono-Atlantique interne
  MA2: [1.78, 6.95],
  // Frontiere Zou-Atlantique
  ZA1: [2.10, 6.95],
  // Jonction Zou-Atlantique-Oueme
  ZAO: [2.32, 6.95],
  // Frontiere Atlantique-Littoral interne
  ALL: [2.30, 6.55],
  ALR: [2.48, 6.55],
  // Frontiere Oueme-Littoral
  OL1: [2.48, 6.55],
  // Frontiere Oueme-Plateau
  OP1: [2.68, 6.95],
  OP2: [2.80, 6.95],
  // Frontiere Zou-Plateau
  ZP1: [2.42, 7.55],
  // Frontiere Zou-Collines
  ZC1: [1.55, 7.65],
  ZC2: [2.42, 7.65],
  // Frontiere Couffo-Collines
  CC1: [1.38, 7.55],
  // Frontiere Plateau-Collines
  PC1: [2.70, 7.65],
  PC2: [2.80, 7.65],
  // Frontiere Collines-Donga
  CD1: [1.38, 8.82],
  CD2: [2.05, 8.82],
  // Frontiere Collines-Borgou
  CB1: [2.05, 8.82],
  CB2: [2.80, 8.82],
  // Frontiere Plateau-Borgou
  PB1: [2.80, 7.65],
  // Frontiere Donga-Atacora
  DA1: [0.78, 9.90],
  DA2: [1.38, 9.90],
  // Frontiere Donga-Borgou
  DB1: [2.05, 8.82],
  DB2: [2.05, 10.00],
  // Frontiere Atacora-Borgou
  AB1: [2.05, 10.00],
  AB2: [2.05, 11.38],
  // Frontiere Atacora-Alibori
  AA1: [2.05, 11.38],
  // Frontiere Borgou-Alibori
  BA1: [2.05, 11.38],
  BA2: [3.40, 11.38],
  // Coins extremes
  NW:  [0.78, 12.42],  // coin nord-ouest (Atacora-Burkina)
  NE:  [3.86, 12.42],  // coin nord-est (Alibori-Niger)
  // Frontiere est (Nigeria)
  EN1: [3.40, 11.38],
  EN2: [3.50, 10.50],
  EN3: [3.50, 9.50],
  EN4: [3.40, 8.82],
  EN5: [2.80, 8.82],
  EN6: [2.80, 7.65],
  EN7: [2.80, 6.95],
  // Frontiere ouest (Togo)
  TW1: [0.78, 12.42],
  TW2: [0.78, 9.90],
  TW3: [0.78, 8.82],
  TW4: [0.78, 7.55],
  TW5: [0.78, 6.22],
};

// Coordonnees de chaque departement (partageant les points P)
const DEPT_COORDS = {
  'Alibori': [
    P.AA1, [2.20,11.50], [2.40,11.65], [2.60,11.80], [2.80,11.95],
    [3.05,12.10], [3.30,12.25], [3.55,12.35], P.NE,
    [3.86,11.80], [3.70,11.50], P.BA2, P.BA1
  ],
  'Atacora': [
    P.TW1, P.NW, [1.10,12.30], [1.40,12.15], [1.70,11.90], [1.85,11.65], P.AA1,
    P.AB2, P.AB1, P.DA2, P.DA1, P.TW2,
    [0.78,10.50], [0.78,11.00], [0.78,11.50], [0.78,12.00]
  ],
  'Borgou': [
    P.AB2, P.BA1, P.BA2, P.EN1,
    [3.50,11.00], P.EN2, P.EN3, [3.45,9.00], P.EN4,
    P.CB2, P.CB1, P.DB1, P.DB2, P.AB1
  ],
  'Donga': [
    P.DA1, P.DA2, [1.55,9.80], [1.80,9.60], P.DB2, P.DB1, P.CD2,
    P.CD1, [1.15,8.90], [1.00,9.05], [0.88,9.25], [0.80,9.50],
    P.TW3, [0.78,9.30], P.TW2
  ],
  'Collines': [
    P.CD1, P.CD2, P.CB1, P.CB2, P.EN5,
    P.PC2, P.PC1, P.ZC2, P.ZC1,
    P.CC1, [1.20,8.40], [1.15,8.10], [1.20,7.80], P.CZ2
  ],
  'Zou': [
    P.CZ2, [1.55,7.55], P.ZC1, P.ZC2, P.ZP1,
    [2.38,7.35], [2.30,7.12], P.ZAO, P.ZA1, P.MA2,
    [1.72,6.88], [1.60,6.92], [1.50,6.98], P.CZ1
  ],
  'Plateau': [
    P.ZP1, P.ZC2, P.PC1, P.PC2, P.EN6,
    P.OP2, P.OP1, [2.55,6.85], [2.45,7.00], P.ZAO,
    [2.38,7.35], P.ZP1
  ],
  'Oueme': [
    P.OL1, P.ALR, P.LO2, [2.55,6.30], P.OC1, P.SE,
    P.EN7, P.OP2, P.OP1, [2.55,6.85], [2.50,6.70], P.OL1
  ],
  'Littoral': [
    P.LO1, P.AL1, [2.22,6.28], [2.35,6.25], [2.48,6.28], P.LO2,
    P.ALR, P.ALL, [2.38,6.45], P.LO1
  ],
  'Atlantique': [
    P.MA1, [1.90,6.28], P.AL1, P.LO1, P.ALL, P.ALR, P.OL1,
    [2.42,6.65], P.ZAO, P.ZA1, P.MA2, [1.82,6.80],
    [1.78,6.60], [1.78,6.40], P.MA1
  ],
  'Mono': [
    P.SW, P.MC1, P.MC2, P.MA2, P.ZA1,
    [1.98,6.80], [1.82,6.80], P.MA2,
    [1.78,6.60], [1.78,6.40], P.MA1,
    [1.72,6.28], [1.62,6.25], P.MC1, P.SW
  ],
  'Couffo': [
    P.TW4, P.TW5, P.SW, P.MC1, P.MC2,
    [1.55,6.95], P.CZ1, P.CZ2, P.CC1,
    [1.20,8.00], [1.10,7.60], [0.95,7.30], [0.82,7.10], P.TW4
  ]
};

function lonLatToSVG(lon, lat) {
  const x = 8 + (lon - 0.72) * (284 / 3.14);
  const y = 588 - (lat - 6.18) * (580 / 6.32);
  return [x.toFixed(1), y.toFixed(1)];
}

function buildPath(coords) {
  return coords.map((p, i) => {
    const [x, y] = lonLatToSVG(p[0], p[1]);
    return (i === 0 ? 'M' : 'L') + x + ',' + y;
  }).join(' ') + ' Z';
}

// Centres pour labels
const DEPT_CENTERS = {
  'Alibori':    [2.75, 11.85],
  'Atacora':    [1.30, 10.90],
  'Borgou':     [2.80, 10.10],
  'Donga':      [1.40, 9.35],
  'Collines':   [2.00, 8.15],
  'Zou':        [1.95, 7.15],
  'Plateau':    [2.62, 7.25],
  'Oueme':      [2.68, 6.60],
  'Atlantique': [2.12, 6.55],
  'Littoral':   [2.35, 6.38],
  'Mono':       [1.55, 6.55],
  'Couffo':     [1.05, 7.15]
};

/**
 * Genere le SVG de la carte du Benin
 */
export function renderBeninMap(deptData = {}) {
  let paths = '';
  let labels = '';

  Object.keys(DEPT_COORDS).forEach(dept => {
    const data = deptData[dept] || {};
    const fillColor = data.color || '#e5e7eb';
    const count = data.count || 0;
    const tooltip = (data.tooltip || `${dept}: ${count} inspection(s)`).replace(/'/g, "\\'");
    const d = buildPath(DEPT_COORDS[dept]);

    paths += `<path d="${d}" fill="${fillColor}" stroke="#374151" stroke-width="0.8" stroke-linejoin="round"
      style="cursor:pointer;transition:all 0.2s;opacity:0.92"
      onmouseover="this.style.opacity='1';this.style.strokeWidth='1.8';this.style.stroke='#0f172a';var t=document.getElementById('map-tooltip');t.textContent='${tooltip}';t.style.display='block'"
      onmouseout="this.style.opacity='0.92';this.style.strokeWidth='0.8';this.style.stroke='#374151';document.getElementById('map-tooltip').style.display='none'">
      <title>${data.tooltip || `${dept}: ${count} inspection(s)`}</title></path>`;

    const center = DEPT_CENTERS[dept];
    if (center) {
      const [cx, cy] = lonLatToSVG(center[0], center[1]);
      const isSmall = (dept === 'Littoral');
      const fs = isSmall ? 6 : dept.length > 8 ? 7.5 : 8.5;
      const label = isSmall ? 'Lit.' : dept;
      labels += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
        font-size="${fs}" font-weight="600" fill="#1e293b" pointer-events="none"
        font-family="'DM Sans',system-ui,sans-serif"
        style="text-shadow:0 0 2px #fff,0 0 4px #fff">${label}</text>`;
      if (count > 0) {
        const [bx, by] = [cx, parseFloat(cy) + (isSmall ? 9 : 12)];
        labels += `<circle cx="${bx}" cy="${by}" r="8" fill="${fillColor}" stroke="#374151" stroke-width="0.5" opacity="0.95"/>`;
        labels += `<text x="${bx}" y="${by}" text-anchor="middle" dominant-baseline="central"
          font-size="7" font-weight="700" fill="#1e293b" pointer-events="none"
          font-family="'JetBrains Mono',monospace">${count}</text>`;
      }
    }
  });

  return `
  <div style="position:relative">
    <svg viewBox="0 0 300 600" width="100%" style="max-width:300px;height:auto;display:block;margin:0 auto"
      xmlns="http://www.w3.org/2000/svg">
      <!-- Fond ocean -->
      <rect x="0" y="565" width="300" height="35" fill="#dbeafe" opacity="0.4" rx="0"/>
      <text x="150" y="585" text-anchor="middle" font-size="7.5" fill="#60a5fa" font-style="italic"
        font-family="'DM Sans',system-ui,sans-serif" opacity="0.7">Golfe de Guinee</text>
      <!-- Pays voisins -->
      <text x="4" y="300" font-size="7" fill="#cbd5e1" font-family="'DM Sans',system-ui,sans-serif"
        writing-mode="tb" letter-spacing="2">T O G O</text>
      <text x="296" y="250" font-size="7" fill="#cbd5e1" font-family="'DM Sans',system-ui,sans-serif"
        writing-mode="tb" letter-spacing="2">N I G E R I A</text>
      <text x="100" y="18" text-anchor="middle" font-size="7" fill="#cbd5e1"
        font-family="'DM Sans',system-ui,sans-serif" letter-spacing="1">BURKINA FASO</text>
      <text x="230" y="18" text-anchor="middle" font-size="7" fill="#cbd5e1"
        font-family="'DM Sans',system-ui,sans-serif" letter-spacing="1">NIGER</text>
      <!-- Departements -->
      <g id="depts">${paths}</g>
      <!-- Labels -->
      <g id="labels">${labels}</g>
      <!-- Titre -->
      <text x="150" y="8" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a"
        font-family="'DM Sans',system-ui,sans-serif" letter-spacing="0.15em">REPUBLIQUE DU BENIN</text>
    </svg>
    <div id="map-tooltip" style="display:none;position:absolute;bottom:6px;left:50%;transform:translateX(-50%);
      background:#1e293b;color:#f8fafc;padding:5px 12px;font-size:12px;border-radius:4px;
      font-family:'DM Sans',system-ui,sans-serif;white-space:nowrap;pointer-events:none;z-index:10;
      box-shadow:0 2px 8px rgba(0,0,0,0.2)"></div>
  </div>`;
}

export function getHeatColor(count, maxCount) {
  if (count === 0) return '#f3f4f6';
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio >= 0.75) return '#ef4444';
  if (ratio >= 0.5) return '#f97316';
  if (ratio >= 0.25) return '#3b82f6';
  return '#93c5fd';
}

export function getRiskColor(riskLevel) {
  if (riskLevel >= 4) return '#7f1d1d';
  if (riskLevel >= 3) return '#dc2626';
  if (riskLevel >= 2) return '#d97706';
  return '#16a34a';
}
