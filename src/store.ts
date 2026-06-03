import { reactive } from 'vue'
import type { ProjectAnalysisResult } from '@electron/types'

interface AnalyzeConfig {
  projectPath: string
  branch: string
  gitEnabled: boolean
  authorName?: string
  authorEmail?: string
  timeRange: 'all' | '3months' | '6months' | '1year' | 'custom'
  customStartDate?: string
  customEndDate?: string
  aiSummary: boolean
  aiProvider?: any
  outputFormat: 'markdown' | 'html' | 'pdf'
}

type AnalysisResult = ProjectAnalysisResult & {
  documentPath?: string
}

const store = reactive({
  analyzeConfig: {} as Partial<AnalyzeConfig>,
  analysisResult: null as AnalysisResult | null,

  setAnalyzeConfig(config: Partial<AnalyzeConfig>) {
    this.analyzeConfig = { ...this.analyzeConfig, ...config }
  },

  setAnalysisResult(result: AnalysisResult) {
    this.analysisResult = result
  },

  clearAnalysisResult() {
    this.analysisResult = null
  },

  clearConfig() {
    this.analyzeConfig = {}
  }
})

export default store
