'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function AdminLogin() {
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
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Login failed')
                return
            }

            // Redirect to admin dashboard
            router.push('/admin/callback?token=' + data.token)
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-600 flex items-center justify-center p-4">
            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-2xl p-8 w-full max-w-md border border-pink-100">
                <div className="flex items-center justify-center gap-3 mb-4">
                    <Image
                        src="/IN-logo.png"
                        alt="International Committee"
                        width={48}
                        height={48}
                        className="object-contain"
                        priority
                    />
                    <span className="text-lg font-semibold text-pink-600">International Committee</span>
                </div>
                <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">
                    🔐 Admin Panel
                </h1>
                <p className="text-center text-black mb-6">
                    Speed Dating Event Management
                </p>

                <div className="flex items-center justify-center gap-2 mb-6 text-pink-500">
                    <span aria-hidden className="text-lg">♥</span>
                    <span className="text-sm font-semibold">Love powered logistics</span>
                    <span aria-hidden className="text-lg">♥</span>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-black mb-2">
                            Admin Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@example.com"
                            className="w-full px-4 py-2 border border-pink-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-black bg-white placeholder:text-gray-400"
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
                            className="w-full px-4 py-2 border border-pink-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-black bg-white placeholder:text-gray-400"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
                    >
                        {loading ? 'Logging in...' : 'Admin Login 💗'}
                    </button>
                </form>

                {error && (
                    <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="mt-6 pt-6 border-t border-pink-100">
                    <Link
                        href="/"
                        className="w-full block text-center bg-pink-100 hover:bg-pink-200 text-pink-900 font-bold py-2 px-4 rounded-lg transition"
                    >
                        Back to Login
                    </Link>
                </div>
            </div>
        </main>
    )
}
