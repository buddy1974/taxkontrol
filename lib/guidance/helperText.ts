import type { HelperTextEntry } from './guidanceTypes'

export const HELPER_TEXT: Record<string, HelperTextEntry> = {
  dashboard: {
    title: 'Dashboard Overview',
    explanation: 'See what money is realistically safe to use after taxes and obligations.',
    purpose: 'Gives you a real-time view of your financial position.',
    whyItMatters: 'Without this overview, it is easy to spend money you will need for taxes later.',
  },
  taxReserve: {
    title: 'Tax Reserve (Steuerrücklage)',
    explanation: 'Money you may need later for taxes.',
    purpose: 'Keeps a portion of your income set aside so tax bills do not come as a surprise.',
    whyItMatters: 'German tax bills can arrive months after the income was earned. This reserve protects you.',
  },
  jobcenter: {
    title: 'Jobcenter / Bürgergeld',
    explanation: 'Estimate income information for Bürgergeld discussions.',
    purpose: 'Helps you prepare accurate income statements for Jobcenter submissions.',
    whyItMatters: 'Inaccurate income reporting to the Jobcenter can lead to repayment demands.',
  },
  safeToSpend: {
    title: 'Safe to Spend',
    explanation: 'The amount of money you can spend without risking your tax and payment obligations.',
    purpose: 'Calculated after deducting taxes, fixed costs, and outstanding payments.',
    whyItMatters: 'Spending beyond this amount may leave you unable to pay taxes or suppliers on time.',
  },
  guidance: {
    title: 'Finanzamt Guidance',
    explanation: 'Upload and interpret letters from the Finanzamt to understand what is being asked of you.',
    purpose: 'Helps you prepare the right documents and understand urgency before seeing a Steuerberater.',
    whyItMatters: 'Responding to Finanzamt letters late or incorrectly can result in penalties or tax estimates.',
  },
  missingDocuments: {
    title: 'Missing Documents',
    explanation: 'Documents and records needed to complete your financial picture.',
    purpose: 'Identifies gaps in your records that reduce your preparation quality.',
    whyItMatters: 'A Steuerberater works faster and charges less when your records are complete.',
  },
  preparationStatus: {
    title: 'Preparation Status',
    explanation: 'An estimate of how ready your records are for a Steuerberater review.',
    purpose: 'Gives you a clear target to reach before your tax appointment.',
    whyItMatters: 'Better preparation means lower consulting costs and fewer follow-up requests.',
  },
  confidenceLevel: {
    title: 'Data Confidence',
    explanation: 'How complete and consistent your financial records appear based on available data.',
    purpose: 'Alerts you when missing data may affect the quality of any analysis.',
    whyItMatters: 'Low confidence means any guidance shown here is based on incomplete information.',
  },
}

export function getHelperText(section: string): HelperTextEntry | null {
  return HELPER_TEXT[section] ?? null
}
