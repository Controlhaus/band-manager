import { describe, expect, it } from "vitest";
import { can, roleAtLeast, higherRole } from "@/lib/roles";
import type { ActRole } from "@prisma/client";
import type { Capability } from "@/lib/roles";

/**
 * Covers the §4 capability matrix for every act role. This is the single
 * source of truth for MEMBER permissions, so it is exercised exhaustively.
 */

const ROLES: ActRole[] = ["READONLY", "MEMBER", "ADMIN"];

// Expected can(role, capability) per §4.
const EXPECTED: Record<Capability, Record<ActRole, boolean>> = {
  view: { READONLY: true, MEMBER: true, ADMIN: true },
  "attendance:setOwn": { READONLY: true, MEMBER: true, ADMIN: true },
  "song:trackOwn": { READONLY: true, MEMBER: true, ADMIN: true },
  "song:write": { READONLY: false, MEMBER: true, ADMIN: true },
  "calendar:write": { READONLY: false, MEMBER: true, ADMIN: true },
  "entry:addNotes": { READONLY: false, MEMBER: true, ADMIN: true },
  "act:edit": { READONLY: false, MEMBER: false, ADMIN: true },
  "act:manageMembers": { READONLY: false, MEMBER: false, ADMIN: true },
  "booking:manage": { READONLY: false, MEMBER: true, ADMIN: true },
  "booking:respond": { READONLY: true, MEMBER: true, ADMIN: true },
};

describe("capability matrix (§4)", () => {
  for (const capability of Object.keys(EXPECTED) as Capability[]) {
    for (const role of ROLES) {
      it(`${role} ${EXPECTED[capability][role] ? "can" : "cannot"} ${capability}`, () => {
        expect(can(role, capability)).toBe(EXPECTED[capability][role]);
      });
    }
  }
});

describe("role ordering", () => {
  it("ranks ADMIN > MEMBER > READONLY", () => {
    expect(roleAtLeast("ADMIN", "MEMBER")).toBe(true);
    expect(roleAtLeast("MEMBER", "ADMIN")).toBe(false);
    expect(roleAtLeast("READONLY", "READONLY")).toBe(true);
  });

  it("higherRole picks the greater role", () => {
    expect(higherRole("MEMBER", "ADMIN")).toBe("ADMIN");
    expect(higherRole("READONLY", "MEMBER")).toBe("MEMBER");
    expect(higherRole("ADMIN", "ADMIN")).toBe("ADMIN");
  });
});
