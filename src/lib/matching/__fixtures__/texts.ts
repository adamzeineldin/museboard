// Calibration fixtures for match scoring. Realistic but invented texts; nothing here is a real person.

export const SWE_RESUME = `Jordan Lee
jordan.lee@example.edu · State University · B.S. Computer Science, expected May 2027

Skills
Languages: Python, TypeScript, JavaScript, Java, Go, SQL
Frameworks: React, Next.js, Node.js, Flask
Tools: PostgreSQL, Redis, Docker, Kubernetes, AWS, Git, Linux

Experience
Software Engineering Intern, Acme Analytics (Summer 2026)
- Built a REST API in Go that serves 2M requests a day and cut p95 latency by 40% with Redis caching.
- Added distributed tracing to three backend services and wrote integration tests in Python.

Projects
Campus Marketplace: a full-stack web app in TypeScript, React and Next.js with a PostgreSQL database; 1,200 students use it each month.
Raft KV store: a distributed key-value store in Go implementing leader election and log replication, tested with fault injection.
Course scheduler: algorithms for constraint-based scheduling in Java using graph data structures.

Coursework
Data Structures, Algorithms, Operating Systems, Distributed Systems, Databases, Computer Networks`;

export const SWE_INTERN_POSTING = {
  title: "Software Engineer Intern, Summer 2027",
  companyName: "Stripe",
  description:
    "Join Stripe's payments infrastructure teams building APIs used by millions of businesses. You'll ship " +
    "production code with a mentor on a product team for 12 weeks. We look for strong CS fundamentals (data " +
    "structures, algorithms), experience with at least one of Python, Java, Go, TypeScript or C++, and projects " +
    "you can talk about in depth. Experience with APIs, distributed systems or Ruby is a plus.",
};

export const BACKEND_INTERN_POSTING = {
  title: "Backend Software Engineering Intern 2027",
  companyName: "Datadog",
  description:
    "Work on Datadog's observability platform: metrics, logs and tracing at very high volume. You will design and " +
    "build backend services in Go and Python that process trillions of data points, run on Kubernetes, and are " +
    "deployed on AWS. We look for strong computer science fundamentals including data structures, algorithms and " +
    "operating systems, plus curiosity about distributed systems and databases. Bonus: Docker, Redis or PostgreSQL. " +
    "Responsibilities: write well-tested code, participate in code reviews, and own a project end to end with a mentor.",
};

export const FRONTEND_NEW_GRAD_POSTING = {
  title: "Software Engineer, New Grad 2027 (Frontend)",
  companyName: "Ramp",
  description:
    "Build the product finance teams use every day. You'll write TypeScript and React across our web app, work with " +
    "Node.js and PostgreSQL services, and ship weekly. You have a CS degree (or equivalent), internship or project " +
    "experience building web applications, and care about clean, tested code.",
};

export const SALES_POSTING = {
  title: "Account Executive, Mid-Market Sales",
  companyName: "Acme CRM",
  description:
    "As an Account Executive you will own the full sales cycle for mid-market customers: prospecting, discovery calls, " +
    "product demos, negotiating contracts and closing deals. You will build pipeline with outbound outreach, partner " +
    "with marketing on campaigns, and consistently exceed quarterly quota. Requirements: 2+ years of B2B SaaS sales " +
    "experience, a track record of hitting targets, excellent communication and presentation skills, and comfort " +
    "with Salesforce. Competitive base salary plus commission, uncapped earnings, and a President's Club trip.",
};

export const NURSING_POSTING = {
  title: "Registered Nurse, Intensive Care Unit",
  companyName: "City Hospital",
  description:
    "Provide direct patient care in a 24-bed ICU. Assess patients, administer medications, coordinate with " +
    "physicians and families, and document care in the electronic health record. Requires an active RN license, " +
    "BLS and ACLS certification, and one year of acute care experience. Twelve-hour shifts including weekends.",
};

export const MARKETING_INTERN_POSTING = {
  title: "Marketing Intern, Summer 2027",
  companyName: "Brightside Brands",
  description:
    "Support our brand team with social media campaigns, content calendars, and influencer partnerships. You will " +
    "write copy, analyze campaign performance in spreadsheets, and help plan events. We look for creative students " +
    "studying marketing or communications with strong writing skills and a passion for consumer brands.",
};

export const DESIGN_RESUME = `Sam Rivera
B.F.A. Graphic Design, Art Institute, 2027
Skills: Adobe Illustrator, Photoshop, InDesign, typography, branding, print layout, illustration.
Experience: Design intern at a local magazine; created page layouts, cover illustrations and social media graphics.
Freelance logo and brand identity work for six small businesses.`;

// A long posting in the shape real ATS feeds return: role text followed by benefits and EEO boilerplate.
export const LONG_SWE_INTERN_POSTING = {
  title: "Software Engineering Intern (Summer 2027)",
  companyName: "Cloudflare",
  description:
    "About the team: the Workers runtime team builds the platform that runs customer code at the edge in more than " +
    "300 cities. As an intern you'll pair with an engineer on a real project, write and review code, and present " +
    "your work at the end of the summer. What you'll do: build features in TypeScript and Rust, improve performance " +
    "of edge networking components, and write tests and documentation. What we look for: pursuing a degree in " +
    "computer science or a related field; solid grasp of data structures and algorithms; experience with at least " +
    "one of Go, Rust, C++, Python or TypeScript; curiosity about networking, distributed systems and security. " +
    "Compensation: the hourly rate for this role is $45-$50. Benefits include housing support, commuter benefits " +
    "and wellness programs. Cloudflare is proud to be an equal opportunity employer. We are committed to providing " +
    "equal employment opportunity for all people and place great value in both diversity and inclusiveness. All " +
    "qualified applicants will be considered for employment without regard to their, or any other person's, " +
    "perceived or actual race, color, religion, sex, gender, gender identity, gender expression, sexual orientation, " +
    "national origin, ancestry, citizenship, age, physical or mental disability, medical condition, family care " +
    "status, or any other basis protected by law. We are an AA/Veterans/Disabled Employer. Cloudflare provides " +
    "reasonable accommodations to qualified individuals with disabilities. Please tell us if you require a " +
    "reasonable accommodation to apply for a job.",
};
