// ═══════════════════ PLANNING DES INSPECTIONS ═══════════════════
// Programmation, affectation et suivi de la disponibilite des inspecteurs
import { state } from './state.js';
import { invoke } from './api.js';
import { esc } from './utils.js';
import { INSPECTORS, getInspectorDisplay } from './inspectors-data.js';
import { DEPARTEMENTS, getCommunesByDept } from './benin-data.js';

const MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let planningList = [];
let indispoList = [];

export async function renderPlanning() {
  const panel = document.getElementById('planningPanel');
  panel.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted)">Chargement...</p>';

  try {
    planningList = await invoke('cmd_list_planning', { token: state.session.token });
    indispoList = await invoke('cmd_list_indisponibilites', { token: state.session.token });
  } catch (_) { planningList = []; indispoList = []; }

  const role = state.session?.user?.role;
  const canEdit = role === 'admin' || role === 'lead_inspector';

  // Stats planning
  const planifie = planningList.filter(p => p.status === 'planifie').length;
  const enCours = planningList.filter(p => p.status === 'en_cours').length;
  const realise = planningList.filter(p => p.status === 'realise').length;
  const annule = planningList.filter(p => p.status === 'annule').length;
  const totalP = planningList.length;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2 style="margin:0">Programmation des inspections</h2>
        <p style="font-size:13px;color:var(--text-muted);margin-top:4px">Planification, affectation et disponibilite des inspecteurs</p>
      </div>
      <div style="display:flex;gap:8px">
        ${canEdit ? '<button class="btn-primary" style="width:auto;padding:8px 16px;font-size:13px" onclick="showNewPlanningModal()">+ Programmer</button>' : ''}
        ${canEdit ? '<button class="btn-sm" style="padding:8px 12px;font-size:13px" onclick="showIndispoModal()">Indisponibilites</button>' : ''}
      </div>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px">
      <div class="ana-card"><span class="ana-num">${totalP}</span><span class="ana-lbl">Total</span></div>
      <div class="ana-card"><span class="ana-num" style="color:#2563eb">${planifie}</span><span class="ana-lbl">Planifiees</span></div>
      <div class="ana-card"><span class="ana-num" style="color:#d97706">${enCours}</span><span class="ana-lbl">En cours</span></div>
      <div class="ana-card"><span class="ana-num" style="color:#16a34a">${realise}</span><span class="ana-lbl">Realisees</span></div>
      <div class="ana-card"><span class="ana-num" style="color:#9ca3af">${annule}</span><span class="ana-lbl">Annulees</span></div>
    </div>

    <!-- Calendrier mensuel -->
    <div class="ana-section" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <button class="btn-sm" onclick="planningNavMonth(-1)">&larr;</button>
        <h3 style="margin:0;font-size:16px">${MOIS[currentMonth]} ${currentYear}</h3>
        <button class="btn-sm" onclick="planningNavMonth(1)">&rarr;</button>
      </div>
      ${buildCalendar()}
    </div>

    <!-- Disponibilite inspecteurs pour le mois -->
    <div class="ana-section" style="margin-bottom:20px">
      <h3 class="ana-section-title">Disponibilite des inspecteurs — ${MOIS[currentMonth]} ${currentYear}</h3>
      ${buildAvailabilityGrid()}
    </div>

    <!-- Liste des programmations -->
    <div class="ana-section">
      <h3 class="ana-section-title">Liste des programmations</h3>
      ${planningList.length ? `
      <table class="tbl" style="font-size:13px">
        <thead><tr><th>Dates</th><th>Etablissement</th><th>Type</th><th>Dept.</th><th>Inspecteur(s)</th><th>Statut</th>${canEdit ? '<th style="text-align:right">Actions</th>' : ''}</tr></thead>
        <tbody>
        ${planningList.map(p => {
          const statusColors = { planifie: '#2563eb', en_cours: '#d97706', realise: '#16a34a', annule: '#9ca3af' };
          const statusLabels = { planifie: 'Planifiee', en_cours: 'En cours', realise: 'Realisee', annule: 'Annulee' };
          return `<tr>
            <td class="mono" style="font-size:11px;white-space:nowrap">${fmtD(p.date_debut)}${p.date_fin ? ' → ' + fmtD(p.date_fin) : ''}</td>
            <td><strong>${esc(p.establishment || '—')}</strong></td>
            <td>${p.inspection_type || '—'}</td>
            <td>${p.departement || '—'}</td>
            <td style="font-size:12px">${(p.inspectors || []).join(', ') || '—'}</td>
            <td><span style="font-size:11px;padding:3px 8px;font-weight:600;background:${statusColors[p.status] || '#9ca3af'}20;color:${statusColors[p.status] || '#9ca3af'};border:1px solid ${statusColors[p.status] || '#9ca3af'}40">${statusLabels[p.status] || p.status}</span></td>
            ${canEdit ? `<td style="text-align:right;white-space:nowrap">
              ${p.status==='planifie'?`<button class="act-btn" onclick="setPlanningStatus('${p.id}','en_cours')">Demarrer</button>`:''}
              ${p.status==='en_cours'?`<button class="act-btn" onclick="setPlanningStatus('${p.id}','realise')">Terminer</button>`:''}
              ${p.status!=='annule'&&p.status!=='realise'?`<button class="act-btn danger" onclick="deletePlanning('${p.id}')">Suppr.</button>`:''}
            </td>` : ''}
          </tr>`;
        }).join('')}
        </tbody>
      </table>` : '<p style="color:var(--text-muted);text-align:center;padding:20px">Aucune programmation. Cliquez sur "+ Programmer" pour planifier une inspection.</p>'}
    </div>
  `;
}

// ═══════════════════ CALENDRIER ═══════════════════
function buildCalendar() {
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Map des jours planifies
  const dayMap = {};
  planningList.forEach(p => {
    if (!p.date_debut) return;
    const start = new Date(p.date_debut);
    const end = p.date_fin ? new Date(p.date_fin) : start;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        const key = d.getDate();
        if (!dayMap[key]) dayMap[key] = [];
        dayMap[key].push(p);
      }
    }
  });

  // Map des jours d'indisponibilite
  const indispoMap = {};
  indispoList.forEach(ind => {
    const start = new Date(ind.date_debut);
    const end = ind.date_fin ? new Date(ind.date_fin) : start;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        const key = d.getDate();
        if (!indispoMap[key]) indispoMap[key] = [];
        indispoMap[key].push(ind);
      }
    }
  });

  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:12px">';
  JOURS.forEach(j => { html += `<div style="text-align:center;font-weight:600;padding:6px;color:var(--text-muted);font-size:10px;text-transform:uppercase">${j}</div>`; });

  // Jours vides avant le 1er
  for (let i = 0; i < firstDay; i++) html += '<div></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const plans = dayMap[d] || [];
    const indispos = indispoMap[d] || [];
    const isWeekend = new Date(currentYear, currentMonth, d).getDay() === 0 || new Date(currentYear, currentMonth, d).getDay() === 6;

    let bg = 'transparent';
    let border = '1px solid var(--border)';
    if (isToday) border = '2px solid var(--accent)';
    if (isWeekend) bg = 'var(--gray-50)';

    html += `<div style="min-height:60px;padding:4px;background:${bg};border:${border};position:relative">
      <div style="font-weight:${isToday ? '700' : '400'};font-size:11px;color:${isWeekend ? 'var(--text-muted)' : 'var(--text)'}">${d}</div>`;

    plans.slice(0, 2).forEach(p => {
      const colors = { planifie: '#2563eb', en_cours: '#d97706', realise: '#16a34a', annule: '#9ca3af' };
      html += `<div style="font-size:9px;padding:1px 3px;background:${colors[p.status] || '#9ca3af'}20;color:${colors[p.status]};border-left:2px solid ${colors[p.status]};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.establishment || '')}">${esc((p.establishment || '').substring(0, 15))}</div>`;
    });
    if (plans.length > 2) html += `<div style="font-size:9px;color:var(--text-muted)">+${plans.length - 2} autre(s)</div>`;

    indispos.slice(0, 1).forEach(ind => {
      html += `<div style="font-size:9px;padding:1px 3px;background:#fef2f2;color:#dc2626;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${ind.inspecteur} — ${ind.motif||''}">${(ind.inspecteur||'').split(' ')[0]} abs.</div>`;
    });

    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ═══════════════════ GRILLE DISPONIBILITE ═══════════════════
function buildAvailabilityGrid() {
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  // Pour chaque inspecteur, marquer les jours de planning et d'indispo
  const inspData = INSPECTORS.map(insp => {
    const name = getInspectorDisplay(insp);
    const days = {};
    for (let d = 1; d <= daysInMonth; d++) days[d] = 'dispo';

    // Marquer indispos
    indispoList.filter(ind => ind.inspecteur === name || ind.inspecteur === (insp.prenom + ' ' + insp.nom)).forEach(ind => {
      const start = new Date(ind.date_debut);
      const end = ind.date_fin ? new Date(ind.date_fin) : start;
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        if (dt.getMonth() === currentMonth && dt.getFullYear() === currentYear) days[dt.getDate()] = 'indispo';
      }
    });

    // Marquer planifie
    planningList.forEach(p => {
      if (!(p.inspectors || []).some(n => n === name || n.includes(insp.nom))) return;
      const start = new Date(p.date_debut);
      const end = p.date_fin ? new Date(p.date_fin) : start;
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        if (dt.getMonth() === currentMonth && dt.getFullYear() === currentYear) days[dt.getDate()] = 'planifie';
      }
    });

    // Weekends
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(currentYear, currentMonth, d).getDay();
      if (dow === 0 || dow === 6) { if (days[d] === 'dispo') days[d] = 'weekend'; }
    }

    return { insp, name, days };
  });

  const colors = { dispo: '#d1fae5', indispo: '#fecaca', planifie: '#bfdbfe', weekend: '#f3f4f6' };
  const labels = { dispo: 'Disponible', indispo: 'Indisponible', planifie: 'En mission', weekend: 'Weekend' };

  let html = '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%"><thead><tr><th style="text-align:left;padding:4px 6px;font-size:11px;min-width:120px;position:sticky;left:0;background:var(--surface);z-index:1">Inspecteur</th>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(currentYear, currentMonth, d).getDay();
    html += `<th style="padding:2px;text-align:center;font-size:9px;color:${dow === 0 || dow === 6 ? 'var(--text-muted)' : 'var(--text)'};min-width:18px">${d}</th>`;
  }
  html += '</tr></thead><tbody>';

  inspData.forEach(({ insp, name, days }) => {
    html += `<tr><td style="padding:3px 6px;font-size:11px;white-space:nowrap;position:sticky;left:0;background:var(--surface);z-index:1;border-bottom:1px solid var(--border)"><strong>${insp.initiales}</strong> <span style="color:var(--text-muted)">${insp.nom}</span></td>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const st = days[d];
      html += `<td style="padding:1px;text-align:center;background:${colors[st]};border:1px solid #fff" title="${insp.prenom} ${insp.nom} — ${d}/${currentMonth + 1}: ${labels[st]}"></td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  html += `<div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--text-muted)">
    <span><span style="display:inline-block;width:12px;height:12px;background:${colors.dispo};border:1px solid #ccc;vertical-align:middle"></span> Disponible</span>
    <span><span style="display:inline-block;width:12px;height:12px;background:${colors.planifie};border:1px solid #ccc;vertical-align:middle"></span> En mission</span>
    <span><span style="display:inline-block;width:12px;height:12px;background:${colors.indispo};border:1px solid #ccc;vertical-align:middle"></span> Indisponible</span>
    <span><span style="display:inline-block;width:12px;height:12px;background:${colors.weekend};border:1px solid #ccc;vertical-align:middle"></span> Weekend</span>
  </div>`;
  return html;
}

// ═══════════════════ NAVIGATION MOIS ═══════════════════
export function planningNavMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderPlanning();
}

// ═══════════════════ MODAL NOUVEAU PLANNING ═══════════════════
export function showNewPlanningModal() {
  const inspCheckboxes = INSPECTORS.map(insp => {
    const display = getInspectorDisplay(insp);
    return `<label style="display:flex;align-items:center;gap:4px;font-size:12px;padding:2px 0">
      <input type="checkbox" value="${display}" class="plan-insp-cb" style="accent-color:var(--accent)"/>
      <strong>${insp.initiales}</strong> ${insp.nom} ${insp.prenom}
    </label>`;
  }).join('');

  const deptOptions = DEPARTEMENTS.map(d => `<option value="${d.nom}">${d.nom}</option>`).join('');

  const html = `<div style="max-width:600px">
    <h3>Programmer une inspection</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
      <div class="field"><label>Date debut <span class="required">*</span></label><input type="date" id="planDateDebut" required/></div>
      <div class="field"><label>Date fin</label><input type="date" id="planDateFin"/></div>
      <div class="field" style="grid-column:1/-1"><label>Etablissement <span class="required">*</span></label><input id="planEstab" placeholder="Nom de l'etablissement"/></div>
      <div class="field"><label>Type d'inspection</label><select id="planType"><option>Routine</option><option>Enquete</option><option>Plaintes/reclamations</option><option>A la demande</option><option>Pre-ouverture</option><option>Suivi</option><option>Visite de conformite</option></select></div>
      <div class="field"><label>Departement</label><select id="planDept" onchange="planDeptChange()"><option value="">—</option>${deptOptions}</select></div>
      <div class="field"><label>Commune</label><select id="planCommune"><option value="">—</option></select></div>
      <div class="field"><label>Priorite</label><select id="planPriorite"><option value="normale">Normale</option><option value="haute">Haute</option><option value="urgente">Urgente</option></select></div>
      <div class="field" style="grid-column:1/-1"><label>Inspecteurs assignes</label>
        <div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);padding:6px">${inspCheckboxes}</div>
      </div>
      <div class="field" style="grid-column:1/-1"><label>Notes / Observations</label><textarea id="planNotes" rows="2" style="width:100%;font-family:var(--font);font-size:13px;padding:8px;border:1px solid var(--border)"></textarea></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn-sm" onclick="closeModal()">Annuler</button>
      <button class="btn-primary" style="width:auto;padding:8px 20px" onclick="doCreatePlanning()">Programmer</button>
    </div>
  </div>`;
  window.openModal(html);
}

export function planDeptChange() {
  const dept = document.getElementById('planDept').value;
  const communeSel = document.getElementById('planCommune');
  communeSel.innerHTML = '<option value="">—</option>';
  if (dept) getCommunesByDept(dept).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; communeSel.appendChild(o); });
}

export async function doCreatePlanning() {
  const dateDebut = document.getElementById('planDateDebut').value;
  const estab = document.getElementById('planEstab').value;
  if (!dateDebut || !estab) { alert('Date et etablissement requis'); return; }
  const inspectors = [...document.querySelectorAll('.plan-insp-cb:checked')].map(cb => cb.value);

  // Verifier conflits indisponibilite
  const dateFin = document.getElementById('planDateFin').value || dateDebut;
  const conflits = [];
  inspectors.forEach(name => {
    indispoList.forEach(ind => {
      if (ind.inspecteur !== name) return;
      if (ind.date_debut <= dateFin && (ind.date_fin || ind.date_debut) >= dateDebut) {
        conflits.push(`${name.split('(')[0].trim()} est indisponible du ${fmtD(ind.date_debut)} au ${fmtD(ind.date_fin || ind.date_debut)} (${ind.motif || 'non precise'})`);
      }
    });
  });
  if (conflits.length && !confirm('Attention — conflits de disponibilite :\n\n' + conflits.join('\n') + '\n\nContinuer quand meme ?')) return;

  try {
    await invoke('cmd_create_planning', { token: state.session.token, req: {
      date_debut: dateDebut, date_fin: document.getElementById('planDateFin').value || dateDebut,
      establishment: estab, inspection_type: document.getElementById('planType').value,
      departement: document.getElementById('planDept').value, commune: document.getElementById('planCommune').value,
      priorite: document.getElementById('planPriorite').value, inspectors,
      notes: document.getElementById('planNotes').value
    }});
    window.closeModal();
    if (window.showToast) window.showToast('Inspection programmee', 'info');
    renderPlanning();
  } catch (e) { alert('Erreur: ' + e); }
}

// ═══════════════════ MODAL INDISPONIBILITES ═══════════════════
export function showIndispoModal() {
  const inspOptions = INSPECTORS.map(insp => `<option value="${getInspectorDisplay(insp)}">${insp.initiales} — ${insp.nom} ${insp.prenom}</option>`).join('');

  const existingList = indispoList.map(ind => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="flex:1"><strong>${ind.inspecteur?.split('(')[0]?.trim() || '—'}</strong> — ${fmtD(ind.date_debut)} au ${fmtD(ind.date_fin || ind.date_debut)} — <em>${ind.motif || ''}</em></span>
      <button class="act-btn danger" style="font-size:10px" onclick="deleteIndispo('${ind.id}')">Suppr.</button>
    </div>`).join('') || '<p style="color:var(--text-muted);font-size:12px">Aucune indisponibilite enregistree</p>';

  const html = `<div style="max-width:550px">
    <h3>Indisponibilites des inspecteurs</h3>
    <div style="max-height:200px;overflow-y:auto;margin:12px 0;padding:0 4px">${existingList}</div>
    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
    <h4 style="font-size:14px;margin-bottom:12px">Ajouter une indisponibilite</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field" style="grid-column:1/-1"><label>Inspecteur</label><select id="indInsp"><option value="">—</option>${inspOptions}</select></div>
      <div class="field"><label>Du</label><input type="date" id="indDateDebut"/></div>
      <div class="field"><label>Au</label><input type="date" id="indDateFin"/></div>
      <div class="field" style="grid-column:1/-1"><label>Motif</label><select id="indMotif"><option>Conge annuel</option><option>Maladie</option><option>Formation</option><option>Mission externe</option><option>Conge de maternite</option><option>Autre</option></select></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn-sm" onclick="closeModal()">Fermer</button>
      <button class="btn-primary" style="width:auto;padding:8px 16px" onclick="doCreateIndispo()">Ajouter</button>
    </div>
  </div>`;
  window.openModal(html);
}

export async function doCreateIndispo() {
  const inspecteur = document.getElementById('indInsp').value;
  const dateDebut = document.getElementById('indDateDebut').value;
  if (!inspecteur || !dateDebut) { alert('Inspecteur et date requis'); return; }
  try {
    await invoke('cmd_create_indisponibilite', { token: state.session.token, req: {
      inspecteur, date_debut: dateDebut, date_fin: document.getElementById('indDateFin').value || dateDebut,
      motif: document.getElementById('indMotif').value
    }});
    window.closeModal();
    if (window.showToast) window.showToast('Indisponibilite enregistree', 'info');
    renderPlanning();
  } catch (e) { alert('Erreur: ' + e); }
}

export async function deleteIndispo(id) {
  if (!confirm('Supprimer cette indisponibilite ?')) return;
  try { await invoke('cmd_delete_indisponibilite', { token: state.session.token, indisponibiliteId: id }); renderPlanning(); } catch (e) { alert(e); }
}

export async function setPlanningStatus(id, status) {
  try { await invoke('cmd_update_planning', { token: state.session.token, planningId: id, req: { status } }); renderPlanning(); } catch (e) { alert(e); }
}

export async function deletePlanning(id) {
  if (!confirm('Supprimer cette programmation ?')) return;
  try { await invoke('cmd_delete_planning', { token: state.session.token, planningId: id }); renderPlanning(); } catch (e) { alert(e); }
}

function fmtD(s) { if (!s) return '—'; const p = s.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; }
