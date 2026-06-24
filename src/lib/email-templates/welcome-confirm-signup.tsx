import React from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  fullName?: string;
  confirmUrl?: string;
}

const APP = 'BPM Atlas';

const Email = ({ fullName, confirmUrl }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Confirma tu registro y activa tu espacio privado en {APP}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>¡Bienvenido a {APP}!</Heading>
        <Text style={text}>Hola {fullName || 'y gracias por registrarte'},</Text>
        <Text style={text}>
          Gracias por crear una cuenta en <strong>{APP}</strong>. Para activar tu acceso, solo
          necesitamos que confirmes tu correo electrónico.
        </Text>
        <Section style={card}>
          <Text style={cardText}>
            En cuanto pulses el botón de abajo:
          </Text>
          <ul style={list as any}>
            <li style={li}>Se creará tu <strong>espacio privado (tenant)</strong> a tu nombre.</li>
            <li style={li}>Se te asignará el rol de <strong>dueño de proceso</strong> al instante.</li>
            <li style={li}>Podrás empezar a modelar y gestionar tus procesos de inmediato.</li>
          </ul>
        </Section>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={confirmUrl || 'https://bpm-atlas.com'} style={button}>
            Activar mi cuenta
          </Button>
        </Section>
        <Text style={muted}>
          Si el botón no funciona, copia y pega este enlace en tu navegador:
        </Text>
        <Text style={link}>{confirmUrl}</Text>
        <Hr style={hr} />
        <Text style={muted}>
          Si no te has registrado en {APP}, puedes ignorar este mensaje. El enlace caduca en 7 días.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: `Confirma tu registro en ${APP}`,
  displayName: 'Bienvenida y confirmación de registro',
  previewData: { fullName: 'Ana Pérez', confirmUrl: 'https://bpm-atlas.com/onboarding/confirm?token=demo' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' };
const h1 = { color: '#0f172a', fontSize: '24px', fontWeight: 600 as const, margin: '0 0 16px' };
const text = { color: '#334155', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' };
const card = { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' };
const cardText = { color: '#0c4a6e', fontSize: '14px', margin: '0 0 8px', fontWeight: 600 as const };
const list = { color: '#334155', fontSize: '14px', lineHeight: '22px', margin: '0', paddingLeft: '20px' };
const li = { margin: '4px 0' };
const button = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '14px 28px', borderRadius: '6px', fontSize: '15px', fontWeight: 600 as const, textDecoration: 'none' };
const link = { color: '#0ea5e9', fontSize: '12px', wordBreak: 'break-all' as const, margin: '0 0 16px' };
const hr = { borderColor: '#e2e8f0', margin: '24px 0' };
const muted = { color: '#94a3b8', fontSize: '12px', lineHeight: '18px', margin: '0 0 8px' };
