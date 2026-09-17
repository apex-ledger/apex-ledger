"""Builds a finished Apex Ledger video: title card, your screen recording, end card.

    python build_video.py 01-quick-entry "C:/Users/You/Videos/Captures/recording.mp4"

The folder must hold title.png and end.png (make_cards.py draws them). If the folder also holds
music.mp3, it plays quietly under the whole video. The result is <folder>/final.mp4, 1920x1080,
ready to upload to YouTube; upload captions.srt from the same folder as its subtitles.

Optional: --trim-start 2.5 --trim-end 1.0 cut seconds off the start and end of the recording
(the moment you pressed Windows+Alt+R and the moment you stopped).
"""
import argparse
from pathlib import Path

from moviepy import AudioFileClip, ColorClip, CompositeAudioClip, CompositeVideoClip, ImageClip, VideoFileClip, concatenate_videoclips
from moviepy.audio.fx import AudioFadeOut, MultiplyVolume
from moviepy.video.fx import FadeIn, FadeOut

W, H = 1920, 1080
TITLE_SECONDS, END_SECONDS, FADE = 4.0, 6.0, 0.6


def fit(clip: VideoFileClip) -> CompositeVideoClip:
    """The recording scaled to fit 1920x1080, centred on dark green if its shape differs."""
    scale = min(W / clip.w, H / clip.h)
    scaled = clip.resized(scale)
    background = ColorClip((W, H), color=(11, 74, 46)).with_duration(clip.duration)
    return CompositeVideoClip([background, scaled.with_position("center")], size=(W, H)).with_audio(clip.audio)


def build(folder: Path, recording: Path | None, trim_start: float, trim_end: float, out_name: str) -> Path:
    title = ImageClip(str(folder / "title.png")).with_duration(TITLE_SECONDS).with_effects([FadeIn(FADE), FadeOut(FADE)])
    end = ImageClip(str(folder / "end.png")).with_duration(END_SECONDS).with_effects([FadeIn(FADE)])
    parts = [title]
    if recording:
        rec = VideoFileClip(str(recording))
        rec = rec.subclipped(trim_start, max(trim_start + 1, rec.duration - trim_end))
        parts.append(fit(rec).with_effects([FadeIn(FADE), FadeOut(FADE)]))
    parts.append(end)
    video = concatenate_videoclips(parts, method="compose")

    music_file = folder / "music.mp3"
    if music_file.exists():
        music = AudioFileClip(str(music_file))
        music = music.subclipped(0, min(music.duration, video.duration)).with_effects([MultiplyVolume(0.08), AudioFadeOut(2)])
        video = video.with_audio(CompositeAudioClip([a for a in (video.audio, music) if a is not None]))

    out = folder / out_name
    video.write_videofile(str(out), fps=30, codec="libx264", audio_codec="aac", preset="medium", threads=4, logger=None)
    return out


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("folder", help="the video's folder, e.g. 01-quick-entry")
    p.add_argument("recording", nargs="?", help="your screen recording (.mp4); leave out to preview the cards only")
    p.add_argument("--trim-start", type=float, default=0.0)
    p.add_argument("--trim-end", type=float, default=0.0)
    a = p.parse_args()
    folder = Path(__file__).resolve().parent / a.folder
    rec = Path(a.recording) if a.recording else None
    result = build(folder, rec, a.trim_start, a.trim_end, "final.mp4" if rec else "preview-cards.mp4")
    print("Wrote", result)
