import { useState, type FormEvent } from 'react'

type AuthScreenProps = {
  setupRequired: boolean
  onSignIn: (username: string, password: string) => Promise<string | undefined>
  onCreateOwner: (name: string, username: string, password: string, email: string) => Promise<string | undefined>
}

function AuthScreen({ setupRequired, onSignIn, onCreateOwner }: AuthScreenProps) {
  const isFirstRun = setupRequired
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (isFirstRun) {
        if (password !== confirmation) {
          setError('وشەی نهێنی و دووپاتکردنەوەکە یەک ناگرنەوە.')
          return
        }
        const issue = await onCreateOwner(name.trim(), username.trim(), password, email.trim())
        if (issue) setError(issue)
        return
      }

      const issue = await onSignIn(username.trim(), password)
      if (issue) setError(issue)
    } catch {
      setError('نەتوانرا چوونەژوورەوە ئەنجام بدرێت. تکایە دووبارە هەوڵ بدەرەوە.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen" dir="rtl">
      <section className="auth-brand-panel">
        <div className="auth-brand-lockup"><span className="auth-brand-mark">س</span><span><strong>سەوزا</strong><small>سیستەمی بەڕێوەبردن</small></span></div>
        <div className="auth-brand-message"><span className="auth-brand-kicker">بەڕێوەبردنی کارەکەت بە سادەیی</span><h1>هەموو کۆگاکەت<br />لە یەک شوێن.</h1><p>بەڕێوەبردنی کاڵا و مامەڵەکان بە شێوەیەکی ڕێکخراو و ئاسان.</p><div className="auth-brand-decoration"><span>▧</span><i /><i /><i /></div></div>
        <span className="auth-brand-footer">سپێتی و سەوز · بەڕێوەبردنی کۆگا</span>
      </section>
      <section className="auth-form-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-card-icon">{isFirstRun ? '✦' : '↪'}</div>
          <span className="eyebrow">{isFirstRun ? 'دامەزراندنی سەرەتایی' : 'بەخێربێیتەوە'}</span>
          <h2>{isFirstRun ? 'هەژماری خاوەن دروست بکە' : 'چوونەژوورەوە'}</h2>
          <p className="auth-intro">{isFirstRun ? 'یەکەم هەژمار بە ڕۆڵی خاوەن دروست دەکرێت.' : 'بۆ چوونە ناو سیستەم، زانیارییەکانت بنووسە.'}</p>
          <div className="auth-fields">
            {isFirstRun && <label className="form-field">ناوی تەواو<input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="ناوی بەکارهێنەر" /></label>}
            {isFirstRun && <label className="form-field">ئیمایل<input type="email" maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ئیمایل (بۆ ئازاد)" /></label>}
            <label className="form-field">ناوی بەکارهێنەر<input autoFocus={!isFirstRun} required autoComplete="username" maxLength={40} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ناوی بەکارهێنەر" /></label>
            <label className="form-field">وشەی نهێنی<input required type="password" minLength={8} autoComplete={isFirstRun ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="لانیکەم ٨ پیت" /></label>
            {isFirstRun && <label className="form-field">دووپاتکردنەوەی وشەی نهێنی<input required type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="وشەی نهێنی دووبارە بنووسە" /></label>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'چاوەڕێ بە...' : isFirstRun ? 'دروستکردنی هەژماری خاوەن' : 'چوونەژوورەوە'}</button>
          <p className="auth-local-note">هەژمار و زانیارییەکان لە بنکەدراوەی SQLite ـی ڕاژەر پاشەکەوت دەکرێن. بۆ بەکارهێنانی لە دەرەوە، ڕاژەرەکە بە HTTPS وەبەرهێنە.</p>
        </form>
      </section>
    </main>
  )
}

export default AuthScreen
