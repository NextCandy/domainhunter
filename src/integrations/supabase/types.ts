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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      auctions: {
        Row: {
          bid_count: number | null
          buy_url: string | null
          created_at: string
          currency: string | null
          current_price: number | null
          domain: string
          end_time: string | null
          id: number
          platform: string
          updated_at: string
        }
        Insert: {
          bid_count?: number | null
          buy_url?: string | null
          created_at?: string
          currency?: string | null
          current_price?: number | null
          domain: string
          end_time?: string | null
          id?: number
          platform: string
          updated_at?: string
        }
        Update: {
          bid_count?: number | null
          buy_url?: string | null
          created_at?: string
          currency?: string | null
          current_price?: number | null
          domain?: string
          end_time?: string | null
          id?: number
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          created_at: string
          enabled: boolean
          id: number
          last_error: string | null
          last_sync_at: string | null
          last_sync_count: number
          name: string
          sync_interval_min: number
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: number
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_count?: number
          name: string
          sync_interval_min?: number
          type?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: number
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_count?: number
          name?: string
          sync_interval_min?: number
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      domain_dns: {
        Row: {
          a_records: string[] | null
          checked_at: string
          domain_id: number
          mx_records: string[] | null
          ns_records: string[] | null
          txt_records: string[] | null
        }
        Insert: {
          a_records?: string[] | null
          checked_at?: string
          domain_id: number
          mx_records?: string[] | null
          ns_records?: string[] | null
          txt_records?: string[] | null
        }
        Update: {
          a_records?: string[] | null
          checked_at?: string
          domain_id?: number
          mx_records?: string[] | null
          ns_records?: string[] | null
          txt_records?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_dns_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_metrics: {
        Row: {
          archive_count: number
          archive_year: number | null
          backlinks: number
          domain_id: number
          referring_domains: number
          related_domain_count: number
          seo_score: number
          tld_registered_count: number
          updated_at: string
        }
        Insert: {
          archive_count?: number
          archive_year?: number | null
          backlinks?: number
          domain_id: number
          referring_domains?: number
          related_domain_count?: number
          seo_score?: number
          tld_registered_count?: number
          updated_at?: string
        }
        Update: {
          archive_count?: number
          archive_year?: number | null
          backlinks?: number
          domain_id?: number
          referring_domains?: number
          related_domain_count?: number
          seo_score?: number
          tld_registered_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_metrics_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_whois: {
        Row: {
          checked_at: string
          created_date: string | null
          domain_id: number
          expiry_date: string | null
          nameservers: string[] | null
          raw_data: Json | null
          registrar: string | null
          updated_date: string | null
        }
        Insert: {
          checked_at?: string
          created_date?: string | null
          domain_id: number
          expiry_date?: string | null
          nameservers?: string[] | null
          raw_data?: Json | null
          registrar?: string | null
          updated_date?: string | null
        }
        Update: {
          checked_at?: string
          created_date?: string | null
          domain_id?: number
          expiry_date?: string | null
          nameservers?: string[] | null
          raw_data?: Json | null
          registrar?: string | null
          updated_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_whois_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string
          domain: string
          drop_date: string | null
          expiry_date: string | null
          first_seen_at: string
          id: number
          last_checked_at: string | null
          length: number
          name: string
          risk_level: string
          score: number
          source: string | null
          status: string
          tld: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          drop_date?: string | null
          expiry_date?: string | null
          first_seen_at?: string
          id?: number
          last_checked_at?: string | null
          length: number
          name: string
          risk_level?: string
          score?: number
          source?: string | null
          status?: string
          tld: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          drop_date?: string | null
          expiry_date?: string | null
          first_seen_at?: string
          id?: number
          last_checked_at?: string | null
          length?: number
          name?: string
          risk_level?: string
          score?: number
          source?: string | null
          status?: string
          tld?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_events: {
        Row: {
          created_at: string
          event: string
          id: number
          job_id: string
          level: string
          message: string | null
          meta: Json | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: number
          job_id: string
          level?: string
          message?: string | null
          meta?: Json | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: number
          job_id?: string
          level?: string
          message?: string | null
          meta?: Json | null
        }
        Relationships: []
      }
      job_items: {
        Row: {
          checked_at: string | null
          domain: string
          error: string | null
          id: number
          info: Json | null
          job_id: string
          status: string
          tld: string
        }
        Insert: {
          checked_at?: string | null
          domain: string
          error?: string | null
          id?: number
          info?: Json | null
          job_id: string
          status?: string
          tld: string
        }
        Update: {
          checked_at?: string | null
          domain?: string
          error?: string | null
          id?: number
          info?: Json | null
          job_id?: string
          status?: string
          tld?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          available: number
          checked: number
          created_at: string
          errors: number
          finished_at: string | null
          id: string
          last_progress_at: string | null
          name: string
          params: Json
          registered: number
          started_at: string | null
          status: string
          total: number
          unsupported: number
        }
        Insert: {
          available?: number
          checked?: number
          created_at?: string
          errors?: number
          finished_at?: string | null
          id?: string
          last_progress_at?: string | null
          name: string
          params?: Json
          registered?: number
          started_at?: string | null
          status?: string
          total?: number
          unsupported?: number
        }
        Update: {
          available?: number
          checked?: number
          created_at?: string
          errors?: number
          finished_at?: string | null
          id?: string
          last_progress_at?: string | null
          name?: string
          params?: Json
          registered?: number
          started_at?: string | null
          status?: string
          total?: number
          unsupported?: number
        }
        Relationships: []
      }
      my_domains: {
        Row: {
          created_at: string
          dns_status: string | null
          domain: string
          expiry_date: string | null
          id: number
          note: string | null
          registrar: string | null
          renew_reminder: boolean
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dns_status?: string | null
          domain: string
          expiry_date?: string | null
          id?: number
          note?: string | null
          registrar?: string | null
          renew_reminder?: boolean
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dns_status?: string | null
          domain?: string
          expiry_date?: string | null
          id?: number
          note?: string | null
          registrar?: string | null
          renew_reminder?: boolean
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      registrars: {
        Row: {
          api_key_encrypted: string | null
          api_secret_encrypted: string | null
          buy_url_template: string | null
          config_json: Json
          created_at: string
          enabled: boolean
          id: number
          name: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          buy_url_template?: string | null
          config_json?: Json
          created_at?: string
          enabled?: boolean
          id?: number
          name: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          buy_url_template?: string | null
          config_json?: Json
          created_at?: string
          enabled?: boolean
          id?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      scoring_rules: {
        Row: {
          id: number
          updated_at: string
          weights: Json
        }
        Insert: {
          id?: number
          updated_at?: string
          weights?: Json
        }
        Update: {
          id?: number
          updated_at?: string
          weights?: Json
        }
        Relationships: []
      }
      tlds_cache: {
        Row: {
          data: Json
          key: string
          updated_at: string
        }
        Insert: {
          data: Json
          key: string
          updated_at?: string
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          created_at: string
          domain_id: number
          id: number
          note: string | null
          notify_before_drop: boolean
          notify_on_available: boolean
          notify_on_price_change: boolean
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain_id: number
          id?: number
          note?: string | null
          notify_before_drop?: boolean
          notify_on_available?: boolean
          notify_on_price_change?: boolean
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain_id?: number
          id?: number
          note?: string | null
          notify_before_drop?: boolean
          notify_on_available?: boolean
          notify_on_price_change?: boolean
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
