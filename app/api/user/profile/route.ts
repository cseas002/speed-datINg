import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { verifyEmailSession } from '@/lib/auth'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('sessionToken')

        if (!sessionToken?.value) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const session = await verifyEmailSession(sessionToken.value)
        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const user = await prisma.participant.findUnique({
            where: { email: session.email },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                age: user.age,
                sex: user.sex,
                partnerSexPref: user.partnerSexPref,
                aboutMe: user.aboutMe,
                lookingFor: user.lookingFor,
                personality: user.personality,
            },
        })
    } catch (error) {
        console.error('Profile fetch error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch profile' },
            { status: 500 }
        )
    }
}
