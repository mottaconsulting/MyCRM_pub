import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Microsoft Graph (delegated) helpers: OAuth authorization-code flow with
 * refresh-token rotation, and a mailbox subject search. All calls are
 * server-side only.
 */

const TENANT = process.env.MS_TENANT_ID || "common";
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";

// Requested at consent time (the authorize URL). OnlineMeetings.Read +
// OnlineMeetingTranscript.Read.All are needed to pull Teams meeting transcripts;
// they require admin consent. The refresh call below deliberately omits `scope`
// so it returns whatever is currently consented — meaning adding these scopes
// here does NOT break the live mail/calendar connection until you reconnect.
export const MS_SCOPES =
  "offline_access Mail.Read Calendars.Read User.Read OnlineMeetings.Read OnlineMeetingTranscript.Read.All";

function requiredEnv() {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Microsoft Graph env vars missing (MS_CLIENT_ID / MS_CLIENT_SECRET / MS_REDIRECT_URI).",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** Build the Microsoft consent URL for the authorization-code flow. */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = requiredEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS_SCOPES,
    state,
    prompt: "select_account",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(
      `Microsoft token error: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim(),
    );
  }
  return json;
}

/** Exchange an auth code for tokens and persist the refresh token for a tenant. */
export async function exchangeCodeAndStore(
  code: string,
  tenantId: string,
): Promise<void> {
  const { clientId, clientSecret, redirectUri } = requiredEnv();
  const tokens = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: MS_SCOPES,
  });
  const supabase = createAdminClient();
  await supabase
    .from("sync_state")
    .update({ ms_refresh_token: tokens.refresh_token ?? null, last_error: null })
    .eq("tenant_id", tenantId);
}

/**
 * Return a valid access token, refreshing on demand. Refresh tokens rotate, so
 * the new one is always persisted. On revocation (invalid_grant) the stored
 * token is cleared so the UI shows "reconnect".
 */
export async function getAccessToken(tenantId: string): Promise<string> {
  const { clientId, clientSecret } = requiredEnv();
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sync_state")
    .select("ms_refresh_token")
    .eq("tenant_id", tenantId)
    .single();
  const refreshToken = data?.ms_refresh_token as string | null | undefined;
  if (!refreshToken) throw new Error("Microsoft is not connected.");

  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      // No `scope` here on purpose: the refresh returns the scopes already
      // consented, so this keeps working before AND after adding new scopes.
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "refresh failed";
    const updates: Record<string, unknown> = { last_error: msg };
    if (msg.includes("invalid_grant")) updates.ms_refresh_token = null;
    await supabase.from("sync_state").update(updates).eq("tenant_id", tenantId);
    throw e;
  }

  if (tokens.refresh_token) {
    await supabase
      .from("sync_state")
      .update({ ms_refresh_token: tokens.refresh_token })
      .eq("tenant_id", tenantId);
  }
  return tokens.access_token;
}

type GraphRecipient = { emailAddress?: { name?: string; address?: string } };
export type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isDraft?: boolean;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
};

const MSG_SELECT =
  "id,subject,bodyPreview,receivedDateTime,isDraft,from,toRecipients,ccRecipients";

async function graphGet<T>(
  path: string,
  accessToken: string,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "2");
    await new Promise((r) => setTimeout(r, (retry + 1) * 1000));
    return graphGet<T>(path, accessToken, extraHeaders);
  }
  if (!res.ok) {
    throw new Error(`Graph ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function searchSubject(
  accessToken: string,
  phrase: string,
  maxPages = 6,
): Promise<GraphMessage[]> {
  const search = encodeURIComponent(`"subject:${phrase}"`);
  // $search can't be date-sorted, so page deep to reach older threads.
  const out: GraphMessage[] = [];
  let path: string | undefined =
    `/me/messages?$search=${search}&$select=${MSG_SELECT}&$top=100`;
  for (let page = 0; page < maxPages && path; page++) {
    const url: string = path;
    const data = await graphGet<{
      value?: GraphMessage[];
      "@odata.nextLink"?: string;
    }>(url, accessToken);
    out.push(...(data.value ?? []));
    path = data["@odata.nextLink"]?.replace(
      /^https:\/\/graph\.microsoft\.com\/v1\.0/,
      "",
    );
  }
  return out.filter((m) => !m.isDraft); // never surface drafts
}

/** Find messages with "catch up" / "catchup" in the subject, deduped by id. */
export async function searchCatchUps(
  accessToken: string,
): Promise<GraphMessage[]> {
  const [a, b] = await Promise.all([
    searchSubject(accessToken, "catch up"),
    searchSubject(accessToken, "catchup"),
  ]);
  const byId = new Map<string, GraphMessage>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()];
}

const DELTA_SELECT =
  "id,subject,receivedDateTime,from,toRecipients,ccRecipients";

/** Starting delta URL for a mail folder (inbox / sentitems). */
export function deltaStartUrl(folder: "inbox" | "sentitems"): string {
  return `/me/mailFolders/${folder}/messages/delta?$select=${DELTA_SELECT}`;
}

export type DeltaResult = { messages: GraphMessage[]; deltaLink: string | null };

/**
 * Follow a delta / nextLink chain, collecting messages until the deltaLink
 * (the bookmark for next time) is returned.
 */
export async function deltaMessages(
  accessToken: string,
  startUrl: string,
  maxPages = 25,
): Promise<DeltaResult> {
  let url: string | undefined = startUrl;
  const messages: GraphMessage[] = [];
  let deltaLink: string | null = null;
  for (let page = 0; page < maxPages && url; page++) {
    const current: string = url;
    const path = current.replace(
      /^https:\/\/graph\.microsoft\.com\/v1\.0/,
      "",
    );
    const data = await graphGet<{
      value?: GraphMessage[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(path, accessToken);
    messages.push(...(data.value ?? []));
    if (data["@odata.deltaLink"]) {
      deltaLink = data["@odata.deltaLink"];
      url = undefined;
    } else {
      url = data["@odata.nextLink"];
    }
  }
  return { messages, deltaLink };
}

export type GraphMessageBody = GraphMessage & {
  body?: { contentType?: string; content?: string };
  webLink?: string;
};

export type GraphEvent = {
  id: string;
  subject?: string;
  webLink?: string;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string };
  location?: { displayName?: string };
  attendees?: { emailAddress?: { name?: string; address?: string } }[];
};

/** Fetch calendar events in a window (times returned in UTC). */
export async function fetchCalendar(
  accessToken: string,
  startISO: string,
  endISO: string,
  maxPages = 15,
): Promise<GraphEvent[]> {
  const select =
    "id,subject,webLink,isCancelled,isOnlineMeeting,onlineMeeting,start,end,location,attendees";
  let path: string | undefined = `/me/calendarView?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}&$select=${select}&$top=100`;
  const out: GraphEvent[] = [];
  for (let page = 0; page < maxPages && path; page++) {
    const current: string = path;
    const data = await graphGet<{
      value?: GraphEvent[];
      "@odata.nextLink"?: string;
    }>(current, accessToken, { Prefer: 'outlook.timezone="UTC"' });
    out.push(...(data.value ?? []));
    path = data["@odata.nextLink"]?.replace(
      /^https:\/\/graph\.microsoft\.com\/v1\.0/,
      "",
    );
  }
  return out;
}

/**
 * Turn a Teams WEBVTT transcript into readable "Speaker: text" lines, dropping
 * cue numbers, timestamps and markup.
 */
function vttToText(vtt: string): string {
  const out: string[] = [];
  let lastSpeaker = "";
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (
      !line ||
      line === "WEBVTT" ||
      line.startsWith("NOTE") ||
      line.includes("-->") ||
      /^\d+$/.test(line)
    ) {
      continue;
    }
    const m = line.match(/^<v\s+([^>]+)>(.*?)<\/v>$/);
    if (m) {
      const speaker = m[1].trim();
      const text = m[2].replace(/<[^>]+>/g, "").trim();
      if (speaker !== lastSpeaker) {
        out.push(`${speaker}: ${text}`);
        lastSpeaker = speaker;
      } else {
        out.push(text);
      }
    } else {
      out.push(line.replace(/<[^>]+>/g, "").trim());
    }
  }
  return out.join("\n").slice(0, 20000);
}

/**
 * Pull the latest transcript text for a Teams meeting identified by its join
 * URL. Returns null on any problem (scope not granted yet, not an online
 * meeting, transcription wasn't on, no transcript) so callers just skip it.
 * Needs OnlineMeetings.Read + OnlineMeetingTranscript.Read.All (admin consent).
 */
export async function fetchMeetingTranscript(
  accessToken: string,
  joinUrl: string,
): Promise<string | null> {
  try {
    const filter = encodeURIComponent(`JoinWebUrl eq '${joinUrl}'`);
    const mtg = await graphGet<{ value?: { id: string }[] }>(
      `/me/onlineMeetings?$filter=${filter}`,
      accessToken,
    );
    const meetingId = mtg.value?.[0]?.id;
    if (!meetingId) return null;

    const tr = await graphGet<{
      value?: { id: string; createdDateTime?: string }[];
    }>(`/me/onlineMeetings/${meetingId}/transcripts`, accessToken);
    const transcripts = (tr.value ?? []).sort((a, b) =>
      (a.createdDateTime ?? "") < (b.createdDateTime ?? "") ? 1 : -1,
    );
    if (!transcripts.length) return null;

    const res = await fetch(
      `${GRAPH}/me/onlineMeetings/${meetingId}/transcripts/${transcripts[0].id}/content?$format=text/vtt`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const text = vttToText(await res.text());
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/** Fetch recent messages involving a given address, including bodies. */
export async function fetchThreadWith(
  accessToken: string,
  email: string,
  top = 15,
): Promise<GraphMessageBody[]> {
  const search = encodeURIComponent(`"${email}"`);
  const select =
    "id,subject,from,toRecipients,receivedDateTime,isDraft,bodyPreview,body,webLink";
  const path = `/me/messages?$search=${search}&$select=${select}&$top=${top}`;
  const data = await graphGet<{ value: GraphMessageBody[] }>(path, accessToken);
  return (data.value ?? []).filter((m) => !m.isDraft); // exclude drafts
}
