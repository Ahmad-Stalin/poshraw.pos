import { useState, type FormEvent } from 'react'
import type { AppRole, UserAccount } from './authTypes'
import { roleLabels } from './authTypes'
import type { NewAccount } from './api'

type AccessManagementViewProps = {
  accounts: UserAccount[]
  currentUserId: string
  onCreateAccount: (account: NewAccount) => Promise<string | undefined>
  onChangeRole: (userId: string, role: AppRole) => Promise<string | undefined>
  onToggleActive: (userId: string) => Promise<string | undefined>
}

const roleDescriptions: Record<AppRole, string> = {
  owner: 'دەستڕاگەیشتنی تەواو بە هەموو بەشەکانی سیستەم و بەڕێوەبردنی هەژمارەکان.',
  cashier: 'فرۆشتن، کڕیاران، بەرنامەی وەفاداری و پشکنینی نرخ.',
  stock_manager: 'کاڵا و کۆگا، کڕین، دابینکەران، ڕاپۆرت و پشکنینی نرخ.',
}

function AccessManagementView({ accounts, currentUserId, onCreateAccount, onChangeRole, onToggleActive }: AccessManagementViewProps) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AppRole>('cashier')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    const normalizedUsername = username.trim().toLocaleLowerCase()
    if (accounts.some((account) => account.username === normalizedUsername)) {
      setError('ئەم ناوی بەکارهێنەرە پێشتر هەیە.')
      return
    }

    setBusy(true)
    try {
      const issue = await onCreateAccount({
        name: name.trim(),
        username: normalizedUsername,
        email: email.trim() || undefined,
        role,
        password,
      })
      if (issue) {
        setError(issue)
        return
      }
      setName('')
      setUsername('')
      setEmail('')
      setPassword('')
      setRole('cashier')
      setSuccess('هەژماری بەکارهێنەر دروست کرا.')
    } catch {
      setError('نەتوانرا هەژمارەکە دروست بکرێت.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="access-view">
      <div className="access-intro"><div><span className="eyebrow">پاراستن و بەکارهێنەران</span><h2>هەژمار و دەستڕاگەیشتن</h2><p>هەژماری تیم دروست بکە و ڕۆڵی دەستڕاگەیشتنیان دیاری بکە.</p></div><span className="access-count">{accounts.length} هەژمار</span></div>
      <div className="role-cards">{(['owner', 'cashier', 'stock_manager'] as AppRole[]).map((item) => <article className="role-card" key={item}><span className={`role-symbol role-${item}`}>{item === 'owner' ? '♛' : item === 'cashier' ? '↗' : '▧'}</span><div><strong>{roleLabels[item]}</strong><p>{roleDescriptions[item]}</p></div></article>)}</div>
      <div className="access-columns">
        <section className="panel account-create-panel"><div className="access-panel-heading"><div><h3>زیادکردنی بەکارهێنەر</h3><p>بۆ هەر کەسێک هەژماری جیاواز بەکاربهێنە.</p></div></div><form className="access-form" onSubmit={submit}><label className="form-field">ناوی تەواو<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="ناوی بەکارهێنەر" /></label><label className="form-field">ناوی بەکارهێنەر<input required autoComplete="username" maxLength={40} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ناوی چوونەژوورەوە" /></label><label className="form-field">ئیمایل<input type="email" maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ئیمایل (بۆ ئازاد)" /></label><label className="form-field">ڕۆڵ<select value={role} onChange={(event) => setRole(event.target.value as AppRole)}><option value="cashier">{roleLabels.cashier}</option><option value="stock_manager">{roleLabels.stock_manager}</option><option value="owner">{roleLabels.owner}</option></select></label><label className="form-field">وشەی نهێنیی سەرەتایی<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="لانیکەم ٨ پیت" /></label>{error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}<button type="submit" className="button button-primary" disabled={busy}>{busy ? 'چاوەڕێ بە...' : '+ دروستکردنی هەژمار'}</button></form></section>
        <section className="panel account-list-panel"><div className="access-panel-heading"><div><h3>هەژمارەکان</h3><p>هەژمارەکان و ڕۆڵی دەستڕاگەیشتنیان</p></div></div><div className="account-table-wrap"><table className="account-table"><thead><tr><th>بەکارهێنەر</th><th>ڕۆڵ</th><th>بارودۆخ</th><th>کردار</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><div className="account-person"><span>{account.name.slice(0, 1)}</span><div><strong>{account.name}{account.id === currentUserId && <small>تۆ</small>}</strong><small dir="ltr">{account.username}</small></div></div></td><td><select aria-label={`ڕۆڵی ${account.name}`} value={account.role} disabled={account.id === currentUserId} onChange={async (event) => { const issue = await onChangeRole(account.id, event.target.value as AppRole); if (issue) setError(issue) }}><option value="owner">{roleLabels.owner}</option><option value="cashier">{roleLabels.cashier}</option><option value="stock_manager">{roleLabels.stock_manager}</option></select></td><td><span className={`account-status ${account.active ? 'active' : 'inactive'}`}>{account.active ? 'چالاک' : 'ناچالاک'}</span></td><td><button className="account-toggle" disabled={account.id === currentUserId} onClick={async () => { const issue = await onToggleActive(account.id); if (issue) setError(issue) }}>{account.active ? 'ناچالاککردن' : 'چالاککردن'}</button></td></tr>)}</tbody></table></div><p className="access-security-note">ڕێگەپێدان و وشەی نهێنی لە ڕاژەر پشتڕاست دەکرێنەوە و داتا لە SQLite پاشەکەوت دەبێت.</p></section>
      </div>
    </section>
  )
}

export default AccessManagementView
