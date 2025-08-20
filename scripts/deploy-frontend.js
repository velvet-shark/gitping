#!/usr/bin/env node

/**
 * Script to prepare frontend for manual deployment to Cloudflare Pages
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Preparing GitPing frontend for Cloudflare Pages deployment...\n');

// Check if the web/out directory exists
const outDir = path.join(__dirname, '../web/out');
if (!fs.existsSync(outDir)) {
  console.error('❌ Build output directory not found: web/out');
  console.log('💡 Run: cd web && npm run build');
  process.exit(1);
}

// Count files in output
const countFiles = (dir) => {
  let count = 0;
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      count += countFiles(filePath);
    } else {
      count++;
    }
  });
  
  return count;
};

const fileCount = countFiles(outDir);
console.log(`✅ Frontend build ready for deployment!`);
console.log(`📁 Output directory: ${outDir}`);
console.log(`📊 Total files: ${fileCount}`);

console.log('\n🚀 Deployment Instructions:');
console.log('1. Go to: https://dash.cloudflare.com/pages');
console.log('2. Click "Create Application" → "Upload assets"');
console.log(`3. Upload all contents from: ${outDir}`);
console.log('4. Set project name: gitping');
console.log('5. Add environment variable:');
console.log('   NEXT_PUBLIC_API_URL = https://gitping-api.vlvt.sh');

console.log('\n📋 Files ready for upload:');
const listFiles = (dir, prefix = '') => {
  const files = fs.readdirSync(dir).slice(0, 10); // Show first 10
  files.forEach((file, index) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    const icon = stat.isDirectory() ? '📁' : '📄';
    console.log(`   ${icon} ${prefix}${file}`);
    
    if (index === 9 && fs.readdirSync(dir).length > 10) {
      console.log(`   ... and ${fs.readdirSync(dir).length - 10} more files`);
    }
  });
};

listFiles(outDir);

console.log('\n✨ Ready for manual deployment to Cloudflare Pages!');