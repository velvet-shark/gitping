#!/usr/bin/env node

/**
 * Setup script to generate wrangler.toml files from templates using environment variables
 * This keeps sensitive IDs out of version control
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found. Please copy .env.example to .env and fill in your values.');
    process.exit(1);
  }

  const envVars = {};
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return envVars;
}

// Replace template variables with environment values
function processTemplate(templatePath, outputPath, envVars) {
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template file not found: ${templatePath}`);
    return false;
  }

  let content = fs.readFileSync(templatePath, 'utf8');
  
  // Replace environment variables
  Object.entries(envVars).forEach(([key, value]) => {
    if (value && value !== `your_${key.toLowerCase()}`) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      content = content.replace(regex, value);
    }
  });

  // For optional variables (prod/staging), use dev values as fallback
  const fallbackMappings = {
    'D1_DATABASE_ID_PROD': envVars.D1_DATABASE_ID,
    'KV_NAMESPACE_ID_PROD': envVars.KV_NAMESPACE_ID,
    'D1_DATABASE_ID_STAGING': envVars.D1_DATABASE_ID,
    'KV_NAMESPACE_ID_STAGING': envVars.KV_NAMESPACE_ID
  };

  Object.entries(fallbackMappings).forEach(([key, fallback]) => {
    if (fallback) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      content = content.replace(regex, fallback);
    }
  });

  // Check for any remaining unreplaced variables
  const unreplacedVars = content.match(/\$\{[^}]+\}/g);
  if (unreplacedVars) {
    console.warn(`⚠️  Unreplaced variables in ${templatePath}:`, unreplacedVars);
    console.warn('   You may want to set these in your .env file for production/staging.');
  }

  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated ${outputPath}`);
  return true;
}

// Main execution
function main() {
  console.log('🔧 Setting up GitPing configuration files...\n');

  const envVars = loadEnv();
  
  // Validate required variables
  const required = ['D1_DATABASE_ID', 'KV_NAMESPACE_ID'];
  const missing = required.filter(key => !envVars[key] || envVars[key] === `your_${key.toLowerCase()}`);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease update your .env file with the actual values.');
    process.exit(1);
  }

  // Process templates
  const templates = [
    ['wrangler-api.template.toml', 'wrangler-api.toml'],
    ['wrangler-poller.template.toml', 'wrangler-poller.toml']
  ];

  let success = true;
  templates.forEach(([template, output]) => {
    if (!processTemplate(template, output, envVars)) {
      success = false;
    }
  });

  if (success) {
    console.log('\n✅ Configuration files generated successfully!');
    console.log('\nNext steps:');
    console.log('1. Set your API secrets: npm run secrets:set');
    console.log('2. Deploy workers: npm run deploy');
  } else {
    console.error('\n❌ Failed to generate some configuration files.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { loadEnv, processTemplate };