import { useState, useEffect, useRef } from 'react'

interface QuestionsSectionProps {
  questions: string[]
  notes: Record<string, string>
  onSaveNotes: (updatedNotes: Record<string, string>) => Promise<void> | void
  editing?: boolean
  onQuestionsChange?: (updatedQuestions: string[]) => void
  onReadAloud?: () => void
  isReading?: boolean
  onAIRefineQuestions?: (instruction?: string) => Promise<void> | void
  isAIRefining?: boolean
}

export default function QuestionsSection({
  questions,
  notes,
  onSaveNotes,
  editing = false,
  onQuestionsChange,
  onReadAloud,
  isReading = false,
  onAIRefineQuestions,
  isAIRefining = false,
}: QuestionsSectionProps) {
  const safeQuestions = Array.isArray(questions) ? questions : []

  // Local state for answers so user can type freely without parent or polling interrupting
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [savedIndex, setSavedIndex] = useState<number | null>(null)

  // Track currently focused textarea index to prevent any external updates while typing
  const focusedIndexRef = useRef<number | null>(null)
  // Track dirty (locally modified) indexes
  const dirtyIndexesRef = useRef<Set<number>>(new Set())
  // Track last saved string per question index to avoid unnecessary network calls
  const savedValuesRef = useRef<Record<number, string>>({})
  // Latest notes reference for constructing updated payload
  const notesRef = useRef<Record<string, string>>(notes)
  notesRef.current = notes

  // Sync initial and external notes safely without clobbering in-progress typing
  useEffect(() => {
    setAnswers((prevAnswers) => {
      const nextAnswers = { ...prevAnswers }
      safeQuestions.forEach((_, idx) => {
        const serverVal = notes[`question_${idx}`] ?? notes[`q_${idx}`] ?? ''

        // If not initialized, or if not dirty and not currently focused, sync from server
        if (
          !(idx in nextAnswers) ||
          (!dirtyIndexesRef.current.has(idx) && focusedIndexRef.current !== idx)
        ) {
          nextAnswers[idx] = serverVal
          savedValuesRef.current[idx] = serverVal
        }
      })
      return nextAnswers
    })
  }, [questions, notes])

  const handleAnswerChange = (index: number, val: string) => {
    dirtyIndexesRef.current.add(index)
    setAnswers((prev) => ({ ...prev, [index]: val }))
  }

  const handleSaveSingleAnswer = async (index: number) => {
    const answerText = (answers[index] ?? '').trim()
    const lastSaved = (savedValuesRef.current[index] ?? '').trim()

    // If identical to what was already saved on server and not dirty, no need to send duplicate
    if (answerText === lastSaved && !dirtyIndexesRef.current.has(index)) {
      return
    }

    const updatedNotes = {
      ...notesRef.current,
      [`question_${index}`]: answerText,
    }

    setSavingIndex(index)
    try {
      await onSaveNotes(updatedNotes)
      savedValuesRef.current[index] = answerText
      dirtyIndexesRef.current.delete(index)
      setSavedIndex(index)
      setTimeout(() => {
        setSavedIndex((curr) => (curr === index ? null : curr))
      }, 3000)
    } finally {
      setSavingIndex(null)
    }
  }

  const handleBlur = (index: number) => {
    focusedIndexRef.current = null
    const currentVal = (answers[index] ?? '').trim()
    const lastSaved = (savedValuesRef.current[index] ?? '').trim()

    // If user modified the answer, save when they click out / click in another box
    if (currentVal !== lastSaved || dirtyIndexesRef.current.has(index)) {
      handleSaveSingleAnswer(index)
    }
  }

  const handleFocus = (index: number) => {
    focusedIndexRef.current = index
  }

  // Count answered questions
  const answeredCount = questions.filter((_, idx) => {
    const val = answers[idx] ?? notes[`question_${idx}`] ?? notes[`q_${idx}`] ?? ''
    return Boolean(val.trim())
  }).length

  if (!questions || questions.length === 0) {
    return (
      <div className="py-6 px-4 rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-high/30 flex flex-col items-center justify-center text-center gap-3">
        <span className="material-symbols-outlined text-[32px] text-tertiary/70">help</span>
        <div className="max-w-md">
          <p className="font-ui-label-md text-on-surface font-semibold mb-1">
            No reflection questions for this day
          </p>
          <p className="text-on-surface-variant/80 text-xs">
            Generate thought-provoking reflection questions grounded in today's scripture and commentary to guide personal application.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {onAIRefineQuestions && (
            <button
              type="button"
              disabled={isAIRefining}
              onClick={() => onAIRefineQuestions("Generate 3-4 deep reflection and discussion questions grounded in today's scripture.")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary text-on-secondary text-xs font-semibold shadow-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] animate-pulse">sparkles</span>
              <span>{isAIRefining ? 'Generating Questions…' : 'Generate Reflection Questions with AI'}</span>
            </button>
          )}
          {onQuestionsChange && (
            <button
              type="button"
              onClick={() => onQuestionsChange([""])}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-outline-variant/50 bg-surface-container-high text-on-surface text-xs font-medium hover:bg-surface-container-highest transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add Question Manually</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // In full-editing mode of Day Draft, show the question prompt editor
  if (editing && onQuestionsChange) {
    const updateQ = (i: number, v: string) =>
      onQuestionsChange(safeQuestions.map((q, j) => (j === i ? v : q)))
    const addQ = () => onQuestionsChange([...safeQuestions, ''])
    const removeQ = (i: number) => onQuestionsChange(safeQuestions.filter((_, j) => j !== i))

    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Edit Question Prompts
          </div>
          {safeQuestions.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mt-1">
                {i + 1}
              </span>
              <input
                className="field-underline flex-1 py-1 text-sm"
                value={q}
                placeholder={`Question ${i + 1} prompt`}
                onChange={(e) => updateQ(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeQ(i)}
                className="btn-ghost p-1 text-on-surface-variant hover:text-error"
                title="Remove question"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addQ}
            className="text-xs font-medium text-primary hover:text-primary-container flex items-center gap-1 mt-1"
          >
            <span className="material-symbols-outlined text-[16px]">add</span> add question
          </button>
        </div>
      </div>
    )
  }

  // Interactive study view where user answers each question
  return (
    <div className="space-y-4">
      {/* Header bar with progress counter and on-demand Listen button */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-on-surface-variant">Progress:</span>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {answeredCount} of {questions.length} answered
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onReadAloud && (
            <button
              type="button"
              id="read-aloud-questions"
              onClick={onReadAloud}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-ui-label-xs font-semibold transition-all cursor-pointer shadow-xs ${
                isReading
                  ? 'bg-primary text-on-primary animate-pulse'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-primary border border-outline-variant/30'
              }`}
              title={isReading ? 'Pause narration' : 'Listen to reflection questions'}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isReading ? 'graphic_eq' : 'volume_up'}
              </span>
              <span>{isReading ? 'Playing' : 'Listen to Questions'}</span>
            </button>
          )}
          <span className="text-xs text-on-surface-variant/70 hidden sm:inline">
            Saves automatically
          </span>
        </div>
      </div>

      {/* List of interactive questions */}
      <div className="space-y-4">
        {safeQuestions.map((q, idx) => {
          const currentAnswer = answers[idx] ?? ''
          const isSaved = savedIndex === idx
          const isSaving = savingIndex === idx
          const hasAnswer = Boolean(currentAnswer.trim())
          const isDirty = dirtyIndexesRef.current.has(idx)

          return (
            <div
              key={idx}
              className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-2.5 transition-all shadow-sm focus-within:border-primary/50 focus-within:shadow-md"
            >
              {/* Question prompt */}
              <div className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {idx + 1}
                </span>
                <p className="font-ui-label-md font-semibold text-on-surface leading-snug flex-1">
                  {q}
                </p>
                {hasAnswer && !isSaved && !isSaving && !isDirty && (
                  <span
                    className="text-xs text-on-surface-variant/60 hidden sm:inline"
                    title="Has saved answer"
                  >
                    ✍
                  </span>
                )}
              </div>

              {/* Answer textarea */}
              <div className="pl-0 sm:pl-8 space-y-2">
                <textarea
                  className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low/60 p-3 font-body-reading text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-colors leading-relaxed"
                  rows={Math.max(2, Math.min(6, Math.ceil(currentAnswer.length / 70) + 1))}
                  placeholder="Type your reflection or answer to this question…"
                  value={currentAnswer}
                  onChange={(e) => handleAnswerChange(idx, e.target.value)}
                  onFocus={() => handleFocus(idx)}
                  onBlur={() => handleBlur(idx)}
                />

                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant/60">
                    {isDirty ? 'Unsaved changes' : 'Saved to your notes'}
                  </span>

                  <div className="flex items-center gap-2">
                    {isSaved && (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        Saved
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSaveSingleAnswer(idx)}
                      disabled={isSaving}
                      className="btn-outline py-1 px-2.5 text-xs flex items-center gap-1 hover:bg-primary hover:text-on-primary transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isSaving ? 'hourglass_empty' : 'save'}
                      </span>
                      {isSaving ? 'Saving…' : 'Save Answer'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {onAIRefineQuestions && (
        <div className="pt-2 flex items-center justify-between text-xs text-on-surface-variant/80 border-t border-outline-variant/15 mt-3">
          <span>Need deeper or alternative questions?</span>
          <button
            type="button"
            disabled={isAIRefining}
            onClick={() => onAIRefineQuestions("Generate 3-4 fresh, practical reflection and discussion questions grounded in today's scripture and commentary.")}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-primary border border-outline-variant/30 text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">sparkles</span>
            <span>{isAIRefining ? 'Regenerating…' : 'Refine Questions with AI'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
