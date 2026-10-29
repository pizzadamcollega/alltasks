import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getDaySummary } from "@/features/day-close/queries";
import { DaySummaryPdf } from "@/features/day-close/pdf";

export const runtime = "nodejs";

/**
 * D-49 "PDF indir". Runs under the caller's own session, so RLS decides what
 * the summary contains; only a manager of the branch gets a file at all.
 */
export async function GET(request: Request, { params }: { params: Promise<{ branch: string }> }) {
  const { branch: branchSlug } = await params;
  const day = new URL(request.url).searchParams.get("gun") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Response("Geçersiz gün", { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return new Response("Giriş gerekli", { status: 401 });

  const { data: branch } = await supabase.from("branches").select("id, name").eq("slug", branchSlug).maybeSingle();
  if (!branch) return new Response("Şube bulunamadı", { status: 404 });
  const { data: isManager } = await supabase.rpc("is_branch_manager", { p_branch: branch.id });
  if (!isManager) return new Response("Bu işlem için yetkin yok", { status: 403 });

  const summary = await getDaySummary(supabase, branch, day);
  const pdf = await renderToBuffer(createElement(DaySummaryPdf, { summary }) as Parameters<typeof renderToBuffer>[0]);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="gun-sonu-${branchSlug}-${day}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
