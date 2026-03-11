// ═══════════════════ RESPONSES ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { adjustSeverity } from './risk-engine.js';

export function riskParams(id) {
  const r = state.responses[id] || {};
  return {
    severity: r.severity || null,
    factor: r.factor || null,
    factorJustification: r.factorJustification || null,
    immediateDanger: r.immediateDanger || false
  };
}

export function skipSection(section) {
  section.items.forEach(item => {
    if(!state.responses[item.id]) state.responses[item.id]={conforme:null,observation:''};
    state.responses[item.id].conforme='na';
    if(state.currentInspectionId && state.session) {
      invoke('cmd_save_response',{token:state.session.token, inspectionId:state.currentInspectionId, criterionId:item.id, conforme:null, observation:'[N/A]', ...riskParams(item.id)}).catch(()=>{});
    }
  });
  window.renderSidebar(); window.renderCriterion(); updateProgress();
}

export function reactivateSection(section) {
  section.items.forEach(item => {
    if(state.responses[item.id]) {
      state.responses[item.id].conforme=null;
      state.responses[item.id].observation = state.responses[item.id].observation === '[N/A]' ? '' : state.responses[item.id].observation;
    }
    if(state.currentInspectionId && state.session) {
      invoke('cmd_save_response',{token:state.session.token, inspectionId:state.currentInspectionId, criterionId:item.id, conforme:null, observation:'', ...riskParams(item.id)}).catch(()=>{});
    }
  });
  window.renderSidebar(); window.renderCriterion(); updateProgress();
}

export function setSeverity(id, sev) {
  if(!state.responses[id]) state.responses[id]={conforme:null,observation:''};
  state.responses[id].severity = sev;
}

export async function setResp(id,val) {
  if(!state.responses[id]) state.responses[id]={conforme:null,observation:''};
  // Toggle: reclique = désélectionne, null = reset explicite, 'na' = non applicable
  const newVal = (val === null) ? null : (state.responses[id].conforme === val) ? null : val;
  state.responses[id].conforme = newVal;
  // Initialiser la sévérité depuis la grille si pas encore définie
  if(newVal===false && !state.responses[id].severity) {
    const crit = state.allCriteria.find(c=>c.id===id);
    state.responses[id].severity = crit?.severity || (crit?.pre_opening ? 'critique' : 'majeur');
  }
  // Pour le backend: 'na' est sauvegardé comme null avec observation [N/A]
  const backendVal = (newVal === 'na') ? null : newVal;
  const obs = state.responses[id].observation || (newVal === 'na' ? '[N/A]' : '');
  if(state.currentInspectionId && state.session) {
    try { await invoke('cmd_save_response',{token:state.session.token, inspectionId:state.currentInspectionId, criterionId:id, conforme:backendVal, observation:obs, ...riskParams(id)}); }
    catch(e){ console.error('Save error',e); }
  }
  window.renderCriterion(); updateProgress(); window.renderSidebar();
}

export async function updateObs(id,text) {
  if(!state.responses[id]) state.responses[id]={conforme:null,observation:''};
  state.responses[id].observation=text;
  clearTimeout(updateObs._t);
  updateObs._t = setTimeout(async()=>{
    if(state.currentInspectionId && state.session) {
      try { await invoke('cmd_save_response',{token:state.session.token, inspectionId:state.currentInspectionId, criterionId:id, conforme:state.responses[id].conforme, observation:text, ...riskParams(id)}); }
      catch(e){ console.error(e); }
    }
  }, 600);
}

export function nav(dir){state.currentIndex=Math.max(0,Math.min(state.allCriteria.length-1,state.currentIndex+dir));window.renderCriterion();window.renderSidebar()}

export function updateProgress() {
  const total=state.allCriteria.length;
  const naCount=Object.values(state.responses).filter(r=>r.conforme==='na').length;
  const applicable=total-naCount;
  const ans=Object.values(state.responses).filter(r=>r.conforme===true||r.conforme===false).length;
  const pct=applicable>0?(ans/applicable)*100:0;
  document.getElementById('pFill').style.width=pct+'%';
  document.getElementById('pCount').textContent=applicable<total?`${ans} / ${applicable} (${naCount} N/A)`:`${ans} / ${total}`;
}

export function setFactor(id, factor) {
  if(!state.responses[id]) state.responses[id]={conforme:null,observation:''};
  state.responses[id].factor = factor;
  persistRisk(id);
}

export function setFactorJustification(id, text) {
  if(!state.responses[id]) state.responses[id]={conforme:null,observation:''};
  state.responses[id].factorJustification = text;
  clearTimeout(setFactorJustification._t);
  setFactorJustification._t = setTimeout(()=>persistRisk(id), 600);
}

export function setImmediateDanger(id, checked) {
  if(!state.responses[id]) state.responses[id]={conforme:null,observation:''};
  state.responses[id].immediateDanger = checked;
  persistRisk(id);
  window.renderCriterion();
}

export async function persistRisk(id) {
  if(!state.currentInspectionId || !state.session) return;
  const r = state.responses[id] || {};
  const conf = r.conforme === 'na' ? null : (r.conforme ?? null);
  try { await invoke('cmd_save_response',{token:state.session.token, inspectionId:state.currentInspectionId, criterionId:id, conforme:conf, observation:r.observation||'', ...riskParams(id)}); }
  catch(e){ console.error('persistRisk error',e); }
}
