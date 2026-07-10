import { afterEach, describe, expect, it } from "vitest";
import { config } from "../config";
import { checkUrl, isSameDomain, removeDuplicateUrls } from "./validateUrl";
import { isSameSubdomain } from "./validateUrl";

describe("isSameDomain", () => {
  it("should return true for a subdomain", () => {
    const result = isSameDomain("http://sub.example.com", "http://example.com");
    expect(result).toBe(true);
  });

  it("should return true for the same domain", () => {
    const result = isSameDomain("http://example.com", "http://example.com");
    expect(result).toBe(true);
  });

  it("should return false for different domains", () => {
    const result = isSameDomain("http://example.com", "http://another.com");
    expect(result).toBe(false);
  });

  it("should return true for a subdomain with different protocols", () => {
    const result = isSameDomain(
      "https://sub.example.com",
      "http://example.com",
    );
    expect(result).toBe(true);
  });

  it("should return false for invalid URLs", () => {
    const result = isSameDomain("invalid-url", "http://example.com");
    expect(result).toBe(false);
    const result2 = isSameDomain("http://example.com", "invalid-url");
    expect(result2).toBe(false);
  });

  it("should return true for a subdomain with www prefix", () => {
    const result = isSameDomain(
      "http://www.sub.example.com",
      "http://example.com",
    );
    expect(result).toBe(true);
  });

  it("should return true for the same domain with www prefix", () => {
    const result = isSameDomain(
      "http://docs.s.s.example.com",
      "http://example.com",
    );
    expect(result).toBe(true);
  });
});

describe("isSameSubdomain", () => {
  it("should return false for a subdomain", () => {
    const result = isSameSubdomain(
      "http://example.com",
      "http://docs.example.com",
    );
    expect(result).toBe(false);
  });

  it("should return true for the same subdomain", () => {
    const result = isSameSubdomain(
      "http://docs.example.com",
      "http://docs.example.com",
    );
    expect(result).toBe(true);
  });

  it("should return false for different subdomains", () => {
    const result = isSameSubdomain(
      "http://docs.example.com",
      "http://blog.example.com",
    );
    expect(result).toBe(false);
  });

  it("should return false for different domains", () => {
    const result = isSameSubdomain("http://example.com", "http://another.com");
    expect(result).toBe(false);
  });

  it("should return false for invalid URLs", () => {
    const result = isSameSubdomain("invalid-url", "http://example.com");
    expect(result).toBe(false);
    const result2 = isSameSubdomain("http://example.com", "invalid-url");
    expect(result2).toBe(false);
  });

  it("should return true for the same subdomain with different protocols", () => {
    const result = isSameSubdomain(
      "https://docs.example.com",
      "http://docs.example.com",
    );
    expect(result).toBe(true);
  });

  it("should return true for the same subdomain with www prefix", () => {
    const result = isSameSubdomain(
      "http://www.docs.example.com",
      "http://docs.example.com",
    );
    expect(result).toBe(true);
  });

  it("should return false for a subdomain with www prefix and different subdomain", () => {
    const result = isSameSubdomain(
      "http://www.docs.example.com",
      "http://blog.example.com",
    );
    expect(result).toBe(false);
  });
});

describe("removeDuplicateUrls", () => {
  it("should remove duplicate URLs with different protocols", () => {
    const urls = [
      "http://example.com",
      "https://example.com",
      "http://www.example.com",
      "https://www.example.com",
    ];
    const result = removeDuplicateUrls(urls);
    expect(result).toEqual(["https://example.com"]);
  });

  it("should keep URLs with different paths", () => {
    const urls = [
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page1?param=1",
      "https://example.com/page1#section1",
    ];
    const result = removeDuplicateUrls(urls);
    expect(result).toEqual([
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page1?param=1",
      "https://example.com/page1#section1",
    ]);
  });

  it("should prefer https over http", () => {
    const urls = ["http://example.com", "https://example.com"];
    const result = removeDuplicateUrls(urls);
    expect(result).toEqual(["https://example.com"]);
  });

  it("should prefer non-www over www", () => {
    const urls = ["https://www.example.com", "https://example.com"];
    const result = removeDuplicateUrls(urls);
    expect(result).toEqual(["https://example.com"]);
  });

  it("should handle empty input", () => {
    const urls: string[] = [];
    const result = removeDuplicateUrls(urls);
    expect(result).toEqual([]);
  });

  it("should handle URLs with different cases", () => {
    const urls = ["https://EXAMPLE.com", "https://example.com"];
    const result = removeDuplicateUrls(urls);
    expect(result).toEqual(["https://EXAMPLE.com"]);
  });

  it("should handle URLs with trailing slashes", () => {
    const urls = ["https://example.com", "https://example.com/"];
    const result = removeDuplicateUrls(urls);
    expect(result).toEqual(["https://example.com"]);
  });
});

describe("checkUrl public target safety", () => {
  const originalAllowLocal = config.ALLOW_LOCAL_WEBHOOKS;
  const originalSelfHosted = config.TEST_SUITE_SELF_HOSTED;

  afterEach(() => {
    config.ALLOW_LOCAL_WEBHOOKS = originalAllowLocal;
    config.TEST_SUITE_SELF_HOSTED = originalSelfHosted;
  });

  it("rejects credentials, loopback, private, metadata, and translated private literals", () => {
    const unsafe = [
      "https://user:pass@example.com",
      "http://127.0.0.1",
      "http://localhost",
      "http://10.0.0.1",
      "http://169.254.169.254/latest/meta-data",
      "http://[::ffff:127.0.0.1]",
      "http://[2002:7f00:0001::1]",
      "http://[64:ff9b::7f00:1]",
      "http://metadata.google.internal",
    ];

    for (const url of unsafe) {
      expect(() => checkUrl(url), url).toThrow(/Invalid URL/);
    }
  });

  it("keeps safe public URLs and preserves explicit self-hosted local allowance", () => {
    expect(checkUrl("https://example.com/path")).toBe(
      "https://example.com/path",
    );

    config.ALLOW_LOCAL_WEBHOOKS = true;
    config.TEST_SUITE_SELF_HOSTED = true;
    expect(checkUrl("http://127.0.0.1:3000/path")).toBe(
      "http://127.0.0.1:3000/path",
    );
  });
});
