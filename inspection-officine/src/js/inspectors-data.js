// Auto-generated from IP-F-002 LISTE DES INSPECTEURS.pdf
// ABMed - Direction des inspections et de la reglementation pharmaceutique
// Version 001 - Date d'application: 01/01/2025

export const INSPECTORS = [
  { nom: 'AGBANOU', prenom: 'Amour Narcisse Degnon', initiales: 'AA' },
  { nom: 'HADE', prenom: 'Paterne Deo-Gratias', initiales: 'TH' },
  { nom: 'WHANNOU de DRAVO', prenom: 'Kpedetin Olivia Jute Linda', initiales: 'KW' },
  { nom: 'AGBO-OLA', prenom: 'Adetola Omolara Florisse', initiales: 'FA' },
  { nom: 'AGOSSA', prenom: 'Ulrich', initiales: 'UA' },
  { nom: 'AHOGA', prenom: 'Josias', initiales: 'JA' },
  { nom: 'AHOLOUKPE', prenom: 'Leonelle Immaculee', initiales: 'LA' },
  { nom: 'ATCHEFFON', prenom: 'Tanguy', initiales: 'TA' },
  { nom: 'DAGAN', prenom: 'Midokpe Elodie', initiales: 'ED' },
  { nom: 'DASSI', prenom: 'Bidossessi Aime', initiales: 'AD' },
  { nom: 'DAZOUNDO', prenom: 'Tagnon Cyrille Steeve', initiales: 'SD' },
  { nom: 'GANHOU', prenom: 'Irene Senankpon', initiales: 'IG' },
  { nom: 'HOUNDRODE', prenom: 'Gisele Amavi', initiales: 'GH' },
  { nom: 'HOUNGBEDJI', prenom: 'Codjo Joel Onesime', initiales: 'JH' },
  { nom: 'KOKOYE', prenom: 'Eole Armanda Luxio', initiales: 'EK' },
  { nom: 'LOKOSSOU', prenom: 'Euned Deo-Gracias', initiales: 'EL' },
  { nom: 'MADOHONAN', prenom: 'Mawugnon Yasmine', initiales: 'YM' },
  { nom: 'OLAFA', prenom: 'Omotayo Mouyinath', initiales: 'MO' },
  { nom: 'POKOU', prenom: 'Aurelle', initiales: 'AP' },
  { nom: 'SAROUKOU', prenom: 'Farouk Ayinde Antonio', initiales: 'FS' },
  { nom: 'SEGNON', prenom: 'Aymone Corinne', initiales: 'CS' },
  { nom: 'TAMOU SAMBO', prenom: 'Sime Abdias', initiales: 'ST' },
  { nom: 'VIGAN', prenom: 'Jean-Paul', initiales: 'PV' },
];

export function searchInspectors(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return INSPECTORS.filter(i =>
    i.nom.toLowerCase().includes(q) ||
    i.prenom.toLowerCase().includes(q) ||
    i.initiales.toLowerCase().includes(q) ||
    (i.nom + ' ' + i.prenom).toLowerCase().includes(q)
  );
}

export function getInspectorDisplay(inspector) {
  return `${inspector.prenom} ${inspector.nom} (${inspector.initiales})`;
}

export function getAllInspectorNames() {
  return INSPECTORS.map(i => `${i.prenom} ${i.nom}`);
}
