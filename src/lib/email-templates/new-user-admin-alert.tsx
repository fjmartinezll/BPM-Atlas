import React from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  newUserEmail?: string;
  newUserName?: string;
  adminName?: string;
  manageUrl?: string;
  locale?: string;
}

type Strings = {
  preview: string; heading: string; hello: (n: string) => string; intro: (app: string) => React.ReactNode;
  name: string; emailLabel: string; cta: string; footer: string; subject: string; defaultAdmin: string; lang: string;
};

const APP = 'BPM Atlas';

const STRINGS: Record<string, Strings> = {
  es: {
    preview: 'Nuevo usuario registrado en BPM Atlas — asignar roles',
    heading: 'Nuevo usuario registrado',
    hello: (n) => `Hola ${n || 'administrador'},`,
    intro: (app) => <>Se ha registrado un nuevo usuario en <strong>{app}</strong> y está a la espera de que un administrador le asigne uno o más roles para poder operar en la plataforma.</>,
    name: 'Nombre', emailLabel: 'Correo',
    cta: 'Asignar roles',
    footer: 'Este mensaje se envía automáticamente cada vez que se registra un nuevo usuario.',
    subject: 'Nuevo usuario registrado — asignar roles',
    defaultAdmin: 'administrador', lang: 'es',
  },
  en: {
    preview: 'New user registered in BPM Atlas — assign roles',
    heading: 'New user registered',
    hello: (n) => `Hi ${n || 'admin'},`,
    intro: (app) => <>A new user has just signed up to <strong>{app}</strong> and is waiting for an administrator to assign one or more roles before they can operate on the platform.</>,
    name: 'Name', emailLabel: 'Email',
    cta: 'Assign roles',
    footer: 'This message is sent automatically every time a new user signs up.',
    subject: 'New user registered — assign roles',
    defaultAdmin: 'admin', lang: 'en',
  },
  fr: {
    preview: "Nouvel utilisateur inscrit sur BPM Atlas — attribuer des rôles",
    heading: 'Nouvel utilisateur inscrit',
    hello: (n) => `Bonjour ${n || 'administrateur'},`,
    intro: (app) => <>Un nouvel utilisateur vient de s'inscrire sur <strong>{app}</strong> et attend qu'un administrateur lui attribue un ou plusieurs rôles pour pouvoir utiliser la plateforme.</>,
    name: 'Nom', emailLabel: 'E-mail',
    cta: 'Attribuer des rôles',
    footer: "Ce message est envoyé automatiquement à chaque nouvelle inscription.",
    subject: 'Nouvel utilisateur inscrit — attribuer des rôles',
    defaultAdmin: 'administrateur', lang: 'fr',
  },
  de: {
    preview: 'Neuer Benutzer in BPM Atlas registriert — Rollen zuweisen',
    heading: 'Neuer Benutzer registriert',
    hello: (n) => `Hallo ${n || 'Administrator'},`,
    intro: (app) => <>Ein neuer Benutzer hat sich gerade bei <strong>{app}</strong> registriert und wartet darauf, dass ein Administrator eine oder mehrere Rollen zuweist.</>,
    name: 'Name', emailLabel: 'E-Mail',
    cta: 'Rollen zuweisen',
    footer: 'Diese Nachricht wird bei jeder neuen Registrierung automatisch gesendet.',
    subject: 'Neuer Benutzer registriert — Rollen zuweisen',
    defaultAdmin: 'Administrator', lang: 'de',
  },
  it: {
    preview: 'Nuovo utente registrato in BPM Atlas — assegnare ruoli',
    heading: 'Nuovo utente registrato',
    hello: (n) => `Ciao ${n || 'amministratore'},`,
    intro: (app) => <>Un nuovo utente si è appena registrato in <strong>{app}</strong> e attende che un amministratore gli assegni uno o più ruoli.</>,
    name: 'Nome', emailLabel: 'Email',
    cta: 'Assegna ruoli',
    footer: 'Questo messaggio viene inviato automaticamente a ogni nuova registrazione.',
    subject: 'Nuovo utente registrato — assegnare ruoli',
    defaultAdmin: 'amministratore', lang: 'it',
  },
  pt: {
    preview: 'Novo usuário registrado no BPM Atlas — atribuir funções',
    heading: 'Novo usuário registrado',
    hello: (n) => `Olá ${n || 'administrador'},`,
    intro: (app) => <>Um novo usuário acaba de se registrar no <strong>{app}</strong> e aguarda que um administrador atribua uma ou mais funções.</>,
    name: 'Nome', emailLabel: 'E-mail',
    cta: 'Atribuir funções',
    footer: 'Esta mensagem é enviada automaticamente a cada novo registro.',
    subject: 'Novo usuário registrado — atribuir funções',
    defaultAdmin: 'administrador', lang: 'pt',
  },
  ja: {
    preview: 'BPM Atlas に新しいユーザーが登録されました — ロールを割り当ててください',
    heading: '新しいユーザーが登録されました',
    hello: (n) => `${n || '管理者'} さん、こんにちは。`,
    intro: (app) => <><strong>{app}</strong> に新しいユーザーが登録され、管理者によるロールの割り当てを待っています。</>,
    name: '名前', emailLabel: 'メール',
    cta: 'ロールを割り当てる',
    footer: 'このメッセージは新規ユーザー登録時に自動送信されます。',
    subject: '新規ユーザー登録 — ロールを割り当ててください',
    defaultAdmin: '管理者', lang: 'ja',
  },
  zh: {
    preview: 'BPM Atlas 有新用户注册 — 请分配角色',
    heading: '新用户已注册',
    hello: (n) => `${n || '管理员'} 您好，`,
    intro: (app) => <>有新用户刚刚在 <strong>{app}</strong> 注册，正等待管理员为其分配一个或多个角色。</>,
    name: '姓名', emailLabel: '邮箱',
    cta: '分配角色',
    footer: '每当有新用户注册时，系统都会自动发送此消息。',
    subject: '新用户注册 — 请分配角色',
    defaultAdmin: '管理员', lang: 'zh',
  },
};

function pick(locale?: string): Strings {
  return STRINGS[(locale || 'es').toLowerCase()] || STRINGS.es;
}

const Email = ({ newUserEmail, newUserName, adminName, manageUrl, locale }: Props) => {
  const s = pick(locale);
  return (
    <Html lang={s.lang} dir="ltr">
      <Head />
      <Preview>{s.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{s.heading}</Heading>
          <Text style={text}>{s.hello(adminName || '')}</Text>
          <Text style={text}>{s.intro(APP)}</Text>
          <Section style={card}>
            <Text style={cardLabel}>{s.name}</Text>
            <Text style={cardValue}>{newUserName || '—'}</Text>
            <Text style={cardLabel}>{s.emailLabel}</Text>
            <Text style={cardValue}>{newUserEmail || '—'}</Text>
          </Section>
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={manageUrl || 'https://bpm-atlas.com/admin/users'} style={button}>{s.cta}</Button>
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
  displayName: 'Aviso a admin: nuevo usuario',
  previewData: { newUserEmail: 'nuevo@ejemplo.com', newUserName: 'Ana Pérez', adminName: 'Carlos', locale: 'es' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' };
const h1 = { color: '#0f172a', fontSize: '22px', fontWeight: 600 as const, margin: '0 0 16px' };
const text = { color: '#334155', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' };
const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', margin: '16px 0' };
const cardLabel = { color: '#64748b', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px' };
const cardValue = { color: '#0f172a', fontSize: '15px', fontWeight: 500 as const, margin: '0 0 10px' };
const button = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 22px', borderRadius: '6px', fontSize: '14px', fontWeight: 600 as const, textDecoration: 'none' };
const hr = { borderColor: '#e2e8f0', margin: '24px 0' };
const muted = { color: '#94a3b8', fontSize: '12px', lineHeight: '18px' };
