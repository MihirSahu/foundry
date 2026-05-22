import { z } from "zod";

export const scopeLevelSchema = z.enum(["Prototype", "MVP", "Launchable"]);

export const projectSummarySchema = z.object({
  productName: z.string().min(1),
  oneLiner: z.string().min(1),
  problem: z.string().min(1),
  targetUser: z.string().min(1),
  goals: z.array(z.string()).min(1),
  nonGoals: z.array(z.string()).default([]),
  scopeLevel: scopeLevelSchema,
  mvpFeatures: z.array(z.string()).min(1),
  routes: z.array(z.string()).default([]),
  dataEntities: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
});

export const implementationPlanSchema = z.object({
  stack: z.array(z.string()).min(1),
  architecture: z.string().min(1),
  fileStructure: z.array(z.string()).min(1),
  routes: z.array(z.string()).default([]),
  components: z.array(z.string()).default([]),
  dataSchema: z.array(z.string()).default([]),
  apiSurfaces: z.array(z.string()).default([]),
  envVars: z.array(z.string()).default([]),
  milestones: z.array(z.string()).min(1),
  firstTasks: z.array(z.string()).min(1),
  acceptanceCriteria: z.array(z.string()).min(1),
  testPlan: z.array(z.string()).default([]),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ImplementationPlan = z.infer<typeof implementationPlanSchema>;
