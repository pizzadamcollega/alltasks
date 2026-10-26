/**
 * Hand-authored from supabase/migrations/*.sql (init + 20261026000003 shifts/manual), covering only
 * the tables/views/functions this phase's screens touch (S1/S2/S5/S6/S8/S9/S12-14).
 * `Relationships: []` is required boilerplate so these tables structurally
 * match postgrest-js's `GenericTable`/`GenericView` (real codegen always
 * includes it, even when empty, because we never do embedded `select`s).
 *
 * THIS IS A PLACEHOLDER. Once a real Supabase project exists, regenerate with
 * `npm run db:types` (supabase gen types typescript --local) and replace this
 * file wholesale — do not hand-edit it after that point.
 */

export type AppRole = "admin" | "patron" | "employee";
export type EntryStatus = "open" | "pending" | "approved";
export type PaymentKind = "payment" | "advance";
export type ThemePref = "system" | "light" | "dark";

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          slug: string;
          name: string;
          address: string | null;
          request_deadline_weekday: number;
          request_deadline_time: string;
          day_cutoff: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["branches"]["Row"]> & {
          slug: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          username: string;
          role: AppRole;
          theme: ThemePref;
          active: boolean;
          started_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          full_name: string;
          username: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      branch_members: {
        Row: { user_id: string; branch_id: string; created_at: string };
        Insert: { user_id: string; branch_id: string };
        Update: Partial<Database["public"]["Tables"]["branch_members"]["Row"]>;
        Relationships: [];
      };
      wage_rates: {
        Row: {
          id: string;
          user_id: string;
          hourly_rate: number;
          effective_from: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          hourly_rate: number;
          effective_from: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["wage_rates"]["Row"]>;
        Relationships: [];
      };
      time_entries: {
        Row: {
          id: string;
          user_id: string;
          branch_id: string;
          work_date: string;
          start_at: string;
          end_at: string | null;
          rounded_minutes: number | null;
          status: EntryStatus;
          edited_by_employee: boolean;
          edited_by_manager: boolean;
          approved_by: string | null;
          approved_at: string | null;
          manual: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["time_entries"]["Row"]> & {
          user_id: string;
          branch_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_entries"]["Row"]>;
        Relationships: [];
      };
      shifts: {
        Row: {
          id: string;
          branch_id: string;
          user_id: string;
          work_date: string;
          start_time: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          user_id: string;
          work_date: string;
          start_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["shifts"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          branch_id: string;
          month: string;
          kind: PaymentKind;
          amount: number;
          paid_on: string;
          note: string | null;
          visible_to_employee: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          user_id: string;
          branch_id: string;
          month: string;
          kind: PaymentKind;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      entry_earnings: {
        Row: {
          id: string;
          user_id: string;
          branch_id: string;
          work_date: string;
          start_at: string;
          end_at: string | null;
          rounded_minutes: number | null;
          status: EntryStatus;
          edited_by_employee: boolean;
          edited_by_manager: boolean;
          approved_by: string | null;
          approved_at: string | null;
          hourly_rate: number | null;
          amount: number | null;
          manual: boolean;
        };
        Relationships: [];
      };
      monthly_earnings: {
        Row: {
          user_id: string;
          branch_id: string;
          month: string;
          approved_days: number;
          approved_minutes: number | null;
          pending_minutes: number | null;
          approved_amount: number | null;
          pending_amount: number | null;
        };
        Relationships: [];
      };
      daily_branch_cost: {
        Row: {
          branch_id: string;
          work_date: string;
          people: number;
          minutes: number | null;
          approved_amount: number | null;
          pending_amount: number | null;
          open_entries: number;
          pending_entries: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      clock_in: {
        Args: { p_branch: string };
        Returns: Database["public"]["Tables"]["time_entries"]["Row"];
      };
      clock_out: {
        Args: Record<string, never>;
        Returns: Database["public"]["Tables"]["time_entries"]["Row"];
      };
      approve_entries: {
        Args: { p_ids: string[] };
        Returns: number;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_branch_manager: {
        Args: { p_branch: string };
        Returns: boolean;
      };
      manages_user: {
        Args: { p_user: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: AppRole;
      entry_status: EntryStatus;
      payment_kind: PaymentKind;
      theme_pref: ThemePref;
    };
  };
}
