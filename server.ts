import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, addDoc, getDocs } from "firebase/firestore";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Firebase Configuration from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyCmUO7RKJ1dkzTFknyujb1Ydzam9oDIuxM",
  authDomain: "poised-grin-8tgzl.firebaseapp.com",
  projectId: "poised-grin-8tgzl",
  storageBucket: "poised-grin-8tgzl.firebasestorage.app",
  messagingSenderId: "151986359434",
  appId: "1:151986359434:web:c658d1531e2c2dfe2bf173"
};

// Initialize Firebase App on Server with a distinct name
const firebaseApp = initializeApp(firebaseConfig, "server-app");
const db = getFirestore(firebaseApp, "ai-studio-consultadepreos-e83f3d7f-9859-4a50-8a49-163d0eeb504a");

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload size limit to handle PDF base64 uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes
  
  // Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Admin login endpoint
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const normalizedUser = username?.trim().toLowerCase();
    
    if ((normalizedUser === "admin" || normalizedUser === "admim") && password === "123456") {
      res.json({ success: true, token: "admin-session-token-123" });
    } else {
      res.status(401).json({ success: false, message: "Usuário ou senha inválidos." });
    }
  });

  // Import PDF endpoint
  app.post("/api/import", async (req, res) => {
    try {
      const { fileName, fileData, mimeType } = req.body;

      if (!fileData) {
        return res.status(400).json({ success: false, message: "Nenhum arquivo enviado." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          success: false, 
          message: "GEMINI_API_KEY não configurada no servidor. Por favor, configure nos Secrets." 
        });
      }

      // Prepare file data for Gemini (remove data url scheme prefix if exists)
      const base64Data = fileData.replace(/^data:application\/pdf;base64,/, "");

      console.log(`Starting Gemini analysis for file: ${fileName}`);

      // Call Gemini 3.5 Flash to extract structured product list from PDF
      const promptText = `
Você é um extrator JSON de alta velocidade para relatórios de preços.
Analise o PDF enviado e extraia os produtos de forma compacta e direta.

Cabeçalho do PDF:
- startDate: Data de início (Início)
- endDate: Data final (Final)
- observation: Observação do cabeçalho (ex: ADIDAS)

Tabela de Produtos (extraia TODOS de todas as páginas):
- referencia: código do produto
- descricao: nome ou descrição
- grupo: grupo/categoria
- modelo: modelo/marca
- precoAntigo: preço de referência anterior
- precoNovo: preço atual promocional

Importante:
- Converta os preços decimais com vírgula para floats (ex: "129,90" -> 129.90, "99,99" -> 99.99).
- Não omita nenhum produto. Extraia todas as linhas.
- Retorne estritamente o JSON válido conforme o esquema.
`;

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      let response;
      let retries = 3;
      let waitTime = 10000; // 10 seconds initial wait for rate limits

      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType || "application/pdf",
                      data: base64Data,
                    },
                  },
                  {
                    text: promptText,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  startDate: { type: "STRING" },
                  endDate: { type: "STRING" },
                  observation: { type: "STRING" },
                  items: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        referencia: { type: "STRING" },
                        descricao: { type: "STRING" },
                        grupo: { type: "STRING" },
                        modelo: { type: "STRING" },
                        precoAntigo: { type: "NUMBER" },
                        precoNovo: { type: "NUMBER" },
                      },
                      required: ["referencia", "descricao", "grupo", "modelo", "precoNovo"],
                    },
                  },
                },
                required: ["items"],
              },
            },
          });
          break; // success, break retry loop!
        } catch (error: any) {
          const isRateLimit = error.message?.includes("429") || 
                              error.message?.includes("quota") || 
                              error.message?.includes("RESOURCE_EXHAUSTED") ||
                              error.status === 429;
          
          if (isRateLimit && retries > 1) {
            console.warn(`Gemini Rate Limit (429) hit. Retrying in ${waitTime / 1000}s... (${retries - 1} retries left)`);
            await delay(waitTime);
            retries--;
            waitTime += 10000; // exponential increase
          } else {
            throw error; // Propagate other errors or if out of retries
          }
        }
      }

      const resultText = response.text;
      if (!resultText) {
        throw new Error("Gemini retornou uma resposta vazia.");
      }

      const parsedData = JSON.parse(resultText);
      const items = parsedData.items || [];

      if (items.length === 0) {
        return res.status(422).json({ 
          success: false, 
          message: "Não foi possível extrair nenhum produto do PDF. Verifique se o formato está correto." 
        });
      }

      console.log(`Successfully parsed ${items.length} products from ${fileName}`);

      // Save Import Record to Firestore
      const importRef = collection(db, "imports");
      const importDateStr = new Date().toISOString();
      const newImport = {
        fileName,
        importedAt: importDateStr,
        itemsCount: items.length,
        startDate: parsedData.startDate || "Não especificada",
        endDate: parsedData.endDate || "Não especificada",
        observation: parsedData.observation || "Nenhuma",
      };
      
      const importDocRef = await addDoc(importRef, newImport);
      const importId = importDocRef.id;

      // Upsert Products to Firestore
      const productPromises = items.map(async (item: any) => {
        const prodRef = doc(db, "products", item.referencia);
        const productData = {
          id: item.referencia,
          referencia: item.referencia,
          descricao: item.descricao,
          grupo: item.grupo,
          modelo: item.modelo,
          precoAntigo: Number(item.precoAntigo) || 0,
          precoNovo: Number(item.precoNovo) || 0,
          importId,
          importedAt: importDateStr,
        };
        return setDoc(prodRef, productData, { merge: true });
      });

      await Promise.all(productPromises);

      res.json({
        success: true,
        importId,
        fileName,
        itemsCount: items.length,
        startDate: parsedData.startDate,
        endDate: parsedData.endDate,
        observation: parsedData.observation,
        items: items.slice(0, 5) // Send top 5 items for visual preview
      });

    } catch (error: any) {
      console.error("Error during PDF import processing:", error);
      res.status(500).json({ 
        success: false, 
        message: "Erro interno ao processar o arquivo PDF.", 
        details: error.message 
      });
    }
  });

  // Get list of all imports
  app.get("/api/imports", async (req, res) => {
    try {
      const importsRef = collection(db, "imports");
      const snapshot = await getDocs(importsRef);
      const importsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort imports by date descending
      importsList.sort((a: any, b: any) => {
        return new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime();
      });

      res.json({ success: true, imports: importsList });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get list of all products
  app.get("/api/products", async (req, res) => {
    try {
      const productsRef = collection(db, "products");
      const snapshot = await getDocs(productsRef);
      const productsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      res.json({ success: true, products: productsList });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
