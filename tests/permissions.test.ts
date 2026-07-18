import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB layer so guard logic can be tested without a database.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    actMembership: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  AuthorizationError,
  getEffectiveActRole,
  isActMember,
  requireActRole,
  requireCapability,
  requireSuperadmin,
  type SessionUser,
} from "@/lib/permissions";

const findUnique = prisma.actMembership.findUnique as unknown as ReturnType<
  typeof vi.fn
>;

const superadmin: SessionUser = { id: "sa", globalRole: "SUPERADMIN" };
const normal: SessionUser = { id: "u1", globalRole: "USER" };
const ACT = "act1";

beforeEach(() => {
  findUnique.mockReset();
});

describe("getEffectiveActRole", () => {
  it("treats superadmins as ADMIN everywhere without a DB lookup", async () => {
    expect(await getEffectiveActRole(superadmin, ACT)).toBe("ADMIN");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns the membership role for normal users", async () => {
    findUnique.mockResolvedValue({ role: "MEMBER" });
    expect(await getEffectiveActRole(normal, ACT)).toBe("MEMBER");
  });

  it("returns null when the user has no membership", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getEffectiveActRole(normal, ACT)).toBeNull();
  });
});

describe("requireActRole / requireCapability", () => {
  it("rejects a READONLY user from writing songs (acceptance §13.3)", async () => {
    findUnique.mockResolvedValue({ role: "READONLY" });
    await expect(requireCapability(normal, ACT, "song:write")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("rejects a MEMBER from managing members", async () => {
    findUnique.mockResolvedValue({ role: "MEMBER" });
    await expect(
      requireCapability(normal, ACT, "act:manageMembers"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("allows a MEMBER to write songs", async () => {
    findUnique.mockResolvedValue({ role: "MEMBER" });
    await expect(requireCapability(normal, ACT, "song:write")).resolves.toBe("MEMBER");
  });

  it("allows a READONLY user to set their own attendance", async () => {
    findUnique.mockResolvedValue({ role: "READONLY" });
    await expect(
      requireCapability(normal, ACT, "attendance:setOwn"),
    ).resolves.toBe("READONLY");
  });

  it("rejects a READONLY user from managing bookings (acceptance §17.7-12)", async () => {
    findUnique.mockResolvedValue({ role: "READONLY" });
    await expect(
      requireCapability(normal, ACT, "booking:manage"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("allows a READONLY user to respond to bookings", async () => {
    findUnique.mockResolvedValue({ role: "READONLY" });
    await expect(
      requireCapability(normal, ACT, "booking:respond"),
    ).resolves.toBe("READONLY");
  });

  it("rejects a non-member entirely", async () => {
    findUnique.mockResolvedValue(null);
    await expect(requireActRole(normal, ACT, "READONLY")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("lets a superadmin do anything", async () => {
    await expect(requireCapability(superadmin, ACT, "act:edit")).resolves.toBe("ADMIN");
  });
});

describe("requireSuperadmin", () => {
  it("throws for non-superadmins", () => {
    expect(() => requireSuperadmin(normal)).toThrow(AuthorizationError);
  });
  it("passes for superadmins", () => {
    expect(() => requireSuperadmin(superadmin)).not.toThrow();
  });
});

describe("isActMember", () => {
  it("is true for a member and false otherwise", async () => {
    findUnique.mockResolvedValue({ role: "READONLY" });
    expect(await isActMember(normal, ACT)).toBe(true);
    findUnique.mockResolvedValue(null);
    expect(await isActMember(normal, ACT)).toBe(false);
  });
});
