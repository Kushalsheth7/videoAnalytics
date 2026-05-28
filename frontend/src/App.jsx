import React, { useState, useEffect } from 'react';
import { Play, Sparkles, Film, ArrowRight, RefreshCw, Layers } from 'lucide-react';
import VideoCard from './components/VideoCard';
import ChatPanel from './components/ChatPanel';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function App() {
  // Video Inputs - prefilled with real looking test URLs for instant testing
  const [videoAUrl, setVideoAUrl] = useState('https://youtube.com/shorts/3ua57RMmv7Y?si=TU4gNjo9M1X6egtn');
  const [videoBUrl, setVideoBUrl] = useState('https://www.instagram.com/reel/DYmq00Dv9KQ/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==');
  
  // Loading & Ingestion States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [apiStatus, setApiStatus] = useState('connecting');
  
  // Scraped Video Data
  const [videoData, setVideoData] = useState(null);
  
  // Chat RAG state
  const [chatHistory, setChatHistory] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Check API health status on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (response.ok) {
          setApiStatus('online');
        } else {
          setApiStatus('offline');
        }
      } catch (e) {
        setApiStatus('offline');
      }
    };
    checkHealth();
    // Periodically poll health status
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Ingest/Analyze URLs
  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!videoAUrl || !videoBUrl) return;

    setIsLoading(true);
    setVideoData(null);
    setChatHistory([]);
    
    // Simulate steps for the visual vibe check
    setLoadingStep('Scraping video metadata...');
    
    try {
      // Small visual delay to show steps
      await new Promise(r => setTimeout(r, 600));
      setLoadingStep('Downloading and transcribing audio tracks...');
      
      const response = await fetch(`${API_BASE_URL}/api/process-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_a_url: videoAUrl,
          video_b_url: videoBUrl
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Ingestion request failed');
      }

      setLoadingStep('Generating vector chunk embeddings...');
      await new Promise(r => setTimeout(r, 400));
      setLoadingStep('Saving indexed transcripts to ChromaDB...');
      await new Promise(r => setTimeout(r, 300));

      const data = await response.json();
      setVideoData({
        video_a: data.video_a,
        video_b: data.video_b
      });
      
      // Auto welcome query trigger
      setChatHistory([
        { 
          role: 'assistant', 
          content: `### 🤖 Analysis Completed Successfully!\n\nBoth **Video A (${data.video_a.platform})** and **Video B (${data.video_b.platform})** have been scraped, transcribed, chunked, and stored in the vector store.\n\n* **Video A (YouTube)** Engagement: **${data.video_a.engagement_rate}%**\n* **Video B (Instagram)** Engagement: **${data.video_b.engagement_rate}%**\n\nI have created a fully responsive index of their transcripts. Ask me a question, or click one of the suggested prompts above to compare hooks and metrics!`, 
          citations: [] 
        }
      ]);

    } catch (e) {
      console.error(e);
      alert(`Ingestion failed: ${e.message}. The system has fallbacks, please verify backend is running.`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // Re-chunks vector store when edits are saved
  const handleSaveVideoData = async (videoId, transcript, metadata) => {
    const response = await fetch(`${API_BASE_URL}/api/update-video-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        transcript,
        metadata
      })
    });

    if (!response.ok) {
      throw new Error("Re-index failed");
    }

    const resData = await response.json();
    setVideoData(prev => {
      const key = videoId === 'A' ? 'video_a' : 'video_b';
      return {
        ...prev,
        [key]: resData.video_data
      };
    });

    // Notify user in chat about re-indexing
    setChatHistory(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `🔄 **System Note**: Video ${videoId} has been manually edited and re-indexed. Transcript chunks in ChromaDB have been re-split and stored. Calculated engagement is updated to **${resData.video_data.engagement_rate}%**.`,
        citations: []
      }
    ]);
  };

  // RAG Chat flow with streaming + citations
  const handleSendMessage = async (query) => {
    if (isStreaming) return;
    
    // Add User Message
    const updatedHistory = [...chatHistory, { role: 'user', content: query }];
    setChatHistory(updatedHistory);
    setIsStreaming(true);

    try {
      // We pass prior history (excluding our new query)
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          history: chatHistory.map(h => ({ role: h.role, content: h.content })),
          video_a: videoData.video_a,
          video_b: videoData.video_b
        })
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let accumulatedText = '';
      let citations = [];

      // Append assistant placeholder to history
      setChatHistory(prev => [...prev, { role: 'assistant', content: '', citations: [] }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const textChunk = decoder.decode(value);
        const lines = textChunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'citations') {
                citations = data.content;
              } else if (data.type === 'token') {
                accumulatedText += data.content;
                setChatHistory(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    role: 'assistant',
                    content: accumulatedText,
                    citations: citations
                  };
                  return copy;
                });
              } else if (data.type === 'error') {
                accumulatedText += `\n\n[RAG Chain Error: ${data.content}]`;
                setChatHistory(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    role: 'assistant',
                    content: accumulatedText,
                    citations: []
                  };
                  return copy;
                });
              }
            } catch (e) {
              // Ignore partial JSON blocks that fail parsing
            }
          }
        }
      }

    } catch (e) {
      console.error(e);
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ **Error connecting to chat service**: ${e.message}. Check that the backend server is running correctly.`, citations: [] }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="app-header">
        <div className="brand-section">
          <h1 className="brand-logo">
            <Film size={28} style={{ marginRight: '0.5rem', display: 'inline-block', strokeWidth: 2.5 }} />
            creatorjoy
          </h1>
          <span className="brand-subtitle">Strategic RAG Comparison</span>
        </div>
        <div className={`api-status ${apiStatus === 'offline' ? 'offline' : ''}`}>
          <span className="status-dot" />
          Backend API: {apiStatus.toUpperCase()}
        </div>
      </header>

      {/* URL Input Bar Panel */}
      <section className="input-section">
        <form onSubmit={handleAnalyze} className="input-grid">
          <div className="input-group">
            <label className="input-label">
              <Layers size={14} style={{ color: 'var(--primary)' }} />
              Video A URL (YouTube)
            </label>
            <div className="input-field-wrapper">
              <span className="input-icon" style={{ left: '0.95rem', fontSize: '0.9rem' }}>🎥</span>
              <input 
                type="url" 
                className="input-field" 
                placeholder="https://www.youtube.com/watch?v=..." 
                value={videoAUrl}
                onChange={(e) => setVideoAUrl(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">
              <Layers size={14} style={{ color: 'var(--secondary)' }} />
              Video B URL (Instagram Reel)
            </label>
            <div className="input-field-wrapper">
              <span className="input-icon" style={{ left: '0.95rem', fontSize: '0.9rem' }}>📱</span>
              <input 
                type="url" 
                className="input-field" 
                placeholder="https://www.instagram.com/reel/..." 
                value={videoBUrl}
                onChange={(e) => setVideoBUrl(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <button type="submit" className="analyze-button" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="spinner" />
                Processing...
              </>
            ) : (
              <>
                <Play size={16} />
                Ingest & Compare
              </>
            )}
          </button>
        </form>
        
        {/* Loading Step Bar */}
        {isLoading && (
          <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(6, 8, 20, 0.4)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--secondary)', animation: 'pulse 1.5s infinite' }}>
            <RefreshCw size={14} className="spinner" style={{ animationDuration: '2s' }} />
            <span>Active Pipeline: <strong>{loadingStep}</strong></span>
          </div>
        )}
      </section>

      {/* Main Workspace Display Grid */}
      <section className="workspace-grid">
        {!videoData ? (
          <div className="empty-view-wrapper">
            <span className="empty-view-icon">⚡</span>
            <h2 className="empty-view-title">Benchmark Video Performance</h2>
            <p className="empty-view-desc">
              Paste a YouTube URL and an Instagram Reels URL above. We will fetch views, likes, comments, subscriber metrics, transcribe the dialogue, compile a local vector database, and open an interactive comparison dashboard.
            </p>
            <button className="analyze-button" onClick={handleAnalyze} style={{ marginTop: '0.5rem' }}>
              Run Demo Benchmarks
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            {/* Side-by-Side Comparison Cards (Left Side) */}
            <div className="comparison-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'Outfit' }}>Video Performance Metrics</h2>
              </div>
              <div className="videos-grid">
                <VideoCard 
                  video={videoData.video_a} 
                  videoId="A" 
                  onSave={handleSaveVideoData}
                />
                <VideoCard 
                  video={videoData.video_b} 
                  videoId="B" 
                  onSave={handleSaveVideoData}
                />
              </div>
              <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong>Note:</strong> Instagram aggressively blocks headless scrapers. While YouTube data is fetched directly, Instagram <i>Views</i> and <i>Followers</i> are estimated using a fallback formula (based on Likes) if the scraper is blocked. Click the <strong>Edit</strong> button on the card to override with exact metrics!
              </div>
            </div>

            {/* Conversational RAG Panel (Right Side) */}
            <ChatPanel 
              messages={chatHistory} 
              isStreaming={isStreaming} 
              onSendMessage={handleSendMessage}
            />
          </>
        )}
      </section>
    </div>
  );
}
