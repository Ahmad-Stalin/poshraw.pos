import { useState, type FormEvent, useEffect } from 'react'
import { api, ApiError, type AccountingData } from './api'

type AccountingViewProps = {
  data: AccountingData | null
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  onAccountingChanged: () => Promise<void>
}

const format = (value: number) => new Intl.NumberFormat('en-US').format(value)
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ckb', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'هێشتا ژمێریاری نەکراوە'
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`

function AccountingView({ data, loading, error, onRefresh, onAccountingChanged }: AccountingViewProps) {
  const [taxName, setTaxName] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [expenseTitle, setExpenseTitle] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseMethod, setExpenseMethod] = useState<'cash' | 'electronic'>('cash')
  const [expenseNote, setExpenseNote] = useState('')
  const [taxPaymentAmount, setTaxPaymentAmount] = useState('')
  const [taxPaymentMethod, setTaxPaymentMethod] = useState<'cash' | 'electronic'>('electronic')
  const [taxPaymentNote, setTaxPaymentNote] = useState('')
  const [cashDirection, setCashDirection] = useState<'in' | 'out'>('in')
  const [cashAmount, setCashAmount] = useState('')
  const [cashNote, setCashNote] = useState('')
  const [countedBalance, setCountedBalance] = useState('')
  const [reconcileNote, setReconcileNote] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#4b9061')

  const loadCategories = async () => {
    try {
      const data = await api.expenseCategories()
      setCategories(data)
    } catch { /* ignore category load failure */ }
  }

  useEffect(() => { void loadCategories() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const runAction = async (action: () => Promise<void>, message: string) => {
    setSaving(true)
    setFormError('')
    setSuccess('')
    try {
      await action()
      await onAccountingChanged()
      setSuccess(message)
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'نەتوانرا کردارەکە تەواو بکرێت.')
    } finally {
      setSaving(false)
    }
  }

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return
    await runAction(async () => {
      await api.createExpenseCategory({ name, color: newCategoryColor })
      setNewCategoryName('')
      await loadCategories()
    }, 'پۆلی خەرجی زیاد کرا.')
  }

  const deleteCategory = async (id: string) => {
    await runAction(async () => {
      await api.deleteExpenseCategory(id)
      setExpenseCategory('')
      await loadCategories()
    }, 'پۆلی خەرجی سڕایەوە.')
  }

  const exportCsv = () => {
    if (!data) return
    const rows: Array<Array<string | number>> = [
      ['ژمێریاری', `ماوە: ${data.days} ڕۆژ`, `لە ${data.startDate}`],
      [],
      ['پوختە', 'فرۆشتن بەبێ باژ', 'باژی کۆکراوە', 'باژی ماوە', 'قازانجی خام', 'خەرجییەکان', 'قازانجی پاک', 'پسووڵە'],
      [data.summary.revenue, data.summary.taxCollected, data.taxSummary.payable, data.summary.grossProfit, data.summary.expenses, data.summary.netProfit, data.summary.salesCount],
      [],
      ['داهات بەپێی دراو'],
      ['دراو', 'پسووڵە', 'داهات', 'باژ', 'تێچووی کاڵا', 'قازانجی خام'],
      ...data.currencyBreakdown.map((row) => [row.currencyCode === 'IQD' ? 'ع.د' : row.currencyCode === 'USD' ? '$' : row.currencyCode === 'EUR' ? '€' : row.currencyCode, row.salesCount, row.revenue, row.taxCollected, row.costOfGoods, row.grossProfit]),
      [],
      ['تێچووی کاڵا بەپێی پۆل'],
      ['پۆلی کاڵا', 'تێچووی کاڵا'],
      ...data.cogsByCategory.map((row) => [row.category, row.cogs]),
      [],
      ['خەرجییە نوێیەکان'],
      ['خەرجی', 'پۆل', 'شێوازی پارەدان', 'بڕ', 'بەروار'],
      ...data.expenses.map((expense) => [expense.title, expense.category, expense.paymentMethod === 'cash' ? 'نەقد' : 'ئەلیکترۆنی', expense.amount, timestamp(expense.createdAt)]),
      [],
      ['جووڵەکانی سندوق'],
      ['جۆر', 'هۆکار', 'بڕ', 'بەروار'],
      ...data.cashMovements.map((movement) => [movement.kind === 'sale' ? 'فرۆشتن' : movement.kind === 'expense' ? 'خەرجی' : 'جووڵە', movement.note, movement.amount, timestamp(movement.createdAt)]),
      [],
      ['پارەدانەکانی باژ'],
      ['بڕ', 'شێوازی پارەدان', 'تێبینی', 'بەروار'],
      ...data.taxPayments.map((payment) => [payment.amount, payment.paymentMethod === 'cash' ? 'نەقد' : 'ئەلیکترۆنی', payment.note || '—', timestamp(payment.createdAt)]),
      [],
      ['هاوسەنگی سندوق'],
      ['بەروار', 'چاوەڕوانکراو', 'ژمێردراو', 'جیاوازی', 'تێبینی'],
      ...data.reconciliations.map((row) => [timestamp(row.createdAt), row.expectedBalance, row.countedBalance, row.variance, row.note || '—']),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `poshraw-accounting-${data.startDate}-${data.days}days.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const printAccounting = () => {
    document.body.classList.add('printing-accounting')
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-accounting'), { once: true })
    window.print()
  }

  const saveTax = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const percentage = Number(taxRate)
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setFormError('ڕێژەی باژ دەبێت لە ٠٪ تا ١٠٠٪ بێت.')
      return
    }
    await runAction(async () => {
      await api.saveTaxSettings(Math.round(percentage * 100), taxName.trim() || 'باژ')
      await onRefresh()
    }, 'ڕێکخستنی باژ پاشەکەوت کرا. ئەم ڕێژەیە تەنها بۆ فرۆشتنی نوێ بەکاردێت.')
  }

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(expenseAmount)
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setFormError('بڕی خەرجی دەبێت ژمارەیەکی تەواوی گەورەتر لە سفر بێت.')
      return
    }
    await runAction(async () => {
      await api.addExpense({ title: expenseTitle.trim(), category: expenseCategory, amount, paymentMethod: expenseMethod, note: expenseNote.trim() })
      setExpenseTitle('')
      setExpenseCategory('')
      setExpenseAmount('')
      setExpenseNote('')
    }, 'خەرجییەکە تۆمار کرا.')
  }

  const submitTaxPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(taxPaymentAmount)
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setFormError('بڕی پارەدانی باژ دەبێت ژمارەیەکی تەواوی گەورەتر لە سفر بێت.')
      return
    }
    await runAction(async () => {
      await api.remitTax({ amount, paymentMethod: taxPaymentMethod, note: taxPaymentNote.trim() })
      setTaxPaymentAmount('')
      setTaxPaymentNote('')
    }, 'پارەدانی باژ تۆمار کرا و باژی ماوە نوێ کرایەوە.')
  }

  const submitCashAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(cashAmount)
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setFormError('بڕی سندوق دەبێت ژمارەیەکی تەواوی گەورەتر لە سفر بێت.')
      return
    }
    await runAction(async () => {
      await api.addCashAdjustment({ direction: cashDirection, amount, note: cashNote.trim() })
      setCashAmount('')
      setCashNote('')
    }, 'جووڵەی سندوق تۆمار کرا.')
  }

  const submitReconciliation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const counted = Number(countedBalance)
    if (!Number.isSafeInteger(counted) || counted < 0) {
      setFormError('بڕی پارەی ژمێردراو دەبێت ژمارەیەکی تەواوی سفر یان زیاتر بێت.')
      return
    }
    await runAction(async () => {
      await api.reconcileCash({ countedBalance: counted, note: reconcileNote.trim() })
      setCountedBalance('')
      setReconcileNote('')
    }, 'ژمێریاری سندوق پاشەکەوت کرا.')
  }

  const summary = data?.summary ?? { revenue: 0, taxCollected: 0, costOfGoods: 0, grossProfit: 0, salesCount: 0, expenses: 0, netProfit: 0 }
  const taxSummary = data?.taxSummary ?? { collectedAllTime: 0, remittedAllTime: 0, remittedInPeriod: 0, payable: 0 }
  const currencyBreakdown = data?.currencyBreakdown ?? []
  const cogsByCategory = data?.cogsByCategory ?? []
  const expenses = data?.expenses ?? []
  const reconciliations = data?.reconciliations ?? []
  const taxPayments = data?.taxPayments ?? []
  const cashMovements = data?.cashMovements ?? []
  const taxSettings = data?.taxSettings ?? { taxRateBps: 0, taxName: 'باژ', updatedAt: '' }

  if (loading && !data) {
    return <section className="accounting-view"><div className="panel report-loading">داتای ژمێریاری بار دەکرێت...</div></section>
  }

  if (error && !data) {
    return <section className="accounting-view"><div className="report-error" role="alert">{error}</div></section>
  }

  if (!data) {
    return <section className="accounting-view"><div className="panel report-loading">داتای ژمێریاری بەردەست نییە.</div></section>
  }

  return (
    <section className="accounting-view">
      <div className="accounting-heading"><div><span className="eyebrow">پارە، باژ و سندوق</span><h2>ژمێریاری تەواو</h2><p>خەرجییەکان، باژی فرۆشتن و هاوسەنگی سندوق لێرە بەڕێوە ببە.</p></div><div className="accounting-heading-actions"><span className="accounting-period">پوختەی {data.days} ڕۆژی ڕابردوو</span><button className="button button-secondary" onClick={() => { void onRefresh() }}>نوێکردنەوە</button><button className="button button-secondary" disabled={!data} onClick={exportCsv}>هەناردەی CSV</button><button className="button button-primary" disabled={!data} onClick={printAccounting}>چاپ / PDF</button></div></div>
      {error && <div className="report-error" role="alert">{error}</div>}
      {formError && <div className="report-error" role="alert">{formError}</div>}
      {success && <div className="accounting-success" role="status">✓ {success}</div>}
      <div className="accounting-kpis">
        <article className="accounting-kpi"><span>فرۆشتن بەبێ باژ</span><strong dir="ltr">{format(summary.revenue)} <small>د.ع</small></strong></article>
        <article className="accounting-kpi"><span>باژی کۆکراوە</span><strong className="tax-value" dir="ltr">{format(summary.taxCollected)} <small>د.ع</small></strong></article>
        <article className="accounting-kpi payable-kpi"><span>باژی ماوە بۆ پارەدان</span><strong dir="ltr">{format(taxSummary.payable)} <small>د.ع</small></strong></article>
        <article className="accounting-kpi"><span>قازانجی خام</span><strong dir="ltr">{format(summary.grossProfit)} <small>د.ع</small></strong></article>
        <article className={`accounting-kpi ${summary.netProfit < 0 ? 'negative-kpi' : 'net-kpi'}`}><span>قازانجی پاک</span><strong dir="ltr">{format(summary.netProfit)} <small>د.ع</small></strong></article>
        <article className="accounting-kpi expense-kpi"><span>خەرجییەکان</span><strong dir="ltr">{format(summary.expenses)} <small>د.ع</small></strong></article>
      </div>
      {currencyBreakdown.length > 1 && <div className="accounting-currency-breakdown"><span className="currency-breakdown-label">داهات بەپێی دراو:</span>{currencyBreakdown.map((row) => <article className="currency-chip" key={row.currencyCode}><span>{row.currencyCode === 'IQD' ? 'ع.د' : row.currencyCode === 'USD' ? '$' : row.currencyCode === 'EUR' ? '€' : row.currencyCode}</span><strong dir="ltr">{format(row.revenue)} <small>د.ع</small></strong><small>{row.salesCount} پسووڵە</small></article>)}</div>}
      <p className="profit-formula">قازانجی خام = فرۆشتن − تێچووی کاڵا · قازانجی پاک = قازانجی خام − خەرجییەکان. باژ جیاوازە و لە قازانجدا ناژمێردرێت.</p>
      <div className="accounting-forms-grid">
        <section className="panel accounting-form-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">٪</span><div><h3>ڕێکخستنی باژی فرۆشتن</h3><p>باژ وەک زیادە لەسەر نرخی کاڵا لە پسووڵەدا زیاد دەکرێت.</p></div></div><form className="accounting-form" onSubmit={saveTax}><label className="form-field">ناوی باژ<input value={taxName || taxSettings.taxName} onChange={(event) => setTaxName(event.target.value)} maxLength={30} required /></label><label className="form-field">ڕێژەی باژ (%)<input type="number" min="0" max="100" step="0.01" value={taxRate || (taxSettings.taxRateBps / 100).toString()} onChange={(event) => setTaxRate(event.target.value)} dir="ltr" required /></label><div className="accounting-inline-note">ڕێژەی ئێستا: {taxSettings.taxRateBps / 100}% · کاریگەری لەسەر پسووڵە پێشووتر ناکات.</div><button className="button button-primary" disabled={saving}>پاشەکەوتکردنی ڕێژە</button></form></section>
        <section className="panel accounting-form-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon expense-icon">−</span><div><h3>تۆمارکردنی خەرجی</h3><p>کرێ، مووچە، گواستنەوە و خەرجییەکانی تر.</p></div></div><form className="accounting-form" onSubmit={submitExpense}><label className="form-field full-field">ناوی خەرجی<input required maxLength={100} value={expenseTitle} onChange={(event) => setExpenseTitle(event.target.value)} placeholder="ناوی خەرجی" /></label><div className="form-grid"><label className="form-field">پۆل<select required value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option value="">پۆل هەڵبژێرە</option>{categories.map((cat) => <option key={cat.id} value={cat.name}>{cat.name}</option>)}</select></label><label className="form-field">بڕ (د.ع)<input required type="number" min="1" step="1" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} dir="ltr" /></label></div><div className="form-grid"><label className="form-field">شێوازی پارەدان<select value={expenseMethod} onChange={(event) => setExpenseMethod(event.target.value as 'cash' | 'electronic')}><option value="cash">پارەی نەقد</option><option value="electronic">بانک / ئەلیکترۆنی</option></select></label><label className="form-field">تێبینی<input maxLength={240} value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} placeholder="ئارەزوومەندانە" /></label></div><button className="button button-primary" disabled={saving}>تۆمارکردنی خەرجی</button></form><form className="accounting-form category-form" onSubmit={addCategory} style={{marginTop: 10}}><div className="form-grid"><label className="form-field">پۆلی نوێ<input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={50} placeholder="ناوی پۆلی نوێ" /></label><label className="form-field">ڕەنگ<input type="color" value={newCategoryColor} onChange={(event) => setNewCategoryColor(event.target.value)} /></label></div><button className="button button-secondary" type="submit" disabled={saving || !newCategoryName.trim()}>زیادکردنی پۆل</button></form><div className="category-list">{categories.map((cat) => <div key={cat.id} className="category-row" style={{borderLeftColor: cat.color}}><span>{cat.name}</span><button className="icon-button" onClick={() => deleteCategory(cat.id)} aria-label={`سڕینەوەی ${cat.name}`}>×</button></div>)}</div></section>
        <section className="panel accounting-form-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon tax-payment-icon">٪</span><div><h3>پارەدانی باژ</h3><p>باژی کۆکراوە پارە بدە؛ زیاتر لە باژی ماوە ڕێگەپێدراو نییە.</p></div></div><div className="tax-payable-note">باژی ماوە: <strong dir="ltr">{format(taxSummary.payable)} د.ع</strong></div><form className="accounting-form" onSubmit={submitTaxPayment}><div className="form-grid"><label className="form-field">بڕی پارەدان<input required type="number" min="1" max={taxSummary.payable} step="1" value={taxPaymentAmount} onChange={(event) => setTaxPaymentAmount(event.target.value)} dir="ltr" /></label><label className="form-field">شێوازی پارەدان<select value={taxPaymentMethod} onChange={(event) => setTaxPaymentMethod(event.target.value as 'cash' | 'electronic')}><option value="electronic">بانک / ئەلیکترۆنی</option><option value="cash">پارەی نەقد</option></select></label></div><label className="form-field">ژمارەی پسووڵە یان تێبینی<input maxLength={240} value={taxPaymentNote} onChange={(event) => setTaxPaymentNote(event.target.value)} placeholder="ئارەزوومەندانە" /></label><button className="button button-primary" disabled={saving || taxSummary.payable <= 0}>تۆمارکردنی پارەدانی باژ</button></form></section>
        <section className="panel accounting-form-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon cash-icon">د.ع</span><div><h3>جووڵەی دەستیی سندوق</h3><p>پارەی زیادە یان دەرهێنانی پارە بە هۆکاری ڕوون تۆمار بکە.</p></div></div><form className="accounting-form" onSubmit={submitCashAdjustment}><div className="form-grid"><label className="form-field">جۆری جووڵە<select value={cashDirection} onChange={(event) => setCashDirection(event.target.value as 'in' | 'out')}><option value="in">زیادکردنی پارە</option><option value="out">دەرهێنانی پارە</option></select></label><label className="form-field">بڕ (د.ع)<input required type="number" min="1" step="1" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} dir="ltr" /></label></div><label className="form-field">هۆکار<input required maxLength={160} value={cashNote} onChange={(event) => setCashNote(event.target.value)} placeholder="بۆچی سندوق گۆڕا؟" /></label><button className="button button-secondary" disabled={saving}>تۆمارکردنی جووڵە</button></form></section>
        <section className="panel accounting-form-panel reconciliation-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon reconcile-icon">✓</span><div><h3>هاوسەنگی سندوق</h3><p>پارەی ئێستا لە سندوقدا بژمێرە و لەگەڵ چاوەڕوانکراو بەراوردی بکە.</p></div></div><div className="cash-balance-cards"><div><span>چاوەڕوانکراو</span><strong dir="ltr">{format(data.cash?.expectedBalance ?? 0)} <small>د.ع</small></strong></div><div><span>دوایین ژمێریاری</span><strong>{timestamp(data.cash?.lastReconciledAt)}</strong></div></div><form className="accounting-form" onSubmit={submitReconciliation}><label className="form-field">پارەی ژمێردراو (د.ع)<input required type="number" min="0" step="1" value={countedBalance} onChange={(event) => setCountedBalance(event.target.value)} dir="ltr" /></label><label className="form-field">تێبینی<input maxLength={240} value={reconcileNote} onChange={(event) => setReconcileNote(event.target.value)} placeholder="تێبینیی ژمێریاری" /></label><button className="button button-primary" disabled={saving}>کۆتاییهێنان بە ژمێریاری</button></form></section>
      </div>
      {cogsByCategory.length > 0 && <section className="panel accounting-ledger-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">📦</span><div><h3>تێچووی کاڵا بەپێی پۆل</h3><p>تێچووی کاڵای فرۆشراو لە ماوەی ڕاپۆرتەکەدا</p></div></div>{cogsByCategory.length ? <div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>پۆلی کاڵا</th><th>تێچووی کاڵا</th></tr></thead><tbody>{cogsByCategory.map((row) => <tr key={row.category}><td><strong>{row.category}</strong></td><td className="expense-amount" dir="ltr">−{format(row.cogs)} د.ع</td></tr>)}</tbody></table></div> : <div className="report-section-empty">هێشتا تێچووی کاڵا نییە.</div>}</section>}
      <section className="panel accounting-ledger-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon">≡</span><div><h3>خەرجییە نوێیەکان</h3><p>دوایین تۆمارەکانی خەرجی و شێوازی پارەدان</p></div></div>{expenses.length ? <div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>خەرجی</th><th>پۆل</th><th>شێوازی پارەدان</th><th>بڕ</th><th>بەروار</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td><strong>{expense.title}</strong><small>{expense.note || expense.enteredBy}</small></td><td>{expense.category}</td><td>{expense.paymentMethod === 'cash' ? 'نەقد' : 'ئەلیکترۆنی'}</td><td className="expense-amount" dir="ltr">−{format(expense.amount)} د.ع</td><td>{timestamp(expense.createdAt)}</td></tr>)}</tbody></table></div> : <div className="report-section-empty">هێشتا هیچ خەرجییەک تۆمار نەکراوە.</div>}</section>
      <section className="panel accounting-ledger-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon cash-icon">د.ع</span><div><h3>جووڵەی سندوق و ژمێریارییەکان</h3><p>ژمێریارییەکان و جیاوازیی نێوان پارەی چاوەڕوانکراو و ژمێردراو</p></div></div>{reconciliations.length ? <div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>بەروار</th><th>چاوەڕوانکراو</th><th>ژمێردراو</th><th>جیاوازی</th><th>تێبینی</th></tr></thead><tbody>{reconciliations.map((row) => <tr key={row.id}><td>{timestamp(row.createdAt)}</td><td dir="ltr">{format(row.expectedBalance)} د.ع</td><td dir="ltr">{format(row.countedBalance)} د.ع</td><td className={row.variance === 0 ? 'balanced-variance' : 'unbalanced-variance'} dir="ltr">{row.variance > 0 ? '+' : ''}{format(row.variance)} د.ع</td><td>{row.note || '—'}</td></tr>)}</tbody></table></div> : <div className="report-section-empty">هێشتا ژمێریاریی سندوق تۆمار نەکراوە.</div>}</section>
      <section className="panel accounting-ledger-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon tax-payment-icon">٪</span><div><h3>پارەدانەکانی باژ</h3><p>کۆی پارەدراو: {format(taxSummary.remittedAllTime)} د.ع</p></div></div>{taxPayments.length ? <div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>بەروار</th><th>بڕ</th><th>شێوازی پارەدان</th><th>تێبینی</th></tr></thead><tbody>{taxPayments.map((payment) => <tr key={payment.id}><td>{timestamp(payment.createdAt)}</td><td className="tax-paid-amount" dir="ltr">{format(payment.amount)} د.ع</td><td>{payment.paymentMethod === 'cash' ? 'نەقد' : 'ئەلیکترۆنی'}</td><td>{payment.note || '—'}</td></tr>)}</tbody></table></div> : <div className="report-section-empty">هێشتا پارەدانی باژ تۆمار نەکراوە.</div>}</section>
      <section className="panel accounting-ledger-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon cash-icon">د.ع</span><div><h3>جووڵەکانی سندوق</h3><p>تا ٣٠ جووڵەی دواوە؛ فرۆشتن و خەرجیی نەقد و ڕێکخستنی دەستی.</p></div></div>{cashMovements.length ? <div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>جۆر</th><th>هۆکار</th><th>بڕ</th><th>بەروار</th></tr></thead><tbody>{cashMovements.map((movement) => <tr key={movement.id}><td>{movement.kind === 'sale' ? 'فرۆشتن' : movement.kind === 'expense' ? 'خەرجی' : 'جووڵە'}</td><td>{movement.note}</td><td className={movement.amount >= 0 ? 'balanced-variance' : 'unbalanced-variance'} dir="ltr">{movement.amount > 0 ? '+' : ''}{format(movement.amount)} د.ع</td><td>{timestamp(movement.createdAt)}</td></tr>)}</tbody></table></div> : <div className="report-section-empty">هێشتا جووڵەی نەقدی نییە.</div>}</section>
    </section>
  )
}
export default AccountingView
