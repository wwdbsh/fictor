import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = "docs/submission/track1-submission-package.json";
const DETACHED_PATH = "docs/submission/track1-submission-package.sha256";
const BASE_REVISION = "fd92ae54cf792e77e03431f743573b1669e674b3";
const TITLE = "FICTOR · 픽토르";
const CODEX_NARRATIVE = "FICTOR는 Codex와 함께 TypeScript/React 정적 웹 게임으로 개발했습니다. Codex는 52개 재료와 21개 법칙에서 1,326개 canonical 조합을 결정론적으로 생성하는 데이터 파이프라인, 즉석·공방 빚기가 같은 recipe resolver를 공유하는 전투 규칙, 도감과 localStorage 저장, 정적 빌드 검증을 구현·점검했습니다. 사람은 두 카드를 빚어 발견하는 핵심 경험, 세계관과 명칭, 밸런스 경계, 공개 위험 수용 여부를 결정하고 최종 공개·제출 승인 경계를 관리했습니다. 서버나 런타임 OpenAI API는 사용하지 않습니다.";
const FROZEN_HEAD_OBJECTS: Record<string, string | null> = {
  "src": "ab6994138784d85d85df454d9ff1c7a5593ea49a",
  "public": "9572361b26d2339b78dc1532e62f6b11d6c3f6c9",
  "assets/manifests": "847fb123002ae3c0597c6b0b29175ca468e529dc",
  "index.html": "b782911f0b373b30e12eb8ee11cc3b5899f79418",
  "vite.config.ts": "842411b3b711d21ff016120e88a9743d872af5bd",
  "package.json": "dc74b7fcac5033a4c67873662c02f334b1e5987c",
  "package-lock.json": "1c54ce69e7b3057ab12584302ea45370b016733b",
  ".nvmrc": "32a2d7bd80d19160ec2ba57a6bf6a311b5470868",
  "tsconfig.json": "73d5395d53342ec40263b5f65c97c11fc9f56f43",
  "tsconfig.app.json": null,
  "tsconfig.node.json": null,
};

type Leaf = { path: string; bytes: number; sha256: string };
type JsonRecord = Record<string, any>;

const bytes = (path: string) => readFileSync(resolve(root, path));
const text = (path: string) => bytes(path).toString("utf8");
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const manifest = JSON.parse(text(MANIFEST_PATH)) as JsonRecord;

function headObjectId(path: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--verify", `HEAD:${path}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function findRecord(value: unknown, predicate: (record: JsonRecord) => boolean): JsonRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as JsonRecord;
  if (predicate(record)) return record;
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findRecord(item, predicate);
        if (found) return found;
      }
    } else {
      const found = findRecord(child, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

function decodePng(path: string): { width: number; height: number; bitDepth: number; colorType: number } {
  const png = bytes(path);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let offset = 8;
  const idat: Buffer[] = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let sawEnd = false;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      expect(data[12]).toBe(0);
    }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") sawEnd = true;
    offset += length + 12;
  }
  expect(offset).toBe(png.length);
  expect(sawEnd).toBe(true);
  const decodedScanlines = inflateSync(Buffer.concat(idat));
  expect({ bitDepth, colorType }).toEqual({ bitDepth: 8, colorType: 2 });
  expect(decodedScanlines.length).toBe(height * (1 + width * 3));
  return { width, height, bitDepth, colorType };
}

describe("T048 PII-free Track 1 submission package", () => {
  it("pins exact title, canonical description, and optional Codex narrative bytes", () => {
    const description = (JSON.parse(text("docs/submission/track1-description.ko.json")) as JsonRecord).description_ko;
    expect(manifest.fields.title).toEqual({
      classification: "REPO_SAFE_STATIC",
      canonical_source: "src/content/public-names.ts#PUBLIC_NAMES.title",
      value: TITLE,
      unicode_code_points: 12,
      utf8_bytes: 19,
      sha256: "777eefc392dba8d7b8613d6dcd5bb17ecd6ae9ac1e84b2fd865df2f1f3ae9f24",
    });
    expect([...TITLE]).toHaveLength(12);
    expect(Buffer.byteLength(TITLE)).toBe(19);
    expect(sha256(TITLE)).toBe(manifest.fields.title.sha256);

    expect(manifest.fields.description.value).toBe(description);
    expect([...description]).toHaveLength(152);
    expect(Buffer.byteLength(description)).toBe(344);
    expect(sha256(description)).toBe("72db82afa86602ecb9a0629312915cad4551bb7b297c0aaa03903ebc59108987");
    expect(manifest.fields.description).toMatchObject({
      unicode_code_points: 152,
      utf8_bytes: 344,
      sha256: "72db82afa86602ecb9a0629312915cad4551bb7b297c0aaa03903ebc59108987",
    });

    expect(manifest.fields.codex_process).toMatchObject({
      classification: "REPO_SAFE_STATIC",
      disposition: "INCLUDED",
      value: CODEX_NARRATIVE,
      unicode_code_points: 319,
      utf8_bytes: 642,
      sha256: "e0f7af59959d57673fd124994b602d4aa998133f061eebdeda6fff39dae77b56",
      maxlength: 5000,
    });
    expect([...CODEX_NARRATIVE]).toHaveLength(319);
    expect(Buffer.byteLength(CODEX_NARRATIVE)).toBe(642);
    expect(sha256(CODEX_NARRATIVE)).toBe(manifest.fields.codex_process.sha256);
    expect(CODEX_NARRATIVE.length).toBeLessThanOrEqual(5000);
    for (const path of ["docs/submission/track1-form-field-draft.md", "docs/CODEX_USAGE_LOG.md"]) {
      expect(text(path).split(CODEX_NARRATIVE)).toHaveLength(2);
    }
  });

  it("binds the exact playable URL without claiming T050 QA", () => {
    const playable = manifest.fields.playable_url;
    expect(playable).toEqual({
      classification: "FINAL_CANDIDATE_BOUND",
      value: "https://project-702iz-sandy.vercel.app/",
      status: "PLAYABLE_URL_BOUND_T050_QA_NOT_RUN",
    });
    const url = new URL(playable.value);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("project-702iz-sandy.vercel.app");
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(playable.value.endsWith("/")).toBe(true);
    expect([...playable.value]).toHaveLength(playable.value.length);
    expect(Buffer.byteLength(playable.value)).toBeLessThanOrEqual(2048);
  });

  it("decodes the crop-only PNG and verifies source provenance against the existing asset manifest", () => {
    const thumbnail = manifest.fields.thumbnail;
    const decoded = decodePng(thumbnail.path);
    expect(decoded).toMatchObject({ width: 1280, height: 720 });
    expect(decoded.width / decoded.height).toBe(16 / 9);
    expect(statSync(resolve(root, thumbnail.path)).size).toBe(thumbnail.bytes);
    expect(thumbnail.bytes).toBeLessThan(10 * 1024 * 1024);
    expect(sha256(bytes(thumbnail.path))).toBe(thumbnail.sha256);
    expect(thumbnail).toMatchObject({
      media_type: "image/png",
      width: 1280,
      height: 720,
      bytes: 1966209,
      sha256: "85ff9c858e85a52b1e7d7d80cad632c5a16a0d6eebf56996650160657bad36ac",
      provenance: {
        source_path: "public/assets/backgrounds/background__still__depth_01.png",
        source_manifest_path: "assets/manifests/t022-m2-assets-audit-v1.json",
        source_sha256: "7a67c4cc17bafcedd522ffa45273e3420b539289509d7756a7127e89d491a0be",
        transform: "crop=1280:720:48:24",
        transform_kind: "CROP_ONLY_NO_SCALE_NO_REPAINT_NO_GENERATION",
        tool: "ffmpeg",
        tool_version: "8.1.2",
      },
    });
    expect(sha256(bytes(thumbnail.provenance.source_path))).toBe(thumbnail.provenance.source_sha256);
    const sourceManifest = JSON.parse(text(thumbnail.provenance.source_manifest_path));
    const sourceRecord = findRecord(sourceManifest, (record) => record.public_path === thumbnail.provenance.source_path);
    expect(sourceRecord).toMatchObject({
      width: 1376,
      height: 768,
      bytes: 2296255,
      sha256: thumbnail.provenance.source_sha256,
    });
  });

  it("keeps demo empty, owner live entry value-free, and challenge scope honest", () => {
    expect(manifest.fields.demo_url).toEqual({
      classification: "FINAL_CANDIDATE_BOUND",
      value: "",
      disposition: "DEMO_OPTIONAL_NOT_SUBMITTED_TIMEBOX_DEFERRED",
    });
    const form = text("docs/submission/track1-form-field-draft.md");
    const tuple = form.match(/```text\n([\s\S]*?)\n```/)?.[1].split("\n");
    expect(tuple).toContain("demo_url");
    expect(tuple).toContain("demo_disposition");
    expect(tuple).not.toContain("demo_video_sha256");
    expect(form).toContain("empty string (0 Unicode code points, 0 UTF-8 bytes)");
    expect(form).toContain("`DEMO_OPTIONAL_NOT_SUBMITTED_TIMEBOX_DEFERRED`");
    expect(manifest.fields.demo_url.value).toBe("");
    expect(manifest.fields.demo_url.disposition).toBe("DEMO_OPTIONAL_NOT_SUBMITTED_TIMEBOX_DEFERRED");
    expect(manifest.privacy.owner_live_entry).toEqual({
      classification: "OWNER_LIVE_ENTRY",
      values_stored: false,
    });
    expect(Object.keys(manifest.privacy.owner_live_entry)).not.toContain("value");
    expect(manifest.challenge_scope).toEqual({
      first_tracked_commit: "3fa3e69597e51c305ecbe24b570fe80a4a465b7f",
      first_tracked_commit_timestamp: "2026-08-10T20:12:57+09:00",
      limitation: "Repository history proves tracked work from the first commit only; pre-repository planning is not proven.",
    });
  });

  it("binds the T049 deployment and unchanged T062 artifact tuple", () => {
    expect(manifest.source_binding).toEqual({
      repository_base_revision: BASE_REVISION,
      game_candidate_revision: "f434656cdf3fce0fa35e8598169da6b678cdf627",
      production: {
        deployment_id: "dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC",
        playable_game_url: "https://project-702iz-sandy.vercel.app/",
        artifact_manifest_path: "assets/manifests/t062-production-artifact-v1.json",
        artifact_tree_encoding: 'sha256 + " " + bytes + " " + path + "\\n"',
        artifact_tree_sha256: "43ee3cbcc3c5b3681890ba3082fb882b1b89dfb564003d1cd23dfb7746df1b0e",
        file_count: 628,
        total_bytes: 1261180248,
      },
    });
    const t062 = JSON.parse(text(manifest.source_binding.production.artifact_manifest_path));
    expect(t062).toMatchObject({
      candidate_revision: manifest.source_binding.game_candidate_revision,
      file_count: 628,
      total_bytes: 1261180248,
      dist_tree_encoding: manifest.source_binding.production.artifact_tree_encoding,
      dist_tree_sha256: manifest.source_binding.production.artifact_tree_sha256,
    });
    expect(manifest.source_binding.production.playable_game_url).toBe(manifest.fields.playable_url.value);
    expect(sha256(bytes("assets/manifests/t062-production-artifact-v1.json"))).toBe(
      "31c0a4e6a739103f45061a1ced1af7e408359542954b5b0a00319ad5a0a50b7f",
    );
  });

  it("verifies every inventory leaf and the detached manifest digest without self-reference", () => {
    const leaves = manifest.leaf_files as Leaf[];
    expect(leaves.map(({ path }) => path)).toEqual([...leaves.map(({ path }) => path)].sort());
    expect(new Set(leaves.map(({ path }) => path)).size).toBe(leaves.length);
    expect(leaves.map(({ path }) => path)).not.toContain(MANIFEST_PATH);
    expect(leaves.map(({ path }) => path)).not.toContain(DETACHED_PATH);
    for (const leaf of leaves) {
      const content = bytes(leaf.path);
      expect(content.length, leaf.path).toBe(leaf.bytes);
      expect(sha256(content), leaf.path).toBe(leaf.sha256);
    }
    const placeholderSignals = [
      "UNSET", "TODO", "TBD", "PLACEHOLDER", "YYYY-MM-DD", "https://…",
      "무엇을 만들거나", "문제의 증상", "없음 또는 질문",
    ];
    for (const leaf of leaves.filter(({ path }) => /\.(?:md|json|ts|txt)$/.test(path))) {
      for (const signal of placeholderSignals) expect(text(leaf.path), `${leaf.path}:${signal}`).not.toContain(signal);
    }

    const manifestDigest = sha256(bytes(MANIFEST_PATH));
    expect(text(DETACHED_PATH)).toBe(`${manifestDigest}  track1-submission-package.json\n`);
    expect(text(MANIFEST_PATH)).not.toContain(manifestDigest);
    for (const leaf of leaves.filter(({ path }) => /\.(?:md|json|txt)$/.test(path))) {
      expect(text(leaf.path), leaf.path).not.toContain(manifestDigest);
    }
  });

  it("preserves frozen build inputs and all deferred execution boundaries", () => {
    expect(manifest.package_status).toBe("READY_FOR_T050_QA_AND_T051_APPROVAL");
    expect(Object.hasOwn(manifest, "status")).toBe(false);
    expect(manifest.boundaries).toEqual({
      t050_public_url_qa_run: false,
      t051_owner_approval_received: false,
      live_form_opened_or_entered: false,
      submission_sent: false,
      new_image_generation_used: false,
      external_provider_or_paid_call_used: false,
      production_artifact_bytes_changed: false,
    });
    for (const [path, expectedObjectId] of Object.entries(FROZEN_HEAD_OBJECTS)) {
      expect(headObjectId(path), path).toBe(expectedObjectId);
    }
    expect(headObjectId("dist")).toBeNull();
    expect((manifest.leaf_files as Leaf[]).some(({ path }) => path.startsWith("dist/"))).toBe(false);
    expect(text("README.md")).toContain("Edge, Firefox, Safari의 T045 직접 QA는 수행하지 않았습니다");
    expect(text("docs/submission/track1-form-field-draft.md")).toContain("T051 승인은");
    expect(text("docs/SUBMISSION_CHECKLIST.md")).toContain("실제 URL QA, 폼 입력·제출 또는 제출 완료를 의미하지 않습니다");
  });
});
