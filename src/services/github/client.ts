import { SignJWT, importPKCS8 } from "jose";
import { githubPrivateKey, requiredEnv } from "@/lib/env";
import { ConfigurationError, ProviderError } from "@/lib/errors";
import { sanitizeProviderMessage } from "@/lib/logger";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
type Fetch = typeof fetch;

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

interface InstallationResponse {
  id: number;
  account: { login: string; type: string } | null;
}

interface InstallationRepositoriesResponse {
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
  }>;
}

interface UserInstallationsResponse {
  installations: Array<{ id: number }>;
}

export interface InstallationRepository {
  githubId: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface InstallationDetails {
  installationId: string;
  accountLogin: string;
  accountType: string;
  repositories: InstallationRepository[];
}

export class GitHubClient {
  constructor(private readonly fetcher: Fetch = fetch) {}

  async createAppJwt(): Promise<string> {
    const appId = requiredEnv("GITHUB_APP_ID");
    const now = Math.floor(Date.now() / 1000);
    try {
      const key = await importPKCS8(githubPrivateKey(), "RS256");
      return await new SignJWT({})
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt(now - 60)
        .setIssuer(appId)
        .setExpirationTime(now + 9 * 60)
        .sign(key);
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw new ConfigurationError("GITHUB_APP_PRIVATE_KEY could not sign an RS256 JWT");
    }
  }

  async installationToken(installationId: string): Promise<string> {
    const jwt = await this.createAppJwt();
    const response = await this.request<InstallationTokenResponse>(
      `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      { method: "POST", headers: { Authorization: `Bearer ${jwt}` } },
    );
    if (!response.token) throw new ProviderError("GitHub returned no installation token", "GITHUB_API", true, 502, "GitHub returned an invalid token response");
    return response.token;
  }

  async installationDetails(installationId: string): Promise<InstallationDetails> {
    const jwt = await this.createAppJwt();
    const installation = await this.request<InstallationResponse>(`/app/installations/${encodeURIComponent(installationId)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!installation.account) {
      throw new ProviderError("GitHub installation account missing", "GITHUB_API", false, 422, "GitHub returned an incomplete installation");
    }
    const token = await this.installationToken(installationId);
    const allRepositories: InstallationRepositoriesResponse["repositories"] = [];
    for (let page = 1; ; page += 1) {
      const response = await this.request<InstallationRepositoriesResponse>(`/installation/repositories?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      allRepositories.push(...response.repositories);
      if (response.repositories.length < 100) break;
      if (page >= 100) throw new ProviderError("GitHub installation pagination exceeded safety limit", "GITHUB_API", false, 422, "Installation contains too many repositories to synchronize");
    }
    return {
      installationId,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      repositories: allRepositories.map((repository) => ({
        githubId: String(repository.id),
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
      })),
    };
  }

  async verifyUserInstallation(userToken: string, installationId: string): Promise<void> {
    // GitHub does not expose GET /user/installations/{id}. Enumerate the
    // installations accessible to this user token and compare immutable IDs.
    for (let page = 1; page <= 100; page += 1) {
      const response = await this.request<UserInstallationsResponse>(`/user/installations?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (response.installations.some((installation) => String(installation.id) === installationId)) return;
      if (response.installations.length < 100) break;
    }
    throw new ProviderError(
      "GitHub user token cannot access the requested installation",
      "GITHUB_API",
      false,
      403,
      "The installation is not available to the signed-in GitHub user",
    );
  }

  async addLabel(installationId: string, owner: string, repository: string, issueNumber: number, label: string): Promise<void> {
    const token = await this.installationToken(installationId);
    await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}/labels`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ labels: [label] }),
    });
  }

  async postComment(
    installationId: string,
    owner: string,
    repository: string,
    issueNumber: number,
    body: string,
    idempotencyMarker: string,
  ): Promise<{ duplicate: boolean }> {
    const token = await this.installationToken(installationId);
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}/comments`;
    const existing = await this.request<Array<{ body: string | null }>>(`${path}?per_page=100&sort=created&direction=desc`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (existing.some((comment) => comment.body?.includes(idempotencyMarker))) return { duplicate: true };
    await this.request(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: `${body}\n\n<!-- ${idempotencyMarker} -->` }),
    });
    return { duplicate: false };
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${API_ROOT}${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "github-event-automator",
          "X-GitHub-Api-Version": API_VERSION,
          ...init.headers,
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new ProviderError(String(error), "GITHUB_API", true, 503, "GitHub could not be reached");
    }
    if (!response.ok) {
      const raw = await response.text();
      const retryable = response.status === 429 || response.status >= 500 ||
        (response.status === 403 && (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0"));
      throw new ProviderError(
        `GitHub ${response.status}: ${sanitizeProviderMessage(raw)}`,
        "GITHUB_API",
        retryable,
        response.status,
        retryable ? `GitHub temporarily failed (${response.status})` : `GitHub rejected the operation (${response.status})`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
