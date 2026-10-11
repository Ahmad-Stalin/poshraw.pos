import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, type PurchaseOrder, type PurchasingData } from './api'

type PurchasingViewProps = { onStockReceived: () => Promise<void> }
type PurchaseDraftItem = { productId: string; quantity: string; unitCost: string }
const format = (value: number) => new Intl.NumberFormat('en-US').format(value)
const emptyItem: PurchaseDraftItem = { productId: '', quantity: '1', unitCost: '0' }

function PurchasingView({ onStockReceived }: PurchasingViewProps) {
  const [data, setData] = useState<PurchasingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierNotes, setSupplierNotes] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [items, setItems] = useState<PurchaseDraftItem[]>([{ ...emptyItem }])
  const [paymentSupplierId, setPaymentSupplierId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'electronic'>('cash')
  const [paymentNote, setPaymentNote] = useState('')
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null)
  const [receivedPaidAmount, setReceivedPaidAmount] = useState('0')
  const [receivedPaymentMethod, setReceivedPaymentMethod] = useState<'cash' | 'electronic'>('cash')
  const [supplierModal, setSupplierModal] = useState(false)

  const load = async () => {
    try {
      const result = await api.purchasing()
      setData(result)
      setSupplierId((current) => result.suppliers.some((supplier) => supplier.id === current) ? current : result.suppliers[0]?.id ?? '')
      setPaymentSupplierId((current) => result.suppliers.some((supplier) => supplier.id === current) ? current : result.suppliers[0]?.id ?? '')
      if (result.products.length) setItems((current) => current.map((item) => item.productId ? item : { ...item, productId: result.products[0].id, unitCost: String(result.products[0].purchasePrice) }))
      setError('')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا داتای کڕین بار بکرێت.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const products = data?.products ?? []
  const suppliers = data?.suppliers ?? []
  const orders = data?.orders ?? []
  const debtTotal = suppliers.reduce((sum, supplier) => sum + supplier.balance, 0)
  const pendingOrders = orders.filter((order) => order.status === 'ordered').length
  const orderTotal = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitCost) || 0), 0), [items])

  const updateItem = (index: number, changes: Partial<PurchaseDraftItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))

  const addSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const supplier = await api.createSupplier({ name: supplierName.trim(), phone: supplierPhone.trim(), notes: supplierNotes.trim() })
      await load()
      setSupplierId(supplier.id)
      setSupplierName('')
      setSupplierPhone('')
      setSupplierNotes('')
      setSupplierModal(false)
      setSuccess('دابینکەر زیاد کرا.')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا دابینکەر زیاد بکرێت.')
    } finally {
      setBusy(false)
    }
  }

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supplierId) {
      setError('پێش دروستکردنی داواکاری، دابینکەر زیاد بکە.')
      return
    }
    const validItems = items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), unitCost: Number(item.unitCost) }))
    if (validItems.some((item) => !item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unitCost) || item.unitCost < 0)) {
      setError('کاڵا، بڕ و نرخی دروست بۆ هەموو ڕیزەکان دیاری بکە.')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const order = await api.createPurchase({ supplierId, notes: orderNotes.trim(), items: validItems })
      setItems([{ ...emptyItem, productId: products[0]?.id ?? '', unitCost: String(products[0]?.purchasePrice ?? 0) }])
      setOrderNotes('')
      await load()
      setSuccess(`داواکاری ${order.orderNumber} دروست کرا. بۆ زیادکردنی کۆگا، کاڵاکان وەربگرە.`)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا داواکاری کڕین دروست بکرێت.')
    } finally {
      setBusy(false)
    }
  }

  const receiveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!receivingOrder) return
    const paidAmount = Number(receivedPaidAmount)
    if (!Number.isSafeInteger(paidAmount) || paidAmount < 0 || paidAmount > receivingOrder.subtotalAmount) {
      setError('پارەی دراو دەبێت لە سفر تا کۆی داواکاری بێت.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.receivePurchase(receivingOrder.id, { paidAmount, paymentMethod: receivedPaymentMethod })
      setReceivingOrder(null)
      setReceivedPaidAmount('0')
      await Promise.all([load(), onStockReceived()])
      setSuccess('کاڵاکان وەرگیران؛ کۆگا و قەرزی دابینکەر نوێ کرانەوە.')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا کاڵاکان وەربگیرێن.')
    } finally {
      setBusy(false)
    }
  }

  const paySupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(paymentAmount)
    const supplier = suppliers.find((item) => item.id === paymentSupplierId)
    if (!supplier || !Number.isSafeInteger(amount) || amount <= 0) {
      setError('دابینکەر و بڕی پارەدان بە دروستی دیاری بکە.')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.paySupplier(paymentSupplierId, { amount, paymentMethod, note: paymentNote.trim() })
      setPaymentAmount('')
      setPaymentNote('')
      await load()
      setSuccess('پارەدانی دابینکەر تۆمار کرا.')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا پارەدان تۆمار بکرێت.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="purchasing-view">
      <div className="purchasing-heading"><div><span className="eyebrow">کڕین و دابینکەر</span><h2>داواکارییەکانی کڕین</h2><p>کاڵا داوا بکە، کاتێک گەیشتن وەریان بگرە و قەرزی دابینکەر بەڕێوەببە.</p></div><div className="purchasing-heading-actions"><button className="button button-secondary" onClick={() => setSupplierModal(true)}>+ زیادکردنی دابینکەر</button><button className="button button-secondary" onClick={() => { void load() }}>نوێکردنەوە</button></div></div>
      {error && <div className="report-error" role="alert">{error}</div>}
      {success && <div className="accounting-success" role="status">✓ {success}</div>}
      <div className="purchasing-kpis"><article><span>دابینکەران</span><strong>{suppliers.length}</strong></article><article><span>داواکاریی چاوەڕوان</span><strong>{pendingOrders}</strong></article><article className={debtTotal > 0 ? 'purchase-debt-kpi' : ''}><span>قەرزی دابینکەران</span><strong dir="ltr">{format(debtTotal)} <small>د.ع</small></strong></article></div>
      <div className="purchasing-grid">
        <section className="panel purchase-create-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">+</span><div><h3>داواکاریی کڕینی نوێ</h3><p>داواکارییەکە تا وەرگرتن کۆگای ناگۆڕێت.</p></div></div>{loading ? <div className="report-section-empty">داتاکان بار دەکرێن...</div> : !suppliers.length || !products.length ? <div className="report-section-empty">{!suppliers.length ? 'سەرەتا دابینکەر زیاد بکە.' : 'بۆ کڕین، پێویستە کاڵا لە کۆگادا تۆمار کرابێت.'}</div> : <form className="purchase-form" onSubmit={createOrder}><label className="form-field">دابینکەر<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><div className="purchase-item-heading"><strong>کاڵاکان</strong><button type="button" className="text-action" onClick={() => setItems((current) => [...current, { ...emptyItem, productId: products[0]?.id ?? '', unitCost: String(products[0]?.purchasePrice ?? 0) }])}>+ زیادکردنی ڕیز</button></div>{items.map((item, index) => <div className="purchase-item-row" key={index}><label className="form-field">کاڵا<select value={item.productId} onChange={(event) => { const selected = products.find((product) => product.id === event.target.value); updateItem(index, { productId: event.target.value, unitCost: String(selected?.purchasePrice ?? 0) }) }}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · کۆگا {format(product.quantity)}</option>)}</select></label><label className="form-field">بڕ<input required type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} dir="ltr" /></label><label className="form-field">نرخی دانە<input required type="number" min="0" step="1" value={item.unitCost} onChange={(event) => updateItem(index, { unitCost: event.target.value })} dir="ltr" /></label>{items.length > 1 && <button className="purchase-remove-row" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="سڕینەوەی ڕیز">×</button>}</div>)}<label className="form-field">تێبینی<input maxLength={240} value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="ژمارەی داواکاریی دابینکەر یان تێبینی" /></label><div className="purchase-order-total"><span>کۆی داواکاری</span><strong dir="ltr">{format(orderTotal)} د.ع</strong></div><button className="button button-primary" disabled={busy}>تۆمارکردنی داواکاری</button></form>}</section>
        <section className="panel supplier-payment-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon cash-icon">د.ع</span><div><h3>پارەدان بە دابینکەر</h3><p>پارەدان لە قەرزی دابینکەر کەم دەکاتەوە.</p></div></div>{suppliers.length ? <form className="purchase-form" onSubmit={paySupplier}><label className="form-field">دابینکەر<select value={paymentSupplierId} onChange={(event) => setPaymentSupplierId(event.target.value)}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · قەرز {format(supplier.balance)} د.ع</option>)}</select></label><label className="form-field">بڕی پارەدان<input required type="number" min="1" max={suppliers.find((item) => item.id === paymentSupplierId)?.balance ?? 0} step="1" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} dir="ltr" /></label><label className="form-field">شێوازی پارەدان<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'electronic')}><option value="cash">نەقد</option><option value="electronic">ئەلیکترۆنی</option></select></label><label className="form-field">تێبینی<input maxLength={180} value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="ئارەزوومەندانە" /></label><button className="button button-secondary" disabled={busy || (suppliers.find((item) => item.id === paymentSupplierId)?.balance ?? 0) <= 0}>تۆمارکردنی پارەدان</button></form> : <div className="report-section-empty">بۆ تۆمارکردنی پارەدان، دابینکەر زیاد بکە.</div>}</section>
      </div>
      <section className="panel purchase-orders-panel"><div className="inventory-section-title"><div><h3>مێژووی داواکارییەکان</h3><p>وەرگرتنی کاڵا کۆگاکە زیاد و بڕی دابینکەرەکە قەرز دەکات.</p></div><span className="report-section-count">{orders.length}</span></div>{orders.length ? <div className="purchase-order-list">{orders.map((order) => <article className="purchase-order-card" key={order.id}><div className="purchase-order-header"><div><strong>{order.orderNumber}</strong><span>{order.supplierName} · {new Date(order.createdAt).toLocaleDateString('ckb')}</span></div><span className={`purchase-status ${order.status}`}>{order.status === 'ordered' ? 'چاوەڕوانی وەرگرتن' : order.status === 'received' ? 'وەرگیراوە' : 'هەڵوەشێنراوەتەوە'}</span></div><div className="purchase-order-lines">{order.items.map((item) => <span key={item.id}>{item.productName} · {format(item.quantity)} × {format(item.unitCost)} د.ع</span>)}</div><div className="purchase-order-footer"><span>کۆی کڕین <strong dir="ltr">{format(order.subtotalAmount)} د.ع</strong></span><span>پارەدراو <strong dir="ltr">{format(order.paidAmount)} د.ع</strong></span>{order.status === 'ordered' && <button className="button button-primary receive-order-button" onClick={() => { setReceivingOrder(order); setReceivedPaidAmount('0') }}>وەرگرتنی کاڵا</button>}</div></article>)}</div> : <div className="report-section-empty">هێشتا داواکاریی کڕین تۆمار نەکراوە.</div>}</section>
      {supplierModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSupplierModal(false) }}><section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title"><div className="modal-heading"><div><span className="eyebrow">دابینکەر</span><h2 id="supplier-modal-title">زیادکردنی دابینکەری نوێ</h2></div><button className="modal-close" onClick={() => setSupplierModal(false)} aria-label="داخستن">×</button></div><form className="inventory-form" onSubmit={addSupplier}><label className="form-field full-field">ناوی دابینکەر<input autoFocus required maxLength={100} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label><label className="form-field full-field">ژمارەی مۆبایل<input maxLength={40} value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} dir="ltr" /></label><label className="form-field full-field">تێبینی<input maxLength={240} value={supplierNotes} onChange={(event) => setSupplierNotes(event.target.value)} /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setSupplierModal(false)}>پاشگەزبوونەوە</button><button className="button button-primary" disabled={busy}>پاشەکەوتکردنی دابینکەر</button></div></form></section></div>}
      {receivingOrder && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setReceivingOrder(null) }}><section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="receive-order-title"><div className="modal-heading"><div><span className="eyebrow">{receivingOrder.orderNumber}</span><h2 id="receive-order-title">وەرگرتنی کاڵاکان</h2></div><button className="modal-close" onClick={() => setReceivingOrder(null)} aria-label="داخستن">×</button></div><p className="modal-description">دوای پشتڕاستکردنەوە، {receivingOrder.items.length} ڕیزی کاڵا بە تەواوی زیاد دەکرێنە کۆگا.</p><div className="purchase-order-total"><span>کۆی داواکاری</span><strong dir="ltr">{format(receivingOrder.subtotalAmount)} د.ع</strong></div><form className="inventory-form" onSubmit={receiveOrder}><label className="form-field full-field">پارەی ئێستا دراو<input type="number" min="0" max={receivingOrder.subtotalAmount} step="1" value={receivedPaidAmount} onChange={(event) => setReceivedPaidAmount(event.target.value)} dir="ltr" /></label><label className="form-field full-field">شێوازی پارەدان<select value={receivedPaymentMethod} onChange={(event) => setReceivedPaymentMethod(event.target.value as 'cash' | 'electronic')}><option value="cash">نەقد</option><option value="electronic">ئەلیکترۆنی</option></select></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setReceivingOrder(null)}>پاشگەزبوونەوە</button><button className="button button-primary" disabled={busy}>پشتڕاستکردنەوەی وەرگرتن</button></div></form></section></div>}
    </section>
  )
}

export default PurchasingView
