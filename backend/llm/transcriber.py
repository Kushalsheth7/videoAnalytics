import os
import tempfile
import logging
import yt_dlp
from llm.core import get_groq_client

logger = logging.getLogger(__name__)

def download_and_transcribe_audio(url: str, video_id: str) -> str:
    """Downloads audio using yt-dlp and transcribes it using Groq's free Whisper API."""
    
    # Initialize centralized Groq client
    client = get_groq_client()
    temp_dir = tempfile.gettempdir()
    # Define output path
    output_template = os.path.join(temp_dir, f"transcribe_{video_id}_%(id)s.%(ext)s")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }

    logger.info(f"Downloading audio from {url} for transcription...")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        # yt-dlp prepare_filename gives original audio path, the postprocessor outputs .mp3
        mp3_path = os.path.splitext(filename)[0] + ".mp3"

    if not os.path.exists(mp3_path):
        raise FileNotFoundError(f"Audio file was not created: {mp3_path}")

    logger.info(f"Transcribing audio file {mp3_path} using Groq Whisper...")
    try:
        with open(mp3_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file
            )
        return response.text
    finally:
        # Cleanup
        try:
            if os.path.exists(mp3_path):
                os.remove(mp3_path)
                logger.info("Cleaned up downloaded audio file.")
        except Exception as e:
            logger.warning(f"Failed to delete temp file {mp3_path}: {e}")
