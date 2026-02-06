import lodash from "lodash";
import { DateTime } from "luxon";
import httpError from "http-errors";
import { memo, lazy } from "@grn/decorators";

import DataLoader from "dataloader";

import * as o from "drizzle-orm";

import type { RequiredDeep } from "type-fest";

import { Model } from "@grn/drizzle";
import { User } from "@/tables/user";

export class UserModel extends Model(User) {
  isTest() {
    return this.platform === 111;
  }

  /** check the uid and region is valid */
  validate() {
    if (this.isTest()) {
      return false;
    }

    if (!this.uid) {
      throw httpError.BadRequest("UidEmpty");
    }

    return true;
  }
}
