import { describe, expect, it } from "vitest";
import { recoveryForwardUrl } from "./recovery";

const at = (path: string) => new URL(path, "https://app.example.com");

describe("recoveryForwardUrl", () => {
  it("forwards a stray reset code on the home page", () => {
    expect(recoveryForwardUrl(at("/?code=abc123"))?.toString()).toBe(
      "https://app.example.com/auth/reset?code=abc123",
    );
  });

  it("forwards a stray token_hash on /login", () => {
    expect(recoveryForwardUrl(at("/login?token_hash=xyz"))?.toString()).toBe(
      "https://app.example.com/auth/reset?token_hash=xyz",
    );
  });

  it("carries over only the one-time parameters", () => {
    const dest = recoveryForwardUrl(at("/?code=abc&next=//evil.com&x=1"));
    expect(dest?.search).toBe("?code=abc");
  });

  it("always stays on the same site", () => {
    const dest = recoveryForwardUrl(at("/?code=abc"));
    expect(dest?.origin).toBe("https://app.example.com");
  });

  it("ignores normal requests and other pages", () => {
    expect(recoveryForwardUrl(at("/"))).toBeNull();
    expect(recoveryForwardUrl(at("/login"))).toBeNull();
    expect(recoveryForwardUrl(at("/login?reset=invalid"))).toBeNull();
    expect(recoveryForwardUrl(at("/dashboard?code=abc"))).toBeNull();
    expect(recoveryForwardUrl(at("/auth/reset?code=abc"))).toBeNull();
  });
});
