import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = await mkdtemp(join(tmpdir(), "webmcp-sdk-smoke-"));
const npmCli = process.env.npm_execpath;
let tarball;

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? "pipe",
    encoding: "utf8",
    shell: options.shell ?? false,
  });

const runNpm = (args, options = {}) => {
  if (npmCli) return run(process.execPath, [npmCli, ...args], options);
  return run("npm", args, { ...options, shell: process.platform === "win32" });
};

try {
  const packJson = runNpm(["pack", "--json", "--dry-run=false"]);
  const [{ filename }] = JSON.parse(packJson);
  tarball = resolve(repoRoot, filename);

  runNpm(["init", "-y", "--dry-run=false"], { cwd: smokeRoot });
  runNpm(
    [
      "install",
      "--dry-run=false",
      "--no-audit",
      "--ignore-scripts",
      tarball,
      "react@19.3.0",
    ],
    { cwd: smokeRoot },
  );

  const packageJsonPath = join(
    smokeRoot,
    "node_modules",
    "webmcp-sdk",
    "package.json",
  );
  const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
  for (const path of [
    "SECURITY.md",
    "CHANGELOG.md",
    "docs/migration-0.6.md",
    "docs/threat-model.md",
    "docs/x402-integration.md",
    "docs/release-runbook.md",
    "docs/release-verification.md",
    "examples/browser-hello/main.mjs",
  ])
    if (
      !(
        await readFile(
          join(smokeRoot, "node_modules", "webmcp-sdk", path),
          "utf8",
        )
      ).trim()
    )
      throw Error("Missing consumer document " + path);
  const exportedSubpaths = Object.keys(pkg.exports ?? {}).filter(
    (subpath) => subpath !== "./package.json",
  );

  const requiredSubpaths = [
    ".",
    "./react",
    "./security",
    "./testing",
    "./middleware/express",
    "./x402",
  ];
  const missingExports = requiredSubpaths.filter(
    (subpath) => !exportedSubpaths.includes(subpath),
  );
  if (missingExports.length) {
    throw new Error(`Missing package exports: ${missingExports.join(", ")}`);
  }

  const specifiers = requiredSubpaths.map((subpath) =>
    subpath === "." ? "webmcp-sdk" : `webmcp-sdk/${subpath.slice(2)}`,
  );
  const behavior = `
    const kit=sdk.createKit({prefix:'demo',browserAdapter:'none'});
    kit.register(sdk.defineTool('hello','Return greeting',{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false},({name})=>({message:'Hello, '+name+'!'})));
    if((await kit.invoke('demo.hello',{name:'Bill'})).message!=='Hello, Bill!')throw Error('Greeting failed');
    let ran=false;const dangerous=sdk.defineTool('destructive','Safety proof',{type:'object'},()=>{ran=true;});
    try{await security.withConfirmation(dangerous,'Safety proof').handler({});throw Error('No confirmation accepted');}catch(error){if(ran||!/confirmation/i.test(error.message))throw error;}
    try{security.sanitizeInput(JSON.parse('{"__proto__":{"isAdmin":true}}'));throw Error('Prototype accepted');}catch(error){if(!/forbidden|prototype/i.test(error.message))throw error;}
    if(typeof sdk.registerDeclarativeTools!=='function'||typeof react.WebMCPProvider!=='function')throw Error('Required helper missing');
  `;
  const cjsProbe = `
    async function main(){
    const specs = ${JSON.stringify(specifiers)};
    for (const spec of specs) {
      const mod = require(spec);
      if (!mod || typeof mod !== 'object') throw new Error('Invalid CJS module for ' + spec);
    }
    const x402 = require('webmcp-sdk/x402');
    for (const symbol of ['x402Middleware', 'createPaymentTool']) {
      if (typeof x402[symbol] !== 'function') throw new Error('webmcp-sdk/x402 missing ' + symbol);
    }
    const sdk=require('webmcp-sdk'),security=require('webmcp-sdk/security'),react=require('webmcp-sdk/react');
    ${behavior}
    }
    main().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  run(process.execPath, ["-e", cjsProbe], { cwd: smokeRoot });

  const esmProbe = `
    const specs = ${JSON.stringify(specifiers)};
    for (const spec of specs) {
      const mod = await import(spec);
      if (!mod || typeof mod !== 'object') throw new Error('Invalid ESM module for ' + spec);
    }
    const x402 = await import('webmcp-sdk/x402');
    for (const symbol of ['x402Middleware', 'createPaymentTool']) {
      if (typeof x402[symbol] !== 'function') throw new Error('webmcp-sdk/x402 missing ' + symbol);
    }
    const sdk=await import('webmcp-sdk'),security=await import('webmcp-sdk/security'),react=await import('webmcp-sdk/react');
    ${behavior}
  `;
  run(process.execPath, ["--input-type=module", "-e", esmProbe], {
    cwd: smokeRoot,
  });

  console.log(
    `Package subpath smoke passed for webmcp-sdk@${pkg.version}: ${requiredSubpaths.join(", ")}`,
  );
} finally {
  await rm(smokeRoot, { recursive: true, force: true });
  if (tarball) await unlink(tarball).catch(() => {});
}
