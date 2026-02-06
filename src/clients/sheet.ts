import { JwtAuth, type Auth } from "@grn/google/auth";
import { GoogleSpreadsheet } from "@grn/google/sheets";

declare global {
  var getProjectSpreadsheet: () => ReturnType<typeof getDocument>;
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

async function getDocument(paramKey: string = "projectSpreadsheet", auth: Auth) {
  const { getParam } = await import("@/models/param");

  const uri = await getParam(paramKey, {
    type: "string",
    private: true,
    value: "https://docs.google.com/spreadsheets/d/spreadsheet_id_abcdefgh/edit",
  });

  const spreadsheetId = GoogleSpreadsheet.getSpreadsheetId(uri);

  const spreadsheet = new GoogleSpreadsheet(spreadsheetId, auth);

  await spreadsheet.loadInfo();

  return spreadsheet;
}

export async function create() {
  const email = process.env.GOOGLE_SERVICE_EMAIL;

  if (!!email) {
    const account = new JwtAuth(email, process.env.GOOGLE_SERVICE_SECRET!, SCOPES);
    globalThis.getProjectSpreadsheet = getDocument.bind(null, undefined, account);
  }
}

export async function destroy() {}
