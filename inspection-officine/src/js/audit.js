// ═══════════════════ AUDIT PANEL ═══════════════════
import { state } from './state.js';
import { invoke } from './api.js';
import { esc } from './utils.js';

let auditPage = 0;

export async function renderAudit(page) {
  if(page!==undefined) auditPage=page;
  const limit=100, offset=auditPage*limit;
  try {
    const logs = await invoke('cmd_query_audit',{token:state.session.token, filter:{limit, offset}});
    const total = await invoke('cmd_count_audit',{token:state.session.token, filter:{}});
    const pages = Math.ceil(total/limit);
    document.getElementById('auditPanel').innerHTML=`
      <h2>Journal d'audit <span style="font-size:14px;color:var(--text-muted);font-weight:400">${total} entrées</span></h2>
      <div style="margin-bottom:var(--space-m);display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-sm" onclick="renderAudit()" style="font-size:12px">Actualiser</button>
        <button class="btn-sm" onclick="exportAuditCSV()" style="font-size:12px">Export CSV</button>
      </div>
      <table class="tbl"><thead><tr><th>Date/Heure</th><th>Utilisateur</th><th>Action</th><th>Entité</th><th>ID</th><th>Détails</th></tr></thead><tbody>
      ${logs.map(l=>`<tr>
        <td class="mono">${l.timestamp||'—'}</td>
        <td>${l.username||'<span style="color:var(--text-muted)">système</span>'}</td>
        <td><span class="action-tag">${l.action}</span></td>
        <td>${l.entity_type||'—'}</td>
        <td class="mono" style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${l.entity_id?.substring(0,12)||'—'}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-muted)">${l.details||''}</td>
      </tr>`).join('')}
      </tbody></table>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:var(--space-m)">
        ${auditPage>0?`<button class="btn-sm" onclick="renderAudit(${auditPage-1})">← Précédent</button>`:''}
        <span style="padding:8px 12px;font-size:12px;color:var(--text-muted)">Page ${auditPage+1}/${pages||1}</span>
        ${auditPage<pages-1?`<button class="btn-sm" onclick="renderAudit(${auditPage+1})">Suivant →</button>`:''}
      </div>`;
  } catch(e){ document.getElementById('auditPanel').innerHTML=`<p style="color:var(--accent)">${e}</p>`; }
}

export async function exportAuditCSV() {
  try {
    const csv = await invoke('cmd_export_audit_csv',{token:state.session.token, filter:{limit:10000}});
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit-'+new Date().toISOString().substring(0,10)+'.csv'; a.click();
  } catch(e){alert(e)}
}
