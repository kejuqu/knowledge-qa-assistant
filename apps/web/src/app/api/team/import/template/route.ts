import { requireTeamManager } from "@/lib/team-api-key";
import { employeeTemplate } from "@/lib/team-import-excel";
import { ImportError } from "@/lib/team-import-input";

export async function GET() {
  try {
    await requireTeamManager();
    return new Response(new Uint8Array(await employeeTemplate()), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=employees-template.xlsx", "Cache-Control": "no-store",
    } });
  } catch (error) {
    if (error instanceof ImportError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
