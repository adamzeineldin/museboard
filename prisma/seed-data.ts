// Sample data from docs/reference/inroad.html. Companies without a public ATS feed (Meta, Google)
// have ats = null and are never scraped; their sample jobs are clearly labeled as sample data.

export interface SeedCompany {
  name: string;
  ats: "greenhouse" | "lever" | "ashby" | "workday" | null;
  atsConfig: Record<string, string> | null;
}

export interface SeedJob {
  id: string;
  company: string;
  title: string;
  location: string;
  type: "intern" | "newgrad";
  hoursAgo: number;
  url: string;
  source: string;
  compensation: string;
  department: string;
  description: string;
}

export interface SeedContact {
  id: string;
  name: string;
  role: string;
  company: string;
  relationship: string;
  source: "manual" | "csv" | "alumni-list";
  notes: string;
}

export const DEMO_USER = {
  email: "demo@inroad.test",
  name: "Demo Student",
  school: "State University",
  gradYear: 2027,
  timezone: "America/New_York",
} as const;

// atsConfig keys match the scraper's companies.json (board / site / tenant+wd+site).
export const SEED_COMPANIES: SeedCompany[] = [
  { name: "Stripe", ats: "greenhouse", atsConfig: { board: "stripe" } },
  { name: "Datadog", ats: "greenhouse", atsConfig: { board: "datadog" } },
  { name: "Cloudflare", ats: "greenhouse", atsConfig: { board: "cloudflare" } },
  { name: "Ramp", ats: "ashby", atsConfig: { board: "ramp" } },
  { name: "Palantir", ats: "lever", atsConfig: { site: "palantir" } },
  { name: "Capital One", ats: "workday", atsConfig: { tenant: "capitalone", wd: "wd12", site: "Capital_One" } },
  { name: "Meta", ats: null, atsConfig: null },
  { name: "Google", ats: null, atsConfig: null },
];

const SWE_INTERN =
  "You'll ship production code with a mentor on a product team for 12 weeks. We look for strong CS fundamentals " +
  "(data structures, algorithms), experience with at least one of Python, Java, Go, TypeScript or C++, and projects " +
  "you can talk about in depth.";

export const SEED_JOBS: SeedJob[] = [
  {
    id: "greenhouse:stripe:7001001",
    company: "Stripe",
    title: "Software Engineer Intern, Summer 2027",
    location: "New York · Remote OK",
    type: "intern",
    hoursAgo: 2,
    url: "https://boards.greenhouse.io/stripe/jobs/7001001",
    source: "Greenhouse feed",
    compensation: "$55–60/hr",
    department: "Engineering",
    description: `Join Stripe's payments infrastructure teams building APIs used by millions of businesses. ${SWE_INTERN} Experience with APIs, distributed systems or Ruby is a plus.`,
  },
  {
    id: "sample:meta:swe-intern-2027",
    company: "Meta",
    title: "Software Engineer Intern, Summer 2027",
    location: "Menlo Park · New York",
    type: "intern",
    hoursAgo: 5,
    url: "https://www.metacareers.com/",
    source: "Sample data",
    compensation: "$50–58/hr",
    department: "Engineering",
    description: `Sample role for demos (Meta has no public ATS feed, so Inroad never scrapes it). ${SWE_INTERN} Experience with React, PHP/Hack or large-scale systems is a plus.`,
  },
  {
    id: "sample:google:swe-intern-bs-2027",
    company: "Google",
    title: "Software Engineering Intern, BS, Summer 2027",
    location: "Multiple US offices",
    type: "intern",
    hoursAgo: 24,
    url: "https://careers.google.com/",
    source: "Sample data",
    compensation: "$45–55/hr",
    department: "Engineering",
    description: `Sample role for demos (Google has no public ATS feed, so Inroad never scrapes it). ${SWE_INTERN} Experience with C++, Java or Python and with algorithms is a plus.`,
  },
  {
    id: "greenhouse:datadog:7002002",
    company: "Datadog",
    title: "Software Engineer Intern 2027",
    location: "New York",
    type: "intern",
    hoursAgo: 26,
    url: "https://boards.greenhouse.io/datadog/jobs/7002002",
    source: "Greenhouse feed",
    compensation: "$50/hr",
    department: "Engineering",
    description: `Work on Datadog's observability platform: metrics, logs and tracing at very high volume. ${SWE_INTERN} Go, Python, Kubernetes or time-series data experience is a plus.`,
  },
  {
    id: "greenhouse:cloudflare:7003003",
    company: "Cloudflare",
    title: "Software Engineer Intern, Summer 2027",
    location: "Austin",
    type: "intern",
    hoursAgo: 48,
    url: "https://boards.greenhouse.io/cloudflare/jobs/7003003",
    source: "Greenhouse feed",
    compensation: "$45–50/hr",
    department: "Engineering",
    description: `Help build Cloudflare's global network and developer platform (Workers, edge networking, security). ${SWE_INTERN} Rust, Go, networking or TypeScript experience is a plus.`,
  },
  {
    id: "workday:capital-one:R7004004",
    company: "Capital One",
    title: "Technology Internship Program, Summer 2027",
    location: "McLean, VA",
    type: "intern",
    hoursAgo: 50,
    url: "https://capitalone.wd12.myworkdayjobs.com/Capital_One/job/McLean-VA/Technology-Internship-Program_R7004004",
    source: "Workday feed",
    compensation: "$47/hr",
    department: "Technology",
    description: `Capital One's Technology Internship Program places interns on cloud-native engineering teams. ${SWE_INTERN} Java, Python, AWS or data engineering experience is a plus.`,
  },
  {
    id: "ashby:ramp:7005005",
    company: "Ramp",
    title: "Software Engineer, New Grad 2027",
    location: "New York",
    type: "newgrad",
    hoursAgo: 72,
    url: "https://jobs.ashbyhq.com/ramp/7005005",
    source: "Ashby feed",
    compensation: "$160–190k",
    department: "Engineering",
    description:
      "Build Ramp's finance automation products end to end as a full-time engineer starting in 2027. We look for strong CS " +
      "fundamentals, shipped projects or internships, and comfort with TypeScript, Python and SQL. Fintech or product engineering experience is a plus.",
  },
  {
    id: "lever:palantir:7006006",
    company: "Palantir",
    title: "Software Engineer Intern, Summer 2027",
    location: "Washington, DC",
    type: "intern",
    hoursAgo: 96,
    url: "https://jobs.lever.co/palantir/7006006",
    source: "Lever feed",
    compensation: "$50/hr",
    department: "Engineering",
    description: `Work with Palantir engineers on data integration and analysis platforms used by large organizations. ${SWE_INTERN} Java, TypeScript or distributed data systems experience is a plus.`,
  },
];

export const SEED_CONTACTS: SeedContact[] = [
  {
    id: "seed-contact-priya",
    name: "Priya N.",
    role: "Software Engineer II, Payments",
    company: "Stripe",
    relationship: "Alum, class of 2023",
    source: "alumni-list",
    notes: "Coffee chat Oct 14",
  },
  {
    id: "seed-contact-marcus",
    name: "Marcus T.",
    role: "Production Engineer",
    company: "Meta",
    relationship: "Alum, class of 2021",
    source: "alumni-list",
    notes: "Not contacted yet",
  },
  {
    id: "seed-contact-dana",
    name: "Dana L.",
    role: "Software Engineer, Cloud",
    company: "Google",
    relationship: "Hackathon mentor, March 2026",
    source: "manual",
    notes: "Met once",
  },
  {
    id: "seed-contact-jordan",
    name: "Jordan K.",
    role: "Software Engineer",
    company: "Datadog",
    relationship: "Alum, class of 2024",
    source: "alumni-list",
    notes: "Not contacted yet",
  },
];
