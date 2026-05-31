import { clerkMiddleware, requireAuth } from '@clerk/express'

export const clerkAuth = clerkMiddleware()
export const protect = requireAuth()

export function protectAdmin(req, res, next) {
  const role = req.auth?.sessionClaims?.metadata?.role
  if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
  next()
}