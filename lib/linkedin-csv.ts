/**
 * Parser for the `Connections.csv` inside a LinkedIn data export. LinkedIn puts
 * a few "Notes:" preamble lines above the real header, quotes any field that
 * contains a comma, and frequently omits the email address. We locate the
 * header, map columns by name (so column order can shift), and return
 * normalised rows. Pure and side-effect free, so it can be unit-tested and
 * imported into a server action.
 */

export type LinkedinRow = {
  first: string;
  last: string | null;
  company: string | null;
  role: string | null;
  email: string | null;
  linkedinUrl: string | null;
};

/** Split one CSV line, honouring double-quoted fields and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Canonical form of a LinkedIn profile URL, for dedupe/matching. */
export function normalizeLinkedin(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

/** Parse the text of a LinkedIn `Connections.csv` into contact rows. */
export function parseLinkedinCsv(text: string): LinkedinRow[] {
  const lines = text.split(/\r?\n/);

  // LinkedIn prepends a "Notes:" preamble; find the real header row.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (low.includes("first name") && low.includes("last name")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = splitCsvLine(lines[headerIdx]).map((h) => h.trim().toLowerCase());
  const iFirst = header.indexOf("first name");
  const iLast = header.indexOf("last name");
  const iEmail = header.indexOf("email address");
  const iCompany = header.indexOf("company");
  const iRole = header.indexOf("position");
  const iUrl = header.findIndex((h) => h === "url" || h.includes("profile"));

  const rows: LinkedinRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = splitCsvLine(lines[i]);
    const at = (j: number) => (j >= 0 && j < f.length ? f[j].trim() : "");

    const first = at(iFirst);
    const last = at(iLast);
    const email = at(iEmail).toLowerCase() || null;
    const url = at(iUrl) || null;
    if (!first && !last && !email && !url) continue;

    rows.push({
      first: first || (email ? email.split("@")[0] : last) || "",
      last: last || null,
      company: at(iCompany) || null,
      role: at(iRole) || null,
      email,
      linkedinUrl: url,
    });
  }
  return rows;
}
