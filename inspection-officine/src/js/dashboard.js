// ═══════════════════ DASHBOARD V2 ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc } from './utils.js';

export async function loadDashboard() {
  const role = state.session.user.role;
  const isInspector = role === 'inspector';
  document.getElementById('dashTitle').textContent = isInspector ? 'Mes inspections' : 'Toutes les inspections';
  document.getElementById('dashSub').textContent = isInspector ? 'Vos rapports d\'inspection' : 'Vue d\'ensemble de toutes les inspections';

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
    if(search) filtered = filtered.filter(i=>(i.establishment||'').toLowerCase().includes(search));
    if(typeF) filtered = filtered.filter(i=>i.inspection_type===typeF);
    if(statusF) filtered = filtered.filter(i=>i.status===statusF);

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
        const canDelete = role==='admin';
        const canValidate = (role==='admin'||role==='lead_inspector') && i.status==='completed';
        return `<tr onclick="openInspection('${i.id}')">
          <td class="mono">#${shortId}</td>
          <td>${esc(i.date_inspection)||'—'}</td>
          <td class="estab-name">${esc(i.establishment)||'Sans nom'}</td>
          <td>${esc(i.inspection_type)||'—'}</td>
          <td>${g.icon} ${g.name}</td>
          <td>${i.created_by_name||'—'}</td>
          <td><span class="status-badge status-${i.status}">${statusLabel(i.status)}</span></td>
          <td style="text-align:right" onclick="event.stopPropagation()">
            <button class="act-btn" onclick="openInspection('${i.id}')" title="Ouvrir">Ouvrir</button>
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
