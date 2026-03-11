// ═══════════════════ RISK ASSESSMENT ENGINE ═══════════════════
import { state } from './state.js';

export const SEV_ORDER = ['info','mineur','majeur','critique'];

export function adjustSeverity(baseSev, factor) {
  if(!factor || factor==='neutre') return baseSev;
  const idx = SEV_ORDER.indexOf(baseSev);
  if(idx<0) return baseSev;
  if(factor==='aggravant') return SEV_ORDER[Math.min(idx+1, SEV_ORDER.length-1)];
  if(factor==='attenuant') return SEV_ORDER[Math.max(idx-1, 0)];
  return baseSev;
}

export function determineComplianceRisk(critiques, majeurs, mineurs, obsInfos) {
  const nCrit=critiques.length, nMaj=majeurs.length, nMin=mineurs.length;
  // Scenario 4: Risque immédiat pour la santé publique
  const hasImmediate = critiques.some(e => state.responses[e.id]?.immediateDanger);
  if(hasImmediate) return {
    level:4, code:'RISQUE_IMMEDIAT', label:'Risque immédiat — Santé publique',
    color:'#7f1d1d', bgColor:'#fef2f2',
    action:'Décision réglementaire immédiate requise sur place. Consultation de la hiérarchie obligatoire.',
    description:`Présence d'au moins un écart critique présentant un danger urgent et immédiat pour la santé publique.`
  };
  // Scenario 3: >=1 critique OU >=6 majeurs -> Non conforme
  if(nCrit>=1 || nMaj>=6) return {
    level:3, code:'NON_CONFORME', label:'Non conforme',
    color:'#dc2626', bgColor:'#fef2f2',
    action:'Soumission CAPA obligatoire. Réinspection probable.',
    description:`Fonctionnement à un niveau inacceptable. ${nCrit>=1?nCrit+' écart(s) critique(s)':''}${nCrit>=1&&nMaj>=6?' et ':''}${nMaj>=6?nMaj+' écarts majeurs (≥6)':''}${nCrit>=1&&nMaj<6&&nMaj>0?', '+nMaj+' majeur(s)':''}.`
  };
  // Scenario 2: quelques majeurs (<6) + mineurs -> Conformité conditionnelle
  if(nMaj>0) return {
    level:2, code:'CONFORMITE_CONDITIONNELLE', label:'Conformité sous réserve',
    color:'#d97706', bgColor:'#fffbeb',
    action:'Décision après réception et évaluation du CAPA. Inspection de suivi sur place possible.',
    description:`${nMaj} écart(s) majeur(s) et ${nMin} mineur(s). La conformité sera évaluée après réception du plan d'actions correctives.`
  };
  // Scenario 1: seulement mineurs/observations -> Conforme
  return {
    level:1, code:'CONFORME', label:'Conforme',
    color:'#16a34a', bgColor:'#f0fdf4',
    action:'Soumission CAPA. Suivi lors de la prochaine inspection de routine.',
    description:`Fonctionnement à un niveau acceptable. ${nMin} écart(s) mineur(s)${obsInfos.length?' et '+obsInfos.length+' observation(s)':''}.`
  };
}

export function determineGlobalRisk(rate, critiques, majeurs, hasImmediate) {
  if(hasImmediate || rate<40) return {label:'Très élevé', color:'#7f1d1d', bgColor:'#fef2f2'};
  if(critiques.length>=1 || majeurs.length>=6 || rate<60) return {label:'Élevé', color:'#dc2626', bgColor:'#fef2f2'};
  if(majeurs.length>0 || rate<80) return {label:'Modéré', color:'#d97706', bgColor:'#fffbeb'};
  return {label:'Faible', color:'#16a34a', bgColor:'#f0fdf4'};
}
