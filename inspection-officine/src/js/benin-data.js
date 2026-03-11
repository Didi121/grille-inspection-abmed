// ═══════════════════ DONNEES GEOGRAPHIQUES DU BENIN ═══════════════════
// 12 departements et 77 communes officielles

export const DEPARTEMENTS = [
  {
    nom: 'Alibori',
    chef_lieu: 'Kandi',
    communes: ['Banikoara', 'Gogounou', 'Kandi', 'Karimama', 'Malanville', 'Segbana']
  },
  {
    nom: 'Atacora',
    chef_lieu: 'Natitingou',
    communes: ['Boukoumbe', 'Cobly', 'Kerou', 'Kouande', 'Materi', 'Natitingou', 'Pehunco', 'Tanguieta', 'Toucountouna']
  },
  {
    nom: 'Atlantique',
    chef_lieu: 'Ouidah',
    communes: ['Abomey-Calavi', 'Allada', 'Kpomasse', 'Ouidah', 'So-Ava', 'Toffo', 'Tori-Bossito', 'Ze']
  },
  {
    nom: 'Borgou',
    chef_lieu: 'Parakou',
    communes: ['Bembeeke', 'Kalale', 'N\'Dali', 'Nikki', 'Parakou', 'Perere', 'Sinende', 'Tchaourou']
  },
  {
    nom: 'Collines',
    chef_lieu: 'Dassa-Zoume',
    communes: ['Bante', 'Dassa-Zoume', 'Glazoue', 'Ouesse', 'Savalou', 'Save']
  },
  {
    nom: 'Couffo',
    chef_lieu: 'Lokossa',
    communes: ['Aplahoue', 'Djakotomey', 'Dogbo', 'Klouekanme', 'Lalo', 'Toviklin']
  },
  {
    nom: 'Donga',
    chef_lieu: 'Djougou',
    communes: ['Bassila', 'Copargo', 'Djougou', 'Ouake']
  },
  {
    nom: 'Littoral',
    chef_lieu: 'Cotonou',
    communes: ['Cotonou']
  },
  {
    nom: 'Mono',
    chef_lieu: 'Lokossa',
    communes: ['Athieme', 'Bopa', 'Come', 'Grand-Popo', 'Houeyogbe', 'Lokossa']
  },
  {
    nom: 'Oueme',
    chef_lieu: 'Porto-Novo',
    communes: ['Adjarra', 'Adjohoun', 'Aguegues', 'Akpro-Misserete', 'Avrankou', 'Bonou', 'Dangbo', 'Porto-Novo', 'Seme-Kpodji']
  },
  {
    nom: 'Plateau',
    chef_lieu: 'Sakete',
    communes: ['Adja-Ouere', 'Ifangni', 'Ketou', 'Pobe', 'Sakete']
  },
  {
    nom: 'Zou',
    chef_lieu: 'Abomey',
    communes: ['Abomey', 'Agbangnizoun', 'Bohicon', 'Cove', 'Djidja', 'Ouinhi', 'Za-Kpota', 'Zagnanado', 'Zogbodomey']
  }
];

// Lookup rapide : commune -> departement
export const COMMUNE_TO_DEPT = {};
DEPARTEMENTS.forEach(d => d.communes.forEach(c => { COMMUNE_TO_DEPT[c] = d.nom; }));

// Liste plate de toutes les communes (triee)
export const ALL_COMMUNES = DEPARTEMENTS.flatMap(d => d.communes).sort();

// Obtenir les communes d'un departement
export function getCommunesByDept(deptName) {
  const dept = DEPARTEMENTS.find(d => d.nom === deptName);
  return dept ? dept.communes : [];
}
