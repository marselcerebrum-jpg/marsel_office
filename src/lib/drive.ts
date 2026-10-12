import "server-only";
import crypto from "node:crypto";

/**
 * Simpan hasil ke Google Drive memakai service account.
 * Env: GOOGLE_SERVICE_ACCOUNT_JSON (isi file JSON, mentah atau base64) dan
 * GOOGLE_DRIVE_FOLDER_ID (folder di Shared Drive yang sudah dibagikan ke email service account).
 */
type ServiceAccount = { client_email: string; private_key: string };

function account(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw || !process.env.GOOGLE_DRIVE_FOLDER_ID) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as ServiceAccount;
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

export const driveEnabled = () => account() !== null;

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = account();
  if (!sa) throw new Error("Google Drive belum dikonfigurasi");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!data.access_token) throw new Error(`Gagal masuk ke Google: ${data.error_description ?? res.status}`);
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Unggah file; `convertTo` mengubahnya jadi Google Docs/Sheets. Mengembalikan tautan file. */
export async function uploadToDrive(opts: {
  name: string;
  data: string | Buffer;
  mime: string;
  convertTo?: "document" | "spreadsheet";
}): Promise<string> {
  const token = await accessToken();
  const boundary = `agentdesk${crypto.randomBytes(8).toString("hex")}`;
  const metadata = {
    name: opts.name,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    ...(opts.convertTo ? { mimeType: `application/vnd.google-apps.${opts.convertTo}` } : {}),
  };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${opts.mime}\r\n\r\n`),
    typeof opts.data === "string" ? Buffer.from(opts.data, "utf8") : opts.data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = (await res.json()) as { webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !data.webViewLink) throw new Error(`Gagal mengunggah ke Drive: ${data.error?.message ?? res.status}`);
  return data.webViewLink;
}
