"""Script to generate authoritative historical maps metadata index.

Sources:
1. Bible.ca - 100 Free Printable Public Use Bible Maps (Courtesy Steve Rudd)
   Base: https://www.bible.ca/maps/
2. KnowingTheBible.net - Bible Maps Archive
   Base: https://www.knowingthebible.net/bible-maps

Proper attribution, backlinks, OSIS books, periods, and keywords are indexed.
"""
import json
import os

BIBLE_CA_SOURCE = {
    "source_name": "Bible.ca",
    "source_title": "100 Free Printable Public Use Bible Maps",
    "source_url": "https://www.bible.ca/maps/",
    "author": "Steve Rudd",
    "attribution": "Courtesy of Steve Rudd / Bible.ca (100 Free Printable Public Use Bible Maps for personal and church study)."
}

KNOWING_THE_BIBLE_SOURCE = {
    "source_name": "Knowing The Bible",
    "source_title": "Bible Maps Archive",
    "source_url": "https://www.knowingthebible.net/bible-maps",
    "author": "KnowingTheBible.net",
    "attribution": "Courtesy of KnowingTheBible.net Bible Maps Archive."
}

BIBLE_CA_MAPS = [
    {
        "id": "bca-exodus",
        "title": "The Exodus from Egypt (1446 BC)",
        "url": "https://www.bible.ca/maps/maps-the-exodus.htm",
        "books": ["Exodus", "Leviticus", "Numbers", "Deuteronomy"],
        "osis_codes": ["exod", "lev", "num", "deut"],
        "periods": ["exodus", "patriarchal"],
        "keywords": ["exodus", "egypt", "red sea", "sinai", "wilderness", "moses", "pharaoh", "nile", "goshen", "kadesh-barnea", "mount sinai", "rephidim", "wanderings"],
        "locations": ["mount sinai", "dead sea", "jordan river"]
    },
    {
        "id": "bca-abrahams-journey",
        "title": "Abraham's Journey from Ur of the Chaldees",
        "url": "https://www.bible.ca/maps/maps-near-east-abrahams-journey.htm",
        "books": ["Genesis"],
        "osis_codes": ["gen"],
        "periods": ["patriarchal"],
        "keywords": ["abraham", "abram", "ur", "chaldees", "haran", "canaan", "shechem", "bethel", "hebron", "lot", "melchizedek", "patriarchs", "sarah", "isaac", "jacob"],
        "locations": ["ur of the chaldees", "hebron", "shechem", "jerusalem"]
    },
    {
        "id": "bca-joshua-conquest",
        "title": "Joshua's Conquest of Canaan (1400-1393 BC)",
        "url": "https://www.bible.ca/archeology/bible-archeology-maps-conquest-timeline-chronology-joshua-conquest-1400-1393bc.htm",
        "books": ["Joshua"],
        "osis_codes": ["josh"],
        "periods": ["conquest"],
        "keywords": ["joshua", "conquest", "jericho", "ai", "gibeon", "jordan", "hazor", "canaanites", "rahab", "promised land"],
        "locations": ["jericho", "jordan river", "shechem", "hebron"]
    },
    {
        "id": "bca-twelve-tribes",
        "title": "Borders of the Twelve Tribes of Israel (Joshua 13-22)",
        "url": "https://www.bible.ca/maps/bible-maps-master-index-borders-twelve-12-tribes-israel-promised-land-joshua13-22-conquest-1400BC.htm",
        "books": ["Joshua", "Judges"],
        "osis_codes": ["josh", "judg"],
        "periods": ["conquest", "judges"],
        "keywords": ["twelve tribes", "allotment", "judah", "ephraim", "manasseh", "benjamin", "dan", "asher", "naphtali", "zebulun", "issachar", "gad", "reuben", "simeon", "levi", "territory"],
        "locations": ["shechem", "hebron", "jerusalem"]
    },
    {
        "id": "bca-judges",
        "title": "Israel During the Judges & Ruth (1350-1050 BC)",
        "url": "https://www.bible.ca/archeology/bible-archeology-maps-conquest-timeline-chronology-judges-othniel-ehud-ruth-1350-1204bc.htm",
        "books": ["Judges", "Ruth"],
        "osis_codes": ["judg", "ruth"],
        "periods": ["judges"],
        "keywords": ["judges", "othniel", "ehud", "ruth", "deborah", "barak", "gideon", "jephthah", "samson", "philistines", "midianites", "boaz", "bethlehem", "shiloh"],
        "locations": ["shechem", "hebron", "mount carmel", "bethlehem"]
    },
    {
        "id": "bca-united-kingdom",
        "title": "The United Kingdoms of David & Solomon (1000 BC)",
        "url": "https://www.bible.ca/maps/maps-united-kingdom.htm",
        "books": ["1 Samuel", "2 Samuel", "1 Kings", "1 Chronicles", "2 Chronicles", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon"],
        "osis_codes": ["1sam", "2sam", "1kgs", "1chr", "2chr", "ps", "prov", "eccl", "song"],
        "periods": ["monarchy"],
        "keywords": ["saul", "david", "solomon", "united kingdom", "jerusalem", "hebron", "temple", "zion", "goliath", "philistines", "jonathan", "bathsheba", "ark of the covenant", "shiloh"],
        "locations": ["bethlehem", "hebron", "jerusalem"]
    },
    {
        "id": "bca-divided-kingdom",
        "title": "The Divided Kingdoms of Israel & Judah (900-722 BC)",
        "url": "https://www.bible.ca/maps/maps-divided-kingdom.htm",
        "books": ["1 Kings", "2 Kings", "2 Chronicles", "Hosea", "Amos", "Micah", "Joel", "Jonah", "Isaiah"],
        "osis_codes": ["1kgs", "2kgs", "2chr", "hos", "amos", "mic", "joel", "jonah", "isa"],
        "periods": ["divided_kingdom"],
        "keywords": ["divided kingdom", "israel", "judah", "jeroboam", "rehoboam", "samaria", "jerusalem", "dan", "bethel", "elijah", "elisha", "carmel", "ahab", "jezebel", "jehu"],
        "locations": ["jerusalem", "shechem", "mount carmel", "samaria"]
    },
    {
        "id": "bca-near-east-empires",
        "title": "Successive World Empires: Assyria, Babylon, Persia (640-500 BC)",
        "url": "https://www.bible.ca/maps/maps-near-east-500BC.htm",
        "books": ["2 Kings", "Jeremiah", "Ezekiel", "Daniel", "Habakkuk", "Zephaniah", "Nahum", "Ezra", "Nehemiah", "Esther", "Haggai", "Zechariah", "Malachi"],
        "osis_codes": ["2kgs", "jer", "ezek", "dan", "hab", "zeph", "nah", "ezra", "neh", "esth", "hag", "zech", "mal"],
        "periods": ["divided_kingdom", "exile", "post_exile"],
        "keywords": ["babylon", "persia", "assyria", "exile", "nebuchadnezzar", "cyrus", "darius", "nineveh", "susa", "euphrates", "tigris", "return", "restoration", "captives"],
        "locations": ["jerusalem", "nineveh", "babylon", "susa"]
    },
    {
        "id": "bca-jesus-ministry",
        "title": "The Ministry of Jesus in Galilee & Judea (30-33 AD)",
        "url": "https://www.bible.ca/maps/maps-ministry-of-jesus.htm",
        "books": ["Matthew", "Mark", "Luke", "John"],
        "osis_codes": ["matt", "mark", "luke", "john"],
        "periods": ["roman_judea"],
        "keywords": ["jesus", "christ", "galilee", "capernaum", "nazareth", "sea of galilee", "bethsaida", "cana", "samaria", "jordan", "ministry", "miracles", "sermon on the mount", "disciples", "parables"],
        "locations": ["jerusalem", "bethlehem", "capernaum", "sea of galilee", "nazareth"]
    },
    {
        "id": "bca-jerusalem-33ad",
        "title": "Jerusalem at the Time of Jesus (33 AD)",
        "url": "https://www.bible.ca/maps/maps-jerusalem-33AD.htm",
        "books": ["Matthew", "Mark", "Luke", "John", "Acts", "Hebrews"],
        "osis_codes": ["matt", "mark", "luke", "john", "acts", "heb"],
        "periods": ["roman_judea"],
        "keywords": ["jerusalem", "temple", "temple mount", "gethsemane", "golgotha", "calvary", "mount of olives", "kidron", "pool of siloam", "bethesda", "passion", "crucifixion", "resurrection", "upper room"],
        "locations": ["jerusalem", "mount of olives", "bethany"]
    },
    {
        "id": "bca-palestine-33ad",
        "title": "Israel at the Time of Jesus (33 AD)",
        "url": "https://www.bible.ca/maps/maps-palestine-33AD.htm",
        "books": ["Matthew", "Mark", "Luke", "John"],
        "osis_codes": ["matt", "mark", "luke", "john"],
        "periods": ["roman_judea"],
        "keywords": ["palestine", "israel", "judea", "galilee", "samaria", "decapolis", "perea", "idumea", "herod", "pilate", "jordan river", "dead sea"],
        "locations": ["jerusalem", "capernaum", "sea of galilee", "bethlehem", "jericho"]
    },
    {
        "id": "bca-synagogues",
        "title": "Ancient Synagogues of the First Century (Time of Jesus)",
        "url": "https://www.bible.ca/maps/MAP-master-list-Ancient-synagogues-location-sites-bible-first-century-time-of-Jesus-archeology-oldest-second-temple-period-era-pre70AD.htm",
        "books": ["Matthew", "Mark", "Luke", "John", "Acts"],
        "osis_codes": ["matt", "mark", "luke", "john", "acts"],
        "periods": ["roman_judea", "early_church"],
        "keywords": ["synagogue", "capernaum", "magdala", "gamla", "masada", "herodium", "jericho", "second temple", "pre-70ad"],
        "locations": ["capernaum", "jerusalem", "magdala"]
    },
    {
        "id": "bca-pauls-first-journey",
        "title": "Paul's First Missionary Journey (Acts 13-14)",
        "url": "https://www.bible.ca/maps/maps-pauls-first-journey.htm",
        "books": ["Acts", "Galatians"],
        "osis_codes": ["acts", "gal"],
        "periods": ["early_church"],
        "keywords": ["paul", "barnabas", "first journey", "cyprus", "salamis", "paphos", "perga", "antioch in pisidia", "iconium", "lystra", "derbe", "attalia"],
        "locations": ["antioch", "jerusalem"]
    },
    {
        "id": "bca-pauls-second-journey",
        "title": "Paul's Second Missionary Journey (Acts 15-18)",
        "url": "https://www.bible.ca/maps/maps-pauls-second-journey.htm",
        "books": ["Acts", "1 Thessalonians", "2 Thessalonians", "Galatians"],
        "osis_codes": ["acts", "1thess", "2thess", "gal"],
        "periods": ["early_church"],
        "keywords": ["paul", "silas", "timothy", "second journey", "philippi", "thessalonica", "berea", "athens", "corinth", "troas", "macedonia", "achaia", "cenchreae"],
        "locations": ["athens", "corinth", "antioch", "jerusalem"]
    },
    {
        "id": "bca-pauls-third-journey",
        "title": "Paul's Third Missionary Journey (Acts 18-21)",
        "url": "https://www.bible.ca/maps/maps-pauls-third-journey.htm",
        "books": ["Acts", "1 Corinthians", "2 Corinthians", "Romans", "Galatians"],
        "osis_codes": ["acts", "1cor", "2cor", "rom", "gal"],
        "periods": ["early_church"],
        "keywords": ["paul", "third journey", "ephesus", "asia minor", "miletus", "troas", "corinth", "rhodes", "tyre", "ptolemais", "caesarea", "diana"],
        "locations": ["ephesus", "corinth", "caesarea maritima", "jerusalem"]
    },
    {
        "id": "bca-pauls-rome-journey",
        "title": "Paul's Journey to Rome (Acts 21-28)",
        "url": "https://www.bible.ca/maps/maps-pauls-rome-journey.htm",
        "books": ["Acts", "Romans", "Ephesians", "Philippians", "Colossians", "Philemon"],
        "osis_codes": ["acts", "rom", "eph", "phil", "col", "phlm"],
        "periods": ["early_church"],
        "keywords": ["paul", "rome", "journey to rome", "voyage", "shipwreck", "malta", "melita", "crete", "fair havens", "syracuse", "rhegium", "puteoli", "appian way", "caesar"],
        "locations": ["rome", "caesarea maritima", "jerusalem"]
    },
    {
        "id": "bca-pauls-acts-29",
        "title": "Paul's Final Journeys & Pastoral Epistles (2 Timothy)",
        "url": "https://www.bible.ca/maps/maps-pauls-acts-29.htm",
        "books": ["1 Timothy", "2 Timothy", "Titus"],
        "osis_codes": ["1tim", "2tim", "titus"],
        "periods": ["early_church"],
        "keywords": ["paul", "pastoral", "timothy", "titus", "crete", "nicopolis", "miletus", "rome", "mamertine", "martyrdom"],
        "locations": ["rome", "ephesus"]
    },
    {
        "id": "bca-churches-bible-70ad",
        "title": "Directory of Churches Mentioned in the Bible (33-100 AD)",
        "url": "https://www.bible.ca/maps/maps-ancient-churches-bible-70AD.jpg",
        "books": ["Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "Revelation"],
        "osis_codes": ["acts", "rom", "1cor", "2cor", "gal", "eph", "phil", "col", "1thess", "2thess", "rev"],
        "periods": ["early_church"],
        "keywords": ["churches", "new testament", "ephesus", "smyrna", "pergamum", "thyatira", "sardis", "philadelphia", "laodicea", "corinth", "rome", "antioch", "jerusalem"],
        "locations": ["ephesus", "corinth", "rome", "antioch", "jerusalem"]
    },
    {
        "id": "bca-madaba-map",
        "title": "The Madaba Mosaic Map (550 AD)",
        "url": "https://www.bible.ca/archeology/bible-archeology-exodus-madaba-map.htm",
        "books": ["Joshua", "Matthew", "John"],
        "osis_codes": ["josh", "matt", "john"],
        "periods": ["roman_judea", "early_church"],
        "keywords": ["madaba", "mosaic", "jerusalem", "byzantine", "jordan", "dead sea"],
        "locations": ["jerusalem", "jordan river", "dead sea"]
    }
]

# All 50 Knowing The Bible maps
KTB_RAW_LIST = [
    (1, "The Near East", "90-01-the-near-east", ["Genesis"], ["gen"], ["patriarchal"], ["near east", "mesopotamia", "cradle", "eden", "flood", "babel"], ["ur of the chaldees"]),
    (2, "The Table of Nations", "91-02-the-table-of-nations", ["Genesis"], ["gen"], ["patriarchal"], ["nations", "noah", "shem", "ham", "japheth", "babel", "peleg", "table of nations"], ["ur of the chaldees"]),
    (3, "The Near East During the Time of the Patriarchs", "92-03-the-near-east-during-the-time-of-the-patriarchs", ["Genesis"], ["gen"], ["patriarchal"], ["patriarchs", "abraham", "isaac", "jacob", "haran", "ur", "canaan"], ["ur of the chaldees", "hebron", "shechem"]),
    (4, "The Natural Regions of Canaan", "93-04-the-natural-regions-of-canaan", ["Genesis", "Exodus", "Numbers", "Joshua"], ["gen", "exod", "num", "josh"], ["patriarchal", "conquest"], ["canaan", "geography", "topography", "shephelah", "judean hills", "negev", "galilee", "jordan valley"], ["jerusalem", "hebron", "shechem"]),
    (5, "The Land of Canaan", "94-05-the-land-of-canaan", ["Genesis", "Numbers", "Deuteronomy", "Joshua"], ["gen", "num", "deut", "josh"], ["patriarchal", "conquest"], ["canaan", "canaanites", "land of promise", "hittites", "amorites", "perizzites", "hivites", "jebusites"], ["jerusalem", "shechem", "hebron"]),
    (6, "The Roadways of Canaan", "95-06-the-roadways-of-canaan", ["Genesis", "Joshua", "Judges", "1 Samuel"], ["gen", "josh", "judg", "1sam"], ["patriarchal", "conquest", "monarchy"], ["roadways", "highway", "way of the sea", "kings highway", "ridge route", "trade routes"], ["jerusalem", "shechem", "megiddo"]),
    (7, "Canaan During the Time of the Patriarchs", "96-07-canaan-during-the-time-of-the-patriarchs", ["Genesis"], ["gen"], ["patriarchal"], ["patriarchs", "abraham", "isaac", "jacob", "beersheba", "hebron", "bethel", "shechem", "moriah"], ["hebron", "shechem", "jerusalem"]),
    (8, "Israel's Exodus and Wanderings", "97-08-israels-exodus-and-wanderings", ["Exodus", "Numbers", "Deuteronomy"], ["exod", "num", "deut"], ["exodus"], ["exodus", "wilderness", "wanderings", "red sea", "sinai", "kadesh-barnea", "edom", "moab", "moses"], ["mount sinai", "dead sea", "jordan river"]),
    (9, "The Promised Land", "98-09-the-promised-land", ["Numbers", "Deuteronomy", "Joshua"], ["num", "deut", "josh"], ["conquest"], ["promised land", "canaan", "inheritance", "covenant", "abrahamic covenant", "joshua"], ["jordan river", "jericho"]),
    (10, "Canaan Before the Conquest of Joshua", "99-10-canaan-before-the-conquest-of-joshua", ["Numbers", "Deuteronomy", "Joshua"], ["num", "deut", "josh"], ["conquest"], ["conquest", "joshua", "canaan", "kings of canaan", "jericho", "ai", "hazor"], ["jericho", "jordan river"]),
    (11, "Israel After their Defeat of Sihon and Og", "100-11-israel-after-their-defeat-of-sihon-and-og", ["Numbers", "Deuteronomy", "Joshua"], ["num", "deut", "josh"], ["exodus", "conquest"], ["sihon", "og", "transjordan", "bashan", "gilead", "plains of moab", "hesbon", "reuben", "gad"], ["jordan river", "dead sea"]),
    (12, "The Boundaries of Israel", "101-12-the-boundaries-of-israel", ["Numbers", "Joshua"], ["num", "josh"], ["conquest"], ["boundaries", "borders", "land of israel", "dan to beersheba", "euphrates", "brook of egypt"], ["jerusalem", "hebron"]),
    (13, "The Conquest of Canaan Under Joshua", "102-13-the-conquest-of-canaan-under-joshua", ["Joshua"], ["josh"], ["conquest"], ["conquest", "joshua", "central campaign", "southern campaign", "northern campaign", "jericho", "ai", "gibeon", "hazor"], ["jericho", "jordan river", "shechem", "hebron"]),
    (14, "The Tribal Allotments of Israel", "103-14-the-tribal-allotments-of-israel", ["Joshua", "Judges"], ["josh", "judg"], ["conquest", "judges"], ["tribal allotments", "twelve tribes", "judah", "ephraim", "benjamin", "dan", "manasseh", "cities of refuge"], ["shechem", "hebron", "jerusalem"]),
    (15, "Israel During the Time of the Judges", "104-15-israel-during-the-time-of-the-judges", ["Judges", "Ruth"], ["judg", "ruth"], ["judges"], ["judges", "othniel", "ehud", "deborah", "barak", "gideon", "jephthah", "samson", "philistines", "moabites", "midianites"], ["shechem", "hebron", "mount carmel"]),
    (16, "The Kingdom of Saul", "105-16-the-kingdom-of-saul", ["1 Samuel"], ["1sam"], ["monarchy"], ["saul", "king saul", "gibeah", "michmash", "gilboa", "amalekites", "philistines", "samuel"], ["bethlehem", "hebron", "jerusalem"]),
    (17, "The Kingdoms of Ish-Bosheth and David", "106-17-the-kingdoms-of-ish-bosheth-and-david", ["2 Samuel"], ["2sam"], ["monarchy"], ["ish-bosheth", "david", "hebron", "mahanaim", "civil war", "abner", "joab"], ["hebron", "jerusalem"]),
    (18, "The Kingdom of David", "107-18-the-kingdom-of-david", ["2 Samuel", "1 Chronicles", "Psalms"], ["2sam", "1chr", "ps"], ["monarchy"], ["david", "king david", "jerusalem", "city of david", "zion", "conquests", "edom", "moab", "ammon", "syria"], ["jerusalem", "hebron", "bethlehem"]),
    (19, "The Kingdom of Solomon", "108-19-the-kingdom-of-solomon", ["1 Kings", "2 Chronicles", "Proverbs", "Ecclesiastes"], ["1kgs", "2chr", "prov", "eccl"], ["monarchy"], ["solomon", "king solomon", "temple", "peace", "glory", "fleet", "ezion-geber", "tyre", "hiram"], ["jerusalem", "shechem"]),
    (20, "Solomon's Administrative Districts", "109-20-solomons-administrative-districts", ["1 Kings"], ["1kgs"], ["monarchy"], ["solomon", "administrative districts", "governors", "provisions", "twelve officers"], ["jerusalem", "shechem", "megiddo"]),
    (21, "The Divided Kingdom", "110-21-the-divided-kingdom", ["1 Kings", "2 Kings", "2 Chronicles"], ["1kgs", "2kgs", "2chr"], ["divided_kingdom"], ["divided kingdom", "israel", "judah", "jeroboam", "rehoboam", "samaria", "dan", "bethel", "shechem"], ["jerusalem", "shechem", "samaria"]),
    (22, "The Assyrian Empire", "111-22-the-assyrian-empire", ["2 Kings", "Isaiah", "Jonah", "Nahum"], ["2kgs", "isa", "jonah", "nah"], ["divided_kingdom"], ["assyria", "assyrian empire", "nineveh", "tigris", "tiglath-pileser", "sargon", "sennacherib", "fall of samaria"], ["nineveh", "jerusalem", "samaria"]),
    (23, "Assyrian Districts in the Land of Israel", "112-23-assyrian-districts-in-the-land-of-israel", ["2 Kings"], ["2kgs"], ["divided_kingdom"], ["assyrian districts", "exile of israel", "samaria", "megiddo", "dor", "gilead"], ["samaria", "jerusalem"]),
    (24, "The Babylonian Empire", "113-24-the-babylonian-empire", ["2 Kings", "Jeremiah", "Ezekiel", "Daniel", "Habakkuk"], ["2kgs", "jer", "ezek", "dan", "hab"], ["exile"], ["babylon", "babylonian empire", "nebuchadnezzar", "chaldeans", "fall of jerusalem", "exile", "captivity"], ["jerusalem", "babylon"]),
    (25, "The Median Empire", "114-25-the-median-empire", ["Daniel"], ["dan"], ["exile"], ["media", "median empire", "medes", "ecbatana", "darius the mede"], ["babylon", "jerusalem"]),
    (26, "The Persian Empire", "115-26-the-persian-empire", ["Ezra", "Nehemiah", "Esther", "Daniel", "Haggai", "Zechariah", "Malachi"], ["ezra", "neh", "esth", "dan", "hag", "zech", "mal"], ["exile", "post_exile"], ["persia", "persian empire", "cyrus", "darius", "xerxes", "ahasuerus", "susa", "persepolis", "provinces", "satrapies"], ["susa", "babylon", "jerusalem"]),
    (27, "Judah After the Return from Exile", "116-27-judah-after-the-return-from-exile", ["Ezra", "Nehemiah", "Haggai", "Zechariah", "Malachi"], ["ezra", "neh", "hag", "zech", "mal"], ["post_exile"], ["return from exile", "judah", "yehud", "zerubbabel", "ezra", "nehemiah", "walls of jerusalem", "second temple"], ["jerusalem"]),
    (28, "The Greek Empire of Alexander III", "117-28-the-greek-empire-of-alexander-iii", ["Daniel"], ["dan"], ["hellenistic"], ["alexander the great", "greek empire", "macedonia", "conquest of persia", "hellenism"], ["jerusalem", "babylon", "alexandria"]),
    (29, "The Greek Empire of the Diadochi", "118-29-the-greek-empire-of-the-diadochi", ["Daniel"], ["dan"], ["hellenistic"], ["diadochi", "successors", "ptolemy", "seleucus", "cassander", "lysimachus", "division"], ["jerusalem", "antioch", "alexandria"]),
    (30, "The Greek Empire of the Seleucids", "119-30-the-greek-empire-of-the-seleucids", ["Daniel"], ["dan"], ["hellenistic"], ["seleucids", "antiochus epiphanes", "syria", "antioch", "abomination of desolation"], ["jerusalem", "antioch"]),
    (31, "Jewish Expansion Under the Hasmoneans", "120-31-jewish-expansion-under-the-hasmoneans", ["Daniel"], ["dan"], ["hasmonean"], ["hasmoneans", "maccabees", "judas maccabeus", "jewish expansion", "jonathan", "simon", "john hyrcanus"], ["jerusalem", "hebron", "samaria"]),
    (32, "The Rise of the Roman Empire", "121-32-the-rise-of-the-roman-empire", ["Luke"], ["luke"], ["roman_judea"], ["rome", "roman empire", "pompey", "conquest of judea", "julius caesar", "augustus"], ["rome", "jerusalem"]),
    (33, "The Roman Empire", "122-33-the-roman-empire", ["Luke", "Acts", "Romans"], ["luke", "acts", "rom"], ["roman_judea", "early_church"], ["roman empire", "caesar augustus", "provinces", "mediterranean", "pax romana"], ["rome", "jerusalem", "antioch", "alexandria"]),
    (34, "The Kingdom of Herod I", "123-34-the-kingdom-of-herod-i", ["Matthew", "Luke"], ["matt", "luke"], ["roman_judea"], ["herod the great", "kingdom of herod", "herodian", "temple rebuilding", "masada", "caesarea", "bethlehem"], ["jerusalem", "bethlehem", "caesarea maritima"]),
    (35, "The Division of Herod's Kingdom", "124-35-the-division-of-herods-kingdom", ["Matthew", "Mark", "Luke"], ["matt", "mark", "luke"], ["roman_judea"], ["division of herods kingdom", "archelaus", "herod antipas", "philip", "tetrarchy", "judea", "galilee", "iturea"], ["jerusalem", "nazareth", "capernaum"]),
    (36, "Israel During the Time of Jesus", "125-36-israel-during-the-time-of-jesus", ["Matthew", "Mark", "Luke", "John"], ["matt", "mark", "luke", "john"], ["roman_judea"], ["jesus", "gospels", "galilee", "judea", "samaria", "sea of galilee", "nazareth", "capernaum", "bethlehem", "jerusalem"], ["jerusalem", "capernaum", "sea of galilee", "bethlehem", "nazareth"]),
    (37, "Israel During the Time of Acts", "126-37-israel-during-the-time-of-acts", ["Acts"], ["acts"], ["early_church"], ["acts", "early church", "apostles", "pentecost", "jerusalem", "caesarea", "joppa", "samaria", "philip", "peter", "cornelius"], ["jerusalem", "caesarea maritima", "joppa", "samaria"]),
    (38, "The Mediterranean World During the Time of Acts", "127-38-the-mediterranean-world-during-the-time-of-acts", ["Acts"], ["acts"], ["early_church"], ["mediterranean", "acts", "apostolic age", "asia minor", "greece", "rome", "paul", "barnabas"], ["jerusalem", "antioch", "ephesus", "corinth", "rome"]),
    (39, "Paul's First Missionary Journey", "128-39-pauls-first-missionary-journey", ["Acts", "Galatians"], ["acts", "gal"], ["early_church"], ["paul", "first missionary journey", "barnabas", "cyprus", "paphos", "perga", "pisidian antioch", "iconium", "lystra", "derbe"], ["antioch", "jerusalem"]),
    (40, "Paul's Second Missionary Journey", "129-40-pauls-second-missionary-journey", ["Acts", "1 Thessalonians", "2 Thessalonians", "Galatians"], ["acts", "1thess", "2thess", "gal"], ["early_church"], ["paul", "second missionary journey", "silas", "timothy", "philippi", "thessalonica", "berea", "athens", "corinth", "macedonia"], ["athens", "corinth", "antioch", "jerusalem"]),
    (41, "Paul's Third Missionary Journey", "130-41-pauls-third-missionary-journey", ["Acts", "1 Corinthians", "2 Corinthians", "Romans", "Galatians"], ["acts", "1cor", "2cor", "rom", "gal"], ["early_church"], ["paul", "third missionary journey", "ephesus", "riot", "asia", "macedonia", "greece", "miletus", "troas"], ["ephesus", "corinth", "caesarea maritima", "jerusalem"]),
    (42, "Paul's Journey to Rome", "131-42-pauls-journey-to-rome", ["Acts", "Romans", "Ephesians", "Philippians", "Colossians", "Philemon"], ["acts", "rom", "eph", "phil", "col", "phlm"], ["early_church"], ["paul", "journey to rome", "voyage", "shipwreck", "malta", "syracuse", "puteoli", "rome", "appeal to caesar"], ["rome", "caesarea maritima", "jerusalem"]),
    (43, "The Churches of Revelation", "132-43-the-churches-of-revelation", ["Revelation"], ["rev"], ["early_church"], ["revelation", "seven churches", "patmos", "ephesus", "smyrna", "pergamum", "thyatira", "sardis", "philadelphia", "laodicea"], ["ephesus", "rome"]),
    (44, "Physical Map: Near East", "133-near-east", ["Genesis", "Exodus"], ["gen", "exod"], ["patriarchal"], ["physical map", "near east", "relief", "mountains", "rivers"], ["ur of the chaldees"]),
    (45, "Physical Map: Israel", "134-israel", ["Matthew", "Mark", "Luke", "John", "Joshua"], ["matt", "mark", "luke", "john", "josh"], ["roman_judea", "conquest"], ["physical map", "israel", "galilee", "dead sea", "jordan valley", "judea"], ["jerusalem", "capernaum"]),
    (46, "Physical Map: Syria", "135-syria", ["2 Kings", "Acts"], ["2kgs", "acts"], ["divided_kingdom", "early_church"], ["syria", "damascus", "antioch", "orontes"], ["damascus", "antioch"]),
    (47, "Physical Map: Egypt", "136-egypt", ["Genesis", "Exodus"], ["gen", "exod"], ["patriarchal", "exodus"], ["egypt", "nile", "delta", "sinai"], ["mount sinai"]),
    (48, "Physical Map: Asia Minor", "137-asia", ["Acts", "Revelation", "Galatians", "Ephesians"], ["acts", "rev", "gal", "eph"], ["early_church"], ["asia minor", "anatolia", "ephesus"], ["ephesus"]),
    (49, "Physical Map: Mediterranean Basin", "138-mediterranean", ["Acts", "Romans"], ["acts", "rom"], ["early_church"], ["mediterranean basin", "sea", "islands", "voyages"], ["rome"]),
    (50, "Physical Map: Mediterranean Near East", "139-mediterranean-near-east", ["Acts", "Romans", "Genesis"], ["acts", "rom", "gen"], ["early_church", "patriarchal"], ["mediterranean near east", "levant", "fertile crescent"], ["jerusalem", "rome"])
]

KNOWING_THE_BIBLE_MAPS = []
for num, title, slug, books, osis_codes, periods, keywords, locations in KTB_RAW_LIST:
    url = f"https://www.knowingthebible.net/component/jdownloads/send/6-maps/{slug}?Itemid=135"
    KNOWING_THE_BIBLE_MAPS.append({
        "id": f"ktb-{num:02d}",
        "number": num,
        "title": title,
        "url": url,
        "books": books,
        "osis_codes": osis_codes,
        "periods": periods,
        "keywords": keywords,
        "locations": locations
    })

catalog = {
    "version": "1.0.0",
    "updated_at": "2026-10-18",
    "sources": {
        "bible_ca": BIBLE_CA_SOURCE,
        "knowing_the_bible": KNOWING_THE_BIBLE_SOURCE
    },
    "collections": {
        "bible_ca": {
            "source": BIBLE_CA_SOURCE,
            "count": len(BIBLE_CA_MAPS),
            "maps": BIBLE_CA_MAPS
        },
        "knowing_the_bible": {
            "source": KNOWING_THE_BIBLE_SOURCE,
            "count": len(KNOWING_THE_BIBLE_MAPS),
            "maps": KNOWING_THE_BIBLE_MAPS
        }
    }
}

target_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app", "data", "historical_maps_index.json")
os.makedirs(os.path.dirname(target_path), exist_ok=True)
with open(target_path, "w", encoding="utf-8") as f:
    json.dump(catalog, f, indent=2, ensure_ascii=False)

print(f"Successfully generated historical maps index at: {target_path}")
print(f"Bible.ca maps indexed: {len(BIBLE_CA_MAPS)}")
print(f"KnowingTheBible maps indexed: {len(KNOWING_THE_BIBLE_MAPS)}")
