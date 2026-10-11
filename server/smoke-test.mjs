import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'sawza-api-test-'))
const databasePath = path.join(temporaryDirectory, 'test.sqlite')
const legacyDatabase = new Database(databasePath)
legacyDatabase.exec(`CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  total_cost INTEGER NOT NULL,
  created_at TEXT NOT NULL
)`)
legacyDatabase.close()
const portServer = net.createServer()
await new Promise((resolve, reject) => portServer.listen(0, '127.0.0.1', resolve).once('error', reject))
const { port } = portServer.address()
await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()))

const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath, SAWZA_SMOKE_TEST: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk })
server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk })
const baseUrl = `http://127.0.0.1:${port}`
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Test server exited early:\n${serverOutput}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch { /* Wait until the server is listening. */ }
    await delay(100)
  }
  throw new Error(`Timed out waiting for test server:\n${serverOutput}`)
}

async function request(endpoint, { method = 'GET', body, cookie, origin, forwardedHost, forwardedProto } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
      ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
      ...(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const responseBody = response.status === 204 ? null : await response.json()
  return { response, body: responseBody, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

try {
  await waitForServer()
  const bootstrap = await request('/api/bootstrap')
  assert.equal(bootstrap.body.setupRequired, true)
  assert.equal(bootstrap.body.user, null)
  assert.equal((await request('/api/inventory')).response.status, 401)

  assert.equal((await request('/api/auth/setup', {
    method: 'POST',
    origin: 'https://attacker.example',
    forwardedHost: `127.0.0.1:${port}`,
    forwardedProto: 'http',
    body: { name: 'Invalid origin', username: 'invalid-origin', password: 'test-password-123' },
  })).response.status, 403)
  const ownerSetup = await request('/api/auth/setup', {
    method: 'POST',
    origin: 'https://sawza.example',
    forwardedHost: 'sawza.example',
    forwardedProto: 'https',
    body: { name: 'Test Owner', username: 'test-owner', password: 'test-password-123' },
  })
  assert.equal(ownerSetup.response.status, 201)
  assert.equal(ownerSetup.body.user.role, 'owner')
  assert.ok(ownerSetup.cookie)
  const ownerCookie = ownerSetup.cookie
  const proxyLogin = await request('/api/auth/login', {
    method: 'POST',
    origin: 'https://sawza.example',
    forwardedHost: 'sawza.example',
    forwardedProto: 'https',
    body: { username: 'test-owner', password: 'test-password-123' },
  })
  assert.equal(proxyLogin.response.status, 200)
  assert.equal(proxyLogin.body.user.username, 'test-owner')

  const initialInventory = await request('/api/inventory', { cookie: ownerCookie })
  assert.equal(initialInventory.response.status, 200)
  assert.deepEqual(initialInventory.body.products, [])
  assert.deepEqual(initialInventory.body.categories, [])

  const category = await request('/api/categories', { method: 'POST', cookie: ownerCookie, body: { name: 'Test category' } })
  assert.equal(category.response.status, 201)
  const product = await request('/api/products', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: 'Test product', category: 'Test category', barcode: 'barcode-001', purchasePrice: 500, salePrice: 800, quantity: 3, minimumStock: 1, unit: 'each' },
  })
  assert.equal(product.response.status, 201)
  assert.equal(product.body.quantity, 3)
  const taxUpdate = await request('/api/accounting/tax-settings', { method: 'PATCH', cookie: ownerCookie, body: { taxRateBps: 500, taxName: 'VAT' } })
  assert.equal(taxUpdate.response.status, 200)
  assert.equal(taxUpdate.body.taxRateBps, 500)
  assert.equal((await request('/api/products', {
    method: 'POST', cookie: ownerCookie,
    body: { name: 'Duplicate', category: 'Test category', barcode: 'barcode-001', purchasePrice: 1, salePrice: 1, quantity: 1, minimumStock: 0, unit: 'each' },
  })).response.status, 409)
  assert.equal((await request('/api/stock-adjustments', { method: 'POST', cookie: ownerCookie, body: { productId: product.body.id, amount: -4, reason: 'too much' } })).response.status, 400)
  assert.equal((await request('/api/stock-adjustments', { method: 'POST', cookie: ownerCookie, body: { productId: product.body.id, amount: 4, reason: 'received stock' } })).response.status, 201)
  const sale = await request('/api/sales', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.body.id, quantity: 6 }] } })
  assert.equal(sale.response.status, 201)
  assert.equal(sale.body.subtotalAmount, 4800)
  assert.equal(sale.body.taxAmount, 240)
  assert.equal(sale.body.totalAmount, 5040)
  assert.equal(sale.body.totalCost, 3000)
  assert.equal(sale.body.profit, 1800)
  assert.equal(sale.body.taxName, 'VAT')
  const saleHistory = await request('/api/sales', { cookie: ownerCookie })
  assert.equal(saleHistory.response.status, 200)
  assert.equal(saleHistory.body[0].receiptNumber, sale.body.receiptNumber)
  const invoice = await request(`/api/sales/${sale.body.id}`, { cookie: ownerCookie })
  assert.equal(invoice.response.status, 200)
  assert.equal(invoice.body.taxName, 'VAT')
  assert.equal(invoice.body.items[0].productName, 'Test product')
  assert.equal(invoice.body.sellerName, 'Test Owner')
  const saleProducts = await request('/api/sales/products', { cookie: ownerCookie })
  assert.equal(saleProducts.body[0].barcode, 'barcode-001')
  assert.equal((await request('/api/sales', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.body.id, quantity: 2 }] } })).response.status, 409)
  const inventory = await request('/api/inventory', { cookie: ownerCookie })
  assert.equal(inventory.body.products[0].quantity, 1)
  assert.equal(inventory.body.adjustments[0].amount, -6)

  const updatedProduct = await request(`/api/products/${product.body.id}`, {
    method: 'PUT', cookie: ownerCookie,
    body: { ...product.body, purchasePrice: 550, salePrice: 900, quantity: 1, minimumStock: 1 },
  })
  assert.equal(updatedProduct.response.status, 200)
  const report = await request('/api/reports?days=30', { cookie: ownerCookie })
  assert.equal(report.response.status, 200)
  assert.equal(report.body.summary.revenue, 4800)
  assert.equal(report.body.summary.profit, 1800)
  assert.equal(report.body.summary.taxCollected, 240)
  assert.equal(report.body.summary.salesCount, 1)
  assert.equal(report.body.lowStock[0].quantity, 1)
  assert.ok(report.body.stockMovements.some((movement) => movement.amount === -6))
  assert.ok(report.body.stockMovements.some((movement) => movement.amount === 4))
  assert.equal(report.body.priceChanges[0].oldSalePrice, 800)
  assert.equal(report.body.priceChanges[0].newSalePrice, 900)

  assert.equal((await request('/api/accounting/expenses', { method: 'POST', cookie: ownerCookie, body: { title: 'Test rent', category: 'Rent', amount: 500, paymentMethod: 'cash', note: '' } })).response.status, 201)
  let accounting = await request('/api/accounting?days=30', { cookie: ownerCookie })
  assert.equal(accounting.response.status, 200)
  assert.equal(accounting.body.summary.grossProfit, 1800)
  assert.equal(accounting.body.summary.expenses, 500)
  assert.equal(accounting.body.summary.netProfit, 1300)
  assert.equal(accounting.body.cash.expectedBalance, 4540)
  assert.equal((await request('/api/accounting/cash-adjustments', { method: 'POST', cookie: ownerCookie, body: { direction: 'in', amount: 100, note: 'float top-up' } })).response.status, 201)
  const reconciliation = await request('/api/accounting/reconciliations', { method: 'POST', cookie: ownerCookie, body: { countedBalance: 4600, note: 'closing count' } })
  assert.equal(reconciliation.response.status, 201)
  assert.equal(reconciliation.body.reconciliation.expectedBalance, 4640)
  assert.equal(reconciliation.body.reconciliation.variance, -40)
  accounting = await request('/api/accounting', { cookie: ownerCookie })
  assert.equal(accounting.body.cash.expectedBalance, 4600)
  assert.equal(accounting.body.taxSummary.payable, 240)
  assert.equal((await request('/api/accounting/tax-payments', { method: 'POST', cookie: ownerCookie, body: { amount: 250, paymentMethod: 'electronic', note: 'overpayment' } })).response.status, 409)
  const taxPayment = await request('/api/accounting/tax-payments', { method: 'POST', cookie: ownerCookie, body: { amount: 100, paymentMethod: 'cash', note: 'tax remittance' } })
  assert.equal(taxPayment.response.status, 201)
  accounting = await request('/api/accounting', { cookie: ownerCookie })
  assert.equal(accounting.body.taxSummary.remittedAllTime, 100)
  assert.equal(accounting.body.taxSummary.payable, 140)
  assert.equal(accounting.body.cash.expectedBalance, 4500)
  const electronicSale = await request('/api/sales', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.body.id, quantity: 1 }], paymentMethod: 'electronic' } })
  assert.equal(electronicSale.response.status, 201)
  assert.equal(electronicSale.body.totalAmount, 945)
  accounting = await request('/api/accounting', { cookie: ownerCookie })
  assert.equal(accounting.body.cash.expectedBalance, 4500)
  assert.equal(accounting.body.taxSummary.payable, 185)
  assert.equal(accounting.body.summary.grossProfit, 2150)

  const exportProduct = await request('/api/products', {
    method: 'POST', cookie: ownerCookie,
    body: { name: 'Export test product', category: 'Test category', barcode: 'barcode-export', purchasePrice: 1000, salePrice: 2000, quantity: 2, minimumStock: 0, unit: 'each' },
  })
  assert.equal(exportProduct.response.status, 201)
  assert.equal((await request('/api/sales', {
    method: 'POST', cookie: ownerCookie,
    body: { isExport: true, items: [{ productId: exportProduct.body.id, quantity: 1 }], currencyCode: 'USD', exchangeRate: 0, shippingCost: 100, customsCharges: 50 },
  })).response.status, 400)
  assert.equal((await request('/api/sales', {
    method: 'POST', cookie: ownerCookie,
    body: { isExport: true, items: [{ productId: exportProduct.body.id, quantity: 1 }], currencyCode: 'USD', exchangeRate: 1400, shippingCost: 1.5 },
  })).response.status, 400)
  const exportSale = await request('/api/sales', {
    method: 'POST', cookie: ownerCookie,
    body: {
      isExport: true,
      items: [{ productId: exportProduct.body.id, quantity: 1 }],
      customerName: 'Export buyer',
      currencyCode: 'USD',
      exchangeRate: 1400,
      shippingCost: 100,
      customsCharges: 50,
      destinationCountry: 'Turkey',
      paymentMethod: 'cash',
    },
  })
  assert.equal(exportSale.response.status, 201)
  assert.equal(exportSale.body.isExport, true)
  assert.equal(exportSale.body.subtotalAmount, 2000)
  assert.equal(exportSale.body.taxAmount, 100)
  assert.equal(exportSale.body.shippingCost, 100)
  assert.equal(exportSale.body.customsCharges, 50)
  assert.equal(exportSale.body.totalAmount, 2250)
  assert.equal(exportSale.body.amountPaid, 2250)
  assert.equal(exportSale.body.profit, 1150)
  const exportInvoice = await request(`/api/sales/${exportSale.body.id}`, { cookie: ownerCookie })
  assert.equal(exportInvoice.response.status, 200)
  assert.equal(exportInvoice.body.isExport, true)
  assert.equal(exportInvoice.body.customerName, 'Export buyer')
  assert.equal(exportInvoice.body.currencyCode, 'USD')
  assert.equal(exportInvoice.body.exchangeRate, 1400)
  assert.equal(exportInvoice.body.destinationCountry, 'Turkey')
  assert.equal(exportInvoice.body.shippingCost, 100)
  assert.equal(exportInvoice.body.customsCharges, 50)
  assert.equal(exportInvoice.body.totalAmount, 2250)
  const exportHistory = await request('/api/sales', { cookie: ownerCookie })
  assert.equal(exportHistory.body.find((item) => item.id === exportSale.body.id).isExport, true)
  assert.equal(exportHistory.body.find((item) => item.id === exportSale.body.id).customerName, 'Export buyer')
  const exportReport = await request('/api/reports?days=30', { cookie: ownerCookie })
  assert.equal(exportReport.body.summary.revenue, 7850)
  assert.equal(exportReport.body.summary.profit, 3300)
  assert.equal(exportReport.body.summary.revenue_export, 2150)
  assert.equal(exportReport.body.summary.profit_export, 1150)
  assert.equal(exportReport.body.summary.taxCollected, 385)
  assert.equal(exportReport.body.salesTimeline.find((day) => day.revenue_export > 0).revenue_export, 2150)
  accounting = await request('/api/accounting?days=30', { cookie: ownerCookie })
  assert.equal(accounting.body.summary.revenue, 7850)
  assert.equal(accounting.body.summary.grossProfit, 3300)
  assert.equal(accounting.body.cash.expectedBalance, 6750)

  const account = await request('/api/accounts', { method: 'POST', cookie: ownerCookie, body: { name: 'Test Cashier', username: 'test-cashier', role: 'cashier', password: 'cashier-password-123' } })
  assert.equal(account.response.status, 201)
  assert.equal(account.body.role, 'cashier')
  assert.equal('passwordHash' in account.body, false)
  const cashierLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'test-cashier', password: 'cashier-password-123' } })
  assert.equal(cashierLogin.response.status, 200)
  assert.ok(cashierLogin.cookie)
  assert.equal((await request('/api/inventory', { cookie: cashierLogin.cookie })).response.status, 403)
  assert.equal((await request('/api/accounts', { cookie: cashierLogin.cookie })).response.status, 403)
  assert.equal((await request('/api/reports', { cookie: cashierLogin.cookie })).response.status, 403)
  assert.equal((await request('/api/accounting', { cookie: cashierLogin.cookie })).response.status, 403)
  assert.equal((await request('/api/accounting/tax-settings', { method: 'PATCH', cookie: cashierLogin.cookie, body: { taxRateBps: 0, taxName: 'Tax' } })).response.status, 403)
  assert.equal((await request('/api/admin/backups', { cookie: cashierLogin.cookie })).response.status, 403)
  assert.equal((await request('/api/sales/products', { cookie: cashierLogin.cookie })).response.status, 200)
  assert.equal((await request(`/api/sales/${sale.body.id}`, { cookie: cashierLogin.cookie })).response.status, 200)
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: cashierLogin.cookie })).response.status, 204)
  assert.equal((await request('/api/bootstrap', { cookie: cashierLogin.cookie })).body.user, null)
  assert.equal((await request('/api/auth/setup', { method: 'POST', body: { name: 'Second', username: 'second', password: 'another-password-123' } })).response.status, 409)

  assert.equal((await request('/api/admin/backups', { cookie: ownerCookie })).response.status, 200)
  const rejectedRestore = await fetch(`${baseUrl}/api/admin/restore`, { method: 'POST', headers: { cookie: ownerCookie, 'content-type': 'application/octet-stream' }, body: Buffer.from('not a sqlite database') })
  assert.equal(rejectedRestore.status, 400)
  const createdBackup = await request('/api/admin/backups', { method: 'POST', cookie: ownerCookie })
  assert.equal(createdBackup.response.status, 201)
  const downloadResponse = await fetch(`${baseUrl}/api/admin/backups/${encodeURIComponent(createdBackup.body.filename)}`, { headers: { cookie: ownerCookie } })
  assert.equal(downloadResponse.status, 200)
  const backupBytes = Buffer.from(await downloadResponse.arrayBuffer())
  assert.ok(backupBytes.length > 100)
  assert.equal((await request('/api/accounting/expenses', { method: 'POST', cookie: ownerCookie, body: { title: 'After backup', category: 'Other', amount: 777, paymentMethod: 'electronic', note: '' } })).response.status, 201)
  const restoreResponse = await fetch(`${baseUrl}/api/admin/restore`, {
    method: 'POST',
    headers: { cookie: ownerCookie, 'content-type': 'application/octet-stream' },
    body: backupBytes,
  })
  assert.equal(restoreResponse.status, 200)
  assert.equal((await restoreResponse.json()).restored, true)
  accounting = await request('/api/accounting', { cookie: ownerCookie })
  assert.equal(accounting.body.summary.expenses, 500)
  const restoredExport = await request(`/api/sales/${exportSale.body.id}`, { cookie: ownerCookie })
  assert.equal(restoredExport.response.status, 200)
  assert.equal(restoredExport.body.isExport, true)
  assert.equal(restoredExport.body.customerName, 'Export buyer')
  assert.equal(restoredExport.body.totalAmount, 2250)
  const backupList = await request('/api/admin/backups', { cookie: ownerCookie })
  assert.ok(backupList.body.some((backup) => backup.kind === 'pre-restore'))

  console.log('Backend smoke test passed: auth/roles, domestic/export sales, report/accounting totals, invoices, and SQLite backup/download/restore.')
} catch (error) {
  console.error(error)
  if (serverOutput) console.error(serverOutput)
  process.exitCode = 1
} finally {
  server.kill('SIGTERM')
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve()
    server.once('exit', resolve)
    setTimeout(() => { server.kill('SIGKILL'); resolve() }, 3000).unref()
  })
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
}
