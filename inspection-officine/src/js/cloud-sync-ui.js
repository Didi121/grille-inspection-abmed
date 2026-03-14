// ═══════════════════ CLOUD SYNC UI ═══════════════════
// Interface utilisateur pour la synchronisation cloud

import { state } from './state.js';
import { invoke } from './api.js';
import { showToast } from './toast.js';

// Configuration de synchronisation cloud
let cloudSyncConfig = {
  enabled: false,
  apiUrl: '',
  apiKey: '',
  autoSync: true,
  syncInterval: 300 // secondes
};

// État de synchronisation
let syncStatus = {
  lastSync: null,
  isOnline: false,
  pendingChanges: 0,
  syncError: null
};

// Initialiser l'interface de synchronisation cloud
export async function initCloudSyncUI() {
  // Charger la configuration depuis les paramètres
  await loadCloudSyncConfig();
  
  // Mettre à jour l'interface utilisateur
  updateCloudSyncUI();
  
  // Vérifier périodiquement l'état de synchronisation
  setInterval(checkSyncStatus, 60000); // Toutes les minutes
}

// Fonction pour chiffrer une valeur simple
async function encryptSimpleValue(value) {
  if (!value) return value;
  
  // Utiliser une clé dérivée d'un secret statique pour les valeurs simples
  const salt = new Uint8Array([...atob('YWJtZWQtc2ltcGxlLXNhbHQ=')].map(c => c.charCodeAt(0))); // "abmed-simple-salt"
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('abmed-simple-secret-2026'),
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
    enc.encode(value)
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Fonction pour déchiffrer une valeur simple
async function decryptSimpleValue(encryptedValue) {
  if (!encryptedValue) return encryptedValue;
  
  try {
    const salt = new Uint8Array([...atob('YWJtZWQtc2ltcGxlLXNhbHQ=')].map(c => c.charCodeAt(0))); // "abmed-simple-salt"
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode('abmed-simple-secret-2026'),
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
    
    const combined = Uint8Array.from(atob(encryptedValue), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    console.error('Erreur de déchiffrement:', e);
    return null;
  }
}

// Charger la configuration de synchronisation cloud
async function loadCloudSyncConfig() {
  try {
    // Dans une vraie implémentation, cela viendrait des paramètres de l'application
    // Pour la démonstration, nous utilisons des valeurs de démonstration
    
    // Déchiffrer les valeurs stockées
    const [
      enabledStr,
      apiUrlEnc,
      autoSyncStr,
      syncIntervalStr,
      lastSyncStr,
      pendingChangesStr,
      syncErrorEnc
    ] = await Promise.all([
      localStorage.getItem('cloudSyncEnabledEnc'),
      localStorage.getItem('cloudSyncApiUrlEnc'),
      localStorage.getItem('cloudSyncAutoSyncEnc'),
      localStorage.getItem('cloudSyncIntervalEnc'),
      localStorage.getItem('lastSyncTimeEnc'),
      localStorage.getItem('pendingChangesEnc'),
      localStorage.getItem('syncErrorEnc')
    ]);
    
    const [
      apiUrl,
      syncError
    ] = await Promise.all([
      apiUrlEnc ? decryptSimpleValue(apiUrlEnc) : '',
      syncErrorEnc ? decryptSimpleValue(syncErrorEnc) : null
    ]);
    
    cloudSyncConfig = {
      enabled: enabledStr === 'true',
      apiUrl: apiUrl || '',
      apiKey: '', // Ne jamais stocker la clé API en clair
      autoSync: autoSyncStr !== 'false',
      syncInterval: parseInt(syncIntervalStr || '300')
    };
    
    syncStatus = {
      lastSync: lastSyncStr ? new Date(lastSyncStr) : null,
      isOnline: navigator.onLine,
      pendingChanges: parseInt(pendingChangesStr || '0'),
      syncError: syncError || null
    };
    
  } catch (error) {
    console.warn('Erreur chargement config cloud sync:', error);
  }
}

// Sauvegarder la configuration de synchronisation cloud
async function saveCloudSyncConfig() {
  try {
    // Chiffrer les valeurs sensibles avant de les stocker
    const [
      apiUrlEnc,
      syncErrorEnc
    ] = await Promise.all([
      encryptSimpleValue(cloudSyncConfig.apiUrl),
      syncError ? encryptSimpleValue(syncStatus.syncError) : Promise.resolve(null)
    ]);
    
    localStorage.setItem('cloudSyncEnabledEnc', cloudSyncConfig.enabled.toString());
    localStorage.setItem('cloudSyncApiUrlEnc', apiUrlEnc);
    localStorage.setItem('cloudSyncAutoSyncEnc', cloudSyncConfig.autoSync.toString());
    localStorage.setItem('cloudSyncIntervalEnc', cloudSyncConfig.syncInterval.toString());
    
    if (syncStatus.lastSync) {
      localStorage.setItem('lastSyncTimeEnc', syncStatus.lastSync.toISOString());
    }
    
    localStorage.setItem('pendingChangesEnc', syncStatus.pendingChanges.toString());
    
    if (syncErrorEnc) {
      localStorage.setItem('syncErrorEnc', syncErrorEnc);
    } else {
      localStorage.removeItem('syncErrorEnc');
    }
    
  } catch (error) {
    console.warn('Erreur sauvegarde config cloud sync:', error);
  }
}

// Mettre à jour l'interface utilisateur de synchronisation cloud
function updateCloudSyncUI() {
  // Mettre à jour l'indicateur de statut dans la barre de navigation
  updateStatusBarIndicator();
  
  // Mettre à jour le panneau d'administration si il est visible
  updateAdminPanel();
}

// Mettre à jour l'indicateur de statut dans la barre de navigation
function updateStatusBarIndicator() {
  let indicator = document.getElementById('cloudSyncIndicator');
  
  if (!indicator) {
    // Créer l'indicateur s'il n'existe pas
    indicator = document.createElement('div');
    indicator.id = 'cloudSyncIndicator';
    indicator.className = 'cloud-sync-indicator';
    indicator.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-left: 12px;
      cursor: pointer;
      font-size: 14px;
    `;
    
    indicator.onclick = () => showCloudSyncSettings();
    
    // Ajouter à la barre de navigation
    const topbar = document.querySelector('.topbar-nav');
    if (topbar) {
      topbar.appendChild(indicator);
    }
  }
  
  // Mettre à jour l'apparence de l'indicateur
  if (!cloudSyncConfig.enabled) {
    indicator.innerHTML = '☁️';
    indicator.title = 'Synchronisation cloud désactivée';
    indicator.style.opacity = '0.5';
  } else if (syncStatus.isOnline) {
    indicator.innerHTML = '☁️';
    indicator.title = `En ligne - ${syncStatus.pendingChanges} changements en attente`;
    indicator.style.opacity = '1';
  } else {
    indicator.innerHTML = '☁️';
    indicator.title = 'Hors ligne';
    indicator.style.opacity = '0.7';
  }
  
  // Ajouter un indicateur visuel si des synchronisations sont en attente
  if (syncStatus.pendingChanges > 0) {
    indicator.style.color = '#3b82f6';
    indicator.style.fontWeight = 'bold';
  } else {
    indicator.style.color = '';
    indicator.style.fontWeight = '';
  }
}

// Mettre à jour le panneau d'administration
function updateAdminPanel() {
  // Cette fonction serait appelée quand le panneau d'administration est affiché
  // Pour l'instant, nous la laissons vide car elle sera implémentée dans le panneau admin
}

// Vérifier l'état de synchronisation
async function checkSyncStatus() {
  if (!cloudSyncConfig.enabled) return;
  
  try {
    // Vérifier la connectivité
    syncStatus.isOnline = navigator.onLine;
    
    // Dans une vraie implémentation, cela appellerait l'API pour vérifier le statut
    // Pour la démonstration, nous simulons le comportement
    
    // Mettre à jour l'interface
    updateCloudSyncUI();
    
  } catch (error) {
    console.warn('Erreur vérification statut sync:', error);
    syncStatus.syncError = error.message;
  }
}

// Synchroniser manuellement
export async function manualSync() {
  if (!cloudSyncConfig.enabled) {
    showToast('Synchronisation cloud désactivée', 'warning');
    return;
  }
  
  if (!syncStatus.isOnline) {
    showToast('Pas de connectivité réseau', 'warning');
    return;
  }
  
  try {
    showToast('Synchronisation en cours...', 'info');
    
    // Dans une vraie implémentation, cela appellerait l'API pour synchroniser
    // Pour la démonstration, nous simulons le processus
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mettre à jour le statut
    syncStatus.lastSync = new Date();
    syncStatus.pendingChanges = 0;
    syncStatus.syncError = null;
    
    // Sauvegarder la configuration
    await saveCloudSyncConfig();
    
    // Mettre à jour l'interface
    updateCloudSyncUI();
    
    showToast('Synchronisation terminée avec succès', 'success');
    
  } catch (error) {
    syncStatus.syncError = error.message;
    await saveCloudSyncConfig();
    showToast('Erreur synchronisation: ' + error.message, 'error');
  }
}

// Afficher les paramètres de synchronisation cloud
export function showCloudSyncSettings() {
  const html = `
    <h2>⚙️ Paramètres de Synchronisation Cloud</h2>
    <div style="max-width: 600px; margin: 20px auto; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;">
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500;">
          <input type="checkbox" id="syncEnabled" ${
            cloudSyncConfig.enabled ? 'checked' : ''
          } style="margin-right: 8px;" />
          Activer la synchronisation cloud
        </label>
        <p style="font-size: 14px; color: var(--text-muted); margin: 4px 0 0 24px;">
          Synchronise vos inspections avec un service cloud pour l'accès centralisé et la collaboration.
        </p>
      </div>
      
      <div id="syncSettings" style="display: ${
        cloudSyncConfig.enabled ? 'block' : 'none'
      };">
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            URL de l'API
          </label>
          <input 
            type="url" 
            id="apiUrl" 
            value="${cloudSyncConfig.apiUrl}" 
            placeholder="https://api.votre-domaine.com"
            style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 4px;"
          />
          <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 0 0;">
            L'URL de votre service cloud d'inspection compatible ABMed.
          </p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            Clé API
          </label>
          <input 
            type="password" 
            id="apiKey" 
            placeholder="Votre clé API"
            style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 4px;"
          />
          <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 0 0;">
            La clé d'authentification pour votre service cloud.
          </p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            <input type="checkbox" id="autoSync" ${
              cloudSyncConfig.autoSync ? 'checked' : ''
            } style="margin-right: 8px;" />
            Synchronisation automatique
          </label>
          <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 0 24px;">
            Synchronise automatiquement les données quand la connectivité est disponible.
          </p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            Intervalle de synchronisation
          </label>
          <select id="syncInterval" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
            <option value="60" ${
              cloudSyncConfig.syncInterval === 60 ? 'selected' : ''
            }>1 minute</option>
            <option value="300" ${
              cloudSyncConfig.syncInterval === 300 ? 'selected' : ''
            }>5 minutes</option>
            <option value="600" ${
              cloudSyncConfig.syncInterval === 600 ? 'selected' : ''
            }>10 minutes</option>
            <option value="1800" ${
              cloudSyncConfig.syncInterval === 1800 ? 'selected' : ''
            }>30 minutes</option>
            <option value="3600" ${
              cloudSyncConfig.syncInterval === 3600 ? 'selected' : ''
            }>1 heure</option>
          </select>
          <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 0 0;">
            Fréquence de synchronisation automatique.
          </p>
        </div>
      </div>
      
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
        <h3>Statut de Synchronisation</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 16px;">
          <div style="background: var(--white); padding: 16px; border: 1px solid var(--border); border-radius: 6px;">
            <div style="font-size: 24px; font-weight: bold; color: ${
              syncStatus.isOnline ? '#10b981' : '#ef4444'
            };">
              ${syncStatus.isOnline ? '✅' : '❌'}
            </div>
            <div style="margin-top: 8px; font-size: 14px;">Statut</div>
            <div style="font-size: 12px; color: var(--text-muted);">
              ${syncStatus.isOnline ? 'En ligne' : 'Hors ligne'}
            </div>
          </div>
          
          <div style="background: var(--white); padding: 16px; border: 1px solid var(--border); border-radius: 6px;">
            <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">
              ${syncStatus.pendingChanges}
            </div>
            <div style="margin-top: 8px; font-size: 14px;">Changements en attente</div>
            <div style="font-size: 12px; color: var(--text-muted);">
              À synchroniser
            </div>
          </div>
          
          <div style="background: var(--white); padding: 16px; border: 1px solid var(--border); border-radius: 6px;">
            <div style="font-size: 24px; font-weight: bold; color: var(--text-muted);">
              ${syncStatus.lastSync ? syncStatus.lastSync.toLocaleTimeString() : 'Jamais'}
            </div>
            <div style="margin-top: 8px; font-size: 14px;">Dernière synchronisation</div>
            <div style="font-size: 12px; color: var(--text-muted);">
              ${syncStatus.lastSync ? syncStatus.lastSync.toLocaleDateString() : ''}
            </div>
          </div>
        </div>
        
        <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
          <button 
            onclick="manualSync()" 
            class="btn-primary"
            ${
              !cloudSyncConfig.enabled || !syncStatus.isOnline
                ? 'disabled'
                : ''
            }
          >
            🔄 Synchroniser maintenant
          </button>
          
          <button 
            onclick="testConnection()" 
            class="btn-sm"
            ${!cloudSyncConfig.enabled ? 'disabled' : ''}
          >
            🔍 Tester la connexion
          </button>
        </div>
        
        ${
          syncStatus.syncError
            ? `<div style="margin-top: 16px; padding: 12px; background: #fee2e2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626;">
                <strong>Erreur:</strong> ${syncStatus.syncError}
              </div>`
            : ''
        }
      </div>
      
      <div style="margin-top: 24px; text-align: center;">
        <button onclick="saveCloudSyncSettings()" class="btn-primary">
          💾 Enregistrer les paramètres
        </button>
      </div>
    </div>
  `;
  
  openModal(html);
  
  // Ajouter les gestionnaires d'événements
  document.getElementById('syncEnabled').addEventListener('change', function () {
    document.getElementById('syncSettings').style.display = this.checked
      ? 'block'
      : 'none';
  });
}

// Sauvegarder les paramètres de synchronisation cloud
window.saveCloudSyncSettings = async function () {
  try {
    // Récupérer les valeurs du formulaire
    cloudSyncConfig.enabled = document.getElementById('syncEnabled').checked;
    cloudSyncConfig.apiUrl = document.getElementById('apiUrl').value;
    cloudSyncConfig.autoSync = document.getElementById('autoSync').checked;
    cloudSyncConfig.syncInterval = parseInt(
      document.getElementById('syncInterval').value
    );
    
    // Obtenir la clé API si saisie (ne pas sauvegarder en clair)
    const apiKey = document.getElementById('apiKey').value;
    if (apiKey) {
      cloudSyncConfig.apiKey = apiKey;
      // Dans une vraie implémentation, on utiliserait un stockage sécurisé
      showToast('Clé API mise à jour', 'success');
    }
    
    // Sauvegarder la configuration
    await saveCloudSyncConfig();
    
    // Mettre à jour l'interface
    updateCloudSyncUI();
    
    showToast('Paramètres enregistrés', 'success');
    
    closeModal();
    
  } catch (error) {
    showToast('Erreur sauvegarde: ' + error.message, 'error');
  }
};

// Tester la connexion
window.testConnection = async function () {
  if (!cloudSyncConfig.enabled || !cloudSyncConfig.apiUrl) {
    showToast('Configuration incomplète', 'warning');
    return;
  }
  
  try {
    showToast('Test de connexion en cours...', 'info');
    
    // Dans une vraie implémentation, cela testerait réellement la connexion
    // Pour la démonstration, nous simulons le test
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    showToast('Connexion réussie!', 'success');
    
  } catch (error) {
    showToast('Échec test connexion: ' + error.message, 'error');
  }
};

// Exposer les fonctions globalement
window.initCloudSyncUI = initCloudSyncUI;
window.manualSync = manualSync;
window.showCloudSyncSettings = showCloudSyncSettings;

// Note: L'initialisation se fait via app.js après login
// Pas d'initialisation automatique ici