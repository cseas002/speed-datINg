import { NextResponse } from 'next/server'
import { verifyEmailSession, verifyMagicLink, createEmailSession, createAdminSession } from '@/lib/auth'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const token = searchParams.get('token')
        const type = searchParams.get('type') || 'user'

        if (!token) {
            return NextResponse.json(
                { error: 'Missing token' },
                { status: 400 }
            )
        }

        // Try magic link first
        const magicLink = await verifyMagicLink(token)
        if (magicLink) {
            if (type === 'admin') {
                // Admin login via magic link
                const admin = await prisma.admin.findUnique({
                    where: { email: magicLink.email },
                })

                if (!admin) {
                    return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
                }

                // Create admin session
                const session = await createAdminSession(admin.id)
                const cookieStore = await cookies()
                cookieStore.set('adminToken', session.token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 24 * 60 * 60,
                })

                return NextResponse.redirect(new URL('/admin/dashboard', request.url))
            } else {
                // User login via magic link
                const participant = await prisma.participant.findUnique({
                    where: { email: magicLink.email },
                })

                if (!participant) {
                    return NextResponse.json({ error: 'User not found' }, { status: 404 })
                }

                // Create user session
                const session = await createEmailSession(magicLink.email)
                const cookieStore = await cookies()
                cookieStore.set('token', session.token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 7 * 24 * 60 * 60,
                })

                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        }

        // Fallback to old session logic
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
