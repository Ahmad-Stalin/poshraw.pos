import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, type CurrencyCode, type InvoiceSummary, type RecordedSale, type SaleProduct } from './api'

type ExportViewProps = { onSaleRecorded: () => Promise<void> }
type CartLine = { productId: string; quantity: number }
const format = (value: number) => new Intl.NumberFormat('en-US').format(value)
const formatForeign = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)

function ExportView({ onSaleRecorded }: ExportViewProps) {
  const [products, setProducts] = useState<SaleProduct[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [productId, setProductId] = useState('')
  const [barcode, setBarcode] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [taxRateBps, setTaxRateBps] = useState(0)
  const [taxName, setTaxName] = useState('باژ')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'electronic'>('cash')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<RecordedSale | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<InvoiceSummary[]>([])
  const [loadingInvoiceId, setLoadingInvoiceId] = useState('')

  // Export-specific fields
  const [foreignCurrency, setForeignCurrency] = useState<CurrencyCode>('USD')
  const [exchangeRate, setExchangeRate] = useState('')
  const [shippingCosts, setShippingCosts] = useState('')
  const [customsCharges, setCustomsCharges] = useState('')
  const [destinationCountry, setDestinationCountry] = useState('')
  const [customer, setCustomer] = useState('')

  const loadProducts = async () => {
    try {
      const [available, tax, invoices] = await Promise.all([api.saleProducts(), api.salesConfig(), api.sales()])
      setProducts(available)
      setRecentInvoices(invoices)
      setTaxRateBps(tax.taxRateBps)
      setTaxName(tax.taxName)
      setProductId((current) => available.some((item) => item.id === current) ? current : available[0]?.id ?? '')
      setError('')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا کاڵاکان بار بکرێن.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProducts() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const cartDetails = useMemo(() => cart.map((line) => ({ ...line, product: products.find((item) => item.id === line.productId) })).filter((line) => line.product), [cart, products])
  const subtotal = cartDetails.reduce((sum, line) => sum + (line.product?.salePrice ?? 0) * line.quantity, 0)
  const taxAmount = Math.round(subtotal * taxRateBps / 10000)
  const shippingCostsNum = shippingCosts === '' ? 0 : Number(shippingCosts)
  const customsChargesNum = customsCharges === '' ? 0 : Number(customsCharges)
  const total = subtotal + taxAmount + shippingCostsNum + customsChargesNum
  const exchangeRateNum = foreignCurrency === 'IQD' ? 1 : Number(exchangeRate)
  const exchangeRateValid = foreignCurrency === 'IQD' || (Number.isFinite(exchangeRateNum) && exchangeRateNum > 0 && exchangeRateNum <= 1_000_000_000)
  const validCharges = Number.isSafeInteger(shippingCostsNum) && shippingCostsNum >= 0
    && Number.isSafeInteger(customsChargesNum) && customsChargesNum >= 0
  const validTotal = Number.isSafeInteger(total) && total >= 0

  const addProductToCart = (selectedProductId: string, amount: number) => {
    setError('')
    const selected = products.find((item) => item.id === selectedProductId)
    if (!selected || !Number.isSafeInteger(amount) || amount < 1) {
      setError('کاڵا و بڕی دروست هەڵبژێرە.')
      return false
    }
    const alreadyInCart = cart.find((line) => line.productId === selectedProductId)?.quantity ?? 0
    if (alreadyInCart + amount > selected.quantity) {
      setError(`لە کۆگا تەنها ${format(selected.quantity - alreadyInCart)} ${selected.unit} ماوەتەوە.`)
      return false
    }
    setCart((current) => current.some((line) => line.productId === selectedProductId)
      ? current.map((line) => line.productId === selectedProductId ? { ...line, quantity: line.quantity + amount } : line)
      : [...current, { productId: selectedProductId, quantity: amount }])
    return true
  }

  const addLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (addProductToCart(productId, Number(quantity))) setQuantity('1')
  }

  const scanBarcode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const scanned = barcode.trim()
    const product = products.find((item) => item.barcode.trim().toLocaleLowerCase() === scanned.toLocaleLowerCase())
    if (!product) {
      setError('ئەم بارکۆدە لە کاڵاکاندا نەدۆزرایەوە.')
      return
    }
    if (addProductToCart(product.id, 1)) {
      setProductId(product.id)
      setBarcode('')
    }
  }

  const openInvoice = async (saleId: string) => {
    setLoadingInvoiceId(saleId)
    setError('')
    try {
      setReceipt(await api.invoice(saleId))
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا پسووڵەکە بار بکرێت.')
    } finally {
      setLoadingInvoiceId('')
    }
  }

  const printInvoice = () => {
    document.body.classList.add('printing-invoice')
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-invoice'), { once: true })
    window.print()
  }

  const submitSale = async () => {
    if (!cart.length || saving) return
    if (!validCharges || !validTotal) {
      setError('کرێی ناردن و گومرک دەبێت ژمارەیەکی تەواوی سفر یان زیاتر بن.')
      return
    }
    if (!exchangeRateValid) {
      setError('نرخی ئاڵوگۆڕ دەبێت ژمارەیەکی دروستی گەورەتر لە سفر بێت.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const body = {
        items: cart.map(({ productId: id, quantity: amount }) => ({ productId: id, quantity: amount })),
        paymentMethod,
        isExport: true,
        ...(customer ? { customerName: customer } : {}),
        currencyCode: foreignCurrency,
        exchangeRate: exchangeRateNum,
        shippingCost: shippingCostsNum,
        customsCharges: customsChargesNum,
        destinationCountry,
      }
      const response = await fetch('/api/sales', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(errorData?.error ?? 'فرۆشتن تۆمار نەكراوە')
      }
      const completed = await response.json() as RecordedSale
      setReceipt(completed)
      setCart([])
      await loadProducts()
      await onSaleRecorded()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرۆشتن تۆمار نەكراوە')
      await loadProducts()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="sales-view">
      <div className="sales-intro"><div><span className="eyebrow"> صادرات و پسووڵە</span><h2>تۆمارکردنی صادرات</h2><p>کاڵا زیاد بکە؛ بڕی کۆگا و ڕاپۆرتەکان بە شێوەیەکی ئۆتۆماتیکی نوێ دەبنەوە.</p></div>{receipt && <span className="sale-success-label">فرۆشتن تۆمار کرا</span>}</div>
       <div className="sales-workspace">
         <section className="panel sale-entry-panel"><div className="sales-panel-title"><span className="sales-icon">↗</span><div><h3>زیادکردنی کاڵا بۆ پسووڵە</h3><p>نرخ بە نرخی فرۆشتنی تۆمارکراوە.</p></div></div>
         {loading ? (
           <div className="sales-empty">کاڵاکان بار دەکرێن...</div>
         ) : products.length === 0 ? (
           <div className="sales-empty"><strong>کاڵای بەردەست نییە</strong><span>پێش تۆمارکردنی فرۆشتن، کاڵا و بڕی کۆگا زیاد بکە.</span></div>
         ) : (
           <>
             <form className="barcode-scan-form" onSubmit={scanBarcode}>
               <label className="form-field">سکانی بارکۆδ<input autoComplete="off" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="بارکۆد بخوێنەرەوە و Enter دابگرە" dir="ltr" /></label>
               <button className="button button-secondary" type="submit">خوێندنەوە</button>
             </form>
             <form className="sale-add-form" onSubmit={addLine}>
               <label className="form-field">کاڵا<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {format(product.salePrice)} د.ع · بەردەست: {format(product.quantity)} {product.unit}</option>)}</select></label>
               <div className="sale-add-bottom">
                 <label className="form-field">بڕ<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} dir="ltr" required /></label>
                 <button className="button button-primary" type="submit">+ زیادکردن</button>
               </div>
             </form>
           </>
         )}
         {error && <p className="form-error" role="alert">{error}</p>}
       </section>
       </div>
      <section className="panel sale-receipt-panel"><div className="inventory-section-title"><div><h3>پسووڵەی ئێستا</h3><p>{cartDetails.length} جۆر کاڵا</p></div><span className="receipt-mark">د.ع</span></div>
        {cartDetails.length ? <div className="sale-cart-list">{cartDetails.map((line) => <div className="sale-cart-row" key={line.productId}><span className="sale-cart-symbol">▧</span><div className="sale-cart-product"><strong>{line.product?.name}</strong><small>{format(line.quantity)} × {format(line.product?.salePrice ?? 0)} د.ع</small></div><strong className="sale-line-total" dir="ltr">{format((line.product?.salePrice ?? 0) * line.quantity)}</strong><button aria-label={`لابردنی ${line.product?.name}`} className="sale-remove" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}>×</button></div>)}</div> : <div className="sales-empty compact-empty"><span>▤</span><strong>پسووڵە بەتاڵە</strong><small>کاڵا زیاد بکە بۆ دەستپێکردن.</small></div>}
        <div className="sale-calculation"><div><span>کۆی کاڵاکان</span><strong dir="ltr">{format(subtotal)} د.ع</strong></div><div><span>{taxName} ({(taxRateBps / 100).toFixed(taxRateBps % 100 ? 2 : 0)}%)</span><strong dir="ltr">{format(taxAmount)} د.ع</strong></div><div><span>کرێی ناردن</span><strong dir="ltr">{format(Number.isFinite(shippingCostsNum) ? shippingCostsNum : 0)} د.ع</strong></div><div><span>کرێی گومرک</span><strong dir="ltr">{format(Number.isFinite(customsChargesNum) ? customsChargesNum : 0)} د.ع</strong></div></div>
        {/* Export-specific fields */}
        <div className="export-fields">
          <label className="form-field">دراوی پیشاندانی هاوتا<select value={foreignCurrency} onChange={(event) => { const currency = event.target.value as CurrencyCode; setForeignCurrency(currency); setExchangeRate(currency === 'IQD' ? '1' : '') }}>{(['USD', 'EUR', 'GBP', 'IQD'] as CurrencyCode[]).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
          <label className="form-field">نرخی ئاڵوگۆڕ (د.ع بۆ ١ یەکە)<input type="number" min="0" step="0.0001" value={foreignCurrency === 'IQD' ? '1' : exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} placeholder="بۆ نموونە ١٤٢٠" dir="ltr" disabled={foreignCurrency === 'IQD'} required={foreignCurrency !== 'IQD'} /></label>
          <label className="form-field">کرێی ناردن (د.ع)<input type="number" min="0" step="1" value={shippingCosts} onChange={(event) => setShippingCosts(event.target.value)} dir="ltr" /></label>
          <label className="form-field">کرێی گومرک (د.ع)<input type="number" min="0" step="1" value={customsCharges} onChange={(event) => setCustomsCharges(event.target.value)} dir="ltr" /></label>
          <label className="form-field">وڵاتی مەبەست<input type="text" value={destinationCountry} onChange={(event) => setDestinationCountry(event.target.value)} /></label>
          <label className="form-field">ناوی کڕیار (ئارەزوومەندانە)<input type="text" value={customer} onChange={(event) => setCustomer(event.target.value)} /></label>
        </div>
        {cart.length > 0 && !validCharges && <p className="form-error" role="alert">کرێی ناردن و گومرک دەبێت ژمارەیەکی تەواوی سفر یان زیاتر بن.</p>}
        {cart.length > 0 && !validTotal && <p className="form-error" role="alert">کۆی فرۆشتن لە سنووری ژمارەی دروست زیاترە.</p>}
        {cart.length > 0 && !exchangeRateValid && <p className="form-error" role="alert">نرخی ئاڵوگۆڕ دەبێت ژمارەیەکی دروستی گەورەتر لە سفر بێت.</p>}
        <label className="form-field sale-payment-method">شێوازی پارەدان<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'electronic')}><option value="cash">پارەی نەقد (سندوق)</option><option value="electronic">بانک / ئەلیکترۆنی</option></select></label>
        <div className="sale-total-row"><span>کۆی گشتی بە دیناری عێراقی</span><strong dir="ltr">{format(total)} <small>د.ع</small></strong></div>{exchangeRateValid && validTotal && foreignCurrency !== 'IQD' && <div className="sale-total-row"><span>هاوتایەکەی بە {foreignCurrency}</span><strong dir="ltr">{formatForeign(total / exchangeRateNum)} <small>{foreignCurrency}</small></strong></div>}<button className="button button-primary sale-submit" disabled={!cart.length || saving || !validCharges || !validTotal || !exchangeRateValid} onClick={submitSale}>{saving ? 'تۆمار دەکرێت...' : 'تۆمارکردن و تەواوکردن'}</button>
       </section>
       <>
         {receipt && <section className="panel completed-sale"><span className="completed-check">✓</span><div><strong>فرۆشتنەکە بە سەرکەوتوویی تۆمار کرا</strong><span>پسووڵە: {receipt.receiptNumber} · کۆی فرۆشتن: {format(receipt.totalAmount)} د.ع</span></div><button className="text-action" onClick={() => setReceipt(null)}>باشە</button></section>}
         <section className="panel invoice-history-panel"><div className="inventory-section-title"><div><h3>پسووڵەکانی پێشوو</h3><p>پسووڵەکان بکەرەوە بۆ چاپکردن یان پاشەکەوتکردن وەک PDF.</p></div><span className="report-section-count">{recentInvoices.length}</span></div>{recentInvoices.length ? <div className="invoice-history-list">{recentInvoices.slice(0, 8).map((invoice) => <div className="invoice-history-row" key={invoice.id}><span className="sale-receipt-icon">▤</span><span className="invoice-history-main"><strong>{invoice.receiptNumber}</strong><small>{invoice.sellerName} · {new Date(invoice.createdAt).toLocaleString('ckb', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span><strong className="recent-sale-total" dir="ltr">{format(invoice.totalAmount)} د.ع</strong><button className="button button-secondary invoice-open-button" disabled={loadingInvoiceId === invoice.id} onClick={() => { void openInvoice(invoice.id) }}>{loadingInvoiceId === invoice.id ? '...' : 'بینین / چاپ'}</button></div>)}</div> : <div className="report-section-empty">هێشتا پسووڵەیەک تۆمار نەکراوە.</div>}</section>
          {receipt && <section className="print-invoice" aria-label="پسووڵەی فرۆشتن">
            <div className="invoice-topline"><div><strong>سەوزا</strong><span>پسووڵەی فرۆشتن</span></div><div className="invoice-code"><strong>{receipt.receiptNumber}</strong><span>{new Date(receipt.createdAt).toLocaleString('ckb', { dateStyle: 'medium', timeStyle: 'short' })}</span></div></div>
            <div className="invoice-meta"><span>فرۆشیار: {receipt.sellerName || 'بەکارهێنەر'}</span><span>پارەدان: {receipt.paymentMethod === 'cash' ? 'نەقد' : receipt.paymentMethod === 'credit' ? 'قەرز' : 'ئەلیکترۆنی'}</span></div>
            {receipt.isExport && <div className="invoice-meta"><span>کڕیار: {receipt.customerName || 'تۆمار نەکراوە'}</span><span>وڵاتی مەبەست: {receipt.destinationCountry || 'تۆمار نەکراوە'}</span><span>دراوی هاوتا: {receipt.currencyCode}</span></div>}
            <table className="invoice-items"><thead><tr><th>کاڵا</th><th>بڕ</th><th>نرخ</th><th>کۆ</th></tr></thead><tbody>{receipt.items.map((item) => <tr key={item.id}><td>{item.productName}</td><td>{format(item.quantity)}</td><td>{format(item.salePrice)} د.ع</td><td>{format(item.quantity * item.salePrice)} د.ع</td></tr>)}</tbody></table>
            <div className="invoice-totals"><div><span>کۆی کاڵاکان</span><strong>{format(receipt.subtotalAmount)} د.ع</strong></div><div><span>{receipt.taxName} ({(receipt.taxRateBps / 100).toFixed(receipt.taxRateBps % 100 ? 2 : 0)}%)</span><strong>{format(receipt.taxAmount)} د.ع</strong></div>{receipt.isExport && <><div><span>کرێی ناردن</span><strong>{format(receipt.shippingCost)} د.ع</strong></div><div><span>کرێی گومرک</span><strong>{format(receipt.customsCharges)} د.ع</strong></div></>}<div className="invoice-grand-total"><span>کۆی گشتی بە دیناری عێراقی</span><strong>{format(receipt.totalAmount)} د.ع</strong></div>{receipt.isExport && receipt.currencyCode !== 'IQD' && <div><span>هاوتا بە {receipt.currencyCode} (نرخ: {format(receipt.exchangeRate)} د.ع)</span><strong>{formatForeign(receipt.totalAmount / receipt.exchangeRate)} {receipt.currencyCode}</strong></div>}</div>
            <p className="invoice-thanks">سوپاس بۆ کڕینەکەت</p><button className="button button-primary invoice-print-button" onClick={printInvoice}>چاپکردن / پاشەکەوتکردن وەک PDF</button>
          </section>}
         <div className="sales-security-hint">هەر فرۆشتنێک لە بنکەدراوە تۆمار دەکرێت و بڕی کۆگا لە هەمان مامەڵەدا دادەبەزێت.</div>
       </>
    </section>
  )
}

export default ExportView