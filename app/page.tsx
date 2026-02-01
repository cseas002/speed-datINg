'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      // Redirect to dashboard
      router.push('/auth/callback?token=' + data.token)
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-600 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur rounded-2xl shadow-2xl p-8 w-full max-w-md border border-pink-100">
        <div className="flex items-center justify-center gap-4 mb-4">
          <Image
            src="/IN-logo.png"
            alt="International Committee"
            width={56}
            height={56}
            className="object-contain"
            priority
          />
          <Image
            src="/speed-dating-logo.png"
            alt="Speed Dating"
            width={56}
            height={56}
            className="object-contain"
            priority
          />
        </div>
        <div className="flex flex-col items-center mb-2">
          <h1 className="text-3xl font-bold text-center text-gray-800">
            Speed Dating
          </h1>
          <p className="text-sm uppercase tracking-[0.3em] text-pink-500 mt-1">
            International Committee
          </p>
        </div>
        <p className="text-center text-black mb-6">
          View your matches, rankings, and spark something sweet.
        </p>

        <div className="flex items-center justify-center gap-2 mb-6 text-pink-500">
          <span aria-hidden className="text-xl">♥</span>
          <span className="text-sm font-semibold">More love, more matches</span>
          <span aria-hidden className="text-xl">♥</span>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-2 border border-pink-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-black placeholder:text-gray-400 bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-2 border border-pink-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-black placeholder:text-gray-400 bg-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
          >
            {loading ? 'Logging in...' : 'Login 💖'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-pink-100">
          <p className="text-center text-sm text-black mb-4">
            Admin? Sign in here:
          </p>
          <Link
            href="/admin"
            className="w-full block text-center bg-pink-100 hover:bg-pink-200 text-pink-900 font-bold py-2 px-4 rounded-lg transition duration-200"
          >
            Admin Login
          </Link>
        </div>
      </div>
    </main>
  )
}
