import React from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  resetUrl?: string;
}

const APP = 'BPM Atlas';

const Email = ({ resetUrl }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Restablece tu contraseña en {APP}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Restablece tu contraseña</Heading>
        <Text style={text}>
          Un administrador de tu workspace ha solicitado que restablezcas tu contraseña en {APP}.
          Si fuiste tú o lo estabas esperando, usa el botón a continuación. Si no, puedes ignorar este mensaje.
        </Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={resetUrl || 'https://bpm-atlas.com'} style={button}>
            Establecer nueva contraseña
          </Button>
        </Section>
        <Text style={muted}>Si el botón no funciona, copia y pega este enlace:</Text>
        <Text style={link}>{resetUrl}</Text>
        <Hr style={hr} />
        <Text style={muted}>Este enlace caduca pronto por seguridad. Nadie de {APP} te pedirá nunca tu contraseña.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: `Restablece tu contraseña en ${APP}`,
  displayName: 'Reseteo de contraseña (admin)',
  previewData: { resetUrl: 'https://bpm-atlas.com/reset-password#token=demo' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' };
const h1 = { color: '#0f172a', fontSize: '24px', fontWeight: 600 as const, margin: '0 0 16px' };
const text = { color: '#334155', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' };
const button = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '14px 28px', borderRadius: '6px', fontSize: '15px', fontWeight: 600 as const, textDecoration: 'none' };
const link = { color: '#0ea5e9', fontSize: '12px', wordBreak: 'break-all' as const, margin: '0 0 16px' };
const hr = { borderColor: '#e2e8f0', margin: '24px 0' };
const muted = { color: '#94a3b8', fontSize: '12px', lineHeight: '18px', margin: '0 0 8px' };
