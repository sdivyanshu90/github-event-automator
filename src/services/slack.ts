import type { AITriageResult, NormalizedEvent } from "@/domain/types";
import { optionalEnv } from "@/lib/env";
import { ConfigurationError, ProviderError } from "@/lib/errors";
import { sanitizeProviderMessage } from "@/lib/logger";

type Fetch = typeof fetch;

export interface SlackNotification {
  event: NormalizedEvent;
  ruleName: string;
  ai?: AITriageResult;
}

export class SlackClient {
  constructor(private readonly fetcher: Fetch = fetch) {}

  async notify(input: SlackNotification): Promise<void> {
    const webhookUrl = optionalEnv("SLACK_WEBHOOK_URL");
    if (!webhookUrl) throw new ConfigurationError("SLACK_WEBHOOK_URL is not configured");
    const aiText = input.ai
      ? `\nAI priority: *${input.ai.priority}* — ${input.ai.summary}\nSuggested label: ${input.ai.suggestedLabel}`
      : "";
    const text = `*${input.event.eventType}.${input.event.action}* in *${input.event.repository.fullName}*\n<${input.event.url}|${input.event.title}> by \`${input.event.actor}\`\nMatched rule: ${input.ruleName}${aiText}`;
    let response: Response;
    try {
      response = await this.fetcher(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${input.event.repository.fullName}: ${input.event.title}`,
          blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ProviderError(String(error), "SLACK", true, 503, "Slack could not be reached");
    }
    if (!response.ok) {
      const responseText = sanitizeProviderMessage(await response.text());
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(
        `Slack ${response.status}: ${responseText}`,
        "SLACK",
        retryable,
        response.status,
        retryable ? `Slack temporarily failed (${response.status})` : `Slack rejected the notification (${response.status})`,
      );
    }
  }
}
