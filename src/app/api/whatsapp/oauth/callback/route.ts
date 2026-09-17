import { NextResponse, type NextRequest } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/whatsapp/encryption';
import { subscribeWebhookApp } from '@/lib/whatsapp/meta-api';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const META_APP_ID = process.env.META_APP_ID || '1543169234022851';
// In wacrm, META_APP_SECRET may be comma-separated if multiple apps are used
const META_APP_SECRET = (process.env.META_APP_SECRET || '').split(',')[0].trim();
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shikhabajaj.online').replace(/\/$/, '');
const REDIRECT_URI = `${SITE_URL}/api/whatsapp/oauth/callback`;

interface TokenExchangeResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}

interface DebugTokenResponse {
  data?: {
    app_id?: string;
    type?: string;
    is_valid?: boolean;
    granular_scopes?: Array<{
      scope: string;
      target_ids?: string[];
    }>;
  };
  error?: {
    message: string;
  };
}

interface PhoneNumbersResponse {
  data?: Array<{
    id: string;
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
  }>;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error || !code) {
    console.error('[OAuth Callback GET] Error from Meta:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/dashboard?oauth_error=${encodeURIComponent(errorDescription || error || 'Missing authorization code')}`, SITE_URL)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // If user is not signed in, redirect them to login with a continuation
    const returnUrl = `/api/whatsapp/oauth/callback?code=${encodeURIComponent(code)}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnUrl)}`, SITE_URL));
  }

  // Resolve account_id from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id;
  if (!accountId) {
    return NextResponse.redirect(
      new URL('/dashboard?oauth_error=No+account+linked+to+your+profile', SITE_URL)
    );
  }

  try {
    const exchangeResult = await completeOAuthOnboarding({
      code,
      accountId,
    });

    if (!exchangeResult.success) {
      return NextResponse.redirect(
        new URL(`/dashboard?oauth_error=${encodeURIComponent(exchangeResult.error || 'Connection failed')}`, SITE_URL)
      );
    }

    return NextResponse.redirect(new URL('/dashboard?connected=true', SITE_URL));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during OAuth exchange';
    console.error('[OAuth Callback GET] Unexpected failure:', err);
    return NextResponse.redirect(new URL(`/dashboard?oauth_error=${encodeURIComponent(message)}`, SITE_URL));
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id;
  if (!accountId) {
    return NextResponse.json({ error: 'No account linked to profile' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { code, waba_id, phone_number_id } = body;

    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const result = await completeOAuthOnboarding({
      code,
      accountId,
      providedWabaId: waba_id,
      providedPhoneNumberId: phone_number_id,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'OAuth exchange failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function completeOAuthOnboarding(params: {
  code: string;
  accountId: string;
  providedWabaId?: string;
  providedPhoneNumberId?: string;
}): Promise<{
  success: boolean;
  error?: string;
  wabaId?: string;
  phoneNumberId?: string;
}> {
  const { code, accountId, providedWabaId, providedPhoneNumberId } = params;

  // 1. Exchange short-lived code for permanent access token
  const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&client_secret=${META_APP_SECRET}&code=${code}`;

  const tokenRes = await fetch(tokenUrl);
  const tokenData = (await tokenRes.json()) as TokenExchangeResponse;

  if (!tokenRes.ok || !tokenData.access_token) {
    const errMsg = tokenData.error?.message || 'Failed to exchange authorization code with Meta';
    console.error('[OAuth Exchange] Token error:', tokenData);
    return { success: false, error: errMsg };
  }

  const accessToken = tokenData.access_token;

  // 2. Discover WABA ID if not provided directly
  let wabaId = providedWabaId;
  if (!wabaId) {
    const debugUrl = `https://graph.facebook.com/v22.0/debug_token?input_token=${accessToken}&access_token=${META_APP_ID}|${META_APP_SECRET}`;
    const debugRes = await fetch(debugUrl);
    const debugData = (await debugRes.json()) as DebugTokenResponse;

    if (debugData.data?.granular_scopes) {
      for (const gs of debugData.data.granular_scopes) {
        if (
          (gs.scope === 'whatsapp_business_management' || gs.scope === 'whatsapp_business_messaging') &&
          gs.target_ids &&
          gs.target_ids.length > 0
        ) {
          wabaId = gs.target_ids[0];
          break;
        }
      }
    }

    if (!wabaId) {
      // Fallback: query /me/whatsapp_business_accounts
      const meWabaRes = await fetch(`https://graph.facebook.com/v22.0/me/whatsapp_business_accounts?access_token=${accessToken}`);
      const meWabaData = await meWabaRes.json();
      if (meWabaData.data && meWabaData.data.length > 0) {
        wabaId = meWabaData.data[0].id;
      }
    }
  }

  if (!wabaId) {
    return { success: false, error: 'Could not discover WhatsApp Business Account (WABA) from token' };
  }

  // 3. Discover Phone Number ID under this WABA if not provided
  let phoneNumberId = providedPhoneNumberId;
  if (!phoneNumberId) {
    const phonesRes = await fetch(
      `https://graph.facebook.com/v22.0/${wabaId}/phone_numbers?access_token=${accessToken}`
    );
    const phonesData = (await phonesRes.json()) as PhoneNumbersResponse;

    if (phonesData.data && phonesData.data.length > 0) {
      phoneNumberId = phonesData.data[0].id;
    }
  }

  if (!phoneNumberId) {
    return { success: false, error: 'No phone number found under the connected WhatsApp Business Account' };
  }

  // 4. Subscribe the client's WABA to our Meta App
  try {
    await subscribeWebhookApp({ wabaId, accessToken });
    console.log(`[OAuth Onboarding] Successfully subscribed WABA ${wabaId} to app`);
  } catch (subErr) {
    console.warn(`[OAuth Onboarding] Webhook subscription warning for WABA ${wabaId}:`, subErr);
  }

  // 5. Encrypt token and upsert into whatsapp_config table
  const encryptedToken = encrypt(accessToken);
  const verifyToken = encrypt('maruti_webhook_verify');

  const adminDb = getAdminClient();

  // Check if this phone number is claimed by another account
  const { data: claimed } = await adminDb
    .from('whatsapp_config')
    .select('account_id')
    .eq('phone_number_id', phoneNumberId)
    .neq('account_id', accountId)
    .maybeSingle();

  if (claimed) {
    return {
      success: false,
      error: 'This WhatsApp phone number is already connected to another account on this system.',
    };
  }

  const { error: upsertErr } = await adminDb
    .from('whatsapp_config')
    .upsert(
      {
        account_id: accountId,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: encryptedToken,
        verify_token: verifyToken,
        status: 'connected',
        registered_at: new Date().toISOString(),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );

  if (upsertErr) {
    console.error('[OAuth Onboarding] DB Upsert error:', upsertErr);
    return { success: false, error: 'Failed to save configuration in database' };
  }

  return { success: true, wabaId, phoneNumberId };
}
