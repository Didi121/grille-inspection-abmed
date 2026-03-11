// ═══════════════════ CREATE INSPECTION + SIDEBAR + CAROUSEL ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc, validateInput } from './utils.js';
import { skipSection, reactivateSection, updateProgress } from './responses.js';

// ═══════════════════ OPEN EXISTING INSPECTION ═══════════════════
export async function openInspection(id) {
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
    state.currentIndex = 0;

    document.getElementById('tTitle').textContent=grid.name;
    document.getElementById('tSub').textContent=insp.establishment||grid.code;
    document.getElementById('tLogo').style.background='var(--accent)';
    window.showScreen('inspection');
    renderSidebar(); renderCriterion(); updateProgress();
  } catch(e){ alert('Erreur: '+e); }
}

export async function createAndStart() {
  try {
    // ── Champs obligatoires ──
    const establishment = validateInput(document.getElementById('mEstab').value, 'Établissement', 2, 200);
    const date_inspection = document.getElementById('mDate').value;
    if(!date_inspection) throw 'La date d\'inspection est obligatoire';
    const leadInspector = validateInput(document.getElementById('mLead').value, 'Inspecteur principal', 2, 100);
    const inspectorsRaw = document.getElementById('mInsp').value.split(',').map(s=>s.trim()).filter(Boolean);
    if(inspectorsRaw.length === 0) throw 'Veuillez renseigner au moins un inspecteur dans l\'équipe';
    const commune = validateInput(document.getElementById('mCommune').value, 'Commune', 2, 100);
    const departement = validateInput(document.getElementById('mDept').value, 'Département', 2, 100);
    const periodeDu = document.getElementById('mPeriodeDu').value;
    const periodeAu = document.getElementById('mPeriodeAu').value;
    if(!periodeDu) throw 'La date de début de mission est obligatoire';
    if(!periodeAu) throw 'La date de fin de mission est obligatoire';
    if(periodeDu > periodeAu) throw 'La date de début de mission doit être antérieure à la date de fin';
    if(date_inspection < periodeDu || date_inspection > periodeAu) throw 'La date d\'inspection doit être comprise dans la période de mission';

    const extra_meta = {
      responsable: document.getElementById('mResp').value,
      commune,
      departement,
      periode_du: periodeDu,
      periode_au: periodeAu,
      lead_inspector: leadInspector,
      date_rapport_attendue: document.getElementById('mDateRapport').value,
      date_rapport_prelim: document.getElementById('mDateRapportPrelim').value,
      date_rapport_interm: document.getElementById('mDateRapportInterm').value,
      date_envoi_rapport: document.getElementById('mDateEnvoiRapport').value,
      date_capa: document.getElementById('mDateCapa').value,
      date_retour_capa: document.getElementById('mDateRetourCapa').value,
      date_cloture: document.getElementById('mDateCloture').value,
      proces_verbal: document.getElementById('mPV').value,
      suite_admin: document.getElementById('mSuiteAdmin').value,
      acte: document.getElementById('mActe').value
    };
    const req = {
      grid_id: state.activeGrid.id,
      date_inspection,
      establishment,
      inspection_type: document.getElementById('mType').value,
      inspectors: inspectorsRaw,
      extra_meta
    };
    state.currentInspectionId = await invoke('cmd_create_inspection',{token:state.session.token, req});
    document.getElementById('tTitle').textContent=state.activeGrid.name;
    document.getElementById('tSub').textContent=req.establishment||state.activeGrid.code;
    document.getElementById('tLogo').style.background='var(--accent)';
    window.showScreen('inspection');
    renderSidebar(); renderCriterion(); updateProgress();
  } catch(e){ alert('Erreur: '+e); }
}

// ═══════════════════ SIDEBAR ═══════════════════
export function renderSidebar() {
  const list=document.getElementById('secList'); list.innerHTML='';
  let idx=0;
  state.sections.forEach(s=>{
    const start=idx, total=s.items.length;
    const naItems=s.items.filter(i=>state.responses[i.id]&&state.responses[i.id].conforme==='na').length;
    const ans=s.items.filter(i=>state.responses[i.id]&&(state.responses[i.id].conforme===true||state.responses[i.id].conforme===false)).length;
    const allNa=naItems===total;
    const allDone=(ans+naItems)===total;
    const cur=state.currentIndex>=start&&state.currentIndex<start+total;
    const el=document.createElement('div'); el.className='section-item'+(cur?' active':'')+(allNa?' na':'');
    el.style.opacity=allNa?'0.5':'1';
    el.innerHTML=`<div class="si-num">${s.id}</div>
      <div class="si-info"><div class="si-name">${s.title}</div><div class="si-prog">${allNa?'N/A':ans+'/'+(total-naItems)}</div></div>
      <div class="si-badge ${allDone?'done':''}">${allNa?'—':allDone?'✓':ans+'/'+(total-naItems)}</div>`;
    el.onclick=()=>{state.currentIndex=start;renderCriterion();renderSidebar()};
    list.appendChild(el);
    const skipBtn=document.createElement('button'); skipBtn.className='skip-section-btn';
    if(allNa) {
      skipBtn.textContent='Réactiver cette section';
      skipBtn.style.color='#16a34a';
      skipBtn.onclick=(e)=>{e.stopPropagation();reactivateSection(s)};
    } else {
      skipBtn.textContent='Passer cette section → N/A';
      skipBtn.onclick=(e)=>{e.stopPropagation();skipSection(s)};
    }
    list.appendChild(skipBtn);
    idx+=total;
  });
}

// ═══════════════════ CAROUSEL ═══════════════════
export function renderCriterion() {
  const area=document.getElementById('carArea');
  if(!state.allCriteria.length||state.currentIndex<0||state.currentIndex>=state.allCriteria.length)return;
  const c=state.allCriteria[state.currentIndex];
  const r=state.responses[c.id]||{conforme:null,observation:''};
  area.innerHTML=`
    <div class="c-header">
      <span class="c-badge">Critère ${c.id}</span>
      <span class="c-section">${c.sectionTitle}</span>
    </div>
    <div class="criterion-card">
      ${c.reference?`<div class="c-ref">${c.reference}</div>`:''}
      <div class="c-text">${c.description}</div>
      <div class="resp-row">
        <button class="resp-btn oui ${r.conforme===true?'sel':''}" onclick="setResp(${c.id},true)">✓ Conforme</button>
        <button class="resp-btn non ${r.conforme===false?'sel':''}" onclick="setResp(${c.id},false)">✕ Non conforme</button>
        <button class="resp-btn na ${r.conforme==='na'?'sel':''}" onclick="setResp(${c.id},'na')" style="max-width:80px">N/A</button>
      </div>
      ${r.conforme===false?`<div style="margin-top:12px;padding:12px;background:var(--gray-50);border:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text-muted);font-weight:500">Sévérité :</span>
          <select onchange="setSeverity(${c.id},this.value)" style="padding:4px 8px;font-family:var(--font);font-size:12px;border:1px solid var(--border)">
            <option value="critique" ${(r.severity||c.severity||'majeur')==='critique'?'selected':''}>Critique</option>
            <option value="majeur" ${(r.severity||c.severity||'majeur')==='majeur'?'selected':''}>Majeur</option>
            <option value="mineur" ${(r.severity||c.severity||'majeur')==='mineur'?'selected':''}>Mineur</option>
            <option value="info" ${(r.severity||c.severity||'majeur')==='info'?'selected':''}>Observation</option>
          </select>
          <span style="font-size:12px;color:var(--text-muted);font-weight:500;margin-left:8px">Facteur :</span>
          <select onchange="setFactor(${c.id},this.value)" style="padding:4px 8px;font-family:var(--font);font-size:12px;border:1px solid var(--border)">
            <option value="neutre" ${(r.factor||'neutre')==='neutre'?'selected':''}>Neutre</option>
            <option value="aggravant" ${r.factor==='aggravant'?'selected':''}>Aggravant ↑</option>
            <option value="attenuant" ${r.factor==='attenuant'?'selected':''}>Atténuant ↓</option>
          </select>
          ${r.factor&&r.factor!=='neutre'?`<span style="font-size:11px;color:${r.factor==='aggravant'?'#dc2626':'#16a34a'};font-weight:600">→ ${adjustSeverity(r.severity||c.severity||'majeur',r.factor).toUpperCase()}</span>`:''}
        </div>
        ${r.factor&&r.factor!=='neutre'?`<div style="margin-top:8px">
          <input type="text" placeholder="Justification du facteur ${r.factor}..." value="${r.factorJustification||''}"
            oninput="setFactorJustification(${c.id},this.value)"
            style="width:100%;padding:6px 8px;font-family:var(--font);font-size:12px;border:1px solid var(--border);background:var(--white)"/>
        </div>`:''}
        ${(r.severity||c.severity||'majeur')==='critique'?`<div style="margin-top:8px;display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="immDanger_${c.id}" ${r.immediateDanger?'checked':''}
            onchange="setImmediateDanger(${c.id},this.checked)"/>
          <label for="immDanger_${c.id}" style="font-size:11px;color:#7f1d1d;font-weight:600;cursor:pointer">
            Risque immédiat pour la santé publique
          </label>
        </div>`:''}
      </div>`:''}
      <div class="obs-lbl">Observations</div>
      <textarea class="obs-input" placeholder="Observation…" oninput="updateObs(${c.id},this.value)">${r.observation||''}</textarea>
    </div>
    <div class="c-nav">
      <button class="nav-arr" onclick="nav(-1)" ${state.currentIndex===0?'disabled':''}>← Précédent</button>
      <span class="nav-cnt">${state.currentIndex+1} / ${state.allCriteria.length}</span>
      <button class="nav-arr primary" onclick="nav(1)" ${state.currentIndex>=state.allCriteria.length-1?'disabled':''}>Suivant →</button>
    </div>`;
  // Bouton rapport flottant toujours visible
  if(!document.getElementById('btnReportFloat')){
    const fb=document.createElement('button'); fb.id='btnReportFloat'; fb.className='btn-report-anytime';
    fb.textContent='Rapport →'; fb.onclick=()=>{window.showScreen('report');window.renderReport()};
    document.getElementById('s-inspection').appendChild(fb);
  }
}
