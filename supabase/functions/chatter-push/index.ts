import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function base64UrlToBytes(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function normaliseBase64Url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function convertVapidKeysToJwk(publicKeyValue: string, privateKeyValue: string) {
  const publicBytes = base64UrlToBytes(publicKeyValue);
  const privateBytes = base64UrlToBytes(privateKeyValue);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Invalid VAPID key pair. Expected a P-256 public key and 32-byte private key.");
  }
  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const d = bytesToBase64Url(privateBytes);
  return {
    publicKey: {
      kty: "EC", crv: "P-256", alg: "ES256", x, y,
      key_ops: ["verify"], ext: true,
    },
    privateKey: {
      kty: "EC", crv: "P-256", alg: "ES256", x, y, d,
      key_ops: ["sign"], ext: true,
    },
  };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = request.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: "Push sender is not configured or the request is unauthenticated." }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json({ error: "A valid signed-in session is required." }, 401);

  let body: { notificationId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }
  const notificationId = String(body?.notificationId || "");
  if (!/^[0-9a-f-]{36}$/i.test(notificationId)) {
    return json({ error: "A valid notification ID is required." }, 400);
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) {
    return json({ error: "Push is waiting for VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY Edge Function secrets." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: notice, error: noticeError } = await admin
    .from("chatter_notifications")
    .select("id,recipient_user_id,actor_user_id,notification_type,target_type,target_id,body")
    .eq("id", notificationId)
    .maybeSingle();

  if (noticeError) {
    console.error("Notification lookup failed:", noticeError.message);
    return json({ error: "Could not load the notification." }, 500);
  }
  if (!notice) return json({ error: "Notification not found." }, 404);
  if (notice.actor_user_id !== user.id) {
    return json({ error: "You can only trigger a push for your own notification." }, 403);
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("chatter_push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", notice.recipient_user_id);

  if (subscriptionsError) {
    console.error("Subscription lookup failed:", subscriptionsError.message);
    return json({ error: "Could not load push subscriptions." }, 500);
  }
  if (!subscriptions?.length) return json({ success: true, sent: 0, message: "The recipient has no push-enabled devices." });

  const { data: actor } = await admin
    .from("profiles")
    .select("display_name,username")
    .eq("id", user.id)
    .maybeSingle();
  const actorName = actor?.display_name || actor?.username || "A Chatter member";
  const isConversation = notice.target_type === "conversation";
  const targetUrl = isConversation
    ? "/?openConversation=" + encodeURIComponent(notice.target_id) + "&reply=1"
    : "/?openTab=posts";
  const payload = {
    title: isConversation ? actorName + " sent you a message" : actorName + " on Chatter",
    body: String(notice.body || "You have a new notification.").slice(0, 180),
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    url: targetUrl,
    actions: isConversation
      ? [{ action: "reply", title: "Reply" }, { action: "open", title: "Open chat" }]
      : [{ action: "open", title: "Open" }],
  };

  try {
    const vapidKeys = await webpush.importVapidKeys(convertVapidKeysToJwk(publicKey, privateKey), { extractable: false });
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: Deno.env.get("VAPID_SUBJECT") || "mailto:notifications@chatter22.vercel.app",
      vapidKeys,
    });

    const results = await Promise.all(subscriptions.map(async row => {
      try {
        const subscriber = appServer.subscribe({
          endpoint: row.endpoint,
          keys: {
            p256dh: normaliseBase64Url(row.p256dh),
            auth: normaliseBase64Url(row.auth),
          },
        });
        await subscriber.pushTextMessage(JSON.stringify(payload), {});
        return { id: row.id, sent: true };
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number; status?: number })?.statusCode ||
          (error as { status?: number })?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("chatter_push_subscriptions").delete().eq("id", row.id);
        }
        console.warn("Push delivery failed for one device:", error);
        return { id: row.id, sent: false, statusCode: statusCode || null };
      }
    }));
    return json({
      success: true,
      sent: results.filter(result => result.sent).length,
      failed: results.filter(result => !result.sent).length,
    });
  } catch (error) {
    console.error("Push sender configuration failed:", error);
    return json({ error: "Push could not be sent. Check the VAPID Edge Function secrets." }, 500);
  }
});
