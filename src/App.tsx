import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Upload, 
  FileText, 
  MessageSquare, 
  ShieldCheck, 
  Loader2, 
  Trash2,
  ChevronRight,
  Info,
  BookOpen,
  Settings,
  Plus,
  Sparkles,
  Database
} from 'lucide-react';
import Markdown from 'react-markdown';
import { ragService, DocumentChunk, Document } from './services/ragService';
import { extractText } from './lib/documentParser';
import { cn } from './lib/utils';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: DocumentChunk[];
  timestamp: Date;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [ingestionProgress, setIngestionProgress] = useState(0);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'library'>('chat');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadDocuments = async () => {
    const docs = await ragService.getDocuments();
    setDocuments(docs);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsIngesting(true);
      setIngestionProgress(0);
      
      const text = await extractText(file);
      if (!text.trim()) throw new Error('The document appears to be empty or could not be read.');

      await ragService.ingestDocument(text, file.name, file.type, (progress) => {
        setIngestionProgress(progress);
      });
      
      await loadDocuments();
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'model',
          text: `Successfully ingested **${file.name}**. I am now ready to answer your questions about the policies in this document.`,
          timestamp: new Date()
        }
      ]);
      setActiveTab('chat');
    } catch (error) {
      console.error('Ingestion error details:', error);
      alert('Failed to process document: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsIngesting(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isAsking || documents.length === 0) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsAsking(true);

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      const { answer, sources } = await ragService.ask(input, history);
      
      const modelMessage: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        text: answer,
        sources,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'model',
          text: "I encountered an error while processing your request. Please try again.",
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document? This will remove all associated knowledge.")) return;
    try {
      await ragService.deleteDocument(id);
      await loadDocuments();
    } catch (error) {
      alert("Failed to delete document");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#fafafa] bg-grid-pattern text-[#09090b] font-sans overflow-hidden">
      {/* Premium Glass Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight text-gradient">Policy Navigator</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Enterprise RAG Edition</p>
          </div>
        </div>
        
        <nav className="flex items-center bg-zinc-100/80 p-1 rounded-xl border border-black/5">
          <button 
            onClick={() => setActiveTab('chat')}
            className={cn(
              "px-5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'chat' ? "bg-white text-violet-600 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            <MessageSquare size={14} />
            Assistant
          </button>
          <button 
            onClick={() => setActiveTab('library')}
            className={cn(
              "px-5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'library' ? "bg-white text-violet-600 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            <Database size={14} />
            Knowledge Base
            {documents.length > 0 && (
              <span className="w-4 h-4 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center text-[10px]">
                {documents.length}
              </span>
            )}
          </button>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-400/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-400/10 blur-[100px] pointer-events-none" />

        {activeTab === 'chat' ? (
          <section className="flex-1 flex flex-col relative max-w-4xl mx-auto w-full z-10">
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <AnimatePresence initial={false}>
                {messages.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto"
                  >
                    <div className="w-24 h-24 bg-white rounded-3xl shadow-xl shadow-violet-500/5 border border-black/5 flex items-center justify-center mb-8 relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 rounded-3xl" />
                      <Sparkles size={40} className="text-violet-500 relative z-10" />
                    </div>
                    <h3 className="text-3xl font-display font-bold mb-3 tracking-tight">How can I assist you?</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed mb-10">
                      {documents.length > 0 
                        ? "I have analyzed your company's knowledge base. Ask me anything about policies, benefits, or internal guidelines."
                        : "Your knowledge base is empty. Please navigate to the Library tab to upload your company handbook."}
                    </p>
                    
                    {documents.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 w-full">
                        {[
                          "What is the maternity leave policy?",
                          "How many days of PTO do I get?",
                          "What are the health insurance benefits?"
                        ].map((q, i) => (
                          <motion.button 
                            key={q}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            onClick={() => setInput(q)}
                            className="px-6 py-4 bg-white/80 backdrop-blur-sm border border-black/5 rounded-2xl text-sm text-left hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5 transition-all flex items-center justify-between group"
                          >
                            <span className="font-medium text-zinc-700">{q}</span>
                            <ChevronRight size={16} className="text-zinc-300 group-hover:text-violet-500 transition-colors" />
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col max-w-[90%] lg:max-w-[85%]",
                        msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div className={cn(
                        "px-6 py-4 rounded-3xl text-sm leading-relaxed shadow-sm",
                        msg.role === 'user' 
                          ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-tr-sm shadow-violet-500/20" 
                          : "bg-white border border-black/5 text-zinc-800 rounded-tl-sm shadow-black/5"
                      )}>
                        <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:text-white">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      </div>
                      
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest w-full mb-1 flex items-center gap-1">
                            <ShieldCheck size={12} className="text-emerald-500" />
                            Grounded Sources
                          </span>
                          {msg.sources.map((source, idx) => (
                            <div key={idx} className="group relative">
                              <div className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-[10px] font-bold text-zinc-500 flex items-center gap-1.5 cursor-help hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all shadow-sm">
                                <FileText size={12} />
                                {source.metadata.source}
                              </div>
                              <div className="absolute bottom-full left-0 mb-2 w-80 p-4 bg-zinc-900 text-zinc-100 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 pointer-events-none">
                                <p className="text-[10px] text-violet-400 font-bold uppercase mb-2 flex items-center gap-1">
                                  <BookOpen size={10} />
                                  Source Excerpt
                                </p>
                                <p className="text-xs text-zinc-300 line-clamp-6 leading-relaxed italic">"{source.text}"</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <span className="text-[10px] text-zinc-400 mt-2 font-bold uppercase tracking-wider">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
              {isAsking && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 text-violet-600 bg-violet-50/80 backdrop-blur-sm border border-violet-100 px-5 py-3 rounded-full w-fit shadow-sm"
                >
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-widest">Synthesizing Answer...</span>
                </motion.div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-transparent">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-[2rem] blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
                <div className="relative bg-white/90 backdrop-blur-xl border border-white/20 rounded-[2rem] shadow-xl flex items-center p-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={documents.length > 0 ? "Ask a question about your policies..." : "Upload a handbook to begin"}
                    disabled={documents.length === 0 || isAsking}
                    className={cn(
                      "flex-1 bg-transparent px-6 py-4 text-sm focus:outline-none placeholder:text-zinc-400",
                      (documents.length === 0 || isAsking) && "opacity-50 cursor-not-allowed"
                    )}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isAsking || documents.length === 0}
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                      (!input.trim() || isAsking || documents.length === 0) 
                        ? "bg-zinc-100 text-zinc-400" 
                        : "bg-zinc-900 text-white hover:bg-violet-600 hover:shadow-lg hover:shadow-violet-500/25 active:scale-95"
                    )}
                  >
                    {isAsking ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                  </button>
                </div>
              </div>
              <p className="text-center text-[10px] text-zinc-400 mt-4 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                <ShieldCheck size={12} className="text-emerald-500" />
                Enterprise-Grade RAG • Powered by Gemini
              </p>
            </div>
          </section>
        ) : (
          <section className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full z-10">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-3xl font-display font-bold text-zinc-900 tracking-tight">Knowledge Base</h2>
                <p className="text-sm text-zinc-500 mt-1">Manage the documents used to power the AI Assistant.</p>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isIngesting}
                className="bg-zinc-900 text-white px-6 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-violet-600 transition-all shadow-lg hover:shadow-violet-500/25 disabled:opacity-50"
              >
                {isIngesting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Add Document
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".pdf,.docx,.txt"
              />
            </div>

            {isIngesting && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-10 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-violet-100 shadow-xl shadow-violet-500/5 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-violet-100">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${ingestionProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center">
                      <Loader2 size={24} className="animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900">Processing Document</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Extracting text and generating high-dimensional embeddings...</p>
                    </div>
                  </div>
                  <span className="text-2xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-fuchsia-600">
                    {Math.round(ingestionProgress)}%
                  </span>
                </div>
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.length === 0 && !isIngesting ? (
                <div className="col-span-full py-24 flex flex-col items-center justify-center text-center bg-white/50 backdrop-blur-sm border-2 border-dashed border-zinc-200 rounded-[2.5rem]">
                  <div className="w-20 h-20 bg-zinc-100 rounded-3xl flex items-center justify-center mb-6">
                    <Database size={32} className="text-zinc-400" />
                  </div>
                  <h4 className="text-xl font-display font-bold text-zinc-800">No documents indexed</h4>
                  <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-2 leading-relaxed">
                    Upload your company handbook, policy PDFs, or text documents to build your AI's knowledge base.
                  </p>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-8 px-6 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-bold text-zinc-700 hover:border-violet-300 hover:text-violet-600 transition-all shadow-sm"
                  >
                    Browse Files
                  </button>
                </div>
              ) : (
                documents.map((doc) => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={doc.id} 
                    className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm hover:shadow-xl hover:shadow-violet-500/5 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 rounded-bl-[100px] -z-10 transition-transform group-hover:scale-110" />
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-14 h-14 bg-zinc-50 text-zinc-400 rounded-2xl flex items-center justify-center group-hover:bg-violet-50 group-hover:text-violet-600 transition-colors border border-black/5">
                        <FileText size={28} />
                      </div>
                      <button 
                        onClick={() => deleteDoc(doc.id)}
                        className="p-2.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        title="Delete Document"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <h4 className="font-bold text-zinc-800 text-lg line-clamp-1 mb-1" title={doc.name}>{doc.name}</h4>
                    <div className="flex items-center gap-3 mt-4">
                      <span className="px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        {doc.type.split('/')[1]?.toUpperCase() || 'DOC'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
