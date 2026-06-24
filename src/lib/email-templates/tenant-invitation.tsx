import React from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  inviterName?: string;
  tenantName?: string;
  role?: string;
  acceptUrl?: string;
}

const APP = 'BPM Atlas';

const ROLE_LABEL: Record<string, string> = {
  administrador: 'Administrador',
  dueno_proceso: 'Dueño de proceso',
  participante: 'Participante',
  auditor: 'Auditor',
};

const Email = ({ inviterName, tenantName, role, acceptUrl }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Te han invitado a unirte a {tenantName || 'un workspace'} en {APP}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Tienes una invitación</Heading>
        <Text style={text}>
          <strong>{inviterName || 'Un miembro del equipo'}</strong> te ha invitado a unirte al
          workspace <strong>{tenantName || ''}</strong> en {APP}
          {role ? ` con el rol de ${ROLE_LABEL[role] || role}` : ''}.
        </Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={acceptUrl || 'https://bpm-atlas.com'} style={button}>
            Aceptar invitación
          </Button>
        </Section>
        <Text style={muted}>Si el botón no funciona, copia y pega este enlace:</Text>
        <Text style={link}>{acceptUrl}</Text>
        <Hr style={hr} />
        <Text style={muted}>El enlace caduca en 14 días. Si no esperabas esta invitación, puedes ignorar este mensaje.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Invitación a ${d.tenantName || APP}`,
  displayName: 'Invitación a un workspace',
  previewData: { inviterName: 'Ana', tenantName: 'Acme Corp', role: 'participante', acceptUrl: 'https://bpm-atlas.com/invite/accept?token=demo' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' };
const h1 = { color: '#0f172a', fontSize: '24px', fontWeight: 600 as const, margin: '0 0 16px' };
const text = { color: '#334155', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' };
const button = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '14px 28px', borderRadius: '6px', fontSize: '15px', fontWeight: 600 as const, textDecoration: 'none' };
const link = { color: '#0ea5e9', fontSize: '12px', wordBreak: 'break-all' as const, margin: '0 0 16px' };
const hr = { borderColor: '#e2e8f0', margin: '24px 0' };
const muted = { color: '#94a3b8', fontSize: '12px', lineHeight: '18px', margin: '0 0 8px' };
