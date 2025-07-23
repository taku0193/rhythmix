import librosa
import soundfile as sf

def time_stretch(input_path: str, output_path: str, target_duration: float):
    y, sr = librosa.load(input_path, sr=None)
    original_duration = len(y) / sr
    rate = original_duration / target_duration if target_duration > 0 else 1.0
    y_stretched = librosa.effects.time_stretch(y, rate)
    sf.write(output_path, y_stretched, sr)