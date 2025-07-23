import cv2
import mediapipe as mp

mp_pose = mp.solutions.pose

def extract_skeleton_sequence(video_path: str):
    cap = cv2.VideoCapture(video_path)
    with mp_pose.Pose(static_image_mode=False,
                      model_complexity=1,
                      enable_segmentation=False,
                      min_detection_confidence=0.5,
                      min_tracking_confidence=0.5) as pose:
        sequence = []
        while True:
            ret, frame = cap.read()
            if not ret: break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = pose.process(rgb)
            if res.pose_landmarks:
                pts = {lm.name: (lm.x, lm.y)
                       for lm in res.pose_landmarks.landmark}
            else:
                pts = {}
            sequence.append(pts)
        cap.release()
    return sequence