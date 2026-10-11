import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import Database from 'better-sqlite3'
import { createServer as createViteServer } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dataDirectory = path.join(root, 'data')
const databasePath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(dataDirectory, 'sawza.sqlite')
const backupDirectory = path.join(path.dirname(databasePath), 'backups')
fs.mkdirSync(path.dirname(databasePath), { recursive: true })
let database = new Database(databasePath)
database.pragma('journal_mode = WAL')
database.pragma('foreign_keys = ON')
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'cashier', 'stock_manager')),
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON customers(phone) WHERE phone <> '';
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS suppliers_phone_unique ON suppliers(phone) WHERE phone <> '';
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    barcode TEXT NOT NULL DEFAULT '',
    purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0),
    sale_price INTEGER NOT NULL CHECK (sale_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    minimum_stock INTEGER NOT NULL CHECK (minimum_stock >= 0),
    unit TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique ON products(barcode) WHERE barcode <> '';
  CREATE INDEX IF NOT EXISTS products_name ON products(name);
  CREATE TABLE IF NOT EXISTS product_images (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS product_images_product ON product_images(product_id, sort_order);
  CREATE TABLE IF NOT EXISTS product_colors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    hex TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_sizes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id TEXT REFERENCES product_colors(id) ON DELETE SET NULL,
    size_id TEXT REFERENCES product_sizes(id) ON DELETE SET NULL,
    sku TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    price_adjustment INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS product_variants_product ON product_variants(product_id);
  CREATE TABLE IF NOT EXISTS size_guides (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    measurements TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS size_guides_category ON size_guides(category);
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    status TEXT NOT NULL CHECK (status IN ('ordered', 'received', 'cancelled')),
    subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    received_at TEXT
  );
  CREATE INDEX IF NOT EXISTS purchase_orders_created ON purchase_orders(created_at DESC);
  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0)
  );
  CREATE INDEX IF NOT EXISTS purchase_items_purchase ON purchase_items(purchase_id);
  CREATE TABLE IF NOT EXISTS supplier_payments (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    purchase_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'electronic')),
    note TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS supplier_payments_supplier ON supplier_payments(supplier_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount <> 0),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stock_adjustments_created ON stock_adjustments(created_at DESC);
  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id),
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    subtotal_amount INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
    tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
    tax_name TEXT NOT NULL DEFAULT 'Ø¨Ø§Ú˜',
    tax_amount INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    total_cost INTEGER NOT NULL CHECK (total_cost >= 0),
    amount_paid INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    customer_name TEXT NOT NULL DEFAULT '',
    is_export INTEGER NOT NULL DEFAULT 0 CHECK (is_export IN (0, 1)),
    currency_code TEXT NOT NULL DEFAULT 'USD',
    exchange_rate REAL NOT NULL DEFAULT 1.0,
    shipping_cost INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
    customs_charges INTEGER NOT NULL DEFAULT 0 CHECK (customs_charges >= 0),
    destination_country TEXT,
    is_credit INTEGER NOT NULL DEFAULT 0 CHECK (is_credit IN (0, 1)),
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'electronic')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sales_created ON sales(created_at DESC);
  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    sale_price INTEGER NOT NULL CHECK (sale_price >= 0),
    purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0)
  );
  CREATE INDEX IF NOT EXISTS sale_items_sale ON sale_items(sale_id);
  CREATE TABLE IF NOT EXISTS sales_returns (
    id TEXT PRIMARY KEY,
    return_number TEXT NOT NULL UNIQUE,
    sale_id TEXT NOT NULL REFERENCES sales(id),
    subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
    cost_amount INTEGER NOT NULL CHECK (cost_amount >= 0),
    tax_amount INTEGER NOT NULL CHECK (tax_amount >= 0),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    refund_method TEXT NOT NULL CHECK (refund_method IN ('cash', 'electronic', 'credit')),
    reason TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sales_returns_sale ON sales_returns(sale_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS return_items (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_sale_price INTEGER NOT NULL CHECK (unit_sale_price >= 0),
    unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0)
  );
  CREATE INDEX IF NOT EXISTS return_items_sale_item ON return_items(sale_item_id);
  CREATE TABLE IF NOT EXISTS customer_payments (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'electronic')),
    note TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS customer_payments_customer ON customer_payments(customer_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS loyalty_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    amount_per_point INTEGER NOT NULL DEFAULT 0 CHECK (amount_per_point >= 0),
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO loyalty_settings(id, amount_per_point, updated_at) VALUES (1, 0, datetime('now'));
  CREATE TABLE IF NOT EXISTS loyalty_ledger (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
    return_id TEXT REFERENCES sales_returns(id) ON DELETE SET NULL,
    points INTEGER NOT NULL CHECK (points <> 0),
    source TEXT NOT NULL CHECK (source IN ('sale', 'return', 'adjustment')),
    note TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS loyalty_ledger_customer ON loyalty_ledger(customer_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS price_changes (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    old_purchase_price INTEGER NOT NULL,
    new_purchase_price INTEGER NOT NULL,
    old_sale_price INTEGER NOT NULL,
    new_sale_price INTEGER NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS price_changes_created ON price_changes(created_at DESC);
  CREATE TABLE IF NOT EXISTS accounting_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
    tax_name TEXT NOT NULL DEFAULT 'باژ',
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO accounting_settings(id, tax_rate_bps, tax_name, updated_at) VALUES (1, 0, 'باژ', datetime('now'));
  INSERT OR IGNORE INTO product_colors(id, name, hex, created_at) VALUES 
    ('color-1', 'ڕەنگی ڕەش', '#000000', datetime('now')),
    ('color-2', 'ڕەنگی سپی', '#ffffff', datetime('now')),
    ('color-3', 'ڕەنگی شین', '#165DFF', datetime('now')),
    ('color-4', 'ڕەنگی سەوز', '#389e0d', datetime('now'))
  ;
  INSERT OR IGNORE INTO product_sizes(id, name, sort_order, created_at) VALUES 
    ('size-1', 'XS', 1, datetime('now')),
    ('size-2', 'S', 2, datetime('now')),
    ('size-3', 'M', 3, datetime('now')),
    ('size-4', 'L', 4, datetime('now')),
    ('size-5', 'XL', 5, datetime('now'))
  ;
  CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#4b9061',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS expense_categories_name ON expense_categories(name);
  INSERT OR IGNORE INTO expense_categories(id, name, color, created_at) VALUES 
    ('default-1', 'کرێ', '#668841', datetime('now')),
    ('default-2', 'مووچە', '#4b7fff', datetime('now')),
    ('default-3', 'گواستنەوە', '#9b742b', datetime('now')),
    ('default-4', 'کارەبا و ئاو', '#a35d4d', datetime('now')),
    ('default-5', 'کڕینی کەرەستە', '#35866a', datetime('now')),
    ('default-6', 'خەرجیی تر', '#7c887f', datetime('now'))
  ;
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'electronic')),
    note TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS expenses_created ON expenses(created_at DESC);
  CREATE TABLE IF NOT EXISTS cash_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('sale', 'expense', 'adjustment')),
    amount INTEGER NOT NULL CHECK (amount <> 0),
    sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
    expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS cash_ledger_created ON cash_ledger(id);
  CREATE TABLE IF NOT EXISTS cash_reconciliations (
    id TEXT PRIMARY KEY,
    ledger_through_id INTEGER NOT NULL,
    opening_balance INTEGER NOT NULL,
    expected_balance INTEGER NOT NULL,
    counted_balance INTEGER NOT NULL,
    variance INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS cash_reconciliations_created ON cash_reconciliations(created_at DESC);
  CREATE TABLE IF NOT EXISTS tax_payments (
    id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'electronic')),
    note TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tax_payments_created ON tax_payments(created_at DESC);
`)

function migrateUserColumns() {
  const userCols = new Set(database.pragma('table_info(users)').map((column) => column.name))
  if (!userCols.has('email')) database.exec("ALTER TABLE users ADD COLUMN email TEXT")
}
function migrateSalesColumns() {
  const salesColumns = new Set(database.pragma('table_info(sales)').map((column) => column.name))
  if (!salesColumns.has('subtotal_amount')) database.exec('ALTER TABLE sales ADD COLUMN subtotal_amount INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('customer_id')) database.exec('ALTER TABLE sales ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL')
  if (!salesColumns.has('tax_rate_bps')) database.exec('ALTER TABLE sales ADD COLUMN tax_rate_bps INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('tax_name')) database.exec("ALTER TABLE sales ADD COLUMN tax_name TEXT NOT NULL DEFAULT 'باژ'")
  if (!salesColumns.has('tax_amount')) database.exec('ALTER TABLE sales ADD COLUMN tax_amount INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('amount_paid')) database.exec('ALTER TABLE sales ADD COLUMN amount_paid INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('customer_name')) database.exec("ALTER TABLE sales ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''")
  if (!salesColumns.has('is_export')) database.exec('ALTER TABLE sales ADD COLUMN is_export INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('currency_code')) database.exec("ALTER TABLE sales ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'IQD'")
  if (!salesColumns.has('exchange_rate')) database.exec('ALTER TABLE sales ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1.0')
  if (!salesColumns.has('shipping_cost')) database.exec('ALTER TABLE sales ADD COLUMN shipping_cost INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('customs_charges')) database.exec('ALTER TABLE sales ADD COLUMN customs_charges INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('destination_country')) database.exec('ALTER TABLE sales ADD COLUMN destination_country TEXT')
  if (!salesColumns.has('is_credit')) database.exec('ALTER TABLE sales ADD COLUMN is_credit INTEGER NOT NULL DEFAULT 0')
  if (!salesColumns.has('payment_method')) database.exec("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'")
}
function migrateAccountingColumns() {
  const expenseCols = new Set(database.pragma('table_info(expenses)').map((column) => column.name))
  if (!expenseCols.has('voided')) database.exec('ALTER TABLE expenses ADD COLUMN voided INTEGER NOT NULL DEFAULT 0')
  if (!expenseCols.has('voided_at')) database.exec('ALTER TABLE expenses ADD COLUMN voided_at TEXT')
  if (!expenseCols.has('voided_by')) database.exec('ALTER TABLE expenses ADD COLUMN voided_by TEXT REFERENCES users(id)')
  const taxCols = new Set(database.pragma('table_info(tax_payments)').map((column) => column.name))
  if (!taxCols.has('voided')) database.exec('ALTER TABLE tax_payments ADD COLUMN voided INTEGER NOT NULL DEFAULT 0')
  if (!taxCols.has('voided_at')) database.exec('ALTER TABLE tax_payments ADD COLUMN voided_at TEXT')
  if (!taxCols.has('voided_by')) database.exec('ALTER TABLE tax_payments ADD COLUMN voided_by TEXT REFERENCES users(id)')
  const reconCols = new Set(database.pragma('table_info(cash_reconciliations)').map((column) => column.name))
  if (!reconCols.has('voided')) database.exec('ALTER TABLE cash_reconciliations ADD COLUMN voided INTEGER NOT NULL DEFAULT 0')
  if (!reconCols.has('voided_at')) database.exec('ALTER TABLE cash_reconciliations ADD COLUMN voided_at TEXT')
  if (!reconCols.has('voided_by')) database.exec('ALTER TABLE cash_reconciliations ADD COLUMN voided_by TEXT REFERENCES users(id)')
}
function migrateProductColumns() {
  const productCols = new Set(database.pragma('table_info(products)').map((column) => column.name))
  if (!productCols.has('status')) database.exec("ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived'))")
  if (!productCols.has('description')) database.exec("ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT ''")
  if (!productCols.has('image_url')) database.exec("ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''")
}
migrateSalesColumns()
  migrateAccountingColumns()
  migrateProductColumns()
  migrateUserColumns()
database.exec('UPDATE sales SET subtotal_amount = total_amount WHERE subtotal_amount = 0 AND total_amount > 0 AND tax_amount = 0')
database.exec('UPDATE sales SET amount_paid = total_amount WHERE amount_paid = 0 AND is_credit = 0')

const app = express()
const sessionHours = 10
const cookieName = 'sawza_session'
const isProduction = process.env.NODE_ENV === 'production'
const loginAttempts = new Map()
const roles = new Set(['owner', 'cashier', 'stock_manager'])
app.set('trust proxy', 'loopback')

app.disable('x-powered-by')
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'same-origin')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (isProduction) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  if (request.path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.get('origin')
    const isTrustedProxy = app.get('trust proxy fn')(request.socket.remoteAddress, 0)
    const host = isTrustedProxy ? request.get('x-forwarded-host') || request.get('host') : request.get('host')
    const expected = `${request.protocol}://${host}`
    if (origin && origin !== expected) return response.status(403).json({ error: 'داواکارییەکە لە سەرچاوەی نادڵنیایە.' })
  }
  next()
})
app.use(express.json({ limit: '32kb' }))

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const separator = part.indexOf('=')
  return separator < 0 ? [part, ''] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))]
}))
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex')
const publicUser = (user) => ({ id: user.id, name: user.name, username: user.username, email: user.email ?? null, role: user.role, active: Boolean(user.active), createdAt: user.created_at })
let currentSession = database.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1')
const activeOwnerCount = () => database.prepare("SELECT COUNT(*) AS count FROM users WHERE active = 1 AND role = 'owner'").get().count

function issueSession(user, response) {
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + sessionHours * 60 * 60 * 1000
  database.prepare('INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(tokenHash(token), user.id, expiresAt, new Date().toISOString())
  response.cookie(cookieName, token, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: sessionHours * 60 * 60 * 1000 })
}

function requireAuth(request, response, next) {
  const token = parseCookies(request.headers.cookie)[cookieName]
  if (!token || token.length > 200) return response.status(401).json({ error: 'تکایە بچۆ ژوورەوە.' })
  const user = currentSession.get(tokenHash(token), Date.now())
  if (!user) {
    response.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' })
    return response.status(401).json({ error: 'کاتی چوونەژوورەوە تەواو بوو؛ تکایە دووبارە بچۆ ژوورەوە.' })
  }
  request.user = user
  request.sessionTokenHash = tokenHash(token)
  next()
}

function requireRoles(...allowed) {
  return (request, response, next) => {
    if (!allowed.includes(request.user.role)) return response.status(403).json({ error: 'ڕێگەپێدانی ئەم کردارە نییە.' })
    next()
  }
}

function validateText(value, label, maximum, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new HttpError(400, `${label} پێویستە و نابێت لە ${maximum} پیت زیاتر بێت.`)
  return value.trim()
}

function validateInteger(value, label) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) throw new HttpError(400, `${label} دەبێت ژمارەیەکی تەواوی سفر یان زیاتر بێت.`)
  return number
}

function safeHandler(handler) {
  return (request, response, next) => {
    try { return handler(request, response, next) } catch (error) { next(error) }
  }
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  return { salt: salt.toString('hex'), hash: crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex') }
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200
}

app.get('/api/bootstrap', safeHandler((request, response) => {
  const token = parseCookies(request.headers.cookie)[cookieName]
  const user = token && token.length <= 200 ? currentSession.get(tokenHash(token), Date.now()) : null
  const hasOwner = Boolean(database.prepare("SELECT 1 FROM users WHERE role = 'owner' AND active = 1 LIMIT 1").get())
  response.json({ setupRequired: !hasOwner, user: user ? publicUser(user) : null })
}))

app.post('/api/auth/setup', safeHandler((request, response) => {
  if (database.prepare('SELECT 1 FROM users LIMIT 1').get()) throw new HttpError(409, 'دامەزراندنی خاوەن پێشتر ئەنجام دراوە.')
  const name = validateText(request.body?.name, 'ناو', 80)
  const username = validateText(request.body?.username, 'ناوی بەکارهێنەر', 40).toLocaleLowerCase()
  const email = validateText(request.body?.email ?? '', 'ئیمایل', 200, { optional: true })
  const password = request.body?.password
  if (!validPassword(password)) throw new HttpError(400, 'وشەی نهێنی دەبێت لانیکەم ٨ پیت بێت.')
  const credentials = hashPassword(password)
  const user = { id: crypto.randomUUID(), name, username, email: email || null, role: 'owner', password_salt: credentials.salt, password_hash: credentials.hash, active: 1, created_at: new Date().toISOString() }
  database.prepare('INSERT INTO users(id, name, username, email, role, password_salt, password_hash, active, created_at) VALUES (@id, @name, @username, @email, @role, @password_salt, @password_hash, @active, @created_at)').run(user)
  issueSession(user, response)
  if (!process.env.SAWZA_SMOKE_TEST) void ensureDailyBackup().catch((error) => console.error('Automatic database backup failed', error))
  response.status(201).json({ user: publicUser(user) })
}))

app.post('/api/auth/login', safeHandler((request, response) => {
  const ip = request.ip ?? 'unknown'
  const now = Date.now()
  const attempt = loginAttempts.get(ip) ?? { count: 0, resetAt: now + 15 * 60 * 1000 }
  if (attempt.resetAt < now) { attempt.count = 0; attempt.resetAt = now + 15 * 60 * 1000 }
  if (attempt.count >= 10) throw new HttpError(429, 'هەوڵی زۆر دراوە. تکایە ١٥ خولەک چاوەڕێ بکە.')
  const username = typeof request.body?.username === 'string' ? request.body.username.trim().toLocaleLowerCase() : ''
  const password = typeof request.body?.password === 'string' ? request.body.password : ''
  const user = database.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)
  const salt = user ? Buffer.from(user.password_salt, 'hex') : Buffer.alloc(16)
  const actual = crypto.pbkdf2Sync(password.slice(0, 200), salt, 310000, 32, 'sha256')
  const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(32)
  const matches = actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  if (!user || !user.active || !matches) {
    attempt.count += 1
    loginAttempts.set(ip, attempt)
    throw new HttpError(401, 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە، یان هەژمارەکە ناچالاکە.')
  }
  loginAttempts.delete(ip)
  issueSession(user, response)
  response.json({ user: publicUser(user) })
}))

app.post('/api/auth/logout', requireAuth, safeHandler((request, response) => {
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(request.sessionTokenHash)
  response.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' })
  response.status(204).end()
}))

app.get('/api/inventory', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const products = database.prepare(`SELECT products.id, products.name, categories.name AS category, products.barcode,
    products.purchase_price AS purchasePrice, products.sale_price AS salePrice, products.quantity,
    products.minimum_stock AS minimumStock, products.unit, products.updated_at AS updatedAt,
    products.status, products.description, products.image_url AS imageUrl
    FROM products JOIN categories ON categories.id = products.category_id ORDER BY products.name COLLATE NOCASE`).all()
  const categories = database.prepare('SELECT name FROM categories ORDER BY name COLLATE NOCASE').all().map((row) => row.name)
  const adjustments = database.prepare(`SELECT id, product_id AS productId, product_name AS productName, amount, reason, created_at AS createdAt
    FROM stock_adjustments ORDER BY created_at DESC LIMIT 100`).all()
  const colors = database.prepare('SELECT id, name, hex, created_at AS createdAt FROM product_colors ORDER BY name COLLATE NOCASE').all()
  const sizes = database.prepare('SELECT id, name, sort_order AS sortOrder, created_at AS createdAt FROM product_sizes ORDER BY sort_order, name COLLATE NOCASE').all()
  const variants = database.prepare(`SELECT product_variants.id, product_variants.product_id AS productId, 
       product_variants.color_id AS colorId, product_colors.name AS colorName, product_colors.hex AS colorHex,
       product_variants.size_id AS sizeId, product_sizes.name AS sizeName,
       product_variants.sku, product_variants.quantity, product_variants.price_adjustment AS priceAdjustment,
       product_variants.created_at AS createdAt
       FROM product_variants
       LEFT JOIN product_colors ON product_colors.id = product_variants.color_id
       LEFT JOIN product_sizes ON product_sizes.id = product_variants.size_id
       ORDER BY product_variants.created_at DESC LIMIT 200`).all()
  response.json({ products, categories, adjustments, colors, sizes, variants })
}))

app.post('/api/categories', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const name = validateText(request.body?.name, 'ناوی پۆل', 60)
  const id = crypto.randomUUID()
  try {
    database.prepare('INSERT INTO categories(id, name, created_at) VALUES (?, ?, ?)').run(id, name, new Date().toISOString())
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم پۆلە پێشتر هەیە.')
    throw error
  }
  response.status(201).json({ id, name })
}))

function validateProduct(body) {
  const name = validateText(body?.name, 'ناوی کاڵا', 100)
  const categoryName = validateText(body?.category, 'پۆل', 60)
  const barcode = validateText(body?.barcode ?? '', 'بارکۆد', 80, { optional: true })
  const unit = validateText(body?.unit, 'یەکە', 30)
  const purchasePrice = validateInteger(body?.purchasePrice, 'نرخی کڕین')
  const salePrice = validateInteger(body?.salePrice, 'نرخی فرۆشتن')
  const quantity = validateInteger(body?.quantity, 'بڕی کۆگا')
  const minimumStock = validateInteger(body?.minimumStock, 'بڕی ئاگادارکردنەوە')
  return { name, categoryName, barcode, unit, purchasePrice, salePrice, quantity, minimumStock }
}

app.post('/api/products', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const product = validateProduct(request.body)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const create = database.transaction(() => {
    let category = database.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(product.categoryName)
    if (!category) {
      const categoryId = crypto.randomUUID()
      database.prepare('INSERT INTO categories(id, name, created_at) VALUES (?, ?, ?)').run(categoryId, product.categoryName, now)
      category = { id: categoryId }
    }
    database.prepare(`INSERT INTO products(id, name, category_id, barcode, purchase_price, sale_price, quantity, minimum_stock, unit, updated_at)
      VALUES (@id, @name, @categoryId, @barcode, @purchasePrice, @salePrice, @quantity, @minimumStock, @unit, @updatedAt)`).run({ id, ...product, categoryId: category.id, updatedAt: now })
  })
  try { create() } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم بارکۆدە پێشتر بۆ کاڵایەکی تر تۆمارکراوە.')
    throw error
  }
  response.status(201).json({ id, ...product, category: product.categoryName, updatedAt: now })
}))

app.put('/api/products/:id', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const product = validateProduct(request.body)
  const now = new Date().toISOString()
  const update = database.transaction(() => {
    const existing = database.prepare('SELECT id FROM products WHERE id = ?').get(request.params.id)
    if (!existing) throw new HttpError(404, 'کاڵاکە نەدۆزرایەوە.')
    let category = database.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(product.categoryName)
    if (!category) {
      const categoryId = crypto.randomUUID()
      database.prepare('INSERT INTO categories(id, name, created_at) VALUES (?, ?, ?)').run(categoryId, product.categoryName, now)
      category = { id: categoryId }
    }
    const previous = database.prepare('SELECT quantity, name, purchase_price, sale_price FROM products WHERE id = ?').get(request.params.id)
    database.prepare(`UPDATE products SET name=@name, category_id=@categoryId, barcode=@barcode, purchase_price=@purchasePrice,
      sale_price=@salePrice, quantity=@quantity, minimum_stock=@minimumStock, unit=@unit, updated_at=@updatedAt WHERE id=@id`)
      .run({ id: request.params.id, ...product, categoryId: category.id, updatedAt: now })
    if (previous.quantity !== product.quantity) {
      const adjustmentId = crypto.randomUUID()
      database.prepare(`INSERT INTO stock_adjustments(id, product_id, product_name, amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(adjustmentId, request.params.id, product.name, product.quantity - previous.quantity, 'گۆڕینی بڕ لە فۆڕمی دەستکاریکردنی کاڵا', now)
    }
    if (previous.purchase_price !== product.purchasePrice || previous.sale_price !== product.salePrice) {
      database.prepare(`INSERT INTO price_changes(id, product_id, product_name, old_purchase_price, new_purchase_price,
        old_sale_price, new_sale_price, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), request.params.id, product.name, previous.purchase_price, product.purchasePrice,
          previous.sale_price, product.salePrice, request.user.id, now)
    }
  })
  try { update() } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم بارکۆدە پێشتر بۆ کاڵایەکی تر تۆمارکراوە.')
    throw error
  }
  response.json({ id: request.params.id, ...product, category: product.categoryName, updatedAt: now })
}))

app.post('/api/stock-adjustments', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const productId = validateText(request.body?.productId, 'کاڵا', 80)
  const amount = Number(request.body?.amount)
  if (!Number.isSafeInteger(amount) || amount === 0) throw new HttpError(400, 'بڕی ڕێکخستن دەبێت ژمارەیەکی تەواوی ناجێگیر بە سفر بێت.')
  const reason = validateText(request.body?.reason, 'هۆکار', 120)
  const product = database.prepare('SELECT id, name, quantity FROM products WHERE id = ?').get(productId)
  if (!product) throw new HttpError(404, 'کاڵاکە نەدۆزرایەوە.')
  if (product.quantity + amount < 0) throw new HttpError(400, 'بڕی کۆگا ناتوانێت لە سفر کەمتر بێت.')
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const adjust = database.transaction(() => {
    database.prepare('UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(amount, createdAt, productId)
    database.prepare('INSERT INTO stock_adjustments(id, product_id, product_name, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, productId, product.name, amount, reason, createdAt)
  })
  adjust()
  response.status(201).json({ id, productId, productName: product.name, amount, reason, createdAt })
}))

app.get('/api/products/images/:productId', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const images = database.prepare('SELECT id, url, sort_order AS sortOrder, created_at AS createdAt FROM product_images WHERE product_id = ? ORDER BY sort_order, id').all(request.params.productId)
  response.json(images)
}))

app.post('/api/products/images/:productId', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const productId = validateText(request.params.productId, 'کاڵا', 80)
  const product = database.prepare('SELECT id FROM products WHERE id = ?').get(productId)
  if (!product) throw new HttpError(404, 'کاڵاکە نەدۆزرایەوە.')
  const url = validateText(request.body?.url, 'ناوی نیشانە', 500)
  const sortOrder = Number(request.body?.sortOrder ?? 0)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database.prepare('INSERT INTO product_images(id, product_id, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(id, productId, url, sortOrder, now)
  response.status(201).json({ id, productId, url, sortOrder, createdAt: now })
}))

app.delete('/api/products/images/:imageId', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const imageId = validateText(request.params.imageId, 'نیشانە', 80)
  const image = database.prepare('SELECT id FROM product_images WHERE id = ?').get(imageId)
  if (!image) throw new HttpError(404, 'نیشانەکە نەدۆزرایەوە.')
  database.prepare('DELETE FROM product_images WHERE id = ?').run(imageId)
  response.status(204).end()
}))

app.get('/api/products/options/colors', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  response.json(database.prepare('SELECT id, name, hex, created_at AS createdAt FROM product_colors ORDER BY name COLLATE NOCASE').all())
}))

app.post('/api/products/options/colors', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const name = validateText(request.body?.name, 'ناوی ڕەنگ', 30)
  const hex = validateText(request.body?.hex, 'ڕەنگی ڕەنگ', 7)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    database.prepare('INSERT INTO product_colors(id, name, hex, created_at) VALUES (?, ?, ?, ?)').run(id, name, hex, now)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم ڕەنگە پێشتر هەیە.')
    throw error
  }
  response.status(201).json({ id, name, hex, createdAt: now })
}))

app.delete('/api/products/options/colors/:id', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'ڕەنگ', 80)
  const color = database.prepare('SELECT id FROM product_colors WHERE id = ?').get(id)
  if (!color) throw new HttpError(404, 'ڕەنگەکە نەدۆزرایەوە.')
  database.prepare('DELETE FROM product_colors WHERE id = ?').run(id)
  response.status(204).end()
}))

app.get('/api/products/options/sizes', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  response.json(database.prepare('SELECT id, name, sort_order AS sortOrder, created_at AS createdAt FROM product_sizes ORDER BY sort_order, name COLLATE NOCASE').all())
}))

app.post('/api/products/options/sizes', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const name = validateText(request.body?.name, 'ناوی قەبارە', 20)
  const sortOrder = Number(request.body?.sortOrder ?? 0)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    database.prepare('INSERT INTO product_sizes(id, name, sort_order, created_at) VALUES (?, ?, ?, ?)').run(id, name, sortOrder, now)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم قەبارەیە پێشتر هەیە.')
    throw error
  }
  response.status(201).json({ id, name, sortOrder, createdAt: now })
}))

app.delete('/api/products/options/sizes/:id', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'قەبارە', 80)
  const size = database.prepare('SELECT id FROM product_sizes WHERE id = ?').get(id)
  if (!size) throw new HttpError(404, 'قەبارەکە نەدۆزرایەوە.')
  database.prepare('DELETE FROM product_sizes WHERE id = ?').run(id)
  response.status(204).end()
}))

app.get('/api/products/variants/:productId', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const variants = database.prepare(`SELECT product_variants.id, product_variants.product_id AS productId, 
       product_variants.color_id AS colorId, product_colors.name AS colorName, product_colors.hex AS colorHex,
       product_variants.size_id AS sizeId, product_sizes.name AS sizeName,
       product_variants.sku, product_variants.quantity, product_variants.price_adjustment AS priceAdjustment,
       product_variants.created_at AS createdAt
       FROM product_variants
       LEFT JOIN product_colors ON product_colors.id = product_variants.color_id
       LEFT JOIN product_sizes ON product_sizes.id = product_variants.size_id
       WHERE product_variants.product_id = ?
       ORDER BY product_variants.created_at DESC`).all(request.params.productId)
  response.json(variants)
}))

app.post('/api/products/variants', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const productId = validateText(request.body?.productId, 'کاڵا', 80)
  const colorId = validateText(request.body?.colorId ?? '', 'ڕەنگ', 80, { optional: true }) || null
  const sizeId = validateText(request.body?.sizeId ?? '', 'قەبارە', 80, { optional: true }) || null
  const sku = validateText(request.body?.sku ?? '', 'SKU', 80, { optional: true })
  const quantity = Number(request.body?.quantity ?? 0)
  const priceAdjustment = Number(request.body?.priceAdjustment ?? 0)
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new HttpError(400, 'بڕی ناڕاستە.')
  if (!Number.isSafeInteger(priceAdjustment)) throw new HttpError(400, 'گۆڕانی نرخی ناڕاستە.')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database.prepare(`INSERT INTO product_variants(id, product_id, color_id, size_id, sku, quantity, price_adjustment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, productId, colorId, sizeId, sku, quantity, priceAdjustment, now)
  response.status(201).json({ id, productId, colorId, sizeId, sku, quantity, priceAdjustment, createdAt: now })
}))

app.delete('/api/products/variants/:id', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'جۆری کاڵا', 80)
  const variant = database.prepare('SELECT id FROM product_variants WHERE id = ?').get(id)
  if (!variant) throw new HttpError(404, 'جۆری کاڵاکە نەدۆزرایەوە.')
  database.prepare('DELETE FROM product_variants WHERE id = ?').run(id)
  response.status(204).end()
}))

app.get('/api/products/size-guides', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const guides = database.prepare('SELECT id, category, label, measurements, created_at AS createdAt FROM size_guides ORDER BY category COLLATE NOCASE, label COLLATE NOCASE').all()
  response.json(guides)
}))

app.post('/api/products/size-guides', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const category = validateText(request.body?.category, 'پۆلی کاڵا', 60)
  const label = validateText(request.body?.label, 'ناوی قەبارە', 40)
  const measurements = validateText(request.body?.measurements, 'پێوانەکان', 500)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  database.prepare('INSERT INTO size_guides(id, category, label, measurements, created_at) VALUES (?, ?, ?, ?, ?)').run(id, category, label, measurements, now)
  response.status(201).json({ id, category, label, measurements, createdAt: now })
}))

app.put('/api/products/size-guides/:id', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'ڕێنمایی قەبارە', 80)
  const guide = database.prepare('SELECT id FROM size_guides WHERE id = ?').get(id)
  if (!guide) throw new HttpError(404, 'ڕێنمایی قەبارەکە نەدۆزرایەوە.')
  const category = validateText(request.body?.category, 'پۆلی کاڵا', 60)
  const label = validateText(request.body?.label, 'ناوی قەبارە', 40)
  const measurements = validateText(request.body?.measurements, 'پێوانەکان', 500)
  database.prepare('UPDATE size_guides SET category = ?, label = ?, measurements = ? WHERE id = ?').run(category, label, measurements, id)
  response.json({ id, category, label, measurements })
}))

app.delete('/api/products/size-guides/:id', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'ڕێنمایی قەبارە', 80)
  const guide = database.prepare('SELECT id FROM size_guides WHERE id = ?').get(id)
  if (!guide) throw new HttpError(404, 'ڕێنمایی قەبارەکە نەدۆزرایەوە.')
  database.prepare('DELETE FROM size_guides WHERE id = ?').run(id)
  response.status(204).end()
}))

app.get('/api/customers', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const customers = database.prepare(`SELECT customers.id, customers.name, customers.phone, customers.notes, customers.created_at AS createdAt,
    COALESCE((SELECT SUM(sales.total_amount-sales.amount_paid) FROM sales WHERE sales.customer_id=customers.id),0)
      - COALESCE((SELECT SUM(customer_payments.amount) FROM customer_payments WHERE customer_payments.customer_id=customers.id),0)
      - COALESCE((SELECT SUM(sales_returns.total_amount) FROM sales_returns JOIN sales ON sales.id=sales_returns.sale_id WHERE sales.customer_id=customers.id AND sales_returns.refund_method='credit'),0) AS balance,
    COALESCE((SELECT SUM(loyalty_ledger.points) FROM loyalty_ledger WHERE loyalty_ledger.customer_id=customers.id),0) AS points,
    COALESCE((SELECT COUNT(*) FROM sales WHERE sales.customer_id=customers.id),0) AS salesCount
    FROM customers ORDER BY customers.name COLLATE NOCASE`).all()
  const recentSales = database.prepare(`SELECT id, receipt_number AS receiptNumber, subtotal_amount AS subtotalAmount,
    tax_amount AS taxAmount, total_amount AS totalAmount, amount_paid AS amountPaid, is_credit AS isCredit,
    created_at AS createdAt FROM sales WHERE customer_id=? ORDER BY created_at DESC LIMIT 30`)
  const loyaltyHistory = database.prepare(`SELECT id, points, source, note, created_at AS createdAt FROM loyalty_ledger
    WHERE customer_id=? ORDER BY created_at DESC LIMIT 30`)
  const payments = database.prepare(`SELECT id, amount, payment_method AS paymentMethod, note, created_at AS createdAt
    FROM customer_payments WHERE customer_id=? ORDER BY created_at DESC LIMIT 30`)
  response.json({
    customers: customers.map((customer) => ({ ...customer, purchaseHistory: recentSales.all(customer.id), loyaltyHistory: loyaltyHistory.all(customer.id), payments: payments.all(customer.id) })),
    loyaltySettings: database.prepare('SELECT amount_per_point AS amountPerPoint FROM loyalty_settings WHERE id=1').get(),
  })
}))

app.post('/api/customers', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const name = validateText(request.body?.name, 'ناوی کڕیار', 100)
  const phone = validateText(request.body?.phone ?? '', 'ژمارەی مۆبایل', 40, { optional: true })
  const notes = validateText(request.body?.notes ?? '', 'تێبینی', 240, { optional: true })
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  try {
    database.prepare('INSERT INTO customers(id, name, phone, notes, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, phone, notes, createdAt)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم ژمارەی مۆبایلە پێشتر بۆ کڕیارێک تۆمارکراوە.')
    throw error
  }
  response.status(201).json({ id, name, phone, notes, createdAt, balance: 0, points: 0, salesCount: 0 })
}))

app.post('/api/customers/:id/payments', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const amount = validateInteger(request.body?.amount, 'بڕی پارەدان')
  if (amount <= 0) throw new HttpError(400, 'بڕی پارەدان دەبێت گەورەتر لە سفر بێت.')
  const paymentMethod = request.body?.paymentMethod
  if (!['cash', 'electronic'].includes(paymentMethod)) throw new HttpError(400, 'شێوازی پارەدان نادروستە.')
  const note = validateText(request.body?.note ?? '', 'تێبینی', 180, { optional: true })
  const createdAt = new Date().toISOString()
  const payment = database.transaction(() => {
    const customer = database.prepare('SELECT id FROM customers WHERE id=?').get(request.params.id)
    if (!customer) throw new HttpError(404, 'کڕیارەکە نەدۆزرایەوە.')
    const totals = database.prepare(`SELECT
      COALESCE((SELECT SUM(total_amount-amount_paid) FROM sales WHERE customer_id=?),0)
      - COALESCE((SELECT SUM(total_amount) FROM sales_returns JOIN sales ON sales.id=sales_returns.sale_id WHERE sales.customer_id=? AND sales_returns.refund_method='credit'),0) AS due,
      COALESCE((SELECT SUM(amount) FROM customer_payments WHERE customer_id=?),0) AS paid`).get(request.params.id, request.params.id, request.params.id)
    const balance = totals.due - totals.paid
    if (amount > balance) throw new HttpError(409, `بڕی پارەدان لە قەرزی کڕیار زیاترە (${balance}).`)
    const id = crypto.randomUUID()
    database.prepare(`INSERT INTO customer_payments(id, customer_id, amount, payment_method, note, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, request.params.id, amount, paymentMethod, note, request.user.id, createdAt)
    if (paymentMethod === 'cash') database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
      VALUES ('adjustment', ?, ?, ?, ?)`).run(amount, `پارەی کڕیار${note ? `: ${note}` : ''}`, request.user.id, createdAt)
    return { id, customerId: request.params.id, amount, paymentMethod, note, createdAt, balance: balance - amount }
  })
  response.status(201).json(payment.immediate())
}))

app.patch('/api/customers/loyalty-settings', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const amountPerPoint = validateInteger(request.body?.amountPerPoint, 'بڕی خاڵ')
  if (amountPerPoint <= 0) throw new HttpError(400, 'بڕی داهات بۆ خاڵ دەبێت گەورەتر لە سفر بێت.')
  const updatedAt = new Date().toISOString()
  database.prepare('UPDATE loyalty_settings SET amount_per_point=?, updated_at=? WHERE id=1').run(amountPerPoint, updatedAt)
  response.json({ amountPerPoint, updatedAt })
}))

app.post('/api/customers/:id/rewards', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const points = validateInteger(request.body?.points, 'ژمارەی خاڵ')
  if (points <= 0) throw new HttpError(400, 'ژمارەی خاڵ دەبێت گەورەتر لە سفر بێت.')
  const note = validateText(request.body?.note ?? '', 'هۆکاری بەکارهێنانی خاڵ', 160, { optional: true }) || 'بەکارهێنانی پاداشت'
  const result = database.transaction(() => {
    const customer = database.prepare('SELECT id FROM customers WHERE id=?').get(request.params.id)
    if (!customer) throw new HttpError(404, 'کڕیارەکە نەدۆزرایەوە.')
    const balance = database.prepare('SELECT COALESCE(SUM(points),0) AS points FROM loyalty_ledger WHERE customer_id=?').get(request.params.id).points
    if (points > balance) throw new HttpError(409, `خاڵی بەردەست تەنها ${balance} ـە.`)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    database.prepare(`INSERT INTO loyalty_ledger(id, customer_id, points, source, note, user_id, created_at)
      VALUES (?, ?, ?, 'adjustment', ?, ?, ?)`).run(id, request.params.id, -points, note, request.user.id, createdAt)
    return { id, customerId: request.params.id, points: -points, note, createdAt, balance: balance - points }
  })
  response.status(201).json(result.immediate())
}))

app.get('/api/price-check', requireAuth, requireRoles('owner', 'cashier', 'stock_manager'), safeHandler((request, response) => {
  const query = validateText(typeof request.query.query === 'string' ? request.query.query : '', 'بارکۆد یان ناوی کاڵا', 80)
  const escaped = query.replace(/[\\%_]/g, '\\$&')
  const rows = database.prepare(`SELECT products.id, products.name, categories.name AS category, products.barcode,
    products.sale_price AS salePrice, products.purchase_price AS purchasePrice, products.quantity,
    products.minimum_stock AS minimumStock, products.unit, products.updated_at AS updatedAt
    FROM products JOIN categories ON categories.id=products.category_id
    WHERE products.barcode=? COLLATE NOCASE OR products.name LIKE ? ESCAPE '\\'
    ORDER BY CASE WHEN products.barcode=? COLLATE NOCASE THEN 0 ELSE 1 END, products.name COLLATE NOCASE LIMIT 20`)
    .all(query, `%${escaped}%`, query)
  response.json(rows.map(({ purchasePrice, ...product }) => ({ ...product,
    ...(request.user.role === 'owner' || request.user.role === 'stock_manager' ? { purchasePrice } : {}) })))
}))

app.get('/api/purchasing', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const suppliers = database.prepare(`SELECT suppliers.id, suppliers.name, suppliers.phone, suppliers.notes, suppliers.created_at AS createdAt,
    COALESCE((SELECT SUM(purchase_orders.subtotal_amount) FROM purchase_orders WHERE purchase_orders.supplier_id=suppliers.id AND purchase_orders.status='received'),0)
      - COALESCE((SELECT SUM(supplier_payments.amount) FROM supplier_payments WHERE supplier_payments.supplier_id=suppliers.id),0) AS balance
    FROM suppliers ORDER BY suppliers.name COLLATE NOCASE`).all()
  const orders = database.prepare(`SELECT purchase_orders.id, purchase_orders.order_number AS orderNumber,
    purchase_orders.supplier_id AS supplierId, suppliers.name AS supplierName, purchase_orders.status,
    purchase_orders.subtotal_amount AS subtotalAmount, purchase_orders.notes, purchase_orders.created_at AS createdAt,
    purchase_orders.received_at AS receivedAt, users.name AS createdBy,
    COALESCE((SELECT SUM(supplier_payments.amount) FROM supplier_payments WHERE supplier_payments.purchase_id=purchase_orders.id),0) AS paidAmount
    FROM purchase_orders JOIN suppliers ON suppliers.id=purchase_orders.supplier_id
    JOIN users ON users.id=purchase_orders.created_by ORDER BY purchase_orders.created_at DESC LIMIT 100`).all()
  const orderItems = database.prepare(`SELECT id, purchase_id AS purchaseId, product_id AS productId, product_name AS productName,
    quantity, unit_cost AS unitCost FROM purchase_items WHERE purchase_id = ? ORDER BY rowid`)
  response.json({
    suppliers,
    orders: orders.map((order) => ({ ...order, items: orderItems.all(order.id) })),
    products: database.prepare('SELECT id, name, barcode, quantity, purchase_price AS purchasePrice, unit FROM products ORDER BY name COLLATE NOCASE').all(),
  })
}))

app.post('/api/suppliers', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const name = validateText(request.body?.name, 'ناوی دابینکەر', 100)
  const phone = validateText(request.body?.phone ?? '', 'ژمارەی مۆبایل', 40, { optional: true })
  const notes = validateText(request.body?.notes ?? '', 'تێبینی', 240, { optional: true })
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  try {
    database.prepare('INSERT INTO suppliers(id, name, phone, notes, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, phone, notes, createdAt)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم ژمارەی مۆبایلە پێشتر بۆ دابینکەرێک تۆمارکراوە.')
    throw error
  }
  response.status(201).json({ id, name, phone, notes, createdAt, balance: 0 })
}))

app.post('/api/purchases', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const supplierId = validateText(request.body?.supplierId, 'دابینکەر', 80)
  const notes = validateText(request.body?.notes ?? '', 'تێبینی', 240, { optional: true })
  const items = request.body?.items
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) throw new HttpError(400, 'داواکاری کڕین دەبێت لانیکەم یەک کاڵا و زۆرترین ١٠٠ کاڵا لەخۆبگرێت.')
  const normalizedItems = items.map((item) => {
    const productId = validateText(item?.productId, 'کاڵا', 80)
    const quantity = Number(item?.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new HttpError(400, 'بڕی کڕین دەبێت ژمارەیەکی تەواوی گەورەتر لە سفر بێت.')
    const unitCost = validateInteger(item?.unitCost, 'نرخی کڕین')
    return { productId, quantity, unitCost }
  })
  const supplier = database.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplierId)
  if (!supplier) throw new HttpError(404, 'دابینکەرەکە نەدۆزرایەوە.')
  let subtotalAmount = 0
  const products = normalizedItems.map((item) => {
    const product = database.prepare('SELECT id, name FROM products WHERE id = ?').get(item.productId)
    if (!product) throw new HttpError(404, 'یەکێک لە کاڵاکانی داواکاری نەدۆزرایەوە.')
    const lineAmount = item.quantity * item.unitCost
    if (!Number.isSafeInteger(lineAmount) || !Number.isSafeInteger(subtotalAmount + lineAmount)) throw new HttpError(400, 'کۆی داواکارییەکە زۆر گەورەیە.')
    subtotalAmount += lineAmount
    return { ...item, productName: product.name }
  })
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const createOrder = database.transaction(() => {
    database.prepare(`INSERT INTO purchase_orders(id, order_number, supplier_id, status, subtotal_amount, notes, created_by, created_at)
      VALUES (?, ?, ?, 'ordered', ?, ?, ?, ?)`).run(id, orderNumber, supplierId, subtotalAmount, notes, request.user.id, createdAt)
    const insertItem = database.prepare(`INSERT INTO purchase_items(id, purchase_id, product_id, product_name, quantity, unit_cost)
      VALUES (?, ?, ?, ?, ?, ?)`)
    products.forEach((item) => insertItem.run(crypto.randomUUID(), id, item.productId, item.productName, item.quantity, item.unitCost))
  })
  createOrder.immediate()
  response.status(201).json({ id, orderNumber, supplierId, status: 'ordered', subtotalAmount, notes, createdAt })
}))

app.post('/api/purchases/:id/receive', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const paidAmount = validateInteger(request.body?.paidAmount ?? 0, 'پارەی دراو')
  const paymentMethod = request.body?.paymentMethod ?? 'cash'
  if (!['cash', 'electronic'].includes(paymentMethod)) throw new HttpError(400, 'شێوازی پارەدان نادروستە.')
  const now = new Date().toISOString()
  let received
  const receiveOrder = database.transaction(() => {
    const order = database.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(request.params.id)
    if (!order) throw new HttpError(404, 'داواکاریی کڕین نەدۆزرایەوە.')
    if (order.status !== 'ordered') throw new HttpError(409, 'تەنها داواکاریی لەچاوەڕوانی دەتوانرێت وەربگیرێت.')
    if (paidAmount > order.subtotal_amount) throw new HttpError(400, 'پارەی دراو ناتوانێت لە کۆی داواکاری زیاتر بێت.')
    const items = database.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(order.id)
    if (!items.length) throw new HttpError(400, 'داواکارییەکە هیچ کاڵایەکی تێدا نییە.')
    for (const item of items) {
      const product = database.prepare('SELECT quantity, purchase_price, sale_price FROM products WHERE id = ?').get(item.product_id)
      if (!product) throw new HttpError(404, `کاڵای ${item.product_name} نەدۆزرایەوە.`)
      if (!Number.isSafeInteger(product.quantity + item.quantity)) throw new HttpError(400, 'بڕی کۆگا زۆر گەورەیە.')
      database.prepare('UPDATE products SET quantity=quantity+?, purchase_price=?, updated_at=? WHERE id=?')
        .run(item.quantity, item.unit_cost, now, item.product_id)
      database.prepare(`INSERT INTO stock_adjustments(id, product_id, product_name, amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), item.product_id, item.product_name, item.quantity, `وەرگرتنی داواکاری ${order.order_number}`, now)
      if (product.purchase_price !== item.unit_cost) database.prepare(`INSERT INTO price_changes(id, product_id, product_name,
        old_purchase_price, new_purchase_price, old_sale_price, new_sale_price, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), item.product_id, item.product_name,
          product.purchase_price, item.unit_cost, product.sale_price, product.sale_price, request.user.id, now)
    }
    database.prepare("UPDATE purchase_orders SET status='received', received_at=? WHERE id=?").run(now, order.id)
    const expenseId = crypto.randomUUID()
    const supplierName = database.prepare('SELECT name FROM suppliers WHERE id = ?').get(order.supplier_id).name
    database.prepare(`INSERT INTO expenses(id, title, category, amount, payment_method, note, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        expenseId,
        `کڕینی کەرەستە - ${order.order_number}`,
        'کڕینی کەرەستە',
        order.subtotal_amount,
        paidAmount > 0 ? paymentMethod : 'electronic',
        `داواکاریی کڕین ${order.order_number} لە ${supplierName}`,
        request.user.id,
        now
      )
    if (paidAmount > 0) {
      database.prepare(`INSERT INTO supplier_payments(id, supplier_id, purchase_id, amount, payment_method, note, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), order.supplier_id, order.id, paidAmount,
          paymentMethod, 'پارەدانی لە کاتی وەرگرتنی کاڵا', request.user.id, now)
      if (paymentMethod === 'cash') database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
        VALUES ('adjustment', ?, ?, ?, ?)`).run(-paidAmount, `پارەدان بۆ کڕین ${order.order_number}`, request.user.id, now)
    }
    received = { id: order.id, orderNumber: order.order_number, supplierId: order.supplier_id,
      status: 'received', subtotalAmount: order.subtotal_amount, paidAmount, receivedAt: now }
  })
  receiveOrder.immediate()
  response.json(received)
}))

app.post('/api/suppliers/:id/payments', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const amount = validateInteger(request.body?.amount, 'بڕی پارەدان')
  if (amount <= 0) throw new HttpError(400, 'بڕی پارەدان دەبێت گەورەتر لە سفر بێت.')
  const paymentMethod = request.body?.paymentMethod
  if (!['cash', 'electronic'].includes(paymentMethod)) throw new HttpError(400, 'شێوازی پارەدان نادروستە.')
  const note = validateText(request.body?.note ?? '', 'تێبینی', 180, { optional: true })
  const now = new Date().toISOString()
  const result = database.transaction(() => {
    const supplier = database.prepare('SELECT id FROM suppliers WHERE id=?').get(request.params.id)
    if (!supplier) throw new HttpError(404, 'دابینکەرەکە نەدۆزرایەوە.')
    const totals = database.prepare(`SELECT
      COALESCE((SELECT SUM(subtotal_amount) FROM purchase_orders WHERE supplier_id=? AND status='received'),0) AS purchased,
      COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id=?),0) AS paid`).get(request.params.id, request.params.id)
    const balance = totals.purchased - totals.paid
    if (amount > balance) throw new HttpError(409, `بڕی پارەدان لە قەرزی دابینکەر زیاترە (${balance}).`)
    const id = crypto.randomUUID()
    database.prepare(`INSERT INTO supplier_payments(id, supplier_id, amount, payment_method, note, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, request.params.id, amount, paymentMethod, note, request.user.id, now)
    if (paymentMethod === 'cash') database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
      VALUES ('adjustment', ?, ?, ?, ?)`).run(-amount, `پارەدان بۆ دابینکەر${note ? `: ${note}` : ''}`, request.user.id, now)
    return { id, supplierId: request.params.id, amount, paymentMethod, note, createdAt: now, balance: balance - amount }
  })
  response.status(201).json(result.immediate())
}))

app.get('/api/sales/products', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const products = database.prepare(`SELECT id, name, barcode, sale_price AS salePrice, quantity, unit
    FROM products WHERE quantity > 0 ORDER BY name COLLATE NOCASE`).all()
  response.json(products)
}))

app.get('/api/sales/config', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const settings = database.prepare('SELECT tax_rate_bps AS taxRateBps, tax_name AS taxName FROM accounting_settings WHERE id = 1').get()
  response.json(settings)
}))

app.post('/api/sales', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const items = request.body?.items
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) throw new HttpError(400, 'فرۆشتن دەبێت لانیکەم یەک کاڵا و زۆرترین ١٠٠ کاڵا لەخۆبگرێت.')
  if (request.body?.isExport !== undefined && typeof request.body.isExport !== 'boolean') throw new HttpError(400, 'جۆری فرۆشتن نادروستە.')
  const isExport = request.body?.isExport === true
  const currencyCode = isExport ? validateText(request.body?.currencyCode, 'دراو', 3).toUpperCase() : 'IQD'
  if (isExport && !['IQD', 'USD', 'EUR', 'GBP'].includes(currencyCode)) throw new HttpError(400, 'دراوی هەڵبژێردراو پشتگیری ناکرێت.')
  const exchangeRateInput = request.body?.exchangeRate
  const exchangeRate = !isExport || currencyCode === 'IQD' ? 1 : Number(exchangeRateInput)
  if (isExport && currencyCode !== 'IQD' && (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 1_000_000_000)) {
    throw new HttpError(400, 'نرخی ئاڵوگۆڕ دەبێت ژمارەیەکی دروستی گەورەتر لە سفر بێت.')
  }
  const shippingCost = isExport ? validateInteger(request.body?.shippingCost ?? 0, 'کرێی ناردن') : 0
  const customsCharges = isExport ? validateInteger(request.body?.customsCharges ?? 0, 'کرێی گومرک') : 0
  const destinationCountry = isExport ? validateText(request.body?.destinationCountry ?? '', 'وڵاتی مەبەست', 80, { optional: true }) || null : null
  const customerName = validateText(request.body?.customerName ?? '', 'ناوی کڕیار', 100, { optional: true })
  const quantities = new Map()
  for (const item of items) {
    const productId = validateText(item?.productId, 'کاڵا', 80)
    const quantity = Number(item?.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new HttpError(400, 'بڕی فرۆشتن دەبێت ژمارەیەکی تەواوی گەورەتر لە سفر بێت.')
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity)
  }
  const paymentMethod = request.body?.paymentMethod ?? 'cash'
  if (!['cash', 'electronic', 'credit'].includes(paymentMethod)) throw new HttpError(400, 'شێوازی پارەدان نادروستە.')
  if (isExport && paymentMethod === 'credit') throw new HttpError(400, 'فرۆشتنی صادرات ناتوانێت بە قەرز تۆمار بکرێت.')
  const customerId = validateText(request.body?.customerId ?? '', 'کڕیار', 80, { optional: true })
  if (paymentMethod === 'credit' && !customerId) throw new HttpError(400, 'بۆ فرۆشتنی قەرز، کڕیار هەڵبژێرە.')
  if (customerId && !database.prepare('SELECT id FROM customers WHERE id=?').get(customerId)) throw new HttpError(404, 'کڕیارەکە نەدۆزرایەوە.')

  const saleId = crypto.randomUUID()
  const receiptNumber = `SWZ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const createdAt = new Date().toISOString()
  let totalAmount = 0
  let totalCost = 0
  let subtotalAmount = 0
  let taxAmount = 0
  let taxRateBps = 0
  let saleTaxName = 'باژ'
  let amountPaid = 0
  let earnedPoints = 0
  const saleItems = []
  const recordSale = database.transaction(() => {
    const settings = database.prepare('SELECT tax_rate_bps, tax_name FROM accounting_settings WHERE id = 1').get()
    const loyaltySettings = database.prepare('SELECT amount_per_point FROM loyalty_settings WHERE id=1').get()
    taxRateBps = settings.tax_rate_bps
    saleTaxName = settings.tax_name
    for (const [productId, quantity] of quantities) {
      const product = database.prepare('SELECT id, name, quantity, sale_price, purchase_price FROM products WHERE id = ?').get(productId)
      if (!product) throw new HttpError(404, 'یەکێک لە کاڵاکانی فرۆشتن نەدۆزرایەوە.')
      if (product.quantity < quantity) throw new HttpError(409, `بڕی کۆگای ${product.name} بەشی ئەم فرۆشتنە ناکات.`)
      subtotalAmount += product.sale_price * quantity
      totalCost += product.purchase_price * quantity
      if (!Number.isSafeInteger(subtotalAmount) || !Number.isSafeInteger(totalCost)) throw new HttpError(400, 'کۆی نرخەکان زۆر گەورەیە.')
      const itemId = crypto.randomUUID()
      saleItems.push({ id: itemId, productId, productName: product.name, quantity, salePrice: product.sale_price, purchasePrice: product.purchase_price })
      database.prepare('UPDATE products SET quantity = quantity - ?, updated_at = ? WHERE id = ? AND quantity >= ?')
        .run(quantity, createdAt, productId, quantity)
      database.prepare(`INSERT INTO stock_adjustments(id, product_id, product_name, amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), productId, product.name, -quantity, `فرۆشتن ${receiptNumber}`, createdAt)
    }
    taxAmount = Math.round(subtotalAmount * taxRateBps / 10000)
    totalAmount = subtotalAmount + taxAmount + shippingCost + customsCharges
    if (!Number.isSafeInteger(totalAmount)) throw new HttpError(400, 'کۆی فرۆشتن زۆر گەورەیە.')
    amountPaid = paymentMethod === 'credit' ? 0 : totalAmount
    database.prepare(`INSERT INTO sales(id, receipt_number, user_id, customer_id, customer_name, subtotal_amount, tax_rate_bps, tax_name, tax_amount,
     total_amount, total_cost, amount_paid, is_export, currency_code, exchange_rate, shipping_cost, customs_charges, destination_country, is_credit, payment_method, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
     .run(saleId, receiptNumber, request.user.id, customerId || null, customerName, subtotalAmount, taxRateBps, saleTaxName, taxAmount,
         totalAmount, totalCost, amountPaid, isExport ? 1 : 0, currencyCode, exchangeRate, shippingCost, customsCharges, destinationCountry,
         paymentMethod === 'credit' ? 1 : 0, paymentMethod === 'credit' ? 'cash' : paymentMethod, createdAt)
    const insertItem = database.prepare(`INSERT INTO sale_items(id, sale_id, product_id, product_name, quantity, sale_price, purchase_price)
      VALUES (@id, @saleId, @productId, @productName, @quantity, @salePrice, @purchasePrice)`)
    saleItems.forEach((item) => insertItem.run({ ...item, saleId }))
    if (paymentMethod === 'cash' && amountPaid > 0) {
      database.prepare(`INSERT INTO cash_ledger(kind, amount, sale_id, note, user_id, created_at)
        VALUES ('sale', ?, ?, ?, ?, ?)`).run(amountPaid, saleId, `فرۆشتن ${receiptNumber}`, request.user.id, createdAt)
    }
    if (customerId && loyaltySettings.amount_per_point > 0) {
      earnedPoints = Math.floor(subtotalAmount / loyaltySettings.amount_per_point)
      if (earnedPoints > 0) database.prepare(`INSERT INTO loyalty_ledger(id, customer_id, sale_id, points, source, note, user_id, created_at)
        VALUES (?, ?, ?, ?, 'sale', ?, ?, ?)`).run(crypto.randomUUID(), customerId, saleId, earnedPoints,
          `خاڵی فرۆشتن ${receiptNumber}`, request.user.id, createdAt)
    }
  })
  recordSale.immediate()
  response.status(201).json({ id: saleId, receiptNumber, customerId: customerId || null, customerName: customerName || null,
    subtotalAmount, taxRateBps, taxName: saleTaxName, taxAmount, totalAmount, amountPaid, amountDue: totalAmount - amountPaid,
    totalCost, profit: subtotalAmount + shippingCost + customsCharges - totalCost, paymentMethod, isCredit: paymentMethod === 'credit',
    isExport, currencyCode, exchangeRate, shippingCost, customsCharges, destinationCountry, earnedPoints, createdAt,
    sellerName: request.user.name, items: saleItems })
}))

function invoiceById(id) {
   const sale = database.prepare(`SELECT sales.id, sales.receipt_number AS receiptNumber, sales.subtotal_amount AS subtotalAmount,
     sales.tax_rate_bps AS taxRateBps, sales.tax_name AS taxName, sales.tax_amount AS taxAmount,
     sales.total_amount AS totalAmount, sales.total_cost AS totalCost, sales.amount_paid AS amountPaid,
     sales.is_credit AS isCreditFlag, sales.customer_id AS customerId,
     COALESCE(NULLIF(sales.customer_name, ''), customers.name) AS customerName,
     sales.payment_method AS storedPaymentMethod, sales.created_at AS createdAt, users.name AS sellerName,
     sales.is_export AS isExport, sales.currency_code AS currencyCode, sales.exchange_rate AS exchangeRate,
     sales.shipping_cost AS shippingCost, sales.customs_charges AS customsCharges, sales.destination_country AS destinationCountry,
     COALESCE((SELECT SUM(sales_returns.total_amount) FROM sales_returns WHERE sales_returns.sale_id=sales.id),0) AS returnedAmount,
     COALESCE((SELECT SUM(sales_returns.subtotal_amount) FROM sales_returns WHERE sales_returns.sale_id=sales.id),0) AS returnedSubtotal,
     COALESCE((SELECT SUM(sales_returns.tax_amount) FROM sales_returns WHERE sales_returns.sale_id=sales.id),0) AS returnedTax
     FROM sales JOIN users ON users.id = sales.user_id LEFT JOIN customers ON customers.id=sales.customer_id WHERE sales.id = ?`).get(id)
  if (!sale) return null
  const items = database.prepare(`SELECT sale_items.id, sale_items.product_id AS productId, sale_items.product_name AS productName, sale_items.quantity,
    sale_items.sale_price AS salePrice, sale_items.purchase_price AS purchasePrice,
    COALESCE((SELECT SUM(return_items.quantity) FROM return_items WHERE return_items.sale_item_id=sale_items.id),0) AS returnedQuantity
    FROM sale_items WHERE sale_items.sale_id = ? ORDER BY sale_items.rowid`).all(id)
  const isCredit = Boolean(sale.isCreditFlag)
  return { ...sale, isCredit, isExport: Boolean(sale.isExport), paymentMethod: isCredit ? 'credit' : sale.storedPaymentMethod,
    amountDue: isCredit ? Math.max(0, sale.totalAmount - sale.amountPaid - sale.returnedAmount) : 0,
    profit: sale.subtotalAmount + sale.shippingCost + sale.customsCharges - sale.totalCost, items }
}

app.get('/api/sales', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
    const sales = database.prepare(`SELECT sales.id, sales.receipt_number AS receiptNumber, sales.total_amount AS totalAmount,
      sales.subtotal_amount AS subtotalAmount, sales.tax_amount AS taxAmount, sales.amount_paid AS amountPaid,
      sales.is_credit AS isCreditFlag, sales.customer_id AS customerId,
      COALESCE(NULLIF(sales.customer_name, ''), customers.name) AS customerName,
      sales.payment_method AS storedPaymentMethod, sales.created_at AS createdAt, users.name AS sellerName,
      sales.is_export AS isExportFlag, sales.currency_code AS currencyCode, sales.exchange_rate AS exchangeRate,
      sales.shipping_cost AS shippingCost, sales.customs_charges AS customsCharges, sales.destination_country AS destinationCountry,
      COALESCE((SELECT SUM(sales_returns.total_amount) FROM sales_returns WHERE sales_returns.sale_id=sales.id),0) AS returnedAmount
      FROM sales JOIN users ON users.id = sales.user_id LEFT JOIN customers ON customers.id=sales.customer_id ORDER BY sales.created_at DESC LIMIT 100`)
    .all().map((sale) => ({ ...sale, isCredit: Boolean(sale.isCreditFlag), isExport: Boolean(sale.isExportFlag), paymentMethod: sale.isCreditFlag ? 'credit' : sale.storedPaymentMethod,
      amountDue: sale.isCreditFlag ? Math.max(0, sale.totalAmount - sale.amountPaid - sale.returnedAmount) : 0 }))
  response.json(sales)
}))

app.get('/api/sales/:id', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const invoice = invoiceById(request.params.id)
  if (!invoice) throw new HttpError(404, 'پسووڵەکە نەدۆزرایەوە.')
  response.json(invoice)
}))

app.get('/api/sales/:id/returns', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const sale = database.prepare('SELECT id FROM sales WHERE id=?').get(request.params.id)
  if (!sale) throw new HttpError(404, 'پسووڵەکە نەدۆزرایەوە.')
  const returns = database.prepare(`SELECT id, return_number AS returnNumber, subtotal_amount AS subtotalAmount,
    tax_amount AS taxAmount, total_amount AS totalAmount, refund_method AS refundMethod, reason, created_at AS createdAt
    FROM sales_returns WHERE sale_id=? ORDER BY created_at DESC`).all(sale.id)
  const items = database.prepare(`SELECT id, sale_item_id AS saleItemId, product_name AS productName, quantity,
    unit_sale_price AS unitSalePrice, unit_cost AS unitCost FROM return_items WHERE return_id=?`)
  response.json(returns.map((item) => ({ ...item, items: items.all(item.id) })))
}))

app.post('/api/sales/:id/returns', requireAuth, requireRoles('owner', 'cashier'), safeHandler((request, response) => {
  const reason = validateText(request.body?.reason, 'هۆکاری گەڕاندنەوە', 180)
  const refundMethod = request.body?.refundMethod
  if (!['cash', 'electronic', 'credit'].includes(refundMethod)) throw new HttpError(400, 'شێوازی گەڕاندنەوە نادروستە.')
  const requested = request.body?.items
  if (!Array.isArray(requested) || requested.length === 0 || requested.length > 100) throw new HttpError(400, 'گەڕاندنەوە دەبێت لانیکەم یەک کاڵا لەخۆبگرێت.')
  const normalized = new Map()
  for (const item of requested) {
    const saleItemId = validateText(item?.saleItemId, 'ڕیزی کاڵای پسووڵە', 80)
    const quantity = Number(item?.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new HttpError(400, 'بڕی گەڕاندنەوە دەبێت ژمارەیەکی تەواوی گەورەتر لە سفر بێت.')
    normalized.set(saleItemId, (normalized.get(saleItemId) ?? 0) + quantity)
  }
  const returnId = crypto.randomUUID()
  const returnNumber = `RET-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const now = new Date().toISOString()
  let result
  const processReturn = database.transaction(() => {
    const sale = database.prepare('SELECT id, customer_id, subtotal_amount, tax_amount, total_amount, amount_paid, is_credit FROM sales WHERE id=?').get(request.params.id)
    if (!sale) throw new HttpError(404, 'پسووڵەکە نەدۆزرایەوە.')
    if (refundMethod === 'credit' && (!sale.is_credit || !sale.customer_id)) throw new HttpError(400, 'گەڕاندنەوە بۆ قەرز تەنها بۆ فرۆشتنی قەرزی کڕیاری تۆمارکراوە.')
    let subtotal = 0
    let costAmount = 0
    const returnItems = []
    for (const [saleItemId, quantity] of normalized) {
      const line = database.prepare('SELECT * FROM sale_items WHERE id=? AND sale_id=?').get(saleItemId, sale.id)
      if (!line) throw new HttpError(404, 'ڕیزی کاڵاکە لەم پسووڵەدا نییە.')
      const alreadyReturned = database.prepare('SELECT COALESCE(SUM(quantity),0) AS quantity FROM return_items WHERE sale_item_id=?').get(line.id).quantity
      if (alreadyReturned + quantity > line.quantity) throw new HttpError(409, `بڕی گەڕاندنەوەی ${line.product_name} لە بڕی فرۆشراو زیاترە.`)
      const subtotalLine = line.sale_price * quantity
      const costLine = line.purchase_price * quantity
      if (!Number.isSafeInteger(subtotal + subtotalLine) || !Number.isSafeInteger(costAmount + costLine)) throw new HttpError(400, 'کۆی گەڕاندنەوە زۆر گەورەیە.')
      subtotal += subtotalLine
      costAmount += costLine
      returnItems.push({ line, quantity })
    }
    const previousReturns = database.prepare(`SELECT COALESCE(SUM(subtotal_amount),0) AS subtotal,
      COALESCE(SUM(tax_amount),0) AS tax, COALESCE(SUM(total_amount),0) AS total,
      COALESCE(SUM(CASE WHEN refund_method='credit' THEN total_amount ELSE 0 END),0) AS creditTotal,
      COALESCE(SUM(CASE WHEN refund_method<>'credit' THEN total_amount ELSE 0 END),0) AS refundedTotal
      FROM sales_returns WHERE sale_id=?`).get(sale.id)
    if (previousReturns.subtotal + subtotal > sale.subtotal_amount) throw new HttpError(409, 'کۆی گەڕاندنەوە لە نرخی بنەڕەتی فرۆشتن زیاترە.')
    const nextTaxCumulative = sale.subtotal_amount === 0 ? 0 : Math.round(sale.tax_amount * (previousReturns.subtotal + subtotal) / sale.subtotal_amount)
    const taxAmount = nextTaxCumulative - previousReturns.tax
    const totalAmount = subtotal + taxAmount
    if (refundMethod === 'credit') {
      const customerBalance = database.prepare(`SELECT
        COALESCE((SELECT SUM(total_amount-amount_paid) FROM sales WHERE customer_id=?),0)
        - COALESCE((SELECT SUM(amount) FROM customer_payments WHERE customer_id=?),0)
        - COALESCE((SELECT SUM(sales_returns.total_amount) FROM sales_returns JOIN sales ON sales.id=sales_returns.sale_id WHERE sales.customer_id=? AND sales_returns.refund_method='credit'),0) AS balance`)
        .get(sale.customer_id, sale.customer_id, sale.customer_id).balance
      if (totalAmount > customerBalance) throw new HttpError(409, 'گەڕاندنەوەکە لە قەرزی ماوەی کڕیار زیاترە.')
    } else if (totalAmount > sale.amount_paid - previousReturns.refundedTotal) {
      throw new HttpError(409, 'بڕی پارەی گەڕاندراوەوە لە پارەی وەرگیراوی ئەم پسووڵە زیاترە.')
    }
    const insertReturn = database.prepare(`INSERT INTO sales_returns(id, return_number, sale_id, subtotal_amount, cost_amount,
      tax_amount, total_amount, refund_method, reason, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      returnId, returnNumber, sale.id, subtotal, costAmount, taxAmount, totalAmount, refundMethod, reason, request.user.id, now)
    void insertReturn
    const insertItem = database.prepare(`INSERT INTO return_items(id, return_id, sale_item_id, product_id, product_name, quantity, unit_sale_price, unit_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const { line, quantity } of returnItems) {
      insertItem.run(crypto.randomUUID(), returnId, line.id, line.product_id, line.product_name, quantity, line.sale_price, line.purchase_price)
      if (line.product_id) {
        database.prepare('UPDATE products SET quantity=quantity+?, updated_at=? WHERE id=?').run(quantity, now, line.product_id)
        database.prepare(`INSERT INTO stock_adjustments(id, product_id, product_name, amount, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), line.product_id, line.product_name, quantity, `گەڕاندنەوە ${returnNumber}`, now)
      }
    }
    if (refundMethod === 'cash' && totalAmount > 0) database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
      VALUES ('adjustment', ?, ?, ?, ?)`).run(-totalAmount, `گەڕاندنەوە ${returnNumber}`, request.user.id, now)
    const settings = database.prepare('SELECT amount_per_point FROM loyalty_settings WHERE id=1').get()
    if (sale.customer_id && settings.amount_per_point > 0) {
      const pointsAlreadyRevoked = database.prepare("SELECT COALESCE(SUM(-points),0) AS points FROM loyalty_ledger WHERE sale_id=? AND source='return'").get(sale.id).points
      const totalPointsToRevoke = Math.floor((previousReturns.subtotal + subtotal) / settings.amount_per_point)
      const pointsBalance = database.prepare('SELECT COALESCE(SUM(points),0) AS points FROM loyalty_ledger WHERE customer_id=?').get(sale.customer_id).points
      const pointsToRevoke = Math.min(Math.max(0, totalPointsToRevoke - pointsAlreadyRevoked), Math.max(0, pointsBalance))
      if (pointsToRevoke) database.prepare(`INSERT INTO loyalty_ledger(id, customer_id, sale_id, return_id, points, source, note, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'return', ?, ?, ?)`).run(crypto.randomUUID(), sale.customer_id, sale.id, returnId, -pointsToRevoke,
          `گەڕاندنەوە ${returnNumber}`, request.user.id, now)
    }
    result = { id: returnId, returnNumber, saleId: sale.id, subtotalAmount: subtotal, taxAmount, totalAmount, refundMethod,
      reason, createdAt: now, items: returnItems.map(({ line, quantity }) => ({ saleItemId: line.id, productName: line.product_name, quantity })) }
  })
  processReturn.immediate()
  response.status(201).json(result)
}))

app.get('/api/reports', requireAuth, requireRoles('owner', 'stock_manager'), safeHandler((request, response) => {
  const days = Number(request.query.days ?? 30)
  if (![7, 30, 90].includes(days)) throw new HttpError(400, 'ماوەی ڕاپۆرت دەبێت ٧، ٣٠ یان ٩٠ ڕۆژ بێت.')
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)))
  const startDate = start.toISOString().slice(0, 10)
   const summary = database.prepare(`SELECT 
     COALESCE(SUM(subtotal_amount + shipping_cost + customs_charges), 0) AS revenue,
     COALESCE(SUM(subtotal_amount + shipping_cost + customs_charges - total_cost), 0) AS profit,
     COALESCE(SUM(CASE WHEN is_export = 0 THEN subtotal_amount ELSE 0 END), 0) AS revenue_domestic,
     COALESCE(SUM(CASE WHEN is_export = 1 THEN subtotal_amount + shipping_cost + customs_charges ELSE 0 END), 0) AS revenue_export,
     COALESCE(SUM(CASE WHEN is_export = 0 THEN (subtotal_amount - total_cost) ELSE 0 END), 0) AS profit_domestic,
     COALESCE(SUM(CASE WHEN is_export = 1 THEN (subtotal_amount + shipping_cost + customs_charges - total_cost) ELSE 0 END), 0) AS profit_export,
     COALESCE(SUM(tax_amount), 0) AS taxCollected,
     COUNT(*) AS salesCount,
     COALESCE(SUM((SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_items.sale_id = sales.id)), 0) AS unitsSold,
     COALESCE(SUM(CASE WHEN is_export = 0 THEN (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_items.sale_id = sales.id) ELSE 0 END), 0) AS unitsSold_domestic,
     COALESCE(SUM(CASE WHEN is_export = 1 THEN (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_items.sale_id = sales.id) ELSE 0 END), 0) AS unitsSold_export
     FROM sales WHERE created_at >= ?`).get(start.toISOString())
   const dailySales = database.prepare(`SELECT 
     date(created_at) AS date,
     SUM(subtotal_amount + shipping_cost + customs_charges) AS revenue,
     SUM(subtotal_amount + shipping_cost + customs_charges - total_cost) AS profit,
     SUM(CASE WHEN is_export = 0 THEN subtotal_amount ELSE 0 END) AS revenue_domestic,
     SUM(CASE WHEN is_export = 1 THEN subtotal_amount + shipping_cost + customs_charges ELSE 0 END) AS revenue_export,
     SUM(CASE WHEN is_export = 0 THEN (subtotal_amount - total_cost) ELSE 0 END) AS profit_domestic,
     SUM(CASE WHEN is_export = 1 THEN (subtotal_amount + shipping_cost + customs_charges - total_cost) ELSE 0 END) AS profit_export,
     COUNT(*) AS salesCount
     FROM sales WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date`).all(start.toISOString())
  const salesByDate = new Map(dailySales.map((row) => [row.date, row]))
   const salesTimeline = Array.from({ length: days }, (_, offset) => {
     const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
     const row = salesByDate.get(date)
     return { 
       date, 
       revenue: row?.revenue ?? 0, 
       profit: row?.profit ?? 0,
       revenue_domestic: row?.revenue_domestic ?? 0,
       revenue_export: row?.revenue_export ?? 0,
       profit_domestic: row?.profit_domestic ?? 0,
       profit_export: row?.profit_export ?? 0,
       salesCount: row?.salesCount ?? 0 
     }
   })
  const lowStock = database.prepare(`SELECT id, name, barcode, quantity, minimum_stock AS minimumStock, unit
    FROM products WHERE quantity <= minimum_stock ORDER BY quantity ASC, name COLLATE NOCASE LIMIT 100`).all()
  const stockMovements = database.prepare(`SELECT id, product_id AS productId, product_name AS productName, amount, reason, created_at AS createdAt
    FROM stock_adjustments ORDER BY created_at DESC LIMIT 30`).all()
  const priceChanges = database.prepare(`SELECT id, product_id AS productId, product_name AS productName,
    old_purchase_price AS oldPurchasePrice, new_purchase_price AS newPurchasePrice,
    old_sale_price AS oldSalePrice, new_sale_price AS newSalePrice, created_at AS createdAt
    FROM price_changes ORDER BY created_at DESC LIMIT 30`).all()
  const recentSales = database.prepare(`SELECT sales.id, sales.receipt_number AS receiptNumber, sales.total_amount AS totalAmount,
    sales.created_at AS createdAt, users.name AS sellerName FROM sales JOIN users ON users.id = sales.user_id
    ORDER BY sales.created_at DESC LIMIT 8`).all()
  response.json({ days, startDate, summary, salesTimeline, lowStock, stockMovements, priceChanges, recentSales })
}))

function currentCashPosition() {
  const latest = database.prepare(`SELECT id, ledger_through_id AS ledgerThroughId, counted_balance AS countedBalance,
    expected_balance AS expectedBalance, variance, note, created_at AS createdAt
    FROM cash_reconciliations ORDER BY created_at DESC, rowid DESC LIMIT 1`).get()
  const openingBalance = latest?.countedBalance ?? 0
  const afterLedgerId = latest?.ledgerThroughId ?? 0
  const ledgerThroughId = database.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM cash_ledger').get().id
  const change = database.prepare('SELECT COALESCE(SUM(amount), 0) AS amount FROM cash_ledger WHERE id > ? AND id <= ?').get(afterLedgerId, ledgerThroughId).amount
  return {
    openingBalance,
    expectedBalance: openingBalance + change,
    ledgerThroughId,
    lastReconciledAt: latest?.createdAt ?? null,
    lastCountedBalance: latest?.countedBalance ?? null,
  }
}

app.get('/api/accounting', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const days = Number(request.query.days ?? 30)
  if (![7, 30, 90].includes(days)) throw new HttpError(400, 'ماوەی ژمێریاری دەبێت ٧، ٣٠ یان ٩٠ ڕۆژ بێت.')
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)))
  const settings = database.prepare('SELECT tax_rate_bps AS taxRateBps, tax_name AS taxName, updated_at AS updatedAt FROM accounting_settings WHERE id = 1').get()
   const salesSummary = database.prepare(`SELECT 
      COALESCE(SUM(subtotal_amount + shipping_cost + customs_charges), 0) AS revenue,
      COALESCE(SUM(tax_amount), 0) AS taxCollected,
      COALESCE(SUM(total_cost), 0) AS costOfGoods,
      COALESCE(SUM(subtotal_amount + shipping_cost + customs_charges - total_cost), 0) AS grossProfit,
      COUNT(*) AS salesCount,
      COALESCE(SUM(CASE WHEN is_export = 0 THEN subtotal_amount ELSE 0 END), 0) AS revenue_domestic,
      COALESCE(SUM(CASE WHEN is_export = 1 THEN subtotal_amount + shipping_cost + customs_charges ELSE 0 END), 0) AS revenue_export,
      COALESCE(SUM(CASE WHEN is_export = 0 THEN (subtotal_amount - total_cost) ELSE 0 END), 0) AS grossProfit_domestic,
      COALESCE(SUM(CASE WHEN is_export = 1 THEN (subtotal_amount + shipping_cost + customs_charges - total_cost) ELSE 0 END), 0) AS grossProfit_export
      FROM sales WHERE created_at >= ?`).get(start.toISOString())
   const currencyBreakdown = database.prepare(`SELECT 
      currency_code AS currencyCode,
      COUNT(*) AS salesCount,
      COALESCE(SUM(subtotal_amount + shipping_cost + customs_charges), 0) AS revenue,
      COALESCE(SUM(tax_amount), 0) AS taxCollected,
      COALESCE(SUM(total_cost), 0) AS costOfGoods,
      COALESCE(SUM(subtotal_amount + shipping_cost + customs_charges - total_cost), 0) AS grossProfit
      FROM sales WHERE created_at >= ?
      GROUP BY currency_code ORDER BY revenue DESC`).all(start.toISOString())
   const expenseSummary = database.prepare(`SELECT COALESCE(SUM(amount), 0) AS expenses
     FROM expenses WHERE created_at >= ? AND voided = 0`).get(start.toISOString())
   const cogsByCategory = database.prepare(`SELECT 
       categories.name AS category,
       COALESCE(SUM(sale_items.quantity * sale_items.purchase_price), 0) AS cogs
       FROM sales
       JOIN sale_items ON sale_items.sale_id = sales.id
       JOIN products ON products.id = sale_items.product_id
       JOIN categories ON categories.id = products.category_id
       WHERE sales.created_at >= ?
       GROUP BY categories.id, categories.name
       ORDER BY cogs DESC`).all(start.toISOString())
   const taxSummary = database.prepare(`SELECT
     COALESCE((SELECT SUM(tax_amount) FROM sales), 0) AS collectedAllTime,
     COALESCE((SELECT SUM(amount) FROM tax_payments WHERE voided = 0), 0) AS remittedAllTime,
     COALESCE((SELECT SUM(amount) FROM tax_payments WHERE voided = 0 AND created_at >= ?), 0) AS remittedInPeriod`).get(start.toISOString())
   const expenses = database.prepare(`SELECT expenses.id, expenses.title, expenses.category, expenses.amount,
     expenses.payment_method AS paymentMethod, expenses.note, expenses.created_at AS createdAt, users.name AS enteredBy,
     expenses.voided, expenses.voided_at AS voidedAt, voided_user.name AS voidedByName
     FROM expenses JOIN users ON users.id = expenses.user_id LEFT JOIN users voided_user ON voided_user.id = expenses.voided_by
     WHERE expenses.voided = 0 ORDER BY expenses.created_at DESC LIMIT 40`).all()
  const cashMovements = database.prepare(`SELECT id, kind, amount, sale_id AS saleId, expense_id AS expenseId,
    note, created_at AS createdAt FROM cash_ledger ORDER BY id DESC LIMIT 30`).all()
   const reconciliations = database.prepare(`SELECT id, opening_balance AS openingBalance, expected_balance AS expectedBalance,
     counted_balance AS countedBalance, variance, note, created_at AS createdAt, voided
     FROM cash_reconciliations WHERE voided = 0 ORDER BY created_at DESC, rowid DESC LIMIT 10`).all()
   const taxPayments = database.prepare(`SELECT id, amount, payment_method AS paymentMethod, note,
     created_at AS createdAt, voided FROM tax_payments WHERE voided = 0 ORDER BY created_at DESC LIMIT 20`).all()
  const cash = currentCashPosition()
  response.json({
    days,
    startDate: start.toISOString().slice(0, 10),
    taxSettings: settings,
    summary: { ...salesSummary, expenses: expenseSummary.expenses, netProfit: salesSummary.grossProfit - expenseSummary.expenses },
    taxSummary: { ...taxSummary, payable: taxSummary.collectedAllTime - taxSummary.remittedAllTime },
    cash,
    currencyBreakdown,
    cogsByCategory,
    expenses,
    cashMovements,
    reconciliations,
    taxPayments,
  })
}))

app.patch('/api/accounting/tax-settings', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const taxRateBps = Number(request.body?.taxRateBps)
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new HttpError(400, 'ڕێژەی باژ دەبێت لە ٠٪ تا ١٠٠٪ بێت.')
  const taxName = validateText(request.body?.taxName, 'ناوی باژ', 30)
  const updatedAt = new Date().toISOString()
  database.prepare('UPDATE accounting_settings SET tax_rate_bps = ?, tax_name = ?, updated_at = ? WHERE id = 1').run(taxRateBps, taxName, updatedAt)
  response.json({ taxRateBps, taxName, updatedAt })
}))

app.post('/api/accounting/expenses', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const title = validateText(request.body?.title, 'ناوی خەرجی', 100)
  const category = validateText(request.body?.category, 'پۆلی خەرجی', 50)
  const amount = validateInteger(request.body?.amount, 'بڕی خەرجی')
  if (amount <= 0) throw new HttpError(400, 'بڕی خەرجی دەبێت گەورەتر لە سفر بێت.')
  const paymentMethod = request.body?.paymentMethod
  if (!['cash', 'electronic'].includes(paymentMethod)) throw new HttpError(400, 'شێوازی پارەدان نادروستە.')
  const note = validateText(request.body?.note ?? '', 'تێبینی', 240, { optional: true })
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const createExpense = database.transaction(() => {
    database.prepare(`INSERT INTO expenses(id, title, category, amount, payment_method, note, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, title, category, amount, paymentMethod, note, request.user.id, createdAt)
    if (paymentMethod === 'cash') database.prepare(`INSERT INTO cash_ledger(kind, amount, expense_id, note, user_id, created_at)
      VALUES ('expense', ?, ?, ?, ?, ?)`).run(-amount, id, `خەرجی: ${title}`, request.user.id, createdAt)
  })
  createExpense.immediate()
  response.status(201).json({ id, title, category, amount, paymentMethod, note, createdAt })
}))

app.post('/api/accounting/tax-payments', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const amount = validateInteger(request.body?.amount, 'بڕی پارەدانی باژ')
  if (amount <= 0) throw new HttpError(400, 'بڕی پارەدانی باژ دەبێت گەورەتر لە سفر بێت.')
  const paymentMethod = request.body?.paymentMethod
  if (!['cash', 'electronic'].includes(paymentMethod)) throw new HttpError(400, 'شێوازی پارەدانی باژ نادروستە.')
  const note = validateText(request.body?.note ?? '', 'تێبینی', 240, { optional: true })
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const remit = database.transaction(() => {
    const collected = database.prepare('SELECT COALESCE(SUM(tax_amount), 0) AS amount FROM sales').get().amount
    const alreadyRemitted = database.prepare('SELECT COALESCE(SUM(amount), 0) AS amount FROM tax_payments').get().amount
    const payable = collected - alreadyRemitted
    if (amount > payable) throw new HttpError(409, `بڕی پارەدانی باژ لە باژی ماوە زیاترە (${payable}).`)
    database.prepare(`INSERT INTO tax_payments(id, amount, payment_method, note, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, amount, paymentMethod, note, request.user.id, createdAt)
    if (paymentMethod === 'cash') database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
      VALUES ('adjustment', ?, ?, ?, ?)`).run(-amount, `پارەدانی باژ: ${note || 'بێ تێبینی'}`, request.user.id, createdAt)
  })
  remit.immediate()
  response.status(201).json({ id, amount, paymentMethod, note, createdAt })
}))

app.post('/api/accounting/cash-adjustments', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const direction = request.body?.direction
  if (!['in', 'out'].includes(direction)) throw new HttpError(400, 'جۆری ڕێکخستنی سندوق نادروستە.')
  const amount = validateInteger(request.body?.amount, 'بڕی سندوق')
  if (amount <= 0) throw new HttpError(400, 'بڕی ڕێکخستن دەبێت گەورەتر لە سفر بێت.')
  const note = validateText(request.body?.note, 'هۆکار', 160)
  const createdAt = new Date().toISOString()
  const signedAmount = direction === 'in' ? amount : -amount
  const result = database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
    VALUES ('adjustment', ?, ?, ?, ?)`).run(signedAmount, note, request.user.id, createdAt)
  response.status(201).json({ id: Number(result.lastInsertRowid), amount: signedAmount, note, createdAt, cash: currentCashPosition() })
}))

app.post('/api/accounting/reconciliations', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const countedBalance = validateInteger(request.body?.countedBalance, 'بڕی ژمێردراوی سندوق')
  const note = validateText(request.body?.note ?? '', 'تێبینی', 240, { optional: true })
  const createdAt = new Date().toISOString()
  let reconciliation
  const reconcile = database.transaction(() => {
    const position = currentCashPosition()
    const variance = countedBalance - position.expectedBalance
    const id = crypto.randomUUID()
    database.prepare(`INSERT INTO cash_reconciliations(id, ledger_through_id, opening_balance, expected_balance,
      counted_balance, variance, note, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, position.ledgerThroughId, position.openingBalance, position.expectedBalance, countedBalance,
        variance, note, request.user.id, createdAt)
    reconciliation = { id, openingBalance: position.openingBalance, expectedBalance: position.expectedBalance,
      countedBalance, variance, note, createdAt }
  })
  reconcile.immediate()
  response.status(201).json({ reconciliation, cash: currentCashPosition() })
}))

app.get('/api/accounting/categories', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  response.json(database.prepare('SELECT id, name, color, created_at AS createdAt FROM expense_categories ORDER BY name COLLATE NOCASE').all())
}))

app.post('/api/accounting/categories', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const name = validateText(request.body?.name, 'ناوی پۆلی خەرجی', 50)
  const color = validateText(request.body?.color ?? '#4b9061', 'ڕەنگی پۆل', 7)
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  try {
    database.prepare('INSERT INTO expense_categories(id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, name, color, createdAt)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم پۆلە پێشتر تۆمارکراوە.')
    throw error
  }
  response.status(201).json({ id, name, color, createdAt })
}))

app.delete('/api/accounting/categories/:id', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'پۆلی خەرجی', 80)
  const category = database.prepare('SELECT id FROM expense_categories WHERE id = ?').get(id)
  if (!category) throw new HttpError(404, 'پۆلەکە نەدۆزرایەوە.')
  database.prepare('DELETE FROM expense_categories WHERE id = ?').run(id)
  response.status(204).end()
}))

app.delete('/api/accounting/expenses/:id', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'خەرجی', 80)
  const expense = database.prepare('SELECT * FROM expenses WHERE id = ? AND voided = 0').get(id)
  if (!expense) throw new HttpError(404, 'خەرجییەکە نەدۆزرایەوە.')
  const now = new Date().toISOString()
  const voidExpense = database.transaction(() => {
    database.prepare('UPDATE expenses SET voided = 1, voided_at = ?, voided_by = ? WHERE id = ?').run(now, request.user.id, id)
    if (expense.payment_method === 'cash') {
      database.prepare(`INSERT INTO cash_ledger(kind, amount, expense_id, note, user_id, created_at)
        VALUES ('expense', ?, ?, ?, ?, ?)`).run(expense.amount, id, `پووچکردنەوەی خەرجی: ${expense.title}`, request.user.id, now)
    }
  })
  voidExpense.immediate()
  response.status(204).end()
}))

app.patch('/api/accounting/expenses/:id', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'خەرجی', 80)
  const expense = database.prepare('SELECT * FROM expenses WHERE id = ? AND voided = 0').get(id)
  if (!expense) throw new HttpError(404, 'خەرجییەکە نەدۆزرایەوە.')
  const title = validateText(request.body?.title ?? expense.title, 'ناوی خەرجی', 100)
  const category = validateText(request.body?.category ?? expense.category, 'پۆلی خەرجی', 50)
  const amount = validateInteger(request.body?.amount ?? expense.amount, 'بڕی خەرجی')
  if (amount <= 0) throw new HttpError(400, 'بڕی خەرجی دەبێت گەورەتر لە سفر بێت.')
  const paymentMethod = request.body?.paymentMethod ?? expense.payment_method
  if (!['cash', 'electronic'].includes(paymentMethod)) throw new HttpError(400, 'شێوازی پارەدان نادروستە.')
  const note = validateText(request.body?.note ?? expense.note, 'تێبینی', 240, { optional: true })
  const now = new Date().toISOString()
  const patchExpense = database.transaction(() => {
    const amountDiff = amount - expense.amount
    const methodChanged = paymentMethod !== expense.payment_method
    database.prepare(`UPDATE expenses SET title = ?, category = ?, amount = ?, payment_method = ?, note = ? WHERE id = ?`)
      .run(title, category, amount, paymentMethod, note, id)
    if (expense.payment_method === 'cash' && paymentMethod === 'electronic') {
      database.prepare(`INSERT INTO cash_ledger(kind, amount, expense_id, note, user_id, created_at)
        VALUES ('expense', ?, ?, ?, ?, ?)`).run(expense.amount, id, `دەستکاری خەرجی: ${title}`, request.user.id, now)
    } else if (expense.payment_method === 'electronic' && paymentMethod === 'cash') {
      database.prepare(`INSERT INTO cash_ledger(kind, amount, expense_id, note, user_id, created_at)
        VALUES ('expense', ?, ?, ?, ?, ?)`).run(-amount, id, `دەستکاری خەرجی: ${title}`, request.user.id, now)
    } else if (methodChanged === false && expense.payment_method === 'cash') {
      if (amountDiff !== 0) {
        database.prepare(`INSERT INTO cash_ledger(kind, amount, expense_id, note, user_id, created_at)
          VALUES ('expense', ?, ?, ?, ?, ?)`).run(-amountDiff, id, `دەستکاری خەرجی: ${title}`, request.user.id, now)
      }
    }
  })
  patchExpense.immediate()
  response.json({ id, title, category, amount, paymentMethod, note, createdAt: expense.created_at })
}))

app.delete('/api/accounting/tax-payments/:id', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'پارەدانی باژ', 80)
  const payment = database.prepare('SELECT * FROM tax_payments WHERE id = ? AND voided = 0').get(id)
  if (!payment) throw new HttpError(404, 'پارەدانی باژ نەدۆزرایەوە.')
  const now = new Date().toISOString()
  const voidPayment = database.transaction(() => {
    database.prepare('UPDATE tax_payments SET voided = 1, voided_at = ?, voided_by = ? WHERE id = ?').run(now, request.user.id, id)
    if (payment.payment_method === 'cash') {
      database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
        VALUES ('adjustment', ?, ?, ?, ?)`).run(payment.amount, `پووچکردنەوەی پارەدانی باژ`, request.user.id, now)
    }
  })
  voidPayment.immediate()
  response.status(204).end()
}))

app.delete('/api/accounting/reconciliations/:id', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'ژمێریاری سندوق', 80)
  const reconciliation = database.prepare('SELECT * FROM cash_reconciliations WHERE id = ? AND voided = 0').get(id)
  if (!reconciliation) throw new HttpError(404, 'ژمێریاری سندوق نەدۆزرایەوە.')
  const now = new Date().toISOString()
  database.prepare('UPDATE cash_reconciliations SET voided = 1, voided_at = ?, voided_by = ? WHERE id = ?').run(now, request.user.id, id)
  response.status(204).end()
}))

app.delete('/api/accounting/cash-adjustments/:id', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const id = validateText(request.params.id, 'جووڵەی سندوق', 80)
  const movement = database.prepare('SELECT * FROM cash_ledger WHERE id = ? AND kind = ?').get(id, 'adjustment')
  if (!movement) throw new HttpError(404, 'جووڵەی سندوق نەدۆزرایەوە.')
  const now = new Date().toISOString()
  const voidAdjustment = database.transaction(() => {
    database.prepare(`INSERT INTO cash_ledger(kind, amount, note, user_id, created_at)
      VALUES ('adjustment', ?, ?, ?, ?)`).run(-movement.amount, `پووچکردنەوەی جووڵەی سندوق: ${movement.note}`, request.user.id, now)
  })
  voidAdjustment.immediate()
  response.status(201).json({ id: movement.id, amount: -movement.amount, note: `پووچکردنەوەی جووڵەی سندوق: ${movement.note}`, createdAt: now, cash: currentCashPosition() })
}))

let backupInProgress = null

async function createBackup(kind = 'manual') {
  if (backupInProgress) return backupInProgress
  backupInProgress = (async () => {
    await fs.promises.mkdir(backupDirectory, { recursive: true })
    const now = new Date()
    const suffix = kind === 'auto'
      ? now.toISOString().slice(0, 10)
      : `${now.toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${crypto.randomBytes(3).toString('hex')}`
    const filename = `sawza-${kind}-${suffix}.sqlite`
    const filePath = path.join(backupDirectory, filename)
    await database.backup(filePath)
    if (kind === 'auto') {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      for (const entry of await fs.promises.readdir(backupDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.startsWith('sawza-auto-') || !entry.name.endsWith('.sqlite')) continue
        const candidate = path.join(backupDirectory, entry.name)
        if ((await fs.promises.stat(candidate)).mtimeMs < cutoff) await fs.promises.unlink(candidate)
      }
    }
    const stat = await fs.promises.stat(filePath)
    return { filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), kind }
  })().finally(() => { backupInProgress = null })
  return backupInProgress
}

async function ensureDailyBackup() {
  if (!database.prepare("SELECT 1 FROM users WHERE role = 'owner' AND active = 1 LIMIT 1").get()) return
  const filename = `sawza-auto-${new Date().toISOString().slice(0, 10)}.sqlite`
  const filePath = path.join(backupDirectory, filename)
  if (fs.existsSync(filePath)) return
  await createBackup('auto')
}

function reopenDatabase() {
  database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  migrateSalesColumns()
  migrateUserColumns()
  currentSession = database.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1')
}

function validateBackup(filePath) {
  const restored = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = restored.pragma('integrity_check')
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new HttpError(400, 'پاشەکەوتەکە دروست نییە یان فایلەکە زیانی پێگەیشتووە.')
    const tables = new Set(restored.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name))
    const requiredTables = ['users', 'sessions', 'categories', 'products', 'stock_adjustments', 'sales', 'sale_items', 'price_changes', 'accounting_settings', 'expenses', 'cash_ledger', 'cash_reconciliations', 'tax_payments']
    if (requiredTables.some((table) => !tables.has(table))) throw new HttpError(400, 'ئەم پاشەکەوتە لەگەڵ وەشانی ئێستای سیستەم ناگونجێت.')
    const userColumns = new Set(restored.pragma('table_info(users)').map((column) => column.name))
    const salesColumns = new Set(restored.pragma('table_info(sales)').map((column) => column.name))
    if (!['id', 'name', 'username', 'role', 'password_salt', 'password_hash', 'active'].every((column) => userColumns.has(column)) ||
      !['subtotal_amount', 'tax_rate_bps', 'tax_name', 'tax_amount', 'payment_method'].every((column) => salesColumns.has(column))) {
      throw new HttpError(400, 'پاشەکەوتەکە زۆر کۆنە؛ سەرەتا سیستەمەکە بە وەشانی گونجاو نوێ بکەرەوە.')
    }
    if (!restored.prepare("SELECT 1 FROM users WHERE role = 'owner' AND active = 1 LIMIT 1").get()) throw new HttpError(400, 'پاشەکەوتەکە هیچ خاوەنێکی چالاکی تێدا نییە.')
    if (restored.pragma('foreign_key_check').length > 0) throw new HttpError(400, 'پاشەکەوتەکە تێکچوونی پەیوەندییەکانی داتا تێدایە.')
  } finally {
    restored.close()
  }
}

app.get('/api/admin/backups', requireAuth, requireRoles('owner'), safeHandler(async (request, response) => {
  await fs.promises.mkdir(backupDirectory, { recursive: true })
  const backups = []
  for (const entry of await fs.promises.readdir(backupDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^sawza-(manual|auto|pre-restore)-[\w.-]+\.sqlite$/.test(entry.name)) continue
    const stat = await fs.promises.stat(path.join(backupDirectory, entry.name))
    const kind = entry.name.startsWith('sawza-pre-restore-') ? 'pre-restore' : entry.name.startsWith('sawza-auto-') ? 'auto' : 'manual'
    backups.push({ filename: entry.name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), kind })
  }
  backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  response.setHeader('Cache-Control', 'no-store')
  response.json(backups)
}))

app.post('/api/admin/backups', requireAuth, requireRoles('owner'), safeHandler(async (request, response) => {
  const backup = await createBackup('manual')
  response.setHeader('Cache-Control', 'no-store')
  response.status(201).json(backup)
}))

app.get('/api/admin/backups/:filename', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const filename = request.params.filename
  if (!/^sawza-(manual|auto|pre-restore)-[\w.-]+\.sqlite$/.test(filename)) throw new HttpError(400, 'ناوی فایلەکە نادروستە.')
  const filePath = path.join(backupDirectory, filename)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new HttpError(404, 'فایلی پاشەکەوت نەدۆزرایەوە.')
  response.setHeader('Cache-Control', 'no-store')
  response.download(filePath, filename)
}))

app.post('/api/admin/restore', requireAuth, requireRoles('owner'), express.raw({ type: 'application/octet-stream', limit: '100mb' }), safeHandler(async (request, response) => {
  if (!Buffer.isBuffer(request.body) || request.body.length < 100) throw new HttpError(400, 'فایلی پاشەکەوت بنێرە.')
  await fs.promises.mkdir(backupDirectory, { recursive: true })
  const restoreFile = path.join(backupDirectory, `restore-${crypto.randomUUID()}.sqlite`)
  const stagedDatabaseFile = `${databasePath}.restore-${crypto.randomUUID()}`
  await fs.promises.writeFile(restoreFile, request.body, { flag: 'wx' })
  let closed = false
  let safetyBackup = null
  try {
    validateBackup(restoreFile)
    safetyBackup = await createBackup('pre-restore')
    await fs.promises.copyFile(restoreFile, stagedDatabaseFile)
    database.pragma('wal_checkpoint(TRUNCATE)')
    database.close()
    closed = true
    await fs.promises.rm(`${databasePath}-wal`, { force: true })
    await fs.promises.rm(`${databasePath}-shm`, { force: true })
    await fs.promises.rename(stagedDatabaseFile, databasePath)
    reopenDatabase()
    closed = false
    response.setHeader('Cache-Control', 'no-store')
    response.json({ restored: true, safetyBackup: safetyBackup.filename, reloadRequired: true })
  } catch (error) {
    if (closed) {
      try { reopenDatabase() } catch (reopenError) {
        try {
          if (safetyBackup) await fs.promises.copyFile(path.join(backupDirectory, safetyBackup.filename), databasePath)
          reopenDatabase()
        } catch (recoveryError) {
          console.error('Failed to recover database after restore error', recoveryError)
          console.error('Failed to reopen database after restore error', reopenError)
        }
      }
    }
    throw error
  } finally {
    await fs.promises.rm(restoreFile, { force: true })
    await fs.promises.rm(stagedDatabaseFile, { force: true })
  }
}))

app.get('/api/accounts', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const users = database.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser)
  response.json(users)
}))

app.post('/api/accounts', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const name = validateText(request.body?.name, 'ناو', 80)
  const username = validateText(request.body?.username, 'ناوی بەکارهێنەر', 40).toLocaleLowerCase()
  const email = validateText(request.body?.email ?? '', 'ئیمایل', 200, { optional: true })
  const role = request.body?.role
  const password = request.body?.password
  if (!roles.has(role)) throw new HttpError(400, 'ڕۆڵەکە ناسراو نییە.')
  if (!validPassword(password)) throw new HttpError(400, 'وشەی نهێنی دەبێت لانیکەم ٨ پیت بێت.')
  const credentials = hashPassword(password)
  const user = { id: crypto.randomUUID(), name, username, email: email || null, role, password_salt: credentials.salt, password_hash: credentials.hash, active: 1, created_at: new Date().toISOString() }
  try {
    database.prepare('INSERT INTO users(id, name, username, email, role, password_salt, password_hash, active, created_at) VALUES (@id, @name, @username, @email, @role, @password_salt, @password_hash, @active, @created_at)').run(user)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'ئەم ناوی بەکارهێنەرە پێشتر هەیە.')
    throw error
  }
  response.status(201).json(publicUser(user))
}))

app.patch('/api/accounts/:id', requireAuth, requireRoles('owner'), safeHandler((request, response) => {
  const target = database.prepare('SELECT * FROM users WHERE id = ?').get(request.params.id)
  if (!target) throw new HttpError(404, 'هەژمارەکە نەدۆزرایەوە.')
  if (request.body?.role !== undefined) {
    const role = request.body.role
    if (!roles.has(role)) throw new HttpError(400, 'ڕۆڵەکە ناسراو نییە.')
    if (target.role === 'owner' && target.active && role !== 'owner' && activeOwnerCount() <= 1) throw new HttpError(409, 'دەبێت لانیکەم یەک هەژماری خاوەنی چالاک بمێنێتەوە.')
    database.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id)
  }
  if (request.body?.active !== undefined) {
    if (typeof request.body.active !== 'boolean') throw new HttpError(400, 'بارودۆخی هەژمار نادروستە.')
    if (target.id === request.user.id && !request.body.active) throw new HttpError(400, 'ناتوانیت هەژماری خۆت ناچالاک بکەیت.')
    if (target.active && target.role === 'owner' && !request.body.active && activeOwnerCount() <= 1) throw new HttpError(409, 'دەبێت لانیکەم یەک هەژماری خاوەنی چالاک بمێنێتەوە.')
    database.prepare('UPDATE users SET active = ? WHERE id = ?').run(request.body.active ? 1 : 0, target.id)
    if (!request.body.active) database.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
  }
  const updated = database.prepare('SELECT * FROM users WHERE id = ?').get(target.id)
  response.json(publicUser(updated))
}))

app.get('/api/health', (request, response) => response.json({ ok: true }))

app.use('/api', (request, response) => response.status(404).json({ error: 'ئەم داواکارییە نەدۆزرایەوە.' }))
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  if (error instanceof HttpError) return response.status(error.status).json({ error: error.message })
  console.error(error)
  response.status(500).json({ error: 'هەڵەیەکی ناوخۆیی ڕوویدا. تکایە دووبارە هەوڵ بدەرەوە.' })
})

if (isProduction) {
  app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: '1h' }))
  app.get('*splat', (request, response) => response.sendFile(path.join(root, 'dist', 'index.html')))
} else {
  const vite = await createViteServer({ configFile: path.join(root, 'vite.config.ts'), server: { middlewareMode: true, ...(process.env.SAWZA_SMOKE_TEST ? { hmr: false } : {}) }, appType: 'spa' })
  app.use(vite.middlewares)
}

const port = Number(process.env.PORT ?? 5173)
const httpServer = app.listen(port, '127.0.0.1', () => {
  console.log(`Sawza app and API listening on http://127.0.0.1:${port}`)
  console.log(`SQLite database: ${databasePath}`)
})

const shutdown = () => {
  httpServer.close(() => {
    try {
      database.pragma('wal_checkpoint(TRUNCATE)')
      database.close()
    } finally {
      process.exit(0)
    }
  })
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

if (!process.env.SAWZA_SMOKE_TEST) {
  void ensureDailyBackup().catch((error) => console.error('Automatic database backup failed', error))
  const backupTimer = setInterval(() => {
    void ensureDailyBackup().catch((error) => console.error('Automatic database backup failed', error))
  }, 60 * 60 * 1000)
  backupTimer.unref()
}
