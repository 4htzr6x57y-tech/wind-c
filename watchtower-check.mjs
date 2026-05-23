import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(new URL(import.meta.url).pathname);
const workspace = process.platform === 'win32' && root.startsWith('/')
  ? decodeURIComponent(root.slice(1))
  : decodeURIComponent(root);

const checks = [];

function readText(file) {
  return fs.readFileSync(path.join(workspace, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(workspace, file));
}

function addCheck(name, run) {
  checks.push({ name, run });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractScripts(html) {
  return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
}

function parseJson(file) {
  return JSON.parse(readText(file));
}

function parseServiceWorkerAssets(source) {
  const match = source.match(/const\s+APP_ASSETS\s*=\s*(\[[\s\S]*?\]);/);
  assert(match, 'APP_ASSETS array not found');
  return vm.runInNewContext(match[1]);
}

function unique(values) {
  return [...new Set(values)];
}

const htmlFiles = [
  'index.html',
  'winding-calibrator.html',
  'coil-designer.html',
  'coil-calibrator.html',
  'watchtower.html',
  'ect-designer.html',
];

const manifestFiles = [
  'manifest.webmanifest',
  'manifest-wc.webmanifest',
  'manifest-cd.webmanifest',
  'manifest-cc.webmanifest',
  'manifest-ectd.webmanifest',
];

const ccRequiredMarkers = [
  'CONFIG zone',
  'Validation zone',
  'State zone',
  'Storage zone',
  'Transfer zone',
  'Calculation zone',
  'Spec catalog zone',
  'Siege test zone',
  'Render zone',
  'Runtime safety zone',
  'Public UI API zone',
  'Diagnostics zone',
  'Test harness zone',
  'window.CC_TEST_HARNESS',
  'SiegeTests.run',
  'SpecCatalog.run',
  'CONFIG.inputConstraints',
  'CONFIG.persistedInputIds',
];

const ccPublicApi = [
  'init',
  'toggleMeasuredMode',
  'calcMeasured',
  'addTargetZTunerPoint',
  'deleteTargetZTunerPoint',
  'clearTargetZTuner',
  'exportTunerPoints',
  'openTunerImport',
  'importTunerPoints',
  'toggleDiagnostics',
  'refreshDiagnostics',
  'recoverDiagnostics',
];

const mojibakePatterns = [
  /\uFFFD/,
  /繝/,
  /縺/,
  /蜈/,
  /螳/,
  /襍/,
];

addCheck('required files exist', () => {
  [...htmlFiles, ...manifestFiles, 'sw.js'].forEach(file => {
    assert(exists(file), `${file} is missing`);
  });
});

addCheck('html inline scripts compile', () => {
  htmlFiles.forEach(file => {
    extractScripts(readText(file)).forEach((script, index) => {
      try {
        new vm.Script(script, { filename: `${file}#script-${index}` });
      } catch (error) {
        throw new Error(`${file} script ${index}: ${error.message}`);
      }
    });
  });
});

addCheck('manifest files parse as JSON', () => {
  manifestFiles.forEach(file => parseJson(file));
});

addCheck('no suspicious mojibake markers', () => {
  [...htmlFiles, ...manifestFiles, 'sw.js'].forEach(file => {
    const text = readText(file);
    const hit = mojibakePatterns.find(pattern => pattern.test(text));
    assert(!hit, `${file} contains suspicious marker ${hit}`);
  });
});

addCheck('coil-calibrator public API contract is mirrored', () => {
  const source = readText('coil-calibrator.html');
  ccRequiredMarkers.forEach(marker => assert(source.includes(marker), `missing marker: ${marker}`));
  ccPublicApi.forEach(name => {
    assert(source.includes(`'${name}'`), `missing UI_PUBLIC_API entry: ${name}`);
    assert(source.includes(`function ${name}`), `missing implementation: ${name}`);
  });
});

addCheck('coil-calibrator DOM ids are unique', () => {
  const ids = [...readText('coil-calibrator.html').matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = unique(ids.filter((id, index) => ids.indexOf(id) !== index));
  assert(duplicates.length === 0, `duplicate DOM ids: ${duplicates.join(', ')}`);
});

addCheck('watchtower monitors the app suite', () => {
  const source = readText('watchtower.html');
  ['winding-calibrator.html', 'coil-designer.html', 'coil-calibrator.html', 'ect-designer.html'].forEach(file => {
    assert(source.includes(`url: './${file}'`), `watchtower target missing: ${file}`);
  });
  assert(source.includes('COIL TOOLS WATCHTOWER'), 'watchtower title missing');
  assert(source.includes('CC_TEST_HARNESS'), 'test harness hook missing');
  assert(source.includes('WcDiagnostics'), 'WC diagnostics hook missing');
  assert(source.includes('runSmokeChecks'), 'CD diagnostics hook missing');
  assert(source.includes('runBasic'), 'basic fallback missing');
  assert(source.includes('result.siege.results'), 'CC siege output missing');
  assert(source.includes('result.specs.results'), 'CC spec output missing');
});

addCheck('service worker cache assets exist and are unique', () => {
  const assets = parseServiceWorkerAssets(readText('sw.js'));
  assert(Array.isArray(assets), 'APP_ASSETS did not parse to an array');
  const duplicates = unique(assets.filter((asset, index) => assets.indexOf(asset) !== index));
  assert(duplicates.length === 0, `duplicate cache assets: ${duplicates.join(', ')}`);
  assets.forEach(asset => {
    if (asset === './') return;
    assert(exists(asset.replace(/^\.\//, '')), `cached asset missing: ${asset}`);
  });
  ['coil-calibrator.html', 'watchtower.html', 'manifest-cc.webmanifest'].forEach(file => {
    assert(assets.includes(`./${file}`), `critical CC asset not cached: ${file}`);
  });
});

addCheck('CC manifest diagnostics shortcut is wired', () => {
  const manifest = parseJson('manifest-cc.webmanifest');
  assert(manifest.start_url === './coil-calibrator.html', 'CC start_url mismatch');
  assert(Array.isArray(manifest.shortcuts), 'CC shortcuts missing');
  assert(manifest.shortcuts.some(shortcut => shortcut.url === './watchtower.html'), 'diagnostics shortcut missing');
});

addCheck('index links to CC app', () => {
  const source = readText('index.html');
  assert(source.includes('href="./coil-calibrator.html"'), 'index CC link missing');
});

let failed = 0;
const started = Date.now();

for (const check of checks) {
  try {
    check.run();
    console.log(`OK   ${check.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${check.name}`);
    console.error(`     ${error.message}`);
  }
}

const elapsed = Date.now() - started;
if (failed) {
  console.error(`\n${failed}/${checks.length} checks failed in ${elapsed}ms`);
  process.exitCode = 1;
} else {
  console.log(`\n${checks.length}/${checks.length} checks passed in ${elapsed}ms`);
}
