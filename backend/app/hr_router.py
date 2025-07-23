# backend/app/hr_router.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .hr_logger import log_hr
import traceback, sys

router = APIRouter()

class HRBody(BaseModel):
    hr: float | None = Field(None, description="bpm")
    confidence: float | None = None

@router.post("/hr")
async def post_hr(body: HRBody):
    try:
        log_hr(body.hr, "rppg", extra={"confidence": body.confidence})
        return {"ok": True}
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(500, f"HR log failed: {e}")
