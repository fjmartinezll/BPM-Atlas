import * as React from 'react';
import { render } from '@react-email/components';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SITE_NAME = 'BPM Atlas';
const SENDER_DOMAIN = 'notify.bpm-atlas.com';
const FROM_DOMAIN = 'bpm-atlas.com';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Internal helper to render a registered template and enqueue it for sending.
 * Caller MUST pass a service-role Supabase client. Caller is responsible for
 * authorization (do not expose this directly to unauthenticated users without checks).
 */
export async function enqueueTemplateEmail(
  supabase: SupabaseClient,
  params: {
    templateName: string;
    recipientEmail: string;
    templateData?: Record<string, any>;
    idempotencyKey?: string;
  },
): Promise<{ ok: boolean; reason?: string }> {
  const { templateName, recipientEmail, templateData = {} } = params;
  const tpl = TEMPLATES[templateName];
  if (!tpl) return { ok: false, reason: 'template_not_found' };

  const normalized = recipientEmail.toLowerCase();
  const messageId = crypto.randomUUID();
  const idempotencyKey = params.idempotencyKey || messageId;

  // Suppression check
  const { data: suppressed } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalized)
    .maybeSingle();
  if (suppressed) {
    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: templateName, recipient_email: recipientEmail, status: 'suppressed',
    });
    return { ok: false, reason: 'suppressed' };
  }

  // Unsubscribe token
  let unsubscribeToken: string;
  const { data: existingToken } = await supabase
    .from('email_unsubscribe_tokens').select('token,used_at').eq('email', normalized).maybeSingle();
  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token;
  } else {
    unsubscribeToken = generateToken();
    await supabase.from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true });
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle();
    if (stored?.token) unsubscribeToken = stored.token;
  }

  const element = React.createElement(tpl.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject = typeof tpl.subject === 'function' ? tpl.subject(templateData) : tpl.subject;

  await supabase.from('email_send_log').insert({
    message_id: messageId, template_name: templateName, recipient_email: recipientEmail, status: 'pending',
  });

  const { error } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipientEmail,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject, html, text,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (error) {
    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: templateName, recipient_email: recipientEmail,
      status: 'failed', error_message: error.message,
    });
    return { ok: false, reason: 'enqueue_failed' };
  }
  return { ok: true };
}
