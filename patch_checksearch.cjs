const fs = require('fs');
let content = fs.readFileSync('src/pages/CheckSearch.tsx', 'utf8');

// Add states
content = content.replace(
  'const [trashLoading, setTrashLoading] = useState(false);',
  'const [trashLoading, setTrashLoading] = useState(false);\n  const [currentPage, setCurrentPage] = useState(1);\n  const ITEMS_PER_PAGE = 10;'
);

// Reset page on filter change
content = content.replace(
  'setFilters(newFilters);',
  'setFilters(newFilters);\n    setCurrentPage(1);'
);

// Replace filteredData.invoices.map with paginated version
const paginationLogic = `            {(() => {
              const totalPages = Math.ceil(filteredData.invoices.length / ITEMS_PER_PAGE);
              const paginatedInvoices = filteredData.invoices.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
              
              return (
                <>
                  {paginatedInvoices.map(invoice => {`;

content = content.replace('{filteredData.invoices.map(invoice => {', paginationLogic);

// Add the pagination controls after the invoices list
const paginationControls = `                  })}
                  
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
                      <p className="text-sm text-neutral-500">
                        Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.invoices.length)} de {filteredData.invoices.length} registros
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl disabled:opacity-50 hover:bg-neutral-50"
                        >
                          Anterior
                        </button>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl disabled:opacity-50 hover:bg-neutral-50"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}`;

content = content.replace('            })}          </div>', paginationControls + '\n          </div>');

fs.writeFileSync('src/pages/CheckSearch.tsx', content);
