/**
 * Hand-authored from supabase/migrations/*.sql (init through 20261029000008 day close), covering only
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
export type EntryStatus = "open" | "pending" | "cashier_approved" | "approved" | "returned";
export type ReviewStatus = "pending" | "cashier_approved" | "approved" | "returned";
export type StaffDuty = "kasaci" | "bezorgd" | "usta";
export type ReviewKind = "entry" | "material" | "cash";
export type PaymentKind = "payment" | "advance";
export type ThemePref = "system" | "light" | "dark";
export type ShiftRequestStatus = "pending" | "approved" | "rejected";

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
          duties: StaffDuty[];
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
          cashier_approved_by: string | null;
          cashier_approved_at: string | null;
          returned_by: string | null;
          returned_at: string | null;
          return_note: string | null;
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
          is_cashier: boolean;
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
          is_cashier?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["shifts"]["Row"]>;
        Relationships: [];
      };
      shift_requests: {
        Row: {
          id: string;
          branch_id: string;
          user_id: string;
          work_date: string;
          start_time: string;
          note: string | null;
          status: ShiftRequestStatus;
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      shift_week_publications: {
        Row: {
          branch_id: string;
          week_start: string;
          published_by: string | null;
          published_at: string;
        };
        Insert: { branch_id: string; week_start: string };
        Update: never;
        Relationships: [];
      };
      material_reports: {
        Row: {
          id: string;
          branch_id: string;
          user_id: string;
          work_date: string;
          dough_s: number;
          dough_m: number;
          dough_l: number;
          note: string | null;
          status: ReviewStatus;
          cashier_approved_by: string | null;
          cashier_approved_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          returned_by: string | null;
          returned_at: string | null;
          return_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          user_id: string;
          work_date: string;
          dough_s?: number;
          dough_m?: number;
          dough_l?: number;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["material_reports"]["Insert"]>;
        Relationships: [];
      };
      cash_counts: {
        Row: {
          id: string;
          branch_id: string;
          user_id: string | null;
          work_date: string;
          opening_float: number;
          online: number;
          kiosk: number;
          contant: number;
          total: number;
          note: string | null;
          status: ReviewStatus;
          approved_by: string | null;
          approved_at: string | null;
          returned_by: string | null;
          returned_at: string | null;
          return_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          user_id?: string | null;
          work_date: string;
          opening_float?: number;
          online?: number;
          kiosk?: number;
          contant?: number;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cash_counts"]["Insert"]>;
        Relationships: [];
      };
      day_closings: {
        Row: {
          branch_id: string;
          work_date: string;
          closed: boolean;
          closed_by: string | null;
          closed_at: string;
          reopened_by: string | null;
          reopened_at: string | null;
          snapshot: Record<string, unknown>;
        };
        Insert: never;
        Update: never;
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
          cashier_approved_by: string | null;
          cashier_approved_at: string | null;
          returned_at: string | null;
          return_note: string | null;
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
      submit_shift_requests: {
        Args: { p_branch: string; p_week: string; p_days: { date: string; start: string; note?: string }[] };
        Returns: number;
      };
      decide_shift_request: {
        Args: { p_request: string; p_approve: boolean; p_start?: string };
        Returns: undefined;
      };
      approve_pending_shift_requests: {
        Args: { p_branch: string; p_week: string };
        Returns: number;
      };
      set_day_cashier: {
        Args: { p_branch: string; p_date: string; p_user: string | null };
        Returns: undefined;
      };
      is_day_cashier: {
        Args: { p_branch: string; p_date: string };
        Returns: boolean;
      };
      business_today: {
        Args: { p_branch: string };
        Returns: string;
      };
      cashier_approve: {
        Args: { p_kind: ReviewKind; p_ids: string[] };
        Returns: number;
      };
      manager_approve: {
        Args: { p_kind: ReviewKind; p_ids: string[] };
        Returns: number;
      };
      return_item: {
        Args: { p_kind: ReviewKind; p_id: string; p_note: string };
        Returns: undefined;
      };
      close_day: {
        Args: { p_branch: string; p_date: string };
        Returns: Database["public"]["Tables"]["day_closings"]["Row"];
      };
      reopen_day: {
        Args: { p_branch: string; p_date: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: AppRole;
      entry_status: EntryStatus;
      review_status: ReviewStatus;
      staff_duty: StaffDuty;
      payment_kind: PaymentKind;
      theme_pref: ThemePref;
    };
  };
}
