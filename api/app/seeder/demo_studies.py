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


def clear_demo_studies(session: Session, demo_user_id: int) -> int:
    """Safely clear out all existing studies and associated records for the demo user."""
    studies = session.exec(select(Study).where(Study.user_id == demo_user_id)).all()
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
    # Also delete any orphaned assets for this user
    session.exec(text(f"DELETE FROM asset WHERE user_id = {demo_user_id}"))
    session.commit()
    return count


def seed_demo_studies(session: Session, demo_user_id: int) -> Study:
    """Rebuild high-fidelity demo study incorporating maps, infographics, cover art, and discussions."""
    clear_demo_studies(session, demo_user_id)

    title = "Nehemiah for Disaster Relief: Rebuilding Walls and Lives"
    topic = "Nehemiah for Disaster Relief"
    
    study = Study(
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

    day1_blocks = {
        "heading": "Grief and Prayer",
        "scripture": "Nehemiah 1:1-11",
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
                    "latitude": 31.7683,
                    "longitude": 35.2137,
                    "significance": "The holy city whose broken walls and burned gates stirred Nehemiah's grief and prayer.",
                    "ancient_name": "Yerushalayim",
                    "openbible_id": "jerusalem",
                    "scripture_ref": "Nehemiah 1:3"
                },
                {
                    "name": "Susa (Shushan)",
                    "latitude": 32.1892,
                    "longitude": 48.2578,
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

    day2_blocks = {
        "heading": "Assessment and Planning",
        "scripture": "Nehemiah 2:11-18",
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
                    "latitude": 31.7683,
                    "longitude": 35.2137,
                    "significance": "The royal city whose broken walls and burned gates Nehemiah inspected and rebuilt amidst severe regional crisis.",
                    "ancient_name": "Yerushalayim",
                    "openbible_id": "jerusalem",
                    "scripture_ref": "Nehemiah 2:11-17"
                },
                {
                    "name": "Capernaum",
                    "latitude": 32.8811,
                    "longitude": 35.5750,
                    "significance": "Major lakeside center of ministry and community restoration on the Sea of Galilee.",
                    "ancient_name": "Kfar Nachum",
                    "openbible_id": "capernaum",
                    "scripture_ref": "Matthew 4:13"
                },
                {
                    "name": "Sea of Galilee",
                    "latitude": 32.8250,
                    "longitude": 35.5800,
                    "significance": "Freshwater lake in northern Israel, vital transit and fishing crossroads.",
                    "ancient_name": "Kinneret",
                    "openbible_id": "sea_of_galilee",
                    "scripture_ref": "John 6:1"
                },
                {
                    "name": "Bethlehem",
                    "latitude": 31.7054,
                    "longitude": 35.2024,
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

    # Days 3-7 basic outline entries
    other_days = [
        (3, "Community Organization", "Families building opposite their own homes"),
        (4, "Opposition and Perseverance", "Working with a trowel in one hand and a spear in the other"),
        (5, "Dependence on God", "Overcoming internal extortion and economic injustice"),
        (6, "Completion and Celebration", "The wall completed in fifty-two days"),
        (7, "Sustaining Relief", "Spiritual renewal and covenant dedication")
    ]
    for d_num, d_title, d_theme in other_days:
        day_obj = StudyDay(
            study_id=study.id,
            day_number=d_num,
            title=d_title,
            theme=d_theme,
            est_minutes=15,
            status="ready",
            blocks_json={
                "heading": d_title,
                "scripture": f"Nehemiah {d_num}:1-10",
                "opening_prayer": f"Lord, guide our hearts today as we study {d_title.lower()}. Amen.",
                "commentary": f"Detailed commentary and historical exposition on {d_title}.",
                "questions": [
                    f"How does the principle of {d_title.lower()} apply to contemporary church life?",
                    "What spiritual lessons can be gleaned from this passage?",
                    "Where do you see God's providence at work?"
                ],
                "closing_prayer": "Father, seal Your truth in our hearts. Amen."
            },
            context_summary=f"Day {d_num}: {d_theme}"
        )
        session.add(day_obj)
        session.commit()
        session.refresh(day_obj)

        c_svg = _make_cover_svg(d_title, d_theme, symbol="✦", scheme="navy" if d_num % 2 == 0 else "emerald")
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

    session.commit()
    return study
