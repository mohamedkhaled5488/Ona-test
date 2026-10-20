// Hand-authored to match supabase/migrations/0001_init.sql. Once the project
// exists, prefer regenerating this with the Supabase CLI:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
// and reconciling any drift with this file.

export interface Database {
  public: {
    Tables: {
      profiles: {
        // store_data_consent*: see supabase/migrations/0007 and 0008.
        Row: { id: string; email: string | null; created_at: string; store_data_consent: boolean | null; store_data_consent_at: string | null; store_data_consent_version: string | null; store_data_consent_source: string | null };
        Insert: { id: string; email?: string | null };
        Update: { email?: string | null; store_data_consent?: boolean | null; store_data_consent_at?: string | null; store_data_consent_version?: string | null; store_data_consent_source?: string | null };
      };
      plans: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          motive: string;
          status: string;
          color: string;
          tags: string[];
          review_interval_days: number | null;
          reflection: unknown | null;
          steps: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          motive?: string;
          status?: string;
          color?: string;
          tags?: string[];
          review_interval_days?: number | null;
          reflection?: unknown | null;
          steps?: unknown;
        };
        Update: Partial<Database['public']['Tables']['plans']['Insert']>;
      };
      plan_templates: {
        Row: { id: string; user_id: string; name: string; description: string; motive: string; steps: unknown; created_at: string };
        Insert: { id?: string; user_id: string; name: string; description?: string; motive?: string; steps?: unknown };
        Update: Partial<Database['public']['Tables']['plan_templates']['Insert']>;
      };
      daily_tasks: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          title: string;
          done: boolean;
          scheduled_time: string | null;
          reminder_minutes_before: number | null;
          alarm_sound: string | null;
          notification_ids: string[];
          completion_notes: unknown;
          linked_plan_id: string | null;
          linked_plan_path: string[] | null;
          subtasks: unknown;
          repeat: string;
          completed_dates: string[];
          skipped_dates: string[];
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          title?: string;
          done?: boolean;
          scheduled_time?: string | null;
          reminder_minutes_before?: number | null;
          alarm_sound?: string | null;
          notification_ids?: string[];
          completion_notes?: unknown;
          linked_plan_id?: string | null;
          linked_plan_path?: string[] | null;
          subtasks?: unknown;
          repeat?: string;
          completed_dates?: string[];
          skipped_dates?: string[];
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['daily_tasks']['Insert']>;
      };
      day_templates: {
        Row: { id: string; user_id: string; name: string; task_titles: string[] };
        Insert: { id?: string; user_id: string; name: string; task_titles?: string[] };
        Update: Partial<Database['public']['Tables']['day_templates']['Insert']>;
      };
      day_reflections: {
        Row: { user_id: string; date: string; text: string };
        Insert: { user_id: string; date: string; text?: string };
        Update: Partial<Database['public']['Tables']['day_reflections']['Insert']>;
      };
      journal_entries: {
        Row: { id: string; user_id: string; date: string; mood: string; text: string; tags: string[]; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; date: string; mood: string; text?: string; tags?: string[] };
        Update: Partial<Database['public']['Tables']['journal_entries']['Insert']>;
      };
      journal_settings: {
        Row: { user_id: string; lock_enabled: boolean; background: string; font: string; size: string; template: string };
        Insert: { user_id: string; lock_enabled?: boolean; background?: string; font?: string; size?: string; template?: string };
        Update: Partial<Database['public']['Tables']['journal_settings']['Insert']>;
      };
      thoughts: {
        Row: { id: string; user_id: string; kind: string; text: string; promoted_to: string | null; created_at: string };
        Insert: { id?: string; user_id: string; kind: string; text: string; promoted_to?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['thoughts']['Insert']>;
      };
      study_sessions: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          subject: string | null;
          focus_minutes: number;
          break_minutes: number;
          app_blocking_enabled: boolean;
          ambient_sound: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          subject?: string | null;
          focus_minutes?: number;
          break_minutes?: number;
          app_blocking_enabled?: boolean;
          ambient_sound?: string;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['study_sessions']['Insert']>;
      };
      planned_meals: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          slot: string;
          name: string;
          cost: number | null;
          source: string | null;
          notes: string | null;
          tags: string[];
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          slot: string;
          name: string;
          cost?: number | null;
          source?: string | null;
          notes?: string | null;
          tags?: string[];
        };
        Update: Partial<Database['public']['Tables']['planned_meals']['Insert']>;
      };
      favorite_meals: {
        Row: { id: string; user_id: string; name: string; cost: number | null; source: string | null; notes: string | null; tags: string[] };
        Insert: { id?: string; user_id: string; name: string; cost?: number | null; source?: string | null; notes?: string | null; tags?: string[] };
        Update: Partial<Database['public']['Tables']['favorite_meals']['Insert']>;
      };
      grocery_items: {
        Row: { id: string; user_id: string; label: string; checked: boolean };
        Insert: { id?: string; user_id: string; label: string; checked?: boolean };
        Update: Partial<Database['public']['Tables']['grocery_items']['Insert']>;
      };
      diet_settings: {
        Row: { user_id: string; currency: string };
        Insert: { user_id: string; currency?: string };
        Update: Partial<Database['public']['Tables']['diet_settings']['Insert']>;
      };
      songs: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          song_type_id: string;
          status: string;
          sections: unknown;
          versions: unknown;
          inspiration: string[];
          collaborator: string | null;
          has_voice_memo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          song_type_id: string;
          status?: string;
          sections?: unknown;
          versions?: unknown;
          inspiration?: string[];
          collaborator?: string | null;
          has_voice_memo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['songs']['Insert']>;
      };
      game_results: {
        Row: { id: string; user_id: string; game_id: string; difficulty: string; score: number; played_at: string };
        Insert: { id?: string; user_id: string; game_id: string; difficulty: string; score: number; played_at?: string };
        Update: Partial<Database['public']['Tables']['game_results']['Insert']>;
      };
      feeling_checkins: {
        Row: { id: string; user_id: string; feeling_id: string; family: string; note: string | null; date: string; created_at: string };
        Insert: { id?: string; user_id: string; feeling_id: string; family: string; note?: string | null; date: string };
        Update: Partial<Database['public']['Tables']['feeling_checkins']['Insert']>;
      };
      feeling_bookmarks: {
        Row: { user_id: string; feeling_id: string; created_at: string };
        Insert: { user_id: string; feeling_id: string };
        Update: never;
      };
      feeling_guidance_votes: {
        Row: { user_id: string; vote_key: string; score: number };
        Insert: { user_id: string; vote_key: string; score?: number };
        Update: Partial<Database['public']['Tables']['feeling_guidance_votes']['Insert']>;
      };
      reading_list_entries: {
        Row: {
          id: string;
          user_id: string;
          book_id: string;
          status: string;
          progress_percent: number | null;
          rating: number | null;
          notes: string | null;
          book: unknown;
          added_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          book_id: string;
          status: string;
          progress_percent?: number | null;
          rating?: number | null;
          notes?: string | null;
          book: unknown;
        };
        Update: Partial<Database['public']['Tables']['reading_list_entries']['Insert']>;
      };
    };
    // See supabase/migrations/0002_account_deletion.sql.
    Functions: {
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      delete_my_server_data: { Args: Record<string, never>; Returns: undefined };
      // See supabase/migrations/0003_entitlements.sql (shape: RawEntitlement in utils/entitlement.ts).
      get_entitlement: { Args: Record<string, never>; Returns: unknown };
      start_trial: { Args: Record<string, never>; Returns: unknown };
    };
  };
}
