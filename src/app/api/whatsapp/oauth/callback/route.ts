import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/whatsapp/encryption';
import { subscribeWabaToApp } from '@/lib/whatsapp/meta-api';

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

function renderAuthResultHtml(options: { success: boolean; message: string; error?: string }) {
  const { success, message, error } = options;
  const redirectUrl = success ? '/dashboard?connected=true' : `/dashboard?oauth_error=${encodeURIComponent(error || message)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${success ? 'WhatsApp Connected' : 'Connection Incomplete'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
      text-align: center;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 36px 28px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${success ? 'rgba(37, 211, 102, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
      color: ${success ? '#25d366' : '#ef4444'};
      font-size: 28px;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 700;
      color: ${success ? '#f8fafc' : '#ef4444'};
    }
    p {
      margin: 0 0 16px;
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${success ? '✓' : '✕'}</div>
    <h2>${success ? 'WhatsApp Connected!' : 'Connection Incomplete'}</h2>
    <p>${message}</p>
    <p style="font-size: 12px; color: #64748b;">This window will close automatically...</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({
          type: '${success ? 'WA_EMBEDDED_SIGNUP_SUCCESS' : 'WA_EMBEDDED_SIGNUP_ERROR'}',
          connected: ${success},
          error: ${JSON.stringify(error || null)}
        }, '*');
        setTimeout(() => window.close(), 1500);
      } else {
        setTimeout(() => {
          window.location.href = '${redirectUrl}';
        }, 1500);
      }
    } catch (e) {
      window.location.href = '${redirectUrl}';
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: success ? 200 : 400,
    headers: { 'Content-Type': 'text/html' },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error || !code) {
    console.error('[OAuth Callback GET] Error from Meta:', error, errorDescription);
    return renderAuthResultHtml({
      success: false,
      message: errorDescription || error || 'Missing authorization code from Meta',
      error: errorDescription || error || 'Missing code',
    });
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
    return renderAuthResultHtml({
      success: false,
      message: 'No active business account linked to your user profile',
      error: 'No account linked',
    });
  }

  try {
    const exchangeResult = await completeOAuthOnboarding({
      code,
      accountId,
    });

    if (!exchangeResult.success) {
      return renderAuthResultHtml({
        success: false,
        message: exchangeResult.error || 'Connection failed with Meta API',
        error: exchangeResult.error,
      });
    }

    return renderAuthResultHtml({
      success: true,
      message: 'Your WhatsApp Business Account is now linked and ready to send messages!',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during OAuth exchange';
    console.error('[OAuth Callback GET] Unexpected failure:', err);
    return renderAuthResultHtml({
      success: false,
      message,
      error: message,
    });
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
    await subscribeWabaToApp({ wabaId, accessToken });
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
