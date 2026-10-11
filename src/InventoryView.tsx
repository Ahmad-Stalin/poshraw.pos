import { useMemo, useState, type FormEvent } from 'react'
import type { Product, StockAdjustment } from './inventoryTypes'

type ProductDraft = Omit<Product, 'updatedAt'>
type ModalName = 'product' | 'category' | 'adjust' | null

type InventoryViewProps = {
  products: Product[]
  categories: string[]
  adjustments: StockAdjustment[]
  onSaveProduct: (product: Product, isNew: boolean) => Promise<string | undefined>
  onAddCategory: (category: string) => Promise<string | undefined>
  onAdjustStock: (productId: string, amount: number, reason: string) => Promise<string | undefined>
}

const emptyDraft: ProductDraft = {
  id: '',
  name: '',
  category: '',
  barcode: '',
  purchasePrice: 0,
  salePrice: 0,
  quantity: 0,
  minimumStock: 0,
  unit: 'دانە',
  status: 'active',
  description: '',
  imageUrl: '',
  images: [],
}

const numberFormat = new Intl.NumberFormat('en-US')
const formatPrice = (value: number) => numberFormat.format(value)

function InventoryView({ products, categories, adjustments, onSaveProduct, onAddCategory, onAdjustStock }: InventoryViewProps) {
  const [modal, setModal] = useState<ModalName>(null)
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [categoryDraft, setCategoryDraft] = useState('')
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'remove'>('add')
  const [adjustReason, setAdjustReason] = useState('')
  const [formError, setFormError] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const matchesQuery = !normalizedQuery || `${product.name} ${product.category} ${product.barcode}`.toLocaleLowerCase().includes(normalizedQuery)
      const matchesCategory = !categoryFilter || product.category === categoryFilter
      return matchesQuery && matchesCategory
    })
  }, [products, query, categoryFilter])

  const lowStockCount = products.filter((product) => product.quantity <= product.minimumStock).length
  const inventoryValue = products.reduce((total, product) => total + product.quantity * product.purchasePrice, 0)

  const openProductModal = (product?: Product) => {
    setDraft(product ? { ...product } : { ...emptyDraft })
    setFormError('')
    setModal('product')
  }

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const isNew = !draft.id
    const product: Product = {
      ...draft,
      name: draft.name.trim(),
      category: draft.category.trim(),
      barcode: draft.barcode.trim(),
      updatedAt: new Date().toISOString(),
    }
    const error = await onSaveProduct(product, isNew)
    if (error) {
      setFormError(error)
      return
    }
    setModal(null)
  }

  const submitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const error = await onAddCategory(categoryDraft.trim())
    if (error) {
      setFormError(error)
      return
    }
    setCategoryDraft('')
    setFormError('')
    setModal(null)
  }

  const submitAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(adjustAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('تکایە ژمارەیەکی گەورەتر لە سفر بنووسە.')
      return
    }
    const error = await onAdjustStock(adjustProductId, adjustDirection === 'add' ? amount : -amount, adjustReason.trim())
    if (error) {
      setFormError(error)
      return
    }
    setModal(null)
  }

  const openAdjustmentModal = (product?: Product) => {
    setAdjustProductId(product?.id ?? products[0]?.id ?? '')
    setAdjustAmount('')
    setAdjustDirection('add')
    setAdjustReason('')
    setFormError('')
    setModal('adjust')
  }

  return (
    <section className="inventory-view">
      <div className="inventory-page-heading">
        <div>
          <span className="eyebrow">کۆگا و کاڵاکان</span>
          <h2>لیستی کاڵاکان</h2>
          <p>کاڵا، نرخ، بارکۆد و بڕی کۆگاکەت بەڕێوە ببە.</p>
        </div>
        <div className="inventory-actions">
          <button className="button button-secondary" onClick={() => { setCategoryDraft(''); setFormError(''); setModal('category') }}>+ پۆلی نوێ</button>
          <button className="button button-secondary" onClick={() => openAdjustmentModal()} disabled={products.length === 0}>± ڕێکخستنی کۆگا</button>
          <button className="button button-primary" onClick={() => openProductModal()}>+ زیادکردنی کاڵا</button>
        </div>
      </div>

      <div className="inventory-stats">
        <article className="inventory-stat"><span>کۆی کاڵاکان</span><strong>{products.length}</strong><small>کاڵای تۆمارکراو</small></article>
        <article className="inventory-stat"><span>پۆلەکان</span><strong>{categories.length}</strong><small>پۆلی بەردەست</small></article>
        <article className="inventory-stat"><span>کەمبوونی کۆگا</span><strong className={lowStockCount ? 'stat-warning' : ''}>{lowStockCount}</strong><small>پێویستی بە پشکنین</small></article>
        <article className="inventory-stat"><span>بەهای کۆگا</span><strong className="inventory-value" dir="ltr">{formatPrice(inventoryValue)} <small>د.ع</small></strong><small>بەپێی نرخی کڕین</small></article>
      </div>

      <div className="panel inventory-table-panel">
        <div className="inventory-toolbar">
          <div className="inventory-toolbar-title"><h3>هەموو کاڵاکان</h3><span>{products.length}</span></div>
          <div className="inventory-filters">
            <label className="inventory-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="گەڕان بە ناو یان بارکۆد..." aria-label="گەڕان لە کاڵاکان" /></label>
            <select className="inventory-filter" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="فلتەر بە پۆل">
              <option value="">هەموو پۆلەکان</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </div>

        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead><tr><th>وێنە</th><th>کاڵا</th><th>پۆل</th><th>نرخی کڕین</th><th>نرخی فرۆشتن</th><th>بڕی کۆگا</th><th>بارودۆخ</th><th>کردار</th></tr></thead>
            <tbody>
              {visibleProducts.map((product) => {
                const status = product.quantity === 0 ? 'out' : product.quantity <= product.minimumStock ? 'low' : 'in-stock'
                return <tr key={product.id}>
                  <td><div className="product-cell"><span className="product-symbol">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px' }} /> : '▧'}</span><span><strong>{product.name}</strong><small>{product.barcode || 'بارکۆد نییە'}</small></span></div></td>
                  <td><span className="category-label">{product.category}</span></td>
                  <td><span className="price-cell" dir="ltr">{formatPrice(product.purchasePrice)} <small>د.ع</small></span></td>
                  <td><span className="price-cell" dir="ltr">{formatPrice(product.salePrice)} <small>د.ع</small></span></td>
                  <td><span className="quantity-cell">{numberFormat.format(product.quantity)} <small>{product.unit}</small></span></td>
                  <td><span className={`stock-badge ${status}`}>{status === 'in-stock' ? 'بەردەست' : status === 'low' ? 'کەمە' : 'تەواو بووە'}</span></td>
                  <td><div className="row-actions"><button className="row-action-button" title="ڕێکخستنی بڕی کۆگا" aria-label={`ڕێکخستنی کۆگای ${product.name}`} onClick={() => openAdjustmentModal(product)}>±</button><button className="row-action-button" title="دەستکاریکردن" aria-label={`دەستکاریکردنی ${product.name}`} onClick={() => openProductModal(product)}>✎</button></div></td>
                </tr>
              })}
            </tbody>
          </table>
          {visibleProducts.length === 0 && <div className="inventory-list-empty"><span className="table-empty-icon">▧</span><strong>{products.length ? 'هیچ کاڵایەک نەدۆزرایەوە' : 'هێشتا کاڵا تۆمار نەکراوە'}</strong><span>{products.length ? 'گەڕان یان فلتەرەکە بگۆڕە.' : 'بۆ دەستپێکردن یەکەم کاڵاکەت زیاد بکە.'}</span>{products.length === 0 && <button className="button button-primary" onClick={() => openProductModal()}>+ زیادکردنی یەکەم کاڵا</button>}</div>}
        </div>
      </div>

      <div className="panel category-panel"><div className="inventory-section-title"><div><h3>پۆلەکان</h3><p>پۆلەکان بۆ ڕێکخستن و فلتەرکردنی کاڵاکان</p></div><button className="text-action" onClick={() => { setCategoryDraft(''); setFormError(''); setModal('category') }}>+ زیادکردنی پۆل</button></div><div className="category-chips">{categories.length ? categories.map((category) => <button key={category} className={`category-chip ${categoryFilter === category ? 'selected' : ''}`} onClick={() => setCategoryFilter(categoryFilter === category ? '' : category)}>{category}<span>{products.filter((product) => product.category === category).length}</span></button>) : <span className="muted-empty">هێشتا پۆلێک زیاد نەکراوە.</span>}</div></div>
      
      <div className="panel adjustments-panel"><div className="inventory-section-title"><div><h3>دوایین ڕێکخستنەکانی کۆگا</h3><p>تۆماری زیادکردن و کەمکردنەوەی بڕی کاڵا</p></div><button className="text-action" onClick={() => openAdjustmentModal()} disabled={products.length === 0}>+ ڕێکخستنی کۆگا</button></div>{adjustments.length ? <div className="adjustment-list">{adjustments.slice(0, 5).map((adjustment) => <div className="adjustment-row" key={adjustment.id}><span className={`adjustment-sign ${adjustment.amount > 0 ? 'added' : 'removed'}`}>{adjustment.amount > 0 ? '+' : '−'}</span><span className="adjustment-product"><strong>{adjustment.productName}</strong><small>{adjustment.reason}</small></span><span className={`adjustment-amount ${adjustment.amount > 0 ? 'added' : 'removed'}`} dir="ltr">{adjustment.amount > 0 ? '+' : ''}{numberFormat.format(adjustment.amount)}</span><time>{new Date(adjustment.createdAt).toLocaleDateString('ckb')}</time></div>)}</div> : <div className="adjustments-empty">هێشتا هیچ ڕێکخستنێکی کۆگا تۆمار نەکراوە.</div>}</div>
      
      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}><section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title">
        <div className="modal-heading"><div><span className="eyebrow">بەڕێوەبردنی کۆگا</span><h2 id="inventory-modal-title">{modal === 'product' ? draft.id ? 'دەستکاریکردنی کاڵا' : 'زیادکردنی کاڵای نوێ' : modal === 'category' ? 'زیادکردنی پۆل' : 'ڕێکخستنی بڕی کۆگا'}</h2></div><button className="modal-close" onClick={() => setModal(null)} aria-label="داخستن">×</button></div>
        {modal === 'product' && <form onSubmit={submitProduct} className="inventory-form"><label className="form-field full-field">ناوی کاڵا<input autoFocus required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="ناوی کاڵا بنووسە" /></label><div className="form-grid"><label className="form-field">پۆل<input list="inventory-categories" required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="پۆل هەڵبژێرە یان بنووسە" /><datalist id="inventory-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label><label className="form-field">بارکۆد<input maxLength={80} value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} placeholder="بارکۆدی کاڵا" dir="ltr" /></label><label className="form-field">نرخی کڕین (د.ع)<input required type="number" min="0" step="1" value={draft.purchasePrice} onChange={(event) => setDraft({ ...draft, purchasePrice: Number(event.target.value) })} dir="ltr" /></label><label className="form-field">نرخی فرۆشتن (د.ع)<input required type="number" min="0" step="1" value={draft.salePrice} onChange={(event) => setDraft({ ...draft, salePrice: Number(event.target.value) })} dir="ltr" /></label><label className="form-field">بڕی ئێستای کۆگا<input required type="number" min="0" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} dir="ltr" /></label><label className="form-field">بڕی ئاگادارکردنەوە<input required type="number" min="0" step="1" value={draft.minimumStock} onChange={(event) => setDraft({ ...draft, minimumStock: Number(event.target.value) })} dir="ltr" /></label><label className="form-field">یەکە<select value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}><option>دانە</option><option>پاکەت</option><option>کیلوگرام</option><option>مەتر</option><option>لیتر</option></select></label><label className="form-field">بارودۆخ<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Product['status'] })}><option value="active">بەکارهێنراو</option><option value="draft">مەسۆڵە</option><option value="archived">سەرکەوتوو بووە</option></select></label></div><label className="form-field full-field">وێنەی کاڵا (URL)<input type="text" value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} placeholder="https://example.com/image.jpg" dir="ltr" /><div className="image-preview" style={{ marginTop: '8px' }}>{draft.imageUrl && <img src={draft.imageUrl} alt={draft.name || 'وێنەی کاڵا'} style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '8px', border: '1px solid #e9eee9' }} />}</div></label><label className="form-field full-field">وەسف<input maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="وەسفی وردی کاڵا (اختیاری)" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>پاشگەزبوونەوە</button><button type="submit" className="button button-primary">{draft.id ? 'نوێکردنەوە' : 'پاشەکەوتکردن'}</button></div></form>}
        {modal === 'category' && <form onSubmit={submitCategory} className="inventory-form"><p className="modal-description">پۆلێک دروست بکە بۆ ڕێکخستن و دۆزینەوەی ئاسانتر.</p><label className="form-field full-field">ناوی پۆل<input autoFocus required maxLength={60} value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} placeholder="بۆ نموونە: خواردەمەنی" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>پاشگەزبوونەوە</button><button type="submit" className="button button-primary">پاشەکەوتکردنی پۆل</button></div></form>}
        {modal === 'adjust' && <form onSubmit={submitAdjustment} className="inventory-form"><label className="form-field full-field">کاڵا<select required value={adjustProductId} onChange={(event) => setAdjustProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {numberFormat.format(product.quantity)} {product.unit}</option>)}</select></label><div className="form-grid"><label className="form-field">جۆری ڕێکخستن<select value={adjustDirection} onChange={(event) => setAdjustDirection(event.target.value as 'add' | 'remove')}><option value="add">زیادکردنی بڕ</option><option value="remove">کەمکردنەوەی بڕ</option></select></label><label className="form-field">بڕ<input autoFocus required type="number" min="1" step="1" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} dir="ltr" /></label></div><label className="form-field full-field">هۆکار<input required maxLength={120} value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="هۆکاری گۆڕانکاری بنووسە" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>پاشگەزبوونەوە</button><button type="submit" className="button button-primary">تۆمارکردنی ڕێکخستن</button></div></form>}
      </section></div>}
    </section>
  )
}

export default InventoryView