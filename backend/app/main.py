from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from app.tempo_analyzer_by_events import router as tempo_router
from app.music_generator import router as music_router
from app.musicgen_router import router as musicgen_router
from app.ws_server import setup_ws
from app.music_job_router import router as music_job_router
from .hr_router import router as hr_router

app = FastAPI()

# CORS 全解放
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(tempo_router, prefix="/api")
app.include_router(music_router, prefix="/api")
app.include_router(musicgen_router, prefix="/api")
app.include_router(music_job_router, prefix="/api")
app.include_router(hr_router, prefix="/api")

# /static 以下を公開
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount(
    "/static",
    StaticFiles(directory=os.path.join(BASE_DIR, "static")),
    name="static",
)

# JSON テンプレート一覧
@app.get("/api/templates")
def list_templates():
    tpl_dir = os.path.join(BASE_DIR, "static", "templates")
    return [f for f in os.listdir(tpl_dir) if f.endswith(".json")]

# WebSocket 起動時セットアップ
@app.on_event("startup")
async def on_startup():
    setup_ws(app)

# ヘルスチェック
@app.get("/")
def root():
    return {"message": "Backend running"}
