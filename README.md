# 📖 BibleStudy-Crafter

> **Your personal, AI-powered Bible study creator that fits your exact schedule, uses real Scripture, and lets you customize everything.**

Imagine having a smart study buddy who can build a custom Bible study on *any topic you want*, for *exactly how much time you have*, with *real Bible verses*, *helpful questions*, and *space for your own notes*. That's BibleStudy-Crafter!

---

## 💡 What Makes BibleStudy-Crafter Different? (The ELI10 Version)

Most AI apps just guess or make things up when you ask about the Bible. BibleStudy-Crafter is built differently:

### 1. 🛡️ Real Bible Verses (No Robot Hallucinations!)
Most AI tools try to remember Bible verses from memory and often quote things that don't exist. BibleStudy-Crafter has a **built-in offline library of real Bibles** (like KJV, WEB, and BBE). It pulls the exact words straight from the actual text first, so you can always trust what you're reading.

### 2. ⏱️ Custom Length to Fit Your Life
Got only **5 minutes** before school or work? Want a deep **30-minute** study with your family? Need a **3-day** weekend study on *Forgiveness* or a **21-day** journey through *Proverbs*? You pick the topic, the days, and the minutes per day. The app creates the perfect daily lessons to match.

### 3. 🎭 Sentiment & Tone Analysis (Understanding Real Human Feelings)
When people read the Bible, they feel different emotions—joy, doubt, grief, or peace. BibleStudy-Crafter analyzes real discussions and historical writings to categorize different viewpoints and feelings (**encouraging, thoughtful, or challenging**). This helps you see how real people throughout history have wrestled with and been comforted by these passages.

### 4. ✏️ "Select-to-Revise" (You're the Boss!)
Don't like how something is explained? Want to make it easier for a 5th grader, or want more historical trivia? Just **highlight any sentence, question, or prayer** and tell the AI how you want it changed. It rewrites only what you picked in seconds!

### 5. 💭 Thought-Provoking Questions & Auto-Saving Notes
Every day includes meaningful reflection questions to help you apply the lesson to your life. You can type your answers and personal prayer requests directly into the app—**everything auto-saves as you type** so you never lose your thoughts.

### 6. 🎨 Atmospheric Art, Infographics & Audio Narration
- **Biblical Mood Paintings**: Gorgeous scene art that captures the atmosphere and mood of the passage.
- **Theology Infographics**: Charts and diagrams that break down complex timelines and themes.
- **Listen Out Loud (TTS)**: Built-in voice player so you can listen hands-free on the go.

### 7. 🆓 100% Free & Private (No Subscriptions Needed)
Works completely free with zero API keys required, and can even run 100% privately on your own computer with Ollama. If you have your own favorite AI keys (Gemini, Claude, OpenAI, etc.), you can easily plug them in too!

---

## 🌟 At a Glance: Comparison

| Feature | Standard AI Chatbots | 📖 BibleStudy-Crafter |
|---|---|---|
| **Bible Verses** | Guessed from AI memory (prone to errors) | **Direct from offline Bible database** |
| **Study Duration** | One generic wall of text | **Custom days + exact minutes per day** |
| **Editing** | Start over if you don't like an answer | **Highlight & refine any specific part** |
| **Perspectives & Sentiment** | One generic opinion | **Analyzed historical & real-world feelings** |
| **Questions & Journaling** | None (lost when you close the tab) | **Interactive questions + auto-saving notes** |
| **Visuals & Audio** | Plain text only | **Mood artwork, infographics & audio narrator** |
| **Pricing / Keys** | Monthly paywalls or paid API keys | **100% Free out of the box + offline options** |

---

## 🚀 Quick Start (For Developers & Self-Hosters)

### 1. Requirements
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Python 3.10+ (optional, for port validator)

### 2. Run in 2 Steps
```bash
# 1. Copy the default configuration
cp .env.example .env

# 2. Start everything (checks for free ports automatically)
make up
```

Open your browser to:
- **Web App**: [http://localhost:8420](http://localhost:8420)
- **API Docs**: [http://localhost:8421/docs](http://localhost:8421/docs)

---

## ⚙️ Ports & Configuration

All ports are configurable in `.env` and are verified free before launch:

| Service | Default Port | Variable | Description |
|---|---|---|---|
| **Web UI** | `8420` | `WEB_PORT` | Modern parchment & ink frontend |
| **API** | `8421` | `API_PORT` | FastAPI backend service |
| **PostgreSQL** | `8422` | `DB_PORT` | Database for studies, notes & answers |
| **Redis** | `8423` | `REDIS_PORT` | Cache and background worker queue |

### Optional AI & Search Providers

You can add any of these in `.env` or directly through the in-app **Profile & Settings** modal:
- `GEMINI_API_KEY`: Google Gemini Flash & Pro
- `ANTHROPIC_API_KEY`: Claude 3.5 Sonnet / Opus
- `OLLAMA_BASE_URL`: Local offline private models (`http://host.docker.internal:11434`)
- `BRAVE_SEARCH_API_KEY`: Live grounded web search for discussion sources
- `FAL_KEY` / `REPLICATE_API_TOKEN`: Pro image & infographic generation

---

## 🛠️ Helpful Commands

```bash
make up        # Start all services with port conflict checks
make down      # Stop all services
make restart   # Restart web and api containers (keeps your study data safe)
make logs      # View live logs
make seed      # Seed offline Bible translations into the database
make test      # Run backend test suite
```

---

## 📄 License

Open-source under the [MIT License](LICENSE).
