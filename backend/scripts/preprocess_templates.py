import os
import json
from app.video_processor import extract_skeleton_sequence

def main():
    # Host directory structure: /app/scripts is mounted from backend/scripts
    video_dir = os.path.join(os.getcwd(), 'videos')
    out_dir = os.path.join(os.getcwd(), 'static', 'templates')
    os.makedirs(out_dir, exist_ok=True)
    for fname in os.listdir(video_dir):
        if fname.lower().endswith('.mp4'):
            path = os.path.join(video_dir, fname)
            print(f"Processing video: {path}")
            seq = extract_skeleton_sequence(path)
            out_path = os.path.join(out_dir, fname.replace('.mp4', '.json'))
            with open(out_path, 'w') as f:
                json.dump(seq, f)
            print(f"Generated template: {out_path}")

if __name__ == '__main__':
    main()
