import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Image as ImageIcon, CheckCircle2, AlertCircle, Download, Loader2, Trash2, ChevronRight, BarChart3, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AnalysisResult {
  baseName: string;
  clsId: number;
  index: number;
  bbox: { x: number; y: number; w: number; h: number };
  percentHorizontal: string;
  classification: string;
  totalValidPixels: number;
  horizontalPixels: number;
  roiImage: string;
  overlayImage: string;
}

export default function App() {
  const [images, setImages] = useState<File[]>([]);
  const [txts, setTxts] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);

  const testConnection = async () => {
    setConnectionStatus('testing');
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setConnectionStatus('ok');
        setTimeout(() => setConnectionStatus('idle'), 3000);
      } else {
        setConnectionStatus('error');
      }
    } catch (err) {
      setConnectionStatus('error');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleTxtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setTxts(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const clearFiles = () => {
    setImages([]);
    setTxts([]);
    setResults([]);
    setError(null);
  };

  const processFiles = async () => {
    if (images.length === 0 || txts.length === 0) {
      setError('Por favor, selecione tanto as imagens quanto os arquivos TXT correspondentes.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    images.forEach(img => formData.append('images', img));
    txts.forEach(txt => formData.append('txts', txt));

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`Erro no servidor: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        if (data.results.length === 0) {
          setError('Nenhum polígono correspondente encontrado nos arquivos TXT.');
        } else {
          setResults(data.results);
        }
      } else {
        setError(data.error || 'Erro ao processar arquivos.');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(`Erro: ${err instanceof Error ? err.message : 'Erro de conexão com o servidor.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (results.length === 0) return;

    const headers = ['Arquivo', 'Classe', 'Índice', 'BBox X', 'BBox Y', 'BBox W', 'BBox H', '% Horizontal', 'Classificação', 'Pixels Válidos', 'Pixels Fissura'];
    const rows = results.map(r => [
      r.baseName,
      r.clsId,
      r.index,
      r.bbox.x,
      r.bbox.y,
      r.bbox.w,
      r.bbox.h,
      r.percentHorizontal,
      r.classification,
      r.totalValidPixels,
      r.horizontalPixels
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'resultados_fissuras.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1a1a1a] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Sleeper Crack Analyzer</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Análise de Dormentes v1.0</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={testConnection}
              className={cn(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                connectionStatus === 'idle' ? "bg-gray-100 text-gray-500 hover:bg-gray-200" :
                connectionStatus === 'testing' ? "bg-blue-100 text-blue-600 animate-pulse" :
                connectionStatus === 'ok' ? "bg-emerald-100 text-emerald-600" :
                "bg-red-100 text-red-600"
              )}
            >
              {connectionStatus === 'idle' && "Testar Conexão"}
              {connectionStatus === 'testing' && "Testando..."}
              {connectionStatus === 'ok' && "Conexão OK"}
              {connectionStatus === 'error' && "Erro de Conexão"}
            </button>
            {results.length > 0 && (
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Download size={16} />
                Exportar CSV
              </button>
            )}
            <button
              onClick={clearFiles}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              title="Limpar tudo"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Column: Controls & Upload */}
          <div className="lg:col-span-4 space-y-8">
            <section className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Upload size={20} className="text-emerald-600" />
                Upload de Dados
              </h2>
              
              <div className="space-y-4">
                <div 
                  onClick={() => imageInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all",
                    images.length > 0 ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200 hover:border-emerald-400 hover:bg-gray-50"
                  )}
                >
                  <input type="file" ref={imageInputRef} onChange={handleImageUpload} multiple accept="image/*" className="hidden" />
                  <ImageIcon className={cn("mx-auto mb-3", images.length > 0 ? "text-emerald-600" : "text-gray-400")} size={32} />
                  <p className="text-sm font-bold">{images.length > 0 ? `${images.length} Imagens selecionadas` : "Selecionar Imagens"}</p>
                  <p className="text-xs text-gray-500 mt-1">PNG, JPG, TIFF</p>
                </div>

                <div 
                  onClick={() => txtInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all",
                    txts.length > 0 ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200 hover:border-emerald-400 hover:bg-gray-50"
                  )}
                >
                  <input type="file" ref={txtInputRef} onChange={handleTxtUpload} multiple accept=".txt" className="hidden" />
                  <FileText className={cn("mx-auto mb-3", txts.length > 0 ? "text-emerald-600" : "text-gray-400")} size={32} />
                  <p className="text-sm font-bold">{txts.length > 0 ? `${txts.length} Arquivos TXT` : "Selecionar Polígonos (.txt)"}</p>
                  <p className="text-xs text-gray-500 mt-1">Formato YOLO/Roboflow</p>
                </div>

                <button
                  onClick={processFiles}
                  disabled={isProcessing || images.length === 0 || txts.length === 0}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2 mt-4"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      Iniciar Análise
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-3 border border-red-100">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
            </section>

            <section className="bg-emerald-900 text-white rounded-3xl p-8 shadow-xl">
              <h3 className="text-sm font-bold uppercase tracking-widest opacity-60 mb-6 flex items-center gap-2">
                <Info size={16} />
                Parâmetros de Referência
              </h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm opacity-80">Limite Crítico</span>
                  <span className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-xs font-bold border border-red-500/30">≥ 11.0%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm opacity-80">Limite Médio</span>
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold border border-amber-500/30">&gt; 8.0%</span>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs opacity-60 leading-relaxed">
                    A análise utiliza detecção de bordas Canny e filtragem direcional para identificar fissuras horizontais em regiões de interesse (ROI).
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {results.length > 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-bold tracking-tight">Resultados da Análise</h2>
                    <span className="px-4 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600">
                      {results.length} Detecções Encontradas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {results.map((res, idx) => (
                      <motion.div
                        key={`${res.baseName}-${res.index}`}
                        layoutId={`${res.baseName}-${res.index}`}
                        onClick={() => setSelectedResult(res)}
                        className={cn(
                          "bg-white rounded-3xl p-6 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all group relative overflow-hidden",
                          selectedResult === res && "ring-2 ring-emerald-500 shadow-lg"
                        )}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{res.baseName}</p>
                            <h3 className="font-bold text-lg">Polígono #{res.index + 1}</h3>
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                            res.classification === 'ruim' ? "bg-red-100 text-red-600" :
                            res.classification === 'médio' ? "bg-amber-100 text-amber-600" :
                            "bg-emerald-100 text-emerald-600"
                          )}>
                            {res.classification}
                          </div>
                        </div>

                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-100 mb-4">
                          <img src={res.overlayImage} alt="Overlay" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white text-xs font-bold flex items-center gap-1">
                              Ver Detalhes <ChevronRight size={14} />
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-50 rounded-2xl p-3">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Fissura</p>
                            <p className="text-xl font-black text-emerald-600">{res.percentHorizontal}%</p>
                          </div>
                          <div className="bg-gray-50 rounded-2xl p-3">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Pixels</p>
                            <p className="text-xl font-black text-gray-700">{res.horizontalPixels}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="h-[600px] bg-white rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center p-12">
                  <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-8">
                    <BarChart3 size={48} />
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Aguardando Dados</h2>
                  <p className="text-gray-500 max-w-md leading-relaxed">
                    Faça o upload das imagens dos dormentes e seus respectivos polígonos de anotação para iniciar o processamento automatizado.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedResult(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-5xl rounded-[40px] overflow-hidden relative z-10 shadow-2xl"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
                <div className="p-10 space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Detalhes da Análise</p>
                      <h2 className="text-3xl font-black tracking-tight">{selectedResult.baseName}</h2>
                    </div>
                    <button 
                      onClick={() => setSelectedResult(null)}
                      className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                    >
                      <ChevronRight size={20} className="rotate-90" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase">Classificação</p>
                      <p className={cn(
                        "text-2xl font-black uppercase tracking-tighter",
                        selectedResult.classification === 'ruim' ? "text-red-600" :
                        selectedResult.classification === 'médio' ? "text-amber-600" :
                        "text-emerald-600"
                      )}>
                        {selectedResult.classification}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase">Percentual Horizontal</p>
                      <p className="text-2xl font-black text-gray-900">{selectedResult.percentHorizontal}%</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs text-gray-400 font-bold uppercase">Métricas Detalhadas</p>
                    <div className="bg-gray-50 rounded-3xl p-6 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Pixels de Fissura</span>
                        <span className="font-bold">{selectedResult.horizontalPixels} px</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Área Válida Total</span>
                        <span className="font-bold">{selectedResult.totalValidPixels} px</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">ID da Classe</span>
                        <span className="font-bold">{selectedResult.clsId}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Bounding Box</span>
                        <span className="font-mono text-xs bg-white px-2 py-1 rounded border border-gray-200">
                          {selectedResult.bbox.w}x{selectedResult.bbox.h} @ {selectedResult.bbox.x},{selectedResult.bbox.y}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6">
                    <button 
                      onClick={() => setSelectedResult(null)}
                      className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-colors"
                    >
                      Fechar Detalhes
                    </button>
                  </div>
                </div>

                <div className="bg-gray-100 p-10 flex flex-col gap-6">
                  <div className="flex-1 space-y-4">
                    <p className="text-xs text-gray-400 font-bold uppercase">Visualização de Overlay</p>
                    <div className="aspect-square rounded-3xl overflow-hidden shadow-inner bg-white border border-gray-200">
                      <img src={selectedResult.overlayImage} alt="Overlay Full" className="w-full h-full object-contain" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">ROI Original</p>
                      <div className="aspect-video rounded-xl overflow-hidden bg-white border border-gray-200">
                        <img src={selectedResult.roiImage} alt="ROI" className="w-full h-full object-cover" />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <a 
                        href={selectedResult.overlayImage} 
                        download={`${selectedResult.baseName}_analise.png`}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                      >
                        <Download size={14} />
                        Baixar Overlay
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
