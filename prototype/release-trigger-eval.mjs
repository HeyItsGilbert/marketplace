import { mkdir } from "node:fs/promises";

const root = "/tmp/release-description-eval";
const evalSet = await Bun.file("plugins/release-manager/skills/release-workspace/eval_set.json").json();
const descriptions = {
  current: "Prepare a release — update CHANGELOG.md and bump the version in manifests (package.json, *.psd1, pyproject.toml, Cargo.toml, *.csproj). Follows Keep a Changelog and SemVer. Use when the user wants to cut, ship, or prep a release, bump a version, do a first stable release (0.x→1.0), prep a hotfix, or normalize a non-semver version. Triggers: \"prepare the release\", \"version bump\", \"update changelog\", \"cut a release\", \"ship a new version\", \"go 1.0\". Does the file edits and commit — not CI/CD config, tooling, rollbacks, or git tagging.",
  pruned_exclusions: "Release: use when the user wants to prepare a release by updating CHANGELOG.md and version manifests. Not for CI/CD configuration, release automation, changelog lookup, rollback, tooling, dependency updates, monorepo versioning, or git tagging.",
  pruned: "Release: use when the user wants to prepare a release by updating CHANGELOG.md and version manifests."
};

for (const [name, description] of Object.entries(descriptions)) {
  const variant = `${root}/${name}`;
  await mkdir(`${variant}/.claude-plugin`, { recursive: true });
  await mkdir(`${variant}/skills/release`, { recursive: true });
  await Bun.write(`${variant}/.claude-plugin/plugin.json`, JSON.stringify({ name: `release-${name}`, version: "0.0.0", description: "Trigger-evaluation fixture" }));
  await Bun.write(`${variant}/skills/release/SKILL.md`, `---\nname: release\ndescription: ${JSON.stringify(description)}\n---\n\n# Release\n\nUse this skill when invoked.\n`);
}

const jobs = Object.keys(descriptions).flatMap((variant) => evalSet
  .filter(({ should_trigger }) => !should_trigger)
  .flatMap(({ query }, queryIndex) => Array.from({ length: 3 }, (_, index) => ({ variant, query, queryIndex, run: index + 1 }))));

async function run(job) {
  const proc = Bun.spawn([
    "claude", "-p", job.query, "--plugin-dir", `${root}/${job.variant}`, "--tools", "Skill",
    "--output-format", "stream-json", "--no-session-persistence", "--max-budget-usd", "0.05", "--verbose"
  ], { cwd: "/tmp", stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { ...job, triggered: stdout.includes(`\"skill\":\"release-${job.variant}:release\"`), exitCode };
}

const results = [];
for (let start = 0; start < jobs.length; start += 5) results.push(...await Promise.all(jobs.slice(start, start + 5).map(run)));
await Bun.write("prototype/release-trigger-results.json", JSON.stringify(results, null, 2));
