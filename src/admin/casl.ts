import moize from "moize";
import lodash from "lodash";
import { fmemo } from "@grn/decorators";
import { PureAbility, AbilityClass, RawRuleOf } from "@casl/ability";

import { User, Group, ROLES } from "@/tables/admin";

type UserAbility = PureAbility<[string, string]>;
const UserAbility = PureAbility as AbilityClass<UserAbility>;

type Rules = RawRuleOf<UserAbility>[];

const defaultRules: Rules = [
  { subject: "admin_Log", action: ["create", "update", "delete", "import"], inverted: true }, // DEFAULT_ROLES
];

const getRoleRules = (role: number): Rules => {
  switch (role) {
    case ROLES.LOCK:
      return [{ subject: "all", action: "manage", inverted: true }];

    case ROLES.GUEST:
      return [];

    case ROLES.STAFF:
      return [
        { subject: "all", action: "read" },
        { subject: ["admin_User", "admin_Group", "admin_Log"], action: "read", inverted: true },
      ];

    case ROLES.ADMIN:
      return [
        { subject: "all", action: "manage" },
        { subject: "admin_User", action: ["create", "update", "delete"], inverted: true },
        { subject: "admin_Group", action: ["create", "update", "delete"], inverted: true },
      ];

    case ROLES.SUPER:
      return [{ subject: "all", action: "manage" }];

    default:
      throw Error("InvalidRole");
  }
};

export const getUserRules = fmemo(
  async (userId: number) => {
    const user = await tableHelper.load(User, userId);

    if (!user) {
      throw Error("UserNotFound");
    }

    let rules: Rules = [];

    if (user.groupIds?.length! > 0) {
      const groups = await tableHelper.loadMany(Group, user.groupIds!);
      rules = groups
        .filter((group) => !!group)
        .map((group) => group.rules ?? [])
        .flat();
    }

    return lodash.concat(rules, getRoleRules(user.role), defaultRules);
  },
  { maxAge: 10e3, maxSize: 128, isPromise: true }
);

export const getUserCasl = moize(
  async (userId: number) => {
    const rules = await getUserRules(userId);
    return new UserAbility(rules);
  },
  { maxAge: 10e3, maxSize: 128, isPromise: true }
);
