"""Art & Infographic service: prompt crafter, structured infographic extraction, and rendering.

Handles:
1. Visual style & mood presets.
2. AI-assisted prompt crafting honoring tradition lens and imagery policies.
3. Structured infographic data extraction from commentary (pillars, thesis, walkaway).
4. Zero-cost native SVG infographic synthesis.
5. Image generation execution across providers (Fal.ai, Replicate, Gemini, Pollinations / SVG).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
from dataclasses import asdict, dataclass
from typing import Any, Optional

import httpx
from sqlmodel import Session, select

from app.config import get_settings
from app.config.providers import get_registry
from app.db import get_engine
from app.models import Asset, Study, StudyDay, UsageLedger
from app.services import events
from app.services.llm import complete, LLMResult
from app.services.prompts import build_system, get_imagery_policy, get_tradition

logger = logging.getLogger(__name__)

STYLE_PRESETS = [
    {
        "id": "classical_oil",
        "label": "Classical Oil Painting",
        "description": "Rich chiaroscuro, warm golden light, museum masterwork, reverent biblical composition",
        "prompt_suffix": "classical oil painting masterpiece, rich dramatic chiaroscuro lighting, deep warm earth tones and luminous gold highlights, museum oil on canvas texture, reverent fine art composition",
    },
    {
        "id": "watercolor",
        "label": "Luminous Watercolor",
        "description": "Soft atmospheric watercolor, translucent washes, evocative light, contemplative and serene",
        "prompt_suffix": "luminous atmospheric watercolor on cold-press textured paper, delicate translucent color washes, soft contemplative ambient light, serene spiritual serenity, fine art illustration",
    },
    {
        "id": "stained_glass",
        "label": "Cathedral Stained Glass",
        "description": "Radiant cathedral stained glass, rich jewel tones, devotional sacred art aesthetic",
        "prompt_suffix": "glowing cathedral stained glass window, intricate leaded glass linework, radiant ruby sapphire and amber jewel tones, sunlight streaming through colored glass, sacred devotional aesthetic",
    },
    {
        "id": "woodcut_manuscript",
        "label": "Illuminated Woodcut",
        "description": "Medieval woodcut engraving, illuminated manuscript detailing, timeless aesthetic",
        "prompt_suffix": "detailed vintage woodcut engraving, illuminated manuscript style, intricate crosshatching linework, aged parchment paper texture, gold leaf accents, timeless sacred art",
    },
    {
        "id": "modern_minimalist",
        "label": "Modern Minimalist",
        "description": "Clean editorial illustration, gentle gradients, peaceful geometric harmony",
        "prompt_suffix": "modern minimalist editorial illustration, clean elegant composition, harmonious muted pastel palette, soft ambient studio lighting, sophisticated contemporary graphic art",
    },
    {
        "id": "cinematic_light",
        "label": "Cinematic Golden Hour",
        "description": "Volumetric rays of dawn light, grand biblical landscape, awe-inspiring depth",
        "prompt_suffix": "cinematic photography, majestic golden hour dawn lighting, dramatic volumetric god-rays piercing through clouds, epic atmospheric depth, reverent and awe-inspiring landscape",
    },
]

MOOD_PRESETS = [
    {
        "id": "peaceful_contemplative",
        "label": "Peaceful & Contemplative",
        "description": "Quiet stillness, gentle dawn, peaceful prayer, meditative morning light",
        "prompt_cue": "peaceful stillness, meditative tranquility, gentle morning light, quiet solitude, calm resting waters",
    },
    {
        "id": "triumphant_majestic",
        "label": "Majestic & Triumphant",
        "description": "Radiant praise, grand victory, exalted light, sunburst through clouds",
        "prompt_cue": "majestic glory, radiant triumphant illumination, expansive sunburst breaking through parting clouds, glorious and uplifting",
    },
    {
        "id": "somber_reverent",
        "label": "Somber & Reverent",
        "description": "Deep solemnity, humble prayer in the wilderness, dramatic shadows",
        "prompt_cue": "deep reverence, solemn contemplative atmosphere, dramatic shadow and humble warmth, solemn sacred solitude",
    },
    {
        "id": "hopeful_restoration",
        "label": "Hope & Renewal",
        "description": "Blossoming desert, living water, fresh green shoots, renewed spirit",
        "prompt_cue": "vibrant hope, restoration and new life, fresh morning dew, green olive branches springing from rocky ground, living water stream",
    },
    {
        "id": "prophetic_wonder",
        "label": "Prophetic Wonder",
        "description": "Vast star-filled heavens, ancient pathway, mystery of divine promise",
        "prompt_cue": "ancient prophetic mystery, vast celestial night sky filled with stars over ancient rolling desert hills, glowing lantern illuminating a path of stone",
    },
]

ASPECT_RATIOS = [
    {"id": "16:9", "label": "Landscape Hero (16:9)", "width": 1024, "height": 576, "best_for": "cover_art"},
    {"id": "3:4", "label": "Portrait Poster (3:4)", "width": 768, "height": 1024, "best_for": "infographic"},
    {"id": "1:1", "label": "Square (1:1)", "width": 1024, "height": 1024, "best_for": "general"},
]


# ---------------------------------------------------------------- Prompt Crafter

PROMPT_CRAFTER_SYSTEM = """You are a master visual art director and biblical prompt engineer for BibleStudy-Crafter.
Your role is to craft vivid, artistically evocative prompts for AI image generation models (FLUX, SDXL, Imagen).

CRITICAL POLICY ENFORCEMENT:
1. IMAGERY POLICY:
{imagery_policy}

2. THEOLOGICAL POSTURE:
{tradition_posture}

3. CORE RULES:
- Never generate cartoonish, distorted, or sensationalized imagery.
- Keep the visual metaphor directly anchored in the day's Scripture passages and commentary themes.
- If the imagery policy is 'symbolic', strictly avoid identifiable faces of biblical figures or Jesus Christ; use environmental metaphors (e.g. olive groves, lanterns, still waters, storms at sea, ancient scrolls, rocky paths, beams of light, desert hills, temple pillars).
- Provide clean, highly descriptive English prompts without buzzwords like "photorealistic" or "4K", using rich artistic, lighting, and textural terminology instead.

Respond with ONLY valid JSON:
{{
  "cover_art_prompt": str (a rich 2-3 sentence prompt optimized for a 16:9 header banner),
  "infographic_art_prompt": str (a 2-3 sentence prompt for a visual poster / key learnings illustration),
  "artistic_rationale": str (1-2 sentences explaining how this visual concept reflects the passage and mood),
  "negative_prompt": str (elements to avoid, e.g. text, watermarks, modern objects, distorted faces)
}}"""


async def suggest_art_prompts(
    study: Study,
    day: StudyDay,
    style_id: str = "classical_oil",
    mood_id: str = "peaceful_contemplative",
    custom_guidance: str = "",
    user_keys: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Generate high-quality, policy-compliant art prompts for a study day."""
    style_preset = next((s for s in STYLE_PRESETS if s["id"] == style_id), STYLE_PRESETS[0])
    mood_preset = next((m for m in MOOD_PRESETS if m["id"] == mood_id), MOOD_PRESETS[0])

    blocks = day.blocks_json or {}
    scriptures = blocks.get("scripture", [])
    refs_text = ", ".join(s.get("ref", "") for s in scriptures if isinstance(s, dict))
    commentary = blocks.get("commentary", "")
    theme_heading = blocks.get("heading") or day.title or day.theme or study.topic

    user_prompt = f"""Study Topic: {study.topic}
Day {day.day_number}: {theme_heading}
Theme / Focus: {day.theme or day.title}
Key Scriptures: {refs_text or 'Scripture reading for the day'}
Commentary Digest: {commentary[:600]}

Requested Art Style: {style_preset['label']} ({style_preset['description']})
Style Modifier: {style_preset['prompt_suffix']}

Requested Mood / Tone: {mood_preset['label']} ({mood_preset['prompt_cue']})
{f"User Special Guidance: {custom_guidance}" if custom_guidance.strip() else ""}

Craft the optimal Cover Art and Infographic Poster prompts for this study day."""

    trad = get_tradition(study.tradition)
    system = PROMPT_CRAFTER_SYSTEM.format(
        imagery_policy=get_imagery_policy(study.imagery_policy),
        tradition_posture=trad.posture,
    )

    try:
        res: LLMResult = await complete(
            user_prompt,
            system=system,
            json_mode=True,
            custom_keys=user_keys,
            study_id=study.id,
        )
        data = res.data or {}
        cover_prompt = str(data.get("cover_art_prompt") or "").strip()
        if not cover_prompt:
            cover_prompt = f"A contemplative biblical scene representing {theme_heading}, {mood_preset['prompt_cue']}, {style_preset['prompt_suffix']}"
        
        info_prompt = str(data.get("infographic_art_prompt") or "").strip()
        if not info_prompt:
            info_prompt = f"A symbolic visual layout of {theme_heading} with biblical motifs, {style_preset['prompt_suffix']}"

        return {
            "cover_art_prompt": cover_prompt,
            "infographic_art_prompt": info_prompt,
            "artistic_rationale": str(data.get("artistic_rationale") or f"Visual composition representing {theme_heading} in {style_preset['label']} style."),
            "negative_prompt": str(data.get("negative_prompt") or "text, watermark, low quality, distorted anatomy, modern technology, artifacts"),
            "style_id": style_id,
            "mood_id": mood_id,
        }
    except Exception as exc:
        logger.exception("Failed to generate AI art prompt suggestions: %s", exc)
        fallback_cover = f"Sacred biblical artwork representing '{theme_heading}' from {refs_text}, {mood_preset['prompt_cue']}, {style_preset['prompt_suffix']}"
        fallback_info = f"Symbolic thematic illustration of key insights from {theme_heading}, {style_preset['prompt_suffix']}"
        return {
            "cover_art_prompt": fallback_cover,
            "infographic_art_prompt": fallback_info,
            "artistic_rationale": f"Concept capturing the theme '{theme_heading}' in {style_preset['label']} style.",
            "negative_prompt": "text, watermark, low quality, modern artifacts",
            "style_id": style_id,
            "mood_id": mood_id,
        }


# -------------------------------------------------------- Structured Infographic

INFOGRAPHIC_EXTRACTION_SYSTEM = """You are an expert biblical educator and visual communications designer.
Your task is to extract structured, high-impact key learnings from a Bible study day's commentary and Scripture readings to build a clear, memorable infographic.

Distill the content into exactly:
1. "title": Short, powerful infographic title (3-6 words).
2. "central_thesis": One memorable, impactful sentence summarizing the core theological insight.
3. "pillars": Exactly 3 (or 4) core learning pillars. For each pillar provide:
   - "title": Clear takeaway name (2-4 words).
   - "icon": Material icon identifier (e.g. 'shield', 'water_drop', 'anchor', 'light_mode', 'favorite', 'menu_book', 'wb_sunny', 'psychology', 'church', 'handshake', 'explore', 'local_fire_department', 'all_inclusive', 'spa', 'balance').
   - "insight": 1-2 sentence explanation of the takeaway.
   - "scripture_ref": Relevant verse reference (e.g. "Romans 8:28").
   - "key_phrase": Short poignant phrase (under 8 words) for visual emphasis.
4. "key_verse": {{ "ref": str, "text": str }} - The most prominent memory verse for today.
5. "practical_walkaway": One actionable, personal application step for the reader's daily life.

Return ONLY valid JSON matching this schema:
{{
  "title": str,
  "central_thesis": str,
  "pillars": [
    {{
      "title": str,
      "icon": str,
      "insight": str,
      "scripture_ref": str,
      "key_phrase": str
    }}
  ],
  "key_verse": {{
    "ref": str,
    "text": str
  }},
  "practical_walkaway": str
}}"""


async def extract_structured_infographic(
    study: Study,
    day: StudyDay,
    user_keys: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Extract structured pillars and key takeaways from a study day for infographic rendering."""
    blocks = day.blocks_json or {}
    commentary = blocks.get("commentary", "")
    scriptures = blocks.get("scripture", [])
    scripture_text = ""
    for s in scriptures:
        if isinstance(s, dict):
            scripture_text += f"{s.get('ref', '')}: {s.get('text', '')}\n"

    heading = blocks.get("heading") or day.title or f"Day {day.day_number}"

    prompt = f"""Study: {study.topic}
Day {day.day_number}: {heading}
Scripture Text:
{scripture_text[:1500]}

Commentary:
{commentary}

Extract the key learning pillars, central thesis, key verse, and practical walkaway into the requested JSON schema."""

    try:
        res: LLMResult = await complete(
            prompt,
            system=INFOGRAPHIC_EXTRACTION_SYSTEM,
            json_mode=True,
            custom_keys=user_keys,
            study_id=study.id,
        )
        data = res.data or {}
        pillars = data.get("pillars") or []
        if not pillars or not isinstance(pillars, list):
            pillars = [
                {
                    "title": "Divine Revelation",
                    "icon": "light_mode",
                    "insight": "God reveals His character and promises through His living word.",
                    "scripture_ref": scriptures[0].get("ref", "") if scriptures else "",
                    "key_phrase": "God's word is living and active",
                },
                {
                    "title": "Steadfast Faith",
                    "icon": "anchor",
                    "insight": "Anchoring our hope in God's faithfulness during trials.",
                    "scripture_ref": scriptures[-1].get("ref", "") if scriptures else "",
                    "key_phrase": "Anchor for the soul",
                },
                {
                    "title": "Transformed Living",
                    "icon": "favorite",
                    "insight": "Translating biblical truth into daily love, patience, and integrity.",
                    "scripture_ref": "",
                    "key_phrase": "Walk in truth and love",
                },
            ]

        key_verse = data.get("key_verse")
        if not key_verse or not isinstance(key_verse, dict) or not key_verse.get("ref"):
            first_s = scriptures[0] if scriptures else {}
            key_verse = {
                "ref": first_s.get("ref", "Key Scripture"),
                "text": (first_s.get("text", "")[:120] + "…") if first_s.get("text") else "Trust in the Lord with all your heart.",
            }

        return {
            "title": data.get("title") or f"Key Learnings · {heading}",
            "central_thesis": data.get("central_thesis") or f"Grounded in Scripture, Day {day.day_number} illuminates God's enduring grace for daily living.",
            "pillars": pillars[:4],
            "key_verse": key_verse,
            "practical_walkaway": data.get("practical_walkaway") or "Reflect on how this passage speaks to your current circumstances and bring it to God in prayer.",
        }
    except Exception as exc:
        logger.exception("Failed to extract structured infographic: %s", exc)
        first_ref = scriptures[0].get("ref", "Scripture") if scriptures else "Scripture"
        first_txt = scriptures[0].get("text", "")[:140] if scriptures else ""
        return {
            "title": f"Key Learnings · {heading}",
            "central_thesis": f"Understanding God's truth through {study.topic} in Day {day.day_number}.",
            "pillars": [
                {
                    "title": "Scripture Foundation",
                    "icon": "menu_book",
                    "insight": f"Exploring the historical and spiritual meaning of {first_ref}.",
                    "scripture_ref": first_ref,
                    "key_phrase": "Anchored in Scripture",
                },
                {
                    "title": "Theological Core",
                    "icon": "psychology",
                    "insight": "Reflecting on God's sovereignty, mercy, and relational covenant with His people.",
                    "scripture_ref": first_ref,
                    "key_phrase": "Grace and Truth",
                },
                {
                    "title": "Heart Application",
                    "icon": "volunteer_activism",
                    "insight": "Responding with prayer, humility, and active trust in daily decisions.",
                    "scripture_ref": first_ref,
                    "key_phrase": "Faith in Action",
                },
            ],
            "key_verse": {
                "ref": first_ref,
                "text": first_txt or "The grass withers, the flower fades, but the word of our God will stand forever.",
            },
            "practical_walkaway": "Take 3 minutes of quiet prayer today to invite God into one specific area where you need His peace.",
        }


# ------------------------------------------------------------- SVG Generator

def generate_svg_infographic(info_data: dict[str, Any], width: int = 1000, height: int = 680) -> str:
    """Generate clean, scalable SVG visual of the key learnings infographic (Zero API cost)."""
    title = _escape_xml(info_data.get("title", "Key Learnings"))
    thesis = _escape_xml(info_data.get("central_thesis", ""))
    pillars = info_data.get("pillars", [])
    key_verse = info_data.get("key_verse") or {}
    walkaway = _escape_xml(info_data.get("practical_walkaway", ""))

    pillar_count = max(1, min(4, len(pillars)))
    card_width = int((width - 80 - (pillar_count - 1) * 20) / pillar_count)

    pillar_cards_svg = []
    for idx, p in enumerate(pillars[:pillar_count]):
        px = 40 + idx * (card_width + 20)
        p_title = _escape_xml(p.get("title", f"Pillar {idx+1}"))
        p_phrase = _escape_xml(p.get("key_phrase", ""))
        p_insight = _escape_xml(p.get("insight", ""))
        p_ref = _escape_xml(p.get("scripture_ref", ""))

        card_svg = f"""
        <g transform="translate({px}, 240)">
            <rect width="{card_width}" height="240" rx="16" fill="url(#cardGrad)" stroke="#6366f1" stroke-opacity="0.3" stroke-width="1.5" />
            <circle cx="36" cy="36" r="20" fill="#6366f1" fill-opacity="0.2" />
            <text x="36" y="42" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" fill="#818cf8" text-anchor="middle">{idx+1}</text>
            <text x="70" y="42" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#f8fafc">{p_title}</text>
            
            {f'<rect x="20" y="70" width="{card_width-40}" height="30" rx="6" fill="#1e293b" fill-opacity="0.6" />' if p_phrase else ''}
            {f'<text x="30" y="90" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#38bdf8" font-style="italic">"{p_phrase}"</text>' if p_phrase else ''}
            
            <foreignObject x="20" y="{110 if p_phrase else 75}" width="{card_width-40}" height="85">
                <p xmlns="http://www.w3.org/1999/xhtml" style="margin:0; font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.45; color: #cbd5e1;">
                    {p_insight}
                </p>
            </foreignObject>
            
            {f'<text x="20" y="220" font-family="Georgia, serif" font-size="12" font-weight="600" fill="#a78bfa">📖 {p_ref}</text>' if p_ref else ''}
        </g>
        """
        pillar_cards_svg.append(card_svg)

    cards_block = "\n".join(pillar_cards_svg)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%" style="background:#0f172a; border-radius:16px;">
    <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="50%" stop-color="#1e1b4b" />
            <stop offset="100%" stop-color="#090d16" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#1e293b" stop-opacity="0.9" />
            <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95" />
        </linearGradient>
        <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f8fafc" />
            <stop offset="100%" stop-color="#cbd5e1" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fbbf24" />
            <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
    </defs>
    
    <!-- Background -->
    <rect width="{width}" height="{height}" rx="16" fill="url(#bgGrad)" />
    <circle cx="900" cy="80" r="260" fill="#6366f1" fill-opacity="0.08" filter="blur(40px)" />
    <circle cx="100" cy="580" r="220" fill="#a855f7" fill-opacity="0.06" filter="blur(30px)" />

    <!-- Header Section -->
    <g transform="translate(40, 40)">
        <rect x="0" y="0" width="130" height="24" rx="12" fill="#6366f1" fill-opacity="0.2" />
        <text x="65" y="16" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#a5b4fc" text-anchor="middle" letter-spacing="1.5">INFOGRAPHIC</text>
        
        <text x="0" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800" fill="url(#titleGrad)" letter-spacing="-0.5">
            {title}
        </text>
        
        <foreignObject x="0" y="75" width="{width-80}" height="60">
            <p xmlns="http://www.w3.org/1999/xhtml" style="margin:0; font-family: Georgia, serif; font-style: italic; font-size: 16px; line-height: 1.5; color: #94a3b8;">
                "{thesis}"
            </p>
        </foreignObject>
    </g>

    <!-- Key Pillars Grid -->
    {cards_block}

    <!-- Footer Bar: Key Verse & Practical Walkaway -->
    <g transform="translate(40, 510)">
        <rect width="{width-80}" height="130" rx="16" fill="#1e293b" fill-opacity="0.7" stroke="#334155" stroke-width="1" />
        
        <!-- Left: Key Verse -->
        <g transform="translate(25, 20)">
            <text x="0" y="15" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" letter-spacing="1">ANCHOR VERSE</text>
            <text x="0" y="40" font-family="Georgia, serif" font-size="15" font-weight="bold" fill="#f8fafc">{_escape_xml(key_verse.get("ref", ""))}</text>
            <foreignObject x="0" y="50" width="400" height="55">
                <p xmlns="http://www.w3.org/1999/xhtml" style="margin:0; font-family: Georgia, serif; font-size: 13px; font-style: italic; color: #cbd5e1; line-height: 1.4;">
                    "{_escape_xml(key_verse.get("text", ""))}"
                </p>
            </foreignObject>
        </g>
        
        <!-- Divider -->
        <line x1="470" y1="20" x2="470" y2="110" stroke="#334155" stroke-width="1" />
        
        <!-- Right: Daily Walkaway -->
        <g transform="translate(500, 20)">
            <text x="0" y="15" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#38bdf8" letter-spacing="1">PRACTICAL WALKAWAY</text>
            <foreignObject x="0" y="28" width="{width-80-530}" height="80">
                <p xmlns="http://www.w3.org/1999/xhtml" style="margin:0; font-family: system-ui, sans-serif; font-size: 14px; font-weight: 500; color: #f1f5f9; line-height: 1.5;">
                    {walkaway}
                </p>
            </foreignObject>
        </g>
    </g>
</svg>"""
    return svg.strip()


def _escape_xml(text: str) -> str:
    if not text:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


# ----------------------------------------------------------- Image Generation

async def render_image_asset(
    asset_id: int,
    prompt: str,
    aspect_ratio: str = "16:9",
    provider_name: str | None = None,
    custom_keys: dict[str, str] | None = None,
    engine = None,
) -> None:
    """Render an image asset asynchronously and commit result to DB."""
    if engine is None:
        engine = get_engine()

    events.emit("info", "art", f"Starting image render for asset {asset_id}...", study_id=None)

    image_bytes: bytes = b""
    media_type: str = "image/png"
    used_provider = "fallback_svg"
    used_model = "svg-renderer"
    cost_usd = 0.0
    err_msg = ""

    # Dimensions
    dims = next((a for a in ASPECT_RATIOS if a["id"] == aspect_ratio), ASPECT_RATIOS[0])
    w, h = dims["width"], dims["height"]

    reg = get_registry()
    available_providers = reg.available_chain("image", custom_keys=custom_keys)

    # 1. Try Fal.ai if available
    fal_prov = next((p for p in available_providers if p.kind == "fal"), None)
    if fal_prov and not image_bytes:
        api_key = fal_prov.api_key(custom_keys)
        if api_key:
            model = fal_prov.default_model()
            try:
                events.emit("info", "art", f"Calling Fal.ai ({model.id})...", study_id=None)
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        f"https://fal.run/{model.id}",
                        headers={"Authorization": f"Key {api_key}", "Content-Type": "application/json"},
                        json={
                            "prompt": prompt,
                            "image_size": {"width": w, "height": h},
                            "num_inference_steps": 4 if "schnell" in model.id else 25,
                            "enable_safety_checker": True,
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        images = data.get("images") or []
                        if images and "url" in images[0]:
                            img_resp = await client.get(images[0]["url"])
                            if img_resp.status_code == 200:
                                image_bytes = img_resp.content
                                media_type = img_resp.headers.get("content-type", "image/jpeg")
                                used_provider = "fal"
                                used_model = model.id
                                cost_usd = model.cost_per_call
            except Exception as exc:
                logger.warning("Fal.ai render attempt failed: %s", exc)

    # 2. Try Replicate if available
    rep_prov = next((p for p in available_providers if p.kind == "replicate"), None)
    if rep_prov and not image_bytes:
        api_key = rep_prov.api_key(custom_keys)
        if api_key:
            model = rep_prov.default_model()
            try:
                events.emit("info", "art", f"Calling Replicate ({model.id})...", study_id=None)
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        "https://api.replicate.com/v1/predictions",
                        headers={"Authorization": f"Token {api_key}", "Content-Type": "application/json"},
                        json={
                            "version": model.id.split(":")[-1] if ":" in model.id else model.id,
                            "input": {"prompt": prompt, "aspect_ratio": aspect_ratio.replace(":", "_")},
                        },
                    )
                    if resp.status_code in (200, 201):
                        pred = resp.json()
                        poll_url = pred.get("urls", {}).get("get")
                        if poll_url:
                            for _ in range(30):
                                await asyncio.sleep(2.0)
                                p_res = await client.get(poll_url, headers={"Authorization": f"Token {api_key}"})
                                if p_res.status_code == 200:
                                    p_data = p_res.json()
                                    if p_data.get("status") == "succeeded":
                                        out_url = p_data.get("output")
                                        if isinstance(out_url, list) and out_url:
                                            out_url = out_url[0]
                                        if out_url:
                                            img_r = await client.get(str(out_url))
                                            if img_r.status_code == 200:
                                                image_bytes = img_r.content
                                                media_type = img_r.headers.get("content-type", "image/webp")
                                                used_provider = "replicate"
                                                used_model = model.id
                                                cost_usd = model.cost_per_call
                                                break
                                    elif p_data.get("status") in ("failed", "canceled"):
                                        break
            except Exception as exc:
                logger.warning("Replicate render attempt failed: %s", exc)

    # 3. Try Pollinations.ai (Free public AI image generation, zero key required)
    if not image_bytes:
        try:
            events.emit("info", "art", "Using Pollinations AI image pool...", study_id=None)
            clean_prompt = re.sub(r"[^\w\s,.-]", "", prompt)[:300]
            encoded_prompt = httpx.URL(f"https://image.pollinations.ai/prompt/{clean_prompt}").raw_path.decode()
            poll_url = f"https://image.pollinations.ai{encoded_prompt}?width={w}&height={h}&nologo=true&seed=42"
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(poll_url)
                if resp.status_code == 200 and len(resp.content) > 1000 and "image" in resp.headers.get("content-type", ""):
                    image_bytes = resp.content
                    media_type = resp.headers.get("content-type", "image/jpeg")
                    used_provider = "pollinations_free"
                    used_model = "pollinations-flux"
                    cost_usd = 0.0
        except Exception as exc:
            logger.warning("Pollinations render attempt failed: %s", exc)

    # 4. Fallback: Generate an artistic SVG Cover Art / Poster (guaranteed 100% success locally)
    if not image_bytes:
        try:
            events.emit("info", "art", "Generating high-fidelity artistic SVG poster...", study_id=None)
            safe_title = prompt[:80]
            svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="100%" height="100%">
            <defs>
                <linearGradient id="artGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1e1b4b" />
                    <stop offset="40%" stop-color="#312e81" />
                    <stop offset="100%" stop-color="#0f172a" />
                </linearGradient>
                <radialGradient id="sunburst" cx="50%" cy="35%" r="60%">
                    <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.4" />
                    <stop offset="50%" stop-color="#6366f1" stop-opacity="0.1" />
                    <stop offset="100%" stop-color="#0f172a" stop-opacity="0" />
                </radialGradient>
            </defs>
            <rect width="{w}" height="{h}" fill="url(#artGrad)" />
            <circle cx="{w/2}" cy="{h*0.35}" r="{w*0.4}" fill="url(#sunburst)" />
            <g transform="translate({w/2}, {h*0.45})" text-anchor="middle">
                <circle cx="0" cy="0" r="48" fill="#6366f1" fill-opacity="0.25" stroke="#a5b4fc" stroke-width="2" />
                <text x="0" y="16" font-size="44" fill="#fbbf24" font-family="Georgia, serif">✦</text>
                <text x="0" y="80" font-family="Georgia, serif" font-style="italic" font-size="22" font-weight="bold" fill="#f8fafc">{_escape_xml(safe_title)}</text>
            </g>
            </svg>"""
            image_bytes = svg_content.encode("utf-8")
            media_type = "image/svg+xml"
            used_provider = "native_svg"
            used_model = "svg-art"
            cost_usd = 0.0
        except Exception as exc:
            err_msg = f"All renderers failed: {exc}"

    # Commit to DB
    try:
        with Session(engine) as session:
            asset = session.get(Asset, asset_id)
            if asset is not None:
                if image_bytes:
                    asset.content = image_bytes
                    asset.media_type = media_type
                    asset.provider = used_provider
                    asset.model = used_model
                    asset.cost_usd = cost_usd
                    asset.status = "ready"
                    asset.error = None

                    # If this asset is set to active, deactivate older assets of the same kind for this day
                    if asset.is_active:
                        other_assets = session.exec(
                            select(Asset).where(
                                Asset.study_day_id == asset.study_day_id,
                                Asset.kind == asset.kind,
                                Asset.id != asset.id,
                            )
                        ).all()
                        for oa in other_assets:
                            oa.is_active = False
                            session.add(oa)

                    # Log usage ledger
                    if cost_usd > 0:
                        ledger = UsageLedger(
                            user_id=asset.user_id,
                            job_kind=f"image_{asset.kind}",
                            provider=used_provider,
                            model=used_model,
                            cost_usd=cost_usd,
                        )
                        session.add(ledger)
                else:
                    asset.status = "failed"
                    asset.error = err_msg or "Failed to generate image"

                session.add(asset)
                session.commit()
                events.emit("success" if asset.status == "ready" else "warn", "art", f"Asset {asset_id} render -> {asset.status}", study_id=None)
    except Exception as exc:
        logger.exception("Failed to commit rendered asset %s: %s", asset_id, exc)
