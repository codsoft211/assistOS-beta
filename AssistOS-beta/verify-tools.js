// Quick script to verify all 51 tools are registered
const { toolRegistry } = require('./packages/ai/tools/kernel/registry');

// Import all modules to trigger registration
require('./packages/ai/tools/assistme');

console.log('\n========== TOOL REGISTRY VERIFICATION ==========\n');

const allManifests = toolRegistry.getAllManifests();
console.log(`✅ Total tools registered: ${allManifests.length}`);

// Group by category
const byCategory = {};
for (const manifest of allManifests) {
  const cat = manifest.category || 'uncategorized';
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(manifest.name);
}

console.log('\n📊 Tools by category:');
for (const [cat, tools] of Object.entries(byCategory)) {
  console.log(`\n  ${cat} (${tools.length} tools):`);
  tools.forEach(name => console.log(`    - ${name}`));
}

console.log('\n===============================================\n');

if (allManifests.length >= 51) {
  console.log('✅ SUCCESS: All 51+ tools are registered!');
  process.exit(0);
} else {
  console.log(`❌ FAILURE: Expected 51+ tools, got ${allManifests.length}`);
  process.exit(1);
}
