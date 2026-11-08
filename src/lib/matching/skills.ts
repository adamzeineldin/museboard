// Curated software-engineering skills used for the keyword boost and for "matched skills" on job cards.
// Each entry has a display name and one or more patterns. Patterns are matched against the original
// text (so case-sensitive terms such as "Go" or "React" don't fire on ordinary English words).

export type SkillCategory = "language" | "framework" | "data" | "infra" | "cs" | "practice";

export interface Skill {
  name: string;
  category: SkillCategory;
  patterns: readonly RegExp[];
}

// Boundaries that treat "+", "#" and "." as part of a term (so "C++" isn't "C" and "Node.js" stays whole).
const PRE = "(?<![A-Za-z0-9+#])";
const POST = "(?![A-Za-z0-9+#])";

const esc = (term: string): string => term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Case-insensitive whole-term match; spaces in the term match any run of whitespace or hyphens. */
const ci = (...terms: string[]): RegExp[] =>
  terms.map((term) => new RegExp(`${PRE}${esc(term).replace(/ /g, "[\\s-]+")}${POST}`, "i"));

/** Case-sensitive whole-term match, for names that are also everyday words. */
const cs = (...terms: string[]): RegExp[] => terms.map((term) => new RegExp(`${PRE}${esc(term)}${POST}`));

const skill = (name: string, category: SkillCategory, patterns: RegExp[]): Skill => ({ name, category, patterns });

export const SWE_SKILLS: readonly Skill[] = [
  // Languages
  skill("Python", "language", ci("python")),
  skill("Java", "language", ci("java")),
  skill("JavaScript", "language", ci("javascript", "ecmascript")),
  skill("TypeScript", "language", ci("typescript")),
  skill("Go", "language", [...ci("golang"), /(?<![A-Za-z0-9])Go(?![A-Za-z0-9-])(?!\s+(?:to|back|beyond|above|through|over|live|ahead)\b)/]),
  skill("C++", "language", ci("c++", "cpp")),
  skill("C#", "language", ci("c#")),
  skill("Rust", "language", ci("rust")),
  skill("Ruby", "language", ci("ruby")),
  skill("Kotlin", "language", ci("kotlin")),
  skill("Swift", "language", cs("Swift", "SwiftUI")),
  skill("Scala", "language", ci("scala")),
  skill("PHP", "language", ci("php")),
  skill("SQL", "language", ci("sql")),
  skill("Bash", "language", ci("bash", "shell scripting")),
  // Frameworks and libraries
  skill("React", "framework", [...cs("React", "React Native"), ...ci("react.js", "reactjs")]),
  skill("Next.js", "framework", ci("next.js", "nextjs")),
  skill("Vue", "framework", [...cs("Vue"), ...ci("vue.js", "vuejs")]),
  skill("Angular", "framework", ci("angular")),
  skill("Node.js", "framework", ci("node.js", "nodejs")),
  skill("Express", "framework", ci("express.js", "expressjs")),
  skill("Django", "framework", ci("django")),
  skill("Flask", "framework", ci("flask")),
  skill("FastAPI", "framework", ci("fastapi")),
  skill("Spring", "framework", ci("spring boot", "spring framework")),
  skill("Rails", "framework", [...ci("ruby on rails"), ...cs("Rails")]),
  skill(".NET", "framework", ci(".net", "dotnet")),
  skill("GraphQL", "framework", ci("graphql")),
  skill("APIs", "framework", ci("rest api", "rest apis", "restful", "apis", "api")),
  skill("gRPC", "framework", ci("grpc")),
  skill("PyTorch", "framework", ci("pytorch")),
  skill("TensorFlow", "framework", ci("tensorflow")),
  skill("pandas", "framework", ci("pandas")),
  skill("NumPy", "framework", ci("numpy")),
  skill("Tailwind", "framework", ci("tailwind", "tailwindcss")),
  // Data stores and data tooling
  skill("PostgreSQL", "data", ci("postgresql", "postgres")),
  skill("MySQL", "data", ci("mysql")),
  skill("SQLite", "data", ci("sqlite")),
  skill("MongoDB", "data", ci("mongodb", "mongo")),
  skill("Redis", "data", ci("redis")),
  skill("Kafka", "data", ci("kafka")),
  skill("Spark", "data", [...cs("Spark"), ...ci("apache spark", "pyspark")]),
  skill("Elasticsearch", "data", ci("elasticsearch")),
  skill("DynamoDB", "data", ci("dynamodb")),
  skill("Data engineering", "data", ci("data engineering", "data pipelines", "data pipeline", "etl")),
  skill("Time-series data", "data", ci("time series", "time-series")),
  // Infrastructure
  skill("AWS", "infra", ci("aws", "amazon web services")),
  skill("GCP", "infra", ci("gcp", "google cloud")),
  skill("Azure", "infra", cs("Azure")),
  skill("Docker", "infra", ci("docker")),
  skill("Kubernetes", "infra", ci("kubernetes", "k8s")),
  skill("Terraform", "infra", ci("terraform")),
  skill("Linux", "infra", ci("linux", "unix")),
  skill("Git", "infra", cs("Git", "GitHub", "GitLab")),
  skill("CI/CD", "infra", ci("ci/cd", "cicd", "continuous integration", "github actions")),
  skill("Cloud", "infra", ci("cloud native", "cloud-native", "cloud computing", "cloud")),
  skill("Networking", "infra", ci("computer networking", "computer networks", "edge networking", "network protocols", "tcp/ip", "tcp", "dns")),
  skill("Observability", "infra", ci("observability", "distributed tracing", "tracing")),
  // CS topics
  skill("Data structures", "cs", ci("data structures", "data structure")),
  skill("Algorithms", "cs", ci("algorithms", "algorithm")),
  skill("Distributed systems", "cs", ci("distributed systems", "distributed system", "distributed data systems")),
  skill("Operating systems", "cs", ci("operating systems", "operating system")),
  skill("Databases", "cs", ci("databases", "database", "database systems")),
  skill("Machine learning", "cs", ci("machine learning", "deep learning", "ml")),
  skill("Computer vision", "cs", ci("computer vision")),
  skill("NLP", "cs", ci("natural language processing", "nlp")),
  skill("Concurrency", "cs", ci("concurrency", "multithreading", "multi-threading", "parallel programming")),
  skill("Compilers", "cs", ci("compilers", "compiler")),
  skill("Security", "cs", ci("security", "cryptography")),
  skill("System design", "cs", ci("system design", "systems design", "scalability", "large-scale systems")),
  skill("Object-oriented design", "cs", ci("object-oriented", "object oriented", "oop")),
  // Practices
  skill("Testing", "practice", ci("unit testing", "unit tests", "test-driven", "tdd", "integration tests")),
  skill("Agile", "practice", ci("agile", "scrum")),
  skill("Frontend", "practice", ci("frontend", "front-end", "front end")),
  skill("Backend", "practice", ci("backend", "back-end", "back end")),
  skill("Full-stack", "practice", ci("full-stack", "full stack", "fullstack")),
  skill("Mobile", "practice", ci("ios", "android", "mobile development")),
];

/** Names of every curated skill mentioned in `text`, in curated-list order. */
export function findSkills(text: string, skills: readonly Skill[] = SWE_SKILLS): string[] {
  if (!text.trim()) return [];
  return skills.filter((entry) => entry.patterns.some((pattern) => pattern.test(text))).map((entry) => entry.name);
}

/** How many times any of a skill's patterns occur in `text` (used to rank matched skills). */
export function countSkillMentions(text: string, name: string, skills: readonly Skill[] = SWE_SKILLS): number {
  const entry = skills.find((candidate) => candidate.name === name);
  if (!entry) return 0;
  return entry.patterns.reduce((total, pattern) => {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    return total + (text.match(global)?.length ?? 0);
  }, 0);
}
