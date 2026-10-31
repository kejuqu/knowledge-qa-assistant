import ExcelJS from "exceljs";
import { ImportError, MAX_EMPLOYEES, validateEmployees } from "./team-import-input";

// 在解压前检查 ZIP 中央目录，限制解压总量，拒绝 ZIP64 / 多卷文件。
function checkArchive(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt32LE(end + 4) !== 0) throw new ImportError("无效的 XLSX 文件");
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16), expanded = 0;
  if (count > 200 || buffer.readUInt16LE(end + 8) !== count) throw new ImportError("Excel 文件过于复杂");
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || buffer.readUInt32LE(pos) !== 0x02014b50) throw new ImportError("无效的 XLSX 文件");
    expanded += buffer.readUInt32LE(pos + 24);
    if (expanded > 8 * 1024 * 1024) throw new ImportError("Excel 解压后不能超过 8 MB", 413);
    pos += 46 + buffer.readUInt16LE(pos + 28) + buffer.readUInt16LE(pos + 30) + buffer.readUInt16LE(pos + 32);
  }
  if (pos !== end) throw new ImportError("不支持此 XLSX 文件格式");
}

export async function parseEmployeeExcel(bytes: Uint8Array) {
  checkArchive(bytes);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer); }
  catch { throw new ImportError("无法读取 Excel，请使用未加密的 .xlsx 模板"); }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount > MAX_EMPLOYEES + 1 || sheet.columnCount > 3) throw new ImportError(`请使用模板，最多 ${MAX_EMPLOYEES} 行员工数据`);
  const headers = ["姓名", "邮箱", "初始密码"];
  if (headers.some((header, i) => sheet.getRow(1).getCell(i + 1).text.trim() !== header)) throw new ImportError("表头须为：姓名、邮箱、初始密码（按模板顺序）");
  const rows: { name: string; email: string; password: string }[] = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const values = headers.map((_, i) => {
      const cell = row.getCell(i + 1);
      if (cell.value !== null && typeof cell.value !== "string") throw new ImportError(`Excel 第 ${number} 行须使用纯文本，请勿使用公式或数字单元格`);
      return cell.text;
    });
    if (values.every((value) => !value.trim())) return;
    rows.push({ name: values[0]!, email: values[1]!, password: values[2]! });
  });
  return validateEmployees(rows);
}

export async function employeeTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("员工导入");
  sheet.columns = [{ header: "姓名", key: "name", width: 22 }, { header: "邮箱", key: "email", width: 36 }, { header: "初始密码", key: "password", width: 28 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(3).numFmt = "@";
  return workbook.xlsx.writeBuffer();
}
