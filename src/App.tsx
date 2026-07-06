import React, { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Filter, 
  Upload, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Lock, 
  LogOut, 
  FileText, 
  Tag, 
  Barcode, 
  History, 
  ArrowLeft,
  X,
  FileSpreadsheet,
  TrendingDown,
  Sparkles,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Product, ImportRecord } from "./types";

export default function App() {
  // Navigation State
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loginError, setLoginError] = useState<string>("");

  // Product Database State
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("todos");
  const [selectedModel, setSelectedModel] = useState<string>("todos");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Admin / Imports State
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loadingImports, setLoadingImports] = useState<boolean>(false);

  // Queue of uploads
  interface UploadTask {
    id: string;
    fileName: string;
    state: "reading" | "uploading" | "parsing" | "saving" | "success" | "error";
    progress: number;
    error?: string;
    itemsCount?: number;
    startDate?: string;
    endDate?: string;
    observation?: string;
  }
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  
  // Drag & Drop State
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Promotion details mapping by importId
  const [importsMap, setImportsMap] = useState<Record<string, ImportRecord>>({});

  // 1. Fetch products and imports via secure API
  const fetchAllData = async () => {
    try {
      // Fetch products
      const prodRes = await fetch("/api/products");
      const prodData = await prodRes.json();
      if (prodData.success) {
        setProducts(prodData.products || []);
      }
      setLoadingProducts(false);

      // Fetch imports
      const impRes = await fetch("/api/imports");
      const impData = await impRes.json();
      if (impData.success) {
        setImports(impData.imports || []);
        const mapping: Record<string, ImportRecord> = {};
        (impData.imports || []).forEach((record: ImportRecord) => {
          mapping[record.id] = record;
        });
        setImportsMap(mapping);
      }
    } catch (error) {
      console.error("Erro ao carregar dados do servidor:", error);
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    // Background sync every 15 seconds so other devices get updates as well
    const interval = setInterval(fetchAllData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Check login token from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token === "admin-session-token-123") {
      setIsAdmin(true);
    }
  }, []);

  // Unique groups and models derived dynamically from all products
  const uniqueGroups = ["todos", ...Array.from(new Set(products.map(p => p.grupo).filter(Boolean)))];
  const uniqueModels = ["todos", ...Array.from(new Set(products.map(p => p.modelo).filter(Boolean)))];

  // Handle Admin Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (data.success) {
        setIsAdmin(true);
        localStorage.setItem("admin_token", data.token);
        setShowAdminLogin(false);
        setUsername("");
        setPassword("");
      } else {
        setLoginError(data.message || "Credenciais inválidas");
      }
    } catch (err) {
      setLoginError("Erro ao conectar ao servidor. Tente novamente.");
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem("admin_token");
  };

  // Filter products based on search query and dropdowns
  const filteredProducts = products.filter(product => {
    const query = searchQuery.toLowerCase().trim();
    const matchQuery = !query || 
      product.referencia?.toLowerCase().includes(query) ||
      product.descricao?.toLowerCase().includes(query) ||
      product.grupo?.toLowerCase().includes(query) ||
      product.modelo?.toLowerCase().includes(query);

    const matchGroup = selectedGroup === "todos" || product.grupo === selectedGroup;
    const matchModel = selectedModel === "todos" || product.modelo === selectedModel;

    return matchQuery && matchGroup && matchModel;
  });

  // Calculate discount percentage
  const calculateDiscount = (oldPrice: number, newPrice: number) => {
    if (!oldPrice || oldPrice <= newPrice) return 0;
    return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
  };

  // PDF Import / Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processMultipleFiles(Array.from(files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processMultipleFiles(Array.from(files));
    }
  };

  const processSingleFile = (file: File, taskId: string): Promise<void> => {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          setUploadTasks(prev => prev.map(t => t.id === taskId ? { ...t, state: "uploading", progress: 30 } : t));

          const base64Data = reader.result as string;

          setUploadTasks(prev => prev.map(t => t.id === taskId ? { ...t, state: "parsing", progress: 60 } : t));

          const response = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileData: base64Data,
              mimeType: "application/pdf"
            })
          });

          setUploadTasks(prev => prev.map(t => t.id === taskId ? { ...t, state: "saving", progress: 85 } : t));

          const data = await response.json();

          if (data.success) {
            setUploadTasks(prev => prev.map(t => t.id === taskId ? { 
              ...t, 
              state: "success", 
              progress: 100,
              itemsCount: data.itemsCount,
              startDate: data.startDate,
              endDate: data.endDate,
              observation: data.observation
            } : t));
            fetchAllData(); // Refresh products list
          } else {
            setUploadTasks(prev => prev.map(t => t.id === taskId ? { ...t, state: "error", error: data.message || "Erro de processamento." } : t));
          }
        } catch (err: any) {
          setUploadTasks(prev => prev.map(t => t.id === taskId ? { ...t, state: "error", error: "Erro de rede com o servidor." } : t));
        } finally {
          resolve();
        }
      };

      reader.onerror = () => {
        setUploadTasks(prev => prev.map(t => t.id === taskId ? { ...t, state: "error", error: "Erro de leitura local." } : t));
        resolve();
      };

      reader.readAsDataURL(file);
    });
  };

  const processMultipleFiles = async (files: File[]) => {
    const pdfFiles = files.filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      alert("Por favor, envie apenas arquivos no formato PDF.");
      return;
    }

    // Add tasks to queue
    const newTasks: UploadTask[] = pdfFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      fileName: file.name,
      state: "reading",
      progress: 10,
    }));

    setUploadTasks(prev => [...newTasks, ...prev]);

    // Process sequentially
    for (let i = 0; i < pdfFiles.length; i++) {
      await processSingleFile(pdfFiles[i], newTasks[i].id);
      // Wait a tiny bit between files
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-indigo-200">
              <Barcode className="h-5 w-5" />
            </div>
            <div>
              <h1 id="app-title" className="font-bold text-lg text-slate-900 tracking-tight">Consulta de Preços</h1>
              <p className="text-xs text-slate-500 font-medium">Buscador Inteligente de Produtos</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {isAdmin ? (
              <div className="flex items-center space-x-2">
                <span className="hidden sm:inline-block text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                  Painel ADMIN
                </span>
                <button 
                  onClick={handleLogout}
                  className="flex items-center space-x-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-all"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Acesso Administrativo</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* Admin Login Modal */}
          {showAdminLogin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
              >
                <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Lock className="h-4 w-4 text-indigo-400" />
                    <span className="font-semibold text-sm">Autenticação Administrativa</span>
                  </div>
                  <button onClick={() => setShowAdminLogin(false)} className="text-slate-400 hover:text-white transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <form onSubmit={handleLogin} className="p-6 space-y-4">
                  {loginError && (
                    <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-xs flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Usuário</label>
                    <input 
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Ex: admin"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Senha</label>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Insira a senha"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-indigo-100 transition-all"
                  >
                    Entrar no Painel
                  </button>
                </form>
              </motion.div>
            </div>
          )}

          {/* ADMIN INTERFACE */}
          {isAdmin ? (
            <motion.div 
              key="admin-panel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left Column: Import Box */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
                      <Upload className="h-5 w-5 text-indigo-600" />
                      <span>Nova Importação</span>
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                      Múltiplos PDFs
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Arraste ou selecione <strong>um ou mais relatórios PDF</strong> ao mesmo tempo. O sistema analisará todos em paralelo de forma otimizada com Inteligência Artificial de alta velocidade.
                  </p>

                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      isDragging 
                        ? "border-indigo-500 bg-indigo-50/50" 
                        : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50"
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileSelect} 
                      accept=".pdf" 
                      multiple 
                      className="hidden" 
                    />
                    
                    <div className="space-y-2">
                      <div className="h-12 w-12 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div className="text-xs font-semibold text-slate-700">Clique para enviar ou arraste</div>
                      <div className="text-[10px] text-slate-400">Selecione vários arquivos PDF de uma vez</div>
                    </div>
                  </div>
                </div>

                {uploadTasks.length > 0 && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-950 uppercase tracking-wider flex items-center space-x-1.5">
                        <Sparkles className="h-4 w-4 text-indigo-600 animate-pulse" />
                        <span>Fila de Processamento</span>
                      </h4>
                      <button 
                        onClick={() => setUploadTasks([])}
                        className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        Limpar Fila
                      </button>
                    </div>

                    <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                      {uploadTasks.map((task) => (
                        <div key={task.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-slate-800 truncate max-w-[150px]" title={task.fileName}>
                              {task.fileName}
                            </div>
                            
                            <div className="shrink-0">
                              {task.state === "success" && (
                                <span className="text-emerald-600 flex items-center space-x-1 font-bold text-[10px]">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span>Sucesso</span>
                                </span>
                              )}
                              {task.state === "error" && (
                                <span className="text-rose-600 flex items-center space-x-1 font-bold text-[10px]">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  <span>Erro</span>
                                </span>
                              )}
                              {task.state !== "success" && task.state !== "error" && (
                                <span className="text-indigo-600 flex items-center space-x-1 font-semibold text-[10px]">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>
                                    {task.state === "reading" && "Lendo..."}
                                    {task.state === "uploading" && "Enviando..."}
                                    {task.state === "parsing" && "IA Analisando..."}
                                    {task.state === "saving" && "Gravando..."}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>

                          {task.state !== "success" && task.state !== "error" && (
                            <div className="space-y-1">
                              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-indigo-600 h-full transition-all duration-300" 
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {task.state === "success" && (
                            <div className="bg-emerald-50/50 p-2 rounded-lg text-[10px] text-emerald-800 space-y-1 font-medium border border-emerald-100/30">
                              <div className="flex justify-between">
                                <span>Produtos Extraídos:</span>
                                <strong className="font-bold">{task.itemsCount} itens</strong>
                              </div>
                              <div className="flex justify-between">
                                <span>Marca/Obs:</span>
                                <strong className="font-bold">{task.observation}</strong>
                              </div>
                              {task.startDate && task.endDate && (
                                <div className="flex justify-between">
                                  <span>Período:</span>
                                  <strong className="font-bold">{task.startDate} - {task.endDate}</strong>
                                </div>
                              )}
                            </div>
                          )}

                          {task.state === "error" && (
                            <div className="p-2 bg-rose-50 text-rose-700 text-[10px] rounded-lg font-medium border border-rose-100/30">
                              {task.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Imports List & Global Products info */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-base text-slate-900 mb-4 flex items-center space-x-2">
                    <History className="h-5 w-5 text-indigo-600" />
                    <span>Histórico de Importações</span>
                  </h3>

                  {imports.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <FileText className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                      <div className="text-xs font-bold text-slate-600">Nenhuma importação encontrada</div>
                      <p className="text-[10px] text-slate-400 mt-1">Importe um PDF para iniciar o banco de dados.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto pr-2">
                      {imports.map((record) => (
                        <div key={record.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-800 truncate max-w-[200px] sm:max-w-xs">{record.fileName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 font-medium">
                              <span className="flex items-center text-slate-400">
                                <Calendar className="h-3 w-3 mr-1" />
                                {new Date(record.importedAt).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </span>
                              <span>•</span>
                              <span>Período: <strong className="text-slate-600">{record.startDate || "N/A"} - {record.endDate || "N/A"}</strong></span>
                              <span>•</span>
                              <span>Obs: <strong className="text-slate-600">{record.observation || "ADIDAS"}</strong></span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-extrabold text-indigo-600">{record.itemsCount} produtos</div>
                              <div className="text-[9px] text-slate-400">mesclados com sucesso</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Database Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-900 text-white p-5 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Produtos Ativos</div>
                      <div className="text-3xl font-extrabold mt-1">{products.length}</div>
                      <div className="text-[10px] text-slate-400 mt-1">Disponíveis para consulta rápida</div>
                    </div>
                    <div className="h-12 w-12 bg-white/10 rounded-xl flex items-center justify-center text-indigo-400">
                      <Barcode className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Arquivos Importados</div>
                      <div className="text-3xl font-extrabold text-slate-900 mt-1">{imports.length}</div>
                      <div className="text-[10px] text-slate-500 mt-1">Total de lotes mesclados</div>
                    </div>
                    <div className="h-12 w-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                      <FileSpreadsheet className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                {/* Back button */}
                <div className="flex justify-start">
                  <button 
                    onClick={() => setIsAdmin(false)}
                    className="flex items-center space-x-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Voltar para Consulta de Preços</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            /* CLIENT SEARCH INTERFACE */
            <motion.div 
              key="search-interface"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Giant Search Bar Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedProduct(null); // Clear selected details on search changes
                    }}
                    placeholder="Digite a Referência, Descrição, Grupo ou Modelo do produto..."
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 font-medium text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedProduct(null);
                      }}
                      className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown Filters */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center">
                      <Filter className="h-3 w-3 mr-1" />
                      Grupo de Produto
                    </label>
                    <div className="relative">
                      <select 
                        value={selectedGroup}
                        onChange={(e) => {
                          setSelectedGroup(e.target.value);
                          setSelectedProduct(null);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                      >
                        {uniqueGroups.map(g => (
                          <option key={g} value={g}>{g === "todos" ? "Todos os Grupos" : g}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400 text-xs">
                        ▼
                      </div>
                    </div>
                  </div>

                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center">
                      <Tag className="h-3 w-3 mr-1" />
                      Modelo / Marca
                    </label>
                    <div className="relative">
                      <select 
                        value={selectedModel}
                        onChange={(e) => {
                          setSelectedModel(e.target.value);
                          setSelectedProduct(null);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                      >
                        {uniqueModels.map(m => (
                          <option key={m} value={m}>{m === "todos" ? "Todos os Modelos" : m}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400 text-xs">
                        ▼
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two Column Layout: Left (Results list), Right (Beautiful Details panel) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Search Results List */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {loadingProducts ? "Carregando..." : `${filteredProducts.length} produtos encontrados`}
                    </span>
                    {searchQuery || selectedGroup !== "todos" || selectedModel !== "todos" ? (
                      <button 
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedGroup("todos");
                          setSelectedModel("todos");
                          setSelectedProduct(null);
                        }}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        Limpar Filtros
                      </button>
                    ) : null}
                  </div>

                  {loadingProducts ? (
                    <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-3 shadow-sm">
                      <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
                      <p className="text-xs font-medium text-slate-500">Sincronizando banco de dados...</p>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-4 shadow-sm">
                      <div className="text-4xl">🔍</div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Nenhum produto correspondente</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                          Tente digitar outros termos ou mude os filtros para buscar referências diferentes.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-2">
                      {filteredProducts.map((p) => {
                        const discount = calculateDiscount(p.precoAntigo, p.precoNovo);
                        const isSelected = selectedProduct?.referencia === p.referencia;
                        
                        return (
                          <motion.div 
                            key={p.referencia}
                            onClick={() => setSelectedProduct(p)}
                            layoutId={`prod-card-${p.referencia}`}
                            className={`p-4 bg-white rounded-xl border transition-all cursor-pointer flex justify-between items-center ${
                              isSelected 
                                ? "border-indigo-600 ring-2 ring-indigo-500/10 shadow-md" 
                                : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                            }`}
                          >
                            <div className="space-y-1.5 min-w-0 pr-3">
                              <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-bold tracking-wider">
                                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">{p.referencia}</span>
                                <span>•</span>
                                <span className="truncate">{p.grupo}</span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 truncate leading-tight">{p.descricao}</h4>
                              <div className="text-[10px] text-slate-500 font-medium">Modelo: <strong className="text-slate-700">{p.modelo}</strong></div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-sm font-extrabold text-indigo-600">R$ {p.precoNovo.toFixed(2).replace(".", ",")}</div>
                              {discount > 0 && (
                                <div className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded flex items-center justify-end mt-1">
                                  <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                                  -{discount}%
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Main details display on selection */}
                <div className="lg:col-span-7">
                  <AnimatePresence mode="wait">
                    {selectedProduct ? (
                      <motion.div 
                        key={selectedProduct.referencia}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md sticky top-24 space-y-6"
                      >
                        {/* Header Details */}
                        <div className="border-b border-slate-100 pb-5 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-indigo-50 text-indigo-700 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider flex items-center">
                              <Barcode className="h-3.5 w-3.5 mr-1" />
                              Ref: {selectedProduct.referencia}
                            </span>
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase">
                              {selectedProduct.grupo}
                            </span>
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase">
                              {selectedProduct.modelo}
                            </span>
                          </div>

                          <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
                            {selectedProduct.descricao}
                          </h2>
                        </div>

                        {/* Pricing section */}
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Valor na Loja</span>
                            <div className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                              <span className="text-xl font-bold align-super mr-0.5">R$</span>
                              {selectedProduct.precoNovo.toFixed(2).replace(".", ",")}
                            </div>
                          </div>

                          {selectedProduct.precoAntigo > selectedProduct.precoNovo && (
                            <div className="space-y-1 sm:text-right">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Preço de Tabela</span>
                              <div className="text-base text-slate-400 line-through font-bold">
                                R$ {selectedProduct.precoAntigo.toFixed(2).replace(".", ",")}
                              </div>
                              <div className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
                                <TrendingDown className="h-3.5 w-3.5 mr-1" />
                                Economize {calculateDiscount(selectedProduct.precoAntigo, selectedProduct.precoNovo)}% de desconto
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Metadata Details (import / dates) */}
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center">
                            <Info className="h-3.5 w-3.5 mr-1" />
                            Vigência e Informações Extras
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="border border-slate-150 p-4 rounded-xl flex items-center space-x-3">
                              <div className="h-9 w-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                                <Calendar className="h-4 w-4" />
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Início da Promoção</span>
                                <span className="text-xs font-bold text-slate-700">
                                  {importsMap[selectedProduct.importId]?.startDate || "Imediato"}
                                </span>
                              </div>
                            </div>

                            <div className="border border-slate-150 p-4 rounded-xl flex items-center space-x-3">
                              <div className="h-9 w-9 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
                                <Calendar className="h-4 w-4" />
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Término da Promoção</span>
                                <span className="text-xs font-bold text-slate-700">
                                  {importsMap[selectedProduct.importId]?.endDate || "Até acabar o estoque"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-150 text-xs">
                            <div className="flex justify-between py-1.5 border-b border-slate-100">
                              <span className="text-slate-500 font-medium">Lote de Origem</span>
                              <span className="text-slate-700 font-bold truncate max-w-[180px]">{importsMap[selectedProduct.importId]?.fileName || "Importação Manual"}</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500 font-medium">Data de Sincronização</span>
                              <span className="text-slate-700 font-bold">
                                {selectedProduct.importedAt ? new Date(selectedProduct.importedAt).toLocaleDateString("pt-BR") : "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Custom visual touch target helper */}
                        <div className="text-center py-2">
                          <p className="text-[10px] text-slate-400 font-medium italic">Consulte o preço na etiqueta de gôndola para confrontar as informações.</p>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-4 shadow-sm hidden lg:flex flex-col justify-center items-center min-h-[400px]">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                          <Barcode className="h-8 w-8" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-slate-700">Nenhum produto selecionado</h4>
                          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                            Selecione um produto da lista à esquerda ou faça uma busca rápida digitando no campo acima para visualizar os detalhes completos.
                          </p>
                        </div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-slate-400 font-medium">
          <p>© {new Date().getFullYear()} Consulta de Preços. Desenvolvido para agilizar o atendimento na sua loja.</p>
        </div>
      </footer>
    </div>
  );
}
