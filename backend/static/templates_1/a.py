import json
import numpy as np
import pandas as pd

# --- Step 0: データの読み込み ---
with open('2.json', 'r') as f:
    data = json.load(f)

# 扱いやすいようにランドマークをNumpy配列に変換
all_landmarks_list = []
for frame in data:
    frame_landmarks = []
    for landmark in frame['landmarks']:
        frame_landmarks.append([landmark['x'], landmark['y'], landmark['z']])
    all_landmarks_list.append(frame_landmarks)

all_landmarks_np = np.array(all_landmarks_list)
# shape: (フレーム数, ランドマーク数, 3[x,y,z])

# --- Step 1: 平滑化 (移動平均) ---
# pandas DataFrameに変換してローリング平均を適用
# 各ランドマーク、各座標(x,y,z)ごとに独立して平滑化
df = pd.DataFrame(all_landmarks_np.reshape(all_landmarks_np.shape[0], -1))
smoothed_df = df.rolling(window=9, center=True, min_periods=1).mean()
smoothed_landmarks = smoothed_df.values.reshape(all_landmarks_np.shape)


# --- Step 2: 正規化 ---
normalized_landmarks = []
for frame_landmarks in smoothed_landmarks:
    # 2-1. 位置の正規化 (センタリング)
    hip_center = (frame_landmarks[23] + frame_landmarks[24]) / 2
    centered_landmarks = frame_landmarks - hip_center

    # 2-2. 回転の正規化 (アライメント)
    # 腰のラインを基準に角度を計算 (2Dで計算を簡略化)
    hip_line = centered_landmarks[24] - centered_landmarks[23]
    angle = np.arctan2(hip_line[1], hip_line[0]) # y/x
    
    # 回転行列を作成
    rotation_matrix = np.array([
        [np.cos(-angle), -np.sin(-angle), 0],
        [np.sin(-angle),  np.cos(-angle), 0],
        [0, 0, 1]
    ])
    
    # 全てのランドマークを回転
    rotated_landmarks = np.dot(centered_landmarks, rotation_matrix.T)

    # 2-3. 大きさの正規化 (スケーリング)
    shoulder_dist = np.linalg.norm(rotated_landmarks[12] - rotated_landmarks[11])
    if shoulder_dist > 1e-5: # ゼロ除算を避ける
        scaled_landmarks = rotated_landmarks / shoulder_dist
    else:
        scaled_landmarks = rotated_landmarks

    normalized_landmarks.append(scaled_landmarks)

final_processed_data = np.array(normalized_landmarks)

# --- Step 3: 処理済みデータを新しいJSONに保存 ---

output_data = []
# 元のJSONのフレームIDを流用するため、元のデータ(data)も一緒にループ処理します
for i, (frame_data, processed_landmarks) in enumerate(zip(data, final_processed_data)):
    new_landmarks = []
    # 元のランドマークのvisibility情報を流用します
    for j, landmark_coords in enumerate(processed_landmarks):
        new_landmarks.append({
            'x': landmark_coords[0],
            'y': landmark_coords[1],
            'z': landmark_coords[2],
            'visibility': frame_data['landmarks'][j].get('visibility', 1.0) # 元のvisibilityを取得
        })
    
    output_data.append({
        'frame_id': frame_data.get('frame_id', i), # 元のフレームIDを取得
        'landmarks': new_landmarks
    })

# 新しいJSONファイルとして保存
output_filename = 'ダイアゴナル.json'
with open(output_filename, 'w') as f:
    json.dump(output_data, f, indent=4)

print(f"\n処理済みデータが '{output_filename}' として保存されました。")
print("処理後のデータshape:", final_processed_data.shape)