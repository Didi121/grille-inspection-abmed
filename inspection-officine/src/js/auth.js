// ═══════════════════ AUTH ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc, validatePassword } from './utils.js';

export async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if (!u) { document.getElementById('loginErr').textContent = 'Saisissez un nom d\'utilisateur'; return; }
  try {
    state.session = await invoke('cmd_login',{username:u,password:p});
    sessionStorage.setItem('ipharma_session', JSON.stringify(state.session));
    document.getElementById('loginErr').textContent = '';
    afterLogin();
  } catch(e) {
    document.getElementById('loginErr').textContent = e.toString();
  }
}

export async function doLogout() {
  if(state.session) try { await invoke('cmd_logout',{token:state.session.token}); } catch(_){}
  state.session = null; state.currentInspectionId=null;
  sessionStorage.removeItem('ipharma_session');
  document.getElementById('tRight').style.display='none';
  document.getElementById('tNav').style.display='none';
  window.showScreen('login');
}

export async function afterLogin() {
  // P0: Forcer le changement de mot de passe si nécessaire
  if(state.session.user.must_change_password) {
    showForcePasswordChange();
    return;
  }
  document.getElementById('tRight').style.display='flex';
  document.getElementById('tUser').textContent=state.session.user.full_name;
  document.getElementById('tRole').textContent=roleLabel(state.session.user.role);
  state.gridsData = await invoke('list_grids',{token:state.session.token});
  buildTopNav();
  window.showScreen('dash');
  window.loadDashboard();
}

export function showForcePasswordChange() {
  window.openModal(`<h3 style="color:var(--accent)">Changement de mot de passe obligatoire</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:var(--space-m)">Pour des raisons de sécurité, vous devez changer votre mot de passe par défaut avant de continuer.</p>
    <div class="field"><label>Mot de passe actuel</label><input id="fpCurrent" type="password" placeholder="Mot de passe actuel"/></div>
    <div class="field"><label>Nouveau mot de passe</label><input id="fpNew" type="password" placeholder="Min. 8 caractères, lettres + chiffres"/></div>
    <div class="field"><label>Confirmer</label><input id="fpConfirm" type="password" placeholder="Confirmer le nouveau mot de passe"/></div>
    <div class="err" id="fpErr" style="font-size:13px;color:var(--accent);min-height:18px;margin-bottom:8px"></div>
    <div class="modal-actions">
      <button class="btn-primary" style="width:auto;padding:8px 20px;font-size:13px" onclick="doForcePasswordChange()">Changer le mot de passe</button>
    </div>`);
}

export async function doForcePasswordChange() {
  const cur = document.getElementById('fpCurrent').value;
  const nw = document.getElementById('fpNew').value;
  const conf = document.getElementById('fpConfirm').value;
  const errEl = document.getElementById('fpErr');
  try {
    if(!cur) throw 'Saisissez votre mot de passe actuel';
    validatePassword(nw);
    if(nw !== conf) throw 'Les mots de passe ne correspondent pas';
    if(nw === cur) throw 'Le nouveau mot de passe doit être différent';
    await invoke('cmd_change_own_password',{token:state.session.token, currentPassword:cur, newPassword:nw});
    state.session.user.must_change_password = false;
    sessionStorage.setItem('ipharma_session', JSON.stringify(state.session));
    window.closeModal();
    afterLogin();
  } catch(e) { errEl.textContent = e.toString(); }
}

export function roleLabel(r){ return {admin:'Superadmin',lead_inspector:'Inspecteur en chef',inspector:'Inspecteur',viewer:'Lecteur'}[r]||r; }

// ═══════════════════ TOP NAV ═══════════════════
export function buildTopNav() {
  const nav = document.getElementById('tNav');
  const role = state.session.user.role;
  const isAdmin = role === 'admin';
  const isLead = role === 'lead_inspector';
  nav.innerHTML = `
    <button class="nav-btn" data-s="dash" onclick="goToDashboard()">Inspections</button>
    ${isAdmin?'<button class="nav-btn" data-s="grids" onclick="showScreen(\'grids\');renderGridsAdmin()">Grilles</button>':''}
    ${isAdmin?'<button class="nav-btn" data-s="users" onclick="showScreen(\'users\');renderUsers()">Utilisateurs</button>':''}
    <button class="nav-btn" data-s="planning" onclick="showScreen('planning')">Programmation</button>
    ${isAdmin||isLead?'<button class="nav-btn" data-s="analytics" onclick="showScreen(\'analytics\')">Analytique</button>':''}
    ${isAdmin||isLead?'<button class="nav-btn" data-s="audit" onclick="showScreen(\'audit\');renderAudit()">Audit</button>':''}
    ${isAdmin?'<button class="nav-btn" data-s="backup" onclick="showScreen(\'backup\')">🗄️ Sauvegardes</button>':''}
  `;
  nav.style.display='flex';
}

export function goToDashboard() {
  if(!state.session) return;
  state.currentInspectionId=null;
  document.getElementById('tTitle').textContent='Inspections Pharma';
  document.getElementById('tSub').textContent='Tableau de bord';
  document.getElementById('tLogo').style.background='var(--black)';
  document.getElementById('pStrip').style.display='none';
  window.showScreen('dash'); window.loadDashboard();
}
