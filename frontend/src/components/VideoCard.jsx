import React, { useState } from 'react';
import { Youtube, Instagram, Edit3, Save, X, Calendar, Clock, Sparkles, AlertCircle } from 'lucide-react';

export default function VideoCard({ video, videoId, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  
  // State for form fields
  const [title, setTitle] = useState(video.title);
  const [creator, setCreator] = useState(video.creator);
  const [views, setViews] = useState(video.views);
  const [likes, setLikes] = useState(video.likes);
  const [comments, setComments] = useState(video.comments);
  const [followerCount, setFollowerCount] = useState(video.follower_count);
  const [duration, setDuration] = useState(video.duration);
  const [transcript, setTranscript] = useState(video.transcript);
  const [isSaving, setIsSaving] = useState(false);

  const formatViews = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedMetadata = {
        ...video,
        title,
        creator,
        views: parseInt(views) || 0,
        likes: parseInt(likes) || 0,
        comments: parseInt(comments) || 0,
        follower_count: parseInt(followerCount) || 0,
        duration: parseInt(duration) || 0,
      };

      await onSave(videoId, transcript, updatedMetadata);
      setIsEditing(false);
    } catch (e) {
      console.error("Save error:", e);
      alert("Failed to update video metadata and re-index vector store.");
    } finally {
      setIsSaving(false);
    }
  };

  const isYouTube = video.platform.toLowerCase() === 'youtube';

  return (
    <div className={`video-card card-${videoId}`}>
      {/* Platform and Video Tag Header */}
      <div className="card-header">
        <span className="platform-badge">
          {isYouTube ? <Youtube size={14} /> : <Instagram size={14} />}
          {video.platform}
        </span>
        <span className="platform-badge" style={{ fontWeight: 800 }}>
          Video {videoId}
        </span>
      </div>

      {/* Warning/Alert if Scraper had issues */}
      {video.extraction_status !== 'success' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(255, 159, 67, 0.08)',
          border: '1px solid rgba(255, 159, 67, 0.25)',
          padding: '0.6rem 0.8rem',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#ff9f43',
          lineHeight: 1.4
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>
            {video.extraction_status === 'failed' 
              ? "Scraper blocked! Showing simulated metadata. Click Edit below to input actual metrics & transcript."
              : "Scraper partially completed. Click Edit below to verify and complete transcripts."}
          </span>
        </div>
      )}

      {/* Title & Creator */}
      <div>
        <h3 className="video-title" title={video.title}>{video.title}</h3>
        <div className="creator-info" style={{ marginTop: '0.5rem' }}>
          <span className="creator-name">@{video.creator}</span>
          <span className="follower-count">
            {formatViews(video.follower_count)} followers
            {video.platform === 'Instagram' && <span style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginLeft: '0.25rem', fontWeight: 400, cursor: 'help' }} title="Estimated using formula: max(4500, Likes × 8)">(est.)</span>}
          </span>
        </div>
      </div>

      {/* Metrics Layout Grid */}
      <div className="metrics-section">
        <div className="metric-box">
          <span className="metric-label">Views</span>
          <span className="metric-value">
            {formatViews(video.views)}
            {video.platform === 'Instagram' && <span style={{ fontSize: '0.65em', color: 'var(--text-muted)', marginLeft: '0.25rem', fontWeight: 400, cursor: 'help' }} title="Estimated using formula: max(12500, Likes × 15)">(est.)</span>}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Duration</span>
          <span className="metric-value" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Clock size={12} style={{ color: 'var(--text-dimmed)' }} />
            {formatDuration(video.duration)}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Likes</span>
          <span className="metric-value">{formatViews(video.likes)}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Comments</span>
          <span className="metric-value">{formatViews(video.comments)}</span>
        </div>
        <div className="metric-box engagement-metric">
          <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Sparkles size={11} style={{ color: 'currentColor' }} />
            Engagement Rate
          </span>
          <span className="engagement-rate-glow">{video.engagement_rate}%</span>
        </div>
      </div>

      {/* Hashtags display */}
      {video.hashtags && video.hashtags.length > 0 && (
        <div className="hashtags-container">
          {video.hashtags.slice(0, 4).map((tag, idx) => (
            <span key={idx} className="hashtag-tag">#{tag}</span>
          ))}
        </div>
      )}

      {/* Edit Drawer Trigger */}
      {!isEditing && (
        <button className="edit-trigger-btn" onClick={() => setIsEditing(true)}>
          <Edit3 size={14} />
          Edit Metadata & Transcript
        </button>
      )}

      {/* Expanded Accordion Drawer for Manual Edits */}
      {isEditing && (
        <div className="edit-drawer">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>Manual Data Overrides</span>
            <X size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setIsEditing(false)} />
          </div>
          
          <div className="drawer-grid">
            <div className="drawer-input-group" style={{ gridColumn: 'span 2' }}>
              <label className="drawer-label">Video Title</label>
              <input type="text" className="drawer-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="drawer-input-group">
              <label className="drawer-label">Creator Username</label>
              <input type="text" className="drawer-input" value={creator} onChange={(e) => setCreator(e.target.value)} />
            </div>
            
            <div className="drawer-input-group">
              <label className="drawer-label">Followers count</label>
              <input type="number" className="drawer-input" value={followerCount} onChange={(e) => setFollowerCount(e.target.value)} />
            </div>

            <div className="drawer-input-group">
              <label className="drawer-label">Views</label>
              <input type="number" className="drawer-input" value={views} onChange={(e) => setViews(e.target.value)} />
            </div>
            
            <div className="drawer-input-group">
              <label className="drawer-label">Duration (sec)</label>
              <input type="number" className="drawer-input" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>

            <div className="drawer-input-group">
              <label className="drawer-label">Likes</label>
              <input type="number" className="drawer-input" value={likes} onChange={(e) => setLikes(e.target.value)} />
            </div>
            
            <div className="drawer-input-group">
              <label className="drawer-label">Comments</label>
              <input type="number" className="drawer-input" value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>

            <div className="drawer-input-group" style={{ gridColumn: 'span 2' }}>
              <label className="drawer-label">Video Transcript (Re-chunks Vector Store)</label>
              <textarea 
                className="drawer-input drawer-textarea" 
                value={transcript} 
                onChange={(e) => setTranscript(e.target.value)}
              />
            </div>
          </div>

          <div className="drawer-actions">
            <button className="drawer-btn cancel" disabled={isSaving} onClick={() => setIsEditing(false)}>
              Cancel
            </button>
            <button className="drawer-btn save" disabled={isSaving} onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {isSaving ? <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} /> : <Save size={12} />}
              {isSaving ? 'Re-indexing...' : 'Save & Re-Index'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
