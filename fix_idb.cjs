const fs = require('fs');
let content = fs.readFileSync('src/components/inventory/InventoryDashboard.tsx', 'utf8');

// The file ends with:
//            )}
//           </div>
//       </div>
//     </div>
//   );
// }

// Let's just fix the end of the file.
const endOfFileMatch = /          <\/div>\s*<\/div>\s*<\/div>\s*\);\s*\}\s*$/;
if (endOfFileMatch.test(content)) {
  content = content.replace(endOfFileMatch, `          </div>\n        </div>\n      </div>\n    </div>\n  );\n}\n`);
} else {
  // Let's just blindly append `</div></div>` before `);\n}`
  content = content.replace(/(\s*)\);\s*\}\s*$/, `$1    </div>\n      </div>\n    </div>\n  );\n}\n`);
}

fs.writeFileSync('src/components/inventory/InventoryDashboard.tsx', content);
