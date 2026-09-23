/**
 * Google Apps Script — paste this into script.google.com (bound to your
 * Google Sheet, or standalone), then deploy as a Web App.
 * See README.md for the exact steps.
 */

const SHEET_NAME = "Responses";

function doPost(e) {
  const sheet = getOrCreateSheet();
  const data = JSON.parse(e.postData.contents);

  const answers = data.answers || {};
  // Union of all possible question ids, in a stable order, so columns line up.
  const questionIds = [
    "q1", "q2", "q2_other", "q3", "q4", "q5",
    "q6", "q7", "q8", "q9", "q10", "q11", "q12"
  ];

  ensureHeader(sheet, questionIds);

  const row = [
    new Date(),                 // server receipt time
    data.participantId || "",
    data.date || "",
    data.occasion || "",
    data.timestamp || "",
    ...questionIds.map((id) => (answers[id] !== undefined ? answers[id] : ""))
  ];

  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeader(sheet, questionIds) {
  if (sheet.getLastRow() === 0) {
    const header = [
      "received_at", "participant_id", "date", "occasion", "submitted_at",
      ...questionIds
    ];
    sheet.appendRow(header);
  }
}
