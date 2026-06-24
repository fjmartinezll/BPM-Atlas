export const queryKeys = {
  entities: {
    all: ["entities"] as const,
    options: ["entities-options"] as const,
    map: ["entities-map"] as const,
    list: (userId?: string) => ["tenant-entities", userId] as const,
    forSelector: (clientId?: string, env?: string) => ["entities-for-selector", clientId, env] as const,
  },
  modeler: {
    entities: ["modeler-entities"] as const,
    positions: (parentId?: string) => ["modeler-positions", parentId] as const,
    diagram: (id?: string) => ["diagram", id] as const,
    diagramsList: (clientId?: string, env?: string, entityId?: string | null) =>
      ["diagrams-list", clientId, env, entityId] as const,
    diagramsPick: ["process-diagrams-pick"] as const,
    macroPick: (entityId?: string | null) => ["macroprocesses-pick", entityId] as const,
    processPick: (entityId?: string | null) => ["processes-pick", entityId] as const,
    taxonomy: ["node-taxonomy-public"] as const,
    subprocessPreview: (diagramId?: string) => ["subprocess-preview", diagramId] as const,
    tableColumns: (diagramId?: string) => ["entity-table-columns", diagramId] as const,
    diagramTables: (diagramId?: string) => ["entity-diagram-tables", diagramId] as const,
  },
  engine: {
    defs: (clientId?: string, env?: string, entityId?: string | null) =>
      ["engine-defs", clientId, env, entityId] as const,
    defInputs: (defId?: string) => ["engine-def-inputs", defId] as const,
    draft: (defId?: string) => ["engine-draft", defId] as const,
    myDrafts: ["engine-my-drafts"] as const,
    instances: (status?: string, clientId?: string, env?: string, entityId?: string | null) =>
      ["engine-instances", status, clientId, env, entityId] as const,
    instance: (id?: string) => ["engine-instance", id] as const,
    allInstances: ["engine-all-instances"] as const,
    headerEntities: (clientId?: string, env?: string) =>
      ["engine-header-entities", clientId, env] as const,
  },
  admin: {
    users: (clientId?: string) => ["admin-users", clientId] as const,
    myTenant: ["my-tenant"] as const,
    structure: ["structure-admin"] as const,
    taxonomy: ["node-taxonomy"] as const,
    erCounts: (entityId?: string, includedKey?: string) =>
      ["er-entities-counts", entityId, includedKey] as const,
    erRows: (tableId?: string) => ["er-entities-rows", tableId] as const,
  },
  hierarchy: {
    node: (level?: string, id?: string) => ["node", level, id] as const,
    children: (level?: string, id?: string) => ["children", level, id] as const,
  },
  clients: {
    mine: (userId?: string) => ["my-clients", userId] as const,
  },
  processVariables: {
    catalog: (scopeKey?: string) => ["process-variables", scopeKey] as const,
    scopes: (clientId?: string, env?: string, entityId?: string | null) =>
      ["process-variables-scopes", clientId, env, entityId] as const,
  },
  dashboard: {
    macros: ["entities", "all-macros"] as const,
  },
  processMap: {
    macros: ["macros-map"] as const,
  },
  scopeDiagrams: {
    list: (clientId?: string, env?: string) => ["scope-diagrams", clientId, env] as const,
    targetEntities: (clientId?: string, env?: string) =>
      ["scope-target-entities", clientId, env] as const,
  },
  webhooks: {
    integrations: ["webhook-integrations"] as const,
  },
  taxonomy: {
    er: ["er-taxonomy"] as const,
  },
  platform: {
    rolesDistribution: ["platform-roles-distribution"] as const,
    executionOverview: ["platform-execution-overview"] as const,
  },
  tenant: {
    members: (id?: string) => ["tenant-members", id] as const,
    invitations: (id?: string) => ["tenant-invitations", id] as const,
    joinRequests: (id?: string) => ["tenant-join-requests", id] as const,
    audit: (id?: string) => ["tenant-audit", id] as const,
    changelog: ["changelog-global"] as const,
  },
  ccHierarchy: ["cc-hierarchy"] as const,
  aiHierarchy: (entityId?: string) => ["db-hierarchy", entityId] as const,
};

export const STALE = {
  REFERENCE: 60_000,
  SHORT: 30_000,
  NEVER: Infinity,
};
