import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, MessageSquare, Quote } from 'lucide-react';

// A simple, fast markdown and table parser for rendering RAG answers cleanly without heavy dependencies
function FormatMarkdown({ text }) {
  if (!text) return null;
  
  // Split into lines
  const lines = text.split('\n');
  const elements = [];
  
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle Table parsing
    if (line.startsWith('|')) {
      inTable = true;
      const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      // Check if it's separator line
      if (line.includes('---') || line.includes(':---')) {
        continue;
      }
      
      if (tableHeaders.length === 0) {
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable && !line.startsWith('|')) {
      // Table ended, compile it
      elements.push(
        <div key={`table-${i}`} className="table-wrapper" style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
          <table>
            <thead>
              <tr>
                {tableHeaders.map((h, idx) => <th key={idx}>{parseInlineStyle(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => <td key={cellIdx}>{parseInlineStyle(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }

    // Header 3
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ fontSize: '1.15rem', color: 'var(--secondary)', margin: '1rem 0 0.5rem 0' }}>{parseInlineStyle(line.substring(4))}</h3>);
    }
    // Header 4
    else if (line.startsWith('#### ')) {
      elements.push(<h4 key={i} style={{ fontSize: '1rem', color: 'var(--text-main)', margin: '0.8rem 0 0.4rem 0' }}>{parseInlineStyle(line.substring(5))}</h4>);
    }
    // Bullet lists
    else if (line.startsWith('* ') || line.startsWith('- ')) {
      elements.push(
        <li key={i} style={{ marginLeft: '1rem', listStyleType: 'disc', margin: '0.25rem 0' }}>
          {parseInlineStyle(line.substring(2))}
        </li>
      );
    }
    // Numbered lists
    else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/);
      elements.push(
        <li key={i} style={{ marginLeft: '1rem', listStyleType: 'decimal', margin: '0.25rem 0' }}>
          {parseInlineStyle(match[2])}
        </li>
      );
    }
    // Standard paragraph (ignore empty lines)
    else if (line.length > 0) {
      elements.push(<p key={i} style={{ margin: '0.5rem 0' }}>{parseInlineStyle(line)}</p>);
    }
  }

  // If table remains unclosed at the end of text
  if (inTable && tableHeaders.length > 0) {
    elements.push(
      <div key="table-final" className="table-wrapper" style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
        <table>
          <thead>
            <tr>
              {tableHeaders.map((h, idx) => <th key={idx}>{parseInlineStyle(h)}</th>)}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => <td key={cellIdx}>{parseInlineStyle(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <div style={{ wordBreak: 'break-word' }}>{elements}</div>;
}

// Parses **bold** and inline text formatting
function parseInlineStyle(text) {
  if (!text) return '';
  const parts = [];
  let remaining = text;
  
  // Simple regex bold matching
  const boldRegex = /\*\*(.*?)\*\*/g;
  let match;
  let lastIndex = 0;
  let keyIndex = 0;

  while ((match = boldRegex.exec(remaining)) !== null) {
    // Add text before bold
    if (match.index > lastIndex) {
      parts.push(remaining.substring(lastIndex, match.index));
    }
    // Add bold text
    parts.push(
      <strong key={keyIndex++} style={{ color: 'white', fontWeight: '700' }}>
        {match[1]}
      </strong>
    );
    lastIndex = boldRegex.lastIndex;
  }

  if (lastIndex < remaining.length) {
    parts.push(remaining.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function ChatPanel({ messages, isStreaming, onSendMessage }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const presets = [
    "Why did one video get a higher engagement rate than the other?",
    "What's the engagement rate of each?",
    "Compare the hooks in the first 5 seconds.",
    "Who is the creator of each video and what is their follower count?",
    "Suggest improvements for the underperforming video based on the successful one."
  ];

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handlePresetClick = (prompt) => {
    if (isStreaming) return;
    onSendMessage(prompt);
  };

  // Auto-scroll when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <MessageSquare size={18} style={{ color: 'var(--primary)' }} />
        <span className="chat-header-title">Strategic RAG Copilot</span>
        {isStreaming && (
          <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: 'auto' }}>
            <span className="typing-indicator" style={{ padding: 0 }}>
              <span className="typing-dot" style={{ backgroundColor: 'var(--secondary)' }} />
              <span className="typing-dot" style={{ backgroundColor: 'var(--secondary)' }} />
              <span className="typing-dot" style={{ backgroundColor: 'var(--secondary)' }} />
            </span>
            Synthesizing
          </span>
        )}
      </div>

      {/* Suggested Preset Prompt chips */}
      <div className="suggested-prompts-bar">
        {presets.map((preset, idx) => (
          <button 
            key={idx} 
            className="prompt-chip" 
            onClick={() => handlePresetClick(preset)}
            disabled={isStreaming}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Chat Messages Log */}
      <div className="message-list">
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dimmed)', gap: '0.75rem', textAlign: 'center' }}>
            <Sparkles size={32} style={{ color: 'var(--primary)', opacity: 0.7 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Ready to compare performance.</p>
            <p style={{ fontSize: '0.8rem', maxWidth: '300px', lineHeight: 1.4 }}>
              Click any suggested preset above or type your query in the input bar below.
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`message-bubble ${msg.role}`}>
            {/* Formatted body */}
            <FormatMarkdown text={msg.content} />

            {/* Citations block */}
            {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
              <div className="citations-box">
                <div className="citations-label">
                  <Quote size={10} />
                  References Cited
                </div>
                <div className="citations-flex">
                  {msg.citations.map((cit, cIdx) => (
                    <span key={cIdx} className={`citation-tag tag-${cit.video_id}`}>
                      Video {cit.video_id} ({cit.platform}) - Chunk {cit.chunk_index + 1}
                      <span className="citation-tooltip">
                        <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--secondary)', fontSize: '0.75rem' }}>
                          Snippet:
                        </strong>
                        "{cit.snippet}"
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {/* Typing indicator */}
        {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="message-bubble assistant" style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1.25rem' }}>
            <span className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="chat-input-bar">
        <input 
          type="text" 
          className="chat-input"
          placeholder={isStreaming ? "Synthesizing answer..." : "Ask a comparison question..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={isStreaming}
        />
        <button 
          className="chat-send-btn" 
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
