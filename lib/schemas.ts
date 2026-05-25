import { z } from "zod";

export const scopeLevelSchema = z.enum(["Prototype", "MVP", "Launchable"]);

export const projectSummarySchema = z.object({
  productName: z.string().min(1),
  oneLiner: z.string().min(1),
  problem: z.string().min(1),
  targetUser: z.string().min(1),
  goals: z.array(z.string()).min(1),
  nonGoals: z.array(z.string()),
  scopeLevel: scopeLevelSchema,
  mvpFeatures: z.array(z.string()).min(1),
  routes: z.array(z.string()),
  dataEntities: z.array(z.string()),
  integrations: z.array(z.string()),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
}).strict();

export const chatProjectSummarySchema = z.object({
  productName: z.string().trim(),
  oneLiner: z.string().trim(),
  problem: z.string().trim(),
  targetUser: z.string().trim(),
  smallestUsefulVersion: z.string().trim(),
  goals: z.array(z.string()),
  nonGoals: z.array(z.string()),
  scopeLevel: scopeLevelSchema.nullable(),
  mvpFeatures: z.array(z.string()),
  routes: z.array(z.string()),
  dataEntities: z.array(z.string()),
  integrations: z.array(z.string()),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
  repoRequested: z.boolean().nullable(),
  buildRequested: z.boolean().nullable(),
}).strict();

export const sessionStageSchema = z.enum([
  "clarifying",
  "ready_for_spec",
  "spec_ready",
  "spec_approved",
  "building",
  "built",
  "repo_created",
  "handoff_ready",
]);

export const sessionReadinessSchema = z.enum(["clarifying", "ready_for_spec"]);

export const nextActionSchema = z.object({
  type: z.enum([
    "ask_question",
    "generate_spec",
    "edit_spec",
    "submit_spec",
    "view_build",
    "connect_github",
    "open_repo",
  ]),
  label: z.string().min(1),
}).strict();

export const chatTurnResultSchema = z.object({
  assistantMessage: z.string().min(1),
  summary: chatProjectSummarySchema,
  missingFields: z.array(z.string()),
  readiness: sessionReadinessSchema,
  nextAction: nextActionSchema,
}).strict();

export const projectSessionStateSchema = z.object({
  projectId: z.string().min(1),
  stage: sessionStageSchema,
  readiness: sessionReadinessSchema,
  summary: chatProjectSummarySchema.optional(),
  missingFields: z.array(z.string()),
  repoRequested: z.boolean().nullable(),
  buildRequested: z.boolean().nullable(),
  nextAction: nextActionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

export const specApprovalSchema = z.object({
  content: z.string().trim().min(1).optional(),
  createRepo: z.boolean().optional(),
  runBuild: z.boolean().optional(),
}).strict();

export const implementationPlanSchema = z.object({
  stack: z.array(z.string()).min(1),
  architecture: z.string().min(1),
  fileStructure: z.array(z.string()).min(1),
  routes: z.array(z.string()),
  components: z.array(z.string()),
  dataSchema: z.array(z.string()),
  apiSurfaces: z.array(z.string()),
  envVars: z.array(z.string()),
  milestones: z.array(z.string()).min(1),
  firstTasks: z.array(z.string()).min(1),
  acceptanceCriteria: z.array(z.string()).min(1),
  testPlan: z.array(z.string()),
}).strict();

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ChatProjectSummary = z.infer<typeof chatProjectSummarySchema>;
export type ImplementationPlan = z.infer<typeof implementationPlanSchema>;
export type ChatTurnResult = z.infer<typeof chatTurnResultSchema>;
export type NextAction = z.infer<typeof nextActionSchema>;
export type ProjectSessionState = z.infer<typeof projectSessionStateSchema>;
export type SpecApproval = z.infer<typeof specApprovalSchema>;
