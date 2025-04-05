import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { getCritiqueById } from "./database";
import path from "path";
import fs from "fs";
import { Document } from "langchain/document";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";

// Directory for storing the vector store data
const VECTOR_DIR = path.join(process.cwd(), 'data', 'vectors');
const VECTOR_DATA_FILE = path.join(VECTOR_DIR, 'vector-data.json');

// Simple in-memory vector store
type MemoryVector = {
  content: Document;
  embedding: number[];
};

class SimpleVectorStore {
  private vectors: MemoryVector[] = [];
  private embeddings: OllamaEmbeddings;

  constructor(embeddings: OllamaEmbeddings) {
    this.embeddings = embeddings;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    try {
      const embeddings = await this.embeddings.embedDocuments(
        documents.map(doc => doc.pageContent)
      );

      for (let i = 0; i < documents.length; i++) {
        this.vectors.push({
          content: documents[i],
          embedding: embeddings[i]
        });
      }
    } catch (error) {
      console.error("Error adding documents:", error);
      // Fallback to random vectors if embeddings fail
      for (const doc of documents) {
        this.vectors.push({
          content: doc,
          embedding: Array(1536).fill(0).map(() => Math.random())
        });
      }
    }
  }

  async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
    try {
      // Get query embedding
      let queryEmbedding: number[];
      try {
        queryEmbedding = await this.embeddings.embedQuery(query);
      } catch (error) {
        console.error("Error embedding query:", error);
        queryEmbedding = Array(1536).fill(0).map(() => Math.random());
      }

      // Score all vectors
      const scoredVectors = this.vectors.map(vector => ({
        content: vector.content,
        score: this.cosineSimilarity(queryEmbedding, vector.embedding)
      }));

      // Sort by score (descending)
      scoredVectors.sort((a, b) => b.score - a.score);

      // Return top k documents
      return scoredVectors.slice(0, k).map(vector => vector.content);
    } catch (error) {
      console.error("Error in similarity search:", error);
      return this.vectors.slice(0, k).map(vector => vector.content);
    }
  }

  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  get allVectors(): MemoryVector[] {
    return this.vectors;
  }
}

// Initialize our embeddings model
let embeddings: OllamaEmbeddings;

// Vector store
let vectorStore: SimpleVectorStore | null = null;

// Initialize the vector store
export async function initVectorStore() {
  try {
    // Ensure the directory exists
    if (!fs.existsSync(VECTOR_DIR)) {
      fs.mkdirSync(VECTOR_DIR, { recursive: true });
    }
    
    // Create embeddings instance
    try {
      embeddings = new OllamaEmbeddings({
        model: "llama3", // or any suitable embedding model available in Ollama
        baseUrl: "http://localhost:11434", // Ollama endpoint
      });
    } catch (embedError) {
      console.error("Error initializing Ollama embeddings:", embedError);
      // Create a dummy embeddings model that returns random vectors
      embeddings = {
        embedQuery: async (text: string) => Array(1536).fill(0).map(() => Math.random()),
        embedDocuments: async (documents: string[]) => documents.map(() => Array(1536).fill(0).map(() => Math.random())),
      } as OllamaEmbeddings;
    }
    
    // Create a new memory vector store
    vectorStore = new SimpleVectorStore(embeddings);
    
    // Load existing data if available
    if (fs.existsSync(VECTOR_DATA_FILE)) {
      try {
        const savedData = JSON.parse(fs.readFileSync(VECTOR_DATA_FILE, 'utf-8'));
        if (Array.isArray(savedData) && savedData.length > 0) {
          for (const item of savedData) {
            if (item.content) {
              const doc = new Document({
                pageContent: item.content.pageContent,
                metadata: item.content.metadata
              });
              await vectorStore.addDocuments([doc]);
            }
          }
          console.log(`Loaded ${savedData.length} documents from saved vector store`);
        }
      } catch (loadError) {
        console.warn("Could not load vector data, creating new store:", loadError);
      }
    } else {
      // Add a placeholder document
      await vectorStore.addDocuments([
        new Document({
          pageContent: "placeholder",
          metadata: { id: "placeholder" }
        })
      ]);
      console.log("Created new vector store");
    }
    
    return true;
  } catch (error) {
    console.error("Error initializing vector store:", error);
    throw error;
  }
}

// Split code into chunks for embedding
export async function splitCodeIntoChunks(code: string, language: string) {
  // Use a text splitter appropriate for code
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });
  
  // Split the code into chunks
  const docs = await splitter.createDocuments(
    [code],
    [{ language, type: "code" }]
  );
  
  return docs;
}

// Save vector store data to disk
async function saveVectorStore() {
  try {
    if (!vectorStore) return;
    
    // Get all vectors
    const vectors = vectorStore.allVectors;
    
    // Save to file
    fs.writeFileSync(
      VECTOR_DATA_FILE, 
      JSON.stringify(vectors, null, 2)
    );
    
    console.log(`Saved ${vectors.length} documents to vector store file`);
    return true;
  } catch (error) {
    console.error("Error saving vector store:", error);
    return false;
  }
}

// Add a code sample to the vector store
export async function addToVectorStore(
  code: string,
  critiqueId: string,
  language: string,
  critique: any // Add critique parameter
) {
  try {
    // Ensure vector store is initialized
    if (!vectorStore) {
      await initVectorStore();
    }
    
    // Split the code into chunks
    const chunks = await splitCodeIntoChunks(code, language);
    
    // Add metadata to each chunk
    const docsWithMetadata = chunks.map(chunk => {
      // Limit critique size if necessary, store essential parts
      const critiqueSummary = critique?.summary?.substring(0, 200) || 'No summary';
      const critiqueIssuesCount = critique?.issues?.length || 0;

      return new Document({
        pageContent: chunk.pageContent,
        metadata: {
          ...chunk.metadata,
          critiqueId,
          timestamp: new Date().toISOString(),
          // Add critique data to metadata
          critiqueSummary: critiqueSummary,
          critiqueIssuesCount: critiqueIssuesCount
          // Consider adding more structured critique info if needed,
          // e.g., JSON.stringify(critique.issues.map(i => i.title))
        }
      });
    });
    
    // Add to vector store
    await vectorStore!.addDocuments(docsWithMetadata);
    
    // Save the updated vector store
    await saveVectorStore();
    
    return true;
  } catch (error) {
    console.error("Error adding to vector store:", error);
    throw error;
  }
}

// Find similar code examples
export async function findSimilarCode(code: string, limit = 5) {
  try {
    // Ensure vector store is initialized
    if (!vectorStore) {
      await initVectorStore();
    }
    
    // Get embeddings for the query code
    const results = await vectorStore!.similaritySearch(code, limit);
    
    // Augment results with critique data if needed
    const enhancedResults = await Promise.all(
      results.map(async (result) => {
        if (result.metadata.critiqueId && result.metadata.critiqueId !== "placeholder") {
          try {
            const critique = await getCritiqueById(result.metadata.critiqueId);
            if (critique) {
              return {
                ...result,
                metadata: {
                  ...result.metadata,
                  critique: {
                    summary: critique.summary,
                    language: critique.language,
                    issueCount: critique.issues.length,
                  },
                },
              };
            }
          } catch (error) {
            console.warn(`Error fetching critique ${result.metadata.critiqueId}:`, error);
          }
        }
        return result;
      })
    );
    
    return enhancedResults;
  } catch (error) {
    console.error("Error searching vector store:", error);
    
    // Return empty array as fallback
    return [];
  }
} 