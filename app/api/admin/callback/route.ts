import { NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/auth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

        const session = await verifyAdminSession(token)
        if (!session) {
            return NextResponse.json(
                { error: 'Invalid or expired token' },
                { status: 401 }
            )
        }

        // Set cookie
        const cookieStore = await cookies()
        cookieStore.set('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60, // 24 hours
        })

        // Redirect to admin dashboard
        return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    } catch (error) {
        console.error('Admin callback error:', error)
        return NextResponse.json(
            { error: 'Failed to verify token' },
            { status: 500 }
        )
    }
}
