import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";
import {
  db,
  knowledgeItemsTable,
  processAttachmentsTable,
  governanceDocumentsTable,
  governanceStandardsTable,
  agentKnowledgeFilesTable,
  aiAgentsTable,
} from "@workspace/db";
import { extractTextFromFile } from "../lib/extract-text.js";
import { embed, hasPgVectorSupport, vecToSql } from "../lib/embeddings.js";

async function embedText(text: string): Promise<string | null> {
  if (!hasPgVectorSupport()) return null;
  const cleaned = text.trim();
  if (!cleaned) return null;
  const vector = await embed(cleaned);
  return vecToSql(vector);
}

async function reindexKnowledgeItems(): Promise<number> {
  const items = await db.select().from(knowledgeItemsTable);
  let done = 0;
  for (const item of items) {
    let content = item.content || "";
    if ((!content.trim()) && item.filePath && fs.existsSync(item.filePath)) {
      content = await extractTextFromFile(item.filePath, item.mimeType || "", item.fileName || item.title);
      await db.update(knowledgeItemsTable)
        .set({ content, updatedAt: new Date() })
        .where(eq(knowledgeItemsTable.id, item.id));
    }
    const vec = await embedText(`${item.title}\n${content}`);
    if (!vec) continue;
    await db.execute(
      sql`UPDATE knowledge_items
          SET embedding_vec = ${vec}::vector,
              embedded_at = NOW()
          WHERE id = ${item.id}`
    );
    done++;
  }
  return done;
}

async function reindexProcessAttachments(): Promise<number> {
  const items = await db.select().from(processAttachmentsTable);
  const uploadDir = path.join(process.cwd(), "uploads", "process-attachments");
  let done = 0;
  for (const item of items) {
    let text = item.extractedText || "";
    if ((!text.trim()) && item.type === "file" && item.filePath) {
      const fullPath = path.join(uploadDir, item.filePath);
      if (fs.existsSync(fullPath)) {
        text = await extractTextFromFile(fullPath, item.mimeType || "", item.fileName || item.title);
        await db.update(processAttachmentsTable)
          .set({ extractedText: text })
          .where(eq(processAttachmentsTable.id, item.id));
      }
    }
    const vec = await embedText(`${item.title}\n${text || item.url || ""}`);
    if (!vec) continue;
    await db.execute(
      sql`UPDATE process_attachments
          SET embedding_vec = ${vec}::vector
          WHERE id = ${item.id}`
    );
    done++;
  }
  return done;
}

async function reindexGovernanceDocuments(): Promise<number> {
  const items = await db
    .select({
      id: governanceDocumentsTable.id,
      originalName: governanceDocumentsTable.originalName,
      mimeType: governanceDocumentsTable.mimeType,
      filePath: governanceDocumentsTable.filePath,
      extractedText: governanceDocumentsTable.extractedText,
      standardName: governanceStandardsTable.complianceName,
    })
    .from(governanceDocumentsTable)
    .innerJoin(governanceStandardsTable, eq(governanceDocumentsTable.governanceId, governanceStandardsTable.id));
  let done = 0;
  for (const item of items) {
    let text = item.extractedText || "";
    if ((!text.trim()) && fs.existsSync(item.filePath)) {
      text = await extractTextFromFile(item.filePath, item.mimeType || "", item.originalName);
    }
    const vec = await embedText(`${item.standardName}\n${text}`);
    if (!vec) continue;
    await db.execute(
      sql`UPDATE governance_documents
          SET extracted_text = ${text},
              embedding_vec = ${vec}::vector
          WHERE id = ${item.id}`
    );
    done++;
  }
  return done;
}

async function reindexAgentKnowledgeFiles(): Promise<number> {
  const items = await db
    .select({
      id: agentKnowledgeFilesTable.id,
      originalName: agentKnowledgeFilesTable.originalName,
      mimeType: agentKnowledgeFilesTable.mimeType,
      filePath: agentKnowledgeFilesTable.filePath,
      extractedText: agentKnowledgeFilesTable.extractedText,
      agentName: aiAgentsTable.name,
    })
    .from(agentKnowledgeFilesTable)
    .innerJoin(aiAgentsTable, eq(agentKnowledgeFilesTable.agentId, aiAgentsTable.id));
  let done = 0;
  for (const item of items) {
    let text = item.extractedText || "";
    if ((!text.trim()) && fs.existsSync(item.filePath)) {
      text = await extractTextFromFile(item.filePath, item.mimeType || "", item.originalName);
    }
    const vec = await embedText(`${item.agentName}\n${item.originalName}\n${text}`);
    if (!vec) continue;
    await db.execute(
      sql`UPDATE agent_knowledge_files
          SET extracted_text = ${text},
              embedding_vec = ${vec}::vector,
              embedded_at = NOW()
          WHERE id = ${item.id}`
    );
    done++;
  }
  return done;
}

async function main() {
  const summary = {
    knowledgeItems: await reindexKnowledgeItems(),
    processAttachments: await reindexProcessAttachments(),
    governanceDocuments: await reindexGovernanceDocuments(),
    agentKnowledgeFiles: await reindexAgentKnowledgeFiles(),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
