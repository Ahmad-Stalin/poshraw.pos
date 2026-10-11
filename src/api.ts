import type { AppRole, UserAccount } from './authTypes'
import type { Product, StockAdjustment } from './inventoryTypes'

export type InventoryData = {
  products: Product[]
  categories: string[]
  adjustments: StockAdjustment[]
  colors: Array<{ id: string; name: string; hex: string; createdAt: string }>
  sizes: Array<{ id: string; name: string; sortOrder: number; createdAt: string }>
  variants: Array<{
    id: string
    productId: string
    colorId: string | null
    colorName: string | null
    colorHex: string | null
    sizeId: string | null
    sizeName: string | null
    sku: string
    quantity: number
    priceAdjustment: number
    createdAt: string
  }>
  sizeGuides: Array<{ id: string; category: string; label: string; measurements: string; createdAt: string }>
}

export type SaleProduct = Pick<Product, 'id' | 'name' | 'barcode' | 'salePrice' | 'quantity' | 'unit'>
export type CurrencyCode = 'IQD' | 'USD' | 'EUR' | 'GBP'

export type SalesReport = {
  days: number
  startDate: string
  summary: {
    revenue: number
    profit: number
    revenue_domestic: number
    revenue_export: number
    profit_domestic: number
    profit_export: number
    taxCollected: number
    salesCount: number
    unitsSold: number
  }
  salesTimeline: Array<{
    date: string
    revenue: number
    profit: number
    revenue_domestic: number
    revenue_export: number
    profit_domestic: number
    profit_export: number
    salesCount: number
  }>
  lowStock: Array<Pick<Product, 'id' | 'name' | 'barcode' | 'quantity' | 'minimumStock' | 'unit'>>
  stockMovements: StockAdjustment[]
  priceChanges: Array<{
    id: string
    productId: string | null
    productName: string
    oldPurchasePrice: number
    newPurchasePrice: number
    oldSalePrice: number
    newSalePrice: number
    createdAt: string
  }>
  recentSales: Array<{ id: string; receiptNumber: string; totalAmount: number; createdAt: string; sellerName: string }>
}

export type TaxSettings = { taxRateBps: number; taxName: string; updatedAt: string }
export type CashSnapshot = {
  openingBalance: number
  expectedBalance: number
  ledgerThroughId: number
  lastReconciledAt: string | null
  lastCountedBalance: number | null
}
export type AccountingData = {
  days: number
  startDate: string
  taxSettings: TaxSettings
  summary: { revenue: number; taxCollected: number; costOfGoods: number; grossProfit: number; salesCount: number; expenses: number; netProfit: number }
  taxSummary: { collectedAllTime: number; remittedAllTime: number; remittedInPeriod: number; payable: number }
  cash: CashSnapshot
  currencyBreakdown: Array<{ currencyCode: CurrencyCode; salesCount: number; revenue: number; taxCollected: number; costOfGoods: number; grossProfit: number }>
  cogsByCategory: Array<{ category: string; cogs: number }>
  expenses: Array<{ id: string; title: string; category: string; amount: number; paymentMethod: 'cash' | 'electronic'; note: string; createdAt: string; enteredBy: string }>
  cashMovements: Array<{ id: number; kind: 'sale' | 'expense' | 'adjustment'; amount: number; saleId: string | null; expenseId: string | null; note: string; createdAt: string }>
  reconciliations: Array<{ id: string; openingBalance: number; expectedBalance: number; countedBalance: number; variance: number; note: string; createdAt: string }>
  taxPayments: Array<{ id: string; amount: number; paymentMethod: 'cash' | 'electronic'; note: string; createdAt: string }>
}

export type RecordedSale = {
  id: string
  receiptNumber: string
  totalAmount: number
  subtotalAmount: number
  taxRateBps: number
  taxName: string
  taxAmount: number
  totalCost: number
  profit: number
  paymentMethod: 'cash' | 'electronic' | 'credit'
  customerId: string | null
  customerName?: string | null
  isExport: boolean
  currencyCode: CurrencyCode
  exchangeRate: number
  shippingCost: number
  customsCharges: number
  destinationCountry: string | null
  amountPaid: number
  amountDue: number
  isCredit: boolean
  earnedPoints: number
  returnedAmount?: number
  returnedSubtotal?: number
  returnedTax?: number
  createdAt: string
  sellerName?: string
  items: Array<{ id: string; productId: string; productName: string; quantity: number; salePrice: number; purchasePrice: number }>
}

export type InvoiceSummary = {
  id: string
  receiptNumber: string
  totalAmount: number
  subtotalAmount: number
  taxAmount: number
  paymentMethod: 'cash' | 'electronic' | 'credit'
  customerName: string | null
  isExport: boolean
  currencyCode: CurrencyCode
  exchangeRate: number
  shippingCost: number
  customsCharges: number
  destinationCountry: string | null
  createdAt: string
  sellerName: string
}

export type BootstrapData = {
  setupRequired: boolean
  user: UserAccount | null
}

export type NewAccount = {
  name: string
  username: string
  role: AppRole
  password: string
  email?: string
}

export type BackupInfo = {
  filename: string
  sizeBytes: number
  createdAt: string
  kind: 'manual' | 'auto' | 'pre-restore'
}

export type Supplier = { id: string; name: string; phone: string; notes: string; createdAt: string; balance: number }
export type PurchaseProduct = Pick<Product, 'id' | 'name' | 'barcode' | 'quantity' | 'purchasePrice' | 'unit'>
export type PurchaseItem = { id: string; purchaseId: string; productId: string; productName: string; quantity: number; unitCost: number }
export type PurchaseOrder = {
  id: string
  orderNumber: string
  supplierId: string
  supplierName: string
  status: 'ordered' | 'received' | 'cancelled'
  subtotalAmount: number
  paidAmount: number
  notes: string
  createdAt: string
  receivedAt: string | null
  createdBy: string
  items: PurchaseItem[]
}
export type PurchasingData = { suppliers: Supplier[]; orders: PurchaseOrder[]; products: PurchaseProduct[] }
export type PurchaseReceipt = { id: string; orderNumber: string; supplierId: string; status: 'ordered' | 'received'; subtotalAmount: number; paidAmount?: number; createdAt?: string; receivedAt?: string }
export type SupplierPaymentReceipt = { id: string; supplierId: string; amount: number; paymentMethod: 'cash' | 'electronic'; note: string; createdAt: string; balance: number }
export type Customer = {
  id: string
  name: string
  phone: string
  notes: string
  createdAt: string
  balance: number
  points: number
  salesCount: number
  purchaseHistory: Array<{ id: string; receiptNumber: string; subtotalAmount: number; taxAmount: number; totalAmount: number; amountPaid: number; isCredit: number; createdAt: string }>
  loyaltyHistory: Array<{ id: string; points: number; source: string; note: string; createdAt: string }>
  payments: Array<{ id: string; amount: number; paymentMethod: 'cash' | 'electronic'; note: string; createdAt: string }>
}
export type CustomersData = { customers: Customer[]; loyaltySettings: { amountPerPoint: number } }
export type PriceLookupResult = { id: string; name: string; category: string; barcode: string; salePrice: number; purchasePrice: number; quantity: number; minimumStock: number; unit: string; updatedAt: string }

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    })
  } catch {
    throw new ApiError('پەیوەندی بە ڕاژەرەوە نەکرا. دڵنیابە ڕاژەرەکە کار دەکات.', 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(body?.error ?? 'داواکارییەکە سەرکەوتوو نەبوو.', response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

export const api = {
  bootstrap: () => request<BootstrapData>('/api/bootstrap'),
  setup: (values: { name: string; username: string; password: string; email?: string }) => request<{ user: UserAccount }>('/api/auth/setup', json('POST', values)),
  login: (values: { username: string; password: string }) => request<{ user: UserAccount }>('/api/auth/login', json('POST', values)),
  logout: () => request<void>('/api/auth/logout', json('POST')),
  inventory: () => request<InventoryData>('/api/inventory'),
  reports: (days: number) => request<SalesReport>(`/api/reports?days=${days}`),
  saleProducts: () => request<SaleProduct[]>('/api/sales/products'),
  salesConfig: () => request<{ taxRateBps: number; taxName: string }>('/api/sales/config'),
  sales: () => request<InvoiceSummary[]>('/api/sales'),
  invoice: (saleId: string) => request<RecordedSale>(`/api/sales/${encodeURIComponent(saleId)}`),
  recordSale: (items: Array<{ productId: string; quantity: number }>, paymentMethod: 'cash' | 'electronic' | 'credit', customerId?: string) => request<RecordedSale>('/api/sales', json('POST', { items, paymentMethod, ...(customerId ? { customerId } : {}) })),
  accounting: (days: number) => request<AccountingData>(`/api/accounting?days=${days}`),
  saveTaxSettings: (taxRateBps: number, taxName: string) => request<TaxSettings>('/api/accounting/tax-settings', json('PATCH', { taxRateBps, taxName })),
  addExpense: (expense: { title: string; category: string; amount: number; paymentMethod: 'cash' | 'electronic'; note: string }) => request('/api/accounting/expenses', json('POST', expense)),
  remitTax: (values: { amount: number; paymentMethod: 'cash' | 'electronic'; note: string }) => request('/api/accounting/tax-payments', json('POST', values)),
  addCashAdjustment: (values: { direction: 'in' | 'out'; amount: number; note: string }) => request('/api/accounting/cash-adjustments', json('POST', values)),
  reconcileCash: (values: { countedBalance: number; note: string }) => request('/api/accounting/reconciliations', json('POST', values)),
  voidExpense: (id: string) => request<void>(`/api/accounting/expenses/${encodeURIComponent(id)}`, json('DELETE')),
  patchExpense: (id: string, values: { title?: string; category?: string; amount?: number; paymentMethod?: 'cash' | 'electronic'; note?: string }) => request<{ id: string; title: string; category: string; amount: number; paymentMethod: string; note: string; createdAt: string }>(`/api/accounting/expenses/${encodeURIComponent(id)}`, json('PATCH', values)),
  voidTaxPayment: (id: string) => request<void>(`/api/accounting/tax-payments/${encodeURIComponent(id)}`, json('DELETE')),
  voidReconciliation: (id: string) => request<void>(`/api/accounting/reconciliations/${encodeURIComponent(id)}`, json('DELETE')),
  voidCashAdjustment: (id: number) => request<{ id: number; amount: number; note: string; createdAt: string; cash: unknown }>(`/api/accounting/cash-adjustments/${encodeURIComponent(id)}`, json('DELETE')),
  expenseCategories: () => request<Array<{ id: string; name: string; color: string; createdAt: string }>>('/api/accounting/categories'),
  createExpenseCategory: (values: { name: string; color: string }) => request<{ id: string; name: string; color: string; createdAt: string }>('/api/accounting/categories', json('POST', values)),
  deleteExpenseCategory: (id: string) => request<void>(`/api/accounting/categories/${encodeURIComponent(id)}`, json('DELETE')),
  saveProduct: (product: Product, isNew: boolean) => request<Product>(isNew ? '/api/products' : `/api/products/${encodeURIComponent(product.id)}`, json(isNew ? 'POST' : 'PUT', product)),
  addCategory: (name: string) => request<{ id: string; name: string }>('/api/categories', json('POST', { name })),
  adjustStock: (productId: string, amount: number, reason: string) => request<StockAdjustment>('/api/stock-adjustments', json('POST', { productId, amount, reason })),
  productColors: () => request<Array<{ id: string; name: string; hex: string; createdAt: string }>>('/api/products/options/colors'),
  createProductColor: (values: { name: string; hex: string }) => request<{ id: string; name: string; hex: string; createdAt: string }>('/api/products/options/colors', json('POST', values)),
  deleteProductColor: (id: string) => request<void>(`/api/products/options/colors/${encodeURIComponent(id)}`, json('DELETE')),
  productSizes: () => request<Array<{ id: string; name: string; sortOrder: number; createdAt: string }>>('/api/products/options/sizes'),
  createProductSize: (values: { name: string; sortOrder?: number }) => request<{ id: string; name: string; sortOrder: number; createdAt: string }>('/api/products/options/sizes', json('POST', values)),
  deleteProductSize: (id: string) => request<void>(`/api/products/options/sizes/${encodeURIComponent(id)}`, json('DELETE')),
  productVariants: (productId: string) => request<Array<{ id: string; productId: string; colorId: string | null; colorName: string | null; colorHex: string | null; sizeId: string | null; sizeName: string | null; sku: string; quantity: number; priceAdjustment: number; createdAt: string }>>(`/api/products/variants/${encodeURIComponent(productId)}`),
  createProductVariant: (values: { productId: string; colorId?: string | null; sizeId?: string | null; sku?: string; quantity?: number; priceAdjustment?: number }) => request(`/api/products/variants`, json('POST', values)),
  deleteProductVariant: (id: string) => request<void>(`/api/products/variants/${encodeURIComponent(id)}`, json('DELETE')),
  productImages: (productId: string) => request<Array<{ id: string; productId: string; url: string; sortOrder: number; createdAt: string }>>(`/api/products/images/${encodeURIComponent(productId)}`),
  addProductImage: (productId: string, url: string, sortOrder?: number) => request(`/api/products/images/${encodeURIComponent(productId)}`, json('POST', { url, sortOrder })),
  deleteProductImage: (imageId: string) => request<void>(`/api/products/images/${encodeURIComponent(imageId)}`, json('DELETE')),
  sizeGuides: () => request<Array<{ id: string; category: string; label: string; measurements: string; createdAt: string }>>('/api/products/size-guides'),
  createSizeGuide: (values: { category: string; label: string; measurements: string }) => request<{ id: string; category: string; label: string; measurements: string; createdAt: string }>('/api/products/size-guides', json('POST', values)),
  updateSizeGuide: (id: string, values: { category: string; label: string; measurements: string }) => request<{ id: string; category: string; label: string; measurements: string }>(`/api/products/size-guides/${encodeURIComponent(id)}`, json('PUT', values)),
  deleteSizeGuide: (id: string) => request<void>(`/api/products/size-guides/${encodeURIComponent(id)}`, json('DELETE')),
  accounts: () => request<UserAccount[]>('/api/accounts'),
  createAccount: (values: NewAccount) => request<UserAccount>('/api/accounts', json('POST', values)),
  updateAccount: (userId: string, values: { role?: AppRole; active?: boolean }) => request<UserAccount>(`/api/accounts/${encodeURIComponent(userId)}`, json('PATCH', values)),
  backups: () => request<BackupInfo[]>('/api/admin/backups'),
  createBackup: () => request<BackupInfo>('/api/admin/backups', json('POST')),
  restoreBackup: (file: File) => request<{ restored: boolean; safetyBackup: string; reloadRequired: boolean }>('/api/admin/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  }),
  purchasing: () => request<PurchasingData>('/api/purchasing'),
  createSupplier: (supplier: { name: string; phone: string; notes: string }) => request<Supplier>('/api/suppliers', json('POST', supplier)),
  createPurchase: (purchase: { supplierId: string; notes: string; items: Array<{ productId: string; quantity: number; unitCost: number }> }) => request<PurchaseReceipt>('/api/purchases', json('POST', purchase)),
  receivePurchase: (purchaseId: string, details: { paidAmount: number; paymentMethod: 'cash' | 'electronic' }) => request<PurchaseReceipt>(`/api/purchases/${encodeURIComponent(purchaseId)}/receive`, json('POST', details)),
  paySupplier: (supplierId: string, details: { amount: number; paymentMethod: 'cash' | 'electronic'; note: string }) => request<SupplierPaymentReceipt>(`/api/suppliers/${encodeURIComponent(supplierId)}/payments`, json('POST', details)),
  customers: () => request<CustomersData>('/api/customers'),
  createCustomer: (customer: { name: string; phone: string; notes: string }) => request<Customer>('/api/customers', json('POST', customer)),
  payCustomerBalance: (customerId: string, details: { amount: number; paymentMethod: 'cash' | 'electronic'; note: string }) => request(`/api/customers/${encodeURIComponent(customerId)}/payments`, json('POST', details)),
  updateLoyaltySettings: (amountPerPoint: number) => request('/api/customers/loyalty-settings', json('PATCH', { amountPerPoint })),
  redeemLoyaltyPoints: (customerId: string, points: number, note: string) => request(`/api/customers/${encodeURIComponent(customerId)}/rewards`, json('POST', { points, note })),
  priceLookup: (query: string) => request<PriceLookupResult[]>(`/api/price-check?query=${encodeURIComponent(query)}`),
}
