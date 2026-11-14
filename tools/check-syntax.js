import fs from 'fs';
import path from 'path';

async function checkJsCode(code, label) {
  try {
    const dataUri = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
    await import(dataUri);
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`\n❌ SYNTAX ERROR in [${label}]:`, e.message);
      // Print context lines if possible
      const lines = code.split('\n');
      lines.forEach((line, idx) => {
        if (/[\u2018\u2019\u201C\u201D\u00A0\u200B]/.test(line)) {
          console.error(`   ⚠️ Non-ASCII char at line ${idx + 1}:`, line.trim());
        }
      });
    }
  }
}

async function checkFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.js')) {
    await checkJsCode(code, filePath);
  } else if (filePath.endsWith('.html')) {
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let idx = 0;
    while ((match = scriptRegex.exec(code)) !== null) {
      idx++;
      const typeMatch = match[0].match(/type=["']([^"']+)["']/i);
      const isJson = typeMatch && (typeMatch[1] === 'application/json' || typeMatch[1] === 'application/ld+json');
      if (isJson) continue;
      const scriptContent = match[1];
      if (scriptContent.trim().length > 0) {
        await checkJsCode(scriptContent, `${filePath} (script #${idx})`);
      }
    }
  }
}

async function scan(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'public' && f !== 'tools') await scan(full);
    } else if (f.endsWith('.js') || f.endsWith('.html')) {
      await checkFile(full);
    }
  }
}

console.log('Starting syntax scan...');
await scan('.');
console.log('Finished scan.');
