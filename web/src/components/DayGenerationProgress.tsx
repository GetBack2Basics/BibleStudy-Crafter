interface DayGenerationProgressProps {
  dayNumber: number
  totalDays?: number
  studyTopic?: string
  progress: number
  message?: string
  step?: string
  isRegenerating?: boolean
  className?: string
}

interface Milestone {
  id: string
  title: string
  description: string
  icon: string
  threshold: number
}

const MILESTONES: Milestone[] = [
  {
    id: 'passages',
    title: 'Scriptural Anchoring',
    description: 'Selecting & contextually framing core biblical texts',
    icon: 'menu_book',
    threshold: 20,
  },
  {
    id: 'scripture',
    title: 'Manuscript Harmonization',
    description: 'Harmonizing multi-version translations & cross-references',
    icon: 'translate',
    threshold: 40,
  },
  {
    id: 'commentary',
    title: 'Theological Exegesis',
    description: 'Synthesizing historical commentary & devotional reflections',
    icon: 'auto_stories',
    threshold: 65,
  },
  {
    id: 'prayers',
    title: 'Prayers & Selah Journal',
    description: 'Grounded opening/closing prayers & reflection questions',
    icon: 'spa',
    threshold: 88,
  },
]

export default function DayGenerationProgress({
  dayNumber,
  totalDays,
  studyTopic,
  progress,
  message,
  step,
  isRegenerating = false,
  className = '',
}: DayGenerationProgressProps) {
  // Clamp progress between 5 and 100 for visual stability
  const pct = Math.max(5, Math.min(100, Math.round(progress)))

  // Determine current active milestone index
  let activeIndex = 0
  if (step === 'saving' || step === 'complete' || pct >= 92) {
    activeIndex = 4
  } else if (step === 'prayers' || pct >= 75) {
    activeIndex = 3
  } else if (step === 'commentary' || pct >= 50) {
    activeIndex = 2
  } else if (step === 'scripture' || pct >= 30) {
    activeIndex = 1
  } else {
    activeIndex = 0
  }

  const defaultMsg = isRegenerating
    ? `Regenerating Day ${dayNumber} study sanctuary…`
    : `Crafting Day ${dayNumber} theological study…`

  return (
    <div
      className={`w-full rounded-2xl md:rounded-3xl border border-primary/25 bg-surface-container-lowest/90 backdrop-blur-md p-5 sm:p-7 md:p-8 shadow-ambient transition-all duration-300 ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px] animate-spin-slow">
              auto_awesome
            </span>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary animate-ping opacity-75" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-caption-caps text-caption-caps text-primary tracking-widest uppercase font-semibold">
                {isRegenerating ? 'Regenerating' : 'Generating'} · Day {dayNumber}
                {totalDays ? ` of ${totalDays}` : ''}
              </span>
              {studyTopic && (
                <span className="text-secondary/70 text-xs hidden sm:inline">
                  · {studyTopic}
                </span>
              )}
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">
              {isRegenerating ? 'Refining Study Day' : 'Crafting Sacred Learning Day'}
            </h3>
          </div>
        </div>

        {/* Progress Percentage Badge */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="px-3.5 py-1.5 rounded-full bg-surface-container border border-outline-variant/30 flex items-center gap-2 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-headline-md text-on-surface font-semibold text-sm tabular-nums">
              {pct}%
            </span>
            <span className="text-xs text-on-surface-variant font-medium">completed</span>
          </div>
        </div>
      </div>

      {/* Main progress bar track */}
      <div className="mb-5">
        <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container p-0.5 border border-outline-variant/25 shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary/90 to-tertiary transition-all duration-700 ease-out relative shadow-sm"
            style={{ width: `${pct}%` }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="text-primary font-medium flex items-center gap-1.5 truncate pr-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-ping" />
            {message || defaultMsg}
          </span>
          <span className="text-on-surface-variant/80 shrink-0 font-medium">
            AI Study Crafter
          </span>
        </div>
      </div>

      {/* 4-Stage Milestone Stepper */}
      <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MILESTONES.map((m, idx) => {
          const isDone = activeIndex > idx || pct >= 100
          const isCurrent = activeIndex === idx && pct < 100

          return (
            <div
              key={m.id}
              className={`p-3.5 rounded-2xl border transition-all duration-300 flex items-start gap-3 ${
                isCurrent
                  ? 'bg-surface-container-high/70 border-primary/40 shadow-sm ring-1 ring-primary/20'
                  : isDone
                  ? 'bg-surface-container-low/60 border-primary/20'
                  : 'bg-surface-container-lowest/40 border-outline-variant/15 opacity-60'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isDone
                    ? 'bg-primary text-on-primary'
                    : isCurrent
                    ? 'bg-primary/20 text-primary border border-primary/40 animate-pulse'
                    : 'bg-surface-container text-on-surface-variant/50'
                }`}
              >
                {isDone ? (
                  <span className="material-symbols-outlined text-[16px] font-bold">
                    check
                  </span>
                ) : isCurrent ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                ) : (
                  <span className="text-xs font-semibold">{idx + 1}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4
                    className={`text-xs font-semibold truncate ${
                      isCurrent
                        ? 'text-primary'
                        : isDone
                        ? 'text-on-surface'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    {m.title}
                  </h4>
                </div>
                <p className="text-[11px] text-on-surface-variant/80 leading-snug line-clamp-2 mt-0.5">
                  {m.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
