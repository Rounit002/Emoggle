from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import asyncio
import os
import base64
import json
import random
import re
from dotenv import load_dotenv

load_dotenv(override=True)

app = FastAPI(title="Emoggle - AI Judge", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
JUDGE_MODE = os.environ.get("JUDGE_MODE", "random").lower()

_gemini_model = None


def get_gemini_model():
    global _gemini_model
    if _gemini_model is None and GEMINI_API_KEY:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        _gemini_model = genai.GenerativeModel(GEMINI_MODEL)
    return _gemini_model


class JudgeRequest(BaseModel):
    image: str


class OutfitItem(BaseModel):
    name: str
    status: str
    reason: str


class JudgeResponse(BaseModel):
    score: float
    verdict: str
    roast: str
    items: list[OutfitItem]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode": JUDGE_MODE,
        "gemini": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
    }


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
    cleaned = re.sub(r"^data:image/[^;]+;base64,", "", image_b64.strip())
    try:
        image_bytes = base64.b64decode(cleaned, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload") from exc

    if image_bytes.startswith(b"\xff\xd8\xff"):
        return image_bytes, "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return image_bytes, "image/png"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return image_bytes, "image/webp"
    return image_bytes, "image/jpeg"


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
        await asyncio.sleep(random.uniform(3, 6))
        return judge_fallback()

    if not GEMINI_API_KEY:
        await asyncio.sleep(random.uniform(3, 6))
        return judge_fallback()

    try:
        return await judge_with_gemini(payload.image)
    except Exception as exc:
        print(f"[Gemini error] {exc}")
        await asyncio.sleep(random.uniform(3, 6))
        return judge_fallback()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
