import { google } from "googleapis";

export function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

export async function createDoc(accessToken: string, name: string, content: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.document",
    },
    media: {
      mimeType: "text/plain",
      body: content,
    },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

export async function listFiles(accessToken: string, query?: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: query,
    fields: "files(id, name, mimeType, modifiedTime, parents)",
    orderBy: "modifiedTime desc",
    pageSize: 20,
  });
  return res.data.files ?? [];
}
