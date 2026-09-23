// Brix Chat — sla-checker
//
// Service_role only. Run on a schedule (e.g. every 15 minutes via the Edge
// Function cron trigger — see supabase/README.md).
//
// What it does:
//   1. Finds tickets that are still open, have an sla_due in the past, and are
//      not yet marked breached.
//   2. Marks them sla_breached = true.
//   3. Fires a `ticket.sla_breached` event per ticket through webhook-dispatcher.
//   4. Optionally emails the assignee (SLA_EMAIL_ASSIGNEE=true; needs a member
//      email on record and send-email configured).

import {
  HttpError,
  errorResponse,
  handleCors,
  invokeFunction,
  json,
  requireServiceRole,
  serviceClient,
} from "../_shared/http.ts";

type Ticket = {
  id: string;
  property_id: string | null;
  subject: string;
  priority: string;
  requester_name: string | null;
  requester_email: string | null;
  assignee_id: string | null;
  sla_due: string;
  created_at: string;
};

async function handler(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method === "GET") {
      return json({ ok: true, function: "sla-checker" });
    }
    if (req.method !== "POST") {
      return json({ error: { code: "method_not_allowed", message: "Use POST" } }, 405);
    }
    requireServiceRole(req);

    const client = serviceClient();
    const now = new Date().toISOString();

    const { data: tickets, error } = await client
      .from("tickets")
      .select("id, property_id, subject, priority, requester_name, requester_email, assignee_id, sla_due, created_at")
      .eq("sla_breached", false)
      .not("sla_due", "is", null)
      .lte("sla_due", now)
      .not("status", "in", '("resolved","closed","spam")')
      .order("sla_due", { ascending: true })
      .limit(200);
    if (error) throw new HttpError(500, "tickets_load_failed", error.message);

    const breached: Array<{ ticket_id: string; event: string; email: string }> = [];

    for (const t of (tickets ?? []) as Ticket[]) {
      const overdueMinutes = Math.max(
        0,
        Math.round((Date.now() - new Date(t.sla_due).getTime()) / 60000),
      );

      const { error: updErr } = await client
        .from("tickets")
        .update({ sla_breached: true, updated_at: new Date().toISOString() })
        .eq("id", t.id)
        .eq("sla_breached", false); // idempotent: two runners can't double-fire
      if (updErr) {
        console.error(JSON.stringify({ fn: "sla-checker", ticket: t.id, stage: "mark", error: updErr.message }));
        continue;
      }

      // Fire the webhook event via the dispatcher (best-effort; delivery log records failures).
      let eventStatus = "queued";
      try {
        const res = await invokeFunction("webhook-dispatcher", {
          event: "ticket.sla_breached",
          property_id: t.property_id,
          data: {
            ticket_id: t.id,
            subject: t.subject,
            priority: t.priority,
            requester_name: t.requester_name,
            requester_email: t.requester_email,
            sla_due: t.sla_due,
            overdue_minutes: overdueMinutes,
          },
        });
        if (!res.ok) eventStatus = `dispatcher_http_${res.status}`;
      } catch (e) {
        eventStatus = `dispatcher_error: ${e instanceof Error ? e.message : String(e)}`;
      }

      // Optional email to the assignee.
      let emailStatus = "skipped";
      if (Deno.env.get("SLA_EMAIL_ASSIGNEE") === "true" && t.assignee_id) {
        try {
          const { data: member } = await client
            .from("members")
            .select("email, display_name")
            .eq("id", t.assignee_id)
            .maybeSingle();
          const addr = (member as { email?: string | null } | null)?.email?.trim();
          if (addr) {
            const res = await invokeFunction("send-email", {
              to: addr,
              subject: `SLA breached: ${t.subject}`,
              text:
                `Hi ${(member as { display_name?: string })?.display_name ?? "there"},\n\n` +
                `Ticket #${t.id} ("${t.subject}") is ${overdueMinutes} minute(s) past its SLA deadline (${t.sla_due}).\n` +
                `Priority: ${t.priority}. Please pick it up.\n\n— Brix Chat`,
            });
            emailStatus = res.ok ? "sent" : `email_http_${res.status}`;
          } else {
            emailStatus = "no_assignee_email";
          }
        } catch (e) {
          emailStatus = `email_error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }

      breached.push({ ticket_id: t.id, event: eventStatus, email: emailStatus });
      console.log(JSON.stringify({ fn: "sla-checker", ticket: t.id, overdueMinutes, event: eventStatus, email: emailStatus }));
    }

    return json({ data: { checked: (tickets ?? []).length, breached } });
  } catch (err) {
    return errorResponse(err);
  }
}

Deno.serve(handler);
