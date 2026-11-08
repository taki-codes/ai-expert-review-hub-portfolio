import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function resolveArtifactRoot() {
  return path.resolve(process.cwd(), process.env.ARTIFACT_ROOT ?? "../../data/review-runs");
}

export function buildArtifactPath(reviewRunId: string, ...segments: string[]) {
  return path.join(reviewRunId, ...segments);
}

export function resolveArtifactAbsolutePath(relativePath: string) {
  return path.join(resolveArtifactRoot(), relativePath);
}

async function writeArtifact(relativePath: string, content: Buffer | string) {
  const absolutePath = resolveArtifactAbsolutePath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  return absolutePath;
}

export async function writeJsonArtifact(reviewRunId: string, relativePath: string, payload: unknown) {
  const artifactPath = buildArtifactPath(reviewRunId, relativePath);
  const absolutePath = await writeArtifact(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { artifactPath, absolutePath };
}

export async function writeTextArtifact(reviewRunId: string, relativePath: string, text: string) {
  const artifactPath = buildArtifactPath(reviewRunId, relativePath);
  const absolutePath = await writeArtifact(artifactPath, text);
  return { artifactPath, absolutePath };
}

export async function writeBinaryArtifact(reviewRunId: string, relativePath: string, content: Buffer) {
  const artifactPath = buildArtifactPath(reviewRunId, relativePath);
  const absolutePath = await writeArtifact(artifactPath, content);
  return { artifactPath, absolutePath };
}
