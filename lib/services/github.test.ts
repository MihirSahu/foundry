import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("createRepository", () => {
  it("creates a repo, updates existing files, creates new files, and opens issues", async () => {
    const { createRepository } = await import("./github");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);

      if (target.endsWith("/user/repos")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer gho_test",
        });
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: "foundry",
          private: true,
          auto_init: true,
        });

        return jsonResponse({
          id: 123,
          name: "foundry",
          html_url: "https://github.com/mihir/foundry",
          default_branch: "main",
          owner: { login: "mihir" },
        });
      }

      if (target.includes("/contents/README.md?")) {
        return jsonResponse({ sha: "existing-readme" });
      }

      if (target.includes("/contents/docs/roadmap.md?")) {
        return jsonResponse({ message: "Not Found" }, 404);
      }

      if (target.endsWith("/contents/README.md")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          message: "Update README.md",
          branch: "main",
          sha: "existing-readme",
        });

        return jsonResponse({ content: { path: "README.md" } });
      }

      if (target.endsWith("/contents/docs/roadmap.md")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          message: "Add docs/roadmap.md",
          branch: "main",
        });
        expect(body.sha).toBeUndefined();

        return jsonResponse({ content: { path: "docs/roadmap.md" } });
      }

      if (target.endsWith("/issues")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          title: "First issue",
        });

        return jsonResponse({ number: 1 });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const repo = await createRepository({
      token: "gho_test",
      name: "foundry",
      description: "Idea to repo.",
      visibility: "private",
      files: [
        { path: "README.md", content: "# Foundry" },
        { path: "docs/roadmap.md", content: "# Roadmap" },
      ],
      issues: [{ title: "First issue", body: "Do the work." }],
    });

    expect(repo).toMatchObject({
      id: 123,
      owner: "mihir",
      name: "foundry",
      url: "https://github.com/mihir/foundry",
      defaultBranch: "main",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-RateLimit-Remaining": "100",
    },
  });
}
