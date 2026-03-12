// ═══════════════════ ANALYTICS DASHBOARD ═══════════════════
// Vue detaillee pour admin et inspecteur en chef
// Analyses des inspections, ecarts, risques pour prise de decision
import { state } from './state.js';
import { invoke } from './api.js';
import { esc } from './utils.js';
import { DEPARTEMENTS, COMMUNE_TO_DEPT } from './benin-data.js';
import { adjustSeverity, determineComplianceRisk, determineGlobalRisk } from './risk-engine.js';

export async function renderAnalytics() {
  const panel = document.getElementById('analyticsPanel');
  panel.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted)">Chargement des donnees...</p>';

  try {
    const list = await invoke('cmd_list_inspections', { token: state.session.token, myOnly: false, status: null });
    if (!list.length) {
      panel.innerHTML = '<div style="text-align:center;padding:60px"><span style="font-size:48px;display:block;margin-bottom:16px">📊</span><h2>Aucune donnee</h2><p style="color:var(--text-muted)">Aucune inspection enregistree pour le moment.</p></div>';
      return;
    }

    // Charger les reponses pour les inspections completees/validees
    const completedInsps = list.filter(i => ['completed', 'validated'].includes(i.status));
    const inspWithResponses = [];
    for (const insp of completedInsps.slice(0, 50)) { // max 50 pour performance
      try {
        const resps = await invoke('cmd_get_responses', { token: state.session.token, inspectionId: insp.id });
        const grid = await invoke('get_grid', { token: state.session.token, gridId: insp.grid_id });
        if (grid) {
          const allCriteria = [];
          grid.sections.forEach(s => s.items.forEach(item => allCriteria.push({ ...item, sectionTitle: s.title, sectionId: s.id })));
          const responses = {};
          resps.forEach(r => { responses[r.criterion_id] = { conforme: r.conforme, observation: r.observation, severity: r.severity, factor: r.factor, factorJustification: r.factor_justification, immediateDanger: r.immediate_danger }; });
          inspWithResponses.push({ insp, grid, allCriteria, responses });
        }
      } catch (_) { /* skip */ }
    }

    // ═══════════════════ CALCULS ═══════════════════

    // Stats globales
    const total = list.length;
    const byStatus = {};
    list.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });

    // Par departement
    const byDept = {};
    list.forEach(i => {
      const dept = i.extra_meta?.departement || 'Non renseigne';
      byDept[dept] = (byDept[dept] || 0) + 1;
    });

    // Par commune
    const byCommune = {};
    list.forEach(i => {
      const commune = i.extra_meta?.commune || 'Non renseigne';
      byCommune[commune] = (byCommune[commune] || 0) + 1;
    });

    // Par type d'inspection
    const byType = {};
    list.forEach(i => {
      const t = i.inspection_type || 'Non renseigne';
      byType[t] = (byType[t] || 0) + 1;
    });

    // Par mois (12 derniers mois)
    const byMonth = {};
    list.forEach(i => {
      if (i.date_inspection) {
        const m = i.date_inspection.substring(0, 7); // YYYY-MM
        byMonth[m] = (byMonth[m] || 0) + 1;
      }
    });

    // Analyse des ecarts
    let totalEcarts = 0, totalCritiques = 0, totalMajeurs = 0, totalMineurs = 0, totalObs = 0;
    const ecartsBySection = {};
    const ecartsByEstab = {};
    const riskByEstab = {};

    inspWithResponses.forEach(({ insp, allCriteria, responses }) => {
      const ecarts = allCriteria.filter(c => responses[c.id]?.conforme === false);
      ecarts.forEach(e => {
        const r = responses[e.id];
        const baseSev = r?.severity || e.severity || (e.pre_opening ? 'critique' : 'majeur');
        const factor = r?.factor || 'neutre';
        const effSev = adjustSeverity(baseSev, factor);
        totalEcarts++;
        if (effSev === 'critique') totalCritiques++;
        else if (effSev === 'majeur') totalMajeurs++;
        else if (effSev === 'mineur') totalMineurs++;
        else totalObs++;

        // Par section
        const secKey = e.sectionTitle || 'Inconnue';
        if (!ecartsBySection[secKey]) ecartsBySection[secKey] = { critique: 0, majeur: 0, mineur: 0, info: 0, total: 0 };
        ecartsBySection[secKey][effSev]++;
        ecartsBySection[secKey].total++;

        // Par etablissement
        const estab = insp.establishment || 'Inconnu';
        if (!ecartsByEstab[estab]) ecartsByEstab[estab] = { critique: 0, majeur: 0, mineur: 0, info: 0, total: 0, dept: insp.extra_meta?.departement || '' };
        ecartsByEstab[estab][effSev]++;
        ecartsByEstab[estab].total++;
      });

      // Taux de conformite par etablissement
      const estab = insp.establishment || 'Inconnu';
      const totalC = allCriteria.length;
      const naCount = Object.values(responses).filter(r => r.conforme === 'na').length;
      const applicable = totalC - naCount;
      const ans = Object.values(responses).filter(r => r.conforme === true || r.conforme === false).length;
      const conf = Object.values(responses).filter(r => r.conforme === true).length;
      const rate = ans > 0 ? (conf / ans) * 100 : 0;
      const critiques = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'critique'; });
      const majeurs = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'majeur'; });
      const mineurs = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'mineur'; });
      const obsInfos = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'info'; });

      const risk = determineComplianceRisk(critiques, majeurs, mineurs, obsInfos);
      riskByEstab[estab] = {
        rate: rate.toFixed(1),
        risk,
        ecarts: ecarts.length,
        date: insp.date_inspection,
        dept: insp.extra_meta?.departement || '',
        commune: insp.extra_meta?.commune || '',
        id: insp.id
      };
    });

    // Top sections problematiques (tri par total ecarts)
    const topSections = Object.entries(ecartsBySection)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    // Etablissements a risque (tri par nombre d'ecarts)
    const riskEstabs = Object.entries(riskByEstab)
      .sort((a, b) => b[1].risk.level - a[1].risk.level || b[1].ecarts - a[1].ecarts);

    // Couverture geographique
    const deptCoverage = DEPARTEMENTS.map(d => ({
      nom: d.nom,
      inspections: byDept[d.nom] || 0,
      communes_inspectees: d.communes.filter(c => byCommune[c] > 0).length,
      communes_total: d.communes.length
    }));

    // ═══════════════════ RENDU ═══════════════════
    const statusLabels = { draft: 'Brouillon', in_progress: 'En cours', completed: 'Terminee', validated: 'Validee', archived: 'Archivee' };
    const sevColors = { critique: '#dc2626', majeur: '#d97706', mineur: '#2563eb', info: '#6b7280' };

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-m)">
        <div>
          <h2>Tableau de bord analytique</h2>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px">Analyse des inspections pour la prise de decision basee sur le risque</p>
        </div>
        <button class="btn-sm" onclick="renderAnalytics()">Actualiser</button>
      </div>

      <!-- Stats globales -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:24px">
        <div class="ana-card"><span class="ana-num">${total}</span><span class="ana-lbl">Inspections</span></div>
        <div class="ana-card"><span class="ana-num" style="color:#16a34a">${byStatus.validated || 0}</span><span class="ana-lbl">Validees</span></div>
        <div class="ana-card"><span class="ana-num" style="color:#d97706">${byStatus.in_progress || 0}</span><span class="ana-lbl">En cours</span></div>
        <div class="ana-card"><span class="ana-num" style="color:var(--accent)">${totalEcarts}</span><span class="ana-lbl">Ecarts totaux</span></div>
        <div class="ana-card"><span class="ana-num" style="color:#dc2626">${totalCritiques}</span><span class="ana-lbl">Critiques</span></div>
        <div class="ana-card"><span class="ana-num" style="color:#d97706">${totalMajeurs}</span><span class="ana-lbl">Majeurs</span></div>
        <div class="ana-card"><span class="ana-num" style="color:#2563eb">${totalMineurs}</span><span class="ana-lbl">Mineurs</span></div>
        <div class="ana-card"><span class="ana-num" style="color:#6b7280">${totalObs}</span><span class="ana-lbl">Observations</span></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <!-- Repartition par type -->
        <div class="ana-section">
          <h3 class="ana-section-title">Repartition par type d'inspection</h3>
          ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
            <div class="ana-bar-row">
              <span class="ana-bar-label">${type}</span>
              <div class="ana-bar-track"><div class="ana-bar-fill" style="width:${(count / total * 100).toFixed(0)}%;background:var(--accent)"></div></div>
              <span class="ana-bar-val">${count}</span>
            </div>
          `).join('')}
        </div>

        <!-- Repartition par statut -->
        <div class="ana-section">
          <h3 class="ana-section-title">Repartition par statut</h3>
          ${Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
            const colors = { draft: '#9ca3af', in_progress: '#d97706', completed: '#2563eb', validated: '#16a34a', archived: '#6b7280' };
            return `
            <div class="ana-bar-row">
              <span class="ana-bar-label">${statusLabels[status] || status}</span>
              <div class="ana-bar-track"><div class="ana-bar-fill" style="width:${(count / total * 100).toFixed(0)}%;background:${colors[status] || '#6b7280'}"></div></div>
              <span class="ana-bar-val">${count}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Couverture geographique -->
      <div class="ana-section" style="margin-bottom:24px">
        <h3 class="ana-section-title">Couverture geographique par departement</h3>
        <table class="tbl" style="font-size:13px">
          <thead><tr><th>Departement</th><th>Inspections</th><th>Communes inspectees</th><th>Couverture</th><th>Indicateur</th></tr></thead>
          <tbody>
          ${deptCoverage.sort((a, b) => b.inspections - a.inspections).map(d => {
            const pct = d.communes_total > 0 ? (d.communes_inspectees / d.communes_total * 100).toFixed(0) : 0;
            const color = pct >= 75 ? '#16a34a' : pct >= 40 ? '#d97706' : pct > 0 ? '#dc2626' : '#9ca3af';
            return `<tr>
              <td><strong>${d.nom}</strong></td>
              <td style="text-align:center">${d.inspections}</td>
              <td style="text-align:center">${d.communes_inspectees} / ${d.communes_total}</td>
              <td><div class="ana-bar-track" style="width:120px;display:inline-block"><div class="ana-bar-fill" style="width:${pct}%;background:${color}"></div></div> ${pct}%</td>
              <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span> ${pct >= 75 ? 'Bonne' : pct >= 40 ? 'Partielle' : pct > 0 ? 'Faible' : 'Aucune'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Top sections problematiques -->
      ${topSections.length ? `
      <div class="ana-section" style="margin-bottom:24px">
        <h3 class="ana-section-title">Sections les plus problematiques</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Sections avec le plus d'ecarts — identifie les domaines necessitant une attention prioritaire</p>
        <table class="tbl" style="font-size:13px">
          <thead><tr><th>Section</th><th style="text-align:center;color:#dc2626">Critiques</th><th style="text-align:center;color:#d97706">Majeurs</th><th style="text-align:center;color:#2563eb">Mineurs</th><th style="text-align:center;color:#6b7280">Obs.</th><th style="text-align:center">Total</th></tr></thead>
          <tbody>
          ${topSections.map(([name, data]) => `<tr>
            <td><strong>${name}</strong></td>
            <td style="text-align:center;font-weight:600;color:#dc2626">${data.critique || '—'}</td>
            <td style="text-align:center;font-weight:600;color:#d97706">${data.majeur || '—'}</td>
            <td style="text-align:center;font-weight:600;color:#2563eb">${data.mineur || '—'}</td>
            <td style="text-align:center;color:#6b7280">${data.info || '—'}</td>
            <td style="text-align:center;font-weight:700">${data.total}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Profil de risque des etablissements -->
      ${riskEstabs.length ? `
      <div class="ana-section" style="margin-bottom:24px">
        <h3 class="ana-section-title">Profil de risque des etablissements</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Classification pour la planification des inspections basees sur le risque — prioriser les etablissements a risque eleve</p>
        <table class="tbl" style="font-size:13px">
          <thead><tr><th>Etablissement</th><th>Departement</th><th>Conformite</th><th>Ecarts</th><th>Niveau de risque</th><th>Derniere inspection</th><th>Action</th></tr></thead>
          <tbody>
          ${riskEstabs.map(([name, data]) => `<tr>
            <td><strong>${esc(name)}</strong><br/><small style="color:var(--text-muted)">${data.commune}</small></td>
            <td>${data.dept || '—'}</td>
            <td><strong>${data.rate}%</strong></td>
            <td style="text-align:center;font-weight:600">${data.ecarts}</td>
            <td><span class="risk-badge" style="border-color:${data.risk.color};color:${data.risk.color};background:${data.risk.bgColor};font-size:11px"><span class="risk-dot" style="background:${data.risk.color}"></span>${data.risk.label}</span></td>
            <td class="mono">${data.date || '—'}</td>
            <td><button class="btn-sm" style="font-size:11px" onclick="openInspection('${data.id}')">Voir</button></td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Tendances mensuelles -->
      ${Object.keys(byMonth).length ? `
      <div class="ana-section">
        <h3 class="ana-section-title">Activite mensuelle</h3>
        <div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:12px 0">
          ${Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, count]) => {
            const maxCount = Math.max(...Object.values(byMonth));
            const pct = maxCount > 0 ? (count / maxCount * 100) : 0;
            const [y, m] = month.split('-');
            const mNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <span style="font-size:11px;font-weight:600">${count}</span>
              <div style="width:100%;background:var(--accent);height:${Math.max(pct, 5)}%;min-height:4px;border-radius:2px 2px 0 0"></div>
              <span style="font-size:10px;color:var(--text-muted)">${mNames[parseInt(m) - 1]}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  } catch (e) {
    panel.innerHTML = `<p style="color:var(--accent);padding:20px">Erreur: ${e}</p>`;
  }
}
