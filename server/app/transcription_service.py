import asyncio
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("transcription_service")

# Lazy-loaded model singleton
_whisper_model = None

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            # Using tiny model for near-instant CPU execution
            logger.info("Loading faster-whisper 'tiny' model...")
            _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
        except Exception as e:
            logger.error(f"Failed to load faster-whisper model: {e}")
            return None
    return _whisper_model

def extract_and_transcribe_clip(audio_path: Path, start: float, duration: float) -> str:
    """Extracts a slice with ffmpeg and transcribes it using faster-whisper."""
    import subprocess
    import tempfile
    import os

    model = get_whisper_model()
    if not model or not audio_path.exists():
        return ""

    temp_wav = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_wav = tmp.name

        # Slice exact segment with ffmpeg (fast copy to uncompressed 16kHz wav)
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(max(0, start)),
            "-t", str(max(0.2, duration)),
            "-i", str(audio_path),
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            temp_wav
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode != 0:
            return ""

        segments, _ = model.transcribe(temp_wav, beam_size=1, language="en")
        text = " ".join([seg.text.strip() for seg in segments]).strip()
        return text

    except Exception as e:
        logger.error(f"Error transcribing clip: {e}")
        return ""
    finally:
        if temp_wav and os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except:
                pass

async def transcribe_clip_async(audio_path: Path, start: float, duration: float) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, extract_and_transcribe_clip, audio_path, start, duration)
