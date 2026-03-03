import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const match = /^([^#=]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import * as cheerio from "cheerio";
import { signIn, clearSession } from "../lib/mylife";

const BASE_URL = "https://mylife-software.net";
const DASHBOARD_PATH = "/Pages/Dashboard.aspx";
const LOGBOOK_PATH = "/Pages/Filterable/Logbook.aspx?ItemValue=logbook";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

/**
 * Collect ALL form fields from an ASP.NET page.
 * Matches what the browser serializes on form submit.
 */
function collectFormFields($: cheerio.CheerioAPI): URLSearchParams {
  const body = new URLSearchParams();

  $("form input").each((_i, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    const type = ($(el).attr("type") ?? "text").toLowerCase();
    if (type === "submit" || type === "button" || type === "image") return;
    if (type === "checkbox" || type === "radio") {
      if ($(el).is(":checked")) {
        body.append(name, ($(el).val() as string) ?? "on");
      }
      return;
    }
    body.set(name, ($(el).val() as string) ?? "");
  });

  $("form select").each((_i, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    body.set(name, ($(el).val() as string) ?? "");
  });

  $("form textarea").each((_i, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    body.set(name, $(el).text());
  });

  return body;
}

function parseDeltaResponse(
  text: string,
): { type: string; id: string; content: string }[] {
  const records: { type: string; id: string; content: string }[] = [];
  let pos = 0;

  while (pos < text.length) {
    const pipeAfterLen = text.indexOf("|", pos);
    if (pipeAfterLen < 0) break;
    const len = parseInt(text.substring(pos, pipeAfterLen), 10);
    if (isNaN(len)) break;
    pos = pipeAfterLen + 1;

    const pipeAfterType = text.indexOf("|", pos);
    if (pipeAfterType < 0) break;
    const type = text.substring(pos, pipeAfterType);
    pos = pipeAfterType + 1;

    const pipeAfterId = text.indexOf("|", pos);
    if (pipeAfterId < 0) break;
    const id = text.substring(pos, pipeAfterId);
    pos = pipeAfterId + 1;

    const content = text.substring(pos, pos + len);
    pos += len;

    if (pos < text.length && text[pos] === "|") pos++;

    records.push({ type, id, content });
  }

  return records;
}

async function main() {
  const email = process.env.MYLIFE_EMAIL!;
  const password = process.env.MYLIFE_PASSWORD!;

  clearSession(email);
  const session = await signIn(email, password);

  const logbookUrl = `${BASE_URL}${LOGBOOK_PATH}`;
  const getRes = await fetch(logbookUrl, {
    headers: {
      Cookie: session.cookies,
      Referer: `${BASE_URL}${DASHBOARD_PATH}`,
      "User-Agent": USER_AGENT,
    },
  });
  const html = await getRes.text();
  const $page = cheerio.load(html);

  const initialRows = $page("tr.rgRow, tr.rgAltRow").length;
  console.log("[Probe] Initial rows:", initialRows);

  // Collect ALL form fields
  const body = collectFormFields($page);

  // --- Key fields from Playwright capture ---
  // 1. ScriptManager field: ctl00$stmMainScriptManager (NOT stmMainScriptManager)
  //    Value: ctl00$ramAjaxManagerSU|ctl00$ramAjaxManager
  body.set("ctl00$stmMainScriptManager", "ctl00$ramAjaxManagerSU|ctl00$ramAjaxManager");

  // 2. RadAJAXControlID (Telerik-specific, identifies the ajax manager)
  body.set("RadAJAXControlID", "ctl00_ramAjaxManager");

  // 3. Standard postback fields
  body.set("__EVENTTARGET", "ctl00$ramAjaxManager");
  body.set("__EVENTARGUMENT", JSON.stringify({
    option: "event_type_filter",
    task: "toggle_all_event_types",
    id: 0,
  }));
  body.set("__ASYNCPOST", "true");

  // Remove incorrect field name if present
  body.delete("stmMainScriptManager");

  console.log("[Probe] POST body size:", body.toString().length, "bytes");

  const postRes = await fetch(logbookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: session.cookies,
      Referer: logbookUrl,
      Origin: BASE_URL,
      "User-Agent": USER_AGENT,
      "X-MicrosoftAjax": "Delta=true",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });

  const postText = await postRes.text();
  console.log("[Probe] Status:", postRes.status, "| Length:", postText.length);

  if (postText.includes("pageRedirect")) {
    console.log("[Probe] FAILED — pageRedirect:", postText.substring(0, 200));
    return;
  }

  // Parse the delta response
  const records = parseDeltaResponse(postText);
  console.log("[Probe] Delta records:", records.length);

  // Find the grid panel
  const gridPanel = records.find(
    (r) => r.type === "updatePanel" && r.content.includes("rgRow"),
  );

  if (gridPanel) {
    const $grid = cheerio.load(gridPanel.content);
    const rows = $grid("tr.rgRow, tr.rgAltRow").length;
    console.log("[Probe] Rows after toggle:", rows);

    const types: Record<string, number> = {};
    $grid("tr.rgRow, tr.rgAltRow").each((_i, row) => {
      const type = $grid(row).find(".event-type-title").text().trim();
      if (type) types[type] = (types[type] || 0) + 1;
    });
    console.log("[Probe] Event types:", types);
    console.log("[Probe] SUCCESS — Boost:", (types["Boost"] ?? 0), "Ease-off:", (types["Ease-off"] ?? 0));
  } else {
    console.log("[Probe] No grid panel in response");
    for (const r of records) {
      console.log(`  ${r.type} | ${r.id} | ${r.content.length} chars`);
    }
  }
}

main().catch(console.error);
