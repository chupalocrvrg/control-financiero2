const fs = require('fs');
let content = fs.readFileSync('src/components/inventory/ArticlesTab.tsx', 'utf8');

// Allow empty string for quantities
content = content.replace('minStockAlert: 5,', 'minStockAlert: "5" as string | number,');
content = content.replace('initialQuantity: 0,', 'initialQuantity: "" as string | number,');

content = content.replace(
  'onChange={(e) => setFormData({ ...formData, minStockAlert: Math.max(0, parseInt(e.target.value) || 0) })}',
  'onChange={(e) => setFormData({ ...formData, minStockAlert: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0) })}'
);

content = content.replace(
  'onChange={(e) => setFormData({ ...formData, initialQuantity: Math.max(0, parseInt(e.target.value) || 0) })}',
  'onChange={(e) => setFormData({ ...formData, initialQuantity: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0) })}'
);

// Fix parse in submit
content = content.replace(
  'minStockAlert: formData.minStockAlert,',
  'minStockAlert: parseInt(String(formData.minStockAlert)) || 0,'
);
// wait, we also need to fix initialQuantity in submit
content = content.replace(
  'quantity: formData.initialQuantity',
  'quantity: parseInt(String(formData.initialQuantity)) || 0'
);

// For mobile select issue, add relative z-10 and remove any touch-action restrictions if any (there shouldn't be).
// Let's modify the select's className.
content = content.replace(
  'className="w-full px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all"',
  'className="w-full px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all relative z-10 cursor-pointer appearance-none"'
);

// Wait, appearance-none might remove the dropdown arrow. Let's just do relative z-10 cursor-pointer.
content = content.replace('appearance-none', ''); // if I just added it

// Actually, in tailwind, select needs to be clickable.
// Let's just do:
// className="w-full px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all relative z-10 cursor-pointer"

fs.writeFileSync('src/components/inventory/ArticlesTab.tsx', content);
