import path from "path";
import fs from "fs";
import { PDFParse } from "pdf-parse";

export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
  originalName: string,
): Promise<string> {
  try {
    const ext = path.extname(originalName).toLowerCase();

    if (mimeType === "application/pdf" || ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return (result.text || "").trim();
    }

    if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown" ||
      mimeType === "text/csv" ||
      [".txt", ".md", ".markdown", ".csv"].includes(ext)
    ) {
      return fs.readFileSync(filePath, "utf-8").trim();
    }

    if (
      ext === ".xlsx" || ext === ".xls" ||
      mimeType.includes("spreadsheet") ||
      mimeType === "application/vnd.ms-excel"
    ) {
      const XLSX = (await import("xlsx")).default;
      const wb = XLSX.readFile(filePath);
      return wb.SheetNames.map((name: string) => {
        const ws = wb.Sheets[name];
        return `Sheet: ${name}\n${XLSX.utils.sheet_to_txt(ws)}`;
      }).join("\n\n").trim();
    }

    return "";
  } catch (err) {
    console.error("[extract-text] failed:", originalName, err);
    return "";
  }
}
