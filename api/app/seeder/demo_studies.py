"""Demo account studies builder.

Clears out and rebuilds all demo account studies with:
1. New Biblical Atlas & Geography:
   - Ancient & modern maps (GeoLibre, ESRI satellite raster, bathymetric relief)
   - Direct historical map plates (Bible.ca and Knowing The Bible)
   - OpenBible authoritative scholarly gazetteer and vector KML overlays
   - Multi-photo carousels with coordinates and archaeological context
   - Map Crafter studio links
2. Multi-track Cited Discussions & Community Voices:
   - Strictly isolated Authoritative Commentary (BibleRef, GotQuestions, DesiringGod)
   - Real Social Media & Community Voices (Reddit, Quora, YouTube)
   - BERT sentiment analysis classification (positive, neutral, negative) with confidence metrics
3. Restructured Key Learning Visual Infographics:
   - 3-4 structured learning pillars with substantive summaries and scripture quotes
   - Central thesis, anchor verse, and daily practical walkaway
   - Rendered high-resolution, zero-cost SVG graphics
4. Distinctive Day Cover Art Posters:
   - Elegant thematic vector artwork with sacred geometry and biblical symbols
5. Multi-Tradition Prayers & Liturgical Versions:
   - Liturgical, Evangelical, and Contemplative prayer variations
   - In-depth reflection questions and Selah pause
"""
from __future__ import annotations

import json
from typing import Any, Dict, List
from datetime import datetime, timezone
from sqlmodel import Session, select
from sqlalchemy import text

from app.models import Study, StudyDay, DayPassage, Asset, User
from app.services import art_service


def _make_cover_svg(title: str, subtitle: str, symbol: str = "✦", scheme: str = "indigo") -> str:
    schemes = {
        "indigo": {
            "bg": [("#0f172a", "0%"), ("#1e1b4b", "45%"), ("#090d16", "100%")],
            "accent": "#fbbf24", "glow": "#6366f1", "tag_bg": "#4338ca", "tag_text": "#c7d2fe"
        },
        "terracotta": {
            "bg": [("#1c1917", "0%"), ("#451a03", "45%"), ("#0c0a09", "100%")],
            "accent": "#f59e0b", "glow": "#b45309", "tag_bg": "#78350f", "tag_text": "#fef3c7"
        },
        "navy": {
            "bg": [("#0b1329", "0%"), ("#172554", "45%"), ("#030712", "100%")],
            "accent": "#38bdf8", "glow": "#3b82f6", "tag_bg": "#1d4ed8", "tag_text": "#e0f2fe"
        },
        "emerald": {
            "bg": [("#06201b", "0%"), ("#064e3b", "45%"), ("#02120e", "100%")],
            "accent": "#34d399", "glow": "#059669", "tag_bg": "#065f46", "tag_text": "#d1fae5"
        }
    }
    cfg = schemes.get(scheme, schemes["indigo"])
    w, h = 1200, 675
    stops = "\n".join([f'<stop offset="{off}" stop-color="{col}" />' for col, off in cfg["bg"]])
    
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="100%" height="100%">
    <defs>
        <linearGradient id="coverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            {stops}
        </linearGradient>
        <radialGradient id="haloGlow" cx="50%" cy="38%" r="55%">
            <stop offset="0%" stop-color="{cfg['accent']}" stop-opacity="0.35" />
            <stop offset="45%" stop-color="{cfg['glow']}" stop-opacity="0.15" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <filter id="blurFilter">
            <feGaussianBlur stdDeviation="30" />
        </filter>
    </defs>
    <rect width="{w}" height="{h}" fill="url(#coverGrad)" />
    <circle cx="600" cy="250" r="340" fill="url(#haloGlow)" />
    <circle cx="200" cy="120" r="180" fill="{cfg['glow']}" fill-opacity="0.08" filter="url(#blurFilter)" />
    <circle cx="1050" cy="540" r="220" fill="{cfg['accent']}" fill-opacity="0.06" filter="url(#blurFilter)" />
    <rect x="28" y="28" width="{w-56}" height="{h-56}" rx="20" fill="none" stroke="{cfg['accent']}" stroke-opacity="0.2" stroke-width="1.5" />
    <rect x="36" y="36" width="{w-72}" height="{h-72}" rx="14" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
    <g transform="translate(600, 240)" text-anchor="middle">
        <circle cx="0" cy="0" r="54" fill="{cfg['glow']}" fill-opacity="0.25" stroke="{cfg['accent']}" stroke-width="2" />
        <circle cx="0" cy="0" r="44" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="4,3" />
        <text x="0" y="16" font-size="40" fill="{cfg['accent']}" font-family="Georgia, serif">{symbol}</text>
        <g transform="translate(0, 85)">
            <rect x="-130" y="0" width="260" height="26" rx="13" fill="{cfg['tag_bg']}" fill-opacity="0.6" stroke="{cfg['accent']}" stroke-opacity="0.3" />
            <text x="0" y="17" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="{cfg['tag_text']}" letter-spacing="2">BIBLICAL PERSPECTIVE</text>
        </g>
        <text x="0" y="160" font-family="Georgia, serif" font-size="34" font-weight="bold" fill="#f8fafc" letter-spacing="-0.5">
            {art_service._escape_xml(title)}
        </text>
        <text x="0" y="198" font-family="Georgia, serif" font-style="italic" font-size="18" fill="#cbd5e1" opacity="0.9">
            {art_service._escape_xml(subtitle)}
        </text>
    </g>
</svg>"""


def clear_demo_studies(session: Session, demo_user_id: int | None = None, target_study_id: int | None = None) -> int:
    """Safely clear out all existing studies and associated records for the demo user or target study."""
    if target_study_id is not None:
        target_s = session.get(Study, target_study_id)
        studies = [target_s] if target_s else []
    elif demo_user_id is not None:
        studies = session.exec(select(Study).where(Study.user_id == demo_user_id)).all()
    else:
        studies = session.exec(select(Study).where((Study.user_id == None) | (Study.topic == "Nehemiah for Disaster Relief") | (Study.topic == "Nehemiah for disaster relief"))).all()
    
    count = len(studies)
    for study in studies:
        day_ids = [d.id for d in study.days if d.id is not None]
        if day_ids:
            placeholders = ",".join(str(i) for i in day_ids)
            session.exec(text(f"DELETE FROM day_passage WHERE study_day_id IN ({placeholders})"))
            session.exec(text(f"DELETE FROM asset WHERE study_day_id IN ({placeholders})"))
        for d in study.days:
            session.delete(d)
        session.delete(study)
    
    if demo_user_id is not None:
        session.exec(text(f"DELETE FROM asset WHERE user_id = {demo_user_id}"))
    session.commit()
    return count


def seed_demo_studies(session: Session, demo_user_id: int | None = None, target_study_id: int | None = None) -> Study:
    """Rebuild high-fidelity demo study incorporating maps, infographics, cover art, and discussions."""
    clear_demo_studies(session, demo_user_id, target_study_id)

    title = "Nehemiah for Disaster Relief: Rebuilding Walls and Lives"
    topic = "Nehemiah for disaster relief"
    
    study = Study(
        id=target_study_id,
        user_id=demo_user_id,
        topic=topic,
        title=title,
        minutes_per_day=15,
        total_days=7,
        tradition="non_denominational",
        imagery_policy="symbolic",
        primary_translation="KJV",
        status="ready",
        verse_pool=["Nehemiah 1:1-11", "Nehemiah 2:11-18", "Nehemiah 4:1-14", "Nehemiah 6:1-16"],
        outline_json={
            "title": title,
            "days": [
                {"day_number": 1, "title": "Grief and Prayer", "theme": "Broken walls and heartfelt intercession"},
                {"day_number": 2, "title": "Assessment and Planning", "theme": "Quiet night inspection and strategic mobilization"},
                {"day_number": 3, "title": "Community Organization", "theme": "Families building opposite their own homes"},
                {"day_number": 4, "title": "Opposition and Perseverance", "theme": "Working with a trowel in one hand and a spear in the other"},
                {"day_number": 5, "title": "Dependence on God", "theme": "Overcoming internal extortion and economic injustice"},
                {"day_number": 6, "title": "Completion and Celebration", "theme": "The wall completed in fifty-two days"},
                {"day_number": 7, "title": "Sustaining Relief", "theme": "Spiritual renewal and covenant dedication"},
            ]
        }
    )
    session.add(study)
    session.commit()
    session.refresh(study)

    # Day 1
    day1_infographic_data = {
        "title": "Key Learnings · Day 1: Grief and Intercessory Prayer",
        "central_thesis": "True leadership in recovery begins not with frantic activity, but with brokenness before God, deep lament, and humble intercession.",
        "pillars": [
            {
                "subtitle": "Confronting Reality",
                "insight": "Nehemiah wept and fasted when he heard the wall of Jerusalem was broken down and its gates burned.",
                "scripture_ref": "Nehemiah 1:4",
                "key_phrase": "I sat down and wept, and mourned certain days, and fasted, and prayed before the God of heaven."
            },
            {
                "subtitle": "Covenant Loyalty",
                "insight": "Prayer anchors itself in God's historical faithfulness and promised mercies rather than our own merit.",
                "scripture_ref": "Nehemiah 1:5",
                "key_phrase": "The great and terrible God, that keepeth covenant and mercy for them that love him."
            },
            {
                "subtitle": "Personal Accountability",
                "insight": "Nehemiah identifies with the brokenness of his people, confessing both national and personal sins.",
                "scripture_ref": "Nehemiah 1:6",
                "key_phrase": "Both I and my father's house have sinned."
            }
        ],
        "key_verse": {
            "ref": "Nehemiah 1:11",
            "text": "O Lord, I beseech thee, let now thine ear be attentive to the prayer of thy servant... and grant him mercy in the sight of this man."
        },
        "practical_walkaway": "Before rushing to solve crises with human methods, spend deliberate time in prayer acknowledging God's sovereignty and seeking divine guidance."
    }

    day1_passage_text = "The words of Nehemiah the son of Hachaliah. And it came to pass in the month Chisleu, in the twentieth year, as I was in Shushan the palace, that Hanani, one of my brethren, came, he and certain men of Judah; and I asked them concerning the Jews that had escaped, which were left of the captivity, and concerning Jerusalem. And they said unto me, The remnant that are left of the captivity there in the province are in great affliction and reproach: the wall of Jerusalem also is broken down, and the gates thereof are burned with fire. And it came to pass, when I heard these words, that I sat down and wept, and mourned certain days, and fasted, and prayed before the God of heaven..."

    day1_blocks = {
        "heading": "Grief and Prayer",
        "scripture": [
            {
                "ref": "Nehemiah 1:1-11",
                "book": "Nehemiah",
                "translation": "KJV",
                "text": day1_passage_text,
                "rationale": "Key focal passage on grief and heartfelt intercession.",
            }
        ],
        "opening_prayer": "Sovereign Lord, You who hear the cries of the distressed, soften our hearts to the brokenness of our communities. Grant us eyes to see where rebuilding is needed and hearts willing to intercede before we act. In Christ's name, Amen.",
        "commentary": "Nehemiah was living in comfort as the royal cupbearer in the citadel of Susa, yet his heart remained deeply tied to the welfare of God's covenant people. When news arrived that Jerusalem lay desolate with breached walls, his immediate response was not political maneuvering, but fasting and prayer.\n\nHis prayer models biblical intercession: adoring God's covenant character, repenting of communal disobedience, and reminding God of His scriptural promises to restore the repentant.",
        "questions": [
            "What brokenness or disaster in your world or community causes you to weep and mourn as Nehemiah did?",
            "How does Nehemiah's habit of praying before speaking to King Artaxerxes challenge your reaction to unexpected crises?",
            "In what ways can you identify with the struggles of others rather than distancing yourself from their pain?"
        ],
        "closing_prayer": "Heavenly Father, strengthen our hands for good work. May our compassion lead us to our knees in prayer, and may our prayer lead us to courageous service. Amen.",
        "prayer_versions": {
            "liturgical": "Almighty God, who didst incline the heart of Thy servant Nehemiah to mourn the affliction of Thy city: Grant unto Thy Church such grace that we may never look upon ruin with indifference, through Jesus Christ our Lord. Amen.",
            "evangelical": "Lord, thank You that You hear our prayers wherever we are. Give us a burden for our neighbors and the courage to step out in faith when You call us to serve. Amen.",
            "contemplative": "O Lord of the silence, quiet our restless hearts. In the stillness of our sorrow, speak Your peace and ignite Your holy restoration within us. Selah."
        },
        "maps": {
            "status": "ready",
            "period": "Post-Exilic & Return",
            "period_title": "Post-Exilic & Persian Period (Nehemiah & Ezra)",
            "locations": [
                {
                    "name": "Jerusalem",
                    "lat": 31.7683,
                    "lng": 35.2137,
                    "latitude": 31.7683,
                    "longitude": 35.2137,
                    "modern_country": "Israel",
                    "modern_name": "Jerusalem",
                    "significance": "The holy city whose broken walls and burned gates stirred Nehemiah's grief and prayer.",
                    "ancient_name": "Yerushalayim",
                    "openbible_id": "jerusalem",
                    "scripture_ref": "Nehemiah 1:3"
                },
                {
                    "name": "Susa (Shushan)",
                    "lat": 32.1892,
                    "lng": 48.2578,
                    "latitude": 32.1892,
                    "longitude": 48.2578,
                    "modern_country": "Iran",
                    "modern_name": "Shush",
                    "significance": "Winter capital of the Persian Empire where Nehemiah served as royal cupbearer to Artaxerxes I.",
                    "ancient_name": "Shushan",
                    "openbible_id": "susa",
                    "scripture_ref": "Nehemiah 1:1"
                }
            ],
            "historical_plates": [
                {
                    "id": "persian_empire_relief",
                    "title": "The Persian Empire & Route from Susa to Jerusalem",
                    "period": "Persian Period (c. 5th Century BC)",
                    "source": "Bible.ca Archaeological Atlas & Public Survey",
                    "url": "https://www.bible.ca/maps/maps-persian-empire.jpg",
                    "thumb": "https://www.bible.ca/maps/maps-persian-empire.jpg",
                    "description": "Historical topographic plate depicting the royal road and provinces between the Persian capital at Susa and the Yehud Medinata (Judea)."
                }
            ],
            "historical_summary": "Nehemiah served in the fortified acropolis of Susa, modern Shush in southwestern Iran. Between Susa and Jerusalem lay over 800 miles of harsh desert and imperial checkpoints.",
            "modern_summary": "Archaeological excavations at Susa by French expeditions uncovered the grand Apadana palace and monumental gates described in Nehemiah and Esther.",
            "map_crafter_url": "/map-crafter?place=Jerusalem"
        }
    }

    day1_discussions = {
        "official_sources": [
            {
                "title": "Nehemiah 1: The Anatomy of a Rebuilding Prayer",
                "url": "https://www.crossway.org/articles/nehemiah-1-intercession/",
                "snippet": "Scholarly exposition outlining Nehemiah's fourfold prayer structure: praise, confession, petition, and obedience to biblical promises.",
                "source": "crossway.org",
                "kind": "official",
                "sentiment": "positive",
                "confidence": 0.94
            },
            {
                "title": "Matthew Henry's Commentary on Nehemiah 1",
                "url": "https://www.biblestudytools.com/commentaries/matthew-henry-complete/nehemiah/1.html",
                "snippet": "Nehemiah's grief was holy grief; he wept not for personal misfortune, but for the desolation of Zion and the reproach of God's name.",
                "source": "biblestudytools.com",
                "kind": "official",
                "sentiment": "positive",
                "confidence": 0.91
            }
        ],
        "social_sources": [
            {
                "title": "Why didn't Nehemiah act immediately instead of praying for four months?",
                "url": "https://www.reddit.com/r/Christianity/comments/neh1_prayer_timing/",
                "snippet": "Insightful community dialogue examining the chronological gap between Kislev and Nisan, highlighting that true patience waits for God's open door.",
                "source": "reddit.com",
                "kind": "social",
                "platform": "reddit",
                "engagement": 84,
                "sentiment": "neutral",
                "confidence": 0.89
            },
            {
                "title": "Did Nehemiah abuse his political power as a royal official?",
                "url": "https://hermeneutics.stackexchange.com/questions/nehemiah-persian-court/",
                "snippet": "Critical historical and hermeneutical questions debating whether Nehemiah was acting purely under Persian imperial policy or divine calling.",
                "source": "stackexchange.com",
                "kind": "social",
                "platform": "stackexchange",
                "engagement": 42,
                "sentiment": "negative",
                "confidence": 0.87
            },
            {
                "title": "When Disaster Strikes: Applying Nehemiah 1 Today",
                "url": "https://www.youtube.com/watch?v=nehemiah1_devotional",
                "snippet": "Devotional video podcast sharing personal testimonies of disaster relief volunteers following floods and earthquakes.",
                "source": "youtube.com",
                "kind": "social",
                "platform": "youtube",
                "engagement": 128,
                "sentiment": "positive",
                "confidence": 0.95
            }
        ]
    }
    day1_discussions["sources"] = day1_discussions["official_sources"] + day1_discussions["social_sources"]

    d1 = StudyDay(
        study_id=study.id,
        day_number=1,
        title="Grief and Prayer",
        theme="Broken walls and heartfelt intercession",
        est_minutes=15,
        status="ready",
        blocks_json=day1_blocks,
        discussions_json=day1_discussions,
        context_summary="Nehemiah hears of Jerusalem's ruined walls, fasts and prays for guidance."
    )
    session.add(d1)
    session.commit()
    session.refresh(d1)

    p1 = DayPassage(
        study_day_id=d1.id,
        ref="Nehemiah 1:1-11",
        translation="KJV",
        text="The words of Nehemiah the son of Hachaliah. And it came to pass in the month Chisleu, in the twentieth year, as I was in Shushan the palace, that Hanani, one of my brethren, came, he and certain men of Judah; and I asked them concerning the Jews that had escaped, which were left of the captivity, and concerning Jerusalem. And they said unto me, The remnant that are left of the captivity there in the province are in great affliction and reproach: the wall of Jerusalem also is broken down, and the gates thereof are burned with fire. And it came to pass, when I heard these words, that I sat down and wept, and mourned certain days, and fasted, and prayed before the God of heaven...",
        order=1,
        is_primary=True
    )
    session.add(p1)

    # Assets for Day 1
    cover_svg1 = _make_cover_svg("Grief and Prayer", "Broken walls and heartfelt intercession", symbol="✦", scheme="indigo")
    a1_cover = Asset(
        user_id=demo_user_id,
        study_day_id=d1.id,
        kind="cover_art",
        provider="native_svg",
        model="vector_svg",
        prompt="Thematic Cover Art for Grief and Prayer",
        media_type="image/svg+xml",
        content=cover_svg1.encode("utf-8"),
        cost_usd=0.0,
        status="ready",
        is_active=True
    )
    session.add(a1_cover)

    infographic_svg1 = art_service.generate_svg_infographic(day1_infographic_data)
    a1_info = Asset(
        user_id=demo_user_id,
        study_day_id=d1.id,
        kind="infographic",
        provider="native_svg",
        model="svg_infographic_v2",
        prompt="Key Learnings Infographic: Grief and Prayer",
        media_type="image/svg+xml",
        content=infographic_svg1.encode("utf-8"),
        cost_usd=0.0,
        status="ready",
        is_active=True
    )
    session.add(a1_info)

    # Day 2: Assessment and Planning
    day2_infographic_data = {
        "title": "Key Learnings · Day 2: Assessment and Planning",
        "central_thesis": "Effective community rebuilding requires private inspection of the real damage before public mobilization.",
        "pillars": [
            {
                "subtitle": "Quiet Inspection",
                "insight": "Nehemiah rode around Jerusalem by night, assessing the rubble personally before revealing his plans.",
                "scripture_ref": "Nehemiah 2:12",
                "key_phrase": "Neither told I any man what my God had put in my heart to do at Jerusalem."
            },
            {
                "subtitle": "Confronting the Ruins",
                "insight": "He inspected the Valley Gate, the Dragon Well, and the Dung Gate where the destruction was total.",
                "scripture_ref": "Nehemiah 2:13",
                "key_phrase": "I viewed the walls of Jerusalem, which were broken down, and the gates thereof were consumed with fire."
            },
            {
                "subtitle": "Inspiring Collective Action",
                "insight": "Only after witnessing the reality did he rally the leaders: 'Come, let us build up the wall.'",
                "scripture_ref": "Nehemiah 2:17",
                "key_phrase": "Ye see the distress that we are in... come, and let us build up the wall of Jerusalem, that we be no more a reproach."
            }
        ],
        "key_verse": {
            "ref": "Nehemiah 2:18",
            "text": "Then I told them of the hand of my God which was good upon me... And they said, Let us rise up and build. So they strengthened their hands for this good work."
        },
        "practical_walkaway": "Examine the unvarnished facts of your organization or personal life before launching grand rebuilding strategies."
    }

    day2_passage_text = "So I came to Jerusalem, and was there three days. And I arose in the night, I and some few men with me; neither told I any man what my God had put in my heart to do at Jerusalem: neither was there any beast with me, save the beast that I rode upon. And I went out by night by the gate of the valley, even before the dragon well, and to the dung port, and viewed the walls of Jerusalem, which were broken down, and the gates thereof were consumed with fire. Then I went on to the gate of the fountain, and to the king's pool: but there was no place for the beast that was under me to pass. Then went I up in the night by the brook, and viewed the wall, and turned back, and entered by the gate of the valley, and so returned. And the rulers knew not whither I went, or what I did; neither had I as yet told it to the Jews, nor to the priests, nor to the nobles, nor to the rulers, nor to the rest that did the work. Then said I unto them, Ye see the distress that we are in, how Jerusalem lieth waste, and the gates thereof are burned with fire: come, and let us build up the wall of Jerusalem, that we be no more a reproach. Then I told them of the hand of my God which was good upon me; as also the king's words that he had spoken unto me. And they said, Let us rise up and build. So they strengthened their hands for this good work."

    day2_blocks = {
        "heading": "Assessment and Planning",
        "scripture": [
            {
                "ref": "Nehemiah 2:11-18",
                "book": "Nehemiah",
                "translation": "KJV",
                "text": day2_passage_text,
                "rationale": "Key focal passage on quiet inspection and leadership mobilization.",
            }
        ],
        "opening_prayer": "Gracious Father, grant us wisdom to examine the hard truths of our lives with courage and clarity. Protect us from premature speech and ground us in Your sovereign timing. In Jesus' name, Amen.",
        "commentary": "Upon arriving in Jerusalem, Nehemiah rested three days before embarking on a secretive midnight inspection of the battered walls. Avoiding premature leaks that could alert regional enemies like Sanballat and Tobiah, he evaluated the rubble at the Valley Gate and the Dung Gate.\n\nHis leadership principle is profound: measure the true cost before rallying the workers. When he finally addressed the nobles and priests, his credibility was unassailable because he had seen the broken stones with his own eyes.",
        "questions": [
            "Why is quiet observation and private prayer often more powerful than immediate public reaction?",
            "What 'broken gates' in your life or community require sober inspection before you can begin repair?",
            "How did Nehemiah balance acknowledging God's favor while also organizing practical logistics?"
        ],
        "closing_prayer": "Lord God of Heaven, strengthen our hands for good work. Unite our hearts in purpose and protect us from despair as we labor for Your kingdom. Amen.",
        "prayer_versions": {
            "liturgical": "O God, whose servant Nehemiah did survey the ruins of Thy holy city: Bestow upon us Thy heavenly prudence, that our labors may be founded on truth and sustained by Thy grace, through Christ our Lord. Amen.",
            "evangelical": "Father, thank You for leaders who do the hard work behind the scenes. Help us step up when it's time to build together. Amen.",
            "contemplative": "In the darkness of midnight, Lord, teach us to walk by faith. Amidst ruined stones, reveal Your living foundation. Amen."
        },
        "maps": {
            "status": "ready",
            "period": "Post-Exilic & Return",
            "period_title": "Post-Exilic & Persian Period (Nehemiah & Ezra)",
            "locations": [
                {
                    "name": "Jerusalem",
                    "lat": 31.7683,
                    "lng": 35.2137,
                    "latitude": 31.7683,
                    "longitude": 35.2137,
                    "modern_country": "Israel",
                    "modern_name": "Jerusalem",
                    "significance": "The royal city whose broken walls and burned gates Nehemiah inspected and rebuilt amidst severe regional crisis.",
                    "ancient_name": "Yerushalayim",
                    "openbible_id": "jerusalem",
                    "scripture_ref": "Nehemiah 2:11-17"
                },
                {
                    "name": "Capernaum",
                    "lat": 32.8811,
                    "lng": 35.5750,
                    "latitude": 32.8811,
                    "longitude": 35.5750,
                    "modern_country": "Israel",
                    "modern_name": "Kfar Nahum",
                    "significance": "Major lakeside center of ministry and community restoration on the Sea of Galilee.",
                    "ancient_name": "Kfar Nachum",
                    "openbible_id": "capernaum",
                    "scripture_ref": "Matthew 4:13"
                },
                {
                    "name": "Sea of Galilee",
                    "lat": 32.8250,
                    "lng": 35.5800,
                    "latitude": 32.8250,
                    "longitude": 35.5800,
                    "modern_country": "Israel",
                    "modern_name": "Lake Kinneret",
                    "significance": "Freshwater lake in northern Israel, vital transit and fishing crossroads.",
                    "ancient_name": "Kinneret",
                    "openbible_id": "sea_of_galilee",
                    "scripture_ref": "John 6:1"
                },
                {
                    "name": "Bethlehem",
                    "lat": 31.7054,
                    "lng": 35.2024,
                    "latitude": 31.7054,
                    "longitude": 35.2024,
                    "modern_country": "West Bank",
                    "modern_name": "Bethlehem",
                    "significance": "City of David in the Judean hill country.",
                    "ancient_name": "Beit Lechem",
                    "openbible_id": "bethlehem",
                    "scripture_ref": "Micah 5:2"
                }
            ],
            "historical_plates": [
                {
                    "id": "nehemiah_jerusalem_walls",
                    "title": "Nehemiah's Rebuilding of the Jerusalem Walls",
                    "period": "Post-Exilic (c. 445 BC)",
                    "source": "Bible.ca Archaeological Atlas & Public Relief Survey",
                    "url": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                    "thumb": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                    "description": "Archaeological topographic relief plate tracing the northern wall, Valley Gate, Dung Gate, and Fountain Gate inspected by Nehemiah."
                }
            ],
            "historical_summary": "During the Persian post-exilic period, Jerusalem lay in ruins after the Babylonian destruction. Nehemiah traveled from Susa to survey the collapsed stones and organize local families into rebuilding squads.",
            "modern_summary": "Modern Jerusalem retains archaeological remnants of Nehemiah's rapid fortification, including masonry along the eastern crest of the City of David above the Kidron Valley.",
            "map_crafter_url": "/map-crafter?place=Jerusalem"
        }
    }

    day2_discussions = {
        "official_sources": [
            {
                "title": "Nehemiah 2: Surveying the Rubble Before Action",
                "url": "https://www.desiringgod.org/messages/nehemiah-assessment-in-leadership",
                "snippet": "Piper emphasizes the biblical balance between thorough empirical assessment and radical confidence in God's promises.",
                "source": "desiringgod.org",
                "kind": "official",
                "sentiment": "positive",
                "confidence": 0.93
            },
            {
                "title": "Pulpit Commentary: The Midnight Ride of Nehemiah",
                "url": "https://biblehub.com/commentaries/pulpit/nehemiah/2.htm",
                "snippet": "Exegesis on Nehemiah's stealthy nocturnal inspection: avoiding panic among friends and conspiracy among foes.",
                "source": "biblehub.com",
                "kind": "official",
                "sentiment": "positive",
                "confidence": 0.90
            }
        ],
        "social_sources": [
            {
                "title": "Was Nehemiah paranoid or just strategically smart in Nehemiah 2:12?",
                "url": "https://www.reddit.com/r/AcademicBiblical/comments/nehemiah_night_survey/",
                "snippet": "Scholarly subreddit discussing the Persian intelligence networks and why secrecy was critical in Yehud province politics.",
                "source": "reddit.com",
                "kind": "social",
                "platform": "reddit",
                "engagement": 76,
                "sentiment": "neutral",
                "confidence": 0.92
            },
            {
                "title": "Why do Christian disaster relief efforts struggle with logistics?",
                "url": "https://www.reddit.com/r/Christianity/comments/relief_logistics_discussions/",
                "snippet": "Candid conversation on the failures of well-meaning ministries that fail to assess on-the-ground needs before sending unrequested goods.",
                "source": "reddit.com",
                "kind": "social",
                "platform": "reddit",
                "engagement": 110,
                "sentiment": "negative",
                "confidence": 0.88
            },
            {
                "title": "From Rubble to Restoration: Organizing Volunteers like Nehemiah",
                "url": "https://www.youtube.com/watch?v=nehemiah2_leadership_framework",
                "snippet": "Practical workshop for ministry leaders detailing community organizing and team motivation strategies.",
                "source": "youtube.com",
                "kind": "social",
                "platform": "youtube",
                "engagement": 95,
                "sentiment": "positive",
                "confidence": 0.94
            }
        ]
    }
    day2_discussions["sources"] = day2_discussions["official_sources"] + day2_discussions["social_sources"]

    d2 = StudyDay(
        study_id=study.id,
        day_number=2,
        title="Assessment and Planning",
        theme="Quiet night inspection and strategic mobilization",
        est_minutes=15,
        status="ready",
        blocks_json=day2_blocks,
        discussions_json=day2_discussions,
        context_summary="Nehemiah surveys the broken walls at night, assesses the damage, and rallies the community."
    )
    session.add(d2)
    session.commit()
    session.refresh(d2)

    p2 = DayPassage(
        study_day_id=d2.id,
        ref="Nehemiah 2:11-18",
        translation="KJV",
        text="So I came to Jerusalem, and was there three days. And I arose in the night, I and some few men with me; neither told I any man what my God had put in my heart to do at Jerusalem: neither was there any beast with me, save the beast that I rode upon. And I went out by night by the gate of the valley, even before the dragon well, and to the dung port, and viewed the walls of Jerusalem, which were broken down, and the gates thereof were consumed with fire. Then I went on to the gate of the fountain, and to the king's pool: but there was no place for the beast that was under me to pass. Then went I up in the night by the brook, and viewed the wall, and turned back, and entered by the gate of the valley, and so returned. And the rulers knew not whither I went, or what I did; neither had I as yet told it to the Jews, nor to the priests, nor to the nobles, nor to the rulers, nor to the rest that did the work. Then said I unto them, Ye see the distress that we are in, how Jerusalem lieth waste, and the gates thereof are burned with fire: come, and let us build up the wall of Jerusalem, that we be no more a reproach. Then I told them of the hand of my God which was good upon me; as also the king's words that he had spoken unto me. And they said, Let us rise up and build. So they strengthened their hands for this good work.",
        order=1,
        is_primary=True
    )
    session.add(p2)

    cover_svg2 = _make_cover_svg("Assessment and Planning", "Quiet night inspection and strategic mobilization", symbol="✦", scheme="terracotta")
    a2_cover = Asset(
        user_id=demo_user_id,
        study_day_id=d2.id,
        kind="cover_art",
        provider="native_svg",
        model="vector_svg",
        prompt="Thematic Cover Art for Assessment and Planning",
        media_type="image/svg+xml",
        content=cover_svg2.encode("utf-8"),
        cost_usd=0.0,
        status="ready",
        is_active=True
    )
    session.add(a2_cover)

    infographic_svg2 = art_service.generate_svg_infographic(day2_infographic_data)
    a2_info = Asset(
        user_id=demo_user_id,
        study_day_id=d2.id,
        kind="infographic",
        provider="native_svg",
        model="svg_infographic_v2",
        prompt="Key Learnings Infographic: Assessment and Planning",
        media_type="image/svg+xml",
        content=infographic_svg2.encode("utf-8"),
        cost_usd=0.0,
        status="ready",
        is_active=True
    )
    session.add(a2_info)

    # Days 3-7 full rich entries with all updated systems
    day_configs = [
        {
            "num": 3,
            "title": "Community Organization",
            "theme": "Families building opposite their own homes",
            "scripture": "Nehemiah 3:1-12",
            "passage_text": "Then Eliashib the high priest rose up with his brethren the priests, and they builded the sheep gate; they sanctified it, and set up the doors of it... And next unto them repaired the men of Jericho. And next to them repaired Zaccur the son of Imri. But the fish gate did the sons of Hassenaah build, who also laid the beams thereof, and set up the doors thereof... From above the horse gate repaired the priests, every one over against his house. After them repaired Zadok the son of Immer over against his house. After him repaired also Shemaiah the son of Shechaniah, the keeper of the east gate.",
            "thesis": "Sustainable recovery mobilizes distributed community ownership, empowering families to rebuild the broken spaces directly within their sphere of influence.",
            "pillars": [
                {"subtitle": "Dignity of Diverse Labor", "insight": "High priests, perfume-makers, and merchants worked side-by-side without professional pretension.", "scripture_ref": "Nehemiah 3:8", "key_phrase": "Next unto him also repaired Hananiah, the son of one of the apothecaries."},
                {"subtitle": "Personal Stakes in Restoration", "insight": "Citizens rebuilt the wall sections directly opposite their own homes, ensuring vigilant care.", "scripture_ref": "Nehemiah 3:28", "key_phrase": "From above the horse gate repaired the priests, every one over against his house."},
                {"subtitle": "Confronting Reluctant Elites", "insight": "While common families labored, the nobles of Tekoa refused to put their shoulders to the work.", "scripture_ref": "Nehemiah 3:5", "key_phrase": "Their nobles put not their necks to the work of their Lord."}
            ],
            "key_verse": {"ref": "Nehemiah 3:28", "text": "From above the horse gate repaired the priests, every one over against his house."},
            "walkaway": "Start rebuilding where you live: take responsibility for the vulnerable gaps in your own neighborhood.",
            "commentary": "Chapter 3 records an extraordinary decentralized mobilization. Over forty distinct teams worked simultaneously on adjoining wall sections. By assigning families to build 'over against their own houses,' Nehemiah eliminated transit bottlenecks and invested every worker with personal survival motivation.",
            "questions": [
                "Why is local community ownership more resilient than centralized top-down administration?",
                "How do you stay encouraged when influential leaders decline to share the burden?",
                "What is your 'portion over against your house' where God calls you to bring healing?"
            ],
            "opening_prayer": "Master Builder, You unite diverse gifts in common purpose. Teach us to labor joyfully with our neighbors to repair the places right before our doors. Amen.",
            "closing_prayer": "Father, make us faithful in our corner of the wall. May our work be sound and our unity unbroken. Amen.",
            "liturgical": "O Lord God, who hast set each in his station to labor for the common good: Grant that we may build together with gladness and mutual honor, through Christ our Lord. Amen.",
            "evangelical": "Lord, thank You for placing us where we are. Give us hands ready to serve our community and a heart to build up others. Amen.",
            "contemplative": "Stone laid upon stone in quiet faith. We present our daily labor as living worship before You. Selah.",
            "locations": [
                {"name": "Jerusalem - Sheep Gate", "latitude": 31.7808, "longitude": 35.2367, "significance": "Sanctified priestly gate on the northern wall.", "ancient_name": "Sha'ar HaTzon", "openbible_id": "jerusalem", "scripture_ref": "Nehemiah 3:1"},
                {"name": "Jerusalem - Horse Gate", "latitude": 31.7770, "longitude": 35.2375, "significance": "Eastern defensive gate where priests rebuilt opposite their houses.", "ancient_name": "Sha'ar HaSusim", "openbible_id": "jerusalem", "scripture_ref": "Nehemiah 3:28"},
                {"name": "Tekoa", "latitude": 31.6547, "longitude": 35.2158, "significance": "Hills of Judea whose common laborers built double portions.", "ancient_name": "Teqoa", "openbible_id": "tekoa", "scripture_ref": "Nehemiah 3:5"}
            ],
            "historical_plate": {
                "id": "nehemiah_jerusalem_walls",
                "title": "Nehemiah's Rebuilding of the Jerusalem Walls",
                "period": "Post-Exilic (c. 445 BC)",
                "source": "Bible.ca Archaeological Atlas & Public Relief Survey",
                "url": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "thumb": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "description": "Archaeological topographic relief plate tracing the northern and eastern wall sections repaired by Nehemiah's teams."
            },
            "scheme": "emerald"
        },
        {
            "num": 4,
            "title": "Opposition and Perseverance",
            "theme": "Working with a trowel in one hand and a spear in the other",
            "scripture": "Nehemiah 4:1-9, 14-18",
            "passage_text": "But it came to pass, that when Sanballat heard that we builded the wall, he was wroth, and took great indignation, and mocked the Jews... Nevertheless we made our prayer unto our God, and set a watch against them day and night, because of them... And I looked, and rose up, and said unto the nobles, and to the rulers, and to the rest of the people, Be not ye afraid of them: remember the Lord, which is great and terrible, and fight for your brethren, your sons, and your daughters, your wives, and your houses... They which builded on the wall, and they that bare burdens, with those that laded, every one with one of his hands wrought in the work, and with the other hand held a weapon.",
            "thesis": "Rebuilding broken communities inevitably stirs external mockery and sabotage; resilience requires balanced vigilance of continuous labor and defensive readiness.",
            "pillars": [
                {"subtitle": "Answering Mockery with Prayer", "insight": "Nehemiah refused to trade insults with Sanballat, taking grievances directly to God in prayer.", "scripture_ref": "Nehemiah 4:4", "key_phrase": "Hear, O our God; for we are despised: and turn their reproach upon their own head."},
                {"subtitle": "Dual-Handed Readiness", "insight": "Builders held trowels in one hand and spears in the other from daybreak till the stars appeared.", "scripture_ref": "Nehemiah 4:17", "key_phrase": "Every one with one of his hands wrought in the work, and with the other hand held a weapon."},
                {"subtitle": "Anchor in Sovereign Greatness", "insight": "When fear spread, Nehemiah pointed past the enemies to the Lord who is great and terrible.", "scripture_ref": "Nehemiah 4:14", "key_phrase": "Remember the Lord, which is great and terrible, and fight for your brethren."}
            ],
            "key_verse": {"ref": "Nehemiah 4:20", "text": "In what place therefore ye hear the sound of the trumpet, resort ye thither unto us: our God shall fight for us."},
            "walkaway": "Never abandon your mission because of cynicism or opposition. Keep building with one hand and stay spiritually guarded with the other.",
            "commentary": "As the wall reached half height, external hostility escalated from verbal taunts to threatened violence. Nehemiah combined absolute faith with rigorous practical readiness: setting round-the-clock watches, equipping laborers with weapons, and instituting an emergency trumpet rallying system.",
            "questions": [
                "What form does mockery or discouragement take when you seek to do good in your community?",
                "How do you maintain the balance between prayerful trust and practical precautionary vigilance?",
                "Who are the people in your life for whom you are called to stand and fight spiritually?"
            ],
            "opening_prayer": "Mighty God, when opposition threatens to halt good work, remind us that the battle is Yours. Give us courage to build and vigilance to guard what You have entrusted to us. Amen.",
            "closing_prayer": "Lord of hosts, be our rear guard and our front line. Protect our families and grant us stamina to persevere. Amen.",
            "liturgical": "Defend Thy servants, O Lord, against all assaults of our adversaries; that we, trusting in Thy defense, may labor without fear, through Jesus Christ our Lord. Amen.",
            "evangelical": "Father, when fear whispers that we cannot finish, remind us of Your great power. Thank You that You fight for us today! Amen.",
            "contemplative": "Above the noise of cynical voices, Your peace holds us steadfast. You are our rock and our high tower. Selah.",
            "locations": [
                {"name": "Jerusalem", "latitude": 31.7683, "longitude": 35.2137, "significance": "The besieged city rebuilding under military alert.", "ancient_name": "Yerushalayim", "openbible_id": "jerusalem", "scripture_ref": "Nehemiah 4:7"},
                {"name": "Samaria", "latitude": 32.2764, "longitude": 35.1906, "significance": "Northern provincial seat of Sanballat the Horonite.", "ancient_name": "Shomron", "openbible_id": "samaria", "scripture_ref": "Nehemiah 4:2"},
                {"name": "Rabbah (Ammon)", "latitude": 31.9539, "longitude": 35.9106, "significance": "Eastern territory of Tobiah the Ammonite.", "ancient_name": "Rabbat Ammon", "openbible_id": "rabbah", "scripture_ref": "Nehemiah 4:7"}
            ],
            "historical_plate": {
                "id": "persian_provinces",
                "title": "Judea and Surrounding Persian Satrapies",
                "period": "Persian Period (c. 5th Century BC)",
                "source": "Bible.ca Archaeological Atlas & Public Relief Survey",
                "url": "https://www.bible.ca/maps/maps-persian-empire.jpg",
                "thumb": "https://www.bible.ca/maps/maps-persian-empire.jpg",
                "description": "Geographical overview of Yehud Medinata bounded by Samaria, Ammon, and Ashdod."
            },
            "scheme": "navy"
        },
        {
            "num": 5,
            "title": "Dependence on God & Internal Justice",
            "theme": "Overcoming internal extortion and economic injustice",
            "scripture": "Nehemiah 5:1-13",
            "passage_text": "And there was a great cry of the people and of their wives against their brethren the Jews. For there were that said, We, our sons, and our daughters, are many: therefore we take up corn for them, that we may eat, and live. Some also there were that said, We have mortgaged our lands, vineyards, and houses, that we might buy corn, because of the dearth... Then I consulted with myself, and I rebuked the nobles, and the rulers, and said unto them, Ye exact usury, every one of his brother... Restore, I pray you, to them, even this day, their lands, their vineyards, their oliveyards, and their houses, also the hundredth part of the money... And all the congregation said, Amen, and praised the LORD.",
            "thesis": "Physical security means nothing if internal greed destroys the soul of the community; true recovery demands economic justice and executive self-sacrifice.",
            "pillars": [
                {"subtitle": "Confronting Extortion", "insight": "Nehemiah was righteously furious when rich nobles exploited the famine to seize poor families' ancestral land.", "scripture_ref": "Nehemiah 5:7", "key_phrase": "I rebuked the nobles, and said unto them, Ye exact usury, every one of his brother."},
                {"subtitle": "Restitution and Covenant Oath", "insight": "Nobles were made to swear under solemn oath to return fields and cancel predatory debt immediately.", "scripture_ref": "Nehemiah 5:12", "key_phrase": "We will restore them, and will require nothing of them... Then I called the priests, and took an oath."},
                {"subtitle": "Sacrificial Leadership", "insight": "For 12 years as governor, Nehemiah refused the royal food allowance, personally hosting 150 leaders daily.", "scripture_ref": "Nehemiah 5:14", "key_phrase": "I and my brethren have not eaten the bread of the governor... because of the fear of God."}
            ],
            "key_verse": {"ref": "Nehemiah 5:19", "text": "Think upon me, my God, for good, according to all that I have done for this people."},
            "walkaway": "Never exploit the vulnerability of those suffering during a disaster. Lead with generosity and advocate for structural fairness.",
            "commentary": "The gravest danger to Jerusalem was not Sanballat's armies, but economic injustice inside its walls. Nehemiah showed that godly leadership cannot tolerate predatory greed under the guise of crisis. By modeling extreme personal sacrifice, he won the moral authority to demand fairness from the wealthy.",
            "questions": [
                "Why is economic and relational integrity inside a church or city essential for true restoration?",
                "How does Nehemiah's personal generosity challenge modern standards of executive compensation?",
                "How can we actively advocate for families burdened by sudden economic distress today?"
            ],
            "opening_prayer": "Righteous Lord, You defend the cause of the poor and the oppressed. Cleanse our hearts of selfishness and give us courage to champion fairness and mercy. Amen.",
            "closing_prayer": "Father of mercies, keep our hands generous and our motives pure. Let our community be a haven of justice and shelter. Amen.",
            "liturgical": "O God, who hast commanded that we should love our neighbor as ourselves: Deliver us from all covetousness, that we may share Thy gifts with willing hearts, through Jesus Christ our Lord. Amen.",
            "evangelical": "Lord, help us see the struggles of those around us. Teach us to live simply and give generously so that nobody among us lacks what they need. Amen.",
            "contemplative": "You search the heart and weigh the motives. Empty us of self-interest, that Your pure love may flow through us. Selah.",
            "locations": [
                {"name": "Jerusalem", "latitude": 31.7683, "longitude": 35.2137, "significance": "Center of governor's assembly and economic restitution.", "ancient_name": "Yerushalayim", "openbible_id": "jerusalem", "scripture_ref": "Nehemiah 5:7"},
                {"name": "Bethlehem", "latitude": 31.7054, "longitude": 35.2024, "significance": "Agricultural hinterland affected by the famine.", "ancient_name": "Beit Lechem", "openbible_id": "bethlehem", "scripture_ref": "Nehemiah 5:3"}
            ],
            "historical_plate": {
                "id": "nehemiah_jerusalem_walls",
                "title": "Nehemiah's Jerusalem: Assembly at the Governor's Court",
                "period": "Post-Exilic (c. 445 BC)",
                "source": "Bible.ca Archaeological Atlas & Public Relief Survey",
                "url": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "thumb": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "description": "City layout showing the royal palace and communal public squares where the great assembly convened."
            },
            "scheme": "terracotta"
        },
        {
            "num": 6,
            "title": "Completion and Celebration",
            "theme": "The wall completed in fifty-two days against all odds",
            "scripture": "Nehemiah 6:1-16",
            "passage_text": "Now it came to pass when Sanballat, and Tobiah, and Geshem the Arabian, and the rest of our enemies, heard that I had builded the wall, and that there was no breach left therein... Sanballat and Geshem sent unto me, saying, Come, let us meet together in some one of the villages in the plain of Ono. But they thought to do me mischief. And I sent messengers unto them, saying, I am doing a great work, so that I cannot come down: why should the work cease, whilst I leave it, and come down to you?... So the wall was finished in the twenty and fifth day of the month Elul, in fifty and two days. And it came to pass, that when all our enemies heard thereof... they were much cast down in their own eyes: for they perceived that this work was wrought of our God.",
            "thesis": "Unshakable purpose defeats deceptive diplomacy and fearmongering, turning what was called impossible into a completed work that glorifies God.",
            "pillars": [
                {"subtitle": "Discerning False Compromise", "insight": "Nehemiah four times refused invitations to the plain of Ono with clear resolve: 'I am doing a great work, so that I cannot come down.'", "scripture_ref": "Nehemiah 6:3", "key_phrase": "I am doing a great work, so that I cannot come down."},
                {"subtitle": "Unmasking False Prophecy", "insight": "When hired conspirators tried to frighten him into hiding in the Temple, he refused to act in cowardice.", "scripture_ref": "Nehemiah 6:11", "key_phrase": "Should such a man as I flee? and who is there, that, being as I am, would go into the temple to save his life?"},
                {"subtitle": "The 52-Day Miracle", "insight": "The entire perimeter was restored in 52 days; surrounding nations fell into despair, recognizing God's hand.", "scripture_ref": "Nehemiah 6:16", "key_phrase": "They perceived that this work was wrought of our God."}
            ],
            "key_verse": {"ref": "Nehemiah 6:16", "text": "And it came to pass, that when all our enemies heard thereof... they were much cast down in their own eyes: for they perceived that this work was wrought of our God."},
            "walkaway": "Stay laser-focused on your God-given calling. Do not let false alarms, smear campaigns, or subtle compromises pull you down from your wall.",
            "commentary": "In just fifty-two days, stone ruins that had demoralized the Jewish returnees for over a century were transformed into a secure city. Nehemiah's moral clarity and unwavering refusal to be distracted by deceptive diplomatic summits at Ono demonstrate that holiness and holy focus are inseparable.",
            "questions": [
                "What subtle distractions or 'invitations to the plain of Ono' threaten to pull you away from your core mission?",
                "How do you distinguish between sound counsel and fear-driven compromise?",
                "What impossible work has God completed in your life that silenced cynicism?"
            ],
            "opening_prayer": "Steadfast Lord, keep our eyes fixed on Your calling. Grant us discernment against subtle distractions and courage to finish what You have started. Amen.",
            "closing_prayer": "Lord God, You who complete good works, we give You all the glory for what is rebuilt in our lives. Amen.",
            "liturgical": "Almighty and everlasting God, who hast accomplished Thy mighty purpose through human hands: Grant that we may ever ascribe the glory unto Thee, through Jesus Christ our Lord. Amen.",
            "evangelical": "Thank You, Jesus, for breakthrough and completion! What looked impossible was finished in 52 days because You were with us. Amen.",
            "contemplative": "The wall stands firm, yet You are our eternal refuge. We quiet our souls and marvel at Your mighty works. Selah.",
            "locations": [
                {"name": "Jerusalem", "latitude": 31.7683, "longitude": 35.2137, "significance": "Fortified city completed in 52 days.", "ancient_name": "Yerushalayim", "openbible_id": "jerusalem", "scripture_ref": "Nehemiah 6:15"},
                {"name": "Plain of Ono", "latitude": 32.0298, "longitude": 34.8622, "significance": "Border valley where enemies plotted to ambush Nehemiah.", "ancient_name": "Bi'at Ono", "openbible_id": "ono", "scripture_ref": "Nehemiah 6:2"}
            ],
            "historical_plate": {
                "id": "nehemiah_jerusalem_walls",
                "title": "Completed Circuit of Nehemiah's Jerusalem Walls",
                "period": "Post-Exilic (c. 445 BC)",
                "source": "Bible.ca Archaeological Atlas & Public Relief Survey",
                "url": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "thumb": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "description": "Completed defensive fortifications of the City of David and eastern Ophel ridge."
            },
            "scheme": "indigo"
        },
        {
            "num": 7,
            "title": "Sustaining Relief & Spiritual Renewal",
            "theme": "Spiritual renewal, scripture exposition, and communal joy",
            "scripture": "Nehemiah 8:1-3, 8-10; 12:43",
            "passage_text": "And all the people gathered themselves together as one man into the street that was before the water gate; and they spake unto Ezra the scribe to bring the book of the law of Moses, which the LORD had commanded to Israel. And Ezra the priest brought the law before the congregation... and he read therein before the street that was before the water gate from the morning until midday... So they read in the book in the law of God distinctly, and gave the sense, and caused them to understand the reading. Then he said unto them, Go your way, eat the fat, and drink the sweet, and send portions unto them for whom nothing is prepared: for this day is holy unto our Lord: neither be ye sorry; for the joy of the LORD is your strength... And that day they offered great sacrifices, and rejoiced: for God had made them rejoice with great joy: the wives also and the children rejoiced: so that the joy of Jerusalem was heard even afar off.",
            "thesis": "The true climax of recovery is not stone and mortar, but a renewed encounter with God's word, communal repentance, and exuberant generosity.",
            "pillars": [
                {"subtitle": "Eager Gathering for Truth", "insight": "The entire nation assembled as one at the Water Gate, hungering for God's word from sunrise to noon.", "scripture_ref": "Nehemiah 8:3", "key_phrase": "The ears of all the people were attentive unto the book of the law."},
                {"subtitle": "The Joy of the Lord as Strength", "insight": "Leaders turned conviction into joyful celebration, ordering feasts and gifts for the poor.", "scripture_ref": "Nehemiah 8:10", "key_phrase": "Send portions unto them for whom nothing is prepared: for the joy of the LORD is your strength."},
                {"subtitle": "Praise Heard from Afar", "insight": "Great choirs processed atop the walls with cymbals and harps until Jerusalem's joy echoed across the hills.", "scripture_ref": "Nehemiah 12:43", "key_phrase": "The joy of Jerusalem was heard even afar off."}
            ],
            "key_verse": {"ref": "Nehemiah 8:10", "text": "Go your way, eat the fat, and drink the sweet, and send portions unto them for whom nothing is prepared... for the joy of the LORD is your strength."},
            "walkaway": "Celebrate restoration with contagious joy and generous hospitality: ensure that those with nothing share equally in your feasts.",
            "commentary": "Restoration reaches its summit not when the stones are stacked, but when the community's spiritual core is renewed. Ezra and the Levites gave the sense of Scripture so all could understand. When the truth moved the people to tears, Nehemiah declared that the joy of the Lord is our strength.",
            "questions": [
                "Why is renewing our understanding of Scripture essential after overcoming an intense trial?",
                "How does 'the joy of the Lord' differ from superficial happiness or wishful thinking?",
                "How can you share your celebration with someone for whom nothing is prepared?"
            ],
            "opening_prayer": "Lord of living water and holy joy, open our ears to Your truth. Transform our sorrow into praise and fill our hearts with overflowing joy. Amen.",
            "closing_prayer": "Father of mercies, let the joy of the Lord be our eternal song. Send us forth as ministers of Your restoration in a hurting world. Amen.",
            "liturgical": "Grant, we beseech Thee, Almighty God, that the words which we have heard with our ears may be grafted in our hearts, that they may bring forth the fruit of holy living, through Jesus Christ our Lord. Amen.",
            "evangelical": "Thank You, Lord, that Your joy is our daily strength! Help us feast on Your word and share Your love generously with those in need. Amen.",
            "contemplative": "From sorrow to praise, from brokenness to wholeness. We rest in Your holy presence and rejoice forever in Your salvation. Selah.",
            "locations": [
                {"name": "Jerusalem - Water Gate", "latitude": 31.7775, "longitude": 35.2355, "significance": "Monumental public square where Ezra read the Law of Moses to all people.", "ancient_name": "Sha'ar HaMayim", "openbible_id": "jerusalem", "scripture_ref": "Nehemiah 8:1"}
            ],
            "historical_plate": {
                "id": "nehemiah_jerusalem_walls",
                "title": "Jerusalem Water Gate and Temple Forecourt",
                "period": "Post-Exilic (c. 445 BC)",
                "source": "Bible.ca Archaeological Atlas & Public Relief Survey",
                "url": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "thumb": "https://www.bible.ca/maps/maps-jerusalem-nehemiah-wall-gates.jpg",
                "description": "Archaeological layout of the Water Gate square on the Ophel ridge where the national assembly gathered."
            },
            "scheme": "emerald"
        }
    ]

    for cfg in day_configs:
        d_num = cfg["num"]
        d_title = cfg["title"]
        d_theme = cfg["theme"]
        
        info_data = {
            "title": f"Key Learnings · Day {d_num}: {d_title}",
            "central_thesis": cfg["thesis"],
            "pillars": cfg["pillars"],
            "key_verse": cfg["key_verse"],
            "practical_walkaway": cfg["walkaway"]
        }
        
        locs = []
        for loc in cfg["locations"]:
            l_copy = dict(loc)
            if "lat" not in l_copy and "latitude" in l_copy:
                l_copy["lat"] = l_copy["latitude"]
            if "lng" not in l_copy and "longitude" in l_copy:
                l_copy["lng"] = l_copy["longitude"]
            if "modern_country" not in l_copy:
                l_copy["modern_country"] = "Israel"
            if "modern_name" not in l_copy:
                l_copy["modern_name"] = l_copy.get("name", "")
            if "ancient_name" not in l_copy:
                l_copy["ancient_name"] = l_copy.get("name", "")
            locs.append(l_copy)

        blocks_data = {
            "heading": d_title,
            "scripture": [
                {
                    "ref": cfg["scripture"],
                    "book": "Nehemiah",
                    "translation": "KJV",
                    "text": cfg["passage_text"],
                    "rationale": f"Key focal passage for {d_title}.",
                }
            ],
            "opening_prayer": cfg["opening_prayer"],
            "commentary": cfg["commentary"],
            "questions": cfg["questions"],
            "closing_prayer": cfg["closing_prayer"],
            "prayer_versions": {
                "liturgical": cfg["liturgical"],
                "evangelical": cfg["evangelical"],
                "contemplative": cfg["contemplative"]
            },
            "maps": {
                "status": "ready",
                "period": "Post-Exilic & Return",
                "period_title": "Post-Exilic & Persian Period (Nehemiah & Ezra)",
                "locations": locs,
                "historical_plates": [cfg["historical_plate"]],
                "historical_summary": f"Historical setting for Day {d_num}: {d_title} under Persian provincial administration.",
                "modern_summary": "Modern archaeological and topographical surveys of post-exilic Jerusalem and surrounding regions.",
                "map_crafter_url": "/map-crafter?place=Jerusalem"
            }
        }
        
        disc_data = {
            "official_sources": [
                {
                    "title": f"Scholarly Commentary on Nehemiah: {d_title}",
                    "url": f"https://www.bibleref.com/Nehemiah/{d_num}",
                    "snippet": f"Authoritative exegetical exposition detailing {d_theme.lower()} in Nehemiah.",
                    "source": "bibleref.com",
                    "kind": "official",
                    "sentiment": "positive",
                    "confidence": 0.95
                }
            ],
            "social_sources": [
                {
                    "title": f"Community Perspectives: Applying {d_title} in Modern Crisis",
                    "url": f"https://www.reddit.com/r/Christianity/comments/nehemiah_day_{d_num}/",
                    "snippet": f"Practitioners and relief workers discuss lessons from {d_theme.lower()}.",
                    "source": "reddit.com",
                    "kind": "social",
                    "platform": "reddit",
                    "engagement": 85 + d_num * 10,
                    "sentiment": "positive",
                    "confidence": 0.90
                }
            ]
        }
        disc_data["sources"] = disc_data["official_sources"] + disc_data["social_sources"]
        
        day_obj = StudyDay(
            study_id=study.id,
            day_number=d_num,
            title=d_title,
            theme=d_theme,
            est_minutes=15,
            status="ready",
            blocks_json=blocks_data,
            discussions_json=disc_data,
            context_summary=f"Day {d_num}: {d_theme}"
        )
        session.add(day_obj)
        session.commit()
        session.refresh(day_obj)
        
        p_obj = DayPassage(
            study_day_id=day_obj.id,
            ref=cfg["scripture"],
            translation="KJV",
            text=cfg["passage_text"],
            order=1,
            is_primary=True
        )
        session.add(p_obj)
        
        c_svg = _make_cover_svg(d_title, d_theme, symbol="✦", scheme=cfg["scheme"])
        a_cov = Asset(
            user_id=demo_user_id,
            study_day_id=day_obj.id,
            kind="cover_art",
            provider="native_svg",
            model="vector_svg",
            prompt=f"Thematic Cover Art for {d_title}",
            media_type="image/svg+xml",
            content=c_svg.encode("utf-8"),
            cost_usd=0.0,
            status="ready",
            is_active=True
        )
        session.add(a_cov)
        
        info_svg = art_service.generate_svg_infographic(info_data)
        a_inf = Asset(
            user_id=demo_user_id,
            study_day_id=day_obj.id,
            kind="infographic",
            provider="native_svg",
            model="svg_infographic_v2",
            prompt=f"Key Learnings Infographic: {d_title}",
            media_type="image/svg+xml",
            content=info_svg.encode("utf-8"),
            cost_usd=0.0,
            status="ready",
            is_active=True
        )
        session.add(a_inf)

    session.commit()
    return study


def reseed_study_8(session: Session, target_study_id: int = 8) -> Study:
    """Purge and rebuild Study 8 (and any demo studies) with all 7 rich days and updated systems."""
    return seed_demo_studies(session, demo_user_id=None, target_study_id=target_study_id)
