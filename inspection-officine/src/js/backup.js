// ═══════════════════ BACKUP & RESTAURATION ═══════════════════
import { state, isTauri } from './state.js';
import { invoke } from './api.js';

// ── Rendu principal ───────────────────────────────────────────────────
export async function renderBackup() {
  const panel = document.getElementById('backupPanel');
  if (!panel) return;

  panel.innerHTML = `<p style="text-align:center;padding:40px;color:var(--text-muted)">Chargement…</p>`;

  try {
    const settings = await invoke('cmd_get_settings', { token: state.session.token });
    const intervalH    = settings?.backup_interval_hours ?? 4;
    const maxAuto      = settings?.max_auto_backups ?? 10;
    const backups      = isTauri
      ? await invoke('cmd_list_backups', { token: state.session.token })
      : [];

    // Dernière auto
    const lastAuto = backups.find(b => b.backup_type === 'auto');
    const nextAuto = lastAuto
      ? (() => {
          try {
            const parts = lastAuto.created_at.split('_');
            const d = parts[0], t = parts[1] || '000000';
            const dt = new Date(
              `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`
            );
            if (isNaN(dt.getTime())) return '—';
            dt.setHours(dt.getHours() + Number(intervalH));
            return dt.toLocaleString('fr-FR');
          } catch (_) { return '—'; }
        })()
      : '—';

    panel.innerHTML = `
      <!-- ══ EN-TÊTE ══ -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <div>
          <h2 style="margin:0">🗄️ Sauvegardes &amp; Restauration</h2>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px">
            Gérez les sauvegardes de vos bases de données d'inspection
          </p>
        </div>
        ${isTauri
          ? `<button class="btn-primary" style="width:auto;padding:8px 18px;font-size:14px"
               onclick="doManualBackup()">💾 Sauvegarder maintenant</button>`
          : `<button class="btn-primary" style="width:auto;padding:8px 18px;font-size:14px"
               onclick="doExportLocalBackup()">📤 Exporter les données</button>`
        }
      </div>

      <!-- ══ CONFIGURATION ══ -->
      <div class="ana-section" style="margin-bottom:20px">
        <h3 class="ana-section-title">⚙️ Configuration de la sauvegarde automatique</h3>
        ${isTauri ? `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:end;margin-bottom:12px">
          <div class="field">
            <label style="font-size:12px;color:var(--text-muted)">Intervalle (heures)</label>
            <input id="bkpInterval" type="number" min="1" max="168" value="${intervalH}"
              style="width:100%;padding:8px;border:1px solid var(--border);background:var(--gray-50);font-size:14px"/>
          </div>
          <div class="field">
            <label style="font-size:12px;color:var(--text-muted)">Backups auto à conserver</label>
            <input id="bkpMaxAuto" type="number" min="1" max="100" value="${maxAuto}"
              style="width:100%;padding:8px;border:1px solid var(--border);background:var(--gray-50);font-size:14px"/>
          </div>
          <div>
            <button class="btn-sm" style="padding:8px 16px" onclick="doConfigureBackup()">
              Enregistrer
            </button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);display:flex;gap:24px">
          <span>⏱️ Dernière auto : <strong>${lastAuto ? fmtBackupDate(lastAuto.created_at) : '—'}</strong></span>
          <span>⏭️ Prochaine estimée : <strong>${nextAuto}</strong></span>
        </div>` : `
        <p style="font-size:13px;color:var(--text-muted)">
          Mode navigateur — la sauvegarde automatique n'est pas disponible.<br>
          Utilisez le bouton <strong>Exporter les données</strong> pour créer une sauvegarde manuelle JSON.
        </p>`}
      </div>

      <!-- ══ IMPORT (mode navigateur) ══ -->
      ${!isTauri ? `
      <div class="ana-section" style="margin-bottom:20px">
        <h3 class="ana-section-title">📥 Restaurer depuis un fichier</h3>
        <input type="file" id="bkpFileInput" accept=".json" style="display:none"
          onchange="doImportLocalBackup(this)"/>
        <button class="btn-sm" onclick="document.getElementById('bkpFileInput').click()">
          Choisir un fichier de sauvegarde (.json)
        </button>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">
          ⚠️ La restauration remplace toutes les données actuelles. Un rechargement de la page sera effectué.
        </p>
      </div>` : ''}

      <!-- ══ LISTE DES SAUVEGARDES ══ -->
      <div class="ana-section">
        <h3 class="ana-section-title">📋 Sauvegardes disponibles
          <span style="font-size:13px;font-weight:400;color:var(--text-muted)">(${backups.length})</span>
        </h3>
        ${backups.length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--text-muted)">
               <span style="font-size:36px;display:block;margin-bottom:12px">📂</span>
               Aucune sauvegarde disponible.<br>
               Cliquez sur <strong>Sauvegarder maintenant</strong> pour créer la première.
             </div>`
          : `<table class="tbl" style="font-size:13px">
               <thead>
                 <tr>
                   <th>Date / Heure</th>
                   <th>Type</th>
                   <th style="text-align:right">Taille</th>
                   <th>Audit</th>
                   <th style="text-align:right">Actions</th>
                 </tr>
               </thead>
               <tbody>
               ${backups.map(b => `
                 <tr>
                   <td class="mono">${fmtBackupDate(b.created_at)}</td>
                   <td>${badgeType(b.backup_type)}</td>
                   <td style="text-align:right;color:var(--text-muted)">${fmtSize(b.size_bytes)}</td>
                   <td>${b.has_audit
                       ? '<span style="color:#16a34a;font-size:12px">✓ inclus</span>'
                       : '<span style="color:var(--text-muted);font-size:12px">—</span>'}</td>
                   <td style="text-align:right;white-space:nowrap">
                     <button class="act-btn" onclick="doRestoreBackup('${b.name}')"
                       title="Restaurer cette sauvegarde">Restaurer</button>
                     <button class="act-btn danger" onclick="doDeleteBackup('${b.name}')"
                       title="Supprimer cette sauvegarde">Suppr.</button>
                   </td>
                 </tr>`).join('')}
               </tbody>
             </table>`}
      </div>
    `;
  } catch (e) {
    panel.innerHTML = `<p style="color:var(--accent);padding:20px">Erreur : ${e}</p>`;
  }
}

// ── Actions Tauri ─────────────────────────────────────────────────────

export async function doManualBackup() {
  try {
    const name = await invoke('cmd_backup_db', { token: state.session.token });
    if (name === 'local_mode') {
      // Mode navigateur : proposer l'export JSON
      doExportLocalBackup();
    } else {
      if (window.showToast) window.showToast(`✅ Sauvegarde créée : ${name}`, 'info');
      await renderBackup();
    }
  } catch (e) { alert('Erreur sauvegarde : ' + e); }
}

export async function doRestoreBackup(backupName) {
  const ok = confirm(
    `⚠️ RESTAURATION\n\n` +
    `Vous allez restaurer : ${fmtBackupDate(backupName.replace('inspections_','').replace('.db',''))}\n\n` +
    `• Toutes les données actuelles seront remplacées\n` +
    `• Un backup de sécurité sera créé automatiquement\n` +
    `• L'application sera rechargée\n\n` +
    `Continuer ?`
  );
  if (!ok) return;
  try {
    await invoke('cmd_restore_db', { token: state.session.token, backupName });
    if (window.showToast) window.showToast('✅ Restauration réussie — rechargement…', 'info');
    setTimeout(() => location.reload(), 2000);
  } catch (e) { alert('Erreur restauration : ' + e); }
}

export async function doDeleteBackup(backupName) {
  if (!confirm(`Supprimer la sauvegarde "${backupName}" ? Cette action est irréversible.`)) return;
  try {
    await invoke('cmd_delete_backup', { token: state.session.token, backupName });
    if (window.showToast) window.showToast('Sauvegarde supprimée', 'info');
    await renderBackup();
  } catch (e) { alert('Erreur suppression : ' + e); }
}

export async function doConfigureBackup() {
  const intervalHours  = parseInt(document.getElementById('bkpInterval')?.value || '4');
  const maxAutoBackups = parseInt(document.getElementById('bkpMaxAuto')?.value || '10');
  if (isNaN(intervalHours) || intervalHours < 1 || intervalHours > 168) {
    alert('Intervalle invalide (1–168 heures)'); return;
  }
  if (isNaN(maxAutoBackups) || maxAutoBackups < 1 || maxAutoBackups > 100) {
    alert('Nombre max invalide (1–100)'); return;
  }
  try {
    await invoke('cmd_configure_backup', {
      token: state.session.token,
      intervalHours,
      maxAutoBackups
    });
    if (window.showToast) window.showToast(`Configuration enregistrée — backup toutes les ${intervalHours}h`, 'info');
    await renderBackup();
  } catch (e) { alert('Erreur configuration : ' + e); }
}

// ── Actions mode navigateur (localStorage) ────────────────────────────

export function doExportLocalBackup() {
  try {
    const data = localStorage.getItem('ipharma_db');
    if (!data) { alert('Aucune donnée à exporter.'); return; }
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup_ipharma_${new Date().toISOString().substring(0,19).replace(/:/g,'-')}.json`;
    a.click();
    if (window.showToast) window.showToast('Export JSON téléchargé', 'info');
  } catch (e) { alert('Erreur export : ' + e); }
}

export function doImportLocalBackup(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = e.target.result;
      const data = JSON.parse(json);
      if (!data.users || !data.inspections) {
        alert('Fichier invalide : structure de sauvegarde non reconnue.'); return;
      }
      if (!confirm(`Restaurer ${data.inspections.length} inspection(s) et ${data.users.length} utilisateur(s) ?\n\nLes données actuelles seront remplacées et la page rechargée.`)) return;
      localStorage.setItem('ipharma_db', json);
      if (window.showToast) window.showToast('Restauration OK — rechargement…', 'info');
      setTimeout(() => location.reload(), 1500);
    } catch (err) { alert('Fichier corrompu ou invalide : ' + err); }
  };
  reader.readAsText(file);
}

// ── Helpers ───────────────────────────────────────────────────────────

function fmtBackupDate(raw) {
  // raw = "20260314_143022" ou "20260314_143022_auto"
  const clean = raw.replace(/_auto$/, '').replace(/_pre_restore$/, '').replace(/_pre_mig$/, '');
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]} à ${m[4]}:${m[5]}:${m[6]}`;
}

function fmtSize(bytes) {
  if (bytes < 1024)        return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / 1024 / 1024).toFixed(1) + ' Mo';
}

function badgeType(type) {
  const cfg = {
    manual:       { label: 'Manuel',         color: '#2563eb' },
    auto:         { label: 'Automatique',    color: '#16a34a' },
    pre_migration:{ label: 'Pré-migration',  color: '#d97706' },
    pre_restore:  { label: 'Pré-restauration', color: '#9333ea' },
  }[type] || { label: type, color: '#6b7280' };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;
    font-weight:600;background:${cfg.color}18;color:${cfg.color};border:1px solid ${cfg.color}44">
    ${cfg.label}</span>`;
}
