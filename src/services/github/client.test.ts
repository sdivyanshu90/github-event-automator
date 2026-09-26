import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "@/services/github/client";

describe("GitHub action adapter", () => {
  it("verifies an installation against the signed-in GitHub user token", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ installations: [{ id: 10 }] }), { status: 200 });
    });
    const client = new GitHubClient(fetcher as typeof fetch);
    await client.verifyUserInstallation("user-token", "10");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/user/installations?per_page=100&page=1");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer user-token" });
  });

  it("rejects an installation that is not available to the signed-in user", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ installations: [{ id: 11 }] }), { status: 200 }));
    const client = new GitHubClient(fetcher as typeof fetch);
    await expect(client.verifyUserInstallation("user-token", "10")).rejects.toMatchObject({
      code: "GITHUB_API",
      retryable: false,
      status: 403,
    });
  });

  it("uses installation authentication and the issue labels endpoint", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify([{ name: "bug" }]), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = new GitHubClient(fetcher as typeof fetch);
    vi.spyOn(client, "installationToken").mockResolvedValue("installation-token");
    await client.addLabel("10", "acme", "project", 42, "bug");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/acme/project/issues/42/labels");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ labels: ["bug"] });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer installation-token" });
  });

  it("does not post a duplicate marked comment", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ body: "done <!-- marker -->" }]), { status: 200 }));
    const client = new GitHubClient(fetcher as typeof fetch);
    vi.spyOn(client, "installationToken").mockResolvedValue("token");
    await expect(client.postComment("10", "acme", "project", 1, "hello", "marker")).resolves.toEqual({ duplicate: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("classifies a GitHub 502 as retryable", async () => {
    const client = new GitHubClient(vi.fn(async () => new Response("bad gateway", { status: 502 })) as typeof fetch);
    vi.spyOn(client, "installationToken").mockResolvedValue("token");
    await expect(client.addLabel("10", "acme", "project", 1, "bug")).rejects.toMatchObject({ retryable: true, status: 502 });
  });
});
