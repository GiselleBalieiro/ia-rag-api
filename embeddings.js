import mysql from "mysql2/promise";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import dotenv from "dotenv";
dotenv.config();

export async function carregarVetores() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, 
    user: process.env.MYSQL_USER,  
    password: process.env.MYSQL_PASSWORD, 
    database: process.env.MYSQL_DATABASE, 
    ssl: { rejectUnauthorized: true } 
  });

  const [rows] = await conn.execute("SELECT training FROM agent");

  const textos = rows.map(r => r.training).join("\n");
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500 });
  const docs = await splitter.createDocuments([textos]);

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    modelName: "text-embedding-3-small"
  });

  const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
  await conn.end();
  return vectorStore;
}