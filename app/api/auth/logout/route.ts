import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies()
        
        // Clear all auth cookies
        cookieStore.delete('token')
        cookieStore.delete('sessionToken')
        cookieStore.delete('adminToken')

        // Redirect to home
        return NextResponse.redirect(new URL('/', request.url))
    } catch (error) {
        console.error('Logout error:', error)
        return NextResponse.json({ error: 'Failed to logout' }, { status: 500 })
    }
}
