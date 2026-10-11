import { useEffect, useMemo, useState } from 'react'
import AccessManagementView from './AccessManagementView'
import AccountingView from './AccountingView'
import AuthScreen from './AuthScreen'
import BackupManagementView from './BackupManagementView'
import InventoryView from './InventoryView'
import ReportsView from './ReportsView'
import SalesView from './SalesView'
import ExportView from './ExportView'
import { roleLabels, type AppRole, type UserAccount } from './authTypes'
import { api, ApiError, type AccountingData, type NewAccount, type SalesReport } from './api'
import type { Product, StockAdjustment } from './inventoryTypes'
import './App.css'

type IconName = 'dashboard' | 'box' | 'cart' | 'purchase' | 'users' | 'truck' | 'heart' | 'chart' | 'tag' | 'wallet' | 'settings' | 'search' | 'bell' | 'chevron' | 'plus' | 'empty' | 'menu'

type NavItem = {
  label: string
  icon: IconName
  group: string
  description: string
}

const navItems: NavItem[] = [
  { label: 'داشبۆرد', icon: 'dashboard', group: 'سەرەکی', description: 'پوختەی دۆخی کۆگا و چاڵاکییەکان' },
  { label: 'بەڕێوەبردنی کاڵاکان', icon: 'box', group: 'بەڕێوەبردن', description: 'کاڵا و پۆلەکانی کۆگاکەت بەڕێوە ببە' },
  { label: 'فرۆشتن', icon: 'cart', group: 'بەڕێوەبردن', description: 'פסוوڵە و مامەڵەکانی فرۆشتن' },
  { label: 'صادرات', icon: 'truck', group: 'بەڕێوەبردن', description: 'مامەڵەکانی صادرات و بەرهە밆ن' },
  { label: 'کڕین', icon: 'purchase', group: 'بەڕێوەبردن', description: 'داواکاری و مامەڵەکانی کڕین' },
  { label: 'کڕیاران', icon: 'users', group: 'بەڕێوەبردن', description: 'زانیاری کڕیار و هەژماریان' },
  { label: 'دابینکەران', icon: 'truck', group: 'بەڕێوەبردن', description: 'دابینکەر و هەژماریان' },
  { label: 'بەرنامەی وەفاداری', icon: 'heart', group: 'بەڕێوەبردن', description: 'خاڵ و پاداشتەکانی کڕیاران' },
  { label: 'ڕاپۆرتەکان', icon: 'chart', group: 'ڕاپۆرت و دارایی', description: 'ڕاپۆرتی فرۆشتن و کۆگا' },
  { label: 'پشکنینی نرخ', icon: 'tag', group: 'ڕاپۆرت و دارایی', description: 'پشکنینی نرخ و گۆڕانکارییەکان' },
  { label: 'ژمێریاری', icon: 'wallet', group: 'ڕاپۆرت و دارایی', description: 'پوختەی داهات و خەرجی' },
  { label: 'ڕێکخستن', icon: 'settings', group: 'سیستەم', description: 'ڕێکخستنی سیستەم و هەژمار' },
]

const roleAccess: Record<AppRole, string[]> = {
  owner: navItems.map((item) => item.label),
  cashier: ['داشبۆرد', 'فرۆشتن', 'کڕیاران', 'بەرنامەی وەفاداری', 'پشکنینی نرخ'],
  stock_manager: ['داشبۆرد', 'بەڕێوەبردنی کاڵاکان', 'کڕین', 'دابینکەران', 'ڕاپۆرتەکان', 'پشکنینی نرخ', 'صادرات'],
}
const noRoleAccess: string[] = []
const currentUtcDate = new Date().toISOString().slice(0, 10)

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {name === 'dashboard' && <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="4" rx="1.5" /><rect x="13.5" y="10.5" width="7" height="10" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /></>}
      {name === 'box' && <><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z" /><path d="m3.8 7.7 8.2 4.5 8.2-4.5M12 12.2V21" /></>}
      {name === 'cart' && <><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 1.9-1.4L21 9H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>}
      {name === 'purchase' && <><path d="M4 7h16v13H4zM8 7V4h8v3M8 12h8M8 16h5" /><path d="M18 3v5M15.5 5.5h5" /></>}
      {name === 'users' && <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20v-1.4A5.5 5.5 0 0 1 9 13h1a5.5 5.5 0 0 1 5.5 5.6V20M16 5.2a3.2 3.2 0 0 1 0 6.1M17 14h.5a4 4 0 0 1 4 4v2" /></>}
      {name === 'truck' && <><path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></>}
      {name === 'heart' && <><path d="M20.8 8.8c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" /><path d="M8 12h2l1.2-2.2 1.7 4.4 1.1-2.2h2" /></>}
      {name === 'chart' && <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></>}
      {name === 'tag' && <><path d="m20 13-7 7L3 10V4h6l11 9Z" /><circle cx="7.5" cy="7.5" r="1" /></>}
      {name === 'wallet' && <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 14h2" /><path d="M6 5V3h12v2" /></>}
      {name === 'settings' && <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z" /></>}
      {name === 'search' && <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></>}
      {name === 'bell' && <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>}
      {name === 'chevron' && <path d="m9 18 6-6-6-6" />}
      {name === 'plus' && <><path d="M12 5v14M5 12h14" /></>}
      {name === 'empty' && <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5M8 17h3" /></>}
      {name === 'menu' && <><path d="M4 7h16M4 12h16M4 17h16" /></>}
    </svg>
  )
}

function App() {
  const [activeLabel, setActiveLabel] = useState('داشبۆرد')
  const [search, setSearch] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [accounts, setAccounts] = useState<UserAccount[]>([])
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [booting, setBooting] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const [reportData, setReportData] = useState<SalesReport | null>(null)
  const [reportDays, setReportDays] = useState(30)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [accountingData, setAccountingData] = useState<AccountingData | null>(null)
  const [accountingLoading, setAccountingLoading] = useState(false)
  const [accountingError, setAccountingError] = useState('')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const allowedLabels = currentUser ? roleAccess[currentUser.role] : noRoleAccess
  const filteredItems = useMemo(() => navItems.filter((item) => allowedLabels.includes(item.label) && item.label.includes(search.trim())), [search, allowedLabels])
  const visibleActiveLabel = allowedLabels.includes(activeLabel) ? activeLabel : 'داشبۆرد'
  const activeItem = navItems.find((item) => item.label === visibleActiveLabel) ?? navItems[0]
  const groups = [...new Set(filteredItems.map((item) => item.group))]
  const selectPage = (label: string) => {
    if (!allowedLabels.includes(label)) return
    setActiveLabel(label)
    setMobileNavOpen(false)
    setProfileMenuOpen(false)
    if (label === 'ڕاپۆرتەکان') void loadReports(reportDays)
    if (label === 'ژمێریاری' && currentUser?.role === 'owner') void loadAccounting()
  }

  const loadInventory = async () => {
    const data = await api.inventory()
    setProducts(data.products)
    setCategories(data.categories)
    setAdjustments(data.adjustments)
  }

  const loadOwnerAccounts = async () => setAccounts(await api.accounts())

  const loadAccounting = async () => {
    setAccountingLoading(true)
    try {
      setAccountingData(await api.accounting(30))
      setAccountingError('')
    } catch (error) {
      setAccountingError(error instanceof Error ? error.message : 'نەتوانرا داتای ژمێریاری بار بکرێت.')
    } finally {
      setAccountingLoading(false)
    }
  }

  const loadReports = async (days = reportDays) => {
    setReportLoading(true)
    try {
      const data = await api.reports(days)
      setReportData(data)
      setReportDays(days)
      setReportError('')
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'نەتوانرا ڕاپۆرتەکان بار بکرێن.')
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    const start = async () => {
      try {
        const bootstrap = await api.bootstrap()
        if (!mounted) return
        setSetupRequired(bootstrap.setupRequired)
        setCurrentUser(bootstrap.user)
        if (bootstrap.user) {
          const requests: Promise<unknown>[] = []
          if (bootstrap.user.role === 'owner' || bootstrap.user.role === 'stock_manager') requests.push(loadInventory())
          if (bootstrap.user.role === 'owner') requests.push(loadOwnerAccounts())
          if (bootstrap.user.role === 'owner' || bootstrap.user.role === 'stock_manager') requests.push(loadReports(30))
          if (bootstrap.user.role === 'owner') requests.push(loadAccounting())
          await Promise.all(requests)
        }
        if (mounted) setConnectionError('')
      } catch (error) {
        if (mounted) setConnectionError(error instanceof Error ? error.message : 'پەیوەندی بە ڕاژەرەوە نەکرا.')
      } finally {
        if (mounted) setBooting(false)
      }
    }
    void start()
    return () => { mounted = false }
  }, [])

  const signIn = async (username: string, password: string) => {
    try {
      const response = await api.login({ username, password })
      setCurrentUser(response.user)
      setActiveLabel('داشبۆرد')
      setConnectionError('')
      if (response.user.role === 'owner' || response.user.role === 'stock_manager') await loadInventory()
      if (response.user.role === 'owner') await loadOwnerAccounts()
      if (response.user.role === 'owner' || response.user.role === 'stock_manager') await loadReports(30)
      if (response.user.role === 'owner') await loadAccounting()
      return undefined
    } catch (error) {
      return error instanceof ApiError ? error.message : 'پەیوەندی بە ڕاژەرەوە نەکرا.'
    }
  }

  const createOwner = async (name: string, username: string, password: string, email: string) => {
    try {
      const response = await api.setup({ name, username, password, email })
      setCurrentUser(response.user)
      setSetupRequired(false)
      setAccounts([response.user])
      setActiveLabel('داشبۆرد')
      setConnectionError('')
      await loadAccounting()
      return undefined
    } catch (error) {
      return error instanceof ApiError ? error.message : 'پەیوەندی بە ڕاژەرەوە نەکرا.'
    }
  }

  const signOut = async () => {
    try { await api.logout() } catch { /* Clear the UI session even if the server is unreachable. */ }
    setCurrentUser(null)
    setAccounts([])
    setProducts([])
    setCategories([])
    setAdjustments([])
    setReportData(null)
    setAccountingData(null)
    setProfileMenuOpen(false)
    setActiveLabel('داشبۆرد')
  }

  const createAccount = async (account: NewAccount) => {
    try {
      const created = await api.createAccount(account)
      setAccounts((current) => [...current, created])
      return undefined
    } catch (error) {
      return error instanceof ApiError ? error.message : 'نەتوانرا هەژمارەکە دروست بکرێت.'
    }
  }

  const updateAccount = async (userId: string, values: { role?: AppRole; active?: boolean }) => {
    try {
      const updated = await api.updateAccount(userId, values)
      setAccounts((current) => current.map((account) => account.id === userId ? updated : account))
      return undefined
    } catch (error) {
      return error instanceof ApiError ? error.message : 'نەتوانرا هەژمارەکە نوێ بکرێتەوە.'
    }
  }

  const changeAccountRole = (userId: string, role: AppRole) => updateAccount(userId, { role })
  const toggleAccountActive = (userId: string) => {
    const account = accounts.find((item) => item.id === userId)
    if (!account) return Promise.resolve('هەژمارەکە نەدۆزرایەوە.')
    return updateAccount(userId, { active: !account.active })
  }

  const saveProduct = async (product: Product, isNew: boolean) => {
    try {
      await api.saveProduct(product, isNew)
      await loadInventory()
      await loadReports()
      return undefined
    } catch (error) {
      return error instanceof ApiError ? error.message : 'نەتوانرا کاڵاکە پاشەکەوت بکرێت.'
    }
  }

  const addCategory = async (category: string) => {
    try {
      await api.addCategory(category)
      await loadInventory()
      return undefined
    } catch (error) {
      return error instanceof ApiError ? error.message : 'نەتوانرا پۆلەکە زیاد بکرێت.'
    }
  }

  const adjustStock = async (productId: string, amount: number, reason: string) => {
    try {
      await api.adjustStock(productId, amount, reason)
      await loadInventory()
      await loadReports()
      return undefined
    } catch (error) {
      return error instanceof ApiError ? error.message : 'نەتوانرا ڕێکخستنی کۆگا تۆمار بکرێت.'
    }
  }

const onSaleRecorded = async () => {
  if (currentUser?.role === 'owner' || currentUser?.role === 'stock_manager') {
    await Promise.all([loadInventory(), loadReports(), ...(currentUser.role === 'owner' ? [loadAccounting()] : [])])
  }
}

const onExportRecorded = async () => {
  if (currentUser?.role === 'owner' || currentUser?.role === 'stock_manager') {
    await Promise.all([loadInventory(), loadReports(), ...(currentUser.role === 'owner' ? [loadAccounting()] : [])])
  }
}

  const lowStockCount = products.filter((product) => product.quantity <= product.minimumStock).length
  const todaySales = reportData?.salesTimeline.find((day) => day.date === currentUtcDate)
  const recentSales = reportData?.recentSales ?? []
  const weekSales = reportData?.salesTimeline.slice(-7) ?? []
  const weekMaxRevenue = Math.max(1, ...weekSales.map((day) => day.revenue))

  if (booting) return <main className="auth-screen" dir="rtl"><section className="auth-form-panel"><div className="auth-card"><div className="auth-card-icon">س</div><h2>پەیوەندی بە ڕاژەرەوە...</h2><p className="auth-intro">تکایە چاوەڕێ بکە.</p></div></section></main>
  if (connectionError) return <main className="auth-screen" dir="rtl"><section className="auth-form-panel"><div className="auth-card"><div className="auth-card-icon">!</div><span className="eyebrow">کێشەی پەیوەندی</span><h2>ڕاژەر بەردەست نییە</h2><p className="auth-intro">{connectionError}</p><button className="button button-primary auth-submit" onClick={() => window.location.reload()}>دووبارە هەوڵدانەوە</button></div></section></main>
  if (!currentUser) return <AuthScreen setupRequired={setupRequired} onSignIn={signIn} onCreateOwner={createOwner} />

  return (
    <div className="app-shell" dir="rtl">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><Icon name="box" size={22} /></div><div className="brand-copy"><strong>poshraw co</strong><span>سیستەمی بەڕێوەبردن</span></div><button className="icon-button sidebar-close" aria-label="داخستنی لیست" onClick={() => setMobileNavOpen(false)}>×</button></div>
        <div className="workspace-switcher"><div className="workspace-avatar">س</div><div className="workspace-copy"><span>شوێنی کار</span><strong>کۆگای من</strong></div><Icon name="chevron" size={16} /></div>
        <nav className="side-navigation" aria-label="ناوەڕۆکی سەرەکی">
          {groups.map((group) => <div className="nav-group" key={group}><p className="nav-group-label">{group}</p>{filteredItems.filter((item) => item.group === group).map((item) => <button key={item.label} className={`nav-link ${activeLabel === item.label ? 'active' : ''}`} onClick={() => selectPage(item.label)} aria-current={activeLabel === item.label ? 'page' : undefined}><Icon name={item.icon} size={19} /><span>{item.label}</span>{activeLabel === item.label && <span className="active-indicator" />}</button>)}</div>)}
          {filteredItems.length === 0 && <p className="no-nav-results">هیچ بەشێک نەدۆزرایەوە</p>}
        </nav>
        <div className="sidebar-footer"><div className="support-card"><span className="support-icon">؟</span><div><strong>پێویستی بە یارمەتییە؟</strong><span>یارمەتی و ڕێنمایی</span></div><Icon name="chevron" size={16} /></div><button className="profile-row" onClick={() => currentUser.role === 'owner' ? selectPage('ڕێکخستن') : setProfileMenuOpen(!profileMenuOpen)}><span className="profile-avatar">{currentUser.name.slice(0, 1)}</span><span className="profile-copy"><strong>{currentUser.name}</strong><span>{roleLabels[currentUser.role]}</span></span><span className="profile-dots">•••</span></button></div>
      </aside>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="داخستنی مینیو" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-area">
        <header className="topbar"><button className="icon-button mobile-menu" aria-label="کردنەوەی مینیو" onClick={() => setMobileNavOpen(true)}><Icon name="menu" /></button><div className="breadcrumb"><span>کۆگای من</span><Icon name="chevron" size={14} /><strong>{visibleActiveLabel}</strong></div><div className="topbar-actions"><label className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="گەڕان لە بەشەکان..." aria-label="گەڕان لە بەشەکان" /><kbd>⌘ K</kbd></label><div className="notice-wrap"><button className={`icon-button notification-button ${noticeOpen ? 'is-open' : ''}`} aria-label="ئاگادارکردنەوەکان" onClick={() => setNoticeOpen(!noticeOpen)}><Icon name="bell" size={19} />{reportData && reportData.lowStock.length > 0 && <i />}</button>{noticeOpen && <div className="notice-popover"><strong>ئاگادارکردنەوەکان</strong>{reportData?.lowStock.length ? <><span>{reportData.lowStock.length} کاڵا لە ئاستی کەم یان تەواوبووندایە.</span>{reportData.lowStock.slice(0, 3).map((product) => <span className="notice-product" key={product.id}>{product.name} · {product.quantity} {product.unit}</span>)}<button onClick={() => { setNoticeOpen(false); selectPage('ڕاپۆرتەکان') }}>بینینی هەموو ئاگادارکردنەوەکان</button></> : <span>هیچ ئاگادارکردنەوەیەکی کەمبوونی کۆگا نییە.</span>}</div>}</div><div className="topbar-divider" /><div className="profile-menu-wrap"><button className="topbar-user" onClick={() => setProfileMenuOpen(!profileMenuOpen)}><span className="topbar-avatar">{currentUser.name.slice(0, 1)}</span><span>{currentUser.name}</span><Icon name="chevron" size={14} /></button>{profileMenuOpen && <div className="profile-popover"><strong>{currentUser.name}</strong><span>{roleLabels[currentUser.role]}</span>{currentUser.role === 'owner' && <button onClick={() => selectPage('ڕێکخستن')}>بەڕێوەبردنی هەژمارەکان</button>}<button className="signout-action" onClick={signOut}>چوونەدەرەوە</button></div>}</div></div></header>

        <div className="page-content">
          <div className="page-heading"><div><span className="eyebrow">بەخێربێیتەوە</span><h1>{visibleActiveLabel}</h1><p>{visibleActiveLabel === 'داشبۆرد' ? 'پوختەیەکی خێرا لە بارودۆخی کارەکەت.' : activeItem.description}</p></div>{visibleActiveLabel !== 'بەڕێوەبردنی کاڵاکان' && <div className="heading-actions">{allowedLabels.includes('ڕاپۆرتەکان') && <button className="button button-secondary" onClick={() => selectPage('ڕاپۆرتەکان')}><Icon name="chart" size={17} /> بینینی ڕاپۆرت</button>}{allowedLabels.includes('بەڕێوەبردنی کاڵاکان') && <button className="button button-primary" onClick={() => selectPage('بەڕێوەبردنی کاڵاکان')}><Icon name="plus" size={17} /> زیادکردنی کاڵا</button>}</div>}</div>

           {visibleActiveLabel === 'بەڕێوەبردنی کاڵاکان' ? <InventoryView products={products} categories={categories} adjustments={adjustments} onSaveProduct={saveProduct} onAddCategory={addCategory} onAdjustStock={adjustStock} /> : visibleActiveLabel === 'فرۆشتن' ? <SalesView onSaleRecorded={onSaleRecorded} /> : visibleActiveLabel === 'صادرات' ? <ExportView onSaleRecorded={onExportRecorded} /> : visibleActiveLabel === 'ڕاپۆرتەکان' ? <ReportsView data={reportData} days={reportDays} loading={reportLoading} error={reportError} onDaysChange={(days) => { void loadReports(days) }} onRefresh={() => { void loadReports() }} /> : visibleActiveLabel === 'ژمێریاری' && currentUser.role === 'owner' ? <AccountingView data={accountingData} loading={accountingLoading} error={accountingError} onRefresh={loadAccounting} onAccountingChanged={async () => { await Promise.all([loadAccounting(), loadReports()]) }} /> : visibleActiveLabel === 'ڕێکخستن' && currentUser.role === 'owner' ? <div className="owner-settings-stack"><AccessManagementView accounts={accounts} currentUserId={currentUser.id} onCreateAccount={createAccount} onChangeRole={changeAccountRole} onToggleActive={toggleAccountActive} /><BackupManagementView /></div> : visibleActiveLabel === 'داشبۆرد' ? <>
            <section className="summary-grid" aria-label="پوختەی گشتی">
              <article className="summary-card"><div className="summary-top"><span>کۆی فرۆشتنی ئەمڕۆ</span><span className="summary-icon green-icon"><Icon name="cart" size={18} /></span></div><div className="summary-value">{new Intl.NumberFormat('en-US').format(todaySales?.revenue ?? 0)} <small>د.ع</small></div><div className="summary-foot"><span className="neutral-change">{todaySales?.salesCount ?? 0} پسووڵە</span><span>لە ئەمڕۆدا</span></div></article>
              <article className="summary-card"><div className="summary-top"><span>کاڵاکانی کۆگا</span><span className="summary-icon mint-icon"><Icon name="box" size={18} /></span></div><div className="summary-value">{products.length} <small>کاڵا</small></div><div className="summary-foot"><span>هەموو کاڵاکان</span></div></article>
              <article className="summary-card"><div className="summary-top"><span>کڕیاران</span><span className="summary-icon pale-icon"><Icon name="users" size={18} /></span></div><div className="summary-value">0 <small>کڕیار</small></div><div className="summary-foot"><span>کۆی کڕیارە تۆمارکراوەکان</span></div></article>
              <article className="summary-card"><div className="summary-top"><span>کاڵای کەمبوو</span><span className="summary-icon amber-icon"><Icon name="tag" size={18} /></span></div><div className="summary-value">{lowStockCount} <small>کاڵا</small></div><div className="summary-foot"><span>پێویستی بە پشکنین</span></div></article>
            </section>
            <section className="content-grid">
              <article className="panel sales-panel"><div className="panel-heading"><div><h2>جووڵەی فرۆشتن</h2><p>پوختەی فرۆشتن بەپێی کات</p></div><button className="select-button" onClick={() => selectPage('ڕاپۆرتەکان')}>٧ ڕۆژی ڕابردوو <Icon name="chevron" size={14} /></button></div><div className="chart-empty"><div className="chart-illustration"><div className="chart-grid-lines"><i /><i /><i /><i /></div>{reportData?.summary.salesCount ? <div className="dashboard-sales-bars">{weekSales.map((day) => <div className="dashboard-sales-day" key={day.date} title={`${new Intl.NumberFormat('en-US').format(day.revenue)} د.ع`}><i style={{ height: `${day.revenue ? Math.max(5, day.revenue / weekMaxRevenue * 100) : 2}%` }} /><small>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('ckb', { weekday: 'short', timeZone: 'UTC' })}</small></div>)}</div> : <div className="chart-zero"><span>0</span><i /></div>}{!reportData?.summary.salesCount && <div className="chart-labels"><span>شەممە</span><span>یەکشەممە</span><span>دووشەممە</span><span>سێشەممە</span><span>چوارشەممە</span><span>پێنجشەممە</span><span>هەینی</span></div>}</div><div className="empty-hint"><span className="hint-icon"><Icon name="chart" size={17} /></span><span>{reportData?.summary.salesCount ? 'فرۆشتنەکان لە ڕاپۆرتەکاندا نوێ دەبنەوە' : 'هێشتا داتای فرۆشتن نییە'}</span></div></div></article>
              <article className="panel inventory-panel"><div className="panel-heading"><div><h2>بارودۆخی کۆگا</h2><p>پوختەی کاڵاکان</p></div><button className="more-button" aria-label="زیاتر">•••</button></div><div className="inventory-empty"><div className="inventory-ring"><div className="ring-center"><Icon name="box" size={22} /></div></div><strong>{products.length ? `${products.length} کاڵا لە کۆگادا` : 'هێشتا کاڵا تۆمار نەکراوە'}</strong><span>{products.length ? `${lowStockCount} کاڵا لە ئاستی کەم یان تەواوبووندایە.` : 'دوای زیادکردنی کاڵا، پوختەکە لێرە دەردەکەوێت.'}</span><button className="text-action" onClick={() => selectPage('بەڕێوەبردنی کاڵاکان')}>{products.length ? 'بینینی کاڵاکان' : 'زیادکردنی یەکەم کاڵا'} <Icon name="chevron" size={14} /></button></div></article>
            </section>
            <section className="panel recent-panel"><div className="panel-heading"><div><h2>دوایین مامەڵەکان</h2><p>تازەترین فرۆشتنەکان</p></div><button className="text-action" onClick={() => selectPage('فرۆشتن')}>فرۆشتنی نوێ <Icon name="chevron" size={14} /></button></div>{recentSales.length ? <div className="recent-sales-list">{recentSales.slice(0, 5).map((sale) => <div className="recent-sale-row" key={sale.id}><span className="sale-receipt-icon">▤</span><span className="recent-sale-main"><strong>{sale.receiptNumber}</strong><small>{sale.sellerName} · {new Date(sale.createdAt).toLocaleString('ckb', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span><strong className="recent-sale-total" dir="ltr">{new Intl.NumberFormat('en-US').format(sale.totalAmount)} <small>د.ع</small></strong></div>)}</div> : <div className="table-empty"><span className="table-empty-icon"><Icon name="empty" size={20} /></span><strong>هیچ فرۆشتنێک نییە</strong><span>کاتێک فرۆشتن تۆمار بکەیت، لێرە دەردەکەوێت.</span></div>}</section>
          </> : <section className="panel section-empty-panel"><div className="section-empty-art"><Icon name={activeItem.icon} size={27} /></div><span className="eyebrow">{activeItem.group}</span><h2>{activeLabel}</h2><p>{activeItem.description}</p><div className="section-empty-message"><Icon name="empty" size={20} /><span>هێشتا هیچ زانیارییەک تۆمار نەکراوە.</span></div><button className="button button-primary" onClick={() => selectPage('داشبۆرد')}>گەڕانەوە بۆ داشبۆرد <Icon name="chevron" size={15} /></button></section>}
          <footer className="page-footer"><span>© poshraw co · سیستەمی بەڕێوەبردنی کۆگا</span><span>سپێتی و سەوز · کوردی</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
