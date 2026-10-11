export type Product = {
  id: string
  name: string
  category: string
  barcode: string
  purchasePrice: number
  salePrice: number
  quantity: number
  minimumStock: number
  unit: string
  updatedAt: string
  status: 'active' | 'draft' | 'archived'
  description: string
  imageUrl: string
  images?: Array<{ id: string; url: string; sortOrder: number }>
  colors?: Array<{ id: string; name: string; hex: string }>
  sizes?: Array<{ id: string; name: string; sortOrder: number }>
  variants?: Array<{ id: string; colorId: string | null; colorName: string | null; colorHex: string | null; sizeId: string | null; sizeName: string | null; sku: string; quantity: number; priceAdjustment: number }>
}

export type StockAdjustment = {
  id: string
  productId: string
  productName: string
  amount: number
  reason: string
  createdAt: string
}
