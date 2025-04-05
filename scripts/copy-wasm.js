// scripts/copy-wasm.js
const fs = require('fs');
const path = require('path');

// Define source and destination directories
const nodeModulesDir = path.resolve(__dirname, '../node_modules');
const publicDir = path.resolve(__dirname, '../public');

// List of languages and their corresponding package/wasm file names
// Adjust this list based on the languages you installed/need
const languages = [
  { pkg: 'tree-sitter-python', wasm: 'tree-sitter-python.wasm' },
  { pkg: 'tree-sitter-javascript', wasm: 'tree-sitter-javascript.wasm' },
  { pkg: 'tree-sitter-typescript', wasm: 'tree-sitter-typescript.wasm', dir: 'typescript' }, // TS often has a sub-dir
  // Add other languages here, e.g.:
  // { pkg: 'tree-sitter-go', wasm: 'tree-sitter-go.wasm' },
  // { pkg: 'tree-sitter-java', wasm: 'tree-sitter-java.wasm' },
];

// Core tree-sitter runtime wasm
const coreWasm = { pkg: 'web-tree-sitter', wasm: 'tree-sitter.wasm' };

console.log(`Copying Tree-sitter WASM files to ${publicDir}...`);

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  console.log(`Creating directory: ${publicDir}`);
  fs.mkdirSync(publicDir, { recursive: true });
}

// Function to find and copy WASM file
const copyWasmFile = (pkgName, wasmName, subDir = '') => {
  const pkgDir = path.join(nodeModulesDir, pkgName);
  // Common locations for the WASM file within the package
  const potentialPaths = [
    path.join(pkgDir, wasmName), // Root of package
    path.join(pkgDir, 'wasm', wasmName), // 'wasm' subfolder
    path.join(pkgDir, 'dist', wasmName), // 'dist' subfolder
    path.join(pkgDir, subDir, wasmName), // Specific subfolder (like 'typescript' for ts)
    path.join(pkgDir, 'tree-sitter-' + subDir + '.wasm'), // Alternate naming
  ];

  let sourcePath = '';
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      sourcePath = p;
      break;
    }
  }

  if (!sourcePath) {
    console.error(`❌ ERROR: Could not find ${wasmName} in package ${pkgName}. Searched:\n - ${potentialPaths.join('\n - ')}`);
    return false; // Indicate failure
  }

  const destPath = path.join(publicDir, wasmName);

  try {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✅ Copied ${wasmName} from ${pkgName}`);
    return true; // Indicate success
  } catch (err) {
    console.error(`❌ ERROR: Could not copy ${wasmName} from ${sourcePath} to ${destPath}:`, err);
    return false; // Indicate failure
  }
};

// Copy core runtime
let success = copyWasmFile(coreWasm.pkg, coreWasm.wasm);

// Copy language grammars
languages.forEach(lang => {
  if (!copyWasmFile(lang.pkg, lang.wasm, lang.dir)) {
    success = false; // Mark overall process as failed if any copy fails
  }
});

if (success) {
  console.log("Finished copying WASM files successfully.");
} else {
  console.error("Finished copying WASM files with errors. Please check logs.");
  process.exit(1); // Exit with error code if any copy failed
}