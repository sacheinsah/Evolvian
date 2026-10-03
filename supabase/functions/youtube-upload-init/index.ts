import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshAccessToken() {
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("YOUTUBE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube OAuth secrets are not configured on the server.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    console.error("YouTube token refresh failed", data);
    throw new Error("Unable to authenticate with the Evolvian YouTube channel.");
  }
  return data.access_token as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) return json({ error: "Server configuration is incomplete" }, 500);

    // Validate the caller with Supabase Auth. The YouTube OAuth credentials never reach the browser.
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: auth,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? serviceRole,
      },
    });
    if (!userResponse.ok) return json({ error: "Invalid or expired session" }, 401);
    const user = await userResponse.json();
    if (!user?.id) return json({ error: "Invalid user" }, 401);

    const body = await req.json().catch(() => null);
    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const fileSize = Number(body?.fileSize ?? 0);
    const contentType = String(body?.contentType ?? "").toLowerCase();

    if (!title) return json({ error: "A video title is required" }, 400);
    if (!contentType.startsWith("video/")) return json({ error: "Only video files are supported by this uploader" }, 400);
    if (!Number.isFinite(fileSize) || fileSize <= 0) return json({ error: "Invalid video size" }, 400);
    // Avoid accidentally accepting an HTML/text upload. YouTube itself supports much larger files;
    // this limit is an Evolvian UX guardrail and can be raised later.
    const maxBytes = 512 * 1024 * 1024;
    if (fileSize > maxBytes) return json({ error: "Community videos are limited to 512 MB" }, 413);

    const accessToken = await refreshAccessToken();
    const metadata = {
      snippet: {
        title: `[Evolvian] ${title}`.slice(0, 100),
        description: `${description}\n\nUploaded through Evolvian community.`.slice(0, 5000),
        categoryId: "28",
      },
      status: {
        privacyStatus: "unlisted",
        selfDeclaredMadeForKids: false,
      },
    };

    const initResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": String(fileSize),
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      console.error("YouTube resumable upload init failed", initResponse.status, errorText);
      return json({ error: "YouTube could not start the upload" }, 502);
    }

    const uploadUrl = initResponse.headers.get("location");
    if (!uploadUrl) return json({ error: "YouTube did not return an upload session" }, 502);

    return json({
      uploadUrl,
      provider: "youtube",
      privacyStatus: "unlisted",
      uploadedBy: user.id,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unable to start YouTube upload" }, 500);
  }
});
