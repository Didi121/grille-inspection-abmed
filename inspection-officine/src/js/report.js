// ═══════════════════ RAPPORT OFFICIEL ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { adjustSeverity, determineComplianceRisk, determineGlobalRisk } from './risk-engine.js';

export async function renderReport() {
  const total=state.allCriteria.length;
  const naCount=Object.values(state.responses).filter(r=>r.conforme==='na').length;
  const applicable=total-naCount;
  const ans=Object.values(state.responses).filter(r=>r.conforme===true||r.conforme===false).length;
  const conf=Object.values(state.responses).filter(r=>r.conforme===true).length;
  const nonC=Object.values(state.responses).filter(r=>r.conforme===false).length;
  const notEval=applicable-ans;
  const rate=ans>0?((conf/ans)*100).toFixed(1):0;
  const ecarts=state.allCriteria.filter(c=>state.responses[c.id]?.conforme===false).map(c=>({...c,observation:state.responses[c.id]?.observation||''}));

  // Classifier les ecarts : severite de base + ajustement par facteur aggravant/attenuant
  ecarts.forEach(e => {
    const r = state.responses[e.id];
    const baseSev = r?.severity || e.severity || (e.pre_opening ? 'critique' : 'majeur');
    e.baseSeverity = baseSev;
    e.factor = r?.factor || 'neutre';
    e.factorJustification = r?.factorJustification || '';
    e.immediateDanger = r?.immediateDanger || false;
    e.effectiveSeverity = adjustSeverity(baseSev, e.factor);
  });
  const critiques = ecarts.filter(e=>e.effectiveSeverity==='critique');
  const majeurs = ecarts.filter(e=>e.effectiveSeverity==='majeur');
  const mineurs = ecarts.filter(e=>e.effectiveSeverity==='mineur');
  const obsInfos = ecarts.filter(e=>e.effectiveSeverity==='info');
  const totalEcarts = ecarts.length;
  const riskCompliance = determineComplianceRisk(critiques, majeurs, mineurs, obsInfos);
  const rateNum = parseFloat(rate);
  const riskGlobal = determineGlobalRisk(rateNum, critiques, majeurs, riskCompliance.level===4);
  const adjustedCount = ecarts.filter(e=>e.factor!=='neutre').length;

  const role = state.session?.user?.role;
  const isLeadOrAdmin = ['admin','lead_inspector'].includes(role);
  let insp = null;
  if(state.currentInspectionId) try { insp = await invoke('cmd_get_inspection',{token:state.session.token, inspectionId:state.currentInspectionId}); } catch(_){}
  const canValidate = isLeadOrAdmin && insp && insp.status !== 'validated';
  const canComplete = insp && insp.status === 'in_progress';
  const canEditSuivi = insp && role !== 'viewer';
  const isReadOnly = ['lead_inspector','viewer'].includes(role);
  const meta = insp?.extra_meta || {};
  const shortId = insp?.id?.substring(0,6) || '—';
  const d = s => s || '—';
  const fmtDate = s => { if(!s) return '—'; const p=s.split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; };

  document.getElementById('rptA4').innerHTML=`
    <div class="rpt-header-inst" style="text-align:center;margin-bottom:24px">
      <div style="font-weight:700;font-size:18px;letter-spacing:0.05em">INSPECTIONS PHARMA</div>
      <div style="font-size:11px;color:#666;margin-top:4px">Outil d'audit et d'inspection</div>
    </div>

    <div class="rpt-title-box">
      <h2>RAPPORT ${(insp?.inspection_type||'').toUpperCase()||"D'AUDIT"}</h2>
      <div style="font-size:12px;font-weight:600;margin-top:4px">Ref. : #${shortId}</div>
    </div>

    <div class="rpt-section-hdr">I. Identification de l'etablissement</div>
    <table class="rpt-data-table">
      <tr><td class="label">Structure :</td><td class="value"><strong>${(insp?.establishment||'—').toUpperCase()}</strong></td></tr>
      <tr><td class="label">Responsable / Promoteur :</td><td class="value">${d(meta.responsable)}</td></tr>
      <tr><td class="label">Commune / Departement :</td><td class="value">${d(meta.commune)} / ${d(meta.departement)}</td></tr>
      <tr><td class="label">Type d'etablissement :</td><td class="value">${(state.activeGrid?.name||'—').toUpperCase()}</td></tr>
    </table>

    <div class="rpt-section-hdr">II. Informations sur la mission</div>
    <table class="rpt-data-table">
      <tr><td class="label">Date de l'inspection :</td><td class="value">${fmtDate(insp?.date_inspection)}</td></tr>
      <tr><td class="label">Inspecteur Principal :</td><td class="value">${d(meta.lead_inspector)||d(insp?.created_by_name)}</td></tr>
      <tr><td class="label">Type d'inspection :</td><td class="value">${(insp?.inspection_type||'—').toUpperCase()}</td></tr>
      <tr><td class="label">Equipe d'inspection :</td><td class="value">${(insp?.inspectors||[]).join(', ')||'—'}</td></tr>
      <tr><td class="label">Periode de Mission :</td><td class="value">${meta.periode_du||meta.periode_au ? (fmtDate(meta.periode_du)+' au '+fmtDate(meta.periode_au)) : '—'}</td></tr>
      <tr><td class="label">Date Attendue d'Envoi du Rapport Intermediaire :</td><td class="value">${fmtDate(meta.date_rapport_attendue)}</td></tr>
      <tr><td class="label">Date de Depot du Rapport Preliminaire :</td><td class="value">${fmtDate(meta.date_rapport_prelim)}</td></tr>
      <tr><td class="label">Date de Depot du Rapport Intermediaire :</td><td class="value">${fmtDate(meta.date_rapport_interm)}</td></tr>
    </table>

    <div class="rpt-section-hdr">III. Constats et Ecarts</div>
    <div class="rpt-stats-grid">
      <div class="rpt-stat-box"><span class="rpt-stat-num" style="color:var(--accent)">${critiques.length}</span><span class="rpt-stat-lbl">Critiques</span></div>
      <div class="rpt-stat-box"><span class="rpt-stat-num" style="color:#d97706">${majeurs.length}</span><span class="rpt-stat-lbl">Majeurs</span></div>
      <div class="rpt-stat-box"><span class="rpt-stat-num" style="color:#0284c7">${mineurs.length}</span><span class="rpt-stat-lbl">Mineurs</span></div>
      ${obsInfos.length?`<div class="rpt-stat-box"><span class="rpt-stat-num" style="color:#6b7280">${obsInfos.length}</span><span class="rpt-stat-lbl">Observations</span></div>`:''}
      <div class="rpt-stat-box" style="background:var(--surface)"><span class="rpt-stat-num">${totalEcarts}</span><span class="rpt-stat-lbl">Total</span></div>
    </div>
    <table class="rpt-data-table">
      <tr><td class="label">Criteres applicables :</td><td class="value">${applicable} / ${total}${naCount>0?' ('+naCount+' N/A)':''}</td></tr>
      <tr><td class="label">Criteres evalues :</td><td class="value">${ans} / ${applicable}${notEval>0?' ('+notEval+' non evalues)':''}</td></tr>
      <tr><td class="label">Taux de conformite :</td><td class="value"><strong>${rate}%</strong> (${conf} conformes / ${ans} evalues)</td></tr>
      <tr><td class="label">Niveau de Risque de Conformite :</td><td class="value">
        <span class="risk-badge" style="border-color:${riskCompliance.color};color:${riskCompliance.color};background:${riskCompliance.bgColor}">
          <span class="risk-dot" style="background:${riskCompliance.color}"></span>${riskCompliance.label}
        </span>
      </td></tr>
      <tr><td class="label">Niveau de Risque Global :</td><td class="value">
        <span class="risk-badge" style="border-color:${riskGlobal.color};color:${riskGlobal.color};background:${riskGlobal.bgColor}">
          <span class="risk-dot" style="background:${riskGlobal.color}"></span>${riskGlobal.label}
        </span>
      </td></tr>
      <tr><td class="label">Proces-Verbal :</td><td class="value">${d(meta.proces_verbal)}</td></tr>
    </table>
    <div class="risk-level-box">
      <div class="risk-title">Analyse du Niveau de Risque de Conformite</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span class="risk-badge" style="border-color:${riskCompliance.color};color:${riskCompliance.color};background:${riskCompliance.bgColor};font-size:14px">
          <span class="risk-dot" style="background:${riskCompliance.color}"></span>
          Scenario ${riskCompliance.level} — ${riskCompliance.label.toUpperCase()}
        </span>
      </div>
      <div class="risk-description">${riskCompliance.description}</div>
      <div class="risk-action"><strong>Suite recommandee :</strong> ${riskCompliance.action}</div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-muted)">
        Synthese : ${critiques.length} critique(s), ${majeurs.length} majeur(s), ${mineurs.length} mineur(s), ${obsInfos.length} observation(s)
        ${adjustedCount>0?' — <em>'+adjustedCount+' ecart(s) ajuste(s) par facteur aggravant/attenuant</em>':''}
      </div>
    </div>
    ${ecarts.length?`
      <div style="margin-top:12px;font-size:11px;font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.03em">Detail des ecarts (${ecarts.length})</div>
      ${ecarts.map(e=>{
        const sevColors={critique:'#dc2626',majeur:'#d97706',mineur:'#2563eb',info:'#6b7280'};
        const sevLabels={critique:'CRITIQUE',majeur:'MAJEUR',mineur:'MINEUR',info:'OBSERVATION'};
        const sev=e.effectiveSeverity||'majeur';
        const wasAdjusted=e.factor&&e.factor!=='neutre';
        return `<div class="rpt-ecart-item" style="border-left-color:${sevColors[sev]}">
        <div class="sec">${e.sectionTitle} — <span style="color:${sevColors[sev]};font-weight:700">${sevLabels[sev]}</span>
          ${wasAdjusted?`<span class="factor-tag factor-${e.factor}">${e.factor==='aggravant'?'Aggravant':'Attenuant'}</span>
          <span style="font-size:9px;color:var(--text-muted)">(initial: ${(e.baseSeverity||'majeur').toUpperCase()})</span>`:''}
          ${e.immediateDanger?'<span style="font-size:10px;padding:2px 6px;background:#7f1d1d;color:#fff;font-weight:700;margin-left:4px">DANGER IMMEDIAT</span>':''}
        </div>
        <div class="desc">${e.description}</div>
        ${e.reference?`<div class="ref">${e.reference}</div>`:''}
        ${e.observation?`<div class="obs">"${e.observation}"</div>`:''}
        ${e.factorJustification?`<div style="font-size:10px;color:var(--text-muted);margin-top:4px;padding-left:8px;border-left:2px solid ${e.factor==='aggravant'?'#dc2626':'#16a34a'}"><em>Justification : ${e.factorJustification}</em></div>`:''}
      </div>`;}).join('')}
    `:''}

    <div class="rpt-section-hdr" style="display:flex;align-items:center;justify-content:space-between">
      <span>IV. Suites Administratives Proposees</span>
      ${canEditSuivi?`<button onclick="openSuiviModal()" style="font-size:11px;padding:4px 12px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:600">Modifier Suivi & Suites</button>`:''}
    </div>
    <table class="rpt-data-table">
      <tr><td class="label">Suite Administrative :</td><td class="value">${d(meta.suite_admin)}</td></tr>
      <tr><td class="label">Delivrance d'Acte :</td><td class="value">${d(meta.acte)}</td></tr>
      <tr><td class="label">Proces-Verbal :</td><td class="value">${d(meta.proces_verbal)}</td></tr>
      ${insp?.validated_by_name?`<tr><td class="label">Valide par :</td><td class="value">${insp.validated_by_name} le ${fmtDate(insp.validated_at)}</td></tr>`:''}
    </table>

    <div class="rpt-section-hdr">V. CAPA et Suivi</div>
    <table class="rpt-data-table">
      <tr><td class="label">Date d'Envoi du Rapport :</td><td class="value">${fmtDate(meta.date_envoi_rapport)}</td></tr>
      <tr><td class="label">Date Attendue CAPA (J+15) :</td><td class="value">${(()=>{
        if(meta.date_capa) return fmtDate(meta.date_capa);
        if(meta.date_envoi_rapport) { const dc=new Date(meta.date_envoi_rapport); dc.setDate(dc.getDate()+15); return fmtDate(dc.toISOString().split('T')[0])+' <span style="font-size:10px;color:var(--text-muted)">(auto-calculee)</span>'; }
        return '—';
      })()}</td></tr>
      <tr><td class="label">Date de Retour du CAPA :</td><td class="value">${fmtDate(meta.date_retour_capa)}</td></tr>
      <tr><td class="label">Date de Cloture :</td><td class="value">${fmtDate(meta.date_cloture)}</td></tr>
    </table>

    <div class="rpt-sig-container">
      <div class="rpt-sig-block">
        <p>${meta.lead_inspector||insp?.created_by_name||'—'}</p>
        <div class="rpt-sig-space"></div>
        <p><strong>L'Inspecteur Principal</strong></p>
      </div>
      <div class="rpt-sig-block">
        <div style="margin-bottom:28px"> </div>
        <div class="rpt-sig-space"></div>
        <p><strong>Pour le DIRP et P.O.</strong></p>
      </div>
    </div>
  `;

  // Actions sous le rapport
  document.getElementById('rptActions').innerHTML=`
    ${!isReadOnly?`<button class="btn-rpt primary" onclick="showScreen('inspection');renderCriterion();updateProgress()">← Retour inspection</button>`:''}
    ${canComplete?`<button class="btn-rpt" onclick="setInspStatus('completed')">Marquer terminee</button>`:''}
    ${canValidate?`<button class="btn-rpt" style="background:var(--accent);color:var(--white);border-color:var(--accent)" onclick="setInspStatus('validated')">Valider</button>`:''}
    ${canEditSuivi?`<button class="btn-rpt" onclick="openSuiviModal()">Modifier Suivi & Suites</button>`:''}
    <button class="btn-rpt" onclick="showReportVersions()">Versions</button>
    <button class="btn-rpt" onclick="window.print()">Imprimer / PDF</button>
    <button class="btn-rpt" onclick="exportEcartsCSV()">Export écarts CSV</button>
    <button class="btn-rpt" onclick="exportJSON()">Export JSON</button>
    <button class="btn-rpt" onclick="goToDashboard()">Tableau de bord</button>
  `;
}

// ═══════════════════ MODAL SUIVI ET SUITES ═══════════════════
export async function openSuiviModal() {
  if(!state.currentInspectionId) { alert('Aucune inspection selectionnee'); return; }
  let insp;
  try { insp = await invoke('cmd_get_inspection',{token:state.session.token, inspectionId:state.currentInspectionId}); } catch(e){ alert('Erreur chargement: '+e); return; }
  if(!insp) { alert('Inspection introuvable'); return; }
  const m = insp.extra_meta || {};
  const esc = s => (s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const html = `
    <div style="max-width:600px">
      <h3 style="margin-bottom:16px">Suivi et Suites de l'inspection</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">${esc(insp.establishment)||'—'} — #${insp.id?.substring(0,6)}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Date attendue envoi rapport</label><input type="date" id="sm_dateRapport" value="${m.date_rapport_attendue||''}"/></div>
        <div class="field"><label>Date depot rapport preliminaire</label><input type="date" id="sm_dateRapportPrelim" value="${m.date_rapport_prelim||''}"/></div>
        <div class="field"><label>Date depot rapport intermediaire</label><input type="date" id="sm_dateRapportInterm" value="${m.date_rapport_interm||''}"/></div>
        <div class="field"><label>Date envoi du rapport</label><input type="date" id="sm_dateEnvoi" value="${m.date_envoi_rapport||''}" onchange="autoCalcCapaSuivi()"/></div>
        <div class="field"><label>Date attendue CAPA (auto J+15)</label><input type="date" id="sm_dateCapa" value="${m.date_capa||''}"/></div>
        <div class="field"><label>Date retour CAPA</label><input type="date" id="sm_dateRetourCapa" value="${m.date_retour_capa||''}"/></div>
        <div class="field"><label>Date de cloture</label><input type="date" id="sm_dateCloture" value="${m.date_cloture||''}"/></div>
        <div class="field"><label>Proces-Verbal</label><select id="sm_pv"><option value="">—</option><option ${m.proces_verbal==='Oui'?'selected':''}>Oui</option><option ${m.proces_verbal==='Non'?'selected':''}>Non</option></select></div>
        <div class="field" style="grid-column:1/-1"><label>Suite administrative proposee</label><input id="sm_suiteAdmin" value="${esc(m.suite_admin)}" placeholder="Ex: Mise en demeure..."/></div>
        <div class="field" style="grid-column:1/-1"><label>Delivrance d'acte</label><input id="sm_acte" value="${esc(m.acte)}" placeholder="Ex: Certificat de conformite..."/></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
        <button class="btn-sm" onclick="closeModal()">Annuler</button>
        <button class="btn-primary" style="width:auto;padding:8px 20px" onclick="saveSuiviMeta()">Enregistrer</button>
      </div>
    </div>`;
  window.openModal(html);
}

export function autoCalcCapaSuivi() {
  const envoi = document.getElementById('sm_dateEnvoi')?.value;
  if(!envoi) return;
  const d = new Date(envoi); d.setDate(d.getDate() + 15);
  const capaField = document.getElementById('sm_dateCapa');
  if(capaField && !capaField.value) capaField.value = d.toISOString().split('T')[0];
}

export async function saveSuiviMeta() {
  if(!state.currentInspectionId) { alert('Aucune inspection selectionnee'); return; }
  try {
    const insp = await invoke('cmd_get_inspection',{token:state.session.token, inspectionId:state.currentInspectionId});
    if(!insp) { alert('Inspection introuvable'); return; }
    const meta = insp.extra_meta || {};
    meta.date_rapport_attendue = document.getElementById('sm_dateRapport').value;
    meta.date_rapport_prelim = document.getElementById('sm_dateRapportPrelim').value;
    meta.date_rapport_interm = document.getElementById('sm_dateRapportInterm').value;
    meta.date_envoi_rapport = document.getElementById('sm_dateEnvoi').value;
    meta.date_capa = document.getElementById('sm_dateCapa').value;
    meta.date_retour_capa = document.getElementById('sm_dateRetourCapa').value;
    meta.date_cloture = document.getElementById('sm_dateCloture').value;
    meta.proces_verbal = document.getElementById('sm_pv').value;
    meta.suite_admin = document.getElementById('sm_suiteAdmin').value;
    meta.acte = document.getElementById('sm_acte').value;
    await invoke('cmd_update_inspection_meta',{
      token:state.session.token,
      inspectionId:state.currentInspectionId,
      req:{ date_inspection:insp.date_inspection, establishment:insp.establishment, inspection_type:insp.inspection_type, inspectors:insp.inspectors, extra_meta:meta }
    });
    window.closeModal();
    if(window.showToast) window.showToast('Suivi mis a jour','info');
    renderReport();
  } catch(e){ alert('Erreur: '+e); }
}

export async function showReportVersions() {
  if(!state.currentInspectionId) return;
  try {
    const snapshots = await invoke('cmd_list_report_snapshots',{token:state.session.token, inspectionId:state.currentInspectionId}) || [];
    const role = state.session?.user?.role;
    const canSnapshot = ['admin','lead_inspector','inspector'].includes(role);

    if(!snapshots.length) {
      window.openModal(`<div style="max-width:420px">
        <h3>Historique des versions</h3>
        <p style="color:var(--text-muted);margin-top:12px">Aucune version sauvegardee.</p>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Un snapshot est cree automatiquement quand l'inspection est marquee "Terminee" ou "Validee".</p>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          ${canSnapshot ? '<button class="btn-primary" style="width:auto;padding:8px 16px;font-size:13px" onclick="createManualSnapshot()">Creer un snapshot maintenant</button>' : ''}
          <button class="btn-sm" onclick="closeModal()">Fermer</button>
        </div>
      </div>`);
      return;
    }

    // Calculer stats pour chaque snapshot
    const rows = snapshots.map(s => {
      const resps = s.responses || {};
      const respCount = Object.keys(resps).length;
      const confCount = Object.values(resps).filter(r=>r.conforme===true).length;
      const ncCount = Object.values(resps).filter(r=>r.conforme===false).length;
      const naCount = Object.values(resps).filter(r=>r.conforme==='na').length;
      const rate = (confCount + ncCount) > 0 ? ((confCount / (confCount + ncCount)) * 100).toFixed(0) : '—';
      const statusLabels = { completed: 'Terminee', validated: 'Validee', manual: 'Manuel' };
      const statusColors = { completed: '#d97706', validated: '#16a34a', manual: '#2563eb' };
      const fmtDt = s.created_at ? s.created_at.substring(0,16).replace('T',' ') : '—';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="font-weight:700;font-size:14px;text-align:center;padding:8px 6px">v${s.version}</td>
        <td style="padding:8px 6px">
          <div class="mono" style="font-size:11px">${fmtDt}</div>
          <div style="font-size:10px;color:var(--text-muted)">${s.created_by_name||'—'}</div>
        </td>
        <td style="padding:8px 6px;text-align:center">
          <span style="font-size:11px;padding:2px 8px;font-weight:600;background:${statusColors[s.status]||'#9ca3af'}20;color:${statusColors[s.status]||'#9ca3af'};border:1px solid ${statusColors[s.status]||'#9ca3af'}40">${statusLabels[s.status]||s.status}</span>
        </td>
        <td style="padding:8px 6px;font-size:12px;text-align:center">
          <div>${respCount} rep.</div>
          <div style="font-size:10px;color:var(--text-muted)">${confCount}C / ${ncCount}NC${naCount?' / '+naCount+'NA':''}</div>
          <div style="font-size:10px;font-weight:600;color:${parseInt(rate)>=80?'#16a34a':parseInt(rate)>=50?'#d97706':'#dc2626'}">${rate}%</div>
        </td>
        <td style="padding:8px 6px;text-align:right">
          <button class="btn-sm" style="font-size:10px;padding:4px 8px" onclick="viewSnapshotDetail('${s.id}')">Consulter</button>
        </td>
      </tr>`;
    }).join('');

    const html = `<div style="max-width:600px">
      <h3>Historique des versions du rapport</h3>
      <p style="font-size:12px;color:var(--text-muted);margin:8px 0 16px">Un snapshot est cree a chaque changement de statut (terminee, validee). ${snapshots.length} version(s) enregistree(s).</p>
      <div style="max-height:350px;overflow-y:auto">
        <table class="tbl" style="font-size:13px;width:100%">
          <thead><tr>
            <th style="width:50px">V.</th>
            <th>Date / Auteur</th>
            <th style="text-align:center">Statut</th>
            <th style="text-align:center">Donnees</th>
            <th style="text-align:right;width:80px"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:space-between;align-items:center">
        ${canSnapshot ? '<button class="btn-sm" style="font-size:11px" onclick="createManualSnapshot()">+ Snapshot manuel</button>' : '<div></div>'}
        <button class="btn-sm" onclick="closeModal()">Fermer</button>
      </div>
    </div>`;
    window.openModal(html);
  } catch(e) { alert('Erreur versioning: '+e); console.error(e); }
}

// Consulter le detail d'un snapshot
export async function viewSnapshotDetail(snapshotId) {
  try {
    const snapshot = await invoke('cmd_get_report_snapshot',{token:state.session.token, snapshotId});
    if(!snapshot) { alert('Snapshot introuvable'); return; }

    const resps = snapshot.responses || {};
    const respList = Object.values(resps);
    const confCount = respList.filter(r=>r.conforme===true).length;
    const ncCount = respList.filter(r=>r.conforme===false).length;
    const naCount = respList.filter(r=>r.conforme==='na').length;
    const answered = confCount + ncCount;
    const rate = answered > 0 ? ((confCount / answered) * 100).toFixed(1) : '0';
    const fmtDt = snapshot.created_at ? snapshot.created_at.substring(0,16).replace('T',' ') : '—';
    const meta = snapshot.meta || {};
    const statusLabels = { completed: 'Terminee', validated: 'Validee', manual: 'Manuel' };

    // Trouver les ecarts (non conformes) avec le detail des criteres
    const ecarts = [];
    for (const [cid, r] of Object.entries(resps)) {
      if (r.conforme === false) {
        const criterion = state.allCriteria.find(c => String(c.id) === String(cid));
        ecarts.push({
          id: cid,
          reference: criterion?.reference || '—',
          description: criterion?.description || 'Critere #' + cid,
          section: criterion?.sectionTitle || '—',
          observation: r.observation || '',
          severity: r.severity || criterion?.severity || 'majeur'
        });
      }
    }

    // Comparer avec la version actuelle
    const currentResps = state.responses || {};
    let diffCount = 0;
    const allKeys = new Set([...Object.keys(resps), ...Object.keys(currentResps)]);
    allKeys.forEach(k => {
      const snapR = resps[k]?.conforme;
      const currR = currentResps[k]?.conforme;
      if (snapR !== currR) diffCount++;
    });

    const sevColors = { critique:'#dc2626', majeur:'#d97706', mineur:'#2563eb', info:'#6b7280' };
    const sevLabels = { critique:'CRITIQUE', majeur:'MAJEUR', mineur:'MINEUR', info:'OBS' };

    const html = `<div style="max-width:650px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <h3 style="margin:0">Snapshot v${snapshot.version}</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${fmtDt} — ${snapshot.created_by_name||'—'} — ${statusLabels[snapshot.status]||snapshot.status}</p>
        </div>
        ${diffCount > 0 ? `<span style="font-size:11px;padding:4px 10px;background:#fef3c7;color:#92400e;font-weight:600;border:1px solid #fde68a">${diffCount} difference(s) avec la version actuelle</span>` : '<span style="font-size:11px;padding:4px 10px;background:#d1fae5;color:#065f46;font-weight:600;border:1px solid #a7f3d0">Identique a la version actuelle</span>'}
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
        <div style="text-align:center;padding:8px;background:var(--gray-50);border:1px solid var(--border)">
          <div style="font-size:18px;font-weight:700">${Object.keys(resps).length}</div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Reponses</div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--gray-50);border:1px solid var(--border)">
          <div style="font-size:18px;font-weight:700;color:#16a34a">${confCount}</div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Conformes</div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--gray-50);border:1px solid var(--border)">
          <div style="font-size:18px;font-weight:700;color:#dc2626">${ncCount}</div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Non conformes</div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--gray-50);border:1px solid var(--border)">
          <div style="font-size:18px;font-weight:700;color:${parseInt(rate)>=80?'#16a34a':parseInt(rate)>=50?'#d97706':'#dc2626'}">${rate}%</div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Conformite</div>
        </div>
      </div>

      ${ecarts.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px">Ecarts constates (${ecarts.length})</div>
          <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border)">
            ${ecarts.map(e => `<div style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px">
              <span style="font-size:10px;padding:1px 5px;font-weight:700;color:${sevColors[e.severity]||'#d97706'};background:${sevColors[e.severity]||'#d97706'}15;border:1px solid ${sevColors[e.severity]||'#d97706'}30;margin-right:4px">${sevLabels[e.severity]||'MAJ'}</span>
              <strong>${e.reference}</strong> — ${e.description.substring(0, 80)}${e.description.length>80?'...':''}
              ${e.observation ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-style:italic">' + e.observation.substring(0, 100) + '</div>' : ''}
            </div>`).join('')}
          </div>
        </div>
      ` : '<p style="font-size:12px;color:#16a34a;margin-bottom:12px">Aucun ecart constate dans cette version.</p>'}

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" onclick="showReportVersions()">Retour a la liste</button>
        <button class="btn-sm" onclick="closeModal()">Fermer</button>
      </div>
    </div>`;
    window.openModal(html);
  } catch(e) { alert('Erreur: '+e); console.error(e); }
}

// Creer un snapshot manuel
export async function createManualSnapshot() {
  if(!state.currentInspectionId) return;
  try {
    const resps = {};
    for (const [cid, r] of Object.entries(state.responses)) {
      resps[cid] = JSON.parse(JSON.stringify(r));
    }
    let insp = null;
    try { insp = await invoke('cmd_get_inspection',{token:state.session.token, inspectionId:state.currentInspectionId}); } catch(_){}

    await invoke('cmd_create_manual_snapshot', {
      token: state.session.token,
      inspectionId: state.currentInspectionId,
      responses: resps,
      meta: insp?.extra_meta || {}
    });
    window.closeModal();
    if(window.showToast) window.showToast('Snapshot cree avec succes', 'info');
    showReportVersions();
  } catch(e) { alert('Erreur: '+e); console.error(e); }
}

export async function setInspStatus(status) {
  if(!state.currentInspectionId) return;
  try {
    await invoke('cmd_set_inspection_status',{token:state.session.token, inspectionId:state.currentInspectionId, status});
    renderReport();
  } catch(e){ alert(e); }
}

export async function exportEcartsCSV() {
  let insp = null;
  if (state.currentInspectionId) try { insp = await invoke('cmd_get_inspection',{token:state.session.token, inspectionId:state.currentInspectionId}); } catch(_){}
  const BOM = '\uFEFF';
  const SEP = ';';
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const estab = insp?.establishment || state.activeGrid?.id || 'rapport';
  const date = insp?.date_inspection || new Date().toISOString().substring(0,10);

  const headers = ['Section','Référence','Description','Conforme','Sévérité','Facteur','Justification facteur','Danger immédiat','Observation'];
  const rows = [];

  state.allCriteria.forEach(c => {
    const r = state.responses[c.id] || {};
    const conforme = r.conforme === true ? 'Oui' : r.conforme === false ? 'Non' : 'N/A';
    rows.push([
      c.sectionTitle || '',
      c.reference || '',
      c.description || '',
      conforme,
      r.conforme === false ? (r.severity || c.severity || 'majeur') : '',
      r.conforme === false ? (r.factor || '') : '',
      r.conforme === false ? (r.factorJustification || '') : '',
      r.immediateDanger ? 'Oui' : '',
      r.observation || ''
    ]);
  });

  const csv = BOM + [headers.map(q).join(SEP), ...rows.map(r => r.map(q).join(SEP))].join('\n');
  const name = estab.replace(/[^a-zA-Z0-9]/g,'_').substring(0,30);
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ecarts_${name}_${date}.csv`;
  a.click();
  if (window.showToast) window.showToast('Export écarts CSV généré','info');
}

export async function exportJSON() {
  let insp = null;
  if(state.currentInspectionId) try { insp = await invoke('cmd_get_inspection',{token:state.session.token, inspectionId:state.currentInspectionId}); } catch(_){}
  const rpt = {
    meta:{
      grid:state.activeGrid?.name,
      grid_id:state.activeGrid?.id,
      establishment: insp?.establishment || document.getElementById('mEstab')?.value || '',
      date: insp?.date_inspection || document.getElementById('mDate')?.value || '',
      inspection_id:state.currentInspectionId,
      inspection_type: insp?.inspection_type || '',
      inspectors: insp?.inspectors || [],
      extra_meta: insp?.extra_meta || {}
    },
    total:state.allCriteria.length,
    conforme:Object.values(state.responses).filter(r=>r.conforme===true).length,
    non_conforme:Object.values(state.responses).filter(r=>r.conforme===false).length,
    ecarts:state.allCriteria.filter(c=>state.responses[c.id]?.conforme===false).map(c=>{
      const r=state.responses[c.id]||{};
      return {id:c.id,section:c.sectionTitle,reference:c.reference,description:c.description,observation:r.observation||'',severity:r.severity||c.severity||'majeur',factor:r.factor||'neutre',immediateDanger:r.immediateDanger||false};
    }),
    all_responses:Object.entries(state.responses).map(([id,r])=>({criterion_id:parseInt(id),...r}))
  };
  const name = (insp?.establishment||state.activeGrid?.id||'x').replace(/[^a-zA-Z0-9]/g,'_').substring(0,30);
  const blob=new Blob([JSON.stringify(rpt,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`rapport_${name}_${Date.now()}.json`;a.click();
}
