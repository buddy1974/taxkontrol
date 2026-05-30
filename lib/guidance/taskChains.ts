import type { GuidanceTaskCategory, StoredTask } from './guidanceTypes'

export interface ChainStep {
  category: GuidanceTaskCategory
  label: string
  description: string
}

export interface TaskChain {
  chainId: string
  name: string
  steps: ChainStep[]
  currentStepIndex: number
  completedCount: number
  progressPercent: number
  nextStep: ChainStep | null
  isComplete: boolean
}

const CHAINS: Array<{
  chainId: string
  name: string
  steps: ChainStep[]
}> = [
  {
    chainId: 'RECORD_CHAIN',
    name: 'Complete your records',
    steps: [
      { category: 'ADD_TRANSACTION', label: 'Add missing transactions', description: 'Record income and expenses for all months' },
      { category: 'UPLOAD_DOCUMENT', label: 'Upload receipts', description: 'Attach supporting documents' },
      { category: 'CATEGORIZE_EXPENSE', label: 'Categorize expenses', description: 'Assign categories to all transactions' },
      { category: 'REVIEW_REPORT', label: 'Review EÜR report', description: 'Check your profit and loss summary' },
    ],
  },
  {
    chainId: 'CASE_CHAIN',
    name: 'Resolve Finanzamt case',
    steps: [
      { category: 'UPLOAD_DOCUMENT', label: 'Upload letter', description: 'Upload the Finanzamt letter for analysis' },
      { category: 'CONTACT_STEUERBERATER', label: 'Consult Steuerberater', description: 'Get professional advice' },
      { category: 'RESOLVE_CASE', label: 'Resolve the case', description: 'Mark the case as handled once complete' },
    ],
  },
  {
    chainId: 'PROFILE_CHAIN',
    name: 'Set up your profile',
    steps: [
      { category: 'COMPLETE_PROFILE', label: 'Complete your profile', description: 'Answer questions about your business' },
      { category: 'ADD_TRANSACTION', label: 'Add your first records', description: 'Begin recording income and expenses' },
      { category: 'REVIEW_REPORT', label: 'Review your overview', description: 'Check your financial summary' },
    ],
  },
]

export function computeChainProgress(tasks: StoredTask[]): TaskChain[] {
  const completedCategories = new Set(
    tasks.filter(t => t.status === 'COMPLETED').map(t => t.category)
  )
  const openCategories = new Set(
    tasks.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').map(t => t.category)
  )

  return CHAINS.map(chain => {
    const completedCount = chain.steps.filter(s => completedCategories.has(s.category)).length
    const progressPercent = Math.round((completedCount / chain.steps.length) * 100)

    // Current step = first step that is open (not completed)
    const currentStepIndex = chain.steps.findIndex(
      s => !completedCategories.has(s.category)
    )

    const nextStep = currentStepIndex >= 0 ? chain.steps[currentStepIndex] : null
    const isComplete = completedCount === chain.steps.length

    // Only include chain if at least one step is open/in progress or partially done
    const relevant =
      completedCount > 0 ||
      chain.steps.some(s => openCategories.has(s.category))

    return {
      chainId: chain.chainId,
      name: chain.name,
      steps: chain.steps,
      currentStepIndex: Math.max(0, currentStepIndex),
      completedCount,
      progressPercent,
      nextStep,
      isComplete,
      relevant,
    }
  }).filter(c => c.relevant || c.chainId === 'PROFILE_CHAIN') as TaskChain[]
}
