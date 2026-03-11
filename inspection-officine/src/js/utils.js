// ═══════════════════ UTILITY FUNCTIONS ═══════════════════

export function now() {
  return new Date().toISOString().replace('T',' ').substring(0,19);
}

export function esc(s) {
  if(!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function escAttr(s) {
  if(!s) return '';
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Validation des entrées ──
export function validateInput(val, name, minLen, maxLen) {
  const v = (val||'').trim();
  if(v.length < minLen) throw `${name} doit contenir au moins ${minLen} caractères`;
  if(maxLen && v.length > maxLen) throw `${name} ne peut pas dépasser ${maxLen} caractères`;
  return v;
}

export function validatePassword(pwd) {
  if(!pwd || pwd.length < 8) throw 'Le mot de passe doit contenir au moins 8 caractères';
  if(!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) throw 'Le mot de passe doit contenir lettres et chiffres';
  return pwd;
}

// ── Machine à états des statuts d'inspection ──
export const VALID_TRANSITIONS = {
  draft: ['in_progress', 'archived'],
  in_progress: ['completed', 'draft'],
  completed: ['validated', 'in_progress'],
  validated: ['archived'],
  archived: []
};

export function canTransition(from, to) {
  return (VALID_TRANSITIONS[from]||[]).includes(to);
}
