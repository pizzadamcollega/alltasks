import { describe, expect, it } from "vitest";
import { suggestUsername, usernameSchema } from "@/lib/validation/username";

describe("suggestUsername", () => {
  it("folds Turkish characters and lowercases", () => {
    expect(suggestUsername("Şevval Öztürk")).toBe("sevval.ozturk");
    expect(suggestUsername("Ahmet Yılmaz")).toBe("ahmet.yilmaz");
    expect(suggestUsername("İpek Çelik")).toBe("ipek.celik");
  });
});

describe("usernameSchema", () => {
  it("accepts valid usernames, including the 3-char minimum", () => {
    expect(usernameSchema.safeParse("ahmet.yilmaz").success).toBe(true);
    expect(usernameSchema.safeParse("can").success).toBe(true);
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects usernames starting with a separator", () => {
    expect(usernameSchema.safeParse(".ahmet").success).toBe(false);
  });

  it("rejects uppercase or non-ascii characters", () => {
    expect(usernameSchema.safeParse("Ahmet.Yilmaz").success).toBe(false);
    expect(usernameSchema.safeParse("ahmet.şilmaz").success).toBe(false);
  });
});
