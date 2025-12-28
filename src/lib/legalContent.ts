/**
 * Legal & Support content for DumpHoops Fantasy
 * Single source of truth for all legal text - update here to update everywhere.
 */

export const LEGAL_LAST_UPDATED = "December 28, 2024";

export const SUPPORT_EMAIL = "dumphoopsfantasy@gmail.com";
export const VENMO_URL = "https://venmo.com/u/Demitri_Voyiatzis";
// GitHub URL removed - direct users to email instead

export const DISCLAIMER_CONTENT = {
  title: "Disclaimer (Beta)",
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      heading: "Independent Project",
      content:
        "DumpHoops Fantasy is an independent project and is **not affiliated with, endorsed by, or sponsored by ESPN, the NBA, the NBPA, or any related entities**. All trademarks and brand names belong to their respective owners.",
    },
    {
      heading: "Entertainment & Information Only",
      content:
        "This app is provided for **entertainment and informational purposes only**. It is intended to help you analyze your fantasy basketball data—nothing more.",
    },
    {
      heading: "No Guarantees",
      content:
        "We make **no guarantees** about the accuracy, completeness, or timeliness of stats, rankings, projections, or any other data shown. Injuries happen. Sample sizes are small early in the season. Schedules change. Parsing can fail.",
    },
    {
      heading: "Your Decisions, Your Risk",
      content:
        "**You are responsible for your own roster decisions.** Use the information at your own risk. We are not liable for any fantasy losses, bad trades, or championship heartbreak.",
    },
    {
      heading: "No Warranty",
      content:
        'THE APP IS PROVIDED **"AS IS"** WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. We disclaim all liability for losses or damages related to your use of the app.',
    },
  ],
};

export const TERMS_CONTENT = {
  title: "Terms of Use",
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: "acceptance",
      heading: "Acceptance of Terms",
      content:
        "By accessing or using DumpHoops Fantasy, you agree to be bound by these Terms of Use. If you do not agree, please do not use the app.",
    },
    {
      id: "no-affiliation",
      heading: "No Affiliation",
      content:
        "DumpHoops Fantasy is not affiliated with ESPN, the NBA, the NBPA, or any other sports organization. This is an independent fan project.",
    },
    {
      id: "prohibited-use",
      heading: "Prohibited Use",
      content: `You agree NOT to:
- Reverse engineer, decompile, or attempt to extract source code
- Use automated tools to scrape ESPN or other third-party sites through this app
- Attempt to break, exploit, or abuse import/parsing functionality
- Use the app for any unlawful purpose
- Interfere with or disrupt the app's operation`,
    },
    {
      id: "intellectual-property",
      heading: "Intellectual Property",
      content:
        "The DumpHoops name, UI design, and CRI/wCRI methodology presentation are owned by the project maintainers. You retain all rights to any data you paste into the app—we don't claim ownership of your fantasy stats.",
    },
    {
      id: "termination",
      heading: "Termination",
      content:
        "We reserve the right to block or terminate access for users who abuse the app or violate these terms, without prior notice.",
    },
    {
      id: "limitation-of-liability",
      heading: "Limitation of Liability",
      content:
        "TO THE MAXIMUM EXTENT PERMITTED BY LAW, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the app.",
    },
    {
      id: "no-warranty",
      heading: "No Warranty",
      content:
        'The app is provided "AS IS" without warranties of any kind. We do not guarantee uptime, accuracy, or fitness for any particular purpose.',
    },
    {
      id: "changes",
      heading: "Changes to Terms",
      content:
        "We may update these terms from time to time. The \"Last updated\" date at the top indicates when changes were made. Continued use after changes constitutes acceptance.",
    },
  ],
};

export const PRIVACY_CONTENT = {
  title: "Privacy Policy",
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: "overview",
      heading: "Overview",
      content:
        "We respect your privacy. This policy explains what data we collect (spoiler: not much) and how we handle it.",
    },
    {
      id: "what-we-store",
      heading: "What We Store",
      content: `**Local Storage (your browser only):**
- Your roster, free agent, standings, and schedule data (parsed from your pastes)
- Your settings and preferences (theme, weights, toggles)
- Draft board state and mappings

**Cloud (Lovable Cloud/Supabase):**
- Currently, we do not store user accounts or personal data in the cloud
- NBA game schedule data is fetched from public APIs
- Future features may use cloud storage—we'll update this policy if that changes`,
    },
    {
      id: "no-espn-credentials",
      heading: "We Do NOT Collect ESPN Credentials",
      content:
        "**We never ask for your ESPN username or password.** All data import is done by copy-pasting from your browser. Your ESPN login is between you and ESPN.",
    },
    {
      id: "analytics",
      heading: "Analytics",
      content:
        "Currently, **no third-party analytics** (like Google Analytics) are integrated. If we add analytics in the future, we'll update this policy.",
    },
    {
      id: "user-pasted-data",
      heading: "User-Pasted Data",
      content:
        "When you paste ESPN pages into the app, that text is processed locally in your browser. We do not transmit your pasted content to any server (except for potential error logging in development builds).",
    },
    {
      id: "contact",
      heading: "Contact",
      content: `For privacy questions or data deletion requests, contact us at: **${SUPPORT_EMAIL}**`,
    },
    {
      id: "changes",
      heading: "Changes to This Policy",
      content:
        "We may update this privacy policy. Check the \"Last updated\" date for the most recent version.",
    },
  ],
};

export const FAQ_CONTENT = {
  title: "Frequently Asked Questions",
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: "what-is-cri",
      question: "What is CRI vs wCRI?",
      answer: `**CRI (Category Rank Index)** scores each player by ranking them 1-N in each of the 9 fantasy categories, then summing those ranks. Higher = better overall.

**wCRI (Weighted CRI)** applies custom weights to each category. This lets you emphasize categories you're strong in or punting.`,
    },
    {
      id: "dynamic-wcri",
      question: "What does Dynamic wCRI do?",
      answer:
        "Dynamic wCRI automatically adjusts your category weights based on your team's strengths and weaknesses (or your opponent's). It emphasizes categories where you're competitive and de-emphasizes punted cats.",
    },
    {
      id: "projections-wrong",
      question: "Why do projections sometimes look wrong?",
      answer: `Projections are based on season averages and can be off due to:
- **Small sample size** early in the season
- **Recent injuries** not yet reflected in averages
- **Schedule variance** (some teams play more games per week)
- **Parsing errors** if the ESPN page format changes`,
    },
    {
      id: "espn-login",
      question: "Do you store my ESPN login?",
      answer:
        "**No.** We never ask for your ESPN credentials. All data import is done by copying and pasting text from your browser. We have no access to your ESPN account.",
    },
    {
      id: "how-imports-work",
      question: "How do imports work?",
      answer: `1. Go to the relevant ESPN page (roster, standings, schedule, etc.)
2. Select all text (Ctrl+A / Cmd+A)
3. Copy (Ctrl+C / Cmd+C)
4. Paste into the DumpHoops import box
5. Click Parse

The app extracts structured data from the text. Different pages have different parsers.`,
    },
    {
      id: "report-bugs",
      question: "How do I report bugs or request features?",
      answer: `You can:
- Use the feedback form in Settings
- Email us at: **${SUPPORT_EMAIL}**

We'd love to hear from you!`,
    },
  ],
};

export const SUPPORT_CONTENT = {
  title: "Support & Donate",
  description:
    "If DumpHoops helps you save time or win matchups, consider supporting development. Totally optional—the app will always be free.",
  venmoUrl: VENMO_URL,
  venmoHandle: "@Demitri_Voyiatzis",
  email: SUPPORT_EMAIL,
};
