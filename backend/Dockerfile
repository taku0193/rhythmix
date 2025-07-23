# ---------------------------------------------
# CUDA＋PyTorch（2.1.0 + CUDA11.8 + cuDNN8）ランタイム
# ---------------------------------------------
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

WORKDIR /app

# OpenCV / ffmpeg などシステム依存ライブラリ
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Python パッケージ
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコード
# COPY app     ./app
# COPY static  ./static
# COPY videos  ./videos
# COPY scripts ./scripts

# Uvicorn サーバ起動
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
