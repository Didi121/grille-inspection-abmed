// ═══════════════════ GRILLES ADMIN PANEL ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc, escAttr } from './utils.js';

export async function renderGridsAdmin() {
  try {
    const grids = await invoke('cmd_list_grids_admin',{token:state.session.token});
    document.getElementById('gridsPanel').innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-m)">
        <h2>Gestion des grilles</h2>
        <button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="showCreateGridModal()">+ Nouvelle grille</button>
      </div>
      ${grids.length===0?'<p style="color:var(--text-muted)">Aucune grille active</p>':''}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:var(--space-s)">
      ${grids.map(g=>`
        <div style="border:1px solid var(--border);padding:var(--space-s);background:var(--surface)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-size:28px">${g.icon}</span>
            <div>
              <strong style="font-size:16px">${g.name}</strong><br/>
              <span style="font-family:var(--mono);font-size:12px;color:var(--text-muted)">${g.code}</span>
            </div>
          </div>
          <div style="display:flex;gap:16px;font-size:13px;margin-bottom:12px">
            <span><strong>${g.section_count}</strong> sections</span>
            <span><strong>${g.criteria_count}</strong> critères</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn-primary" style="width:auto;padding:6px 12px;font-size:12px" onclick="openGridEditor('${g.id}')">Ouvrir / Modifier</button>
            <button class="btn-sm" onclick="duplicateGrid('${g.id}','${g.name}')">Dupliquer</button>
            <button class="btn-sm" onclick="showGridVersions('${g.id}')">Versions</button>
            <button class="btn-sm" style="color:var(--accent)" onclick="archiveGrid('${g.id}')">Supprimer</button>
          </div>
        </div>
      `).join('')}
      </div>`;
  } catch(e){ document.getElementById('gridsPanel').innerHTML=`<p style="color:var(--accent)">Erreur: ${e}</p>`; }
}

export function showCreateGridModal() {
  window.openModal(`<h3>Nouvelle grille</h3>
    <div class="field"><label>Identifiant unique</label><input id="cgId" placeholder="ex: pui, laboratoire"/></div>
    <div class="field"><label>Nom complet</label><input id="cgName" placeholder="Inspection Pharmacie à Usage Interne"/></div>
    <div class="field"><label>Code référence</label><input id="cgCode" placeholder="IP-F-0020"/></div>
    <div class="field"><label>Description</label><textarea id="cgDesc" placeholder="Description de la grille..." rows="3"></textarea></div>
    <div style="display:flex;gap:12px">
      <div class="field"><label>Icône</label><input id="cgIcon" value="🔬" style="width:60px;font-size:20px;text-align:center"/></div>
      <div class="field" style="flex:1"><label>Couleur</label><input id="cgColor" type="color" value="#8b5cf6" style="width:100%;height:36px"/></div>
    </div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doCreateGrid()">Créer la grille</button></div>`);
}
export async function doCreateGrid() {
  const id=document.getElementById('cgId').value.trim();
  const name=document.getElementById('cgName').value.trim();
  if(!id||!name){alert('ID et nom sont obligatoires');return;}
  try {
    await invoke('cmd_create_grid',{token:state.session.token, req:{
      id, name, code:document.getElementById('cgCode').value.trim(),
      description:document.getElementById('cgDesc').value.trim(),
      icon:document.getElementById('cgIcon').value, color:document.getElementById('cgColor').value
    }});
    window.closeModal(); renderGridsAdmin();
  } catch(e){alert('Erreur: '+e)}
}

export async function openGridEditor(gridId) {
  try {
    const grid = await invoke('get_grid',{token:state.session.token,gridId});
    if(!grid) throw 'Grille introuvable';
    const p = document.getElementById('gridsPanel');
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-s)">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn-sm" onclick="renderGridsAdmin()">← Retour</button>
          <span style="font-size:28px">${grid.icon}</span>
          <div>
            <strong style="font-size:18px">${grid.name}</strong>
            <span style="font-family:var(--mono);font-size:12px;color:var(--text-muted);margin-left:8px">${grid.code} — v${grid.version}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="showEditMetaModal('${gridId}','${escAttr(grid.name)}','${escAttr(grid.description)}','${grid.icon}')">Métadonnées</button>
          <button class="btn-sm" onclick="showGridVersions('${gridId}')">Versions</button>
          <button class="btn-sm" onclick="doExportGrid('${gridId}')">Exporter JSON</button>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-s);padding:8px 12px;background:var(--surface);border:1px solid var(--border)">
        <span style="font-size:14px"><strong>${grid.sections.length}</strong> sections — <strong>${grid.sections.reduce((s,sec)=>s+sec.items.length,0)}</strong> critères</span>
        <button class="btn-primary" style="width:auto;padding:6px 12px;font-size:12px" onclick="showAddSectionModal('${gridId}')">+ Ajouter une section</button>
      </div>`;

    grid.sections.forEach(section => {
      html += `
      <div style="border:1px solid var(--border);margin-bottom:var(--space-s)">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--surface);border-bottom:1px solid var(--border)">
          <strong style="font-size:14px">${section.id}. ${section.title}</strong>
          <div style="display:flex;gap:6px">
            <button class="btn-sm" style="font-size:11px" onclick="showAddCriterionModal('${gridId}',${section.id},'${escAttr(section.title)}')">+ Critère</button>
            <button class="btn-sm" style="font-size:11px" onclick="showEditSectionModal('${gridId}',${section.id},'${escAttr(section.title)}')">Renommer</button>
            <button class="btn-sm" style="font-size:11px;color:var(--accent)" onclick="doDeleteSection('${gridId}',${section.id})">Suppr.</button>
          </div>
        </div>`;
      if(section.items.length===0) {
        html += `<div style="padding:12px 14px;font-size:13px;color:var(--text-muted)">Aucun critère</div>`;
      } else {
        html += `<table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--gray-100)">
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-muted);font-weight:500">ID</th>
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-muted);font-weight:500">Réf.</th>
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-muted);font-weight:500">Description</th>
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-muted);font-weight:500">Sévérité</th>
            <th style="text-align:right;padding:6px 10px;font-size:11px;color:var(--text-muted);font-weight:500">Actions</th>
          </tr></thead><tbody>`;
        section.items.forEach(c=>{
          html += `<tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 10px;font-family:var(--mono);font-size:12px;color:var(--text-muted)">${c.id}</td>
            <td style="padding:6px 10px;font-family:var(--mono);font-size:12px">${c.reference||'—'}</td>
            <td style="padding:6px 10px">${c.description}</td>
            <td style="padding:6px 10px"><span style="font-size:11px;padding:2px 6px;background:${{'critique':'#fef2f2','majeur':'#fffbeb','mineur':'#eff6ff','info':'#f3f4f6'}[c.severity||'majeur']};color:${{'critique':'#dc2626','majeur':'#d97706','mineur':'#2563eb','info':'#6b7280'}[c.severity||'majeur']}">${(c.severity||'majeur').toUpperCase()}</span></td>
            <td style="padding:6px 10px;text-align:right">
              <button class="btn-sm" style="font-size:11px" onclick="showEditCriterionModal('${gridId}',${c.id},'${escAttr(c.reference)}','${escAttr(c.description)}',${c.pre_opening},'${c.severity||''}')">Modifier</button>
              <button class="btn-sm" style="font-size:11px;color:var(--accent)" onclick="doDeleteCriterion('${gridId}',${c.id})">Suppr.</button>
            </td>
          </tr>`;
        });
        html += `</tbody></table>`;
      }
      html += `</div>`;
    });
    p.innerHTML = html;
  } catch(e){ document.getElementById('gridsPanel').innerHTML=`<p style="color:var(--accent)">Erreur: ${e}</p>`; }
}

export function showEditMetaModal(gridId,name,desc,icon) {
  window.openModal(`<h3>Métadonnées</h3>
    <div class="field"><label>Nom</label><input id="emName" value="${name}"/></div>
    <div class="field"><label>Description</label><textarea id="emDesc" rows="3">${desc}</textarea></div>
    <div class="field"><label>Icône</label><input id="emIcon" value="${icon}" style="width:60px;font-size:20px;text-align:center"/></div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doEditMeta('${gridId}')">Enregistrer</button></div>`);
}
export async function doEditMeta(gridId) {
  try {
    await invoke('cmd_update_grid_meta',{token:state.session.token, gridId, name:document.getElementById('emName').value, description:document.getElementById('emDesc').value, icon:document.getElementById('emIcon').value});
    window.closeModal(); openGridEditor(gridId);
  } catch(e){alert('Erreur: '+e)}
}

export function showAddSectionModal(gridId) {
  window.openModal(`<h3>Nouvelle section</h3>
    <div class="field"><label>Titre</label><input id="asTitle" placeholder="Ex: Locaux et équipements"/></div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doAddSection('${gridId}')">Ajouter</button></div>`);
}
export async function doAddSection(gridId) {
  try { await invoke('cmd_create_section',{token:state.session.token, req:{grid_id:gridId, title:document.getElementById('asTitle').value}}); window.closeModal(); openGridEditor(gridId); } catch(e){alert(e)}
}

export function showEditSectionModal(gridId,sectionId,title) {
  window.openModal(`<h3>Renommer la section</h3>
    <div class="field"><label>Titre</label><input id="esTitle" value="${title}"/></div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doEditSection('${gridId}',${sectionId})">Enregistrer</button></div>`);
}
export async function doEditSection(gridId,sectionId) {
  try { await invoke('cmd_update_section',{token:state.session.token, gridId, sectionId, title:document.getElementById('esTitle').value}); window.closeModal(); openGridEditor(gridId); } catch(e){alert(e)}
}
export async function doDeleteSection(gridId,sectionId) {
  if(!confirm('Supprimer cette section et tous ses critères ?')) return;
  try { await invoke('cmd_delete_section',{token:state.session.token, gridId, sectionId}); openGridEditor(gridId); } catch(e){alert(e)}
}

export function severitySelect(elId, current) {
  return `<select id="${elId}" style="padding:6px;font-family:var(--font);font-size:13px;border:1px solid var(--border)">
    <option value="critique" ${current==='critique'?'selected':''}>Critique</option>
    <option value="majeur" ${current==='majeur'||!current?'selected':''}>Majeur</option>
    <option value="mineur" ${current==='mineur'?'selected':''}>Mineur</option>
    <option value="info" ${current==='info'?'selected':''}>Observation / Info</option>
  </select>`;
}
export function showAddCriterionModal(gridId,sectionId,sectionTitle) {
  window.openModal(`<h3>Nouveau critère — ${sectionTitle}</h3>
    <div class="field"><label>Référence</label><input id="acRef" placeholder="BPDisp 1.3"/></div>
    <div class="field"><label>Description</label><textarea id="acDesc" rows="3" placeholder="Description du critère"></textarea></div>
    <div class="field"><label>Sévérité par défaut</label>${severitySelect('acSev','majeur')}</div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doAddCriterion('${gridId}',${sectionId})">Ajouter</button></div>`);
}
export async function doAddCriterion(gridId,sectionId) {
  const sev=document.getElementById('acSev').value;
  const preOp=sev==='critique';
  try { await invoke('cmd_create_criterion',{token:state.session.token, req:{grid_id:gridId, section_id:sectionId, reference:document.getElementById('acRef').value, description:document.getElementById('acDesc').value, pre_opening:preOp, severity:sev}}); window.closeModal(); openGridEditor(gridId); } catch(e){alert(e)}
}

export function showEditCriterionModal(gridId,criterionId,ref,desc,preOp,sev) {
  const currentSev = sev || (preOp ? 'critique' : 'majeur');
  window.openModal(`<h3>Modifier critère #${criterionId}</h3>
    <div class="field"><label>Référence</label><input id="ecRef" value="${ref}"/></div>
    <div class="field"><label>Description</label><textarea id="ecDesc" rows="3">${desc}</textarea></div>
    <div class="field"><label>Sévérité par défaut</label>${severitySelect('ecSev',currentSev)}</div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doEditCriterion('${gridId}',${criterionId})">Enregistrer</button></div>`);
}
export async function doEditCriterion(gridId,criterionId) {
  const sev=document.getElementById('ecSev').value;
  try { await invoke('cmd_update_criterion',{token:state.session.token, gridId, criterionId, reference:document.getElementById('ecRef').value, description:document.getElementById('ecDesc').value, preOpening:sev==='critique', severity:sev}); window.closeModal(); openGridEditor(gridId); } catch(e){alert(e)}
}
export async function doDeleteCriterion(gridId,criterionId) {
  if(!confirm('Supprimer ce critère ?')) return;
  try { await invoke('cmd_delete_criterion',{token:state.session.token, gridId, criterionId}); openGridEditor(gridId); } catch(e){alert(e)}
}

export async function archiveGrid(gridId) {
  if(!confirm('Archiver cette grille ?')) return;
  try { await invoke('cmd_archive_grid',{token:state.session.token, gridId}); renderGridsAdmin(); } catch(e){alert(e)}
}
export async function duplicateGrid(gridId, gridName) {
  const newId = prompt('Identifiant de la copie :', gridId + '-copie');
  if(!newId) return;
  const newName = prompt('Nom de la copie :', gridName + ' (copie)');
  if(!newName) return;
  try { await invoke('cmd_duplicate_grid',{token:state.session.token, gridId, newId, newName}); renderGridsAdmin(); } catch(e){alert(e)}
}
export async function showGridVersions(gridId) {
  try {
    const versions = await invoke('cmd_list_grid_versions',{token:state.session.token, gridId});
    let html = `<h3>Historique des versions</h3>`;
    if(versions.length===0){ html += '<p style="color:var(--text-muted)">Aucune version</p>'; }
    versions.forEach(v=>{
      html += `<div style="padding:10px;border:1px solid var(--border);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
        <div><strong>Version ${v[0]}</strong><br/><small style="color:var(--text-muted)">${v[2]} — ${v[1]||'Aucun résumé'}</small></div>
        <button class="btn-sm" onclick="rollbackVersion('${gridId}','${v[0]}')">Restaurer</button>
      </div>`;
    });
    html += `<div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Fermer</button></div>`;
    window.openModal(html);
  } catch(e){alert(e)}
}
export async function rollbackVersion(gridId, version) {
  if(!confirm('Restaurer la version '+version+' ?')) return;
  try { await invoke('cmd_rollback_grid_version',{token:state.session.token, gridId, targetVersion:version}); window.closeModal(); openGridEditor(gridId); } catch(e){alert(e)}
}
export async function doExportGrid(gridId) {
  try {
    const json = await invoke('cmd_export_grid_json',{token:state.session.token, gridId});
    const blob=new Blob([json],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='grille_'+gridId+'.json'; a.click();
  } catch(e){alert(e)}
}
