import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://chatter22.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function headersFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://chatter22.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headersFor(req), "Content-Type": "application/json" },
  });
}

function readKeyMap(name: string, legacyName: string): string {
  const raw = Deno.env.get(name);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.default) return parsed.default;
    } catch {
      // Fall through to the legacy environment variable.
    }
  }
  return Deno.env.get(legacyName) ?? "";
}

async function collectStoragePaths(client: ReturnType<typeof createClient>, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  const paths: string[] = [];
  let offset = 0;
  const pageSize = 100;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: pageSize, offset });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id || entry.metadata) {
        paths.push(path);
      } else {
        paths.push(...await collectStoragePaths(client, bucket, path, depth + 1));
      }
    }
    if (entries.length < pageSize) break;
    offset += pageSize;
  }
  return paths;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = readKeyMap("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = readKeyMap("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !publishableKey || !secretKey) {
      console.error("Supabase function environment is missing required API configuration.");
      return json(req, { error: "Admin service is not configured." }, 500);
    }
    if (!authorization.startsWith("Bearer ")) {
      return json(req, { error: "Authentication required." }, 401);
    }

    const caller = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: callerData, error: callerError } = await caller.auth.getUser();
    const callerUser = callerData?.user;
    if (callerError || !callerUser) {
      return json(req, { error: "Your session is invalid or has expired. Sign in again." }, 401);
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: adminRole, error: roleError } = await admin
      .from("chatter_admins")
      .select("user_id")
      .eq("user_id", callerUser.id)
      .maybeSingle();
    if (roleError) {
      console.error("Admin-role lookup failed:", roleError.message);
      return json(req, { error: "Could not verify administrator access." }, 500);
    }
    if (!adminRole) return json(req, { error: "Administrator access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list_users") {
      const allUsers = [];
      const pageSize = 500;
      let page = 1;
      while (page <= 20) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
        if (error) throw error;
        const batch = data?.users ?? [];
        allUsers.push(...batch);
        if (batch.length < pageSize) break;
        page += 1;
      }

      const userIds = allUsers.map((u) => u.id);
      const [profileResult, adminResult, auditResult] = await Promise.all([
        userIds.length
          ? admin.from("profiles").select("id,display_name,username,avatar_url,created_at").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? admin.from("chatter_admins").select("user_id").in("user_id", userIds)
          : Promise.resolve({ data: [], error: null }),
        admin.from("chatter_admin_audit")
          .select("id,actor_email,action,target_email,created_at,details")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (adminResult.error) throw adminResult.error;
      if (auditResult.error) throw auditResult.error;

      const profileMap = new Map((profileResult.data ?? []).map((p) => [p.id, p]));
      const adminIds = new Set((adminResult.data ?? []).map((a) => a.user_id));
      const users = allUsers.map((u) => {
        const p = profileMap.get(u.id) ?? {};
        return {
          id: u.id,
          email: u.email ?? "",
          display_name: p.display_name ?? u.user_metadata?.display_name ?? "New member",
          username: p.username ?? u.user_metadata?.username ?? "",
          avatar_url: p.avatar_url ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at,
          is_admin: adminIds.has(u.id),
        };
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return json(req, {
        users,
        audit: auditResult.data ?? [],
        stats: {
          total: users.length,
          verified: users.filter((u) => Boolean(u.email_confirmed_at)).length,
          joined_last_7_days: users.filter((u) => new Date(u.created_at).getTime() >= weekAgo).length,
          admin_count: users.filter((u) => u.is_admin).length,
          list_truncated: allUsers.length >= pageSize * 20,
        },
      });
    }

    if (action === "delete_user") {
      const targetUserId = String(body?.userId ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
        return json(req, { error: "A valid user ID is required." }, 400);
      }
      if (targetUserId === callerUser.id) {
        return json(req, { error: "You cannot delete the account you are currently using." }, 400);
      }
      const { data: targetRole, error: targetRoleError } = await admin
        .from("chatter_admins")
        .select("user_id")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (targetRoleError) throw targetRoleError;
      if (targetRole) return json(req, { error: "Administrator accounts are protected from deletion in this panel." }, 403);

      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
      if (targetError || !targetData?.user) {
        return json(req, { error: "That account no longer exists." }, 404);
      }
      const targetEmail = targetData.user.email ?? "";

      // Remove the target account's own uploads from the two Chatter media buckets.
      const cleanup = { profile_media: true, chat_media: true };
      for (const [bucket, key] of [["profile-media", "profile_media"], ["chat-media", "chat_media"]] as const) {
        try {
          const paths = await collectStoragePaths(admin, bucket, targetUserId);
          for (let i = 0; i < paths.length; i += 100) {
            const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
            if (error) throw error;
          }
        } catch (cleanupError) {
          cleanup[key] = false;
          console.error(`Could not fully clean ${bucket} for ${targetUserId}:`, cleanupError);
        }
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId, false);
      if (deleteError) throw deleteError;

      const { error: auditError } = await admin.from("chatter_admin_audit").insert({
        actor_user_id: callerUser.id,
        actor_email: callerUser.email ?? "",
        action: "delete_user",
        target_user_id: targetUserId,
        target_email: targetEmail,
        details: { media_cleanup: cleanup },
      });
      if (auditError) console.error("Account deleted, but audit event could not be written:", auditError.message);

      return json(req, { success: true, deletedUserId: targetUserId, mediaCleanup: cleanup, auditLogged: !auditError });
    }

    return json(req, { error: "Unsupported admin action." }, 400);
  } catch (error) {
    console.error("Chatter admin function error:", error);
    return json(req, { error: error instanceof Error ? error.message : "Unexpected admin error." }, 500);
  }
});
