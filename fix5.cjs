const fs = require('fs')
const path = require('path')

let content = fs.readFileSync(path.join(__dirname, 'src/SalesView.tsx'), 'utf8')

// Find and replace the corrupted label
const oldStr = '<label className="form-field">کاûalselect value={productId}'
const newStr = '<label className="form-field">کاûalselect value={productId}'

if (content.includes(oldStr)) {
  content = content.replace(oldStr, newStr)
  fs.writeFileSync(path.join(__dirname, 'src/SalesView.tsx'), content)
  console.log('Fixed!')
} else {
  console.log('Not found')
  // Show what's actually there
  const idx = content.indexOf('کاûalselect')
  if (idx >= 0) {
    console.log('Found at', idx)
    console.log('Before:', content.substring(idx - 20, idx))
    console.log('After:', content.substring(idx, idx + 20))
  }
}