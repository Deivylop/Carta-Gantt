import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("MY_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("MY_SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PARAM_LABELS: Record<string, string> = {
  devPct:   "% Desv. Física",
  varStart: "Var. Inicio (días)",
  varEnd:   "Var. Fin (días)",
  varDur:   "Var. Duración (días)",
};

const SEV_COLOR: Record<string, string> = {
  "Crítica": "#dc2626",
  "Alta":    "#ea580c",
  "Media":   "#ca8a04",
  "Baja":    "#2563eb",
};

const SEV_EMOJI: Record<string, string> = {
  "Crítica": "🔴",
  "Alta":    "🟠",
  "Media":   "🟡",
  "Baja":    "🔵",
};

interface AlertRow {
  actId: string;
  actName: string;
  param: string;
  value: number;
  severity: string;
  operator: string;
  limit_value: number;
  valActual?: string;
  valBaseline?: string;
}

const COMPARISON_LABELS: Record<string, { actual: string; baseline: string }> = {
  devPct:   { actual: "% Avance",    baseline: "% Prog." },
  varStart: { actual: "Comienzo",    baseline: "Comienzo LB" },
  varEnd:   { actual: "Fin",         baseline: "Fin LB" },
  varDur:   { actual: "Duración",    baseline: "Duración LB" },
};

function buildTableEmail(projectName: string, alerts: AlertRow[], reportDate: string): string {
  const rows = alerts.map(a => {
    const color = SEV_COLOR[a.severity] ?? "#6b7280";
    const emoji = SEV_EMOJI[a.severity] ?? "⚪";
    const badgeStyle = `display:inline-block;padding:2px 8px;border-radius:12px;background:${color}20;color:${color};font-weight:700;font-size:11px;border:1px solid ${color}`;
    const valueStyle = `color:${color};font-weight:700`;
    const cmpLabels = COMPARISON_LABELS[a.param];
    const actualCell  = a.valActual  ? `<td style="padding:8px 12px;text-align:center;color:#374151;font-size:12px">${a.valActual}</td>`
                                     : `<td style="padding:8px 12px;text-align:center;color:#9ca3af">-</td>`;
    const baselineCell = a.valBaseline ? `<td style="padding:8px 12px;text-align:center;color:#6b7280;font-size:12px">${a.valBaseline}</td>`
                                       : `<td style="padding:8px 12px;text-align:center;color:#9ca3af">-</td>`;
    return `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px 12px;font-weight:600;color:#111">${a.actId}</td>
        <td style="padding:8px 12px;color:#374151">${a.actName}</td>
        <td style="padding:8px 12px;color:#6b7280;font-size:12px">${PARAM_LABELS[a.param] ?? a.param}</td>
        ${actualCell}
        ${baselineCell}
        <td style="padding:8px 12px;text-align:center"><span style="${valueStyle}">${a.value.toFixed(1)}</span></td>
        <td style="padding:8px 12px;text-align:center;color:#6b7280;font-size:12px">${a.operator} ${a.limit_value}</td>
        <td style="padding:8px 12px;text-align:center"><span style="${badgeStyle}">${emoji} ${a.severity}</span></td>
      </tr>`;
  }).join("");

  const critCount  = alerts.filter(a => a.severity === "Crítica").length;
  const altaCount  = alerts.filter(a => a.severity === "Alta").length;
  const mediaCount = alerts.filter(a => a.severity === "Media").length;
  const bajaCount  = alerts.filter(a => a.severity === "Baja").length;

  const summaryItems = [
    critCount  > 0 ? `<span style="color:#dc2626;font-weight:700">🔴 ${critCount} Crítica${critCount > 1 ? "s" : ""}</span>` : "",
    altaCount  > 0 ? `<span style="color:#ea580c;font-weight:700">🟠 ${altaCount} Alta${altaCount > 1 ? "s" : ""}</span>` : "",
    mediaCount > 0 ? `<span style="color:#ca8a04;font-weight:700">🟡 ${mediaCount} Media${mediaCount > 1 ? "s" : ""}</span>` : "",
    bajaCount  > 0 ? `<span style="color:#2563eb;font-weight:700">🔵 ${bajaCount} Baja${bajaCount > 1 ? "s" : ""}</span>` : "",
  ].filter(Boolean).join("&nbsp;&nbsp;|&nbsp;&nbsp;");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
  <div style="max-width:700px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#991b1b,#dc2626);padding:24px 32px;color:#fff">
      <div style="font-size:13px;opacity:.8;margin-bottom:4px">SISTEMA DE CONTROL DE PROYECTOS</div>
      <h1 style="margin:0;font-size:22px;font-weight:700">⚠️ Informe de Alertas de Umbrales</h1>
      <div style="margin-top:8px;font-size:14px;opacity:.9">
        Proyecto: <strong>${projectName}</strong> &nbsp;·&nbsp; Fecha: ${reportDate}
      </div>
    </div>

    <!-- Resumen -->
    <div style="background:#fef2f2;padding:14px 32px;border-bottom:1px solid #fecaca;font-size:13px">
      <strong>Resumen:</strong> &nbsp; ${summaryItems} &nbsp;&nbsp;
      <span style="color:#6b7280">— Total: <strong>${alerts.length}</strong> actividad${alerts.length > 1 ? "es" : ""} con incumplimiento</span>
    </div>

    <!-- Tabla -->
    <div style="padding:24px 32px">
      <p style="margin:0 0 16px;color:#374151;font-size:14px">
        Las siguientes actividades superaron uno o más umbrales de control:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb">
            <th style="padding:10px 12px;text-align:left;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">ID</th>
            <th style="padding:10px 12px;text-align:left;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">Actividad</th>
            <th style="padding:10px 12px;text-align:left;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">Indicador</th>
            <th style="padding:10px 12px;text-align:center;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">Actual</th>
            <th style="padding:10px 12px;text-align:center;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">Plan / LB</th>
            <th style="padding:10px 12px;text-align:center;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">Desviación</th>
            <th style="padding:10px 12px;text-align:center;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">Umbral</th>
            <th style="padding:10px 12px;text-align:center;color:#6b7280;font-weight:600;text-transform:uppercase;font-size:11px">Severidad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center">
      Por favor, revisa el sistema y aplica las acciones de mitigación correspondientes.<br>
      Este mensaje fue generado automáticamente por el Sistema de Control de Proyectos.
    </div>

  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  // Manejar preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const payload = await req.json();

    if (!RESEND_API_KEY)            throw new Error("Falta RESEND_API_KEY");
    if (!SUPABASE_URL)              throw new Error("Falta MY_SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta MY_SUPABASE_SERVICE_ROLE_KEY");

    // ── Detectar formato del payload ─────────────────────────────
    // Formato A (ThresholdsPage directo): { project_id, alerts: AlertRow[] }
    // Formato B (trigger legacy):          { record: { project_id, ... } }
    let projectId: string;
    let alerts: AlertRow[];

    if (payload.alerts && Array.isArray(payload.alerts)) {
      projectId = payload.project_id;
      alerts = payload.alerts;
    } else {
      const record = payload.record || payload;
      if (!record?.project_id) {
        return new Response(JSON.stringify({ error: "Payload inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      projectId = record.project_id;
      const desc: string = record.description ?? "";
      const sevMatch = desc.match(/\[(Crítica|Alta|Media|Baja)\]/);
      alerts = [{
        actId:       record.task_id ?? "",
        actName:     desc.replace(/^\[[^\]]+\]\s*/, "").split(":")[0] ?? "",
        param:       "devPct",
        value:       0,
        severity:    sevMatch?.[1] ?? "Crítica",
        operator:    "",
        limit_value: 0,
      }];
    }

    if (!projectId || alerts.length === 0) {
      return new Response(JSON.stringify({ error: "Sin alertas que enviar" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 1. Datos del proyecto ────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: project, error: projectError } = await supabase
      .from("gantt_projects")
      .select("projname, empresa_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error(`Error al obtener proyecto: ${projectError?.message ?? "No encontrado"}`);
    }

    const projectName = project.projname ?? "Sin nombre";

    // ── 2. Destinatarios de la empresa ───────────────────────────
    const { data: users, error: usersError } = await supabase
      .from("usuarios_empresas")
      .select("email")
      .eq("empresa_id", project.empresa_id)
      .not("email", "is", null);

    if (usersError) throw new Error(`Error al obtener usuarios: ${usersError.message}`);

    let emailList: string[] = (users ?? []).map((u: any) => u.email).filter(Boolean);
    if (emailList.length === 0) {
      emailList = [Deno.env.get("ADMIN_EMAIL") || "admin@tudominio.com"];
    }

    // ── 3. Construir y enviar UN correo con la tabla ─────────────
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
    const reportDate = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
    const critCount  = alerts.filter(a => a.severity === "Crítica").length;
    const subjectSuffix = critCount > 0
      ? `${critCount} alerta${critCount > 1 ? "s" : ""} crítica${critCount > 1 ? "s" : ""}`
      : `${alerts.length} alerta${alerts.length > 1 ? "s" : ""}`;
    const htmlBody = buildTableEmail(projectName, alerts, reportDate);

    const results = await Promise.allSettled(
      emailList.map(email =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from:    `Control de Proyectos <${FROM_EMAIL}>`,
            to:      [email],
            subject: `⚠️ ${subjectSuffix} — Proyecto: ${projectName}`,
            html:    htmlBody,
          }),
        }).then(r => r.json())
      )
    );

    const successes = results.filter(r => r.status === "fulfilled").length;
    const failures  = results.filter(r => r.status === "rejected").length;
    console.log(`Emails enviados: ${successes} OK, ${failures} fallidos. Destinatarios: ${emailList.join(", ")}`);

    return new Response(
      JSON.stringify({ success: true, sent: successes, failed: failures, recipients: emailList }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Error en send-issue-email:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
