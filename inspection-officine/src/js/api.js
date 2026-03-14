// ═══════════════════ INVOKE / FALLBACK DB ═══════════════════
import { state, isTauri } from './state.js';
import { now, validatePassword, canTransition } from './utils.js';
import { buildAllGridsJS } from './grids-data.js';

export async function invoke(cmd, args={}) {
  if (isTauri) return await window.__TAURI_INTERNALS__.invoke(cmd, args);
  return await fallback(cmd, args);
}

export const DB = { users: [], inspections: [], responses: {}, audit: [], sessions: {}, grids: [], gridVersions: [], reportSnapshots: [], planning: [], indisponibilites: [], settings: {} };

// Clé de chiffrement dérivée - stockée dans sessionStorage pour cette session uniquement
let encryptionKey = null;

// Fonction pour dériver une clé de chiffrement à partir d'un mot de passe
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Fonction pour chiffrer des données
async function encryptData(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // IV de 12 octets pour GCM
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  
  // Retourner IV + données chiffrées en base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Fonction pour déchiffrer des données
async function decryptData(encryptedData, key) {
  try {
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
    throw new Error('Échec du déchiffrement - données corrompues ou mot de passe incorrect');
  }
}

// Initialiser la clé de chiffrement
async function initEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  
  // Essayer de récupérer une clé existante depuis sessionStorage
  const storedKeyData = sessionStorage.getItem('db_encryption_key');
  if (storedKeyData) {
    try {
      // La clé était stockée chiffrée, nous devons la déchiffrer
      // Pour simplifier, utilisons une clé dérivée d'un secret statique
      const salt = new Uint8Array([...atob('YWJtZWQta2V5LXNhbHQ=')].map(c => c.charCodeAt(0))); // "abmed-key-salt"
      const masterKey = await deriveKey('abmed-master-secret-2026', salt);
      encryptionKey = await decryptData(storedKeyData, masterKey);
      return encryptionKey;
    } catch(e) {
      console.warn('Impossible de déchiffrer la clé de chiffrement, génération d\'une nouvelle clé');
    }
  }
  
  // Générer une nouvelle clé aléatoire
  encryptionKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // Stocker la clé chiffrée dans sessionStorage
  try {
    const salt = new Uint8Array([...atob('YWJtZWQta2V5LXNhbHQ=')].map(c => c.charCodeAt(0))); // "abmed-key-salt"
    const masterKey = await deriveKey('abmed-master-secret-2026', salt);
    const encryptedKey = await encryptData(encryptionKey, masterKey);
    sessionStorage.setItem('db_encryption_key', encryptedKey);
  } catch(e) {
    console.warn('Impossible de stocker la clé de chiffrement:', e);
  }
  
  return encryptionKey;
}

function saveDB() {
  try {
    const d = {
      users: DB.users.map(u=>({...u, password:undefined, password_hash:u.password_hash})),
      inspections: DB.inspections,
      responses: DB.responses,
      audit: DB.audit,
      grids: DB.grids,
      gridVersions: DB.gridVersions,
      reportSnapshots: DB.reportSnapshots,
      planning: DB.planning,
      indisponibilites: DB.indisponibilites,
      settings: DB.settings
    };
    
    // Chiffrer les données avant de les stocker
    initEncryptionKey().then(key => {
      encryptData(d, key).then(encrypted => {
        localStorage.setItem('ipharma_db', encrypted);
      }).catch(e => {
        console.error('Erreur de chiffrement:', e);
      });
    });
  } catch(e){
    console.error('Erreur dans saveDB:', e);
  }
}

async function loadDB() {
  try {
    const encryptedData = localStorage.getItem('ipharma_db') || localStorage.getItem('abmed_db_v2');
    if (encryptedData) {
      const key = await initEncryptionKey();
      const d = await decryptData(encryptedData, key);
      
      if(d){
        DB.users = d.users||[];
        DB.inspections = d.inspections||[];
        DB.responses = d.responses||{};
        DB.audit = d.audit||[];
        DB.grids = d.grids||[];
        DB.gridVersions = d.gridVersions||[];
        DB.reportSnapshots = d.reportSnapshots||[];
        DB.planning = d.planning||[];
        DB.indisponibilites = d.indisponibilites||[];
        DB.settings = d.settings||{};
      }
    }
  } catch(e){
    console.error('Erreur de déchiffrement des données:', e);
    // En cas d'erreur de déchiffrement, initialiser avec des valeurs par défaut
    DB.users = [];
    DB.inspections = [];
    DB.responses = {};
    DB.audit = [];
    DB.grids = [];
    DB.gridVersions = [];
    DB.reportSnapshots = [];
    DB.planning = [];
    DB.indisponibilites = [];
    DB.settings = {};
  }
}

// Hash sécurisé PBKDF2 pour le mode fallback
async function hashPwd(pwd) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key,
    256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `pbkdf2$${saltB64}$${hashB64}`;
}

async function verifyPwd(pwd, hash) {
  if (!hash || !hash.startsWith('pbkdf2$')) {
    // Ancien format - migration nécessaire, considéré comme invalide
    return false;
  }
  const parts = hash.split('$');
  if (parts.length !== 3) return false;
  const saltB64 = parts[1];
  const expectedHashB64 = parts[2];
  const salt = new Uint8Array([...atob(saltB64)].map(c => c.charCodeAt(0)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key,
    256
  );
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return hashB64 === expectedHashB64;
}

function addAudit(userId, username, action, entityType, entityId, details) {
  DB.audit.unshift({ id: DB.audit.length+1, timestamp: now(), user_id: userId, username, action, entity_type: entityType, entity_id: entityId, details });
  saveDB();
}

export async function initFallbackDB() {
  await loadDB();
  if (!DB.users.length) {
    // Générer un mot de passe aléatoire pour l'admin
    const tempAdminPwd = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map(b => (b % 36).toString(36))
      .join('')
      .replace(/(\d)/g, c => String.fromCharCode(97 + parseInt(c)));
    
    DB.users.push({ id:crypto.randomUUID(), username:'admin', full_name:'Administrateur', role:'admin', active:true,
      password_hash: await hashPwd(tempAdminPwd), must_change_password:true, created_at: now(), updated_at: now() });
    
    // Stocker le mot de passe temporaire pour affichage
    DB.settings.temp_admin_password = tempAdminPwd;
    
    console.warn('%c╔════════════════════════════════════════════════════════════╗', 'color: #f59e0b; font-weight: bold;');
    console.warn('%c║  PREMIER DÉMARRAGE - MOT DE PASSE ADMIN TEMPORAIRE         ║', 'color: #f59e0b; font-weight: bold;');
    console.warn('%c╠════════════════════════════════════════════════════════════╣', 'color: #f59e0b; font-weight: bold;');
    console.warn('%c║  Username: admin                                           ║', 'color: #f59e0b;');
    console.warn(`%c║  Password: ${tempAdminPwd.padEnd(52)}║`, 'color: #f59e0b;');
    console.warn('%c╠════════════════════════════════════════════════════════════╣', 'color: #f59e0b; font-weight: bold;');
    console.warn('%c║  ⚠️  Changez ce mot de passe immédiatement après connexion  ║', 'color: #ef4444; font-weight: bold;');
    console.warn('%c╚════════════════════════════════════════════════════════════╝', 'color: #f59e0b; font-weight: bold;');
  } else {
    // Migration/réparation : s'assurer que chaque user a un password_hash valide
    const defaultPwds = { admin:null, inspecteur1:null, chef1:null }; // Plus de mots de passe par défaut
    let repaired = false;
    for (const u of DB.users) {
      if (!u.password_hash || !u.password_hash.startsWith('pbkdf2$')) {
        // Migration vers PBKDF2 ou réparation - générer un mot de passe aléatoire
        const randomPwd = Array.from(crypto.getRandomValues(new Uint8Array(12)))
          .map(b => (b % 36).toString(36))
          .join('');
        u.password_hash = await hashPwd(randomPwd);
        u.must_change_password = true;
        repaired = true;
        console.warn(`Mot de passe réinitialisé pour ${u.username}: ${randomPwd} (doit être changé)`);
      }
    }
    if (repaired) addAudit(null, 'system', 'REPAIR_PASSWORDS', 'security', null, 'Migration vers PBKDF2 avec mots de passe aléatoires');
  }
  if (!DB.grids.length) {
    DB.grids = buildAllGridsJS().map(g=>({...g, status:'active', is_current:true, created_at:now()}));
  }
  saveDB();
}

async function fallback(cmd, a) {
  await initFallbackDB();
  switch(cmd) {
    case 'list_grids': {
      if(!a?.token||!DB.sessions[a.token]) throw 'Non authentifié';
      return DB.grids.filter(g=>g.status==='active').map(g=>({...g, criteria_count:g.sections.reduce((s,sec)=>s+sec.items.length,0), section_count:g.sections.length}));
    }
    case 'cmd_login': {
      const u = DB.users.find(x=>x.username===a.username&&x.active);
      if(!u || !(await verifyPwd(a.password, u.password_hash))) throw 'Identifiants incorrects';
      const tok = crypto.randomUUID();
      DB.sessions[tok] = u.id;
      addAudit(u.id, u.username, 'LOGIN', 'session', tok, '');
      return { token:tok, user:{id:u.id,username:u.username,full_name:u.full_name,role:u.role,active:u.active,must_change_password:!!u.must_change_password,created_at:u.created_at,updated_at:u.updated_at}};
    }
    case 'cmd_change_own_password': {
      const uid=DB.sessions[a.token]; if(!uid) throw 'Non authentifié';
      const u=DB.users.find(x=>x.id===uid);
      if(!u || !(await verifyPwd(a.currentPassword, u.password_hash))) throw 'Mot de passe actuel incorrect';
      validatePassword(a.newPassword);
      u.password_hash = await hashPwd(a.newPassword);
      u.must_change_password = false;
      u.updated_at = now();
      addAudit(u.id, u.username, 'CHANGE_OWN_PASSWORD', 'user', u.id, '');
      saveDB();
      return null;
    }
    case 'cmd_logout': {
      const uid=DB.sessions[a.token];
      const u=DB.users.find(x=>x.id===uid);
      addAudit(uid,u?.username,'LOGOUT','session',a.token,'');
      delete DB.sessions[a.token];
      return null;
    }
    case 'cmd_validate_session': {
      const uid = DB.sessions[a.token]; if(!uid) throw 'Session invalide';
      const u = DB.users.find(x=>x.id===uid); if(!u||!u.active) throw 'Session invalide';
      return {id:u.id,username:u.username,full_name:u.full_name,role:u.role,active:u.active,must_change_password:!!u.must_change_password,created_at:u.created_at,updated_at:u.updated_at};
    }
    case 'cmd_list_users': return DB.users.map(u=>({id:u.id,username:u.username,full_name:u.full_name,role:u.role,active:u.active,created_at:u.created_at,updated_at:u.updated_at}));
    case 'cmd_create_user': {
      const nu = {id:crypto.randomUUID(), username:a.req.username, full_name:a.req.full_name, role:a.req.role, password_hash: await hashPwd(a.req.password), active:true, created_at:now(), updated_at:now()};
      DB.users.push(nu); addAudit(null,null,'CREATE_USER','user',nu.id,nu.username);
      return {id:nu.id,username:nu.username,full_name:nu.full_name,role:nu.role,active:true,created_at:nu.created_at,updated_at:nu.updated_at};
    }
    case 'cmd_update_user': {
      const u = DB.users.find(x=>x.id===a.userId);
      if(u){ if(a.req.full_name)u.full_name=a.req.full_name; if(a.req.role)u.role=a.req.role; if(a.req.active!==undefined)u.active=a.req.active; u.updated_at=now(); }
      addAudit(state.session?.user?.id,state.session?.user?.username,'UPDATE_USER','user',a.userId,u?.username); saveDB(); return null;
    }
    case 'cmd_change_password': {
      const u=DB.users.find(x=>x.id===a.userId);
      if(u) u.password_hash=await hashPwd(a.newPassword);
      addAudit(state.session?.user?.id,state.session?.user?.username,'CHANGE_PASSWORD','user',a.userId,'');
      saveDB(); return null;
    }
    case 'cmd_delete_user': {
      const u=DB.users.find(x=>x.id===a.userId);
      if(u){u.active=false;}
      addAudit(state.session?.user?.id,state.session?.user?.username,'DELETE_USER','user',a.userId,u?.username);
      saveDB(); return null;
    }
    case 'cmd_create_inspection': {
      const id=crypto.randomUUID();
      DB.inspections.push({id, grid_id:a.req.grid_id, status:'draft', date_inspection:a.req.date_inspection, establishment:a.req.establishment,
        inspection_type:a.req.inspection_type, inspectors:a.req.inspectors, created_by:state.session?.user?.id, created_by_name:state.session?.user?.full_name,
        validated_by:null,validated_by_name:null,validated_at:null, created_at:now(), updated_at:now(), progress:{total:0,answered:0,conforme:0,non_conforme:0},
        extra_meta: a.req.extra_meta || {}});
      DB.responses[id]={};
      addAudit(state.session?.user?.id, state.session?.user?.username, 'CREATE_INSPECTION','inspection',id, a.req.establishment);
      return id;
    }
    case 'cmd_list_inspections': return DB.inspections.filter(i=>{
      if(a.myOnly && i.created_by!==state.session?.user?.id) return false;
      if(a.status && i.status!==a.status) return false; return true;
    }).sort((x,y)=>y.updated_at.localeCompare(x.updated_at));
    case 'cmd_get_inspection': return DB.inspections.find(i=>i.id===a.inspectionId);
    case 'cmd_get_responses': {
      const r = DB.responses[a.inspectionId]||{};
      return Object.entries(r).map(([cid,v])=>({criterion_id:parseInt(cid), conforme:v.conforme, observation:v.observation||'', updated_by:v.updated_by, updated_at:v.updated_at||now(), severity:v.severity||null, factor:v.factor||null, factor_justification:v.factor_justification||null, immediate_danger:v.immediate_danger||false}));
    }
    case 'cmd_save_response': {
      if(!DB.responses[a.inspectionId]) DB.responses[a.inspectionId]={};
      DB.responses[a.inspectionId][a.criterionId]={conforme:a.conforme, observation:a.observation, updated_by:state.session?.user?.id, updated_at:now(), severity:a.severity||null, factor:a.factor||null, factor_justification:a.factorJustification||null, immediate_danger:a.immediateDanger||false};
      const insp=DB.inspections.find(i=>i.id===a.inspectionId);
      if(insp){insp.status=insp.status==='draft'?'in_progress':insp.status; insp.updated_at=now();
        const r=DB.responses[a.inspectionId]; const vals=Object.values(r);
        insp.progress={total:vals.length, answered:vals.filter(v=>v.conforme!==null&&v.conforme!==undefined).length, conforme:vals.filter(v=>v.conforme===true).length, non_conforme:vals.filter(v=>v.conforme===false).length};
      }
      saveDB(); return null;
    }
    case 'cmd_update_inspection_meta': {
      const insp=DB.inspections.find(i=>i.id===a.inspectionId);
      if(insp){insp.date_inspection=a.req.date_inspection;insp.establishment=a.req.establishment;insp.inspection_type=a.req.inspection_type;insp.inspectors=a.req.inspectors;insp.updated_at=now();if(a.req.extra_meta)insp.extra_meta=a.req.extra_meta;}
      saveDB(); return null;
    }
    case 'cmd_set_inspection_status': {
      const insp=DB.inspections.find(i=>i.id===a.inspectionId);
      if(!insp) throw 'Inspection non trouvée';
      if(!canTransition(insp.status, a.status)) throw `Transition invalide : ${insp.status} → ${a.status}`;
      // Snapshot du rapport lors du passage a completed ou validated
      if(['completed','validated'].includes(a.status)) {
        const resps = DB.responses[a.inspectionId] || {};
        const version = (DB.reportSnapshots.filter(s=>s.inspection_id===a.inspectionId).length||0)+1;
        DB.reportSnapshots.push({
          id: crypto.randomUUID(), inspection_id: a.inspectionId, version,
          status: a.status, responses: JSON.parse(JSON.stringify(resps)),
          meta: JSON.parse(JSON.stringify(insp.extra_meta||{})),
          created_by: state.session?.user?.id, created_by_name: state.session?.user?.full_name,
          created_at: now()
        });
      }
      insp.status=a.status; insp.updated_at=now();
      if(a.status==='validated'){insp.validated_by=state.session?.user?.id;insp.validated_by_name=state.session?.user?.full_name;insp.validated_at=now();}
      addAudit(state.session?.user?.id, state.session?.user?.username, 'SET_STATUS_'+a.status.toUpperCase(),'inspection',a.inspectionId,'');
      saveDB(); return null;
    }
    case 'cmd_delete_inspection': {
      DB.inspections=DB.inspections.filter(i=>i.id!==a.inspectionId);
      delete DB.responses[a.inspectionId];
      addAudit(state.session?.user?.id,state.session?.user?.username,'DELETE_INSPECTION','inspection',a.inspectionId,'');
      saveDB(); return null;
    }
    case 'cmd_query_audit': {
      let logs = [...DB.audit];
      if(a.filter.user_id) logs=logs.filter(l=>l.user_id===a.filter.user_id);
      if(a.filter.action) logs=logs.filter(l=>l.action===a.filter.action);
      if(a.filter.entity_type) logs=logs.filter(l=>l.entity_type===a.filter.entity_type);
      const limit=a.filter.limit||100, offset=a.filter.offset||0;
      return logs.slice(offset, offset+limit);
    }
    case 'cmd_count_audit': return DB.audit.length;
    case 'cmd_list_grids_admin': return DB.grids.filter(g=>g.status==='active').map(g=>({id:g.id,name:g.name,code:g.code,description:g.description,icon:g.icon,color:g.color,criteria_count:g.sections.reduce((s,sec)=>s+sec.items.length,0),section_count:g.sections.length}));
    case 'cmd_create_grid': {
      const g={id:a.req.id,name:a.req.name,code:a.req.code,version:'1',description:a.req.description,icon:a.req.icon,color:a.req.color,sections:[],status:'active',is_current:true,created_at:now()};
      DB.grids.push(g); addAudit(null,null,'CREATE_GRID','grid',g.id,g.name); saveDB(); return g.id;
    }
    case 'cmd_update_grid_meta': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      if(g){ if(a.name)g.name=a.name; if(a.description)g.description=a.description; if(a.icon)g.icon=a.icon; if(a.color)g.color=a.color; }
      addAudit(null,null,'UPDATE_GRID','grid',a.gridId,''); saveDB(); return null;
    }
    case 'cmd_archive_grid': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      if(g) g.status='archived';
      addAudit(null,null,'ARCHIVE_GRID','grid',a.gridId,''); saveDB(); return null;
    }
    case 'cmd_duplicate_grid': {
      const src=DB.grids.find(x=>x.id===a.gridId);
      if(!src) throw 'Grille introuvable';
      const dup=JSON.parse(JSON.stringify(src));
      dup.id=a.newId; dup.name=a.newName; dup.code=src.code+'-copie'; dup.version='1'; dup.created_at=now();
      DB.grids.push(dup); addAudit(null,null,'DUPLICATE_GRID','grid',a.newId,'depuis '+a.gridId); saveDB(); return a.newId;
    }
    case 'cmd_create_section': {
      const g=DB.grids.find(x=>x.id===a.req.grid_id||x.id===a.req.gridId);
      if(!g) throw 'Grille introuvable';
      const maxId=g.sections.reduce((m,s)=>Math.max(m,s.id),0);
      g.sections.push({id:maxId+1,title:a.req.title,items:[]});
      addAudit(null,null,'ADD_SECTION','grid',g.id,a.req.title); saveDB(); return maxId+1;
    }
    case 'cmd_update_section': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      if(g){ const s=g.sections.find(x=>x.id===a.sectionId); if(s)s.title=a.title; }
      saveDB(); return null;
    }
    case 'cmd_delete_section': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      if(g) g.sections=g.sections.filter(s=>s.id!==a.sectionId);
      addAudit(null,null,'DELETE_SECTION','grid',a.gridId,'section '+a.sectionId); saveDB(); return null;
    }
    case 'cmd_create_criterion': {
      const g=DB.grids.find(x=>x.id===a.req.grid_id||x.id===a.req.gridId);
      if(!g) throw 'Grille introuvable';
      const sec=g.sections.find(s=>s.id===a.req.section_id||s.id===a.req.sectionId);
      if(!sec) throw 'Section introuvable';
      const maxCid=g.sections.reduce((m,s)=>s.items.reduce((m2,c)=>Math.max(m2,c.id),m),0);
      sec.items.push({id:maxCid+1,reference:a.req.reference,description:a.req.description,pre_opening:a.req.pre_opening||false,severity:a.req.severity||'majeur'});
      addAudit(null,null,'ADD_CRITERION','grid',g.id,a.req.reference); saveDB(); return maxCid+1;
    }
    case 'cmd_update_criterion': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      if(g){ for(const s of g.sections){ const c=s.items.find(x=>x.id===a.criterionId); if(c){ if(a.reference)c.reference=a.reference; if(a.description)c.description=a.description; if(a.preOpening!==undefined)c.pre_opening=a.preOpening; if(a.severity)c.severity=a.severity; break; }}}
      saveDB(); return null;
    }
    case 'cmd_delete_criterion': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      if(g){ for(const s of g.sections){ s.items=s.items.filter(c=>c.id!==a.criterionId); }}
      addAudit(null,null,'DELETE_CRITERION','grid',a.gridId,'criterion '+a.criterionId); saveDB(); return null;
    }
    case 'cmd_list_grid_versions': return DB.gridVersions.filter(v=>v.grid_id===a.gridId).map(v=>([v.version,v.summary,v.created_at]));
    case 'cmd_create_grid_version': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      if(!g) throw 'Grille introuvable';
      const ver=String((DB.gridVersions.filter(v=>v.grid_id===a.gridId).length||0)+1);
      DB.gridVersions.push({grid_id:a.gridId,version:ver,summary:a.changeSummary||'',snapshot:JSON.stringify(g),created_at:now()});
      g.version=ver; saveDB(); return ver;
    }
    case 'cmd_export_grid_json': {
      const g=DB.grids.find(x=>x.id===a.gridId);
      return g?JSON.stringify(g,null,2):'{}';
    }
    case 'cmd_export_audit_csv': {
      const csvEscape = v => '"' + String(v||'').replace(/"/g, '""') + '"';
      const header = 'timestamp,action,user,details';
      return [header, ...DB.audit.map(l =>
        [l.timestamp, l.action, l.username, l.details].map(csvEscape).join(',')
      )].join('\n');
    }
    case 'cmd_export_audit_json': return JSON.stringify(DB.audit,null,2);

    // ═══════════ SNAPSHOTS RAPPORT ═══════════
    case 'cmd_list_report_snapshots': return DB.reportSnapshots.filter(s=>s.inspection_id===a.inspectionId).sort((x,y)=>y.version-x.version);
    case 'cmd_get_report_snapshot': return DB.reportSnapshots.find(s=>s.id===a.snapshotId) || null;
    case 'cmd_create_manual_snapshot': {
      const uid=DB.sessions[a.token]; if(!uid) throw 'Non authentifie';
      const u=DB.users.find(x=>x.id===uid);
      const version = (DB.reportSnapshots.filter(s=>s.inspection_id===a.inspectionId).length||0)+1;
      DB.reportSnapshots.push({
        id: crypto.randomUUID(), inspection_id: a.inspectionId, version,
        status: 'manual', responses: JSON.parse(JSON.stringify(a.responses||{})),
        meta: JSON.parse(JSON.stringify(a.meta||{})),
        created_by: uid, created_by_name: u?.full_name||'—',
        created_at: now()
      });
      addAudit(uid, u?.username, 'CREATE_MANUAL_SNAPSHOT','inspection',a.inspectionId,'v'+version);
      saveDB(); return version;
    }

    // ═══════════ PLANNING ═══════════
    case 'cmd_list_planning': return DB.planning.sort((x,y)=>(x.date_debut||'').localeCompare(y.date_debut||''));
    case 'cmd_create_planning': {
      const p = { id:crypto.randomUUID(), ...a.req, status:'planifie', created_by:state.session?.user?.id, created_by_name:state.session?.user?.full_name, created_at:now() };
      DB.planning.push(p);
      addAudit(state.session?.user?.id, state.session?.user?.username, 'CREATE_PLANNING','planning',p.id, p.establishment||'');
      saveDB(); return p.id;
    }
    case 'cmd_update_planning': {
      const p = DB.planning.find(x=>x.id===a.planningId);
      if(p) { Object.assign(p, a.req, { updated_at:now() }); }
      saveDB(); return null;
    }
    case 'cmd_delete_planning': {
      DB.planning = DB.planning.filter(x=>x.id!==a.planningId);
      addAudit(state.session?.user?.id, state.session?.user?.username, 'DELETE_PLANNING','planning',a.planningId,'');
      saveDB(); return null;
    }

    // ═══════════ INDISPONIBILITES ═══════════
    case 'cmd_list_indisponibilites': return DB.indisponibilites.sort((x,y)=>(x.date_debut||'').localeCompare(y.date_debut||''));
    case 'cmd_create_indisponibilite': {
      const ind = { id:crypto.randomUUID(), ...a.req, created_at:now() };
      DB.indisponibilites.push(ind);
      saveDB(); return ind.id;
    }
    case 'cmd_delete_indisponibilite': {
      DB.indisponibilites = DB.indisponibilites.filter(x=>x.id!==a.indisponibiliteId);
      saveDB(); return null;
    }

    // ═══════════ SETTINGS ═══════════
    case 'cmd_get_settings': return DB.settings;
    case 'cmd_save_settings': { Object.assign(DB.settings, a.settings); saveDB(); return null; }

    // ═══════════ BACKUP (mode navigateur : export/import localStorage) ═══════════
    case 'cmd_list_backups':    return [];           // Pas de backups SQLite en mode navigateur
    case 'cmd_backup_db':       return 'local_mode'; // Indiquer mode non-Tauri
    case 'cmd_restore_db':      throw 'La restauration SQLite nécessite le mode application (Tauri). Utilisez l\'export/import JSON.';
    case 'cmd_delete_backup':   return null;
    case 'cmd_configure_backup': {
      // Persister dans DB.settings pour cohérence
      if (a.intervalHours)  DB.settings.backup_interval_hours = a.intervalHours;
      if (a.maxAutoBackups) DB.settings.max_auto_backups = a.maxAutoBackups;
      saveDB(); return null;
    }

    case 'get_grid': {
      if(!a?.token||!DB.sessions[a.token]) throw 'Non authentifié';
      const g=DB.grids.find(x=>x.id===a.gridId&&x.status==='active');
      return g||buildAllGridsJS().find(x=>x.id===a.gridId)||null;
    }
    default: return null;
  }
}
