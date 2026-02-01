import { NextResponse } from 'next/server'
import { verifyEmailSession } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const token = searchParams.get('token')

        if (!token) {
            return NextResponse.json(
                { error: 'Missing token' },
                { status: 400 }
            )
        }

        const session = await verifyEmailSession(token)
        if (!session) {
            return NextResponse.json(
                { error: 'Invalid or expired token' },
                { status: 401 }
            )
        }

        // Set cookie
        const cookieStore = await cookies()
        cookieStore.set('sessionToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60, // 7 days
        })

        // Redirect to user dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url))
    } catch (error) {
        console.error('Callback error:', error)
        return NextResponse.json(
            { error: 'Failed to verify token' },
            { status: 500 }
        )
    }
}
