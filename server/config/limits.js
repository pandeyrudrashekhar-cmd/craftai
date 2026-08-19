export const limits = {
  maxProjectFiles: Number(process.env.MAX_PROJECT_FILES || 200),
  maxProjectBytes: Number(process.env.MAX_PROJECT_BYTES || 20_000_000),
  maxFileBytes: Number(process.env.MAX_FILE_BYTES || 500_000),
  maxPromptCharacters: Number(process.env.MAX_PROMPT_CHARACTERS || 10_000),
  maxVersionsPerProject: Number(process.env.MAX_VERSIONS_PER_PROJECT || 100),
  maxActiveDeploymentsPerProject: Number(process.env.MAX_ACTIVE_DEPLOYMENTS || 2),
  maxBuildOutputFiles: Number(process.env.MAX_BUILD_OUTPUT_FILES || 500),
  maxBuildOutputBytes: Number(process.env.MAX_BUILD_OUTPUT_BYTES || 30_000_000),
  deploymentStartTimeoutMs: Number(process.env.DEPLOYMENT_START_TIMEOUT_MS || 10 * 60 * 1000)
};
