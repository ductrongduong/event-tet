import "@/config";

import { program } from "commander";

import * as o from "drizzle-orm";
import { User, ROLES } from "@/tables/admin";
import { create, destroy } from "@/clients/mysql";

type RoleName = keyof typeof ROLES;

async function main(email: string, options: { role: RoleName }) {
  try {
    create();

    let role = ROLES[options.role.toUpperCase() as RoleName];

    if (!Number.isInteger(role)) {
      throw Error("InvalidRole");
    }

    let user = await tableHelper.load(User, email, "email");

    if (user) {
      await db.update(User).set({ role }).where(o.eq(User.id, user.id));
    } else {
      await db.insert(User).values({ email, role });
    }

    console.info("Create account %s success", email);
  } catch (err) {
    console.error(err);
  } finally {
    await destroy();
    process.exit();
  }
}

program.argument("<email>", "Super admin email").option("-r, --role <role>", "Email role", "SUPER").action(main).parse();
