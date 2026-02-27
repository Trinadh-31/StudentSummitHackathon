import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";
import { pipeline } from "@xenova/transformers";

let embedder: any = null;
async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Supabase/bge-small-en");
  }
  return embedder;
}


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("hr_policy.db");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    text TEXT,
    metadata TEXT,
    embedding BLOB,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    role TEXT,
    text TEXT,
    sources TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.post("/api/embed", async (req, res) => {
    try {
      const { text } = req.body;
      const embedFunc = await getEmbedder();
      const output = await embedFunc(text, { pooling: "mean", normalize: true });
      res.json({ embedding: Array.from(output.data) });
    } catch (error) {
      console.error("Embedding error:", error);
      res.status(500).json({ error: "Failed to generate embedding" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, systemInstruction } = req.body;
      const response = await openai.chat.completions.create({
        model: "nvidia/nemotron-3-nano-30b-a3b:free",
        messages: [
          { role: "system", content: systemInstruction },
          ...messages
        ],
      });
      res.json({ text: response.choices[0].message.content });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to generate chat response" });
    }
  });

  app.get("/api/documents", (req, res) => {
    const docs = db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all();
    res.json(docs);
  });

  app.post("/api/ingest", (req, res) => {
    const { id, name, type, chunks } = req.body;
    console.log(`Received ingestion request for document: ${name} (${id}), chunks: ${chunks?.length}`);

    if (!id || !name || !chunks) {
      return res.status(400).json({ error: "Missing required fields: id, name, or chunks" });
    }

    const insertDoc = db.prepare("INSERT INTO documents (id, name, type) VALUES (?, ?, ?)");
    const insertChunk = db.prepare("INSERT INTO chunks (id, document_id, text, metadata, embedding) VALUES (?, ?, ?, ?, ?)");

    const transaction = db.transaction((docId, docName, docType, docChunks) => {
      insertDoc.run(docId, docName, docType);
      for (const chunk of docChunks) {
        if (!chunk.embedding || !Array.isArray(chunk.embedding)) {
          console.error(`Missing or invalid embedding for chunk ${chunk.id}`);
          continue; // Skip or throw? Let's skip for now but log
        }
        // Store embedding as Float32Array buffer
        const embeddingBuffer = Buffer.from(new Float32Array(chunk.embedding).buffer);
        insertChunk.run(chunk.id, docId, chunk.text, JSON.stringify(chunk.metadata), embeddingBuffer);
      }
    });

    try {
      transaction(id, name, type, chunks);
      console.log(`Successfully ingested document: ${name}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Ingestion error in transaction:", error);
      res.status(500).json({ error: `Failed to ingest document: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });

  app.delete("/api/documents/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.post("/api/search", (req, res) => {
    const { queryEmbedding, topK = 5 } = req.body;
    const queryVec = new Float32Array(queryEmbedding);

    const chunks = db.prepare("SELECT * FROM chunks").all();

    const scoredChunks = chunks.map((chunk: any) => {
      const chunkVec = new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.byteLength / 4);

      // Cosine similarity
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < queryVec.length; i++) {
        dotProduct += queryVec[i] * chunkVec[i];
        normA += queryVec[i] * queryVec[i];
        normB += chunkVec[i] * chunkVec[i];
      }
      const score = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

      return {
        id: chunk.id,
        text: chunk.text,
        metadata: JSON.parse(chunk.metadata),
        score
      };
    });

    const results = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    res.json(results);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
