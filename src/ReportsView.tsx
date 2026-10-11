import type { SalesReport } from './api'

type ReportsViewProps = {
  data: SalesReport | null
  days: number
  loading: boolean
  error: string
  onDaysChange: (days: number) => void
  onRefresh: () => void
}

const format = (value: number) => new Intl.NumberFormat('en-US').format(value)
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('ckb', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const timeLabel = (value: string) => new Date(value).toLocaleString('ckb', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`

function ReportsView({ data, days, loading, error, onDaysChange, onRefresh }: ReportsViewProps) {
  const maxRevenue = Math.max(1, ...(data?.salesTimeline.map((day) => day.revenue) ?? [0]))
  const totalMovements = data?.stockMovements.reduce((sum, item) => sum + Math.abs(item.amount), 0) ?? 0

  const exportCsv = () => {
    if (!data) return
    const rows: Array<Array<string | number>> = [
      ['ڕاپۆرتی ژمێریاری', `ماوە: ${data.days} ڕۆژ`, `لە ${data.startDate}`],
      ['پوختە', 'داهات', data.summary.revenue, 'قازانجی خام', data.summary.profit, 'باژی کۆکراوە', data.summary.taxCollected, 'پسووڵە', data.summary.salesCount],
      ['پوختەی صادرات', 'داهات لە صادرات (کرێکان تێدایە)', data.summary.revenue_export, 'قازانجی خامی صادرات', data.summary.profit_export],
      [],
      ['فرۆشتنی ڕۆژانە'],
      ['بەروار', 'داهات بەبێ باژ', 'قازانجی خام', 'ژمارەی پسووڵە'],
      ...data.salesTimeline.map((day) => [day.date, day.revenue, day.profit, day.salesCount]),
      [],
      ['ئاگادارکردنەوەی کۆگا'],
      ['کاڵا', 'بارکۆد', 'بڕی ئێستا', 'کەمترین بڕ', 'یەکە'],
      ...data.lowStock.map((product) => [product.name, product.barcode, product.quantity, product.minimumStock, product.unit]),
      [],
      ['جووڵەی کۆگا'],
      ['بەروار', 'کاڵا', 'بڕی گۆڕان', 'هۆکار'],
      ...data.stockMovements.map((movement) => [movement.createdAt, movement.productName, movement.amount, movement.reason]),
      [],
      ['مێژووی گۆڕانی نرخ'],
      ['بەروار', 'کاڵا', 'نرخی کڕینی کۆن', 'نرخی کڕینی نوێ', 'نرخی فرۆشتنی کۆن', 'نرخی فرۆشتنی نوێ'],
      ...data.priceChanges.map((change) => [change.createdAt, change.productName, change.oldPurchasePrice, change.newPurchasePrice, change.oldSalePrice, change.newSalePrice]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `sawza-report-${data.startDate}-${data.days}days.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => {
    document.body.classList.add('printing-reports')
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-reports'), { once: true })
    window.print()
  }

  return (
    <section className="reports-view">
      <div className="reports-heading"><div><span className="eyebrow">ڕاپۆرت و ئاگادارکردنەوە</span><h2>ڕاپۆرت و چاودێری</h2><p>داهات، قازانج، جووڵەی کۆگا و گۆڕانی نرخەکان.</p></div><div className="reports-controls"><select value={days} onChange={(event) => onDaysChange(Number(event.target.value))} aria-label="ماوەی ڕاپۆرت"><option value={7}>٧ ڕۆژ</option><option value={30}>٣٠ ڕۆژ</option><option value={90}>٩٠ ڕۆژ</option></select><button className="button button-secondary" onClick={onRefresh}>نوێکردنەوە</button><button className="button button-secondary" disabled={!data} onClick={exportCsv}>هەناردەی CSV</button><button className="button button-primary" disabled={!data} onClick={printReport}>چاپ / PDF</button></div></div>
      {error && <div className="report-error" role="alert">{error}</div>}
      {loading && !data ? <div className="panel report-loading">داتای ڕاپۆرت بار دەکرێت...</div> : data && <>
        <div className="report-kpis">
          <article className="report-kpi"><span>کۆی فرۆشتن</span><strong dir="ltr">{format(data.summary.revenue)} <small>د.ع</small></strong><small>لە {data.days} ڕۆژی ڕابردوو</small></article>
          <article className="report-kpi"><span>قازانجی خام</span><strong className={data.summary.profit < 0 ? 'negative-value' : 'positive-value'} dir="ltr">{format(data.summary.profit)} <small>د.ع</small></strong><small>داهاتی کاڵا و کرێکان بەبێ باژ − تێچووی کڕین</small></article>
          <article className="report-kpi"><span>ژمارەی پسووڵە</span><strong>{format(data.summary.salesCount)}</strong><small>{format(data.summary.unitsSold)} دانە فرۆشراوە</small></article>
          <article className={`report-kpi ${data.lowStock.length ? 'alert-kpi' : ''}`}><span>کاڵای کەمبوو</span><strong>{format(data.lowStock.length)}</strong><small>{data.lowStock.length ? 'پێویستی بە پشکنین هەیە' : 'هەموو کۆگا لە ئاستی باشە'}</small></article>
          <article className="report-kpi"><span>داهاتی صادرات</span><strong dir="ltr">{format(data.summary.revenue_export)} <small>د.ع</small></strong><small>بەبێ باژ؛ کرێی ناردن و گومرک تێدایە</small></article>
          <article className="report-kpi"><span>قازانجی خامی صادرات</span><strong className={data.summary.profit_export < 0 ? 'negative-value' : 'positive-value'} dir="ltr">{format(data.summary.profit_export)} <small>د.ع</small></strong><small>پێش کەمکردنەوەی خەرجییەکان</small></article>
        </div>
        <section className="panel report-chart-panel"><div className="report-panel-heading"><div><h3>فرۆشتن و قازانج</h3><p>ستوونی سەوز داهاتی فرۆشتنە؛ ستوونی ڕووناک ژمارەی پسووڵەکانە.</p></div><span className="report-range">{dateLabel(data.startDate)} ـ {dateLabel(data.salesTimeline.at(-1)?.date ?? data.startDate)}</span></div>{data.summary.salesCount === 0 ? <div className="report-empty-chart"><span>⌁</span><strong>هێشتا فرۆشتن تۆمار نەکراوە</strong><small>دوای تۆمارکردنی فرۆشتن، ڕاپۆرتی داهات و قازانج لێرە دەردەکەوێت.</small></div> : <div className={`sales-chart bars-${data.days === 7 ? 7 : 30}`} style={{ gridTemplateColumns: `repeat(${data.days}, minmax(0, 1fr))` }} role="img" aria-label="هێڵکاری فرۆشتن بەپێی ڕۆژ">{data.salesTimeline.map((day, index) => { const isLabel = data.days <= 7 || index % (data.days === 30 ? 5 : 15) === 0 || index === data.days - 1; return <div className="sales-chart-day" key={day.date} title={`${dateLabel(day.date)}: ${format(day.revenue)} د.ع · ${day.salesCount} پسووڵە`}><div className="sales-chart-bars"><span className="sale-count-bar" style={{ height: `${day.salesCount ? Math.max(8, Math.min(100, day.salesCount * 14)) : 2}%` }} /><span className="sale-revenue-bar" style={{ height: `${day.revenue ? Math.max(5, day.revenue / maxRevenue * 100) : 2}%` }} /></div>{isLabel && <small>{dateLabel(day.date)}</small>}</div> })}</div>}</section>
        <div className="report-lower-grid">
          <section className="panel report-section"><div className="report-panel-heading"><div><h3>ئاگادارکردنەوەی کۆگا</h3><p>کاڵای گەیشتووەتە ئاستی کەمترین بڕ</p></div><span className={`report-section-count ${data.lowStock.length ? 'warning-count' : ''}`}>{data.lowStock.length}</span></div>{data.lowStock.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>کاڵا</th><th>بڕی ئێستا</th><th>کەمترین بڕ</th><th>بارودۆخ</th></tr></thead><tbody>{data.lowStock.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.barcode || 'بارکۆد نییە'}</small></td><td>{format(product.quantity)} {product.unit}</td><td>{format(product.minimumStock)} {product.unit}</td><td><span className={`stock-badge ${product.quantity === 0 ? 'out' : 'low'}`}>{product.quantity === 0 ? 'تەواو بووە' : 'کەمە'}</span></td></tr>)}</tbody></table></div> : <div className="report-section-empty">✓ <span>هیچ ئاگادارکردنەوەیەکی کەمبوونی کۆگا نییە.</span></div>}</section>
          <section className="panel report-section"><div className="report-panel-heading"><div><h3>جووڵەی کۆگا</h3><p>{format(totalMovements)} دانە گۆڕان لە ٣٠ تۆماری دواوەدا</p></div></div>{data.stockMovements.length ? <div className="report-list">{data.stockMovements.slice(0, 7).map((movement) => <div className="report-list-row" key={movement.id}><span className={`movement-symbol ${movement.amount > 0 ? 'movement-in' : 'movement-out'}`}>{movement.amount > 0 ? '+' : '−'}</span><span className="report-list-main"><strong>{movement.productName}</strong><small>{movement.reason}</small></span><span className={`movement-amount ${movement.amount > 0 ? 'movement-in' : 'movement-out'}`} dir="ltr">{movement.amount > 0 ? '+' : ''}{format(movement.amount)}</span><time>{timeLabel(movement.createdAt)}</time></div>)}</div> : <div className="report-section-empty">هێشتا هیچ جووڵەیەکی کۆگا نییە.</div>}</section>
        </div>
        <section className="panel report-section price-history-section"><div className="report-panel-heading"><div><h3>گۆڕانی نرخەکان</h3><p>تۆماری نرخە کۆن و نوێیەکانی کاڵاکان</p></div><span className="report-section-count">{data.priceChanges.length}</span></div>{data.priceChanges.length ? <div className="report-table-wrap"><table className="report-table price-history-table"><thead><tr><th>کاڵا</th><th>نرخی کڕین</th><th>نرخی فرۆشتن</th><th>کاتی گۆڕان</th></tr></thead><tbody>{data.priceChanges.map((change) => <tr key={change.id}><td><strong>{change.productName}</strong></td><td><span className="price-delta" dir="ltr">{format(change.oldPurchasePrice)} <i>←</i> {format(change.newPurchasePrice)} د.ع</span></td><td><span className="price-delta" dir="ltr">{format(change.oldSalePrice)} <i>←</i> {format(change.newSalePrice)} د.ع</span></td><td>{timeLabel(change.createdAt)}</td></tr>)}</tbody></table></div> : <div className="report-section-empty">هێشتا هیچ گۆڕانێکی نرخ تۆمار نەکراوە.</div>}</section>
      </>}
    </section>
  )
}

export default ReportsView
