// ═══════════════════ OFFLINE MODE HANDLING ═══════════════════
// Gestion du mode hors-ligne dans l'interface utilisateur

import { state } from './state.js';
import { showToast } from './toast.js';

// État du mode hors-ligne
let offlineState = {
  isOnline: true,
  offlineSince: null,
  pendingOperations: 0,
  syncErrors: []
};

// Timer pour vérifier la connectivité
let connectivityCheckTimer = null;

// Initialiser le mode hors-ligne
export async function initOfflineMode() {
  // Charger les opérations en attente chiffrées
  try {
    const pendingOpsEnc = localStorage.getItem('pendingOperationsEnc');
    if (pendingOpsEnc) {
      const pendingOps = await decryptLocalStorageData(pendingOpsEnc);
      if (pendingOps && Array.isArray(pendingOps)) {
        offlineState.pendingOperations = pendingOps.length;
      }
    }
  } catch (e) {
    console.warn('Erreur chargement opérations en attente:', e);
  }
  
  // Vérifier la connectivité toutes les 30 secondes
  connectivityCheckTimer = setInterval(checkConnectivity, 30000);
  
  // Vérifier immédiatement
  checkConnectivity();
  
  // Écouter les événements réseau du navigateur
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

// Vérifier la connectivité
async function checkConnectivity() {
  // En mode Tauri (app locale SQLite), pas besoin de vérifier la connectivité réseau
  // L'app fonctionne entièrement en local — on considère toujours "en ligne"
  if (window.__TAURI_INTERNALS__) {
    handleOnline();
    return;
  }
  try {
    const response = await fetch('/health', { method: 'HEAD', cache: 'no-cache' });
    if (response.ok) { handleOnline(); } else { handleOffline(); }
  } catch (error) {
    handleOffline();
  }
}

// Gérer le passage en ligne
function handleOnline() {
  if (!offlineState.isOnline) {
    offlineState.isOnline = true;
    offlineState.offlineSince = null;
    
    showToast('Connexion rétablie', 'success');
    
    // Mettre à jour l'UI
    updateOfflineIndicator();
    
    // Tenter de synchroniser les opérations en attente
    syncPendingOperations();
  }
}

// Gérer le passage hors-ligne
function handleOffline() {
  if (offlineState.isOnline) {
    offlineState.isOnline = false;
    offlineState.offlineSince = new Date();
    
    showToast('Mode hors-ligne activé', 'warning');
    
    // Mettre à jour l'UI
    updateOfflineIndicator();
  }
}

// Mettre à jour l'indicateur de mode hors-ligne
function updateOfflineIndicator() {
  const indicator = document.getElementById('offlineIndicator');
  if (!indicator) {
    createOfflineIndicator();
    return;
  }
  
  if (offlineState.isOnline) {
    indicator.style.display = 'none';
  } else {
    indicator.style.display = 'flex';
    indicator.querySelector('.offline-time').textContent = 
      formatOfflineDuration(offlineState.offlineSince);
  }
}

// Créer l'indicateur de mode hors-ligne
function createOfflineIndicator() {
  if (document.getElementById('offlineIndicator')) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'offlineIndicator';
  indicator.className = 'offline-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #dc2626;
    color: white;
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 10000;
    display: none;
  `;
  
  indicator.innerHTML = `
    <div>
      <strong>Mode hors-ligne</strong>
      <span class="offline-time" style="margin-left: 8px; opacity: 0.8;"></span>
    </div>
    <div>
      <button onclick="syncPendingOperations()" class="btn-sm" style="background: rgba(255,255,255,0.2); color: white; border: none;">
        Sync
      </button>
      <button onclick="hideOfflineIndicator()" class="btn-sm" style="background: transparent; color: white; border: 1px solid rgba(255,255,255,0.5); margin-left: 8px;">
        ×
      </button>
    </div>
  `;
  
  document.body.appendChild(indicator);
  
  updateOfflineIndicator();
}

// Formater la durée hors-ligne
function formatOfflineDuration(startTime) {
  if (!startTime) return '';
  
  const now = new Date();
  const diffMs = now - startTime;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffDays > 0) {
    return `(${diffDays}j ${diffHours}h ${diffMinutes}m)`;
  } else if (diffHours > 0) {
    return `(${diffHours}h ${diffMinutes}m)`;
  } else {
    return `(${diffMinutes}m)`;
  }
}

// Synchroniser les opérations en attente
async function syncPendingOperations() {
  if (!offlineState.isOnline || offlineState.pendingOperations === 0) return;

  showToast(`Synchronisation de ${offlineState.pendingOperations} opérations…`, 'info');

  let pendingOps = [];
  try {
    const enc = localStorage.getItem('pendingOperationsEnc');
    pendingOps = enc ? (await decryptLocalStorageData(enc) || []) : [];
  } catch (_) { pendingOps = []; }

  const MAX_RETRIES = 3;
  const TIMEOUT_MS  = 10000;
  const succeeded   = [];
  const failed      = [];

  for (const op of pendingOps) {
    let attempts = 0;
    let ok = false;
    while (attempts < MAX_RETRIES && !ok) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        // Appeler l'invoke Tauri/fallback avec timeout
        await Promise.race([
          window.__TAURI_INTERNALS__?.invoke(op.cmd, op.args) ?? Promise.resolve(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT_MS))
        ]);
        clearTimeout(timer);
        ok = true;
      } catch (e) {
        attempts++;
        if (attempts >= MAX_RETRIES) failed.push({ op, error: e.message });
      }
    }
    if (ok) succeeded.push(op);
  }

  // Garder seulement les opérations échouées
  const remaining = failed.map(f => f.op);
  try {
    if (remaining.length > 0) {
      const enc = await encryptLocalStorageData(remaining);
      localStorage.setItem('pendingOperationsEnc', enc);
    } else {
      localStorage.removeItem('pendingOperationsEnc');
    }
  } catch (_) {}

  offlineState.pendingOperations = remaining.length;

  if (failed.length === 0) {
    showToast('Synchronisation terminée', 'info');
    if (window.loadDashboard) window.loadDashboard();
  } else {
    showToast(`Sync partielle : ${succeeded.length} OK, ${failed.length} échoué(s)`, 'error');
    offlineState.syncErrors.push(...failed.map(f => f.error));
  }
}

// Fonction pour chiffrer/déchiffrer les données dans localStorage
async function encryptLocalStorageData(data) {
  const salt = new Uint8Array([...atob('YWJtZWQtb2ZmbGluZS1zYWx0')].map(c => c.charCodeAt(0))); // "abmed-offline-salt"
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('abmed-offline-secret-2026'),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 50000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decryptLocalStorageData(encryptedData) {
  if (!encryptedData) return null;
  
  try {
    const salt = new Uint8Array([...atob('YWJtZWQtb2ZmbGluZS1zYWx0')].map(c => c.charCodeAt(0))); // "abmed-offline-salt"
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode('abmed-offline-secret-2026'),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 50000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );
    
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch (e) {
    console.error('Erreur de déchiffrement:', e);
    return null;
  }
}

// Ajouter une opération en attente
export async function addPendingOperation(operation) {
  offlineState.pendingOperations++;
  updateOfflineIndicator();
  
  // Stocker l'opération localement (dans localStorage par exemple)
  const pendingOpsEnc = localStorage.getItem('pendingOperationsEnc');
  const pendingOps = pendingOpsEnc ? (await decryptLocalStorageData(pendingOpsEnc) || []) : [];
  pendingOps.push({
    ...operation,
    timestamp: new Date().toISOString()
  });
  
  const encryptedOps = await encryptLocalStorageData(pendingOps);
  localStorage.setItem('pendingOperationsEnc', encryptedOps);
}

// Obtenir l'état du mode hors-ligne
export function getOfflineState() {
  return { ...offlineState };
}

// Cacher l'indicateur
function hideOfflineIndicator() {
  const indicator = document.getElementById('offlineIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}

// Exposer les fonctions globalement
window.syncPendingOperations = syncPendingOperations;
window.hideOfflineIndicator = hideOfflineIndicator;

// Initialisation gérée par app.js via afterLogin()
// Ne pas auto-initialiser ici pour éviter les conflits au démarrage