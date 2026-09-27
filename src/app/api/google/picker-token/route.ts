import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { accessToken, adminDb } from '@/lib/google/sheets'

export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('admin')
    const token = await accessToken(adminDb(supabase), accountId)
    return NextResponse.json({ token, apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY || '', appId: process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER || '' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return toErrorResponse(error) }
}
