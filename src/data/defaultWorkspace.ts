import { CoverageScanResult, WorkspaceState } from '../types/flowguard';

export const DEFAULT_WORKSPACE: WorkspaceState = {
  version: 1,
  activeProjectId: 'proj_default',
  settings: {
    theme: 'light',
    screenshotConsentGranted: false,
    maskSensitivePatterns: 'password|passwd|secret|token|auth|bearer|api_key|ssn|pin|cvv',
  },
  projects: [
    {
      id: 'proj_default',
      name: 'My QA Workspace',
      domain: 'app.example.com',
      activeEnvironment: 'staging',
      flows: [],
      rbacRules: [],
      customRoles: [],
      customTestRules: [],
      contentAssertions: [],
      formulaChecks: [],
      visualChecks: [],
      stateTransitions: [],
      dateTimeRules: [],
      dataDependencies: [],
      businessDocs: [],
      businessNotes: [],
      discussionPoints: [],
      businessPolicies: [],
      bugReports: [],
      testCases: [],
      notices: [],
      approvalChain: [],
      approvalSketches: [],
    },
  ],
};

export const DEFAULT_SCAN_RESULT: CoverageScanResult = {
  ok: true,
  pageUrl: '',
  pageTitle: 'No page scanned yet',
  scannedAt: undefined,
  elements: [],
};
