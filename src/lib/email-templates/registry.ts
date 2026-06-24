import type { ComponentType } from 'react'
import { template as newUserAdminAlert } from './new-user-admin-alert'
import { template as roleAssignedUser } from './role-assigned-user'
import { template as welcomeConfirmSignup } from './welcome-confirm-signup'
import { template as tenantInvitation } from './tenant-invitation'
import { template as passwordResetAdmin } from './password-reset-admin'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-user-admin-alert': newUserAdminAlert,
  'role-assigned-user': roleAssignedUser,
  'welcome-confirm-signup': welcomeConfirmSignup,
  'tenant-invitation': tenantInvitation,
  'password-reset-admin': passwordResetAdmin,
}
