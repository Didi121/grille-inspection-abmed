// ═══════════════════ GRILLE VISUALIZATION ═══════════════════
// Visualisation interactive des grilles d'inspection

import { buildAllGridsJS } from './grids-data.js';

// Couleurs pour les différents éléments
const COLORS = {
  primary: '#2563eb',
  secondary: '#6b7280',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0ea5e9'
};

// Icons pour les types de critères
const CRITERIA_ICONS = {
  pre_opening: '⚠️',  // Critère pré-ouverture
  standard: '📋',     // Critère standard
  info: 'ℹ️'         // Information
};

export function renderGrilleVisualization() {
  // Cette fonction est maintenant appelée depuis admin-grids.js
  // Elle sert principalement à s'assurer que les fonctions sont disponibles
  return true;
}

export function showGrilleVisualization() {
  const gridsPanel = document.getElementById('gridsPanel');
  const gridList = gridsPanel.querySelector('.grid-list');
  const vizContainer = document.getElementById('grille-visualization');
  
  if (!gridList || !vizContainer) return;

  // Basculer l'affichage entre le panneau normal et la visualisation
  const isCurrentlyVisible = vizContainer.style.display === 'block';
  
  if (isCurrentlyVisible) {
    // Retour à la vue normale
    gridList.style.display = 'grid';
    vizContainer.style.display = 'none';
    vizContainer.innerHTML = '';
  } else {
    // Afficher la visualisation
    gridList.style.display = 'none';
    vizContainer.style.display = 'block';
    renderVisualizationContent(vizContainer);
  }
}

function renderVisualizationContent(container) {
  const grids = buildAllGridsJS();
  
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0;">📊 Visualisation des Grilles d'Inspection</h2>
      <button class="btn-sm" onclick="showGrilleVisualization()" style="background: var(--accent); color: white;">Retour à la gestion</button>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
      ${grids.map(grid => `
        <div style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <span style="font-size: 24px;">${grid.icon}</span>
            <div>
              <h3 style="margin: 0; font-size: 18px; color: var(--text);">${grid.name}</h3>
              <p style="margin: 4px 0 0; font-size: 13px; color: var(--text-muted);">${grid.code} v${grid.version}</p>
            </div>
          </div>
          <p style="font-size: 14px; color: var(--text); margin-bottom: 12px;">${grid.description}</p>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
            <span>${grid.sections.length} sections</span>
            <span>${grid.sections.reduce((acc, sec) => acc + sec.items.length, 0)} critères</span>
          </div>
        </div>
      `).join('')}
    </div>
    
    <div style="margin-bottom: 20px;">
      <h3 style="margin: 0 0 16px 0; color: var(--text);">Détail des Sections et Critères</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 16px;">
        ${grids.map(grid => `
          <div style="background: white; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
            <div style="background: ${grid.color}10; padding: 12px 16px; border-bottom: 1px solid var(--border);">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">${grid.icon}</span>
                <h4 style="margin: 0; color: ${grid.color}; font-size: 16px;">${grid.name}</h4>
              </div>
            </div>
            <div style="max-height: 400px; overflow-y: auto;">
              ${grid.sections.map(section => `
                <div style="padding: 12px 16px; border-bottom: 1px solid var(--border);">
                  <h5 style="margin: 0 0 8px 0; font-size: 14px; color: var(--text); display: flex; align-items: center; gap: 6px;">
                    ${section.title}
                    <span style="font-size: 11px; background: var(--gray-100); padding: 2px 6px; border-radius: 10px; color: var(--text-muted);">
                      ${section.items.length} critères
                    </span>
                  </h5>
                  <div style="margin-left: 12px;">
                    ${section.items.map(item => `
                      <div style="margin-bottom: 8px; padding: 8px; background: var(--gray-50); border-radius: 4px; border-left: 3px solid ${item.pre_opening ? COLORS.danger : COLORS.secondary};">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                          <div>
                            <div style="font-weight: 500; font-size: 13px; color: var(--text); margin-bottom: 4px;">
                              ${CRITERIA_ICONS[item.pre_opening ? 'pre_opening' : 'standard']} ${item.reference}
                            </div>
                            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                              ${item.description}
                            </div>
                          </div>
                          ${item.pre_opening ? `
                            <span style="background: ${COLORS.danger}10; color: ${COLORS.danger}; font-size: 10px; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">
                              Pré-ouverture
                            </span>
                          ` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-top: 20px;">
      <h3 style="margin: 0 0 12px 0; color: var(--text);">Légende</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; font-size: 13px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">⚠️</span>
          <div>
            <div style="font-weight: 500; color: var(--text);">Critère pré-ouverture</div>
            <div style="color: var(--text-muted); font-size: 12px;">Critique pour l'ouverture</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📋</span>
          <div>
            <div style="font-weight: 500; color: var(--text);">Critère standard</div>
            <div style="color: var(--text-muted); font-size: 12px;">Critère normal d'inspection</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 12px; height: 12px; background: ${COLORS.danger}; border-radius: 2px;"></div>
          <div>
            <div style="font-weight: 500; color: var(--text);">Bordure rouge</div>
            <div style="color: var(--text-muted); font-size: 12px;">Critère pré-ouverture</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 12px; height: 12px; background: ${COLORS.secondary}; border-radius: 2px;"></div>
          <div>
            <div style="font-weight: 500; color: var(--text);">Bordure grise</div>
            <div style="color: var(--text-muted); font-size: 12px;">Critère standard</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Fonction utilitaire pour exporter les données de grille en JSON
export function exportGridAsJSON(gridId) {
  const grids = buildAllGridsJS();
  const grid = grids.find(g => g.id === gridId);
  
  if (!grid) {
    console.error(`Grille avec ID ${gridId} non trouvée`);
    return;
  }
  
  const dataStr = JSON.stringify(grid, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = `grille_${grid.id}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// Rendre certaines fonctions globales pour qu'elles puissent être appelées depuis le HTML
window.showGrilleVisualization = showGrilleVisualization;
window.exportGridAsJSON = exportGridAsJSON;