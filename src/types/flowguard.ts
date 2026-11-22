export type EnvironmentName = 'staging' | 'qa' | 'production';

export type AppLanguage = 'en' | 'bn';

export type StepAction = 'click' | 'type' | 'select' | 'check' | 'uncheck' | 'assert';

export type StepStatus = 'pending' | 'passed' | 'failed';

export interface InspectedElement {
  tagName: string;
  visibleText: string;
  accessibleName: string;
  id: string;
  name: string;
  placeholder: string;
  role: string;
  label: string;
  cssSelector: string;
  cssIsUnique: boolean;
  xpathSuggestion: string;
  pageUrl: string;
  timestamp: string;
}

export interface RecordedStep {
  title: string;
  action: StepAction;
  targetElement: string;
  testData: string;
  isSensitiveData: boolean;
  pageUrl: string;
  inspected?: InspectedElement;
  observedResult: string;
  timestamp: string;
}

export interface FlowStep {
  id: string;
  title: string;
  action: StepAction;
  targetElement: string;
  testData: string;
  isSensitiveData: boolean;
  expectedRule: string;
  observedResult: string;
  status: StepStatus;
  verificationMode?: 'live_dom' | 'spec_check' | 'manual';
  verifiedAt?: string;
}

export interface WorkflowFlow {
  id: string;
  name: string;
  module: string;
  targetUrl: string;
  lastRunAt: string | null;
  steps: FlowStep[];
}

export type DomVisibilityExpectation = 'visible' | 'disabled' | 'hidden';
export type DomObservedState = 'visible' | 'disabled' | 'hidden' | 'not_checked';

export interface RbacRule {
  id: string;
  role: string;
  feature: string;
  selector: string;
  expected: DomVisibilityExpectation;
  customRuleLabel?: string;
  observed: DomObservedState;
  lastProbedAt: string | null;
}

export interface CustomTestRuleItem {
  id: string;
  role: string;
  targetElement: string;
  expected: DomVisibilityExpectation;
  ruleNote?: string;
}

export interface CustomTestRuleSuite {
  id: string;
  ruleName: string;
  description?: string;
  targetUrl?: string;
  items: CustomTestRuleItem[];
  createdAt: string;
}

export interface StateTransitionRule {
  id: string;
  entity: string;
  fromState: string;
  toState: string;
  allowed: boolean;
  guardCondition: string;
  lastVerifiedStatus: 'passed' | 'failed' | 'untested';
}

export interface DateTimeRule {
  id: string;
  name: string;
  timezone: string;
  ruleType: 'cutoff' | 'backdate_limit' | 'weekend_exclusion' | 'overlap_check';
  thresholdValue: string;
  sampleInput: string;
  expectedOutcome: 'allow' | 'block';
  actualOutcome: 'allow' | 'block' | 'untested';
}

export interface DataDependencyRule {
  id: string;
  name: string;
  expression: string;
  downstreamImpact: string;
  sampleLeftValue: number;
  sampleRightValue: number;
  operator: '<=' | '===' | '>=' | '<';
  status: 'passed' | 'failed' | 'untested';
}

export interface CoverageElement {
  id: string;
  pageUrl: string;
  pageTitle: string;
  controlType: 'button' | 'input' | 'select' | 'link' | 'checkbox' | 'radio';
  label: string;
  selector: string;
  testId?: string;
  visible: boolean;
  disabled: boolean;
  testState: 'Tested' | 'Untested';
}

export interface CoverageScanResult {
  ok: boolean;
  pageUrl: string;
  pageTitle: string;
  elements: CoverageElement[];
  scannedAt?: string;
}

export type QaNoticeType = 'allowed' | 'restricted' | 'blocked' | 'advisory';

export interface QaNotice {
  id: string;
  type: QaNoticeType;
  title: string;
  message: string;
  scope: string;
  pinnedOnTop: boolean;
  createdAt: string;
}

export type FlowchartNodeKind = 'start' | 'step' | 'decision' | 'allowed' | 'blocked' | 'note';

export interface FlowchartNode {
  id: string;
  kind: FlowchartNodeKind;
  label: string;
  x: number;
  y: number;
}

export interface FlowchartEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  tone: 'flow' | 'allowed' | 'blocked';
}

export interface SketchStroke {
  id: string;
  tool: 'pen' | 'rect' | 'arrow';
  color: string;
  points: Array<{ x: number; y: number }>;
}

export interface ApprovalChainStage {
  id: string;
  role: string;
  stepLabel: string;
  condition: string;
  qaNote: string;
  required: boolean;
  canReject: boolean;
}

export type ContentMatchOperator =
  | 'contains'
  | 'equals'
  | 'not_contains'
  | 'regex'
  | 'max_length';

export interface ContentAssertionRule {
  id: string;
  name: string;
  selector: string;
  operator: ContentMatchOperator;
  expectedText: string;
  caseSensitive?: boolean;
  sampleInputText?: string;
  lastActualText?: string;
  status: 'passed' | 'failed' | 'untested';
  lastCheckedAt?: string | null;
}

export interface FormulaVariable {
  name: string;
  value: number;
  selector?: string;
}

export interface FormulaCheckRule {
  id: string;
  name: string;
  expression: string;
  variables: FormulaVariable[];
  actualDisplayedValue: number;
  actualSelector?: string;
  tolerance: number;
  computedValue?: number;
  status: 'passed' | 'failed' | 'untested';
  lastMessage?: string;
}

export interface VisualCheckRecord {
  id: string;
  name: string;
  matchPct: number;
  passThresholdPct: number;
  sensitivity: number;
  passed: boolean;
  refSize: string;
  actualSize: string;
  hotspots: string[];
  checkedAt: string;
}

export type HighlightColor = 'amber' | 'emerald' | 'rose' | 'sky';

export type BusinessDocMarkStatus =
  | 'unmarked'
  | 'important'
  | 'needs_review'
  | 'approved'
  | 'risk';

export interface BusinessDocHighlight {
  id: string;
  quote: string;
  color: HighlightColor;
  comment?: string;
}

export interface BusinessDocItem {
  id: string;
  title: string;
  sectionRef: string;
  content: string;
  markStatus: BusinessDocMarkStatus;
  highlighted: boolean;
  highlightColor: HighlightColor;
  highlights: BusinessDocHighlight[];
  updatedAt: string;
}

export interface BusinessRuleNote {
  id: string;
  title: string;
  content: string;
  category: 'general' | 'edge_case' | 'bug_risk' | 'clarification';
  highlighted: boolean;
  highlightColor: HighlightColor;
  pinned: boolean;
  updatedAt: string;
}

export interface DiscussionPoint {
  id: string;
  topic: string;
  whereToDiscuss: string;
  participants: string;
  details: string;
  priority: 'high' | 'normal' | 'low';
  status: 'open' | 'discussed' | 'resolved';
  highlighted: boolean;
  resolutionNote?: string;
  createdAt: string;
}

export interface BusinessPolicy {
  id: string;
  code: string;
  title: string;
  category: string;
  statement: string;
  exceptionRule?: string;
  owner: string;
  status: 'active' | 'draft' | 'deprecated';
  highlighted: boolean;
  highlightColor: HighlightColor;
  effectiveDate: string;
  updatedAt: string;
}

export type BugSeverity = 'blocker' | 'critical' | 'major' | 'minor';
export type BugPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type BugStatus = 'open' | 'in_progress' | 'retest' | 'closed';

export interface BugReportItem {
  id: string;
  bugKey: string;
  title: string;
  module: string;
  severity: BugSeverity;
  priority: BugPriority;
  status: BugStatus;
  environment: string;
  browserInfo: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  consoleOrApiNote?: string;
  screenshotDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type TestCasePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type TestCaseStatus = 'untested' | 'passed' | 'failed' | 'blocked';

export interface QaTestCase {
  id: string;
  tcKey: string;
  title: string;
  module: string;
  priority: TestCasePriority;
  precondition: string;
  steps: string;
  testData: string;
  expectedResult: string;
  actualResult: string;
  status: TestCaseStatus;
  updatedAt: string;
}

export interface SavedGpsLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  note?: string;
  createdAt: string;
}

export interface FakeGpsConfig {
  enabled: boolean;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  locationLabel: string;
  simulateMovement: boolean;
  routeEndLat: number;
  routeEndLng: number;
  routeIntervalSec: number;
  showFloatingBadge: boolean;
  updatedAt: string;
}

export type ScannedFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'password'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'url'
  | 'search';

export interface ScannedFormField {
  id: string;
  label: string;
  name: string;
  selector: string;
  fieldType: ScannedFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  currentValue?: string;
  generatedValue: string;
  edgeCaseValue?: string;
  rationale?: string;
  isSensitive?: boolean;
}

export type WebsiteTestCategory =
  | 'Functional Flow'
  | 'Form & Validation'
  | 'Auth & Security'
  | 'UI & Responsive'
  | 'Business Logic'
  | 'API & Performance';

export interface WebsiteTestRecommendation {
  id: string;
  title: string;
  category: WebsiteTestCategory;
  priority: 'P0' | 'P1' | 'P2';
  whyImportant: string;
  howToTest: string;
  expectedResult: string;
  targetArea?: string;
  checked?: boolean;
}

export interface SmartScreenAnalysisResult {
  pageTitle: string;
  pageUrl: string;
  appType: string;
  summary: string;
  detectedFields: ScannedFormField[];
  majorTests: WebsiteTestRecommendation[];
  analyzedAt: string;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  domain: string;
  activeEnvironment: EnvironmentName;
  flows: WorkflowFlow[];
  rbacRules: RbacRule[];
  customRoles?: string[];
  customTestRules?: CustomTestRuleSuite[];
  contentAssertions?: ContentAssertionRule[];
  formulaChecks?: FormulaCheckRule[];
  visualChecks?: VisualCheckRecord[];
  stateTransitions: StateTransitionRule[];
  dateTimeRules: DateTimeRule[];
  dataDependencies: DataDependencyRule[];
  businessDocs?: BusinessDocItem[];
  businessNotes?: BusinessRuleNote[];
  discussionPoints?: DiscussionPoint[];
  businessPolicies?: BusinessPolicy[];
  bugReports?: BugReportItem[];
  testCases?: QaTestCase[];
  notices?: QaNotice[];
  approvalChain?: ApprovalChainStage[];
  approvalSketches?: SketchStroke[];
  savedGpsLocations?: SavedGpsLocation[];
  smartScanResult?: SmartScreenAnalysisResult | null;
}

export interface WorkspaceSettings {
  theme: 'light' | 'dark';
  screenshotConsentGranted: boolean;
  maskSensitivePatterns: string;
}

export type RecycleBinCategory =
  | 'flow'
  | 'flow_step'
  | 'rbac_rule'
  | 'custom_role'
  | 'custom_test_rule'
  | 'approval_stage'
  | 'state_transition'
  | 'date_time_rule'
  | 'data_dependency'
  | 'business_doc'
  | 'business_note'
  | 'discussion_point'
  | 'business_policy'
  | 'doc_highlight'
  | 'content_assertion'
  | 'formula_check'
  | 'visual_check'
  | 'bug_report'
  | 'test_case'
  | 'qa_notice'
  | 'self_alert'
  | 'recorded_steps'
  | 'fake_gps_profile'
  | 'workspace_snapshot';

export interface RecycleBinItem {
  id: string;
  category: RecycleBinCategory;
  projectId: string;
  projectName: string;
  title: string;
  subtitle?: string;
  payload: unknown;
  extra?: Record<string, unknown>;
  deletedAt: string;
  expiresAt: string;
}

export interface WorkspaceState {
  version: 1;
  activeProjectId: string;
  projects: ProjectWorkspace[];
  settings: WorkspaceSettings;
  recycleBin?: RecycleBinItem[];
}

export interface RecordingState {
  isRecording: boolean;
  recordedSteps: RecordedStep[];
}

export interface PreferencesState {
  theme: 'light' | 'dark';
}

export interface SelfAlert {
  id: string;
  title: string;
  message: string;
  mode: 'timer' | 'time';
  durationSeconds?: number;
  durationMinutes?: number;
  targetTimeStr?: string;
  soundEnabled?: boolean;
  triggerAt: number;
  status: 'scheduled' | 'triggered';
  createdAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

export interface CloudSyncSession {
  user: AuthUser | null;
  serverUrl: string;
  bearerToken: string;
  lastSyncedAt: string | null;
}

export interface UserSyncBundle {
  workspace: WorkspaceState;
  fakeGps: FakeGpsConfig;
  alerts: SelfAlert[];
  lastScan: CoverageScanResult;
  recording: RecordingState;
  inspected: InspectedElement | null;
  updatedAt?: string;
}

