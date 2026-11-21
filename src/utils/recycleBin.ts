import {
  AppLanguage,
  ApprovalChainStage,
  BugReportItem,
  BusinessDocHighlight,
  BusinessDocItem,
  BusinessPolicy,
  BusinessRuleNote,
  ContentAssertionRule,
  CustomTestRuleSuite,
  DataDependencyRule,
  DateTimeRule,
  DiscussionPoint,
  FlowStep,
  FormulaCheckRule,
  ProjectWorkspace,
  QaNotice,
  QaTestCase,
  RbacRule,
  RecordedStep,
  RecycleBinCategory,
  RecycleBinItem,
  SelfAlert,
  StateTransitionRule,
  VisualCheckRecord,
  WorkflowFlow,
  WorkspaceState,
} from '../types/flowguard';

export const RETENTION_DAYS = 3;
export const THREE_DAYS_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function createRecycleBinItem(params: {
  category: RecycleBinCategory;
  projectId: string;
  projectName: string;
  title: string;
  subtitle?: string;
  payload: unknown;
  extra?: Record<string, unknown>;
}): RecycleBinItem {
  const now = Date.now();
  return {
    id: `rb_${now}_${Math.random().toString(36).slice(2, 8)}`,
    category: params.category,
    projectId: params.projectId,
    projectName: params.projectName,
    title: params.title,
    subtitle: params.subtitle,
    payload: params.payload,
    extra: params.extra,
    deletedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + THREE_DAYS_MS).toISOString(),
  };
}

export function purgeExpiredRecycleBin(
  items?: RecycleBinItem[]
): RecycleBinItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const now = Date.now();
  return items.filter((item) => {
    const exp = new Date(item.expiresAt).getTime();
    return Number.isFinite(exp) && exp > now;
  });
}

export function formatTimeRemaining(
  expiresAt: string,
  lang: AppLanguage
): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) {
    return lang === 'bn' ? 'মেয়াদ শেষ' : 'Expired';
  }
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) {
    return lang === 'bn'
      ? `${days} দিন ${hours} ঘণ্টা বাকি`
      : `${days}d ${hours}h left`;
  }
  if (hours > 0) {
    return lang === 'bn'
      ? `${hours} ঘণ্টা ${mins} মি. বাকি`
      : `${hours}h ${mins}m left`;
  }
  return lang === 'bn' ? `${Math.max(1, mins)} মি. বাকি` : `${Math.max(1, mins)}m left`;
}

export function getCategoryLabel(
  category: RecycleBinCategory,
  lang: AppLanguage
): string {
  const labels: Record<RecycleBinCategory, { en: string; bn: string }> = {
    flow: { en: 'Test Flow', bn: 'টেস্ট ফ্লো' },
    flow_step: { en: 'Flow Step', bn: 'ফ্লো স্টেপ' },
    rbac_rule: { en: 'Role Permission Rule', bn: 'রোল পারমিশন রুল' },
    custom_role: { en: 'Custom Role', bn: 'কাস্টম রোল' },
    custom_test_rule: { en: 'Custom Test Rule', bn: 'কাস্টম টেস্ট রুল' },
    approval_stage: { en: 'Approval Stage', bn: 'অ্যাপ্রুভাল ধাপ' },
    state_transition: { en: 'State Rule', bn: 'স্টেট রুল' },
    date_time_rule: { en: 'Date/Time Rule', bn: 'তারিখ/সময় রুল' },
    data_dependency: { en: 'Data Dependency', bn: 'ডাটা ডিপেন্ডেন্সি' },
    business_doc: { en: 'Documentation', bn: 'ডকুমেন্টেশন' },
    business_note: { en: 'Business Note', bn: 'বিজনেস নোট' },
    discussion_point: { en: 'Discussion Point', bn: 'ডিসকাশন পয়েন্ট' },
    business_policy: { en: 'Business Policy', bn: 'বিজনেস পলিসি' },
    doc_highlight: { en: 'Text Highlight', bn: 'টেক্সট হাইলাইট' },
    content_assertion: { en: 'Content Assertion', bn: 'কন্টেন্ট চেক' },
    formula_check: { en: 'Formula Check', bn: 'ফর্মুলা চেক' },
    visual_check: { en: 'Visual Match Check', bn: 'ভিজ্যুয়াল ম্যাচ' },
    bug_report: { en: 'Bug Ticket', bn: 'বাগ টিকেট' },
    test_case: { en: 'Test Case', bn: 'টেস্ট কেস' },
    qa_notice: { en: 'QA Notice', bn: 'QA নোটিশ' },
    self_alert: { en: 'Self Alert', bn: 'সেলফ অ্যালার্ট' },
    recorded_steps: { en: 'Recorded Steps', bn: 'রেকর্ড করা স্টেপস' },
    workspace_snapshot: { en: 'Workspace Backup', bn: 'ওয়ার্কস্পেস ব্যাকআপ' },
  };
  const entry = labels[category];
  return lang === 'bn' ? entry.bn : entry.en;
}

function findRemovedById<T extends { id: string }>(
  prevArr: T[] | undefined,
  nextArr: T[] | undefined
): T[] {
  const oldList = prevArr || [];
  const newList = nextArr || [];
  if (oldList.length === 0) return [];
  const nextIds = new Set(newList.map((item) => item.id));
  return oldList.filter((item) => !nextIds.has(item.id));
}

export interface DetectedDeletions {
  items: RecycleBinItem[];
  summaryTitle: string;
  categoryLabel: string;
}

/**
 * Inspects a candidate ProjectWorkspace update against the previous ProjectWorkspace
 * to detect any deleted items across all modules so nothing can be deleted without
 * confirmation and 3-day Recycle Bin protection.
 */
export function detectProjectDeletions(
  prev: ProjectWorkspace,
  next: ProjectWorkspace,
  lang: AppLanguage
): DetectedDeletions {
  const items: RecycleBinItem[] = [];
  const projectId = prev.id;
  const projectName = prev.name;

  // 1. Deleted Flows
  const removedFlows = findRemovedById(prev.flows, next.flows);
  for (const flow of removedFlows) {
    items.push(
      createRecycleBinItem({
        category: 'flow',
        projectId,
        projectName,
        title: flow.name,
        subtitle: `${flow.module} · ${flow.steps.length} step(s)`,
        payload: flow,
      })
    );
  }

  // 2. Deleted Flow Steps inside surviving flows
  for (const prevFlow of prev.flows || []) {
    const matchingNextFlow = (next.flows || []).find(
      (f) => f.id === prevFlow.id
    );
    if (!matchingNextFlow) continue;
    const removedSteps = findRemovedById(prevFlow.steps, matchingNextFlow.steps);
    for (const step of removedSteps) {
      items.push(
        createRecycleBinItem({
          category: 'flow_step',
          projectId,
          projectName,
          title: step.title || step.targetElement,
          subtitle: `${prevFlow.name} · ${step.action}`,
          payload: step,
          extra: { flowId: prevFlow.id, flowName: prevFlow.name },
        })
      );
    }
  }

  // 3. Deleted Custom Roles (distinguish delete vs rename!)
  const prevRoles = prev.customRoles || [];
  const nextRoles = next.customRoles || [];
  const nextRoleSet = new Set(nextRoles);
  const prevRoleSet = new Set(prevRoles);
  const removedRoles = prevRoles.filter((r) => !nextRoleSet.has(r));
  const addedRoles = nextRoles.filter((r) => !prevRoleSet.has(r));
  const isPureRename =
    prevRoles.length === nextRoles.length &&
    removedRoles.length === 1 &&
    addedRoles.length === 1;

  const removedRbacRules = findRemovedById(prev.rbacRules, next.rbacRules);
  const claimedRbacIds = new Set<string>();

  if (!isPureRename && removedRoles.length > 0) {
    for (const roleName of removedRoles) {
      const associatedRules = removedRbacRules.filter(
        (r) => r.role === roleName
      );
      associatedRules.forEach((r) => claimedRbacIds.add(r.id));
      items.push(
        createRecycleBinItem({
          category: 'custom_role',
          projectId,
          projectName,
          title: roleName,
          subtitle:
            associatedRules.length > 0
              ? `${associatedRules.length} attached matrix rule(s)`
              : 'Role definition',
          payload: roleName,
          extra:
            associatedRules.length > 0
              ? { relatedRbacRules: associatedRules }
              : undefined,
        })
      );
    }
  }

  // 4. Standalone Deleted RBAC Rules (not claimed by role deletion)
  for (const rule of removedRbacRules) {
    if (claimedRbacIds.has(rule.id)) continue;
    items.push(
      createRecycleBinItem({
        category: 'rbac_rule',
        projectId,
        projectName,
        title: `${rule.role}: ${rule.feature}`,
        subtitle: rule.selector,
        payload: rule,
      })
    );
  }

  // 5. Custom Test Rule Suites
  for (const suite of findRemovedById(
    prev.customTestRules,
    next.customTestRules
  )) {
    items.push(
      createRecycleBinItem({
        category: 'custom_test_rule',
        projectId,
        projectName,
        title: suite.ruleName,
        subtitle: `${suite.items.length} role check(s)`,
        payload: suite,
      })
    );
  }

  // 6. Approval Chain Stages
  for (const stage of findRemovedById(prev.approvalChain, next.approvalChain)) {
    items.push(
      createRecycleBinItem({
        category: 'approval_stage',
        projectId,
        projectName,
        title: `${stage.role} — ${stage.stepLabel}`,
        subtitle: stage.condition || undefined,
        payload: stage,
      })
    );
  }

  // 7. State Transitions, DateTime Rules, Data Dependencies
  for (const st of findRemovedById(
    prev.stateTransitions,
    next.stateTransitions
  )) {
    items.push(
      createRecycleBinItem({
        category: 'state_transition',
        projectId,
        projectName,
        title: `${st.fromState} → ${st.toState}`,
        subtitle: st.entity,
        payload: st,
      })
    );
  }
  for (const dt of findRemovedById(prev.dateTimeRules, next.dateTimeRules)) {
    items.push(
      createRecycleBinItem({
        category: 'date_time_rule',
        projectId,
        projectName,
        title: dt.name,
        subtitle: dt.ruleType,
        payload: dt,
      })
    );
  }
  for (const dd of findRemovedById(
    prev.dataDependencies,
    next.dataDependencies
  )) {
    items.push(
      createRecycleBinItem({
        category: 'data_dependency',
        projectId,
        projectName,
        title: dd.name,
        subtitle: dd.expression,
        payload: dd,
      })
    );
  }

  // 8. Business Knowledge (Docs, Inline Highlights, Notes, Discussions, Policies)
  for (const doc of findRemovedById(prev.businessDocs, next.businessDocs)) {
    items.push(
      createRecycleBinItem({
        category: 'business_doc',
        projectId,
        projectName,
        title: doc.title,
        subtitle: doc.sectionRef || 'Documentation',
        payload: doc,
      })
    );
  }

  // Inline highlights inside surviving docs
  for (const prevDoc of prev.businessDocs || []) {
    const nextDoc = (next.businessDocs || []).find((d) => d.id === prevDoc.id);
    if (!nextDoc) continue;
    for (const hl of findRemovedById(prevDoc.highlights, nextDoc.highlights)) {
      items.push(
        createRecycleBinItem({
          category: 'doc_highlight',
          projectId,
          projectName,
          title: hl.quote.slice(0, 70),
          subtitle: prevDoc.title,
          payload: hl,
          extra: { docId: prevDoc.id, docTitle: prevDoc.title },
        })
      );
    }
  }

  for (const note of findRemovedById(prev.businessNotes, next.businessNotes)) {
    items.push(
      createRecycleBinItem({
        category: 'business_note',
        projectId,
        projectName,
        title: note.title,
        subtitle: note.category,
        payload: note,
      })
    );
  }

  for (const disc of findRemovedById(
    prev.discussionPoints,
    next.discussionPoints
  )) {
    items.push(
      createRecycleBinItem({
        category: 'discussion_point',
        projectId,
        projectName,
        title: disc.topic,
        subtitle: disc.whereToDiscuss,
        payload: disc,
      })
    );
  }

  for (const pol of findRemovedById(
    prev.businessPolicies,
    next.businessPolicies
  )) {
    items.push(
      createRecycleBinItem({
        category: 'business_policy',
        projectId,
        projectName,
        title: `${pol.code ? `${pol.code}: ` : ''}${pol.title}`,
        subtitle: pol.category,
        payload: pol,
      })
    );
  }

  // 9. Content Assertions & Formula Checks
  for (const ca of findRemovedById(
    prev.contentAssertions,
    next.contentAssertions
  )) {
    items.push(
      createRecycleBinItem({
        category: 'content_assertion',
        projectId,
        projectName,
        title: ca.name,
        subtitle: ca.expectedText.slice(0, 60),
        payload: ca,
      })
    );
  }

  for (const fc of findRemovedById(prev.formulaChecks, next.formulaChecks)) {
    items.push(
      createRecycleBinItem({
        category: 'formula_check',
        projectId,
        projectName,
        title: fc.name,
        subtitle: fc.expression,
        payload: fc,
      })
    );
  }

  // 10. Visual Checks
  for (const vis of findRemovedById(prev.visualChecks, next.visualChecks)) {
    items.push(
      createRecycleBinItem({
        category: 'visual_check',
        projectId,
        projectName,
        title: vis.name,
        subtitle: `${vis.matchPct}% match`,
        payload: vis,
      })
    );
  }

  // 11. Bug Reports & Test Cases
  for (const bug of findRemovedById(prev.bugReports, next.bugReports)) {
    items.push(
      createRecycleBinItem({
        category: 'bug_report',
        projectId,
        projectName,
        title: `${bug.bugKey}: ${bug.title}`,
        subtitle: `${bug.severity.toUpperCase()} · ${bug.module}`,
        payload: bug,
      })
    );
  }

  for (const tc of findRemovedById(prev.testCases, next.testCases)) {
    items.push(
      createRecycleBinItem({
        category: 'test_case',
        projectId,
        projectName,
        title: `${tc.tcKey}: ${tc.title}`,
        subtitle: `${tc.priority} · ${tc.module}`,
        payload: tc,
      })
    );
  }

  // 12. QA Notices
  for (const notice of findRemovedById(prev.notices, next.notices)) {
    items.push(
      createRecycleBinItem({
        category: 'qa_notice',
        projectId,
        projectName,
        title: notice.title,
        subtitle: notice.scope,
        payload: notice,
      })
    );
  }

  if (items.length === 0) {
    return { items: [], summaryTitle: '', categoryLabel: '' };
  }

  const summaryTitle =
    items.length === 1
      ? items[0].title
      : lang === 'bn'
        ? `${items.length}টি আইটেম (${items[0].title} ইত্যাদি)`
        : `${items.length} items (${items[0].title}, etc.)`;

  const categoryLabel =
    items.length === 1
      ? getCategoryLabel(items[0].category, lang)
      : lang === 'bn'
        ? 'একাধিক আইটেম'
        : 'Multiple Items';

  return { items, summaryTitle, categoryLabel };
}

function dedupePush<T extends { id: string }>(
  list: T[] | undefined,
  item: T,
  prepend = false
): T[] {
  const arr = list || [];
  if (arr.some((x) => x.id === item.id)) return arr;
  return prepend ? [item, ...arr] : [...arr, item];
}

export interface RestoreResult {
  workspace: WorkspaceState;
  restoredAlert?: SelfAlert;
  restoredRecordedSteps?: RecordedStep[];
}

export function restoreFromRecycleBin(
  workspace: WorkspaceState,
  item: RecycleBinItem
): RestoreResult {
  const remainingBin = (workspace.recycleBin || []).filter(
    (rb) => rb.id !== item.id
  );

  if (item.category === 'workspace_snapshot') {
    const snapshot = item.payload as {
      activeProjectId?: string;
      projects?: ProjectWorkspace[];
    };
    const restoredProjects = Array.isArray(snapshot?.projects)
      ? snapshot.projects
      : workspace.projects;
    return {
      workspace: {
        ...workspace,
        activeProjectId:
          snapshot?.activeProjectId || restoredProjects[0]?.id || workspace.activeProjectId,
        projects: restoredProjects,
        recycleBin: remainingBin,
      },
    };
  }

  if (item.category === 'self_alert') {
    const alert = item.payload as SelfAlert;
    const isFuture = alert.triggerAt > Date.now();
    const restoredAlert: SelfAlert = {
      ...alert,
      status: isFuture ? 'scheduled' : alert.status,
    };
    return {
      workspace: { ...workspace, recycleBin: remainingBin },
      restoredAlert,
    };
  }

  if (item.category === 'recorded_steps') {
    const steps = Array.isArray(item.payload)
      ? (item.payload as RecordedStep[])
      : [];
    return {
      workspace: { ...workspace, recycleBin: remainingBin },
      restoredRecordedSteps: steps,
    };
  }

  const targetProjectId = workspace.projects.some((p) => p.id === item.projectId)
    ? item.projectId
    : workspace.activeProjectId || workspace.projects[0]?.id;

  const updatedProjects = workspace.projects.map((proj) => {
    if (proj.id !== targetProjectId) return proj;

    switch (item.category) {
      case 'flow':
        return {
          ...proj,
          flows: dedupePush(proj.flows, item.payload as WorkflowFlow),
        };
      case 'flow_step': {
        const step = item.payload as FlowStep;
        const targetFlowId = String(item.extra?.flowId || '');
        const hasFlow = proj.flows.some((f) => f.id === targetFlowId);
        if (hasFlow) {
          return {
            ...proj,
            flows: proj.flows.map((f) =>
              f.id === targetFlowId
                ? { ...f, steps: dedupePush(f.steps, step) }
                : f
            ),
          };
        }
        if (proj.flows.length > 0) {
          return {
            ...proj,
            flows: proj.flows.map((f, idx) =>
              idx === 0 ? { ...f, steps: dedupePush(f.steps, step) } : f
            ),
          };
        }
        return {
          ...proj,
          flows: [
            {
              id: `flow_${Date.now()}`,
              name: String(item.extra?.flowName || 'Restored Flow'),
              module: 'Restored Steps',
              targetUrl: `https://${proj.domain}/`,
              lastRunAt: null,
              steps: [step],
            },
          ],
        };
      }
      case 'custom_role': {
        const roleName = String(item.payload);
        const existingRoles = proj.customRoles || [];
        const nextRoles = existingRoles.includes(roleName)
          ? existingRoles
          : [...existingRoles, roleName];
        const relatedRules = Array.isArray(item.extra?.relatedRbacRules)
          ? (item.extra?.relatedRbacRules as RbacRule[])
          : [];
        let nextRbac = proj.rbacRules || [];
        for (const r of relatedRules) {
          nextRbac = dedupePush(nextRbac, r);
        }
        return { ...proj, customRoles: nextRoles, rbacRules: nextRbac };
      }
      case 'rbac_rule':
        return {
          ...proj,
          rbacRules: dedupePush(proj.rbacRules, item.payload as RbacRule),
        };
      case 'custom_test_rule':
        return {
          ...proj,
          customTestRules: dedupePush(
            proj.customTestRules,
            item.payload as CustomTestRuleSuite
          ),
        };
      case 'approval_stage':
        return {
          ...proj,
          approvalChain: dedupePush(
            proj.approvalChain,
            item.payload as ApprovalChainStage
          ),
        };
      case 'state_transition':
        return {
          ...proj,
          stateTransitions: dedupePush(
            proj.stateTransitions,
            item.payload as StateTransitionRule
          ),
        };
      case 'date_time_rule':
        return {
          ...proj,
          dateTimeRules: dedupePush(
            proj.dateTimeRules,
            item.payload as DateTimeRule
          ),
        };
      case 'data_dependency':
        return {
          ...proj,
          dataDependencies: dedupePush(
            proj.dataDependencies,
            item.payload as DataDependencyRule
          ),
        };
      case 'business_doc':
        return {
          ...proj,
          businessDocs: dedupePush(
            proj.businessDocs,
            item.payload as BusinessDocItem,
            true
          ),
        };
      case 'doc_highlight': {
        const hl = item.payload as BusinessDocHighlight;
        const docId = String(item.extra?.docId || '');
        return {
          ...proj,
          businessDocs: (proj.businessDocs || []).map((d) =>
            d.id === docId
              ? { ...d, highlights: dedupePush(d.highlights, hl) }
              : d
          ),
        };
      }
      case 'business_note':
        return {
          ...proj,
          businessNotes: dedupePush(
            proj.businessNotes,
            item.payload as BusinessRuleNote,
            true
          ),
        };
      case 'discussion_point':
        return {
          ...proj,
          discussionPoints: dedupePush(
            proj.discussionPoints,
            item.payload as DiscussionPoint,
            true
          ),
        };
      case 'business_policy':
        return {
          ...proj,
          businessPolicies: dedupePush(
            proj.businessPolicies,
            item.payload as BusinessPolicy,
            true
          ),
        };
      case 'content_assertion':
        return {
          ...proj,
          contentAssertions: dedupePush(
            proj.contentAssertions,
            item.payload as ContentAssertionRule
          ),
        };
      case 'formula_check':
        return {
          ...proj,
          formulaChecks: dedupePush(
            proj.formulaChecks,
            item.payload as FormulaCheckRule
          ),
        };
      case 'visual_check':
        return {
          ...proj,
          visualChecks: dedupePush(
            proj.visualChecks,
            item.payload as VisualCheckRecord,
            true
          ),
        };
      case 'bug_report':
        return {
          ...proj,
          bugReports: dedupePush(
            proj.bugReports,
            item.payload as BugReportItem,
            true
          ),
        };
      case 'test_case':
        return {
          ...proj,
          testCases: dedupePush(
            proj.testCases,
            item.payload as QaTestCase,
            true
          ),
        };
      case 'qa_notice':
        return {
          ...proj,
          notices: dedupePush(proj.notices, item.payload as QaNotice, true),
        };
      default:
        return proj;
    }
  });

  return {
    workspace: {
      ...workspace,
      projects: updatedProjects,
      recycleBin: remainingBin,
    },
  };
}
