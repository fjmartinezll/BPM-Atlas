import React from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  userName?: string;
  roles?: string[];
  changeSummary?: string;
  appUrl?: string;
  locale?: string;
}

type Strings = {
  preview: string; heading: string; hello: (n: string) => string;
  intro: (app: string, change: string) => React.ReactNode;
  noRoles: string; cta: string; footer: string; subject: string;
  defaultChange: string; roleLabels: Record<string, string>; lang: string;
};

const APP = 'BPM Atlas';

const STRINGS: Record<string, Strings> = {
  es: {
    preview: 'Tus roles en BPM Atlas han sido actualizados',
    heading: 'Tus roles han sido actualizados',
    hello: (n) => `Hola ${n || ''},`,
    intro: (app, change) => <>Un administrador acaba de {change} en <strong>{app}</strong>. A continuación tienes el detalle de tus roles vigentes:</>,
    noRoles: 'Actualmente no tienes roles asignados. Contacta a un administrador.',
    cta: 'Acceder a BPM Atlas',
    footer: 'Recibes este mensaje porque tus permisos en la plataforma fueron modificados.',
    subject: 'Tus roles en BPM Atlas han sido actualizados',
    defaultChange: 'modificar tus roles',
    roleLabels: { administrador: 'Administrador', dueno_proceso: 'Dueño de Proceso', participante: 'Participante', auditor: 'Auditor' },
    lang: 'es',
  },
  en: {
    preview: 'Your BPM Atlas roles have been updated',
    heading: 'Your roles have been updated',
    hello: (n) => `Hi ${n || ''},`,
    intro: (app, change) => <>An administrator just {change} in <strong>{app}</strong>. Here are your current roles:</>,
    noRoles: 'You currently have no roles assigned. Please contact an administrator.',
    cta: 'Open BPM Atlas',
    footer: 'You are receiving this because your permissions on the platform were changed.',
    subject: 'Your BPM Atlas roles have been updated',
    defaultChange: 'updated your roles',
    roleLabels: { administrador: 'Administrator', dueno_proceso: 'Process Owner', participante: 'Participant', auditor: 'Auditor' },
    lang: 'en',
  },
  fr: {
    preview: 'Vos rôles BPM Atlas ont été mis à jour',
    heading: 'Vos rôles ont été mis à jour',
    hello: (n) => `Bonjour ${n || ''},`,
    intro: (app, change) => <>Un administrateur vient de {change} dans <strong>{app}</strong>. Voici vos rôles actuels :</>,
    noRoles: "Vous n'avez actuellement aucun rôle attribué. Contactez un administrateur.",
    cta: 'Ouvrir BPM Atlas',
    footer: 'Vous recevez ce message car vos autorisations ont été modifiées.',
    subject: 'Vos rôles BPM Atlas ont été mis à jour',
    defaultChange: 'modifier vos rôles',
    roleLabels: { administrador: 'Administrateur', dueno_proceso: 'Responsable de processus', participante: 'Participant', auditor: 'Auditeur' },
    lang: 'fr',
  },
  de: {
    preview: 'Ihre BPM Atlas-Rollen wurden aktualisiert',
    heading: 'Ihre Rollen wurden aktualisiert',
    hello: (n) => `Hallo ${n || ''},`,
    intro: (app, change) => <>Ein Administrator hat soeben {change} in <strong>{app}</strong>. Hier sind Ihre aktuellen Rollen:</>,
    noRoles: 'Ihnen sind derzeit keine Rollen zugewiesen. Bitte wenden Sie sich an einen Administrator.',
    cta: 'BPM Atlas öffnen',
    footer: 'Sie erhalten diese Nachricht, weil Ihre Berechtigungen geändert wurden.',
    subject: 'Ihre BPM Atlas-Rollen wurden aktualisiert',
    defaultChange: 'Ihre Rollen geändert',
    roleLabels: { administrador: 'Administrator', dueno_proceso: 'Prozessverantwortlicher', participante: 'Teilnehmer', auditor: 'Auditor' },
    lang: 'de',
  },
  it: {
    preview: 'I tuoi ruoli su BPM Atlas sono stati aggiornati',
    heading: 'I tuoi ruoli sono stati aggiornati',
    hello: (n) => `Ciao ${n || ''},`,
    intro: (app, change) => <>Un amministratore ha appena {change} in <strong>{app}</strong>. Ecco i tuoi ruoli attuali:</>,
    noRoles: 'Attualmente non hai ruoli assegnati. Contatta un amministratore.',
    cta: 'Apri BPM Atlas',
    footer: 'Ricevi questo messaggio perché i tuoi permessi sono stati modificati.',
    subject: 'I tuoi ruoli su BPM Atlas sono stati aggiornati',
    defaultChange: 'modificare i tuoi ruoli',
    roleLabels: { administrador: 'Amministratore', dueno_proceso: 'Responsabile di processo', participante: 'Partecipante', auditor: 'Auditor' },
    lang: 'it',
  },
  pt: {
    preview: 'Suas funções no BPM Atlas foram atualizadas',
    heading: 'Suas funções foram atualizadas',
    hello: (n) => `Olá ${n || ''},`,
    intro: (app, change) => <>Um administrador acabou de {change} no <strong>{app}</strong>. Veja abaixo suas funções atuais:</>,
    noRoles: 'No momento você não possui funções atribuídas. Entre em contato com um administrador.',
    cta: 'Abrir BPM Atlas',
    footer: 'Você está recebendo esta mensagem porque suas permissões foram alteradas.',
    subject: 'Suas funções no BPM Atlas foram atualizadas',
    defaultChange: 'modificar suas funções',
    roleLabels: { administrador: 'Administrador', dueno_proceso: 'Dono do Processo', participante: 'Participante', auditor: 'Auditor' },
    lang: 'pt',
  },
  ja: {
    preview: 'BPM Atlas のロールが更新されました',
    heading: 'ロールが更新されました',
    hello: (n) => `${n || ''} さん、こんにちは。`,
    intro: (app, change) => <>管理者が <strong>{app}</strong> であなたの{change}を行いました。現在のロールは以下のとおりです：</>,
    noRoles: '現在ロールは割り当てられていません。管理者にお問い合わせください。',
    cta: 'BPM Atlas を開く',
    footer: '権限が変更されたため、このメッセージをお送りしています。',
    subject: 'BPM Atlas のロールが更新されました',
    defaultChange: 'ロール',
    roleLabels: { administrador: '管理者', dueno_proceso: 'プロセスオーナー', participante: '参加者', auditor: '監査者' },
    lang: 'ja',
  },
  zh: {
    preview: '您在 BPM Atlas 中的角色已更新',
    heading: '您的角色已更新',
    hello: (n) => `${n || ''} 您好，`,
    intro: (app, change) => <>管理员刚刚在 <strong>{app}</strong> 中{change}。以下是您当前的角色：</>,
    noRoles: '您当前没有分配任何角色。请联系管理员。',
    cta: '打开 BPM Atlas',
    footer: '您收到此邮件是因为您的平台权限已被修改。',
    subject: '您在 BPM Atlas 中的角色已更新',
    defaultChange: '修改了您的角色',
    roleLabels: { administrador: '管理员', dueno_proceso: '流程负责人', participante: '参与者', auditor: '审计员' },
    lang: 'zh',
  },
};

function pick(locale?: string): Strings {
  return STRINGS[(locale || 'es').toLowerCase()] || STRINGS.es;
}

const Email = ({ userName, roles, changeSummary, appUrl, locale }: Props) => {
  const s = pick(locale);
  const rolesList = (roles ?? []).map((r) => s.roleLabels[r] || r);
  const change = changeSummary || s.defaultChange;
  return (
    <Html lang={s.lang} dir="ltr">
      <Head />
      <Preview>{s.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{s.heading}</Heading>
          <Text style={text}>{s.hello(userName || '')}</Text>
          <Text style={text}>{s.intro(APP, change)}</Text>
          <Section style={card}>
            {rolesList.length > 0
              ? rolesList.map((label) => (<Text key={label} style={roleItem}>• {label}</Text>))
              : (<Text style={roleItem}>{s.noRoles}</Text>)}
          </Section>
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={appUrl || 'https://bpm-atlas.com'} style={button}>{s.cta}</Button>
          </Section>
          <Hr style={hr} />
          <Text style={muted}>{s.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => pick(data?.locale).subject,
  displayName: 'Aviso al usuario: roles actualizados',
  previewData: { userName: 'Ana', roles: ['dueno_proceso', 'auditor'], changeSummary: 'asignar nuevos roles', locale: 'es' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' };
const h1 = { color: '#0f172a', fontSize: '22px', fontWeight: 600 as const, margin: '0 0 16px' };
const text = { color: '#334155', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' };
const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', margin: '16px 0' };
const roleItem = { color: '#0f172a', fontSize: '15px', margin: '0 0 6px' };
const button = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 22px', borderRadius: '6px', fontSize: '14px', fontWeight: 600 as const, textDecoration: 'none' };
const hr = { borderColor: '#e2e8f0', margin: '24px 0' };
const muted = { color: '#94a3b8', fontSize: '12px', lineHeight: '18px' };
