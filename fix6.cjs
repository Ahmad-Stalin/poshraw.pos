const fs = require('fs')
const path = require('path')

let content = fs.readFileSync(path.join(__dirname, 'src/SalesView.tsx'), 'utf8')

// Replace the entire corrupted line 149 with a clean version
const lines = content.split('\n')

// Find the line that contains the corrupted product search/select
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('گەران بە ناو') && lines[i].includes('productSearch')) {
    // This is the corrupted line - replace it
    const indent = '          '
    lines[i] = indent + '{loading ? <div className="sales-empty">کاûاکان بار دەکرێن...</div> : products.length === 0 ? <div className="sales-empty"><strong>کاûا بەردەست نییە</strong><span>پێش تۆمارکردنی فرۆشتن، کاûا و بەری کۆگا زیاد بکە.</span></div> : <form className="sale-add-form" onSubmit={addLine}><label className="form-field">گەران بە ناو<input type="text" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(filteredProducts[0]?.id ?? \'\') }} placeholder="ناوی کاûا بنووسە..." dir="ltr" /></label><label className="form-field">کاûalselect value={productId} onChange={(event) => { setProductId(event.target.value); setProductSearch(products.find((p) => p.id === event.target.value)?.name ?? \'\') }}>{filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {format(product.salePrice)} د.ع · بەردەست: {format(product.quantity)} {product.unit}</option>)}</select></label><div className="sale-add-bottom"><label className="form-field">بûinput type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} dir="ltr" required /></label><button className="button button-primary" type="submit">+ زیادکردن</button></div></form>}'
    break
  }
}

fs.writeFileSync(path.join(__dirname, 'src/SalesView.tsx'), lines.join('\n'))
console.log('Done')