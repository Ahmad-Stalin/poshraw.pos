const fs = require('fs')
const path = require('path')

let content = fs.readFileSync(path.join(__dirname, 'src/SalesView.tsx'), 'utf8')

// Find the product select line and add search box before it
const lines = content.split('\n')
let found = false
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('select value={productId}') && lines[i].includes('کا')) {
    const indent = lines[i].match(/^(\s*)/)[1]
    // Replace the select with search input + select
    lines[i] = indent + '<label className="form-field">گەران بە ناو<input type="text" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(filteredProducts[0]?.id ?? \'\') }} placeholder="ناوی کا بنووسە..." dir="ltr" /></label>'
    // Insert the select after this line
    lines.splice(i + 1, 0, indent + '<label className="form-field">کاalselect value={productId} onChange={(event) => { setProductId(event.target.value); setProductSearch(products.find((p) => p.id === event.target.value)?.name ?? \'\') }}>{filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {format(product.salePrice)} د.ع · بەردەست: {format(product.quantity)} {product.unit}</option>)}</select></label>')
    found = true
    break
  }
}

if (found) {
  fs.writeFileSync(path.join(__dirname, 'src/SalesView.tsx'), lines.join('\n'))
  console.log('Fixed SalesView.tsx')
} else {
  console.log('Line not found')
}