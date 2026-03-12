// ═══════════════════════════════════════════════════════
// APP.JS — Point d'entrée v3 modulaire
// Orchestre tous les modules et expose les fonctions au DOM
// ═══════════════════════════════════════════════════════

import { state, isTauri } from './state.js';
import { invoke } from './api.js';
import { esc, escAttr, validateInput, validatePassword } from './utils.js';
import { doLogin, doLogout, afterLogin, goToDashboard, buildTopNav, showForcePasswordChange, doForcePasswordChange, roleLabel } from './auth.js';
import { loadDashboard, statusLabel, resetDashFilters, quickValidate, deleteInsp, viewReport, exportAllInspCSV } from './dashboard.js';
import { renderGridSelector, selectGrid, autoCalcCapa } from './grid-selector.js';
import { createAndStart, openInspection, renderSidebar, renderCriterion } from './inspection.js';
import { riskParams, skipSection, reactivateSection, setSeverity, setResp, updateObs, nav, updateProgress, setFactor, setFactorJustification, setImmediateDanger, persistRisk } from './responses.js';
import { renderReport, setInspStatus, exportJSON, openSuiviModal, autoCalcCapaSuivi, saveSuiviMeta } from './report.js';
import { searchEstablishments, typeLabel as estabTypeLabel } from './establishments-data.js';
import { INSPECTORS, searchInspectors, getInspectorDisplay } from './inspectors-data.js';
import { renderGridsAdmin, showCreateGridModal, doCreateGrid, openGridEditor, showEditMetaModal, doEditMeta, showAddSectionModal, doAddSection, showEditSectionModal, doEditSection, doDeleteSection, severitySelect, showAddCriterionModal, doAddCriterion, showEditCriterionModal, doEditCriterion, doDeleteCriterion, archiveGrid, duplicateGrid, showGridVersions, rollbackVersion, doExportGrid } from './admin-grids.js';
import { renderUsers, showCreateUserModal, doCreateUser, showEditUserModal, doEditUser, showChangePwModal, doChangePw, deactivateUser, reactivateUser } from './admin-users.js';
import { renderAudit, exportAuditCSV } from './audit.js';
import { renderAnalytics } from './analytics.js';
import { DEPARTEMENTS, getCommunesByDept } from './benin-data.js';

// ═══════════════════ SCREEN NAVIGATION ═══════════════════

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('visible'));
  document.getElementById('s-' + name).classList.add('visible');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.s === name));
  document.getElementById('pStrip').style.display = name === 'inspection' ? 'flex' : 'none';
  const kbdH = document.getElementById('kbdHints');
  if (kbdH) kbdH.style.display = name === 'inspection' ? 'flex' : 'none';
  const sideT = document.getElementById('sideToggle');
  if (sideT) sideT.style.display = name === 'inspection' ? '' : 'none';
  // Auto-load pour certains écrans
  if (name === 'grid-select') renderGridSelector();
  if (name === 'users') renderUsers();
  if (name === 'audit') renderAudit();
  if (name === 'grids') renderGridsAdmin();
  if (name === 'analytics') renderAnalytics();
  if (name === 'dash') loadDashboard();
}

// ═══════════════════ MODAL ═══════════════════

export function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('visible');
}

export function closeModal() {
  document.getElementById('modalOverlay').classList.remove('visible');
}

// ═══════════════════ TOAST NOTIFICATIONS ═══════════════════

function ensureToastContainer() {
  let c = document.getElementById('toastContainer');
  if (!c) { c = document.createElement('div'); c.id = 'toastContainer'; c.className = 'toast-container'; document.body.appendChild(c); }
  return c;
}

export function showToast(message, type = 'info', duration = 3000) {
  const c = ensureToastContainer();
  const t = document.createElement('div');
  t.className = 'toast' + (type !== 'info' ? ' ' + type : '');
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; setTimeout(() => t.remove(), 300); }, duration);
}

// ═══════════════════ KEYBOARD SHORTCUTS ═══════════════════

document.addEventListener('keydown', e => {
  if (!document.getElementById('s-inspection').classList.contains('visible')) return;
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
  if (e.key === 'o' || e.key === 'O') { e.preventDefault(); const c = state.allCriteria[state.currentIndex]; if (c) setResp(c.id, true); }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); const c = state.allCriteria[state.currentIndex]; if (c) setResp(c.id, false); }
  if (e.key === 'x' || e.key === 'X') { e.preventDefault(); const c = state.allCriteria[state.currentIndex]; if (c) setResp(c.id, 'na'); }
  if (e.key === ' ' || e.key === 'Backspace') { e.preventDefault(); const c = state.allCriteria[state.currentIndex]; if (c && state.responses[c.id]) { state.responses[c.id].conforme = null; setResp(c.id, null); } }
});

// ═══════════════════ INIT ═══════════════════

// ═══════════════════ BENIN DROPDOWNS ═══════════════════

function populateDeptSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Selectionner —</option>';
  DEPARTEMENTS.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.nom; opt.textContent = d.nom;
    if (d.nom === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onDeptChange() {
  const dept = document.getElementById('mDept').value;
  const communeSel = document.getElementById('mCommune');
  communeSel.innerHTML = '<option value="">— Selectionner —</option>';
  if (dept) {
    getCommunesByDept(dept).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      communeSel.appendChild(opt);
    });
  }
}

function onDashDeptFilterChange() {
  const dept = document.getElementById('dDeptFilter').value;
  const communeSel = document.getElementById('dCommuneFilter');
  communeSel.innerHTML = '<option value="">Commune</option>';
  if (dept) {
    getCommunesByDept(dept).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      communeSel.appendChild(opt);
    });
  }
  if (state.session) loadDashboard();
}

// ═══════════════════ AUTOCOMPLETE ═══════════════════

function setupAutocomplete(inputId, searchFn, renderFn, onSelectFn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let dropdown = null;
  const ensureDropdown = () => {
    if (dropdown) return dropdown;
    dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.cssText = 'position:absolute;z-index:100;background:var(--white,#fff);border:1px solid var(--border,#e2e8f0);max-height:220px;overflow-y:auto;width:100%;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:none;font-size:13px';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(dropdown);
    return dropdown;
  };
  input.addEventListener('input', () => {
    const dd = ensureDropdown();
    const results = searchFn(input.value);
    if (!results.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = results.map((r, i) => renderFn(r, i)).join('');
    dd.style.display = 'block';
  });
  input.addEventListener('blur', () => { setTimeout(() => { if (dropdown) dropdown.style.display = 'none'; }, 200); });
  input.addEventListener('keydown', e => { if (e.key === 'Escape' && dropdown) dropdown.style.display = 'none'; });
  return { input, getDropdown: ensureDropdown };
}

function selectEstabSuggestion(nom, dept, commune, responsable) {
  const estabInput = document.getElementById('mEstab');
  if (estabInput) estabInput.value = nom;
  if (responsable) {
    const respInput = document.getElementById('mResp');
    if (respInput && !respInput.value) respInput.value = responsable;
  }
  if (dept) {
    const deptSel = document.getElementById('mDept');
    if (deptSel) { deptSel.value = dept; onDeptChange(); }
    if (commune) {
      setTimeout(() => {
        const communeSel = document.getElementById('mCommune');
        if (communeSel) communeSel.value = commune;
      }, 50);
    }
  }
}

function selectInspSuggestion(display) {
  const inspInput = document.getElementById('mInsp');
  if (!inspInput) return;
  const current = inspInput.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!current.includes(display)) current.push(display);
  inspInput.value = current.join(', ');
}

document.addEventListener('DOMContentLoaded', async () => {
  // Initialiser les dropdowns departement
  populateDeptSelect('mDept');
  populateDeptSelect('dDeptFilter');

  // Autocomplete etablissement
  setupAutocomplete('mEstab',
    q => searchEstablishments(q, 12),
    (e, i) => `<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;hover:background:#f8fafc"
      onmousedown="selectEstabSuggestion('${e.n.replace(/'/g,"\\'")}','${e.d}','${e.c}','${e.r.replace(/'/g,"\\'")}')"
      onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
      <div style="font-weight:600">${e.n}</div>
      <div style="font-size:11px;color:#64748b">${estabTypeLabel(e.t)} — ${e.c}, ${e.d}${e.r?' — '+e.r:''}</div>
    </div>`,
    null
  );

  // Autocomplete inspecteurs
  setupAutocomplete('mInsp',
    q => { const parts = q.split(','); const last = (parts[parts.length-1]||'').trim(); return searchInspectors(last); },
    (insp, i) => {
      const display = getInspectorDisplay(insp);
      return `<div style="padding:6px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9"
        onmousedown="selectInspSuggestion('${display.replace(/'/g,"\\'")}')"
        onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
        <span style="font-weight:600">${insp.nom}</span> ${insp.prenom}
        <span style="float:right;font-size:11px;color:#64748b;font-weight:700">${insp.initiales}</span>
      </div>`;
    },
    null
  );

  // Autocomplete inspecteur principal
  setupAutocomplete('mLead',
    q => searchInspectors(q),
    (insp, i) => {
      const display = getInspectorDisplay(insp);
      return `<div style="padding:6px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9"
        onmousedown="document.getElementById('mLead').value='${display.replace(/'/g,"\\'")}'"
        onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
        <span style="font-weight:600">${insp.nom}</span> ${insp.prenom}
        <span style="float:right;font-size:11px;color:#64748b;font-weight:700">${insp.initiales}</span>
      </div>`;
    },
    null
  );

  // Attacher les filtres du dashboard
  ['dSearch', 'dTypeFilter', 'dStatusFilter', 'dDeptFilter', 'dCommuneFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { if (state.session) loadDashboard(); });
  });
  // Liaison cascadee departement -> commune pour le filtre dashboard
  const dDeptF = document.getElementById('dDeptFilter');
  if (dDeptF) dDeptF.addEventListener('change', onDashDeptFilterChange);

  // Aide raccourcis clavier (visible pendant l'inspection)
  const kbdHints = document.createElement('div');
  kbdHints.className = 'kbd-hints';
  kbdHints.id = 'kbdHints';
  kbdHints.style.display = 'none';
  kbdHints.innerHTML = '<span><span class="kbd">O</span> Conforme</span><span><span class="kbd">N</span> Non conforme</span><span><span class="kbd">X</span> N/A</span><span><span class="kbd">Espace</span> Reset</span><span><span class="kbd">&larr;</span><span class="kbd">&rarr;</span> Navigation</span>';
  document.body.appendChild(kbdHints);

  // Bouton sidebar toggle mobile
  const sideToggle = document.createElement('button');
  sideToggle.className = 'sidebar-toggle';
  sideToggle.id = 'sideToggle';
  sideToggle.style.display = 'none';
  sideToggle.innerHTML = '&#9776;';
  sideToggle.onclick = () => {
    const sb = document.getElementById('secList');
    if (sb) { sb.style.display = sb.style.display === 'none' ? 'block' : 'none'; }
  };
  document.body.appendChild(sideToggle);

  // Restaurer la session si elle existe
  try {
    const saved = JSON.parse(sessionStorage.getItem('ipharma_session'));
    if (saved && saved.token) {
      const user = await invoke('cmd_validate_session', { token: saved.token });
      state.session = { token: saved.token, user };
      afterLogin();
      return;
    }
  } catch (_) { sessionStorage.removeItem('ipharma_session'); }
  document.getElementById('loginUser')?.focus();
});

// ═══════════════════ EXPOSE TO DOM (onclick handlers) ═══════════════════
// Les fonctions appelées depuis le HTML via onclick doivent être sur window

window.showScreen = showScreen;
window.openModal = openModal;
window.closeModal = closeModal;

// Auth
window.doLogin = doLogin;
window.doLogout = doLogout;
window.goToDashboard = goToDashboard;
window.doForcePasswordChange = doForcePasswordChange;

// Dashboard
window.loadDashboard = loadDashboard;
window.openInspection = openInspection;
window.quickValidate = quickValidate;
window.deleteInsp = deleteInsp;
window.resetDashFilters = resetDashFilters;
window.viewReport = viewReport;
window.exportAllInspCSV = exportAllInspCSV;

// Grid selector
window.selectGrid = selectGrid;
window.autoCalcCapa = autoCalcCapa;

// Inspection
window.createAndStart = createAndStart;
window.renderSidebar = renderSidebar;
window.renderCriterion = renderCriterion;
window.renderReport = renderReport;
window.updateProgress = updateProgress;

// Responses
window.setResp = setResp;
window.updateObs = updateObs;
window.nav = nav;
window.skipSection = skipSection;
window.reactivateSection = reactivateSection;
window.setSeverity = setSeverity;
window.setFactor = setFactor;
window.setFactorJustification = setFactorJustification;
window.setImmediateDanger = setImmediateDanger;

// Report
window.setInspStatus = setInspStatus;
window.exportJSON = exportJSON;
window.openSuiviModal = openSuiviModal;
window.autoCalcCapaSuivi = autoCalcCapaSuivi;
window.saveSuiviMeta = saveSuiviMeta;

// Admin Grids
window.renderGridsAdmin = renderGridsAdmin;
window.showCreateGridModal = showCreateGridModal;
window.doCreateGrid = doCreateGrid;
window.openGridEditor = openGridEditor;
window.showEditMetaModal = showEditMetaModal;
window.doEditMeta = doEditMeta;
window.showAddSectionModal = showAddSectionModal;
window.doAddSection = doAddSection;
window.showEditSectionModal = showEditSectionModal;
window.doEditSection = doEditSection;
window.doDeleteSection = doDeleteSection;
window.showAddCriterionModal = showAddCriterionModal;
window.doAddCriterion = doAddCriterion;
window.showEditCriterionModal = showEditCriterionModal;
window.doEditCriterion = doEditCriterion;
window.doDeleteCriterion = doDeleteCriterion;
window.archiveGrid = archiveGrid;
window.duplicateGrid = duplicateGrid;
window.showGridVersions = showGridVersions;
window.rollbackVersion = rollbackVersion;
window.doExportGrid = doExportGrid;
window.severitySelect = severitySelect;

// Admin Users
window.renderUsers = renderUsers;
window.showCreateUserModal = showCreateUserModal;
window.doCreateUser = doCreateUser;
window.showEditUserModal = showEditUserModal;
window.doEditUser = doEditUser;
window.showChangePwModal = showChangePwModal;
window.doChangePw = doChangePw;
window.deactivateUser = deactivateUser;
window.reactivateUser = reactivateUser;

// Audit
window.renderAudit = renderAudit;
window.exportAuditCSV = exportAuditCSV;

// Analytics
window.renderAnalytics = renderAnalytics;

// Benin dropdowns
window.onDeptChange = onDeptChange;

// Toast / UX
window.showToast = showToast;

// Autocomplete
window.selectEstabSuggestion = selectEstabSuggestion;
window.selectInspSuggestion = selectInspSuggestion;
