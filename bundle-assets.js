const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const wwwDir = path.join(rootDir, 'www');

// List of all 15 canonical clinical decision simulators
const simulators = [
  'ABG_Photo_Interpreter_Simulator.html',
  'ACLS_Interactive_Simulator_2025_AHA_v1.html',
  'ARDS_Active_Simulator.html',
  'Acute_Ischemic_Stroke_Simulator_V6_FINAL.html',
  'CNS_Infection_Interactive_Algorithm_v7.html',
  'COPD_Asthma_V11_CASE_DRIVEN_CHECKED.html',
  'COPD_vs_ARDS_Interactive_Atlas_NATIVE.html',
  'Cardiac_Rhythm_Decision_Simulator_V29_FINAL_AUDITED.html',
  'Hypotensive_Patient_Simulation.html',
  'Hypoxic_Patient_Respiratory_Critical_Care_Simulator_v22.html',
  'Intracerebral_Hemorrhage_Interactive_Simulator_v1.html',
  'Shock_Identification_Management_Simulator.html',
  'Status_Epilepticus_Interactive_Simulator_v2_EDITABLE.html',
  'Subarachnoid_Hemorrhage_Interactive_Simulator_v1.html',
  'TBI_Interactive_Simulator_v5_ICP_Anisocoria.html'
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

console.log('--- Packaging Critical Care Suite for Android ---');

// 1. Ensure clean www directory
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

// 2. Copy root app files
const coreFiles = ['index.html', 'manifest.json', 'sw.js', 'hemodynamics.html', 'tbi.html'];
coreFiles.forEach((file) => {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(wwwDir, file));
    console.log(`✓ Copied core: ${file}`);
  }
});

// 3. Copy app/ and admin/ directories
['app', 'admin'].forEach((dir) => {
  const src = path.join(rootDir, dir);
  if (fs.existsSync(src)) {
    copyRecursiveSync(src, path.join(wwwDir, dir));
    console.log(`✓ Copied directory: ${dir}/`);
  }
});

// 4. Copy all 17 canonical simulators
let simCount = 0;
simulators.forEach((sim) => {
  const src = path.join(rootDir, sim);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(wwwDir, sim));
    simCount++;
    console.log(`✓ Copied simulator [${simCount}/17]: ${sim}`);
  } else {
    console.error(`✗ Missing simulator: ${sim}`);
  }
});

console.log(`\nPackaged ${simCount} / ${simulators.length} simulators into ${wwwDir}`);
if (simCount === simulators.length) {
  console.log('SUCCESS: All 17 clinical simulators and assets ready for Android build!');
} else {
  console.warn('WARNING: Some simulators were missing.');
}
