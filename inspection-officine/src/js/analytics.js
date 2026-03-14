// ═══════════════════ ANALYTICS DASHBOARD ═══════════════════
// Tableau de bord de pilotage — indicateurs pour la prise de decision
import { state } from './state.js';
import { invoke } from './api.js';
import { esc } from './utils.js';
import { DEPARTEMENTS, COMMUNE_TO_DEPT } from './benin-data.js';
import { adjustSeverity, determineComplianceRisk, determineGlobalRisk } from './risk-engine.js';

let _cache = null;

export async function renderAnalytics() {
  const panel = document.getElementById('analyticsPanel');
  panel.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted)">Chargement des donnees...</p>';

  try {
    const list = await invoke('cmd_list_inspections', { token: state.session.token, myOnly: false, status: null });
    if (!list.length) {
      panel.innerHTML = '<div style="text-align:center;padding:60px"><span style="font-size:48px;display:block;margin-bottom:16px">📊</span><h2>Aucune donnee</h2><p style="color:var(--text-muted)">Aucune inspection enregistree pour le moment.</p></div>';
      return;
    }

    // ═══════════════════ CHARGEMENT DES REPONSES ═══════════════════
    const completedInsps = list.filter(i => ['completed', 'validated'].includes(i.status));
    const inspWithResponses = [];
    for (const insp of completedInsps.slice(0, 50)) {
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
      } catch (_) {}
    }

    // ═══════════════════ CALCULS ═══════════════════
    const total = list.length;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // --- Statuts ---
    const byStatus = {};
    list.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });

    // --- Par type ---
    const byType = {};
    list.forEach(i => { byType[i.inspection_type || 'Non renseigne'] = (byType[i.inspection_type || 'Non renseigne'] || 0) + 1; });

    // --- Par departement / commune ---
    const byDept = {};
    const byCommune = {};
    list.forEach(i => {
      const dept = i.extra_meta?.departement || 'Non renseigne';
      const commune = i.extra_meta?.commune || 'Non renseigne';
      byDept[dept] = (byDept[dept] || 0) + 1;
      byCommune[commune] = (byCommune[commune] || 0) + 1;
    });

    // --- Par mois ---
    const byMonth = {};
    list.forEach(i => { if (i.date_inspection) byMonth[i.date_inspection.substring(0, 7)] = (byMonth[i.date_inspection.substring(0, 7)] || 0) + 1; });

    // --- KPI 1 : TAUX DE CONFORMITE MOYEN ---
    let sumRates = 0, countRates = 0;
    const ratesOverTime = []; // {month, rate}

    // --- Ecarts ---
    let totalEcarts = 0, totalCritiques = 0, totalMajeurs = 0, totalMineurs = 0, totalObs = 0;
    const ecartsBySection = {};
    const ecartsByEstab = {};
    const riskByEstab = {};
    const rateByEstab = {};

    // --- Charge inspecteurs ---
    const inspectorLoad = {}; // {name: {total, completed, validated}}

    // --- Suivi CAPA ---
    let capaAttendu = 0, capaRecu = 0, capaEnRetard = 0;
    let rapportEnvoye = 0, rapportNonEnvoye = 0;
    let inspCloturees = 0;
    const alertes = [];

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

        const secKey = e.sectionTitle || 'Inconnue';
        if (!ecartsBySection[secKey]) ecartsBySection[secKey] = { critique: 0, majeur: 0, mineur: 0, info: 0, total: 0 };
        ecartsBySection[secKey][effSev]++;
        ecartsBySection[secKey].total++;
      });

      // Taux de conformite
      const totalC = allCriteria.length;
      const naCount = Object.values(responses).filter(r => r.conforme === 'na').length;
      const ans = Object.values(responses).filter(r => r.conforme === true || r.conforme === false).length;
      const conf = Object.values(responses).filter(r => r.conforme === true).length;
      const rate = ans > 0 ? (conf / ans) * 100 : 0;
      sumRates += rate; countRates++;

      // Taux par mois
      if (insp.date_inspection) {
        const m = insp.date_inspection.substring(0, 7);
        if (!ratesOverTime.find(r => r.month === m)) ratesOverTime.push({ month: m, rates: [], avg: 0 });
        const entry = ratesOverTime.find(r => r.month === m);
        entry.rates.push(rate);
      }

      const estab = insp.establishment || 'Inconnu';
      rateByEstab[estab] = rate;

      // Risque
      const critiques = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'critique'; });
      const majeurs = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'majeur'; });
      const mineurs = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'mineur'; });
      const obsInfos = ecarts.filter(e => { const r = responses[e.id]; return adjustSeverity(r?.severity || e.severity || 'majeur', r?.factor || 'neutre') === 'info'; });
      const risk = determineComplianceRisk(critiques, majeurs, mineurs, obsInfos);
      riskByEstab[estab] = { rate: rate.toFixed(1), risk, ecarts: ecarts.length, date: insp.date_inspection, dept: insp.extra_meta?.departement || '', commune: insp.extra_meta?.commune || '', id: insp.id };
    });

    // Taux moyen par mois
    ratesOverTime.forEach(e => { e.avg = e.rates.reduce((s, r) => s + r, 0) / e.rates.length; });
    ratesOverTime.sort((a, b) => a.month.localeCompare(b.month));

    // Charge inspecteurs (toutes inspections)
    list.forEach(i => {
      const lead = i.extra_meta?.lead_inspector || i.created_by_name || 'Inconnu';
      if (!inspectorLoad[lead]) inspectorLoad[lead] = { total: 0, draft: 0, in_progress: 0, completed: 0, validated: 0 };
      inspectorLoad[lead].total++;
      inspectorLoad[lead][i.status] = (inspectorLoad[lead][i.status] || 0) + 1;

      // Membres d'equipe
      if (i.inspectors && i.inspectors.length) {
        i.inspectors.forEach(name => {
          if (!inspectorLoad[name]) inspectorLoad[name] = { total: 0, draft: 0, in_progress: 0, completed: 0, validated: 0 };
          inspectorLoad[name].total++;
          inspectorLoad[name][i.status] = (inspectorLoad[name][i.status] || 0) + 1;
        });
      }
    });

    // Suivi CAPA et alertes
    list.forEach(i => {
      const m = i.extra_meta || {};
      // Rapport envoye ?
      if (m.date_envoi_rapport) rapportEnvoye++;
      else if (['completed', 'validated'].includes(i.status)) rapportNonEnvoye++;

      // CAPA
      const dateCapa = m.date_capa || (m.date_envoi_rapport ? (() => { const d = new Date(m.date_envoi_rapport); d.setDate(d.getDate() + 15); return d.toISOString().split('T')[0]; })() : null);
      if (dateCapa && ['completed', 'validated'].includes(i.status)) {
        capaAttendu++;
        if (m.date_retour_capa) capaRecu++;
        else if (dateCapa < todayStr) {
          capaEnRetard++;
          alertes.push({ type: 'capa_retard', severity: 'high', msg: `CAPA en retard : ${i.establishment || '#' + i.id.substring(0, 6)} (attendu le ${fmtD(dateCapa)})`, id: i.id });
        }
      }

      // Cloture
      if (m.date_cloture) inspCloturees++;

      // Inspection en cours depuis longtemps (>30 jours)
      if (i.status === 'in_progress' && i.date_inspection) {
        const daysSince = Math.floor((today - new Date(i.date_inspection)) / 86400000);
        if (daysSince > 30) alertes.push({ type: 'stale', severity: 'medium', msg: `Inspection en cours depuis ${daysSince}j : ${i.establishment || '#' + i.id.substring(0, 6)}`, id: i.id });
      }

      // Rapport non envoye apres 15 jours
      if (['completed', 'validated'].includes(i.status) && !m.date_envoi_rapport && i.date_inspection) {
        const daysSince = Math.floor((today - new Date(i.date_inspection)) / 86400000);
        if (daysSince > 15) alertes.push({ type: 'rapport_retard', severity: 'medium', msg: `Rapport non envoye (${daysSince}j) : ${i.establishment || '#' + i.id.substring(0, 6)}`, id: i.id });
      }
    });

    // Repartition des risques
    const riskLevels = { 1: 0, 2: 0, 3: 0, 4: 0 };
    Object.values(riskByEstab).forEach(r => { riskLevels[r.risk.level] = (riskLevels[r.risk.level] || 0) + 1; });

    // Top sections
    const topSections = Object.entries(ecartsBySection).sort((a, b) => b[1].total - a[1].total).slice(0, 10);

    // Etablissements a risque
    const riskEstabs = Object.entries(riskByEstab).sort((a, b) => b[1].risk.level - a[1].risk.level || b[1].ecarts - a[1].ecarts);

    // Couverture geographique
    const deptCoverage = DEPARTEMENTS.map(d => ({
      nom: d.nom, inspections: byDept[d.nom] || 0,
      communes_inspectees: d.communes.filter(c => byCommune[c] > 0).length,
      communes_total: d.communes.length
    }));
    const totalCommunesCouvertes = deptCoverage.reduce((s, d) => s + d.communes_inspectees, 0);
    const totalCommunes = deptCoverage.reduce((s, d) => s + d.communes_total, 0);
    const deptAvecInspection = deptCoverage.filter(d => d.inspections > 0).length;

    // KPIs calcules
    const avgRate = countRates > 0 ? (sumRates / countRates).toFixed(1) : '—';
    const tauxValidation = total > 0 ? ((byStatus.validated || 0) / total * 100).toFixed(0) : 0;
    const tauxCloture = capaAttendu > 0 ? (inspCloturees / capaAttendu * 100).toFixed(0) : '—';
    const tauxRetourCapa = capaAttendu > 0 ? (capaRecu / capaAttendu * 100).toFixed(0) : '—';
    const tauxCouverture = totalCommunes > 0 ? (totalCommunesCouvertes / totalCommunes * 100).toFixed(0) : 0;
    const ecartsMoyens = inspWithResponses.length > 0 ? (totalEcarts / inspWithResponses.length).toFixed(1) : '—';

    // ═══════════════════ RENDU HTML ═══════════════════
    _cache = { kpis: { total, avgRate, tauxValidation, ecartsMoyens, tauxRetourCapa,
      tauxCloture, tauxCouverture, totalEcarts, totalCritiques, totalMajeurs,
      totalMineurs, totalObs, capaAttendu, capaRecu, capaEnRetard, rapportEnvoye,
      rapportNonEnvoye, inspCloturees, deptAvecInspection, totalCommunesCouvertes, totalCommunes },
      riskByEstab, ecartsBySection, inspectorLoad, ratesOverTime, byMonth, byType, byStatus, deptCoverage
    };
    const statusLabels = { draft: 'Brouillon', in_progress: 'En cours', completed: 'Terminee', validated: 'Validee', archived: 'Archivee' };
    const riskLabels = { 1: 'Conforme', 2: 'Sous reserve', 3: 'Non conforme', 4: 'Risque immediat' };
    const riskColors = { 1: '#16a34a', 2: '#d97706', 3: '#dc2626', 4: '#7f1d1d' };

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <div>
          <h2 style="margin:0">Tableau de bord de pilotage</h2>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px">Indicateurs cles pour la prise de decision basee sur le risque</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-sm" onclick="exportIndicateursCSV()">Exporter indicateurs CSV</button>
          <button class="btn-sm" onclick="renderAnalytics()">Actualiser</button>
        </div>
      </div>

      <!-- ══════════ SECTION 1 : KPIs PRINCIPAUX ══════════ -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        ${kpiCard(avgRate+'%', 'Taux de conformite moyen', rateColor(parseFloat(avgRate)), 'Moyenne des taux de conformite des inspections terminees/validees')}
        ${kpiCard(total, 'Inspections totales', 'var(--accent)', '')}
        ${kpiCard(tauxValidation+'%', 'Taux de validation', parseInt(tauxValidation) >= 70 ? '#16a34a' : '#d97706', (byStatus.validated || 0) + ' validees sur ' + total)}
        ${kpiCard(ecartsMoyens, 'Ecarts par inspection', parseFloat(ecartsMoyens) > 10 ? '#dc2626' : parseFloat(ecartsMoyens) > 5 ? '#d97706' : '#16a34a', 'Nombre moyen d\'ecarts par inspection evaluee')}
      </div>

      <!-- ══════════ SECTION 2 : ALERTES ET SUIVI ══════════ -->
      ${alertes.length ? `
      <div class="ana-section" style="margin-bottom:20px;border-left:4px solid #dc2626">
        <h3 class="ana-section-title" style="color:#dc2626">Alertes et actions requises (${alertes.length})</h3>
        <div style="max-height:200px;overflow-y:auto">
          ${alertes.map(a => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span style="width:8px;height:8px;border-radius:50%;background:${a.severity === 'high' ? '#dc2626' : '#d97706'};flex-shrink:0"></span>
              <span style="flex:1">${a.msg}</span>
              <button class="btn-sm" style="font-size:11px;padding:2px 8px" onclick="viewReport('${a.id}')">Voir</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- ══════════ SECTION 3 : SUIVI CAPA ET RAPPORTS ══════════ -->
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px">
        <div class="ana-section">
          <h3 class="ana-section-title">Suivi des CAPA</h3>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px">
            ${miniKpi(capaAttendu, 'CAPA attendus', '#475569')}
            ${miniKpi(capaRecu, 'CAPA recus', '#16a34a')}
            ${miniKpi(capaEnRetard, 'En retard', capaEnRetard > 0 ? '#dc2626' : '#16a34a')}
            ${miniKpi(tauxRetourCapa + '%', 'Taux de retour', parseInt(tauxRetourCapa) >= 70 ? '#16a34a' : '#d97706')}
          </div>
          ${gauge('Retour CAPA', parseInt(tauxRetourCapa) || 0)}
        </div>

        <div class="ana-section">
          <h3 class="ana-section-title">Suivi des rapports et cloture</h3>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px">
            ${miniKpi(rapportEnvoye, 'Rapports envoyes', '#16a34a')}
            ${miniKpi(rapportNonEnvoye, 'Non envoyes', rapportNonEnvoye > 0 ? '#d97706' : '#16a34a')}
            ${miniKpi(inspCloturees, 'Dossiers clotures', '#475569')}
            ${miniKpi(tauxCloture + '%', 'Taux de cloture', parseInt(tauxCloture) >= 60 ? '#16a34a' : '#d97706')}
          </div>
          ${gauge('Cloture des dossiers', parseInt(tauxCloture) || 0)}
        </div>
      </div>

      <!-- ══════════ SECTION 4 : REPARTITION DES RISQUES ══════════ -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div class="ana-section">
          <h3 class="ana-section-title">Repartition des niveaux de risque</h3>
          <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Sur ${inspWithResponses.length} inspection(s) evaluee(s)</p>
          ${[
            { level: 4, label: 'Risque immediat', color: '#7f1d1d', bg: '#fef2f2' },
            { level: 3, label: 'Non conforme', color: '#dc2626', bg: '#fef2f2' },
            { level: 2, label: 'Conformite sous reserve', color: '#d97706', bg: '#fffbeb' },
            { level: 1, label: 'Conforme', color: '#16a34a', bg: '#f0fdf4' }
          ].map(r => {
            const count = riskLevels[r.level] || 0;
            const pct = inspWithResponses.length > 0 ? (count / inspWithResponses.length * 100).toFixed(0) : 0;
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="width:12px;height:12px;border-radius:50%;background:${r.color};flex-shrink:0"></span>
              <span style="flex:1;font-size:13px;font-weight:500">${r.label}</span>
              <span style="font-size:22px;font-weight:700;color:${r.color};min-width:40px;text-align:right">${count}</span>
              <span style="font-size:11px;color:var(--text-muted);min-width:40px">${pct}%</span>
            </div>`;
          }).join('')}
        </div>

        <div class="ana-section">
          <h3 class="ana-section-title">Repartition des ecarts par severite</h3>
          <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px">${totalEcarts} ecart(s) au total</p>
          ${[
            { label: 'Critiques', count: totalCritiques, color: '#dc2626' },
            { label: 'Majeurs', count: totalMajeurs, color: '#d97706' },
            { label: 'Mineurs', count: totalMineurs, color: '#2563eb' },
            { label: 'Observations', count: totalObs, color: '#6b7280' }
          ].map(e => `
            <div class="ana-bar-row">
              <span class="ana-bar-label" style="min-width:100px">${e.label}</span>
              <div class="ana-bar-track"><div class="ana-bar-fill" style="width:${totalEcarts > 0 ? (e.count / totalEcarts * 100).toFixed(0) : 0}%;background:${e.color}"></div></div>
              <span class="ana-bar-val" style="color:${e.color}">${e.count}</span>
            </div>`).join('')}
          <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted)">
            Ratio critique+majeur : <strong style="color:${(totalCritiques + totalMajeurs) / Math.max(totalEcarts, 1) > 0.5 ? '#dc2626' : '#16a34a'}">${totalEcarts > 0 ? ((totalCritiques + totalMajeurs) / totalEcarts * 100).toFixed(0) : 0}%</strong> des ecarts
          </div>
        </div>
      </div>

      <!-- ══════════ SECTION 5 : TENDANCE CONFORMITE ══════════ -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        ${ratesOverTime.length > 1 ? `
        <div class="ana-section">
          <h3 class="ana-section-title">Tendance du taux de conformite</h3>
          <div style="display:flex;align-items:flex-end;gap:6px;height:140px;padding:12px 0">
            ${ratesOverTime.slice(-12).map(e => {
              const color = e.avg >= 80 ? '#16a34a' : e.avg >= 60 ? '#d97706' : '#dc2626';
              const [y, m] = e.month.split('-');
              const mNames = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <span style="font-size:10px;font-weight:600;color:${color}">${e.avg.toFixed(0)}%</span>
                <div style="width:100%;background:${color};height:${Math.max(e.avg, 5)}%;min-height:4px;border-radius:2px 2px 0 0;opacity:0.85"></div>
                <span style="font-size:9px;color:var(--text-muted)">${mNames[parseInt(m) - 1]}</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : '<div></div>'}

        <div class="ana-section">
          <h3 class="ana-section-title">Volume d'inspections par mois</h3>
          ${Object.keys(byMonth).length ? `
          <div style="display:flex;align-items:flex-end;gap:6px;height:140px;padding:12px 0">
            ${Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, count]) => {
              const maxCount = Math.max(...Object.values(byMonth));
              const pct = maxCount > 0 ? (count / maxCount * 100) : 0;
              const [y, m] = month.split('-');
              const mNames = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <span style="font-size:10px;font-weight:600">${count}</span>
                <div style="width:100%;background:var(--accent);height:${Math.max(pct, 5)}%;min-height:4px;border-radius:2px 2px 0 0;opacity:0.8"></div>
                <span style="font-size:9px;color:var(--text-muted)">${mNames[parseInt(m) - 1]}</span>
              </div>`;
            }).join('')}
          </div>` : '<p style="color:var(--text-muted);font-size:13px">Pas assez de donnees</p>'}
        </div>
      </div>

      <!-- ══════════ SECTION 6 : REPARTITION PAR TYPE + STATUT ══════════ -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div class="ana-section">
          <h3 class="ana-section-title">Par type d'inspection</h3>
          ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
            <div class="ana-bar-row">
              <span class="ana-bar-label">${type}</span>
              <div class="ana-bar-track"><div class="ana-bar-fill" style="width:${(count / total * 100).toFixed(0)}%;background:var(--accent)"></div></div>
              <span class="ana-bar-val">${count}</span>
            </div>`).join('')}
        </div>

        <div class="ana-section">
          <h3 class="ana-section-title">Par statut</h3>
          ${Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
            const colors = { draft: '#9ca3af', in_progress: '#d97706', completed: '#2563eb', validated: '#16a34a', archived: '#6b7280' };
            return `<div class="ana-bar-row">
              <span class="ana-bar-label">${statusLabels[status] || status}</span>
              <div class="ana-bar-track"><div class="ana-bar-fill" style="width:${(count / total * 100).toFixed(0)}%;background:${colors[status] || '#6b7280'}"></div></div>
              <span class="ana-bar-val">${count}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- ══════════ SECTION 7 : CHARGE PAR INSPECTEUR ══════════ -->
      <div class="ana-section" style="margin-bottom:24px">
        <h3 class="ana-section-title">Charge de travail par inspecteur</h3>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Nombre d'inspections assignees (en tant que principal ou membre d'equipe)</p>
        <table class="tbl" style="font-size:13px">
          <thead><tr><th>Inspecteur</th><th style="text-align:center">Total</th><th style="text-align:center">En cours</th><th style="text-align:center">Terminees</th><th style="text-align:center">Validees</th><th>Repartition</th></tr></thead>
          <tbody>
          ${Object.entries(inspectorLoad).sort((a, b) => b[1].total - a[1].total).slice(0, 15).map(([name, data]) => {
            const pctVal = data.total > 0 ? (((data.validated || 0) / data.total) * 100).toFixed(0) : 0;
            return `<tr>
              <td><strong>${esc(name)}</strong></td>
              <td style="text-align:center;font-weight:600">${data.total}</td>
              <td style="text-align:center;color:#d97706">${data.in_progress || 0}</td>
              <td style="text-align:center;color:#2563eb">${data.completed || 0}</td>
              <td style="text-align:center;color:#16a34a">${data.validated || 0}</td>
              <td><div class="ana-bar-track" style="width:120px;display:inline-block"><div class="ana-bar-fill" style="width:${pctVal}%;background:#16a34a"></div></div> <span style="font-size:11px;color:var(--text-muted)">${pctVal}% val.</span></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>

      <!-- ══════════ SECTION 8 : SECTIONS PROBLEMATIQUES ══════════ -->
      ${topSections.length ? `
      <div class="ana-section" style="margin-bottom:24px">
        <h3 class="ana-section-title">Sections les plus problematiques</h3>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Domaines necessitant une attention prioritaire</p>
        <table class="tbl" style="font-size:13px">
          <thead><tr><th>Section</th><th style="text-align:center;color:#dc2626">Crit.</th><th style="text-align:center;color:#d97706">Maj.</th><th style="text-align:center;color:#2563eb">Min.</th><th style="text-align:center;color:#6b7280">Obs.</th><th style="text-align:center">Total</th><th>Impact</th></tr></thead>
          <tbody>
          ${topSections.map(([name, data]) => {
            const impactScore = data.critique * 4 + data.majeur * 2 + data.mineur * 1;
            const maxImpact = topSections[0] ? topSections[0][1].critique * 4 + topSections[0][1].majeur * 2 + topSections[0][1].mineur * 1 : 1;
            return `<tr>
              <td><strong>${name}</strong></td>
              <td style="text-align:center;font-weight:600;color:#dc2626">${data.critique || '—'}</td>
              <td style="text-align:center;font-weight:600;color:#d97706">${data.majeur || '—'}</td>
              <td style="text-align:center;font-weight:600;color:#2563eb">${data.mineur || '—'}</td>
              <td style="text-align:center;color:#6b7280">${data.info || '—'}</td>
              <td style="text-align:center;font-weight:700">${data.total}</td>
              <td><div class="ana-bar-track" style="width:80px;display:inline-block"><div class="ana-bar-fill" style="width:${maxImpact > 0 ? (impactScore / maxImpact * 100).toFixed(0) : 0}%;background:${impactScore > maxImpact * 0.6 ? '#dc2626' : '#d97706'}"></div></div></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- ══════════ SECTION 9 : PROFIL DE RISQUE ══════════ -->
      ${riskEstabs.length ? `
      <div class="ana-section" style="margin-bottom:24px">
        <h3 class="ana-section-title">Profil de risque des etablissements</h3>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Priorisation pour les inspections basees sur le risque (PIC/S)</p>
        <table class="tbl" style="font-size:13px">
          <thead><tr><th>Etablissement</th><th>Dept.</th><th>Conformite</th><th style="text-align:center">Ecarts</th><th>Niveau de risque</th><th>Derniere insp.</th><th>Action</th></tr></thead>
          <tbody>
          ${riskEstabs.map(([name, data]) => `<tr>
            <td><strong>${esc(name)}</strong><br/><small style="color:var(--text-muted)">${data.commune}</small></td>
            <td>${data.dept || '—'}</td>
            <td><strong style="color:${rateColor(parseFloat(data.rate))}">${data.rate}%</strong></td>
            <td style="text-align:center;font-weight:600">${data.ecarts}</td>
            <td><span class="risk-badge" style="border-color:${data.risk.color};color:${data.risk.color};background:${data.risk.bgColor};font-size:11px"><span class="risk-dot" style="background:${data.risk.color}"></span>${data.risk.label}</span></td>
            <td class="mono">${data.date || '—'}</td>
            <td><button class="btn-sm" style="font-size:11px" onclick="viewReport('${data.id}')">Voir</button></td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- ══════════ SECTION 10 : COUVERTURE GEOGRAPHIQUE ══════════ -->
      <div class="ana-section" style="margin-bottom:24px">
        <h3 class="ana-section-title">Couverture geographique</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
          ${miniKpi(deptAvecInspection + '/12', 'Departements couverts', deptAvecInspection >= 8 ? '#16a34a' : '#d97706')}
          ${miniKpi(totalCommunesCouvertes + '/' + totalCommunes, 'Communes couvertes', '')}
          ${miniKpi(tauxCouverture + '%', 'Taux de couverture', parseInt(tauxCouverture) >= 50 ? '#16a34a' : '#d97706')}
        </div>
        <table class="tbl" style="font-size:13px">
          <thead><tr><th>Departement</th><th style="text-align:center">Inspections</th><th style="text-align:center">Communes</th><th>Couverture</th><th>Indicateur</th></tr></thead>
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
    `;
  } catch (e) {
    panel.innerHTML = `<p style="color:var(--accent);padding:20px">Erreur: ${e}</p>`;
  }
}

// ═══════════════════ HELPERS DE RENDU ═══════════════════

function fmtD(s) { if (!s) return '—'; const p = s.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; }
function rateColor(r) { return r >= 80 ? '#16a34a' : r >= 60 ? '#d97706' : '#dc2626'; }

function kpiCard(value, label, color, tooltip) {
  return `<div class="ana-card" ${tooltip ? 'title="' + tooltip + '"' : ''} style="position:relative">
    <span class="ana-num" style="color:${color}">${value}</span>
    <span class="ana-lbl">${label}</span>
  </div>`;
}

function miniKpi(value, label, color) {
  return `<div style="text-align:center;padding:8px;background:var(--gray-50);border:1px solid var(--border)">
    <div style="font-size:20px;font-weight:700;color:${color || 'var(--text)'}">${value}</div>
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;margin-top:2px">${label}</div>
  </div>`;
}

function gauge(label, pct) {
  const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626';
  return `<div style="margin-top:8px">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px"><span>${label}</span><span style="font-weight:600;color:${color}">${pct}%</span></div>
    <div style="height:10px;background:var(--gray-100);border-radius:5px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${color};border-radius:5px;transition:width 0.5s"></div></div>
  </div>`;
}

// ═══════════════════ EXPORT INDICATEURS CSV ═══════════════════
export async function exportIndicateursCSV() {
  if (!_cache) {
    await renderAnalytics();
    if (!_cache) { alert('Aucun indicateur disponible. Lancez une inspection terminée d\'abord.'); return; }
  }
  const { kpis, riskByEstab, ecartsBySection, inspectorLoad, ratesOverTime, byMonth, byType, byStatus, deptCoverage } = _cache;
  const date = new Date().toISOString().substring(0,10);
  const BOM = '\uFEFF', SEP = ';';
  const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const row = (...cols) => cols.map(q).join(SEP);
  const lines = [];

  lines.push(row('=== KPIs GLOBAUX ===', `Généré le ${date}`));
  lines.push(row('Indicateur','Valeur'));
  lines.push(row('Inspections totales', kpis.total));
  lines.push(row('Taux de conformité moyen (%)', kpis.avgRate));
  lines.push(row('Taux de validation (%)', kpis.tauxValidation));
  lines.push(row('Écarts moyens par inspection', kpis.ecartsMoyens));
  lines.push(row('Total écarts', kpis.totalEcarts));
  lines.push(row('Critiques', kpis.totalCritiques));
  lines.push(row('Majeurs', kpis.totalMajeurs));
  lines.push(row('Mineurs', kpis.totalMineurs));
  lines.push(row('CAPA attendus', kpis.capaAttendu));
  lines.push(row('CAPA reçus', kpis.capaRecu));
  lines.push(row('Taux retour CAPA (%)', kpis.tauxRetourCapa));
  lines.push(row('Taux couverture géographique (%)', kpis.tauxCouverture));
  lines.push('');

  lines.push(row('=== PAR STATUT ==='));
  lines.push(row('Statut','Nombre'));
  const sl = { draft:'Brouillon', in_progress:'En cours', completed:'Terminée', validated:'Validée', archived:'Archivée' };
  Object.entries(byStatus||{}).forEach(([s,n]) => lines.push(row(sl[s]||s, n)));
  lines.push('');

  lines.push(row('=== PROFIL DE RISQUE PAR ÉTABLISSEMENT ==='));
  lines.push(row('Établissement','Département','Commune','Taux conformité (%)','Nb écarts','Niveau risque','Libellé'));
  const rl = {1:'Conforme',2:'Sous réserve',3:'Non conforme',4:'Risque immédiat'};
  Object.entries(riskByEstab||{}).sort((a,b)=>b[1].risk.level-a[1].risk.level).forEach(([name,d]) =>
    lines.push(row(name, d.dept, d.commune, d.rate, d.ecarts, d.risk.level, rl[d.risk.level]||'')));
  lines.push('');

  lines.push(row('=== ÉCARTS PAR SECTION ==='));
  lines.push(row('Section','Critiques','Majeurs','Mineurs','Observations','Total'));
  Object.entries(ecartsBySection||{}).sort((a,b)=>b[1].total-a[1].total).forEach(([name,d]) =>
    lines.push(row(name, d.critique||0, d.majeur||0, d.mineur||0, d.info||0, d.total)));
  lines.push('');

  lines.push(row('=== TENDANCE MENSUELLE ==='));
  lines.push(row('Mois','Volume','Taux conformité (%)'));
  const months = [...new Set([...Object.keys(byMonth||{}), ...(ratesOverTime||[]).map(r=>r.month)])].sort();
  months.forEach(m => {
    const vol = (byMonth||{})[m]||0;
    const re = (ratesOverTime||[]).find(r=>r.month===m);
    lines.push(row(m, vol, re ? re.avg.toFixed(1) : ''));
  });
  lines.push('');

  lines.push(row('=== CHARGE PAR INSPECTEUR ==='));
  lines.push(row('Inspecteur','Total','En cours','Terminées','Validées','Taux val. (%)'));
  Object.entries(inspectorLoad||{}).sort((a,b)=>b[1].total-a[1].total).forEach(([name,d]) => {
    const pct = d.total>0 ? (((d.validated||0)/d.total)*100).toFixed(1) : 0;
    lines.push(row(name, d.total, d.in_progress||0, d.completed||0, d.validated||0, pct));
  });
  lines.push('');

  lines.push(row('=== COUVERTURE GÉOGRAPHIQUE ==='));
  lines.push(row('Département','Inspections','Communes inspectées','Total communes','Couverture (%)'));
  (deptCoverage||[]).sort((a,b)=>b.inspections-a.inspections).forEach(d => {
    const pct = d.communes_total>0 ? ((d.communes_inspectees/d.communes_total)*100).toFixed(1) : 0;
    lines.push(row(d.nom, d.inspections, d.communes_inspectees, d.communes_total, pct));
  });

  const csv = BOM + lines.join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `indicateurs_${date}.csv`;
  a.click();
  if(window.showToast) window.showToast('Export indicateurs généré','info');
}
