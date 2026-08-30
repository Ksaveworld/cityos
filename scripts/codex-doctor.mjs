import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createConnection } from "node:net";

const deployMode = process.argv.includes("--deploy");
const expected = {
  rootName: "cityos正式版",
  branch: "codex/cityos-command-workbench",
  baseline: "fa1ba5d",
  vercelProject: "cityos-command-workbench",
  nodeMajors: new Set([22, 24]),
  port: 5173,
};

const failures = [];
const warnings = [];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function pass(label, detail) {
  console.log(`[PASS] ${label}: ${detail}`);
}

function warn(label, detail) {
  warnings.push(label);
  console.log(`[WARN] ${label}: ${detail}`);
}

function fail(label, detail) {
  failures.push(label);
  console.log(`[FAIL] ${label}: ${detail}`);
}

function strictCheck(condition, label, passDetail, failDetail) {
  if (condition) {
    pass(label, passDetail);
  } else if (deployMode) {
    fail(label, failDetail);
  } else {
    warn(label, failDetail);
  }
}

function checkPort(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (state) => {
      socket.destroy();
      resolvePort(state);
    };
    socket.setTimeout(700, () => finish("available"));
    socket.once("connect", () => finish("running"));
    socket.once("error", () => finish("available"));
  });
}

let root;
try {
  root = git(["rev-parse", "--show-toplevel"]);
  pass("Git 仓库", root);
} catch (error) {
  fail("Git 仓库", error.message);
}

if (root) {
  strictCheck(
    basename(resolve(root)) === expected.rootName,
    "正式目录",
    expected.rootName,
    `当前目录是 ${basename(root)}，预期 ${expected.rootName}`,
  );

  const branch = git(["branch", "--show-current"]);
  strictCheck(
    branch === expected.branch,
    "主开发分支",
    branch,
    `当前 ${branch || "detached HEAD"}，预期 ${expected.branch}`,
  );

  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", expected.baseline, "HEAD"],
    { stdio: "ignore" },
  ).status === 0;
  if (ancestor) {
    pass("基线祖先", `${expected.baseline} 是 HEAD 祖先`);
  } else {
    fail("基线祖先", `${expected.baseline} 不是 HEAD 祖先`);
  }

  pass("当前 HEAD", git(["rev-parse", "--short", "HEAD"]));

  const status = git(["status", "--porcelain"]);
  strictCheck(
    status.length === 0,
    "工作树",
    "干净",
    status.length === 0 ? "干净" : `${status.split(/\r?\n/).length} 个未提交项`,
  );

  const vercelConfigPath = resolve(root, ".vercel", "project.json");
  if (!existsSync(vercelConfigPath)) {
    strictCheck(false, "Vercel 绑定", "", "缺少 .vercel/project.json");
  } else {
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf8"));
    strictCheck(
      vercelConfig.projectName === expected.vercelProject,
      "Vercel 绑定",
      vercelConfig.projectName,
      `当前 ${vercelConfig.projectName || "未设置"}，预期 ${expected.vercelProject}`,
    );
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (expected.nodeMajors.has(nodeMajor)) {
  pass("Node.js", process.version);
} else {
  fail("Node.js", `当前 ${process.version}，仅支持 Node 22 或 24`);
}

const portState = await checkPort(expected.port);
pass(
  "开发端口",
  portState === "running"
    ? `127.0.0.1:${expected.port} 已有服务`
    : `127.0.0.1:${expected.port} 可启动`,
);

console.log(
  `\n结果：${failures.length} 失败，${warnings.length} 警告，模式=${deployMode ? "deploy" : "doctor"}`,
);

if (failures.length > 0) {
  process.exitCode = 1;
}
