// ═══════════════════ INVOKE / FALLBACK DB ═══════════════════
import { state, isTauri } from './state.js';
import { now, validatePassword, canTransition } from './utils.js';
import { buildAllGridsJS } from './grids-data.js';

export async function invoke(cmd, args={}) {
  if (isTauri) return await window.__TAURI_INTERNALS__.invoke(cmd, args);
  return fallback(cmd, args);
}

export const DB = { users: [], inspections: [], responses: {}, audit: [], sessions: {}, grids: [], gridVersions: [], reportSnapshots: [], planning: [], indisponibilites: [] };

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
      indisponibilites: DB.indisponibilites
    };
    localStorage.setItem('ipharma_db', JSON.stringify(d));
  } catch(e){}
}

function loadDB() {
  try {
    const d = JSON.parse(localStorage.getItem('ipharma_db')||localStorage.getItem('abmed_db_v2')||'null');
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
    }
  } catch(e){}
}

// Hash simple salé pour le mode fallback (fonctionne en file:// sans crypto.subtle)
function hashPwd(pwd) {
  const str = pwd + '_ipharma_salt_2026';
  let h1=0xdeadbeef, h2=0x41c6ce57;
  for(let i=0;i<str.length;i++){
    const ch=str.charCodeAt(i);
    h1=Math.imul(h1^ch,2654435761);
    h2=Math.imul(h2^ch,1597334677);
  }
  h1=Math.imul(h1^(h1>>>16),2246822507);
  h1^=Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507);
  h2^=Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36)+'x'+(4294967296*(2097151&h1)+(h2>>>0)).toString(36);
}

function verifyPwd(pwd, hash) { return hashPwd(pwd) === hash; }

function addAudit(userId, username, action, entityType, entityId, details) {
  DB.audit.unshift({ id: DB.audit.length+1, timestamp: now(), user_id: userId, username, action, entity_type: entityType, entity_id: entityId, details });
  saveDB();
}

export function initFallbackDB() {
  loadDB();
  if (!DB.users.length) {
    DB.users.push({ id:crypto.randomUUID(), username:'admin', full_name:'Administrateur', role:'admin', active:true,
      password_hash: hashPwd('admin123'), must_change_password:true, created_at: now(), updated_at: now() });
    DB.users.push({ id: crypto.randomUUID(), username:'inspecteur1', full_name:'Dr. Konou',
      role:'inspector', active:true, password_hash: hashPwd('pass123'), must_change_password:true, created_at: now(), updated_at: now() });
    DB.users.push({ id: crypto.randomUUID(), username:'chef1', full_name:'Dr. Tamou',
      role:'lead_inspector', active:true, password_hash: hashPwd('pass123'), must_change_password:true, created_at: now(), updated_at: now() });
  } else {
    // Migration/réparation : s'assurer que chaque user a un password_hash valide
    const defaultPwds = { admin:'admin123', inspecteur1:'pass123', chef1:'pass123' };
    let repaired = false;
    for (const u of DB.users) {
      if (!u.password_hash) {
        // Cas 1: ancien format avec password en clair
        if (u.password) {
          u.password_hash = hashPwd(u.password);
          delete u.password;
        } else {
          // Cas 2: données corrompues (ni password ni hash) -> reset au défaut
          u.password_hash = hashPwd(defaultPwds[u.username] || 'changeme');
        }
        repaired = true;
      }
    }
    if (repaired) addAudit(null, 'system', 'REPAIR_PASSWORDS', 'security', null, 'Réparation mots de passe corrompus');
  }
  if (!DB.grids.length) {
    DB.grids = buildAllGridsJS().map(g=>({...g, status:'active', is_current:true, created_at:now()}));
  }
  saveDB();
}

function fallback(cmd, a) {
  initFallbackDB();
  switch(cmd) {
    case 'list_grids': {
      if(!a?.token||!DB.sessions[a.token]) throw 'Non authentifié';
      return DB.grids.filter(g=>g.status==='active').map(g=>({...g, criteria_count:g.sections.reduce((s,sec)=>s+sec.items.length,0), section_count:g.sections.length}));
    }
    case 'cmd_login': {
      const u = DB.users.find(x=>x.username===a.username&&x.active);
      if(!u || !verifyPwd(a.password, u.password_hash)) throw 'Identifiants incorrects';
      const tok = crypto.randomUUID();
      DB.sessions[tok] = u.id;
      addAudit(u.id, u.username, 'LOGIN', 'session', tok, '');
      return { token:tok, user:{id:u.id,username:u.username,full_name:u.full_name,role:u.role,active:u.active,must_change_password:!!u.must_change_password,created_at:u.created_at,updated_at:u.updated_at}};
    }
    case 'cmd_change_own_password': {
      const uid=DB.sessions[a.token]; if(!uid) throw 'Non authentifié';
      const u=DB.users.find(x=>x.id===uid);
      if(!u || !verifyPwd(a.currentPassword, u.password_hash)) throw 'Mot de passe actuel incorrect';
      validatePassword(a.newPassword);
      u.password_hash = hashPwd(a.newPassword);
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
      const nu = {id:crypto.randomUUID(), username:a.req.username, full_name:a.req.full_name, role:a.req.role, password_hash: hashPwd(a.req.password), active:true, created_at:now(), updated_at:now()};
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
      if(u) u.password_hash=hashPwd(a.newPassword);
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
    case 'cmd_export_audit_csv': return 'timestamp,action,user,details\n'+DB.audit.map(l=>l.timestamp+','+l.action+','+(l.username||'')+','+(l.details||'')).join('\n');
    case 'cmd_export_audit_json': return JSON.stringify(DB.audit,null,2);

    // ═══════════ SNAPSHOTS RAPPORT ═══════════
    case 'cmd_list_report_snapshots': return DB.reportSnapshots.filter(s=>s.inspection_id===a.inspectionId).sort((x,y)=>y.version-x.version);
    case 'cmd_get_report_snapshot': return DB.reportSnapshots.find(s=>s.id===a.snapshotId) || null;

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
    case 'get_grid': {
      if(!a?.token||!DB.sessions[a.token]) throw 'Non authentifié';
      const g=DB.grids.find(x=>x.id===a.gridId&&x.status==='active');
      return g||buildAllGridsJS().find(x=>x.id===a.gridId)||null;
    }
    default: return null;
  }
}
