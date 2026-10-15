import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const rootDir = process.cwd();

console.log('📦 [1/3] Compiling AegisCore Root & CLI...');
execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });

console.log('📦 [2/3] Compiling @aegiscore-ai/sdk...');
execSync('npx tsc -p sdk/tsconfig.json', { stdio: 'inherit' });

console.log('📦 [3/3] Assembling @aegiscore-ai/core distribution bundle...');
const coreDistDir = resolve(rootDir, 'core', 'dist');
if (existsSync(coreDistDir)) {
  rmSync(coreDistDir, { recursive: true, force: true });
}
mkdirSync(coreDistDir, { recursive: true });

// Copy compiled src and core/src into core/dist
cpSync(resolve(rootDir, 'dist', 'src'), join(coreDistDir, 'src'), { recursive: true });
cpSync(resolve(rootDir, 'dist', 'core', 'src'), join(coreDistDir, 'core', 'src'), { recursive: true });

// Copy policies into core/policies and core/dist/policies
const corePoliciesDir = resolve(rootDir, 'core', 'policies');
if (existsSync(corePoliciesDir)) {
  rmSync(corePoliciesDir, { recursive: true, force: true });
}
cpSync(resolve(rootDir, 'policies'), corePoliciesDir, { recursive: true });
cpSync(resolve(rootDir, 'policies'), join(coreDistDir, 'policies'), { recursive: true });

// Write entrypoints for @aegiscore-ai/core
writeFileSync(join(coreDistDir, 'index.js'), "export * from './core/src/index.js';\n");
writeFileSync(join(coreDistDir, 'index.d.ts'), "/// <reference types=\"node\" />\nexport * from './core/src/index.js';\n");

console.log('✅ Build completed successfully for all packages:');
console.log('   - Root / CLI:        ./dist');
console.log('   - @aegiscore-ai/core: ./core/dist');
console.log('   - @aegiscore-ai/sdk:  ./sdk/dist');
