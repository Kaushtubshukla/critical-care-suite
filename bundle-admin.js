const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const adminDistDir = path.join(rootDir, 'public_admin');

// List of all 15 canonical clinical decision simulators + 2 extra
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
  'TBI_Interactive_Simulator_v5_ICP_Anisocoria.html',
  'hemodynamics.html',
  'tbi.html'
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

console.log('--- Packaging Owner Admin Portal ONLY for Firebase Hosting ---');

// 1. Clean public_admin folder
if (fs.existsSync(adminDistDir)) {
  fs.rmSync(adminDistDir, { recursive: true, force: true });
}
fs.mkdirSync(adminDistDir, { recursive: true });

// 2. Create root index.html that immediately loads the Admin Portal
const rootRedirectHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=/admin/index.html">
  <title>Redirecting to Owner Admin Portal...</title>
  <script>window.location.replace('/admin/index.html');</script>
</head>
<body style="background: #0b131e; color: #94a3b8; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <p>Loading Owner Admin Portal...</p>
</body>
</html>`;
fs.writeFileSync(path.join(adminDistDir, 'index.html'), rootRedirectHtml, 'utf8');
console.log('✓ Created root index.html (Direct redirect to /admin/index.html)');

// 3. Copy admin/ and app/ directories
['admin', 'app'].forEach((dir) => {
  const src = path.join(rootDir, dir);
  if (fs.existsSync(src)) {
    copyRecursiveSync(src, path.join(adminDistDir, dir));
    console.log(`✓ Copied directory: ${dir}/`);
  }
});

// 4. Copy simulators for Admin Preview/Testing iframe
let simCount = 0;
simulators.forEach((sim) => {
  const src = path.join(rootDir, sim);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(adminDistDir, sim));
    simCount++;
  }
});
console.log(`✓ Copied ${simCount} simulators for Admin Preview testing`);

console.log(`\nSUCCESS: public_admin folder ready! Only the Admin Portal is packaged.`);
