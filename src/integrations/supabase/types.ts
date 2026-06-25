export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blocked_email_domains: {
        Row: {
          created_at: string
          domain: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          reason?: string | null
        }
        Relationships: []
      }
      change_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_table: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_table: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_table?: string
          id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          active: boolean
          auto_join_enabled: boolean
          auto_join_role: Database["public"]["Enums"]["app_role"]
          code: string | null
          created_at: string
          email_domain: string | null
          id: string
          name: string
          notes: string | null
          onboarding_completed: boolean
          plan_label: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_join_enabled?: boolean
          auto_join_role?: Database["public"]["Enums"]["app_role"]
          code?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          name: string
          notes?: string | null
          onboarding_completed?: boolean
          plan_label?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_join_enabled?: boolean
          auto_join_role?: Database["public"]["Enums"]["app_role"]
          code?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          name?: string
          notes?: string | null
          onboarding_completed?: boolean
          plan_label?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          environment: string
          id: string
          mission: string | null
          name: string
          parent_id: string | null
          stakeholder_inputs: string | null
          stakeholder_outputs: string | null
          status: Database["public"]["Enums"]["process_status"]
          strategy: string | null
          updated_at: string
          vision: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          environment?: string
          id?: string
          mission?: string | null
          name: string
          parent_id?: string | null
          stakeholder_inputs?: string | null
          stakeholder_outputs?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          strategy?: string | null
          updated_at?: string
          vision?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          environment?: string
          id?: string
          mission?: string | null
          name?: string
          parent_id?: string | null
          stakeholder_inputs?: string | null
          stakeholder_outputs?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          strategy?: string | null
          updated_at?: string
          vision?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_diagram_tables: {
        Row: {
          client_id: string
          created_at: string
          diagram_id: string | null
          environment: string
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          diagram_id?: string | null
          environment?: string
          id?: string
          label?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          diagram_id?: string | null
          environment?: string
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_diagram_tables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_diagram_tables_diagram_id_fkey"
            columns: ["diagram_id"]
            isOneToOne: false
            referencedRelation: "process_diagrams"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_field_catalog: {
        Row: {
          client_id: string
          created_at: string
          data_type: Database["public"]["Enums"]["entity_field_data_type"]
          description: string | null
          environment: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          data_type?: Database["public"]["Enums"]["entity_field_data_type"]
          description?: string | null
          environment?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          data_type?: Database["public"]["Enums"]["entity_field_data_type"]
          description?: string | null
          environment?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_field_catalog_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_positions: {
        Row: {
          client_id: string | null
          created_at: string
          description: Record<string, string>
          entity_id: string
          environment: string
          id: string
          label: Record<string, string>
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: Record<string, string>
          entity_id: string
          environment?: string
          id?: string
          label?: Record<string, string>
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: Record<string, string>
          entity_id?: string
          environment?: string
          id?: string
          label?: Record<string, string>
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_positions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_positions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_process_links: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          environment: string
          id: string
          notes: string | null
          role: Database["public"]["Enums"]["sipoc_role"]
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          environment?: string
          id?: string
          notes?: string | null
          role: Database["public"]["Enums"]["sipoc_role"]
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          environment?: string
          id?: string
          notes?: string | null
          role?: Database["public"]["Enums"]["sipoc_role"]
          target_id?: string
          target_level?: Database["public"]["Enums"]["bpm_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_process_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_process_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_process_links_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_table_columns: {
        Row: {
          client_id: string
          created_at: string
          diagram_id: string | null
          environment: string
          field_id: string
          fk_target_column_id: string | null
          fk_target_node_id: string | null
          id: string
          is_nullable: boolean
          is_primary_key: boolean
          node_id: string
          position: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          diagram_id?: string | null
          environment?: string
          field_id: string
          fk_target_column_id?: string | null
          fk_target_node_id?: string | null
          id?: string
          is_nullable?: boolean
          is_primary_key?: boolean
          node_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          diagram_id?: string | null
          environment?: string
          field_id?: string
          fk_target_column_id?: string | null
          fk_target_node_id?: string | null
          id?: string
          is_nullable?: boolean
          is_primary_key?: boolean
          node_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_table_columns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_table_columns_diagram_id_fkey"
            columns: ["diagram_id"]
            isOneToOne: false
            referencedRelation: "process_diagrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_table_columns_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "entity_field_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_table_columns_fk_target_column_id_fkey"
            columns: ["fk_target_column_id"]
            isOneToOne: false
            referencedRelation: "entity_table_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      executable_element_integrations: {
        Row: {
          client_id: string | null
          created_at: string
          environment: string
          executable_element_id: string
          external_ref: string
          id: string
          notes: string | null
          payload_template: Json | null
          provider: Database["public"]["Enums"]["automation_provider"]
          updated_at: string
          url: string | null
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          environment?: string
          executable_element_id: string
          external_ref: string
          id?: string
          notes?: string | null
          payload_template?: Json | null
          provider: Database["public"]["Enums"]["automation_provider"]
          updated_at?: string
          url?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          environment?: string
          executable_element_id?: string
          external_ref?: string
          id?: string
          notes?: string | null
          payload_template?: Json | null
          provider?: Database["public"]["Enums"]["automation_provider"]
          updated_at?: string
          url?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "executable_element_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executable_element_integrations_executable_element_id_fkey"
            columns: ["executable_element_id"]
            isOneToOne: false
            referencedRelation: "executable_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      executable_elements: {
        Row: {
          app_url: string | null
          client_id: string | null
          client_requirements: string | null
          code: string
          created_at: string
          environment: string
          id: string
          inputs: string | null
          kind: string
          mission: string | null
          n8n_workflow_id: string | null
          name: string
          outputs: string | null
          owner_id: string | null
          parent_id: string
          regulations: string | null
          resources: string | null
          status: Database["public"]["Enums"]["process_status"]
          suppliers: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          app_url?: string | null
          client_id?: string | null
          client_requirements?: string | null
          code: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          kind?: string
          mission?: string | null
          n8n_workflow_id?: string | null
          name: string
          outputs?: string | null
          owner_id?: string | null
          parent_id: string
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          app_url?: string | null
          client_id?: string | null
          client_requirements?: string | null
          code?: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          kind?: string
          mission?: string | null
          n8n_workflow_id?: string | null
          name?: string
          outputs?: string | null
          owner_id?: string | null
          parent_id?: string
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "executable_elements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executable_elements_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executable_elements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_start_drafts: {
        Row: {
          client_id: string | null
          created_at: string
          definition_id: string
          environment: string
          id: string
          updated_at: string
          user_id: string
          values: Json
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          definition_id: string
          environment?: string
          id?: string
          updated_at?: string
          user_id?: string
          values?: Json
        }
        Update: {
          client_id?: string | null
          created_at?: string
          definition_id?: string
          environment?: string
          id?: string
          updated_at?: string
          user_id?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "instance_start_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instance_start_drafts_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "process_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      macroprocesses: {
        Row: {
          category: Database["public"]["Enums"]["macroprocess_category"]
          client_id: string | null
          client_requirements: string | null
          code: string
          color: string | null
          created_at: string
          entity_id: string
          environment: string
          id: string
          inputs: string | null
          mission: string | null
          name: string
          outputs: string | null
          owner_id: string | null
          position: number
          regulations: string | null
          resources: string | null
          status: Database["public"]["Enums"]["process_status"]
          suppliers: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["macroprocess_category"]
          client_id?: string | null
          client_requirements?: string | null
          code: string
          color?: string | null
          created_at?: string
          entity_id: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          name: string
          outputs?: string | null
          owner_id?: string | null
          position?: number
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["macroprocess_category"]
          client_id?: string | null
          client_requirements?: string | null
          code?: string
          color?: string | null
          created_at?: string
          entity_id?: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          name?: string
          outputs?: string | null
          owner_id?: string | null
          position?: number
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "macroprocesses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macroprocesses_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macroprocesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      node_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      node_kinds: {
        Row: {
          acts_as_action: boolean
          category_id: string
          code: string
          created_at: string
          id: string
          is_container: boolean
          name: string
        }
        Insert: {
          acts_as_action?: boolean
          category_id: string
          code: string
          created_at?: string
          id?: string
          is_container?: boolean
          name: string
        }
        Update: {
          acts_as_action?: boolean
          category_id?: string
          code?: string
          created_at?: string
          id?: string
          is_container?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_kinds_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "node_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      node_subtypes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_subtypes_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "node_types"
            referencedColumns: ["id"]
          },
        ]
      }
      node_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_types_kind_id_fkey"
            columns: ["kind_id"]
            isOneToOne: false
            referencedRelation: "node_kinds"
            referencedColumns: ["id"]
          },
        ]
      }
      process_definitions: {
        Row: {
          client_id: string | null
          created_at: string
          diagram_id: string | null
          edges: Json
          environment: string
          id: string
          name: string
          nodes: Json
          process_id: string | null
          published_at: string
          published_by: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          diagram_id?: string | null
          edges?: Json
          environment?: string
          id?: string
          name: string
          nodes?: Json
          process_id?: string | null
          published_at?: string
          published_by?: string | null
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          diagram_id?: string | null
          edges?: Json
          environment?: string
          id?: string
          name?: string
          nodes?: Json
          process_id?: string | null
          published_at?: string
          published_by?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "process_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_definitions_diagram_id_fkey"
            columns: ["diagram_id"]
            isOneToOne: false
            referencedRelation: "process_diagrams"
            referencedColumns: ["id"]
          },
        ]
      }
      process_diagrams: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          diagram_type: string
          edges: Json
          entity_id: string | null
          environment: string
          id: string
          level: string
          name: string
          node_id: string
          nodes: Json
          parent_id: string | null
          parent_table: string | null
          updated_at: string
          version: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          diagram_type?: string
          edges?: Json
          entity_id?: string | null
          environment?: string
          id?: string
          level: string
          name?: string
          node_id: string
          nodes?: Json
          parent_id?: string | null
          parent_table?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          diagram_type?: string
          edges?: Json
          entity_id?: string | null
          environment?: string
          id?: string
          level?: string
          name?: string
          node_id?: string
          nodes?: Json
          parent_id?: string | null
          parent_table?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "process_diagrams_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_diagrams_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      process_documents: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          environment: string
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          updated_at: string
          version: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          updated_at?: string
          version?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          target_id?: string
          target_level?: Database["public"]["Enums"]["bpm_level"]
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      process_events_log: {
        Row: {
          actor_id: string | null
          client_id: string | null
          created_at: string
          environment: string
          event_type: string
          id: string
          instance_id: string
          node_id: string | null
          payload: Json
          token_id: string | null
        }
        Insert: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          environment?: string
          event_type: string
          id?: string
          instance_id: string
          node_id?: string | null
          payload?: Json
          token_id?: string | null
        }
        Update: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          environment?: string
          event_type?: string
          id?: string
          instance_id?: string
          node_id?: string | null
          payload?: Json
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_events_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_log_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "process_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      process_indicators: {
        Row: {
          client_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          environment: string
          formula: string | null
          frequency: string | null
          id: string
          name: string
          notes: string | null
          responsible_id: string | null
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          target_value: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          environment?: string
          formula?: string | null
          frequency?: string | null
          id?: string
          name: string
          notes?: string | null
          responsible_id?: string | null
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          target_value?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          environment?: string
          formula?: string | null
          frequency?: string | null
          id?: string
          name?: string
          notes?: string | null
          responsible_id?: string | null
          target_id?: string
          target_level?: Database["public"]["Enums"]["bpm_level"]
          target_value?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_indicators_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_indicators_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_indicators_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      process_instances: {
        Row: {
          client_id: string | null
          created_at: string
          definition_id: string
          ended_at: string | null
          environment: string
          error_message: string | null
          id: string
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
          variables: Json
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          definition_id: string
          ended_at?: string | null
          environment?: string
          error_message?: string | null
          id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          client_id?: string | null
          created_at?: string
          definition_id?: string
          ended_at?: string | null
          environment?: string
          error_message?: string | null
          id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "process_instances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instances_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "process_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      process_risks: {
        Row: {
          client_id: string | null
          code: string | null
          control: string | null
          created_at: string
          created_by: string | null
          description: string
          environment: string
          id: string
          impact: number
          probability: number
          responsible_id: string | null
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          code?: string | null
          control?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          environment?: string
          id?: string
          impact?: number
          probability?: number
          responsible_id?: string | null
          target_id: string
          target_level: Database["public"]["Enums"]["bpm_level"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          code?: string | null
          control?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          environment?: string
          id?: string
          impact?: number
          probability?: number
          responsible_id?: string | null
          target_id?: string
          target_level?: Database["public"]["Enums"]["bpm_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_risks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_risks_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      process_tasks: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          environment: string
          error: string | null
          id: string
          instance_id: string
          lane_role: string | null
          node_id: string
          node_kind: string | null
          payload: Json
          result: Json | null
          retry_count: number
          started_at: string | null
          status: string
          task_kind: string
          token_id: string | null
          updated_at: string
          wf_object: string | null
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          environment?: string
          error?: string | null
          id?: string
          instance_id: string
          lane_role?: string | null
          node_id: string
          node_kind?: string | null
          payload?: Json
          result?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: string
          task_kind: string
          token_id?: string | null
          updated_at?: string
          wf_object?: string | null
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          environment?: string
          error?: string | null
          id?: string
          instance_id?: string
          lane_role?: string | null
          node_id?: string
          node_kind?: string | null
          payload?: Json
          result?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: string
          task_kind?: string
          token_id?: string | null
          updated_at?: string
          wf_object?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_tasks_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "process_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_tasks_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "process_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      process_tokens: {
        Row: {
          client_id: string | null
          created_at: string
          entered_at: string
          environment: string
          exited_at: string | null
          id: string
          instance_id: string
          node_id: string
          status: string
          updated_at: string
          wake_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          entered_at?: string
          environment?: string
          exited_at?: string | null
          id?: string
          instance_id: string
          node_id: string
          status?: string
          updated_at?: string
          wake_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          entered_at?: string
          environment?: string
          exited_at?: string | null
          id?: string
          instance_id?: string
          node_id?: string
          status?: string
          updated_at?: string
          wake_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_tokens_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "process_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      process_variables: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          environment: string
          id: string
          label: string
          name: string
          owner_id: string | null
          owner_kind: string | null
          updated_at: string
          var_type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          environment?: string
          id?: string
          label?: string
          name: string
          owner_id?: string | null
          owner_kind?: string | null
          updated_at?: string
          var_type: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          environment?: string
          id?: string
          label?: string
          name?: string
          owner_id?: string | null
          owner_kind?: string | null
          updated_at?: string
          var_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_variables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_variables_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          client_id: string | null
          client_requirements: string | null
          code: string
          created_at: string
          environment: string
          id: string
          inputs: string | null
          mission: string | null
          name: string
          outputs: string | null
          owner_id: string | null
          parent_id: string
          process_type_id: string | null
          regulations: string | null
          resources: string | null
          status: Database["public"]["Enums"]["process_status"]
          suppliers: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_requirements?: string | null
          code: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          name: string
          outputs?: string | null
          owner_id?: string | null
          parent_id: string
          process_type_id?: string | null
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_requirements?: string | null
          code?: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          name?: string
          outputs?: string | null
          owner_id?: string | null
          parent_id?: string
          process_type_id?: string | null
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          language?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_members: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          entity_id: string
          environment: string
          full_name: string
          id: string
          language: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          entity_id: string
          environment?: string
          full_name: string
          id?: string
          language?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          entity_id?: string
          environment?: string
          full_name?: string
          id?: string
          language?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      org_position_assignments: {
        Row: {
          client_id: string
          created_at: string
          end_date: string | null
          environment: string
          id: string
          is_primary: boolean
          member_id: string
          position_id: string
          start_date: string
        }
        Insert: {
          client_id: string
          created_at?: string
          end_date?: string | null
          environment?: string
          id?: string
          is_primary?: boolean
          member_id: string
          position_id: string
          start_date?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          end_date?: string | null
          environment?: string
          id?: string
          is_primary?: boolean
          member_id?: string
          position_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_position_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_position_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_position_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "entity_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_responsibilities: {
        Row: {
          client_id: string
          created_at: string
          description: Record<string, string>
          environment: string
          id: string
          label: Record<string, string>
          name: string
          position_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: Record<string, string>
          environment?: string
          id?: string
          label?: Record<string, string>
          name: string
          position_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: Record<string, string>
          environment?: string
          id?: string
          label?: Record<string, string>
          name?: string
          position_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_responsibilities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_responsibilities_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "entity_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_confirmations: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      subprocess_elements: {
        Row: {
          client_id: string | null
          created_at: string
          environment: string
          executable_element_id: string
          id: string
          position: number
          subprocess_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          environment?: string
          executable_element_id: string
          id?: string
          position?: number
          subprocess_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          environment?: string
          executable_element_id?: string
          id?: string
          position?: number
          subprocess_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subprocess_elements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subprocess_elements_executable_element_id_fkey"
            columns: ["executable_element_id"]
            isOneToOne: false
            referencedRelation: "executable_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subprocess_elements_subprocess_id_fkey"
            columns: ["subprocess_id"]
            isOneToOne: false
            referencedRelation: "subprocesses"
            referencedColumns: ["id"]
          },
        ]
      }
      subprocesses: {
        Row: {
          client_id: string | null
          client_requirements: string | null
          code: string
          created_at: string
          environment: string
          id: string
          inputs: string | null
          mission: string | null
          name: string
          outputs: string | null
          owner_id: string | null
          parent_id: string
          regulations: string | null
          resources: string | null
          status: Database["public"]["Enums"]["process_status"]
          suppliers: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_requirements?: string | null
          code: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          name: string
          outputs?: string | null
          owner_id?: string | null
          parent_id: string
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_requirements?: string | null
          code?: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          name?: string
          outputs?: string | null
          owner_id?: string | null
          parent_id?: string
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subprocesses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subprocesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subprocesses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          client_id: string | null
          client_requirements: string | null
          code: string
          created_at: string
          environment: string
          id: string
          inputs: string | null
          mission: string | null
          modeler_diagram_id: string | null
          modeler_node_id: string | null
          name: string
          outputs: string | null
          owner_id: string | null
          parent_id: string
          position: number
          regulations: string | null
          resources: string | null
          status: Database["public"]["Enums"]["process_status"]
          suppliers: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_requirements?: string | null
          code: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          modeler_diagram_id?: string | null
          modeler_node_id?: string | null
          name: string
          outputs?: string | null
          owner_id?: string | null
          parent_id: string
          position?: number
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_requirements?: string | null
          code?: string
          created_at?: string
          environment?: string
          id?: string
          inputs?: string | null
          mission?: string | null
          modeler_diagram_id?: string | null
          modeler_node_id?: string | null
          name?: string
          outputs?: string | null
          owner_id?: string | null
          parent_id?: string
          position?: number
          regulations?: string | null
          resources?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          suppliers?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_join_requests: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_join_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_clients: {
        Row: {
          client_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _tenant_lookup: {
        Args: { _id: string; _table: string }
        Returns: {
          client_id: string
          environment: string
        }[]
      }
      admin_get_columns: { Args: { _table: string }; Returns: Json }
      admin_run_select: { Args: { _sql: string }; Returns: Json }
      admin_table_stats: { Args: never; Returns: Json }
      can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_environment: {
        Args: { _env: string; _user_id: string }
        Returns: boolean
      }
      can_edit_bpm: { Args: { _user_id: string }; Returns: boolean }
      can_edit_bpm_in: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_any_bpm_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in: {
        Args: {
          _client_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "administrador"
        | "dueno_proceso"
        | "participante"
        | "auditor"
        | "super_admin"
      automation_provider: "n8n" | "make"
      bpm_level:
        | "macroprocesses"
        | "process_types"
        | "processes"
        | "subprocesses"
        | "task_types"
        | "tasks"
        | "executable_elements"
      entity_field_data_type:
        | "text"
        | "integer"
        | "numeric"
        | "boolean"
        | "date"
        | "timestamp"
        | "uuid"
        | "json"
        | "varchar"
        | "bigint"
        | "real"
        | "double precision"
        | "time"
        | "timestamptz"
        | "jsonb"
      macroprocess_category:
        | "estrategico"
        | "misional"
        | "transversal"
        | "apoyo"
        | "control"
      process_status: "borrador" | "activo" | "revision" | "obsoleto"
      sipoc_role: "proveedor" | "cliente" | "entrada" | "salida"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "administrador",
        "dueno_proceso",
        "participante",
        "auditor",
        "super_admin",
      ],
      automation_provider: ["n8n", "make"],
      bpm_level: [
        "macroprocesses",
        "process_types",
        "processes",
        "subprocesses",
        "task_types",
        "tasks",
        "executable_elements",
      ],
      entity_field_data_type: [
        "text",
        "integer",
        "numeric",
        "boolean",
        "date",
        "timestamp",
        "uuid",
        "json",
        "varchar",
        "bigint",
        "real",
        "double precision",
        "time",
        "timestamptz",
        "jsonb",
      ],
      macroprocess_category: [
        "estrategico",
        "misional",
        "transversal",
        "apoyo",
        "control",
      ],
      process_status: ["borrador", "activo", "revision", "obsoleto"],
      sipoc_role: ["proveedor", "cliente", "entrada", "salida"],
    },
  },
} as const
