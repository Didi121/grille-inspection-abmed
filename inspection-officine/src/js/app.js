// ═══════════════════════════════════════════════════════
// APP.JS — Point d'entrée v3 modulaire
// Orchestre tous les modules et expose les fonctions au DOM
// ═══════════════════════════════════════════════════════

import { state, isTauri } from './state.js';
import { invoke } from './api.js';
import { esc, escAttr, validateInput, validatePassword } from './utils.js';
import { doLogin, doLogout, afterLogin, goToDashboard, buildTopNav, showForcePasswordChange, doForcePasswordChange, roleLabel } from './auth.js';
import { loadDashboard, statusLabel, resetDashFilters, quickValidate, deleteInsp } from './dashboard.js';
import { renderGridSelector, selectGrid, autoCalcCapa } from './grid-selector.js';
import { createAndStart, openInspection, renderSidebar, renderCriterion } from './inspection.js';
import { riskParams, skipSection, reactivateSection, setSeverity, setResp, updateObs, nav, updateProgress, setFactor, setFactorJustification, setImmediateDanger, persistRisk } from './responses.js';
import { renderReport, setInspStatus, exportJSON } from './report.js';
import { renderGridsAdmin, showCreateGridModal, doCreateGrid, openGridEditor, showEditMetaModal, doEditMeta, showAddSectionModal, doAddSection, showEditSectionModal, doEditSection, doDeleteSection, severitySelect, showAddCriterionModal, doAddCriterion, showEditCriterionModal, doEditCriterion, doDeleteCriterion, archiveGrid, duplicateGrid, showGridVersions, rollbackVersion, doExportGrid } from './admin-grids.js';
import { renderUsers, showCreateUserModal, doCreateUser, showEditUserModal, doEditUser, showChangePwModal, doChangePw, deactivateUser, reactivateUser } from './admin-users.js';
import { renderAudit, exportAuditCSV } from './audit.js';

// ═══════════════════ SCREEN NAVIGATION ═══════════════════

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('visible'));
  document.getElementById('s-' + name).classList.add('visible');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.s === name));
  document.getElementById('pStrip').style.display = name === 'inspection' ? 'flex' : 'none';
  // Auto-load pour certains écrans
  if (name === 'grid-select') renderGridSelector();
  if (name === 'users') renderUsers();
  if (name === 'audit') renderAudit();
  if (name === 'grids') renderGridsAdmin();
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

document.addEventListener('DOMContentLoaded', async () => {
  // Attacher les filtres du dashboard
  ['dSearch', 'dTypeFilter', 'dStatusFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { if (state.session) loadDashboard(); });
  });

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
