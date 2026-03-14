// ═══════════════════ PDF EXPORT FUNCTIONALITY ═══════════════════
// Module pour l'exportation de rapports en PDF

import { state, isTauri } from './state.js';
import { invoke } from './api.js';
import { showToast } from './toast.js';

// Générer un rapport PDF pour une inspection
export async function generatePDFReport(inspectionId) {
  try {
    showToast('Génération du rapport PDF en cours…', 'info');

    if (isTauri) {
      // ── Mode Tauri : appeler le générateur PDF Rust réel ──
      const pdfPath = await invoke('cmd_generate_pdf_report', {
        token: state.session.token,
        inspectionId,
        outputPath: null   // Rust choisit le chemin dans le dossier temp
      });
      // Ouvrir le PDF généré avec l'application par défaut du système
      await window.__TAURI_INTERNALS__.invoke('plugin:shell|open', { path: pdfPath })
        .catch(() => showToast(`PDF généré : ${pdfPath}`, 'info'));
      showToast('Rapport PDF généré avec succès', 'info');
    } else {
      // ── Mode navigateur : impression via window.print() ──
      showToast('Mode navigateur : impression système utilisée', 'info');
      setTimeout(() => window.print(), 500);
    }

  } catch (error) {
    console.error('Erreur génération PDF:', error);
    showToast('Erreur PDF : ' + (error?.message || error), 'error');
  }
}

// Préparer les données pour le rapport
function prepareReportData(inspection, responses) {
  // Cette fonction organiserait les données de l'inspection
  // pour le format PDF
  
  return {
    inspectionId: inspection.id,
    establishment: inspection.establishment,
    inspectionDate: inspection.date_inspection,
    inspector: inspection.extra_meta?.lead_inspector || 'Non spécifié',
    department: inspection.extra_meta?.departement || 'Non spécifié',
    commune: inspection.extra_meta?.commune || 'Non spécifié',
    conformityRate: calculateConformityRate(responses),
    findings: categorizeFindings(responses),
    sections: groupResponsesBySection(responses),
    metadata: inspection.extra_meta || {}
  };
}

// Calculer le taux de conformité
function calculateConformityRate(responses) {
  if (!responses || responses.length === 0) return 0;
  
  const conforming = responses.filter(r => r.conforme === true).length;
  const totalEvaluated = responses.filter(r => r.conforme !== null).length;
  
  return totalEvaluated > 0 ? (conforming / totalEvaluated) : 0;
}

// Catégoriser les findings
function categorizeFindings(responses) {
  const critical = responses.filter(r => r.severity === 'critique' && r.conforme === false);
  const major = responses.filter(r => r.severity === 'majeur' && r.conforme === false);
  const minor = responses.filter(r => r.severity === 'mineur' && r.conforme === false);
  
  return { critical, major, minor };
}

// Grouper les réponses par section
function groupResponsesBySection(responses) {
  // Dans une vraie implémentation, cela grouperait les réponses
  // par section de la grille d'inspection
  return [];
}

// Simuler la génération du PDF
function simulatePDFGeneration(reportData, inspectionId) {
  // Simulation d'un délai de traitement
  setTimeout(() => {
    // Créer un fichier PDF de démonstration
    const pdfContent = generateDemoPDFContent(reportData);
    
    // Créer un blob et un lien de téléchargement
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    // Créer un élément d'ancre pour le téléchargement
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-inspection-${inspectionId}.pdf`;
    document.body.appendChild(a);
    a.click();
    
    // Nettoyer
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Rapport PDF généré avec succès!', 'success');
    }, 100);
    
  }, 2000);
}

// Générer un contenu PDF de démonstration
function generateDemoPDFContent(data) {
  // Cette fonction simulerait le contenu d'un PDF
  // Dans une vraie implémentation, cela serait généré par printpdf en Rust
  
  return `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 595 842]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Length 100
>>
stream
BT
/F1 12 Tf
50 750 Td
(Rapport d'Inspection - ${data.establishment}) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000050 00000 n 
0000000100 00000 n 
0000000200 00000 n 
0000000300 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
400
%%EOF`;
}

// Ajouter un bouton d'export PDF dans l'interface de rapport
export function addPDFExportButton() {
  const reportActions = document.getElementById('rptActions');
  if (!reportActions) return;
  
  // Vérifier si le bouton existe déjà
  if (document.getElementById('pdfExportBtn')) return;
  
  const btn = document.createElement('button');
  btn.id = 'pdfExportBtn';
  btn.className = 'btn-primary';
  btn.textContent = '📄 Export PDF';
  btn.onclick = () => {
    if (state.currentInspectionId) {
      generatePDFReport(state.currentInspectionId);
    } else {
      showToast('Aucune inspection sélectionnée', 'warning');
    }
  };
  
  reportActions.appendChild(btn);
}

// Initialiser le bouton d'export quand le rapport est affiché
window.addEventListener('load', () => {
  // Observer les changements dans l'interface de rapport
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // Vérifier si l'élément de rapport est ajouté
        if (document.getElementById('rptA4')) {
          addPDFExportButton();
        }
      }
    });
  });
  
  // Observer le corps du document
  observer.observe(document.body, { childList: true, subtree: true });
});

// Exposer la fonction globalement
window.generatePDFReport = generatePDFReport;