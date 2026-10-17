"""Biblical geography service & gazetteer.

Provides historical period and modern geographic context for biblical locations,
resolving places from scripture references, passages, and commentary.
Integrates with GCP Highlight_Map_Crafter map engine when configured,
with full offline built-in gazetteer and cartographic dataset.
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.services.historical_plates_indexer import match_historical_plates

# Pre-loaded comprehensive Biblical Gazetteer
# Each entry includes:
# - ancient_name & modern_name
# - coordinates (lat, lng)
# - biblical periods (patriarchal, exodus, monarchy, exile, roman_judea, early_church)
# - biblical_region & modern_country
# - significance note
BIBLICAL_GAZETTEER: Dict[str, Dict[str, Any]] = {
    "jerusalem": {
        "name": "Jerusalem",
        "ancient_name": "Jerusalem / Salem / Zion / Jebus / Aelia Capitolina",
        "modern_name": "Jerusalem (Al-Quds)",
        "modern_country": "Israel / West Bank",
        "lat": 31.7767,
        "lng": 35.2342,
        "period": "All Biblical Periods",
        "biblical_region": "Judea / Benjamin & Judah border",
        "description": "The City of David, site of Solomon's Temple, the crucifixion and resurrection of Jesus Christ.",
        "elevation_m": 754,
        "openbible_id": "a15257a",
        "openbible_slug": "jerusalem",
        "openbible_url": "https://www.openbible.info/geo/ancient/a15257a/jerusalem",
        "modern_basis_id": "m66c5b8",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m66c5b8.i6449a7.jpg",
        "photo_credit": "Godot13",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Jerusalem-2013(2)-Aerial-Temple_Mount-(south_exposure).jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "aerial cityscape of Jerusalem",
        "photos": [{'image_id': 'i6449a7', 'thumb_url': 'https://a.openbible.info/geo/images/512/m66c5b8.i6449a7.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/2/22/Jerusalem-2013%282%29-Aerial-Temple_Mount-%28south_exposure%29.jpg', 'credit': 'Godot13', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Jerusalem-2013(2)-Aerial-Temple_Mount-(south_exposure).jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'aerial cityscape of Jerusalem'}, {'image_id': 'i03d5e8', 'thumb_url': 'https://a.openbible.info/geo/images/512/me461ba.i03d5e8.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/f/fb/121296-Jerusalem-Mount-of-Olives_%2827524566831%29.jpg', 'credit': 'xiquinhosilva', 'credit_url': 'https://commons.wikimedia.org/wiki/File:121296-Jerusalem-Mount-of-Olives_(27524566831).jpg', 'license': 'CC-BY-2.0', 'caption': 'panorama of the Mount of Olives'}, {'image_id': 'i16da2e', 'thumb_url': 'https://a.openbible.info/geo/images/512/m629bdb.i16da2e.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Jerusalem_%2829558236553%29.jpg', 'credit': 'DYKT Mohigan', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Jerusalem_(29558236553).jpg', 'license': 'CC-BY-2.0', 'caption': 'panorama of the intersection of the Kidron Valley and the Valley of Hinnom'}, {'image_id': 'i2304ae', 'thumb_url': 'https://a.openbible.info/geo/images/512/m286edc.i2304ae.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/3/32/Isawiya_from_Hebrew_University_of_Jerusalem_at_mount_scopus.jpg', 'credit': 'Hidro', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Isawiya_from_Hebrew_University_of_Jerusalem_at_mount_scopus.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'cityscape of Isawiya'}],
    },
    "bethlehem": {
        "name": "Bethlehem",
        "ancient_name": "Bethlehem Ephrathah / Beit Lahm",
        "modern_name": "Bethlehem",
        "modern_country": "West Bank",
        "lat": 31.7043,
        "lng": 35.2076,
        "period": "Patriarchal, Monarchy, Roman Judea",
        "biblical_region": "Judea",
        "description": "Birthplace of King David and Jesus Christ; burial place of Rachel.",
        "elevation_m": 775,
        "openbible_id": "a112427",
        "openbible_slug": "bethlehem-1",
        "openbible_url": "https://www.openbible.info/geo/ancient/a112427/bethlehem-1",
        "modern_basis_id": "m9b8daa",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m9b8daa.i3d3eaa.jpg",
        "photo_credit": "Berthold Werner",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Church_of_the_Nativity_(Bethlehem,_2008).jpg",
        "photo_license": "PD",
        "photo_caption": "building at Bethlehem",
        "photos": [{'image_id': 'i3d3eaa', 'thumb_url': 'https://a.openbible.info/geo/images/512/m9b8daa.i3d3eaa.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/6/60/Church_of_the_Nativity_%28Bethlehem%2C_2008%29.jpg', 'credit': 'Berthold Werner', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Church_of_the_Nativity_(Bethlehem,_2008).jpg', 'license': 'PD', 'caption': 'building at Bethlehem'}, {'image_id': 'i9cbc96', 'thumb_url': 'https://a.openbible.info/geo/images/512/ma3ac8b.i9cbc96.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/b/bd/Templar_Architecture_In_Bethlehem_galilee_2004.jpg', 'credit': 'Ira Abramov', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Templar_Architecture_In_Bethlehem_galilee_2004.jpg', 'license': 'GPL', 'caption': 'building at Beit Lahm'}],
    },
    "nazareth": {
        "name": "Nazareth",
        "ancient_name": "Nazareth (Natzeret)",
        "modern_name": "Nazareth (En-Nasira)",
        "modern_country": "Israel",
        "lat": 32.7021,
        "lng": 35.2977,
        "period": "Roman Judea",
        "biblical_region": "Lower Galilee",
        "description": "Childhood hometown of Jesus and home of Mary and Joseph.",
        "elevation_m": 350,
        "openbible_id": "af5884f",
        "openbible_slug": "nazareth",
        "openbible_url": "https://www.openbible.info/geo/ancient/af5884f/nazareth",
        "modern_basis_id": "mb3f688",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/mb3f688.ie64eca.jpg",
        "photo_credit": "FLASHPACKER TRAVELGUIDE",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Israel_Nazareth_Old_City_Altstadt_Verk%C3%BCndigungsbasilika_Church_of_Annunciation_(34714423420).jpg",
        "photo_license": "CC-BY-SA-2.0",
        "photo_caption": "cityscape of Nazareth",
        "photos": [{'image_id': 'ie64eca', 'thumb_url': 'https://a.openbible.info/geo/images/512/mb3f688.ie64eca.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/1/14/Israel_Nazareth_Old_City_Altstadt_Verk%C3%BCndigungsbasilika_Church_of_Annunciation_%2834714423420%29.jpg', 'credit': 'FLASHPACKER TRAVELGUIDE', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Israel_Nazareth_Old_City_Altstadt_Verk%C3%BCndigungsbasilika_Church_of_Annunciation_(34714423420).jpg', 'license': 'CC-BY-SA-2.0', 'caption': 'cityscape of Nazareth'}, {'image_id': 'id9edd5', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Nazaret_Verkuendigungsbasilika_BW_16.JPG', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Nazaret_Verkuendigungsbasilika_BW_16.JPG', 'credit': 'Berthold Werner', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Nazaret_Verkuendigungsbasilika_BW_16.JPG', 'license': 'PD', 'caption': 'church at Nazareth'}],
    },
    "capernaum": {
        "name": "Capernaum",
        "ancient_name": "Capernaum (Kfar Nahum)",
        "modern_name": "Kfar Nahum / Tell Hum",
        "modern_country": "Israel",
        "lat": 32.8811,
        "lng": 35.575,
        "period": "Hellenistic / Roman Judea",
        "biblical_region": "Galilee",
        "description": "Center of Jesus' Galilean ministry; site of Peter's house and the ancient synagogue.",
        "elevation_m": -208,
        "openbible_id": "af2161c",
        "openbible_slug": "capernaum",
        "openbible_url": "https://www.openbible.info/geo/ancient/af2161c/capernaum",
        "modern_basis_id": "m66efd0",
        "confidence_score": 860,
        "photo_url": "https://a.openbible.info/geo/images/512/m66efd0.i3a45de.jpg",
        "photo_credit": "AVRAMGR",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:KFAR_NAHUM_AERIAL.JPG",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "aerial panorama of ruins at Tell Hum",
        "photos": [{'image_id': 'i3a45de', 'thumb_url': 'https://a.openbible.info/geo/images/512/m66efd0.i3a45de.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/0/0a/KFAR_NAHUM_AERIAL.JPG', 'credit': 'AVRAMGR', 'credit_url': 'https://commons.wikimedia.org/wiki/File:KFAR_NAHUM_AERIAL.JPG', 'license': 'CC-BY-SA-4.0', 'caption': 'aerial panorama of ruins at Tell Hum'}, {'image_id': 'i6d9f22', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/5/5c/IL-Kaphernaum-petrushaus.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/5c/IL-Kaphernaum-petrushaus.jpg', 'credit': 'Bgabel', 'credit_url': 'https://commons.wikimedia.org/wiki/File:IL-Kaphernaum-petrushaus.jpg', 'license': 'GFDL', 'caption': 'ruins at Tell Hum'}, {'image_id': 'ie5a3be', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/5/55/ISRAEL%2C_Capernaum%2C_The_Town_of_Jesus%2C_%28ruins%29%3B_ID_is_16-1252-103_%283%29.JPG', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/55/ISRAEL%2C_Capernaum%2C_The_Town_of_Jesus%2C_%28ruins%29%3B_ID_is_16-1252-103_%283%29.JPG', 'credit': 'Britchi Mirela', 'credit_url': 'https://commons.wikimedia.org/wiki/File:ISRAEL,_Capernaum,_The_Town_of_Jesus,_(ruins);_ID_is_16-1252-103_(3).JPG', 'license': 'CC-BY-SA-4.0', 'caption': 'ruins at Tell Hum'}],
    },
    "sea of galilee": {
        "name": "Sea of Galilee",
        "ancient_name": "Sea of Galilee / Lake of Gennesaret / Sea of Tiberias / Kinneret",
        "modern_name": "Lake Kinneret",
        "modern_country": "Israel",
        "lat": 32.8189,
        "lng": 35.59,
        "period": "All Biblical Periods",
        "biblical_region": "Galilee",
        "description": "Freshwater lake where Jesus walked on water, calmed the storm, and called fishermen disciples.",
        "elevation_m": -214,
        "openbible_id": "a562fcc",
        "openbible_slug": "sea-of-galilee",
        "openbible_url": "https://www.openbible.info/geo/ancient/a562fcc/sea-of-galilee",
        "modern_basis_id": "m0438ff",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m0438ff.i45ab11.jpg",
        "photo_credit": "Bahnfrend",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:View_from_the_Mount_of_Beatitudes,_2019_(04).jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "panorama of the Sea of Galilee",
        "photos": [{'image_id': 'i45ab11', 'thumb_url': 'https://a.openbible.info/geo/images/512/m0438ff.i45ab11.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/6/6a/View_from_the_Mount_of_Beatitudes%2C_2019_%2804%29.jpg', 'credit': 'Bahnfrend', 'credit_url': 'https://commons.wikimedia.org/wiki/File:View_from_the_Mount_of_Beatitudes,_2019_(04).jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'panorama of the Sea of Galilee'}, {'image_id': 'i044fd3', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Lake_Tiberias_%28Sea_of_Galilee%29%2C_Northern_Israel.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Lake_Tiberias_%28Sea_of_Galilee%29%2C_Northern_Israel.jpg', 'credit': 'This image was taken by the NASA Expedition 20 crew.', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Lake_Tiberias_(Sea_of_Galilee),_Northern_Israel.jpg', 'license': 'PD', 'caption': 'satellite view of the Sea of Galilee'}],
    },
    "jericho": {
        "name": "Jericho",
        "ancient_name": "Jericho (Ariha / Tell es-Sultan)",
        "modern_name": "Jericho (Ariha)",
        "modern_country": "West Bank",
        "lat": 31.8717,
        "lng": 35.4446,
        "period": "Exodus / Conquest, Monarchy, Roman Judea",
        "biblical_region": "Jordan Valley / Judea",
        "description": "One of the oldest continuously inhabited cities; site of Joshua's conquest and Zacchaeus' encounter.",
        "elevation_m": -258,
        "openbible_id": "a231f80",
        "openbible_slug": "jericho-1",
        "openbible_url": "https://www.openbible.info/geo/ancient/a231f80/jericho-1",
        "modern_basis_id": "m95349d",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m95349d.i0064af.jpg",
        "photo_credit": "Abraham",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Jerycho11.jpg",
        "photo_license": "GFDL",
        "photo_caption": "ruins at Tell es Sultan",
        "photos": [{'image_id': 'i0064af', 'thumb_url': 'https://a.openbible.info/geo/images/512/m95349d.i0064af.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Jerycho11.jpg', 'credit': 'Abraham', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Jerycho11.jpg', 'license': 'GFDL', 'caption': 'ruins at Tell es Sultan'}, {'image_id': 'i1244a7', 'thumb_url': 'https://a.openbible.info/geo/images/512/m80d92c.i1244a7.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Jericho_%2830186979605%29.jpg', 'credit': 'DYKT Mohigan', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Jericho_(30186979605).jpg', 'license': 'CC-BY-2.0', 'caption': 'closeup of Wadi Nu’eima'}, {'image_id': 'i52a039', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Jericho_BW_1.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Jericho_BW_1.jpg', 'credit': 'Berthold Werner', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Jericho_BW_1.jpg', 'license': 'PD', 'caption': 'panorama of Tell es Sultan'}, {'image_id': 'i6151fe', 'thumb_url': 'https://a.openbible.info/geo/images/512/ma342c0.i6151fe.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/3/37/Jericho_Ruinen_03.JPG', 'credit': 'Zairon', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Jericho_Ruinen_03.JPG', 'license': 'CC-BY-SA-4.0', 'caption': 'ruins at Khirbet el Mefjir'}, {'image_id': 'i6ac006', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Tell_es-sultan.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Tell_es-sultan.jpg', 'credit': 'Fullo88', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Tell_es-sultan.jpg', 'license': 'PD', 'caption': 'aerial panorama of Tell es Sultan'}],
    },
    "jordan river": {
        "name": "Jordan River",
        "ancient_name": "Jordan River (Nahr al-Urdun)",
        "modern_name": "Jordan River",
        "modern_country": "Israel / Jordan / West Bank",
        "lat": 31.7614,
        "lng": 35.5583,
        "period": "All Biblical Periods",
        "biblical_region": "Jordan Rift Valley",
        "description": "Crossed by Joshua into the Promised Land; baptism site of Jesus by John the Baptist (Al-Maghtas / Qasr al-Yahud).",
        "elevation_m": -390,
        "openbible_id": "ae686c9",
        "openbible_slug": "jordan",
        "openbible_url": "https://www.openbible.info/geo/ancient/ae686c9/jordan",
        "modern_basis_id": "me7edbd",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/me7edbd.i35a209.jpg",
        "photo_credit": "Bill Rice",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Jordan_River_(5418351509).jpg",
        "photo_license": "CC-BY-2.0",
        "photo_caption": "closeup of the Jordan River",
        "photos": [{'image_id': 'i35a209', 'thumb_url': 'https://a.openbible.info/geo/images/512/me7edbd.i35a209.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/5d/Jordan_River_%285418351509%29.jpg', 'credit': 'Bill Rice', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Jordan_River_(5418351509).jpg', 'license': 'CC-BY-2.0', 'caption': 'closeup of the Jordan River'}, {'image_id': 'i0213bf', 'thumb_url': 'https://a.openbible.info/geo/images/512/m3edbe2.i0213bf.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Ghawr_Almazra%27a_Sub-District%2C_Jordan_-_panoramio_%281%29.jpg', 'credit': 'Adeeb Atwan', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Ghawr_Almazra%27a_Sub-District,_Jordan_-_panoramio_(1).jpg', 'license': 'CC-BY-3.0', 'caption': 'panorama of hills in the region south of the Lisan'}, {'image_id': 'i054144', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/0/02/Quairah_District%2C_Jordan_-_panoramio_%281%29.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/0/02/Quairah_District%2C_Jordan_-_panoramio_%281%29.jpg', 'credit': 'Adeeb Atwan', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Quairah_District,_Jordan_-_panoramio_(1).jpg', 'license': 'CC-BY-3.0', 'caption': 'panorama of mountains near Jebel el Musraq'}, {'image_id': 'i1f2377', 'thumb_url': 'https://a.openbible.info/geo/images/512/m7aba95.i1f2377.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Joshua%27s_Tomb_in_Jordan_07.jpg', 'credit': 'Bilal Dweik', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Joshua%27s_Tomb_in_Jordan_07.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'building at Jebel Osha'}],
    },
    "dead sea": {
        "name": "Dead Sea",
        "ancient_name": "Dead Sea / Salt Sea / Sea of the Arabah",
        "modern_name": "Dead Sea",
        "modern_country": "Israel / Jordan / West Bank",
        "lat": 31.5,
        "lng": 35.5,
        "period": "All Biblical Periods",
        "biblical_region": "Judean Wilderness / Arabah",
        "description": "Lowest land elevation on Earth; proximity to Sodom and Gomorrah, En Gedi, and Qumran (Dead Sea Scrolls).",
        "elevation_m": -430,
        "openbible_id": "abed304",
        "openbible_slug": "salt-sea",
        "openbible_url": "https://www.openbible.info/geo/ancient/abed304/salt-sea",
        "modern_basis_id": "m7d469b",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m7d469b.i28c024.jpg",
        "photo_credit": "Mujaddara",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:67_border_on_Dead_sea_-_panoramio.jpg",
        "photo_license": "CC-BY-SA-3.0",
        "photo_caption": "panorama of the Dead Sea",
        "photos": [{'image_id': 'i28c024', 'thumb_url': 'https://a.openbible.info/geo/images/512/m7d469b.i28c024.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a5/67_border_on_Dead_sea_-_panoramio.jpg', 'credit': 'Mujaddara', 'credit_url': 'https://commons.wikimedia.org/wiki/File:67_border_on_Dead_sea_-_panoramio.jpg', 'license': 'CC-BY-SA-3.0', 'caption': 'panorama of the Dead Sea'}, {'image_id': 'i0dc53c', 'thumb_url': 'https://a.openbible.info/geo/images/512/m8eda70.i0dc53c.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Israel_Hiking_Map_%D7%9E%D7%A6%D7%A4%D7%95%D7%A8_%D7%A2%D7%91%D7%A8%D7%95%D7%A0%D7%94.jpeg', 'credit': 'zstadler', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Israel_Hiking_Map_%D7%9E%D7%A6%D7%A4%D7%95%D7%A8_%D7%A2%D7%91%D7%A8%D7%95%D7%A0%D7%94.jpeg', 'license': 'CC-BY-SA-4.0', 'caption': 'panorama of the modern road between the Dead Sea and the Gulf of Aqaba'}, {'image_id': 'i490474', 'thumb_url': 'https://a.openbible.info/geo/images/512/mba7a7f.i490474.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/2/26/PikiWiki_Israel_18483_desert_view.jpg', 'credit': 'אירית לוי', 'credit_url': 'https://commons.wikimedia.org/wiki/File:PikiWiki_Israel_18483_desert_view.jpg', 'license': 'CC-BY-2.5', 'caption': 'panorama in the region between the Dead Sea and the Gulf of Aqaba'}, {'image_id': 'i799e22', 'thumb_url': 'https://a.openbible.info/geo/images/512/m4c5498.i799e22.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/0/02/Shawbak_Blick_von_der_Festung_Shawbak_04.JPG', 'credit': 'Zairon', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Shawbak_Blick_von_der_Festung_Shawbak_04.JPG', 'license': 'CC-BY-SA-3.0', 'caption': 'panorama of hills in the region between the Dead Sea and Petra'}, {'image_id': 'ie6fa9a', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Dead_sea.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Dead_sea.jpg', 'credit': 'NASA', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Dead_sea.jpg', 'license': 'PD', 'caption': 'satellite view of the Dead Sea'}],
    },
    "bethany": {
        "name": "Bethany",
        "ancient_name": "Bethany (Beit 'Aniya)",
        "modern_name": "Al-Eizariya",
        "modern_country": "West Bank",
        "lat": 31.7717,
        "lng": 35.2559,
        "period": "Roman Judea",
        "biblical_region": "Judea / Mount of Olives slope",
        "description": "Home of Mary, Martha, and Lazarus; site where Jesus raised Lazarus from the dead.",
        "elevation_m": 680,
        "openbible_id": "a4f35bc",
        "openbible_slug": "bethany-1",
        "openbible_url": "https://www.openbible.info/geo/ancient/a4f35bc/bethany-1",
        "modern_basis_id": "m227592",
        "confidence_score": 753,
        "photo_url": "https://a.openbible.info/geo/images/512/m227592.icedea1.jpg",
        "photo_credit": "Naheel Abu Ghaith نهيل أبو غيث",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:2_%D8%A7%D9%84%D9%82%D9%86%D8%A7%D8%B7%D8%B1_%D9%81%D9%8A_%D8%A8%D9%84%D8%AF%D8%A9_%D8%A7%D9%84%D8%B9%D9%8A%D8%B2%D8%B1%D9%8A%D8%A9_%D8%A8%D8%A7%D9%84%D9%82%D8%AF%D8%B3.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "ruins at Al Eizariya",
        "photos": [{'image_id': 'icedea1', 'thumb_url': 'https://a.openbible.info/geo/images/512/m227592.icedea1.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/2/26/2_%D8%A7%D9%84%D9%82%D9%86%D8%A7%D8%B7%D8%B1_%D9%81%D9%8A_%D8%A8%D9%84%D8%AF%D8%A9_%D8%A7%D9%84%D8%B9%D9%8A%D8%B2%D8%B1%D9%8A%D8%A9_%D8%A8%D8%A7%D9%84%D9%82%D8%AF%D8%B3.jpg', 'credit': 'Naheel Abu Ghaith نهيل أبو غيث', 'credit_url': 'https://commons.wikimedia.org/wiki/File:2_%D8%A7%D9%84%D9%82%D9%86%D8%A7%D8%B7%D8%B1_%D9%81%D9%8A_%D8%A8%D9%84%D8%AF%D8%A9_%D8%A7%D9%84%D8%B9%D9%8A%D8%B2%D8%B1%D9%8A%D8%A9_%D8%A8%D8%A7%D9%84%D9%82%D8%AF%D8%B3.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'ruins at Al Eizariya'}, {'image_id': 'i4fec65', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/6/62/Bethany1940s.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/6/62/Bethany1940s.jpg', 'credit': 'Matson Collection', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Bethany1940s.jpg', 'license': 'PD', 'caption': 'historical cityscape of Al Eizariya'}, {'image_id': 'i640927', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/4/44/Lazarus_Bethany.JPG', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/4/44/Lazarus_Bethany.JPG', 'credit': 'Marion Doss', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Lazarus_Bethany.JPG', 'license': 'CC-BY-SA-2.0', 'caption': 'tomb of Lazarus at Al Eizariya'}, {'image_id': 'ib3031d', 'thumb_url': 'https://a.openbible.info/geo/images/512/m6b5d69.ib3031d.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Bethany_%285%29.JPG', 'credit': 'Producer', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Bethany_(5).JPG', 'license': 'CC-BY-2.5', 'caption': 'baptismal area at Al Maghtas'}],
    },
    "caesarea philippi": {
        "name": "Caesarea Philippi",
        "ancient_name": "Caesarea Philippi (Paneas / Banias)",
        "modern_name": "Banias Nature Reserve",
        "modern_country": "Golan Heights / Israel",
        "lat": 33.2461,
        "lng": 35.6933,
        "period": "Hellenistic / Roman",
        "biblical_region": "Northern Gaulanitis",
        "description": "Where Peter confessed 'You are the Christ' near the springs of Mount Hermon.",
        "elevation_m": 350,
        "openbible_id": "ab7bf48",
        "openbible_slug": "caesarea-philippi",
        "openbible_url": "https://www.openbible.info/geo/ancient/ab7bf48/caesarea-philippi",
        "modern_basis_id": "m518f8e",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m518f8e.i7a45a3.jpg",
        "photo_credit": "EdoM",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Banias_-_Agrippas_city_001.jpg",
        "photo_license": "PD",
        "photo_caption": "ruins at Banias",
        "photos": [{'image_id': 'i7a45a3', 'thumb_url': 'https://a.openbible.info/geo/images/512/m518f8e.i7a45a3.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Banias_-_Agrippas_city_001.jpg', 'credit': 'EdoM', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Banias_-_Agrippas_city_001.jpg', 'license': 'PD', 'caption': 'ruins at Banias'}],
    },
    "caesarea maritima": {
        "name": "Caesarea Maritima",
        "ancient_name": "Caesarea Maritima (Kaisareia)",
        "modern_name": "Caesarea National Park",
        "modern_country": "Israel",
        "lat": 32.5,
        "lng": 34.8917,
        "period": "Roman Judea / Early Church",
        "biblical_region": "Sharon Plain Coast",
        "description": "Roman capital of Judea where Cornelius was baptized and Paul was imprisoned before trial in Rome.",
        "elevation_m": 15,
        "openbible_id": "a58735e",
        "openbible_slug": "caesarea",
        "openbible_url": "https://www.openbible.info/geo/ancient/a58735e/caesarea",
        "modern_basis_id": "m11da12",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m11da12.i2225a2.jpg",
        "photo_credit": "DerHexer",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Caesarea_maritima_(DerHexer)_2011-08-02_098.jpg",
        "photo_license": "CC-BY-SA-3.0",
        "photo_caption": "panorama of ruins at Caesarea Maritima",
        "photos": [{'image_id': 'i2225a2', 'thumb_url': 'https://a.openbible.info/geo/images/512/m11da12.i2225a2.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Caesarea_maritima_%28DerHexer%29_2011-08-02_098.jpg', 'credit': 'DerHexer', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Caesarea_maritima_(DerHexer)_2011-08-02_098.jpg', 'license': 'CC-BY-SA-3.0', 'caption': 'panorama of ruins at Caesarea Maritima'}, {'image_id': 'ie6e0a7', 'thumb_url': None, 'full_url': None, 'credit': 'OpenBible / Wikimedia Commons', 'credit_url': 'https://www.google.com/maps/@32.5003113,34.8913211,3a,75y,353.97h,85.41t/data=!3m8!1e1!3m6!1sAF1QipOZ3K6cbLzwrFP-Z1QCqaorCDWs2B88y8-nF00m!2e10!3e11!6shttps:%2F%2Flh5.googleusercontent.com%2Fp%2FAF1QipOZ3K6cbLzwrFP-Z1QCqaorCDWs2B88y8-nF00m%3Dw203-h100-k-no-pi-0-ya281.41385-ro0-fo100!7i8704!8i4352?hl=en', 'license': 'copyright', 'caption': 'Google Streetview of Caesarea Maritima'}],
    },
    "hebron": {
        "name": "Hebron",
        "ancient_name": "Hebron (Kiriath-Arba / Mamre)",
        "modern_name": "Hebron (Al-Khalil)",
        "modern_country": "West Bank",
        "lat": 31.5251,
        "lng": 35.1022,
        "period": "Patriarchal, Monarchy",
        "biblical_region": "Judean Hill Country",
        "description": "Cave of the Patriarchs (burial of Abraham, Sarah, Isaac, Rebekah, Jacob, Leah); David's first capital.",
        "elevation_m": 927,
        "openbible_id": "a85151a",
        "openbible_slug": "hebron",
        "openbible_url": "https://www.openbible.info/geo/ancient/a85151a/hebron",
        "modern_basis_id": "m86f941",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m86f941.ib463fd.jpg",
        "photo_credit": "Dr. Avishai Teicher",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:PikiWiki_Israel_43155_Tel_Rumeida_in_Hebron.JPG",
        "photo_license": "CC-BY-2.5",
        "photo_caption": "ruins at Tel Rumeida",
        "photos": [{'image_id': 'ib463fd', 'thumb_url': 'https://a.openbible.info/geo/images/512/m86f941.ib463fd.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/6/6f/PikiWiki_Israel_43155_Tel_Rumeida_in_Hebron.JPG', 'credit': 'Dr. Avishai Teicher', 'credit_url': 'https://commons.wikimedia.org/wiki/File:PikiWiki_Israel_43155_Tel_Rumeida_in_Hebron.JPG', 'license': 'CC-BY-2.5', 'caption': 'ruins at Tel Rumeida'}, {'image_id': 'i4b6afc', 'thumb_url': 'https://a.openbible.info/geo/images/512/mb956fb.i4b6afc.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/3/32/Hebron_Cave_of_the_Patriarchs.jpg', 'credit': 'Djampa', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Hebron_Cave_of_the_Patriarchs.jpg', 'license': 'GFDL', 'caption': 'building at the Cave of the Patriarchs'}, {'image_id': 'ifbd637', 'thumb_url': 'https://a.openbible.info/geo/images/512/a375f5a.ifbd637.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a5/%D7%97%D7%91%D7%A8%D7%95%D7%9F_2013.jpg', 'credit': 'Yuvalhuck', 'credit_url': 'https://commons.wikimedia.org/wiki/File:%D7%97%D7%91%D7%A8%D7%95%D7%9F_2013.jpg', 'license': 'CC-BY-SA-3.0', 'caption': 'cityscape of Hebron in the Valley of Hebron'}],
    },
    "shechem": {
        "name": "Shechem",
        "ancient_name": "Shechem (Tell Balata / Sychar)",
        "modern_name": "Nablus / Tell Balata",
        "modern_country": "West Bank",
        "lat": 32.2136,
        "lng": 35.2819,
        "period": "Patriarchal, Conquest, Monarchy, Roman (Sychar)",
        "biblical_region": "Samaria between Mt Ebal & Mt Gerizim",
        "description": "Abraham's first altar in Canaan; Jacob's Well where Jesus spoke with the Samaritan woman.",
        "elevation_m": 500,
        "openbible_id": "adf74d4",
        "openbible_slug": "shechem",
        "openbible_url": "https://www.openbible.info/geo/ancient/adf74d4/shechem",
        "modern_basis_id": "m657590",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m657590.ia4a34f.jpg",
        "photo_credit": "יאיר דב",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:%D7%A9%D7%9B%D7%9D_%D7%94%D7%A2%D7%AA%D7%99%D7%A7%D7%94.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "aerial panorama of Tell Balatah",
        "photos": [{'image_id': 'ia4a34f', 'thumb_url': 'https://a.openbible.info/geo/images/512/m657590.ia4a34f.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/7/7c/%D7%A9%D7%9B%D7%9D_%D7%94%D7%A2%D7%AA%D7%99%D7%A7%D7%94.jpg', 'credit': 'יאיר דב', 'credit_url': 'https://commons.wikimedia.org/wiki/File:%D7%A9%D7%9B%D7%9D_%D7%94%D7%A2%D7%AA%D7%99%D7%A7%D7%94.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'aerial panorama of Tell Balatah'}, {'image_id': 'i22d89f', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/7/71/Tell_Balata.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/7/71/Tell_Balata.jpg', 'credit': 'TrickyH', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Tell_Balata.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'ruins at Tell Balatah'}, {'image_id': 'i982155', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Shechem.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Shechem.jpg', 'credit': 'Ibrahim Dwaikat', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Shechem.jpg', 'license': 'CC-BY-SA-3.0', 'caption': 'ruins at Tell Balatah'}],
    },
    "antioch": {
        "name": "Antioch (Syria)",
        "ancient_name": "Antioch on the Orontes",
        "modern_name": "Antakya",
        "modern_country": "Turkey",
        "lat": 36.2267,
        "lng": 36.1717,
        "period": "Hellenistic / Roman / Early Church",
        "biblical_region": "Syria / Cilicia",
        "description": "First place believers were called 'Christians'; launching point for Paul's missionary journeys.",
        "elevation_m": 67,
        "openbible_id": "ae41ab4",
        "openbible_slug": "antioch-1",
        "openbible_url": "https://www.openbible.info/geo/ancient/ae41ab4/antioch-1",
        "modern_basis_id": "mbe432b",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/mbe432b.i748f59.jpg",
        "photo_credit": "Volkan Hatem",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Antioch_Saint_Pierre_Church_Front.JPG",
        "photo_license": "CC-BY-2.5",
        "photo_caption": "building at Antioch on the Orontes",
        "photos": [{'image_id': 'i748f59', 'thumb_url': 'https://a.openbible.info/geo/images/512/mbe432b.i748f59.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/54/Antioch_Saint_Pierre_Church_Front.JPG', 'credit': 'Volkan Hatem', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Antioch_Saint_Pierre_Church_Front.JPG', 'license': 'CC-BY-2.5', 'caption': 'building at Antioch on the Orontes'}, {'image_id': 'i3a5c2b', 'thumb_url': 'https://a.openbible.info/geo/images/512/m93f901.i3a5c2b.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/6/62/Antioch_in_Pisidia_Augustus_Temple_2951.jpg', 'credit': 'Dosseman', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Antioch_in_Pisidia_Augustus_Temple_2951.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'ruins at Antioch in Pisidia'}, {'image_id': 'i907132', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/1/19/Antiochia_su_Oronte.PNG', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/1/19/Antiochia_su_Oronte.PNG', 'credit': 'Cristiano64', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Antiochia_su_Oronte.PNG', 'license': 'CC-BY-SA-3.0', 'caption': 'map of Antioch on the Orontes'}],
    },
    "damascus": {
        "name": "Damascus",
        "ancient_name": "Damascus (Dimashq)",
        "modern_name": "Damascus",
        "modern_country": "Syria",
        "lat": 33.5111,
        "lng": 36.3064,
        "period": "All Biblical Periods",
        "biblical_region": "Aram / Syria",
        "description": "One of the oldest cities; site of Saul's conversion on the road to Damascus and the 'Street Called Straight'.",
        "elevation_m": 680,
        "openbible_id": "a69c1d4",
        "openbible_slug": "damascus",
        "openbible_url": "https://www.openbible.info/geo/ancient/a69c1d4/damascus",
        "modern_basis_id": "m878978",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m878978.ib7e04c.jpg",
        "photo_credit": "Dosseman",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Damascus_road_along_northern_Citadel_wall_5588.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "citadel of Damascus",
        "photos": [{'image_id': 'ib7e04c', 'thumb_url': 'https://a.openbible.info/geo/images/512/m878978.ib7e04c.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/1/13/Damascus_road_along_northern_Citadel_wall_5588.jpg', 'credit': 'Dosseman', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Damascus_road_along_northern_Citadel_wall_5588.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'citadel of Damascus'}, {'image_id': 'i2a99d2', 'thumb_url': 'https://a.openbible.info/geo/images/512/mdc2906.i2a99d2.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Maaloula_%28%D9%85%D8%B9%D9%84%D9%88%D9%84%D8%A7%29%2C_Syria_-_Landscape_-_PHBZ024_2016_0146_-_Dumbarton_Oaks.jpg', 'credit': 'Frank Kidner', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Maaloula_(%D9%85%D8%B9%D9%84%D9%88%D9%84%D8%A7),_Syria_-_Landscape_-_PHBZ024_2016_0146_-_Dumbarton_Oaks.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'panorama of cliffs in the region between Damascus and Hamath'}, {'image_id': 'i9cd565', 'thumb_url': 'https://a.openbible.info/geo/images/512/mf29181.i9cd565.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Damascus_Al-Maysat_square_1612.jpg', 'credit': 'Dosseman', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Damascus_Al-Maysat_square_1612.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'cityscape along the Tora River, which runs underground here'}, {'image_id': 'if24284', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/2/21/DamascusRomanArch.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/2/21/DamascusRomanArch.jpg', 'credit': 'Heretiq', 'credit_url': 'https://commons.wikimedia.org/wiki/File:DamascusRomanArch.jpg', 'license': 'CC-BY-SA-2.5', 'caption': 'arch at Damascus'}],
    },
    "ephesus": {
        "name": "Ephesus",
        "ancient_name": "Ephesus (Ephesos)",
        "modern_name": "Selcuk, Izmir",
        "modern_country": "Turkey",
        "lat": 37.9391,
        "lng": 27.3407,
        "period": "Roman / Early Church",
        "biblical_region": "Asia Minor",
        "description": "Major metropolis of Asia Minor; site of the Temple of Artemis, Paul's 3-year ministry, and John's exile home.",
        "elevation_m": 12,
        "openbible_id": "a5feb15",
        "openbible_slug": "ephesus",
        "openbible_url": "https://www.openbible.info/geo/ancient/a5feb15/ephesus",
        "modern_basis_id": "m84025e",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m84025e.i71c678.jpg",
        "photo_credit": "Benh LIEU SONG",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Ephesus_Celsus_Library_Fa%C3%A7ade.jpg",
        "photo_license": "CC-BY-SA-3.0",
        "photo_caption": "Celsus Library at Ephesus",
        "photos": [{'image_id': 'i71c678', 'thumb_url': 'https://a.openbible.info/geo/images/512/m84025e.i71c678.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/8/84/Ephesus_Celsus_Library_Fa%C3%A7ade.jpg', 'credit': 'Benh LIEU SONG', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Ephesus_Celsus_Library_Fa%C3%A7ade.jpg', 'license': 'CC-BY-SA-3.0', 'caption': 'Celsus Library at Ephesus'}, {'image_id': 'i4a9c19', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Partherdenkmal%2C_Ephesos_Museum_Wien_2.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Partherdenkmal%2C_Ephesos_Museum_Wien_2.jpg', 'credit': 'Manfred Werner', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Partherdenkmal,_Ephesos_Museum_Wien_2.jpg', 'license': 'GFDL', 'caption': 'artifact from Ephesus'}],
    },
    "athens": {
        "name": "Athens",
        "ancient_name": "Athens (Athenai)",
        "modern_name": "Athens",
        "modern_country": "Greece",
        "lat": 37.9719,
        "lng": 23.7267,
        "period": "Hellenistic / Roman / Early Church",
        "biblical_region": "Achaia",
        "description": "Philosophical capital of Greece; Paul addressed philosophers on the Areopagus (Mars Hill).",
        "elevation_m": 70,
        "openbible_id": "a1fe6e7",
        "openbible_slug": "athens",
        "openbible_url": "https://www.openbible.info/geo/ancient/a1fe6e7/athens",
        "modern_basis_id": "md70ac9",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/md70ac9.i046518.jpg",
        "photo_credit": "George E. Koronaios",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:The_Acropolis_of_Athens_on_February_5,_2020.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "panorama of the acropolis at Athens",
        "photos": [{'image_id': 'i046518', 'thumb_url': 'https://a.openbible.info/geo/images/512/md70ac9.i046518.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a0/The_Acropolis_of_Athens_on_February_5%2C_2020.jpg', 'credit': 'George E. Koronaios', 'credit_url': 'https://commons.wikimedia.org/wiki/File:The_Acropolis_of_Athens_on_February_5,_2020.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'panorama of the acropolis at Athens'}, {'image_id': 'ib87176', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Attica_06-13_Athens_50_View_from_Philopappos_-_Acropolis_Hill.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Attica_06-13_Athens_50_View_from_Philopappos_-_Acropolis_Hill.jpg', 'credit': 'A.Savin', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Attica_06-13_Athens_50_View_from_Philopappos_-_Acropolis_Hill.jpg', 'license': 'FAL', 'caption': 'panorama of the acropolis at Athens'}],
    },
    "corinth": {
        "name": "Corinth",
        "ancient_name": "Corinth (Korinthos)",
        "modern_name": "Ancient Corinth (Archaia Korinthos)",
        "modern_country": "Greece",
        "lat": 37.9058,
        "lng": 22.8787,
        "period": "Roman / Early Church",
        "biblical_region": "Achaia (Peloponnese)",
        "description": "Major maritime commercial center; Paul stayed 18 months planting the church and writing letters.",
        "elevation_m": 80,
        "openbible_id": "a6f437a",
        "openbible_slug": "corinth",
        "openbible_url": "https://www.openbible.info/geo/ancient/a6f437a/corinth",
        "modern_basis_id": "me0518f",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/me0518f.ia60e09.jpg",
        "photo_credit": "Davide Mauro",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Tempio_di_Apollo_e_Acrocorinto.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "ruins at Corinth",
        "photos": [{'image_id': 'ia60e09', 'thumb_url': 'https://a.openbible.info/geo/images/512/me0518f.ia60e09.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Tempio_di_Apollo_e_Acrocorinto.jpg', 'credit': 'Davide Mauro', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Tempio_di_Apollo_e_Acrocorinto.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'ruins at Corinth'}],
    },
    "rome": {
        "name": "Rome",
        "ancient_name": "Roma",
        "modern_name": "Rome",
        "modern_country": "Italy",
        "lat": 41.8922,
        "lng": 12.4852,
        "period": "Roman / Early Church",
        "biblical_region": "Italia",
        "description": "Capital of the Roman Empire; Paul's imprisonment, ministry, and eventual martyrdom alongside Peter.",
        "elevation_m": 21,
        "openbible_id": "afc8e7a",
        "openbible_slug": "rome",
        "openbible_url": "https://www.openbible.info/geo/ancient/afc8e7a/rome",
        "modern_basis_id": "mb083bc",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/mb083bc.ic507f6.jpg",
        "photo_credit": "Chalaph",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Roman_Forum_from_Palatine_Hill_9-9-16.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "panorama of ruins at Rome",
        "photos": [{'image_id': 'ic507f6', 'thumb_url': 'https://a.openbible.info/geo/images/512/mb083bc.ic507f6.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Roman_Forum_from_Palatine_Hill_9-9-16.jpg', 'credit': 'Chalaph', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Roman_Forum_from_Palatine_Hill_9-9-16.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'panorama of ruins at Rome'}],
    },
    "mount sinai": {
        "name": "Mount Sinai",
        "ancient_name": "Mount Sinai / Mount Horeb",
        "modern_name": "Jabal Musa / Saint Catherine",
        "modern_country": "Egypt (Sinai Peninsula)",
        "lat": 28.5397,
        "lng": 33.9733,
        "period": "Exodus",
        "biblical_region": "Sinai Peninsula",
        "description": "Where God gave Moses the Ten Commandments and the Law; Elijah later sheltered here.",
        "elevation_m": 2285,
        "openbible_id": "abfba2a",
        "openbible_slug": "mount-sinai",
        "openbible_url": "https://www.openbible.info/geo/ancient/abfba2a/mount-sinai",
        "modern_basis_id": "mb374b4",
        "confidence_score": 463,
        "photo_url": "https://a.openbible.info/geo/images/512/mb374b4.ia1f6fd.jpg",
        "photo_credit": "Ian Sewell",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:MountSinaiView.jpg",
        "photo_license": "CC-BY-SA-1.0",
        "photo_caption": "panorama of Jebel Musa",
        "photos": [{'image_id': 'ia1f6fd', 'thumb_url': 'https://a.openbible.info/geo/images/512/mb374b4.ia1f6fd.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/5e/MountSinaiView.jpg', 'credit': 'Ian Sewell', 'credit_url': 'https://commons.wikimedia.org/wiki/File:MountSinaiView.jpg', 'license': 'CC-BY-SA-1.0', 'caption': 'panorama of Jebel Musa'}, {'image_id': 'icdffe7', 'thumb_url': None, 'full_url': None, 'credit': 'OpenBible / Wikimedia Commons', 'credit_url': 'https://www.google.com/maps/@28.5384684,33.9750865,3a,75y,242.08h,60.06t/data=!3m8!1e1!3m6!1sAF1QipPl4HaSyu26vNAlxOz1Hnwu3DTIs0o1UCdaHPys!2e10!3e11!6shttps:%2F%2Flh5.googleusercontent.com%2Fp%2FAF1QipPl4HaSyu26vNAlxOz1Hnwu3DTIs0o1UCdaHPys%3Dw203-h100-k-no-pi-0-ya199.62296-ro0-fo100!7i8704!8i4352?hl=en', 'license': 'copyright', 'caption': 'Google Streetview of Jebel Musa'}],
    },
    "mount carmel": {
        "name": "Mount Carmel",
        "ancient_name": "Mount Carmel (Har HaKarmel)",
        "modern_name": "Mount Carmel (Haifa)",
        "modern_country": "Israel",
        "lat": 32.6725,
        "lng": 35.0233,
        "period": "Monarchy",
        "biblical_region": "Northern Israel / Jezreel Valley ridge",
        "description": "Site of Elijah's confrontation with the 450 prophets of Baal.",
        "elevation_m": 546,
        "openbible_id": "a3e21c6",
        "openbible_slug": "mount-carmel",
        "openbible_url": "https://www.openbible.info/geo/ancient/a3e21c6/mount-carmel",
        "modern_basis_id": "mf9b7d7",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/mf9b7d7.i047ce9.jpg",
        "photo_credit": "Chadner",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Caiobadner_-_mount_carmel.JPG",
        "photo_license": "PD",
        "photo_caption": "panorama of Mount Carmel",
        "photos": [{'image_id': 'i047ce9', 'thumb_url': 'https://a.openbible.info/geo/images/512/mf9b7d7.i047ce9.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Caiobadner_-_mount_carmel.JPG', 'credit': 'Chadner', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Caiobadner_-_mount_carmel.JPG', 'license': 'PD', 'caption': 'panorama of Mount Carmel'}, {'image_id': 'i700ef3', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/9/99/MountCarmel1.JPG', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/9/99/MountCarmel1.JPG', 'credit': 'netanel_h', 'credit_url': 'https://commons.wikimedia.org/wiki/File:MountCarmel1.JPG', 'license': 'GFDL', 'caption': 'panorama of part of Mount Carmel'}],
    },
    "babylon": {
        "name": "Babylon",
        "ancient_name": "Babylon (Babil)",
        "modern_name": "Hillah / Babylon Archaeological Site",
        "modern_country": "Iraq",
        "lat": 32.5433,
        "lng": 44.4222,
        "period": "Babylonian Exile",
        "biblical_region": "Mesopotamia / Shinar",
        "description": "Capital of the Neo-Babylonian Empire; destination of Judah's exile under Nebuchadnezzar; home of Daniel.",
        "elevation_m": 35,
        "openbible_id": "a217d18",
        "openbible_slug": "babylon-1",
        "openbible_url": "https://www.openbible.info/geo/ancient/a217d18/babylon-1",
        "modern_basis_id": "md561de",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/md561de.i10cc45.jpg",
        "photo_credit": "Radomir Vrbovsky",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Ishtar_gate_in_Pergamon_museum_in_Berlin..jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "Ishtar gate from Babylon",
        "photos": [{'image_id': 'i10cc45', 'thumb_url': 'https://a.openbible.info/geo/images/512/md561de.i10cc45.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/5/53/Ishtar_gate_in_Pergamon_museum_in_Berlin..jpg', 'credit': 'Radomir Vrbovsky', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Ishtar_gate_in_Pergamon_museum_in_Berlin..jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'Ishtar gate from Babylon'}],
    },
    "ur of the chaldees": {
        "name": "Ur of the Chaldees",
        "ancient_name": "Ur (Tell el-Muqayyar)",
        "modern_name": "Nasiriyah / Tell al-Muqayyar",
        "modern_country": "Iraq",
        "lat": 30.9622,
        "lng": 46.1044,
        "period": "Patriarchal",
        "biblical_region": "Sumer / Lower Mesopotamia",
        "description": "Ancestral homeland of Abraham from which God called him to travel to the Promised Land.",
        "elevation_m": 8,
        "openbible_id": "a6cf75c",
        "openbible_slug": "ur-1",
        "openbible_url": "https://www.openbible.info/geo/ancient/a6cf75c/ur-1",
        "modern_basis_id": "m297af3",
        "confidence_score": 673,
        "photo_url": "https://a.openbible.info/geo/images/512/m297af3.i7a5876.jpg",
        "photo_credit": "M.Lubinski from Iraq,USA.",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Ur-Nassiriyah.jpg",
        "photo_license": "CC-BY-SA-2.0",
        "photo_caption": "ruins at Tell el Muqayyar",
        "photos": [{'image_id': 'i7a5876', 'thumb_url': 'https://a.openbible.info/geo/images/512/m297af3.i7a5876.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Ur-Nassiriyah.jpg', 'credit': 'M.Lubinski from Iraq,USA.', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Ur-Nassiriyah.jpg', 'license': 'CC-BY-SA-2.0', 'caption': 'ruins at Tell el Muqayyar'}, {'image_id': 'idc04c5', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Zig_front_right_side.JPG', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Zig_front_right_side.JPG', 'credit': 'Kaufingdude', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Zig_front_right_side.JPG', 'license': 'CC-BY-SA-3.0', 'caption': 'ziggurat at Tell el Muqayyar'}],
    },
    "nineveh": {
        "name": "Nineveh",
        "ancient_name": "Nineveh (Ninua)",
        "modern_name": "Mosul / Kouyunjik",
        "modern_country": "Iraq",
        "lat": 36.3594,
        "lng": 43.1528,
        "period": "Monarchy / Prophetic",
        "biblical_region": "Upper Tigris / Assyria",
        "description": "Great capital of the Assyrian Empire to which the prophet Jonah was sent to preach repentance.",
        "elevation_m": 223,
        "openbible_id": "a70fd5d",
        "openbible_slug": "nineveh",
        "openbible_url": "https://www.openbible.info/geo/ancient/a70fd5d/nineveh",
        "modern_basis_id": "m52bd87",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/m52bd87.i028fec.jpg",
        "photo_credit": "Osama Shukir Muhammed Amin FRCP(Glasg)",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:Ashurbanipal_II_in_a_chariot,_wall_relief,_7th_century_BC,_from_Nineveh,_the_British_Museum.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "artifact from Nineveh",
        "photos": [{'image_id': 'i028fec', 'thumb_url': 'https://a.openbible.info/geo/images/512/m52bd87.i028fec.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Ashurbanipal_II_in_a_chariot%2C_wall_relief%2C_7th_century_BC%2C_from_Nineveh%2C_the_British_Museum.jpg', 'credit': 'Osama Shukir Muhammed Amin FRCP(Glasg)', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Ashurbanipal_II_in_a_chariot,_wall_relief,_7th_century_BC,_from_Nineveh,_the_British_Museum.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'artifact from Nineveh'}, {'image_id': 'i5789c8', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/8/83/Views_of_the_archaeological_site_of_Nineveh_in_modern-day_Mosul%2C_currently_occupied_by_squatters_06.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/8/83/Views_of_the_archaeological_site_of_Nineveh_in_modern-day_Mosul%2C_currently_occupied_by_squatters_06.jpg', 'credit': 'Levi Clancy', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Views_of_the_archaeological_site_of_Nineveh_in_modern-day_Mosul,_currently_occupied_by_squatters_06.jpg', 'license': 'CC-Zero', 'caption': 'panorama of Nineveh'}],
    },
    "joppa": {
        "name": "Joppa",
        "ancient_name": "Joppa (Yafo / Japho)",
        "modern_name": "Jaffa (Tel Aviv-Yafo)",
        "modern_country": "Israel",
        "lat": 32.0545,
        "lng": 34.753,
        "period": "Monarchy, Early Church",
        "biblical_region": "Mediterranean Coast",
        "description": "Port where Jonah fled to Tarshish; Peter had his vision of the clean/unclean animals at Simon the Tanner's house.",
        "elevation_m": 30,
        "openbible_id": "ae023a9",
        "openbible_slug": "joppa",
        "openbible_url": "https://www.openbible.info/geo/ancient/ae023a9/joppa",
        "modern_basis_id": "mcb49f3",
        "confidence_score": 500,
        "photo_url": "https://a.openbible.info/geo/images/512/mcb49f3.ibf00bb.jpg",
        "photo_credit": "Godot13",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:ISR-2013-Aerial-Jaffa-Port_of_Jaffa.jpg",
        "photo_license": "CC-BY-SA-4.0",
        "photo_caption": "aerial cityscape of Jaffa",
        "photos": [{'image_id': 'ibf00bb', 'thumb_url': 'https://a.openbible.info/geo/images/512/mcb49f3.ibf00bb.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a3/ISR-2013-Aerial-Jaffa-Port_of_Jaffa.jpg', 'credit': 'Godot13', 'credit_url': 'https://commons.wikimedia.org/wiki/File:ISR-2013-Aerial-Jaffa-Port_of_Jaffa.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'aerial cityscape of Jaffa'}, {'image_id': 'i1dc5fa', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Old_Jaffa_2017.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Old_Jaffa_2017.jpg', 'credit': 'דוד שי', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Old_Jaffa_2017.jpg', 'license': 'CC-BY-SA-4.0', 'caption': 'cityscape of Jaffa'}],
    },
    "emmaus": {
        "name": "Emmaus",
        "ancient_name": "Emmaus (Nicopolis / Motza / El-Qubeibeh)",
        "modern_name": "Emmaus Nicopolis (Latrun)",
        "modern_country": "Israel",
        "lat": 31.7929,
        "lng": 35.1642,
        "period": "Roman Judea",
        "biblical_region": "Judean Foothills (Shephelah)",
        "description": "Seven miles from Jerusalem where the risen Jesus walked with two disciples and broke bread.",
        "elevation_m": 230,
        "openbible_id": "ae7274b",
        "openbible_slug": "emmaus",
        "openbible_url": "https://www.openbible.info/geo/ancient/ae7274b/emmaus",
        "modern_basis_id": "m639fec",
        "confidence_score": 204,
        "photo_url": "https://a.openbible.info/geo/images/512/m639fec.ib67872.jpg",
        "photo_credit": "אבישי טייכר",
        "photo_credit_url": "https://commons.wikimedia.org/wiki/File:PikiWiki_Israel_7415_old_citadel_in_motza.jpg",
        "photo_license": "CC-BY-2.5",
        "photo_caption": "ruins at Qalunya",
        "photos": [{'image_id': 'ib67872', 'thumb_url': 'https://a.openbible.info/geo/images/512/m639fec.ib67872.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/0/07/PikiWiki_Israel_7415_old_citadel_in_motza.jpg', 'credit': 'אבישי טייכר', 'credit_url': 'https://commons.wikimedia.org/wiki/File:PikiWiki_Israel_7415_old_citadel_in_motza.jpg', 'license': 'CC-BY-2.5', 'caption': 'ruins at Qalunya'}, {'image_id': 'i1af5ba', 'thumb_url': 'https://a.openbible.info/geo/images/512/m77574e.i1af5ba.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Emmaus_Nicopolis_basilica.JPG', 'credit': 'Emmaus', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Emmaus_Nicopolis_basilica.JPG', 'license': 'CC-BY-SA-3.0', 'caption': 'ruins at Emmaus Nicopolis'}, {'image_id': 'if02659', 'thumb_url': 'https://upload.wikimedia.org/wikipedia/commons/2/27/Qalunya.jpg', 'full_url': 'https://upload.wikimedia.org/wikipedia/commons/2/27/Qalunya.jpg', 'credit': 'Kippi70', 'credit_url': 'https://commons.wikimedia.org/wiki/File:Qalunya.jpg', 'license': 'PD', 'caption': 'historical cityscape of Qalunya'}],
    },
}

# Book-to-Default-Era and Key Locations mapping
BOOK_ERA_MAPPING: Dict[str, Dict[str, Any]] = {
    # Pentateuch
    "Genesis": {"era": "Patriarchal Era (~2000-1600 BC)", "period_key": "patriarchal", "defaults": ["ur of the chaldees", "hebron", "shechem", "jerusalem"]},
    "Exodus": {"era": "Exodus & Wilderness Journey (~1446 or 1250 BC)", "period_key": "exodus", "defaults": ["mount sinai", "dead sea", "jordan river"]},
    "Leviticus": {"era": "Sinai Encampment (~1446 BC)", "period_key": "exodus", "defaults": ["mount sinai"]},
    "Numbers": {"era": "Wilderness Wanderings (~1440-1406 BC)", "period_key": "exodus", "defaults": ["mount sinai", "dead sea", "jordan river", "jericho"]},
    "Deuteronomy": {"era": "Plains of Moab (~1406 BC)", "period_key": "exodus", "defaults": ["jordan river", "jericho", "dead sea"]},
    # Historical Books
    "Joshua": {"era": "Conquest & Allotment of Canaan (~1406-1375 BC)", "period_key": "conquest", "defaults": ["jericho", "jordan river", "shechem", "hebron"]},
    "Judges": {"era": "Period of the Judges (~1375-1050 BC)", "period_key": "judges", "defaults": ["shechem", "hebron", "mount carmel", "jerusalem"]},
    "1 Samuel": {"era": "United Monarchy: Saul & David (~1050-1010 BC)", "period_key": "monarchy", "defaults": ["bethlehem", "hebron", "jerusalem"]},
    "2 Samuel": {"era": "United Monarchy: Reign of David (~1010-970 BC)", "period_key": "monarchy", "defaults": ["jerusalem", "hebron", "bethlehem"]},
    "1 Kings": {"era": "Solomon & Divided Kingdom (~970-850 BC)", "period_key": "divided_kingdom", "defaults": ["jerusalem", "shechem", "mount carmel"]},
    "2 Kings": {"era": "Divided Kingdom & Exiles (~850-586 BC)", "period_key": "divided_kingdom", "defaults": ["jerusalem", "shechem", "nineveh", "babylon"]},
    # Gospels
    "Matthew": {"era": "Second Temple Roman Judea & Galilee (~30 AD)", "period_key": "roman_judea", "defaults": ["jerusalem", "bethlehem", "capernaum", "sea of galilee"]},
    "Mark": {"era": "Second Temple Roman Judea & Galilee (~30 AD)", "period_key": "roman_judea", "defaults": ["capernaum", "sea of galilee", "jerusalem", "jericho"]},
    "Luke": {"era": "Second Temple Roman Judea & Galilee (~30 AD)", "period_key": "roman_judea", "defaults": ["jerusalem", "nazareth", "bethlehem", "capernaum", "bethany", "emmaus"]},
    "John": {"era": "Second Temple Roman Judea & Galilee (~30 AD)", "period_key": "roman_judea", "defaults": ["jerusalem", "capernaum", "sea of galilee", "bethany", "shechem"]},
    # Acts & Epistles
    "Acts": {"era": "Apostolic Age & Roman Empire (~30-62 AD)", "period_key": "early_church", "defaults": ["jerusalem", "antioch", "damascus", "caesarea maritima", "ephesus", "athens", "corinth", "rome"]},
    "Romans": {"era": "Pauline Missions: Letter to Rome (~57 AD)", "period_key": "early_church", "defaults": ["corinth", "rome", "jerusalem"]},
    "1 Corinthians": {"era": "Pauline Missions: Aegean Ministry (~55 AD)", "period_key": "early_church", "defaults": ["corinth", "ephesus"]},
    "2 Corinthians": {"era": "Pauline Missions: Macedonia & Achaia (~56 AD)", "period_key": "early_church", "defaults": ["corinth", "ephesus"]},
    "Galatians": {"era": "Early Church: Asia Minor (~48-50 AD)", "period_key": "early_church", "defaults": ["antioch", "jerusalem"]},
    "Ephesians": {"era": "Paul's Imprisonment: Roman Asia (~60-62 AD)", "period_key": "early_church", "defaults": ["ephesus", "rome"]},
    "Philippians": {"era": "Paul's Roman Imprisonment (~61 AD)", "period_key": "early_church", "defaults": ["rome"]},
    "Colossians": {"era": "Paul's Roman Imprisonment (~61 AD)", "period_key": "early_church", "defaults": ["ephesus", "rome"]},
    "Hebrews": {"era": "Second Temple Roman Era (~60-68 AD)", "period_key": "roman_judea", "defaults": ["jerusalem"]},
    "Revelation": {"era": "Roman Asia Minor under Domitian (~95 AD)", "period_key": "early_church", "defaults": ["ephesus", "rome"]},
    "Jonah": {"era": "Neo-Assyrian Period (~780 BC)", "period_key": "monarchy", "defaults": ["joppa", "nineveh"]},
    "Daniel": {"era": "Babylonian & Persian Empires (~605-536 BC)", "period_key": "exile", "defaults": ["jerusalem", "babylon"]},
}


def extract_locations_from_text(text: str) -> List[str]:
    """Scans text or commentary for mentions of biblical places in our gazetteer."""
    found = []
    text_lower = text.lower()
    for key in BIBLICAL_GAZETTEER:
        # Match as whole word / phrase
        pattern = r"\b" + re.escape(key) + r"\b"
        if re.search(pattern, text_lower):
            found.append(key)
    return found


def extract_locations_from_passages(passages: List[Dict[str, Any]]) -> List[str]:
    """Inspects scripture references and verses for place mentions."""
    found = []
    for p in passages:
        ref_text = f"{p.get('ref', '')} {p.get('book', '')} {p.get('text', '')}"
        found.extend(extract_locations_from_text(ref_text))
    return list(dict.fromkeys(found))  # Preserve order, deduplicate


def determine_biblical_era(passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Identifies the historical period based on books cited in the day's readings."""
    for p in passages:
        book = p.get("book") or (p.get("ref", "").split()[0] if p.get("ref") else "")
        for book_key, info in BOOK_ERA_MAPPING.items():
            if book_key.lower() in book.lower():
                return info
    # Default to Roman Judea if unclear
    return {
        "era": "Biblical Era (~1st Century AD / Historical Setting)",
        "period_key": "roman_judea",
        "defaults": ["jerusalem", "capernaum", "sea of galilee", "bethlehem"]
    }


async def call_gcp_map_engine(
    places: List[Dict[str, Any]],
    period: str,
    map_engine_url: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Calls external GCP Highlight_Map_Crafter engine if URL is configured."""
    url = map_engine_url or os.getenv("HIGHLIGHT_MAP_CRAFTER_URL") or os.getenv("MAP_ENGINE_URL")
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(
                f"{url.rstrip('/')}/api/v1/maps/generate",
                json={"places": places, "period": period}
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        # Graceful fallback to built-in cartography
        pass
    return None


def calculate_bounding_box(places: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes center and viewport bounds for a set of locations."""
    if not places:
        # Default center: Jerusalem
        return {
            "center": [31.7767, 35.2345],
            "zoom": 8.5,
            "bounds": [[31.5, 34.8], [33.1, 35.8]]
        }

    lats = [p["lat"] for p in places]
    lngs = [p["lng"] for p in places]
    min_lat, max_lat = min(lats), max(lats)
    min_lng, max_lng = min(lngs), max(lngs)

    center_lat = (min_lat + max_lat) / 2
    center_lng = (min_lng + max_lng) / 2

    # Simple zoom estimation based on coordinate span
    lat_span = max(0.08, max_lat - min_lat)
    lng_span = max(0.08, max_lng - min_lng)
    span = max(lat_span, lng_span)

    if span < 0.2:
        zoom = 11.5
    elif span < 0.5:
        zoom = 10.0
    elif span < 1.5:
        zoom = 8.5
    elif span < 4.0:
        zoom = 6.8
    else:
        zoom = 5.2

    # Add margin for bounds [[south, west], [north, east]]
    margin_lat = lat_span * 0.25
    margin_lng = lng_span * 0.25
    bounds = [
        [round(min_lat - margin_lat, 4), round(min_lng - margin_lng, 4)],
        [round(max_lat + margin_lat, 4), round(max_lng + margin_lng, 4)],
    ]

    return {
        "center": [round(center_lat, 4), round(center_lng, 4)],
        "zoom": zoom,
        "bounds": bounds
    }


# Standard Protestant 66-Book Canon to OpenBible OSIS book abbreviations
BOOK_TO_OSIS: Dict[str, str] = {
    "Genesis": "gen", "Exodus": "exod", "Leviticus": "lev", "Numbers": "num", "Deuteronomy": "deut",
    "Joshua": "josh", "Judges": "judg", "Ruth": "ruth", "1 Samuel": "1sam", "2 Samuel": "2sam",
    "1 Kings": "1kgs", "2 Kings": "2kgs", "1 Chronicles": "1chr", "2 Chronicles": "2chr",
    "Ezra": "ezra", "Nehemiah": "neh", "Esther": "esth", "Job": "job", "Psalms": "ps", "Psalm": "ps",
    "Proverbs": "prov", "Ecclesiastes": "eccl", "Song of Solomon": "song", "Isaiah": "isa",
    "Jeremiah": "jer", "Lamentations": "lam", "Ezekiel": "ezek", "Daniel": "dan", "Hosea": "hos",
    "Joel": "joel", "Amos": "amos", "Obadiah": "obad", "Jonah": "jonah", "Micah": "mic",
    "Nahum": "nah", "Habakkuk": "hab", "Zephaniah": "zeph", "Haggai": "hag", "Zechariah": "zech",
    "Malachi": "mal", "Matthew": "matt", "Mark": "mark", "Luke": "luke", "John": "john",
    "Acts": "acts", "Romans": "rom", "1 Corinthians": "1cor", "2 Corinthians": "2cor",
    "Galatians": "gal", "Ephesians": "eph", "Philippians": "phil", "Colossians": "col",
    "1 Thessalonians": "1thess", "2 Thessalonians": "2thess", "1 Timothy": "1tim", "2 Timothy": "2tim",
    "Titus": "titus", "Philemon": "phlm", "Hebrews": "heb", "James": "jas", "1 Peter": "1pet",
    "2 Peter": "2pet", "1 John": "1john", "2 John": "2john", "3 John": "3john", "Jude": "jude",
    "Revelation": "rev",
}


def extract_book_and_chapter(passages: List[Dict[str, Any]]) -> Tuple[str, int, str]:
    """Identifies the primary book name, chapter number, and OSIS code for authoritative OpenBible integration."""
    for p in passages:
        ref = p.get("ref") or p.get("reference") or ""
        book = p.get("book") or ""
        if not book and ref:
            m = re.match(r"^([1-3]?\s*[A-Za-z]+)\s*(\d+)", ref.strip())
            if m:
                parsed_book = m.group(1).strip()
                chapter = int(m.group(2))
                for b_name, o_code in BOOK_TO_OSIS.items():
                    if b_name.lower() == parsed_book.lower():
                        return b_name, chapter, o_code
                return parsed_book, chapter, "gen"
        elif book:
            m = re.search(r"(\d+)", ref)
            chapter = int(m.group(1)) if m else 1
            for b_name, o_code in BOOK_TO_OSIS.items():
                if b_name.lower() in book.lower():
                    return b_name, chapter, o_code
            return book, chapter, "gen"
    return "Matthew", 1, "matt"


def resolve_day_maps(
    commentary: str,
    passages: List[Dict[str, Any]],
    saved_maps_meta: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Main entrypoint to generate dual historical and modern map configuration.

    Extracts places mentioned in the passage and commentary, matches with
    canonical OpenBible.info gazetteer coordinates, determines historical era,
    and constructs side-by-side / split-slider map configurations with photo assets.
    """
    era_info = determine_biblical_era(passages)
    primary_book, primary_chapter, osis_code = extract_book_and_chapter(passages)

    # Authoritative OpenBible KML & Interactive Chapter Preview
    book_kml_url = f"https://a.openbible.info/geo/kmls/{osis_code}.kml" if osis_code else None
    openbible_preview_url = (
        f"https://www.openbible.info/geo/preview/{osis_code}.{primary_chapter}"
        if osis_code and primary_chapter else "https://www.openbible.info/geo/"
    )

    # Detect mentioned locations
    found_keys = extract_locations_from_passages(passages)
    found_keys.extend(extract_locations_from_text(commentary))
    found_keys = list(dict.fromkeys(found_keys))

    # If no locations explicitly mentioned in text, fallback to era defaults
    if not found_keys:
        found_keys = era_info.get("defaults", ["jerusalem", "capernaum", "sea of galilee"])

    # Resolve full metadata for each location
    locations = []
    for k in found_keys:
        if k in BIBLICAL_GAZETTEER:
            loc_data = dict(BIBLICAL_GAZETTEER[k])
            locations.append(loc_data)

    view_meta = calculate_bounding_box(locations)

    # Calculate bounding box for high-resolution 2-JPG export
    min_lat, min_lng = view_meta["bounds"][0]
    max_lat, max_lng = view_meta["bounds"][1]
    bbox_str = f"{min_lng},{min_lat},{max_lng},{max_lat}"

    # Generate direct high-resolution raster JPG map plates:
    # 1. Modern Satellite JPG (ESRI World Imagery MapServer)
    modern_map_url = (
        f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?"
        f"bbox={bbox_str}&bboxSR=4326&imageSR=4326&size=1200,750&f=image&format=jpg"
    )

    # 2. Ancient Historical Topographic Relief & Depth Bathymetry JPG (GeoLibre / ESRI World Ocean Base)
    ancient_map_url = (
        f"https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/export?"
        f"bbox={bbox_str}&bboxSR=4326&imageSR=4326&size=1200,750&f=image&format=jpg"
    )

    # Direct GCS Map Crafter Admin Deep-Link
    site_names_param = ",".join([loc["name"] for loc in locations[:8]])
    map_crafter_url = (
        f"https://storage.googleapis.com/biblestudy-map-crafter/index.html?"
        f"period={era_info.get('period_key', 'roman_judea')}&"
        f"lat={view_meta['center'][0]}&lng={view_meta['center'][1]}&"
        f"zoom={view_meta['zoom']}&sites={site_names_param}&book={osis_code}"
    )

    # Historical Cartography Notes & Public Reference Citations
    historical_atlas_note = (
        f"Depicting {len(locations)} biblical site(s) during {era_info['era']}. "
        f"Verified against OpenBible.info (authoritative scholarly geocoding) with "
        f"historical relief and boundary templates from GCS Map Crafter."
    )

    modern_context_note = (
        f"Contemporary geopolitical view indicating current nations, modern municipal names, "
        f"and high-resolution satellite terrain for identical biblical coordinates."
    )

    # Match direct historical plates from Bible.ca and Knowing The Bible
    historical_plates = match_historical_plates(
        primary_book=primary_book,
        osis_code=osis_code,
        period_key=era_info.get("period_key", "roman_judea"),
        locations=locations,
        text=commentary,
    )

    return {
        "status": "ready",
        "has_locations": len(locations) > 0,
        "period": era_info.get("period_key", "roman_judea"),
        "period_title": era_info.get("era", "Biblical Era"),
        "historical_summary": historical_atlas_note,
        "modern_summary": modern_context_note,
        "locations": locations,
        "center": view_meta["center"],
        "zoom": view_meta["zoom"],
        "bounds": view_meta["bounds"],
        "book_name": primary_book,
        "chapter": primary_chapter,
        "osis_code": osis_code,
        "book_kml_url": book_kml_url,
        "openbible_preview_url": openbible_preview_url,
        "ancient_map_url": ancient_map_url,
        "modern_map_url": modern_map_url,
        "map_crafter_url": map_crafter_url,
        "historical_plates": historical_plates,
        "public_maps_refs": [
            {
                "title": f"OpenBible.info: {primary_book} {primary_chapter} Interactive Atlas",
                "url": openbible_preview_url,
            },
            {
                "title": f"OpenBible.info: {primary_book} Authoritative KML Vector File",
                "url": book_kml_url,
            },
            {
                "title": "OpenBible.info Bible Geocoding Project (Authoritative Scholarly Gazetteer)",
                "url": "https://www.openbible.info/geo/",
            },
            {
                "title": f"Bible.ca: {historical_plates['bible_ca']['title']}",
                "url": historical_plates['bible_ca']['url'],
                "source_name": historical_plates["bible_ca"].get("source_name", "Bible.ca"),
                "source_url": historical_plates["bible_ca"].get("source_url", "https://www.bible.ca/maps/"),
                "attribution": historical_plates["bible_ca"].get("attribution", ""),
            },
            {
                "title": f"Knowing The Bible: {historical_plates['knowing_the_bible']['title']}",
                "url": historical_plates['knowing_the_bible']['url'],
                "source_name": historical_plates["knowing_the_bible"].get("source_name", "Knowing The Bible"),
                "source_url": historical_plates["knowing_the_bible"].get("source_url", "https://www.knowingthebible.net/bible-maps"),
                "attribution": historical_plates["knowing_the_bible"].get("attribution", ""),
            },
        ],
    }


