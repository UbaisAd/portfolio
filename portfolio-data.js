/* =========================================================================
   portfolio-data.js
   Single source of truth for every piece of portfolio content.
   Nothing in the UI hard-codes copy — components read from here.
   ========================================================================= */
(function (global) {
  "use strict";

  var LINKS = {
    github: "https://github.com/UbaisAd",
    linkedin: "https://linkedin.com/in/ubaisahamed",
    leetcode: "https://leetcode.com/u/Ubais-Ad/"
  };

  /* LeetCode breakdown is configurable here rather than hard-coded as a
     permanent statistic — update these values, nothing else. */
  var LEETCODE = {
    username: "Ubais-Ad",
    url: LINKS.leetcode,
    headline: "100+ problems solved",
    showBreakdown: true,
    breakdownNote: "Approximate values recorded previously; these change over time.",
    breakdown: [
      { label: "Easy", value: 72 },
      { label: "Medium", value: 27 },
      { label: "Hard", value: 3 }
    ]
  };

  var PROFILE = {
    name: "Ubais Ahamed",
    role: "QA Automation Engineer / Software Tester",
    shortRole: "QA Automation Engineer",
    location: "Chennai, Tamil Nadu, India",
    focus: ["Manual Testing", "Automation Testing", "Playwright", "JavaScript", "Test Design", "Defect Analysis"],
    about: [
      "I am a QA Automation Engineer / Software Tester focused on building reliable software through structured testing, automation, investigation, and systematic validation.",
      "My testing experience includes functional testing, regression testing, sanity testing, test case design, defect reporting, web automation, and automation framework development.",
      "I enjoy understanding application behavior, identifying defects, validating fixes, and improving testing efficiency through automation."
    ],
    links: LINKS
  };

  var EDUCATION = [
    {
      degree: "B.E. Computer Science and Engineering",
      school: "Mother Teresa College of Engineering & Technology",
      period: "2022–2026",
      resultLabel: "CGPA",
      result: "7.88"
    },
    {
      degree: "Class XII",
      school: "Mother Teresa Matriculation Higher Secondary School",
      period: "2021–2022",
      resultLabel: "Aggregate",
      result: "69.3%"
    }
  ];

  var CERTIFICATIONS = [
    { issuer: "Infosys Springboard", title: "IT Infrastructure and Automation", when: "May–July 2025" },
    { issuer: "Google", title: "Python for Real-World Automation", when: "" },
    { issuer: "Microsoft", title: "Essentials — 2025", when: "" }
  ];

  var EXPERIENCE = {
    company: "Annular Technologies",
    role: "QA / Automation Testing Intern",
    intro: "Professional work on two company products. These are not personal projects.",
    products: [
      {
        name: "Quantem",
        kind: "Web-based device management / MDM application",
        summary:
          "Quantem is a web-based device management application used to enroll and manage devices. My work covered enrollment flows, device policies and device settings across functional, sanity and regression cycles.",
        areas: [
          "Android device enrollment", "Kiosk", "Fully Managed", "BYOD", "Samsung KME",
          "Zero-touch", "Device policies", "Device settings", "Functional testing",
          "Sanity testing", "Regression testing", "Defect identification", "Bug reporting", "Retesting"
        ]
      },
      {
        name: "AI Testing Studio",
        kind: "AI-powered testing product",
        summary:
          "AI Testing Studio generates testing artefacts from a source repository. My role was validation: checking that generated scenarios, cases and scripts were correct and behaved as expected.",
        flow: [
          "Git Repository", "Repository Analysis", "Test Scenario Generation",
          "Test Case Generation", "Automation Script Generation", "Validation / Testing"
        ],
        areas: [
          "Validating generated test scenarios", "Validating generated test cases",
          "Validating generated automation scripts", "Testing generated content",
          "Identifying defects", "Reporting issues", "Verifying expected behavior"
        ]
      }
    ],
    confidentialityNote:
      "Product descriptions here stay at a general level. No internal URLs, credentials, screenshots, defect IDs, tracker references or implementation details are included."
  };

  var SKILLS = [
    {
      group: "Manual Testing",
      items: ["Manual Testing", "Functional Testing", "Regression Testing", "Smoke Testing",
        "Sanity Testing", "Test Case Design", "Test Scenario Design", "Defect Lifecycle",
        "Bug Reporting", "SDLC", "STLC"]
    },
    {
      group: "Automation",
      items: ["Playwright", "JavaScript", "Page Object Model", "Locators", "Assertions",
        "Test Automation", "Web Automation", "Automation Framework Structure", "Test Reporting"]
    },
    { group: "Database", items: ["MySQL", "Basic SQL Queries"] },
    { group: "Tools", items: ["Git", "GitHub", "Jira", "VS Code", "n8n"] }
  ];

  var PROJECTS = [
    {
      id: "01",
      name: "SmartTestX Automation Framework",
      type: "Automation project",
      tech: ["Playwright", "JavaScript"],
      description:
        "A Playwright-based web automation framework designed with a structured Page Object Model architecture, reusable locators, assertions, organized tests, execution flow, and reporting.",
      features: ["Page Object Model", "Locators", "Assertions", "Test automation",
        "Organized test structure", "Test execution", "Reporting"],
      note: "AI assistance was used during development of parts of this framework."
    },
    {
      id: "02",
      name: "Email Cleaner Automation",
      type: "Automation utility",
      tech: ["Python"],
      description:
        "An automation utility for processing emails using date-based and keyword-based filtering. The goal is to reduce repetitive manual email-processing work by automatically identifying relevant messages using defined filtering conditions.",
      features: ["Date-based filtering", "Keyword-based filtering", "Repetitive task reduction"],
      note: "No time-saving percentage is claimed, as none has been measured."
    },
    {
      id: "03",
      name: "Demo Web Shop Testing",
      type: "Manual testing project",
      tech: ["Manual Testing"],
      description:
        "A manual testing project focused on validating a demo e-commerce application through structured test scenarios, test cases, execution, defect identification, and reporting.",
      features: ["Test scenario design", "Test case design", "Test execution", "Functional testing",
        "Regression testing", "Bug reporting", "Result validation"],
      stat: { value: "25+", label: "test cases designed and executed" }
    }
  ];

  var QA_WORKFLOW = [
    {
      key: "requirement",
      name: "Requirement",
      blurb: "Read the requirement and agree on what 'correct' means before anything is written down. Ambiguity found here costs the least to fix.",
      demo:
        "REQ-104  Product search\n\n" +
        "The Search button must become enabled once the search field\n" +
        "contains at least 3 valid characters, and clicking it must\n" +
        "return matching products."
    },
    {
      key: "scenario",
      name: "Test scenario",
      blurb: "Turn the requirement into the broad situations worth covering — the shape of the testing, not yet the steps.",
      demo:
        "SC-01  Search with valid input\n" +
        "SC-02  Search with input shorter than 3 characters\n" +
        "SC-03  Search with only spaces\n" +
        "SC-04  Search with no matching products"
    },
    {
      key: "case",
      name: "Test case",
      blurb: "Write each scenario as steps anyone can repeat, with one unambiguous expected result.",
      demo:
        "TC-014  Search button enables on valid input\n\n" +
        "Pre-condition : Application is open\n" +
        "Step 1        : Enter \"shoe\" in the search field\n" +
        "Step 2        : Observe the Search button\n" +
        "Expected      : Search button is enabled"
    },
    {
      key: "execution",
      name: "Execution",
      blurb: "Run the case on a stated environment and record what happened, not what should have happened.",
      demo:
        "Run     : 2025-08-12  ·  Chrome 128 / Windows 11\n" +
        "TC-014  : executed\n" +
        "Evidence: screen recording attached to the run"
    },
    {
      key: "actual",
      name: "Actual result",
      blurb: "Compare observed behaviour against the expected result. A mismatch becomes a defect; a match closes the case.",
      demo:
        "Expected : Search button is enabled\n" +
        "Actual   : Search button remains disabled\n" +
        "Verdict  : FAIL  →  raise defect"
    },
    {
      key: "bug",
      name: "Bug report",
      blurb: "Report so a developer can reproduce it without asking a question: steps, environment, expected, actual, severity, priority.",
      demo:
        "BUG-001  Search button remains disabled after valid input\n" +
        "Severity : Medium   Priority : Medium\n" +
        "Env      : Chrome / Windows\n" +
        "Status   : Open  →  assigned to development"
    },
    {
      key: "retest",
      name: "Retest",
      blurb: "Verify the fix on the same steps, then check the area around it for regressions the fix may have introduced.",
      demo:
        "BUG-001  retested on build 1.4.2\n" +
        "TC-014   : PASS\n" +
        "Regression: TC-011, TC-012, TC-015 re-executed  →  PASS"
    },
    {
      key: "final",
      name: "Final result",
      blurb: "Close the loop: defect closed, cases updated, and the regression suite carries the case forward.",
      demo:
        "BUG-001  : Closed\n" +
        "TC-014   : Passed\n" +
        "Added to : Regression suite\n" +
        "Cycle    : Complete"
    }
  ];

  var BUG_DEMO = {
    id: "BUG-001",
    title: "Search button remains disabled after valid input",
    severity: "Medium",
    priority: "Medium",
    environment: "Chrome / Windows",
    steps: [
      "Open the application.",
      "Enter valid search input.",
      "Observe the Search button.",
      "Click Search.",
      "Observe the button behavior."
    ],
    expected: "The Search button should become enabled after valid input and should execute the search.",
    actual: "The Search button remains disabled."
  };

  var TERMINAL = [
    { t: "$ npx playwright test", c: "" },
    { t: "", c: "" },
    { t: "Running 12 tests...", c: "m" },
    { t: "", c: "" },
    { t: "✓ login.spec.js", c: "g" },
    { t: "✓ search.spec.js", c: "g" },
    { t: "✓ navigation.spec.js", c: "g" },
    { t: "✓ validation.spec.js", c: "g" },
    { t: "", c: "" },
    { t: "12 passed", c: "g" },
    { t: "0 failed", c: "m" },
    { t: "", c: "" },
    { t: "Test run completed.", c: "o" }
  ];

  /* Parcel / section registry. `slot` drives the 3D staging layout:
     row 0 = back arc, row 1 = front arc; col 0..2 left→right. */
  var SECTIONS = [
    { id: "about",      num: "01", label: "ABOUT",      slot: { row: 0, col: 0 } },
    { id: "experience", num: "02", label: "EXPERIENCE", slot: { row: 0, col: 1 } },
    { id: "skills",     num: "03", label: "SKILLS",     slot: { row: 0, col: 2 } },
    { id: "projects",   num: "04", label: "PROJECTS",   slot: { row: 1, col: 0 } },
    { id: "qalab",      num: "05", label: "QA LAB",     slot: { row: 1, col: 1 } },
    { id: "contact",    num: "06", label: "CONTACT",    slot: { row: 1, col: 2 } }
  ];

  var CONTACT = {
    heading: "Let's build better software.",
    blurb: "Open to QA and test automation roles. The quickest way to reach me is LinkedIn.",
    emailPlaceholder: "Email — add address",
    resumePlaceholder: "Résumé — add file"
  };

  global.PORTFOLIO = {
    profile: PROFILE,
    links: LINKS,
    education: EDUCATION,
    certifications: CERTIFICATIONS,
    experience: EXPERIENCE,
    skills: SKILLS,
    projects: PROJECTS,
    qaWorkflow: QA_WORKFLOW,
    bugDemo: BUG_DEMO,
    terminal: TERMINAL,
    leetcode: LEETCODE,
    sections: SECTIONS,
    contact: CONTACT
  };
})(typeof window !== "undefined" ? window : this);
