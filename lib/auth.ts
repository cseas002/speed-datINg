import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { prisma } from './db'

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days
const ADMIN_SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Password hashing using bcrypt with salt
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10
  return bcrypt.hash(password, saltRounds)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// User Session Management
export async function createEmailSession(email: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION)

  // Delete any existing sessions for this email
  await prisma.session.deleteMany({ where: { email } })

  // Create new session
  const session = await prisma.session.create({
    data: {
      email,
      token,
      expiresAt,
    },
  })

  return session
}

export async function verifyEmailSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
  })

  if (!session) {
    return null
  }

  // Check if session is expired
  if (new Date() > session.expiresAt) {
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }

  return session
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({ where: { token } })
}

// Admin Session Management
export async function createAdminSession(adminId: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION)

  await prisma.adminSession.deleteMany({ where: { adminId } })

  const session = await prisma.adminSession.create({
    data: {
      adminId,
      token,
      expiresAt,
    },
  })

  return session
}

export async function verifyAdminSession(token: string) {
  const session = await prisma.adminSession.findUnique({
    where: { token },
  })

  if (!session) {
    return null
  }

  if (new Date() > session.expiresAt) {
    await prisma.adminSession.delete({ where: { id: session.id } })
    return null
  }

  return session
}

export async function deleteAdminSession(token: string) {
  await prisma.adminSession.deleteMany({ where: { token } })
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD not configured')
  }
  return password === adminPassword
}

// Magic Link Management
const MAGIC_LINK_DURATION = 5 * 60 * 60 * 1000 // 5 hours

// Generate a random password
export function generateRandomPassword(length: number = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

export async function createMagicLink(email: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + MAGIC_LINK_DURATION)

  // Generate a random password
  const password = generateRandomPassword(12)

  // Delete any existing unused magic links for this email
  await prisma.magicLink.deleteMany({
    where: { email, used: false },
  })

  // Create new magic link
  const magicLink = await prisma.magicLink.create({
    data: {
      email,
      token,
      expiresAt,
    },
  })

  return { magicLink, password }
}

export async function verifyMagicLink(token: string) {
  const magicLink = await prisma.magicLink.findUnique({
    where: { token },
  })

  if (!magicLink) {
    return null
  }

  // Check if expired
  if (new Date() > magicLink.expiresAt) {
    await prisma.magicLink.delete({ where: { id: magicLink.id } })
    return null
  }

  // Check if already used
  if (magicLink.used) {
    return null
  }

  // Mark as used
  await prisma.magicLink.update({
    where: { id: magicLink.id },
    data: { used: true },
  })

  return magicLink
}
