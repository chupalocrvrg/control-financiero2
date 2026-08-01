export interface Article {
  id: string;
  name: string;
  quantity: number; // Total quantity across all warehouses
  requiresSeries?: boolean; // Whether this article requires serial numbers
  seriesList?: string[]; // Array of available serial numbers globally
  minStockAlert: number; // Required minimum stock for alert
  category?: string; // Predictive category (cocinas, neveras, etc.)
  brand?: string; // Predictive brand
  model?: string; // Predictive model
  barcode?: string; // Optional barcode
  userId: string; // Owner enterprise ID
  createdAt: any;
}

export interface Warehouse {
  id: string;
  name: string;
  assignedPerson: string; // Name of person assigned
  userId: string; // Owner enterprise ID
  createdAt: any;
}

export interface WarehouseInventory {
  id: string; // e.g., `${warehouseId}_${articleId}`
  warehouseId: string;
  articleId: string;
  quantity: number;
  seriesList?: string[]; // Array of serial numbers available in this warehouse
  userId: string;
}

export interface TransferArticle {
  articleId: string;
  name: string;
  quantity: number;
  seriesList?: string[];
}

export interface Transfer {
  id: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  articles: TransferArticle[];
  reason: string; // 'PRÉSTAMO' | 'DEVOLUCIÓN' | 'TRASLADO' | 'OTRO'
  comment: string;
  timestamp: any;
  userId: string;
}

export interface LoanReturnArticle {
  articleId: string;
  name: string;
  quantity: number;
  seriesList?: string[];
}

export interface LoanReturn {
  id: string;
  type: 'LOAN' | 'RETURN';
  commercialHouse: string; // Searchable/predictive
  warehouseId: string; // Selected warehouse (empty for direct sale if LOAN)
  warehouseName: string;
  isDirectSale?: boolean; // Only for LOAN
  articles: LoanReturnArticle[];
  comment: string;
  personName: string; // Person who delivers/receives
  timestamp: any;
  userId: string;
}

export interface SoldArticle {
  articleId: string;
  name: string;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  isGift: boolean;
  seriesList?: string[];
}

export interface InventorySale {
  id: string;
  clientName: string;
  sellerId: string; // Registered employee ID
  sellerName: string;
  soldArticles: SoldArticle[];
  timestamp: any;
  userId: string;
}
