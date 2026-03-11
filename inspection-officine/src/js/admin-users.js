// ═══════════════════ USERS PANEL ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc, escAttr, validateInput, validatePassword } from './utils.js';
import { roleLabel } from './auth.js';

export async function renderUsers() {
  try {
    const users = await invoke('cmd_list_users',{token:state.session.token});
    document.getElementById('usersPanel').innerHTML=`
      <h2>Gestion des utilisateurs</h2>
      <div style="margin-bottom:var(--space-s)"><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="showCreateUserModal()">+ Nouvel utilisateur</button></div>
      <table class="tbl"><thead><tr><th>Statut</th><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Créé le</th><th>Actions</th></tr></thead><tbody>
      ${users.map(u=>`<tr>
        <td><span class="active-dot ${u.active?'on':'off'}"></span></td>
        <td><strong>${u.full_name}</strong></td>
        <td class="mono">${u.username}</td>
        <td><span class="role-tag role-${u.role}">${roleLabel(u.role)}</span></td>
        <td class="mono">${u.created_at?.substring(0,10)||'—'}</td>
        <td>
          <button class="btn-sm" onclick="showEditUserModal('${u.id}','${escAttr(u.full_name)}','${u.role}',${u.active})">Modifier</button>
          <button class="btn-sm" onclick="showChangePwModal('${u.id}','${escAttr(u.full_name)}')">MdP</button>
          ${u.active?`<button class="btn-sm" style="color:var(--accent)" onclick="deactivateUser('${u.id}')">Désactiver</button>`
            :`<button class="btn-sm" style="color:var(--accent)" onclick="reactivateUser('${u.id}')">Réactiver</button>`}
        </td>
      </tr>`).join('')}
      </tbody></table>`;
  } catch(e){ document.getElementById('usersPanel').innerHTML=`<p style="color:var(--accent)">${e}</p>`; }
}

export function showCreateUserModal() {
  window.openModal(`<h3>Nouvel utilisateur</h3>
    <div class="field"><label>Nom complet</label><input id="nuName"/></div>
    <div class="field"><label>Identifiant</label><input id="nuUser"/></div>
    <div class="field"><label>Mot de passe</label><input id="nuPass" type="password"/></div>
    <div class="field"><label>Rôle</label><select id="nuRole"><option value="inspector">Inspecteur</option><option value="lead_inspector">Inspecteur en chef</option><option value="admin">Superadmin</option><option value="viewer">Lecteur</option></select></div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doCreateUser()">Créer</button></div>`);
}
export async function doCreateUser() {
  try {
    const username = validateInput(document.getElementById('nuUser').value, "Nom d'utilisateur", 3, 50);
    const full_name = validateInput(document.getElementById('nuName').value, 'Nom complet', 2, 100);
    const password = validatePassword(document.getElementById('nuPass').value);
    const role = document.getElementById('nuRole').value;
    await invoke('cmd_create_user',{token:state.session.token, req:{username, full_name, role, password}});
    window.closeModal(); renderUsers();
  } catch(e){alert(e)}
}
export function showEditUserModal(id,name,role,active) {
  window.openModal(`<h3>Modifier : ${name}</h3>
    <div class="field"><label>Nom complet</label><input id="euName" value="${name}"/></div>
    <div class="field"><label>Rôle</label><select id="euRole"><option value="inspector" ${role==='inspector'?'selected':''}>Inspecteur</option><option value="lead_inspector" ${role==='lead_inspector'?'selected':''}>Inspecteur en chef</option><option value="admin" ${role==='admin'?'selected':''}>Superadmin</option><option value="viewer" ${role==='viewer'?'selected':''}>Lecteur</option></select></div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doEditUser('${id}')">Enregistrer</button></div>`);
}
export async function doEditUser(id) {
  try { await invoke('cmd_update_user',{token:state.session.token, userId:id, req:{full_name:document.getElementById('euName').value,role:document.getElementById('euRole').value}}); window.closeModal(); renderUsers(); } catch(e){alert(e)}
}
export function showChangePwModal(id,name) {
  window.openModal(`<h3>Mot de passe : ${name}</h3>
    <div class="field"><label>Nouveau mot de passe</label><input id="cpPass" type="password"/></div>
    <div class="modal-actions"><button class="btn-sm" onclick="closeModal()">Annuler</button><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="doChangePw('${id}')">Changer</button></div>`);
}
export async function doChangePw(id) { try { validatePassword(document.getElementById('cpPass').value); await invoke('cmd_change_password',{token:state.session.token, userId:id, newPassword:document.getElementById('cpPass').value}); window.closeModal(); } catch(e){alert(e)} }
export async function deactivateUser(id) { if(!confirm('Désactiver cet utilisateur ?')) return; try { await invoke('cmd_delete_user',{token:state.session.token, userId:id}); renderUsers(); } catch(e){alert(e)} }
export async function reactivateUser(id) { try { await invoke('cmd_update_user',{token:state.session.token, userId:id, req:{active:true}}); renderUsers(); } catch(e){alert(e)} }
