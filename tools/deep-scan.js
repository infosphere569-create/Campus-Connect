import fs from 'fs';
import path from 'path';

let acorn;
try {
  acorn = await import('acorn');
} catch (e) {}

async function checkJsContent(code, filename, offsetLine = 0) {
  let hasError = false;
  
  const lines = code.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1 + offsetLine;
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      const codePoint = char.charCodeAt(0);
      if ([8216, 8217, 8220, 8221, 160, 8203].includes(codePoint)) {
        console.error(`❌ INVALID TOKEN / SMART CHAR in ${filename}:${lineNum}:${col + 1} -> '${char}' (code ${codePoint})`);
        console.error(`   Line content: ${line}`);
        hasError = true;
      }
    }
  });

  if (acorn) {
    try {
      acorn.parse(code, { sourceType: 'module', ecmaVersion: 'latest', locations: true });
    } catch (err) {
      try {
        acorn.parse(code, { sourceType: 'script', ecmaVersion: 'latest', locations: true });
      } catch (errScript) {
        console.error(`❌ ACORN PARSE ERROR in ${filename}:${(err.loc?.line || 1) + offsetLine}:${err.loc?.column || 0}`);
        console.error(`   Module mode error: ${err.message}`);
        console.error(`   Script mode error: ${errScript.message}`);
        hasError = true;
      }
    }
  }

  return hasError;
}

async function scanDirectory(dir) {
  let totalErrors = 0;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'public', 'tools', 'dist'].includes(file)) {
        totalErrors += await scanDirectory(fullPath);
      }
    } else if (file.endsWith('.js')) {
      const code = fs.readFileSync(fullPath, 'utf8');
      const err = await checkJsContent(code, fullPath);
      if (err) totalErrors++;
    } else if (file.endsWith('.html')) {
      const code = fs.readFileSync(fullPath, 'utf8');
      const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      let scriptIdx = 0;
      while ((match = scriptRegex.exec(code)) !== null) {
        scriptIdx++;
        const tag = match[0];
        const scriptContent = match[1];
        if (/type=["']application\/(ld\+json|json)["']/i.test(tag)) {
          try {
            JSON.parse(scriptContent);
          } catch (e) {
            console.error(`❌ INVALID JSON in ${fullPath} script #${scriptIdx}: ${e.message}`);
            totalErrors++;
          }
          continue;
        }
        if (scriptContent.trim().length > 0) {
          const beforeScript = code.substring(0, match.index);
          const startLine = beforeScript.split('\n').length - 1;
          const err = await checkJsContent(scriptContent, `${fullPath} (script #${scriptIdx})`, startLine);
          if (err) totalErrors++;
        }
      }
    }
  }
  return totalErrors;
}

console.log('=== STARTING DEEP SCAN ON ALL HTML AND JS FILES ===');
const errorCount = await scanDirectory('.');
console.log(`=== DEEP SCAN COMPLETE: Total issues = ${errorCount} ===`);
if (errorCount > 0) {
  process.exit(1);
}
