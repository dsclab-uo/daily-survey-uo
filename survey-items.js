// ============================================================
// survey-items.js — the daily survey, from the uploaded document.
// Skip logic: if Q1 = "No", jump straight to Q6.
// ============================================================
const SURVEY_ITEMS = [
  {
    id: "q1",
    type: "single_choice",
    text: "Have you engaged in any activity or event today so far that mentioned race/ethnicity?",
    options: ["Yes", "No"],
    skipTo: { "No": "q6" }
  },
  {
    id: "q2",
    type: "single_choice",
    text: "What kind of event/activity was it?",
    options: [
      "A class",
      "A student-run event",
      "A university-sponsored event",
      "A community event",
      "Other (please specify)"
    ],
    otherText: "Other (please specify)"
  },
  {
    id: "q3",
    type: "open_text",
    text: "Please provide a brief description of the event/activity."
  },
  {
    id: "q4",
    type: "scale_1_7",
    text: "What was the quality of the event?",
    lowLabel: "1 (extremely low quality)",
    highLabel: "7 (extremely high quality)"
  },
  {
    id: "q5",
    type: "scale_1_7",
    text: "How positive do you feel after participating in the event/activity?",
    lowLabel: "1 (not at all positive)",
    highLabel: "7 (extremely positive)"
  },
  {
    id: "q6",
    type: "scale_1_7",
    text: "Others at this university value my opinions because of my social identity.",
    lowLabel: "1 (strongly disagree)",
    highLabel: "7 (strongly agree)"
  },
  {
    id: "q7",
    type: "scale_1_7",
    text: "This university is a place for people like me.",
    lowLabel: "1 (strongly disagree)",
    highLabel: "7 (strongly agree)"
  },
  {
    id: "q8",
    type: "scale_1_7",
    text: "I can succeed at my academic goal.",
    lowLabel: "1 (strongly disagree)",
    highLabel: "7 (strongly agree)"
  },
  {
    id: "q9",
    type: "scale_1_7",
    text: "How certain are you that you will earn a college degree?",
    lowLabel: "1 (strongly disagree)",
    highLabel: "7 (strongly agree)"
  },
  {
    id: "q10",
    type: "scale_1_7",
    text: "How confident are you that this is the right university?",
    lowLabel: "1 (strongly disagree)",
    highLabel: "7 (strongly agree)"
  },
  {
    id: "q11",
    type: "single_choice",
    text: "Have you been absent from any of your classes today so far?",
    options: ["Yes", "No"]
  },
  {
    id: "q12",
    type: "single_choice",
    text: "Have you missed or submitted any assignments late today so far?",
    options: ["Yes", "No"]
  }
];
