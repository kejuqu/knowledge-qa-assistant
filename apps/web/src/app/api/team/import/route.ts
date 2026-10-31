import { importActor } from "@/lib/team-api-key";
import { importEmployees } from "@/lib/team-import";
import {
  ImportError,
  readImportBody,
  validateEmployees,
} from "@/lib/team-import-input";
import { parseEmployeeExcel } from "@/lib/team-import-excel";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await importActor(request);
    const bytes = await readImportBody(request);
    const contentType = request.headers.get("content-type") ?? "";
    let employees;
    if (contentType.split(";")[0]?.trim() === "application/json") {
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new ImportError("无效的 JSON");
      }
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).some((key) => key !== "employees")
      )
        throw new ImportError("请求仅支持 employees 字段，租户由当前身份确定");
      employees = validateEmployees(body.employees);
    } else if (
      contentType.split(";")[0]?.trim() ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      employees = await parseEmployeeExcel(bytes);
    } else
      throw new ImportError("请上传 .xlsx 文件或使用 application/json", 415);
    return Response.json(await importEmployees(actor, employees), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ImportError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error(
      "Employee import failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      { error: "导入失败，本批次未保存，请重试" },
      { status: 500 },
    );
  }
}
