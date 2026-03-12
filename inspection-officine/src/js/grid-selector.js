// ═══════════════════ GRID SELECTOR ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc } from './utils.js';

export async function renderGridSelector() {
  if(!state.gridsData.length) state.gridsData = await invoke('list_grids',{token:state.session.token});
  document.getElementById('gridCards').innerHTML = state.gridsData.map(g=>`
    <div class="grid-card" onclick="selectGrid('${g.id}')">
      <span class="icon">${g.icon}</span>
      <div class="name">${g.name}</div>
      <div class="code">${g.code}</div>
      <div class="desc">${g.description}</div>
      <div class="stats"><div class="stat"><strong>${g.criteria_count}</strong> critères</div><div class="stat"><strong>${g.section_count}</strong> sections</div></div>
    </div>
  `).join('');
  window.showScreen('grid-select');
}

export async function selectGrid(gridId) {
  const grid = await invoke('get_grid',{token:state.session.token,gridId});
  state.activeGrid = grid; state.sections = grid.sections;
  state.allCriteria = []; state.sections.forEach(s=>s.items.forEach(item=>state.allCriteria.push({...item, sectionTitle:s.title, sectionId:s.id})));
  state.responses = {}; state.currentIndex = 0;
  state.currentInspectionId = null;
  document.getElementById('metaBadge').innerHTML=`<span>${grid.icon}</span> ${grid.name}`;
  document.getElementById('btnStart').style.background='var(--accent)';
  // Reset tous les champs du formulaire
  document.getElementById('mDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('mEstab').value='';
  document.getElementById('mResp').value='';
  document.getElementById('mType').selectedIndex=0;
  document.getElementById('mInsp').value='';
  document.getElementById('mPeriodeDu').value='';
  document.getElementById('mPeriodeAu').value='';
  document.getElementById('mDateRapport').value='';
  document.getElementById('mDateRapportPrelim').value='';
  document.getElementById('mDateRapportInterm').value='';
  document.getElementById('mDateEnvoiRapport').value='';
  document.getElementById('mDateCapa').value='';
  document.getElementById('mDateRetourCapa').value='';
  document.getElementById('mDateCloture').value='';
  document.getElementById('mPV').value='';
  document.getElementById('mSuiteAdmin').value='';
  document.getElementById('mActe').value='';
  // Reset les selects departement/commune
  const deptSel = document.getElementById('mDept');
  if(deptSel) deptSel.value='';
  const communeSel = document.getElementById('mCommune');
  if(communeSel) { communeSel.innerHTML='<option value="">— Selectionner un departement d\'abord —</option>'; }
  if(state.session) document.getElementById('mLead').value = state.session.user.full_name;
  window.showScreen('meta');
}

// ═══════════════════ AUTO-CALC CAPA J+15 ═══════════════════
export function autoCalcCapa() {
  const envoi = document.getElementById('mDateEnvoiRapport').value;
  if(!envoi) return;
  const d = new Date(envoi);
  d.setDate(d.getDate() + 15);
  const capaField = document.getElementById('mDateCapa');
  // Ne remplit que si vide ou si déjà auto-calculé (pas de saisie manuelle antérieure)
  if(!capaField.value || capaField.dataset.auto==='1') {
    capaField.value = d.toISOString().split('T')[0];
    capaField.dataset.auto = '1';
  }
}
