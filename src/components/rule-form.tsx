import type { Repository, Rule } from "@/db/schema";
import { ruleEventTypes } from "@/domain/types";

export function RuleForm({ repositories, rule, action }: { repositories: Repository[]; rule?: Rule; action: (formData: FormData) => void | Promise<void> }) {
  const actionMap = new Map(rule?.actions.map((item) => [item.type, item]));
  const labelAction = actionMap.get("add_label");
  const commentAction = actionMap.get("post_comment");
  return (
    <form action={action} className="panel form-stack">
      <label>
        Rule name
        <input name="name" required maxLength={100} defaultValue={rule?.name ?? ""} placeholder="Label incoming bugs" />
      </label>
      <label>
        Repository
        <select name="repositoryId" required defaultValue={rule?.repositoryId ?? ""}>
          <option value="" disabled>Select a repository</option>
          {repositories.filter((repository) => repository.active).map((repository) => <option key={repository.id} value={repository.id}>{repository.fullName}</option>)}
        </select>
      </label>
      <label>
        Event
        <select name="eventType" required defaultValue={rule?.eventType ?? "issues.opened"}>
          {ruleEventTypes.map((event) => <option key={event} value={event}>{event}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label>Title contains <input name="titleContains" maxLength={200} defaultValue={rule?.titleContains ?? ""} placeholder="bug" /></label>
        <label>Author equals <input name="authorEquals" maxLength={255} defaultValue={rule?.authorEquals ?? ""} placeholder="octocat" /></label>
        <label>Has label <input name="labelContains" maxLength={50} defaultValue={rule?.labelContains ?? ""} placeholder="needs-triage" /></label>
      </div>
      <fieldset>
        <legend>Actions</legend>
        <label className="check"><input type="checkbox" name="action_add_label" defaultChecked={actionMap.has("add_label")} /> Add label</label>
        <input name="label" maxLength={50} defaultValue={labelAction?.type === "add_label" ? labelAction.label : ""} placeholder="bug" aria-label="Label to add" />
        <label className="check"><input type="checkbox" name="action_post_comment" defaultChecked={actionMap.has("post_comment")} /> Post comment</label>
        <textarea name="comment" maxLength={5000} defaultValue={commentAction?.type === "post_comment" ? commentAction.body : ""} placeholder="Thanks for the report. The team will review it." aria-label="Comment body" />
        <label className="check"><input type="checkbox" name="action_slack" defaultChecked={actionMap.has("slack")} /> Send Slack notification</label>
        <label className="check"><input type="checkbox" name="action_ai_triage" defaultChecked={actionMap.has("ai_triage")} /> Run optional AI triage</label>
      </fieldset>
      <label className="check"><input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} /> Enabled</label>
      <button className="button" type="submit">{rule ? "Save rule" : "Create rule"}</button>
    </form>
  );
}
