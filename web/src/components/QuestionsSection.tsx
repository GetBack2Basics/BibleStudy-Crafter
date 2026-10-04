import { useState, useEffect } from 'react'

interface QuestionsSectionProps {
  questions: string[]
  notes: Record<string, string>
  onSaveNotes: (updatedNotes: Record<string, string>) => Promise<void> | void
  editing?: boolean
  onQuestionsChange?: (updatedQuestions: string[]) => void
}

export default function QuestionsSection({
  questions,
  notes,
  onSaveNotes,
  editing = false,
  onQuestionsChange,
}: QuestionsSectionProps) {
  // Local state for answers to allow smooth typing without lag
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [savedIndex, setSavedIndex] = useState<number | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [savedAll, setSavedAll] = useState(false)

  // Initialize and sync answers from notes
  useEffect(() => {
    const nextAnswers: Record<number, string> = {}
    questions.forEach((_, idx) => {
      const val = notes[`question_${idx}`] ?? notes[`q_${idx}`] ?? ''
      nextAnswers[idx] = val
    })
    setAnswers(nextAnswers)
  }, [questions, notes])

  const handleAnswerChange = (index: number, val: string) => {
    setAnswers((prev) => ({ ...prev, [index]: val }))
  }

  const handleSaveSingleAnswer = async (index: number) => {
    const answerText = (answers[index] ?? '').trim()
    const updatedNotes = {
      ...notes,
      [`question_${index}`]: answerText,
    }
    setSavingIndex(index)
    try {
      await onSaveNotes(updatedNotes)
      setSavedIndex(index)
      setTimeout(() => {
        setSavedIndex((curr) => (curr === index ? null : curr))
      }, 3000)
    } finally {
      setSavingIndex(null)
    }
  }

  const handleSaveAll = async () => {
    const updatedNotes = { ...notes }
    questions.forEach((_, idx) => {
      updatedNotes[`question_${idx}`] = (answers[idx] ?? '').trim()
    })
    setSavingAll(true)
    try {
      await onSaveNotes(updatedNotes)
      setSavedAll(true)
      setTimeout(() => setSavedAll(false), 3000)
    } finally {
      setSavingAll(false)
    }
  }

  // Count answered questions
  const answeredCount = questions.filter(
    (_, idx) => Boolean(answers[idx]?.trim() || notes[`question_${idx}`]?.trim() || notes[`q_${idx}`]?.trim())
  ).length

  if (!questions || questions.length === 0) {
    return (
      <p className="text-ui-label-sm text-on-surface-variant">
        No reflection questions for this day.
      </p>
    )
  }

  // In full-editing mode of Day Draft, show the question prompt editor + answers
  if (editing && onQuestionsChange) {
    const updateQ = (i: number, v: string) =>
      onQuestionsChange(questions.map((q, j) => (j === i ? v : q)))
    const addQ = () => onQuestionsChange([...questions, ''])
    const removeQ = (i: number) => onQuestionsChange(questions.filter((_, j) => j !== i))

    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Edit Question Prompts
          </div>
          {questions.map((q, i) => (
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

  // Interactive study view where user answers each question and saves
  return (
    <div className="space-y-4">
      {/* Header bar with progress counter and Save All button */}
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-on-surface-variant">
            Progress:
          </span>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {answeredCount} of {questions.length} answered
          </span>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={savingAll}
          className="btn-primary px-3 py-1 text-xs flex items-center gap-1.5 shadow-sm"
        >
          <span className="material-symbols-outlined text-[15px]">
            {savingAll ? 'hourglass_empty' : savedAll ? 'check' : 'save'}
          </span>
          {savingAll ? 'Saving…' : savedAll ? 'All Saved ✓' : 'Save All Answers'}
        </button>
      </div>

      {/* List of interactive questions */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const currentAnswer = answers[idx] ?? ''
          const isSaved = savedIndex === idx
          const isSaving = savingIndex === idx
          const hasAnswer = Boolean(currentAnswer.trim())

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
                {hasAnswer && !isSaved && !isSaving && (
                  <span className="text-xs text-on-surface-variant/60 hidden sm:inline" title="Has written response">
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
                  onBlur={() => {
                    // Auto-save on blur if value changed from original note
                    const orig = notes[`question_${idx}`] ?? notes[`q_${idx}`] ?? ''
                    if (currentAnswer.trim() !== orig.trim()) {
                      handleSaveSingleAnswer(idx)
                    }
                  }}
                />

                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant/60">
                    Auto-saves when you leave the box
                  </span>

                  <div className="flex items-center gap-2">
                    {isSaved && (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full animate-fade-in">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        Saved
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSaveSingleAnswer(idx)}
                      disabled={isSaving}
                      className="btn-outline py-1 px-2.5 text-xs flex items-center gap-1"
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
    </div>
  )
}
