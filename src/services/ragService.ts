export interface DocumentChunk {
  id: string;
  text: string;
  metadata: {
    pageNumber?: number;
    source: string;
  };
  embedding?: number[];
}

export interface Document {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export class RAGService {
  async createEmbeddings(text: string): Promise<number[]> {
    try {
      const response = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate embedding from backend");
      }
      
      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.error("Embedding generation failed:", error);
      throw error;
    }
  }

  async ingestDocument(text: string, source: string, type: string, onProgress?: (progress: number) => void): Promise<void> {
    console.log('Ingesting document:', source, 'type:', type);
    const chunkSize = 1000;
    const overlap = 200;
    const docId = crypto.randomUUID();
    const chunks: DocumentChunk[] = [];
    
    // Improved chunking with overlap
    let start = 0;
    while (start < text.length) {
      let end = start + chunkSize;
      if (end < text.length) {
        const nextNewline = text.indexOf('\n', end - 100);
        if (nextNewline !== -1 && nextNewline < end + 100) {
          end = nextNewline + 1;
        } else {
          const nextPeriod = text.indexOf('. ', end - 50);
          if (nextPeriod !== -1 && nextPeriod < end + 50) {
            end = nextPeriod + 2;
          }
        }
      }
      
      const chunkText = text.substring(start, Math.min(end, text.length)).trim();
      if (chunkText) {
        chunks.push({
          id: crypto.randomUUID(),
          text: chunkText,
          metadata: { source },
        });
      }
      
      start = end - overlap;
      if (start >= text.length - overlap) break;
    }

    console.log(`Total chunks created: ${chunks.length}`);

    // Generate embeddings in parallel batches to speed up
    const concurrentLimit = 5; // Process 5 chunks at a time
    for (let i = 0; i < chunks.length; i += concurrentLimit) {
      const batch = chunks.slice(i, i + concurrentLimit);
      console.log(`Processing batch ${i / concurrentLimit + 1} of ${Math.ceil(chunks.length / concurrentLimit)}`);
      
      try {
        await Promise.all(batch.map(async (chunk) => {
          chunk.embedding = await this.createEmbeddings(chunk.text);
        }));
      } catch (err) {
        console.error('Error generating embeddings for batch:', err);
        throw new Error('Failed to generate embeddings. Please check your API key and network connection.');
      }

      if (onProgress) {
        onProgress(Math.min(((i + batch.length) / chunks.length) * 100, 100));
      }
    }

    console.log('All embeddings generated. Sending to backend...');

    // Save to backend
    const response = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: docId,
        name: source,
        type,
        chunks
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Backend ingestion error:', errorData);
      throw new Error(`Failed to save document to database: ${errorData.error || response.statusText}`);
    }
    console.log('Document successfully saved to backend.');
  }

  async search(query: string, topK: number = 4): Promise<DocumentChunk[]> {
    const queryEmbedding = await this.createEmbeddings(query);
    
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queryEmbedding, topK })
    });

    if (!response.ok) return [];
    return response.json();
  }

  async ask(question: string, history: { role: 'user' | 'model', text: string }[]): Promise<{ answer: string, sources: DocumentChunk[] }> {
    const contextChunks = await this.search(question);
    const contextText = contextChunks.map(c => c.text).join("\n\n---\n\n");

    const systemInstruction = `You are a professional HR Assistant. Your goal is to help employees understand company policies based ONLY on the provided context.
    
    Rules:
    1. Use a clear, professional, and helpful tone.
    2. If the answer is not in the context, say: "I'm sorry, but I couldn't find information regarding that in the current policy handbook. Please contact HR directly for further assistance."
    3. Do not hallucinate or use external knowledge.
    4. Cite your information by referring to the context provided.
    5. If the user asks for something outside of HR policies, politely redirect them.
    
    Context:
    ${contextText}`;

    // Format history for OpenAI
    const messages = history.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text
    }));
    
    messages.push({ role: 'user', content: question });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, systemInstruction })
    });

    if (!response.ok) {
      throw new Error("Failed to get response from chat API");
    }

    const data = await response.json();
    
    return {
      answer: data.text || "No response generated.",
      sources: contextChunks
    };
  }

  async getDocuments(): Promise<Document[]> {
    const response = await fetch("/api/documents");
    if (!response.ok) return [];
    return response.json();
  }

  async deleteDocument(id: string): Promise<void> {
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Failed to delete document");
  }
}

export const ragService = new RAGService();
