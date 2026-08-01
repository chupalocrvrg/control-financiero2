const fs = require('fs');
let content = fs.readFileSync('src/pages/CheckSearch.tsx', 'utf8');

const badSyntax = `            )}
            </>
          </div>
        )}
      </div>`;

const goodSyntax = `            )}
            </>
            );
          })()}
        </div>
        )}
      </div>`;

content = content.replace(badSyntax, goodSyntax);
fs.writeFileSync('src/pages/CheckSearch.tsx', content);
