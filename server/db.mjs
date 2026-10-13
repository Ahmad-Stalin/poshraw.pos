import { AsyncLocalStorage } from 'node:async_hooks'
import { getDatabase } from '@netlify/database'

// Thin async wrapper that keeps the original prepare().get/all/run call style while running on Netlify Database (Postgres).
const transactionClient = new AsyncLocalStorage()
let connection = null
const pool = () => (connection ??= getDatabase()).pool

// int8 and numeric come back from Postgres as strings; the app works with plain numbers.
const numericTypes = new Set([20, 1700])
const normalizeRows = (result) => {
  const numericFields = (result.fields ?? []).filter((field) => numericTypes.has(field.dataTypeID)).map((field) => field.name)
  if (!numericFields.length) return result.rows
  return result.rows.map((row) => {
    for (const name of numericFields) if (row[name] !== null && row[name] !== undefined) row[name] = Number(row[name])
    return row
  })
}

// Translate the SQLite-style SQL used by the routes: `?` / `@name` placeholders and camelCase aliases.
const translated = new Map()
function translate(sql) {
  const cached = translated.get(sql)
  if (cached) return cached
  const names = []
  let positional = 0
  let text = ''
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    if (char === "'") {
      const end = sql.indexOf("'", index + 1)
      text += sql.slice(index, end + 1)
      index = end
    } else if (char === '?') {
      positional += 1
      text += `$${positional}`
    } else if (char === '@' && /[a-z_]/i.test(sql[index + 1] ?? '')) {
      const name = /^[a-z_]\w*/i.exec(sql.slice(index + 1))[0]
      let position = names.indexOf(name)
      if (position < 0) { names.push(name); position = names.length - 1 }
      text += `$${position + 1}`
      index += name.length
    } else {
      text += char
    }
  }
  const aliases = new Set([...text.matchAll(/\bAS\s+([A-Za-z_]\w*)/gi)].map((match) => match[1]).filter((alias) => /[A-Z]/.test(alias)))
  for (const alias of aliases) text = text.replace(new RegExp(`(?<!["\\w.])${alias}(?!["\\w])`, 'g'), `"${alias}"`)
  const result = { text, names }
  translated.set(sql, result)
  return result
}

async function execute(sql, args) {
  const { text, names } = translate(sql)
  const values = names.length ? names.map((name) => args[0]?.[name] ?? null) : args.map((value) => value === undefined ? null : value)
  const client = transactionClient.getStore() ?? pool()
  try {
    return await client.query(text, values)
  } catch (error) {
    // Keep the SQLite-style messages the route handlers check for.
    if (error?.code === '23505') error.message = `UNIQUE constraint failed: ${error.message}`
    throw error
  }
}

export const database = {
  prepare(sql) {
    return {
      get: async (...args) => normalizeRows(await execute(sql, args))[0],
      all: async (...args) => normalizeRows(await execute(sql, args)),
      run: async (...args) => ({ changes: (await execute(sql, args)).rowCount ?? 0 }),
    }
  },
  async exec(sql) {
    const client = transactionClient.getStore() ?? pool()
    await client.query(sql)
  },
  // Every transaction takes the same advisory lock so writes are serialized like the original single-writer SQLite setup.
  transaction(callback) {
    const run = async (...args) => {
      if (transactionClient.getStore()) return callback(...args)
      const client = await pool().connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(7262)')
        const result = await transactionClient.run(client, () => callback(...args))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    }
    run.immediate = run
    return run
  },
}
