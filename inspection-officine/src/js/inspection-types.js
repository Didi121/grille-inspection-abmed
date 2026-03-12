// ═══════════════════ TYPES D'INSPECTION (IP-PC-0001) ═══════════════════
// Classification ABMed conforme a la procedure generale d'inspection PIC/S
// Reference: IP-PC-0001 v2, 09/03/2026
// QualiPro — Document interne ABMed

export const INSPECTION_TYPES = [
  {
    groupe: 'Inspection de routine',
    code: 'routine',
    sousTypes: [
      { code: 'routine_complete', label: 'Routine — Complete',
        desc: '1) Programme preetabli assurant le suivi permanent du respect de la reglementation. 2) Porte sur l\'ensemble des exigences BPx choisies comme indicateurs. 3) Fondee sur le risque ou antecedents de non-conformite aux BPx. 4) Declenchee si le niveau de conformite a baisse.' },
      { code: 'routine_concise', label: 'Routine — Concise',
        desc: '1) Porte sur un nombre limite d\'exigences BPx choisies comme indicateurs. 2) Realisee lorsqu\'une evaluation sur dossier a ete effectuee mais la portee du rapport n\'est pas suffisamment complete pour couvrir entierement le produit/l\'activite.' },
      { code: 'routine_suivi', label: 'Routine — De Suivi',
        desc: '1) Effectuee entre 6 semaines et 6 mois apres l\'inspection initiale. 2) Pour surveiller le resultat des CAPA des etablissements necessitant une vigilance particuliere. 3) Peut etre limitee a des BPx specifiques non observees.' },
    ]
  },
  {
    groupe: 'Inspections ciblees',
    code: 'ciblee',
    sousTypes: [
      { code: 'ciblee_speciale', label: 'Ciblee — Speciale',
        desc: '1) Controles ponctuels portant sur un produit, un groupe de produits connexes, des activites ou operations specifiques. 2) Effectuees pour repondre aux demandes des differents donneurs d\'ordre.' },
      { code: 'ciblee_enquete', label: 'Ciblee — Sur enquete',
        desc: 'Ponctuelles et urgentes commanditees et/ou effectuees pour repondre aux demandes des differents donneurs d\'ordre.' },
      { code: 'ciblee_plainte', label: 'Ciblee — Sur plainte/reclamation',
        desc: 'Menee a la suite d\'une plainte, d\'un avis d\'un denonciateur, d\'un rappel ou d\'un signalement d\'evenements indesirables a la suite de l\'utilisation d\'un produit de sante.' },
    ]
  },
  {
    groupe: 'Inspections reglementaires / sur demande',
    code: 'reglementaire',
    desc: 'Dans le cadre de procedures reglementaires dont les delais doivent etre respectes.',
    sousTypes: [
      { code: 'regl_licence', label: 'Reglementaire — Octroi de licence',
        desc: 'Dans le cadre de l\'octroi de licence d\'exploitation.' },
      { code: 'regl_ouverture', label: 'Reglementaire — Avant ouverture',
        desc: 'Inspection avant ouverture d\'un etablissement.' },
      { code: 'regl_transfert', label: 'Reglementaire — Transfert/deplacement',
        desc: 'Suite a un transfert ou deplacement d\'etablissement.' },
      { code: 'regl_amm', label: 'Reglementaire — Octroi d\'AMM',
        desc: 'Dans le cadre de l\'octroi d\'une Autorisation de Mise sur le Marche.' },
      { code: 'regl_activite', label: 'Reglementaire — Debut d\'activites',
        desc: 'Inspection avant debut d\'activites.' },
    ]
  }
];

// Genere le HTML <optgroup> pour un <select>
export function buildTypeOptions(selectedCode) {
  return INSPECTION_TYPES.map(g =>
    `<optgroup label="${g.groupe}">` +
    g.sousTypes.map(st =>
      `<option value="${st.code}" ${st.code === selectedCode ? 'selected' : ''} title="${st.desc}">${st.label}</option>`
    ).join('') +
    '</optgroup>'
  ).join('');
}

// Genere le HTML pour les options du filtre (avec option vide)
export function buildTypeFilterOptions() {
  return '<option value="">Type d\'inspection</option>' + buildTypeOptions('');
}

// Retrouve le label a partir du code
export function getTypeLabel(code) {
  if (!code) return '—';
  for (const g of INSPECTION_TYPES) {
    const st = g.sousTypes.find(s => s.code === code);
    if (st) return st.label;
  }
  // Retrocompatibilite avec les anciens labels
  return code;
}

// Retrouve le label court (sans le prefixe groupe) a partir du code
export function getTypeShortLabel(code) {
  if (!code) return '—';
  for (const g of INSPECTION_TYPES) {
    const st = g.sousTypes.find(s => s.code === code);
    if (st) return st.label.split(' — ')[1] || st.label;
  }
  return code;
}

// Retrouve le groupe a partir du code
export function getTypeGroupe(code) {
  if (!code) return '—';
  for (const g of INSPECTION_TYPES) {
    if (g.sousTypes.some(s => s.code === code)) return g.groupe;
  }
  return '—';
}

// Liste plate de tous les codes
export function getAllTypeCodes() {
  return INSPECTION_TYPES.flatMap(g => g.sousTypes.map(st => st.code));
}

// Liste plate de tous les sous-types avec leur groupe
export function getAllTypesFlat() {
  return INSPECTION_TYPES.flatMap(g => g.sousTypes.map(st => ({ ...st, groupe: g.groupe, groupeCode: g.code })));
}
