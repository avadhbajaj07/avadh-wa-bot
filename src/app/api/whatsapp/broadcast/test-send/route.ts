import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { decrypt } from '@/lib/whatsapp/encryption';
import { formatPhoneNumber } from '@/lib/contacts/parse-pasted-numbers';
import {
  sanitizePhoneForMeta,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import { resolveTemplateRow } from '@/lib/whatsapp/template-body';

/**
 * POST /api/whatsapp/broadcast/test-send
 *
 * Sends a single sample template message to a test phone number
 * before launching a campaign.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');

    const body = await request.json();
    const {
      phone,
      template_name,
      template_language,
      params,
      header_media_url,
    } = body;

    if (!phone || !phone.trim()) {
      return NextResponse.json(
        { error: 'Please provide a test phone number.' },
        { status: 400 }
      );
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      );
    }

    const formattedPhone = formatPhoneNumber(phone.trim()) || phone.trim();
    const sanitized = sanitizePhoneForMeta(formattedPhone);

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Please set up your WhatsApp integration in Settings first.',
        },
        { status: 400 }
      );
    }

    const accessToken = decrypt(config.access_token);

    const resolvedTemplate = await resolveTemplateRow(
      supabase,
      accountId,
      template_name,
      template_language || 'en_US'
    );

    const templateRow = resolvedTemplate.row;

    const messageParams = header_media_url
      ? { headerMediaUrl: header_media_url.trim() }
      : undefined;

    const variants = phoneVariants(sanitized);
    let sentMessageId: string | null = null;
    let lastError: string | null = null;

    for (const variant of variants) {
      try {
        const result = await sendTemplateMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: variant,
          templateName: template_name,
          language: resolvedTemplate.language,
          template: templateRow ?? undefined,
          messageParams,
          params: Array.isArray(params) ? params : [],
        });
        sentMessageId = result.messageId;
        lastError = null;
        break;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        if (!isRecipientNotAllowedError(errorMessage)) {
          lastError = errorMessage;
          break;
        }
        lastError = errorMessage;
      }
    }

    if (!sentMessageId) {
      return NextResponse.json(
        { error: lastError || 'Failed to send sample message via Meta.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: sentMessageId,
      phone: formattedPhone,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
