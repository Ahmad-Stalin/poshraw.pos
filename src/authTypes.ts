export type AppRole = 'owner' | 'cashier' | 'stock_manager'

export type UserAccount = {
  id: string
  name: string
  username: string
  email: string | null
  role: AppRole
  active: boolean
  createdAt: string
}

export const roleLabels: Record<AppRole, string> = {
  owner: 'خاوەن سیستەم',
  cashier: 'فرۆشیار',
  stock_manager: 'بەڕێوەبەری کۆگا',
}
