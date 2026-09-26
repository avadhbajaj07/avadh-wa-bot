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
const META_APP_SECRET = (
  process.env.META_APP_SECRET || 'f19608b367683fa9be3eaa3972d3f78b'
)
  .split(',')[0]
  .trim();
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${success ? 'WhatsApp Connected' : 'Connection Incomplete'}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
      padding: 32px 24px;
      max-width: 440px;
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
    .error-box {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 12px;
      color: #fca5a5;
      margin-bottom: 20px;
      text-align: left;
      word-break: break-word;
      line-height: 1.4;
    }
    .btn {
      display: inline-block;
      padding: 10px 24px;
      background: ${success ? '#25d366' : '#334155'};
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover {
      background: ${success ? '#22c55e' : '#475569'};
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${success ? '✓' : '✕'}</div>
    <h2>${success ? 'WhatsApp Connected!' : 'Connection Incomplete'}</h2>
    <p>${message}</p>
    ${
      error
        ? `<div class="error-box"><strong>Details:</strong> ${error}</div>`
        : ''
    }
    <button onclick="window.close()" class="btn">Close This Window</button>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({
          type: '${success ? 'WA_EMBEDDED_SIGNUP_SUCCESS' : 'WA_EMBEDDED_SIGNUP_ERROR'}',
          connected: ${success},
          error: ${JSON.stringify(error || null)}
        }, '*');
        if (${success}) {
          setTimeout(() => window.close(), 1500);
        }
      }
    } catch (e) {
      console.warn('Opener postMessage error:', e);
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
      userId: user.id,
      supabaseClient: supabase,
      redirectUri: REDIRECT_URI,
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
      userId: user.id,
      supabaseClient: supabase,
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

async function exchangeCodeForToken(
  code: string,
  preferredRedirectUri?: string
): Promise<{ accessToken?: string; error?: string }> {
  const tryExchange = async (redirectUriParam?: string) => {
    const params = new URLSearchParams({
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      code,
    });
    if (redirectUriParam !== undefined) {
      params.set('redirect_uri', redirectUriParam);
    }

    const res = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?${params.toString()}`);
    const data = (await res.json()) as TokenExchangeResponse;
    return { ok: res.ok, data };
  };

  // Attempt 1: Without redirect_uri (standard for FB.login popup)
  const attempt1 = await tryExchange();
  if (attempt1.ok && attempt1.data.access_token) {
    return { accessToken: attempt1.data.access_token };
  }

  // Attempt 2: With preferredRedirectUri or default REDIRECT_URI (standard for OAuth redirect dialog)
  const uriToTry = preferredRedirectUri || REDIRECT_URI;
  console.warn(
    '[OAuth Exchange] Attempt without redirect_uri failed:',
    attempt1.data.error?.message,
    'Trying with redirect_uri:',
    uriToTry
  );
  const attempt2 = await tryExchange(uriToTry);
  if (attempt2.ok && attempt2.data.access_token) {
    return { accessToken: attempt2.data.access_token };
  }

  // Attempt 3: With empty redirect_uri (needed by some Meta SDK configurations)
  console.warn(
    '[OAuth Exchange] Attempt with redirect_uri failed:',
    attempt2.data.error?.message,
    'Trying with empty redirect_uri...'
  );
  const attempt3 = await tryExchange('');
  if (attempt3.ok && attempt3.data.access_token) {
    return { accessToken: attempt3.data.access_token };
  }

  const errMsg =
    attempt1.data.error?.message ||
    attempt2.data.error?.message ||
    attempt3.data.error?.message ||
    'Failed to exchange authorization code with Meta';

  console.error('[OAuth Exchange Error] All attempts failed:', {
    attempt1: attempt1.data.error,
    attempt2: attempt2.data.error,
    attempt3: attempt3.data.error,
  });

  return { error: errMsg };
}

async function completeOAuthOnboarding(params: {
  code: string;
  accountId: string;
  userId?: string;
  supabaseClient?: any;
  providedWabaId?: string;
  providedPhoneNumberId?: string;
  redirectUri?: string;
}): Promise<{
  success: boolean;
  error?: string;
  wabaId?: string;
  phoneNumberId?: string;
}> {
  const {
    code,
    accountId,
    userId,
    supabaseClient,
    providedWabaId,
    providedPhoneNumberId,
    redirectUri,
  } = params;

  if (!META_APP_SECRET) {
    console.error('[OAuth Onboarding] META_APP_SECRET is not set in server environment variables');
    return {
      success: false,
      error:
        'META_APP_SECRET is not configured on the server. Please add META_APP_SECRET in your Vercel project environment variables (Meta App Dashboard → App Settings → Basic → App Secret).',
    };
  }

  // 1. Exchange short-lived code for permanent access token
  const exchangeRes = await exchangeCodeForToken(code, redirectUri);
  if (!exchangeRes.accessToken) {
    return { success: false, error: exchangeRes.error };
  }

  const accessToken = exchangeRes.accessToken;

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

  const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? getAdminClient() : supabaseClient;
  if (!db) {
    console.error('[OAuth Onboarding] Neither admin client nor user supabase client available');
    return { success: false, error: 'Database connection client unavailable' };
  }

  // Check if this phone number is claimed by another account (best-effort)
  try {
    const { data: claimed } = await db
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
  } catch (claimErr) {
    console.warn('[OAuth Onboarding] Claimed check notice:', claimErr);
  }

  const rowData: Record<string, any> = {
    account_id: accountId,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    access_token: encryptedToken,
    verify_token: verifyToken,
    status: 'connected',
    registered_at: new Date().toISOString(),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (userId) {
    rowData.user_id = userId;
  }

  const { error: upsertErr } = await db
    .from('whatsapp_config')
    .upsert(rowData, { onConflict: 'account_id' });

  if (upsertErr) {
    console.error('[OAuth Onboarding] DB Upsert error:', upsertErr);
    return { success: false, error: `Failed to save configuration: ${upsertErr.message}` };
  }

  return { success: true, wabaId, phoneNumberId };
}
