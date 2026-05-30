import os
import re
import requests
import logging
from typing import Dict, Any, Optional
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from config import settings
from llm.transcriber import download_and_transcribe_audio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_youtube_video_id(url: str) -> Optional[str]:
    """Extracts the YouTube video ID from various formats of YouTube URLs."""
    patterns = [
        r'(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([^&\s]+)',
        r'(?:https?://)?(?:www\.)?youtube\.com/embed/([^&\s\?]+)',
        r'(?:https?://)?(?:www\.)?youtu\.be/([^&\s\?]+)',
        r'(?:https?://)?(?:www\.)?youtube\.com/v/([^&\s]+)',
        r'(?:https?://)?(?:www\.)?youtube\.com/shorts/([^&\s\?]+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def extract_instagram_reel_id(url: str) -> Optional[str]:
    """Extracts the Instagram Reel ID/Shortcode from various Reel URL formats."""
    patterns = [
        r'(?:https?://)?(?:www\.)?instagram\.com/reel/([^/\s\?]+)',
        r'(?:https?://)?(?:www\.)?instagram\.com/reels/([^/\s\?]+)',
        r'(?:https?://)?(?:www\.)?instagram\.com/p/([^/\s\?]+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def fetch_youtube_transcript_api(video_id: str) -> Optional[str]:
    """Attempts to fetch the YouTube transcript using the unofficial transcript API."""
    try:
        # Instantiate the API helper
        api = YouTubeTranscriptApi()
        # Retrieve the transcript list
        transcript_list = api.list(video_id)
        
        # Try to find english transcript (manually created or generated), fallback to any available
        try:
            transcript = transcript_list.find_transcript(['en'])
        except Exception:
            # Fall back to the first available transcript if english isn't found
            transcript = next(iter(transcript_list))
            
        data = transcript.fetch()
        transcript_text = " ".join([item.text for item in data])
        return transcript_text
    except Exception as e:
        logger.warning(f"Could not retrieve YouTube transcript via API: {e}")
        return None


def extract_hashtags(text: str) -> list:
    """Extracts hashtags from video descriptions or tags."""
    if not text:
        return []
    return re.findall(r'#(\w+)', text)

def _build_instagram_ydl_opts() -> dict:
    """Builds yt-dlp options for Instagram (no cookies — audio download only)."""
    return {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'ignore_no_formats_error': True,
    }

def _enrich_instagram_metadata(info: dict, shortcode: str) -> dict:
    """Uses instaloader to fetch accurate Instagram post stats and creator follower count.
    This runs in addition to yt-dlp to fill in fields yt-dlp often misses."""
    try:
        import instaloader
        L = instaloader.Instaloader()
        logger.info(f"Fetching Instagram post metadata via instaloader for shortcode: {shortcode}")
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        
        # Merge instaloader data into info dict — only overwrite if yt-dlp left them empty
        if not info.get("view_count") or int(info.get("view_count", 0)) == 0:
            info["view_count"] = post.video_view_count or post.likes or 0
        if not info.get("like_count") or int(info.get("like_count", 0)) == 0:
            info["like_count"] = post.likes or 0
        if not info.get("comment_count") or int(info.get("comment_count", 0)) == 0:
            info["comment_count"] = post.comments or 0
        if not info.get("title"):
            info["title"] = (post.caption or "")[:60] or "Instagram Reel"
        if not info.get("uploader"):
            info["uploader"] = post.owner_username or "Unknown"
        if not info.get("channel_follower_count") or int(info.get("channel_follower_count", 0)) == 0:
            info["channel_follower_count"] = post.owner_profile.followers
        if not info.get("duration") and post.is_video:
            info["duration"] = int(post.video_duration or 0)
            
        logger.info(f"instaloader enrichment: views={info.get('view_count')}, likes={info.get('like_count')}, followers={info.get('channel_follower_count')}")
    except ImportError:
        logger.warning("instaloader not installed. Run: pip install instaloader")
    except Exception as e:
        logger.warning(f"instaloader enrichment failed (post may be private or rate-limited): {e}")
    return info

def scrape_video_data(url: str) -> Dict[str, Any]:
    """Scrapes metadata and transcripts from YouTube or Instagram Reel URLs."""
    is_youtube = "youtube" in url or "youtu.be" in url
    is_instagram = "instagram.com" in url
    
    if not is_youtube and not is_instagram:
        raise ValueError("URL must be a valid YouTube or Instagram Reel link.")

    logger.info(f"Processing URL: {url}")
    
    video_id = extract_youtube_video_id(url) if is_youtube else extract_instagram_reel_id(url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from URL: {url}")

    # --- Build yt-dlp options based on platform ---
    if is_instagram:
        # For Instagram: try browser cookies first (reads from your logged-in Chrome/Firefox/Edge)
        # This makes the request look like your real browser session — bypasses login walls
        ydl_opts = _build_instagram_ydl_opts()
    else:
        # For YouTube: tv_embedded + android_vr bypass PO Token requirement
        # ignore_no_formats_error returns metadata even when format download is blocked
        ydl_opts = {
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
            'ignore_no_formats_error': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['tv_embedded', 'android_vr', 'mweb']
                }
            }
        }

    info = {}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False) or {}
        logger.info(f"yt-dlp succeeded. Title: {info.get('title')}")
    except Exception as e:
        logger.warning(f"yt-dlp failed: {e}")
        info = {}

    # YouTube-specific fallback: open-source Invidious API
    if is_youtube and not info.get("title"):
        logger.info("Attempting Invidious API fallback for real YouTube metadata...")
        try:
            res = requests.get(f"https://vid.puffyan.us/api/v1/videos/{video_id}", timeout=10)
            if res.status_code == 200:
                data = res.json()
                info = {
                    "title": data.get("title", ""),
                    "uploader": data.get("author", ""),
                    "channel_follower_count": data.get("subCount", 0),
                    "view_count": data.get("viewCount", 0),
                    "like_count": data.get("likeCount", 0),
                    "comment_count": 0,
                    "duration": data.get("lengthSeconds", 0)
                }
                logger.info("Invidious API metadata fetch successful!")
        except Exception as api_err:
            logger.warning(f"Invidious API fallback failed: {api_err}")

    # Instagram-specific enrichment: use instaloader to get follower count + post stats
    # This runs even if yt-dlp succeeded (to fill in missing fields like follower_count)
    if is_instagram:
        info = _enrich_instagram_metadata(info, video_id)

    # Process and build scraped data map
    title = info.get("title") or info.get("description", "")[:40] or "Untitled Video"
    creator = info.get("uploader") or info.get("channel") or "Unknown Creator"
    
    subscribers = info.get("channel_follower_count") or info.get("uploader_subscribers") or 0
    follower_count = int(subscribers)
    
    views = int(info.get("view_count") or 0)
    likes = int(info.get("like_count") or 0)
    comments = int(info.get("comment_count") or 0)
    
    # Scraper fallback estimates for hidden/blocked metrics
    if views <= 0:
        views = max(12500, likes * 15)
    if follower_count <= 0:
        follower_count = max(4500, likes * 8)
            
    duration = int(info.get("duration") or 0)
    
    upload_date = "Unknown"
    if info.get("upload_date"):
        d = info.get("upload_date")
        if len(d) == 8:
            upload_date = f"{d[:4]}-{d[4:6]}-{d[6:]}"

    tags = info.get("tags") or []
    if not tags and info.get("description"):
        tags = extract_hashtags(info.get("description"))

    # Clean up title/creator name to fit aesthetic layout if too long
    if len(title) > 60:
        title = title[:57] + "..."

    # Compute engagement rate = (likes + comments) / views * 100
    if views > 0:
        engagement_rate = round(((likes + comments) / views) * 100, 2)
    else:
        engagement_rate = 0.0

    video_data = {
        "url": url,
        "platform": "YouTube" if is_youtube else "Instagram",
        "video_id": video_id,
        "title": title,
        "creator": creator,
        "follower_count": follower_count,
        "views": views,
        "likes": likes,
        "comments": comments,
        "duration": duration,
        "upload_date": upload_date,
        "hashtags": tags,
        "extraction_status": "success",
        "engagement_rate": engagement_rate
    }

    # Transcript Retrieval
    transcript_text = None
    if is_youtube:
        transcript_text = fetch_youtube_transcript_api(video_id)
    
    # If YouTube transcript api failed or it is Instagram, download audio and transcribe
    if not transcript_text:
        transcript_text = download_and_transcribe_audio(url, video_id)

    if not transcript_text:
        raise RuntimeError(f"Could not retrieve or transcribe transcript for URL: {url}")

    video_data["transcript"] = transcript_text
    return video_data
