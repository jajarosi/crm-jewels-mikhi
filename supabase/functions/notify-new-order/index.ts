// ============================================================
//  CRM Michael Bloch — Edge Function : notify-new-order
//
//  Déclenchée par un Database Webhook sur INSERT dans `submissions`.
//  Appelle l'API OneSignal, qui pousse la notification sur l'iPhone
//  du patron — même app fermée / téléphone verrouillé.
//
//  ── Déploiement ────────────────────────────────────────────
//    supabase functions deploy notify-new-order --no-verify-jwt
//
//    --no-verify-jwt : le webhook n'envoie pas de JWT Supabase ;
//    on protège la fonction avec notre propre secret (voir plus bas).
//
//  ── Secrets à définir (une fois) ───────────────────────────
//    supabase secrets set ONESIGNAL_APP_ID=d68d01ac-33e8-4b7a-acf0-ae00d3eced09
//    supabase secrets set ONESIGNAL_REST_API_KEY=os_v2_app_xxxxxxxx…
//    supabase secrets set WEBHOOK_SECRET=<une longue chaîne aléatoire>
//
//    La REST API Key est dans OneSignal → Settings → Keys & IDs.
//    WEBHOOK_SECRET : invente-la, tu la recolleras dans setup-onesignal.sql.
// ============================================================

const ONESIGNAL_APP_ID      = Deno.env.get("ONESIGNAL_APP_ID")!;
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
const WEBHOOK_SECRET        = Deno.env.get("WEBHOOK_SECRET")!;

const APP_URL = "https://jewels-michi-crm.web.app";

const PATH_LABELS: Record<string, string> = {
  custom:     "עיצוב אישי",
  upload:     "תמונת השראה",
  collection: "מהקולקציה",
};

// Forme du corps envoyé par un Database Webhook Supabase
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  // 1. Seule notre base doit pouvoir déclencher un push.
  //    Sans ce contrôle, n'importe qui appelant l'URL enverrait une notif.
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // 2. On ne réagit qu'aux nouvelles commandes.
  if (payload.type !== "INSERT" || !payload.record) {
    return new Response("ignored", { status: 200 });
  }

  const r = payload.record as {
    client_name?: string;
    client_phone?: string;
    path?: string;
    creation_name?: string | null;
  };

  // 3. Construction du message (hébreu).
  let pathLabel = PATH_LABELS[r.path ?? ""] ?? (r.path ?? "");
  if (r.path === "collection" && r.creation_name) {
    pathLabel += ` — ${r.creation_name}`;
  }

  const heading = "🔔 הזמנה חדשה";
  const body =
    `${r.client_name ?? "לקוח"} · ${pathLabel}` +
    (r.client_phone ? `\n${r.client_phone}` : "");

  // 4. Appel OneSignal. On cible le seul appareil taggué "patron".
  const osRes = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // format actuel de l'API : « Key <REST_API_KEY> »
      "Authorization": `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      filters: [
        { field: "tag", key: "role", relation: "=", value: "patron" },
      ],
      // "en" = langue par défaut ; on y met l'hébreu pour un affichage garanti
      headings: { en: heading },
      contents: { en: body },
      url: APP_URL,
      // regroupe les notifs de commandes sur iOS plutôt que de les empiler
      thread_id: "new-orders",
    }),
  });

  const osText = await osRes.text();

  if (!osRes.ok) {
    console.error("OneSignal error", osRes.status, osText);
    // 200 quand même : ne jamais faire échouer le webhook (donc l'INSERT).
    return new Response(`onesignal ${osRes.status}: ${osText}`, { status: 200 });
  }

  // Cas fréquent : réponse 200 mais "recipients: 0" → personne d'abonné.
  console.log("OneSignal ok", osText);
  return new Response(osText, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
