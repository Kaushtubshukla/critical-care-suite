// Critical Care Interactive Hub & Simulators Data Catalog
// Contains 13 clinical simulators categorized across 4 specialties

export const SIMULATOR_CATEGORIES = [
  { id: 'all', name: 'All Tools', icon: 'grid', count: 16 },
  { id: 'respiratory', name: 'Respiratory', icon: 'wind', count: 4 },
  { id: 'neuro', name: 'Neurocritical', icon: 'brain', count: 6 },
  { id: 'cardiac', name: 'Cardiac & Shock', icon: 'activity', count: 5 },
  { id: 'abg', name: 'ABG Diagnostics', icon: 'file-text', count: 1 }
];

export const SIMULATORS = [
  // --- RESPIRATORY CRITICAL CARE ---
  {
    id: 'hypoxic-patient',
    title: 'Hypoxic Patient Simulator',
    subtitle: 'Respiratory Critical Care & ABC Stabilization',
    category: 'respiratory',
    categoryLabel: 'Respiratory Care',
    tier: 'free', // Free Tier
    file: 'Hypoxic_Patient_Respiratory_Critical_Care_Simulator_v22.html',
    badgeText: 'FREE ACCESS',
    badgeColor: 'emerald',
    description: 'Interactive ABC stabilization, ABG and A–a gradient interpretation, Type 1/2/Mixed respiratory failure pathways, HFNC, NIV & intubation.',
    tags: ['Hypoxia', 'A-a Gradient', 'HFNC', 'NIV', 'Ventilator'],
    duration: '8-12 min',
    casesCount: '12 Scenarios',
    colorGradient: 'from-emerald-600 to-teal-800',
    iconBg: '#0f766e',
    highlights: ['Type 1 & 2 Failure Algorithms', 'Dynamic A-a gradient calculator', 'Stepwise escalation protocols']
  },
  {
    id: 'copd-ards-atlas',
    title: 'COPD vs ARDS Interactive Atlas',
    subtitle: 'Pathophysiology & Bedside Differentiation',
    category: 'respiratory',
    categoryLabel: 'Respiratory Care',
    tier: 'free', // Free Tier
    file: 'COPD_vs_ARDS_Interactive_Atlas_NATIVE.html',
    badgeText: 'FREE ACCESS',
    badgeColor: 'emerald',
    description: 'Interactive respiratory critical-care atlas comparing COPD and ARDS pathophysiology, diagnostic criteria, imaging, and management differences.',
    tags: ['Atlas', 'COPD', 'ARDS', 'Pathology', 'Differential'],
    duration: '5-8 min',
    casesCount: 'Visual Compendium',
    colorGradient: 'from-teal-600 to-cyan-800',
    iconBg: '#0d9488',
    highlights: ['Side-by-side compliance curves', 'Imaging comparative gallery', 'Bedside distinction matrix']
  },
  {
    id: 'ards-active',
    title: 'ARDS Active Ventilator Simulator',
    subtitle: 'Closed-Loop Physiology & Protective Ventilation',
    category: 'respiratory',
    categoryLabel: 'Respiratory Care',
    tier: 'pro', // Pro Tier
    file: 'ARDS_Active_Simulator.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Closed-loop ARDS mechanical ventilation with live telemetry, P/F ratio, driving pressure calculation, prone positioning, recruitment maneuvers & debrief.',
    tags: ['ARDS', 'Low Tidal Volume', 'PEEP Titration', 'Prone', 'Driving Pressure'],
    duration: '10-15 min',
    casesCount: '4 Clinical Cases',
    colorGradient: 'from-blue-600 to-indigo-900',
    iconBg: '#1d4ed8',
    highlights: ['Live dynamic P/F curve', 'Driving pressure feedback penalty', 'Recruitment maneuvers with hemodynamics']
  },
  {
    id: 'copd-asthma',
    title: 'COPD & Asthma Active Simulator',
    subtitle: 'Obstructive Crisis & Mechanical Ventilation',
    category: 'respiratory',
    categoryLabel: 'Respiratory Care',
    tier: 'pro', // Pro Tier
    file: 'COPD_Asthma_V11_CASE_DRIVEN_CHECKED.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Interactive COPD exacerbation and status asthmaticus management with live ventilator graphics, auto-PEEP tracking, bronchodilator dosing & ICU escalation.',
    tags: ['COPD', 'Asthma', 'Auto-PEEP', 'Bronchospasm', 'NIV Failure'],
    duration: '8-12 min',
    casesCount: '6 Case Profiles',
    colorGradient: 'from-cyan-600 to-blue-900',
    iconBg: '#0284c7',
    highlights: ['Auto-PEEP & I:E ratio optimization', 'Permissive hypercapnia calculator', 'Magnesium & Heliox decision tree']
  },

  // --- NEUROCRITICAL CARE ---
  {
    id: 'stroke-simulator',
    title: 'Acute Ischemic Stroke Simulator',
    subtitle: 'NIHSS, IV Thrombolysis & Endovascular Thrombectomy',
    category: 'neuro',
    categoryLabel: 'Neurocritical Care',
    tier: 'pro', // Pro Tier
    file: 'Acute_Ischemic_Stroke_Simulator_V6_FINAL.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Comprehensive acute stroke assessment with live NIHSS scoring, automated CT/CTA review, IV thrombolysis contraindication checker, and EVT referral pathway.',
    tags: ['AIS', 'NIHSS', 'tPA / TNK', 'EVT', 'Time Windows'],
    duration: '10-15 min',
    casesCount: '8 Complex Scenarios',
    colorGradient: 'from-purple-600 to-indigo-950',
    iconBg: '#7c3aed',
    highlights: ['Interactive NIHSS calculator', 'Door-to-needle countdown tracker', 'CTA / CTP mismatch analysis']
  },
  {
    id: 'tbi-simulator',
    title: 'Traumatic Brain Injury (TBI) Simulator',
    subtitle: 'BTF Guidelines, ICP & Tiered Osmotherapy',
    category: 'neuro',
    categoryLabel: 'Neurocritical Care',
    tier: 'pro', // Pro Tier
    file: 'TBI_Interactive_Simulator_v5_ICP_Anisocoria.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'TBI resuscitation following Brain Trauma Foundation (BTF) guidelines: GCS calculation, pupillary exam, CT Marshall classification, ICP tier 1-3 therapies & surgical decompression.',
    tags: ['TBI', 'GCS', 'ICP Monitoring', 'Mannitol / HTS', 'Craniectomy'],
    duration: '12-18 min',
    casesCount: 'Interactive Workflow',
    colorGradient: 'from-violet-600 to-purple-900',
    iconBg: '#6d28d9',
    highlights: ['Anisocoria and uncal herniation alerts', 'CPP-guided hemodynamic targets', 'Tier 1/2/3 ICP escalation protocol']
  },
  {
    id: 'ich-simulator',
    title: 'Intracerebral Hemorrhage (ICH) Simulator',
    subtitle: 'ICH Score, Anticoagulant Reversal & BP Control',
    category: 'neuro',
    categoryLabel: 'Neurocritical Care',
    tier: 'pro', // Pro Tier
    file: 'Intracerebral_Hemorrhage_Interactive_Simulator_v1.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Clinical ICH management with automatic ICH score calculation, 30-day mortality prediction, targeted IV BP reduction, DOAC/Warfarin reversal protocols & surgical triage.',
    tags: ['ICH', 'ICH Score', 'PCC / Idarucizumab', 'BP Targets', 'EVD'],
    duration: '8-10 min',
    casesCount: 'Guided Simulation',
    colorGradient: 'from-fuchsia-600 to-rose-950',
    iconBg: '#c026d3',
    highlights: ['DOAC reversal dosage calculations', 'Interactive ICH score calculator', 'Hematoma expansion risk scoring']
  },
  {
    id: 'sah-simulator',
    title: 'Subarachnoid Hemorrhage (SAH) Simulator',
    subtitle: 'Hunt & Hess, Fisher Scale, Aneurysm Coiling & Vasospasm',
    category: 'neuro',
    categoryLabel: 'Neurocritical Care',
    tier: 'pro', // Pro Tier
    file: 'Subarachnoid_Hemorrhage_Interactive_Simulator_v1.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Aneurysmal SAH pathway: Hunt & Hess / modified Fisher grading, nimodipine neuroprotection, endovascular coiling vs clipping, delayed cerebral ischemia (DCI) management.',
    tags: ['aSAH', 'Hunt & Hess', 'Fisher', 'Vasospasm', 'Nimodipine'],
    duration: '8-12 min',
    casesCount: 'Clinical Pathway',
    colorGradient: 'from-rose-600 to-red-950',
    iconBg: '#e11d48',
    highlights: ['Vasospasm / DCI surveillance matrix', 'Aneurysm securing decision engine', 'EVD troubleshooting flow']
  },
  {
    id: 'status-epilepticus',
    title: 'Status Epilepticus Interactive Simulator',
    subtitle: 'Timed Seizure Escalation & Refractory Protocol',
    category: 'neuro',
    categoryLabel: 'Neurocritical Care',
    tier: 'pro', // Pro Tier
    file: 'Status_Epilepticus_Interactive_Simulator_v2_EDITABLE.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Timed status epilepticus resuscitation: 0-5m emergent benzodiazepine dosing (weight-adjusted), 5-20m IV AED load (Levetiracetam/Fosphenytoin/Valproate), 20-40m refractory anesthetic infusion.',
    tags: ['Seizures', 'Lorazepam / Midazolam', 'Keppra', 'Refractory SE', 'cEEG'],
    duration: '10-12 min',
    casesCount: 'Stepwise Timer',
    colorGradient: 'from-indigo-600 to-slate-900',
    iconBg: '#4f46e5',
    highlights: ['Real-time 0-60m intervention timer', 'Weight-based drug dosing engine', 'Anesthetic burst-suppression titration']
  },
  {
    id: 'cns-infection',
    title: 'CNS Infection Interactive Algorithm',
    subtitle: 'Meningitis, Encephalitis & Abscess ICU Pathways',
    category: 'neuro',
    categoryLabel: 'Neurocritical Care',
    tier: 'pro', // Pro Tier
    file: 'CNS_Infection_Interactive_Algorithm_v7.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Diagnostic algorithm for acute bacterial meningitis, viral encephalitis, brain abscess, cryptococcal meningitis with LP safety checklist, empiric antimicrobials & ICP management.',
    tags: ['Meningitis', 'LP Decision', 'Empiric Antibiotics', 'Dexamethasone', 'HSV'],
    duration: '10-14 min',
    casesCount: 'Multidisciplinary',
    colorGradient: 'from-sky-600 to-slate-900',
    iconBg: '#0369a1',
    highlights: ['Head CT before LP decision rule', 'Age-stratified antimicrobial selector', 'Steroids timing confirmation']
  },

  // --- ABG DIAGNOSTICS ---
  {
    id: 'abg-interpreter',
    title: 'ABG Photo Interpreter with OCR',
    subtitle: 'Camera OCR & 6-Step Comprehensive Analysis',
    category: 'abg',
    categoryLabel: 'ABG Diagnostics',
    tier: 'pro', // Pro Tier
    file: 'ABG_Photo_Interpreter_Simulator.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Snap an ABG report with your device camera for instant OCR value extraction. 6-step interpretation: pH, primary disorder, Winters formula compensation, mixed disorders, A-a gradient & Anion Gap.',
    tags: ['ABG', 'Camera OCR', 'Winters Formula', 'Delta-Delta', 'Anion Gap'],
    duration: '3-6 min',
    casesCount: 'Live Scanner + Presets',
    colorGradient: 'from-amber-600 to-orange-950',
    iconBg: '#d97706',
    highlights: ['Mobile camera image OCR scanner', 'Delta-delta mixed disorder analysis', 'One-tap PDF/Text clinical summary export']
  },

  // --- CARDIAC CRITICAL CARE ---
  {
    id: 'cardiac-rhythm',
    title: 'Cardiac Rhythm Decision Simulator',
    subtitle: 'Live Telemetry, ACLS Pathways & Audio Alarms',
    category: 'cardiac',
    categoryLabel: 'Cardiac Critical Care',
    tier: 'pro', // Pro Tier
    file: 'Cardiac_Rhythm_Decision_Simulator_V29_FINAL_AUDITED.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Real-time moving ECG rhythm strip simulation with synthesized cardiac monitor tones, synchronized cardioversion, defibrillation, pacing, ROSC, and interactive 5 Hs & 5 Ts differential.',
    tags: ['ECG', 'ACLS', 'Defibrillation', 'Pacing', '5Hs & 5Ts'],
    duration: '10-15 min',
    casesCount: '15 Rhythms & Cases',
    colorGradient: 'from-red-600 to-rose-950',
    iconBg: '#dc2626',
    highlights: ['Interactive moving canvas ECG strip', 'Web Audio synthesized telemetry sounds', 'Real-time ACLS 2025 decision branches']
  },
  {
    id: 'shock-simulator',
    title: 'Shock Identification & Management Simulator',
    subtitle: 'Hemodynamic Profiles, Echo & Inotrope Titration',
    category: 'cardiac',
    categoryLabel: 'Cardiac Critical Care',
    tier: 'pro', // Pro Tier
    file: 'Shock_Identification_Management_Simulator.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Six-step interactive shock simulator: MAP/CO/CI/SVRI calculation, dynamic bedside echocardiography, phenotype categorization (Septic, Cardiogenic, Hypovolemic, Obstructive) & vasopressor titration.',
    tags: ['Shock', 'Hemodynamics', 'SVR / CO', 'Echocardiogram', 'Norepinephrine'],
    duration: '12-16 min',
    casesCount: 'Multi-organ System',
    colorGradient: 'from-rose-700 to-slate-950',
    iconBg: '#b91c1c',
    highlights: ['Automated hemodynamic indices calculator', 'Interactive point-of-care echo simulator', 'Targeted inotrope & vasopressor algorithm']
  },
  {
    id: 'acls-2025-aha',
    title: 'ACLS 2025 AHA Interactive Algorithm',
    subtitle: 'Shockable vs Non-Shockable CPR Decision Loops',
    category: 'cardiac',
    categoryLabel: 'Cardiac Critical Care',
    tier: 'pro',
    file: 'ACLS_Interactive_Simulator_2025_AHA_v1.html',
    badgeText: 'PRO LOCKED',
    badgeColor: 'amber',
    description: 'Updated 2025/2026 American Heart Association resuscitation guidelines with 2-minute cycle timer, epinephrine/amiodarone dosing, ROSC assessment & 5 Hs & 5 Ts.',
    tags: ['ACLS 2025', 'AHA', 'CPR Loop', 'VF/pVT', 'Asystole/PEA'],
    duration: '8-12 min',
    casesCount: 'Timed Resuscitation',
    colorGradient: 'from-amber-600 to-red-950',
    iconBg: '#b91c1c',
    highlights: ['2-minute cycle shock countdown', 'Amiodarone & Lidocaine dosage calculator', 'Interactive 5 Hs & 5 Ts differential']
  },
  {
    id: 'hypotensive-patient',
    title: 'Hypotensive Patient Resuscitation Engine',
    subtitle: 'Undifferentiated Shock & Fluid Responsiveness',
    category: 'cardiac',
    categoryLabel: 'Cardiac Critical Care',
    tier: 'free',
    file: 'Hypotensive_Patient_Simulation.html',
    badgeText: 'FREE ACCESS',
    badgeColor: 'emerald',
    description: 'Stepwise resuscitation algorithm for acute undifferentiated hypotension: PLR test, bedside IVC ultrasound, fluid challenge, and inotrope selection.',
    tags: ['Hypotension', 'Sepsis', 'PLR Test', 'IVC Ultrasound', 'Norepinephrine'],
    duration: '6-10 min',
    casesCount: 'Bedside Protocol',
    colorGradient: 'from-emerald-600 to-teal-800',
    iconBg: '#059669',
    highlights: ['Passive leg raise dynamic response', 'Targeted MAP titration', 'Cardiogenic vs distributive differential']
  },
  {
    id: 'hemodynamics-suite',
    title: 'Bedside Hemodynamics & Perfusion Suite',
    subtitle: 'CO, CI, SVRI, DO2 & Oxygen Delivery Matrix',
    category: 'cardiac',
    categoryLabel: 'Cardiac Critical Care',
    tier: 'free',
    file: 'hemodynamics.html',
    badgeText: 'FREE ACCESS',
    badgeColor: 'emerald',
    description: 'Comprehensive hemodynamic calculator: Cardiac Output, Cardiac Index, Systemic Vascular Resistance, DO2/VO2 oxygen delivery ratios and dynamic Frank-Starling curve simulator.',
    tags: ['Hemodynamics', 'Cardiac Output', 'SVR', 'DO2 / VO2', 'Frank-Starling'],
    duration: '5-8 min',
    casesCount: 'Bedside Calculations',
    colorGradient: 'from-cyan-600 to-blue-900',
    iconBg: '#0284c7',
    highlights: ['Automated BSA and indexed parameters', 'Dynamic Frank-Starling curve visualization', 'Vasoactive drug titration guide']
  }
];

export const PRO_FEATURES = [
  {
    icon: 'zap',
    title: 'All 17 Clinical Simulators',
    desc: 'Unrestricted full access to all neurocritical, respiratory, ABG, and cardiac emergency models.'
  },
  {
    icon: 'camera',
    title: 'ABG Camera OCR Scanner',
    desc: 'Instantly photograph printed blood gas reports for instant 6-step interpretation & compensation.'
  },
  {
    icon: 'activity',
    title: 'Live Telemetry & Sound Synthesis',
    desc: 'Real-time moving ECG waveforms, synchronized cardioversion, and physiological ventilator feedback.'
  },
  {
    icon: 'wifi-off',
    title: '100% Offline ICU Readiness',
    desc: 'Runs completely standalone without requiring cellular or hospital Wi-Fi connection.'
  },
  {
    icon: 'book-open',
    title: 'Evidence-Based 2025/2026 Guidelines',
    desc: 'Continuously updated with latest ARDS, BTF, AHA/ACC, and SSC clinical guidelines.'
  },
  {
    icon: 'share-2',
    title: 'Clinical Case Export & Debrief',
    desc: 'Save and export detailed debrief scores, clinical decisions, and trainee logs in PDF or text.'
  }
];
