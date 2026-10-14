/**
 * Hand-authored database types mirroring supabase/migrations.
 * Keep in sync with the SQL schema. (No generated types since there is no
 * live project checked in.)
 */

export type Temperature = "hot" | "warm" | "cold";

export type PipelineStage =
  | "none"
  | "lead"
  | "in_discussion"
  | "proposal"
  | "won"
  | "project_work"
  | "dormant";

export type InteractionType =
  | "email_in"
  | "email_out"
  | "meeting"
  | "call"
  | "note"
  | "voice_note"
  | "linkedin_in"
  | "linkedin_out"
  | "system";

export type SuggestionStatus = "pending" | "accepted" | "rejected";

export interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  emails: string[];
  phone: string | null; // primary number (= phones[0]); kept for compatibility
  phones: string[]; // all numbers, primary first
  company: string | null;
  role: string | null;
  tags: string[];
  interests: string[]; // interest tags for campaign targeting
  temperature: Temperature;
  pipeline_stage: PipelineStage;
  next_followup_at: string | null; // date (YYYY-MM-DD)
  followup_reason: string | null;
  last_contact_at: string | null; // timestamptz (ISO)
  last_meeting_at: string | null; // most recent past meeting (for sorting)
  notes: string | null; // the owner's own notes — never touched by AI
  ai_summary: string | null; // AI-generated; safe to regenerate
  ai_summary_at: string | null;
  linkedin_url: string | null;
  website: string | null; // company website, derived from email domain
  warning: string | null; // timewaster / banned / do-not-contact flag reason
  keep_in_touch: boolean; // false = dismissed from the 4-month reconnect list
  last_nurtured_at: string | null; // last personal nurture note sent
  reply_dismissed_at: string | null; // dismissed from the awaiting-reply list until a newer inbound
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  contact_id: string;
  type: InteractionType;
  occurred_at: string;
  subject: string | null;
  summary: string | null;
  body: string | null;
  note: string | null; // the owner's own annotation on this timeline item
  reviewed_at: string | null; // meeting dealt with → off the Recent list
  web_link: string | null;
  graph_message_id: string | null;
  voice_note_id: string | null;
  created_at: string;
}

export interface VoiceNote {
  id: string;
  audio_path: string;
  transcript: string | null;
  summary: string | null;
  action_items: { text: string; owner?: string | null }[];
  suggested_followup_at: string | null;
  created_at: string;
}

export interface SuggestionPayload {
  name?: string | null;
  email: string;
  company_guess?: string | null;
  thread_count?: number;
  first_seen?: string | null;
  last_seen?: string | null;
  sample_subjects?: string[];
  domain?: string | null;
  snippet?: string | null;
  emails?: string[]; // same person merged across addresses
}

export interface Suggestion {
  id: string;
  type: string;
  payload: SuggestionPayload;
  status: SuggestionStatus;
  source: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ContactUpdate {
  id: string;
  contact_id: string;
  field: string; // 'company' | 'role' | 'phone'
  current_value: string | null;
  suggested_value: string;
  evidence: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  resolved_at: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  is_super_admin: boolean;
  active_tenant_id: string | null;
  email: string | null;
}

export interface Settings {
  tenant_id: string;
  hot_days: number;
  warm_days: number;
  cold_days: number;
  suggestion_thread_threshold: number;
  interest_options: string[]; // master list of interest tags (admin-managed)
  owner_name: string | null; // this tenant's owner, for AI sign-offs + sync "me"
  owner_first_name: string | null;
  owner_email: string | null;
  owner_linkedin_slug: string | null;
}

export interface SyncState {
  tenant_id: string;
  ms_refresh_token: string | null;
  inbox_delta_link: string | null;
  sent_delta_link: string | null;
  backfill_done: boolean;
  last_sync_at: string | null;
  last_error: string | null;
}

/** Row shape returned by the followup_queue view (contacts + computed cols). */
export interface FollowupQueueRow extends Contact {
  overdue_days: number;
  due_reason: string;
}
