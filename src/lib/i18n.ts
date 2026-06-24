import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  es: { translation: {
    app: { name: "BPM Atlas", tagline: "Gestión jerárquica de procesos de negocio" },
    nav: { dashboard: "Tablero", encyclopedia: "Enciclopedia BPM", admin: "Administración", logout: "Cerrar sesión", login: "Iniciar sesión", signup: "Registrarse", modeler: "Modelador de Procesos", aiSuggest: "Sugerencias IA de Procesos\n\n", modeling: "Permisos de Modelado", entities: "Entidades" },
    modeler: { title: "Modelador de Procesos", dbTitle: "Modelador de Base de Datos", subtitle: "Diseña flujos arrastrando al lienzo.", dbSubtitle: "Selecciona las tablas que quieres ver en el lienzo. Crea y modifica el diseño de la base de datos TEORICA de Negocio", palette: "Paleta", save: "Guardar diagrama", saved: "Diagrama guardado", attached: "Asociado a", clear: "Limpiar lienzo", openExisting: "Diagramas existentes", noneYet: "Aún no hay diagramas guardados.", standalone: "Diagrama libre (no asociado)", inHandle: "Entrada (arriba)", outHandle: "Salida (abajo)" },
    ai: { title: "Sugerencias IA de Procesos", subtitle: "Indica tu tipo de negocio y la IA propondrá macroprocesos y procesos.", businessType: "Tipo de negocio", businessTypePh: "Ej: Distribuidora de alimentos, Clínica dental, SaaS B2B…", language: "Idioma de la propuesta", generate: "Generar propuesta", regenerate: "Regenerar", accept: "Actualizar la BD de sugerencias de procesos", accepted: "Estructura insertada en la jerarquía", thinking: "Pensando…", empty: "Aún no hay propuesta. Genera una arriba.", generateDiagram: "Generar diagrama IA", diagramThinking: "Generando diagrama…", diagramGenerated: "Diagrama generado", diagramExists: "Ya existe un diagrama para este nodo. ¿Sobreescribirlo?", overwrite: "Sobreescribir", generateChildren: "Generar detalle IA", childrenProposal: "Propuesta de hijos", childrenAccepted: "Detalle insertado", childrenEmpty: "Sin propuesta. Pulsa Generar.", detailProcess: "Detallar IA", detailSubprocess: "Detallar tareas IA", detailing: "Detallando…", removeDetail: "Quitar detalle", regenerateDetail: "Regenerar detalle", deleteRow: "Eliminar", scopeHint: "Esta sugerencia se asocia a {{tenant}} · {{entity}} · {{env}}", noEntity: "sin entidad", goToHierarchy: "Ir a Jerarquía de procesos de una Entidad" },
    ficha: { title: "Ficha Técnica", resources: "Recursos", clientRequirements: "Requisitos del cliente", suppliers: "Proveedores", regulations: "Normativas aplicables", openModeler: "Abrir en el modelador" },
    bpmn: { startEvent: "Inicio", intermediateEvent: "Intermedio", endEvent: "Fin", task: "Tarea ejecutable", subprocess: "Subproceso", gateway: "Decisión" },
    levels: {
      macroprocess: "Macroproceso", macroprocesses: "Macroprocesos",
      process_type: "Proceso", process_types: "Procesos",
      process: "Proceso", processes: "Procesos",
      subprocess: "Subproceso", subprocesses: "Subprocesos",
      task_type: "Tarea", task_types: "Tareas",
      task: "Tarea", tasks: "Tareas",
      executable_element: "Elemento Ejecutable", executable_elements: "Elementos Ejecutables",
    },
    fields: { code: "Código", name: "Nombre", mission: "Misión", owner: "Dueño del Proceso", inputs: "Entradas", outputs: "Salidas", status: "Estado", parent: "Padre", actions: "Acciones" },
    status: { borrador: "Borrador", activo: "Activo", revision: "Revisión", obsoleto: "Obsoleto" },
    roles: { administrador: "Administrador", dueno_proceso: "Diseñador de Procesos", participante: "Usuario", auditor: "Auditor" },
    actions: { create: "Crear", edit: "Editar", delete: "Eliminar", save: "Guardar", cancel: "Cancelar", search: "Buscar", view: "Ver" },
    auth: { email: "Correo", password: "Contraseña", fullName: "Nombre completo", signIn: "Entrar", signUp: "Crear cuenta", noAccount: "¿No tienes cuenta?", hasAccount: "¿Ya tienes cuenta?", welcome: "Bienvenido a BPM Atlas", subtitle: "Visualiza y gestiona la jerarquía de procesos de tu organización.", invalidEmail: "El correo no parece existir. Comprueba la dirección.", accountCreated: "Cuenta creada" },
    dashboard: { title: "Tablero global", subtitle: "Vista jerárquica Top-Down", empty: "Aún no hay macroprocesos. Crea el primero para comenzar.", summary: "Resumen", total: "Total" },
    encyclopedia: { title: "Enciclopedia BPM", subtitle: "Definiciones técnicas de cada elemento de la disciplina BPM." },
    common: { loading: "Cargando…", language: "Idioma", noResults: "Sin resultados" },
    enc: {
      macroprocess: "Conjunto de procesos interrelacionados que cubre una gran capacidad de la organización (p. ej. Gestión Comercial). Representa el nivel más alto de agregación en la cadena de valor.",
      process_type: "Agrupación funcional de procesos con propósito común dentro de un macroproceso.",
      process: "Secuencia ordenada de actividades que transforma entradas en salidas con valor para un cliente interno o externo.",
      subprocess: "Subdivisión de un proceso que aísla un flujo específico de actividades para facilitar su gestión.",
      task_type: "Categoría de tareas que comparten naturaleza, herramientas o competencias requeridas.",
      task: "Unidad mínima de trabajo ejecutable por un rol, con entradas, salidas y criterios de aceptación definidos.",
      owner: "Dueño de Proceso: responsable de definir, medir y mejorar el proceso end-to-end.",
      sipoc: "SIPOC: Proveedores–Entradas–Proceso–Salidas–Clientes. Herramienta de modelado de alto nivel.",
      pdca: "PDCA (Plan-Do-Check-Act): ciclo de mejora continua aplicado al BPM.",
      executable_element: "Elemento ejecutable: unidad mínima asociable a una app o a un workflow n8n. Solo puede crearse bajo una tarea no humana.",
    },
    var_type: {
      text: "Texto", varchar: "Varchar",
      integer: "Entero (int4)", bigint: "Entero grande (int8)",
      numeric: "Numérico", real: "Real (float4)", "double precision": "Doble precisión (float8)",
      boolean: "Booleano",
      date: "Fecha", time: "Hora", timestamp: "Fecha-hora", timestamptz: "Fecha-hora con zona",
      uuid: "UUID",
      json: "JSON", jsonb: "JSONB",
      entity: "Entidad",
    },
  }},
  en: { translation: {
    app: { name: "BPM Atlas", tagline: "Hierarchical business process management" },
    nav: { dashboard: "Dashboard", encyclopedia: "BPM Encyclopedia", admin: "Administration", logout: "Sign out", login: "Sign in", signup: "Sign up", modeler: "Visual Modeler", aiSuggest: "AI Suggestion", modeling: "Modeling Permissions", entities: "Entities" },
    modeler: { title: "Visual Process Modeler", subtitle: "Design flows by dragging nodes onto the canvas.", palette: "Palette", save: "Save diagram", saved: "Diagram saved", attached: "Attached to", clear: "Clear canvas", openExisting: "Existing diagrams", noneYet: "No saved diagrams yet.", standalone: "Standalone (unattached) diagram" },
    ai: { title: "AI structure suggestion", subtitle: "Enter your business type and the AI will propose macroprocesses and processes.", businessType: "Business type", businessTypePh: "e.g. Food distributor, Dental clinic, B2B SaaS…", language: "Response language", generate: "Generate proposal", regenerate: "Regenerate", accept: "Refresh process suggestions DB", accepted: "Structure inserted into the hierarchy", thinking: "Thinking…", empty: "No proposal yet. Generate one above.", generateChildren: "Generate detail with AI", childrenProposal: "Proposed children", childrenAccepted: "Detail inserted", childrenEmpty: "No proposal yet. Click Generate.", detailProcess: "Detail with AI", detailSubprocess: "Detail tasks with AI", detailing: "Detailing…", removeDetail: "Remove detail", regenerateDetail: "Regenerate detail", deleteRow: "Delete", scopeHint: "This suggestion is scoped to {{tenant}} · {{entity}} · {{env}}", noEntity: "no entity", goToHierarchy: "Go to Entity Process Hierarchy" },
    ficha: { title: "Technical Sheet", resources: "Resources", clientRequirements: "Client requirements", suppliers: "Suppliers", regulations: "Applicable regulations", openModeler: "Open in modeler" },
    bpmn: { startEvent: "Start", intermediateEvent: "Intermediate", endEvent: "End", task: "Task", subprocess: "Sub-process", gateway: "Decision" },
    levels: {
      macroprocess: "Macroprocess", macroprocesses: "Macroprocesses",
      process_type: "Process Type", process_types: "Process Types",
      process: "Process", processes: "Processes",
      subprocess: "Subprocess", subprocesses: "Subprocesses",
      task_type: "Task Type", task_types: "Task Types",
      task: "Task", tasks: "Tasks",
    },
    fields: { code: "Code", name: "Name", mission: "Mission", owner: "Process Owner", inputs: "Inputs", outputs: "Outputs", status: "Status", parent: "Parent", actions: "Actions" },
    status: { borrador: "Draft", activo: "Active", revision: "Under review", obsoleto: "Obsolete" },
    roles: { administrador: "Administrator", dueno_proceso: "Process Owner", participante: "Participant", auditor: "Auditor" },
    actions: { create: "Create", edit: "Edit", delete: "Delete", save: "Save", cancel: "Cancel", search: "Search", view: "View" },
    auth: { email: "Email", password: "Password", fullName: "Full name", signIn: "Sign in", signUp: "Create account", noAccount: "No account?", hasAccount: "Already have an account?", welcome: "Welcome to BPM Atlas", subtitle: "Visualize and govern your organization's process hierarchy.", invalidEmail: "This email address doesn't appear to exist. Please check it.", accountCreated: "Account created" },
    dashboard: { title: "Global dashboard", subtitle: "Top-down hierarchical view", empty: "No macroprocesses yet. Create the first one to get started.", summary: "Summary", total: "Total" },
    encyclopedia: { title: "BPM Encyclopedia", subtitle: "Technical definitions for every element of the BPM discipline." },
    common: { loading: "Loading…", language: "Language", noResults: "No results" },
    enc: {
      macroprocess: "A set of interrelated processes covering a major organizational capability (e.g. Commercial Management). Highest level of aggregation in the value chain.",
      process_type: "Functional grouping of processes sharing a common purpose within a macroprocess.",
      process: "Ordered sequence of activities that turns inputs into outputs with value for an internal or external customer.",
      subprocess: "Subdivision of a process isolating a specific activity flow for easier management.",
      task_type: "Category of tasks sharing nature, tools or required competencies.",
      task: "Smallest unit of work executable by a role, with defined inputs, outputs and acceptance criteria.",
      owner: "Process Owner: accountable for defining, measuring and improving the process end-to-end.",
      sipoc: "SIPOC: Suppliers–Inputs–Process–Outputs–Customers. High-level modeling tool.",
      pdca: "PDCA (Plan-Do-Check-Act): continuous improvement cycle applied to BPM.",
    },
    var_type: {
      text: "Text", varchar: "Varchar",
      integer: "Integer (int4)", bigint: "Big integer (int8)",
      numeric: "Numeric", real: "Real (float4)", "double precision": "Double precision (float8)",
      boolean: "Boolean",
      date: "Date", time: "Time", timestamp: "Timestamp", timestamptz: "Timestamp with zone",
      uuid: "UUID",
      json: "JSON", jsonb: "JSONB",
      entity: "Entity",
    },
  }},
  fr: { translation: { app: { name: "BPM Atlas", tagline: "Gestion hiérarchique des processus" }, nav: { dashboard: "Tableau de bord", encyclopedia: "Encyclopédie BPM", admin: "Administration", logout: "Déconnexion", login: "Connexion", signup: "Inscription", entities: "Entités" }, levels: { macroprocess: "Macroprocessus", macroprocesses: "Macroprocessus", process_type: "Type de processus", process_types: "Types de processus", process: "Processus", processes: "Processus", subprocess: "Sous-processus", subprocesses: "Sous-processus", task_type: "Type de tâche", task_types: "Types de tâches", task: "Tâche", tasks: "Tâches" }, fields: { code: "Code", name: "Nom", mission: "Mission", owner: "Responsable", inputs: "Entrées", outputs: "Sorties", status: "Statut", parent: "Parent", actions: "Actions" }, status: { borrador: "Brouillon", activo: "Actif", revision: "En revue", obsoleto: "Obsolète" }, roles: { administrador: "Administrateur", dueno_proceso: "Responsable de processus", participante: "Participant", auditor: "Auditeur" }, actions: { create: "Créer", edit: "Éditer", delete: "Supprimer", save: "Enregistrer", cancel: "Annuler", search: "Rechercher", view: "Voir" }, auth: { email: "E-mail", password: "Mot de passe", fullName: "Nom complet", signIn: "Se connecter", signUp: "Créer un compte", noAccount: "Pas de compte ?", hasAccount: "Déjà un compte ?", welcome: "Bienvenue dans BPM Atlas", subtitle: "Visualisez et gouvernez la hiérarchie des processus.", invalidEmail: "Cette adresse e-mail ne semble pas exister. Vérifiez-la.", accountCreated: "Compte créé" }, dashboard: { title: "Tableau global", subtitle: "Vue hiérarchique descendante", empty: "Aucun macroprocessus. Créez le premier pour commencer.", summary: "Résumé", total: "Total" }, encyclopedia: { title: "Encyclopédie BPM", subtitle: "Définitions techniques de chaque élément BPM." }, common: { loading: "Chargement…", language: "Langue", noResults: "Aucun résultat" }, enc: { macroprocess: "Ensemble de processus interreliés couvrant une grande capacité organisationnelle.", process_type: "Regroupement fonctionnel de processus.", process: "Séquence d'activités transformant des entrées en sorties à valeur ajoutée.", subprocess: "Subdivision d'un processus.", task_type: "Catégorie de tâches.", task: "Plus petite unité de travail exécutable.", owner: "Responsable de processus, garant de bout en bout.", sipoc: "SIPOC : Fournisseurs–Entrées–Processus–Sorties–Clients.", pdca: "PDCA : cycle d'amélioration continue." } , ai: { goToHierarchy: "Aller à la hiérarchie des processus d'une entité" }}},
  de: { translation: { app: { name: "BPM Atlas", tagline: "Hierarchisches Geschäftsprozessmanagement" }, nav: { dashboard: "Dashboard", encyclopedia: "BPM-Enzyklopädie", admin: "Verwaltung", logout: "Abmelden", login: "Anmelden", signup: "Registrieren", entities: "Entitäten" }, levels: { macroprocess: "Makroprozess", macroprocesses: "Makroprozesse", process_type: "Prozesstyp", process_types: "Prozesstypen", process: "Prozess", processes: "Prozesse", subprocess: "Teilprozess", subprocesses: "Teilprozesse", task_type: "Aufgabentyp", task_types: "Aufgabentypen", task: "Aufgabe", tasks: "Aufgaben" }, fields: { code: "Code", name: "Name", mission: "Mission", owner: "Prozessverantwortlicher", inputs: "Eingaben", outputs: "Ausgaben", status: "Status", parent: "Übergeordnet", actions: "Aktionen" }, status: { borrador: "Entwurf", activo: "Aktiv", revision: "In Prüfung", obsoleto: "Veraltet" }, roles: { administrador: "Administrator", dueno_proceso: "Prozessverantwortlicher", participante: "Teilnehmer", auditor: "Auditor" }, actions: { create: "Erstellen", edit: "Bearbeiten", delete: "Löschen", save: "Speichern", cancel: "Abbrechen", search: "Suchen", view: "Ansehen" }, auth: { email: "E-Mail", password: "Passwort", fullName: "Vollständiger Name", signIn: "Anmelden", signUp: "Konto erstellen", noAccount: "Kein Konto?", hasAccount: "Schon ein Konto?", welcome: "Willkommen bei BPM Atlas", subtitle: "Prozesshierarchie Ihrer Organisation steuern.", invalidEmail: "Diese E-Mail-Adresse scheint nicht zu existieren. Bitte prüfen.", accountCreated: "Konto erstellt" }, dashboard: { title: "Globales Dashboard", subtitle: "Hierarchische Top-Down-Ansicht", empty: "Noch keine Makroprozesse. Erstellen Sie den ersten.", summary: "Übersicht", total: "Gesamt" }, encyclopedia: { title: "BPM-Enzyklopädie", subtitle: "Technische Definitionen aller BPM-Elemente." }, common: { loading: "Lädt…", language: "Sprache", noResults: "Keine Ergebnisse" }, enc: { macroprocess: "Zusammenhängende Prozesse, die eine wesentliche Fähigkeit abdecken.", process_type: "Funktionale Gruppierung von Prozessen.", process: "Geordnete Aktivitätenfolge mit Wertschöpfung.", subprocess: "Unterteilung eines Prozesses.", task_type: "Kategorie von Aufgaben.", task: "Kleinste ausführbare Arbeitseinheit.", owner: "Prozessverantwortlicher, end-to-end.", sipoc: "SIPOC: Lieferanten–Eingaben–Prozess–Ausgaben–Kunden.", pdca: "PDCA: kontinuierlicher Verbesserungszyklus." } , ai: { goToHierarchy: "Zur Prozesshierarchie einer Entität" }}},
  it: { translation: { app: { name: "BPM Atlas", tagline: "Gestione gerarchica dei processi" }, nav: { dashboard: "Dashboard", encyclopedia: "Enciclopedia BPM", admin: "Amministrazione", logout: "Esci", login: "Accedi", signup: "Registrati", entities: "Entità" }, levels: { macroprocess: "Macroprocesso", macroprocesses: "Macroprocessi", process_type: "Tipo di processo", process_types: "Tipi di processo", process: "Processo", processes: "Processi", subprocess: "Sottoprocesso", subprocesses: "Sottoprocessi", task_type: "Tipo di attività", task_types: "Tipi di attività", task: "Attività", tasks: "Attività" }, fields: { code: "Codice", name: "Nome", mission: "Missione", owner: "Responsabile", inputs: "Ingressi", outputs: "Uscite", status: "Stato", parent: "Padre", actions: "Azioni" }, status: { borrador: "Bozza", activo: "Attivo", revision: "In revisione", obsoleto: "Obsoleto" }, roles: { administrador: "Amministratore", dueno_proceso: "Responsabile di processo", participante: "Partecipante", auditor: "Auditor" }, actions: { create: "Crea", edit: "Modifica", delete: "Elimina", save: "Salva", cancel: "Annulla", search: "Cerca", view: "Vedi" }, auth: { email: "Email", password: "Password", fullName: "Nome completo", signIn: "Accedi", signUp: "Crea account", noAccount: "Nessun account?", hasAccount: "Hai già un account?", welcome: "Benvenuto in BPM Atlas", subtitle: "Visualizza e governa la gerarchia dei processi.", invalidEmail: "Questo indirizzo email non sembra esistere. Verifica.", accountCreated: "Account creato" }, dashboard: { title: "Dashboard globale", subtitle: "Vista gerarchica top-down", empty: "Nessun macroprocesso. Crea il primo per iniziare.", summary: "Riepilogo", total: "Totale" }, encyclopedia: { title: "Enciclopedia BPM", subtitle: "Definizioni tecniche di ogni elemento BPM." }, common: { loading: "Caricamento…", language: "Lingua", noResults: "Nessun risultato" }, enc: { macroprocess: "Insieme di processi correlati che copre una grande capacità organizzativa.", process_type: "Raggruppamento funzionale di processi.", process: "Sequenza ordinata di attività che trasforma input in output di valore.", subprocess: "Suddivisione di un processo.", task_type: "Categoria di attività.", task: "Più piccola unità di lavoro eseguibile.", owner: "Responsabile di processo end-to-end.", sipoc: "SIPOC: Fornitori–Input–Processo–Output–Clienti.", pdca: "PDCA: ciclo di miglioramento continuo." } , ai: { goToHierarchy: "Vai alla gerarchia dei processi di un'entità" }}},
  pt: { translation: { app: { name: "BPM Atlas", tagline: "Gestão hierárquica de processos" }, nav: { dashboard: "Painel", encyclopedia: "Enciclopédia BPM", admin: "Administração", logout: "Sair", login: "Entrar", signup: "Cadastrar", entities: "Entidades" }, levels: { macroprocess: "Macroprocesso", macroprocesses: "Macroprocessos", process_type: "Tipo de Processo", process_types: "Tipos de Processo", process: "Processo", processes: "Processos", subprocess: "Subprocesso", subprocesses: "Subprocessos", task_type: "Tipo de Tarefa", task_types: "Tipos de Tarefa", task: "Tarefa", tasks: "Tarefas" }, fields: { code: "Código", name: "Nome", mission: "Missão", owner: "Dono do Processo", inputs: "Entradas", outputs: "Saídas", status: "Estado", parent: "Pai", actions: "Ações" }, status: { borrador: "Rascunho", activo: "Ativo", revision: "Em revisão", obsoleto: "Obsoleto" }, roles: { administrador: "Administrador", dueno_proceso: "Dono do Processo", participante: "Participante", auditor: "Auditor" }, actions: { create: "Criar", edit: "Editar", delete: "Excluir", save: "Salvar", cancel: "Cancelar", search: "Buscar", view: "Ver" }, auth: { email: "E-mail", password: "Senha", fullName: "Nome completo", signIn: "Entrar", signUp: "Criar conta", noAccount: "Sem conta?", hasAccount: "Já tem conta?", welcome: "Bem-vindo ao BPM Atlas", subtitle: "Visualize e governe a hierarquia de processos.", invalidEmail: "Este e-mail não parece existir. Verifique o endereço.", accountCreated: "Conta criada" }, dashboard: { title: "Painel global", subtitle: "Visão hierárquica top-down", empty: "Sem macroprocessos. Crie o primeiro para começar.", summary: "Resumo", total: "Total" }, encyclopedia: { title: "Enciclopédia BPM", subtitle: "Definições técnicas de cada elemento BPM." }, common: { loading: "Carregando…", language: "Idioma", noResults: "Sem resultados" }, enc: { macroprocess: "Conjunto de processos inter-relacionados cobrindo grande capacidade organizacional.", process_type: "Agrupamento funcional de processos.", process: "Sequência ordenada de atividades que transforma entradas em saídas de valor.", subprocess: "Subdivisão de um processo.", task_type: "Categoria de tarefas.", task: "Menor unidade de trabalho executável.", owner: "Dono do processo, responsável end-to-end.", sipoc: "SIPOC: Fornecedores–Entradas–Processo–Saídas–Clientes.", pdca: "PDCA: ciclo de melhoria contínua." } , ai: { goToHierarchy: "Ir para a hierarquia de processos de uma entidade" }}},
  ja: { translation: { app: { name: "BPM Atlas", tagline: "業務プロセスの階層管理" }, nav: { dashboard: "ダッシュボード", encyclopedia: "BPM百科事典", admin: "管理", logout: "ログアウト", login: "ログイン", signup: "新規登録", entities: "エンティティ" }, levels: { macroprocess: "マクロプロセス", macroprocesses: "マクロプロセス", process_type: "プロセス種別", process_types: "プロセス種別", process: "プロセス", processes: "プロセス", subprocess: "サブプロセス", subprocesses: "サブプロセス", task_type: "タスク種別", task_types: "タスク種別", task: "タスク", tasks: "タスク" }, fields: { code: "コード", name: "名称", mission: "ミッション", owner: "プロセスオーナー", inputs: "入力", outputs: "出力", status: "状態", parent: "親", actions: "操作" }, status: { borrador: "下書き", activo: "有効", revision: "レビュー中", obsoleto: "廃止" }, roles: { administrador: "管理者", dueno_proceso: "プロセスオーナー", participante: "参加者", auditor: "監査者" }, actions: { create: "作成", edit: "編集", delete: "削除", save: "保存", cancel: "キャンセル", search: "検索", view: "表示" }, auth: { email: "メール", password: "パスワード", fullName: "氏名", signIn: "ログイン", signUp: "アカウント作成", noAccount: "アカウントをお持ちでない方", hasAccount: "既にアカウントをお持ちの方", welcome: "BPM Atlasへようこそ", subtitle: "プロセス階層を可視化・統制します。", invalidEmail: "このメールアドレスは存在しないようです。確認してください。", accountCreated: "アカウントを作成しました" }, dashboard: { title: "グローバルダッシュボード", subtitle: "トップダウン階層ビュー", empty: "マクロプロセスがありません。最初の一つを作成してください。", summary: "サマリー", total: "合計" }, encyclopedia: { title: "BPM百科事典", subtitle: "BPM要素の技術的定義。" }, common: { loading: "読み込み中…", language: "言語", noResults: "結果なし" }, enc: { macroprocess: "組織の主要能力をカバーする相互関連プロセスの集合。", process_type: "共通目的のプロセスの機能的グループ。", process: "入力を価値ある出力に変換する活動の順序。", subprocess: "プロセスの細分化。", task_type: "タスクのカテゴリ。", task: "実行可能な最小作業単位。", owner: "プロセスを定義・測定・改善する責任者。", sipoc: "SIPOC：供給者・入力・プロセス・出力・顧客。", pdca: "PDCA：継続的改善サイクル。" } , ai: { goToHierarchy: "エンティティのプロセス階層へ移動" }}},
  zh: { translation: { app: { name: "BPM Atlas", tagline: "业务流程层级化管理" }, nav: { dashboard: "仪表板", encyclopedia: "BPM百科", admin: "管理", logout: "登出", login: "登录", signup: "注册", entities: "实体" }, levels: { macroprocess: "宏流程", macroprocesses: "宏流程", process_type: "流程类型", process_types: "流程类型", process: "流程", processes: "流程", subprocess: "子流程", subprocesses: "子流程", task_type: "任务类型", task_types: "任务类型", task: "任务", tasks: "任务" }, fields: { code: "代码", name: "名称", mission: "使命", owner: "流程负责人", inputs: "输入", outputs: "输出", status: "状态", parent: "上级", actions: "操作" }, status: { borrador: "草稿", activo: "已启用", revision: "审核中", obsoleto: "已废弃" }, roles: { administrador: "管理员", dueno_proceso: "流程负责人", participante: "参与者", auditor: "审计员" }, actions: { create: "新建", edit: "编辑", delete: "删除", save: "保存", cancel: "取消", search: "搜索", view: "查看" }, auth: { email: "邮箱", password: "密码", fullName: "姓名", signIn: "登录", signUp: "创建账户", noAccount: "还没有账户？", hasAccount: "已有账户？", welcome: "欢迎来到 BPM Atlas", subtitle: "可视化并治理您的流程层级。", invalidEmail: "该邮箱地址似乎不存在，请检查。", accountCreated: "账户已创建" }, dashboard: { title: "全局仪表板", subtitle: "自顶向下层级视图", empty: "暂无宏流程，创建第一个开始使用。", summary: "概览", total: "总计" }, encyclopedia: { title: "BPM百科", subtitle: "每个BPM要素的技术定义。" }, common: { loading: "加载中…", language: "语言", noResults: "无结果" }, enc: { macroprocess: "覆盖组织重要能力的一组相互关联的流程。", process_type: "流程的功能性分组。", process: "将输入转化为有价值输出的有序活动。", subprocess: "流程的子部分。", task_type: "任务的类别。", task: "可执行的最小工作单元。", owner: "端到端负责流程的责任人。", sipoc: "SIPOC：供应方-输入-流程-输出-客户。", pdca: "PDCA：持续改进循环。" } , ai: { goToHierarchy: "前往实体流程层级" }}},
};

// Pick an initial language deterministically (same on server + first client render)
// to avoid SSR/CSR hydration mismatches. The client switches to the persisted /
// detected language right after mount in `applyClientLanguage` below.
const isBrowser = typeof window !== "undefined";

const initialLng = "es";

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLng,
    fallbackLng: "es",
    supportedLngs: ["es", "en", "fr", "de", "it", "pt", "ja", "zh"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

if (isBrowser) {
  // Defer to after first paint so SSR markup matches initial client render,
  // then switch to the persisted / browser language.
  queueMicrotask(() => {
    void i18n.use(LanguageDetector);
    const stored = window.localStorage.getItem("i18nextLng");
    const supported = ["es", "en", "fr", "de", "it", "pt", "ja", "zh"];
    const fromNav = (navigator.language || "es").slice(0, 2).toLowerCase();
    const target = stored && supported.includes(stored)
      ? stored
      : supported.includes(fromNav)
        ? fromNav
        : "es";
    if (target !== i18n.language) {
      void i18n.changeLanguage(target);
    }
    i18n.on("languageChanged", (lng) => {
      try { window.localStorage.setItem("i18nextLng", lng); } catch { /* noop */ }
    });
  });
}

export default i18n;
