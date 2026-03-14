// ═══════════════════ DASHBOARD V2 ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc } from './utils.js';

export async function loadDashboard() {
  const role = state.session.user.role;
  const isInspector = role === 'inspector';
  const isLead = role === 'lead_inspector';
  const isViewer = role === 'viewer';
  const canCreate = role === 'admin' || role === 'inspector';
  document.getElementById('dashTitle').textContent = isInspector ? 'Mes inspections' : 'Toutes les inspections';
  document.getElementById('dashSub').textContent = isInspector ? 'Vos rapports d\'inspection' : isLead ? 'Supervision et validation' : 'Vue d\'ensemble de toutes les inspections';

  // Actions du header selon le role
  const dashActions = document.getElementById('dashActions');
  if (dashActions) {
    dashActions.innerHTML = `
      ${canCreate ? '<button class="btn-primary" style="width:auto;padding:8px 16px;font-size:14px" onclick="showScreen(\'grid-select\')">+ Nouvelle inspection</button>' : ''}
      ${(isLead || role==='admin') ? '<button class="btn-sm" style="padding:8px 16px;font-size:13px" onclick="exportAllInspCSV()">Exporter CSV</button>' : ''}
    `;
  }

  try {
    const list = await invoke('cmd_list_inspections',{token:state.session.token, myOnly:isInspector, status:null});
    const gridMap = {}; state.gridsData.forEach(g=>gridMap[g.id]=g);

    // Stats
    const total = list.length;
    const drafts = list.filter(i=>i.status==='draft').length;
    const inProg = list.filter(i=>i.status==='in_progress').length;
    const validated = list.filter(i=>i.status==='validated').length;
    document.getElementById('dashStats').innerHTML = `
      <div class="dash-stat-card accent"><span class="ds-label">Total</span><span class="ds-value">${total}</span></div>
      <div class="dash-stat-card"><span class="ds-label">Brouillons</span><span class="ds-value">${drafts}</span></div>
      <div class="dash-stat-card"><span class="ds-label">En cours</span><span class="ds-value">${inProg}</span></div>
      <div class="dash-stat-card accent"><span class="ds-label">Validées</span><span class="ds-value">${validated}</span></div>
    `;

    // Filtrer côté client
    let filtered = [...list];
    const search = document.getElementById('dSearch').value.toLowerCase();
    const typeF = document.getElementById('dTypeFilter').value;
    const statusF = document.getElementById('dStatusFilter').value;
    const deptF = document.getElementById('dDeptFilter')?.value || '';
    const communeF = document.getElementById('dCommuneFilter')?.value || '';
    if(search) filtered = filtered.filter(i=>(i.establishment||'').toLowerCase().includes(search));
    if(typeF) filtered = filtered.filter(i=>i.inspection_type===typeF);
    if(statusF) filtered = filtered.filter(i=>i.status===statusF);
    if(deptF) filtered = filtered.filter(i=>(i.extra_meta?.departement||'')===deptF);
    if(communeF) filtered = filtered.filter(i=>(i.extra_meta?.commune||'')===communeF);

    const tbody = document.getElementById('dashBody');
    const empty = document.getElementById('dashEmpty');
    if(!filtered.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      tbody.innerHTML = filtered.map((i,idx)=>{
        const g = gridMap[i.grid_id]||{icon:'📋',name:i.grid_id};
        const shortId = i.id.substring(0,6);
        const canEdit = role==='admin' || (isInspector && i.created_by===state.session.user.id && ['draft','in_progress'].includes(i.status));
        const canDelete = role==='admin' || isLead;
        const canValidate = (role==='admin'||isLead) && i.status==='completed';
        // Lead/viewer: ouvrir en lecture seule (rapport direct)
        const openAction = (isLead || isViewer) ? `viewReport('${i.id}')` : `openInspection('${i.id}')`;
        const openLabel = (isLead || isViewer) ? 'Consulter' : 'Ouvrir';
        return `<tr onclick="${openAction}">
          <td class="mono">#${shortId}</td>
          <td>${esc(i.date_inspection)||'—'}</td>
          <td class="estab-name">${esc(i.establishment)||'Sans nom'}</td>
          <td>${esc(i.inspection_type)||'—'}</td>
          <td>${g.icon} ${g.name}</td>
          <td>${i.created_by_name||'—'}</td>
          <td><span class="status-badge status-${i.status}">${statusLabel(i.status)}</span></td>
          <td style="text-align:right" onclick="event.stopPropagation()">
            <button class="act-btn" onclick="${openAction}" title="${openLabel}">${openLabel}</button>
            ${canValidate?`<button class="act-btn" onclick="quickValidate('${i.id}')" title="Valider">Valider</button>`:''}
            ${canDelete?`<button class="act-btn danger" onclick="deleteInsp('${i.id}')" title="Supprimer">Suppr.</button>`:''}
          </td>
        </tr>`;
      }).join('');
    }
  } catch(e){ console.error(e); }
}

export function statusLabel(s){ return {draft:'Brouillon',in_progress:'En cours',completed:'Terminée',validated:'Validée',archived:'Archivée'}[s]||s; }

export function resetDashFilters() {
  document.getElementById('dSearch').value='';
  document.getElementById('dTypeFilter').value='';
  document.getElementById('dStatusFilter').value='';
  const dDept = document.getElementById('dDeptFilter');
  const dCommune = document.getElementById('dCommuneFilter');
  if(dDept) dDept.value='';
  if(dCommune) { dCommune.innerHTML='<option value="">Commune</option>'; dCommune.value=''; }
  loadDashboard();
}

export async function quickValidate(id) {
  if(!confirm('Valider cette inspection ?')) return;
  try { await invoke('cmd_set_inspection_status',{token:state.session.token,inspectionId:id,status:'validated'}); loadDashboard(); } catch(e){alert(e);}
}

export async function deleteInsp(id) {
  if(!confirm('Supprimer cette inspection ? Cette action est irréversible.')) return;
  try { await invoke('cmd_delete_inspection',{token:state.session.token,inspectionId:id}); loadDashboard(); } catch(e){alert(e);}
}

// ═══════════════════ VUE LECTURE SEULE (Lead/Viewer) ═══════════════════
export async function viewReport(id) {
  try {
    const insp = await invoke('cmd_get_inspection',{token:state.session.token, inspectionId:id});
    const savedResps = await invoke('cmd_get_responses',{token:state.session.token, inspectionId:id});
    const grid = await invoke('get_grid',{token:state.session.token,gridId:insp.grid_id});
    if(!grid) { alert('Grille introuvable: '+insp.grid_id); return; }

    state.currentInspectionId = id;
    state.activeGrid = grid; state.sections = grid.sections;
    state.allCriteria = []; state.sections.forEach(s=>s.items.forEach(item=>state.allCriteria.push({...item, sectionTitle:s.title, sectionId:s.id})));
    state.responses = {};
    savedResps.forEach(r=>{ state.responses[r.criterion_id] = {
      conforme: r.conforme, observation: r.observation,
      severity: r.severity || null, factor: r.factor || null,
      factorJustification: r.factor_justification || null,
      immediateDanger: r.immediate_danger || false
    }; });

    document.getElementById('tTitle').textContent=grid.name;
    document.getElementById('tSub').textContent=insp.establishment||grid.code;
    // Aller directement au rapport (pas a l'inspection)
    window.showScreen('report');
    window.renderReport();
  } catch(e){ alert('Erreur: '+e); }
}

// ═══════════════════ EXPORT CSV (Lead/Admin) ═══════════════════
export async function exportAllInspCSV() {
  try {
    const [list, grids] = await Promise.all([
      invoke('cmd_list_inspections',{token:state.session.token, myOnly:false, status:null}),
      invoke('list_grids',{token:state.session.token})
    ]);
    const gridNames = {};
    (grids||[]).forEach(g => { gridNames[g.id] = g.name; });
    const headers = [
      'ID','Date inspection','Etablissement','Type inspection','Grille',
      'Inspecteur principal','Equipe inspection','Statut',
      'Departement','Commune','Responsable/Promoteur',
      'Debut mission','Fin mission',
      'Date attendue envoi rapport','Date rapport preliminaire','Date rapport intermediaire',
      'Date envoi rapport','Date attendue CAPA','Date retour CAPA','Date cloture',
      'Proces-Verbal','Suite administrative','Delivrance acte',
      'Criteres evalues','Conformes','Non conformes','Taux conformite (%)',
      'Valide par','Date validation','Cree par','Date creation'
    ];
    const rows = list.map(i => {
      const m = i.extra_meta || {};
      const p = i.progress || {};
      const rate = p.answered > 0 ? ((p.conforme / p.answered) * 100).toFixed(1) : '';
      return [
        i.id?.substring(0,8) || '',
        i.date_inspection || '',
        (i.establishment || '').replace(/"/g, '""'),
        i.inspection_type || '',
        gridNames[i.grid_id] || i.grid_id || '',
        (m.lead_inspector || i.created_by_name || '').replace(/"/g, '""'),
        (i.inspectors || []).join(', ').replace(/"/g, '""'),
        statusLabel(i.status),
        m.departement || '',
        m.commune || '',
        (m.responsable || '').replace(/"/g, '""'),
        m.periode_du || '',
        m.periode_au || '',
        m.date_rapport_attendue || '',
        m.date_rapport_prelim || '',
        m.date_rapport_interm || '',
        m.date_envoi_rapport || '',
        m.date_capa || '',
        m.date_retour_capa || '',
        m.date_cloture || '',
        m.proces_verbal || '',
        (m.suite_admin || '').replace(/"/g, '""'),
        (m.acte || '').replace(/"/g, '""'),
        p.answered || '',
        p.conforme || '',
        p.non_conforme || '',
        rate,
        i.validated_by_name || '',
        i.validated_at || '',
        i.created_by_name || '',
        i.created_at || ''
      ];
    });
    const csv = [headers.join(';'), ...rows.map(r => r.map(v => `"${v}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inspections_export_' + new Date().toISOString().substring(0,10) + '.csv';
    a.click();
    if(window.showToast) window.showToast('Export CSV genere ('+list.length+' inspections)','info');
  } catch(e){ alert('Erreur export: '+e); }
}
