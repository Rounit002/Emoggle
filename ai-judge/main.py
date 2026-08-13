from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn
import asyncio
import os
import base64
import binascii
import hmac
import io
import json
import random
import re
import time
from collections import defaultdict, deque
from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError

load_dotenv(override=False)

IS_PRODUCTION = os.environ.get("ENVIRONMENT", "development").lower() == "production"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
AI_JUDGE_SHARED_SECRET = os.environ.get("AI_JUDGE_SHARED_SECRET", "")
MAX_REQUEST_BYTES = 1_000_000
MAX_ENCODED_IMAGE_CHARS = 900_000
MAX_DECODED_IMAGE_BYTES = 650_000
MAX_IMAGE_PIXELS = 4_000_000
REQUESTS_PER_MINUTE = 10

app = FastAPI(
    title="Emoggle - AI Judge",
    version="0.4.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-AI-Judge-Key"],
    )

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
JUDGE_MODE = os.environ.get("JUDGE_MODE", "random").lower()

_gemini_model = None
_judge_slots = asyncio.Semaphore(max(1, int(os.environ.get("MAX_CONCURRENT_JUDGES", "2"))))
_request_times: dict[str, deque[float]] = defaultdict(deque)


def get_gemini_model():
    global _gemini_model
    if _gemini_model is None and GEMINI_API_KEY:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        _gemini_model = genai.GenerativeModel(GEMINI_MODEL)
    return _gemini_model


class JudgeRequest(BaseModel):
    image: str = Field(min_length=4, max_length=MAX_ENCODED_IMAGE_CHARS)


class OutfitItem(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    status: str = Field(pattern="^(Drip|Drown)$")
    reason: str = Field(min_length=1, max_length=160)


class JudgeResponse(BaseModel):
    score: float = Field(ge=1.0, le=10.0)
    verdict: str = Field(pattern="^(Drip|Drown)$")
    roast: str = Field(min_length=1, max_length=280)
    items: list[OutfitItem] = Field(min_length=1, max_length=4)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if request.url.path == "/judge":
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REQUEST_BYTES:
                    return JSONResponse(status_code=413, content={"detail": "Request too large"})
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})

        supplied_key = request.headers.get("x-ai-judge-key", "")
        if len(AI_JUDGE_SHARED_SECRET.encode("utf-8")) < 32 or not hmac.compare_digest(
            supplied_key.encode("utf-8"), AI_JUDGE_SHARED_SECRET.encode("utf-8")
        ):
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})

        client_key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        timestamps = _request_times[client_key]
        while timestamps and now - timestamps[0] >= 60:
            timestamps.popleft()
        if len(timestamps) >= REQUESTS_PER_MINUTE:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
        timestamps.append(now)
        if len(_request_times) > 10_000:
            cutoff = now - 60
            stale_keys = [
                key for key, values in _request_times.items()
                if not values or values[-1] < cutoff
            ]
            for key in stale_keys:
                _request_times.pop(key, None)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


GEMINI_PROMPT = """You are a sharp but fair AI fashion critic judging a real outfit from a photo or webcam frame.

Score only from visible evidence in the image. Do not guess hidden clothing. If the frame only shows the upper body, judge the visible outfit and mention that lower-body items are not visible.

Inspect every visible styling aspect:
- eyewear or goggles/sunglasses, if present
- shirt/T-shirt color, collar, graphics, stripes, logos, and patterns
- jacket, hoodie, layers, or visible outerwear
- accessories such as chains, watches, hats, bags, microphones, or props
- color harmony, contrast, pattern mixing, silhouette, fit, grooming, and overall coordination
- photo limitations such as blur, crop, low light, or obstruction

Return ONLY a valid JSON object with this exact structure:
{
  "score": <float between 1.0 and 10.0, one decimal place>,
  "verdict": "<Drip or Drown>",
  "roast": "<one punchy sentence based on visible outfit details, max 22 words>",
  "items": [
    {"name": "<specific visible item/aspect>", "status": "<Drip or Drown>", "reason": "<specific reason, max 12 words>"},
    {"name": "<specific visible item/aspect>", "status": "<Drip or Drown>", "reason": "<specific reason, max 12 words>"},
    {"name": "<specific visible item/aspect>", "status": "<Drip or Drown>", "reason": "<specific reason, max 12 words>"},
    {"name": "<specific visible item/aspect>", "status": "<Drip or Drown>", "reason": "<specific reason, max 12 words>"}
  ]
}

Scoring guide:
- 8.0-10.0: Exceptional outfit, clearly put together with intention
- 6.0-7.9: Good outfit, mostly works
- 4.0-5.9: Average, some hits and misses
- 2.0-3.9: Struggling, multiple issues
- 1.0-1.9: Fashion emergency

Be consistent: the same image should receive nearly the same score every time. Be specific about what you actually see. Do not be generic."""


def decode_image(image_b64: str) -> tuple[bytes, str]:
    if len(image_b64) > MAX_ENCODED_IMAGE_CHARS:
        raise HTTPException(status_code=413, detail="Image payload too large")
    cleaned = re.sub(r"^data:image/[^;]+;base64,", "", image_b64.strip())
    try:
        image_bytes = base64.b64decode(cleaned, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload") from exc

    if not image_bytes or len(image_bytes) > MAX_DECODED_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Decoded image is too large")

    if image_bytes.startswith(b"\xff\xd8\xff"):
        mime_type = "image/jpeg"
    elif image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        mime_type = "image/png"
    elif image_bytes.startswith(b"RIFF") and len(image_bytes) >= 12 and image_bytes[8:12] == b"WEBP":
        mime_type = "image/webp"
    else:
        raise HTTPException(status_code=400, detail="Unsupported image format")

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large")
            image.verify()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid image data") from exc

    return image_bytes, mime_type


def clean_json(raw: str) -> dict:
    raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw.strip())
    raw = re.sub(r"\n?```$", "", raw.strip())
    return json.loads(raw)


async def judge_with_gemini(image_b64: str) -> JudgeResponse:
    model = get_gemini_model()
    if model is None:
        raise RuntimeError("No Gemini API key")

    image_bytes, mime_type = decode_image(image_b64)
    loop = asyncio.get_event_loop()

    def _call():
        response = model.generate_content(
            [
                GEMINI_PROMPT,
                {"mime_type": mime_type, "data": image_bytes},
            ],
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.15,
                "max_output_tokens": 600,
            },
        )
        return response.text

    raw = await loop.run_in_executor(None, _call)
    data = clean_json(raw)

    score = round(float(data["score"]), 1)
    score = max(1.0, min(10.0, score))
    verdict = str(data.get("verdict") or ("Drip" if score >= 5.0 else "Drown"))
    verdict = "Drip" if verdict.lower() == "drip" else "Drown"

    items = [
        OutfitItem(
            name=str(item["name"]),
            status="Drip" if str(item.get("status", verdict)).lower() == "drip" else "Drown",
            reason=str(item["reason"]),
        )
        for item in data.get("items", [])[:4]
    ]

    if not items:
        items = [
            OutfitItem(
                name="visible outfit",
                status=verdict,
                reason="AI returned no detailed item breakdown.",
            )
        ]

    return JudgeResponse(
        score=score,
        verdict=verdict,
        roast=str(data["roast"]),
        items=items,
    )


def judge_fallback() -> JudgeResponse:
    is_drip = random.random() > 0.5
    if is_drip:
        score = round(random.uniform(6.5, 9.8), 1)
        verdict = "Drip"
        roast = random.choice([
            "Okay, we see you. Clean lines, confident energy, zero cringe.",
            "You clearly left the house with intention today. Respect.",
            "This is what dressing like you mean it looks like. Certified.",
        ])
        items = [
            OutfitItem(name="top", status="Drip", reason="Colour palette? Immaculate."),
            OutfitItem(name="bottoms", status="Drip", reason="Fit is chef's kiss."),
            OutfitItem(name="shoes", status="Drip", reason="Carrying the whole look."),
        ]
    else:
        score = round(random.uniform(1.5, 4.9), 1)
        verdict = "Drown"
        roast = random.choice([
            "You got dressed in the dark. The AI is physically pained.",
            "Babe, this is not it. Even H&M's mannequin feels attacked.",
            "Three separate things happening here - none of them talking.",
        ])
        items = [
            OutfitItem(name="top", status="Drown", reason="Colour fighting everything and losing."),
            OutfitItem(name="bottoms", status="Drown", reason="Proportions off in every direction."),
            OutfitItem(name="shoes", status="Drown", reason="These are crying for help."),
        ]
    return JudgeResponse(score=score, verdict=verdict, roast=roast, items=items)


@app.post("/judge", response_model=JudgeResponse)
async def judge(payload: JudgeRequest):
    decode_image(payload.image)

    if JUDGE_MODE != "ai":
        return judge_fallback()

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="AI judge is not configured")

    try:
        await asyncio.wait_for(_judge_slots.acquire(), timeout=1.0)
    except TimeoutError as exc:
        raise HTTPException(status_code=503, detail="AI judge is busy") from exc

    try:
        return await asyncio.wait_for(judge_with_gemini(payload.image), timeout=18.0)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="AI judge timed out") from exc
    except Exception as exc:
        print(f"[Gemini error] {type(exc).__name__}")
        raise HTTPException(status_code=502, detail="AI judge failed") from exc
    finally:
        _judge_slots.release()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("DEBUG_RELOAD", "false").lower() == "true" and not IS_PRODUCTION,
        proxy_headers=True,
        forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1"),
    )
