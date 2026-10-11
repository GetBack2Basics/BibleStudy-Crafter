import { useEffect } from 'react'

interface HelpGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function HelpGuideModal({ isOpen, onClose }: HelpGuideModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-scrim/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-surface rounded-3xl shadow-2xl border border-outline-variant/20 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 bg-surface-container/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[24px]">help</span>
            </div>
            <div>
              <h2 id="help-guide-title" className="font-headline-sm text-headline-sm text-on-surface font-serif">
                How to Use BibleStudy-Crafter
              </h2>
              <p className="text-caption text-on-surface-variant">
                Visual ELI10 walkthrough • Exploring studies, Voices on Verses, API keys, & crafting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/how_to_use_guide.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              title="Open raw markdown document"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              Raw Markdown
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              aria-label="Close Guide"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </header>

        {/* Quick Jump Bar */}
        <nav aria-label="Guide Sections" className="flex items-center gap-2 px-6 py-2.5 bg-surface-container-low/70 border-b border-outline-variant/10 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant shrink-0">
            Jump to:
          </span>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-philosophy')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            📜 Scripture First
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-existing-study')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🌟 Existing Study
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-voices')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🗣️ Voices on Verses
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-account')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            👤 Create Account
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-apikey')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🔑 Free API Key
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-craft-study')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🛠️ Craft New Study
          </button>
        </nav>

        {/* Scrollable Guide Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-10 leading-relaxed text-on-surface font-serif">
          {/* Section 0: Philosophy */}
          <section id="guide-sec-philosophy" className="p-5 sm:p-6 rounded-2xl bg-amber-500/10 border-l-4 border-amber-600 text-on-surface space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              Core Philosophy: Scripture Comes First
            </div>
            <p className="text-sm font-sans text-on-surface/90">
              In <strong>BibleStudy-Crafter</strong>, the Holy Scripture always comes <strong>FIRST</strong>. We never want anyone’s commentary—whether written by a scholar or generated by AI—to pollute or distract from the pure Word of God. You encounter the inspired text in its unaltered beauty before exploring outside reflections.
            </p>
          </section>

          {/* Section 1: In an Already Created Study */}
          <section id="guide-sec-existing-study" className="space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 1</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">What You Can Do in an Existing Study</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Explore an interactive study sanctuary with translation comparisons, audio narration, prayers, and reflective journaling.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/02_study_day1_scripture.png"
                alt="Scripture Sanctuary with Memory Verse & Translations"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 1: The Scripture Sanctuary — Pure Bible Text, Memory Verses, Translation Switchers, and Audio.
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 font-sans text-sm">
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[20px]">auto_stories</span>
                  Pure Scripture
                </div>
                <p className="text-xs text-on-surface-variant">
                  Highlight key phrases, write margin notes, or copy verses directly with one tap.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[20px]">translate</span>
                  Compare Versions
                </div>
                <p className="text-xs text-on-surface-variant">
                  Switch instantly between KJV, ASV, PEV 1611, BBE, and WEB to compare ancient translations.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[20px]">volume_up</span>
                  AI Voice Reader
                </div>
                <p className="text-xs text-on-surface-variant">
                  Listen to the whole day or specific sections (prayers, commentary, verses) in realistic voices.
                </p>
              </div>
            </div>

            {/* Prayers & AI Wand */}
            <div className="space-y-4 pt-4 border-t border-outline-variant/15">
              <h4 className="text-lg font-bold font-serif text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">psychology_alt</span>
                Guided Prayers & "Refine with AI"
              </h4>
              <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
                <img
                  src="/guide_images/03_study_day1_commentary.png"
                  alt="Opening and Closing Prayers with AI Wand"
                  className="w-full object-cover"
                  loading="lazy"
                />
                <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                  Figure 2: Opening and Closing Prayers with the 'Refine with AI' wand and illuminated scripture text.
                </div>
              </div>
              <p className="text-sm font-sans text-on-surface-variant">
                Every day features grounding liturgical opening and closing prayers. You can edit them manually or type in the revision bar (e.g., <em>"Make it more focused on peace during trials"</em>) and click <strong>Refine with AI</strong> to adapt the prayer.
              </p>
            </div>

            {/* Questions & Journal */}
            <div className="space-y-4 pt-4 border-t border-outline-variant/15">
              <h4 className="text-lg font-bold font-serif text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">edit_note</span>
                Reflection Questions & Personal Journal
              </h4>
              <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
                <img
                  src="/guide_images/03b_reflection_questions.png"
                  alt="Interactive Reflection Questions"
                  className="w-full object-cover"
                  loading="lazy"
                />
                <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                  Figure 3: Interactive Reflection Questions with private cloud-synced text answers.
                </div>
              </div>
              <p className="text-sm font-sans text-on-surface-variant">
                Answer guided reflection prompts directly in the app. Answers are saved automatically to your private profile so you can revisit your insights over time.
              </p>
            </div>
          </section>

          {/* Section 2: Voices on Verses */}
          <section id="guide-sec-voices" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Part 2</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">The 'Voices on Verses' Feature</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Breaking echo chambers and algorithmic silos through real community dialogue and scholarly citations.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-sky-500/10 border-l-4 border-sky-600 text-on-surface space-y-2">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-bold text-xs uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">hub</span>
                Why We Need Diverse Perspectives
              </div>
              <p className="text-sm font-sans text-on-surface/90">
                Modern social algorithms silo people into echo chambers, stoking division. True spiritual maturity and gentle witness (<em>1 Peter 3:15</em>) require understanding what others think, doubt, or question. By engaging diverse viewpoints while remaining grounded in scripture, we build empathy and clarity without compromise.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/05_voices_on_verses_expanded.png"
                alt="Voices on Verses Sentiment Controls and Real Discussions"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 4: Voices on Verses — Tunable Sentiment Quota Bar, Commentary Sources, and Real Social Media Discussions.
              </div>
            </div>

            <div className="space-y-3 font-sans text-sm">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15">
                <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-600 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                  🔴
                </div>
                <div>
                  <strong className="text-on-surface">Critical & Skeptical Perspectives:</strong>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Real objections, doubts, and apparent contradictions. Addressing honest questions strengthens our convictions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                  🟡
                </div>
                <div>
                  <strong className="text-on-surface">Neutral & Scholarly Context:</strong>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Historical background, linguistics, original Greek/Hebrew nuances, and archaeology.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                  🟢
                </div>
                <div>
                  <strong className="text-on-surface">Positive & Devotional Voices:</strong>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Pastoral reflections, historical church fathers, and encouraging sermons on the verses.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Creating an Account */}
          <section id="guide-sec-account" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 3</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">How to Create an Account</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Keep your notes, highlighted verses, and crafted studies synchronized across devices.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest max-w-xl mx-auto">
              <img
                src="/guide_images/01_login_signup_screen.png"
                alt="Account Sign Up and Demo Mode"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 5: Sign In and Account Registration Screen with Instant Demo Access.
              </div>
            </div>

            <ol className="list-decimal list-inside space-y-2 font-sans text-sm text-on-surface/90">
              <li>Open BibleStudy-Crafter in your browser.</li>
              <li>Click <strong>"Don't have an account? Create one"</strong>.</li>
              <li>Enter your Name, Email address, and Password (at least 6 characters).</li>
              <li>Click <strong>Create Account</strong> to begin.</li>
              <li><em>(Demo mode tip):</em> Click <strong>"Use Demo Account"</strong> on the sign-in card if you want to explore instantly without registering.</li>
            </ol>
          </section>

          {/* Section 4: Getting Free API Key */}
          <section id="guide-sec-apikey" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 4</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">How to Get a Free Google Gemini API Key</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Google provides a 100% free Gemini API key with generous limits so you can craft unlimited studies without subscription fees.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/07_byok_api_keys_modal.png"
                alt="Profile BYOK API Key Settings"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 6: Profile & BYOK (Bring Your Own Key) Settings Modal.
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 font-sans text-sm space-y-2.5">
              <p className="font-semibold text-on-surface">Step-by-Step Instructions:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-on-surface-variant">
                <li>
                  Open{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline font-semibold"
                  >
                    Google AI Studio (aistudio.google.com/app/apikey)
                  </a>{' '}
                  in a new tab.
                </li>
                <li>Sign in with your Google or Gmail account.</li>
                <li>Click the blue <strong>"+ Create API key"</strong> button.</li>
                <li>Copy the key string (starts with <code className="bg-surface px-1 py-0.5 rounded">AIzaSy...</code>).</li>
                <li>In BibleStudy-Crafter, tap your <strong>Profile Avatar</strong> 👤 in the top right.</li>
                <li>Select the <strong>API Keys & BYOK</strong> tab.</li>
                <li>Paste your key into the <strong>Google Gemini API Key</strong> box and click <strong>Test</strong>.</li>
                <li>Click <strong>Save API Key Settings</strong>. You're ready to craft!</li>
              </ol>
            </div>
          </section>

          {/* Section 5: Crafting a Study */}
          <section id="guide-sec-craft-study" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 5</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">How to Craft a Brand New Study Plan</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Design custom curriculum for personal devotions, family studies, or small group ministry.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/06_study_library.png"
                alt="Sanctuary Crafter Library and Generation Form"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 7: Sanctuary Crafter — Subject of Inquiry & Study Generation Dashboard.
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3.5 font-sans text-xs">
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">1. Subject of Inquiry</span>
                <p className="text-on-surface-variant">
                  Type your book, theme, or character (e.g. <em>"The Parables of Jesus"</em>, <em>"Wisdom in Proverbs"</em>).
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">2. Time Commitment</span>
                <p className="text-on-surface-variant">
                  Pick daily reading duration (5 to 120 mins) and plan length (1 to 90 days).
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">3. Theological Lens</span>
                <p className="text-on-surface-variant">
                  Select Non-denominational, Reformed, Catholic, Orthodox, etc., to shape the historical exegesis.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">4. Curate Focal Verses</span>
                <p className="text-on-surface-variant">
                  Click <em>"Find relevant verses"</em> to search the Bible and check specific passages to anchor into your study.
                </p>
              </div>
            </div>
          </section>

          {/* Workflow Summary Table */}
          <section className="space-y-4 pt-6 border-t border-outline-variant/20 font-sans">
            <h4 className="text-lg font-bold font-serif text-on-surface">Workflow at a Glance</h4>
            <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
              <table className="w-full text-xs text-left">
                <thead className="bg-primary text-on-primary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                    <th className="px-4 py-3 font-semibold">What You Do</th>
                    <th className="px-4 py-3 font-semibold">Why It Matters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15 bg-surface-container-lowest">
                  <tr>
                    <td className="px-4 py-3 font-bold text-primary">1. Scripture First</td>
                    <td className="px-4 py-3 text-on-surface">Read the pure text & listen to narration without bias.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Protects the Word from human/AI dilution.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-sky-600">2. Voices on Verses</td>
                    <td className="px-4 py-3 text-on-surface">Explore skeptical, neutral, and devotional viewpoints.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Breaks algorithmic silos, builds empathy and clarity.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-amber-600">3. Reflect & Pray</td>
                    <td className="px-4 py-3 text-on-surface">Answer journaling prompts & pray guided prayers.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Internalizes God's Word into daily character and action.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-emerald-600">4. Craft & Share</td>
                    <td className="px-4 py-3 text-on-surface">Create tailored multi-day plans on any Biblical topic.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Equips personal, family, and group discipleship.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between px-6 py-3.5 border-t border-outline-variant/15 bg-surface-container/60 backdrop-blur-md">
          <div className="text-xs text-on-surface-variant font-sans">
            Have questions or ideas? Grounded in prayer & Scripture.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
          >
            Got It
          </button>
        </footer>
      </div>
    </div>
  )
}
