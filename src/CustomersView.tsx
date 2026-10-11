import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, type CustomersData } from './api'
import type { AppRole } from './authTypes'

type CustomersViewProps = { role: AppRole; onCustomersChanged: () => Promise<void> }
const format = (value: number) => new Intl.NumberFormat('en-US').format(value)

function CustomersView({ role, onCustomersChanged }: CustomersViewProps) {
  const isOwner = role === 'owner'
  const [data, setData] = useState<CustomersData | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'electronic'>('cash')
  const [paymentNote, setPaymentNote] = useState('')
  const [loyaltyRate, setLoyaltyRate] = useState('')
  const [redeemPoints, setRedeemPoints] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const result = await api.customers()
      setData(result)
      setSelectedId((current) => result.customers.some((customer) => customer.id === current) ? current : result.customers[0]?.id ?? '')
      setError('')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا کڕیاران بار بکرێن.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const customers = useMemo(() => data?.customers ?? [], [data])
  const filteredCustomers = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    return customers.filter((customer) => !value || `${customer.name} ${customer.phone}`.toLocaleLowerCase().includes(value))
  }, [customers, query])
  const selected = customers.find((customer) => customer.id === selectedId) ?? null

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await action()
      await Promise.all([load(), onCustomersChanged()])
      setSuccess(message)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا کردارەکە ئەنجام بدرێت.')
    } finally {
      setBusy(false)
    }
  }

  const createCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await run(async () => {
      const customer = await api.createCustomer({ name: name.trim(), phone: phone.trim(), notes: notes.trim() })
      setSelectedId(customer.id)
      setName('')
      setPhone('')
      setNotes('')
      setNewCustomerOpen(false)
    }, 'کڕیار تۆمار کرا.')
  }

  const collectPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const amount = Number(paymentAmount)
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError('بڕی پارەدان بنووسە.'); return }
    await run(() => api.payCustomerBalance(selected.id, { amount, paymentMethod, note: paymentNote.trim() }), 'پارەدانی کڕیار تۆمار کرا.')
    setPaymentAmount('')
    setPaymentNote('')
  }

  const saveLoyalty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(loyaltyRate)
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError('بڕی داهات بۆ خاڵ دەبێت ژمارەیەکی گەورەتر لە سفر بێت.'); return }
    await run(() => api.updateLoyaltySettings(amount), 'ڕێکخستنی وەفاداری پاشەکەوت کرا.')
    setLoyaltyRate('')
  }

  const redeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const points = Number(redeemPoints)
    if (!Number.isSafeInteger(points) || points <= 0) { setError('ژمارەی خاڵی دروست بنووسە.'); return }
    await run(() => api.redeemLoyaltyPoints(selected.id, points, 'بەکارهێنانی خاڵ بۆ پاداشت'), 'خاڵەکان بەکار هێنران.')
    setRedeemPoints('')
  }

  return (
    <section className="customers-view">
      <div className="customers-heading"><div><span className="eyebrow">کڕیار و پاداشت</span><h2>هەژماری کڕیاران</h2><p>مێژووی کڕین، قەرز و خاڵەکانی وەفاداری بەڕێوەببە.</p></div><button className="button button-primary" onClick={() => setNewCustomerOpen(true)}>+ زیادکردنی کڕیار</button></div>
      {error && <p className="report-error" role="alert">{error}</p>}{success && <p className="accounting-success" role="status">✓ {success}</p>}
       {isOwner && <section className="panel loyalty-settings-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">♥</span><div><h3>ڕێکخستنی بەرنامەی وەفاداری</h3><p>{data?.loyaltySettings.amountPerPoint ? `هەر ${format(data.loyaltySettings.amountPerPoint)} د.ع = ١ خاڵ` : 'بۆ چالاککردنی خاڵ، بڕی پارە بۆ هەر خاڵ دیاری بکە.'}</p></div></div><form className="loyalty-rate-form" onSubmit={saveLoyalty}><label className="form-field">داهات بۆ هەر خاڵ (د.ع)<input type="number" min="1" step="1" value={loyaltyRate} onChange={(event) => setLoyaltyRate(event.target.value)} dir="ltr" placeholder={String(data?.loyaltySettings.amountPerPoint || '')} required /></label></form></section>}
      
      <div className="customers-layout"><aside className="panel customer-directory"><div className="customer-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="گەڕان بە ناو یان مۆبایل..." aria-label="گەڕان لە کڕیاران" /></div>{filteredCustomers.length ? <div className="customer-list">{filteredCustomers.map((customer) => <button className={`customer-list-item ${selectedId === customer.id ? 'selected' : ''}`} key={customer.id} onClick={() => setSelectedId(customer.id)}><span className="customer-avatar">{customer.name.slice(0, 1)}</span><span className="customer-item-copy"><strong>{customer.name}</strong><small>{customer.phone || 'ژمارەی مۆبایل نییە'}</small></span><span className="customer-points-badge">{format(customer.points)} ♥</span></button>)}</div> : <div className="customer-list-empty">{query ? 'کڕیار نەدۆزرایەوە.' : 'هێشتا کڕیارێک تۆمار نەکراوە.'}</div>}</aside>
        
        {selected ? <section className="customer-detail"><div className="panel customer-profile-panel"><div className="customer-profile-heading"><span className="customer-large-avatar">{selected.name.slice(0, 1)}</span><div><h3>{selected.name}</h3><p>{selected.phone || 'ژمارەی مۆبایل تۆمار نەکراوە'}</p></div><span className="customer-since">تۆمارکراوە {new Date(selected.createdAt).toLocaleDateString('ckb')}</span></div><div className="customer-stat-grid"><article><span>قەرزی ماوە</span><strong className={selected.balance > 0 ? 'customer-debt' : ''} dir="ltr">{format(selected.balance)} د.ع</strong></article><article><span>خاڵی وەفاداری</span><strong className="loyalty-points">{format(selected.points)} ♥</strong></article><article><span>پسووڵەکان</span><strong>{format(selected.salesCount)}</strong></article></div></div>
          <div className="customer-actions-grid">
            {selected.balance > 0 && <section className="panel customer-action-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon cash-icon">د.ع</span><div><h3>وەرگرتنی پارەی قەرز</h3><p>قەرزی کڕیار: {format(selected.balance)} د.ع</p></div></div><form className="customer-action-form" onSubmit={collectPayment}><label className="form-field">بڕی پارەدان<input type="number" min="1" max={selected.balance} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} dir="ltr" required /></label><label className="form-field">شێوازی پارەدان<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'electronic')}><option value="cash">نەقد</option><option value="electronic">ئەلیکترۆنی</option></select></label><label className="form-field">تێبینی<input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} maxLength={180} /></label><button className="button button-primary" disabled={busy}>تۆمارکردنی پارەدان</button></form></section>}
            {selected.points > 0 && <section className="panel customer-action-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">♥</span><div><h3>بەکارهێنانی خاڵی پاداشت</h3><p>{format(selected.points)} خاڵی بەردەست</p></div></div><form className="customer-action-form" onSubmit={redeem}><label className="form-field">ژمارەی خاڵ<input type="number" min="1" max={selected.points} value={redeemPoints} onChange={(event) => setRedeemPoints(event.target.value)} dir="ltr" required /></label><button className="button button-secondary" disabled={busy}>تۆمارکردنی پاداشت</button></form></section>}
          </div>
          
          <section className="panel customer-history-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">▤</span><div><h3>مێژووی کڕین</h3><p>پسووڵە و بارودۆخی پارەدانی کڕیار</p></div></div>{selected.purchaseHistory.length ? <div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>پسووڵە</th><th>کۆی گشتی</th><th>پارەدراو</th><th>قەرزی ماوە</th><th>بەروار</th></tr></thead><tbody>{selected.purchaseHistory.map((sale) => <tr key={sale.id}><td><strong>{sale.receiptNumber}</strong></td><td dir="ltr">{format(sale.totalAmount)} د.ع</td><td dir="ltr">{format(sale.amountPaid)} د.ع</td><td className={sale.isCredit ? 'customer-debt' : ''} dir="ltr">{sale.isCredit ? format(sale.totalAmount - sale.amountPaid) : '0'} د.ع</td><td>{new Date(sale.createdAt).toLocaleDateString('ckb')}</td></tr>)}</tbody></table></div> : <div className="report-section-empty">مێژووی کڕینی نییە.</div>}</section>
          <section className="panel customer-history-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">♥</span><div><h3>مێژووی خاڵەکان</h3><p>خاڵی بەدەستهاتوو و بەکارهاتوو</p></div></div>{selected.loyaltyHistory.length ? <div className="loyalty-history-list">{selected.loyaltyHistory.map((entry) => <div className="loyalty-history-row" key={entry.id}><span className={entry.points > 0 ? 'points-earned' : 'points-used'}>{entry.points > 0 ? '+' : ''}{format(entry.points)} خاڵ</span><span>{entry.note}</span><time>{new Date(entry.createdAt).toLocaleDateString('ckb')}</time></div>)}</div> : <div className="report-section-empty">هێشتا خاڵی وەفاداری نییە.</div>}</section>
        </section> : <section className="panel customer-detail-empty"><span className="section-empty-art">♙</span><h3>{loading ? 'کڕیاران بار دەکرێن...' : 'کڕیار هەڵبژێرە یان زیاد بکە'}</h3><p>پسووڵەکان دەتوانرێن بە هەژماری کڕیارەوە ببەسترێن.</p><button className="button button-primary" onClick={() => setNewCustomerOpen(true)}>+ زیادکردنی کڕیار</button></section>}
      </div>
      
      {newCustomerOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setNewCustomerOpen(false) }}><section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title"><div className="modal-heading"><div><span className="eyebrow">کڕیار</span><h2 id="customer-modal-title">تۆمارکردنی کڕیاری نوێ</h2></div><button className="modal-close" onClick={() => setNewCustomerOpen(false)} aria-label="داخستن">×</button></div><form className="inventory-form" onSubmit={createCustomer}><label className="form-field full-field">ناوی کڕیار<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="form-field full-field">ژمارەی مۆبایل<input maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" /></label><label className="form-field full-field">تێبینی<input maxLength={240} value={notes} onChange={(event) => setNotes(event.target.value)} /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setNewCustomerOpen(false)}>پاشگەزبوونەوە</button><button className="button button-primary" disabled={busy}>پاشەکەوتکردنی کڕیار</button></div></form></section></div>}
    </section>
   )
 }

 export default CustomersView
