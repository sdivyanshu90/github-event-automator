import { z } from "zod";
import { actionTypes, ruleEventTypes, type NormalizedEvent, type RuleAction, type RuleDefinition } from "@/domain/types";

const labelName = z.string().trim().min(1).max(50).regex(/^[^,]+$/, "Label cannot contain a comma");

export const ruleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_label"), label: labelName }),
  z.object({ type: z.literal("post_comment"), body: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal("slack") }),
  z.object({ type: z.literal("ai_triage") }),
]);

export const ruleInputSchema = z
  .object({
    repositoryId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    eventType: z.enum(ruleEventTypes),
    titleContains: z.string().trim().max(200).nullable().optional(),
    authorEquals: z.string().trim().max(255).nullable().optional(),
    labelContains: labelName.nullable().optional(),
    actions: z.array(ruleActionSchema).min(1).max(4),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    const unique = new Set(value.actions.map((action) => action.type));
    if (unique.size !== value.actions.length) {
      context.addIssue({ code: "custom", path: ["actions"], message: "Each action type may appear only once" });
    }
    if (value.eventType === "push" && (value.titleContains || value.labelContains || value.authorEquals)) {
      context.addIssue({ code: "custom", path: ["eventType"], message: "Push rules do not support issue/PR conditions" });
    }
  });

export function matchesRule(rule: RuleDefinition, event: NormalizedEvent): boolean {
  const actualEvent = event.eventType === "push" ? "push" : `${event.eventType}.${event.action}`;
  if (rule.eventType !== actualEvent) return false;
  if (rule.titleContains && !event.title.toLocaleLowerCase().includes(rule.titleContains.toLocaleLowerCase())) return false;
  if (rule.authorEquals && event.actor.toLocaleLowerCase() !== rule.authorEquals.toLocaleLowerCase()) return false;
  if (rule.labelContains && !event.labels.some((label) => label.toLocaleLowerCase() === rule.labelContains?.toLocaleLowerCase())) return false;
  return true;
}

export function actionsFromForm(formData: FormData): RuleAction[] {
  const requested = actionTypes.filter((type) => formData.get(`action_${type}`) === "on");
  return requested.map((type): RuleAction => {
    if (type === "add_label") return { type, label: String(formData.get("label") ?? "") };
    if (type === "post_comment") return { type, body: String(formData.get("comment") ?? "") };
    return { type };
  });
}
