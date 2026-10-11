const fs = require('fs')
const path = require('path')

let lines = fs.readFileSync(path.join(__dirname, 'src/SalesView.tsx'), 'utf8').split('\n')

// Line 149 (index 148) is corrupted - replace it with proper JSX
const newLine = '          {loading ? <div className="sales-empty">کاûاکان بار دەکرێن...</div> : products.length === 0 ? <div className="sales-empty"><strong>کاûا بەردەست نییە</strong><span>پێش تۆمارکردنی فرۆشتن، کاûا و بەری کۆگا زیاد بکە.</span></div> : <form className="sale-add-form" onSubmit={addLine}><label className="form-field">گەران بە ناو<input type="text" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(filteredProducts[0]?.id ?? \'\') }} placeholder="ناوی کاûا بنووسە..." dir="ltr" /></label><label className="form-field">کاûalselect value={productId} onChange={(event) => { setProductId(event.target.value); setProductSearch(products.find((p) => p.id === event.target.value)?.name ?? \'\') }}>{filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {format(product.salePrice)} د.ع · بەردەست: {format(product.quantity)} {product.unit}</option>)}</select></label><div className="sale-add-bottom"><label className="form-field">بûinput type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} dir="ltr" required /></label><button className="button button-primary" type="submit">+ زیادکردن</button></div></form>}'

lines[148] = newLine
fs.writeFileSync(path.join(__dirname, 'src/SalesView.tsx'), lines.join('\n'))
console.log('Done')