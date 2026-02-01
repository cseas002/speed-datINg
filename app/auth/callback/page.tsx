'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AuthCallback() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [status, setStatus] = useState('Logging in...')

    useEffect(() => {
        const token = searchParams.get('token')

        if (!token) {
            setStatus('No token provided')
            setTimeout(() => router.push('/'), 2000)
            return
        }

        // Verify token and set cookie
        const verifyCookie = async () => {
            try {
                const cookieRes = await fetch('/api/auth/callback?token=' + token)
                if (cookieRes.ok) {
                    router.push('/dashboard')
                } else {
                    setStatus('Login failed')
                    setTimeout(() => router.push('/'), 2000)
                }
            } catch (err) {
                setStatus('Network error')
                setTimeout(() => router.push('/'), 2000)
            }
        }

        verifyCookie()
    }, [searchParams, router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
            <div className="bg-white rounded-lg shadow-2xl p-8 text-center">
                <h1 className="text-2xl font-bold mb-4">{status}</h1>
                <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-transparent border-t-purple-500 rounded-full mx-auto"></div>
            </div>
        </div>
    )
}
